/**
 * Enhanced Claude AI Summarization Service
 * 
 * Provides advanced summarization capabilities for SEC filings using:
 * - Streaming support for faster partial results
 * - Caching to prevent redundant API calls
 * - Enhanced chunking to process all document chunks
 * - Parallel batch processing with concurrency limits
 * - Improved error recovery with retries and fallbacks
 */

import { enhancedClaudeClient, EnhancedClaudeOptions, EnhancedClaudeEvent } from './enhanced-claude-client';
import { SummarizationOptions, SummarizationResult, SummarizationError } from './summarize';
import { SECFilingType } from './prompts/prompt-types';
import { generateFilingPrompt } from './prompts/filing-prompts';
import { extractFilingContent } from '../parsers/filing-extractor';
import { parseResponse } from './parsers';
import { createStreamHandler, StreamEvent } from './streaming/stream-handler';
import { summaryCache, SummaryCacheKey } from './cache/summary-cache';
import { processDocumentContent, processAllChunks, combineChunkResults } from './chunking/enhanced-chunker';
import { batchProcessor, BatchJob } from './batch/batch-processor';
import { extractJSON, repairJSON } from './parsers/json-extractor';
import { logger } from '../logging';
import { monitoring } from '../monitoring';
import { ApiError, ErrorCode } from '../error-handling';
import { prisma } from '../db/prisma';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

// Component logger
const componentLogger = logger.child('enhanced-summarizer');

/**
 * Enhanced summarization options
 */
export interface EnhancedSummarizationOptions extends SummarizationOptions {
  useStreaming?: boolean;
  useCache?: boolean;
  processAllChunks?: boolean;
  concurrencyLimit?: number;
  chunkMaxTokens?: number;
  streamHandler?: EventEmitter;
  cacheKey?: SummaryCacheKey;
  batchId?: string;
}

/**
 * Events emitted during summarization
 */
export enum SummarizationEvent {
  STARTED = 'summarization:started',
  PROGRESS = 'summarization:progress',
  PARTIAL_RESULT = 'summarization:partial_result',
  COMPLETED = 'summarization:completed',
  ERROR = 'summarization:error',
  CACHE_HIT = 'summarization:cache_hit',
  CACHE_MISS = 'summarization:cache_miss',
  CHUNK_PROCESSING = 'summarization:chunk_processing',
  BATCH_PROGRESS = 'summarization:batch_progress'
}

/**
 * Enhanced summarization service
 */
