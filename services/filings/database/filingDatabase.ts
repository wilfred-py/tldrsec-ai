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
      url: summaryRecord.filingUrl,
      model: summaryRecord.model || undefined,
      tokensUsed: summaryJSON?.tokensUsed,
      inputTokens: summaryRecord.inputTokens || summaryJSON?.inputTokens,
      outputTokens: summaryRecord.outputTokens || summaryJSON?.outputTokens,
      cost: summaryRecord.totalCost || summaryJSON?.cost,
      processingStatus: summaryRecord.processingStatus || undefined,
      processingTimeMs: summaryJSON?.processingTimeMs,
      failureReason: summaryJSON?.failureReason,
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
 * Stores a filing summary in the database with comprehensive analytics tracking
 * 
 * @param summary The filing summary to store
 * @returns Boolean indicating success or failure
 */
export async function storeSummary(
  ticker: string, 
  formType: string, 
  filingDate: string, 
  filingUrl: string,
  summaryText: string,
  keyPoints: string[],
  metadata: Record<string, any>
): Promise<boolean> {
  try {
    // Find or create the ticker record
    const tickerRecord = await prisma.ticker.findFirst({
      where: {
        symbol: ticker.toUpperCase()
      }
    });
    
    if (!tickerRecord) {
      console.warn(`[WARN][FilingDatabase] Could not store summary in database - ticker record not found for ${ticker}`);
      return false;
    }
    
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
        
        ...(metadata.failureReason ? { processingError: metadata.failureReason } : {})
      }
    });
    
    console.log(`[INFO][FilingDatabase] Successfully stored summary with analytics for ${ticker} - ${formType} (ID: ${summaryRecord.id})`);
    return true;
  } catch (dbError: unknown) {
    // Log the error but don't fail the operation if database storage fails
    console.error(`[ERROR][FilingDatabase] Failed to store summary in database: ${dbError instanceof Error ? dbError.message : 'Unknown error'}`);
    return false;
  }
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
 * Track cache access for analytics - records when a cached summary is accessed
 * 
 * @param summaryId The ID of the summary being accessed
 * @param accessType The type of access (database_query, memory_cache, etc.)
 * @returns Boolean indicating success
 */
export async function trackCacheAccess(summaryId: string, accessType: string): Promise<boolean> {
  try {
    // Update the summary's cache usage count and last accessed time
    await prisma.summary.update({
      where: { id: summaryId },
      data: {
        cacheUsageCount: { increment: 1 },
        lastCacheUsed: new Date()
      }
    });
    
    // Create a detailed cache access record
    await prisma.summaryCacheAccess.create({
      data: {
        summaryId: summaryId,
        accessType: accessType,
        accessedAt: new Date()
      }
    });
    
    console.log(`[DEBUG][FilingDatabase] Cache access tracked for summary ${summaryId} (type: ${accessType})`);
    return true;
  } catch (error) {
    console.error(`[ERROR][FilingDatabase] Failed to track cache access: ${error instanceof Error ? error.message : String(error)}`);
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
