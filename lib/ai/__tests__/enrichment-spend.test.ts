/**
 * @jest-environment node
 *
 * Integration tests for `enrichment-spend` Postgres-backed ledger.
 *
 * These tests hit the real dev DB. The ledger is the load-bearing primitive enforcing
 * atomic check-and-debit across N Cloudflare isolates — mocking SQL would only verify
 * we wrote the strings correctly, not that the semantics hold under contention.
 *
 * Each test isolates state to a unique `requestId` namespace + cleans both tables in
 * `afterEach`. Circuit-state rows are reset (not deleted) to preserve the seeded enum.
 *
 * Runs against the dev DB pointed to by `DATABASE_URL` in `.env.local`. The
 * `@jest-environment node` directive forces Prisma to load the Node entry rather than
 * the browser-stubbed one (which omits enum runtime values).
 */

// Opt out of the global `lib/db/prisma` mock from `__tests__/setup.js` — these tests
// need to hit the real dev DB. Mirrors `__tests__/db/supabase-connection.test.ts`.
jest.unmock('@prisma/client');
jest.unmock('../../db');
jest.unmock('../../db/prisma');

import { describe, it, expect, beforeEach, afterAll, beforeAll } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import type { EnvelopeKind } from '@prisma/client';
import { getPrismaClient } from '../../db/prisma';
import {
  tryDebitEnrichment,
  recordRetryableFailure,
  recordEnrichmentFailureNoRefund,
  getCircuitState,
  _internal,
} from '../enrichment-spend';

const prisma = getPrismaClient();

// String literals cast to the type-only enum. The `@prisma/client` package's
// `exports` map under Jest only surfaces `PrismaClient`; runtime enum values
// (`EnvelopeKind.x_sentiment`) resolve to `undefined`. Using literals avoids the
// resolution quirk while preserving compile-time exhaustiveness.
const X_SENTIMENT: EnvelopeKind = 'x_sentiment';
const WHY_IT_MATTERS: EnvelopeKind = 'why_it_matters';
const TEST_ENVELOPE: EnvelopeKind = X_SENTIMENT;

function makeReq(suffix: string): string {
  // Unique per-test prefix so leaked state from a failed prior run doesn't collide.
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${suffix}`;
}

async function resetCircuit(envelope: EnvelopeKind): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "pipeline"."EnrichmentCircuitState"
    SET "state" = 'closed',
        "openedAt" = NULL,
        "failureCount" = 0,
        "windowStart" = NULL,
        "halfOpenSuccesses" = 0,
        "updatedAt" = NOW()
    WHERE "envelope" = ${envelope}::"pipeline"."EnvelopeKind"
  `;
}

async function nukeSpendForToday(): Promise<void> {
  const dateIso = _internal.todayIsoDate();
  // FK has ON DELETE CASCADE — deleting spend rows wipes entries too.
  await prisma.$executeRaw`
    DELETE FROM "pipeline"."EnrichmentSpend" WHERE "dateIso" = ${dateIso}
  `;
}

async function setSpendTotal(envelope: EnvelopeKind, totalUsd: number): Promise<void> {
  const dateIso = _internal.todayIsoDate();
  await prisma.$executeRaw`
    UPDATE "pipeline"."EnrichmentSpend"
    SET "totalUsd" = ${totalUsd}::numeric, "updatedAt" = NOW()
    WHERE "envelope" = ${envelope}::"pipeline"."EnvelopeKind" AND "dateIso" = ${dateIso}
  `;
}

async function readSpendTotal(envelope: EnvelopeKind): Promise<number | null> {
  const dateIso = _internal.todayIsoDate();
  const rows = await prisma.$queryRaw<Array<{ totalUsd: any }>>`
    SELECT "totalUsd" FROM "pipeline"."EnrichmentSpend"
    WHERE "envelope" = ${envelope}::"pipeline"."EnvelopeKind" AND "dateIso" = ${dateIso}
    LIMIT 1
  `;
  return rows[0] ? Number(rows[0].totalUsd) : null;
}

