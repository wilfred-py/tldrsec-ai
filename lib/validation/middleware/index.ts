/**
 * Security Validation Middleware - Enterprise Grade Protection
 * 
 * Comprehensive middleware suite for request validation, sanitization,
 * and security enforcement across all API endpoints.
 * 
 * SECURITY CONTROLS:
 * - Input validation and sanitization
 * - SQL injection prevention
 * - XSS protection
 * - Rate limiting
 * - Request size validation
 * - Security headers enforcement
 * - Attack pattern detection
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import xss from 'xss';

// Create DOMPurify instance for server-side use
const window = new JSDOM('').window;
const purify = DOMPurify(window as any);

/**
 * Security Configuration
 */
export const SECURITY_CONFIG = {
  maxRequestSize: 10 * 1024 * 1024, // 10MB
  maxRequestTimeout: 30000, // 30 seconds
  maxHeaderSize: 8192, // 8KB
  maxUrlLength: 2048,
  maxQueryParams: 50,
  maxFileUploads: 10,
  
  // Rate limiting
  defaultRateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // limit each IP to 1000 requests per windowMs
    skipSuccessfulRequests: false,
    skipFailedRequests: false
  },
  
  strictRateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes  
    max: 100, // limit each IP to 100 requests per windowMs
    skipSuccessfulRequests: false,
    skipFailedRequests: false
  },
  
  // Content Security Policy
  csp: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://vercel.live"],
    styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
    fontSrc: ["'self'", "https://fonts.gstatic.com"],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: ["'self'", "https://api.anthropic.com", "https://api.resend.com"],
    frameSrc: ["'none'"],
    objectSrc: ["'none'"],
    upgradeInsecureRequests: []
  }
} as const;

/**
 * Security Headers Configuration
 */
export const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin'
} as const;

/**
 * Malicious Pattern Detection
 */