export class EnhancedSummarizationService extends EventEmitter {
  /**
   * Summarize an SEC filing with enhanced features
   * @param options Enhanced summarization options
   * @returns Summarization result
   */
  async summarizeFiling(options: EnhancedSummarizationOptions): Promise<SummarizationResult> {
    const { filingId, summaryId = uuidv4(), requestId = uuidv4() } = options;
    const startTime = Date.now();
    const operationId = `summarize-${requestId.slice(0, 8)}`;
    
    componentLogger.info(`Starting enhanced summarization for filing ${filingId}, summary ${summaryId}, operation ${operationId}`);
    
    try {
      // Emit started event
      this.emit(SummarizationEvent.STARTED, { summaryId, filingId, operationId });
      
      // Get filing record from database
      const filingRecordFromDB = await prisma.secFiling.findUnique({
        where: { id: filingId },
        include: { ticker: true }
      });
      
      if (!filingRecordFromDB) {
        throw new SummarizationError(
          `Filing not found: ${filingId}`,
          summaryId,
          'unknown',
          'FILING_NOT_FOUND',
          false,
          'filing_not_found'
        );
      }
      
      // Create cache key if caching is enabled
      let cacheKey: SummaryCacheKey | undefined;
      if (options.useCache && filingRecordFromDB.formType && filingRecordFromDB.cik && filingRecordFromDB.accessionNumber) {
        cacheKey = {
          formType: filingRecordFromDB.formType,
          cik: filingRecordFromDB.cik,
          accessionNumber: filingRecordFromDB.accessionNumber
        };
        
        // Check cache for existing summary
        if (cacheKey) {
          const cachedResult = await summaryCache.checkCache(cacheKey);
          
          if (cachedResult && cachedResult.status === 'COMPLETED' && cachedResult.result) {
            componentLogger.info(`Cache hit for filing ${filingId}, summary ${summaryId}`);
            this.emit(SummarizationEvent.CACHE_HIT, { 
              summaryId, 
              filingId, 
              cacheKey,
              result: cachedResult.result
            });
            
            // Update the summary record to mark it as completed from cache
            await prisma.summary.update({
              where: { id: summaryId },
              data: {
                summaryText: typeof cachedResult.result.summaryText === 'string' 
                  ? cachedResult.result.summaryText 
                  : JSON.stringify(cachedResult.result.summaryText),
                processingStatus: 'COMPLETED',
                processingCompletedAt: new Date(),
                isPartialResult: false,
                processingTimeMs: cachedResult.result.duration,
                tokensUsed: (cachedResult.result.inputTokens || 0) + (cachedResult.result.outputTokens || 0),
                model: cachedResult.result.modelUsed,
                cost: cachedResult.result.cost,
                attempts: cachedResult.result.attempts || 1,
                cachedResult: true
              }
            });
            
            monitoring.incrementCounter('ai.cache.hits', 1);
            monitoring.recordTiming('ai.summarization_duration', Date.now() - startTime);
            
            return cachedResult.result;
          }
          
          // Cache miss - set pending entry
          this.emit(SummarizationEvent.CACHE_MISS, { summaryId, filingId, cacheKey });
          await summaryCache.setPending(cacheKey, summaryId);
          monitoring.incrementCounter('ai.cache.misses', 1);
        }
      }
      
      // Extract filing content if not provided
      let documentContent = options.documentContent;
      if (!documentContent && 'rawContent' in filingRecordFromDB && filingRecordFromDB.rawContent) {
        documentContent = await extractFilingContent(
          typeof filingRecordFromDB.rawContent === 'string' ? filingRecordFromDB.rawContent : JSON.stringify(filingRecordFromDB.rawContent),
          filingRecordFromDB.formType as SECFilingType
        );
      }
      
      if (!documentContent) {
        throw new SummarizationError(
          `No content available for filing ${filingId}`,
          summaryId,
          filingRecordFromDB.formType,
          'NO_CONTENT',
          false,
          'no_content'
        );
      }
      
      // Create or update summary record
      await prisma.summary.upsert({
        where: { id: summaryId },
        create: {
          id: summaryId,
          secFilingId: filingId,
          processingStatus: 'PROCESSING',
          processingStartedAt: new Date()
        },
        update: {
          processingStatus: 'PROCESSING',
          processingStartedAt: new Date(),
          processingError: null,
          processingErrorCode: null
        }
      });
      
      // Process document content with enhanced chunking
      const filingType = filingRecordFromDB.formType as SECFilingType;
      const maxTokens = options.chunkMaxTokens || 150000;
      
      const { chunks, isChunked, chunkCount } = processDocumentContent(
        documentContent,
        filingType,
        maxTokens
      );
      
      // Set up stream handler if streaming is enabled
      let streamHandler;
      if (options.useStreaming) {
        streamHandler = options.streamHandler || createStreamHandler({ summaryId });
        
        // Forward stream events
        streamHandler.on(StreamEvent.CONTENT, (data) => {
          this.emit(SummarizationEvent.PROGRESS, { 
            summaryId, 
            filingId, 
            content: data.content,
            isPartial: true
          });
        });
        
        streamHandler.on(StreamEvent.PARTIAL_JSON, (data) => {
          this.emit(SummarizationEvent.PARTIAL_RESULT, { 
            summaryId, 
            filingId, 
            result: data.json,
            isPartial: true
          });
          
          // Update summary record with partial result
          this._updateSummaryWithPartialResult(summaryId, data.json);
        });
      }
      
      // Process all chunks if enabled and needed
      if (options.processAllChunks && isChunked && chunkCount > 1) {
        componentLogger.info(`Processing ${chunkCount} chunks for filing ${filingId}`);
        this.emit(SummarizationEvent.CHUNK_PROCESSING, { 
          summaryId, 
          filingId, 
          chunkCount
        });
        
        // Process all chunks with enhanced options
        const enhancedOptions: EnhancedSummarizationOptions = {
          ...options,
          summaryId,
          filingId,
          streamHandler
        };
        
        const result = await this._processAllChunks(
          chunks, 
          filingType, 
          filingRecordFromDB, 
          enhancedOptions
        );
        
        // Update cache if enabled
        if (options.useCache && cacheKey) {
          await summaryCache.updateStatus(
            cacheKey,
            'COMPLETED',
            result
          );
        }
        
        // Update summary record
        await this._updateSummaryWithResult(summaryId, result, startTime);
        
        // Emit completed event
        this.emit(SummarizationEvent.COMPLETED, { 
          summaryId, 
          filingId, 
          result,
          duration: Date.now() - startTime
        });
        
        monitoring.recordTiming('ai.summarization_duration', Date.now() - startTime);
        return result;
      }
      
      // Process single chunk (or full document)
      const chunk = isChunked ? chunks[0] : documentContent;
      const result = await this._processSingleChunk(
        chunk,
        filingType,
        filingRecordFromDB,
        {
          ...options,
          summaryId,
          filingId,
          streamHandler,
          cacheKey
        }
      );
      
      // Update cache if enabled
      if (options.useCache && cacheKey) {
        await summaryCache.updateStatus(
          cacheKey,
          'COMPLETED',
          result
        );
      }
      
      // Update summary record
      await this._updateSummaryWithResult(summaryId, result, startTime);
      
      // Emit completed event
      this.emit(SummarizationEvent.COMPLETED, { 
        summaryId, 
        filingId, 
        result,
        duration: Date.now() - startTime
      });
      
      monitoring.recordTiming('ai.summarization_duration', Date.now() - startTime);
      return result;
      
    } catch (error) {
      componentLogger.error(`Error in enhanced summarization for filing ${filingId}, summary ${summaryId}: ${error instanceof Error ? error.message : String(error)}`);
      
      // Update cache if error occurred and caching is enabled
      if (options.useCache && options.cacheKey) {
        await summaryCache.updateStatus(
          options.cacheKey,
          'FAILED',
          undefined,
          error instanceof Error ? error.message : String(error)
        );
      }
      
      // Update summary record
      await prisma.summary.update({
        where: { id: summaryId },
        data: {
          processingStatus: 'FAILED',
          processingError: `Enhanced summarization failed: ${error instanceof Error ? error.message : String(error)}`,
          processingErrorCode: error instanceof ApiError ? error.code : 'UNKNOWN_ERROR',
          processingTimeMs: Date.now() - startTime
        }
      });
      
      // Emit error event
      this.emit(SummarizationEvent.ERROR, { 
        summaryId, 
        filingId, 
        error: error instanceof Error ? error : new Error(String(error)),
        duration: Date.now() - startTime
      });
      
      monitoring.incrementCounter('ai.summarization_error', 1);
      
      // Re-throw as SummarizationError
      if (error instanceof SummarizationError) {
        throw error;
      }
      
      throw new SummarizationError(
        `Enhanced summarization failed: ${error instanceof Error ? error.message : String(error)}`,
        summaryId,
        options.filingType || 'unknown',
        error instanceof ApiError ? error.code : 'SUMMARIZATION_FAILED',
        error instanceof ApiError && error.isRetriable,
        'unexpected_error'
      );
    }
  }
  