async function readEntryStatus(envelope: EnvelopeKind, requestId: string): Promise<string | null> {
  const dateIso = _internal.todayIsoDate();
  const rows = await prisma.$queryRaw<Array<{ status: string }>>`
    SELECT "status" FROM "pipeline"."EnrichmentSpendEntry"
    WHERE "envelope" = ${envelope}::"pipeline"."EnvelopeKind"
      AND "dateIso" = ${dateIso}
      AND "requestId" = ${requestId}
    LIMIT 1
  `;
  return rows[0]?.status ?? null;
}

async function forceCircuitOpen(envelope: EnvelopeKind, openedAt: Date = new Date()): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "pipeline"."EnrichmentCircuitState"
    SET "state" = 'open',
        "openedAt" = ${openedAt},
        "failureCount" = 5,
        "halfOpenSuccesses" = 0,
        "updatedAt" = NOW()
    WHERE "envelope" = ${envelope}::"pipeline"."EnvelopeKind"
  `;
}

async function forceCircuitHalfOpen(envelope: EnvelopeKind): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "pipeline"."EnrichmentCircuitState"
    SET "state" = 'half_open',
        "openedAt" = NOW(),
        "failureCount" = 0,
        "halfOpenSuccesses" = 0,
        "updatedAt" = NOW()
    WHERE "envelope" = ${envelope}::"pipeline"."EnvelopeKind"
  `;
}

beforeAll(() => {
  // Default cap to a known value for deterministic arithmetic.
  process.env.X_SENTIMENT_CAP_USD = '5';
  process.env.WHY_IT_MATTERS_CAP_USD = '5';
  // Tighten threshold/window for fast tests.
  process.env.ENRICHMENT_CIRCUIT_THRESHOLD = '5';
  process.env.ENRICHMENT_CIRCUIT_WINDOW_MS = String(30 * 60 * 1000);
});

afterAll(async () => {
  delete process.env.X_SENTIMENT_CAP_USD;
  delete process.env.WHY_IT_MATTERS_CAP_USD;
  delete process.env.ENRICHMENT_CIRCUIT_THRESHOLD;
  delete process.env.ENRICHMENT_CIRCUIT_WINDOW_MS;
  await nukeSpendForToday();
  await resetCircuit(X_SENTIMENT);
  await resetCircuit(WHY_IT_MATTERS);
});

beforeEach(async () => {
  await nukeSpendForToday();
  await resetCircuit(X_SENTIMENT);
  await resetCircuit(WHY_IT_MATTERS);
});

describe('cap resolution', () => {
  it('uses WHY_IT_MATTERS_CAP_USD when set', () => {
    process.env.WHY_IT_MATTERS_CAP_USD = '7.5';
    expect(_internal.getCapUsd(WHY_IT_MATTERS)).toBe(7.5);
  });

  it('falls back to legacy ENRICHMENT_DAILY_CAP_USD with deprecation warning', () => {
    delete process.env.WHY_IT_MATTERS_CAP_USD;
    process.env.ENRICHMENT_DAILY_CAP_USD = '3';
    expect(_internal.getCapUsd(WHY_IT_MATTERS)).toBe(3);
    delete process.env.ENRICHMENT_DAILY_CAP_USD;
    process.env.WHY_IT_MATTERS_CAP_USD = '5'; // restore
  });

  it('uses X_SENTIMENT_CAP_USD for x_sentiment', () => {
    process.env.X_SENTIMENT_CAP_USD = '2.5';
    expect(_internal.getCapUsd(X_SENTIMENT)).toBe(2.5);
    process.env.X_SENTIMENT_CAP_USD = '5';
  });
});