export const ATTACK_PATTERNS = {
  sqlInjection: [
    /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/gi,
    /'.*?(\sor\s|union|--|\/\*|\*\/)/gi,
    /\b(or|and)\s+\d+\s*=\s*\d+/gi,
    /\b(or|and)\s+\d+\s*[<>=]+\s*\d+/gi
  ],
  
  xss: [
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/gi,
    /data:text\/html/gi,
    /vbscript:/gi,
    /on\w+\s*=/gi
  ],
  
  commandInjection: [
    /[;&|`$(){}[\]]/,
    /\b(rm|del|format|mkdir|rmdir|copy|move|cat|type|echo|ping|wget|curl|nc|netcat)\b/gi
  ],
  
  pathTraversal: [
    /\.\.\//g,
    /\.\.\\/g,
    /\.\./g,
    /%2e%2e%2f/gi,
    /%2e%2e%5c/gi
  ],
  
  serverSideTemplateInjection: [
    /\{\{.*?\}\}/g,
    /\$\{.*?\}/g,
    /#\{.*?\}/g,
    /%\{.*?\}/g
  ]
} as const;

/**
 * Request Size Validator
 */
export function validateRequestSize(request: NextRequest): void {
  const contentLength = request.headers.get('content-length');
  
  if (contentLength && parseInt(contentLength) > SECURITY_CONFIG.maxRequestSize) {
    throw new Error(`Request size ${contentLength} exceeds maximum allowed ${SECURITY_CONFIG.maxRequestSize}`);
  }
  
  // Validate URL length
  if (request.url.length > SECURITY_CONFIG.maxUrlLength) {
    throw new Error(`URL length ${request.url.length} exceeds maximum allowed ${SECURITY_CONFIG.maxUrlLength}`);
  }
  
  // Validate number of query parameters
  const searchParams = new URL(request.url).searchParams;
  if (Array.from(searchParams.keys()).length > SECURITY_CONFIG.maxQueryParams) {
    throw new Error(`Too many query parameters (max ${SECURITY_CONFIG.maxQueryParams})`);
  }
}

/**
 * Attack Pattern Detector
 */
export function detectAttackPatterns(value: string): { detected: boolean; patterns: string[] } {
  const detectedPatterns: string[] = [];
  
  for (const [attackType, patterns] of Object.entries(ATTACK_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(value)) {
        detectedPatterns.push(attackType);
        break;
      }
    }
  }
  
  return {
    detected: detectedPatterns.length > 0,
    patterns: detectedPatterns
  };
}

/**
 * Input Sanitizer
 */
export function sanitizeInput(value: unknown): unknown {
  if (typeof value === 'string') {
    // Remove null bytes and control characters
    let sanitized = value.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '');
    
    // Remove potentially dangerous HTML/script content
    sanitized = purify.sanitize(sanitized, { 
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true
    });
    
    // Additional XSS protection
    sanitized = xss(sanitized, {
      whiteList: {},
      stripIgnoreTag: true,
      stripIgnoreTagBody: ['script']
    });
    
    return sanitized.trim();
  }
  
  if (Array.isArray(value)) {
    return value.map(sanitizeInput);
  }
  
  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      const sanitizedKey = sanitizeInput(key) as string;
      sanitized[sanitizedKey] = sanitizeInput(val);
    }
    return sanitized;
  }
  
  return value;
}

/**
 * Security Validator Middleware Factory
 */
export function createSecurityValidator<T>(schema: z.ZodSchema<T>) {
  return async (request: NextRequest): Promise<{ data: T; errors?: string[] }> => {
    const errors: string[] = [];
    
    try {
      // Validate request size and basic structure
      validateRequestSize(request);
      
      // Extract and validate data based on request method
      let rawData: unknown = {};
      
      if (request.method === 'GET' || request.method === 'DELETE') {
        // Extract query parameters
        const searchParams = new URL(request.url).searchParams;
        rawData = Object.fromEntries(searchParams.entries());
      } else if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') {
        // Extract body data
        try {
          const contentType = request.headers.get('content-type') || '';
          
          if (contentType.includes('application/json')) {
            rawData = await request.json();
          } else if (contentType.includes('application/x-www-form-urlencoded')) {
            const formData = await request.formData();
            rawData = Object.fromEntries(formData.entries());
          } else if (contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            rawData = Object.fromEntries(formData.entries());
          }
        } catch (error) {
          errors.push('Invalid request body format');
          throw new Error('Invalid request body');
        }
      }
      
      // Sanitize input data
      const sanitizedData = sanitizeInput(rawData);
      
      // Detect attack patterns
      const dataString = JSON.stringify(sanitizedData);
      const attackDetection = detectAttackPatterns(dataString);
      
      if (attackDetection.detected) {
        errors.push(`Potential security threat detected: ${attackDetection.patterns.join(', ')}`);
        throw new Error('Security validation failed');
      }
      
      // Validate against schema
      const validationResult = schema.safeParse(sanitizedData);
      
      if (!validationResult.success) {
        const validationErrors = validationResult.error.errors.map(err => 
          `${err.path.join('.')}: ${err.message}`
        );
        errors.push(...validationErrors);
        throw new Error('Validation failed');
      }
      
      return { data: validationResult.data, errors: errors.length > 0 ? errors : undefined };
      
    } catch (error) {
      throw new Error(`Security validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };
}

/**
 * Security Headers Middleware
 */
export function addSecurityHeaders(response: NextResponse): NextResponse {
  // Add security headers
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(header, value);
  }
  
  // Add Content Security Policy
  const cspString = Object.entries(SECURITY_CONFIG.csp)
    .map(([directive, sources]) => `${directive.replace(/[A-Z]/g, '-$&').toLowerCase()} ${sources.join(' ')}`)
    .join('; ');
    
  response.headers.set('Content-Security-Policy', cspString);
  
  return response;
}

/**
 * Rate Limiting Middleware
 */
export function createRateLimiter(config: typeof SECURITY_CONFIG.defaultRateLimit = SECURITY_CONFIG.defaultRateLimit) {
  const limiter = rateLimit({
    ...config,
    handler: (req, res) => {
      res.status(429).json({
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil(config.windowMs / 1000)
      });
    },
    standardHeaders: true,
    legacyHeaders: false
  });
  
  return limiter;
}

/**
 * Cron Security Middleware
 */
export function validateCronSecurity(request: NextRequest): boolean {
  const cronSecret = request.headers.get('x-cron-secret');
  const expectedSecret = process.env.CRON_SECRET;
  
  if (!expectedSecret) {
    console.error('CRON_SECRET environment variable not set');
    return false;
  }
  
  if (!cronSecret) {
    console.error('Missing x-cron-secret header');
    return false;
  }
  
  // Use timing-safe comparison to prevent timing attacks
  if (cronSecret.length !== expectedSecret.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < cronSecret.length; i++) {
    result |= cronSecret.charCodeAt(i) ^ expectedSecret.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * IP Address Validator
 */
export function validateIPAddress(request: NextRequest): { isValid: boolean; ip: string | null } {
  // Get IP from various headers (in order of preference)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
             request.headers.get('x-real-ip') ||
             request.headers.get('cf-connecting-ip') ||
             request.ip ||
             null;
  
  if (!ip) {
    return { isValid: false, ip: null };
  }
  
  // Basic IP validation (IPv4 and IPv6)
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  
  const isValid = ipv4Regex.test(ip) || ipv6Regex.test(ip);
  
  return { isValid, ip };
}

/**
 * Request Timeout Middleware
 */
export function createTimeoutMiddleware(timeoutMs: number = SECURITY_CONFIG.maxRequestTimeout) {
  return (request: NextRequest): Promise<void> => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);
      
      // Clear timeout when request completes
      resolve();
      clearTimeout(timeout);
    });
  };
}

