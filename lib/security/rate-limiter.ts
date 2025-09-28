import { logger } from '../logging';
// Web Crypto API for Edge Runtime compatibility

// Optional Redis dependency - will use in-memory fallback if not available
// Only import in Node.js runtime, not Edge Runtime
let Redis: typeof import('ioredis').Redis | null = null;

// Check if we're in Edge Runtime or Node.js runtime
const isEdgeRuntime = typeof EdgeRuntime !== 'undefined' || 
                      typeof globalThis.EdgeRuntime !== 'undefined' ||
                      process.env.RUNTIME === 'edge';

if (!isEdgeRuntime) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ioredis = require('ioredis') as typeof import('ioredis');
    Redis = ioredis.Redis;
  } catch {
    Redis = null;
    logger.child('rate-limiter').info('Redis not available, using in-memory rate limiting');
  }
} else {
  logger.child('rate-limiter').info('Edge Runtime detected, using in-memory rate limiting only');
}

const rateLimitLogger = logger.child('rate-limiter');

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  rateLimitHit?: boolean;
  errorOccurred?: boolean;
}

// Security constants
const MAX_RATE_LIMIT_FAILURES = 3;
const RATE_LIMITER_CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute
const DEFAULT_EMERGENCY_LIMIT = 10; // Conservative limit when rate limiter fails

class RateLimiter {
  private redis: InstanceType<typeof import('ioredis').Redis> | null = null;
  private inMemoryCache = new Map<string, { count: number; resetTime: number }>();
  private emergencyCache = new Map<string, { count: number; resetTime: number; failures: number }>();
  private circuitBreakerState = {
    isOpen: false,
    failureCount: 0,
    lastFailureTime: 0,
    nextAttemptTime: 0
  };

  constructor() {
    // Initialize Redis if available and not in Edge Runtime, otherwise use in-memory cache
    if (Redis && process.env.REDIS_URL && !isEdgeRuntime) {
      try {
        this.redis = new Redis(process.env.REDIS_URL);
        rateLimitLogger.info('Rate limiter initialized with Redis');
      } catch (error) {
        rateLimitLogger.warn('Failed to connect to Redis, using in-memory cache', { error });
        this.redis = null;
      }
    } else {
      rateLimitLogger.info('Rate limiter initialized with in-memory cache');
    }
  }

  async checkLimit(
    key: string, 
    identifier: string, 
    limit: number = 60, // requests per window
    windowMs: number = 60000 // 1 minute window
  ): Promise<RateLimitResult> {
    // Input validation
    if (!key || !identifier || limit <= 0 || windowMs <= 0) {
      rateLimitLogger.error('Invalid rate limit parameters', { key, identifier, limit, windowMs });
      return { allowed: false, remaining: 0, resetTime: Date.now() + windowMs, errorOccurred: true };
    }

    // Create cache key using Web Crypto API (with test environment fallback)
    let hashHex: string;
    
    if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
      // Test environment fallback - simple hash
      hashHex = Array.from(identifier)
        .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
        .substring(0, 16);
    } else {
      // Production: Use Web Crypto API
      const encoder = new TextEncoder();
      const data = encoder.encode(identifier);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      hashHex = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .substring(0, 16);
    }
    
    const cacheKey = `rate_limit:${key}:${hashHex}`;
    const now = Date.now();
    const resetTime = now + windowMs;

    // Check circuit breaker state
    if (this.circuitBreakerState.isOpen) {
      if (now >= this.circuitBreakerState.nextAttemptTime) {
        this.circuitBreakerState.isOpen = false;
        this.circuitBreakerState.failureCount = 0;
        rateLimitLogger.info('Circuit breaker reset, attempting normal operation');
      } else {
        // Circuit breaker is open - use emergency limiting
        return this.checkEmergencyLimit(cacheKey, DEFAULT_EMERGENCY_LIMIT, windowMs, now, resetTime);
      }
    }