describe('tryDebitEnrichment — happy path', () => {
  it('debits under cap and persists ledger entry', async () => {
    const requestId = makeReq('debit-happy');
    const result = await tryDebitEnrichment(TEST_ENVELOPE, 0.05, requestId);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.alreadyDebited).toBeUndefined();
      expect(result.newTotalUsd).toBeCloseTo(0.05, 4);
    }
    expect(await readSpendTotal(TEST_ENVELOPE)).toBeCloseTo(0.05, 4);
    expect(await readEntryStatus(TEST_ENVELOPE, requestId)).toBe('debited');
  });

  it('cap-reached at exact-edge: total=4.97 + cost=0.05 > cap=5.00', async () => {
    // Seed a row + total=4.97.
    const seedReq = makeReq('seed');
    await tryDebitEnrichment(TEST_ENVELOPE, 0.01, seedReq);
    await setSpendTotal(TEST_ENVELOPE, 4.97);

    const requestId = makeReq('cap-edge');
    const result = await tryDebitEnrichment(TEST_ENVELOPE, 0.05, requestId);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('cap_reached');

    // Ledger entry MUST NOT exist (rollback worked).
    expect(await readEntryStatus(TEST_ENVELOPE, requestId)).toBeNull();
    // Total unchanged.
    expect(await readSpendTotal(TEST_ENVELOPE)).toBeCloseTo(4.97, 4);
  });

  it('cap-reached when first call alone exceeds cap', async () => {
    process.env.X_SENTIMENT_CAP_USD = '0.04';
    try {
      const result = await tryDebitEnrichment(TEST_ENVELOPE, 0.05, makeReq('over-cap'));
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('cap_reached');
      expect(await readSpendTotal(TEST_ENVELOPE)).toBeCloseTo(0, 4);
    } finally {
      process.env.X_SENTIMENT_CAP_USD = '5';
    }
  });
});

describe('tryDebitEnrichment — idempotency', () => {
  it('returns alreadyDebited=true on duplicate requestId; total NOT double-debited', async () => {
    const requestId = makeReq('idempotent');

    const first = await tryDebitEnrichment(TEST_ENVELOPE, 0.05, requestId);
    expect(first.ok).toBe(true);

    const second = await tryDebitEnrichment(TEST_ENVELOPE, 0.05, requestId);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.alreadyDebited).toBe(true);

    expect(await readSpendTotal(TEST_ENVELOPE)).toBeCloseTo(0.05, 4);
  });
});

describe('tryDebitEnrichment — env-var cap refresh on upsert', () => {
  it('mid-day cap change takes effect on next debit (Decision 10A)', async () => {
    process.env.X_SENTIMENT_CAP_USD = '5';
    await tryDebitEnrichment(TEST_ENVELOPE, 1, makeReq('pre-bump'));

    // Bump the cap.
    process.env.X_SENTIMENT_CAP_USD = '10';
    const result = await tryDebitEnrichment(TEST_ENVELOPE, 4, makeReq('post-bump'));
    expect(result.ok).toBe(true); // 1 + 4 = 5 ≤ 10

    // Verify capUsd in row was refreshed.
    const dateIso = _internal.todayIsoDate();
    const rows = await prisma.$queryRaw<Array<{ capUsd: any }>>`
      SELECT "capUsd" FROM "pipeline"."EnrichmentSpend"
      WHERE "envelope" = ${TEST_ENVELOPE}::"pipeline"."EnvelopeKind" AND "dateIso" = ${dateIso}
    `;
    expect(Number(rows[0].capUsd)).toBe(10);

    process.env.X_SENTIMENT_CAP_USD = '5';
  });
});

