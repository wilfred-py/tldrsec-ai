/**
 * Batch Processor Module
 * 
 * Handles batch processing of multiple document chunks for summarization
 */

import { EnhancedSummarizationResult } from './types';
import { SECFilingType } from '../prompts/prompt-types';
import { batchProcessor } from '../batch/batch-processor';
import { logger } from '../../logging';
import { monitoring } from '../../monitoring';
import { processSingleChunk } from './chunk-processor';
import { EnhancedClaudeOptions } from '../enhanced-claude-client';

/**
 * Custom BatchJob interface for our specific use case
 */
interface ChunkBatchJob {
  id: string;
  data: string;
  metadata: {
    filingId: string;
    summaryId: string;
    filingType: SECFilingType;
    chunkIndex: number;
    totalChunks: number;
  };
  processor: (chunkData: string) => Promise<EnhancedSummarizationResult>;
}

// Component logger
const componentLogger = logger.child('batch-processor');

/**
 * Process all document chunks in parallel with concurrency limits
 * 
 * @param chunks Array of document chunks to process
 * @param filingType SEC filing type
 * @param filingRecord Filing record from database
 * @param options Processing options
 * @returns Combined summarization result
 */
export async function processAllChunks(
  chunks: string[],
  filingType: SECFilingType,
  filingRecord: {
    companyName?: string;
    filingDate?: string;
    ticker?: { symbol?: string };
  },
  options: {
    filingId: string;
    summaryId: string;
    batchId?: string;
    concurrencyLimit?: number;
    maxRetries?: number;
    useStreaming?: boolean;
    useCache?: boolean;
    claudeOptions?: EnhancedClaudeOptions;
  }
): Promise<EnhancedSummarizationResult> {
  const { filingId, summaryId } = options;
  const batchId = options.batchId || `batch-${summaryId}`;
  const concurrencyLimit = options.concurrencyLimit || 3;
  const startTime = Date.now();
  
  componentLogger.info(`Starting batch processing of ${chunks.length} chunks for summaryId=${summaryId}, concurrency=${concurrencyLimit}`);
  monitoring.incrementCounter('ai.batch_processing_start', 1);
  monitoring.recordValue('ai.batch_chunks_count', chunks.length);
  
  // Create batch jobs for each chunk
  const batchJobs: ChunkBatchJob[] = chunks.map((chunk, index) => ({
    id: `${batchId}-chunk-${index}`,
    data: chunk,
    metadata: {
      filingId,
      summaryId,
      filingType,
      chunkIndex: index,
      totalChunks: chunks.length
    },
    processor: async (chunkData: string) => {
      return processSingleChunk(
        chunkData,
        filingType,
        filingRecord,
        {
          filingId,
          summaryId,
          maxRetries: options.maxRetries,
          useStreaming: false, // Disable streaming for batch jobs for simplicity
          useCache: options.useCache,
          cacheKey: { filingId, chunkIndex: index },
          claudeOptions: options.claudeOptions
        }
      );
    }
  }));
  
  // Process all chunks in parallel with concurrency limit
  // Need to cast batchJobs to any to work around type incompatibility with BatchProcessor
  const batchResults = await batchProcessor.processBatch(batchJobs as any);
  
  // Convert batch results to array of EnhancedSummarizationResult
  const results = batchResults.results as unknown as EnhancedSummarizationResult[];
  
  // Combine results from all chunks
  const combinedResult = combineChunkResults(results, summaryId, startTime);
  
  componentLogger.info(`Completed batch processing of ${chunks.length} chunks for summaryId=${summaryId} in ${combinedResult.duration}ms`);
  monitoring.incrementCounter('ai.batch_processing_complete', 1);
  monitoring.recordTiming('ai.batch_processing_duration', combinedResult.duration);
  
  return combinedResult;
}

/**
 * Combine results from multiple chunks into a single summarization result
 * 
 * @param chunkResults Array of individual chunk results
 * @param summaryId Summary ID
 * @param startTime Processing start time
 * @returns Combined summarization result
 */
