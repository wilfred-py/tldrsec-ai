/**
 * Fetch Handler - Phase 2 of 3-Phase Async Pipeline
 *
 * Purpose: Fetch SEC filing content and cache it (60-120s target)
 * - Retrieve complete filing content from SEC EDGAR
 * - Store in FilingContentCache table with 24h TTL
 * - Queue ASYNC_SUMMARIZE_CACHED job for AI processing
 *
 * This handler fits within Vercel's 180s limit
 */

import { logger } from '../../logging';
import { JobQueueService } from '../../job-queue';
import type { JobPayload } from '../../job-queue';
import { createHash } from 'crypto';

const fetchLogger = logger.child('fetch-handler');

export interface FetchJobPayload extends JobPayload {
  userId: string;
  userEmail: string;
  userTier: string;
  ticker: {
    symbol: string;
    companyName?: string;
    cik?: string;
  };
  filing: {
    filingId: string;
    formType: string;
    filingDate: Date | string;
    filingUrl: string;
    accessionNumber: string;
  };
  executionContext: {
    executionId: string;
    cronTriggerTime: string;
    sourceContext: string;
    discoveryPhaseCompletedAt?: string;
  };
}

export interface FetchResult {
  success: boolean;
  cached: boolean;
  cacheId?: string;
  contentLength?: number;
  fetchDuration?: number;
  summarizeJobQueued: boolean;
  error?: string;
}

/**
 * Phase 2: Fetch SEC filing content and cache it
 *
 * Medium duration operation (60-120s) that:
 * 1. Attempts to retrieve content from SEC EDGAR
 * 2. Stores raw content in FilingContentCache with 24h TTL
 * 3. Queues ASYNC_SUMMARIZE_CACHED job for AI processing
 *
 * Fits within Vercel's 180s function timeout
 */
