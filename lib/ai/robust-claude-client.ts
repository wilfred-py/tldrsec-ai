/**
 * Robust Claude Client
 * 
 * Enhanced Claude client with advanced error handling, retry mechanisms, and fallback strategies:
 * - Adaptive retry with rate limit awareness
 * - Robust fetch with comprehensive error handling
 * - Fallback summary generation for failed requests
 * - Detailed logging and monitoring
 */

import { v4 as uuidv4 } from 'uuid';
import { ClaudeClient, ClaudeMessage, ClaudeRequestOptions, ClaudeResponse } from './claude-client';
import { logger } from '../logging';
import { monitoring } from '../monitoring';

// Create a safe wrapper for monitoring functions
const safeMonitoring = {
  recordDuration: function(metric: string, value: number, tags: Record<string, string | boolean> = {}) {
    try {
      if (typeof monitoring.recordTiming === 'function') {
        monitoring.recordTiming(metric, value, tags);
      }
    } catch (error) {
      console.warn('Failed to record timing', { error });
    }
  }
};
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
  
  // Maximum tokens to process in a single request
  maxTokensPerRequest?: number;
  
  // Context for the request (for logging and monitoring)
  context?: Record<string, unknown>;
}

/**
 * Robust Claude client with advanced error handling
 */
export class RobustClaudeClient {
  private baseClient: ClaudeClient;
  private serviceName = 'anthropic-claude-robust';
  
  /**
   * Create a new robust Claude client
   * @param baseClient Optional base Claude client to use
   */
  constructor(baseClient?: ClaudeClient) {
    this.baseClient = baseClient || new ClaudeClient();
    logger.info('Robust Claude client initialized');
  }
  
  /**
   * Send a message to Claude with robust error handling
   * @param messages Array of messages to send
   * @param options Robust options for the request
   * @returns Claude response
   */
  async sendMessage(
    messages: ClaudeMessage[],
    options: RobustClaudeOptions = {}
  ): Promise<ClaudeResponse> {
    const requestId = uuidv4();
    const startTime = Date.now();
    
    // Merge options with defaults
    const mergedOptions: Required<RobustClaudeOptions> = {
      model: 'claude-sonnet-4-20250514',
      maxTokens: 4096,
      temperature: 0.7,
      useAdaptiveRetry: true,
      retryConfig: {},
      useFallback: true,
      maxTokensPerRequest: 100000,
      context: {},
      ...options
    };
    
    // Create context for logging and monitoring
    const context = {
      requestId,
      model: mergedOptions.model,
      messageCount: messages.length,
      inputTokenEstimate: this.estimateInputTokens(messages),
      ...mergedOptions.context
    };
    
    // Log request start
    logger.debug(`Starting Claude request with model ${mergedOptions.model}`, context);
    
    // Track request start
    monitoring.incrementCounter('ai.claude.requests', 1, {
      model: mergedOptions.model
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
      
      // Execute with or without retry
      let result: ClaudeResponse;
      if (mergedOptions.useAdaptiveRetry) {
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
            
            // Call custom onRetry if provided
            if (mergedOptions.retryConfig?.onRetry) {
              mergedOptions.retryConfig.onRetry(error, attempt, delay, remaining);
            }
          }
        };
        
        // Execute with retry
        result = await executeWithAdaptiveRetry(claudeOperation, adaptiveRetryConfig, context);
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
      safeMonitoring.recordDuration('ai.claude.duration', duration, {
        ...context,
        success: 'true'
      });
      
      return result;
    } catch (error: unknown) {
      // Calculate duration
      const duration = Date.now() - startTime;
      
      // Normalize error
      const normalizedError = error instanceof ApiError
        ? error
        : new ApiError(
            ErrorCode.EXTERNAL_API_ERROR,
            (error as Error)?.message || 'Claude request failed',
            {
              ...context,
              originalError: String(error)
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
      safeMonitoring.recordDuration('ai.claude.duration', duration, {
        ...context,
        success: 'false',
        errorCode: normalizedError.code
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
      
      return fallbackResponse;
    }
  }
  
  /**
   * Process a document with robust error handling and fallback
   * @param documentContent Document content to process
   * @param filingType SEC filing type
   * @param options Robust options for the request
   * @returns Summarization result
   */
  async processDocument(
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
      // TODO: Implement document chunking and processing logic
      // This would typically involve:
      // 1. Breaking the document into manageable chunks
      // 2. Processing each chunk with Claude
      // 3. Combining the results
      
      // For now, we'll use a simplified approach
      const messages: ClaudeMessage[] = [
        {
          role: 'user',
          content: `Please summarize the following ${filingType} document:\n\n${documentContent}`
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
   * Get the base Claude client
   * @returns Base Claude client
   */
  getBaseClient(): ClaudeClient {
    return this.baseClient;
  }
}

// Export a singleton instance
export const robustClaudeClient = new RobustClaudeClient();
