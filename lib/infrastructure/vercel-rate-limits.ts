/**
 * Vercel Edge Runtime Rate Limiting Configuration
 * Provides endpoint-specific rate limiting for async processing and microservices
 */

export interface RateLimitConfig {
  endpoint: string;
  maxRequests: number;
  windowMs: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (request: Request) => string;
  message?: string;
}

/**
 * Rate limiting configurations for different endpoint categories
 */
export const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  // Cron endpoints - Very restrictive since they should only be called by Cloudflare Workers
  '/api/cron/tier-aware': {
    endpoint: '/api/cron/tier-aware',
    maxRequests: 10, // 10 requests per 10 minutes (normal cron schedule)
    windowMs: 10 * 60 * 1000, // 10 minutes
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    message: 'Too many cron requests. Expected ~6 requests per hour.'
  },
  
  '/api/cron/tier-aware-async': {
    endpoint: '/api/cron/tier-aware-async',
    maxRequests: 15, // Higher for async processing with potential retries
    windowMs: 10 * 60 * 1000, // 10 minutes
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    message: 'Too many async cron requests. Expected ~6 requests per hour with retry buffer.'
  },
  
  '/api/cron/microservices': {
    endpoint: '/api/cron/microservices',
    maxRequests: 20, // Higher for microservices due to fast response model
    windowMs: 10 * 60 * 1000, // 10 minutes
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    message: 'Too many microservices cron requests. Expected ~6 requests per hour with circuit breaker buffer.'
  },
  
  '/api/cron/tier-aware-optimized': {
    endpoint: '/api/cron/tier-aware-optimized',
    maxRequests: 10,
    windowMs: 10 * 60 * 1000, // 10 minutes
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    message: 'Too many optimized cron requests. Expected ~6 requests per hour.'
  },
  
  '/api/cron/process-jobs': {
    endpoint: '/api/cron/process-jobs',
    maxRequests: 25, // Higher for job processing which may need more frequent execution
    windowMs: 10 * 60 * 1000, // 10 minutes
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    message: 'Too many job processing requests. Expected batch processing pattern.'
  },
  
  // Filing endpoints - Moderate limits for AI-intensive operations
  '/api/filings/batch-summary': {
    endpoint: '/api/filings/batch-summary',
    maxRequests: 100, // 100 requests per hour for batch operations
    windowMs: 60 * 60 * 1000, // 1 hour
    skipSuccessfulRequests: false,
    skipFailedRequests: true, // Don't count failed requests to allow retries
    message: 'Too many batch summary requests. Please wait before retrying.'
  },
  
  '/api/filings/optimized-batch': {
    endpoint: '/api/filings/optimized-batch',
    maxRequests: 150, // Higher for optimized batch processing
    windowMs: 60 * 60 * 1000, // 1 hour
    skipSuccessfulRequests: false,
    skipFailedRequests: true,
    message: 'Too many optimized batch requests. Please wait before retrying.'
  },
  
  '/api/filings/stream-summary': {
    endpoint: '/api/filings/stream-summary',
    maxRequests: 200, // Higher for streaming (multiple chunks per request)
    windowMs: 60 * 60 * 1000, // 1 hour
    skipSuccessfulRequests: false,
    skipFailedRequests: true,
    message: 'Too many streaming summary requests. Please wait before retrying.'
  },
  
  '/api/filings/enhanced-summary': {
    endpoint: '/api/filings/enhanced-summary',
    maxRequests: 75, // Lower for enhanced processing (higher AI cost)
    windowMs: 60 * 60 * 1000, // 1 hour
    skipSuccessfulRequests: false,
    skipFailedRequests: true,
    message: 'Too many enhanced summary requests. Please wait before retrying.'
  },
  
  // Test endpoints - Generous limits for development
  '/api/test/ai-summary': {
    endpoint: '/api/test/ai-summary',
    maxRequests: 50,
    windowMs: 60 * 60 * 1000, // 1 hour
    skipSuccessfulRequests: false,
    skipFailedRequests: true,
    message: 'Too many test AI summary requests. Please wait before retrying.'
  },
  
  '/api/test/filing-summary': {
    endpoint: '/api/test/filing-summary',
    maxRequests: 50,
    windowMs: 60 * 60 * 1000, // 1 hour
    skipSuccessfulRequests: false,
    skipFailedRequests: true,
    message: 'Too many test filing summary requests. Please wait before retrying.'
  },
  
  // Email endpoints - Moderate limits to prevent spam
  '/api/email/filings-summary': {
    endpoint: '/api/email/filings-summary',
    maxRequests: 100,
    windowMs: 60 * 60 * 1000, // 1 hour
    skipSuccessfulRequests: false,
    skipFailedRequests: false, // Count failed requests to prevent spam
    message: 'Too many email requests. Please wait before sending more emails.'
  },
  
  '/api/email/summary': {
    endpoint: '/api/email/summary',
    maxRequests: 100,
    windowMs: 60 * 60 * 1000, // 1 hour
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    message: 'Too many email summary requests. Please wait before sending more emails.'
  },
  
  '/api/email/welcome': {
    endpoint: '/api/email/welcome',
    maxRequests: 50,
    windowMs: 60 * 60 * 1000, // 1 hour
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    message: 'Too many welcome email requests. Please wait before retrying.'
  }
};

