import { NextResponse } from 'next/server';
import { logger } from '@/lib/logging';
// Error codes
export var ErrorCode;
(function (ErrorCode) {
    ErrorCode["BAD_REQUEST"] = "BAD_REQUEST";
    ErrorCode["UNAUTHORIZED"] = "UNAUTHORIZED";
    ErrorCode["FORBIDDEN"] = "FORBIDDEN";
    ErrorCode["NOT_FOUND"] = "NOT_FOUND";
    ErrorCode["RATE_LIMITED"] = "RATE_LIMITED";
    ErrorCode["INTERNAL_ERROR"] = "INTERNAL_ERROR";
    ErrorCode["VALIDATION_ERROR"] = "VALIDATION_ERROR";
    ErrorCode["EXTERNAL_API_ERROR"] = "EXTERNAL_API_ERROR";
    ErrorCode["DATABASE_ERROR"] = "DATABASE_ERROR";
    ErrorCode["TIMEOUT_ERROR"] = "TIMEOUT_ERROR";
})(ErrorCode || (ErrorCode = {}));
// Map error codes to HTTP status codes
const errorStatusCodes = {
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
};
// API error class
export class ApiError extends Error {
    constructor(code, message, details, isOperational = true) {
        super(message);
        this.name = 'ApiError';
        this.code = code;
        this.statusCode = errorStatusCodes[code];
        this.details = details;
        this.isOperational = isOperational;
        // Capture stack trace
        Error.captureStackTrace(this, this.constructor);
    }
}
// Common error creation helpers
export const createBadRequestError = (message, details) => new ApiError(ErrorCode.BAD_REQUEST, message, details);
export const createUnauthorizedError = (message, details) => new ApiError(ErrorCode.UNAUTHORIZED, message, details);
export const createForbiddenError = (message, details) => new ApiError(ErrorCode.FORBIDDEN, message, details);
export const createNotFoundError = (message, details) => new ApiError(ErrorCode.NOT_FOUND, message, details);
export const createRateLimitedError = (message, details) => new ApiError(ErrorCode.RATE_LIMITED, message, details);
export const createInternalError = (message, details, isOperational = true) => new ApiError(ErrorCode.INTERNAL_ERROR, message, details, isOperational);
export const createValidationError = (message, details) => new ApiError(ErrorCode.VALIDATION_ERROR, message, details);
export const createExternalApiError = (message, details) => new ApiError(ErrorCode.EXTERNAL_API_ERROR, message, details);
export const createDatabaseError = (message, details) => new ApiError(ErrorCode.DATABASE_ERROR, message, details);
export const createTimeoutError = (message, details) => new ApiError(ErrorCode.TIMEOUT_ERROR, message, details);
/**
 * Format error response for API
 */
export const formatErrorResponse = (error) => {
    // If ApiError, use its code and statusCode
    if (error instanceof ApiError) {
        return {
            success: false,
            error: Object.assign({ code: error.code, message: error.message }, (error.details ? { details: error.details } : {})),
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
        },
    };
};
/**
 * Error handler for Next.js API routes
 */
export const errorHandler = (error, req, res) => {
    // Log the error
    if (error instanceof ApiError) {
        // Log operational errors at 'error' level
        logger.error(`API Error: ${error.message}`, error, {
            path: req.url,
            method: req.method,
            code: error.code,
            isOperational: error.isOperational,
        });
    }
    else {
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
export const appRouterErrorHandler = (error, req) => {
    // Log the error
    if (error instanceof ApiError) {
        // Log operational errors at 'error' level
        logger.error(`API Error: ${error.message}`, error, {
            path: req.url,
            method: req.method,
            code: error.code,
            isOperational: error.isOperational,
        });
    }
    else {
        // Log programming/unknown errors at 'fatal' level
        logger.fatal(`Unhandled Error: ${error.message}`, error, {
            path: req.url,
            method: req.method,
        });
    }
    // Determine status code (default to 500 if not ApiError)
    const statusCode = error instanceof ApiError ? error.statusCode : 500;
    // Return formatted NextResponse with error
    return NextResponse.json(formatErrorResponse(error), { status: statusCode });
};
/**
 * Wrapper for handling async errors in API routes
 */
export const asyncHandler = (fn) => {
    return async (req, res) => {
        try {
            // Execute the handler
            await fn(req, res);
        }
        catch (error) {
            // Handle any errors
            errorHandler(error instanceof Error ? error : new Error(String(error)), req, res);
        }
    };
};
/**
 * Wrapper for handling async errors in App Router routes
 */
export const appRouterAsyncHandler = (fn) => {
    return async (req, context) => {
        try {
            // Execute the handler
            return await fn(req, context);
        }
        catch (error) {
            // Handle any errors
            return appRouterErrorHandler(error instanceof Error ? error : new Error(String(error)), req);
        }
    };
};
/**
 * Validate request body against a validation function
 */
export const validateRequest = (req, validationFn) => {
    let requestData;
    // Handle different request types
    if ('body' in req && req.body) {
        requestData = req.body;
    }
    else if (req instanceof Request) {
        try {
            // Note: This will need to be awaited in the calling function
            requestData = req.json();
        }
        catch (error) {
            throw createBadRequestError('Invalid JSON payload');
        }
    }
    else {
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
export const monitorError = async (error, context) => {
    // Skip monitoring for operational errors in development
    if (process.env.NODE_ENV !== 'production' &&
        error instanceof ApiError &&
        error.isOperational) {
        return;
    }
    // Log the error
    if (error instanceof ApiError) {
        logger.error(`Monitored API Error: ${error.message}`, error, Object.assign(Object.assign({}, context), { code: error.code, isOperational: error.isOperational }));
    }
    else {
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
    process.on('unhandledRejection', (reason) => {
        logger.fatal('Unhandled Promise Rejection', reason);
        // Don't exit in production, but do in development
        if (process.env.NODE_ENV !== 'production') {
            process.exit(1);
        }
    });
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
        logger.fatal('Uncaught Exception', error);
        // Exit with error
        process.exit(1);
    });
};
