import { NextApiRequest, NextApiResponse } from 'next';
import { NextResponse } from 'next/server';
import { logger } from '../logging';
import { 
  ErrorCategory, 
  ErrorCode, 
  ErrorSeverity,
  errorStatusCodes,
  errorCategories,
  errorSeverityLevels,
  isRetriableError
} from './constants';

// Re-export constants for backward compatibility
export { 
  ErrorCategory, 
  ErrorCode, 
  ErrorSeverity,
  isRetriableError
} from './constants';

// API error class
export class ApiError extends Error {
  code: ErrorCode;
  statusCode: number;
  category: ErrorCategory;
  severity: ErrorSeverity;
  details?: unknown;
  isOperational: boolean;
  isRetriable: boolean;
  retryAfter?: number; // Time in ms to wait before retrying
  requestId?: string;  // For tracking error across systems

  constructor(
    code: ErrorCode,
    message: string,
    details?: unknown,
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
export const createBadRequestError = (message: string, details?: unknown, requestId?: string) => 
  new ApiError(ErrorCode.BAD_REQUEST, message, details, true, requestId);

export const createUnauthorizedError = (message: string, details?: unknown, requestId?: string) => 
  new ApiError(ErrorCode.UNAUTHORIZED, message, details, true, requestId);

export const createForbiddenError = (message: string, details?: unknown, requestId?: string) => 
  new ApiError(ErrorCode.FORBIDDEN, message, details, true, requestId);

export const createNotFoundError = (message: string, details?: unknown, requestId?: string) => 
  new ApiError(ErrorCode.NOT_FOUND, message, details, true, requestId);

export const createRateLimitedError = (message: string, details?: unknown, retryAfter?: number, requestId?: string) => {
  const error = new ApiError(ErrorCode.RATE_LIMITED, message, details, true, requestId);
  error.retryAfter = retryAfter;
  return error;
};

export const createInternalError = (message: string, details?: unknown, isOperational = true, requestId?: string) => 
  new ApiError(ErrorCode.INTERNAL_ERROR, message, details, isOperational, requestId);

export const createValidationError = (message: string, details?: unknown, requestId?: string) => 
  new ApiError(ErrorCode.VALIDATION_ERROR, message, details, true, requestId);

export const createExternalApiError = (message: string, details?: unknown, isRetriable = true, requestId?: string) => {
  const error = new ApiError(ErrorCode.EXTERNAL_API_ERROR, message, details, true, requestId);
  error.isRetriable = isRetriable;
  return error;
};

export const createDatabaseError = (message: string, details?: unknown, requestId?: string) => 
  new ApiError(ErrorCode.DATABASE_ERROR, message, details, true, requestId);

export const createTimeoutError = (message: string, details?: unknown, requestId?: string) => 
  new ApiError(ErrorCode.TIMEOUT_ERROR, message, details, true, requestId);

// AI-specific errors
export const createAiQuotaExceededError = (message: string, details?: unknown, retryAfter?: number, requestId?: string) => {
  const error = new ApiError(ErrorCode.AI_QUOTA_EXCEEDED, message, details, true, requestId);
  error.retryAfter = retryAfter;
  return error;
};

export const createAiContextWindowExceededError = (message: string, details?: unknown, requestId?: string) => 
  new ApiError(ErrorCode.AI_CONTEXT_WINDOW_EXCEEDED, message, details, true, requestId);

export const createAiContentFilteredError = (message: string, details?: unknown, requestId?: string) => 
  new ApiError(ErrorCode.AI_CONTENT_FILTERED, message, details, true, requestId);

export const createAiUnavailableError = (message: string, details?: unknown, requestId?: string) => 
  new ApiError(ErrorCode.AI_UNAVAILABLE, message, details, true, requestId);

export const createAiModelError = (message: string, details?: unknown, requestId?: string) => 
  new ApiError(ErrorCode.AI_MODEL_ERROR, message, details, true, requestId);

export const createAiParsingError = (message: string, details?: unknown, requestId?: string) => 
  new ApiError(ErrorCode.AI_PARSING_ERROR, message, details, true, requestId);

// Network errors
export const createNetworkUnavailableError = (message: string, details?: unknown, requestId?: string) => 
  new ApiError(ErrorCode.NETWORK_UNAVAILABLE, message, details, true, requestId);

export const createConnectionResetError = (message: string, details?: unknown, requestId?: string) => 
  new ApiError(ErrorCode.CONNECTION_RESET, message, details, true, requestId);

// Retry-specific errors
export const createRetryExhaustedError = (message: string, details?: unknown, requestId?: string) => 
  new ApiError(ErrorCode.RETRY_EXHAUSTED, message, details, true, requestId);

export const createCircuitOpenError = (message: string, details?: unknown, requestId?: string) => 
  new ApiError(ErrorCode.CIRCUIT_OPEN, message, details, true, requestId);

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
export const asyncHandler = (fn: (req: NextApiRequest, res: NextApiResponse) => Promise<unknown>) => {
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
  validationFn: (data: unknown) => { valid: boolean, data?: T, errors?: unknown }
) => {
  let requestData: unknown;
  
  // Handle different request types
  if ('body' in req && req.body) {
    requestData = req.body;
  } else if (req instanceof Request) {
    try {
      // Note: This will need to be awaited in the calling function
      requestData = req.json();
    } catch {
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
  context?: Record<string, unknown>
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
  
  // Integrate with external monitoring services
  try {
    // Sentry integration
    if (process.env.SENTRY_DSN && typeof window === 'undefined') {
      await sendToSentry(error, context);
    }
    
    // DataDog integration
    if (process.env.DATADOG_API_KEY) {
      await sendToDataDog(error, context);
    }
    
    // Custom webhook integration for general monitoring
    if (process.env.ERROR_WEBHOOK_URL) {
      await sendToWebhook(error, context);
    }
    
    // New Relic integration
    if (process.env.NEW_RELIC_LICENSE_KEY) {
      await sendToNewRelic(error, context);
    }
  } catch (monitoringError) {
    // Don't let monitoring errors crash the application
    logger.error('Error in external monitoring service', {
      error: monitoringError instanceof Error ? monitoringError.message : String(monitoringError),
      originalError: error.message
    });
  }
};

/**
 * Global unhandled error handler
 */
export const setupGlobalErrorHandlers = () => {
  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: Error | unknown) => {
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

/**
 * Send error to Sentry monitoring service
 */
async function sendToSentry(error: Error | ApiError, context?: Record<string, unknown>): Promise<void> {
  try {
    // This would typically use @sentry/node
    // For now, we'll implement a basic HTTP API approach
    const sentryData = {
      message: error.message,
      level: error instanceof ApiError && error.severity === ErrorSeverity.CRITICAL ? 'fatal' : 'error',
      extra: {
        ...context,
        ...(error instanceof ApiError ? {
          code: error.code,
          category: error.category,
          severity: error.severity,
          isOperational: error.isOperational,
          requestId: error.requestId
        } : {}),
        stack: error.stack
      },
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'unknown'
    };

    // Send to Sentry (placeholder - would use actual Sentry SDK)
    logger.debug('Would send to Sentry', { sentryData });
  } catch (err) {
    throw new Error(`Sentry monitoring failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Send error to DataDog monitoring service
 */
async function sendToDataDog(error: Error | ApiError, context?: Record<string, unknown>): Promise<void> {
  try {
    const datadogData = {
      message: error.message,
      level: 'error',
      service: 'tldrsec-ai',
      source: 'nodejs',
      tags: [
        `environment:${process.env.NODE_ENV || 'unknown'}`,
        ...(error instanceof ApiError ? [
          `error_code:${error.code}`,
          `error_category:${error.category}`,
          `error_severity:${error.severity}`
        ] : [])
      ],
      attributes: {
        ...context,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    };

    // Send to DataDog logs API (placeholder)
    logger.debug('Would send to DataDog', { datadogData });
  } catch (err) {
    throw new Error(`DataDog monitoring failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Send error to custom webhook monitoring service
 */
async function sendToWebhook(error: Error | ApiError, context?: Record<string, unknown>): Promise<void> {
  try {
    const webhookUrl = process.env.ERROR_WEBHOOK_URL!;
    
    const payload = {
      timestamp: new Date().toISOString(),
      service: 'tldrsec-ai',
      environment: process.env.NODE_ENV || 'unknown',
      error: {
        message: error.message,
        stack: error.stack,
        ...(error instanceof ApiError ? {
          code: error.code,
          category: error.category,
          severity: error.severity,
          statusCode: error.statusCode,
          isOperational: error.isOperational,
          isRetriable: error.isRetriable,
          requestId: error.requestId
        } : {})
      },
      context: context || {}
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'tldrsec-ai-error-monitor/1.0'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000) // 5 second timeout
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    logger.debug('Successfully sent error to webhook', { 
      url: webhookUrl, 
      status: response.status 
    });
  } catch (err) {
    throw new Error(`Webhook monitoring failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Send error to New Relic monitoring service
 */
async function sendToNewRelic(error: Error | ApiError, context?: Record<string, unknown>): Promise<void> {
  try {
    const newRelicData = {
      eventType: 'ErrorEvent',
      message: error.message,
      stack: error.stack,
      timestamp: Date.now(),
      service: 'tldrsec-ai',
      environment: process.env.NODE_ENV || 'unknown',
      ...(error instanceof ApiError ? {
        errorCode: error.code,
        errorCategory: error.category,
        errorSeverity: error.severity,
        isOperational: error.isOperational,
        requestId: error.requestId
      } : {}),
      ...context
    };

    // Send to New Relic Events API (placeholder)
    logger.debug('Would send to New Relic', { newRelicData });
  } catch (err) {
    throw new Error(`New Relic monitoring failed: ${err instanceof Error ? err.message : String(err)}`);
  }
} 