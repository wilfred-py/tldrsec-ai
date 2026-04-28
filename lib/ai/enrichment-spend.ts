/**
 * Enrichment spend ledger — Postgres-backed atomic check-and-debit + circuit breaker.
 *
 * Replaces the process-local `dailySpend` accumulator in `enrichment-flags.ts` with a
 * multi-isolate-safe ledger:
 *   - `EnrichmentSpend`         — per-envelope per-day total counter (envelope, dateIso) unique.
 *   - `EnrichmentSpendEntry`    — per-call ledger keyed by caller-supplied requestId; idempotency
 *                                 via unique (envelope, dateIso, requestId).
 *   - `EnrichmentCircuitState`  — per-envelope breaker, no date — survives midnight UTC.
 *
 * Public API:
 *   - tryDebitEnrichment           — atomic check-and-debit, idempotent on requestId.
 *   - recordRetryableFailure       — refund + breaker increment (single txn).
 *   - recordEnrichmentFailureNoRefund — breaker-only update for slow-loss (cost spent, output unusable).
 *   - getCircuitState              — diagnostic read, no mutation.
 *
 * All transactional functions use `createIsolatedTransaction` from `lib/db/concurrency.ts`
 * for retry on deadlock/serialization conflicts (Decision 5A).
 */

import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { EnvelopeKind, PrismaClient } from '@prisma/client';
import { createIsolatedTransaction } from '../db/concurrency';
import { getPrismaClient } from '../db/prisma';
import { logger } from '../logging';
import { monitoring } from '../monitoring';

const componentLogger = logger.child('enrichment-spend');

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_FAILURE_WINDOW_MS = 30 * 60 * 1000; // 30 min
const CIRCUIT_COOLDOWN_MS = 60 * 60 * 1000; // 1 h
const CLOSE_AFTER_SUCCESSES = 3;

const CAP_DEFAULTS: Record<EnvelopeKind, number> = {
  why_it_matters: 5,
  x_sentiment: 5,
};

// ─── Types ───────────────────────────────────────────────────────────────────

export type CircuitStateValue = 'closed' | 'open' | 'half_open';

export type DebitResult =
  | { ok: true; spendId: string; entryId: string; newTotalUsd: number; alreadyDebited?: boolean }
  | { ok: false; reason: 'cap_reached' | 'circuit_open' };

