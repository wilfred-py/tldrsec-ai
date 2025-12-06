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
// Removed unused import: JobPayload
import { generateAISummary } from '../../../services/filing/summaryGenerationService';
import { sendFilingSummaryEmail } from '../../email/summary-service';
import type { FetchJobPayload } from './fetch-handler';
import { verifyFilingContent, type FilingMetadata } from '../../validation/filing-content-verifier';

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
  const { userId, userEmail, userTier: _userTier, ticker, filing, cacheId, executionContext } = payload;
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

    // STEP 2.5: Verify cached content matches expected filing metadata (Gap 2 fix)
    // This validates cache integrity before expensive AI processing
    const expectedMetadata: FilingMetadata = {
      accessionNumber: filing.accessionNumber,
      cik: ticker.cik || '',
      formType: filing.formType,
      companyName: ticker.companyName || ticker.symbol
    };

    const verificationResult = verifyFilingContent(cachedContent.content, expectedMetadata);

    summarizeLogger.info(`[${executionId}] Cached content verification result`, {
      accessionNumber: filing.accessionNumber,
      isVerified: verificationResult.isVerified,
      confidence: verificationResult.confidence,
      accessionMatches: verificationResult.accessionNumber.matches,
      cikMatches: verificationResult.cik.matches,
      formTypeMatches: verificationResult.formType.matches,
      companyNameSimilarity: verificationResult.companyName.similarity,
      warnings: verificationResult.warnings.length > 0 ? verificationResult.warnings : undefined,
      errors: verificationResult.errors.length > 0 ? verificationResult.errors : undefined
    });

    // Log warning if verification confidence is low, but continue processing
    // (informational only initially as per plan - don't block on low confidence)
    if (!verificationResult.isVerified || verificationResult.confidence < 60) {
      summarizeLogger.warn(`[${executionId}] Cached content verification confidence is low`, {
        accessionNumber: filing.accessionNumber,
        cacheId,
        confidence: verificationResult.confidence,
        isVerified: verificationResult.isVerified,
        errors: verificationResult.errors,
        warnings: verificationResult.warnings,
        extractedMetadata: verificationResult.extractedMetadata,
        action: 'Proceeding with AI summarization despite low confidence (warn only)'
      });
    }

    // Look up the user's ticker ID for this symbol
    const userTicker = await prisma.ticker.findFirst({
      where: {
        userId,
        symbol: ticker.symbol
      },
      select: {
        id: true
      }
    });

    if (!userTicker) {
      throw new Error(`Ticker ${ticker.symbol} not found for user ${userId}`);
    }

    // Check if summary already exists for this filing+user combination
    // Note: Summary model uses tickerId (not userId directly) and filingType (not formType)
    const existingSummary = await prisma.summary.findFirst({
      where: {
        tickerId: userTicker.id,
        filingType: filing.formType,
        filingUrl: filing.filingUrl
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

      // Summary exists, just send email notification using correct signature:
      // sendFilingSummaryEmail(recipientEmail, { companyName, ticker, filingType, filingDate, summary, filingUrl })
      try {
        // Need to fetch the summary text to include in email
        const existingSummaryFull = await prisma.summary.findUnique({
          where: { id: existingSummary.id },
          select: { summaryText: true }
        });

        await sendFilingSummaryEmail(userEmail, {
          companyName: ticker.companyName || ticker.symbol,
          ticker: ticker.symbol,
          filingType: filing.formType,
          filingDate: new Date(filing.filingDate),
          summary: existingSummaryFull?.summaryText || 'Summary available in dashboard',
          filingUrl: filing.filingUrl
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

    // Call generateAISummary with correct SECFiling and Company types
    const summaryResult = await generateAISummary(
      cachedContent.content,
      {
        formType: filing.formType,
        filingDate: typeof filing.filingDate === 'string' ? filing.filingDate : filing.filingDate.toISOString(),
        accessionNumber: filing.accessionNumber,
        filingUrl: filing.filingUrl
      },
      {
        name: ticker.companyName || ticker.symbol,
        ticker: ticker.symbol,
        cik: ticker.cik || ''
      }
    );

    // Check processingStatus (not success) - SummaryGenerationResult uses processingStatus field
    if (summaryResult.processingStatus !== 'SUCCESS' || !summaryResult.summary) {
      throw new Error(summaryResult.error || summaryResult.processingError || 'Failed to generate summary');
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
    // Note: Summary model uses tickerId, filingType, filingUrl, summaryText (not userId, formType, summary)
    const summary = await prisma.summary.create({
      data: {
        tickerId: userTicker.id,
        filingType: filing.formType,
        filingDate: new Date(filing.filingDate),
        filingUrl: filing.filingUrl,
        summaryText: summaryResult.summary,
        summaryJSON: summaryResult.data || null,  // Preserve structured AI response for email templates
        modelVersion: summaryResult.model || 'x-ai/grok-4-fast:free',
        promptVersion: 'v1',
        totalCost: summaryResult.cost || 0,
        inputTokens: summaryResult.inputTokens || 0,
        outputTokens: summaryResult.outputTokens || 0,
        isCacheHit: executionContext.cacheHit || false,
        metadata: {
          executionId,
          cacheId,
          cacheHit: executionContext.cacheHit,
          summarizeDuration,
          cronTriggerTime: executionContext.cronTriggerTime,
          sourceContext: executionContext.sourceContext,
          discoveryPhaseCompletedAt: executionContext.discoveryPhaseCompletedAt,
          fetchPhaseCompletedAt: executionContext.fetchPhaseCompletedAt,
          summarizePhaseCompletedAt: new Date().toISOString(),
          ticker: ticker.symbol,
          companyName: ticker.companyName,
          accessionNumber: filing.accessionNumber,
          userId
        }
      }
    });

    summarizeLogger.info(`[${executionId}] Summary saved to database`, {
      summaryId: summary.id,
      userId,
      ticker: ticker.symbol,
      formType: filing.formType
    });

    // Send email notification using correct signature:
    // sendFilingSummaryEmail(recipientEmail, { companyName, ticker, filingType, filingDate, summary, filingUrl, summaryData })
    let emailSent = false;
    try {
      await sendFilingSummaryEmail(userEmail, {
        companyName: ticker.companyName || ticker.symbol,
        ticker: ticker.symbol,
        filingType: filing.formType,
        filingDate: new Date(filing.filingDate),
        summary: summaryResult.summary,
        filingUrl: filing.filingUrl,
        summaryData: summaryResult.data  // Pass structured AI data to email template
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
    // Note: budgetUsed is stored as Int (in micro-dollars, multiply cost by 1,000,000)
    try {
      const costInMicroDollars = Math.round((summaryResult.cost || 0) * 1000000);
      await prisma.user.update({
        where: { id: userId },
        data: {
          budgetUsed: {
            increment: costInMicroDollars
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
