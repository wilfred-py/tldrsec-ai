/**
 * Enhanced Summarization Service
 * 
 * Main service for enhanced summarization of SEC filings
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { SummarizationOptions, SummarizationResult, SummarizationError } from '../summarize';
import { EnhancedSummarizationResult } from './types';
import { SECFilingType } from '../prompts/prompt-types';
import { extractFilingContent } from '../../parsers/filing-extractor';
import { createStreamHandler, StreamEvent, StreamHandler } from '../streaming/stream-handler';
import { summaryCache, SummaryCacheKey } from '../cache/summary-cache';
import { processDocumentContent } from '../chunking/enhanced-chunker';
import { logger } from '../../logging';
import { monitoring } from '../../monitoring';
import { ApiError, ErrorCode } from '../../error-handling';
import { prisma } from '../../db/prisma';
import { processAllChunks } from './batch-processor';
import { updateSummaryWithPartialResult, updateSummaryWithResult } from './db-utils';

// Component logger
const componentLogger = logger.child('enhanced-summarizer');

/**
 * Summarization event types
 */
export enum SummarizationEvent {
  START = 'summarization:start',
  PROCESSING = 'summarization:processing',
  PARTIAL_RESULT = 'summarization:partial-result',
  COMPLETE = 'summarization:complete',
  ERROR = 'summarization:error',
  CACHED_RESULT = 'summarization:cached-result'
}

/**
 * Enhanced summarization options
 */
export interface EnhancedSummarizationOptions extends SummarizationOptions {
  filingId: string;
  summaryId: string;
  claudeOptions?: any;
  useStreaming?: boolean;
  useCache?: boolean;
  cacheKey?: SummaryCacheKey;
  streamHandler?: StreamHandler;
  batchId?: string;
  maxRetries?: number;
  filingType?: SECFilingType;
  chunkMaxTokens?: number;
  concurrencyLimit?: number;
  processAllChunks?: boolean;
}

/**
 * Enhanced summarization service for SEC filings
 */
export class EnhancedSummarizationService extends EventEmitter {
  /**
   * Create a new enhanced summarization service
   */
  constructor() {
    super();
    componentLogger.debug('EnhancedSummarizationService initialized');
  }

