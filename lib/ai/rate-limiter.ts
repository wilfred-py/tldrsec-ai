/**
 * AI API Rate Limiting Service
 * 
 * Implements token bucket algorithm with Redis backing for distributed rate limiting
 * Supports per-user, global, and cost-based rate limiting strategies
 */

import Redis from 'ioredis';
import { logger } from '../logging';
import { monitoring } from '../monitoring';

/**
 * Rate limiting configuration types
 */
export interface RateLimitConfig {
  // Request-based limits
  requestsPerHour?: number;
  requestsPerDay?: number;
  requestsBurstCapacity?: number;
  
  // Token-based limits  
  tokensPerHour?: number;
  tokensPerDay?: number;
  tokensBurstCapacity?: number;
  
  // Cost-based limits
  costPerHour?: number; // USD
  costPerDay?: number; // USD
  costBurstCapacity?: number; // USD
  
  // Time windows
  shortWindowMs?: number; // Default: 1 hour
  longWindowMs?: number; // Default: 24 hours
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number; // Unix timestamp
  limitType: RateLimitType;
  currentUsage: number;
  limit: number;
  retryAfter?: number; // Seconds to wait before retrying
}

export enum RateLimitType {
  REQUESTS_PER_HOUR = 'requests_per_hour',
  REQUESTS_PER_DAY = 'requests_per_day', 
  TOKENS_PER_HOUR = 'tokens_per_hour',
  TOKENS_PER_DAY = 'tokens_per_day',
  COST_PER_HOUR = 'cost_per_hour',
  COST_PER_DAY = 'cost_per_day'
}

export enum RateLimitScope {
  USER = 'user',
  GLOBAL = 'global',
  ENDPOINT = 'endpoint'
}

/**
 * Token Bucket Rate Limiter with Redis backing
 */
export class TokenBucketRateLimiter {
  private redis: Redis | null = null;
  private fallbackLimits = new Map<string, { count: number; resetTime: number }>();

  constructor() {
    this.initializeRedis();
  }

  private async initializeRedis(): Promise<void> {
    try {
      if (process.env.REDIS_URL) {
        this.redis = new Redis(process.env.REDIS_URL, {
          maxRetriesPerRequest: 3,
          retryDelayOnFailover: 100,
          enableOfflineQueue: false,
          lazyConnect: true
        });

        this.redis.on('error', (error) => {
          logger.error('Redis connection error, falling back to in-memory limiting', {
            error: error.message
          });
          this.redis = null;
        });

        await this.redis.ping();
        logger.info('✅ Redis connected for distributed rate limiting');
      } else {
        logger.info('⚠️ No REDIS_URL configured, using in-memory rate limiting');
      }
    } catch (error) {
      logger.error('Failed to initialize Redis, using in-memory fallback', {
        error: error instanceof Error ? error.message : String(error)
      });
      this.redis = null;
    }
  }

