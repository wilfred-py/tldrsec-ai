/**
 * Parser Recovery Utilities
 * 
 * This module provides utilities for handling retries, recovery, and fallbacks
 * for parser operations.
 */

import { 
  ParserErrorCategory, 
  ParserErrorSeverity, 
  RecoveryStrategy,
  ParserError,
  createParserError
} from './parser-error-handler';
import { Logger } from '@/lib/logging';

// Create a logger for parser recovery
const logger = new Logger({}, 'parser-recovery');

/**
 * Retry options
 */
export interface RetryOptions {
  maxRetries: number;           // Maximum number of retry attempts
  initialDelay?: number;        // Initial delay in ms (for exponential backoff)
  maxDelay?: number;            // Maximum delay in ms
  retryFactor?: number;         // Multiplier for exponential backoff
  retryableCategories?: ParserErrorCategory[];  // Error categories to retry
  onRetry?: (error: Error, attempt: number, delay: number) => void; // Callback before retry
}

/**
 * Default retry options
 */
const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelay: 1000,  // 1 second
  maxDelay: 30000,     // 30 seconds
  retryFactor: 2,      // Exponential backoff factor
  retryableCategories: [
    ParserErrorCategory.NETWORK, 
    ParserErrorCategory.RESOURCE,
    ParserErrorCategory.PARSING
  ]
};

/**
 * Delay execution for a specified time
 */
async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
function calculateBackoff(attempt: number, options: RetryOptions): number {
  const { initialDelay = 1000, retryFactor = 2, maxDelay = 30000 } = options;
  const backoffDelay = initialDelay * Math.pow(retryFactor, attempt);
  return Math.min(backoffDelay, maxDelay);
}

/**
 * Check if an error is retryable
 */
function isRetryableError(
  error: Error, 
  options: RetryOptions
): boolean {
  // If it's a ParserError, check its category
  if (error instanceof ParserError) {
    // Always retry if recovery strategy is RETRY
    if (error.shouldRetry()) {
      return true;
    }
    
    // Check if the error category is in the retryable categories
    return options.retryableCategories?.includes(error.info.category) || false;
  }
  
  // For other errors, check by message
  const errorMessage = error.message.toLowerCase();
  return errorMessage.includes('timeout') || 
         errorMessage.includes('network') || 
         errorMessage.includes('connection') ||
         errorMessage.includes('econnrefused') ||
         errorMessage.includes('econnreset');
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  // Merge options with defaults
  const retryOptions: RetryOptions = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options
  };
  
  let lastError: Error = new Error('Unknown error');
  
  // Try executing the function with retries
  for (let attempt = 0; attempt <= retryOptions.maxRetries; attempt++) {
    try {
      // If this isn't the first attempt, add a delay
      if (attempt > 0) {
        const delayMs = calculateBackoff(attempt - 1, retryOptions);
        logger.debug(`Retry attempt ${attempt} after ${delayMs}ms delay`);
        
        // Call onRetry callback if provided
        if (retryOptions.onRetry) {
          retryOptions.onRetry(lastError, attempt, delayMs);
        }
        
        await delay(delayMs);
      }
      
      // Execute the function
      return await fn();
    } catch (error) {
      // Cast error to Error type
      const typedError = error instanceof Error 
        ? error 
        : new Error(String(error));
      
      // Save the error for potential logging in the next iteration
      lastError = typedError;
      
      // Check if we should retry
      const isRetryable = isRetryableError(typedError, retryOptions);
      const hasMoreAttempts = attempt < retryOptions.maxRetries;
      
      if (isRetryable && hasMoreAttempts) {
        logger.info(
          `Encountered retryable error (attempt ${attempt + 1}/${retryOptions.maxRetries + 1}): ${typedError.message}`
        );
        // Continue to next iteration (will retry after delay)
        continue;
      }
      
      // If we're here, either the error is not retryable or we've run out of attempts
      if (!isRetryable) {
        logger.debug(`Not retrying non-retryable error: ${typedError.message}`);
      } else {
        logger.warn(`Exhausted all ${retryOptions.maxRetries} retry attempts: ${typedError.message}`);
      }
      
      // Rethrow the error
      throw typedError;
    }
  }
  
  // This should never be reached due to the for loop's break conditions
  throw new Error('Unexpected execution flow in retry logic');
}

/**
 * Fallback options
 */
export interface FallbackOptions {
  fallbacks: Array<() => Promise<any>>;
  stopOnSuccess?: boolean;
  combineResults?: boolean;
  context?: Record<string, any>;
}

/**
 * Execute a function with progressive fallbacks
 */
