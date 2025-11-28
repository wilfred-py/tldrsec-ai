/**
 * Discovery Handler - Phase 1 of 3-Phase Async Pipeline
 *
 * Purpose: Fast discovery of new SEC filings (<5s target)
 * - Check SEC RSS feeds for new filings
 * - Identify eligible users for each filing
 * - Queue ASYNC_FETCH_FILING jobs for content retrieval
 *
 * This handler runs quickly and returns 202 Accepted immediately
 */

import { logger } from '../../logging';
import { JobQueueService } from '../../job-queue';
import type { JobPayload } from '../../job-queue';
import { getMarketHoursContext } from '../market-hours';
import { CronUserProcessingService } from '../user-processing-service';
import { CronSecFilingService } from '../sec-filing-service';

const discoveryLogger = logger.child('discovery-handler');

export interface DiscoveryJobPayload extends JobPayload {
  executionId: string;
  cronTriggerTime: string;
  marketHoursContext?: any;
}

export interface DiscoveryResult {
  success: boolean;
  filingsDiscovered: number;
  fetchJobsQueued: number;
  eligibleUsers: number;
  duration: number;
  error?: string;
}

/**
 * Phase 1: Discover new filings and queue fetch jobs
 *
 * Fast operation (<5s) that:
 * 1. Gets eligible users based on tier and frequency
 * 2. Checks SEC RSS feeds for new filings
 * 3. Queues ASYNC_FETCH_FILING jobs for each filing+user combination
 *
 * Does NOT fetch content or summarize - just discovers and queues
 */
export async function handleDiscovery(
  payload: DiscoveryJobPayload
): Promise<DiscoveryResult> {
  const startTime = Date.now();
  const { executionId, cronTriggerTime } = payload;

  discoveryLogger.info(`[${executionId}] Starting discovery phase`, {
    cronTriggerTime,
    timestamp: new Date().toISOString()
  });

  try {
    // Get market hours context
    const marketContext = await getMarketHoursContext();

    discoveryLogger.debug(`[${executionId}] Market context determined`, {
      isMarketHours: marketContext.isMarketHours,
      hoursSinceOpen: marketContext.hoursSinceOpen
    });

    // Get eligible users (FAST - just database query)
    // Note: allUsers contains DatabaseUser objects with full user data (id, email, subscriptionTier, tickers)
    //       eligibleUsers contains EligibleUser objects with just (userId, tier)
    const { allUsers, eligibleUsers } = await CronUserProcessingService.getEligibleUsersForProcessing(
      marketContext,
      {
        maxUsersPerCycle: 100,
        respectBudgetLimits: true,
        budgetThreshold: 90
      }
    );

    discoveryLogger.info(`[${executionId}] Eligible users identified`, {
      totalUsers: allUsers.length,
      eligibleUsers: eligibleUsers.length
    });

    if (eligibleUsers.length === 0) {
      discoveryLogger.info(`[${executionId}] No eligible users - discovery complete`);
      return {
        success: true,
        filingsDiscovered: 0,
        fetchJobsQueued: 0,
        eligibleUsers: 0,
        duration: Date.now() - startTime
      };
    }

    // Check for new filings for eligible users (FAST - RSS feed check)
    let totalFilingsDiscovered = 0;
    let totalFetchJobsQueued = 0;

    for (const eligibleUser of eligibleUsers) {
      try {
        // Look up full user data from allUsers (DatabaseUser) using eligibleUser.userId
        const fullUser = allUsers.find(u => u.id === eligibleUser.userId);
        if (!fullUser) {
          discoveryLogger.warn(`[${executionId}] Could not find full user data for eligible user`, {
            userId: eligibleUser.userId
          });
          continue;
        }

        // Get user's tracked tickers
        const { getPrismaClient } = await import('../../db/prisma');
        const prisma = getPrismaClient();

        const userTickers = await prisma.ticker.findMany({
          where: { userId: fullUser.id },
          select: {
            id: true,
            symbol: true,
            companyName: true
          }
        });

        if (userTickers.length === 0) continue;

        // Enrich tickers with CIK from CikMapping table
        // Note: CikMapping uses 'ticker' field, not 'symbol'
        const tickers = await Promise.all(
          userTickers.map(async (ticker) => {
            const cikMapping = await prisma.cikMapping.findFirst({
              where: { ticker: ticker.symbol }
            });
            return {
              ...ticker,
              cik: cikMapping?.cik || null
            };
          })
        );

        // Check for new filings for this user's tickers
        const newFilings = await CronSecFilingService.checkForNewFilings(
          tickers,
          fullUser.id
        );

        discoveryLogger.debug(`[${executionId}] Filings discovered for user`, {
          userId: fullUser.id,
          userEmail: fullUser.email,
          tickerCount: tickers.length,
          filingsFound: newFilings.length
        });

        totalFilingsDiscovered += newFilings.length;

        // Queue ASYNC_FETCH_FILING jobs for each filing
        for (const filing of newFilings) {
          try {
            const fetchJob = await JobQueueService.addJob({
              jobType: 'ASYNC_FETCH_FILING',
              payload: {
                userId: fullUser.id,
                userEmail: fullUser.email,
                userTier: fullUser.subscriptionTier || 'FREE',
                ticker: {
                  symbol: filing.ticker,
                  companyName: tickers.find(t => t.symbol === filing.ticker)?.companyName,
                  cik: tickers.find(t => t.symbol === filing.ticker)?.cik
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
                  sourceContext: 'discovery',
                  discoveryPhaseCompletedAt: new Date().toISOString()
                }
              },
              priority: fullUser.subscriptionTier === 'PREMIUM' ? 8 :
                       fullUser.subscriptionTier === 'PLUS' ? 6 : 5,
              maxAttempts: 3
            });

            if (fetchJob) {
              totalFetchJobsQueued++;
            }
          } catch (queueError) {
            discoveryLogger.error(`[${executionId}] Failed to queue fetch job`, {
              userId: fullUser.id,
              filingId: filing.id,
              error: queueError instanceof Error ? queueError.message : 'Unknown error'
            });
          }
        }
      } catch (userError) {
        discoveryLogger.error(`[${executionId}] Failed to process user in discovery`, {
          userId: eligibleUser.userId,
          error: userError instanceof Error ? userError.message : 'Unknown error'
        });
      }
    }

    const duration = Date.now() - startTime;

    discoveryLogger.info(`[${executionId}] Discovery phase completed`, {
      eligibleUsers: eligibleUsers.length,
      filingsDiscovered: totalFilingsDiscovered,
      fetchJobsQueued: totalFetchJobsQueued,
      duration,
      averageTimePerUser: Math.round(duration / eligibleUsers.length)
    });

    return {
      success: true,
      filingsDiscovered: totalFilingsDiscovered,
      fetchJobsQueued: totalFetchJobsQueued,
      eligibleUsers: eligibleUsers.length,
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
      duration,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