  /**
   * Check and consume rate limit tokens using token bucket algorithm
   */
  async checkRateLimit(
    key: string,
    limit: number,
    windowMs: number,
    burstCapacity: number,
    consumption: number = 1
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const resetTime = Math.ceil(now / windowMs) * windowMs;
    
    try {
      if (this.redis) {
        return await this.checkRateLimitRedis(key, limit, windowMs, burstCapacity, consumption, now);
      } else {
        return this.checkRateLimitMemory(key, limit, windowMs, burstCapacity, consumption, now);
      }
    } catch (error) {
      logger.error('Rate limit check failed, allowing request', {
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Fail open - allow request if rate limiting fails
      return {
        allowed: true,
        remaining: limit - consumption,
        resetTime,
        limitType: RateLimitType.REQUESTS_PER_HOUR,
        currentUsage: consumption,
        limit
      };
    }
  }

  /**
   * Redis-backed rate limiting with Lua script for atomicity
   */
  private async checkRateLimitRedis(
    key: string,
    limit: number,
    windowMs: number,
    burstCapacity: number,
    consumption: number,
    now: number
  ): Promise<RateLimitResult> {
    const luaScript = `
      local key = KEYS[1]
      local limit = tonumber(ARGV[1])
      local windowMs = tonumber(ARGV[2])
      local burstCapacity = tonumber(ARGV[3])
      local consumption = tonumber(ARGV[4])
      local now = tonumber(ARGV[5])
      
      local bucketKey = key .. ":bucket"
      local lastRefillKey = key .. ":lastrefill"
      
      -- Get current bucket state
      local currentTokens = tonumber(redis.call('GET', bucketKey)) or limit
      local lastRefill = tonumber(redis.call('GET', lastRefillKey)) or now
      
      -- Calculate tokens to add based on time elapsed
      local elapsed = now - lastRefill
      local tokensToAdd = (elapsed / windowMs) * limit
      currentTokens = math.min(burstCapacity, currentTokens + tokensToAdd)
      
      -- Check if we can consume tokens
      if currentTokens >= consumption then
        currentTokens = currentTokens - consumption
        
        -- Update bucket state
        redis.call('SET', bucketKey, currentTokens, 'PX', windowMs * 2)
        redis.call('SET', lastRefillKey, now, 'PX', windowMs * 2)
        
        return {1, currentTokens, now + windowMs, limit - currentTokens}
      else
        -- Not enough tokens, calculate retry after
        local tokensNeeded = consumption - currentTokens
        local retryAfter = (tokensNeeded / limit) * windowMs
        
        return {0, currentTokens, now + windowMs, limit - currentTokens, retryAfter}
      end
    `;

    const result = await this.redis!.eval(
      luaScript,
      1,
      key,
      limit.toString(),
      windowMs.toString(),
      burstCapacity.toString(),
      consumption.toString(),
      now.toString()
    ) as number[];

    const allowed = result[0] === 1;
    const remaining = result[1];
    const resetTime = result[2];
    const currentUsage = result[3];
    const retryAfter = result[4];

    return {
      allowed,
      remaining,
      resetTime,
      limitType: RateLimitType.REQUESTS_PER_HOUR,
      currentUsage,
      limit,
      retryAfter: retryAfter ? Math.ceil(retryAfter / 1000) : undefined
    };
  }

  /**
   * In-memory fallback rate limiting
   */
  private checkRateLimitMemory(
    key: string,
    limit: number,
    windowMs: number,
    burstCapacity: number,
    consumption: number,
    now: number
  ): RateLimitResult {
    const current = this.fallbackLimits.get(key);
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const resetTime = windowStart + windowMs;

    if (!current || current.resetTime <= now) {
      // New window or expired, reset
      const newCount = consumption;
      this.fallbackLimits.set(key, { count: newCount, resetTime });
      
      return {
        allowed: newCount <= limit,
        remaining: Math.max(0, limit - newCount),
        resetTime,
        limitType: RateLimitType.REQUESTS_PER_HOUR,
        currentUsage: newCount,
        limit
      };
    }

    const newCount = current.count + consumption;
    const allowed = newCount <= burstCapacity;
    
    if (allowed) {
      this.fallbackLimits.set(key, { count: newCount, resetTime: current.resetTime });
    }

    return {
      allowed,
      remaining: Math.max(0, limit - newCount),
      resetTime: current.resetTime,
      limitType: RateLimitType.REQUESTS_PER_HOUR,
      currentUsage: newCount,
      limit,
      retryAfter: allowed ? undefined : Math.ceil((current.resetTime - now) / 1000)
    };
  }

  /**
   * Clean up expired entries from in-memory fallback
   */
  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, value] of this.fallbackLimits.entries()) {
      if (value.resetTime <= now) {
        this.fallbackLimits.delete(key);
      }
    }
  }

  /**
   * Get current usage for a key
   */
  async getCurrentUsage(key: string): Promise<number> {
    try {
      if (this.redis) {
        const count = await this.redis.get(`${key}:bucket`);
        return count ? parseInt(count, 10) : 0;
      } else {
        const current = this.fallbackLimits.get(key);
        return current && current.resetTime > Date.now() ? current.count : 0;
      }
    } catch (error) {
      logger.error('Failed to get current usage', {
        key,
        error: error instanceof Error ? error.message : String(error)
      });
      return 0;
    }
  }

  /**
   * Reset rate limit for a key (admin function)
   */
  async resetRateLimit(key: string): Promise<void> {
    try {
      if (this.redis) {
        await this.redis.del(`${key}:bucket`, `${key}:lastrefill`);
      } else {
        this.fallbackLimits.delete(key);
      }
      logger.info('Rate limit reset', { key });
    } catch (error) {
      logger.error('Failed to reset rate limit', {
        key,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Close Redis connection
   */
  async disconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.disconnect();
      this.redis = null;
    }
  }
}

/**
 * AI Rate Limit Manager
 * Coordinates multiple rate limiting strategies
 */
export class AIRateLimitManager {
  private tokenBucket: TokenBucketRateLimiter;
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.tokenBucket = new TokenBucketRateLimiter();
    this.config = {
      // Default configuration with environment variable overrides
      requestsPerHour: 100,
      requestsPerDay: 1000,
      requestsBurstCapacity: 20,
      tokensPerHour: 50000,
      tokensPerDay: 500000,
      tokensBurstCapacity: 10000,
      costPerHour: 10.0,
      costPerDay: 100.0,
      costBurstCapacity: 5.0,
      shortWindowMs: 60 * 60 * 1000, // 1 hour
      longWindowMs: 24 * 60 * 60 * 1000, // 24 hours
      ...config
    };
  }

  /**
   * Check multiple rate limits for AI API calls
   */
  async checkAllLimits(
    userId?: string,
    operation: string = 'ai_request',
    tokenEstimate: number = 0,
    costEstimate: number = 0
  ): Promise<{ allowed: boolean; violations: RateLimitResult[] }> {
    const violations: RateLimitResult[] = [];
    
    // Generate keys for different scopes
    const userKey = userId ? `${RateLimitScope.USER}:${userId}` : null;
    const globalKey = `${RateLimitScope.GLOBAL}:all`;
    const _endpointKey = `${RateLimitScope.ENDPOINT}:${operation}`;

    try {
      // Check per-user limits
      if (userKey && this.config.requestsPerHour) {
        const result = await this.tokenBucket.checkRateLimit(
          `${userKey}:${RateLimitType.REQUESTS_PER_HOUR}`,
          this.config.requestsPerHour,
          this.config.shortWindowMs!,
          this.config.requestsBurstCapacity!,
          1
        );
        result.limitType = RateLimitType.REQUESTS_PER_HOUR;
        
        if (!result.allowed) {
          violations.push(result);
        }
      }

      // Check user token limits
      if (userKey && tokenEstimate > 0 && this.config.tokensPerHour) {
        const result = await this.tokenBucket.checkRateLimit(
          `${userKey}:${RateLimitType.TOKENS_PER_HOUR}`,
          this.config.tokensPerHour,
          this.config.shortWindowMs!,
          this.config.tokensBurstCapacity!,
          tokenEstimate
        );
        result.limitType = RateLimitType.TOKENS_PER_HOUR;
        
        if (!result.allowed) {
          violations.push(result);
        }
      }

      // Check user cost limits
      if (userKey && costEstimate > 0 && this.config.costPerHour) {
        const result = await this.tokenBucket.checkRateLimit(
          `${userKey}:${RateLimitType.COST_PER_HOUR}`,
          this.config.costPerHour * 1000, // Convert to cents for precision
          this.config.shortWindowMs!,
          this.config.costBurstCapacity! * 1000,
          Math.round(costEstimate * 1000)
        );
        result.limitType = RateLimitType.COST_PER_HOUR;
        
        if (!result.allowed) {
          violations.push(result);
        }
      }

      // Check global limits
      if (this.config.requestsPerHour) {
        const globalLimit = this.config.requestsPerHour * 10; // 10x user limit for global
        const result = await this.tokenBucket.checkRateLimit(
          `${globalKey}:${RateLimitType.REQUESTS_PER_HOUR}`,
          globalLimit,
          this.config.shortWindowMs!,
          Math.round(globalLimit * 1.5),
          1
        );
        result.limitType = RateLimitType.REQUESTS_PER_HOUR;
        
        if (!result.allowed) {
          violations.push(result);
        }
      }

      // Record metrics
      monitoring.incrementCounter('ai.rate_limit.checks', 1, {
        operation,
        user_id: userId || 'anonymous',
        violations_count: violations.length.toString()
      });

      const allowed = violations.length === 0;
      
      if (!allowed) {
        monitoring.incrementCounter('ai.rate_limit.violations', 1, {
          operation,
          user_id: userId || 'anonymous',
          violation_types: violations.map(v => v.limitType).join(',')
        });
        
        logger.warn('AI rate limit violation detected', {
          userId,
          operation,
          tokenEstimate,
          costEstimate,
          violations: violations.map(v => ({
            type: v.limitType,
            currentUsage: v.currentUsage,
            limit: v.limit,
            retryAfter: v.retryAfter
          }))
        });
      }

      return { allowed, violations };
      
    } catch (error) {
      logger.error('Rate limit check failed', {
        userId,
        operation,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Fail open - allow the request if rate limiting fails
      return { allowed: true, violations: [] };
    }
  }

  /**
   * Record actual usage after API call completion
   */
  async recordUsage(
    userId: string | undefined,
    operation: string,
    actualTokens: number,
    actualCost: number
  ): Promise<void> {
    try {
      // This is primarily for accurate tracking and analytics
      // The consumption was already recorded during checkAllLimits
      
      monitoring.recordGauge('ai.usage.tokens', actualTokens, {
        operation,
        user_id: userId || 'anonymous'
      });
      
      monitoring.recordGauge('ai.usage.cost', actualCost, {
        operation,
        user_id: userId || 'anonymous'
      });
      
      logger.debug('AI usage recorded', {
        userId,
        operation,
        tokens: actualTokens,
        cost: actualCost
      });
      
    } catch (error) {
      logger.error('Failed to record AI usage', {
        userId,
        operation,
        actualTokens,
        actualCost,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get rate limit status for user
   */
  async getRateLimitStatus(userId: string): Promise<{
    requests: { current: number; limit: number; resetTime: number };
    tokens: { current: number; limit: number; resetTime: number };
    cost: { current: number; limit: number; resetTime: number };
  }> {
    try {
      const userKey = `${RateLimitScope.USER}:${userId}`;
      const now = Date.now();
      
      const [requestsUsage, tokensUsage, costUsage] = await Promise.all([
        this.tokenBucket.getCurrentUsage(`${userKey}:${RateLimitType.REQUESTS_PER_HOUR}`),
        this.tokenBucket.getCurrentUsage(`${userKey}:${RateLimitType.TOKENS_PER_HOUR}`),
        this.tokenBucket.getCurrentUsage(`${userKey}:${RateLimitType.COST_PER_HOUR}`)
      ]);

      const resetTime = Math.ceil(now / this.config.shortWindowMs!) * this.config.shortWindowMs!;

      return {
        requests: {
          current: requestsUsage,
          limit: this.config.requestsPerHour!,
          resetTime
        },
        tokens: {
          current: tokensUsage,
          limit: this.config.tokensPerHour!,
          resetTime
        },
        cost: {
          current: Math.round(costUsage / 10) / 100, // Convert back from cents
          limit: this.config.costPerHour!,
          resetTime
        }
      };
      
    } catch (error) {
      logger.error('Failed to get rate limit status', {
        userId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Return zero usage if check fails
      const resetTime = Math.ceil(Date.now() / this.config.shortWindowMs!) * this.config.shortWindowMs!;
      return {
        requests: { current: 0, limit: this.config.requestsPerHour!, resetTime },
        tokens: { current: 0, limit: this.config.tokensPerHour!, resetTime },
        cost: { current: 0, limit: this.config.costPerHour!, resetTime }
      };
    }
  }

  /**
   * Clean up resources
   */
  async shutdown(): Promise<void> {
    await this.tokenBucket.disconnect();
  }
}

/**
 * Rate limit error class
 */
export class RateLimitExceededError extends Error {
  public readonly violations: RateLimitResult[];
  public readonly retryAfter: number;

  constructor(violations: RateLimitResult[]) {
    const primaryViolation = violations[0];
    const message = `Rate limit exceeded: ${primaryViolation.limitType}. Current usage: ${primaryViolation.currentUsage}/${primaryViolation.limit}`;
    
    super(message);
    this.name = 'RateLimitExceededError';
    this.violations = violations;
    this.retryAfter = Math.min(...violations.map(v => v.retryAfter || 0).filter(r => r > 0));
  }
}

/**
 * Create default rate limit manager instance
 */
export function createDefaultRateLimitManager(): AIRateLimitManager {
  const config: RateLimitConfig = {
    requestsPerHour: parseInt(process.env.AI_USER_REQUESTS_PER_HOUR || '100', 10),
    requestsPerDay: parseInt(process.env.AI_USER_REQUESTS_PER_DAY || '1000', 10),
    requestsBurstCapacity: parseInt(process.env.AI_USER_REQUESTS_BURST || '20', 10),
    
    tokensPerHour: parseInt(process.env.AI_USER_TOKENS_PER_HOUR || '50000', 10),
    tokensPerDay: parseInt(process.env.AI_USER_TOKENS_PER_DAY || '500000', 10),
    tokensBurstCapacity: parseInt(process.env.AI_USER_TOKENS_BURST || '10000', 10),
    
    costPerHour: parseFloat(process.env.AI_USER_COST_PER_HOUR || '10.0'),
    costPerDay: parseFloat(process.env.AI_USER_COST_PER_DAY || '100.0'),
    costBurstCapacity: parseFloat(process.env.AI_USER_COST_BURST || '5.0'),
    
    shortWindowMs: parseInt(process.env.AI_RATE_LIMIT_WINDOW_HOUR || '3600000', 10), // 1 hour
    longWindowMs: parseInt(process.env.AI_RATE_LIMIT_WINDOW_DAY || '86400000', 10) // 24 hours
  };

  return new AIRateLimitManager(config);
}