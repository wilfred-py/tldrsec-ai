/**
 * Central Validation Schemas - Enterprise Security Framework
 * 
 * Comprehensive Zod-based validation schemas to prevent injection attacks
 * and ensure data integrity across all application boundaries.
 * 
 * SECURITY CONTROLS:
 * - Input sanitization and validation
 * - Type safety enforcement
 * - Length and format restrictions
 * - Malicious pattern detection
 * - SQL injection prevention
 */

import { z } from 'zod';

/**
 * Security Constants
 */
export const SECURITY_LIMITS = {
  MAX_STRING_LENGTH: 10000,
  MAX_TEXT_LENGTH: 50000,
  MAX_EMAIL_LENGTH: 254,
  MAX_TICKER_LENGTH: 10,
  MAX_ARRAY_SIZE: 1000,
  MAX_OBJECT_KEYS: 100,
  MAX_ID_LENGTH: 255,
  MAX_URL_LENGTH: 2048,
  MAX_FILENAME_LENGTH: 255,
  MAX_SEARCH_QUERY_LENGTH: 500
} as const;

/**
 * Security Patterns - Detect malicious content
 */
export const MALICIOUS_PATTERNS = [
  // Script injection
  /<script[^>]*>.*?<\/script>/gi,
  /javascript:/gi,
  /data:text\/html/gi,
  /vbscript:/gi,
  /onload=/gi,
  /onerror=/gi,
  /onclick=/gi,
  
  // SQL injection patterns
  /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/gi,
  /'.*?(\sor\s|union|--|\/\*|\*\/)/gi,
  /\b(or|and)\s+\d+\s*=\s*\d+/gi,
  
  // Command injection
  /[;&|`$(){}[\]<>]/,
  /\b(rm|del|format|mkdir|rmdir|copy|move|cat|type|echo|ping|wget|curl)\b/gi,
  
  // Path traversal
  /\.\.\//g,
  /\.\.\\\//g,
  /\.\./g,
  
  // XSS patterns
  /<[^>]*>/g,
  /&#x?[0-9a-f]+;/gi,
  /%[0-9a-f]{2}/gi
] as const;

/**
 * Base validation utilities
 */
export const sanitizeString = (value: string): string => {
  if (typeof value !== 'string') return '';
  
  return value
    .trim()
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
    .replace(/[<>\"']/g, '') // Remove potentially dangerous characters
    .substring(0, SECURITY_LIMITS.MAX_STRING_LENGTH);
};

export const validateNoMaliciousPatterns = (value: string): boolean => {
  return !MALICIOUS_PATTERNS.some(pattern => pattern.test(value));
};

/**
 * Base string schema with security validation
 */
export const secureStringSchema = z.string()
  .min(1, 'String cannot be empty')
  .max(SECURITY_LIMITS.MAX_STRING_LENGTH, `String too long (max ${SECURITY_LIMITS.MAX_STRING_LENGTH} characters)`)
  .refine(validateNoMaliciousPatterns, 'String contains potentially malicious content')
  .transform(sanitizeString);

/**
 * Email validation schema
 */
export const emailSchema = z.string()
  .email('Invalid email format')
  .max(SECURITY_LIMITS.MAX_EMAIL_LENGTH, `Email too long (max ${SECURITY_LIMITS.MAX_EMAIL_LENGTH} characters)`)
  .refine(validateNoMaliciousPatterns, 'Email contains invalid characters')
  .transform(value => value.toLowerCase().trim());

/**
 * Ticker symbol validation
 */
export const tickerSchema = z.string()
  .min(1, 'Ticker symbol required')
  .max(SECURITY_LIMITS.MAX_TICKER_LENGTH, `Ticker too long (max ${SECURITY_LIMITS.MAX_TICKER_LENGTH} characters)`)
  .regex(/^[A-Z0-9.-]+$/, 'Ticker must contain only uppercase letters, numbers, dots, and hyphens')
  .transform(value => value.toUpperCase().trim());

/**
 * ID validation (UUIDs and database IDs)
 */
export const idSchema = z.string()
  .min(1, 'ID required')
  .max(SECURITY_LIMITS.MAX_ID_LENGTH, `ID too long (max ${SECURITY_LIMITS.MAX_ID_LENGTH} characters)`)
  .regex(/^[a-zA-Z0-9_-]+$/, 'ID contains invalid characters');

/**
 * UUID validation
 */
export const uuidSchema = z.string()
  .uuid('Invalid UUID format');

/**
 * URL validation
 */
export const urlSchema = z.string()
  .url('Invalid URL format')
  .max(SECURITY_LIMITS.MAX_URL_LENGTH, `URL too long (max ${SECURITY_LIMITS.MAX_URL_LENGTH} characters)`)
  .refine(value => {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol);
    } catch {
      return false;
    }
  }, 'URL must use HTTP or HTTPS protocol');

/**
 * File path validation
 */
export const filePathSchema = z.string()
  .min(1, 'File path required')
  .max(SECURITY_LIMITS.MAX_FILENAME_LENGTH, `File path too long (max ${SECURITY_LIMITS.MAX_FILENAME_LENGTH} characters)`)
  .refine(value => !value.includes('..'), 'File path cannot contain directory traversal sequences')
  .refine(value => !/[<>"|*?]/.test(value), 'File path contains invalid characters');

/**
 * Search query validation
 */
export const searchQuerySchema = z.string()
  .min(1, 'Search query required')
  .max(SECURITY_LIMITS.MAX_SEARCH_QUERY_LENGTH, `Search query too long (max ${SECURITY_LIMITS.MAX_SEARCH_QUERY_LENGTH} characters)`)
  .refine(validateNoMaliciousPatterns, 'Search query contains invalid characters')
  .transform(sanitizeString);

/**
 * Integer validation with bounds
 */
export const safeIntegerSchema = (min: number = 0, max: number = Number.MAX_SAFE_INTEGER) => 
  z.number()
    .int('Must be an integer')
    .min(min, `Must be at least ${min}`)
    .max(max, `Must be at most ${max}`);

/**
 * Positive integer validation
 */
export const positiveIntegerSchema = safeIntegerSchema(1);

/**
 * Non-negative integer validation
 */
export const nonNegativeIntegerSchema = safeIntegerSchema(0);

/**
 * Filing type validation
 */
export const filingTypeSchema = z.enum([
  '10-K', '10-Q', '8-K', 'Form 4', 'DEF 14A', 'Form S-1', 'Form S-3', 'Form S-4',
  '10-K/A', '10-Q/A', '8-K/A', 'SC 13D', 'SC 13G', 'Form 3', 'Form 5'
], {
  errorMap: () => ({ message: 'Invalid filing type' })
});

/**
 * Date string validation
 */
export const dateStringSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/, 'Invalid date format (expected ISO 8601)')
  .refine(value => {
    const date = new Date(value);
    return !isNaN(date.getTime()) && date.getFullYear() >= 1900 && date.getFullYear() <= 2100;
  }, 'Date must be a valid date between 1900 and 2100');

/**
 * JSON validation with size limits
 */
export const safeJsonSchema = z.record(z.unknown())
  .refine(obj => Object.keys(obj).length <= SECURITY_LIMITS.MAX_OBJECT_KEYS, 
    `Object has too many keys (max ${SECURITY_LIMITS.MAX_OBJECT_KEYS})`)
  .refine(obj => {
    const jsonString = JSON.stringify(obj);
    return jsonString.length <= SECURITY_LIMITS.MAX_TEXT_LENGTH;
  }, `JSON object too large (max ${SECURITY_LIMITS.MAX_TEXT_LENGTH} characters when serialized)`);

/**
 * Array validation with size limits
 */
export const safeArraySchema = <T>(itemSchema: z.ZodSchema<T>) => 
  z.array(itemSchema)
    .max(SECURITY_LIMITS.MAX_ARRAY_SIZE, `Array too large (max ${SECURITY_LIMITS.MAX_ARRAY_SIZE} items)`);

/**
 * Priority level validation
 */
export const prioritySchema = z.enum(['HIGH', 'MEDIUM', 'LOW'], {
  errorMap: () => ({ message: 'Priority must be HIGH, MEDIUM, or LOW' })
});

/**
 * Status validation
 */
export const statusSchema = z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'RETRYING'], {
  errorMap: () => ({ message: 'Invalid status' })
});

/**
 * Pagination validation
 */
export const paginationSchema = z.object({
  limit: positiveIntegerSchema.max(1000, 'Limit cannot exceed 1000').default(10),
  offset: nonNegativeIntegerSchema.default(0),
  page: positiveIntegerSchema.optional()
});

/**
 * Sort validation
 */
export const sortSchema = z.object({
  field: z.string()
    .min(1, 'Sort field required')
    .max(50, 'Sort field name too long')
    .refine(validateNoMaliciousPatterns, 'Sort field contains invalid characters')
    .transform(sanitizeString),
  direction: z.enum(['asc', 'desc']).default('asc')
});

/**
 * Content validation for large text fields
 */
export const contentSchema = z.string()
  .max(SECURITY_LIMITS.MAX_TEXT_LENGTH, `Content too long (max ${SECURITY_LIMITS.MAX_TEXT_LENGTH} characters)`)
  .refine(validateNoMaliciousPatterns, 'Content contains potentially malicious patterns');

/**
 * File upload validation
 */
export const fileUploadSchema = z.object({
  filename: z.string()
    .min(1, 'Filename required')
    .max(SECURITY_LIMITS.MAX_FILENAME_LENGTH, `Filename too long (max ${SECURITY_LIMITS.MAX_FILENAME_LENGTH} characters)`)
    .refine(validateNoMaliciousPatterns, 'Filename contains invalid characters')
    .transform(sanitizeString),
  mimetype: z.string().regex(/^[a-z]+\/[a-z0-9.-]+$/, 'Invalid MIME type'),
  size: safeIntegerSchema(1, 50 * 1024 * 1024), // Max 50MB
  encoding: z.string().optional()
});

/**
 * Environment variable validation
 */
export const envVarSchema = z.object({
  name: z.string()
    .min(1, 'Environment variable name required')
    .max(255, 'Environment variable name too long')
    .regex(/^[A-Z_][A-Z0-9_]*$/, 'Environment variable name must be uppercase with underscores'),
  value: z.string()
    .max(32768, 'Environment variable value too long') // 32KB limit
});

/**
 * Webhook validation
 */
export const webhookSchema = z.object({
  url: urlSchema,
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH'], {
    errorMap: () => ({ message: 'Method must be GET, POST, PUT, or PATCH' })
  }),
  headers: z.record(secureStringSchema).optional(),
  timeout: safeIntegerSchema(1000, 30000).default(10000) // 1-30 seconds
});

/**
 * API key validation
 */
export const apiKeySchema = z.string()
  .min(10, 'API key too short')
  .max(512, 'API key too long')
  .regex(/^[a-zA-Z0-9_.-]+$/, 'API key contains invalid characters');

/**
 * IP address validation
 */
export const ipAddressSchema = z.string()
  .regex(/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$|^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/, 
    'Invalid IP address format');

/**
 * User agent validation
 */
export const userAgentSchema = z.string()
  .max(512, 'User agent string too long')
  .refine(validateNoMaliciousPatterns, 'User agent contains invalid characters');

/**
 * Export all schemas
 */
export const ValidationSchemas = {
  secureString: secureStringSchema,
  email: emailSchema,
  ticker: tickerSchema,
  id: idSchema,
  uuid: uuidSchema,
  url: urlSchema,
  filePath: filePathSchema,
  searchQuery: searchQuerySchema,
  safeInteger: safeIntegerSchema,
  positiveInteger: positiveIntegerSchema,
  nonNegativeInteger: nonNegativeIntegerSchema,
  filingType: filingTypeSchema,
  dateString: dateStringSchema,
  safeJson: safeJsonSchema,
  safeArray: safeArraySchema,
  priority: prioritySchema,
  status: statusSchema,
  pagination: paginationSchema,
  sort: sortSchema,
  content: contentSchema,
  fileUpload: fileUploadSchema,
  envVar: envVarSchema,
  webhook: webhookSchema,
  apiKey: apiKeySchema,
  ipAddress: ipAddressSchema,
  userAgent: userAgentSchema
} as const;