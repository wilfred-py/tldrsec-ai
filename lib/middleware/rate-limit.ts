import { NextRequest, NextResponse } from 'next/server';
import { LRUCache } from 'lru-cache';

interface RateLimitConfig {
  interval: number; // Time window in milliseconds
  uniqueTokenPerInterval: number; // Max number of unique tokens
  max: number; // Max requests per interval
}

// Create cache for rate limiting
const rateLimitCache = new LRUCache<string, number[]>({
  max: 500, // Max 500 unique users
  ttl: 60 * 1000, // 1 minute TTL
});

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
    
    // Get existing requests for this identifier
    const requests = rateLimitCache.get(identifier) || [];
    
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
    rateLimitCache.set(identifier, recentRequests);
    
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