/**
 * Get rate limit configuration for a specific endpoint
 */
export function getRateLimitConfig(pathname: string): RateLimitConfig | null {
  // Try exact match first
  if (RATE_LIMIT_CONFIGS[pathname]) {
    return RATE_LIMIT_CONFIGS[pathname];
  }
  
  // Try pattern matching for parameterized routes
  for (const [pattern, config] of Object.entries(RATE_LIMIT_CONFIGS)) {
    if (pathname.startsWith(pattern)) {
      return config;
    }
  }
  
  return null;
}

/**
 * Default rate limit for unspecified endpoints
 */
export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  endpoint: 'default',
  maxRequests: 1000,
  windowMs: 60 * 60 * 1000, // 1 hour
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  message: 'Too many requests. Please try again later.'
};

/**
 * Emergency rate limiting for suspicious activity
 */
export const EMERGENCY_RATE_LIMIT: RateLimitConfig = {
  endpoint: 'emergency',
  maxRequests: 10,
  windowMs: 60 * 60 * 1000, // 1 hour
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  message: 'Account temporarily restricted due to suspicious activity. Please contact support.'
};

/**
 * Rate limit key generators for different scenarios
 */
export const KEY_GENERATORS = {
  // Standard IP-based rate limiting
  byIP: (request: Request): string => {
    const ip = request.headers.get('x-forwarded-for') || 
               request.headers.get('x-real-ip') || 
               request.headers.get('cf-connecting-ip') || 
               'unknown';
    return `ip:${ip}`;
  },
  
  // User-based rate limiting (requires auth context)
  byUser: (request: Request): string => {
    const userId = request.headers.get('x-user-id') || 'anonymous';
    return `user:${userId}`;
  },
  
  // Endpoint-specific rate limiting
  byEndpoint: (request: Request): string => {
    const url = new URL(request.url);
    return `endpoint:${url.pathname}`;
  },
  
  // Combined IP + endpoint rate limiting
  byIPAndEndpoint: (request: Request): string => {
    const ip = request.headers.get('x-forwarded-for') || 
               request.headers.get('x-real-ip') || 
               'unknown';
    const url = new URL(request.url);
    return `ip-endpoint:${ip}:${url.pathname}`;
  },
  
  // Cron-specific rate limiting (by execution source)
  byCronSource: (request: Request): string => {
    const cronSource = request.headers.get('x-cron-source') || 
                      request.headers.get('user-agent') || 
                      'unknown';
    return `cron:${cronSource}`;
  }
};

/**
 * Cost-aware rate limiting based on endpoint expense
 */
export const COST_BASED_LIMITS = {
  // High-cost AI endpoints (enhanced summaries, batch processing)
  HIGH_COST: {
    maxRequests: 25,
    windowMs: 60 * 60 * 1000, // 1 hour
    costMultiplier: 3.0
  },
  
  // Medium-cost endpoints (standard AI processing)
  MEDIUM_COST: {
    maxRequests: 100,
    windowMs: 60 * 60 * 1000, // 1 hour
    costMultiplier: 1.5
  },
  
  // Low-cost endpoints (database operations, simple APIs)
  LOW_COST: {
    maxRequests: 500,
    windowMs: 60 * 60 * 1000, // 1 hour
    costMultiplier: 1.0
  }
};

/**
 * Security-focused rate limiting patterns
 */
export const SECURITY_RATE_LIMITS = {
  // Brute force protection for auth endpoints
  AUTH_ATTEMPTS: {
    maxRequests: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    message: 'Too many authentication attempts. Please wait 15 minutes.'
  },
  
  // API key validation attempts
  API_KEY_VALIDATION: {
    maxRequests: 10,
    windowMs: 60 * 60 * 1000, // 1 hour
    message: 'Too many API key validation attempts. Please check your credentials.'
  },
  
  // Suspicious activity detection
  SUSPICIOUS_ACTIVITY: {
    maxRequests: 3,
    windowMs: 24 * 60 * 60 * 1000, // 24 hours
    message: 'Account temporarily restricted. Please contact support.'
  }
};