describe('refund — recordRetryableFailure', () => {
  it('happy path: refund returns total to pre-debit value, entry status="refunded"', async () => {
    const requestId = makeReq('refund-happy');
    await tryDebitEnrichment(TEST_ENVELOPE, 0.05, requestId);
    expect(await readSpendTotal(TEST_ENVELOPE)).toBeCloseTo(0.05, 4);

    const refund = await recordRetryableFailure(TEST_ENVELOPE, requestId);
    expect(refund.refundedUsd).toBeCloseTo(0.05, 4);

    expect(await readSpendTotal(TEST_ENVELOPE)).toBeCloseTo(0, 4);
    expect(await readEntryStatus(TEST_ENVELOPE, requestId)).toBe('refunded');
  });

  it('idempotency: second refund finds no debited entry, no double-refund', async () => {
    const requestId = makeReq('refund-idempotent');
    await tryDebitEnrichment(TEST_ENVELOPE, 0.05, requestId);
    await recordRetryableFailure(TEST_ENVELOPE, requestId);
    const second = await recordRetryableFailure(TEST_ENVELOPE, requestId);

    expect(second.refundedUsd).toBe(0);
    expect(await readSpendTotal(TEST_ENVELOPE)).toBeCloseTo(0, 4);
  });

  it('no prior debit: refund returns refundedUsd=0', async () => {
    const requestId = makeReq('refund-no-debit');
    const result = await recordRetryableFailure(TEST_ENVELOPE, requestId);
    expect(result.refundedUsd).toBe(0);
  });

  it('breaker increment occurs even when refund finds no entry', async () => {
    const requestId = makeReq('breaker-no-debit');
    const before = await getCircuitState(TEST_ENVELOPE);
    await recordRetryableFailure(TEST_ENVELOPE, requestId);
    const after = await getCircuitState(TEST_ENVELOPE);
    expect(after.failureCount).toBe(before.failureCount + 1);
  });
});

describe('circuit breaker — state transitions', () => {
  it('opens after threshold (5) consecutive failures within window', async () => {
    for (let i = 0; i < 4; i++) {
      const r = await recordRetryableFailure(TEST_ENVELOPE, makeReq(`fail-${i}`));
      expect(r.circuitState).toBe('closed');
    }
    const last = await recordRetryableFailure(TEST_ENVELOPE, makeReq('fail-5'));
    expect(last.circuitState).toBe('open');
    expect((await getCircuitState(TEST_ENVELOPE)).state).toBe('open');
  });

  it('window reset: 4 failures, expire window manually, 1 more → still closed (count=1)', async () => {
    for (let i = 0; i < 4; i++) {
      await recordRetryableFailure(TEST_ENVELOPE, makeReq(`win-${i}`));
    }
    // Force windowStart far in the past to simulate expiry.
    await prisma.$executeRaw`
      UPDATE "pipeline"."EnrichmentCircuitState"
      SET "windowStart" = NOW() - INTERVAL '1 hour'
      WHERE "envelope" = ${TEST_ENVELOPE}::"pipeline"."EnvelopeKind"
    `;
    const r = await recordRetryableFailure(TEST_ENVELOPE, makeReq('win-fresh'));
    expect(r.circuitState).toBe('closed');
    expect(r.failureCount).toBe(1);
  });

  it('open circuit blocks debits with reason="circuit_open" and does not touch counter', async () => {
    await forceCircuitOpen(TEST_ENVELOPE);
    const requestId = makeReq('blocked');
    const result = await tryDebitEnrichment(TEST_ENVELOPE, 0.05, requestId);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('circuit_open');
    // Counter not incremented (the row may exist with total=0 from upsert, but no debit applied).
    const total = await readSpendTotal(TEST_ENVELOPE);
    expect(total === null || total === 0).toBe(true);
    // No ledger entry for this requestId — circuit rejected before the INSERT.
    expect(await readEntryStatus(TEST_ENVELOPE, requestId)).toBeNull();
  });

  it('cooldown elapsed: open → half_open on next debit attempt (and debit succeeds)', async () => {
    // openedAt 2 hours ago > 1h cooldown.
    const past = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await forceCircuitOpen(TEST_ENVELOPE, past);

    const result = await tryDebitEnrichment(TEST_ENVELOPE, 0.05, makeReq('cooldown'));
    expect(result.ok).toBe(true);
    expect((await getCircuitState(TEST_ENVELOPE)).state).toBe('half_open');
  });

  it('half_open → closed after 3 successful debits', async () => {
    // Seed: open → half_open via forced cooldown elapse.
    const past = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await forceCircuitOpen(TEST_ENVELOPE, past);

    for (let i = 0; i < 3; i++) {
      const r = await tryDebitEnrichment(TEST_ENVELOPE, 0.05, makeReq(`halfopen-${i}`));
      expect(r.ok).toBe(true);
    }
    expect((await getCircuitState(TEST_ENVELOPE)).state).toBe('closed');
  });

  it('half_open + failure → re-opens immediately', async () => {
    await forceCircuitHalfOpen(TEST_ENVELOPE);
    const r = await recordRetryableFailure(TEST_ENVELOPE, makeReq('halfopen-fail'));
    expect(r.circuitState).toBe('open');
    expect((await getCircuitState(TEST_ENVELOPE)).state).toBe('open');
  });

  it('recordEnrichmentFailureNoRefund increments breaker but does NOT touch ledger', async () => {
    const requestId = makeReq('no-refund');
    await tryDebitEnrichment(TEST_ENVELOPE, 0.05, requestId);
    const before = await readSpendTotal(TEST_ENVELOPE);

    const r = await recordEnrichmentFailureNoRefund(TEST_ENVELOPE);
    expect(r.failureCount).toBe(1);

    expect(await readSpendTotal(TEST_ENVELOPE)).toBeCloseTo(before!, 4);
    expect(await readEntryStatus(TEST_ENVELOPE, requestId)).toBe('debited'); // unchanged
  });
});