export function combineChunkResults(
  chunkResults: EnhancedSummarizationResult[],
  summaryId: string,
  startTime: number
): EnhancedSummarizationResult {
  // If no results, return empty result
  if (chunkResults.length === 0) {
    return {
      summaryId,
      summaryText: '',
      summaryJSON: {},
      duration: Date.now() - startTime,
      inputTokens: 0,
      outputTokens: 0,
      cost: 0,
      modelUsed: 'unknown',
      model: 'unknown'
    };
  }
  
  // If only one result, return it with updated duration
  if (chunkResults.length === 1) {
    const result = chunkResults[0];
    return {
      ...result,
      duration: Date.now() - startTime
    };
  }
  
  // Combine multiple results
  const combinedJSON: any = {};
  const successfulChunks: EnhancedSummarizationResult[] = [];
  const failedChunks: EnhancedSummarizationResult[] = [];
  
  // Separate successful and failed chunks
  chunkResults.forEach(result => {
    if (result.parsingErrors || result.isPartial) {
      failedChunks.push(result);
    } else {
      successfulChunks.push(result);
    }
  });
  
  // Process successful chunks
  if (successfulChunks.length > 0) {
    // Combine JSON data from all successful chunks
    successfulChunks.forEach(result => {
      if (result.summaryJSON) {
        Object.entries(result.summaryJSON).forEach(([key, value]) => {
          // If the key already exists in combinedJSON, merge the values
          if (combinedJSON[key]) {
            if (Array.isArray(combinedJSON[key]) && Array.isArray(value)) {
              // Merge arrays
              combinedJSON[key] = [...combinedJSON[key], ...value];
            } else if (typeof combinedJSON[key] === 'string' && typeof value === 'string') {
              // Concatenate strings with a separator
              combinedJSON[key] = `${combinedJSON[key]}\n\n${value}`;
            } else {
              // For objects or mixed types, prefer the most recent value
              combinedJSON[key] = value;
            }
          } else {
            // Key doesn't exist yet, add it
            combinedJSON[key] = value;
          }
        });
      }
    });
  }
  
  // Calculate total tokens and cost
  const totalInputTokens = chunkResults.reduce((sum, result) => sum + (result.inputTokens || 0), 0);
  const totalOutputTokens = chunkResults.reduce((sum, result) => sum + (result.outputTokens || 0), 0);
  const totalCost = chunkResults.reduce((sum, result) => sum + (result.cost || 0), 0);
  
  // Determine which model was used (use the most common one)
  const modelCounts: Record<string, number> = {};
  chunkResults.forEach(result => {
    // Use the correct property name for the model
    const model = result.modelUsed || result.model;
    if (model) {
      modelCounts[model] = (modelCounts[model] || 0) + 1;
    }
  });
  const modelName = Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
  
  // Create combined summary text
  let combinedSummaryText = '';
  if (combinedJSON.summary) {
    combinedSummaryText = combinedJSON.summary;
  } else {
    // Fallback to concatenating summary texts
    combinedSummaryText = successfulChunks
      .map(result => result.summaryText || '')
      .filter(text => typeof text === 'string' && text.length > 0)
      .join('\n\n');
  }
  
  // Return combined result
  return {
    summaryId,
    summaryText: combinedSummaryText,
    summaryJSON: combinedJSON,
    duration: Date.now() - startTime,
    model: modelName,
    modelUsed: modelName,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    cost: totalCost,
    isPartial: failedChunks.length > 0,
    parsingErrors: failedChunks.length > 0 
      ? failedChunks.flatMap(result => result.parsingErrors || [])
      : undefined,
    chunkResults: chunkResults.map(result => ({
      isPartial: result.isPartial || false,
      parsingErrors: result.parsingErrors,
      inputTokens: result.inputTokens || 0,
      outputTokens: result.outputTokens || 0,
      cost: result.cost || 0
    }))
  };
}
