/**
 * Parser Error Handler
 * 
 * This module provides a robust error handling and recovery system for SEC filing parsers.
 * It includes error classification, structured error types, recovery strategies, and logging.
 */

import { Logger } from '@/lib/logging';

// Create a logger for the parser error handler
const logger = new Logger({}, 'parser-error-handler');

/**
 * Error categories for filing parsers
 */
export enum ParserErrorCategory {
  // Input errors
  INVALID_INPUT = 'invalid_input',            // Invalid or malformed input data
  FILE_ACCESS = 'file_access',                // Error accessing or reading files
  NETWORK = 'network',                        // Network or connectivity issues
  
  // Processing errors
  PARSING = 'parsing',                        // General parsing errors
  EXTRACTION = 'extraction',                  // Content extraction errors
  STRUCTURE = 'structure',                    // Document structure errors
  
  // Format-specific errors
  HTML = 'html',                              // HTML-specific errors
  PDF = 'pdf',                                // PDF-specific errors
  XBRL = 'xbrl',                              // XBRL-specific errors
  
  // System errors
  RESOURCE = 'resource',                      // System resource issues (memory, etc.)
  INTERNAL = 'internal',                      // Internal processing errors
  
  // Unknown errors
  UNKNOWN = 'unknown'                         // Unclassified errors
}

/**
 * Severity levels for parser errors
 */
export enum ParserErrorSeverity {
  FATAL = 'fatal',             // Completely prevents parsing
  ERROR = 'error',             // Serious error but may allow partial parsing
  WARNING = 'warning',         // Issue that doesn't prevent parsing but may affect quality
  INFO = 'info'                // Informational issue
}

/**
 * Recovery strategy recommendations
 */
export enum RecoveryStrategy {
  ABORT = 'abort',                          // Abort parsing completely
  RETRY = 'retry',                          // Retry the parsing operation
  FALLBACK = 'fallback',                    // Use fallback parsing method
  PARTIAL = 'partial',                      // Continue with partial results
  CONTINUE = 'continue',                    // Ignore error and continue
  SIMPLIFIED = 'simplified'                 // Switch to simplified parsing strategy
}

/**
 * Structured parser error information
 */
export interface ParserErrorInfo {
  category: ParserErrorCategory;
  severity: ParserErrorSeverity;
  message: string;
  code: string;
  recovery: RecoveryStrategy;
  originalError?: Error;
  context?: Record<string, any>;
  timestamp: number;
}

/**
 * Parser Error class
 */
export class ParserError extends Error {
  readonly info: ParserErrorInfo;
  
  constructor(info: Omit<ParserErrorInfo, 'timestamp'>) {
    super(info.message);
    this.name = 'ParserError';
    this.info = {
      ...info,
      timestamp: Date.now()
    };
    
    // Log the error
    this.logError();
  }
  
  /**
   * Log the error with appropriate severity
   */
  private logError(): void {
    const { category, severity, message, code, recovery, context } = this.info;
    const logMessage = `[${code}] ${message} (Category: ${category}, Recovery: ${recovery})`;
    
    switch (severity) {
      case ParserErrorSeverity.FATAL:
        logger.error(logMessage, { ...context, originalError: this.info.originalError });
        break;
      case ParserErrorSeverity.ERROR:
        logger.error(logMessage, context);
        break;
      case ParserErrorSeverity.WARNING:
        logger.warn(logMessage, context);
        break;
      case ParserErrorSeverity.INFO:
        logger.info(logMessage, context);
        break;
    }
  }
  
  /**
   * Get a user-friendly message
   */
  getUserMessage(): string {
    switch (this.info.severity) {
      case ParserErrorSeverity.FATAL:
        return `Critical error: ${this.message}. Unable to continue parsing.`;
      case ParserErrorSeverity.ERROR:
        return `Error: ${this.message}. Results may be incomplete.`;
      case ParserErrorSeverity.WARNING:
        return `Warning: ${this.message}. Results may be affected.`;
      case ParserErrorSeverity.INFO:
        return `Note: ${this.message}`;
    }
  }
  
  /**
   * Check if parsing should continue
   */
  shouldContinue(): boolean {
    return this.info.recovery !== RecoveryStrategy.ABORT;
  }
  
  /**
   * Check if retry is recommended
   */
  shouldRetry(): boolean {
    return this.info.recovery === RecoveryStrategy.RETRY;
  }
  
  /**
   * Check if fallback method should be used
   */
  shouldUseFallback(): boolean {
    return this.info.recovery === RecoveryStrategy.FALLBACK;
  }
}

/**
 * Error code prefixes
 */
const ERROR_PREFIXES = {
  [ParserErrorCategory.INVALID_INPUT]: 'INPUT',
  [ParserErrorCategory.FILE_ACCESS]: 'FILE',
  [ParserErrorCategory.NETWORK]: 'NET',
  [ParserErrorCategory.PARSING]: 'PARSE',
  [ParserErrorCategory.EXTRACTION]: 'EXTRACT',
  [ParserErrorCategory.STRUCTURE]: 'STRUCT',
  [ParserErrorCategory.HTML]: 'HTML',
  [ParserErrorCategory.PDF]: 'PDF',
  [ParserErrorCategory.XBRL]: 'XBRL',
  [ParserErrorCategory.RESOURCE]: 'RES',
  [ParserErrorCategory.INTERNAL]: 'INT',
  [ParserErrorCategory.UNKNOWN]: 'UNK'
};

