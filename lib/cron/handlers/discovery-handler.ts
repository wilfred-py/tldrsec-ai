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
import { JobQueueService } from '../../job-queue';
import type { JobPayload } from '../../job-queue';
import { CronSecFilingService } from '../sec-filing-service';

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
 * Phase 1: Discover new filings and queue fetch jobs
 *
 * Fast operation (<5s) that uses TICKER-CENTRIC discovery:
 * 1. Gets all unique tickers across ALL users
 * 2. Checks SEC RSS feeds ONCE per unique ticker
 * 3. For each new filing, finds ALL users tracking that ticker
 * 4. Queues ASYNC_FETCH_FILING jobs for EACH user (multi-user support)
 *
 * This ensures all users tracking a ticker get notified when a filing is discovered,
 * not just the first user processed.
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

    // STEP 1: Get all unique ticker symbols across ALL users
    // This is more efficient than per-user discovery
    const uniqueTickerSymbols = await prisma.ticker.findMany({
      select: {
        symbol: true
      },
      distinct: ['symbol']
    });

    const tickerSymbols = uniqueTickerSymbols.map(t => t.symbol);

    discoveryLogger.info(`[${executionId}] Unique tickers identified`, {
      uniqueTickerCount: tickerSymbols.length,
      tickers: tickerSymbols
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

    // STEP 2: Enrich tickers with CIK from CikMapping table
    const tickersWithCik = await Promise.all(
      tickerSymbols.map(async (symbol) => {
        const cikMapping = await prisma.cikMapping.findFirst({
          where: { ticker: symbol }
        });
        // Get company name from any user's ticker record
        const tickerRecord = await prisma.ticker.findFirst({
          where: { symbol },
          select: { companyName: true }
        });
        return {
          symbol,
          companyName: tickerRecord?.companyName || symbol,
          cik: cikMapping?.cik || null
        };
      })
    );

    // STEP 3: Check RSS feeds for new filings (ONCE per ticker, not per user)
    // We pass null for userId since we're doing ticker-centric discovery
    const allNewFilings = await CronSecFilingService.checkForNewFilings(
      tickersWithCik.map(t => ({ id: t.symbol, symbol: t.symbol, companyName: t.companyName, cik: t.cik })),
      null // No specific user - ticker-centric discovery
    );

    discoveryLogger.info(`[${executionId}] Filings discovered across all tickers`, {
      filingsFound: allNewFilings.length,
      tickers: Array.from(new Set(allNewFilings.map(f => f.ticker)))
    });

    let totalFetchJobsQueued = 0;
    let totalUsersProcessed = 0;
    const usersPerFilingCounts: number[] = [];

    // STEP 4: For each filing, find ALL users tracking that ticker and create jobs
    for (const filing of allNewFilings) {
      try {
        // Find ALL users who track this ticker
        const usersForTicker = await prisma.user.findMany({
          where: {
            tickers: {
              some: { symbol: filing.ticker }
            }
          },
          select: {
            id: true,
            email: true,
            subscriptionTier: true,
            tickers: {
              where: { symbol: filing.ticker },
              select: { id: true, companyName: true }
            }
          }
        });

        discoveryLogger.debug(`[${executionId}] Users found for filing`, {
          ticker: filing.ticker,
          formType: filing.formType,
          usersCount: usersForTicker.length,
          users: usersForTicker.map(u => u.email)
        });

        usersPerFilingCounts.push(usersForTicker.length);

        // Create ASYNC_FETCH_FILING job for EACH user tracking this ticker
        for (const user of usersForTicker) {
          try {
            // Get this user's specific ticker record for linking
            const userTicker = user.tickers[0];
            if (!userTicker) {
              discoveryLogger.warn(`[${executionId}] User has no ticker record for symbol`, {
                userId: user.id,
                symbol: filing.ticker
              });
              continue;
            }

            const tickerInfo = tickersWithCik.find(t => t.symbol === filing.ticker);

            const fetchJob = await JobQueueService.addJob({
              jobType: 'ASYNC_FETCH_FILING',
              payload: {
                userId: user.id,
                userEmail: user.email,
                userTier: user.subscriptionTier || 'FREE',
                ticker: {
                  id: userTicker.id,
                  symbol: filing.ticker,
                  companyName: userTicker.companyName || tickerInfo?.companyName,
                  cik: tickerInfo?.cik
                },
                filing: {
                  filingId: filing.id,
                  formType: filing.formType,
                  filingDate: filing.filingDate,
                  filingUrl: filing.url,
                  accessionNumber: filing.accessionNumber
                },
                executionContext: {
                  executionId,
                  cronTriggerTime,
                  sourceContext: 'discovery-multi-user',
                  discoveryPhaseCompletedAt: new Date().toISOString(),
                  totalUsersForTicker: usersForTicker.length
                }
              },
              priority: user.subscriptionTier === 'ENTERPRISE' ? 8 :
                       user.subscriptionTier === 'PROFESSIONAL' ? 7 :
                       user.subscriptionTier === 'INSTITUTION' ? 7 : 5,
              maxAttempts: 3
            });

            if (fetchJob) {
              totalFetchJobsQueued++;
              totalUsersProcessed++;
            }
          } catch (queueError) {
            discoveryLogger.error(`[${executionId}] Failed to queue fetch job for user`, {
              userId: user.id,
              ticker: filing.ticker,
              filingId: filing.id,
              error: queueError instanceof Error ? queueError.message : 'Unknown error'
            });
          }
        }
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
