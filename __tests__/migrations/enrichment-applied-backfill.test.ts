/**
 * @jest-environment node
 *
 * Real-DB regression test for `scripts/backfill-enrichment-applied.ts`
 * (Phase 3 of `tasks/x-search-max-only.md`, addressing Tests review item 11A).
 *
 * Why a real-DB test (not mocked):
 *   The backfill's correctness depends on Postgres JSONB `?` operator
 *   semantics — specifically whether it returns false for missing keys,
 *   null for `summaryJSON IS NULL`, and true only for keys actually
 *   present in the object. Mocking Prisma here would let a future bug
 *   silently rewrite the SQL into something that matches in tests but
 *   fails (or worse, succeeds incorrectly) against real Postgres.
 *
 *   The user's standing rule from prior incidents: "integration tests
 *   must hit a real database, not mocks. Reason: prior incident where
 *   mock/prod divergence masked a broken migration."
 *
 * Skip behavior:
 *   If DATABASE_URL is not set (e.g., on a clean checkout in CI without
 *   secrets), the test logs a warning and exits cleanly. This matches
 *   the pattern in `__tests__/integration/supabase-cutover.test.ts`.
 *
 * What it asserts:
 *   Given fixture summaries with summaryJSON shapes:
 *     - has-whyItMatters       → enrichmentApplied flips to true
 *     - has-other-fields-only  → stays false
 *     - empty object {}        → stays false
 *     - JSON null              → stays false  (the key '?' on null is null/false)
 *     - SQL NULL               → stays false  (`?` on NULL returns NULL)
 *   And re-running the backfill is a no-op (idempotency).
 *   And small batch sizes correctly iterate (loop termination).
 */

jest.unmock('@prisma/client');
jest.unmock('../../lib/db');
jest.unmock('../../lib/db/prisma');

import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';
import { runBackfill } from '../../scripts/backfill-enrichment-applied';

const databaseUrl = process.env.DATABASE_URL || '';