/**
 * Create a parser error
 */
export function createParserError(
  category: ParserErrorCategory,
  message: string,
  options: {
    severity?: ParserErrorSeverity,
    recovery?: RecoveryStrategy,
    code?: string,
    originalError?: Error,
    context?: Record<string, any>
  } = {}
): ParserError {
  // Set defaults
  const severity = options.severity || ParserErrorSeverity.ERROR;
  const recovery = options.recovery || 
    (severity === ParserErrorSeverity.FATAL ? RecoveryStrategy.ABORT : 
      severity === ParserErrorSeverity.ERROR ? RecoveryStrategy.FALLBACK : 
        RecoveryStrategy.CONTINUE);
  
  // Generate code if not provided
  const code = options.code || 
    `${ERROR_PREFIXES[category]}${String(Date.now()).slice(-5)}`;
  
  return new ParserError({
    category,
    severity,
    message,
    code,
    recovery,
    originalError: options.originalError,
    context: options.context
  });
}

/**
 * Create an error from an existing error
 */
export function createErrorFromException(
  error: Error,
  defaultCategory: ParserErrorCategory = ParserErrorCategory.UNKNOWN
): ParserError {
  // Try to identify the category from the error
  let category = defaultCategory;
  const errorString = error.toString().toLowerCase();
  
  if (error.name === 'AxiosError' || errorString.includes('network') || 
      errorString.includes('fetch') || errorString.includes('http')) {
    category = ParserErrorCategory.NETWORK;
  } else if (errorString.includes('permission') || errorString.includes('access') || 
             errorString.includes('no such file')) {
    category = ParserErrorCategory.FILE_ACCESS;
  } else if (errorString.includes('html') || errorString.includes('cheerio')) {
    category = ParserErrorCategory.HTML;
  } else if (errorString.includes('pdf')) {
    category = ParserErrorCategory.PDF;
  } else if (errorString.includes('xbrl') || errorString.includes('xml')) {
    category = ParserErrorCategory.XBRL;
  } else if (errorString.includes('memory') || errorString.includes('timeout') ||
             errorString.includes('resource')) {
    category = ParserErrorCategory.RESOURCE;
  }
  
  return createParserError(
    category,
    error.message || 'An unknown error occurred',
    { originalError: error }
  );
}

/**
 * Try-catch wrapper with automatic error handling
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  options: {
    defaultCategory?: ParserErrorCategory,
    defaultRecovery?: RecoveryStrategy,
    fallbackFn?: () => Promise<T>,
    context?: Record<string, any>
  } = {}
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    // Convert to ParserError if it isn't already
    const parserError = error instanceof ParserError
      ? error
      : createErrorFromException(
          error instanceof Error ? error : new Error(String(error)),
          options.defaultCategory
        );
    
    // Override recovery strategy if specified
    if (options.defaultRecovery) {
      parserError.info.recovery = options.defaultRecovery;
    }
    
    // Add context if provided
    if (options.context) {
      parserError.info.context = {
        ...parserError.info.context,
        ...options.context
      };
    }
    
    // If we have a fallback function and should use it, try it
    if (options.fallbackFn && parserError.shouldUseFallback()) {
      try {
        logger.info(`Using fallback parsing method due to: ${parserError.message}`);
        return await options.fallbackFn();
      } catch (fallbackError) {
        // If fallback fails, throw a fatal error
        throw createParserError(
          ParserErrorCategory.INTERNAL,
          `Fallback parsing method failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
          {
            severity: ParserErrorSeverity.FATAL,
            recovery: RecoveryStrategy.ABORT,
            originalError: fallbackError instanceof Error ? fallbackError : undefined,
            context: options.context
          }
        );
      }
    }
    
    // Otherwise, rethrow the error
    throw parserError;
  }
}

/**
 * Simplified synchronous try-catch wrapper
 */
export function withErrorHandlingSync<T>(
  fn: () => T,
  options: {
    defaultCategory?: ParserErrorCategory,
    defaultRecovery?: RecoveryStrategy,
    fallbackFn?: () => T,
    context?: Record<string, any>
  } = {}
): T {
  try {
    return fn();
  } catch (error) {
    // Convert to ParserError if it isn't already
    const parserError = error instanceof ParserError
      ? error
      : createErrorFromException(
          error instanceof Error ? error : new Error(String(error)),
          options.defaultCategory
        );
    
    // Override recovery strategy if specified
    if (options.defaultRecovery) {
      parserError.info.recovery = options.defaultRecovery;
    }
    
    // Add context if provided
    if (options.context) {
      parserError.info.context = {
        ...parserError.info.context,
        ...options.context
      };
    }
    
    // If we have a fallback function and should use it, try it
    if (options.fallbackFn && parserError.shouldUseFallback()) {
      try {
        logger.info(`Using fallback parsing method due to: ${parserError.message}`);
        return options.fallbackFn();
      } catch (fallbackError) {
        // If fallback fails, throw a fatal error
        throw createParserError(
          ParserErrorCategory.INTERNAL,
          `Fallback parsing method failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
          {
            severity: ParserErrorSeverity.FATAL,
            recovery: RecoveryStrategy.ABORT,
            originalError: fallbackError instanceof Error ? fallbackError : undefined,
            context: options.context
          }
        );
      }
    }
    
    // Otherwise, rethrow the error
    throw parserError;
  }
} 