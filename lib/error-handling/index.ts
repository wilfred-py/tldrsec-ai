import { NextApiRequest, NextApiResponse } from 'next';
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logging';

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
  AI_CONTEXT_WINDOW_EXCEEDED = 'AI_CONTEXT_WINDOW_EXCEEDED',
  AI_CONTENT_FILTERED = 'AI_CONTENT_FILTERED',
  AI_UNAVAILABLE = 'AI_UNAVAILABLE',
  AI_MODEL_ERROR = 'AI_MODEL_ERROR',
  AI_PARSING_ERROR = 'AI_PARSING_ERROR',
  
  // Network errors
  NETWORK_UNAVAILABLE = 'NETWORK_UNAVAILABLE',
  CONNECTION_RESET = 'CONNECTION_RESET',
  
  // Retry-specific
  RETRY_EXHAUSTED = 'RETRY_EXHAUSTED',
}

// Error severity for prioritizing alerting
export enum ErrorSeverity {
  LOW = 'low',       // Non-critical errors that don't require immediate attention
  MEDIUM = 'medium', // Errors that should be addressed but don't impact core functionality
  HIGH = 'high',     // Serious errors that affect system functionality but don't bring it down
  CRITICAL = 'critical', // Critical errors that require immediate attention
}

// Map error codes to HTTP status codes
const errorStatusCodes: Record<ErrorCode, number> = {
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
  [ErrorCode.AI_CONTEXT_WINDOW_EXCEEDED]: 413,
  [ErrorCode.AI_CONTENT_FILTERED]: 422,
  [ErrorCode.AI_UNAVAILABLE]: 503,
  [ErrorCode.AI_MODEL_ERROR]: 500,
  [ErrorCode.AI_PARSING_ERROR]: 422,
  [ErrorCode.NETWORK_UNAVAILABLE]: 503,
  [ErrorCode.CONNECTION_RESET]: 503,
  [ErrorCode.RETRY_EXHAUSTED]: 429,
};

// Map error codes to categories for better grouping
const errorCategories: Record<ErrorCode, ErrorCategory> = {
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
  [ErrorCode.AI_CONTEXT_WINDOW_EXCEEDED]: ErrorCategory.AI_ERROR,
  [ErrorCode.AI_CONTENT_FILTERED]: ErrorCategory.AI_ERROR,
  [ErrorCode.AI_UNAVAILABLE]: ErrorCategory.AI_ERROR,
  [ErrorCode.AI_MODEL_ERROR]: ErrorCategory.AI_ERROR,
  [ErrorCode.AI_PARSING_ERROR]: ErrorCategory.AI_ERROR,
  [ErrorCode.NETWORK_UNAVAILABLE]: ErrorCategory.NETWORK_ERROR,
  [ErrorCode.CONNECTION_RESET]: ErrorCategory.NETWORK_ERROR,
  [ErrorCode.RETRY_EXHAUSTED]: ErrorCategory.SERVER_ERROR,
};

// Map error codes to severity levels
const errorSeverityLevels: Record<ErrorCode, ErrorSeverity> = {
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
  [ErrorCode.AI_CONTEXT_WINDOW_EXCEEDED]: ErrorSeverity.MEDIUM,
  [ErrorCode.AI_CONTENT_FILTERED]: ErrorSeverity.MEDIUM,
  [ErrorCode.AI_UNAVAILABLE]: ErrorSeverity.HIGH,
  [ErrorCode.AI_MODEL_ERROR]: ErrorSeverity.HIGH,
  [ErrorCode.AI_PARSING_ERROR]: ErrorSeverity.MEDIUM,
  [ErrorCode.NETWORK_UNAVAILABLE]: ErrorSeverity.HIGH,
  [ErrorCode.CONNECTION_RESET]: ErrorSeverity.MEDIUM,
  [ErrorCode.RETRY_EXHAUSTED]: ErrorSeverity.HIGH,
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
  [ErrorCode.AI_CONTEXT_WINDOW_EXCEEDED]: false,
  [ErrorCode.AI_CONTENT_FILTERED]: false,
  [ErrorCode.AI_UNAVAILABLE]: true,
  [ErrorCode.AI_MODEL_ERROR]: true,
  [ErrorCode.AI_PARSING_ERROR]: false,
  [ErrorCode.NETWORK_UNAVAILABLE]: true,
  [ErrorCode.CONNECTION_RESET]: true,
  [ErrorCode.RETRY_EXHAUSTED]: false,
};

// API error class
export class ApiError extends Error {
  code: ErrorCode;
  statusCode: number;
  category: ErrorCategory;
  severity: ErrorSeverity;
  details?: any;
  isOperational: boolean;
  isRetriable: boolean;
  retryAfter?: number; // Time in ms to wait before retrying
  requestId?: string;  // For tracking error across systems

