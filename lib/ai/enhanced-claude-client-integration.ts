  /**
 * Enhanced Claude Client Integration
 * 
 * This module integrates the robust error handling features with the existing enhanced Claude client.
 * It provides:
 * - Adaptive retry with exponential backoff and jitter
 * - Rate limit detection and handling
 * - Comprehensive fetch error handling
 * - Fallback summary generation
 * - Caching integration
 */

import { v4 as uuidv4 } from 'uuid';
import { ClaudeClient, ClaudeMessage, ClaudeRequestOptions, ClaudeResponse } from './claude-client';
import { EnhancedClaudeClient, EnhancedClaudeOptions, EnhancedClaudeEvent } from './enhanced-claude-client';
import { summaryCache, SummaryCacheKey } from './cache/summary-cache';
import { logger } from '../logging';
import { monitoring } from '../monitoring';
import { ApiError, ErrorCode, ErrorCategory } from '../error-handling';
import { executeWithAdaptiveRetry, AdaptiveRetryConfig, DefaultAdaptiveRetryConfig } from '../error-handling/adaptive-retry';
import { generateFallbackSummary, isSummaryComplete } from './fallback-summary';
import { SummarizationResult } from './summarize';
import { SECFilingType } from './prompts/prompt-types';
import crypto from 'crypto';

/**
 * Generate a hash of an object for use as a cache key
 * @param obj Object to hash
 * @returns Hash string
 */
export function hashObject(obj: any): string {
  const str = JSON.stringify(obj);
  return crypto.createHash('md5').update(str).digest('hex');
}

/**
 * Safe record function for monitoring
 * Handles missing functions and errors gracefully
 */
export function safeRecordMetric(
  metricName: string,
  value: number = 1,
  tags: Record<string, string> = {}
): void {
  try {
    if (typeof monitoring.incrementCounter === 'function') {
      monitoring.incrementCounter(metricName, value, tags);
    }
  } catch (error) {
    logger.warn('Failed to record metric', { metricName, error });
  }
}

/**
 * Safe duration recording function for monitoring
 * Handles missing functions and errors gracefully
 */
export function safeRecordDuration(
  metricName: string,
  durationMs: number,
  tags: Record<string, string> = {}
): void {
  try {
    if (typeof monitoring.recordTiming === 'function') {
      monitoring.recordTiming(metricName, durationMs, tags);
    } else if (typeof monitoring.incrementCounter === 'function') {
      // Use counter as fallback if recordTiming doesn't exist
      monitoring.incrementCounter(`${metricName}.ms`, durationMs, tags);
    }
  } catch (error) {
    logger.warn('Failed to record duration metric', { metricName, error });
  }
}

/**
 * Get a cached result by cache key
 * @param key Cache key or string representation
 * @returns The cached result or null if not found
 */
export async function getFromCache(key: SummaryCacheKey | string): Promise<SummarizationResult | null> {
  return summaryCache.get(key);
}

/**
 * Set a result in the cache
 * @param key Cache key or string representation
 * @param result The result to cache
 */
export async function saveToCache(key: SummaryCacheKey | string, result: SummarizationResult): Promise<void> {
  return summaryCache.set(key, result);
}

/**
 * Apply robust error handling to a Claude API call
 * 
 * @param operation The Claude operation to execute with robust error handling
 * @param options Options for robust error handling
 * @param context Context for logging and monitoring
 * @returns The Claude response
 */
