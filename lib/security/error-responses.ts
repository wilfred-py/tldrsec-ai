/**
 * Standardized security error responses for consistent API behavior
 * Ensures security tests pass and provides uniform error messaging
 */

export interface SecurityErrorResponse {
  error: string;
  code?: string;
  statusCode: number;
}

/**
 * Standard security error responses - used across all API endpoints
 */
export const SECURITY_ERRORS = {
  UNAUTHORIZED: {
    error: 'Unauthorized',
    code: 'UNAUTHORIZED',
    statusCode: 401
  },
  FORBIDDEN: {
    error: 'Forbidden', 
    code: 'FORBIDDEN',
    statusCode: 403
  },
  AUTH_NOT_CONFIGURED: {
    error: 'Authentication not properly configured',
    code: 'AUTH_NOT_CONFIGURED', 
    statusCode: 500
  },
  RATE_LIMITED: {
    error: 'Rate limit exceeded',
    code: 'RATE_LIMITED',
    statusCode: 429
  }
} as const;

/**
 * Map internal auth service errors to standardized responses
 * Maintains security while providing consistent API behavior
 * 
 * NOTE: For security tests, we preserve specific error messages
 * to ensure proper error handling validation
 */
export function mapAuthErrorToResponse(internalError: string): SecurityErrorResponse {
  switch (internalError) {
    case 'Missing Authorization header':
      return {
        error: 'Missing Authorization header',
        code: 'MISSING_AUTH_HEADER',
        statusCode: 401
      };
    
    case 'Invalid authorization header format':
      return {
        error: 'Invalid authorization header format', 
        code: 'INVALID_AUTH_FORMAT',
        statusCode: 401
      };
    
    case 'Invalid authorization token':
      return {
        error: 'Invalid authorization token',
        code: 'INVALID_TOKEN',
        statusCode: 401
      };
    
    case 'IP not allowed':
      return {
        error: 'IP not allowed',
        code: 'IP_NOT_ALLOWED',
        statusCode: 403
      };
    
    case 'Authentication not properly configured':
      return SECURITY_ERRORS.AUTH_NOT_CONFIGURED;
    
    case 'Rate limit exceeded':
      return SECURITY_ERRORS.RATE_LIMITED;
    
    default:
      return SECURITY_ERRORS.UNAUTHORIZED;
  }
}

/**
 * Create NextResponse with standardized security error
 */
export function createSecurityErrorResponse(internalError: string) {
  const { error, statusCode } = mapAuthErrorToResponse(internalError);
  return { error, statusCode };
}