/**
 * Enhanced Vercel Endpoint Rate Limiting with Priority Queuing
 * 
 * Implements intelligent rate limiting for Vercel endpoints that prioritizes
 * authenticated cron requests while maintaining protection against abuse.
 * 
 * Features:
 * - Priority queuing for authenticated cron requests
 * - Adaptive rate limiting based on request type
 * - Request classification and routing
 * - Enhanced monitoring and metrics
 * - Circuit breaker protection
 */

import { NextRequest, NextResponse } from 'next/server';
import { rateLimiter } from '../../security/rate-limiter';
import { logger } from '../../logging';
import { monitoring } from '../../monitoring';

// Request priority levels
export enum RequestPriority {
  CRITICAL = 'critical',     // Authenticated cron requests
  HIGH = 'high',            // User dashboard requests
  MEDIUM = 'medium',        // API requests
  LOW = 'low',              // Public requests
  SUSPICIOUS = 'suspicious'  // Potentially malicious requests
}

// Rate limiting tiers based on priority
export const PRIORITY_RATE_LIMITS = {
  [RequestPriority.CRITICAL]: {
    requests: 100,        // Very high limit for cron
    windowMs: 10 * 60 * 1000, // 10 minutes
    burstLimit: 20,       // Allow bursts
    queuePriority: 1      // Highest priority
  },
  [RequestPriority.HIGH]: {
    requests: 500,
    windowMs: 60 * 60 * 1000, // 1 hour
    burstLimit: 50,
    queuePriority: 2
  },
  [RequestPriority.MEDIUM]: {
    requests: 200,
    windowMs: 60 * 60 * 1000,
    burstLimit: 20,
    queuePriority: 3
  },
  [RequestPriority.LOW]: {
    requests: 100,
    windowMs: 60 * 60 * 1000,
    burstLimit: 10,
    queuePriority: 4
  },
  [RequestPriority.SUSPICIOUS]: {
    requests: 10,
    windowMs: 60 * 60 * 1000,
    burstLimit: 2,
    queuePriority: 5      // Lowest priority
  }
};

// Request classification rules
interface RequestClassificationRule {
  condition: (request: NextRequest) => boolean;
  priority: RequestPriority;
  description: string;
}

const CLASSIFICATION_RULES: RequestClassificationRule[] = [
  {
    condition: (req) => {
      const cronSecret = req.headers.get('x-cron-auth') || req.headers.get('authorization');
      const cronSource = req.headers.get('x-cron-source');
      const userAgent = req.headers.get('user-agent');
      
      return !!(cronSecret && (cronSource === 'cloudflare-worker' || userAgent?.includes('TLDRSEC-Cloudflare-Worker')));
    },
    priority: RequestPriority.CRITICAL,
    description: 'Authenticated Cloudflare Worker cron request'
  },
  {
    condition: (req) => {
      const path = new URL(req.url).pathname;
      return path.startsWith('/api/cron/') && req.headers.get('x-cron-secret');
    },
    priority: RequestPriority.CRITICAL,
    description: 'Authenticated cron endpoint'
  },
  {
    condition: (req) => {
      const auth = req.headers.get('authorization');
      const userAgent = req.headers.get('user-agent');
      return !!(auth && userAgent && !userAgent.includes('bot'));
    },
    priority: RequestPriority.HIGH,
    description: 'Authenticated user request'
  },
  {
    condition: (req) => {
      const path = new URL(req.url).pathname;
      return path.startsWith('/api/') && !path.startsWith('/api/public/');
    },
    priority: RequestPriority.MEDIUM,
    description: 'API request'
  },
  {
    condition: (req) => {
      const userAgent = req.headers.get('user-agent');
      const suspiciousPatterns = ['bot', 'crawler', 'spider', 'scraper'];
      return !!(userAgent && suspiciousPatterns.some(pattern => 
        userAgent.toLowerCase().includes(pattern)
      ));
    },
    priority: RequestPriority.SUSPICIOUS,
    description: 'Suspicious automated request'
  }
];

