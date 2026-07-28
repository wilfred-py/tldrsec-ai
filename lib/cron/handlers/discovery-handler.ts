/**
 * Discovery Handler - Phase 1 of 3-Phase Async Pipeline
 *
 * Purpose: Fast discovery of new SEC filings (<5s target)
 * - Check SEC RSS feeds for new filings
 * - Identify ALL users tracking each ticker (multi-user support)
 * - Queue ASYNC_FETCH_FILING jobs for content retrieval for EACH user
 *
 * IMPORTANT: When a filing is discovered, we create jobs for ALL users
 * tracking that ticker, not just the first user processed. This ensures
 * all users receive email notifications for filings they track.
 *
 * This handler runs quickly and returns 202 Accepted immediately
 */

import { logger } from '../../logging';
import type { JobPayload } from '../../job-queue';
import { checkForNewFilings } from '../sec-filing-service';
import { getPriorityForTier } from '../tier-eligibility';

const discoveryLogger = logger.child('discovery-handler');

export interface DiscoveryJobPayload extends JobPayload {
  executionId: string;
  cronTriggerTime: string;
}

export interface DiscoveryResult {
  success: boolean;
  filingsDiscovered: number;
  fetchJobsQueued: number;
  eligibleUsers: number;
  uniqueTickers: number;
  usersPerFiling: number;
  duration: number;
  error?: string;
}

/**
 * Enriched ticker data with CIK and company name
 */
export interface EnrichedTicker {
  symbol: string;
  companyName: string;
  cik: string | null;
}

/**
 * Bulk enrich ticker symbols with CIK and company name data
 * Reduces N+1 queries (2N) to 2 bulk queries
 *
 * @param tickerSymbols - Array of ticker symbols to enrich
 * @returns Array of enriched ticker data with CIK and company name
 */
export async function enrichTickersWithCik(
  tickerSymbols: string[]
): Promise<EnrichedTicker[]> {
  if (tickerSymbols.length === 0) {
    return [];
  }

  const { getPrismaClient } = await import('../../db/prisma');
  const prisma = getPrismaClient();

  // Bulk query 1: Get all CIK mappings in one query
  const cikMappings = await prisma.cikMapping.findMany({
    where: { ticker: { in: tickerSymbols } }
  });
  const cikMap = new Map(cikMappings.map(c => [c.ticker, c.cik]));

  // Bulk query 2: Get all company names in one query
  const tickerRecords = await prisma.ticker.findMany({
    where: { symbol: { in: tickerSymbols } },
    select: { symbol: true, companyName: true },
    distinct: ['symbol']
  });
  const companyNameMap = new Map(
    tickerRecords.map(t => [t.symbol, t.companyName])
  );

  // Build enriched result
  return tickerSymbols.map(symbol => ({
    symbol,
    companyName: companyNameMap.get(symbol) || symbol,
    cik: cikMap.get(symbol) || null
  }));
}

/**
 * User data for bulk job creation
 */
export interface UserForFiling {
  id: string;
  email: string;
  subscriptionTier: string;
  isTrialing?: boolean;
  trialEndsAt?: Date | null;
  tickers: Array<{ id: string; companyName: string | null }>;
}

/**
 * Filing data for bulk job creation
 */
export interface FilingForBulkJob {
  ticker: string;
  formType: string;
  filingDate: string;
  url: string;
  accessionNumber: string;
  id: string;
  title?: string;
}

/**
 * Execution context for bulk job creation
 */
export interface BulkJobExecutionContext {
  executionId: string;
  cronTriggerTime: string;
}

// getPriorityForTier imported from ../tier-eligibility.ts (Tier Scheduling module)

/**
 * Bulk create fetch jobs for all users tracking a filing
 * Replaces sequential addJob calls with efficient createMany operation
 *
 * @param usersForFiling - Users who track this filing's ticker
 * @param filing - The SEC filing discovered
 * @param tickerInfo - Enriched ticker data with CIK
 * @param executionContext - Execution context for tracing
 * @returns Number of jobs created
 */