// Unique suffix per test run — keeps fixtures from colliding across
// re-runs and from any pre-existing seed data.
const RUN_TAG = `backfill-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

interface FixtureRow {
  id: string;
  expectedAfterBackfill: boolean;
  description: string;
}

const FIXTURES: ReadonlyArray<{
  description: string;
  summaryJSON: unknown;
  expected: boolean;
}> = [
  {
    description: 'whyItMatters present → flips to true',
    summaryJSON: { whyItMatters: 'enrichment text', summary: 's' },
    expected: true,
  },
  {
    description: 'has other fields, no whyItMatters → stays false',
    summaryJSON: { summary: 's', highlights: ['a', 'b'] },
    expected: false,
  },
  {
    description: 'empty object → stays false',
    summaryJSON: {},
    expected: false,
  },
  {
    description: 'JSON null literal → stays false',
    summaryJSON: null,
    expected: false,
  },
];

describe('backfill-enrichment-applied (real DB)', () => {
  let prisma: PrismaClient | null = null;
  let userId: string | null = null;
  let tickerId: string | null = null;
  let createdRows: FixtureRow[] = [];
  let sqlNullRowId: string | null = null;
  let canRun = false;

  beforeAll(async () => {
    if (!databaseUrl) {
      console.warn('[backfill test] DATABASE_URL not set, skipping real-DB test');
      return;
    }
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      console.warn(
        `[backfill test] Cannot connect to DB, skipping: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      await prisma.$disconnect();
      prisma = null;
      return;
    }

    // Phase 2 of x-search-max-only.md adds `enrichmentApplied` to Summary.
    // If the migration hasn't been applied to this DB yet (e.g., a dev box
    // that hasn't run `prisma migrate dev` after pulling), skip cleanly
    // rather than fail with a column-doesn't-exist error.
    const colCheck = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'app'
          AND table_name = 'Summary'
          AND column_name = 'enrichmentApplied'
      ) AS exists
    `;
    if (!colCheck[0]?.exists) {
      console.warn(
        '[backfill test] Summary.enrichmentApplied column missing — Phase 2 ' +
          'migration not yet applied to this DB. Skipping. Run ' +
          '`npx prisma migrate dev` to enable.'
      );
      await prisma.$disconnect();
      prisma = null;
      return;
    }

    // Seed user → ticker → summaries. Cascade delete on the user wipes the lot.
    const user = await prisma.user.create({
      data: {
        email: `${RUN_TAG}@example.test`,
        authProvider: 'test',
        authProviderId: RUN_TAG,
        subscriptionTier: 'FREE',
      },
    });
    userId = user.id;

    const ticker = await prisma.ticker.create({
      data: { userId, symbol: 'TEST', companyName: 'Test Co' },
    });
    tickerId = ticker.id;

    for (const fx of FIXTURES) {
      const row = await prisma.summary.create({
        data: {
          tickerId: ticker.id,
          filingType: '10-K',
          filingDate: new Date(),
          filingUrl: `https://test.example/${RUN_TAG}/${fx.description.replace(/\s+/g, '-')}`,
          summaryText: 'fixture',
          summaryJSON: fx.summaryJSON as never,
          enrichmentApplied: false,
        },
      });
      createdRows.push({
        id: row.id,
        expectedAfterBackfill: fx.expected,
        description: fx.description,
      });
    }

    // SQL NULL summaryJSON case — Prisma create with `summaryJSON: null` writes
    // SQL NULL (which is what we want here, but spelling it out explicitly via
    // raw SQL avoids any ORM-side coercion ambiguity).
    const sqlNullId = `${RUN_TAG}-sqlnull`;
    await prisma.$executeRaw`
      INSERT INTO "app"."Summary" (
        id, "tickerId", "filingType", "filingDate", "filingUrl",
        "summaryText", "summaryJSON", "enrichmentApplied"
      ) VALUES (
        ${sqlNullId}, ${ticker.id}, '10-K', NOW(),
        ${`https://test.example/${RUN_TAG}/sql-null`},
        'fixture', NULL, false
      )
    `;
    sqlNullRowId = sqlNullId;

    canRun = true;
  });

  afterAll(async () => {
    if (prisma && userId) {
      // Cascade: User → Ticker → Summary, all deleted.
      await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
    }
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it('flips enrichmentApplied only for rows whose summaryJSON contains whyItMatters', async () => {
    if (!canRun || !prisma) {
      console.warn('Skipping — DB connection unavailable');
      return;
    }

    // Use a tiny batchSize to force multiple iterations even with our small
    // fixture set, exercising the loop-termination branch.
    const result = await runBackfill(prisma, {
      batchSize: 1,
      sleepMs: 0,
      dryRun: false,
    });

    expect(result.dryRun).toBe(false);
    // Exactly one fixture has whyItMatters → exactly one row should flip.
    expect(result.totalUpdated).toBe(1);
    expect(result.remainingCandidates).toBe(0);

    for (const row of createdRows) {
      const fresh = await prisma.summary.findUnique({ where: { id: row.id } });
      expect(fresh).not.toBeNull();
      expect(fresh!.enrichmentApplied).toBe(row.expectedAfterBackfill);
    }

    // SQL NULL row stays false — `summaryJSON ? 'whyItMatters'` is NULL on
    // a NULL column, which fails the WHERE filter.
    if (sqlNullRowId) {
      const sqlNullRow = await prisma.summary.findUnique({
        where: { id: sqlNullRowId },
      });
      expect(sqlNullRow).not.toBeNull();
      expect(sqlNullRow!.enrichmentApplied).toBe(false);
    }
  });

  it('is idempotent — re-running updates 0 rows', async () => {
    if (!canRun || !prisma) {
      console.warn('Skipping — DB connection unavailable');
      return;
    }

    const second = await runBackfill(prisma, {
      batchSize: 5000,
      sleepMs: 0,
      dryRun: false,
    });

    expect(second.totalUpdated).toBe(0);
    expect(second.batches).toBe(0);
    expect(second.remainingCandidates).toBe(0);
  });

  it('dry-run reports candidates without updating', async () => {
    if (!canRun || !prisma) {
      console.warn('Skipping — DB connection unavailable');
      return;
    }

    // Reset one fixture row back to false to simulate fresh candidates.
    const target = createdRows.find((r) => r.expectedAfterBackfill === true);
    expect(target).toBeDefined();
    await prisma.summary.update({
      where: { id: target!.id },
      data: { enrichmentApplied: false },
    });

    const dry = await runBackfill(prisma, {
      batchSize: 100,
      sleepMs: 0,
      dryRun: true,
    });

    expect(dry.dryRun).toBe(true);
    expect(dry.totalUpdated).toBe(0);
    expect(dry.batches).toBe(0);
    expect(dry.remainingCandidates).toBe(1);

    // Confirm the dry-run did not actually flip the row.
    const stillFalse = await prisma.summary.findUnique({
      where: { id: target!.id },
    });
    expect(stillFalse!.enrichmentApplied).toBe(false);
  });
});
