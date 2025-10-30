/**
 * Input Validation for Rate Limiting System
 * 
 * Provides comprehensive input validation and sanitization to prevent
 * security vulnerabilities in the rate limiting infrastructure.
 * 
 * Features:
 * - Header value validation and sanitization
 * - URL parsing with error handling
 * - Request identifier validation
 * - Input length limits and character restrictions
 */

import { logger } from '../../logging';

const validationLogger = logger.child('rate-limit-validator');

// Validation constants
const VALIDATION_LIMITS = {
  MAX_HEADER_LENGTH: 256,
  MAX_URL_LENGTH: 2048,
  MAX_IP_LENGTH: 45, // IPv6 max length
  MAX_USER_ID_LENGTH: 64,
  MAX_EXECUTION_ID_LENGTH: 128
};

// Valid character patterns
const PATTERNS = {
  HEADER_VALUE: /^[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=\s]*$/,
  IP_ADDRESS: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/,
  USER_ID: /^[a-zA-Z0-9\-_]{1,64}$/,
  EXECUTION_ID: /^[a-zA-Z0-9\-._]{1,128}$/,
  HMAC_SIGNATURE: /^[a-fA-F0-9]{64}$/,
  HMAC_TIMESTAMP: /^[0-9]{13}$/
};

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  sanitizedValue?: string;
  error?: string;
}

/**
 * Input validation utilities for rate limiting
 */
export class RateLimitInputValidator {
  
  /**
   * Validate and sanitize a header value
   */
  static validateHeader(headerName: string, headerValue: string | null): ValidationResult {
    if (!headerValue) {
      return { isValid: true, sanitizedValue: null };
    }

    // Check length
    if (headerValue.length > VALIDATION_LIMITS.MAX_HEADER_LENGTH) {
      validationLogger.warn('Header value too long', {
        headerName,
        length: headerValue.length,
        maxLength: VALIDATION_LIMITS.MAX_HEADER_LENGTH
      });
      return { 
        isValid: false, 
        error: 'Header value exceeds maximum length' 
      };
    }

    // Check for valid characters
    if (!PATTERNS.HEADER_VALUE.test(headerValue)) {
      validationLogger.warn('Header value contains invalid characters', {
        headerName,
        value: headerValue.substring(0, 50) + '...'
      });
      return { 
        isValid: false, 
        error: 'Header value contains invalid characters' 
      };
    }

    // Sanitize by trimming whitespace
    const sanitized = headerValue.trim();
    
    return { isValid: true, sanitizedValue: sanitized };
  }

  /**
   * Validate HMAC signature header
   */
  static validateHmacSignature(signature: string | null): ValidationResult {
    if (!signature) {
      return { isValid: true, sanitizedValue: null };
    }

    if (!PATTERNS.HMAC_SIGNATURE.test(signature)) {
      validationLogger.warn('Invalid HMAC signature format', {
        signatureLength: signature.length
      });
      return { 
        isValid: false, 
        error: 'Invalid HMAC signature format' 
      };
    }

    return { isValid: true, sanitizedValue: signature.toLowerCase() };
  }

  /**
   * Validate HMAC timestamp header
   */
  static validateHmacTimestamp(timestamp: string | null): ValidationResult {
    if (!timestamp) {
      return { isValid: true, sanitizedValue: null };
    }

    if (!PATTERNS.HMAC_TIMESTAMP.test(timestamp)) {
      validationLogger.warn('Invalid HMAC timestamp format', {
        timestamp
      });
      return { 
        isValid: false, 
        error: 'Invalid HMAC timestamp format' 
      };
    }

    const ts = parseInt(timestamp, 10);
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    if (Math.abs(now - ts) > maxAge) {
      validationLogger.warn('HMAC timestamp too old or in future', {
        timestamp: ts,
        now,
        age: Math.abs(now - ts)
      });
      return { 
        isValid: false, 
        error: 'HMAC timestamp too old or in future' 
      };
    }

    return { isValid: true, sanitizedValue: timestamp };
  }

  /**
   * Validate and sanitize IP address
   */
  static validateIpAddress(ip: string | null): ValidationResult {
    if (!ip || ip === 'unknown') {
      return { isValid: true, sanitizedValue: 'unknown' };
    }

    if (ip.length > VALIDATION_LIMITS.MAX_IP_LENGTH) {
      validationLogger.warn('IP address too long', {
        length: ip.length,
        maxLength: VALIDATION_LIMITS.MAX_IP_LENGTH
      });
      return { 
        isValid: false, 
        error: 'IP address exceeds maximum length' 
      };
    }

    // Extract first IP if comma-separated (x-forwarded-for header)
    const firstIp = ip.split(',')[0].trim();

    if (!PATTERNS.IP_ADDRESS.test(firstIp)) {
      validationLogger.warn('Invalid IP address format', {
        ip: firstIp
      });
      return { 
        isValid: false, 
        error: 'Invalid IP address format' 
      };
    }

    return { isValid: true, sanitizedValue: firstIp };
  }

  /**
   * Validate user ID
   */
  static validateUserId(userId: string | null): ValidationResult {
    if (!userId) {
      return { isValid: true, sanitizedValue: null };
    }

    if (!PATTERNS.USER_ID.test(userId)) {
      validationLogger.warn('Invalid user ID format', {
        userId: userId.substring(0, 20) + '...'
      });
      return { 
        isValid: false, 
        error: 'Invalid user ID format' 
      };
    }

    return { isValid: true, sanitizedValue: userId };
  }

