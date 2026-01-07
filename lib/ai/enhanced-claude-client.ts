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

import { openRouterClient, OpenRouterMessage, OpenRouterRequestOptions, OpenRouterResponse, OpenRouterClient } from './openrouter-client';
import { StreamHandler } from './streaming/stream-handler';
import { summaryCache, SummaryCacheKey } from './cache/summary-cache';
import { batchProcessor, BatchJob } from './batch/batch-processor';
import { processAllChunks } from './chunking/enhanced-chunker';
import { SummarizationResult } from './summarize';
import { SECFilingType } from './prompts/prompt-types';
import { logger } from '../logging';
import { monitoring } from '../monitoring';
import { getClaudeModel } from './config';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { ApiError, ErrorCode } from '../error-handling';
import { executeWithRetry } from '../error-handling/retry';
import { executeWithAdaptiveRetry, AdaptiveRetryConfig, DefaultAdaptiveRetryConfig } from '../error-handling/adaptive-retry';
import { generateFallbackSummary } from './fallback-summary';

// Logger for this component
const componentLogger = logger.child('enhanced-claude');

/**
 * Enhanced options for Claude requests
 */
export interface EnhancedClaudeOptions extends OpenRouterRequestOptions {
  useStreaming?: boolean;
  useCache?: boolean;
  processAllChunks?: boolean;
  concurrencyLimit?: number;
  streamHandler?: StreamHandler;
  cacheKey?: SummaryCacheKey;
  chunkMaxTokens?: number;
  useRetry?: boolean;
  useAdaptiveRetry?: boolean;
  retryConfig?: Partial<AdaptiveRetryConfig>;
  useFallback?: boolean;
  maxTokensPerRequest?: number;
  cacheTtl?: number;
  context?: Record<string, unknown>;
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
  private baseClient: OpenRouterClient;

  /**
   * Create a new enhanced Claude client
   * @param baseClient Optional base Claude client to use
   */
  constructor(baseClient?: OpenRouterClient) {
    super();
    this.baseClient = baseClient || openRouterClient;
    componentLogger.info('Enhanced OpenRouter client initialized');
  }

  /**
   * Generate a cache key for a Claude request
   * @param messages Messages to send
   * @param options Options for the request
   * @returns Cache key
   */
  private generateCacheKey(messages: OpenRouterMessage[], options: EnhancedClaudeOptions): string {
    // Create a simplified version of the request for the cache key
    const cacheKeyData = {
      messages: messages.map(m => ({
        role: m.role,
        content: m.content
      })),
      model: options.model,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      system: options.system
    };

    // Generate a hash of the request data
    return this.hashObject(cacheKeyData);
  }

