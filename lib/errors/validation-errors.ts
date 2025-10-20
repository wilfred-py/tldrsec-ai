/**
 * Validation Error Types for SEC Filing Content Validation
 * 
 * Custom error classes for specific validation failures to prevent
 * invalid content from reaching AI processing and wasting tokens/costs.
 */

export enum ValidationErrorCode {
  NO_SUCH_KEY = 'NO_SUCH_KEY',
  INVALID_CONTENT_LENGTH = 'INVALID_CONTENT_LENGTH', 
  INVALID_DATE = 'INVALID_DATE',
  SEC_API_ERROR = 'SEC_API_ERROR',
  MALFORMED_CONTENT = 'MALFORMED_CONTENT',
  EMPTY_RESPONSE = 'EMPTY_RESPONSE'
}

/**
 * Base validation error class
 */
export class ValidationError extends Error {
  public readonly code: ValidationErrorCode;
  public readonly context?: Record<string, unknown>;
  public readonly retryable: boolean;

  constructor(
    message: string,
    code: ValidationErrorCode,
    context?: Record<string, unknown>,
    retryable: boolean = false
  ) {
    super(message);
    this.name = 'ValidationError';
    this.code = code;
    this.context = context;
    this.retryable = retryable;
  }
}

/**
 * NoSuchKey error - SEC API returned NoSuchKey response
 * Non-retryable as this indicates the document doesn't exist
 */
export class NoSuchKeyError extends ValidationError {
  constructor(
    accessionNumber: string,
    documentUrl?: string,
    context?: Record<string, unknown>
  ) {
    super(
      `SEC API returned NoSuchKey error for filing ${accessionNumber}`,
      ValidationErrorCode.NO_SUCH_KEY,
      {
        accessionNumber,
        documentUrl,
        ...context
      },
      false // Not retryable - document doesn't exist
    );
    this.name = 'NoSuchKeyError';
  }
}

/**
 * Invalid content length error - Content too short to be meaningful
 * Non-retryable as this indicates malformed or empty content
 */
export class InvalidContentError extends ValidationError {
  constructor(
    accessionNumber: string,
    contentLength: number,
    minimumLength: number,
    context?: Record<string, unknown>
  ) {
    super(
      `Filing content too short: ${contentLength} bytes (minimum: ${minimumLength})`,
      ValidationErrorCode.INVALID_CONTENT_LENGTH,
      {
        accessionNumber,
        contentLength,
        minimumLength,
        ...context
      },
      false // Not retryable - content is fundamentally invalid
    );
    this.name = 'InvalidContentError';
  }
}

/**
 * Invalid date error - Accession number has invalid date
 * Non-retryable as this indicates corrupted data
 */
export class InvalidDateError extends ValidationError {
  constructor(
    accessionNumber: string,
    extractedYear: number | null,
    context?: Record<string, unknown>
  ) {
    super(
      `Invalid date in accession number ${accessionNumber}: year ${extractedYear}`,
      ValidationErrorCode.INVALID_DATE,
      {
        accessionNumber,
        extractedYear,
        validYearRange: '1950-2050',
        ...context
      },
      false // Not retryable - data corruption
    );
    this.name = 'InvalidDateError';
  }
}

/**
 * SEC API error - Temporary SEC API issues
 * Retryable as this might be a temporary service issue
 */
export class SecApiError extends ValidationError {
  constructor(
    message: string,
    statusCode?: number,
    context?: Record<string, unknown>
  ) {
    super(
      `SEC API error: ${message}`,
      ValidationErrorCode.SEC_API_ERROR,
      {
        statusCode,
        ...context
      },
      true // Retryable - might be temporary
    );
    this.name = 'SecApiError';
  }
}

/**
 * Malformed content error - Content exists but is malformed
 * Non-retryable as this indicates structural issues
 */
export class MalformedContentError extends ValidationError {
  constructor(
    accessionNumber: string,
    reason: string,
    context?: Record<string, unknown>
  ) {
    super(
      `Malformed content in filing ${accessionNumber}: ${reason}`,
      ValidationErrorCode.MALFORMED_CONTENT,
      {
        accessionNumber,
        reason,
        ...context
      },
      false // Not retryable - content structure is invalid
    );
    this.name = 'MalformedContentError';
  }
}

/**
 * Empty response error - No content returned from SEC API
 * Retryable as this might be a temporary issue
 */
export class EmptyResponseError extends ValidationError {
  constructor(
    accessionNumber: string,
    documentUrl?: string,
    context?: Record<string, unknown>
  ) {
    super(
      `Empty response from SEC API for filing ${accessionNumber}`,
      ValidationErrorCode.EMPTY_RESPONSE,
      {
        accessionNumber,
        documentUrl,
        ...context
      },
      true // Retryable - might be temporary
    );
    this.name = 'EmptyResponseError';
  }
}

/**
 * Check if an error is retryable
 */
export function isRetryableValidationError(error: unknown): boolean {
  if (error instanceof ValidationError) {
    return error.retryable;
  }
  return false;
}

/**
 * Get validation error context for logging
 */
export function getValidationErrorContext(error: unknown): Record<string, unknown> {
  if (error instanceof ValidationError) {
    return {
      errorType: error.name,
      errorCode: error.code,
      retryable: error.retryable,
      context: error.context || {}
    };
  }
  
  return {
    errorType: 'UnknownError',
    message: error instanceof Error ? error.message : String(error)
  };
}