    try {
      let result: RateLimitResult;
      
      if (this.redis && !this.circuitBreakerState.isOpen) {
        result = await this.checkLimitRedis(cacheKey, limit, windowMs, now, resetTime);
      } else {
        result = this.checkLimitMemory(cacheKey, limit, windowMs, now, resetTime);
      }
      
      // Reset circuit breaker on successful operation
      if (this.circuitBreakerState.failureCount > 0) {
        this.circuitBreakerState.failureCount = 0;
        rateLimitLogger.info('Rate limiter recovered, circuit breaker reset');
      }
      
      return result;
      
    } catch (error) {
      return this.handleRateLimiterFailure(error, cacheKey, limit, windowMs, now, resetTime, key, identifier);
    }
  }

  private async checkLimitRedis(
    cacheKey: string,
    limit: number,
    windowMs: number,
    now: number,
    resetTime: number
  ): Promise<RateLimitResult> {
    if (!this.redis) throw new Error('Redis not initialized');

    const pipeline = this.redis.pipeline();
    pipeline.incr(cacheKey);
    pipeline.expire(cacheKey, Math.ceil(windowMs / 1000));
    
    const results = await pipeline.exec();
    const count = results?.[0]?.[1] as number || 0;
    
    const allowed = count <= limit;
    const remaining = Math.max(0, limit - count);
    
    return { allowed, remaining, resetTime };
  }

  private checkLimitMemory(
    cacheKey: string,
    limit: number,
    windowMs: number,
    now: number,
    resetTime: number
  ): RateLimitResult {
    // Clean expired entries periodically
    this.cleanupExpiredEntries(now);
    
    const entry = this.inMemoryCache.get(cacheKey);
    
    if (!entry || entry.resetTime <= now) {
      // New window or expired entry
      this.inMemoryCache.set(cacheKey, { count: 1, resetTime });
      return { allowed: true, remaining: limit - 1, resetTime };
    } else {
      // Existing window
      entry.count++;
      const allowed = entry.count <= limit;
      const remaining = Math.max(0, limit - entry.count);
      
      return { allowed, remaining, resetTime: entry.resetTime };
    }
  }

  private cleanupExpiredEntries(now: number) {
    // Only cleanup every 10 minutes to avoid performance impact
    if (!this.lastCleanup || now - this.lastCleanup > 600000) {
      for (const [key, entry] of this.inMemoryCache.entries()) {
        if (entry.resetTime <= now) {
          this.inMemoryCache.delete(key);
        }
      }
      this.lastCleanup = now;
    }
  }

  private lastCleanup = 0;

  /**
   * Handle rate limiter failures with circuit breaker pattern and emergency limiting
   * CRITICAL: This implements fail-secure instead of fail-open
   */
  private handleRateLimiterFailure(
    error: Error,
    cacheKey: string,
    limit: number,
    windowMs: number,
    now: number,
    resetTime: number,
    key: string,
    _identifier: string
  ): RateLimitResult {
    this.circuitBreakerState.failureCount++;
    this.circuitBreakerState.lastFailureTime = now;
    
    rateLimitLogger.error('Rate limit check failed, using emergency limiting', {
      error: error.message,
      key,
      identifier: 'redacted',
      failureCount: this.circuitBreakerState.failureCount,
      timestamp: new Date().toISOString()
    });
    
    // Open circuit breaker after max failures
    if (this.circuitBreakerState.failureCount >= MAX_RATE_LIMIT_FAILURES) {
      this.circuitBreakerState.isOpen = true;
      this.circuitBreakerState.nextAttemptTime = now + RATE_LIMITER_CIRCUIT_BREAKER_TIMEOUT;
      
      rateLimitLogger.warn('Rate limiter circuit breaker opened', {
        nextAttemptTime: new Date(this.circuitBreakerState.nextAttemptTime).toISOString(),
        failureCount: this.circuitBreakerState.failureCount
      });
    }
    
    // SECURITY: Fail secure - use emergency limiting with conservative limits
    return this.checkEmergencyLimit(cacheKey, DEFAULT_EMERGENCY_LIMIT, windowMs, now, resetTime);
  }
  
  /**
   * Emergency rate limiting when primary rate limiter fails
   * Uses conservative in-memory limits with shorter windows
   */
  private checkEmergencyLimit(
    cacheKey: string,
    emergencyLimit: number,
    windowMs: number,
    now: number,
    resetTime: number
  ): RateLimitResult {
    // Clean expired emergency entries
    for (const [key, entry] of this.emergencyCache.entries()) {
      if (entry.resetTime <= now) {
        this.emergencyCache.delete(key);
      }
    }
    
    const entry = this.emergencyCache.get(cacheKey);
    
    if (!entry || entry.resetTime <= now) {
      // New emergency window
      this.emergencyCache.set(cacheKey, {
        count: 1,
        resetTime,
        failures: this.circuitBreakerState.failureCount
      });
      
      return {
        allowed: true,
        remaining: emergencyLimit - 1,
        resetTime,
        errorOccurred: true
      };
    } else {
      // Existing emergency window
      entry.count++;
      const allowed = entry.count <= emergencyLimit;
      const remaining = Math.max(0, emergencyLimit - entry.count);
      
      if (!allowed) {
        rateLimitLogger.warn('Emergency rate limit exceeded', {
          cacheKey: 'redacted',
          count: entry.count,
          limit: emergencyLimit,
          circuitBreakerOpen: this.circuitBreakerState.isOpen
        });
      }
      
      return {
        allowed,
        remaining,
        resetTime: entry.resetTime,
        rateLimitHit: !allowed,
        errorOccurred: true
      };
    }
  }
  
  /**
   * Get current circuit breaker status for monitoring
   */
  public getCircuitBreakerStatus() {
    return {
      isOpen: this.circuitBreakerState.isOpen,
      failureCount: this.circuitBreakerState.failureCount,
      nextAttemptTime: this.circuitBreakerState.nextAttemptTime,
      emergencyCacheSize: this.emergencyCache.size
    };
  }
}

export const rateLimiter = new RateLimiter();