/**
 * Standardized error response utilities for consistent UX
 * Ensures all API errors follow the same format and user experience patterns
 */

import { NextResponse } from 'next/server';

export interface StandardErrorResponse {
  success: false;
  error: {
    message: string;        // User-friendly message
    code: string;          // Error code for client handling
    severity: 'low' | 'medium' | 'high';
    recoverable: boolean;
    retryAfter?: number;   // Seconds
    context?: Record<string, unknown>;
  };
  timestamp: string;
  requestId?: string;
}

export interface StandardSuccessResponse {
  success: true;
  data: Record<string, unknown>;
  timestamp: string;
  requestId?: string;
}

/**
 * Standard error codes and their user-friendly messages
 */
export const ERROR_CODES = {
  SERVICE_INITIALIZING: {
    message: 'Service temporarily unavailable. Our system is initializing - please try again in a moment.',
    severity: 'medium' as const,
    recoverable: true,
    retryAfter: 30
  },
  UNAUTHORIZED: {
    message: 'Access denied. Please check your credentials.',
    severity: 'medium' as const,
    recoverable: true
  },
  RATE_LIMITED: {
    message: 'Too many requests. Please wait before trying again.',
    severity: 'low' as const,
    recoverable: true,
    retryAfter: 60
  },
  DATABASE_ERROR: {
    message: 'Database temporarily unavailable. Please try again shortly.',
    severity: 'high' as const,
    recoverable: true,
    retryAfter: 30
  },
  VALIDATION_ERROR: {
    message: 'Invalid request. Please check your input and try again.',
    severity: 'low' as const,
    recoverable: true
  },
  INTERNAL_ERROR: {
    message: 'An unexpected error occurred. Our team has been notified.',
    severity: 'high' as const,
    recoverable: false
  }
} as const;

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  errorCode: keyof typeof ERROR_CODES,
  status: number,
  context?: Record<string, unknown>
): NextResponse {
  const errorConfig = ERROR_CODES[errorCode];
  
  const response: StandardErrorResponse = {
    success: false,
    error: {
      message: errorConfig.message,
      code: errorCode,
      severity: errorConfig.severity,
      recoverable: errorConfig.recoverable,
      retryAfter: errorConfig.retryAfter,
      context
    },
    timestamp: new Date().toISOString(),
    requestId: generateRequestId()
  };

  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (errorConfig.retryAfter) {
    headers['Retry-After'] = errorConfig.retryAfter.toString();
  }

  return NextResponse.json(response, { status, headers });
}

/**
 * Create a standardized success response
 */
export function createSuccessResponse(
  data: Record<string, unknown>,
  status: number = 200
): NextResponse {
  const response: StandardSuccessResponse = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
    requestId: generateRequestId()
  };

  return NextResponse.json(response, { status });
}

/**
 * Generate a unique request ID for tracking
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Convert a generic error to a standardized error code
 */
export function categorizeError(error: unknown): keyof typeof ERROR_CODES {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('unauthorized') || message.includes('auth')) {
      return 'UNAUTHORIZED';
    }
    
    if (message.includes('rate limit') || message.includes('too many')) {
      return 'RATE_LIMITED';
    }
    
    if (message.includes('database') || message.includes('prisma')) {
      return 'DATABASE_ERROR';
    }
    
    if (message.includes('validation') || message.includes('invalid')) {
      return 'VALIDATION_ERROR';
    }
    
    if (message.includes('initialization') || message.includes('starting')) {
      return 'SERVICE_INITIALIZING';
    }
  }
  
  return 'INTERNAL_ERROR';
}

/**
 * Wrap an async function with standardized error handling
 */
export function withStandardizedErrors<T extends unknown[], R>(
  fn: (...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await fn(...args);
    } catch (error) {
      const errorCode = categorizeError(error);
      const status = errorCode === 'UNAUTHORIZED' ? 401 : 
                    errorCode === 'RATE_LIMITED' ? 429 :
                    errorCode === 'VALIDATION_ERROR' ? 400 :
                    errorCode === 'SERVICE_INITIALIZING' ? 503 : 500;
      
      return createErrorResponse(errorCode, status, {
        originalError: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  };
}