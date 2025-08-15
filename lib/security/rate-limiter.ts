import { Redis } from 'ioredis';
import { logger } from '../logging';

const rateLimitLogger = logger.child('rate-limiter');

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
}

class RateLimiter {
  private redis: Redis | null = null;
  private inMemoryCache = new Map<string, { count: number; resetTime: number }>();

  constructor() {
    // Initialize Redis if available, otherwise use in-memory cache
    if (process.env.REDIS_URL) {
      try {
        this.redis = new Redis(process.env.REDIS_URL);
        rateLimitLogger.info('Rate limiter initialized with Redis');
      } catch (error) {
        rateLimitLogger.warn('Failed to connect to Redis, using in-memory cache', { error });
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
    const cacheKey = `rate_limit:${key}:${identifier}`;
    const now = Date.now();
    const resetTime = now + windowMs;

    try {
      if (this.redis) {
        return await this.checkLimitRedis(cacheKey, limit, windowMs, now, resetTime);
      } else {
        return this.checkLimitMemory(cacheKey, limit, windowMs, now, resetTime);
      }
    } catch (error) {
      rateLimitLogger.error('Rate limit check failed, allowing request', { error, key, identifier });
      // Fail open - allow request if rate limiting fails
      return { allowed: true, remaining: limit - 1, resetTime };
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
}

export const rateLimiter = new RateLimiter();