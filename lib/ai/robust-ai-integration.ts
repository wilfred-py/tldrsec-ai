/**
 * Robust AI Integration for OpenRouter
 * 
 * This module integrates robust error handling with OpenRouter client.
 * It provides:
 * - Adaptive retry with exponential backoff and jitter
 * - Rate limit detection and handling
 * - Comprehensive fetch error handling
 * - Fallback summary generation for OpenRouter xAI models
 */

import { v4 as uuidv4 } from 'uuid';
import { OpenRouterClient } from './openrouter-client';
import { logger } from '../logging';
import { monitoring } from '../monitoring';
import { ApiError, ErrorCode } from '../error-handling';
import { executeWithAdaptiveRetry, AdaptiveRetryConfig, DefaultAdaptiveRetryConfig } from '../error-handling/adaptive-retry';
import { generateFallbackSummary, isSummaryComplete } from './fallback-summary';
import { SummarizationResult } from './summarize';
import { OpenRouterMessage } from './openrouter-client';
import { SECFilingType } from './prompts/prompt-types';
import { getDefaultModel } from './config';

/**
 * Enhanced options for robust AI client
 */
export interface RobustAIOptions {
  // Whether to use adaptive retry (default: true)
  useAdaptiveRetry?: boolean;
  
  // Custom retry configuration
  retryConfig?: Partial<AdaptiveRetryConfig>;
  
  // Whether to generate fallback summary on failure (default: true)
  useFallback?: boolean;
  
  // Context for the request (for logging and monitoring)
  context?: Record<string, unknown>;
  
  // Model preference for this request
  model?: string;
}

/**
 * Apply robust error handling to an AI API call
 * 
 * @param operation The AI operation to execute with robust error handling
 * @param options Options for robust error handling
 * @param context Context for logging and monitoring
 * @returns The AI response
 */
export async function withRobustErrorHandling<T>(
  operation: () => Promise<T>,
  options: RobustAIOptions = {},
  context: Record<string, unknown> = {}
): Promise<T> {
  const requestId = context.requestId || uuidv4();
  const startTime = Date.now();
  
  // Merge options with defaults
    const mergedOptions: Required<Pick<RobustAIOptions, 'useAdaptiveRetry' | 'retryConfig' | 'useFallback'>> = {
      useAdaptiveRetry: true,
      retryConfig: {},
      useFallback: true,
      ...options
    };
  
  // Enhanced context for logging
    const enhancedContext = {
      requestId,
      model: options.model || getDefaultModel(),
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
          logger.warn(`Retrying AI request (attempt ${attempt}, ${remaining} remaining) after ${delay}ms`, {
            ...enhancedContext,
            error: error.message,
            attempt,
            delay
          });
          
          // Track retry
          monitoring.incrementCounter('ai.openrouter.retries', 1, {
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
    logger.debug(`Completed AI request in ${duration}ms`, {
      ...enhancedContext,
      duration
    });
    
    // Track success
    monitoring.incrementCounter('ai.openrouter.success', 1, {
      model: enhancedContext.model
    });
    
    return result;
  } catch (error: unknown) {
    // Calculate duration
    const duration = Date.now() - startTime;
    
    // Normalize error for OpenRouter
    const normalizedError = error instanceof ApiError
      ? error
      : new ApiError(
          ErrorCode.EXTERNAL_API_ERROR,
          (error as Error)?.message || 'OpenRouter AI request failed',
          {
            ...enhancedContext,
            originalError: String(error),
            errorCode: (error as { code?: string })?.code || 'OPENROUTER_ERROR'
          },
          true,
          requestId
        );
    
    // Log error
    logger.error(`Failed AI request after ${duration}ms: ${normalizedError.message}`, {
      ...enhancedContext,
      duration,
      error: normalizedError,
      statusCode: error.status || 'unknown'
    });
    
    // Track failure
    monitoring.incrementCounter('ai.openrouter.errors', 1, {
      model: enhancedContext.model,
      errorCode: normalizedError.code,
      statusCode: error.status || 'unknown'
    });
    
    // If fallback is disabled, rethrow the error
    if (!mergedOptions.useFallback) {
      throw normalizedError;
    }
    
    // Generate fallback response (if the caller can handle it)
    logger.info(`Generating fallback response for failed AI request`, {
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
 * @param client The OpenRouter client to use
 * @param documentContent The document content to process
 * @param filingType The SEC filing type
 * @param options Options for the request
 * @returns The summarization result
 */
export async function processDocumentWithRobustHandling(
  client: OpenRouterClient,
  documentContent: string,
  filingType: SECFilingType,
  options: RobustAIOptions = {}
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
    // Prepare messages for OpenRouter
    const messages: OpenRouterMessage[] = [
      {
        role: 'user',
        content: `Please summarize the following ${filingType} document:\n\n${documentContent.substring(0, 1800000)}`
      }
    ];
    
    // Send to OpenRouter with robust error handling
    const response = await withRobustErrorHandling(
      () => client.sendMessage(messages, { model: options.model || getDefaultModel() }),
      options,
      context
    );
    
    // Calculate duration
    const duration = Date.now() - startTime;
    
    // Check if the summary is complete and meaningful
    if (!isSummaryComplete(response.content)) {
      logger.warn(`AI returned incomplete summary, generating fallback`, {
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
            model: response.model,
            usage: response.usage,
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
      inputTokens: response.usage?.inputTokens || 0,
      outputTokens: response.usage?.outputTokens || 0,
      cost: response.cost?.totalCost || 0,
      duration,
      fallbackUsed: false
    };
  } catch (error: unknown) {
    // Calculate duration
    const duration = Date.now() - startTime;
    
    // Log error
    logger.error(`Failed to process document: ${(error as Error)?.message || String(error)}`, {
      ...context,
      duration,
      error,
      model: options.model || getDefaultModel()
    });
    
    // Generate fallback summary
    return generateFallbackSummary(filingType, error, documentContent);
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
 * Enhance an existing AI client with robust error handling
 * 
 * @param client The AI client to enhance
 * @returns The enhanced client
 */
export function enhanceWithRobustErrorHandling(client: OpenRouterClient): OpenRouterClient {
  const originalSendMessage = client.sendMessage.bind(client);
  
  // Override the sendMessage method with robust error handling
  client.sendMessage = async (messages: unknown[], options: Record<string, unknown> = {}): Promise<unknown> => {
      const robustOptions: RobustAIOptions = {
        model: options.model || getDefaultModel(),
        ...options,
        useAdaptiveRetry: true,
        useFallback: true
      };
    
    try {
      return await withRobustErrorHandling(
        () => originalSendMessage(messages, { ...options, ...robustOptions }),
        robustOptions,
        { messageCount: messages.length }
      );
    } catch (error) {
      // Create a basic fallback response if withRobustErrorHandling rethrows
      const requestId = uuidv4();
      const fallbackResponse = {
        id: requestId,
        content: `I apologize, but I'm currently experiencing technical difficulties. Please try again in a few moments.`,
        model: robustOptions.model || getDefaultModel(),
        usage: {
          inputTokens: 0,
          outputTokens: 0
        },
        cost: {
          totalCost: 0
        }
      };
      
      // Track fallback usage
      safeRecordMetric('ai.openrouter.fallbacks', 1, {
        model: robustOptions.model,
        errorType: error instanceof ApiError ? error.code : 'unknown'
      });
      
      return fallbackResponse;
    }
  };
  
  return client;
}
