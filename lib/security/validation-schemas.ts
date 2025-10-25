/**
 * Comprehensive Input Validation and Injection Prevention
 * 
 * Implements defense-in-depth input validation using Zod schemas
 * to prevent SQL injection, XSS, and other injection attacks.
 */

import { z } from 'zod';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { logger } from '../logging';

const validationLogger = logger.child('validation');

// Setup DOMPurify for server-side XSS prevention
const window = new JSDOM('').window;
const purify = DOMPurify(window as unknown as Window);

/**
 * Common validation patterns for SEC filing platform
 */
export const VALIDATION_PATTERNS = {
  // User ID - UUIDs only
  userId: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  
  // SEC ticker symbols - 1-5 uppercase letters
  tickerSymbol: /^[A-Z]{1,5}$/,
  
  // SEC accession numbers - format: 0000000000-00-000000
  accessionNumber: /^\d{10}-\d{2}-\d{6}$/,
  
  // SEC CIK numbers - 1-10 digits
  cikNumber: /^\d{1,10}$/,
  
  // Email addresses - RFC 5322 compliant
  email: /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
  
  // Alert types - predefined enum values
  alertType: /^(EXECUTION_FAILED|HIGH_ERROR_RATE|COST_THRESHOLD_EXCEEDED|PERFORMANCE_DEGRADED|NO_FILINGS_PROCESSED|EMAIL_DELIVERY_FAILED|TIMEOUT_EXCEEDED|MEMORY_LIMIT_EXCEEDED|API_RATE_LIMIT_HIT|DATABASE_CONNECTION_FAILED)$/,
  
  // Severity levels
  severity: /^(LOW|MEDIUM|HIGH|CRITICAL)$/,
  
  // Subscription tiers
  subscriptionTier: /^(HOBBY|PRO|ENTERPRISE)$/,
  
  // Environment names
  environment: /^(development|staging|production|test)$/
} as const;

/**
 * SQL injection prevention - whitelist approach
 */
// Reserved for future use
// const SQL_SAFE_CHARS = /^[a-zA-Z0-9_\-\s.,()]+$/;

/**
 * Base validation utilities
 */
export class ValidationUtils {
  /**
   * Sanitize string input to prevent XSS attacks
   */
  static sanitizeString(input: string, maxLength: number = 1000): string {
    if (typeof input !== 'string') {
      throw new Error('Input must be a string');
    }
    
    if (input.length > maxLength) {
      throw new Error(`Input exceeds maximum length of ${maxLength} characters`);
    }
    
    // Use DOMPurify to remove XSS vectors
    const sanitized = purify.sanitize(input, { 
      ALLOWED_TAGS: [], 
      ALLOWED_ATTR: [],
      USE_PROFILES: { html: false }
    });
    
    return sanitized.trim();
  }

  /**
   * Validate and sanitize JSON input
   */
  static sanitizeJsonString(input: string, maxSize: number = 10000): unknown {
    if (typeof input !== 'string') {
      throw new Error('JSON input must be a string');
    }
    
    if (input.length > maxSize) {
      throw new Error(`JSON input exceeds maximum size of ${maxSize} bytes`);
    }
    
    try {
      const parsed = JSON.parse(input);
      
      // Recursively sanitize string values in the JSON
      return this.recursiveSanitizeJson(parsed);
    } catch {
      throw new Error('Invalid JSON format');
    }
  }

  /**
   * Check for SQL injection patterns
   */
  static validateSqlSafety(input: string): boolean {
    if (typeof input !== 'string') {
      return false;
    }
    
    const lowerInput = input.toLowerCase();
    
    // Check for common SQL injection patterns
    const sqlInjectionPatterns = [
      /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/i,
      /(--|\/\*|\*\/|;|'|"|`)/,
      /(\bor\b|\band\b)\s+\w+\s*=\s*\w+/i,
      /(\b(waitfor|delay)\b)/i,
      /(@@version|@@servername|information_schema)/i
    ];
    
    return !sqlInjectionPatterns.some(pattern => pattern.test(lowerInput));
  }

  /**
   * Recursively sanitize JSON object
   */
  private static recursiveSanitizeJson(obj: unknown): unknown {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }
    
    if (typeof obj === 'number' || typeof obj === 'boolean') {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.recursiveSanitizeJson(item));
    }
    
    if (typeof obj === 'object') {
      const sanitized: Record<string, unknown> = {};
      
      Object.entries(obj as Record<string, unknown>).forEach(([key, value]) => {
        // Sanitize property names to prevent prototype pollution
        const sanitizedKey = this.sanitizeString(key, 100);
        if (sanitizedKey && !['__proto__', 'constructor', 'prototype'].includes(sanitizedKey)) {
          sanitized[sanitizedKey] = this.recursiveSanitizeJson(value);
        }
      });
      
      return sanitized;
    }
    
    return obj;
  }
}

/**
 * Alert validation schemas
 */
