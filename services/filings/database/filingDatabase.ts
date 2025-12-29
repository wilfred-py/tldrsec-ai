import { prisma } from '../../../lib/db';
import { FilingSummaryResult } from '../../filing/types';
import { FilingType } from '../../../types/sec/filing';

/**
 * Checks if a summary exists in the database for a given ticker and form type
 * 
 * @param ticker The company ticker symbol
 * @param formType The SEC form type
 * @param bypassCache If true, ignores cached summaries and forces fresh generation
 * @returns The existing summary or null if not found
 */
export async function findExistingSummary(ticker: string, formType: string, bypassCache: boolean = false): Promise<FilingSummaryResult | null> {
  try {
    // Check if we should bypass cache for fresh summaries
    if (bypassCache || process.env.FORCE_FRESH_SUMMARIES === 'true') {
      console.log(`[DEBUG][FilingDatabase] 🚫 Bypassing cache for fresh summary: ${ticker} - ${formType} (bypassCache=${bypassCache}, FORCE_FRESH_SUMMARIES=${process.env.FORCE_FRESH_SUMMARIES})`);
      return null; // Force fresh API call and summary generation
    }

    // Find the ticker record
    const tickerRecord = await prisma.ticker.findFirst({
      where: {
        symbol: ticker.toUpperCase()
      }
    });
    
    if (!tickerRecord) {
      console.log(`[DEBUG][FilingDatabase] No ticker record found for ${ticker}`);
      return null;
    }
    
    // Find the most recent summary for this ticker and form type
    const summaryRecord = await prisma.summary.findFirst({
      where: {
        tickerId: tickerRecord.id,
        filingType: formType,
        // Only consider recent summaries (last 7 days)
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });
    
    if (!summaryRecord) {
      console.log(`[DEBUG][FilingDatabase] No recent summary found for ${ticker} - ${formType}`);
      return null;
    }
    
    // Track cache access and update usage analytics
    if (summaryRecord.id) {
      await trackCacheAccess(summaryRecord.id, 'database_query');
    }
    
    // Parse the summary JSON
    const summaryJSON = summaryRecord.summaryJSON as any;
    
    // Convert to FilingSummaryResult format with enhanced data
    const result: FilingSummaryResult = {
      ticker: ticker,
      companyName: tickerRecord.companyName || ticker,
      filingType: formType as FilingType,
      filingDate: summaryRecord.filingDate.toISOString(),
      accessionNumber: summaryJSON?.accessionNumber || '',
      summaryText: summaryRecord.summaryText || '',
      keyPoints: summaryJSON?.keyPoints || [],
      url: summaryRecord.url || summaryRecord.filingUrl, // Prefer primaryDocUrl (stored in url) for direct document links
      model: summaryRecord.model || undefined,
      tokensUsed: summaryJSON?.tokensUsed,
      inputTokens: summaryRecord.inputTokens || summaryJSON?.inputTokens,
      outputTokens: summaryRecord.outputTokens || summaryJSON?.outputTokens,
      cost: summaryRecord.totalCost || summaryJSON?.cost,
      processingStatus: summaryRecord.processingStatus || undefined,
      processingTimeMs: summaryJSON?.processingTimeMs,
      failureReason: summaryJSON?.failureReason,
      // Database ID for email delivery tracking - added 2025-12-26
      databaseId: summaryRecord.id,
      // Cache analytics metadata
      isCacheHit: true,
      cacheUsageCount: summaryRecord.cacheUsageCount || 0,
      qualityScore: summaryRecord.qualityScore
    };
    
    console.log(`[DEBUG][FilingDatabase] Found existing summary for ${ticker} - ${formType} (cache usage: ${summaryRecord.cacheUsageCount || 0})`);
    return result;
  } catch (error) {
    console.error(`[ERROR][FilingDatabase] Error finding existing summary: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Result of storing a summary for multiple users
 */
export interface StoreSummaryResult {
  /** Number of summaries successfully stored */
  stored: number;
  /** Total number of users tracking this ticker */
  total: number;
  /** Error messages for failed stores */
  errors: string[];
  /** IDs of created summary records - used for email delivery tracking */
  summaryIds: string[];
}

/**
 * Options for storing a summary
 * Used to mark test data and track data provenance
 */
export interface StoreSummaryOptions {
  /** If true, marks this summary as test data in metadata */
  isTestData?: boolean;
  /** Source identifier for test data (e.g., 'e2e-test', 'unit-test') */
  testSource?: string;
}

/**
 * Stores a filing summary in the database with comprehensive analytics tracking
 *
 * IMPORTANT: This function stores summaries for ALL users who track the given ticker.
 * Prior to 2025-12-24, this used findFirst() which only stored for the first user found.
 * The fix uses findMany() to ensure all users receive their summaries.
 *
 * @param ticker The ticker symbol (e.g., 'NVDA')
 * @param formType The SEC form type (e.g., '10-K')
 * @param filingDate The filing date
 * @param filingUrl The SEC filing URL
 * @param summaryText The generated summary text
 * @param keyPoints Array of key points from the filing
 * @param metadata Additional metadata including cost/token tracking
 * @param options Optional settings for test data marking
 * @returns StoreSummaryResult with counts of stored/total and any errors
 */
export async function storeSummary(
  ticker: string,
  formType: string,
  filingDate: string,
  filingUrl: string,
  summaryText: string,
  keyPoints: string[],
  metadata: Record<string, any>,
  options?: StoreSummaryOptions
): Promise<StoreSummaryResult> {
  const result: StoreSummaryResult = { stored: 0, total: 0, errors: [], summaryIds: [] };

  try {
    // FIX (2025-12-24): Use findMany() to get ALL users' ticker records, not just the first
    // This ensures summaries are stored for every user tracking this symbol
    const tickerRecords = await prisma.ticker.findMany({
      where: {
        symbol: ticker.toUpperCase()
      }
    });

    if (tickerRecords.length === 0) {
      console.warn(`[WARN][FilingDatabase] Could not store summary in database - no ticker records found for ${ticker}`);
      return result;
    }

    result.total = tickerRecords.length;
    console.log(`[INFO][FilingDatabase] Found ${tickerRecords.length} users tracking ${ticker} - storing summary for all`);

    // Store summary for EACH user's ticker
    for (const tickerRecord of tickerRecords) {
      try {
        const summaryId = await storeSummaryForTicker(tickerRecord, formType, filingDate, filingUrl, summaryText, keyPoints, metadata, options);
        result.stored++;
        result.summaryIds.push(summaryId);
        console.log(`[INFO][FilingDatabase] Stored summary for ${ticker} - user ticker ID: ${tickerRecord.id}, summary ID: ${summaryId}`);
      } catch (userError) {
        const errorMsg = `${tickerRecord.id}: ${userError instanceof Error ? userError.message : 'Unknown error'}`;
        result.errors.push(errorMsg);
        console.error(`[ERROR][FilingDatabase] Failed to store summary for ticker ${tickerRecord.id}: ${errorMsg}`);
      }
    }

    console.log(`[INFO][FilingDatabase] Summary storage complete for ${ticker}: ${result.stored}/${result.total} succeeded`);
    return result;
  } catch (dbError: unknown) {
    console.error(`[ERROR][FilingDatabase] Failed to query ticker records: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
    result.errors.push(dbError instanceof Error ? dbError.message : 'Unknown error');
    return result;
  }
}

/**
 * Stores a summary for a single ticker record (internal helper)
 * @returns The ID of the created summary record
 */
async function storeSummaryForTicker(
  tickerRecord: { id: string; companyName: string | null },
  formType: string,
  filingDate: string,
  filingUrl: string,
  summaryText: string,
  keyPoints: string[],
  metadata: Record<string, any>,
  options?: StoreSummaryOptions
): Promise<string> {
  // Calculate cost per token from metadata if available
  const inputTokens = metadata.inputTokens || 0;
  const outputTokens = metadata.outputTokens || 0;
  const totalCost = metadata.cost || 0;

  const inputCostPerToken = inputTokens > 0 && totalCost > 0
    ? (totalCost * 0.6) / inputTokens // Assume 60% of cost is input tokens (approximate)
    : null;
  const outputCostPerToken = outputTokens > 0 && totalCost > 0
    ? (totalCost * 0.4) / outputTokens // Assume 40% of cost is output tokens (approximate)
    : null;

  // Create a new summary record with enhanced analytics
  const summaryRecord = await prisma.summary.create({
    data: {
      tickerId: tickerRecord.id,
      filingType: formType,
      filingDate: new Date(filingDate),
      filingUrl: filingUrl,
      url: metadata.primaryDocUrl || null, // Store the actual document URL for direct links
      summaryText: summaryText,
      summaryJSON: {
        accessionNumber: metadata.accessionNumber || '',
        keyPoints: keyPoints,
        // Include detailed data for better caching
        parsedContent: metadata.content && typeof metadata.content === 'string'
          ? metadata.content
          : null, // Store full parsed content
        documentType: metadata.documentType || 'unknown',
        documentDescription: metadata.documentDescription || 'unknown',
        rawData: metadata.filingDetails
          ? JSON.stringify(metadata.filingDetails)
          : null,
        generatedAt: new Date().toISOString(),
        tokensUsed: metadata.tokensUsed,
        inputTokens: metadata.inputTokens,
        outputTokens: metadata.outputTokens,
        cost: metadata.cost,
        processingTimeMs: metadata.processingTimeMs,
        ...(metadata.failureReason ? { failureReason: metadata.failureReason } : {})
      },
      sentToUser: false, // Will be marked as sent when included in an email
      model: metadata.model || 'unknown',
      processingStatus: metadata.failureReason ? 'FAILED' : 'COMPLETED',

      // Enhanced Cost and Token Tracking
      inputTokens: inputTokens,
      outputTokens: outputTokens,
      inputCostPerToken: inputCostPerToken,
      outputCostPerToken: outputCostPerToken,
      totalCost: totalCost,

      // Cache and Reuse Analytics (new summary is not a cache hit)
      isCacheHit: false,
      cacheUsageCount: 0,
      lastCacheUsed: null,
      cacheVersion: metadata.cacheVersion || '1.0',

      // Performance and Quality Metrics
      qualityScore: metadata.qualityScore || null,
      confidenceLevel: metadata.confidenceLevel || null,
      extractionSuccess: metadata.extractionSuccess || true,
      parsingErrors: metadata.parsingErrors || 0,

      ...(metadata.failureReason ? { processingError: metadata.failureReason } : {}),

      // Test data markers - added 2025-12-26 for data integrity
      // When isTestData is true, add metadata to distinguish test from production data
      ...(options?.isTestData ? {
        metadata: {
          source: options.testSource || 'test',
          isTestData: true,
          createdAt: new Date().toISOString()
        }
      } : {})
    }
  });

  console.log(`[DEBUG][FilingDatabase] Created summary ${summaryRecord.id} for ticker ${tickerRecord.id}`);
  return summaryRecord.id;
}

/**
 * Gets filing logs from the database
 * 
 * @param limit Maximum number of logs to return
 * @returns Array of filing logs
 */
export async function getFilingLogs(limit: number = 100): Promise<any[]> {
  try {
    const logs = await prisma.summary.findMany({
      take: limit,
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        ticker: true
      }
    });
    
    return logs.map(log => ({
      id: log.id,
      ticker: log.ticker.symbol,
      companyName: log.ticker.companyName || log.ticker.symbol,
      filingType: log.filingType,
      filingDate: log.filingDate,
      createdAt: log.createdAt?.toISOString() || null,
      processingStatus: log.processingStatus,
      model: log.model,
      sentToUser: log.sentToUser,
      url: log.filingUrl
    }));
  } catch (error) {
    console.error(`[ERROR][FilingDatabase] Error getting filing logs: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * Track cache access analytics - records when a summary is retrieved from cache
 * Enhanced with security validation and privacy consent checking
 * 
 * @param summaryId The ID of the summary being accessed
 * @param accessType The type of access (EMAIL, API, DASHBOARD, SYSTEM, CRON)
 * @param userId Optional user ID for user-specific tracking (requires consent)
 * @returns Boolean indicating success
 */
export async function trackCacheAccess(summaryId: string, accessType: string, userId?: string): Promise<boolean> {
  try {
    // Import security and privacy modules dynamically to avoid circular dependencies
    const { validateCacheAccessParams, sanitizeForLogging } = await import('@/lib/security/validation');
    const { PrivacyConsentService } = await import('@/lib/privacy/consent-service');
    
    // Safe logging function that works in both server and client contexts
    const safeLog = {
      debug: (message: string, data?: any) => {
        if (typeof window === 'undefined') {
          // Server-side: use console for now to avoid server-only imports
          console.log(`[DEBUG] ${message}`, data);
        }
      },
      warn: (message: string, data?: any) => {
        if (typeof window === 'undefined') {
          console.warn(`[WARN] ${message}`, data);
        }
      },
      error: (message: string, data?: any) => {
        if (typeof window === 'undefined') {
          console.error(`[ERROR] ${message}`, data);
        }
      }
    };

    // SECURITY: Validate all input parameters
    validateCacheAccessParams({ summaryId, accessType, userId });

    // SECURITY: If userId is provided, check authorization and consent
    let shouldTrackUserSpecificData = false;
    
    if (userId) {
      try {
        // NOTE: Authorization (checkSummaryAccess) should be handled at the API level
        // to avoid server-only imports in shared modules
        
        // Check if user has consented to analytics tracking
        const consentResult = await PrivacyConsentService.checkAnalyticsConsent(userId);
        
        if (consentResult.hasConsent) {
          shouldTrackUserSpecificData = true;
          safeLog.debug('User analytics tracking enabled with consent', {
            summaryId: sanitizeForLogging(summaryId),
            userId: sanitizeForLogging(userId),
            accessType
          });
        } else {
          safeLog.debug('User analytics tracking skipped - no consent or opted out', {
            summaryId: sanitizeForLogging(summaryId),
            userId: sanitizeForLogging(userId),
            accessType,
            reason: consentResult.error || 'no_consent'
          });
        }
      } catch (consentError) {
        // If consent check fails, log the attempt but don't track user data
        safeLog.warn('Cache access consent check failed', {
          error: consentError instanceof Error ? consentError.message : 'Unknown error',
          summaryId: sanitizeForLogging(summaryId),
          userId: sanitizeForLogging(userId),
          accessType
        });
        
        // Still allow the cache tracking to succeed for system metrics,
        // but don't create user-specific records
        shouldTrackUserSpecificData = false;
      }
    }

    // Always update the summary's cache usage count (system-level metrics)
    await prisma.summary.update({
      where: { id: summaryId },
      data: {
        cacheUsageCount: { increment: 1 },
        lastCacheUsed: new Date()
      }
    });

    // Create detailed user-specific cache access record only with proper authorization and consent
    if (userId && shouldTrackUserSpecificData) {
      try {
        await prisma.summaryCacheAccess.create({
          data: {
            summaryId,
            userId,
            accessType: accessType.toUpperCase(),
            accessedAt: new Date()
          }
        });
        
        safeLog.debug('User-specific cache access recorded', {
          summaryId: sanitizeForLogging(summaryId),
          userId: sanitizeForLogging(userId),
          accessType
        });
      } catch (userTrackingError) {
        // Don't fail the entire operation if user tracking fails
        safeLog.warn('User-specific cache tracking failed', {
          error: userTrackingError instanceof Error ? userTrackingError.message : 'Unknown error',
          summaryId: sanitizeForLogging(summaryId),
          userId: sanitizeForLogging(userId),
          accessType
        });
      }
    }

    safeLog.debug('Cache access tracked successfully', {
      summaryId: sanitizeForLogging(summaryId),
      accessType,
      hasUserId: !!userId,
      userTrackingEnabled: shouldTrackUserSpecificData
    });

    return true;
    
  } catch (error) {
    // Safe error logging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const logData = {
      error: errorMessage,
      summaryId: summaryId || 'undefined',
      accessType: accessType || 'undefined',
      hasUserId: !!userId
    };
    
    if (typeof window === 'undefined') {
      console.error('[ERROR] Cache access tracking failed', logData);
    }
    
    // Return false to indicate tracking failure, but don't throw
    // This allows the calling code to continue even if analytics fail
    return false;
  }
}

/**
 * Track email delivery for analytics - records when a summary is included in an email
 * 
 * @param summaryId The ID of the summary being delivered
 * @param userEmail The email address of the recipient
 * @param deliveryType The type of delivery (individual, digest, etc.)
 * @returns Boolean indicating success
 */
export async function trackEmailDelivery(summaryId: string, userEmail: string, deliveryType: string = 'individual'): Promise<boolean> {
  try {
    // Create an email delivery record
    await prisma.summaryEmailDelivery.create({
      data: {
        summaryId: summaryId,
        userEmail: userEmail,
        deliveryType: deliveryType,
        deliveredAt: new Date(),
        deliverySuccess: true
      }
    });
    
    // Update the summary to mark it as sent to user if not already
    await prisma.summary.update({
      where: { id: summaryId },
      data: {
        sentToUser: true,
        emailDeliveryCount: { increment: 1 },
        lastEmailDelivered: new Date()
      }
    });
    
    console.log(`[DEBUG][FilingDatabase] Email delivery tracked for summary ${summaryId} to ${userEmail}`);
    return true;
  } catch (error) {
    console.error(`[ERROR][FilingDatabase] Failed to track email delivery: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
