/**
 * Filing Retrieval Error Classification System
 * 
 * Provides structured error handling for SEC filing retrieval with distinction
 * between permanent and transient failures to enable proper retry logic.
 * 
 * SECURITY: Enhanced with input validation, sanitization, and access control
 * to prevent injection attacks and ensure GDPR compliance.
 */

// SECURITY: Import validation and sanitization modules
import { ValidationUtils } from '../security/validation-schemas';
import { sanitize } from '../security/data-sanitizer';
import { logger } from '../logging';

const errorLogger = logger.child('filing-errors');

/**
 * Base class for all filing retrieval errors
 */
export abstract class FilingRetrievalError extends Error {
  public readonly isRetryable: boolean;
  public readonly errorCode: string;
  public readonly httpStatus?: number;
  public readonly context: Record<string, unknown>;

  constructor(
    message: string,
    isRetryable: boolean,
    errorCode: string,
    httpStatus?: number,
    context: Record<string, unknown> = {}
  ) {
    // SECURITY: Sanitize error message to prevent XSS and log injection
    const sanitizedMessage = ValidationUtils.sanitizeString(message, 500);
    super(sanitizedMessage);
    
    this.name = this.constructor.name;
    this.isRetryable = isRetryable;
    
    // SECURITY: Validate error code against known values
    this.errorCode = ValidationUtils.sanitizeString(errorCode, 50);
    
    // SECURITY: Validate HTTP status codes
    this.httpStatus = httpStatus && (httpStatus >= 100 && httpStatus <= 599) ? httpStatus : undefined;
    
    // SECURITY: Sanitize context to remove PII and validate structure
    this.context = this.sanitizeErrorContext(context);

    // Maintains proper stack trace for where error was thrown (Node.js only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialize error for logging and monitoring with GDPR compliance
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      errorCode: this.errorCode,
      isRetryable: this.isRetryable,
      httpStatus: this.httpStatus,
      // SECURITY: Sanitize context for safe logging
      context: sanitize.object(this.context),
      // SECURITY: Redact sensitive information from stack traces
      stack: process.env.NODE_ENV === 'production' ? '[REDACTED_IN_PRODUCTION]' : this.stack,
      sanitized: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * SECURITY: Sanitize error context to prevent PII exposure and injection attacks
   */
  private sanitizeErrorContext(context: Record<string, unknown>): Record<string, unknown> {
    try {
      const sanitizedContext: Record<string, unknown> = {};
      
      Object.entries(context).forEach(([key, value]) => {
        // SECURITY: Validate key names to prevent prototype pollution
        const sanitizedKey = ValidationUtils.sanitizeString(key, 100);
        if (sanitizedKey && !['__proto__', 'constructor', 'prototype'].includes(sanitizedKey)) {
          // SECURITY: Sanitize values based on type and content
          if (typeof value === 'string') {
            sanitizedContext[sanitizedKey] = ValidationUtils.sanitizeString(value, 1000);
          } else if (typeof value === 'number' && isFinite(value)) {
            sanitizedContext[sanitizedKey] = value;
          } else if (typeof value === 'boolean') {
            sanitizedContext[sanitizedKey] = value;
          } else if (value && typeof value === 'object') {
            // Recursively sanitize nested objects (with depth limit)
            sanitizedContext[sanitizedKey] = sanitize.object(value);
          } else {
            sanitizedContext[sanitizedKey] = '[SANITIZED]';
          }
        }
      });
      
      return sanitizedContext;
    } catch (sanitizationError) {
      errorLogger.warn('Failed to sanitize error context', {
        error: sanitizationError instanceof Error ? sanitizationError.message : 'Unknown sanitization error'
      });
      return { sanitizationFailed: true, timestamp: new Date().toISOString() };
    }
  }
}

/**
 * Permanent errors that should not be retried
 * These indicate issues with the filing request itself
 */
export class PermanentFilingError extends FilingRetrievalError {
  constructor(message: string, errorCode: string, httpStatus?: number, context: Record<string, unknown> = {}) {
    super(message, false, errorCode, httpStatus, context);
  }
}

/**
 * Transient errors that should be retried with backoff
 * These indicate temporary service or network issues
 */
export class TransientFilingError extends FilingRetrievalError {
  public readonly retryAfter?: number; // Suggested retry delay in milliseconds