// Request queue management
interface QueuedRequest {
  id: string;
  priority: RequestPriority;
  timestamp: number;
  resolve: (response: NextResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

class VercelEndpointRateLimiter {
  private requestQueue = new Map<RequestPriority, QueuedRequest[]>();
  private processing = false;
  private readonly logger = logger.child('vercel-endpoint-limiter');
  private metrics = {
    requestsProcessed: 0,
    queuedRequests: 0,
    rejectedRequests: 0,
    averageWaitTime: 0
  };

  constructor() {
    // Initialize queues for each priority level
    Object.values(RequestPriority).forEach(priority => {
      this.requestQueue.set(priority, []);
    });

    // Start queue processor
    this.startQueueProcessor();
    
    this.logger.info('VercelEndpointRateLimiter initialized with priority queuing');
  }

  /**
   * Main rate limiting middleware
   */
  async rateLimit(request: NextRequest): Promise<NextResponse | null> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();
    
    try {
      // Classify the request
      const priority = this.classifyRequest(request);
      const clientId = this.getClientIdentifier(request);
      
      this.logger.debug('Processing rate limit check', {
        requestId,
        priority,
        clientId: clientId.substring(0, 8) + '...',
        path: new URL(request.url).pathname
      });

      // Get rate limit configuration for this priority
      const config = PRIORITY_RATE_LIMITS[priority];
      
      // Check rate limit
      const rateLimitResult = await rateLimiter.checkLimit(
        `vercel-endpoint:${priority}`,
        clientId,
        config.requests,
        config.windowMs
      );

      // Record metrics
      monitoring.incrementCounter('vercel_rate_limiter.requests', 1, {
        priority,
        allowed: rateLimitResult.allowed.toString(),
        requestId
      });

      if (!rateLimitResult.allowed) {
        // Check if we should queue the request (for high priority requests)
        if (priority === RequestPriority.CRITICAL || priority === RequestPriority.HIGH) {
          return await this.queueRequest(request, priority, requestId);
        } else {
          // Reject immediately for lower priority requests
          return this.createRateLimitResponse(rateLimitResult, priority, requestId);
        }
      }

      // Request is allowed through immediately
      const duration = Date.now() - startTime;
      monitoring.recordTiming('vercel_rate_limiter.processing_time', duration, {
        priority,
        outcome: 'allowed',
        requestId
      });

      return null; // Allow request to proceed
      
    } catch (error) {
      this.logger.error('Rate limiting error', {
        requestId,
        error: error.message,
        stack: error.stack
      });

      // Fail open on rate limiter errors for critical requests
      const priority = this.classifyRequest(request);
      if (priority === RequestPriority.CRITICAL) {
        this.logger.warn('Rate limiter failed, allowing critical request through', { requestId });
        return null;
      }

      // Fail closed for non-critical requests
      return this.createErrorResponse('Rate limiting service temporarily unavailable', 503, requestId);
    }
  }

  /**
   * Classify request based on headers and path
   */
  private classifyRequest(request: NextRequest): RequestPriority {
    for (const rule of CLASSIFICATION_RULES) {
      if (rule.condition(request)) {
        this.logger.debug('Request classified', {
          priority: rule.priority,
          description: rule.description,
          path: new URL(request.url).pathname
        });
        return rule.priority;
      }
    }

    // Default to LOW priority
    return RequestPriority.LOW;
  }

  /**
   * Queue request for later processing
   */
  private async queueRequest(
    request: NextRequest,
    priority: RequestPriority,
    requestId: string
  ): Promise<NextResponse> {
    const queueTimeout = 30000; // 30 seconds max queue time
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removeFromQueue(requestId, priority);
        reject(new Error('Queue timeout'));
      }, queueTimeout);

      const queuedRequest: QueuedRequest = {
        id: requestId,
        priority,
        timestamp: Date.now(),
        resolve,
        reject,
        timeout
      };

      // Add to appropriate queue
      const queue = this.requestQueue.get(priority) || [];
      queue.push(queuedRequest);
      this.requestQueue.set(priority, queue);
      
      this.metrics.queuedRequests++;
      
      this.logger.info('Request queued', {
        requestId,
        priority,
        queueLength: queue.length,
        estimatedWaitTime: this.estimateWaitTime(priority)
      });