  /**
   * Process a batch of filings in parallel
   * @param filingIds Array of filing IDs to process
   * @param options Enhanced summarization options
   * @returns Array of summarization results
   */
  async summarizeFilingBatch(
    filingIds: string[],
    options: EnhancedSummarizationOptions = {}
  ): Promise<SummarizationResult[]> {
    const batchId = options.batchId || `batch-${Date.now()}`;
    const concurrencyLimit = options.concurrencyLimit || 3;
    const startTime = Date.now();
    
    componentLogger.info(`Starting batch summarization for ${filingIds.length} filings with batchId ${batchId}`);
    
    try {
      // Create batch jobs
      const jobs: BatchJob[] = [];
      
      for (const filingId of filingIds) {
        const summaryId = uuidv4();
        
        jobs.push({
          id: summaryId,
          execute: async () => {
            return this.summarizeFiling({
              ...options,
              filingId,
              summaryId,
              batchId
            });
          }
        });
      }
      
      // Set concurrency limit
      batchProcessor.setConcurrencyLimit(concurrencyLimit);
      
      // Process batch
      const batchResults = await batchProcessor.processBatch(jobs);
      
      // Track progress
      const totalJobs = jobs.length;
      let completedJobs = 0;
      
      const progressInterval = setInterval(() => {
        const activeJobs = batchProcessor.getActiveJobs();
        completedJobs = totalJobs - activeJobs.length;
        
        // Emit progress event
        this.emit(SummarizationEvent.BATCH_PROGRESS, { 
          batchId,
          totalJobs,
          completedJobs,
          progress: Math.round((completedJobs / totalJobs) * 100)
        });
        
        // Stop interval when all jobs are complete
        if (completedJobs === totalJobs) {
          clearInterval(progressInterval);
        }
      }, 1000);
      
      componentLogger.info(`Batch summarization completed for ${filingIds.length} filings in ${Date.now() - startTime}ms`);
      monitoring.recordTiming('ai.batch_summarization_duration', Date.now() - startTime);
      
      return batchResults.results;
      
    } catch (error) {
      componentLogger.error(`Error in batch summarization: ${error instanceof Error ? error.message : String(error)}`);
      monitoring.incrementCounter('ai.batch_summarization_error', 1);
      throw error;
    }
  }
  