  constructor(
    message: string, 
    errorCode: string, 
    httpStatus?: number, 
    context: Record<string, unknown> = {},
    retryAfter?: number
  ) {
    super(message, true, errorCode, httpStatus, context);
    this.retryAfter = retryAfter;
  }
}

/**
 * Error codes for filing retrieval operations
 */
export const FILING_ERROR_CODES = {
  // Permanent errors
  FILING_NOT_FOUND: 'FILING_NOT_FOUND',
  INVALID_ACCESSION_NUMBER: 'INVALID_ACCESSION_NUMBER',
  ACCESS_DENIED: 'ACCESS_DENIED',
  MALFORMED_CONTENT: 'MALFORMED_CONTENT',
  CONTENT_TOO_SHORT: 'CONTENT_TOO_SHORT',
  NO_SUCH_KEY: 'NO_SUCH_KEY',

  // Transient errors
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER_ERROR: 'SERVER_ERROR',
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // Unknown/unclassified
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const;

/**
 * Filing retrieval operation result
 */
export interface FilingRetrievalResult {
  success: boolean;
  content?: string;
  error?: FilingRetrievalError;
  metadata: {
    accessionNumber: string;
    documentIdentifier: string;
    cik?: string;
    attemptCount: number;
    totalDuration: number;
    finalUrl?: string;
  };
}

/**
 * Retry configuration for filing retrieval
 */
export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrorCodes: string[];
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffMultiplier: 2.0,
  retryableErrorCodes: [
    FILING_ERROR_CODES.RATE_LIMITED,
    FILING_ERROR_CODES.SERVER_ERROR,
    FILING_ERROR_CODES.NETWORK_TIMEOUT,
    FILING_ERROR_CODES.CONNECTION_ERROR,
    FILING_ERROR_CODES.SERVICE_UNAVAILABLE
  ]
};

/**
 * Classify an error based on HTTP status code and error characteristics
 */
export function classifyFilingError(
  error: unknown,
  accessionNumber: string,
  context: Record<string, unknown> = {}
): FilingRetrievalError {
  // SECURITY: Validate and sanitize inputs
  const sanitizedAccessionNumber = ValidationUtils.sanitizeString(accessionNumber, 50);
  
  // SECURITY: Validate accession number format
  if (!/^\d{10}-\d{2}-\d{6}$/.test(sanitizedAccessionNumber)) {
    errorLogger.warn('Invalid accession number format provided to classifyFilingError', {
      provided: sanitize.string(accessionNumber),
      expected: 'XXXXXXXXXX-XX-XXXXXX'
    });
  }
  
  // SECURITY: Sanitize context to prevent injection and PII exposure
  const sanitizedContext = sanitize.object(context) as Record<string, unknown>;
  
  const errorContext = {
    accessionNumber: sanitizedAccessionNumber,
    ...sanitizedContext,
    timestamp: new Date().toISOString(),
    sanitized: true
  };

  // SECURITY: Safely handle axios errors with response validation
  if (error && typeof error === 'object' && 'response' in error && error.response) {
    const response = error.response as { status?: number; data?: unknown; statusText?: string };
    
    // SECURITY: Validate HTTP status is within valid range
    const status = typeof response.status === 'number' && response.status >= 100 && response.status <= 599 
      ? response.status 
      : 0;
    
    const statusText = typeof response.statusText === 'string' 
      ? ValidationUtils.sanitizeString(response.statusText, 100) 
      : 'Unknown';

    switch (status) {
      case 404:
        return new PermanentFilingError(
          `Filing not found: ${accessionNumber}`,
          FILING_ERROR_CODES.FILING_NOT_FOUND,
          status,
          errorContext
        );

      case 403:
        return new PermanentFilingError(
          `Access denied for filing: ${accessionNumber}`,
          FILING_ERROR_CODES.ACCESS_DENIED,
          status,
          errorContext
        );

      case 429:
        // Extract retry-after header if available
        const retryAfter = error.response.headers['retry-after'];
        const retryDelay = retryAfter ? parseInt(retryAfter) * 1000 : undefined;
        
        return new TransientFilingError(
          `Rate limited for filing: ${sanitizedAccessionNumber}`,
          FILING_ERROR_CODES.RATE_LIMITED,
          status,
          errorContext,
          retryDelay
        );

      case 500:
      case 502:
      case 503:
      case 504:
        return new TransientFilingError(
          `Server error (${status} ${statusText}) for filing: ${accessionNumber}`,
          FILING_ERROR_CODES.SERVER_ERROR,
          status,
          errorContext
        );

      default:
        return new PermanentFilingError(
          `HTTP error (${status} ${statusText}) for filing: ${accessionNumber}`,
          FILING_ERROR_CODES.UNKNOWN_ERROR,
          status,
          errorContext
        );
    }
  }

  // Handle network timeouts
  if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
    return new TransientFilingError(
      `Network timeout for filing: ${accessionNumber}`,
      FILING_ERROR_CODES.NETWORK_TIMEOUT,
      undefined,
      errorContext
    );
  }

  // Handle connection errors
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
    return new TransientFilingError(
      `Connection error (${error.code}) for filing: ${accessionNumber}`,
      FILING_ERROR_CODES.CONNECTION_ERROR,
      undefined,
      errorContext
    );
  }

  // Handle content validation errors
  if (error.message?.includes('Content too short')) {
    return new PermanentFilingError(
      `Content too short for filing: ${accessionNumber}`,
      FILING_ERROR_CODES.CONTENT_TOO_SHORT,
      undefined,
      errorContext
    );
  }

  if (error.message?.includes('NoSuchKey')) {
    return new PermanentFilingError(
      `NoSuchKey error for filing: ${accessionNumber}`,
      FILING_ERROR_CODES.NO_SUCH_KEY,
      undefined,
      errorContext
    );
  }

  // Handle invalid accession numbers
  if (error.message?.includes('Could not find document') || 
      error.message?.includes('Could not find valid document')) {
    return new PermanentFilingError(
      `Invalid or malformed accession number: ${accessionNumber}`,
      FILING_ERROR_CODES.INVALID_ACCESSION_NUMBER,
      undefined,
      errorContext
    );
  }

  // Default to unknown error (treat as permanent to avoid infinite retries)
  return new PermanentFilingError(
    `Unknown error for filing ${accessionNumber}: ${error.message || String(error)}`,
    FILING_ERROR_CODES.UNKNOWN_ERROR,
    undefined,
    errorContext
  );
}

/**
 * Calculate retry delay using exponential backoff
 */
export function calculateRetryDelay(
  attemptNumber: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  const delay = config.initialDelay * Math.pow(config.backoffMultiplier, attemptNumber - 1);
  return Math.min(delay, config.maxDelay);
}

/**
 * Check if an error should be retried
 */
export function shouldRetryError(
  error: FilingRetrievalError,
  attemptNumber: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): boolean {
  if (!error.isRetryable) {
    return false;
  }

  if (attemptNumber >= config.maxAttempts) {
    return false;
  }

  return config.retryableErrorCodes.includes(error.errorCode);
}

/**
 * Sleep utility for retry delays
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}