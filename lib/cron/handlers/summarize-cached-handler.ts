/**
 * Summarize Cached Handler - Phase 3 of 3-Phase Async Pipeline
 *
 * Purpose: AI-powered summarization using cached content (17-90s target)
 * - Retrieve cached filing content from FilingContentCache
 * - Generate AI summary using OpenRouter
 * - Save summary to database
 * - Send email notification to user
 *
 * This handler fits within Vercel's 180s limit
 */

import { logger } from '../../logging';
import type { JobPayload } from '../../job-queue';
import { generateSummary } from '../../../services/filing/summaryGenerationService';
import type { FetchJobPayload } from './fetch-handler';

const summarizeLogger = logger.child('summarize-cached-handler');

export interface SummarizeJobPayload extends FetchJobPayload {
  cacheId: string;
  executionContext: {
    executionId: string;
    cronTriggerTime: string;
    sourceContext: string;
    discoveryPhaseCompletedAt?: string;
    fetchPhaseCompletedAt?: string;
    cacheHit?: boolean;
  };
}

export interface SummarizeResult {
  success: boolean;
  summaryId?: string;
  cost?: number;
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
  };
  summarizeDuration?: number;
  emailSent: boolean;
  error?: string;
}

/**
 * Phase 3: AI-powered summarization using cached content
 *
 * Controlled duration operation (17-90s) that:
 * 1. Retrieves cached filing content
 * 2. Generates AI summary using OpenRouter
 * 3. Saves summary to database
 * 4. Sends email notification to user
 *
 * Fits within Vercel's 180s function timeout
 */
