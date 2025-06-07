/**
 * Enhanced Claude AI Client
 * 
 * Extends the base Claude client with advanced features:
 * - Streaming support for faster partial results
 * - Caching to prevent redundant API calls
 * - Enhanced chunking to process all document chunks
 * - Parallel batch processing with concurrency limits
 * - Improved error recovery with retries and fallbacks
 */

import { ClaudeClient, ClaudeMessage, ClaudeRequestOptions, ClaudeResponse } from './claude-client';
import { StreamHandler, StreamEvent, createStreamHandler } from './streaming/stream-handler';
import { summaryCache, SummaryCacheKey } from './cache/summary-cache';
import { batchProcessor, BatchJob } from './batch/batch-processor';
import { processDocumentContent, processAllChunks } from './chunking/enhanced-chunker';
import { SummarizationOptions, SummarizationResult } from './summarize';
import { SECFilingType } from './prompts/prompt-types';
import { logger } from '../logging';
import { monitoring } from '../monitoring';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import Anthropic from '@anthropic-ai/sdk';
import { ApiError, ErrorCode, createAiParsingError } from '../error-handling';

// Logger for this component
const componentLogger = logger.child('enhanced-claude');

/**
 * Enhanced options for Claude requests
 */
export interface EnhancedClaudeOptions extends ClaudeRequestOptions {
  useStreaming?: boolean;
  useCache?: boolean;
  processAllChunks?: boolean;
  concurrencyLimit?: number;
  streamHandler?: StreamHandler;
  cacheKey?: SummaryCacheKey;
  chunkMaxTokens?: number;
}

/**
 * Events emitted by the enhanced Claude client
 */
export enum EnhancedClaudeEvent {
  STREAM_START = 'stream:start',
  STREAM_CONTENT = 'stream:content',
  STREAM_JSON = 'stream:json',
  STREAM_END = 'stream:end',
  STREAM_ERROR = 'stream:error',
  CACHE_HIT = 'cache:hit',
  CACHE_MISS = 'cache:miss',
  CHUNK_START = 'chunk:start',
  CHUNK_COMPLETE = 'chunk:complete',
  CHUNK_ERROR = 'chunk:error',
  BATCH_START = 'batch:start',
  BATCH_PROGRESS = 'batch:progress',
  BATCH_COMPLETE = 'batch:complete',
  BATCH_ERROR = 'batch:error'
}

/**
 * Enhanced Claude client with advanced features
 */
export class EnhancedClaudeClient extends EventEmitter {
  private baseClient: ClaudeClient;
  
  /**
   * Create a new enhanced Claude client
   * @param baseClient Optional base Claude client to use
   */
  constructor(baseClient?: ClaudeClient) {
    super();
    this.baseClient = baseClient || new ClaudeClient();
    componentLogger.info('Enhanced Claude client initialized');
  }
  
  /**
   * Send a message to Claude with enhanced features
   * @param messages Array of messages to send
   * @param options Enhanced options for the request
   * @returns Claude response
   */
  async sendMessage(
    messages: ClaudeMessage[],
    options: EnhancedClaudeOptions = {}
  ): Promise<ClaudeResponse> {
    // Check cache if enabled
    if (options.useCache && options.cacheKey) {
      const cachedResult = await this.checkCache(options.cacheKey);
      if (cachedResult) {
        return this.convertSummarizationToClaudeResponse(cachedResult);
      }
    }
    
    // Use streaming if enabled
    if (options.useStreaming) {
      return this.sendStreamingMessage(messages, options);
    }
    
    // Default to standard request
    return this.baseClient.sendMessage(messages, options);
  }
  
  /**
   * Send a streaming message to Claude
   * @param messages Array of messages to send
   * @param options Enhanced options for the request
   * @returns Claude response
   */
  private async sendStreamingMessage(
    messages: ClaudeMessage[],
    options: EnhancedClaudeOptions = {}
  ): Promise<ClaudeResponse> {
    const requestId = uuidv4();
    const streamHandler = options.streamHandler || createStreamHandler({ summaryId: requestId });
    
    try {
      // Prepare request parameters
      const model = options.model || 'claude-3-opus-20240229';
      const maxTokens = options.maxTokens || 4096;
      const temperature = options.temperature || 0.7;
      const system = options.system;
      const metadata = options.metadata || {};
      
      // Start stream handler
      streamHandler.start();
      this.emit(EnhancedClaudeEvent.STREAM_START, { requestId });
      
      // Forward stream events
      streamHandler.on(StreamEvent.CONTENT, (data) => {
        this.emit(EnhancedClaudeEvent.STREAM_CONTENT, data);
      });
      
      streamHandler.on(StreamEvent.PARTIAL_JSON, (data) => {
        this.emit(EnhancedClaudeEvent.STREAM_JSON, { ...data, isPartial: true });
      });
      
      streamHandler.on(StreamEvent.COMPLETE_JSON, (data) => {
        this.emit(EnhancedClaudeEvent.STREAM_JSON, { ...data, isPartial: false });
      });
      
      // Create Anthropic client directly for streaming
      const anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      
      // Convert messages to Anthropic format
      const anthropicMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      
      // Start the stream
      const stream = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        temperature,
        system,
        metadata,
        messages: anthropicMessages,
        stream: true,
      });
      
