/**
 * Error constants and enums for the error handling system.
 * This file contains only constants to avoid circular import issues.
 */

// Error categories for better error handling
export enum ErrorCategory {
  CLIENT_ERROR = 'CLIENT_ERROR',   // Client-side errors (4xx)
  SERVER_ERROR = 'SERVER_ERROR',   // Server-side errors (5xx)
  NETWORK_ERROR = 'NETWORK_ERROR', // Network-related errors
  TIMEOUT_ERROR = 'TIMEOUT_ERROR', // Timeout-related errors
  API_ERROR = 'API_ERROR',         // External API errors
  DB_ERROR = 'DB_ERROR',           // Database errors
  AI_ERROR = 'AI_ERROR',           // AI-specific errors
  VALIDATION_ERROR = 'VALIDATION_ERROR', // Data validation errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR', // Unclassified errors
}

// Error codes
export enum ErrorCode {
  // Client errors
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMITED = 'RATE_LIMITED',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  
  // Server errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  EXTERNAL_API_ERROR = 'EXTERNAL_API_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  
  // AI specific errors
  AI_QUOTA_EXCEEDED = 'AI_QUOTA_EXCEEDED',
  AI_INSUFFICIENT_CREDITS = 'AI_INSUFFICIENT_CREDITS',  // OpenRouter credit limit reached (402)
  AI_CONTEXT_WINDOW_EXCEEDED = 'AI_CONTEXT_WINDOW_EXCEEDED',
  AI_CONTENT_FILTERED = 'AI_CONTENT_FILTERED',
  AI_UNAVAILABLE = 'AI_UNAVAILABLE',
  AI_MODEL_ERROR = 'AI_MODEL_ERROR',
  AI_PARSING_ERROR = 'AI_PARSING_ERROR',
  /**
   * Pre-LLM content gate rejected the prepared excerpt — the input lacks
   * the financial-statement signal required for 10-Q / 10-K / 20-F / 6-K.
   * Retriable: EDGAR may finish processing the document body shortly
   * after acceptance. Worker's exponential-backoff retry handles this
   * (JobQueueService.updateJobStatus at lib/job-queue/index.ts:457).
   */
  AI_INSUFFICIENT_CONTENT = 'AI_INSUFFICIENT_CONTENT',
  /**
   * Sectionizer ran on cleaned content and could not locate the
   * Financial Statements section (e.g. Item 1 missing or empty in a
   * 10-Q/10-K). Different from AI_INSUFFICIENT_CONTENT (which means
   * the whole filing was empty) — here the filing has body content
   * but the financial-statement region specifically failed to extract.
   * Retriable for the same EDGAR-processing-race reason as INSUFFICIENT_CONTENT.
   */
  AI_INSUFFICIENT_FINANCIAL_SECTION = 'AI_INSUFFICIENT_FINANCIAL_SECTION',
  
  // Network errors
  NETWORK_UNAVAILABLE = 'NETWORK_UNAVAILABLE',
  CONNECTION_RESET = 'CONNECTION_RESET',
  
  // Retry-specific
  RETRY_EXHAUSTED = 'RETRY_EXHAUSTED',
  CIRCUIT_OPEN = 'CIRCUIT_OPEN',
}

// Error severity for prioritizing alerting
export enum ErrorSeverity {
  LOW = 'low',       // Non-critical errors that don't require immediate attention
  MEDIUM = 'medium', // Errors that should be addressed but don't impact core functionality
  HIGH = 'high',     // Serious errors that affect system functionality but don't bring it down
  CRITICAL = 'critical', // Critical errors that require immediate attention
}