export async function withRobustErrorHandling<T>(
  operation: () => Promise<T>,
  options: EnhancedClaudeOptions = {},
  context: Record<string, any> = {}
): Promise<T> {
  const requestId = context.requestId || uuidv4();
  const startTime = Date.now();
  
  // Merge options with defaults
  const mergedOptions: Required<Pick<EnhancedClaudeOptions, 'useAdaptiveRetry' | 'retryConfig' | 'useFallback'>> = {
    useAdaptiveRetry: options.useAdaptiveRetry !== false, // Default to true
    retryConfig: options.retryConfig || {},
    useFallback: options.useFallback !== false, // Default to true
  };
  
  // Enhanced context for logging
  const enhancedContext = {
    requestId,
    ...context
  };
  
  try {
    // Execute with appropriate retry strategy
    let result: T;
    
    if (mergedOptions.useAdaptiveRetry) {
      // Create adaptive retry config
      const adaptiveRetryConfig: AdaptiveRetryConfig = {
        ...DefaultAdaptiveRetryConfig,
        ...mergedOptions.retryConfig,
        onRetry: (error, attempt, delay, remaining) => {
          logger.warn(`Retrying Claude request (attempt ${attempt}, ${remaining} remaining) after ${delay}ms`, {
            ...enhancedContext,
            error: error.message,
            attempt,
            delay
          });
          
          // Track retry
          safeRecordMetric('ai.claude.errors', 1, {
            errorCode: error instanceof ApiError ? error.code : 'UNKNOWN',
            errorCategory: error instanceof ApiError ? error.category : 'AI_ERROR'
          });
          
          // Call custom onRetry if provided
          if (mergedOptions.retryConfig?.onRetry) {
            // Handle different function signatures
            if (mergedOptions.retryConfig.onRetry.length >= 4) {
              mergedOptions.retryConfig.onRetry(error, attempt, delay, remaining);
            } else {
              // @ts-ignore - Handle legacy retry function with 3 params
              mergedOptions.retryConfig.onRetry(error, attempt, delay);
            }
          }
        }
      };
      
      // Execute with adaptive retry
      result = await executeWithAdaptiveRetry(operation, adaptiveRetryConfig, enhancedContext);
    } else {
      // Execute without retry
      result = await operation();
    }
    
    // Calculate duration
    const duration = Date.now() - startTime;
    
    // Log success
    logger.debug(`Completed Claude request in ${duration}ms`, {
      ...enhancedContext,
      duration
    });
    
    // Record duration
    safeRecordDuration('ai.claude.request', duration, {
      success: 'true'
    });
    
    return result;
  } catch (error: any) {
    // Calculate duration
    const duration = Date.now() - startTime;
    
    // Normalize error
    const normalizedError = error instanceof ApiError
      ? error
      : new ApiError(
          ErrorCode.AI_ERROR,
          error.message || 'Claude request failed',
          {
            ...enhancedContext,
            originalError: error.toString()
          },
          true,
          requestId
        );
    
    // Log error
    logger.error(`Failed Claude request after ${duration}ms: ${normalizedError.message}`, {
      ...enhancedContext,
      duration,
      error: normalizedError
    });
    
    // Track failure
    safeRecordMetric('ai.claude.errors', 1, {
      errorCode: normalizedError.code
    });
    
    // Record duration
    safeRecordDuration('ai.claude.request', duration, {
      success: 'false',
      errorCode: normalizedError.code
    });
    
    // If fallback is disabled, rethrow the error
    if (!mergedOptions.useFallback) {
      throw normalizedError;
    }
    
    // Generate fallback response (if the caller can handle it)
    logger.info(`Generating fallback response for failed Claude request`, {
      ...enhancedContext,
      errorCode: normalizedError.code
    });
    
    // Rethrow the error for the caller to handle with fallback logic
    throw normalizedError;
  }
}

/**
 * Process a document with robust error handling and fallback
 * 
 * @param client The Claude client to use
 * @param documentContent The document content to process
 * @param filingType The SEC filing type
 * @param options Options for the request
 * @returns The summarization result
 */
