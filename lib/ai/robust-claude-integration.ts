/**
 * Robust Claude Integration
 * 
 * This module integrates the robust error handling features with the existing Claude client.
 * It provides:
 * - Adaptive retry with exponential backoff and jitter
 * - Rate limit detection and handling
 * - Comprehensive fetch error handling
 * - Fallback summary generation
 */

import { v4 as uuidv4 } from 'uuid';
import { ClaudeClient, ClaudeMessage, ClaudeRequestOptions, ClaudeResponse } from './claude-client';
import { EnhancedClaudeClient } from './enhanced-claude-client';
import { logger } from '../logging';
import { monitoring } from '../monitoring';
import { ApiError, ErrorCode } from '../error-handling';
import { executeWithAdaptiveRetry, AdaptiveRetryConfig, DefaultAdaptiveRetryConfig } from '../error-handling/adaptive-retry';
import { generateFallbackSummary, isSummaryComplete } from './fallback-summary';
import { SummarizationResult } from './summarize';
import { SECFilingType } from './prompts/prompt-types';

/**
 * Enhanced options for robust Claude client
 */
export interface RobustClaudeOptions extends ClaudeRequestOptions {
  // Whether to use adaptive retry (default: true)
  useAdaptiveRetry?: boolean;
  
  // Custom retry configuration
  retryConfig?: Partial<AdaptiveRetryConfig>;
  
  // Whether to generate fallback summary on failure (default: true)
  useFallback?: boolean;
  
  // Context for the request (for logging and monitoring)
  context?: Record<string, unknown>;
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
  options: RobustClaudeOptions = {},
  context: Record<string, unknown> = {}
): Promise<T> {
  const requestId = context.requestId || uuidv4();
  const startTime = Date.now();
  
  // Merge options with defaults
  const mergedOptions: Required<Pick<RobustClaudeOptions, 'useAdaptiveRetry' | 'retryConfig' | 'useFallback'>> = {
    useAdaptiveRetry: true,
    retryConfig: {},
    useFallback: true,
    ...options
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
          monitoring.incrementCounter('ai.claude.retries', 1, {
            attempt: String(attempt),
            errorType: error instanceof ApiError ? error.code : 'unknown'
          });
          
          // Call custom onRetry if provided
          if (mergedOptions.retryConfig?.onRetry) {
            mergedOptions.retryConfig.onRetry(error, attempt, delay, remaining);
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
    
    return result;
  } catch (error: unknown) {
    // Calculate duration
    const duration = Date.now() - startTime;
    
    // Normalize error
    const normalizedError = error instanceof ApiError
      ? error
      : new ApiError(
          ErrorCode.AI_ERROR,
          (error as Error)?.message || 'Claude request failed',
          {
            ...enhancedContext,
            originalError: String(error)
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
    monitoring.incrementCounter('ai.claude.errors', 1, {
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
  options: RobustClaudeOptions = {}
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
        {
          metadata: {
            originalSummary: response.content,
            ...context
          }
        }
      );
    }
    
    // Return successful result
    return {
      summaryId,
      summaryText: response.content,
      modelUsed: response.model,
      cost: response.usage ? (response.usage.inputTokens + response.usage.outputTokens) / 1000 * 0.01 : 0, // Approximate cost
      duration,
      metadata: {
        ...context
      },
      fallbackUsed: false
    };
  } catch (error: unknown) {
    // Calculate duration
    const duration = Date.now() - startTime;
    
    // Log error
    logger.error(`Failed to process document: ${(error as Error)?.message || String(error)}`, {
      ...context,
      duration,
      error
    });
    
    // Generate fallback summary
    return generateFallbackSummary(filingType, error, documentContent, {
      metadata: context
    });
  }
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
 * Enhance an existing Claude client with robust error handling
 * 
 * @param client The Claude client to enhance
 * @returns The enhanced client
 */
export function enhanceWithRobustErrorHandling(client: ClaudeClient): ClaudeClient {
  const originalSendMessage = client.sendMessage.bind(client);
  
  // Override the sendMessage method with robust error handling
  client.sendMessage = async (messages: ClaudeMessage[], options: ClaudeRequestOptions = {}): Promise<ClaudeResponse> => {
    const robustOptions: RobustClaudeOptions = {
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