// Map error codes to HTTP status codes
export const errorStatusCodes: Record<ErrorCode, number> = {
  [ErrorCode.BAD_REQUEST]: 400,
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.VALIDATION_ERROR]: 422,
  [ErrorCode.EXTERNAL_API_ERROR]: 502,
  [ErrorCode.DATABASE_ERROR]: 500,
  [ErrorCode.TIMEOUT_ERROR]: 504,
  [ErrorCode.AI_QUOTA_EXCEEDED]: 429,
  [ErrorCode.AI_INSUFFICIENT_CREDITS]: 402,
  [ErrorCode.AI_CONTEXT_WINDOW_EXCEEDED]: 413,
  [ErrorCode.AI_CONTENT_FILTERED]: 422,
  [ErrorCode.AI_UNAVAILABLE]: 503,
  [ErrorCode.AI_MODEL_ERROR]: 500,
  [ErrorCode.AI_PARSING_ERROR]: 422,
  [ErrorCode.AI_INSUFFICIENT_CONTENT]: 422,
  [ErrorCode.AI_INSUFFICIENT_FINANCIAL_SECTION]: 422,
  [ErrorCode.NETWORK_UNAVAILABLE]: 503,
  [ErrorCode.CONNECTION_RESET]: 503,
  [ErrorCode.RETRY_EXHAUSTED]: 429,
  [ErrorCode.CIRCUIT_OPEN]: 503,
};

// Map error codes to categories for better grouping
export const errorCategories: Record<ErrorCode, ErrorCategory> = {
  [ErrorCode.BAD_REQUEST]: ErrorCategory.CLIENT_ERROR,
  [ErrorCode.UNAUTHORIZED]: ErrorCategory.CLIENT_ERROR,
  [ErrorCode.FORBIDDEN]: ErrorCategory.CLIENT_ERROR,
  [ErrorCode.NOT_FOUND]: ErrorCategory.CLIENT_ERROR,
  [ErrorCode.RATE_LIMITED]: ErrorCategory.CLIENT_ERROR,
  [ErrorCode.VALIDATION_ERROR]: ErrorCategory.VALIDATION_ERROR,
  [ErrorCode.INTERNAL_ERROR]: ErrorCategory.SERVER_ERROR,
  [ErrorCode.EXTERNAL_API_ERROR]: ErrorCategory.API_ERROR,
  [ErrorCode.DATABASE_ERROR]: ErrorCategory.DB_ERROR,
  [ErrorCode.TIMEOUT_ERROR]: ErrorCategory.TIMEOUT_ERROR,
  [ErrorCode.AI_QUOTA_EXCEEDED]: ErrorCategory.AI_ERROR,
  [ErrorCode.AI_INSUFFICIENT_CREDITS]: ErrorCategory.AI_ERROR,
  [ErrorCode.AI_CONTEXT_WINDOW_EXCEEDED]: ErrorCategory.AI_ERROR,
  [ErrorCode.AI_CONTENT_FILTERED]: ErrorCategory.AI_ERROR,
  [ErrorCode.AI_UNAVAILABLE]: ErrorCategory.AI_ERROR,
  [ErrorCode.AI_MODEL_ERROR]: ErrorCategory.AI_ERROR,
  [ErrorCode.AI_PARSING_ERROR]: ErrorCategory.AI_ERROR,
  [ErrorCode.AI_INSUFFICIENT_CONTENT]: ErrorCategory.VALIDATION_ERROR,
  [ErrorCode.AI_INSUFFICIENT_FINANCIAL_SECTION]: ErrorCategory.VALIDATION_ERROR,
  [ErrorCode.NETWORK_UNAVAILABLE]: ErrorCategory.NETWORK_ERROR,
  [ErrorCode.CONNECTION_RESET]: ErrorCategory.NETWORK_ERROR,
  [ErrorCode.RETRY_EXHAUSTED]: ErrorCategory.SERVER_ERROR,
  [ErrorCode.CIRCUIT_OPEN]: ErrorCategory.SERVER_ERROR,
};