export async function createBulkFetchJobs(
  usersForFiling: UserForFiling[],
  filing: FilingForBulkJob,
  tickerInfo: EnrichedTicker,
  executionContext: BulkJobExecutionContext
): Promise<number> {
  if (usersForFiling.length === 0) {
    return 0;
  }

  const { getPrismaClient } = await import('../../db/prisma');
  const prisma = getPrismaClient();

  // Build job records for all users
  const jobRecords = usersForFiling
    .filter(user => user.tickers.length > 0) // Skip users without ticker records
    .map(user => {
      const userTicker = user.tickers[0];
      return {
        jobType: 'ASYNC_FETCH_FILING',
        status: 'PENDING' as const,
        priority: getPriorityForTier(user.subscriptionTier, user.isTrialing, user.trialEndsAt),
        maxRetries: 3,
        retryCount: 0,
        scheduledFor: new Date(), // Schedule for immediate execution
        idempotencyKey: `ASYNC_FETCH_FILING:${user.id}:${filing.accessionNumber}`,
        payload: {
          userId: user.id,
          userEmail: user.email,
          userTier: user.subscriptionTier || 'FREE',
          ticker: {
            id: userTicker.id,
            symbol: filing.ticker,
            companyName: userTicker.companyName || tickerInfo.companyName,
            cik: tickerInfo.cik
          },
          filing: {
            filingId: filing.id,
            formType: filing.formType,
            filingDate: filing.filingDate,
            filingUrl: filing.url,
            accessionNumber: filing.accessionNumber
          },
          executionContext: {
            executionId: executionContext.executionId,
            cronTriggerTime: executionContext.cronTriggerTime,
            sourceContext: 'discovery-bulk',
            discoveryPhaseCompletedAt: new Date().toISOString(),
            totalUsersForTicker: usersForFiling.length
          }
        }
      };
    });

  if (jobRecords.length === 0) {
    return 0;
  }

  // Bulk insert with skipDuplicates for idempotency
  const result = await prisma.jobQueue.createMany({
    data: jobRecords,
    skipDuplicates: true
  });

  return result.count;
}

/**
 * Phase 1: Discover new filings and queue fetch jobs
 *
 * Fast operation (<5s) that uses TICKER-CENTRIC discovery:
 * 1. Gets all active tickers with TickerMonitoring records (creates if missing)
 * 2. Checks SEC RSS feeds ONCE per unique ticker
 * 3. For each new filing, finds ALL users tracking that ticker
 * 4. Queues ASYNC_FETCH_FILING jobs for EACH user (multi-user support)
 *
 * This ensures all users tracking a ticker get notified when a filing is discovered,
 * not just the first user processed.
 *
 * IMPORTANT: Uses getActiveTickersForMonitoring() to ensure TickerMonitoring records
 * are created/updated. This was a critical bug fix - the 3-phase pipeline was skipping
 * this step, causing the TickerMonitoring table to become empty.
 *
 * Does NOT fetch content or summarize - just discovers and queues
 */