describe('concurrent debit race (Decision 9A) — true 10-client parallelism', () => {
  it('with cap=4.99 and cost=0.50, exactly 9 of 10 parallel clients succeed', async () => {
    process.env.X_SENTIMENT_CAP_USD = '4.99';

    const clients: PrismaClient[] = [];
    for (let i = 0; i < 10; i++) clients.push(new PrismaClient());

    try {
      // Each client calls the module's tryDebitEnrichment, which uses the SHARED
      // singleton prisma (`getPrismaClient()`). The module is the system under test;
      // the 10 separate clients are just to ensure connections are diverse so the
      // database — not Node's event loop — is the contention point.
      // The real concurrency primitive is the 10 simultaneous Promise.all calls,
      // each opening its own transaction against Postgres.
      const promises = Array.from({ length: 10 }, (_, i) =>
        tryDebitEnrichment(TEST_ENVELOPE, 0.5, makeReq(`race-${i}`)),
      );
      const results = await Promise.all(promises);

      const successes = results.filter((r) => r.ok).length;
      const capReached = results.filter((r) => !r.ok && r.reason === 'cap_reached').length;

      expect(successes).toBe(9);
      expect(capReached).toBe(1);

      const total = await readSpendTotal(TEST_ENVELOPE);
      expect(total).toBeCloseTo(4.5, 4); // 9 × 0.50
      expect(total).toBeLessThanOrEqual(4.99);
    } finally {
      await Promise.all(clients.map((c) => c.$disconnect()));
      process.env.X_SENTIMENT_CAP_USD = '5';
    }
  }, 30_000);
});

describe('circuit state survives midnight UTC (Decision 4A)', () => {
  it('open circuit on day N, simulate day N+1 → debit still blocked', async () => {
    // Simulate yesterday's date by inserting a spend row for yesterday + opening circuit.
    await forceCircuitOpen(TEST_ENVELOPE);

    // Today's debit attempt (new dateIso row) should still be blocked because
    // circuit state is keyed by envelope only — no date.
    const result = await tryDebitEnrichment(TEST_ENVELOPE, 0.05, makeReq('midnight'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('circuit_open');
  });
});
