/**
 * @jest-environment node
 *
 * Real-DB concurrency test for the tier-aware shared summary cache
 * (Phase 5 of `tasks/x-search-max-only.md`, Tests review item 12A).
 *
 * What this pins:
 *   When a Pro user and a Max user trigger summarize jobs for the same
 *   `(filingUrl, formType)` simultaneously, BOTH must end up with their own
 *   Summary row at the correct `enrichmentApplied` value. No row may collide
 *   with the other tier's intended state, and no unique-constraint violation
 *   may surface.
 *
 *   This is the steady-state cross-tier race. The existing per-user uniqueness
 *   `@@unique([tickerId, filingUrl])` prevents same-user duplicates but does
 *   NOT protect across tickers — which is the cross-user case here. The plan
 *   notes the correct outcome is "two distinct rows", not deduplication.
 *
 * Why real DB (no mocks):
 *   The race is a property of the schema + Postgres unique constraints +
 *   Prisma's create-then-throw-on-conflict semantics. Mocking Prisma would
 *   let a future schema change (e.g., someone adding a unique constraint
 *   that accidentally collapses the cross-tier case) silently slip through.
 *
 * Skip behavior:
 *   Same as the truth-table test — exits cleanly when DATABASE_URL is unset
 *   or the migration column hasn't been applied.
 */

jest.unmock('@prisma/client');
jest.unmock('../../../lib/db');
jest.unmock('../../../lib/db/prisma');

import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';