  /**
   * Generate a hash of an object for use as a cache key
   * @param obj Object to hash
   * @returns Hash string
   */
  private hashObject(obj: unknown): string {
    // Simple hash function for objects
    const str = JSON.stringify(obj);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * Estimate the number of tokens in the input messages
   * @param messages Array of messages
   * @returns Estimated token count
   */
  private estimateInputTokens(messages: OpenRouterMessage[]): number {
    // Simple estimation based on character count (1 token ~= 4 characters)
    const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
    return Math.ceil(totalChars / 4);
  }

  /**
   * Send a message to Claude with robust error handling
   * @param messages Array of messages to send
   * @param options Options for the request
   * @returns Claude response
   */
  async sendMessage(
    messages: OpenRouterMessage[],
    options: EnhancedClaudeOptions = {}
  ): Promise<OpenRouterResponse> {
    const requestId = uuidv4();
    const startTime = Date.now();
    
    // Merge default options
    const mergedOptions = {
      model: getClaudeModel(),
      maxTokens: 4000,
      temperature: 0.2, // Standardized for SEC filing summarization consistency
      useCache: true,
      useRetry: true,
      useAdaptiveRetry: true,
      ...options
    };
    
    // Check cache if enabled
    if (mergedOptions.useCache) {
      const cacheKey = mergedOptions.cacheKey || this.generateCacheKey(messages, mergedOptions);
      
      try {
        const cachedResponse = await summaryCache.checkCache({
          cacheKey,
          ttl: mergedOptions.cacheTtl || 86400 // Default 24 hours
        });
        
        if (cachedResponse) {
          componentLogger.info(`Cache hit for request ${requestId}`);
          
          // Emit cache hit event
          this.emit(EnhancedClaudeEvent.CACHE_HIT, {
            requestId,
            cacheKey,
            response: cachedResponse
          });
          
          // Return cached response
          return {
            id: cachedResponse.id || requestId,
            content: cachedResponse.content,
            model: cachedResponse.model || mergedOptions.model,
            usage: cachedResponse.usage || {
              inputTokens: this.estimateInputTokens(messages),
              outputTokens: Math.ceil(cachedResponse.content.length / 4)
            },
            inputTokens: cachedResponse.inputTokens || this.estimateInputTokens(messages),
            outputTokens: cachedResponse.outputTokens || Math.ceil(cachedResponse.content.length / 4),
            cost: cachedResponse.cost || 0,
            totalCost: cachedResponse.totalCost || 0,
            attempts: 1,
            executionTimeMs: 0,
            fromCache: true
          };
        }
        
        // Emit cache miss event
        this.emit(EnhancedClaudeEvent.CACHE_MISS, {
          requestId,
          cacheKey
        });
      } catch (cacheError) {
        componentLogger.warn(`Cache error for request ${requestId}: ${cacheError instanceof Error ? cacheError.message : String(cacheError)}`);
      }
    }
    
    // Define the Claude operation
    const claudeOperation = async (): Promise<OpenRouterResponse> => {
      componentLogger.info(`Sending request ${requestId} to Claude API`);
      
      // Send the request to Claude
      const response = await this.baseClient.sendMessage(messages, mergedOptions);
      
      // Cache the response if caching is enabled
      if (mergedOptions.useCache) {
        try {
          const cacheKey = mergedOptions.cacheKey || this.generateCacheKey(messages, mergedOptions);
          await summaryCache.cacheResponse(cacheKey, response, mergedOptions.cacheTtl);
        } catch (cacheError) {
          componentLogger.warn(`Failed to cache response for request ${requestId}: ${cacheError instanceof Error ? cacheError.message : String(cacheError)}`);
        }
      }
      
      return response;
    };
    
    try {
      let response: OpenRouterResponse;
      
      // Use adaptive retry if enabled
      if (mergedOptions.useRetry && mergedOptions.useAdaptiveRetry) {
        const retryConfig: AdaptiveRetryConfig = {
          ...DefaultAdaptiveRetryConfig,
          ...(mergedOptions.retryConfig || {}),
          onRetry: (error, attempt, delay, remaining) => {
            componentLogger.warn(`Retry ${attempt} for request ${requestId} after ${delay}ms. Error: ${error instanceof Error ? error.message : String(error)}`);
            
            // Log error details
            componentLogger.debug(`Retry details for request ${requestId}:`, {
              attempt,
              delay,
              remaining,
              errorType: error instanceof ApiError ? error.code : 'unknown'
            });

            // Emit retry event
            this.emit('retry', {
              requestId,
              model: mergedOptions.model,
              attempt,
              delay,
              remaining,
              error
            });
            
            // Call user-provided onRetry if available
            if (mergedOptions.retryConfig?.onRetry) {
              mergedOptions.retryConfig.onRetry(error, attempt, delay, remaining);
            }
          }
        };
        
        response = await executeWithAdaptiveRetry(
          claudeOperation,
          retryConfig
        );
      } 
      // Use simple retry if enabled
      else if (mergedOptions.useRetry) {
        response = await executeWithRetry(
          claudeOperation,
          {
            maxRetries: 3,
            retryDelay: 1000,
            shouldRetry: (error) => {
              // Retry on rate limit errors and temporary server errors
              if (error instanceof ApiError) {
                return error.code === ErrorCode.RATE_LIMIT || 
                       error.code === ErrorCode.SERVER_ERROR ||
                       error.code === ErrorCode.TIMEOUT;
              }
              return false;
            }
          }
        );
      } 
      // No retry
      else {
        response = await claudeOperation();
      }
      
      // Calculate execution time
      const executionTimeMs = Date.now() - startTime;
      
      // Add execution time to response
      response.executionTimeMs = executionTimeMs;
      
      // Log success
      componentLogger.info(`Request ${requestId} completed in ${executionTimeMs}ms`);
      
      // Track metrics
      monitoring.recordAiApiCall(
        'claude', 
        mergedOptions.model, 
        true, 
        {
          input_tokens: response.inputTokens,
          output_tokens: response.outputTokens,
          duration_ms: executionTimeMs.toString(),
          cost: response.totalCost.toFixed(6)
        }
      );
      
      return response;
    } catch (error) {
      // Calculate execution time for failed request
      const executionTimeMs = Date.now() - startTime;
      
      // Log error
      componentLogger.error(`Request ${requestId} failed after ${executionTimeMs}ms: ${error instanceof Error ? error.message : String(error)}`);
      
      // Track metrics for failed request
      monitoring.recordAiApiCall(
        'claude', 
        mergedOptions.model, 
        false, 
        {
          error_type: error instanceof ApiError ? error.code : 'unknown',
          duration_ms: executionTimeMs.toString()
        }
      );
      
      // Re-throw the error
      throw error;
    }
  }

  /**
   * Process a document with Claude with robust error handling and fallback
   * @param documentContent Document content to process
   * @param filingType SEC filing type (optional)
   * @param options Options for the request
   * @returns Summarization result
   */
  async processDocument(
    documentContent: string,
    filingType?: string,
    options: EnhancedClaudeOptions = {}
  ): Promise<SummarizationResult> {
    const summaryId = options.summaryId || uuidv4();
    const startTime = Date.now();
    
    try {
      componentLogger.info(`Processing document for filing ${options.filingId || 'unknown'}`);
      
      // Check if we should process all chunks
      if (options.processAllChunks) {
        componentLogger.info(`Processing all chunks for filing ${options.filingId || 'unknown'}`);
        
        // Get the chunks
        const chunks = await processAllChunks(documentContent, {
          maxTokens: options.chunkMaxTokens || 100000,
          overlapTokens: 1000
        });
        
        componentLogger.info(`Generated ${chunks.length} chunks for filing ${options.filingId || 'unknown'}`);
        
        // If there's only one chunk, just process it directly
        if (chunks.length === 1) {
          componentLogger.info(`Only one chunk for filing ${options.filingId || 'unknown'}, processing directly`);
          
          // Process the single chunk
          return this.processDocument(chunks[0], filingType, {
            ...options,
            processAllChunks: false
          });
        }
        
        // Create batch jobs for each chunk
        const batchJobs = chunks.map((chunk, index) => ({
          id: `${summaryId}-chunk-${index}`,
          content: chunk,
          filingType,
          options: {
            ...options,
            summaryId: `${summaryId}-chunk-${index}`,
            processAllChunks: false
          }
        }));
        
        // Process the batch
        const results = await this.processBatch(batchJobs, options.concurrencyLimit);
        
        // Combine the results
        // This is a placeholder - in a real implementation, you would combine the summaries intelligently
        const combinedResult: SummarizationResult = {
          summaryId,
          summaryText: results.map(r => r.summaryText).join('\n\n'),
          inputTokens: results.reduce((sum, r) => sum + (r.inputTokens || 0), 0),
          outputTokens: results.reduce((sum, r) => sum + (r.outputTokens || 0), 0),
          cost: results.reduce((sum, r) => sum + (r.cost || 0), 0),
          duration: Date.now() - startTime,
          modelUsed: results[0]?.modelUsed,
          attempts: results.reduce((sum, r) => sum + (r.attempts || 1), 0)
        };
        
        return combinedResult;
      }
      
      // Otherwise, just process the first chunk (backward compatibility)
      componentLogger.info(`Processing single chunk for filing ${options.filingId || 'unknown'}`);
      
      // We're not using the enhanced chunking, so delegate to the original summarize function
      // This will be handled by the caller (summarizeFiling)
      return {
        summaryId,
        summaryText: 'Document processed but not summarized',
        duration: 0,
        inputTokens: 0,
        outputTokens: 0,
        cost: 0
      };
    } catch (error) {
      componentLogger.error(`Error processing document: ${error instanceof Error ? error.message : String(error)}`);
      
      // If fallback is enabled, try to generate a fallback summary
      if (options.useFallback) {
        try {
          componentLogger.info(`Attempting fallback summary generation for filing ${options.filingId || 'unknown'}`);
          
          const fallbackResult = await generateFallbackSummary(documentContent, filingType as SECFilingType);
          
          return {
            ...fallbackResult,
            summaryId,
            duration: Date.now() - startTime,
            fallbackUsed: true
          };
        } catch (fallbackError) {
          componentLogger.error(`Fallback summary generation failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
        }
      }
      
      // Re-throw the original error
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
      
      // Log batch completion
      componentLogger.info(`Batch ${batchId} completed: ${batchResults.results.length} successful, ${batchResults.errors.length} failed`);
      
      // Track batch metrics with proper cleanup
      const { resourceCleanupSystem } = await import('../resources/automatic-cleanup-system');
      const batchContextId = resourceCleanupSystem.createContext('batch', {
        batchId,
        resultsCount: batchResults.results.length,
        errorsCount: batchResults.errors.length
      });
      
      const { id: intervalId } = resourceCleanupSystem.createInterval(() => {
        try {
          monitoring.recordBatchProcessing(
            'document_processing',
            batchResults.results.length,
            batchResults.errors.length,
            batchResults.processingTimeMs
          );
        } catch (monitoringError) {
          componentLogger.warn(`Failed to record batch metrics: ${monitoringError instanceof Error ? monitoringError.message : String(monitoringError)}`);
        }
      }, 1000, batchContextId);
      
      // Clean up after 30 seconds to prevent long-running intervals
      resourceCleanupSystem.createTimeout(() => {
        resourceCleanupSystem.clearInterval(intervalId);
        resourceCleanupSystem.cleanupContext(batchContextId);
      }, 30000, batchContextId);
      
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
  private convertSummarizationToClaudeResponse(result: SummarizationResult): OpenRouterResponse {
    return {
      id: result.summaryId,
      content: typeof result.summaryText === 'string' ? result.summaryText : JSON.stringify(result.summaryText),
      model: result.modelUsed || getClaudeModel(),
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
    interface ModelPricing {
      inputPrice: number;
      outputPrice: number;
    }

    const defaultPricing: ModelPricing = {
      inputPrice: 0.003, // $0.003 per 1000 tokens
      outputPrice: 0.015 // $0.015 per 1000 tokens
    };
    
    const pricingMap: Record<string, ModelPricing> = {
      'claude-3-opus-20240229': { inputPrice: 0.015, outputPrice: 0.075 },
      'claude-3-sonnet-20240229': { inputPrice: 0.003, outputPrice: 0.015 },
      'claude-3-haiku-20240307': { inputPrice: 0.00025, outputPrice: 0.00125 },
      'claude-2.1': { inputPrice: 0.008, outputPrice: 0.024 },
      'claude-2.0': { inputPrice: 0.008, outputPrice: 0.024 },
      'claude-instant-1.2': { inputPrice: 0.0008, outputPrice: 0.0024 },
      'claude-sonnet-4-20250514': { inputPrice: 0.003, outputPrice: 0.015 }
    };
    
    const matchingModel = Object.keys(pricingMap).find(key => model.includes(key));
    return matchingModel ? pricingMap[matchingModel] : defaultPricing;
  }
  
  /**
   * Get the base Claude client
   * @returns Base Claude client
   */
  getBaseClient(): OpenRouterClient {
    return this.baseClient;
  }
}

// Export a singleton instance
export const enhancedClaudeClient = new EnhancedClaudeClient();
