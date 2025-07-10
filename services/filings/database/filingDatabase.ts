import { prisma } from '../../../lib/db';
import { FilingSummaryResult } from '../../filing/types';
import { FilingType } from '../../../types/sec/filing';

/**
 * Checks if a summary exists in the database for a given ticker and form type
 * 
 * @param ticker The company ticker symbol
 * @param formType The SEC form type
 * @returns The existing summary or null if not found
 */
export async function findExistingSummary(ticker: string, formType: string): Promise<FilingSummaryResult | null> {
  try {
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
    
    // Parse the summary JSON
    const summaryJSON = summaryRecord.summaryJSON as any;
    
    // Convert to FilingSummaryResult format
    const result: FilingSummaryResult = {
      ticker: ticker,
      companyName: tickerRecord.name || ticker,
      filingType: formType as FilingType,
      filingDate: summaryRecord.filingDate.toISOString(),
      accessionNumber: summaryJSON.accessionNumber || '',
      summaryText: summaryRecord.summaryText,
      keyPoints: summaryJSON.keyPoints || [],
      url: summaryRecord.filingUrl,
      model: summaryRecord.model,
      tokensUsed: summaryJSON.tokensUsed,
      inputTokens: summaryJSON.inputTokens,
      outputTokens: summaryJSON.outputTokens,
      cost: summaryJSON.cost,
      processingStatus: summaryRecord.processingStatus,
      processingTimeMs: summaryJSON.processingTimeMs,
      failureReason: summaryJSON.failureReason
    };
    
    console.log(`[DEBUG][FilingDatabase] Found existing summary for ${ticker} - ${formType}`);
    return result;
  } catch (error) {
    console.error(`[ERROR][FilingDatabase] Error finding existing summary: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Stores a filing summary in the database
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
    
    // Create a new summary record
    await prisma.summary.create({
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
            ? metadata.content.substring(0, 5000) 
            : null, // Store first 5000 chars of parsed content
          documentType: metadata.documentType || 'unknown',
          documentDescription: metadata.documentDescription || 'unknown',
          rawData: metadata.filingDetails 
            ? JSON.stringify(metadata.filingDetails).substring(0, 5000) 
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
        ...(metadata.failureReason ? { processingError: metadata.failureReason } : {})
      }
    });
    
    console.log(`[INFO][FilingDatabase] Successfully stored summary in database for ${ticker} - ${formType}`);
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
      companyName: log.ticker.name,
      filingType: log.filingType,
      filingDate: log.filingDate,
      createdAt: log.createdAt,
      processingStatus: log.processingStatus,
      model: log.model,
      sentToUser: log.sentToUser,
      sentAt: log.sentAt,
      url: log.filingUrl
    }));
  } catch (error) {
    console.error(`[ERROR][FilingDatabase] Error getting filing logs: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}