export async function processDocumentWithRobustHandling(
  client: ClaudeClient | EnhancedClaudeClient,
  documentContent: string,
  filingType: SECFilingType,
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
  logger.debug(`Starting document processing for ${filingType}`, context);
  
  try {
    // Create messages for Claude
    const messages: ClaudeMessage[] = [
      {
        role: 'user',
        content: `Please summarize the following ${filingType} document:\n\n${documentContent}`
      }
    ];
    
    // Send to Claude with robust error handling
    const response = await withRobustErrorHandling(
      () => client.sendMessage(messages, options),
      options,
      context
    );
    
    // Calculate duration
    const duration = Date.now() - startTime;
    
    // Check if the summary is complete and meaningful
    if (!isSummaryComplete(response.content)) {
      logger.warn(`Claude returned incomplete summary, generating fallback`, {
        ...context,
        summaryLength: response.content.length
      });
      
      // Generate fallback summary
      return generateFallbackSummary(
        filingType,
        new Error('Incomplete summary returned'),
        documentContent,
        { metadata: context }
      );
    }
    
    // Return successful result
    return {
      summaryId,
      summary: response.content,
      summaryText: response.content,
      summaryJSON: {}, // Empty object as fallback
      modelUsed: response.model,
      model: response.model, // For backwards compatibility
      inputTokens: response.usage?.inputTokens || 0,
      outputTokens: response.usage?.outputTokens || 0,
      tokensUsed: (response.usage?.inputTokens || 0) + (response.usage?.outputTokens || 0),
      cost: response.usage ? 
        (response.usage.inputTokens * 0.003 + response.usage.outputTokens * 0.015) / 1000 : 0, // Approximate cost
      duration,
      processingTimeMs: duration
    };
  } catch (error: any) {
    // Calculate duration
    const duration = Date.now() - startTime;
    
    // Log error
    logger.error(`Failed to process document: ${error.message}`, {
      ...context,
      duration,
      error
    });
    
    // Generate fallback summary
    return generateFallbackSummary(filingType, error, documentContent, { metadata: context });
  }
}

/**
 * Enhance an existing Claude client with robust error handling
 * 
 * @param client The Claude client to enhance
 * @returns The enhanced client
 */
export function enhanceWithRobustErrorHandling(client: ClaudeClient): ClaudeClient {
  const originalSendMessage = client.sendMessage.bind(client);
  
  // Override the sendMessage method with robust error handling
  client.sendMessage = async (messages: ClaudeMessage[], options: ClaudeRequestOptions = {}): Promise<ClaudeResponse> => {
    const robustOptions: EnhancedClaudeOptions = {
      ...options,
      useAdaptiveRetry: true,
      useFallback: true
    };
    
    try {
      return await withRobustErrorHandling(
        () => originalSendMessage(messages, options),
        robustOptions,
        { messageCount: messages.length }
      );
    } catch (error) {
      // Create a basic fallback response if withRobustErrorHandling rethrows
      const requestId = uuidv4();
      const fallbackResponse: ClaudeResponse = {
        id: requestId,
        content: `I apologize, but I'm currently experiencing technical difficulties. Please try again in a few moments.`,
        model: options.model || 'claude-sonnet-4-20250514',
        usage: {
          inputTokens: 0,
          outputTokens: 0
        },
        cost: {
          inputCost: 0,
          outputCost: 0,
          totalCost: 0
        }
      };
      
      // Track fallback usage
      safeRecordMetric('ai.claude.fallbacks', 1, {
        errorType: error instanceof ApiError ? error.code : 'unknown'
      });
      
      return fallbackResponse;
    }
  };
  
  return client;
}

/**
 * Apply the robust error handling integration to an enhanced Claude client
 * 
 * @param client The enhanced Claude client to integrate with
 */
export function integrateRobustErrorHandling(client: EnhancedClaudeClient): void {
  // Add utility methods to the client
  (client as any).hashObject = hashObject;
  (client as any).getFromCache = getFromCache;
  (client as any).saveToCache = saveToCache;
  
  // Enhance the base client with robust error handling
  // Access the base client using type assertion since TypeScript doesn't know about this method
  const baseClient = (client as any).getBaseClient ? (client as any).getBaseClient() : client;
  enhanceWithRobustErrorHandling(baseClient);
  
  // Log integration
  logger.info('Integrated robust error handling with enhanced Claude client');
}

/**
 * Create a new enhanced Claude client with robust error handling
 * 
 * @returns A new enhanced Claude client with robust error handling
 */
export function createRobustEnhancedClaudeClient(): EnhancedClaudeClient {
  // Create a new enhanced client
  const client = new EnhancedClaudeClient();
  
  // Apply robust error handling
  integrateRobustErrorHandling(client);
  
  return client;
}

// Export a singleton instance with robust error handling
export const robustEnhancedClaudeClient = createRobustEnhancedClaudeClient();