  constructor(
    code: ErrorCode,
    message: string,
    details?: any,
    isOperational = true,
    requestId?: string
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = errorStatusCodes[code];
    this.category = errorCategories[code];
    this.severity = errorSeverityLevels[code];
    this.details = details;
    this.isOperational = isOperational;
    this.isRetriable = isRetriableError[code];
    this.requestId = requestId;
    
    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

// Common error creation helpers
export const createBadRequestError = (message: string, details?: any, requestId?: string) => 
  new ApiError(ErrorCode.BAD_REQUEST, message, details, true, requestId);

export const createUnauthorizedError = (message: string, details?: any, requestId?: string) => 
  new ApiError(ErrorCode.UNAUTHORIZED, message, details, true, requestId);

export const createForbiddenError = (message: string, details?: any, requestId?: string) => 
  new ApiError(ErrorCode.FORBIDDEN, message, details, true, requestId);

export const createNotFoundError = (message: string, details?: any, requestId?: string) => 
  new ApiError(ErrorCode.NOT_FOUND, message, details, true, requestId);

export const createRateLimitedError = (message: string, details?: any, retryAfter?: number, requestId?: string) => {
  const error = new ApiError(ErrorCode.RATE_LIMITED, message, details, true, requestId);
  error.retryAfter = retryAfter;
  return error;
};

export const createInternalError = (message: string, details?: any, isOperational = true, requestId?: string) => 
  new ApiError(ErrorCode.INTERNAL_ERROR, message, details, isOperational, requestId);

export const createValidationError = (message: string, details?: any, requestId?: string) => 
  new ApiError(ErrorCode.VALIDATION_ERROR, message, details, true, requestId);

export const createExternalApiError = (message: string, details?: any, isRetriable = true, requestId?: string) => {
  const error = new ApiError(ErrorCode.EXTERNAL_API_ERROR, message, details, true, requestId);
  error.isRetriable = isRetriable;
  return error;
};

export const createDatabaseError = (message: string, details?: any, requestId?: string) => 
  new ApiError(ErrorCode.DATABASE_ERROR, message, details, true, requestId);

export const createTimeoutError = (message: string, details?: any, requestId?: string) => 
  new ApiError(ErrorCode.TIMEOUT_ERROR, message, details, true, requestId);

// AI-specific errors
export const createAiQuotaExceededError = (message: string, details?: any, retryAfter?: number, requestId?: string) => {
  const error = new ApiError(ErrorCode.AI_QUOTA_EXCEEDED, message, details, true, requestId);
  error.retryAfter = retryAfter;
  return error;
};

export const createAiContextWindowExceededError = (message: string, details?: any, requestId?: string) => 
  new ApiError(ErrorCode.AI_CONTEXT_WINDOW_EXCEEDED, message, details, true, requestId);

export const createAiContentFilteredError = (message: string, details?: any, requestId?: string) => 
  new ApiError(ErrorCode.AI_CONTENT_FILTERED, message, details, true, requestId);

export const createAiUnavailableError = (message: string, details?: any, requestId?: string) => 
  new ApiError(ErrorCode.AI_UNAVAILABLE, message, details, true, requestId);

export const createAiModelError = (message: string, details?: any, requestId?: string) => 
  new ApiError(ErrorCode.AI_MODEL_ERROR, message, details, true, requestId);

export const createAiParsingError = (message: string, details?: any, requestId?: string) => 
  new ApiError(ErrorCode.AI_PARSING_ERROR, message, details, true, requestId);

// Network errors
export const createNetworkUnavailableError = (message: string, details?: any, requestId?: string) => 
  new ApiError(ErrorCode.NETWORK_UNAVAILABLE, message, details, true, requestId);

export const createConnectionResetError = (message: string, details?: any, requestId?: string) => 
  new ApiError(ErrorCode.CONNECTION_RESET, message, details, true, requestId);

// Retry exhausted error
export const createRetryExhaustedError = (message: string, details?: any, requestId?: string) => 
  new ApiError(ErrorCode.RETRY_EXHAUSTED, message, details, true, requestId);

/**
 * Format error response for API
 */
export const formatErrorResponse = (error: ApiError | Error) => {
  // If ApiError, use its code and statusCode
  if (error instanceof ApiError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        category: error.category,
        ...(error.details ? { details: error.details } : {}),
        ...(error.requestId ? { requestId: error.requestId } : {}),
      },
    };
  }

  // For general errors, use internal error
  return {
    success: false,
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred' 
        : error.message || 'Unknown error',
      category: ErrorCategory.UNKNOWN_ERROR,
    },
  };
};

