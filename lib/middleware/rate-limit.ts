import { NextRequest, NextResponse } from 'next/server';

interface RateLimitConfig {
  interval: number; // Time window in milliseconds
  uniqueTokenPerInterval: number; // Max number of unique tokens
  max: number; // Max requests per interval
}

// Simple Map-based cache for rate limiting (with manual cleanup)
const rateLimitCache = new Map<string, { requests: number[]; lastCleanup: number }>();

// Cleanup old entries periodically
function cleanupCache() {
  const now = Date.now();
  const maxAge = 5 * 60 * 1000; // 5 minutes

  for (const [key, data] of rateLimitCache.entries()) {
    if (now - data.lastCleanup > maxAge) {
      rateLimitCache.delete(key);
    }
  }
}

export function rateLimit(config: RateLimitConfig) {
  return async function rateLimitMiddleware(
    request: NextRequest,
    handler: (request: NextRequest) => Promise<NextResponse>
  ): Promise<NextResponse> {
    // Get user identifier (IP or user ID)
    const identifier = request.headers.get('x-forwarded-for') ||
                      request.headers.get('x-real-ip') ||
                      'anonymous';

    const now = Date.now();
    const windowStart = now - config.interval;

    // Cleanup old entries occasionally
    if (Math.random() < 0.1) { // 10% chance
      cleanupCache();
    }

    // Get existing requests for this identifier
    const cachedData = rateLimitCache.get(identifier);
    const requests = cachedData?.requests || [];

    // Filter requests within current window
    const recentRequests = requests.filter(timestamp => timestamp > windowStart);

    // Check if rate limit exceeded
    if (recentRequests.length >= config.max) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded. Please try again later.',
          retryAfter: Math.ceil((recentRequests[0] + config.interval - now) / 1000)
        },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': config.max.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(recentRequests[0] + config.interval).toISOString(),
          }
        }
      );
    }

    // Add current request timestamp
    recentRequests.push(now);
    rateLimitCache.set(identifier, {
      requests: recentRequests,
      lastCleanup: now
    });

    // Add rate limit headers
    const response = await handler(request);
    response.headers.set('X-RateLimit-Limit', config.max.toString());
    response.headers.set('X-RateLimit-Remaining', (config.max - recentRequests.length).toString());
    response.headers.set('X-RateLimit-Reset', new Date(now + config.interval).toISOString());

    return response;
  };
}

// Preset configurations
export const rateLimitConfigs = {
  // 10 requests per minute for checkout
  checkout: {
    interval: 60 * 1000, // 1 minute
    uniqueTokenPerInterval: 500,
    max: 10,
  },
  // 100 requests per minute for API
  api: {
    interval: 60 * 1000, // 1 minute
    uniqueTokenPerInterval: 500,
    max: 100,
  },
  // 5 requests per minute for sensitive operations
  sensitive: {
    interval: 60 * 1000, // 1 minute
    uniqueTokenPerInterval: 500,
    max: 5,
  },
} as const;
