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
import { summarizeFilingWithValidation } from '../../ai/summarize-with-validation';
import { sendFilingSummaryEmail } from '../../email/summary-service';
import type { FetchJobPayload } from './fetch-handler';
import { verifyFilingContent, type FilingMetadata } from '../../validation/filing-content-verifier';
import { shouldProcessFiling } from '../../filing/filing-type-preferences-mapper';
import { TrialService } from '../../auth/trial-service';
import { parseResponse } from '../../ai/parsers/response-parser';
import { CURRENT_FORM4_SCHEMA_VERSION } from '../../email/form4-field-normalizer';
import type { SECFilingType } from '../../ai/prompts/prompt-types';

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
  const executionId = executionContext?.executionId ?? `legacy-${Date.now()}`;

  // Defense-in-depth: fail fast if payload is missing required nested objects
  if (!ticker?.symbol || !filing?.formType) {
    const msg = `Invalid payload: missing ${!ticker?.symbol ? 'ticker.symbol' : 'filing.formType'}. This usually means a job was created with the wrong payload shape.`;
    summarizeLogger.error(`[${executionId}] ${msg}`, { payload: JSON.stringify(payload).slice(0, 500) });
    return { success: false, error: msg, summarizeJobQueued: false };
  }

  summarizeLogger.info(`[${executionId}] Starting summarize phase`, {
    userId,
    ticker: ticker.symbol,
    formType: filing.formType,
    accessionNumber: filing.accessionNumber,
    cacheId,
    cacheHit: executionContext?.cacheHit
  });

  try {
    const { getPrismaClient } = await import('../../db/prisma');
    const prisma = getPrismaClient();

    // Check if user account is soft-deleted — skip processing entirely
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { deletedAt: true },
    });
    if (dbUser?.deletedAt) {
      summarizeLogger.info(`[${executionId}] Skipping deleted user`, { userId });
      return { success: true, emailSent: false };
    }

    // Email delivery gate: check if user's trial is still active
    // Expired trial users don't receive emails (soft block)
    let shouldSendEmail = true;
    try {
      const trialStatus = await TrialService.checkTrialStatus(userId);
      if (!trialStatus.isGrandfathered && !trialStatus.isActive) {
        shouldSendEmail = false;
        summarizeLogger.info(`[${executionId}] Email delivery blocked - trial expired`, {
          userId,
          ticker: ticker.symbol,
          daysRemaining: trialStatus.daysRemaining,
        });
      }
    } catch (trialError) {
      // Fail open - send email if trial check fails
      summarizeLogger.warn(`[${executionId}] Trial check failed, sending email anyway`, {
        userId,
        error: trialError instanceof Error ? trialError.message : 'Unknown error',
      });
    }

    // Retrieve cached content including primaryDocUrl for email links
    const cachedContent = await prisma.filingContentCache.findUnique({
      where: { id: cacheId },
      select: {
        content: true,
        contentLength: true,
        status: true,
        fetchError: true,
        primaryDocUrl: true  // Direct document URL for better email UX
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

    // Look up the user's ticker ID and preferences for this symbol
    const userTicker = await prisma.ticker.findFirst({
      where: {
        userId,
        symbol: ticker.symbol
      },
      select: {
        id: true,
        preferences: true
      }
    });

    if (!userTicker) {
      throw new Error(`Ticker ${ticker.symbol} not found for user ${userId}`);
    }

    // CRITICAL FIX: Check user preferences before creating summary
    // This prevents prospectus emails from bypassing filtering in async pipeline
    const tickerPreferences = userTicker.preferences as Record<string, unknown>;
    if (!shouldProcessFiling(filing.formType, tickerPreferences)) {
      summarizeLogger.info(`[${executionId}] Skipping due to user preferences`, {
        userId,
        ticker: ticker.symbol,
        filingType: filing.formType,
        accessionNumber: filing.accessionNumber,
        reason: 'Filing type disabled in ticker preferences'
      });

      return {
        success: true,
        summaryId: undefined,
        cost: 0,
        summarizeDuration: Date.now() - startTime,
        emailSent: false,
        error: undefined
      };
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
        createdAt: true,
        sentToUser: true,
      }
    });

    if (existingSummary) {
      summarizeLogger.info(`[${executionId}] Summary already exists`, {
        summaryId: existingSummary.id,
        createdAt: existingSummary.createdAt,
        sentToUser: existingSummary.sentToUser,
      });

      // Review Issue 2A: Either sentToUser OR delivery record is sufficient to skip.
      // These are independent guards - don't require both.
      const existingDelivery = await prisma.summaryEmailDelivery.findFirst({
        where: { summaryId: existingSummary.id, userId },
        select: { id: true }
      });

      if (existingSummary.sentToUser || existingDelivery) {
        summarizeLogger.info(`[${executionId}] Email already delivered, skipping`, {
          summaryId: existingSummary.id,
          sentToUser: existingSummary.sentToUser,
          hasDeliveryRecord: !!existingDelivery,
        });
        return {
          success: true,
          summaryId: existingSummary.id,
          cost: 0,
          summarizeDuration: 0,
          emailSent: false
        };
      }

      // Email not yet sent - proceed with sending if trial is active
      if (shouldSendEmail) {
        try {
          // Need to fetch the summary text to include in email
          const existingSummaryFull = await prisma.summary.findUnique({
            where: { id: existingSummary.id },
            select: { summaryText: true, summaryJSON: true }
          });

          await sendFilingSummaryEmail(userEmail, {
            companyName: ticker.companyName || ticker.symbol,
            ticker: ticker.symbol,
            filingType: filing.formType,
            filingDate: new Date(filing.filingDate),
            summary: existingSummaryFull?.summaryText || 'Summary available in dashboard',
            filingUrl: cachedContent.primaryDocUrl || filing.filingUrl,  // Prefer direct document URL
            summaryData: existingSummaryFull?.summaryJSON as Record<string, unknown> | undefined
          });

          // Update email tracking to prevent duplicate sends on next cycle
          try {
            await prisma.summary.update({
              where: { id: existingSummary.id },
              data: {
                sentToUser: true,
                totalEmailsSent: { increment: 1 }
              }
            });

            await prisma.summaryEmailDelivery.create({
              data: {
                summaryId: existingSummary.id,
                userId: userId,
                emailAddress: userEmail,
                deliveryStatus: 'sent'
              }
            });
          } catch (trackingError) {
            // Don't fail the job if tracking update fails - email was still sent
            summarizeLogger.warn(`[${executionId}] Failed to update email tracking for existing summary re-send`, {
              summaryId: existingSummary.id,
              error: trackingError instanceof Error ? trackingError.message : 'Unknown error'
            });
          }

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
      } else {
        // Trial expired - skip email but return success
        return {
          success: true,
          summaryId: existingSummary.id,
          cost: 0,
          summarizeDuration: 0,
          emailSent: false
        };
      }
    }

    // Check if any other user already has a summary for this same filing (shared summary cache)
    // This allows us to reuse AI-generated summaries across users, reducing API costs
    const sharedSummary = await prisma.summary.findFirst({
      where: {
        filingUrl: filing.filingUrl,
        filingType: filing.formType,
        // Ensure we have a valid summary (not a failed one)
        summaryText: { not: '' }
      },
      select: {
        id: true,
        summaryText: true,
        summaryJSON: true,
        modelVersion: true,
        inputTokens: true,
        outputTokens: true,
        totalCost: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'  // Get the most recent one
      }
    });

    if (sharedSummary) {
      summarizeLogger.info(`[${executionId}] Reusing shared summary from another user`, {
        sharedSummaryId: sharedSummary.id,
        userId,
        ticker: ticker.symbol,
        formType: filing.formType
      });

      // Re-normalize stale shared summaries: missing codes, stale field names, or old schema version
      let normalizedJSON = sharedSummary.summaryJSON;
      if (normalizedJSON && typeof normalizedJSON === 'object') {
        const jsonObj = normalizedJSON as Record<string, unknown>;
        const txArr = Array.isArray(jsonObj.transactions) ? jsonObj.transactions as Record<string, unknown>[] : [];
        const hasCodelessTx = txArr.length > 0 && txArr.some(t => !t.code || t.code === '');
        const hasStaleSchema = !jsonObj._schemaVersion || (jsonObj._schemaVersion as number) < CURRENT_FORM4_SCHEMA_VERSION;
        const hasStaleFieldNames = txArr.some(t =>
          'price' in t || 'action' in t || 'shareCount' in t || 'numberOfShares' in t ||
          t.pricePerShare === '' || t.shares === '' || t.shares === 0
        );
        const needsReNormalization = hasCodelessTx || hasStaleFieldNames || hasStaleSchema;
        if (needsReNormalization) {
          summarizeLogger.info(`[${executionId}] Re-normalizing stale shared summary`, {
            sharedSummaryId: sharedSummary.id,
            transactionCount: txArr.length,
            reason: hasCodelessTx ? 'missing-codes' : hasStaleFieldNames ? 'stale-field-names' : 'stale-schema',
            schemaVersion: jsonObj._schemaVersion ?? 'none',
          });
          try {
            const reNormalized = parseResponse(
              JSON.stringify(jsonObj),
              filing.formType as SECFilingType
            );
            if (reNormalized.success && reNormalized.data) {
              normalizedJSON = reNormalized.data as Record<string, unknown>;
            }
          } catch (normalizeError) {
            summarizeLogger.warn(`[${executionId}] Failed to re-normalize shared summary, using original`, {
              error: normalizeError instanceof Error ? normalizeError.message : 'Unknown error'
            });
          }
        }
      }

      // Create a new Summary record for this user using the shared content
      // Wrap in try/catch to handle P2002 unique constraint race condition
      // (two concurrent jobs for same user+filing can both find shared summary)
      let summary;
      try {
        summary = await prisma.summary.create({
          data: {
            tickerId: userTicker.id,
            filingType: filing.formType,
            filingDate: new Date(filing.filingDate),
            filingUrl: filing.filingUrl,
            summaryText: sharedSummary.summaryText,
            summaryJSON: normalizedJSON || null,
            modelVersion: sharedSummary.modelVersion || 'x-ai/grok-4.3',
            promptVersion: 'v1',
            totalCost: 0,  // No additional AI cost for shared summary
            inputTokens: 0,
            outputTokens: 0,
            isCacheHit: true,  // Mark as cache hit
            processingCompletedAt: new Date(), // Fix: Add missing completion timestamp
            processingTimeMs: 0,  // Cached summary - no AI processing time
            metadata: {
              executionId,
              cacheId,
              cacheHit: true,
              summarizeDuration: 0,
              cronTriggerTime: executionContext?.cronTriggerTime,
              sourceContext: executionContext?.sourceContext,
              discoveryPhaseCompletedAt: executionContext?.discoveryPhaseCompletedAt,
              fetchPhaseCompletedAt: executionContext?.fetchPhaseCompletedAt,
              summarizePhaseCompletedAt: new Date().toISOString(),
              ticker: ticker.symbol,
              companyName: ticker.companyName,
              accessionNumber: filing.accessionNumber,
              userId,
              sharedFromSummaryId: sharedSummary.id,
              sharedFromCreatedAt: sharedSummary.createdAt.toISOString(),
              originalCost: sharedSummary.totalCost,
              originalInputTokens: sharedSummary.inputTokens,
              originalOutputTokens: sharedSummary.outputTokens
            }
          }
        });
      } catch (createError) {
        // Handle P2002 unique constraint violation (race condition)
        if ((createError as { code?: string }).code === 'P2002') {
          summarizeLogger.info(`[${executionId}] Summary already created by concurrent job (P2002)`, {
            userId,
            ticker: ticker.symbol,
            filingUrl: filing.filingUrl
          });

          // Re-read the existing summary created by the other job
          const raceSummary = await prisma.summary.findFirst({
            where: {
              tickerId: userTicker.id,
              filingUrl: filing.filingUrl,
              filingType: filing.formType
            },
            select: { id: true, sentToUser: true }
          });

          if (raceSummary) {
            // Check if email was already sent by the winning job
            const raceDelivery = await prisma.summaryEmailDelivery.findFirst({
              where: { summaryId: raceSummary.id, userId },
              select: { id: true }
            });

            if (raceSummary.sentToUser || raceDelivery) {
              return {
                success: true,
                summaryId: raceSummary.id,
                cost: 0,
                summarizeDuration: Date.now() - startTime,
                emailSent: false
              };
            }
          }

          // If no summary found or email not sent, return success without email
          // (the winning job will handle email delivery)
          return {
            success: true,
            summaryId: raceSummary?.id,
            cost: 0,
            summarizeDuration: Date.now() - startTime,
            emailSent: false
          };
        }
        // Re-throw non-P2002 errors
        throw createError;
      }

      summarizeLogger.info(`[${executionId}] Shared summary saved for user`, {
        summaryId: summary.id,
        userId,
        ticker: ticker.symbol,
        sharedFromSummaryId: sharedSummary.id,
        costSaved: sharedSummary.totalCost
      });

      // Send email notification (gated by trial status)
      let emailSent = false;
      if (shouldSendEmail) {
        try {
          await sendFilingSummaryEmail(userEmail, {
            companyName: ticker.companyName || ticker.symbol,
            ticker: ticker.symbol,
            filingType: filing.formType,
            filingDate: new Date(filing.filingDate),
            summary: sharedSummary.summaryText,
            filingUrl: cachedContent.primaryDocUrl || filing.filingUrl,  // Prefer direct document URL
            summaryData: normalizedJSON as Record<string, unknown> | undefined
          });

          emailSent = true;
          summarizeLogger.info(`[${executionId}] Email notification sent for shared summary`, {
            summaryId: summary.id,
            userEmail
          });

          // Update email tracking
          try {
            await prisma.summary.update({
              where: { id: summary.id },
              data: {
                sentToUser: true,
                totalEmailsSent: { increment: 1 }
              }
            });

            await prisma.summaryEmailDelivery.create({
              data: {
                summaryId: summary.id,
                userId: userId,
                emailAddress: userEmail,
                deliveryStatus: 'sent'
              }
            });
          } catch (trackingError) {
            summarizeLogger.warn(`[${executionId}] Failed to update email tracking for shared summary`, {
              summaryId: summary.id,
              error: trackingError instanceof Error ? trackingError.message : 'Unknown error'
            });
          }
        } catch (emailError) {
          summarizeLogger.error(`[${executionId}] Failed to send email for shared summary`, {
            summaryId: summary.id,
            error: emailError instanceof Error ? emailError.message : 'Unknown error'
          });
        }
      }

      return {
        success: true,
        summaryId: summary.id,
        cost: 0,
        tokenUsage: {
          inputTokens: 0,
          outputTokens: 0
        },
        summarizeDuration: Date.now() - startTime,
        emailSent,
        metadata: {
          shared: true,
          sharedFromSummaryId: sharedSummary.id,
          costSaved: sharedSummary.totalCost
        }
      };
    }

    // No shared summary found - generate AI summary
    summarizeLogger.debug(`[${executionId}] Generating AI summary (no shared summary available)`, {
      contentLength: cachedContent.content.length,
      formType: filing.formType
    });

    // Call summarizeFilingWithValidation for AI summary + extractor enrichment
    const summaryResult = await summarizeFilingWithValidation(
      cachedContent.content,
      {
        formType: filing.formType,
        metadata: {
          ticker: ticker.symbol,
          companyName: ticker.companyName || ticker.symbol,
          formType: filing.formType,
          filingDate: typeof filing.filingDate === 'string' ? filing.filingDate : filing.filingDate.toISOString(),
          accessionNumber: filing.accessionNumber,
          cik: ticker.cik || undefined
        }
      }
    );

    // summarizeFiling throws SummarizationError on failure, so if we reach here, it succeeded
    if (!summaryResult.summaryText) {
      throw new Error('Failed to generate summary: summaryText is empty');
    }

    const summarizeDuration = Date.now() - startTime;

    summarizeLogger.info(`[${executionId}] AI summary generated`, {
      summaryLength: summaryResult.summaryText.length,
      cost: summaryResult.cost,
      tokensUsed: summaryResult.tokensUsed,
      model: summaryResult.modelUsed,
      summarizeDuration
    });

    // Log extractor validation results
    if ('extractorValidated' in summaryResult) {
      summarizeLogger.info(`[${executionId}] Extractor validation`, {
        extractorValidated: summaryResult.extractorValidated,
        fieldsFilledByExtractor: summaryResult.fieldsFilledByExtractor,
        fieldsWithDiscrepancies: summaryResult.fieldsWithDiscrepancies,
        extractorFillRate: summaryResult.extractorFillRate,
      });
    }

    // Extract importance score and smart subject from AI response
    const summaryData = summaryResult.summaryJSON as Record<string, unknown> | null;
    const importance = (summaryData && typeof summaryData.importanceScore === 'string')
      ? summaryData.importanceScore
      : 'medium';

    // Generate smart email subject line
    const { EmailSubjectService } = await import('../../email/subject-service');
    const smartSubject = EmailSubjectService.generateSmartSubject(
      summaryData,
      {
        filingType: filing.formType,
        companyName: ticker.companyName || ticker.symbol,
        ticker: ticker.symbol
      }
    );

    // Save summary to database
    // Note: Summary model uses tickerId, filingType, filingUrl, summaryText (not userId, formType, summary)
    const summary = await prisma.summary.create({
      data: {
        tickerId: userTicker.id,
        filingType: filing.formType,
        filingDate: new Date(filing.filingDate),
        filingUrl: filing.filingUrl,
        summaryText: summaryResult.summaryText,
        summaryJSON: summaryResult.summaryJSON || null,  // Preserve structured AI response for email templates
        importance,
        smartSubject,
        modelVersion: summaryResult.modelUsed || 'x-ai/grok-4.3',
        promptVersion: 'v1',
        totalCost: summaryResult.cost || 0,
        inputTokens: summaryResult.inputTokens || 0,
        outputTokens: summaryResult.outputTokens || 0,
        isCacheHit: executionContext?.cacheHit || false,
        processingCompletedAt: new Date(), // Fix: Add missing completion timestamp
        processingTimeMs: summarizeDuration,  // AI processing duration in ms
        metadata: {
          executionId,
          cacheId,
          cacheHit: executionContext?.cacheHit,
          summarizeDuration,
          cronTriggerTime: executionContext?.cronTriggerTime,
          sourceContext: executionContext?.sourceContext,
          discoveryPhaseCompletedAt: executionContext?.discoveryPhaseCompletedAt,
          fetchPhaseCompletedAt: executionContext?.fetchPhaseCompletedAt,
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

    // Send email notification (gated by trial status)
    let emailSent = false;
    if (shouldSendEmail) {
      try {
        // Debug: log summaryData shape to diagnose template rendering issues
        const summaryJSON = summaryResult.summaryJSON as Record<string, unknown> | null;
        if (summaryJSON && ['3', '4', '144'].includes(filing.formType)) {
          summarizeLogger.debug(`[${executionId}] Insider filing summaryData shape`, {
            ticker: ticker.symbol,
            formType: filing.formType,
            hasFilerName: !!summaryJSON.filerName,
            hasFilerRole: !!summaryJSON.filerRole,
            hasTransactions: Array.isArray(summaryJSON.transactions),
            transactionCount: Array.isArray(summaryJSON.transactions) ? (summaryJSON.transactions as unknown[]).length : 0,
            hasPercentageChange: !!summaryJSON.percentageChange,
            fields: Object.keys(summaryJSON).join(', '),
          });
        }

        await sendFilingSummaryEmail(userEmail, {
          companyName: ticker.companyName || ticker.symbol,
          ticker: ticker.symbol,
          filingType: filing.formType,
          filingDate: new Date(filing.filingDate),
          summary: summaryResult.summaryText,
          filingUrl: cachedContent.primaryDocUrl || filing.filingUrl,  // Prefer direct document URL
          summaryData: summaryResult.summaryJSON as Record<string, unknown> | undefined,  // Pass structured AI data to email template
          userId,
          summaryId: summary.id,
          importance,
          smartSubject,
        });

        emailSent = true;
        summarizeLogger.info(`[${executionId}] Email notification sent`, {
          summaryId: summary.id,
          userEmail
        });

        // Update Summary record to reflect email was sent
        try {
          await prisma.summary.update({
            where: { id: summary.id },
            data: {
              sentToUser: true,
              totalEmailsSent: { increment: 1 }
            }
          });

          // Create SummaryEmailDelivery record for tracking
          await prisma.summaryEmailDelivery.create({
            data: {
              summaryId: summary.id,
              userId: userId,
              emailAddress: userEmail,
              deliveryStatus: 'sent'
            }
          });

          summarizeLogger.debug(`[${executionId}] Email tracking records updated`, {
            summaryId: summary.id,
            userId
          });
        } catch (trackingError) {
          // Don't fail the job if tracking update fails - email was still sent
          summarizeLogger.warn(`[${executionId}] Failed to update email tracking records`, {
            summaryId: summary.id,
            userId,
            error: trackingError instanceof Error ? trackingError.message : 'Unknown error'
          });
        }
      } catch (emailError) {
        summarizeLogger.error(`[${executionId}] Failed to send email notification`, {
          summaryId: summary.id,
          error: emailError instanceof Error ? emailError.message : 'Unknown error'
        });
      }
    }

    // Update lastProcessedAt and increment hours saved
    // Hours saved estimates per filing type (in minutes)
    const HOURS_SAVED_MINUTES: Record<string, number> = {
      '10-K': 240, '10-Q': 120, '8-K': 60,
      '4': 30, 'Form 4': 30, '144': 30, 'Form 144': 30,
      'SC 13G': 60, 'SC 13D': 60, 'DEF 14A': 90,
      'S-1': 120, 'S-3': 60, '424B2': 60, '11-K': 60
    };
    const minutesSaved = HOURS_SAVED_MINUTES[filing.formType] || 60;

    try {
      await prisma.user.update({
        where: { id: userId },
        data: {
          lastProcessedAt: new Date(),
          hoursSavedThisMonth: { increment: minutesSaved },
          hoursSavedTotal: { increment: minutesSaved }
        }
      });
    } catch (updateError) {
      summarizeLogger.error(`[${executionId}] Failed to update lastProcessedAt`, {
        userId,
        error: updateError instanceof Error ? updateError.message : 'Unknown error'
      });
    }

    const totalDuration = Date.now() - startTime;

    summarizeLogger.info(`[${executionId}] Summarize phase completed`, {
      summaryId: summary.id,
      cost: summaryResult.cost,
      emailSent,
      totalDuration,
      phases: {
        discovery: executionContext?.discoveryPhaseCompletedAt,
        fetch: executionContext?.fetchPhaseCompletedAt,
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
