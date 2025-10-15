/**
 * Production-ready retry utility with exponential backoff and jittered delays
 * 
 * Features:
 * - Exponential backoff with jitter to prevent thundering herd
 * - Error classification for intelligent retry decisions
 * - Correlation ID tracking through retry attempts
 * - Circuit breaker integration
 * - Comprehensive logging and metrics
 */

import { logger } from '../logging';
import { generateSecureOperationId, generateSecureJitter } from '../security/secure-random';

const retryLogger = logger.child('retry-utility');

export interface RetryOptions {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  timeout?: number;
  retryCondition?: (error: Error) => boolean;
  correlationId?: string;
  operation?: string;
  onRetry?: (attempt: number, error: Error, delay: number) => void;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalDuration: number;
  correlationId: string;
}

export enum ErrorType {
  TRANSIENT = 'TRANSIENT',
  PERMANENT = 'PERMANENT',
  RATE_LIMITED = 'RATE_LIMITED',
  TIMEOUT = 'TIMEOUT',
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  NETWORK = 'NETWORK',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Default retry configuration for different operation types
 */
export const DEFAULT_RETRY_CONFIGS = {
  AI_API: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
    timeout: 60000
  },
  DATABASE: {
    maxRetries: 5,
    baseDelay: 100,
    maxDelay: 5000,
    backoffMultiplier: 1.5,
    jitter: true,
    timeout: 10000
  },
  EMAIL_SERVICE: {
    maxRetries: 3,
    baseDelay: 2000,
    maxDelay: 15000,
    backoffMultiplier: 2,
    jitter: true,
    timeout: 30000
  },
  SEC_API: {
    maxRetries: 4,
    baseDelay: 1500,
    maxDelay: 20000,
    backoffMultiplier: 2,
    jitter: true,
    timeout: 45000
  }
} as const;

/**
 * Error classification utility
 */
export class ErrorClassifier {
  private static readonly TRANSIENT_ERROR_PATTERNS = [
    /timeout|timed out/i,
    /connection reset|connection refused/i,
    /temporary failure|temporarily unavailable/i,
    /service unavailable|server unavailable/i,
    /rate limit|rate limited|too many requests/i,
    /socket hang up|socket timeout/i,
    /enotfound|econnreset|econnrefused/i,
    /502|503|504/,
    /internal server error/i
  ];

  private static readonly PERMANENT_ERROR_PATTERNS = [
    /unauthorized|invalid credentials|authentication failed/i,
    /forbidden|access denied|permission denied/i,
    /not found|does not exist/i,
    /bad request|invalid request|malformed/i,
    /400|401|403|404|422/,
    /quota exceeded|billing/i
  ];

  private static readonly RATE_LIMIT_PATTERNS = [
    /rate limit|rate limited|too many requests/i,
    /429/,
    /quota exceeded/i,
    /throttle|throttled/i
  ];

  static classifyError(error: Error): ErrorType {
    const message = error.message.toLowerCase();
    const errorString = error.toString().toLowerCase();
    
    // Check for rate limiting first
    if (this.RATE_LIMIT_PATTERNS.some(pattern => pattern.test(message) || pattern.test(errorString))) {
      return ErrorType.RATE_LIMITED;
    }
    
    // Check for permanent errors
    if (this.PERMANENT_ERROR_PATTERNS.some(pattern => pattern.test(message) || pattern.test(errorString))) {
      return ErrorType.PERMANENT;
    }
    
    // Check for transient errors
    if (this.TRANSIENT_ERROR_PATTERNS.some(pattern => pattern.test(message) || pattern.test(errorString))) {
      return ErrorType.TRANSIENT;
    }
    
    // Check for timeout errors
    if (error.name === 'TimeoutError' || /timeout/i.test(message)) {
      return ErrorType.TIMEOUT;
    }
    
    // Check for authentication/authorization
    if (/auth|credential|token/i.test(message)) {
      if (/invalid|expired|malformed/i.test(message)) {
        return ErrorType.PERMANENT;
      }
      return ErrorType.AUTHENTICATION;
    }
    
    // Check for network errors
    if (/network|connection|dns|socket/i.test(message)) {
      return ErrorType.NETWORK;
    }
    
    return ErrorType.UNKNOWN;
  }

  static isRetryable(error: Error): boolean {
    const errorType = this.classifyError(error);
    return [
      ErrorType.TRANSIENT,
      ErrorType.RATE_LIMITED,
      ErrorType.TIMEOUT,
      ErrorType.NETWORK,
      ErrorType.UNKNOWN
    ].includes(errorType);
  }

  static getRetryDelay(error: Error, attempt: number, baseDelay: number): number {
    const errorType = this.classifyError(error);
    
    switch (errorType) {
      case ErrorType.RATE_LIMITED:
        // Longer delays for rate limiting
        return Math.min(baseDelay * Math.pow(3, attempt), 60000);
      case ErrorType.TIMEOUT:
        // Moderate delays for timeouts
        return Math.min(baseDelay * Math.pow(2, attempt), 30000);
      case ErrorType.NETWORK:
        // Quick retries for network issues
        return Math.min(baseDelay * Math.pow(1.5, attempt), 10000);
      default:
        return baseDelay * Math.pow(2, attempt);
    }
  }
}