export async function withFallbacks<T>(
  primaryFn: () => Promise<T>,
  options: FallbackOptions
): Promise<T | Array<Partial<T>> | null> {
  const results: Array<Partial<T>> = [];
  const errors: Error[] = [];
  
  // Try the primary function first
  try {
    const result = await primaryFn();
    results.push(result);
    
    // If we only need one successful result, return now
    if (options.stopOnSuccess !== false) {
      return result;
    }
  } catch (error) {
    // Log the error and continue to fallbacks
    logger.warn(`Primary method failed, trying fallbacks: ${error instanceof Error ? error.message : String(error)}`);
    errors.push(error instanceof Error ? error : new Error(String(error)));
  }
  
  // Try each fallback in sequence
  for (let i = 0; i < options.fallbacks.length; i++) {
    try {
      const fallbackResult = await options.fallbacks[i]();
      results.push(fallbackResult as Partial<T>);
      
      // If we only need one successful result, return now
      if (options.stopOnSuccess !== false) {
        return fallbackResult as T;
      }
    } catch (error) {
      // Log the error and try the next fallback
      logger.warn(`Fallback method ${i + 1} failed: ${error instanceof Error ? error.message : String(error)}`);
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
  }
  
  // Check results
  if (results.length === 0) {
    // All methods failed
    const errorMessage = `All parsing methods failed: ${errors.map(e => e.message).join('; ')}`;
    throw createParserError(
      ParserErrorCategory.INTERNAL,
      errorMessage,
      {
        severity: ParserErrorSeverity.FATAL,
        recovery: RecoveryStrategy.ABORT,
        context: options.context
      }
    );
  }
  
  // Return results based on configuration
  if (options.combineResults) {
    return results;
  }
  
  // Default: return the first successful result
  return results[0] as T;
}

/**
 * Types of parsing simplification
 */
export enum SimplificationStrategy {
  BASIC_TEXT = 'basic_text',            // Extract only plain text
  SKIP_TABLES = 'skip_tables',          // Skip table extraction
  SKIP_LISTS = 'skip_lists',            // Skip list extraction
  INCLUDE_BOILERPLATE = 'include_boilerplate',  // Don't remove boilerplate content
  FIRST_N_PARAGRAPHS = 'first_n_paragraphs',    // Only extract first N paragraphs
  LOW_MEMORY = 'low_memory'             // Low memory mode (stream processing)
}

/**
 * Options for simplified parsing
 */
export interface SimplificationOptions {
  strategies: SimplificationStrategy[];
  paragraphLimit?: number;               // Limit for FIRST_N_PARAGRAPHS
  context?: Record<string, any>;
}

/**
 * Parser options interface for type safety
 */
export interface ParserOptions {
  extractTables?: boolean;
  extractLists?: boolean;
  includeRawHtml?: boolean;
  extractSections?: boolean;
  preserveWhitespace?: boolean;
  removeBoilerplate?: boolean;
  paragraphLimit?: number;
  lowMemoryMode?: boolean;
  streamProcessing?: boolean;
  [key: string]: any;
}

/**
 * Create a simplified version of parsing options based on simplification strategies
 */
export function createSimplifiedOptions<T extends ParserOptions>(
  originalOptions: T,
  simplification: SimplificationOptions
): T {
  // Create a copy of original options
  const simplifiedOptions = { ...originalOptions };
  
  // Apply simplification strategies
  for (const strategy of simplification.strategies) {
    switch (strategy) {
      case SimplificationStrategy.BASIC_TEXT:
        simplifiedOptions.extractTables = false;
        simplifiedOptions.extractLists = false;
        simplifiedOptions.includeRawHtml = false;
        simplifiedOptions.extractSections = false;
        simplifiedOptions.preserveWhitespace = false;
        break;
        
      case SimplificationStrategy.SKIP_TABLES:
        simplifiedOptions.extractTables = false;
        break;
        
      case SimplificationStrategy.SKIP_LISTS:
        simplifiedOptions.extractLists = false;
        break;
        
      case SimplificationStrategy.INCLUDE_BOILERPLATE:
        simplifiedOptions.removeBoilerplate = false;
        break;
        
      case SimplificationStrategy.FIRST_N_PARAGRAPHS:
        simplifiedOptions.paragraphLimit = simplification.paragraphLimit || 100;
        break;
        
      case SimplificationStrategy.LOW_MEMORY:
        simplifiedOptions.lowMemoryMode = true;
        simplifiedOptions.streamProcessing = true;
        break;
    }
  }
  
  return simplifiedOptions;
} 