export async function handleFetch(
  payload: FetchJobPayload
): Promise<FetchResult> {
  const startTime = Date.now();
  const { userId, userEmail, userTier, ticker, filing, executionContext } = payload;
  const { executionId } = executionContext;

  fetchLogger.info(`[${executionId}] Starting fetch phase`, {
    userId,
    ticker: ticker.symbol,
    formType: filing.formType,
    accessionNumber: filing.accessionNumber,
    filingUrl: filing.filingUrl
  });

  try {
    const { getPrismaClient } = await import('../../db/prisma');
    const prisma = getPrismaClient();

    // Check if content is already cached and not expired
    const existingCache = await prisma.filingContentCache.findUnique({
      where: { accessionNumber: filing.accessionNumber },
      select: {
        id: true,
        content: true,
        contentLength: true,
        expiresAt: true,
        status: true
      }
    });

    const now = new Date();
    if (existingCache && existingCache.expiresAt > now && existingCache.status === 'CACHED') {
      fetchLogger.info(`[${executionId}] Content already cached`, {
        cacheId: existingCache.id,
        accessionNumber: filing.accessionNumber,
        contentLength: existingCache.contentLength,
        expiresAt: existingCache.expiresAt
      });

      // Queue summarize job immediately
      const summarizeJob = await JobQueueService.addJob({
        jobType: 'ASYNC_SUMMARIZE_CACHED',
        payload: {
          ...payload,
          cacheId: existingCache.id,
          executionContext: {
            ...executionContext,
            fetchPhaseCompletedAt: new Date().toISOString(),
            cacheHit: true
          }
        },
        priority: userTier === 'PREMIUM' ? 9 :
                 userTier === 'PLUS' ? 7 : 5,
        maxAttempts: 3
      });

      return {
        success: true,
        cached: true,
        cacheId: existingCache.id,
        contentLength: existingCache.contentLength,
        fetchDuration: 0,
        summarizeJobQueued: !!summarizeJob
      };
    }

    // Fetch content from SEC EDGAR
    fetchLogger.debug(`[${executionId}] Fetching content from SEC EDGAR`, {
      filingUrl: filing.filingUrl,
      accessionNumber: filing.accessionNumber
    });

    const { attemptFilingRetrieval } = await import('../../../services/filings/filingRetrieval');

    let content: string;
    let fetchError: string | undefined;

    try {
      const retrievalResult = await attemptFilingRetrieval(
        ticker.cik || '',
        filing.accessionNumber,
        filing.formType,
        filing.filingUrl
      );

      if (retrievalResult.success && retrievalResult.content) {
        content = retrievalResult.content;
        fetchLogger.info(`[${executionId}] Content fetched successfully`, {
          accessionNumber: filing.accessionNumber,
          contentLength: content.length,
          fetchDuration: Date.now() - startTime
        });
      } else {
        throw new Error(retrievalResult.error || 'Failed to retrieve filing content');
      }
    } catch (retrievalError) {
      fetchError = retrievalError instanceof Error ? retrievalError.message : 'Unknown retrieval error';
      fetchLogger.error(`[${executionId}] Failed to fetch content`, {
        accessionNumber: filing.accessionNumber,
        error: fetchError,
        fetchDuration: Date.now() - startTime
      });

      // Store error in cache for future reference
      await prisma.filingContentCache.upsert({
        where: { accessionNumber: filing.accessionNumber },
        create: {
          accessionNumber: filing.accessionNumber,
          cik: ticker.cik || '',
          formType: filing.formType,
          content: '',
          contentLength: 0,
          contentHash: '',
          expiresAt: new Date(Date.now() + 1 * 60 * 60 * 1000), // 1 hour for errors
          fetchDuration: Date.now() - startTime,
          fetchError,
          status: 'ERROR'
        },
        update: {
          fetchError,
          fetchDuration: Date.now() - startTime,
          status: 'ERROR',
          expiresAt: new Date(Date.now() + 1 * 60 * 60 * 1000)
        }
      });

      return {
        success: false,
        cached: false,
        fetchDuration: Date.now() - startTime,
        summarizeJobQueued: false,
        error: fetchError
      };
    }

    // Calculate content hash for deduplication
    const contentHash = createHash('sha256').update(content).digest('hex');

    // Store in cache with 24h TTL
    const fetchDuration = Date.now() - startTime;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const cachedContent = await prisma.filingContentCache.upsert({
      where: { accessionNumber: filing.accessionNumber },
      create: {
        accessionNumber: filing.accessionNumber,
        cik: ticker.cik || '',
        formType: filing.formType,
        content,
        contentLength: content.length,
        contentHash,
        expiresAt,
        fetchDuration,
        status: 'CACHED'
      },
      update: {
        content,
        contentLength: content.length,
        contentHash,
        expiresAt,
        fetchDuration,
        fetchError: null,
        status: 'CACHED',
        fetchedAt: new Date()
      }
    });

    fetchLogger.info(`[${executionId}] Content cached successfully`, {
      cacheId: cachedContent.id,
      accessionNumber: filing.accessionNumber,
      contentLength: content.length,
      contentHash: contentHash.substring(0, 16),
      expiresAt,
      fetchDuration
    });

    // Queue ASYNC_SUMMARIZE_CACHED job
    const summarizeJob = await JobQueueService.addJob({
      jobType: 'ASYNC_SUMMARIZE_CACHED',
      payload: {
        ...payload,
        cacheId: cachedContent.id,
        executionContext: {
          ...executionContext,
          fetchPhaseCompletedAt: new Date().toISOString(),
          cacheHit: false
        }
      },
      priority: userTier === 'PREMIUM' ? 9 :
               userTier === 'PLUS' ? 7 : 5,
      maxAttempts: 3
    });

    fetchLogger.info(`[${executionId}] Fetch phase completed`, {
      cacheId: cachedContent.id,
      summarizeJobQueued: !!summarizeJob,
      totalDuration: Date.now() - startTime
    });

    return {
      success: true,
      cached: true,
      cacheId: cachedContent.id,
      contentLength: content.length,
      fetchDuration,
      summarizeJobQueued: !!summarizeJob
    };

  } catch (error) {
    const duration = Date.now() - startTime;

    fetchLogger.error(`[${executionId}] Fetch phase failed`, {
      userId,
      accessionNumber: filing.accessionNumber,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration
    });

    return {
      success: false,
      cached: false,
      fetchDuration: duration,
      summarizeJobQueued: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