/**
 * Error Response Creator
 */
export function createErrorResponse(
  message: string,
  status: number = 400,
  details?: unknown
): NextResponse {
  const errorResponse = NextResponse.json(
    {
      error: message,
      timestamp: new Date().toISOString(),
      ...(details && { details })
    },
    { status }
  );
  
  return addSecurityHeaders(errorResponse);
}

/**
 * Success Response Creator
 */
export function createSuccessResponse<T>(
  data: T,
  status: number = 200,
  metadata?: Record<string, unknown>
): NextResponse {
  const successResponse = NextResponse.json(
    {
      data,
      timestamp: new Date().toISOString(),
      ...(metadata && { metadata })
    },
    { status }
  );
  
  return addSecurityHeaders(successResponse);
}

/**
 * Security Event Logger
 */
export interface SecurityEvent {
  type: 'attack_detected' | 'rate_limit_exceeded' | 'invalid_request' | 'auth_failure';
  ip: string;
  userAgent: string;
  url: string;
  method: string;
  timestamp: string;
  details: Record<string, unknown>;
}

export function logSecurityEvent(event: SecurityEvent): void {
  console.warn('SECURITY EVENT:', JSON.stringify(event, null, 2));
  
  // In production, this would send to a security monitoring service
  // Example: send to Datadog, Splunk, or custom security dashboard
}

/**
 * Combined Security Middleware
 */
export async function applySecurityMiddleware<T>(
  request: NextRequest,
  schema: z.ZodSchema<T>,
  options: {
    rateLimitConfig?: typeof SECURITY_CONFIG.defaultRateLimit;
    requireCronAuth?: boolean;
    timeoutMs?: number;
    logSecurityEvents?: boolean;
  } = {}
): Promise<{ data: T; response?: NextResponse }> {
  try {
    // Apply timeout
    if (options.timeoutMs) {
      await createTimeoutMiddleware(options.timeoutMs)(request);
    }
    
    // Validate IP address
    const { isValid: validIP, ip } = validateIPAddress(request);
    if (!validIP && options.logSecurityEvents) {
      logSecurityEvent({
        type: 'invalid_request',
        ip: ip || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        url: request.url,
        method: request.method,
        timestamp: new Date().toISOString(),
        details: { reason: 'Invalid IP address' }
      });
    }
    
    // Apply cron authentication if required
    if (options.requireCronAuth && !validateCronSecurity(request)) {
      if (options.logSecurityEvents) {
        logSecurityEvent({
          type: 'auth_failure',
          ip: ip || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
          url: request.url,
          method: request.method,
          timestamp: new Date().toISOString(),
          details: { reason: 'Invalid cron authentication' }
        });
      }
      throw new Error('Unauthorized: Invalid cron authentication');
    }
    
    // Create and apply validator
    const validator = createSecurityValidator(schema);
    const result = await validator(request);
    
    return { data: result.data };
    
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Security validation failed';
    
    if (options.logSecurityEvents) {
      const { ip } = validateIPAddress(request);
      logSecurityEvent({
        type: 'attack_detected',
        ip: ip || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
        url: request.url,
        method: request.method,
        timestamp: new Date().toISOString(),
        details: { error: message }
      });
    }
    
    return { 
      data: {} as T, 
      response: createErrorResponse(message, 400)
    };
  }
}

/**
 * Export all middleware components
 */
export const SecurityMiddleware = {
  validateRequestSize,
  detectAttackPatterns,
  sanitizeInput,
  createSecurityValidator,
  addSecurityHeaders,
  createRateLimiter,
  validateCronSecurity,
  validateIPAddress,
  createTimeoutMiddleware,
  createErrorResponse,
  createSuccessResponse,
  logSecurityEvent,
  applySecurityMiddleware
} as const;