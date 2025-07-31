import { logger } from '../../../lib/logging';

const rateLimitLogger = logger.child('rate-limiter');

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  tokensPerMinute: number;
  requestsPerMinute: number;
  dailyTokenLimit?: number;
  dailyRequestLimit?: number;
}

/**
 * Rate limit error types
 */
export type RateLimitErrorType = 'RATE_LIMIT' | 'DAILY_LIMIT' | 'QUOTA_EXCEEDED';

export interface RateLimitError extends Error {
  type: RateLimitErrorType;
  retryAfter?: number; // seconds
  resetTime?: Date;
}

/**
 * Request queue item
 */
interface QueuedRequest {
  id: string;
  tokens: number;
  priority: number;
  queuedAt: Date;
  resolve: (value: any) => void;
  reject: (error: any) => void;
  request: () => Promise<any>;
}

/**
 * Usage tracking
 */
interface UsageWindow {
  tokens: number;
  requests: number;
  windowStart: Date;
}

/**
 * Smart rate limiter with exponential backoff and request queuing
 */
export class SmartRateLimiter {
  private config: RateLimitConfig;
  private currentWindow: UsageWindow;
  private dailyUsage: { tokens: number; requests: number; date: string };
  private requestQueue: QueuedRequest[] = [];
  private isProcessingQueue = false;
  private backoffMultiplier = 1;
  private lastRateLimitTime: Date | null = null;

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.currentWindow = this.createNewWindow();
    this.dailyUsage = {
      tokens: 0,
      requests: 0,
      date: new Date().toISOString().split('T')[0]
    };
  }

  private createNewWindow(): UsageWindow {
    return {
      tokens: 0,
      requests: 0,
      windowStart: new Date()
    };
  }

  private isWindowExpired(): boolean {
    const now = new Date();
    const windowAge = now.getTime() - this.currentWindow.windowStart.getTime();
    return windowAge >= 60000; // 1 minute
  }

  private resetWindowIfNeeded(): void {
    if (this.isWindowExpired()) {
      this.currentWindow = this.createNewWindow();
    }
  }

  private resetDailyUsageIfNeeded(): void {
    const today = new Date().toISOString().split('T')[0];
    if (this.dailyUsage.date !== today) {
      this.dailyUsage = { tokens: 0, requests: 0, date: today };
    }
  }

  private checkRateLimits(tokens: number): RateLimitError | null {
    this.resetWindowIfNeeded();
    this.resetDailyUsageIfNeeded();

    // Check per-minute limits
    if (this.currentWindow.tokens + tokens > this.config.tokensPerMinute) {
      const error = new Error(`Token rate limit exceeded: ${this.currentWindow.tokens + tokens}/${this.config.tokensPerMinute} per minute`) as RateLimitError;
      error.type = 'RATE_LIMIT';
      error.retryAfter = 60 - Math.floor((Date.now() - this.currentWindow.windowStart.getTime()) / 1000);
      return error;
    }

    if (this.currentWindow.requests + 1 > this.config.requestsPerMinute) {
      const error = new Error(`Request rate limit exceeded: ${this.currentWindow.requests + 1}/${this.config.requestsPerMinute} per minute`) as RateLimitError;
      error.type = 'RATE_LIMIT';
      error.retryAfter = 60 - Math.floor((Date.now() - this.currentWindow.windowStart.getTime()) / 1000);
      return error;
    }

    // Check daily limits
    if (this.config.dailyTokenLimit && this.dailyUsage.tokens + tokens > this.config.dailyTokenLimit) {
      const error = new Error(`Daily token limit exceeded: ${this.dailyUsage.tokens + tokens}/${this.config.dailyTokenLimit}`) as RateLimitError;
      error.type = 'DAILY_LIMIT';
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      error.resetTime = tomorrow;
      return error;
    }

    if (this.config.dailyRequestLimit && this.dailyUsage.requests + 1 > this.config.dailyRequestLimit) {
      const error = new Error(`Daily request limit exceeded: ${this.dailyUsage.requests + 1}/${this.config.dailyRequestLimit}`) as RateLimitError;
      error.type = 'DAILY_LIMIT';
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      error.resetTime = tomorrow;
      return error;
    }

    return null;
  }

  private updateUsage(tokens: number): void {
    this.resetWindowIfNeeded();
    this.resetDailyUsageIfNeeded();

    this.currentWindow.tokens += tokens;
    this.currentWindow.requests += 1;
    this.dailyUsage.tokens += tokens;
    this.dailyUsage.requests += 1;

    // Reset backoff multiplier on successful request
    this.backoffMultiplier = 1;
    this.lastRateLimitTime = null;
  }

  private calculateBackoffDelay(): number {
    const baseDelay = 1000; // 1 second
    const maxDelay = 300000; // 5 minutes
    const delay = Math.min(baseDelay * Math.pow(2, this.backoffMultiplier), maxDelay);
    
    // Add jitter to prevent thundering herd
    const jitter = Math.random() * 0.1 * delay;
    return delay + jitter;
  }

  private increaseBackoff(): void {
    this.backoffMultiplier = Math.min(this.backoffMultiplier + 1, 8); // Max 2^8 = 256x multiplier
    this.lastRateLimitTime = new Date();
  }

  /**
   * Execute a request with rate limiting and queuing
   */
  async executeRequest<T>(
    request: () => Promise<T>,
    tokens: number,
    priority: number = 5
  ): Promise<T> {
    const rateLimitError = this.checkRateLimits(tokens);
    
    if (rateLimitError) {
      rateLimitLogger.warn(`Rate limit detected, queueing request`, {
        errorType: rateLimitError.type,
        retryAfter: rateLimitError.retryAfter,
        resetTime: rateLimitError.resetTime,
        queueLength: this.requestQueue.length
      });

      // Queue the request if rate limited
      return new Promise<T>((resolve, reject) => {
        const queuedRequest: QueuedRequest = {
          id: Math.random().toString(36).substr(2, 9),
          tokens,
          priority,
          queuedAt: new Date(),
          resolve,
          reject,
          request: request as () => Promise<any>
        };

        // Insert by priority (lower numbers = higher priority)
        const insertIndex = this.requestQueue.findIndex(item => item.priority > priority);
        if (insertIndex === -1) {
          this.requestQueue.push(queuedRequest);
        } else {
          this.requestQueue.splice(insertIndex, 0, queuedRequest);
        }

        this.processQueue();
      });
    }

    // Execute immediately if within limits
    try {
      const result = await request();
      this.updateUsage(tokens);
      return result;
    } catch (error: any) {
      // Handle rate limit errors from API
      if (this.isRateLimitError(error)) {
        this.increaseBackoff();
        
        rateLimitLogger.warn(`API rate limit hit, backing off`, {
          backoffMultiplier: this.backoffMultiplier,
          error: error.message
        });

        // Queue for retry
        return new Promise<T>((resolve, reject) => {
          const queuedRequest: QueuedRequest = {
            id: Math.random().toString(36).substr(2, 9),
            tokens,
            priority,
            queuedAt: new Date(),
            resolve,
            reject,
            request: request as () => Promise<any>
          };

          this.requestQueue.unshift(queuedRequest); // Add to front for retry
          this.processQueue();
        });
      }
      
      throw error;
    }
  }

  private isRateLimitError(error: any): boolean {
    if (!error) return false;
    
    const errorMessage = error.message?.toLowerCase() || '';
    const errorStatus = error.status || error.statusCode;
    
    return (
      errorStatus === 429 ||
      errorStatus === 400 && errorMessage.includes('usage limit') ||
      errorMessage.includes('rate limit') ||
      errorMessage.includes('too many requests') ||
      errorMessage.includes('quota exceeded')
    );
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue[0];
      
      // Check if we can process this request
      const rateLimitError = this.checkRateLimits(request.tokens);
      
      if (rateLimitError) {
        // Wait based on rate limit type
        let waitTime: number;
        
        if (rateLimitError.type === 'DAILY_LIMIT') {
          // Wait until tomorrow for daily limits
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(0, 0, 0, 0);
          waitTime = tomorrow.getTime() - Date.now();
          
          rateLimitLogger.info(`Daily limit reached, waiting until tomorrow`, {
            waitTimeHours: Math.ceil(waitTime / (1000 * 60 * 60)),
            queueLength: this.requestQueue.length
          });
        } else {
          // Use exponential backoff for rate limits
          waitTime = this.calculateBackoffDelay();
          
          rateLimitLogger.debug(`Rate limited, waiting before retry`, {
            waitTimeMs: waitTime,
            backoffMultiplier: this.backoffMultiplier,
            queueLength: this.requestQueue.length
          });
        }

        // Wait and continue processing
        await new Promise(resolve => setTimeout(resolve, Math.min(waitTime, 60000))); // Max 1 minute wait per iteration
        continue;
      }

      // Remove request from queue and execute
      this.requestQueue.shift();
      
      try {
        const result = await request.request();
        this.updateUsage(request.tokens);
        request.resolve(result);
        
        rateLimitLogger.debug(`Queued request completed successfully`, {
          requestId: request.id,
          queueLength: this.requestQueue.length,
          waitTime: Date.now() - request.queuedAt.getTime()
        });
      } catch (error) {
        if (this.isRateLimitError(error)) {
          // Put request back at front of queue for retry
          this.requestQueue.unshift(request);
          this.increaseBackoff();
          
          rateLimitLogger.warn(`Queued request hit rate limit, requeueing`, {
            requestId: request.id,
            error: (error as Error).message
          });
        } else {
          request.reject(error);
          
          rateLimitLogger.error(`Queued request failed with non-rate-limit error`, {
            requestId: request.id,
            error: (error as Error).message
          });
        }
      }

      // Small delay between requests to avoid overwhelming
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.isProcessingQueue = false;
  }

  /**
   * Get current usage statistics
   */
  getUsageStats() {
    this.resetWindowIfNeeded();
    this.resetDailyUsageIfNeeded();

    return {
      currentWindow: {
        tokens: this.currentWindow.tokens,
        requests: this.currentWindow.requests,
        tokensRemaining: this.config.tokensPerMinute - this.currentWindow.tokens,
        requestsRemaining: this.config.requestsPerMinute - this.currentWindow.requests,
        windowStart: this.currentWindow.windowStart
      },
      daily: {
        tokens: this.dailyUsage.tokens,
        requests: this.dailyUsage.requests,
        tokensRemaining: this.config.dailyTokenLimit ? this.config.dailyTokenLimit - this.dailyUsage.tokens : null,
        requestsRemaining: this.config.dailyRequestLimit ? this.config.dailyRequestLimit - this.dailyUsage.requests : null,
        date: this.dailyUsage.date
      },
      queue: {
        length: this.requestQueue.length,
        isProcessing: this.isProcessingQueue,
        oldestRequest: this.requestQueue.length > 0 ? this.requestQueue[0].queuedAt : null
      },
      backoff: {
        multiplier: this.backoffMultiplier,
        lastRateLimitTime: this.lastRateLimitTime
      }
    };
  }

  /**
   * Clear the request queue (use with caution)
   */
  clearQueue(): void {
    const queuedCount = this.requestQueue.length;
    this.requestQueue.forEach(request => {
      request.reject(new Error('Request queue cleared'));
    });
    this.requestQueue = [];
    
    rateLimitLogger.info(`Cleared ${queuedCount} queued requests`);
  }
}

/**
 * Default rate limiter instance for Claude API
 * Based on Claude's current limits: 80k tokens/minute for most tiers
 */
export const defaultRateLimiter = new SmartRateLimiter({
  tokensPerMinute: 75000, // Slightly below limit for safety
  requestsPerMinute: 50,   // Conservative request limit
  dailyTokenLimit: 1000000, // 1M tokens per day (adjust based on your plan)
  dailyRequestLimit: 5000   // 5k requests per day
});

/**
 * Conservative rate limiter for high-usage scenarios
 */
export const conservativeRateLimiter = new SmartRateLimiter({
  tokensPerMinute: 40000,   // More conservative token limit
  requestsPerMinute: 25,    // Lower request rate
  dailyTokenLimit: 500000,  // 500k tokens per day
  dailyRequestLimit: 2500   // 2.5k requests per day
});