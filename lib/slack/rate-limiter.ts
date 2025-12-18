/**
 * Slack Rate Limiter
 *
 * Implements rate limiting for Slack webhook endpoints to prevent abuse
 * and protect against DoS attacks.
 */

import { logger } from '../logging';

const rateLimiterLogger = logger.child('slack-rate-limiter');

// =============================================================================
// Rate Limiting Configuration
// =============================================================================

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// Rate limit configurations by client type
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  slack_webhook: { windowMs: 60 * 1000, maxRequests: 100 }, // 100 requests per minute
  slack_user: { windowMs: 60 * 1000, maxRequests: 20 }, // 20 requests per minute per user
};

// In-memory store for rate limit tracking
// TODO: Consider Redis for production scaling
const rateLimitStore = new Map<string, RateLimitEntry>();

// =============================================================================
// Rate Limiting Functions
// =============================================================================

/**
 * Generate rate limit key
 */
function getRateLimitKey(type: string, identifier: string): string {
  return `${type}:${identifier}`;
}

/**
 * Check if request should be rate limited
 */
export function checkRateLimit(
  type: keyof typeof RATE_LIMITS,
  identifier: string
): { allowed: boolean; remainingRequests: number; resetTime: number } {
  const config = RATE_LIMITS[type];
  if (!config) {
    rateLimiterLogger.warn('Unknown rate limit type', { type });
    return { allowed: true, remainingRequests: 999, resetTime: Date.now() + 60000 };
  }

  const key = getRateLimitKey(type, identifier);
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // If no entry or window expired, create new entry
  if (!entry || now > entry.resetTime) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetTime: now + config.windowMs,
    };
    rateLimitStore.set(key, newEntry);
    
    rateLimiterLogger.debug('Rate limit initialized', {
      type,
      identifier,
      remainingRequests: config.maxRequests - 1,
    });

    return {
      allowed: true,
      remainingRequests: config.maxRequests - 1,
      resetTime: newEntry.resetTime,
    };
  }

  // Check if over limit
  if (entry.count >= config.maxRequests) {
    rateLimiterLogger.warn('Rate limit exceeded', {
      type,
      identifier,
      count: entry.count,
      maxRequests: config.maxRequests,
      resetTime: entry.resetTime,
    });

    return {
      allowed: false,
      remainingRequests: 0,
      resetTime: entry.resetTime,
    };
  }

  // Increment counter
  entry.count += 1;
  rateLimitStore.set(key, entry);

  rateLimiterLogger.debug('Rate limit check passed', {
    type,
    identifier,
    count: entry.count,
    remainingRequests: config.maxRequests - entry.count,
  });

  return {
    allowed: true,
    remainingRequests: config.maxRequests - entry.count,
    resetTime: entry.resetTime,
  };
}

/**
 * Get rate limit headers for response
 */
export function getRateLimitHeaders(
  type: keyof typeof RATE_LIMITS,
  identifier: string
): Record<string, string> {
  const result = checkRateLimit(type, identifier);
  const config = RATE_LIMITS[type];

  return {
    'X-RateLimit-Limit': config.maxRequests.toString(),
    'X-RateLimit-Remaining': result.remainingRequests.toString(),
    'X-RateLimit-Reset': Math.ceil(result.resetTime / 1000).toString(),
  };
}

/**
 * Clear expired entries from store (cleanup)
 */
export function cleanupExpiredEntries(): void {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      rateLimitStore.delete(key);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    rateLimiterLogger.debug('Cleaned up expired rate limit entries', {
      cleanedCount,
      remainingEntries: rateLimitStore.size,
    });
  }
}

/**
 * Get current store statistics
 */
export function getRateLimitStats(): {
  totalEntries: number;
  activeEntries: number;
  expiredEntries: number;
} {
  const now = Date.now();
  let activeCount = 0;
  let expiredCount = 0;

  for (const [, entry] of rateLimitStore.entries()) {
    if (now > entry.resetTime) {
      expiredCount++;
    } else {
      activeCount++;
    }
  }

  return {
    totalEntries: rateLimitStore.size,
    activeEntries: activeCount,
    expiredEntries: expiredCount,
  };
}

// Periodic cleanup (run every 5 minutes)
setInterval(cleanupExpiredEntries, 5 * 60 * 1000);