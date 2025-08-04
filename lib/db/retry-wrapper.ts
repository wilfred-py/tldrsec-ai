/**
 * Database Retry Wrapper
 * 
 * Provides retry logic for database operations to handle cold start issues
 */

import { PrismaClientInitializationError, PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { databaseMonitoring } from './monitoring';

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
}

const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2
};

/**
 * Retry wrapper for database operations with exponential backoff
 * 
 * @param operation - The database operation to retry
 * @param options - Retry configuration options
 * @returns Promise that resolves to the operation result
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const startTime = Date.now();
  let lastError: Error;
  
  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      const result = await operation();
      
      // Track successful operation
      if (attempt > 1) {
        // This was a retry that succeeded
        databaseMonitoring.trackRetryOperation(attempt - 1, true);
      }
      databaseMonitoring.trackConnectionAttempt(true);
      
      // Track response time
      const responseTime = Date.now() - startTime;
      databaseMonitoring.trackResponseTime('operation', responseTime);
      
      return result;
    } catch (error) {
      lastError = error as Error;
      
      // Track failed connection attempt
      databaseMonitoring.trackConnectionAttempt(false, lastError);
      
      // Only retry on specific database connection errors
      if (!shouldRetry(error, attempt, config.maxRetries)) {
        // Track non-retryable error
        if (attempt > 1) {
          databaseMonitoring.trackRetryOperation(attempt - 1, false, lastError);
        }
        throw error;
      }
      
      // Track retry attempt
      if (attempt > 1) {
        databaseMonitoring.trackRetryOperation(attempt - 1, false, lastError);
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelay
      );
      
      console.warn(`Database operation failed (attempt ${attempt}/${config.maxRetries}), retrying in ${delay}ms:`, error instanceof Error ? error.message : String(error));
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // If we get here, all retries failed
  databaseMonitoring.trackRetryOperation(config.maxRetries, false, lastError);
  throw lastError;
}

/**
 * Determine if an error should trigger a retry
 */
function shouldRetry(error: unknown, currentAttempt: number, maxRetries: number): boolean {
  // Don't retry if we've exhausted attempts
  if (currentAttempt >= maxRetries) {
    return false;
  }
  
  // Retry on initialization errors (cold start issues)
  if (error instanceof PrismaClientInitializationError) {
    return true;
  }
  
  // Retry on connection timeout errors
  if (error instanceof PrismaClientKnownRequestError) {
    return error.code === 'P1001' || // Connection timeout
           error.code === 'P1008' || // Operations timeout
           error.code === 'P1017';   // Server closed connection
  }
  
  // Retry on generic connection errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('can\'t reach database server') ||
           message.includes('connection timeout') ||
           message.includes('server closed the connection') ||
           message.includes('timed out');
  }
  
  return false;
}

/**
 * Enhanced retry wrapper with monitoring integration
 */
async function withRetryAndMonitoring<T>(
  operation: () => Promise<T>,
  operationType: 'query' | 'mutation' | 'healthCheck',
  options: RetryOptions = {}
): Promise<T> {
  const config = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const startTime = Date.now();
  let lastError: Error;
  
  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      const result = await operation();
      
      // Track successful operation with type
      if (attempt > 1) {
        databaseMonitoring.trackRetryOperation(attempt - 1, true, undefined, operationType);
      }
      databaseMonitoring.trackConnectionAttempt(true);
      
      // Track response time by operation type
      const responseTime = Date.now() - startTime;
      databaseMonitoring.trackResponseTime(operationType, responseTime);
      
      return result;
    } catch (error) {
      lastError = error as Error;
      
      // Track failed connection attempt
      databaseMonitoring.trackConnectionAttempt(false, lastError);
      
      // Only retry on specific database connection errors
      if (!shouldRetry(error, attempt, config.maxRetries)) {
        if (attempt > 1) {
          databaseMonitoring.trackRetryOperation(attempt - 1, false, lastError, operationType);
        }
        throw error;
      }
      
      // Track retry attempt with type
      if (attempt > 1) {
        databaseMonitoring.trackRetryOperation(attempt - 1, false, lastError, operationType);
      }
      
      // Calculate delay with exponential backoff
      const delay = Math.min(
        config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelay
      );
      
      console.warn(`Database ${operationType} failed (attempt ${attempt}/${config.maxRetries}), retrying in ${delay}ms:`, error instanceof Error ? error.message : String(error));
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // If we get here, all retries failed
  databaseMonitoring.trackRetryOperation(config.maxRetries, false, lastError, operationType);
  throw lastError;
}

/**
 * Pre-configured retry wrapper for common database operations
 */
export const dbRetry = {
  /**
   * Retry wrapper optimized for queries (more retries, shorter delays)
   */
  query: <T>(operation: () => Promise<T>) => withRetryAndMonitoring(operation, 'query', {
    maxRetries: 3,
    baseDelay: 500,
    maxDelay: 5000
  }),
  
  /**
   * Retry wrapper optimized for mutations (fewer retries, longer delays)
   */
  mutation: <T>(operation: () => Promise<T>) => withRetryAndMonitoring(operation, 'mutation', {
    maxRetries: 2,
    baseDelay: 1000,
    maxDelay: 8000
  }),
  
  /**
   * Retry wrapper for connection health checks
   */
  healthCheck: <T>(operation: () => Promise<T>) => withRetryAndMonitoring(operation, 'healthCheck', {
    maxRetries: 5,
    baseDelay: 200,
    maxDelay: 2000
  })
};