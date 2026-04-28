-- Migration: Postgres-backed enrichment spend ledger
-- Source plan: tasks/x-sentiment-budget-implementation.md (Phase 1)
-- Architecture: tasks/x-sentiment-budget-architecture.md (autoplan-approved 2026-04-27)
--
-- Adds three pipeline-schema tables and one enum that replace the process-local
-- `dailySpend` accumulator in `lib/ai/enrichment-flags.ts` with a multi-isolate-safe
-- atomic counter + idempotent ledger + envelope-scoped circuit breaker.
--
-- The migration is purely additive: zero existing rows in any new table, no FK
-- conflicts, no backfill. Rollback drops the tables and enum.

-- ─── Enum ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "pipeline"."EnvelopeKind" AS ENUM ('why_it_matters', 'x_sentiment');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ─── EnrichmentSpend (per-envelope per-day counter) ──────────────────────────
CREATE TABLE IF NOT EXISTS "pipeline"."EnrichmentSpend" (
  "id"        TEXT NOT NULL,
  "envelope"  "pipeline"."EnvelopeKind" NOT NULL,
  "dateIso"   TEXT NOT NULL,
  "totalUsd"  DECIMAL(10, 4) NOT NULL DEFAULT 0,
  "capUsd"    DECIMAL(10, 4) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EnrichmentSpend_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "EnrichmentSpend_envelope_dateIso_key"
  ON "pipeline"."EnrichmentSpend" ("envelope", "dateIso");

CREATE INDEX IF NOT EXISTS "EnrichmentSpend_dateIso_idx"
  ON "pipeline"."EnrichmentSpend" ("dateIso");

-- ─── EnrichmentSpendEntry (per-call ledger keyed by requestId) ───────────────
CREATE TABLE IF NOT EXISTS "pipeline"."EnrichmentSpendEntry" (
  "id"        TEXT NOT NULL,
  "spendId"   TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "envelope"  "pipeline"."EnvelopeKind" NOT NULL,
  "dateIso"   TEXT NOT NULL,
  "amountUsd" DECIMAL(10, 4) NOT NULL,
  "status"    TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EnrichmentSpendEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EnrichmentSpendEntry_spendId_fkey"
    FOREIGN KEY ("spendId") REFERENCES "pipeline"."EnrichmentSpend"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "EnrichmentSpendEntry_envelope_dateIso_requestId_key"
  ON "pipeline"."EnrichmentSpendEntry" ("envelope", "dateIso", "requestId");

CREATE INDEX IF NOT EXISTS "EnrichmentSpendEntry_spendId_status_idx"
  ON "pipeline"."EnrichmentSpendEntry" ("spendId", "status");

CREATE INDEX IF NOT EXISTS "EnrichmentSpendEntry_dateIso_idx"
  ON "pipeline"."EnrichmentSpendEntry" ("dateIso");

-- ─── EnrichmentCircuitState (per-envelope breaker, no date — survives midnight UTC) ─
CREATE TABLE IF NOT EXISTS "pipeline"."EnrichmentCircuitState" (
  "envelope"          "pipeline"."EnvelopeKind" NOT NULL,
  "state"             TEXT NOT NULL DEFAULT 'closed',
  "openedAt"          TIMESTAMP(3),
  "failureCount"      INTEGER NOT NULL DEFAULT 0,
  "windowStart"       TIMESTAMP(3),
  "halfOpenSuccesses" INTEGER NOT NULL DEFAULT 0,
  "updatedAt"         TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EnrichmentCircuitState_pkey" PRIMARY KEY ("envelope")
);

-- ─── Seed circuit-state rows so Phase 2's debit path never sees a missing row ─
INSERT INTO "pipeline"."EnrichmentCircuitState" ("envelope", "state", "updatedAt")
VALUES
  ('why_it_matters', 'closed', CURRENT_TIMESTAMP),
  ('x_sentiment',    'closed', CURRENT_TIMESTAMP)
ON CONFLICT ("envelope") DO NOTHING;