interface CircuitTransitionResult {
  state: CircuitStateValue;
  shouldBlock: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayIsoDate(now: Date = new Date()): string {
  return now.toISOString().split('T')[0];
}

/**
 * Resolve daily cap from env. `why_it_matters` honors legacy `ENRICHMENT_DAILY_CAP_USD`
 * with a deprecation warning so existing deployments keep working through Phase 3 rollout.
 */
function getCapUsd(envelope: EnvelopeKind): number {
  if (envelope === 'why_it_matters') {
    const explicit = process.env.WHY_IT_MATTERS_CAP_USD;
    const legacy = process.env.ENRICHMENT_DAILY_CAP_USD;
    if (explicit !== undefined) return Number(explicit);
    if (legacy !== undefined) {
      componentLogger.warn(
        'ENRICHMENT_DAILY_CAP_USD is deprecated; rename to WHY_IT_MATTERS_CAP_USD',
      );
      return Number(legacy);
    }
    return CAP_DEFAULTS.why_it_matters;
  }
  return Number(process.env.X_SENTIMENT_CAP_USD ?? CAP_DEFAULTS.x_sentiment);
}

function resolveFailureThreshold(override?: number): number {
  if (override !== undefined) return override;
  const env = process.env.ENRICHMENT_CIRCUIT_THRESHOLD;
  return env !== undefined ? Number(env) : DEFAULT_FAILURE_THRESHOLD;
}

function resolveFailureWindowMs(override?: number): number {
  if (override !== undefined) return override;
  const env = process.env.ENRICHMENT_CIRCUIT_WINDOW_MS;
  return env !== undefined ? Number(env) : DEFAULT_FAILURE_WINDOW_MS;
}

/**
 * Inside a transaction: ensure the spend row exists for (envelope, today) and refresh
 * its `capUsd` to the current env-driven value (Decision 10A — mid-day env-var changes
 * take effect on the next debit). Returns `{ id, capUsd, totalUsd }` always.
 */
async function upsertSpendRow(
  tx: Prisma.TransactionClient,
  envelope: EnvelopeKind,
  dateIso: string,
  capUsd: number,
): Promise<{ id: string; capUsd: number; totalUsd: number }> {
  const newId = randomUUID();
  const rows = await tx.$queryRaw<
    Array<{ id: string; capUsd: Prisma.Decimal; totalUsd: Prisma.Decimal }>
  >`
    INSERT INTO "pipeline"."EnrichmentSpend" ("id", "envelope", "dateIso", "capUsd", "updatedAt")
    VALUES (${newId}, ${envelope}::"pipeline"."EnvelopeKind", ${dateIso}, ${capUsd}::numeric, NOW())
    ON CONFLICT ("envelope", "dateIso") DO UPDATE
      SET "capUsd" = EXCLUDED."capUsd",
          "updatedAt" = NOW()
    RETURNING "id", "capUsd", "totalUsd"
  `;
  const row = rows[0];
  return {
    id: row.id,
    capUsd: Number(row.capUsd),
    totalUsd: Number(row.totalUsd),
  };
}

/**
 * Inside a transaction: lock the circuit row, apply cooldown→half_open transition,
 * and decide whether to block this debit. Pure read+update — does NOT increment failure
 * count (that's `recordRetryableFailure`'s job).
 */
async function lockAndCheckCircuit(
  tx: Prisma.TransactionClient,
  envelope: EnvelopeKind,
): Promise<CircuitTransitionResult> {
  const rows = await tx.$queryRaw<
    Array<{ state: CircuitStateValue; openedAt: Date | null }>
  >`
    SELECT "state", "openedAt"
    FROM "pipeline"."EnrichmentCircuitState"
    WHERE "envelope" = ${envelope}::"pipeline"."EnvelopeKind"
    FOR UPDATE
  `;
  const row = rows[0];
  if (!row) {
    // Defensive: row should be seeded by the migration. If not, skip blocking and let
    // a debit go through; the recordFailure path will create the row.
    componentLogger.warn('EnrichmentCircuitState row missing — defaulting to closed', { envelope });
    return { state: 'closed', shouldBlock: false };
  }

  if (row.state === 'open' && row.openedAt) {
    const cooldownExpired = Date.now() - row.openedAt.getTime() >= CIRCUIT_COOLDOWN_MS;
    if (cooldownExpired) {
      await tx.$executeRaw`
        UPDATE "pipeline"."EnrichmentCircuitState"
        SET "state" = 'half_open',
            "halfOpenSuccesses" = 0,
            "updatedAt" = NOW()
        WHERE "envelope" = ${envelope}::"pipeline"."EnvelopeKind"
      `;
      return { state: 'half_open', shouldBlock: false };
    }
    return { state: 'open', shouldBlock: true };
  }

  return { state: row.state, shouldBlock: false };
}

/**
 * Inside a transaction: increment halfOpen success count; if threshold reached, close.
 */
async function recordHalfOpenSuccess(
  tx: Prisma.TransactionClient,
  envelope: EnvelopeKind,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ halfOpenSuccesses: number }>>`
    UPDATE "pipeline"."EnrichmentCircuitState"
    SET "halfOpenSuccesses" = "halfOpenSuccesses" + 1,
        "updatedAt" = NOW()
    WHERE "envelope" = ${envelope}::"pipeline"."EnvelopeKind"
      AND "state" = 'half_open'
    RETURNING "halfOpenSuccesses"
  `;
  const newCount = rows[0]?.halfOpenSuccesses ?? 0;
  if (newCount >= CLOSE_AFTER_SUCCESSES) {
    await tx.$executeRaw`
      UPDATE "pipeline"."EnrichmentCircuitState"
      SET "state" = 'closed',
          "openedAt" = NULL,
          "failureCount" = 0,
          "windowStart" = NULL,
          "halfOpenSuccesses" = 0,
          "updatedAt" = NOW()
      WHERE "envelope" = ${envelope}::"pipeline"."EnvelopeKind"
        AND "state" = 'half_open'
    `;
    monitoring.incrementCounter('ai.enrichment_circuit_closed', 1, { envelope });
  }
}

/**
 * Inside a transaction: increment failure count, possibly open the circuit.
 * Returns the post-update circuit state so callers can short-circuit subsequent work.
 */