      // Process the stream
      let responseContent = '';
      const startTime = Date.now();
      let inputTokens = 0;
      let outputTokens = 0;
      
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
          streamHandler.handleChunk(chunk.delta.text);
          responseContent += chunk.delta.text;
        }
        
        if (chunk.usage) {
          inputTokens = chunk.usage.input_tokens;
          outputTokens = chunk.usage.output_tokens;
        }
      }
      
      // Stream complete
      streamHandler.end();
      const duration = Date.now() - startTime;
      
      // Calculate cost (approximate)
      const modelPricing = this.getModelPricing(model);
      const inputCost = (inputTokens / 1000) * modelPricing.inputPrice;
      const outputCost = (outputTokens / 1000) * modelPricing.outputPrice;
      const totalCost = inputCost + outputCost;
      
      // Emit stream end event
      this.emit(EnhancedClaudeEvent.STREAM_END, { 
        requestId,
        duration,
        inputTokens,
        outputTokens,
        totalCost
      });
      
      // Return formatted response
      return {
        id: requestId,
        content: responseContent,
        model,
        usage: {
          inputTokens,
          outputTokens
        },
        inputTokens,
        outputTokens,
        cost: {
          inputCost,
          outputCost,
          totalCost
        },
        totalCost,
        attempts: 1,
        executionTimeMs: duration,
        fallbackUsed: false
      };
      
    } catch (error) {
      // Handle streaming errors
      streamHandler.handleError(error instanceof Error ? error : new Error(String(error)));
      this.emit(EnhancedClaudeEvent.STREAM_ERROR, { 
        requestId,
        error: error instanceof Error ? error : new Error(String(error))
      });
      
      // Normalize and throw error
      const normalizedError = this.baseClient.normalizeError(error, requestId);
      throw normalizedError;
    }
  }
  
  /**
   * Process a document with enhanced chunking
   * @param documentContent Document content to process
   * @param filingType SEC filing type
   * @param options Summarization options
   * @returns Summarization result
   */
  async processDocument(
    documentContent: string,
    filingType: SECFilingType,
    options: SummarizationOptions & EnhancedClaudeOptions = {}
  ): Promise<SummarizationResult> {
    const summaryId = options.summaryId || uuidv4();
    const maxTokens = options.chunkMaxTokens || 150000;
    
    // Check cache if enabled
    if (options.useCache && options.cacheKey) {
      const cachedResult = await this.checkCache(options.cacheKey);
      if (cachedResult) {
        componentLogger.info(`Cache hit for filing ${options.filingId || 'unknown'}`);
        this.emit(EnhancedClaudeEvent.CACHE_HIT, { 
          summaryId,
          cacheKey: options.cacheKey
        });
        return cachedResult;
      }
      
      // Set pending entry in cache
      if (options.summaryId) {
        summaryCache.setPending(options.cacheKey, options.summaryId);
      }
      
      this.emit(EnhancedClaudeEvent.CACHE_MISS, { 
        summaryId,
        cacheKey: options.cacheKey
      });
    }
    
    try {
      // Process document content into chunks
      const { chunks, isChunked, chunkCount } = processDocumentContent(
        documentContent,
        filingType,
        maxTokens
      );
      
      // If we should process all chunks and there are multiple chunks
      if (options.processAllChunks && isChunked && chunkCount > 1) {
        componentLogger.info(`Processing ${chunkCount} chunks for filing ${options.filingId || 'unknown'}`);
        this.emit(EnhancedClaudeEvent.CHUNK_START, { 
          summaryId,
          chunkCount
        });
        
        // Process all chunks and combine results
        const result = await processAllChunks(chunks, filingType, options);
        
        // Update cache if enabled
        if (options.useCache && options.cacheKey) {
          summaryCache.updateStatus(
            options.cacheKey,
            'COMPLETED',
            result
          );
        }
        
        this.emit(EnhancedClaudeEvent.CHUNK_COMPLETE, { 
          summaryId,
          chunkCount,
          result
        });
        
        return result;
      }
      
      // Otherwise, just process the first chunk (backward compatibility)
      componentLogger.info(`Processing single chunk for filing ${options.filingId || 'unknown'}`);
      
      // We're not using the enhanced chunking, so delegate to the original summarize function
      // This will be handled by the caller (summarizeFiling)
      return {
        summaryId,
        summaryText: 'Document processed but not summarized',
        duration: 0,
        isPartial: true
      };
    } catch (error) {
      // Handle chunking errors
      componentLogger.error(`Error processing document: ${error instanceof Error ? error.message : String(error)}`);
      
      // Update cache if enabled
      if (options.useCache && options.cacheKey) {
        summaryCache.updateStatus(
          options.cacheKey,
          'FAILED',
          undefined,
          error instanceof Error ? error.message : String(error)
        );
      }
      
      this.emit(EnhancedClaudeEvent.CHUNK_ERROR, { 
        summaryId,
        error: error instanceof Error ? error : new Error(String(error))
      });
      
      // Re-throw the error
      throw error;
    }
  }
  
  /**
   * Process a batch of documents in parallel
   * @param jobs Array of batch jobs
   * @param concurrencyLimit Maximum number of concurrent jobs
   * @returns Batch results
   */
  async processBatch(jobs: BatchJob[], concurrencyLimit?: number): Promise<SummarizationResult[]> {
    // Set concurrency limit if specified
    if (concurrencyLimit !== undefined) {
      batchProcessor.setConcurrencyLimit(concurrencyLimit);
    }
    
    const batchId = `batch-${Date.now()}`;
    const totalJobs = jobs.length;
    
    try {
      // Emit batch start event
      this.emit(EnhancedClaudeEvent.BATCH_START, { 
        batchId,
        totalJobs
      });
      
      // Process the batch
      const batchResults = await batchProcessor.processBatch(jobs);
      
      // Track completed jobs
      let completedJobs = 0;
      
      // Set up progress tracking
      const progressInterval = setInterval(() => {
        const activeJobs = batchProcessor.getActiveJobs();
        completedJobs = totalJobs - activeJobs.length;
        
        // Emit progress event
        this.emit(EnhancedClaudeEvent.BATCH_PROGRESS, { 
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
      
      // Emit batch complete event
      this.emit(EnhancedClaudeEvent.BATCH_COMPLETE, { 
        batchId,
        results: batchResults.results,
        errors: batchResults.errors,
        processingTimeMs: batchResults.processingTimeMs
      });
      
      // Return successful results
      return batchResults.results;
      
    } catch (error) {
      // Handle batch errors
      componentLogger.error(`Error processing batch: ${error instanceof Error ? error.message : String(error)}`);
      
      // Emit batch error event
      this.emit(EnhancedClaudeEvent.BATCH_ERROR, { 
        batchId,
        error: error instanceof Error ? error : new Error(String(error))
      });
      
      // Re-throw the error
      throw error;
    }
  }
  
  /**
   * Check the cache for a summary
   * @param key Cache key
   * @returns Cached result or null
   */
  private async checkCache(key: SummaryCacheKey): Promise<SummarizationResult | null> {
    try {
      const cacheEntry = await summaryCache.checkCache(key);
      
      if (cacheEntry && cacheEntry.status === 'COMPLETED' && cacheEntry.result) {
        componentLogger.debug(`Cache hit for ${key.formType}:${key.cik}:${key.accessionNumber}`);
        monitoring.incrementCounter('ai.cache.hits', 1);
        return cacheEntry.result;
      }
      
      componentLogger.debug(`Cache miss for ${key.formType}:${key.cik}:${key.accessionNumber}`);
      monitoring.incrementCounter('ai.cache.misses', 1);
      return null;
    } catch (error) {
      componentLogger.warn(`Error checking cache: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
  
  /**
   * Convert a summarization result to a Claude response
   * @param result Summarization result
   * @returns Claude response
   */
  private convertSummarizationToClaudeResponse(result: SummarizationResult): ClaudeResponse {
    return {
      id: result.summaryId,
      content: typeof result.summaryText === 'string' ? result.summaryText : JSON.stringify(result.summaryText),
      model: result.modelUsed || 'claude-3-opus-20240229',
      usage: {
        inputTokens: result.inputTokens || 0,
        outputTokens: result.outputTokens || 0
      },
      inputTokens: result.inputTokens || 0,
      outputTokens: result.outputTokens || 0,
      cost: {
        inputCost: (result.cost || 0) * 0.7, // Approximate split
        outputCost: (result.cost || 0) * 0.3,
        totalCost: result.cost || 0
      },
      totalCost: result.cost || 0,
      attempts: result.attempts || 1,
      executionTimeMs: result.duration || 0,
      fallbackUsed: false
    };
  }
  
  /**
   * Get pricing for a Claude model
   * @param model Model name
   * @returns Pricing information
   */
  private getModelPricing(model: string): { inputPrice: number; outputPrice: number } {
    // Pricing per 1000 tokens as of May 2023
    switch (model) {
      case 'claude-3-opus-20240229':
        return { inputPrice: 0.015, outputPrice: 0.075 };
      case 'claude-3-sonnet-20240229':
        return { inputPrice: 0.003, outputPrice: 0.015 };
      case 'claude-3-haiku-20240307':
        return { inputPrice: 0.00025, outputPrice: 0.00125 };
      case 'claude-2.1':
        return { inputPrice: 0.008, outputPrice: 0.024 };
      case 'claude-2.0':
        return { inputPrice: 0.008, outputPrice: 0.024 };
      case 'claude-instant-1.2':
        return { inputPrice: 0.0008, outputPrice: 0.0024 };
      default:
        return { inputPrice: 0.01, outputPrice: 0.03 };
    }
  }
  
  /**
   * Get the base Claude client
   * @returns Base Claude client
   */
  getBaseClient(): ClaudeClient {
    return this.baseClient;
  }
}

// Export a singleton instance
export const enhancedClaudeClient = new EnhancedClaudeClient();