  /**
   * Summarize an SEC filing with enhanced features
   * 
   * @param filingId Filing ID
   * @param options Summarization options
   * @returns Summarization result
   */
  public async summarize(
    filingId: string,
    options: EnhancedSummarizationOptions
  ): Promise<EnhancedSummarizationResult> {
    const startTime = Date.now();
    const summaryId = options.summaryId || uuidv4();
    const useStreaming = options.useStreaming ?? false;
    const useCache = options.useCache ?? true;
    const processAllChunksEnabled = options.processAllChunks ?? true;
    
    // Set up stream handler if streaming is enabled
    let streamHandler: StreamHandler | undefined;
    if (useStreaming) {
      streamHandler = options.streamHandler || createStreamHandler({ summaryId: options.summaryId });
      streamHandler.on(StreamEvent.CONTENT, (data) => {
        this.emit(SummarizationEvent.PARTIAL_RESULT, {
          summaryId,
          filingId,
          partialResult: data
        });
      });
    }
    
    try {
      // Emit start event
      this.emit(SummarizationEvent.START, { summaryId, filingId });
      componentLogger.info(`Starting summarization for filing ${filingId}, summary ${summaryId}`);
      monitoring.incrementCounter('ai.summarization_start', 1);
      
      // Check cache if enabled
      if (useCache) {
        const cacheKey = options.cacheKey || { filingId };
        // Create a proper cache key string
        const cacheKeyString = typeof cacheKey === 'string' ? cacheKey : JSON.stringify(cacheKey);
        const cachedResult = await summaryCache.get(cacheKeyString);
        if (cachedResult) {
          componentLogger.info(`Cache hit for filing ${filingId}, returning cached result`);
          monitoring.incrementCounter('ai.summarization_cache_hit', 1);
          
          // Update summary record with cached result
          // Update the summary with the cached result
          await updateSummaryWithResult(summaryId, {
            ...cachedResult,
            summaryId
          });
          
          // Emit complete event
          this.emit(SummarizationEvent.CACHED_RESULT, {
            filingId,
            result: cachedResult,
            duration: Date.now() - startTime
          });
          
          // Return the cached result without adding non-standard properties
          return {
            ...cachedResult,
            summaryId,
            duration: cachedResult.duration || 0,
            isPartial: cachedResult.isPartial || false
          };
        }
        
        componentLogger.debug(`Cache miss for filing ${filingId}`);
        monitoring.incrementCounter('ai.summarization_cache_miss', 1);
      }
      
      // Fetch filing record from database
      // Use type assertion to access the filing model
      const filingRecord = await (prisma as any).filing.findUnique({
        where: { id: filingId },
        include: { ticker: true }
      });
      
      if (!filingRecord) {
        const errorMessage = `Filing not found: ${filingId}`;
        const error = new ApiError(ErrorCode.NOT_FOUND, errorMessage);
        componentLogger.error(`Filing not found: ${filingId}`);
        monitoring.incrementCounter('ai.summarization_error', 1);
        
        // Emit error event
        this.emit(SummarizationEvent.ERROR, {
          summaryId,
          filingId,
          error
        });
        
        throw error;
      }
      
      // Determine filing type
      const filingType = options.filingType || filingRecord.filingType as SECFilingType;
      if (!filingType) {
        const errorMessage = `Filing type not specified for filing: ${filingId}`;
        const error = new ApiError(ErrorCode.BAD_REQUEST, errorMessage);
        componentLogger.error(`Filing type not specified for filing: ${filingId}`);
        monitoring.incrementCounter('ai.summarization_error', 1);
        
        // Emit error event
        this.emit(SummarizationEvent.ERROR, {
          summaryId,
          filingId,
          error
        });
        
        throw error;
      }
      
      // Extract filing content
      const filingContent = await extractFilingContent(filingRecord.content, filingType);
      if (!filingContent || filingContent.length === 0) {
        const errorMessage = `Empty filing content for filing: ${filingId}`;
        const error = new ApiError(ErrorCode.BAD_REQUEST, errorMessage);
        componentLogger.error(`Empty filing content for filing: ${filingId}`);
        monitoring.incrementCounter('ai.summarization_error', 1);
        
        // Emit error event
        this.emit(SummarizationEvent.ERROR, {
          summaryId,
          filingId,
          error
        });
        
        throw error;
      }
      
      // Process document content into chunks
      const chunkMaxTokens = options.chunkMaxTokens || 10000;
      const chunksResult = processDocumentContent(filingContent, filingType);
      // Apply token limit after processing
      if (chunksResult.chunks.length > 0 && chunkMaxTokens > 0) {
        // Token limiting logic would go here if needed
      }
      const chunks = chunksResult.chunks;
      
      // Emit processing event
      this.emit(SummarizationEvent.PROCESSING, {
        summaryId,
        filingId,
        chunks: chunks.length
      });
      
      let result: EnhancedSummarizationResult;
      
      // Process all chunks if enabled, otherwise just the first chunk
      if (processAllChunksEnabled && chunks.length > 1) {
        // Process all chunks in parallel with concurrency limit
        result = await this._processAllChunks(
          chunks,
          filingType,
          filingRecord,
          {
            ...options,
            summaryId,
            streamHandler
          }
        );
      } else {
        // Process only the first chunk
        const firstChunk = chunks[0];
        result = await this._processSingleChunk(
          firstChunk,
          filingType,
          filingRecord,
          {
            ...options,
            summaryId,
            streamHandler
          }
        );
      }
      
      // Update summary record with final result
      await updateSummaryWithResult(summaryId, result as SummarizationResult);
      
      // Cache result if caching is enabled
      if (useCache) {
        const cacheKey = options.cacheKey || { filingId };
        // Create a proper cache key string
        const cacheKeyString = typeof cacheKey === 'string' ? cacheKey : JSON.stringify(cacheKey);
        await summaryCache.set(cacheKeyString, result as SummarizationResult);
      }
      
      // Emit complete event
      this.emit(SummarizationEvent.COMPLETE, {
        summaryId,
        filingId,
        result,
        duration: Date.now() - startTime
      });
      
      componentLogger.info(`Completed summarization for filing ${filingId}, summary ${summaryId} in ${Date.now() - startTime}ms`);
      monitoring.incrementCounter('ai.summarization_complete', 1);
      monitoring.recordTiming('ai.summarization_duration', Date.now() - startTime);
      
      return result;
      
    } catch (error) {
      componentLogger.error(`Error summarizing filing ${filingId}: ${error instanceof Error ? error.message : String(error)}`);
      monitoring.incrementCounter('ai.summarization_error', 1);
      
      // Emit error event
      this.emit(SummarizationEvent.ERROR, {
        summaryId,
        filingId,
        error
      });
      
      // Update summary record with error
      try {
        await prisma.summary.update({
          where: { id: summaryId },
          data: {
            // Use fields that match the Prisma schema
            processingStatus: 'ERROR',
            processingError: error instanceof Error ? error.message : String(error)
          }
        });
      } catch (dbError) {
        componentLogger.error(`Failed to update summary record with error: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
      }
      
      // Rethrow as SummarizationError
      if (error instanceof SummarizationError) {
        throw error;
      } else {
        // Get the filing type from the options if available
        const errorFilingType = options.filingType || 'unknown';
        throw new SummarizationError(
          error instanceof Error ? error.message : String(error),
          errorFilingType,
          summaryId,
          filingId
        );
      }
    }
  }

  /**
   * Process a single document chunk
   * 
   * @param chunk Document chunk to process
   * @param filingType SEC filing type
   * @param filingRecord Filing record from database
   * @param options Processing options
   * @returns Summarization result
   * @private
   */
  private async _processSingleChunk(
    chunk: string,
    filingType: SECFilingType,
    filingRecord: any,
    options: EnhancedSummarizationOptions
  ): Promise<EnhancedSummarizationResult> {
    // Import here to avoid circular dependencies
    const { processSingleChunk } = await import('./chunk-processor');
    
    const result = await processSingleChunk(
      chunk,
      filingType,
      filingRecord,
      options
    );
    
    // Update summary with partial result if streaming is enabled
    if (options.useStreaming && result) {
      await updateSummaryWithPartialResult(options.summaryId, result);
      
      // Emit partial result event
      this.emit(SummarizationEvent.PARTIAL_RESULT, {
        summaryId: options.summaryId,
        filingId: options.filingId,
        partialResult: result
      });
    }
    
    return result;
  }

  /**
   * Process all document chunks in parallel with concurrency limits
   * 
   * @param chunks Array of document chunks to process
   * @param filingType SEC filing type
   * @param filingRecord Filing record from database
   * @param options Processing options
   * @returns Combined summarization result
   * @private
   */
  private async _processAllChunks(
    chunks: string[],
    filingType: SECFilingType,
    filingRecord: any,
    options: EnhancedSummarizationOptions
  ): Promise<EnhancedSummarizationResult> {
    return processAllChunks(
      chunks,
      filingType,
      filingRecord,
      options
    );
  }
}