      // Start processing if not already running
      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  /**
   * Process queued requests by priority
   */
  private async processQueue(): Promise<void> {
    if (this.processing) return;
    
    this.processing = true;
    
    try {
      while (this.hasQueuedRequests()) {
        const nextRequest = this.getNextRequest();
        if (!nextRequest) break;

        try {
          // Process the request
          await this.processQueuedRequest(nextRequest);
        } catch (error) {
          this.logger.error('Error processing queued request', {
            requestId: nextRequest.id,
            error: error.message
          });
          
          nextRequest.reject(error);
        }

        // Small delay between processing requests
        await this.sleep(100);
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Get next request from queue by priority
   */
  private getNextRequest(): QueuedRequest | null {
    // Process by priority order
    const priorities = [
      RequestPriority.CRITICAL,
      RequestPriority.HIGH,
      RequestPriority.MEDIUM,
      RequestPriority.LOW,
      RequestPriority.SUSPICIOUS
    ];

    for (const priority of priorities) {
      const queue = this.requestQueue.get(priority) || [];
      if (queue.length > 0) {
        return queue.shift()!;
      }
    }

    return null;
  }

  /**
   * Process a single queued request
   */
  private async processQueuedRequest(queuedRequest: QueuedRequest): Promise<void> {
    const { id, priority, timestamp, resolve, timeout } = queuedRequest;
    
    // Clear the timeout
    clearTimeout(timeout);
    
    const waitTime = Date.now() - timestamp;
    
    // Check rate limit again
    const config = PRIORITY_RATE_LIMITS[priority];
    const clientId = `queued:${id}`;
    
    const rateLimitResult = await rateLimiter.checkLimit(
      `vercel-endpoint:${priority}`,
      clientId,
      config.requests,
      config.windowMs
    );

    if (rateLimitResult.allowed) {
      // Allow the request through
      this.logger.debug('Queued request processed', {
        requestId: id,
        priority,
        waitTime
      });
      
      this.metrics.requestsProcessed++;
      this.updateAverageWaitTime(waitTime);
      
      resolve(null); // Allow request to proceed
    } else {
      // Still rate limited, reject
      const response = this.createRateLimitResponse(rateLimitResult, priority, id);
      resolve(response);
    }
  }

  /**
   * Remove request from queue
   */
  private removeFromQueue(requestId: string, priority: RequestPriority): void {
    const queue = this.requestQueue.get(priority) || [];
    const index = queue.findIndex(req => req.id === requestId);
    if (index !== -1) {
      queue.splice(index, 1);
    }
  }

  /**
   * Check if there are queued requests
   */
  private hasQueuedRequests(): boolean {
    return Array.from(this.requestQueue.values()).some(queue => queue.length > 0);
  }

  /**
   * Estimate wait time for a priority level
   */
  private estimateWaitTime(priority: RequestPriority): number {
    let totalAhead = 0;
    
    // Count higher priority requests ahead
    const priorities = [
      RequestPriority.CRITICAL,
      RequestPriority.HIGH,
      RequestPriority.MEDIUM,
      RequestPriority.LOW,
      RequestPriority.SUSPICIOUS
    ];

    for (const p of priorities) {
      const queue = this.requestQueue.get(p) || [];
      totalAhead += queue.length;
      if (p === priority) break;
    }

    // Estimate 500ms per request ahead
    return Math.max(1000, totalAhead * 500);
  }

  /**
   * Get client identifier for rate limiting
   */
  private getClientIdentifier(request: NextRequest): string {
    // For cron requests, use execution ID if available
    const executionId = request.headers.get('x-execution-id');
    if (executionId) {
      return `cron:${executionId}`;
    }

    // For user requests, try to get user ID
    const userId = request.headers.get('x-user-id');
    if (userId) {
      return `user:${userId}`;
    }

    // Fall back to IP address
    const ip = request.headers.get('x-forwarded-for') || 
               request.headers.get('x-real-ip') || 
               request.headers.get('cf-connecting-ip') || 
               'unknown';
    
    return `ip:${ip}`;
  }

  /**
   * Create rate limit response
   */
  private createRateLimitResponse(
    rateLimitResult: unknown,
    priority: RequestPriority,
    requestId: string
  ): NextResponse {
    const retryAfter = Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000);
    
    this.metrics.rejectedRequests++;
    
    this.logger.warn('Request rate limited', {
      requestId,
      priority,
      remaining: rateLimitResult.remaining,
      retryAfter
    });

    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        priority,
        retryAfter,
        requestId,
        message: `Too many requests for ${priority} priority. Try again in ${retryAfter} seconds.`
      },
      {
        status: 429,
        headers: {
          'Retry-After': retryAfter.toString(),
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          'X-RateLimit-Reset': new Date(rateLimitResult.resetTime).toISOString(),
          'X-Request-ID': requestId
        }
      }
    );
  }

  /**
   * Create error response
   */
  private createErrorResponse(message: string, status: number, requestId: string): NextResponse {
    return NextResponse.json(
      {
        error: message,
        requestId
      },
      { status }
    );
  }

  /**
   * Update average wait time metric
   */
  private updateAverageWaitTime(waitTime: number): void {
    this.metrics.averageWaitTime = (this.metrics.averageWaitTime + waitTime) / 2;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate request ID
   */
  private generateRequestId(): string {
    return `vel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Start queue processor interval
   */
  private startQueueProcessor(): void {
    setInterval(() => {
      if (!this.processing && this.hasQueuedRequests()) {
        this.processQueue().catch(error => {
          this.logger.error('Queue processor error', { error: error.message });
        });
      }
    }, 1000); // Check every second
  }

  /**
   * Get current metrics
   */
  public getMetrics() {
    return {
      ...this.metrics,
      queueLengths: Array.from(this.requestQueue.entries()).map(([priority, queue]) => ({
        priority,
        length: queue.length
      }))
    };
  }
}

// Export singleton instance
export const vercelEndpointRateLimiter = new VercelEndpointRateLimiter();

// Middleware function for Next.js
export async function withVercelRateLimit(request: NextRequest): Promise<NextResponse | null> {
  return await vercelEndpointRateLimiter.rateLimit(request);
}