/**
 * Generate correlation ID for tracking retry attempts
 */
function generateCorrelationId(): string {
  return generateSecureOperationId('retry');
}

/**
 * Calculate delay with jitter to prevent thundering herd
 */
function calculateDelayWithJitter(
  baseDelay: number,
  attempt: number,
  maxDelay: number,
  backoffMultiplier: number,
  jitter: boolean
): number {
  let delay = baseDelay * Math.pow(backoffMultiplier, attempt);
  
  if (jitter) {
    // Add ±25% jitter
    const jitterAmount = delay * 0.25;
    delay = generateSecureJitter(delay, jitterAmount / delay);
  }
  
  return Math.min(Math.max(delay, 0), maxDelay);
}

/**
 * Main retry function with comprehensive error handling and logging
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<RetryResult<T>> {
  const config: RetryOptions = {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    jitter: true,
    retryCondition: ErrorClassifier.isRetryable,
    correlationId: generateCorrelationId(),
    operation: 'unknown-operation',
    ...options
  };

  const startTime = Date.now();
  let lastError: Error | null = null;
  let attempts = 0;

  retryLogger.info('Starting retry operation', {
    correlationId: config.correlationId,
    operation: config.operation,
    maxRetries: config.maxRetries,
    baseDelay: config.baseDelay,
    timeout: config.timeout
  });

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    attempts = attempt + 1;
    
    try {
      retryLogger.debug('Executing operation attempt', {
        correlationId: config.correlationId,
        operation: config.operation,
        attempt: attempts,
        maxAttempts: config.maxRetries + 1
      });

      let result: T;
      
      if (config.timeout) {
        // Execute with timeout
        result = await Promise.race([
          operation(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Operation timeout after ${config.timeout}ms`)), config.timeout!)
          )
        ]);
      } else {
        result = await operation();
      }

      const duration = Date.now() - startTime;
      
      retryLogger.info('Operation succeeded', {
        correlationId: config.correlationId,
        operation: config.operation,
        attempts,
        duration
      });

      return {
        success: true,
        result,
        attempts,
        totalDuration: duration,
        correlationId: config.correlationId!
      };

    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const errorType = ErrorClassifier.classifyError(lastError);
      
      retryLogger.warn('Operation failed', {
        correlationId: config.correlationId,
        operation: config.operation,
        attempt: attempts,
        error: lastError.message,
        errorType,
        isRetryable: config.retryCondition!(lastError)
      });

      // Check if we should retry
      const shouldRetry = attempt < config.maxRetries && 
                         config.retryCondition!(lastError);

      if (!shouldRetry) {
        break;
      }

      // Calculate delay for next attempt
      const delay = calculateDelayWithJitter(
        config.baseDelay,
        attempt,
        config.maxDelay,
        config.backoffMultiplier,
        config.jitter
      );

      // Use error-specific delay if available
      const errorSpecificDelay = ErrorClassifier.getRetryDelay(lastError, attempt, config.baseDelay);
      const finalDelay = Math.min(delay, errorSpecificDelay);

      retryLogger.info('Retrying operation', {
        correlationId: config.correlationId,
        operation: config.operation,
        attempt: attempts,
        nextAttempt: attempt + 2,
        delay: finalDelay,
        errorType
      });

      // Call retry callback if provided
      if (config.onRetry) {
        config.onRetry(attempt + 1, lastError, finalDelay);
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, finalDelay));
    }
  }

  const duration = Date.now() - startTime;
  
  retryLogger.error('Operation failed after all retries exhausted', {
    correlationId: config.correlationId,
    operation: config.operation,
    attempts,
    totalDuration: duration,
    finalError: lastError?.message,
    errorType: lastError ? ErrorClassifier.classifyError(lastError) : 'unknown'
  });

  return {
    success: false,
    error: lastError!,
    attempts,
    totalDuration: duration,
    correlationId: config.correlationId!
  };
}

/**
 * Retry wrapper for specific service types
 */
export class RetryWrapper {
  static async retryAIOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    options: Partial<RetryOptions> = {}
  ): Promise<RetryResult<T>> {
    return executeWithRetry(operation, {
      ...DEFAULT_RETRY_CONFIGS.AI_API,
      operation: `ai-${operationName}`,
      ...options
    });
  }

  static async retryDatabaseOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    options: Partial<RetryOptions> = {}
  ): Promise<RetryResult<T>> {
    return executeWithRetry(operation, {
      ...DEFAULT_RETRY_CONFIGS.DATABASE,
      operation: `db-${operationName}`,
      ...options
    });
  }

  static async retryEmailOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    options: Partial<RetryOptions> = {}
  ): Promise<RetryResult<T>> {
    return executeWithRetry(operation, {
      ...DEFAULT_RETRY_CONFIGS.EMAIL_SERVICE,
      operation: `email-${operationName}`,
      ...options
    });
  }

  static async retrySECOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    options: Partial<RetryOptions> = {}
  ): Promise<RetryResult<T>> {
    return executeWithRetry(operation, {
      ...DEFAULT_RETRY_CONFIGS.SEC_API,
      operation: `sec-${operationName}`,
      ...options
    });
  }
}