// Map error codes to severity levels
export const errorSeverityLevels: Record<ErrorCode, ErrorSeverity> = {
  [ErrorCode.BAD_REQUEST]: ErrorSeverity.LOW,
  [ErrorCode.UNAUTHORIZED]: ErrorSeverity.MEDIUM,
  [ErrorCode.FORBIDDEN]: ErrorSeverity.MEDIUM,
  [ErrorCode.NOT_FOUND]: ErrorSeverity.LOW,
  [ErrorCode.RATE_LIMITED]: ErrorSeverity.HIGH,
  [ErrorCode.VALIDATION_ERROR]: ErrorSeverity.LOW,
  [ErrorCode.INTERNAL_ERROR]: ErrorSeverity.HIGH,
  [ErrorCode.EXTERNAL_API_ERROR]: ErrorSeverity.HIGH,
  [ErrorCode.DATABASE_ERROR]: ErrorSeverity.HIGH,
  [ErrorCode.TIMEOUT_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCode.AI_QUOTA_EXCEEDED]: ErrorSeverity.HIGH,
  [ErrorCode.AI_INSUFFICIENT_CREDITS]: ErrorSeverity.CRITICAL,  // Critical - stops all AI processing
  [ErrorCode.AI_CONTEXT_WINDOW_EXCEEDED]: ErrorSeverity.MEDIUM,
  [ErrorCode.AI_CONTENT_FILTERED]: ErrorSeverity.MEDIUM,
  [ErrorCode.AI_UNAVAILABLE]: ErrorSeverity.HIGH,
  [ErrorCode.AI_MODEL_ERROR]: ErrorSeverity.HIGH,
  [ErrorCode.AI_PARSING_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCode.AI_INSUFFICIENT_CONTENT]: ErrorSeverity.MEDIUM,
  [ErrorCode.AI_INSUFFICIENT_FINANCIAL_SECTION]: ErrorSeverity.MEDIUM,
  [ErrorCode.NETWORK_UNAVAILABLE]: ErrorSeverity.HIGH,
  [ErrorCode.CONNECTION_RESET]: ErrorSeverity.MEDIUM,
  [ErrorCode.RETRY_EXHAUSTED]: ErrorSeverity.HIGH,
  [ErrorCode.CIRCUIT_OPEN]: ErrorSeverity.HIGH,
};

// Map to determine if an error is transient/retriable
export const isRetriableError: Record<ErrorCode, boolean> = {
  [ErrorCode.BAD_REQUEST]: false,
  [ErrorCode.UNAUTHORIZED]: false,
  [ErrorCode.FORBIDDEN]: false,
  [ErrorCode.NOT_FOUND]: false,
  [ErrorCode.RATE_LIMITED]: true,
  [ErrorCode.VALIDATION_ERROR]: false,
  [ErrorCode.INTERNAL_ERROR]: false,
  [ErrorCode.EXTERNAL_API_ERROR]: true,
  [ErrorCode.DATABASE_ERROR]: true,
  [ErrorCode.TIMEOUT_ERROR]: true,
  [ErrorCode.AI_QUOTA_EXCEEDED]: true,
  [ErrorCode.AI_INSUFFICIENT_CREDITS]: false,  // Not retriable - requires adding credits
  [ErrorCode.AI_CONTEXT_WINDOW_EXCEEDED]: false,
  [ErrorCode.AI_CONTENT_FILTERED]: false,
  [ErrorCode.AI_UNAVAILABLE]: true,
  [ErrorCode.AI_MODEL_ERROR]: true,
  [ErrorCode.AI_PARSING_ERROR]: false,
  [ErrorCode.AI_INSUFFICIENT_CONTENT]: true,  // Retriable — EDGAR may finish processing the document body shortly after acceptance
  [ErrorCode.AI_INSUFFICIENT_FINANCIAL_SECTION]: true,  // Same EDGAR-processing-race rationale as AI_INSUFFICIENT_CONTENT
  [ErrorCode.NETWORK_UNAVAILABLE]: true,
  [ErrorCode.CONNECTION_RESET]: true,
  [ErrorCode.RETRY_EXHAUSTED]: false,
  [ErrorCode.CIRCUIT_OPEN]: true,
};