  /**
   * Process a single chunk
   * @param chunk Document chunk to process
   * @param filingType SEC filing type
   * @param filingRecord Filing record from database
   * @param options Enhanced summarization options
   * @returns Summarization result
   */
  private async _processSingleChunk(
    chunk: string,
    filingType: SECFilingType,
    filingRecord: any,
    options: EnhancedSummarizationOptions
  ): Promise<SummarizationResult> {
    const { summaryId, filingId } = options;
    const startTime = Date.now();
    
    // Generate prompt for this filing type
    const context = {
      ticker: filingRecord.ticker?.symbol || '',
      companyName: filingRecord.companyName || ''
    };
    
    const prompt = generateFilingPrompt(filingType, context);
    const messages = [
      { role: 'user' as const, content: prompt.getFullPrompt(chunk) }
    ];
    
    // Prepare Claude options
    const claudeOptions: EnhancedClaudeOptions = {
      model: 'claude-3-opus-20240229',
      maxTokens: 4096,
      temperature: 0.2,
      system: prompt.systemPrompt,
      metadata: {
        filingId,
        summaryId,
        filingType
      },
      useStreaming: options.useStreaming,
      useCache: options.useCache,
      cacheKey: options.cacheKey,
      streamHandler: options.streamHandler,
      ...options.claudeOptions
    };
    
    try {
      // Send request to Claude
      const response = await enhancedClaudeClient.sendMessage(messages, claudeOptions);
      
      // Extract response content
      const summaryText = response.content;
      const inputTokens = response.inputTokens;
      const outputTokens = response.outputTokens;
      const cost = response.cost.totalCost;
      
      // Parse response
      const parsingStartTime = Date.now();
      const parsedResult = parseResponse(summaryText, filingType);
      const parsingDuration = Date.now() - parsingStartTime;
      
      // Return result
      if (parsedResult.success) {
        monitoring.incrementCounter('ai.summarization_success', 1);
        monitoring.recordTiming('ai.parsing_duration', parsingDuration);
        
        return {
          summaryId,
          summaryText: parsedResult.data.summary,
          summaryJSON: parsedResult.data,
          duration: Date.now() - startTime,
          modelUsed: response.model,
          inputTokens,
          outputTokens,
          cost,
          attempts: response.attempts || 1
        };
      } else {
        monitoring.recordTiming('ai.parsing_duration', parsingDuration);
        componentLogger.warn(`Failed to parse valid JSON from response for summaryId=${summaryId}, filingType=${filingType}, errors=${parsedResult.errors?.join('; ')}`);
        monitoring.incrementCounter('ai.summarization_parsing_error', 1);
        
        return {
          summaryId,
          summaryText,
          parsingErrors: parsedResult.errors,
          isPartial: true,
          duration: Date.now() - startTime,
          modelUsed: response.model,
          inputTokens,
          outputTokens,
          cost,
          attempts: response.attempts || 1
        };
      }
    } catch (error) {
      componentLogger.error(`Error calling Claude API for filing ${filingId}, summary ${summaryId}: ${error instanceof Error ? error.message : String(error)}`);
      monitoring.incrementCounter('ai.summarization_error', 1);
      throw error;
    }
  }
  