export const AlertValidationSchemas = {
  /**
   * Alert creation schema
   */
  createAlert: z.object({
    executionId: z.string()
      .uuid('Execution ID must be a valid UUID')
      .transform(id => ValidationUtils.sanitizeString(id)),
    
    alertType: z.string()
      .regex(VALIDATION_PATTERNS.alertType, 'Invalid alert type')
      .transform(type => ValidationUtils.sanitizeString(type)),
    
    severity: z.string()
      .regex(VALIDATION_PATTERNS.severity, 'Invalid severity level')
      .transform(severity => ValidationUtils.sanitizeString(severity)),
    
    message: z.string()
      .min(1, 'Alert message cannot be empty')
      .max(1000, 'Alert message too long')
      .transform(msg => ValidationUtils.sanitizeString(msg)),
    
    details: z.unknown()
      .optional()
      .transform(details => {
        if (details && typeof details === 'object') {
          return ValidationUtils.sanitizeJsonString(JSON.stringify(details), 5000);
        }
        return details;
      }),
    
    jobName: z.string()
      .min(1, 'Job name cannot be empty')
      .max(100, 'Job name too long')
      .regex(/^[a-zA-Z0-9_\-]+$/, 'Job name contains invalid characters')
      .transform(name => ValidationUtils.sanitizeString(name)),
    
    environment: z.string()
      .regex(VALIDATION_PATTERNS.environment, 'Invalid environment')
      .transform(env => ValidationUtils.sanitizeString(env))
  }),

  /**
   * User notification schema
   */
  userNotification: z.object({
    userId: z.string()
      .uuid('User ID must be a valid UUID')
      .transform(id => ValidationUtils.sanitizeString(id)),
    
    userEmail: z.string()
      .email('Invalid email format')
      .max(254, 'Email address too long')
      .transform(email => ValidationUtils.sanitizeString(email)),
    
    ticker: z.string()
      .regex(VALIDATION_PATTERNS.tickerSymbol, 'Invalid ticker symbol')
      .transform(ticker => ValidationUtils.sanitizeString(ticker)),
    
    deliveryStatus: z.string()
      .min(1, 'Delivery status cannot be empty')
      .max(50, 'Delivery status too long')
      .transform(status => ValidationUtils.sanitizeString(status)),
    
    deliveryCostUSD: z.number()
      .min(0, 'Delivery cost cannot be negative')
      .max(100, 'Delivery cost exceeds maximum')
      .finite('Delivery cost must be a finite number')
  }),

  /**
   * Filing processing metrics schema
   */
  filingMetrics: z.object({
    accessionNumber: z.string()
      .regex(VALIDATION_PATTERNS.accessionNumber, 'Invalid accession number format')
      .transform(num => ValidationUtils.sanitizeString(num)),
    
    ticker: z.string()
      .regex(VALIDATION_PATTERNS.tickerSymbol, 'Invalid ticker symbol')
      .transform(ticker => ValidationUtils.sanitizeString(ticker)),
    
    cik: z.string()
      .regex(VALIDATION_PATTERNS.cikNumber, 'Invalid CIK number')
      .transform(cik => ValidationUtils.sanitizeString(cik)),
    
    filingType: z.string()
      .min(1, 'Filing type cannot be empty')
      .max(10, 'Filing type too long')
      .regex(/^[A-Z0-9\-\/]+$/, 'Invalid filing type format')
      .transform(type => ValidationUtils.sanitizeString(type)),
    
    emailsSent: z.number()
      .int('Emails sent must be an integer')
      .min(0, 'Emails sent cannot be negative')
      .max(10000, 'Emails sent exceeds maximum'),
    
    processingTimeMs: z.number()
      .int('Processing time must be an integer')
      .min(0, 'Processing time cannot be negative')
      .max(300000, 'Processing time exceeds 5 minutes') // 5 minute max
  })
};

/**
 * Error context validation schemas
 */
export const ErrorValidationSchemas = {
  /**
   * Filing error context schema
   */
  filingErrorContext: z.object({
    accessionNumber: z.string()
      .regex(VALIDATION_PATTERNS.accessionNumber, 'Invalid accession number')
      .transform(num => ValidationUtils.sanitizeString(num)),
    
    cik: z.string()
      .regex(VALIDATION_PATTERNS.cikNumber, 'Invalid CIK number')
      .optional()
      .transform(cik => cik ? ValidationUtils.sanitizeString(cik) : cik),
    
    ticker: z.string()
      .regex(VALIDATION_PATTERNS.tickerSymbol, 'Invalid ticker symbol')
      .optional()
      .transform(ticker => ticker ? ValidationUtils.sanitizeString(ticker) : ticker),
    
    userId: z.string()
      .uuid('User ID must be a valid UUID')
      .optional()
      .transform(id => id ? ValidationUtils.sanitizeString(id) : id),
    
    attemptCount: z.number()
      .int('Attempt count must be an integer')
      .min(1, 'Attempt count must be at least 1')
      .max(10, 'Attempt count exceeds maximum')
      .optional(),
    
    httpStatus: z.number()
      .int('HTTP status must be an integer')
      .min(100, 'Invalid HTTP status code')
      .max(599, 'Invalid HTTP status code')
      .optional(),
    
    url: z.string()
      .url('Invalid URL format')
      .max(2000, 'URL too long')
      .optional()
      .transform(url => url ? ValidationUtils.sanitizeString(url) : url),
    
    timestamp: z.string()
      .datetime('Invalid timestamp format')
      .transform(ts => ValidationUtils.sanitizeString(ts))
  }),

  /**
   * Processing context schema
   */
  processingContext: z.object({
    userId: z.string()
      .uuid('User ID must be a valid UUID')
      .transform(id => ValidationUtils.sanitizeString(id)),
    
    tier: z.string()
      .regex(VALIDATION_PATTERNS.subscriptionTier, 'Invalid subscription tier')
      .transform(tier => ValidationUtils.sanitizeString(tier)),
    
    operation: z.string()
      .min(1, 'Operation cannot be empty')
      .max(100, 'Operation name too long')
      .regex(/^[a-zA-Z0-9_\-]+$/, 'Operation contains invalid characters')
      .transform(op => ValidationUtils.sanitizeString(op)),
    
    operationType: z.enum(['cached_summary', 'ai_generation', 'failed_operation'])
      .transform(type => ValidationUtils.sanitizeString(type)),
    
    isCached: z.boolean(),
    
    processingStartTime: z.number()
      .int('Processing start time must be an integer')
      .min(0, 'Invalid timestamp')
      .optional(),
    
    processingEndTime: z.number()
      .int('Processing end time must be an integer')
      .min(0, 'Invalid timestamp')
      .optional()
  })
};

