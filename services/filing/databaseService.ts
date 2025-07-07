import { prisma } from '../../lib/db';
import { logger } from '../../lib/logging';
import { FilingSummaryResult } from './types';

/**
 * Checks if a summary exists in the database for a given filing
 * @param accessionNumber Filing accession number
 * @returns True if a summary exists, false otherwise
 */
export async function checkSummaryExists(accessionNumber: string): Promise<boolean> {
  try {
    const count = await prisma.filingSummary.count({
      where: {
        accessionNumber: accessionNumber
      }
    });
    
    return count > 0;
  } catch (error) {
    logger.error(`Error checking if summary exists: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Gets a summary from the database for a given filing
 * @param accessionNumber Filing accession number
 * @returns Filing summary or null if not found
 */
export async function getSummaryFromDatabase(accessionNumber: string): Promise<FilingSummaryResult | null> {
  try {
    const summary = await prisma.filingSummary.findFirst({
      where: {
        accessionNumber: accessionNumber
      }
    });
    
    if (!summary) {
      return null;
    }
    
    // Parse the JSON fields
    let keyPoints: string[] = [];
    try {
      keyPoints = JSON.parse(summary.keyPoints || '[]');
      // Ensure keyPoints is an array
      if (!Array.isArray(keyPoints)) {
        keyPoints = [];
      }
    } catch (e) {
      logger.warn(`Error parsing keyPoints for ${accessionNumber}: ${e instanceof Error ? e.message : String(e)}`);
    }
    
    // Create the summary result
    const summaryResult: FilingSummaryResult = {
      ticker: summary.ticker || '',
      companyName: summary.companyName || '',
      filingType: summary.filingType || 'UNKNOWN',
      filingDate: summary.filingDate?.toISOString().split('T')[0] || '',
      accessionNumber: summary.accessionNumber,
      summaryText: summary.summaryText || '',
      keyPoints: keyPoints,
      url: summary.url || '',
      filingUrl: summary.filingUrl || '',
      processingStatus: 'completed',
      tokensUsed: summary.tokensUsed || 0,
      inputTokens: summary.inputTokens || 0,
      outputTokens: summary.outputTokens || 0,
      model: summary.model || '',
      cost: summary.cost || 0
    };
    
    return summaryResult;
  } catch (error) {
    logger.error(`Error getting summary from database: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Saves a summary to the database
 * @param summary Filing summary to save
 * @returns True if saved successfully, false otherwise
 */
export async function saveSummaryToDatabase(summary: FilingSummaryResult): Promise<boolean> {
  try {
    // Convert keyPoints to JSON string
    const keyPointsJson = JSON.stringify(summary.keyPoints || []);
    
    // Create or update the summary
    await prisma.filingSummary.upsert({
      where: {
        accessionNumber: summary.accessionNumber
      },
      update: {
        ticker: summary.ticker,
        companyName: summary.companyName,
        filingType: summary.filingType,
        filingDate: summary.filingDate ? new Date(summary.filingDate) : null,
        summaryText: summary.summaryText,
        keyPoints: keyPointsJson,
        url: summary.url,
        filingUrl: summary.filingUrl,
        tokensUsed: summary.tokensUsed || 0,
        inputTokens: summary.inputTokens || 0,
        outputTokens: summary.outputTokens || 0,
        model: summary.model || '',
        cost: summary.cost || 0,
        updatedAt: new Date()
      },
      create: {
        accessionNumber: summary.accessionNumber,
        ticker: summary.ticker,
        companyName: summary.companyName,
        filingType: summary.filingType,
        filingDate: summary.filingDate ? new Date(summary.filingDate) : null,
        summaryText: summary.summaryText,
        keyPoints: keyPointsJson,
        url: summary.url,
        filingUrl: summary.filingUrl,
        tokensUsed: summary.tokensUsed || 0,
        inputTokens: summary.inputTokens || 0,
        outputTokens: summary.outputTokens || 0,
        model: summary.model || '',
        cost: summary.cost || 0
      }
    });
    
    return true;
  } catch (error) {
    logger.error(`Error saving summary to database: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Logs a filing processing attempt
 * @param accessionNumber Filing accession number
 * @param status Processing status
 * @param error Error message if any
 * @returns True if logged successfully, false otherwise
 */
export async function logFilingProcessing(
  accessionNumber: string,
  status: 'success' | 'failure',
  error?: string
): Promise<boolean> {
  try {
    // @ts-expect-error - Prisma doesn't recognize filingLog
    await prisma.filingLog.create({
      data: {
        accessionNumber,
        status,
        error: error || null,
        createdAt: new Date()
      }
    });
    
    return true;
  } catch (error) {
    logger.error(`Error logging filing processing: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}