  /**
   * Validate execution ID
   */
  static validateExecutionId(executionId: string | null): ValidationResult {
    if (!executionId) {
      return { isValid: true, sanitizedValue: null };
    }

    if (!PATTERNS.EXECUTION_ID.test(executionId)) {
      validationLogger.warn('Invalid execution ID format', {
        executionId: executionId.substring(0, 20) + '...'
      });
      return { 
        isValid: false, 
        error: 'Invalid execution ID format' 
      };
    }

    return { isValid: true, sanitizedValue: executionId };
  }

  /**
   * Safely parse URL with validation
   */
  static parseUrl(urlString: string): { isValid: boolean; url?: URL; error?: string } {
    try {
      if (urlString.length > VALIDATION_LIMITS.MAX_URL_LENGTH) {
        validationLogger.warn('URL too long', {
          length: urlString.length,
          maxLength: VALIDATION_LIMITS.MAX_URL_LENGTH
        });
        return { 
          isValid: false, 
          error: 'URL exceeds maximum length' 
        };
      }

      const url = new URL(urlString);
      
      // Additional validation for suspicious patterns
      if (url.pathname.includes('..') || url.pathname.includes('//')) {
        validationLogger.warn('Suspicious URL path detected', {
          pathname: url.pathname
        });
        return { 
          isValid: false, 
          error: 'Invalid URL path' 
        };
      }

      return { isValid: true, url };
      
    } catch (error) {
      validationLogger.warn('URL parsing failed', {
        url: urlString.substring(0, 100) + '...',
        error: error.message
      });
      return { 
        isValid: false, 
        error: 'Invalid URL format' 
      };
    }
  }

  /**
   * Validate user agent string
   */
  static validateUserAgent(userAgent: string | null): ValidationResult {
    if (!userAgent) {
      return { isValid: true, sanitizedValue: null };
    }

    // Check length
    if (userAgent.length > VALIDATION_LIMITS.MAX_HEADER_LENGTH) {
      validationLogger.warn('User agent too long', {
        length: userAgent.length,
        maxLength: VALIDATION_LIMITS.MAX_HEADER_LENGTH
      });
      return { 
        isValid: false, 
        error: 'User agent exceeds maximum length' 
      };
    }

    // Sanitize by removing potential control characters
    const sanitized = userAgent.replace(/[\x00-\x1f\x7f-\x9f]/g, '').trim();
    
    return { isValid: true, sanitizedValue: sanitized };
  }

  /**
   * Comprehensive request validation
   */
  static validateRateLimitRequest(request: {
    hmacSignature?: string | null;
    hmacTimestamp?: string | null;
    userAgent?: string | null;
    forwardedFor?: string | null;
    realIp?: string | null;
    connectingIp?: string | null;
    userId?: string | null;
    executionId?: string | null;
    url: string;
  }): { isValid: boolean; errors: string[]; sanitized: Record<string, string | null> } {
    const errors: string[] = [];
    const sanitized: Record<string, string | null> = {};

    // Validate URL
    const urlResult = this.parseUrl(request.url);
    if (!urlResult.isValid) {
      errors.push(urlResult.error || 'Invalid URL');
    }

    // Validate HMAC signature
    const signatureResult = this.validateHmacSignature(request.hmacSignature);
    if (!signatureResult.isValid) {
      errors.push(signatureResult.error || 'Invalid HMAC signature');
    } else {
      sanitized.hmacSignature = signatureResult.sanitizedValue;
    }

    // Validate HMAC timestamp
    const timestampResult = this.validateHmacTimestamp(request.hmacTimestamp);
    if (!timestampResult.isValid) {
      errors.push(timestampResult.error || 'Invalid HMAC timestamp');
    } else {
      sanitized.hmacTimestamp = timestampResult.sanitizedValue;
    }

    // Validate user agent
    const userAgentResult = this.validateUserAgent(request.userAgent);
    if (!userAgentResult.isValid) {
      errors.push(userAgentResult.error || 'Invalid user agent');
    } else {
      sanitized.userAgent = userAgentResult.sanitizedValue;
    }

    // Validate IP addresses
    const ipSources = ['forwardedFor', 'realIp', 'connectingIp'] as const;
    for (const source of ipSources) {
      if (request[source]) {
        const ipResult = this.validateIpAddress(request[source]);
        if (!ipResult.isValid) {
          errors.push(`${source}: ${ipResult.error || 'Invalid IP address'}`);
        } else {
          sanitized[source] = ipResult.sanitizedValue;
        }
      }
    }

    // Validate user ID
    const userIdResult = this.validateUserId(request.userId);
    if (!userIdResult.isValid) {
      errors.push(userIdResult.error || 'Invalid user ID');
    } else {
      sanitized.userId = userIdResult.sanitizedValue;
    }

    // Validate execution ID
    const executionIdResult = this.validateExecutionId(request.executionId);
    if (!executionIdResult.isValid) {
      errors.push(executionIdResult.error || 'Invalid execution ID');
    } else {
      sanitized.executionId = executionIdResult.sanitizedValue;
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitized
    };
  }
}