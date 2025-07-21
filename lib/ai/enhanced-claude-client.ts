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
import { executeWithRetry } from '../error-handling/retry';
import { executeWithAdaptiveRetry, AdaptiveRetryConfig, DefaultAdaptiveRetryConfig } from '../error-handling/adaptive-retry';
import { enhancedFetch } from '../network/enhanced-fetch';
import { generateFallbackSummary, isSummaryComplete } from './fallback-summary';

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
  useRetry?: boolean;
  useAdaptiveRetry?: boolean;
  retryConfig?: Partial<AdaptiveRetryConfig>;
  useFallback?: boolean;
  maxTokensPerRequest?: number;
  cacheTtl?: number;
  context?: Record<string, any>;
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
   * Generate a cache key for a Claude request
   * @param messages Messages to send
   * @param options Options for the request
   * @returns Cache key
   */
  private generateCacheKey(messages: ClaudeMessage[], options: EnhancedClaudeOptions): string {
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
  private hashObject(obj: any): string {
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
  private estimateInputTokens(messages: ClaudeMessage[]): number {
    return messages.reduce((total, message) => {
      // Rough estimate: 1 token per 4 characters
      return total + Math.ceil(message.content.length / 4);
    }, 0);
  }

  /**
   * Send a message to Claude with robust error handling
   * @param messages Array of messages to send
   * @param options Options for the request
   * @returns Claude response
   */
  async sendMessage(
    messages: ClaudeMessage[],
    options: EnhancedClaudeOptions = {}
  ): Promise<ClaudeResponse> {
    const requestId = uuidv4();
    const startTime = Date.now();

    // Merge options with defaults
    const mergedOptions: Required<EnhancedClaudeOptions> = {
      model: 'claude-sonnet-4-20250514',
      maxTokens: 4096,
      temperature: 0.7,
      useCache: true,
      useStreaming: false,
      useRetry: true,
      useAdaptiveRetry: true,
      retryConfig: {},
      useFallback: true,
      maxTokensPerRequest: 100000,
      cacheKey: '',
      cacheTtl: 86400, // 24 hours
      context: {},
      ...options
    };

    // Generate cache key if not provided
    if (!mergedOptions.cacheKey && mergedOptions.useCache) {
      mergedOptions.cacheKey = this.generateCacheKey(messages, mergedOptions);
    }

    // Create context for logging and monitoring
    const context = {
      requestId,
      model: mergedOptions.model,
      messageCount: messages.length,
      useCache: mergedOptions.useCache,
      useStreaming: mergedOptions.useStreaming,
      useRetry: mergedOptions.useRetry,
      useAdaptiveRetry: mergedOptions.useAdaptiveRetry,
      cacheKey: mergedOptions.cacheKey,
      inputTokenEstimate: this.estimateInputTokens(messages),
      ...mergedOptions.context
    };

    // Check cache if enabled
    if (mergedOptions.useCache && mergedOptions.cacheKey) {
      const cachedResponse = await this.getFromCache(mergedOptions.cacheKey);
      if (cachedResponse) {
        logger.debug(`Cache hit for Claude request`, {
          ...context,
          cacheHit: true
        });

        // Track cache hit
        monitoring.incrementCounter('ai.claude.cache.hits', 1, {
          model: mergedOptions.model
        });

        return cachedResponse;
      }

      // Track cache miss
      monitoring.incrementCounter('ai.claude.cache.misses', 1, {
        model: mergedOptions.model
      });

      logger.debug(`Cache miss for Claude request`, {
        ...context,
        cacheHit: false
      });
    }

    // Log request start
    logger.debug(`Starting Claude request with model ${mergedOptions.model}`, context);

    // Track request start
    monitoring.incrementCounter('ai.claude.requests', 1, {
      model: mergedOptions.model,
      cached: 'false'
    });

    try {
      // Define the Claude operation
      const claudeOperation = async () => {
        return await this.baseClient.sendMessage(messages, {
          model: mergedOptions.model,
          maxTokens: mergedOptions.maxTokens,
          temperature: mergedOptions.temperature,
          system: mergedOptions.system,
          metadata: {
            ...mergedOptions.metadata,
            requestId
          }
        });
      };

      // Execute with appropriate retry strategy
      let result: ClaudeResponse;

      if (mergedOptions.useAdaptiveRetry && mergedOptions.useRetry) {
        // Create adaptive retry config
        const adaptiveRetryConfig: AdaptiveRetryConfig = {
          ...DefaultAdaptiveRetryConfig,
          ...mergedOptions.retryConfig,
          onRetry: (error, attempt, delay, remaining) => {
            logger.warn(`Retrying Claude request (attempt ${attempt}, ${remaining} remaining) after ${delay}ms`, {
              ...context,
              error: error.message,
              attempt,
              delay
            });

            // Track retry
            monitoring.incrementCounter('ai.claude.retries', 1, {
              model: mergedOptions.model,
              attempt: String(attempt),
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

            // Call custom onRetry if provided
            if (mergedOptions.retryConfig?.onRetry) {
              mergedOptions.retryConfig.onRetry(error, attempt, delay, remaining);
            }
          }
        };

        // Execute with adaptive retry
        result = await executeWithAdaptiveRetry(claudeOperation, adaptiveRetryConfig, context);
      } else if (mergedOptions.useRetry) {
        // Use legacy retry mechanism
        result = await executeWithRetry(claudeOperation, {
          maxRetries: 3,
          retryDelayMs: 1000,
          retryBackoffFactor: 2,
          retryStatusCodes: [429, 500, 502, 503, 504],
          retryableErrors: [
            ErrorCode.QUOTA_EXCEEDED,
            ErrorCode.RATE_LIMITED,
            ErrorCode.NETWORK_ERROR,
            ErrorCode.TIMEOUT_ERROR,
            ErrorCode.SERVICE_UNAVAILABLE
          ]
        });
      } else {
        // Execute without retry
        result = await claudeOperation();
      }

      // Calculate duration
      const duration = Date.now() - startTime;

      // Log success
      logger.debug(`Completed Claude request in ${duration}ms`, {
        ...context,
        duration,
        outputTokens: result.outputTokens,
        totalCost: result.totalCost
      });

      // Track success
      monitoring.recordDuration('ai.claude.duration', duration, {
        model: mergedOptions.model,
        cached: 'false',
        success: 'true'
      });

      // Cache result if enabled
      if (mergedOptions.useCache && mergedOptions.cacheKey) {
        await this.saveToCache(mergedOptions.cacheKey, result, mergedOptions.cacheTtl);
      }

      // Emit success event
      this.emit('success', {
        requestId,
        model: mergedOptions.model,
        duration,
        outputTokens: result.outputTokens,
        totalCost: result.totalCost
      });

      return result;
    } catch (error: any) {
      // Calculate duration
      const duration = Date.now() - startTime;

      // Normalize error
      const normalizedError = error instanceof ApiError
        ? error
        : new ApiError(
            ErrorCode.EXTERNAL_API_ERROR,
            error.message || 'Claude request failed',
            {
              ...context,
              originalError: error.toString()
            },
            true,
            requestId
          );

      // Log error
      logger.error(`Failed Claude request after ${duration}ms: ${normalizedError.message}`, {
        ...context,
        duration,
        error: normalizedError
      });

      // Track failure
      monitoring.recordDuration('ai.claude.duration', duration, {
        model: mergedOptions.model,
        cached: 'false',
        success: 'false',
        errorCode: normalizedError.code
      });

      // Emit error event
      this.emit('error', {
        requestId,
        model: mergedOptions.model,
        duration,
        error: normalizedError
      });

      // If fallback is disabled, rethrow the error
      if (!mergedOptions.useFallback) {
        throw normalizedError;
      }

      // Generate fallback response
      logger.info(`Generating fallback response for failed Claude request`, {
        ...context,
        errorCode: normalizedError.code
      });

      // Create a basic fallback response
      const fallbackResponse: ClaudeResponse = {
        id: requestId,
        content: `I apologize, but I'm currently experiencing technical difficulties. Please try again in a few moments.`,
        model: mergedOptions.model,
        usage: {
          inputTokens: context.inputTokenEstimate,
          outputTokens: 20
        },
        inputTokens: context.inputTokenEstimate,
        outputTokens: 20,
        cost: {
          inputCost: 0,
          outputCost: 0,
          totalCost: 0
        },
        totalCost: 0,
        attempts: 1,
        executionTimeMs: duration,
        fallbackUsed: true
      };

      // Track fallback usage
      monitoring.incrementCounter('ai.claude.fallbacks', 1, {
        model: mergedOptions.model,
        errorCode: normalizedError.code
      });

      // Emit fallback event
      this.emit('fallback', {
        requestId,
        model: mergedOptions.model,
        duration,
        error: normalizedError
      });

      return fallbackResponse;
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
    const summaryId = uuidv4();
    const startTime = Date.now();

    // Create context for logging and monitoring
    const context = {
      summaryId,
      filingType,
      documentLength: documentContent.length,
      ...options.context
    };

    // Log request start
    logger.debug(`Starting document processing${filingType ? ` for ${filingType}` : ''}`, context);

    try {
      // TODO: Implement document chunking and processing logic
      // This would typically involve:
      // 1. Breaking the document into manageable chunks
      // 2. Processing each chunk with Claude
      // 3. Combining the results

      // For now, we'll use a simplified approach
      const messages: ClaudeMessage[] = [
        {
          role: 'user',
          content: `Please summarize the following${filingType ? ` ${filingType}` : ''} document:\n\n${documentContent}`
        }
      ];

      // Send to Claude with robust error handling
      const response = await this.sendMessage(messages, {
        ...options,
        context
      });

      // Calculate duration
      const duration = Date.now() - startTime;

      // Check if the summary is complete and meaningful
      if (response.fallbackUsed || !isSummaryComplete(response.content)) {
        logger.warn(`Claude returned incomplete summary or used fallback, generating structured fallback`, {
          ...context,
          summaryLength: response.content.length,
          fallbackUsed: response.fallbackUsed
        });

        // Generate fallback summary
        if (filingType) {
          return generateFallbackSummary(
            filingType,
            new Error('Incomplete summary returned'),
            documentContent,
            {
              metadata: {
                originalSummary: response.content,
                ...context
              }
            }
          );
        } else {
          // Simple fallback for non-filing documents
          return {
            summaryId,
            summaryText: response.content || 'Unable to generate a complete summary at this time.',
            modelUsed: response.model,
            inputTokens: response.inputTokens,
            outputTokens: response.outputTokens,
            cost: response.totalCost,
            duration,
            metadata: {
              ...context,
              fallbackReason: 'Incomplete summary'
            },
            fallbackUsed: true
          };
        }
      }

      // Return successful result
      return {
        summaryId,
        summaryText: response.content,
        filingType,
        modelUsed: response.model,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        cost: response.totalCost,
        duration,
        metadata: {
          ...context
        },
        fallbackUsed: false
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
      model: result.modelUsed || 'claude-sonnet-4-20250514',
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
  getBaseClient(): ClaudeClient {
    return this.baseClient;
  }
}

// Export a singleton instance
export const enhancedClaudeClient = new EnhancedClaudeClient();