/**
 * Error handler for Next.js API routes
 */
export const errorHandler = (error: ApiError | Error, req: NextApiRequest, res: NextApiResponse) => {
  // Log the error
  if (error instanceof ApiError) {
    // Log operational errors at 'error' level
    logger.error(`API Error: ${error.message}`, error, {
      path: req.url,
      method: req.method,
      code: error.code,
      isOperational: error.isOperational,
    });
  } else {
    // Log programming/unknown errors at 'fatal' level
    logger.fatal(`Unhandled Error: ${error.message}`, error, {
      path: req.url,
      method: req.method,
    });
  }

  // Determine status code (default to 500 if not ApiError)
  const statusCode = error instanceof ApiError ? error.statusCode : 500;

  // Send formatted error response
  res.status(statusCode).json(formatErrorResponse(error));
};

/**
 * Error handler for App Router API routes
 */
export const appRouterErrorHandler = (error: ApiError | Error, req: Request) => {
  // Log the error
  if (error instanceof ApiError) {
    // Log operational errors at 'error' level
    logger.error(`API Error: ${error.message}`, error, {
      path: req.url,
      method: req.method,
      code: error.code,
      isOperational: error.isOperational,
    });
  } else {
    // Log programming/unknown errors at 'fatal' level
    logger.fatal(`Unhandled Error: ${error.message}`, error, {
      path: req.url,
      method: req.method,
    });
  }

  // Determine status code (default to 500 if not ApiError)
  const statusCode = error instanceof ApiError ? error.statusCode : 500;
  
  // Return formatted NextResponse with error
  return NextResponse.json(
    formatErrorResponse(error),
    { status: statusCode }
  );
};

/**
 * Wrapper for handling async errors in API routes
 */
export const asyncHandler = (fn: (req: NextApiRequest, res: NextApiResponse) => Promise<any>) => {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      // Execute the handler
      await fn(req, res);
    } catch (error) {
      // Handle any errors
      errorHandler(error instanceof Error ? error : new Error(String(error)), req, res);
    }
  };
};

/**
 * Wrapper for handling async errors in App Router routes
 */
export const appRouterAsyncHandler = <T>(
  fn: (req: Request, context?: T) => Promise<Response>
) => {
  return async (req: Request, context?: T): Promise<Response> => {
    try {
      // Execute the handler
      return await fn(req, context);
    } catch (error) {
      // Handle any errors
      return appRouterErrorHandler(error instanceof Error ? error : new Error(String(error)), req);
    }
  };
};

/**
 * Validate request body against a validation function
 */
export const validateRequest = <T>(
  req: NextApiRequest | Request,
  validationFn: (data: any) => { valid: boolean, data?: T, errors?: any }
) => {
  let requestData: any;
  
  // Handle different request types
  if ('body' in req && req.body) {
    requestData = req.body;
  } else if (req instanceof Request) {
    try {
      // Note: This will need to be awaited in the calling function
      requestData = req.json();
    } catch (error) {
      throw createBadRequestError('Invalid JSON payload');
    }
  } else {
    throw createBadRequestError('Request body is required');
  }
  
  // Validate the data
  const result = validationFn(requestData);
  
  if (!result.valid) {
    throw createValidationError('Validation failed', result.errors);
  }
  
  return result.data;
};

// Error monitoring function to send errors to external monitoring service
export const monitorError = async (
  error: Error | ApiError,
  context?: Record<string, any>
) => {
  // Skip monitoring for operational errors in development
  if (
    process.env.NODE_ENV !== 'production' &&
    error instanceof ApiError &&
    error.isOperational
  ) {
    return;
  }
  
  // Log the error
  if (error instanceof ApiError) {
    logger.error(`Monitored API Error: ${error.message}`, error, {
      ...context,
      code: error.code,
      isOperational: error.isOperational,
    });
  } else {
    logger.fatal(`Monitored Unhandled Error: ${error.message}`, error, context);
  }
  
  // TODO: In the future, we can integrate with external monitoring services
  // For example:
  // - Sentry
  // - LogRocket
  // - DataDog
  // - New Relic
  // This would look something like:
  // if (process.env.SENTRY_DSN) {
  //   Sentry.captureException(error, { extra: context });
  // }
};

/**
 * Global unhandled error handler
 */
export const setupGlobalErrorHandlers = () => {
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: Error | any) => {
    logger.fatal('Unhandled Promise Rejection', reason);
    // Don't exit in production, but do in development
    if (process.env.NODE_ENV !== 'production') {
      process.exit(1);
    }
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logger.fatal('Uncaught Exception', error);
    // Exit with error
    process.exit(1);
  });
}; 