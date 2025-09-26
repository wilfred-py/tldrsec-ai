/**
 * Database Utilities Module
 * 
 * Handles database operations for summarization results
 */

import { prisma } from '../../db/prisma';
import { logger } from '../../logging';
import { monitoring } from '../../monitoring';
// import { SummarizationResult } from '../summarize'; // Currently unused
// import { EnhancedSummarizationResult } from './types'; // Currently unused

// Component logger
const componentLogger = logger.child('db-utils');

/**
 * Update summary record with partial result
 * 
 * @param summaryId Summary ID
 * @param result Partial summarization result
 */
export async function updateSummaryWithPartialResult(
  summaryId: string,
  result: Partial<SummarizationResult>
): Promise<void> {
  try {
    const startTime = Date.now();
    
    // Extract fields to update
    const {
      summaryText,
      summaryJSON,
      modelUsed,
      inputTokens,
      // outputTokens not used - not in database schema
      cost,
      duration,
      isPartial = true
    } = result;
    
    // Update summary record
    await prisma.summary.update({
      where: { id: summaryId },
      data: {
        processingStatus: 'PROCESSING',
        summaryText: summaryText || undefined,
        summaryJSON: summaryJSON ? JSON.stringify(summaryJSON) : undefined,
        model: modelUsed || undefined,
        tokensUsed: inputTokens || undefined,
        // outputTokens is not in the schema
        cost: cost || undefined,
        processingTimeMs: duration || undefined,
        isPartialResult: isPartial
        // updatedAt is handled automatically by Prisma
      }
    });
    
    componentLogger.debug(`Updated summary ${summaryId} with partial result in ${Date.now() - startTime}ms`);
    monitoring.recordTiming('db.update_summary_partial', Date.now() - startTime);
  } catch (error) {
    componentLogger.error(`Error updating summary ${summaryId} with partial result: ${error instanceof Error ? error.message : String(error)}`);
    monitoring.incrementCounter('db.update_summary_error', 1);
    // Don't throw the error - we don't want to fail the entire process due to a DB update issue
  }
}

/**
 * Update summary record with final result
 * 
 * @param summaryId Summary ID
 * @param result Final summarization result
 */
export async function updateSummaryWithResult(
  summaryId: string,
  result: SummarizationResult
): Promise<void> {
  try {
    const startTime = Date.now();
    
    // Extract fields to update
    const {
      summaryText,
      summaryJSON,
      modelUsed,
      inputTokens,
      // outputTokens not used - not in database schema
      cost,
      duration,
      isPartial = false,
      parsingErrors
    } = result;
    
    // Update summary record
    await prisma.summary.update({
      where: { id: summaryId },
      data: {
        processingStatus: parsingErrors || isPartial ? 'ERROR' : 'COMPLETED',
        summaryText: summaryText || undefined,
        summaryJSON: summaryJSON ? JSON.stringify(summaryJSON) : undefined,
        model: modelUsed || undefined,
        tokensUsed: inputTokens || undefined,
        // outputTokens is not in the schema
        cost: cost || undefined,
        processingTimeMs: duration || undefined,
        isPartialResult: isPartial,
        processingError: parsingErrors ? parsingErrors.join('; ') : undefined,
        // updatedAt is handled automatically by Prisma
        processingCompletedAt: parsingErrors || isPartial ? undefined : new Date()
      }
    });
    
    componentLogger.debug(`Updated summary ${summaryId} with final result in ${Date.now() - startTime}ms`);
    monitoring.recordTiming('db.update_summary_final', Date.now() - startTime);
  } catch (error) {
    componentLogger.error(`Error updating summary ${summaryId} with final result: ${error instanceof Error ? error.message : String(error)}`);
    monitoring.incrementCounter('db.update_summary_error', 1);
    // Don't throw the error - we don't want to fail the entire process due to a DB update issue
  }
}