  /**
   * Process all document chunks and combine results
   * @param chunks Document chunks to process
   * @param filingType SEC filing type
   * @param filingRecord Filing record from database
   * @param options Enhanced summarization options
   * @returns Combined summarization result
   */
  private async _processAllChunks(
    chunks: string[],
    filingType: SECFilingType,
    filingRecord: any,
    options: EnhancedSummarizationOptions
  ): Promise<SummarizationResult> {
    const { summaryId, filingId } = options;
    const startTime = Date.now();
    
    try {
      // Create batch jobs for each chunk
      const jobs: BatchJob[] = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const chunkId = `${summaryId}-chunk-${i+1}`;
        
        jobs.push({
          id: chunkId,
          execute: async () => {
            return this._processSingleChunk(
              chunks[i],
              filingType,
              filingRecord,
              {
                ...options,
                summaryId: chunkId,
                filingId,
                useStreaming: false // Disable streaming for individual chunks
              }
            );
          }
        });
      }
      
      // Set concurrency limit
      const concurrencyLimit = options.concurrencyLimit || 3;
      batchProcessor.setConcurrencyLimit(concurrencyLimit);
      
      // Process batch
      const batchResults = await batchProcessor.processBatch(jobs);
      
      // Combine results
      const combinedResult = combineChunkResults(
        batchResults.results,
        filingType,
        summaryId
      );
      
      // Calculate total metrics
      const totalInputTokens = batchResults.results.reduce((sum, r) => sum + (r.inputTokens || 0), 0);
      const totalOutputTokens = batchResults.results.reduce((sum, r) => sum + (r.outputTokens || 0), 0);
      const totalCost = batchResults.results.reduce((sum, r) => sum + (r.cost || 0), 0);
      
      // Return combined result with metrics
      return {
        ...combinedResult,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        cost: totalCost,
        duration: Date.now() - startTime
      };
      
    } catch (error) {
      componentLogger.error(`Error processing chunks for filing ${filingId}, summary ${summaryId}: ${error instanceof Error ? error.message : String(error)}`);
      monitoring.incrementCounter('ai.chunk_processing_error', 1);
      throw error;
    }
  }
  
  /**
   * Update summary record with partial result
   * @param summaryId Summary ID
   * @param partialJson Partial JSON result
   */
  private async _updateSummaryWithPartialResult(
    summaryId: string,
    partialJson: Record<string, unknown>
  ): Promise<void> {
    try {
      await prisma.summary.update({
        where: { id: summaryId },
        data: {
          summaryText: JSON.stringify(partialJson),
          isPartialResult: true,
          lastPartialUpdateAt: new Date()
        }
      });
    } catch (error) {
      componentLogger.warn(`Failed to update summary with partial result: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Update summary record with final result
   * @param summaryId Summary ID
   * @param result Summarization result
   * @param startTime Start time of summarization
   */
  private async _updateSummaryWithResult(
    summaryId: string,
    result: SummarizationResult,
    startTime: number
  ): Promise<void> {
    try {
      await prisma.summary.update({
        where: { id: summaryId },
        data: {
          summaryText: typeof result.summaryText === 'string' 
            ? result.summaryText 
            : JSON.stringify(result.summaryText),
          processingStatus: result.parsingErrors ? 'COMPLETED_WITH_WARNINGS' : 'COMPLETED',
          processingCompletedAt: new Date(),
          isPartialResult: !!result.isPartial,
          processingTimeMs: Date.now() - startTime,
          processingError: result.parsingErrors ? result.parsingErrors.join('; ') : null,
          tokensUsed: (result.inputTokens || 0) + (result.outputTokens || 0),
          model: result.modelUsed,
          cost: result.cost,
          attempts: result.attempts || 1
        }
      });
    } catch (error) {
      componentLogger.warn(`Failed to update summary with result: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Export singleton instance
export const enhancedSummarizer = new EnhancedSummarizationService();
