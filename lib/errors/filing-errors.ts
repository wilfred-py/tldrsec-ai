/**
 * Filing Retrieval Error Classification System
 * 
 * Provides structured error handling for SEC filing retrieval with distinction
 * between permanent and transient failures to enable proper retry logic.
 */

/**
 * Base class for all filing retrieval errors
 */
export abstract class FilingRetrievalError extends Error {
  public readonly isRetryable: boolean;
  public readonly errorCode: string;
  public readonly httpStatus?: number;
  public readonly context: Record<string, any>;

  constructor(
    message: string,
    isRetryable: boolean,
    errorCode: string,
    httpStatus?: number,
    context: Record<string, any> = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.isRetryable = isRetryable;
    this.errorCode = errorCode;
    this.httpStatus = httpStatus;
    this.context = context;

    // Maintains proper stack trace for where error was thrown (Node.js only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Serialize error for logging and monitoring
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      errorCode: this.errorCode,
      isRetryable: this.isRetryable,
      httpStatus: this.httpStatus,
      context: this.context,
      stack: this.stack
    };
  }
}

/**
 * Permanent errors that should not be retried
 * These indicate issues with the filing request itself
 */
export class PermanentFilingError extends FilingRetrievalError {
  constructor(message: string, errorCode: string, httpStatus?: number, context: Record<string, any> = {}) {
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
    context: Record<string, any> = {},
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
  error: any,
  accessionNumber: string,
  context: Record<string, any> = {}
): FilingRetrievalError {
  const errorContext = {
    accessionNumber,
    ...context,
    timestamp: new Date().toISOString()
  };

  // Handle axios errors with response
  if (error.response) {
    const status = error.response.status;
    const statusText = error.response.statusText || 'Unknown';

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
          `Rate limited for filing: ${accessionNumber}`,
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