export async function handleSummarizeCached(
  payload: SummarizeJobPayload
): Promise<SummarizeResult> {
  const startTime = Date.now();
  const { userId, userEmail, userTier, ticker, filing, cacheId, executionContext } = payload;
  const { executionId } = executionContext;

  summarizeLogger.info(`[${executionId}] Starting summarize phase`, {
    userId,
    ticker: ticker.symbol,
    formType: filing.formType,
    accessionNumber: filing.accessionNumber,
    cacheId,
    cacheHit: executionContext.cacheHit
  });

  try {
    const { getPrismaClient } = await import('../../db/prisma');
    const prisma = getPrismaClient();

    // Retrieve cached content
    const cachedContent = await prisma.filingContentCache.findUnique({
      where: { id: cacheId },
      select: {
        content: true,
        contentLength: true,
        status: true,
        fetchError: true
      }
    });

    if (!cachedContent) {
      throw new Error(`Cache not found: ${cacheId}`);
    }

    if (cachedContent.status !== 'CACHED' || !cachedContent.content) {
      throw new Error(`Invalid cache status: ${cachedContent.status}${cachedContent.fetchError ? ` - ${cachedContent.fetchError}` : ''}`);
    }

    summarizeLogger.debug(`[${executionId}] Retrieved cached content`, {
      cacheId,
      contentLength: cachedContent.contentLength
    });

    // Check if summary already exists for this filing+user combination
    const existingSummary = await prisma.summary.findFirst({
      where: {
        userId,
        ticker: ticker.symbol,
        formType: filing.formType,
        accessionNumber: filing.accessionNumber
      },
      select: {
        id: true,
        createdAt: true
      }
    });

    if (existingSummary) {
      summarizeLogger.info(`[${executionId}] Summary already exists`, {
        summaryId: existingSummary.id,
        createdAt: existingSummary.createdAt
      });

      // Summary exists, just send email notification
      try {
        const { sendFilingSummaryEmail } = await import('../../email/notification-service');
        await sendFilingSummaryEmail({
          userEmail,
          summaryId: existingSummary.id,
          ticker: ticker.symbol,
          formType: filing.formType,
          companyName: ticker.companyName || ticker.symbol
        });

        return {
          success: true,
          summaryId: existingSummary.id,
          cost: 0,
          summarizeDuration: 0,
          emailSent: true
        };
      } catch (emailError) {
        summarizeLogger.error(`[${executionId}] Failed to send email for existing summary`, {
          summaryId: existingSummary.id,
          error: emailError instanceof Error ? emailError.message : 'Unknown error'
        });

        return {
          success: true,
          summaryId: existingSummary.id,
          cost: 0,
          summarizeDuration: 0,
          emailSent: false
        };
      }
    }

    // Generate AI summary
    summarizeLogger.debug(`[${executionId}] Generating AI summary`, {
      contentLength: cachedContent.content.length,
      formType: filing.formType
    });

    const summaryResult = await generateSummary(
      cachedContent.content,
      {
        formType: filing.formType,
        filingDate: filing.filingDate,
        accessionNumber: filing.accessionNumber,
        url: filing.filingUrl
      },
      {
        name: ticker.companyName || ticker.symbol,
        ticker: ticker.symbol,
        cik: ticker.cik || ''
      }
    );

    if (!summaryResult.success || !summaryResult.summary) {
      throw new Error(summaryResult.error || 'Failed to generate summary');
    }

    const summarizeDuration = Date.now() - startTime;

    summarizeLogger.info(`[${executionId}] AI summary generated`, {
      summaryLength: summaryResult.summary.length,
      cost: summaryResult.cost,
      inputTokens: summaryResult.inputTokens,
      outputTokens: summaryResult.outputTokens,
      summarizeDuration
    });

    // Save summary to database
    const summary = await prisma.summary.create({
      data: {
        userId,
        ticker: ticker.symbol,
        companyName: ticker.companyName || ticker.symbol,
        formType: filing.formType,
        filingDate: new Date(filing.filingDate),
        accessionNumber: filing.accessionNumber,
        summary: summaryResult.summary,
        modelVersion: summaryResult.modelVersion || 'openrouter/grok-4.1-fast',
        promptVersion: summaryResult.promptVersion || 'v1',
        totalCost: summaryResult.cost || 0,
        inputTokens: summaryResult.inputTokens || 0,
        outputTokens: summaryResult.outputTokens || 0,
        metadata: {
          executionId,
          cacheId,
          cacheHit: executionContext.cacheHit,
          summarizeDuration,
          cronTriggerTime: executionContext.cronTriggerTime,
          sourceContext: executionContext.sourceContext,
          discoveryPhaseCompletedAt: executionContext.discoveryPhaseCompletedAt,
          fetchPhaseCompletedAt: executionContext.fetchPhaseCompletedAt,
          summarizePhaseCompletedAt: new Date().toISOString()
        }
      }
    });

    summarizeLogger.info(`[${executionId}] Summary saved to database`, {
      summaryId: summary.id,
      userId,
      ticker: ticker.symbol,
      formType: filing.formType
    });

    // Send email notification
    let emailSent = false;
    try {
      const { sendFilingSummaryEmail } = await import('../../email/notification-service');
      await sendFilingSummaryEmail({
        userEmail,
        summaryId: summary.id,
        ticker: ticker.symbol,
        formType: filing.formType,
        companyName: ticker.companyName || ticker.symbol
      });

      emailSent = true;
      summarizeLogger.info(`[${executionId}] Email notification sent`, {
        summaryId: summary.id,
        userEmail
      });
    } catch (emailError) {
      summarizeLogger.error(`[${executionId}] Failed to send email notification`, {
        summaryId: summary.id,
        error: emailError instanceof Error ? emailError.message : 'Unknown error'
      });
    }

    // Update user's budget usage
    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          budgetUsed: {
            increment: summaryResult.cost || 0
          },
          lastProcessedAt: new Date()
        }
      });
    } catch (budgetError) {
      summarizeLogger.error(`[${executionId}] Failed to update user budget`, {
        userId,
        cost: summaryResult.cost,
        error: budgetError instanceof Error ? budgetError.message : 'Unknown error'
      });
    }

    const totalDuration = Date.now() - startTime;

    summarizeLogger.info(`[${executionId}] Summarize phase completed`, {
      summaryId: summary.id,
      cost: summaryResult.cost,
      emailSent,
      totalDuration,
      phases: {
        discovery: executionContext.discoveryPhaseCompletedAt,
        fetch: executionContext.fetchPhaseCompletedAt,
        summarize: new Date().toISOString()
      }
    });

    return {
      success: true,
      summaryId: summary.id,
      cost: summaryResult.cost,
      tokenUsage: {
        inputTokens: summaryResult.inputTokens || 0,
        outputTokens: summaryResult.outputTokens || 0
      },
      summarizeDuration: totalDuration,
      emailSent
    };

  } catch (error) {
    const duration = Date.now() - startTime;

    summarizeLogger.error(`[${executionId}] Summarize phase failed`, {
      userId,
      cacheId,
      accessionNumber: filing.accessionNumber,
      error: error instanceof Error ? error.message : 'Unknown error',
      duration
    });

    return {
      success: false,
      summarizeDuration: duration,
      emailSent: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