const databaseUrl = process.env.DATABASE_URL || '';
const RUN_TAG = `cache-race-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Simulates one cron job's cache-check-then-write pass. Mirrors the real
 * sequence in `summarize-cached-handler.ts`:
 *   1. Look up shared summary for this `(filingUrl, formType, enrichmentApplied)`.
 *   2. If miss, create a new Summary row attributed to the requesting user.
 *
 * Returns the resulting summary id. Surfaces P2002 unique-constraint errors
 * so the test can assert they don't fire on the cross-tier path.
 */
async function simulateSummarizeJob(
  prisma: PrismaClient,
  args: {
    tickerId: string;
    filingUrl: string;
    filingType: string;
    requesterIsMaxEligible: boolean;
    summaryText: string;
  }
): Promise<{ summaryId: string; cacheHit: boolean; enrichmentApplied: boolean }> {
  const cached = await prisma.summary.findFirst({
    where: {
      filingUrl: args.filingUrl,
      filingType: args.filingType,
      enrichmentApplied: args.requesterIsMaxEligible,
      summaryText: { not: '' },
    },
    select: { id: true, enrichmentApplied: true, summaryText: true },
    orderBy: { createdAt: 'desc' },
  });

  if (cached) {
    // Cache hit path — handler creates a new row attributed to this user
    // carrying forward the cached row's `enrichmentApplied`.
    const created = await prisma.summary.create({
      data: {
        tickerId: args.tickerId,
        filingType: args.filingType,
        filingDate: new Date(),
        filingUrl: args.filingUrl,
        summaryText: cached.summaryText,
        enrichmentApplied: cached.enrichmentApplied,
        isCacheHit: true,
      },
    });
    return {
      summaryId: created.id,
      cacheHit: true,
      enrichmentApplied: created.enrichmentApplied,
    };
  }

  // Cache miss — generate and persist with the requester's tier dimension.
  const created = await prisma.summary.create({
    data: {
      tickerId: args.tickerId,
      filingType: args.filingType,
      filingDate: new Date(),
      filingUrl: args.filingUrl,
      summaryText: args.summaryText,
      enrichmentApplied: args.requesterIsMaxEligible,
      isCacheHit: false,
    },
  });
  return {
    summaryId: created.id,
    cacheHit: false,
    enrichmentApplied: created.enrichmentApplied,
  };
}

describe('cache concurrency: Pro+Max race for same filing (review item 12A)', () => {
  let prisma: PrismaClient | null = null;
  let userId: string | null = null;
  let proTickerId: string | null = null;
  let maxTickerId: string | null = null;
  let canRun = false;

  beforeAll(async () => {
    if (!databaseUrl) {
      console.warn('[cache concurrency] DATABASE_URL not set, skipping');
      return;
    }
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });

    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      console.warn(
        `[cache concurrency] Cannot connect to DB: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      await prisma.$disconnect();
      prisma = null;
      return;
    }

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
        '[cache concurrency] Summary.enrichmentApplied missing — Phase 2 migration ' +
          'not yet applied. Skipping.'
      );
      await prisma.$disconnect();
      prisma = null;
      return;
    }

    // Seed: 1 user with TWO tickers for the same symbol. In production these
    // would be on two separate users, but the per-user unique constraint is
    // `(tickerId, filingUrl)`, so two distinct ticker rows on one user is
    // sufficient to model the cross-tier race without complicating cleanup.
    const user = await prisma.user.create({
      data: {
        email: `${RUN_TAG}@example.test`,
        authProvider: 'test',
        authProviderId: RUN_TAG,
        subscriptionTier: 'FREE',
      },
    });
    userId = user.id;

    const proTicker = await prisma.ticker.create({
      data: { userId: user.id, symbol: 'PRO', companyName: 'Pro Co' },
    });
    proTickerId = proTicker.id;

    const maxTicker = await prisma.ticker.create({
      data: { userId: user.id, symbol: 'MAX', companyName: 'Max Co' },
    });
    maxTickerId = maxTicker.id;

    canRun = true;
  });

  afterAll(async () => {
    if (prisma && userId) {
      try {
        await prisma.user.delete({ where: { id: userId } });
      } catch (err) {
        console.warn(
          `[cache concurrency] Cleanup failed: ${
            err instanceof Error ? err.message : String(err)
          }`
        );
      }
      await prisma.$disconnect();
    }
  });

  it('Promise.all of Pro + Max jobs against same filing yields two distinct rows', async () => {
    if (!canRun || !prisma || !proTickerId || !maxTickerId) return;

    const filingUrl = `https://test.example/${RUN_TAG}/race`;
    const filingType = '8-K';

    // The race: both jobs start with the cache empty for this filing. Both
    // execute findFirst → returns null → proceed to create. The crucial
    // invariant: the unique constraint `(tickerId, filingUrl)` is satisfied
    // because the tickerIds differ.
    const [proResult, maxResult] = await Promise.all([
      simulateSummarizeJob(prisma, {
        tickerId: proTickerId,
        filingUrl,
        filingType,
        requesterIsMaxEligible: false,
        summaryText: 'PRO_GENERATED',
      }),
      simulateSummarizeJob(prisma, {
        tickerId: maxTickerId,
        filingUrl,
        filingType,
        requesterIsMaxEligible: true,
        summaryText: 'MAX_GENERATED',
      }),
    ]);

    // Two distinct rows, both fresh generations (neither was a cache hit
    // because they raced — empty cache at lookup time for both).
    expect(proResult.summaryId).not.toBe(maxResult.summaryId);
    expect(proResult.cacheHit).toBe(false);
    expect(maxResult.cacheHit).toBe(false);
    expect(proResult.enrichmentApplied).toBe(false);
    expect(maxResult.enrichmentApplied).toBe(true);

    // Verify both rows persisted with the right tier dimension. After this
    // race, a third user querying the cache must find their own tier's row
    // (the silent-leak F1 prevention).
    const allForFiling = await prisma.summary.findMany({
      where: { filingUrl, filingType },
      select: { id: true, tickerId: true, enrichmentApplied: true, summaryText: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(allForFiling).toHaveLength(2);
    const proRow = allForFiling.find((r) => r.tickerId === proTickerId);
    const maxRow = allForFiling.find((r) => r.tickerId === maxTickerId);
    expect(proRow?.enrichmentApplied).toBe(false);
    expect(proRow?.summaryText).toBe('PRO_GENERATED');
    expect(maxRow?.enrichmentApplied).toBe(true);
    expect(maxRow?.summaryText).toBe('MAX_GENERATED');
  });

  it('subsequent same-tier requesters reuse the post-race cache (warm path)', async () => {
    if (!canRun || !prisma || !proTickerId || !maxTickerId) return;

    // After the race above, the cache is populated with one Pro row and one
    // Max row. A *new* requester for either tier should find the appropriate
    // cached row instead of generating fresh.
    const filingUrl = `https://test.example/${RUN_TAG}/race`;
    const filingType = '8-K';

    // Use a third ticker (separate user attribution) to keep the per-user
    // unique constraint satisfied. We're modeling a fresh user landing on
    // the same filing after the race resolved.
    const proTicker3 = await prisma.ticker.create({
      data: { userId: userId!, symbol: 'PRO3', companyName: 'Pro 3 Co' },
    });
    const maxTicker3 = await prisma.ticker.create({
      data: { userId: userId!, symbol: 'MAX3', companyName: 'Max 3 Co' },
    });

    const [proWarm, maxWarm] = await Promise.all([
      simulateSummarizeJob(prisma, {
        tickerId: proTicker3.id,
        filingUrl,
        filingType,
        requesterIsMaxEligible: false,
        summaryText: 'should-not-be-used',
      }),
      simulateSummarizeJob(prisma, {
        tickerId: maxTicker3.id,
        filingUrl,
        filingType,
        requesterIsMaxEligible: true,
        summaryText: 'should-not-be-used',
      }),
    ]);

    // Both hit the cache. Generated text from the warm path is the *cached*
    // text from the original Pro/Max rows, not the placeholder we passed.
    expect(proWarm.cacheHit).toBe(true);
    expect(proWarm.enrichmentApplied).toBe(false);
    expect(maxWarm.cacheHit).toBe(true);
    expect(maxWarm.enrichmentApplied).toBe(true);

    const allForFiling = await prisma.summary.findMany({
      where: { filingUrl, filingType },
      select: { id: true, tickerId: true, summaryText: true },
    });
    // 2 from race + 2 warm = 4 total rows
    expect(allForFiling).toHaveLength(4);
    const proWarmRow = allForFiling.find((r) => r.tickerId === proTicker3.id);
    const maxWarmRow = allForFiling.find((r) => r.tickerId === maxTicker3.id);
    expect(proWarmRow?.summaryText).toBe('PRO_GENERATED');
    expect(maxWarmRow?.summaryText).toBe('MAX_GENERATED');
  });
});
