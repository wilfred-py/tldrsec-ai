/**
 * Input Sanitization and Security Utilities
 * 
 * Comprehensive sanitization functions to prevent injection attacks
 * and ensure data integrity across the application.
 * 
 * SECURITY CONTROLS:
 * - SQL injection prevention
 * - XSS sanitization
 * - Path traversal prevention
 * - Command injection blocking
 * - Content sanitization
 * - File name validation
 */

import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import xss from 'xss';

// Create DOMPurify instance for server-side use
const window = new JSDOM('').window;
const purify = DOMPurify(window as unknown as Window);

/**
 * Malicious Pattern Detection
 */
export const DANGEROUS_PATTERNS = {
  // SQL Injection patterns
  sqlInjection: [
    /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute|declare|cast|convert)\b)/gi,
    /'.*?(\sor\s|union|--|\/\*|\*\/)/gi,
    /\b(or|and)\s+[\d\w]+\s*[=<>!]+\s*[\d\w]+/gi,
    /\b(or|and)\s+\d+\s*=\s*\d+/gi,
    /[\'\"\`]\s*(or|and|union)\s+/gi,
    /\b(sleep|benchmark|waitfor)\s*\(/gi,
    /\b(information_schema|sys\.|mysql\.|pg_)/gi
  ],
  
  // XSS patterns
  xss: [
    /<script[^>]*>.*?<\/script>/gis,
    /<iframe[^>]*>.*?<\/iframe>/gis,
    /<object[^>]*>.*?<\/object>/gis,
    /<embed[^>]*>/gi,
    /<link[^>]*>/gi,
    /<meta[^>]*>/gi,
    /javascript:/gi,
    /data:text\/html/gi,
    /vbscript:/gi,
    /on\w+\s*=/gi,
    /expression\s*\(/gi,
    /url\s*\(/gi
  ],
  
  // Command injection patterns
  commandInjection: [
    /[;&|`$(){}[\]]/,
    /\b(rm|del|format|mkdir|rmdir|copy|move|cat|type|echo|ping|wget|curl|nc|netcat|bash|sh|cmd|powershell)\b/gi,
    /\|\s*(rm|del|cat|type|echo)/gi,
    /&&\s*(rm|del|cat|type|echo)/gi,
    /;\s*(rm|del|cat|type|echo)/gi
  ],
  
  // Path traversal patterns
  pathTraversal: [
    /\.\.\//g,
    /\.\.\\\//g,
    /\.\./g,
    /%2e%2e%2f/gi,
    /%2e%2e%5c/gi,
    /%2e%2e/gi,
    /\.\.%2f/gi,
    /\.\.%5c/gi
  ],
  
  // LDAP injection patterns
  ldapInjection: [
    /[*()\\]/g,
    /\|[^|]/g,
    /&[^&]/g
  ],
  
  // NoSQL injection patterns
  nosqlInjection: [
    /\$where/gi,
    /\$ne/gi,
    /\$gt/gi,
    /\$lt/gi,
    /\$regex/gi,
    /\$or/gi,
    /\$and/gi
  ],
  
  // Server-side template injection
  templateInjection: [
    /\{\{.*?\}\}/g,
    /\$\{.*?\}/g,
    /#\{.*?\}/g,
    /%\{.*?\}/g,
    /<%.*?%>/g
  ]
} as const;

/**
 * Detect malicious patterns in input
 */
export function detectMaliciousPatterns(input: string): {
  detected: boolean;
  threats: string[];
  patterns: string[];
} {
  const threats: string[] = [];
  const matchedPatterns: string[] = [];
  
  for (const [threatType, patterns] of Object.entries(DANGEROUS_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(input)) {
        threats.push(threatType);
        matchedPatterns.push(pattern.toString());
        break; // Only record one match per threat type
      }
    }
  }
  
  return {
    detected: threats.length > 0,
    threats,
    patterns: matchedPatterns
  };
}

/**
 * Basic String Sanitization
 */
export function sanitizeBasicString(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  return input
    // Remove null bytes and control characters
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    // Remove Unicode zero-width characters
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * SQL-Safe String Sanitization
 */
export function sanitizeForSQL(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  let sanitized = sanitizeBasicString(input);
  
  // Remove or escape SQL-dangerous characters
  sanitized = sanitized
    .replace(/'/g, "''") // Escape single quotes
    .replace(/"/g, '""') // Escape double quotes
    .replace(/\\/g, '\\\\') // Escape backslashes
    .replace(/;/g, '') // Remove semicolons
    .replace(/--/g, '') // Remove SQL comments
    .replace(/\/\*/g, '') // Remove SQL block comment start
    .replace(/\*\//g, ''); // Remove SQL block comment end
  
  // Check for remaining malicious patterns
  const detection = detectMaliciousPatterns(sanitized);
  if (detection.detected && detection.threats.includes('sqlInjection')) {
    throw new Error('Input contains potential SQL injection patterns');
  }
  
  return sanitized;
}

/**
 * XSS-Safe HTML Sanitization
 */
export function sanitizeHTML(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  let sanitized = sanitizeBasicString(input);
  
  // Use DOMPurify to remove dangerous HTML
  sanitized = purify.sanitize(sanitized, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br'],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
    WHOLE_DOCUMENT: false,
    RETURN_DOM: false
  });
  
  // Additional XSS protection with xss library
  sanitized = xss(sanitized, {
    whiteList: {
      b: [],
      i: [],
      em: [],
      strong: [],
      p: [],
      br: []
    },
    stripIgnoreTag: true,
    stripIgnoreTagBody: ['script', 'style', 'iframe', 'object', 'embed']
  });
  
  return sanitized;
}

/**
 * Command Injection Safe Sanitization
 */
export function sanitizeForCommand(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  let sanitized = sanitizeBasicString(input);
  
  // Remove command injection characters
  sanitized = sanitized
    .replace(/[;&|`$(){}[\]<>]/g, '')
    .replace(/\\\\/g, '')
    .replace(/\\\"/g, '')
    .replace(/\\\'/g, '');
  
  const detection = detectMaliciousPatterns(sanitized);
  if (detection.detected && detection.threats.includes('commandInjection')) {
    throw new Error('Input contains potential command injection patterns');
  }
  
  return sanitized;
}

/**
 * Path Traversal Safe Sanitization
 */
export function sanitizeFilePath(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  let sanitized = sanitizeBasicString(input);
  
  // Remove path traversal sequences
  sanitized = sanitized
    .replace(/\.\.\//g, '')
    .replace(/\.\.\\\//g, '')
    .replace(/\.\./g, '')
    .replace(/%2e%2e%2f/gi, '')
    .replace(/%2e%2e%5c/gi, '')
    .replace(/%2e%2e/gi, '');
  
  // Remove dangerous file system characters
  sanitized = sanitized.replace(/[<>:"|*?]/g, '');
  
  const detection = detectMaliciousPatterns(sanitized);
  if (detection.detected && detection.threats.includes('pathTraversal')) {
    throw new Error('Input contains potential path traversal patterns');
  }
  
  return sanitized;
}

/**
 * Email Address Sanitization
 */
export function sanitizeEmail(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  let sanitized = sanitizeBasicString(input).toLowerCase();
  
  // Basic email format validation and sanitization
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  
  if (!emailRegex.test(sanitized)) {
    throw new Error('Invalid email format');
  }
  
  // Additional sanitization
  sanitized = sanitized
    .replace(/[<>\"']/g, '')
    .trim();
  
  return sanitized;
}

/**
 * URL Sanitization
 */
export function sanitizeURL(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  const sanitized = sanitizeBasicString(input);
  
  try {
    const url = new URL(sanitized);
    
    // Only allow HTTP and HTTPS protocols
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Only HTTP and HTTPS URLs are allowed');
    }
    
    // Sanitize each component
    url.hostname = sanitizeBasicString(url.hostname);
    url.pathname = sanitizeFilePath(url.pathname);
    url.search = sanitizeBasicString(url.search);
    
    return url.toString();
  } catch {
    throw new Error('Invalid URL format');
  }
}

/**
 * JSON Sanitization
 */
export function sanitizeJSON(input: unknown): unknown {
  if (typeof input === 'string') {
    return sanitizeBasicString(input);
  }
  
  if (typeof input === 'number' || typeof input === 'boolean' || input === null) {
    return input;
  }
  
  if (Array.isArray(input)) {
    return input.map(sanitizeJSON);
  }
  
  if (typeof input === 'object' && input !== null) {
    const sanitized: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(input)) {
      const sanitizedKey = sanitizeBasicString(key);
      if (sanitizedKey && sanitizedKey.length > 0) {
        sanitized[sanitizedKey] = sanitizeJSON(value);
      }
    }
    
    return sanitized;
  }
  
  return null;
}

/**
 * Database Query Parameter Sanitization
 */
export function sanitizeQueryParam(param: unknown): string | number | boolean | null {
  if (param === null || param === undefined) {
    return null;
  }
  
  if (typeof param === 'boolean') {
    return param;
  }
  
  if (typeof param === 'number') {
    if (isNaN(param) || !isFinite(param)) {
      throw new Error('Invalid numeric parameter');
    }
    return param;
  }
  
  if (typeof param === 'string') {
    const sanitized = sanitizeForSQL(param);
    
    // Additional length check
    if (sanitized.length > 10000) {
      throw new Error('Parameter too long');
    }
    
    return sanitized;
  }
  
  throw new Error('Invalid parameter type');
}

/**
 * Content Sanitization for Large Text Fields
 */
export function sanitizeContent(input: string, maxLength: number = 50000): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  let sanitized = sanitizeBasicString(input);
  
  // Remove potentially dangerous content while preserving formatting
  sanitized = purify.sanitize(sanitized, {
    ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'em', 'strong', 'ul', 'ol', 'li', 'h1', 'h2', 'h3'],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
    WHOLE_DOCUMENT: false
  });
  
  // Truncate if too long
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  const detection = detectMaliciousPatterns(sanitized);
  if (detection.detected) {
    throw new Error(`Content contains potentially malicious patterns: ${detection.threats.join(', ')}`);
  }
  
  return sanitized;
}

/**
 * File Name Sanitization
 */
export function sanitizeFileName(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  let sanitized = sanitizeBasicString(input);
  
  // Remove dangerous characters for file names
  sanitized = sanitized
    .replace(/[<>:"|*?\\\/]/g, '')
    .replace(/\.\./g, '')
    .replace(/^\.+/, '') // Remove leading dots
    .replace(/\.+$/, ''); // Remove trailing dots
  
  // Check for reserved names (Windows)
  const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
  
  if (reservedNames.includes(sanitized.toUpperCase())) {
    sanitized = '_' + sanitized;
  }
  
  // Ensure reasonable length
  if (sanitized.length > 255) {
    sanitized = sanitized.substring(0, 255);
  }
  
  if (sanitized.length === 0) {
    throw new Error('Invalid file name');
  }
  
  return sanitized;
}

/**
 * Search Query Sanitization
 */
export function sanitizeSearchQuery(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  
  let sanitized = sanitizeBasicString(input);
  
  // Remove potentially dangerous search operators
  sanitized = sanitized
    .replace(/[<>\"']/g, '')
    .replace(/\b(and|or|not)\s+\d+\s*=\s*\d+/gi, '')
    .replace(/[\(\)]/g, '');
  
  // Limit length
  if (sanitized.length > 500) {
    sanitized = sanitized.substring(0, 500);
  }
  
  const detection = detectMaliciousPatterns(sanitized);
  if (detection.detected) {
    throw new Error('Search query contains potentially malicious patterns');
  }
  
  return sanitized;
}

/**
 * API Key Sanitization
 */
export function sanitizeAPIKey(input: string): string {
  if (typeof input !== 'string') {
    throw new Error('API key must be a string');
  }
  
  const sanitized = input.trim();
  
  // API keys should only contain safe characters
  if (!/^[a-zA-Z0-9_.-]+$/.test(sanitized)) {
    throw new Error('API key contains invalid characters');
  }
  
  if (sanitized.length < 10 || sanitized.length > 512) {
    throw new Error('API key length is invalid');
  }
  
  return sanitized;
}

/**
 * Environment Variable Sanitization
 */
export function sanitizeEnvVar(name: string, value: string): { name: string; value: string } {
  if (typeof name !== 'string' || typeof value !== 'string') {
    throw new Error('Environment variable name and value must be strings');
  }
  
  // Sanitize name
  const sanitizedName = name.trim().toUpperCase();
  if (!/^[A-Z_][A-Z0-9_]*$/.test(sanitizedName)) {
    throw new Error('Invalid environment variable name format');
  }
  
  // Sanitize value (be more permissive but still safe)
  let sanitizedValue = value.trim();
  
  // Remove null bytes and control characters
  sanitizedValue = sanitizedValue.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
  
  if (sanitizedValue.length > 32768) { // 32KB limit
    throw new Error('Environment variable value too long');
  }
  
  return {
    name: sanitizedName,
    value: sanitizedValue
  };
}

/**
 * Export all sanitization functions
 */
export const Sanitizers = {
  detectMaliciousPatterns,
  sanitizeBasicString,
  sanitizeForSQL,
  sanitizeHTML,
  sanitizeForCommand,
  sanitizeFilePath,
  sanitizeEmail,
  sanitizeURL,
  sanitizeJSON,
  sanitizeQueryParam,
  sanitizeContent,
  sanitizeFileName,
  sanitizeSearchQuery,
  sanitizeAPIKey,
  sanitizeEnvVar
} as const;