export async function handleDiscovery(
  payload: DiscoveryJobPayload
): Promise<DiscoveryResult> {
  const startTime = Date.now();
  const { executionId, cronTriggerTime } = payload;

  discoveryLogger.info(`[${executionId}] Starting discovery phase (ticker-centric)`, {
    cronTriggerTime,
    timestamp: new Date().toISOString()
  });

  try {
    const { getPrismaClient } = await import('../../db/prisma');
    const prisma = getPrismaClient();

    // STEP 1: Ensure TickerMonitoring records exist via getActiveTickersForMonitoring
    // CRITICAL: This was missing in the original 3-phase pipeline, causing
    // TickerMonitoring table to become empty and discovery to fail silently.
    // getActiveTickersForMonitoring() upserts records for all active tickers.
    const { getActiveTickersForMonitoring } = await import('../../sec-edgar/ticker-monitoring');
    const activeTickersFromMonitoring = await getActiveTickersForMonitoring();

    discoveryLogger.info(`[${executionId}] TickerMonitoring records ensured`, {
      activeTickerCount: activeTickersFromMonitoring.length,
      tickers: activeTickersFromMonitoring.map(t => t.symbol)
    });

    // Also get unique ticker symbols for enrichment (includes any tickers not yet in monitoring)
    const uniqueTickerSymbols = await prisma.ticker.findMany({
      select: {
        symbol: true
      },
      distinct: ['symbol']
    });

    const tickerSymbols = uniqueTickerSymbols.map(t => t.symbol);

    discoveryLogger.info(`[${executionId}] Unique tickers identified`, {
      uniqueTickerCount: tickerSymbols.length,
      tickers: tickerSymbols,
      monitoringRecords: activeTickersFromMonitoring.length
    });

    if (tickerSymbols.length === 0) {
      discoveryLogger.info(`[${executionId}] No tickers found - discovery complete`);
      return {
        success: true,
        filingsDiscovered: 0,
        fetchJobsQueued: 0,
        eligibleUsers: 0,
        uniqueTickers: 0,
        usersPerFiling: 0,
        duration: Date.now() - startTime
      };
    }

    // STEP 2: Bulk enrich tickers with CIK from CikMapping table
    // Optimized: 2 bulk queries instead of 2N individual queries
    const tickersWithCik = await enrichTickersWithCik(tickerSymbols);

    discoveryLogger.debug(`[${executionId}] Enriched tickers with CIK`, {
      enrichedCount: tickersWithCik.length,
      tickersWithCik: tickersWithCik.filter(t => t.cik).length,
      tickersWithoutCik: tickersWithCik.filter(t => !t.cik).length
    });

    // STEP 3: Check RSS feeds for new filings (ONCE per ticker, not per user)
    // We pass null for userId since we're doing ticker-centric discovery
    const allNewFilings = await checkForNewFilings(
      tickersWithCik.map(t => ({ id: t.symbol, symbol: t.symbol, companyName: t.companyName, cik: t.cik })),
      null // No specific user - ticker-centric discovery
    );

    discoveryLogger.info(`[${executionId}] RSS filings discovered across all tickers`, {
      filingsFound: allNewFilings.length,
      tickers: Array.from(new Set(allNewFilings.map(f => f.ticker)))
    });

    // STEP 3.5: ALSO get unprocessed filings from database (backlog recovery)
    // This catches filings that were discovered but never had jobs created
    const { getUnprocessedFilings } = await import('../../sec-edgar/ticker-monitoring');
    const unprocessedFilings = await getUnprocessedFilings(50); // Limit to prevent timeout

    if (unprocessedFilings.length > 0) {
      discoveryLogger.info(`[${executionId}] Found ${unprocessedFilings.length} unprocessed filings for recovery`);

      // Convert to same format as RSS filings for unified processing
      for (const filing of unprocessedFilings) {
        // Add to allNewFilings if not already present (by accessionNumber)
        const alreadyDiscovered = allNewFilings.some(f => f.accessionNumber === filing.accessionNumber);
        if (!alreadyDiscovered) {
          allNewFilings.push({
            id: filing.id,
            ticker: filing.ticker.symbol,
            formType: filing.filingType,
            filingDate: filing.filingDate.toISOString().split('T')[0],
            url: filing.filingUrl,
            accessionNumber: filing.accessionNumber,
            title: `${filing.filingType} - ${filing.ticker.companyName}`
          });
        }
      }

      discoveryLogger.info(`[${executionId}] Total filings after backlog recovery`, {
        totalFilings: allNewFilings.length,
        fromRss: allNewFilings.length - unprocessedFilings.filter(f =>
          !allNewFilings.slice(0, allNewFilings.length - unprocessedFilings.length)
            .some(rss => rss.accessionNumber === f.accessionNumber)
        ).length,
        fromBacklog: unprocessedFilings.length
      });
    }

    let totalFetchJobsQueued = 0;
    let totalUsersProcessed = 0;
    const usersPerFilingCounts: number[] = [];

    // STEP 4: Pre-fetch ALL users for all discovered tickers in one query (fixes N+1)
    const allDiscoveredTickers = [...new Set(allNewFilings.map(f => f.ticker))];
    const allUsersForTickers = allDiscoveredTickers.length > 0
      ? await prisma.user.findMany({
          where: {
            tickers: {
              some: { symbol: { in: allDiscoveredTickers } }
            }
          },
          select: {
            id: true,
            email: true,
            subscriptionTier: true,
            isTrialing: true,
            trialEndsAt: true,
            tickers: {
              where: { symbol: { in: allDiscoveredTickers } },
              select: { id: true, symbol: true, companyName: true }
            }
          }
        })
      : [];

    // Build lookup: ticker symbol → users tracking it
    const usersByTicker = new Map<string, typeof allUsersForTickers>();
    for (const user of allUsersForTickers) {
      for (const ticker of user.tickers) {
        const list = usersByTicker.get(ticker.symbol) || [];
        list.push(user);
        usersByTicker.set(ticker.symbol, list);
      }
    }

    discoveryLogger.info(`[${executionId}] Pre-fetched users for ${allDiscoveredTickers.length} tickers`, {
      totalUsers: allUsersForTickers.length,
      tickersWithUsers: usersByTicker.size
    });

    // For each filing, use pre-fetched users to create jobs in bulk
    for (const filing of allNewFilings) {
      try {
        // Use pre-fetched users instead of per-filing query
        const usersForTicker = (usersByTicker.get(filing.ticker) || []).map(u => ({
          ...u,
          // Filter tickers to only the one matching this filing
          tickers: u.tickers.filter(t => t.symbol === filing.ticker)
        }));

        discoveryLogger.debug(`[${executionId}] Users found for filing`, {
          ticker: filing.ticker,
          formType: filing.formType,
          usersCount: usersForTicker.length,
          users: usersForTicker.map(u => u.email)
        });

        usersPerFilingCounts.push(usersForTicker.length);

        // Get ticker info for this filing
        const tickerInfo = tickersWithCik.find(t => t.symbol === filing.ticker) || {
          symbol: filing.ticker,
          companyName: filing.ticker,
          cik: null
        };

        // Bulk create jobs for all users tracking this ticker
        const jobsCreated = await createBulkFetchJobs(
          usersForTicker.map(u => ({
            id: u.id,
            email: u.email || '',
            subscriptionTier: u.subscriptionTier || 'FREE',
            isTrialing: u.isTrialing,
            trialEndsAt: u.trialEndsAt,
            tickers: u.tickers
          })),
          {
            ticker: filing.ticker,
            formType: filing.formType,
            filingDate: filing.filingDate,
            url: filing.url,
            accessionNumber: filing.accessionNumber,
            id: filing.id
          },
          tickerInfo,
          { executionId, cronTriggerTime }
        );

        totalFetchJobsQueued += jobsCreated;
        totalUsersProcessed += usersForTicker.filter(u => u.tickers.length > 0).length;

        // Mark the filing as processed in RssFilingCheck if jobs were created
        // This prevents the filing from being picked up again in future recovery passes
        if (jobsCreated > 0) {
          try {
            const { markFilingAsProcessed } = await import('../../sec-edgar/ticker-monitoring');
            await markFilingAsProcessed(filing.id);
            discoveryLogger.debug(`[${executionId}] Marked filing as processed`, {
              filingId: filing.id,
              accessionNumber: filing.accessionNumber
            });
          } catch (markError) {
            // Log but don't fail - the jobs were created successfully
            discoveryLogger.warn(`[${executionId}] Failed to mark filing as processed`, {
              filingId: filing.id,
              error: markError instanceof Error ? markError.message : 'Unknown error'
            });
          }
        }

        discoveryLogger.debug(`[${executionId}] Bulk created jobs for filing`, {
          ticker: filing.ticker,
          jobsCreated,
          usersCount: usersForTicker.length
        });
      } catch (filingError) {
        discoveryLogger.error(`[${executionId}] Failed to process filing in discovery`, {
          ticker: filing.ticker,
          filingId: filing.id,
          error: filingError instanceof Error ? filingError.message : 'Unknown error'
        });
      }
    }

    const duration = Date.now() - startTime;
    const avgUsersPerFiling = usersPerFilingCounts.length > 0
      ? Math.round(usersPerFilingCounts.reduce((a, b) => a + b, 0) / usersPerFilingCounts.length * 10) / 10
      : 0;

    discoveryLogger.info(`[${executionId}] Discovery phase completed (ticker-centric)`, {
      uniqueTickers: tickerSymbols.length,
      filingsDiscovered: allNewFilings.length,
      fetchJobsQueued: totalFetchJobsQueued,
      usersProcessed: totalUsersProcessed,
      avgUsersPerFiling,
      duration,
      averageTimePerTicker: tickerSymbols.length > 0 ? Math.round(duration / tickerSymbols.length) : 0
    });

    return {
      success: true,
      filingsDiscovered: allNewFilings.length,
      fetchJobsQueued: totalFetchJobsQueued,
      eligibleUsers: totalUsersProcessed,
      uniqueTickers: tickerSymbols.length,
      usersPerFiling: avgUsersPerFiling,
      duration
    };

  } catch (error) {
    const duration = Date.now() - startTime;

    discoveryLogger.error(`[${executionId}] Discovery phase failed`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      duration
    });

    return {
      success: false,
      filingsDiscovered: 0,
      fetchJobsQueued: 0,
      eligibleUsers: 0,
      uniqueTickers: 0,
      usersPerFiling: 0,
      duration,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
