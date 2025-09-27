/**
 * Adaptive retry mechanism for AI API calls with rate limit awareness
 * Provides dynamic backoff strategies based on error types and rate limits
 */

import { ApiError, ErrorCode } from './index';
import { logger } from '../logging';
import { monitoring } from '../monitoring';

/**
 * Safe wrapper for monitoring duration metrics to handle missing function
 */
function safeRecordDuration(metric: string, durationMs: number, tags: Record<string, string> = {}): void {
  try {
    if (typeof monitoring.recordTiming === 'function') {
      monitoring.recordTiming(metric, durationMs, tags);
    } else if (typeof monitoring.incrementCounter === 'function') {
      // Fallback to generic counter recording if timing isn't available
      monitoring.incrementCounter(`${metric}.ms`, durationMs, tags);
    }
  } catch (error) {
    logger.warn(`Failed to record duration metric: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Configuration for adaptive retry operations
 */
export interface AdaptiveRetryConfig {
  // Maximum number of retry attempts (default: flexible with cap at 10)
  maxRetries: number;
  
  // Initial delay before first retry in milliseconds (default: 1000ms)
  initialDelayMs: number;
  
  // Maximum delay between retries in milliseconds (default: 60000ms)
  maxDelayMs: number;
  
  // Exponential backoff multiplier (default: 2)
  backoffFactor: number;
  
  // Random jitter factor (0-1) to add to delay (default: 0.2)
  jitterFactor: number;
  
  // Overall timeout for all retries (default: 5 minutes)
  timeoutMs?: number;
  
  // Callback on retry
  onRetry?: (error: Error, attempt: number, delay: number, remainingAttempts: number) => void;
  
  // Callback before retry to allow for custom logic
  beforeRetry?: (error: Error, attempt: number) => Promise<boolean>;
  
  // Callback after all retries are exhausted
  onExhausted?: (error: Error, attempts: number) => void;
}

// Default adaptive retry configuration
export const DefaultAdaptiveRetryConfig: AdaptiveRetryConfig = {
  maxRetries: 5,
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  backoffFactor: 2,
  jitterFactor: 0.2,
  timeoutMs: 300000, // 5 minutes
  onRetry: (error, attempt, delay, remainingAttempts) => {
    logger.warn(`Retry attempt ${attempt} (${remainingAttempts} remaining) after ${delay}ms due to error: ${error.message}`);
    monitoring.incrementCounter('ai.retries', 1, { attempt: String(attempt) });
  },
  onExhausted: (error, attempts) => {
    logger.error(`All ${attempts} retry attempts exhausted. Last error: ${error.message}`);
    monitoring.incrementCounter('ai.retry_exhausted', 1);
  }
};

/**
 * Rate limit detection and handling
 */
interface RateLimitInfo {
  isRateLimited: boolean;
  retryAfterMs?: number;
  remainingTokens?: number;
  resetTimeMs?: number;
}

/**
 * Extract rate limit information from an error
 */
export function extractRateLimitInfo(error: Error): RateLimitInfo {
  const result: RateLimitInfo = {
    isRateLimited: false
  };
  
  // Handle ApiError with rate limit information
  if (error instanceof ApiError && error.code === ErrorCode.AI_QUOTA_EXCEEDED) {
    result.isRateLimited = true;
    
    // Extract retry-after if available
    if (error.retryAfter) {
      result.retryAfterMs = error.retryAfter;
    }
    
    // Extract remaining tokens if available in details
    if (error.details && typeof error.details === 'object' && 'remainingTokens' in error.details) {
      result.remainingTokens = Number(error.details.remainingTokens);
    }
    
    // Extract reset time if available in details
    if (error.details && typeof error.details === 'object' && 'resetTime' in error.details) {
      result.resetTimeMs = new Date(error.details.resetTime as string).getTime();
    }
    
    return result;
  }
  
  // Handle standard Anthropic API errors
  if (error.message?.includes('rate limit') || 
      error.message?.includes('quota exceeded') || 
      error.message?.includes('too many requests')) {
    result.isRateLimited = true;
    
    // Try to extract retry-after from error message
    const retryAfterMatch = error.message.match(/retry after (\d+)/i);
    if (retryAfterMatch && retryAfterMatch[1]) {
      result.retryAfterMs = parseInt(retryAfterMatch[1], 10) * 1000;
    }
    
    return result;
  }
  
  return result;
}

/**
 * Calculate adaptive backoff delay based on error type and rate limit information
 */
export function calculateAdaptiveBackoff(
  error: Error,
  attempt: number,
  config: AdaptiveRetryConfig = DefaultAdaptiveRetryConfig
): number {
  // Check for retryAfter in error details (for 529 Overloaded errors)
  if (error instanceof ApiError && error.details && typeof error.details === 'object') {
    if ('retryAfter' in error.details && typeof error.details.retryAfter === 'number') {
      // Use the retryAfter value from the error details with a small buffer (10%)
      const retryAfter = error.details.retryAfter * 1.1;
      logger.info(`Using explicit retryAfter from error details: ${retryAfter}ms`);
      return Math.min(retryAfter, config.maxDelayMs);
    }
  }
  
  // Check for rate limit information
  const rateLimitInfo = extractRateLimitInfo(error);
  
  // If we have explicit retry-after information, use it
  if (rateLimitInfo.isRateLimited && rateLimitInfo.retryAfterMs) {
    // Add a small buffer to the retry-after time (10%)
    return Math.min(rateLimitInfo.retryAfterMs * 1.1, config.maxDelayMs);
  }
  
  // For rate limits without explicit timing, use a more aggressive backoff
  if (rateLimitInfo.isRateLimited) {
    const baseDelay = config.initialDelayMs * Math.pow(config.backoffFactor, attempt + 1);
    const cappedDelay = Math.min(baseDelay, config.maxDelayMs);
    const jitter = cappedDelay * config.jitterFactor * Math.random();
    return Math.floor(cappedDelay + jitter);
  }
  
  // For other errors, use standard exponential backoff
  const exponentialDelay = config.initialDelayMs * Math.pow(config.backoffFactor, attempt);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);
  const jitter = cappedDelay * config.jitterFactor * Math.random();
  return Math.floor(cappedDelay + jitter);
}

/**
 * Check if an error should be retried
 */
export function shouldRetryError(
  error: Error,
  attempt: number,
  config: AdaptiveRetryConfig = DefaultAdaptiveRetryConfig
): boolean {
  // Check if we've exceeded max retries
  if (attempt >= config.maxRetries) {
    return false;
  }
  
  // For ApiError instances, check the code and isRetriable flag
  if (error instanceof ApiError) {
    // Always retry rate limit errors
    if (
      error.code === ErrorCode.AI_QUOTA_EXCEEDED ||
      error.code === ErrorCode.RATE_LIMITED
    ) {
      return true;
    }
    
    // Always retry service unavailability errors
    if (
      error.code === ErrorCode.AI_UNAVAILABLE ||
      error.code === ErrorCode.NETWORK_UNAVAILABLE
    ) {
      return true;
    }
    
    // Check for overloaded error in details
    if (error.details && typeof error.details === 'object') {
      // Check for x-should-retry header or overloaded_error type
      if (
        ('headers' in error.details && error.details.headers?.get?.('x-should-retry') === 'true') ||
        ('error' in error.details && 
          typeof error.details.error === 'object' && 
          error.details.error && 
          'type' in error.details.error && 
          error.details.error.type === 'overloaded_error') ||
        // Check for 529 status code or overloaded in error message
        (('statusCode' in error.details && error.details.statusCode === 529) ||
         ('message' in error && typeof error.message === 'string' && 
          (error.message.includes('529') || 
           error.message.toLowerCase().includes('overloaded')))) ||
        // Check for shouldRetry flag explicitly set in error details
        ('shouldRetry' in error.details && error.details.shouldRetry === true)
      ) {
        // If retryAfter is specified in details, use it to log the retry delay
        const retryAfter = 'retryAfter' in error.details ? error.details.retryAfter : undefined;
        logger.info(`Retrying due to overloaded service or explicit retry flag`, { 
          attempt, 
          retryAfter: retryAfter ? `${retryAfter}ms` : 'using default backoff'
        });
        return true;
      }
    }
    
    // These errors should never be retried
    if (
      error.code === ErrorCode.BAD_REQUEST ||
      error.code === ErrorCode.AI_CONTENT_FILTERED ||
      error.code === ErrorCode.UNAUTHORIZED
    ) {
      return false;
    }
    
    // Use the error's isRetriable flag for others
    return error.isRetriable;
  }
  
  // For network-related errors and specific status codes
  if (
    error.message?.includes('ECONNRESET') ||
    error.message?.includes('ECONNREFUSED') ||
    error.message?.includes('ETIMEDOUT') ||
    error.message?.includes('timeout') ||
    error.message?.includes('network error') ||
    error.message?.includes('socket hang up') ||
    error.message?.includes('429') ||
    error.message?.includes('529') ||
    error.message?.includes('rate limit') ||
    error.message?.includes('too many requests') ||
    error.message?.includes('overloaded')
  ) {
    return true;
  }
  
  // Default to not retrying unknown errors
  return false;
}

/**
 * Execute an operation with adaptive retry logic
 * This function will retry the operation based on the error type and rate limit information
 */
export async function executeWithAdaptiveRetry<T>(
  operation: () => Promise<T>,
  config: AdaptiveRetryConfig = DefaultAdaptiveRetryConfig,
  context: Record<string, unknown> = {}
): Promise<T> {
  let attempt = 0;
  const startTime = Date.now();
  const operationId = context.operationId || `op_${Date.now()}`;
  
  // Track metrics for this operation
  monitoring.incrementCounter('ai.operations', 1, { 
    type: context.operationType || 'unknown',
    model: context.model || 'unknown'
  });
  
  while (true) {
    try {
      // Execute the operation
      const result = await operation();
      
      // Track successful completion
      const duration = Date.now() - startTime;
      safeRecordDuration('ai.operation.duration', duration, {
        type: context.operationType || 'unknown',
        model: context.model || 'unknown',
        success: 'true',
        attempts: String(attempt + 1)
      });
      
      return result;
    } catch (error: unknown) {
      attempt++;
      const currentError = error instanceof Error ? error : new Error(String(error));
      
      // Check if we should retry
      if (!shouldRetryError(currentError, attempt, config)) {
        // Track failed completion
        const duration = Date.now() - startTime;
        safeRecordDuration('ai.operation.duration', duration, {
          type: context.operationType || 'unknown',
          model: context.model || 'unknown',
          success: 'false',
          attempts: String(attempt),
          errorType: error instanceof ApiError ? error.code : 'unknown'
        });
        
        // Call onExhausted callback if provided
        if (config.onExhausted) {
          config.onExhausted(currentError, attempt);
        }
        
        throw currentError;
      }
      
      // Calculate delay for next retry
      const delay = calculateAdaptiveBackoff(currentError, attempt, config);
      
      // Log retry attempt
      if (config.onRetry) {
        const remainingAttempts = config.maxRetries - attempt;
        config.onRetry(currentError, attempt, delay, remainingAttempts);
      }
      
      // Execute beforeRetry if provided
      if (config.beforeRetry) {
        const shouldContinue = await config.beforeRetry(currentError, attempt);
        if (!shouldContinue) {
          logger.info(`Retry cancelled by beforeRetry callback after attempt ${attempt}`);
          throw currentError;
        }
      }
      
      // Wait for the calculated delay
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Check if we've exceeded the overall timeout
      if (config.timeoutMs && (Date.now() - startTime > config.timeoutMs)) {
        logger.error(`Operation exceeded timeout of ${config.timeoutMs}ms after ${attempt} attempts`);
        monitoring.incrementCounter('ai.timeout', 1);
        throw new ApiError(
          ErrorCode.TIMEOUT_ERROR,
          `Operation timed out after ${config.timeoutMs}ms and ${attempt} retry attempts`,
          { operationId, attempts: attempt }
        );
      }
    }
  }
}