/**
 * Validation middleware for secure input processing
 */
export class SecureValidator {
  /**
   * Validate and sanitize alert data
   */
  static validateAlertData(data: unknown) {
    try {
      return AlertValidationSchemas.createAlert.parse(data);
    } catch (error) {
      validationLogger.error('Alert validation failed', {
        error: error instanceof Error ? error.message : 'Unknown validation error',
        dataType: typeof data
      });
      throw new Error('Invalid alert data format');
    }
  }

  /**
   * Validate user notification data
   */
  static validateUserNotification(data: unknown) {
    try {
      return AlertValidationSchemas.userNotification.parse(data);
    } catch (error) {
      validationLogger.error('User notification validation failed', {
        error: error instanceof Error ? error.message : 'Unknown validation error'
      });
      throw new Error('Invalid user notification data');
    }
  }

  /**
   * Validate filing metrics data
   */
  static validateFilingMetrics(data: unknown) {
    try {
      return AlertValidationSchemas.filingMetrics.parse(data);
    } catch (error) {
      validationLogger.error('Filing metrics validation failed', {
        error: error instanceof Error ? error.message : 'Unknown validation error'
      });
      throw new Error('Invalid filing metrics data');
    }
  }

  /**
   * Validate error context data
   */
  static validateErrorContext(data: unknown) {
    try {
      return ErrorValidationSchemas.filingErrorContext.parse(data);
    } catch (error) {
      validationLogger.error('Error context validation failed', {
        error: error instanceof Error ? error.message : 'Unknown validation error'
      });
      throw new Error('Invalid error context data');
    }
  }

  /**
   * Validate processing context data
   */
  static validateProcessingContext(data: unknown) {
    try {
      return ErrorValidationSchemas.processingContext.parse(data);
    } catch (error) {
      validationLogger.error('Processing context validation failed', {
        error: error instanceof Error ? error.message : 'Unknown validation error'
      });
      throw new Error('Invalid processing context data');
    }
  }

  /**
   * Check if string contains potential security threats
   */
  static validateSecurityThreats(input: string): { isSafe: boolean; threats: string[] } {
    const threats: string[] = [];
    
    if (!ValidationUtils.validateSqlSafety(input)) {
      threats.push('SQL injection pattern detected');
    }
    
    // Check for script injection
    if (/<script|javascript:|on\w+\s*=/i.test(input)) {
      threats.push('XSS script pattern detected');
    }
    
    // Check for command injection
    if (/[;&|`$(){}[\]]/g.test(input)) {
      threats.push('Command injection pattern detected');
    }
    
    // Check for path traversal
    if (/\.\.\/|\.\.\\|\.\.\%2f|\.\.\%5c/i.test(input)) {
      threats.push('Path traversal pattern detected');
    }
    
    // Check for LDAP injection
    if (/[()&|=!<>~*]/g.test(input)) {
      threats.push('LDAP injection pattern detected');
    }
    
    return {
      isSafe: threats.length === 0,
      threats
    };
  }
}

/**
 * Rate limiting schema for DoS protection
 */
export const RateLimitSchemas = {
  /**
   * Rate limit configuration
   */
  rateLimitConfig: z.object({
    windowMs: z.number()
      .int('Window duration must be an integer')
      .min(1000, 'Minimum window is 1 second')
      .max(3600000, 'Maximum window is 1 hour'),
    
    maxRequests: z.number()
      .int('Max requests must be an integer')
      .min(1, 'Must allow at least 1 request')
      .max(10000, 'Maximum 10,000 requests per window'),
    
    identifier: z.string()
      .min(1, 'Identifier cannot be empty')
      .max(100, 'Identifier too long')
      .transform(id => ValidationUtils.sanitizeString(id))
  })
};

export { ValidationUtils };