async function applyFailureToCircuit(
  tx: Prisma.TransactionClient,
  envelope: EnvelopeKind,
  failureThreshold: number,
  failureWindowMs: number,
): Promise<{ state: CircuitStateValue; failureCount: number; openedThisCall: boolean }> {
  const rows = await tx.$queryRaw<
    Array<{
      state: CircuitStateValue;
      failureCount: number;
      windowStart: Date | null;
    }>
  >`
    SELECT "state", "failureCount", "windowStart"
    FROM "pipeline"."EnrichmentCircuitState"
    WHERE "envelope" = ${envelope}::"pipeline"."EnvelopeKind"
    FOR UPDATE
  `;
  const current = rows[0];
  if (!current) {
    componentLogger.warn('EnrichmentCircuitState row missing on failure — seeding', { envelope });
    await tx.$executeRaw`
      INSERT INTO "pipeline"."EnrichmentCircuitState" ("envelope", "state", "failureCount", "windowStart", "updatedAt")
      VALUES (${envelope}::"pipeline"."EnvelopeKind", 'closed', 1, NOW(), NOW())
      ON CONFLICT ("envelope") DO NOTHING
    `;
    return { state: 'closed', failureCount: 1, openedThisCall: false };
  }

  // half_open + failure → re-open immediately.
  if (current.state === 'half_open') {
    await tx.$executeRaw`
      UPDATE "pipeline"."EnrichmentCircuitState"
      SET "state" = 'open',
          "openedAt" = NOW(),
          "halfOpenSuccesses" = 0,
          "updatedAt" = NOW()
      WHERE "envelope" = ${envelope}::"pipeline"."EnvelopeKind"
    `;
    monitoring.incrementCounter('ai.enrichment_circuit_opened', 1, {
      envelope,
      cause: 'half_open_failure',
    });
    return { state: 'open', failureCount: current.failureCount, openedThisCall: true };
  }

  // Closed path: increment within rolling window; reset window on expiry.
  const now = Date.now();
  const windowExpired =
    current.windowStart === null || now - current.windowStart.getTime() > failureWindowMs;
  const newCount = windowExpired ? 1 : current.failureCount + 1;

  if (newCount >= failureThreshold) {
    await tx.$executeRaw`
      UPDATE "pipeline"."EnrichmentCircuitState"
      SET "state" = 'open',
          "openedAt" = NOW(),
          "failureCount" = ${newCount},
          "windowStart" = ${windowExpired ? new Date() : current.windowStart},
          "halfOpenSuccesses" = 0,
          "updatedAt" = NOW()
      WHERE "envelope" = ${envelope}::"pipeline"."EnvelopeKind"
    `;
    monitoring.incrementCounter('ai.enrichment_circuit_opened', 1, {
      envelope,
      cause: 'threshold',
    });
    return { state: 'open', failureCount: newCount, openedThisCall: true };
  }

  await tx.$executeRaw`
    UPDATE "pipeline"."EnrichmentCircuitState"
    SET "failureCount" = ${newCount},
        "windowStart" = ${windowExpired ? new Date() : current.windowStart},
        "updatedAt" = NOW()
    WHERE "envelope" = ${envelope}::"pipeline"."EnvelopeKind"
  `;
  return { state: current.state, failureCount: newCount, openedThisCall: false };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Atomic check-and-debit. Idempotent on (envelope, today, requestId).
 *
 * Order (single transaction):
 *   1. Upsert spend row → returns id + current cap.
 *   2. Lock circuit row; if open AND not expired → return circuit_open. If open + expired → half_open.
 *   3. Insert ledger entry (status='debited'). On unique conflict → return alreadyDebited=true.
 *   4. Conditional UPDATE: total + cost <= cap → debit. Else: delete the just-inserted ledger
 *      entry (rollback) and return cap_reached.
 *   5. If we just wrote in half_open state → record success toward closing the breaker.
 */
export async function tryDebitEnrichment(
  envelope: EnvelopeKind,
  costUsd: number,
  requestId: string,
): Promise<DebitResult> {
  if (!Number.isFinite(costUsd) || costUsd < 0) {
    throw new Error(`tryDebitEnrichment: invalid costUsd=${costUsd}`);
  }
  if (!requestId) {
    throw new Error('tryDebitEnrichment: requestId is required');
  }

  const dateIso = todayIsoDate();
  const capUsd = getCapUsd(envelope);

  return createIsolatedTransaction(
    async (tx: PrismaClient) => {
      const txAny = tx as unknown as Prisma.TransactionClient;
      const spend = await upsertSpendRow(txAny, envelope, dateIso, capUsd);

      const circuit = await lockAndCheckCircuit(txAny, envelope);
      if (circuit.shouldBlock) {
        monitoring.incrementCounter('ai.enrichment_circuit_blocked', 1, { envelope });
        return { ok: false, reason: 'circuit_open' as const };
      }

      // Idempotent ledger insert. Check for prior debit FIRST so retries can't double-spend.
      const entryId = randomUUID();
      const insertedRows = await txAny.$queryRaw<
        Array<{ id: string; amountUsd: Prisma.Decimal; status: string }>
      >`
        INSERT INTO "pipeline"."EnrichmentSpendEntry"
          ("id", "spendId", "envelope", "dateIso", "requestId", "amountUsd", "status", "updatedAt")
        VALUES (
          ${entryId}, ${spend.id}, ${envelope}::"pipeline"."EnvelopeKind",
          ${dateIso}, ${requestId}, ${costUsd}::numeric, 'debited', NOW()
        )
        ON CONFLICT ("envelope", "dateIso", "requestId") DO NOTHING
        RETURNING "id", "amountUsd", "status"
      `;

      if (insertedRows.length === 0) {
        // Existing entry — idempotent re-call.
        const existingRows = await txAny.$queryRaw<
          Array<{ id: string; amountUsd: Prisma.Decimal; status: string }>
        >`
          SELECT "id", "amountUsd", "status"
          FROM "pipeline"."EnrichmentSpendEntry"
          WHERE "envelope" = ${envelope}::"pipeline"."EnvelopeKind"
            AND "dateIso" = ${dateIso}
            AND "requestId" = ${requestId}
          LIMIT 1
        `;
        const existing = existingRows[0];
        return {
          ok: true,
          spendId: spend.id,
          entryId: existing.id,
          newTotalUsd: spend.totalUsd,
          alreadyDebited: true,
        };
      }

      // Conditional debit: only succeed if cap not blown.
      const updateRows = await txAny.$queryRaw<Array<{ totalUsd: Prisma.Decimal }>>`
        UPDATE "pipeline"."EnrichmentSpend"
        SET "totalUsd" = "totalUsd" + ${costUsd}::numeric,
            "updatedAt" = NOW()
        WHERE "id" = ${spend.id}
          AND "totalUsd" + ${costUsd}::numeric <= "capUsd"
        RETURNING "totalUsd"
      `;

      if (updateRows.length === 0) {
        // Cap blown. Rollback the ledger entry we just inserted.
        await txAny.$executeRaw`
          DELETE FROM "pipeline"."EnrichmentSpendEntry" WHERE "id" = ${entryId}
        `;
        monitoring.incrementCounter('ai.enrichment_envelope_capped', 1, { envelope });
        return { ok: false, reason: 'cap_reached' as const };
      }

      // Successful debit. If we're in half_open, drive toward closed.
      if (circuit.state === 'half_open') {
        await recordHalfOpenSuccess(txAny, envelope);
      }

      return {
        ok: true,
        spendId: spend.id,
        entryId,
        newTotalUsd: Number(updateRows[0].totalUsd),
      };
    },
    { isolationLevel: 'ReadCommitted', timeout: 10000, retryOptions: {} },
  );
}

/**
 * Combined refund + breaker increment for retryable upstream failures.
 *
 * Single transaction:
 *   1. Increment failure count (rolling window); transition to "open" if threshold crossed.
 *   2. Find the prior debited entry by (envelope, today, requestId). If absent → no-op refund.
 *   3. Decrement spend total by entry.amountUsd; flip entry status to "refunded".
 *
 * Idempotent: a second call after refund finds the entry in status='refunded' and no-ops.
 */
export async function recordRetryableFailure(
  envelope: EnvelopeKind,
  requestId: string,
  options: { failureThreshold?: number; failureWindowMs?: number } = {},
): Promise<{
  refundedUsd: number;
  circuitState: CircuitStateValue;
  failureCount: number;
}> {
  const dateIso = todayIsoDate();
  const failureThreshold = resolveFailureThreshold(options.failureThreshold);
  const failureWindowMs = resolveFailureWindowMs(options.failureWindowMs);

  return createIsolatedTransaction(
    async (tx: PrismaClient) => {
      const txAny = tx as unknown as Prisma.TransactionClient;

      const circuit = await applyFailureToCircuit(txAny, envelope, failureThreshold, failureWindowMs);

      const entryRows = await txAny.$queryRaw<
        Array<{ id: string; spendId: string; amountUsd: Prisma.Decimal; status: string }>
      >`
        SELECT "id", "spendId", "amountUsd", "status"
        FROM "pipeline"."EnrichmentSpendEntry"
        WHERE "envelope" = ${envelope}::"pipeline"."EnvelopeKind"
          AND "dateIso" = ${dateIso}
          AND "requestId" = ${requestId}
          AND "status" = 'debited'
        FOR UPDATE
      `;
      const entry = entryRows[0];
      if (!entry) {
        return {
          refundedUsd: 0,
          circuitState: circuit.state,
          failureCount: circuit.failureCount,
        };
      }

      const amount = Number(entry.amountUsd);
      await txAny.$executeRaw`
        UPDATE "pipeline"."EnrichmentSpend"
        SET "totalUsd" = "totalUsd" - ${amount}::numeric,
            "updatedAt" = NOW()
        WHERE "id" = ${entry.spendId}
      `;
      await txAny.$executeRaw`
        UPDATE "pipeline"."EnrichmentSpendEntry"
        SET "status" = 'refunded',
            "updatedAt" = NOW()
        WHERE "id" = ${entry.id}
      `;
      monitoring.incrementCounter('ai.enrichment_refund', 1, { envelope });

      return {
        refundedUsd: amount,
        circuitState: circuit.state,
        failureCount: circuit.failureCount,
      };
    },
    { isolationLevel: 'ReadCommitted', timeout: 10000, retryOptions: {} },
  );
}

/**
 * Breaker-only update for slow-loss path: call cost real money but produced unusable
 * output (e.g., validator rejection on a 200 OK). NO refund. Drains budget as a
 * forcing function so the breaker eventually opens on garbage payloads.
 */
export async function recordEnrichmentFailureNoRefund(
  envelope: EnvelopeKind,
  options: { failureThreshold?: number; failureWindowMs?: number } = {},
): Promise<{ circuitState: CircuitStateValue; failureCount: number }> {
  const failureThreshold = resolveFailureThreshold(options.failureThreshold);
  const failureWindowMs = resolveFailureWindowMs(options.failureWindowMs);

  return createIsolatedTransaction(
    async (tx: PrismaClient) => {
      const txAny = tx as unknown as Prisma.TransactionClient;
      const circuit = await applyFailureToCircuit(txAny, envelope, failureThreshold, failureWindowMs);
      return { circuitState: circuit.state, failureCount: circuit.failureCount };
    },
    { isolationLevel: 'ReadCommitted', timeout: 10000, retryOptions: {} },
  );
}

/**
 * Diagnostic — current circuit state without mutation.
 */
export async function getCircuitState(envelope: EnvelopeKind): Promise<{
  state: CircuitStateValue;
  openedAt: Date | null;
  failureCount: number;
}> {
  const rows = await getPrismaClient().$queryRaw<
    Array<{ state: CircuitStateValue; openedAt: Date | null; failureCount: number }>
  >`
    SELECT "state", "openedAt", "failureCount"
    FROM "pipeline"."EnrichmentCircuitState"
    WHERE "envelope" = ${envelope}::"pipeline"."EnvelopeKind"
    LIMIT 1
  `;
  const row = rows[0];
  return {
    state: row?.state ?? 'closed',
    openedAt: row?.openedAt ?? null,
    failureCount: row?.failureCount ?? 0,
  };
}

// ─── Test-only exports ───────────────────────────────────────────────────────

export const _internal = {
  DEFAULT_FAILURE_THRESHOLD,
  DEFAULT_FAILURE_WINDOW_MS,
  CIRCUIT_COOLDOWN_MS,
  CLOSE_AFTER_SUCCESSES,
  CAP_DEFAULTS,
  getCapUsd,
  todayIsoDate,
};
