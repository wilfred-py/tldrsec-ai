import { logger } from '../../../lib/logging';
import { monitoring } from '@/lib/monitoring';

const rateLimitLogger = logger.child('rate-limiter');

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  tokensPerMinute: number;
  requestsPerMinute: number;
  dailyTokenLimit?: number;
  dailyRequestLimit?: number;
  maxQueueSize?: number; // Maximum number of queued requests
  logFrequencyMs?: number; // How often to log queue status (default: 30000ms)
  maxWaitTimeMs?: number; // Maximum wait time per iteration (default: 60000ms)
  requestDelayMs?: number; // Delay between processing requests (default: 100ms)
  staleJobThresholdMs?: number; // Threshold for stale job warnings (default: 300000ms = 5min)
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
  lastStatusUpdate?: Date;
  retryAttempts?: number;
  ticker?: string; // For better tracking in email summaries
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
/**
 * Internal configuration with defaults applied
 */
interface ResolvedRateLimitConfig {
  tokensPerMinute: number;
  requestsPerMinute: number;
  dailyTokenLimit: number | null;
  dailyRequestLimit: number | null;
  maxQueueSize: number;
  logFrequencyMs: number;
  maxWaitTimeMs: number;
  requestDelayMs: number;
  staleJobThresholdMs: number;
}

export class SmartRateLimiter {
  private config: ResolvedRateLimitConfig;
  private currentWindow: UsageWindow;
  private dailyUsage: { tokens: number; requests: number; date: string };
  private requestQueue: QueuedRequest[] = [];
  private isProcessingQueue = false;
  private backoffMultiplier = 1;
  private lastRateLimitTime: Date | null = null;
  private statusLoggerInterval: NodeJS.Timeout | null = null;
  private lastQueueStatusLog: Date | null = null;

  constructor(config: RateLimitConfig) {
    // Apply defaults for optional configuration
    this.config = {
      tokensPerMinute: config.tokensPerMinute,
      requestsPerMinute: config.requestsPerMinute,
      dailyTokenLimit: config.dailyTokenLimit || null,
      dailyRequestLimit: config.dailyRequestLimit || null,
      maxQueueSize: config.maxQueueSize || 1000, // Default max 1000 queued requests
      logFrequencyMs: config.logFrequencyMs || 30000, // Default 30 seconds
      maxWaitTimeMs: config.maxWaitTimeMs || 60000, // Default 1 minute max wait
      requestDelayMs: config.requestDelayMs || 100, // Default 100ms between requests
      staleJobThresholdMs: config.staleJobThresholdMs || 300000 // Default 5 minutes
    };
    
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
   * Log detailed queue status with job information
   */
  private logQueueStatus(reason: string = 'periodic'): void {
    if (this.requestQueue.length === 0) return;

    const now = new Date();
    const oldestRequest = this.requestQueue[0];
    const newestRequest = this.requestQueue[this.requestQueue.length - 1];
    const avgWaitTime = this.requestQueue.reduce((sum, req) => 
      sum + (now.getTime() - req.queuedAt.getTime()), 0) / this.requestQueue.length;

    const queueDetails = {
      reason,
      queueLength: this.requestQueue.length,
      isProcessing: this.isProcessingQueue,
      oldestJobAge: Math.round((now.getTime() - oldestRequest.queuedAt.getTime()) / 1000),
      newestJobAge: Math.round((now.getTime() - newestRequest.queuedAt.getTime()) / 1000),
      averageWaitTime: Math.round(avgWaitTime / 1000),
      backoffMultiplier: this.backoffMultiplier,
      lastRateLimitAgo: this.lastRateLimitTime ? 
        Math.round((now.getTime() - this.lastRateLimitTime.getTime()) / 1000) : null,
      currentUsage: {
        tokens: this.currentWindow.tokens,
        requests: this.currentWindow.requests,
        tokensRemaining: this.config.tokensPerMinute - this.currentWindow.tokens,
        requestsRemaining: this.config.requestsPerMinute - this.currentWindow.requests
      },
      queueJobs: this.requestQueue.slice(0, 5).map(req => ({
        id: req.id,
        ticker: req.ticker,
        tokens: req.tokens,
        priority: req.priority,
        waitingFor: Math.round((now.getTime() - req.queuedAt.getTime()) / 1000),
        retryAttempts: req.retryAttempts || 0
      }))
    };

    rateLimitLogger.info(`Queue status report`, queueDetails);
    this.lastQueueStatusLog = now;

    // Record current metrics
    monitoring.recordValue('rate_limiter.queue_length_current', this.requestQueue.length);
    monitoring.recordValue('rate_limiter.oldest_job_age_seconds', Math.round((now.getTime() - oldestRequest.queuedAt.getTime()) / 1000));
    monitoring.recordValue('rate_limiter.average_wait_time_seconds', Math.round(avgWaitTime / 1000));
    monitoring.recordValue('rate_limiter.tokens_used_current_window', this.currentWindow.tokens);
    monitoring.recordValue('rate_limiter.requests_used_current_window', this.currentWindow.requests);
    monitoring.recordValue('rate_limiter.backoff_multiplier', this.backoffMultiplier);

    // Log warnings for jobs that have been waiting too long
    const staleJobs = this.requestQueue.filter(req => 
      (now.getTime() - req.queuedAt.getTime()) > this.config.staleJobThresholdMs
    );
    
    if (staleJobs.length > 0) {
      const thresholdMinutes = Math.round(this.config.staleJobThresholdMs / 60000);
      rateLimitLogger.warn(`Found ${staleJobs.length} jobs waiting over ${thresholdMinutes} minutes`, {
        staleJobs: staleJobs.map(job => ({
          id: job.id,
          ticker: job.ticker,
          waitingFor: Math.round((now.getTime() - job.queuedAt.getTime()) / 1000)
        })),
        thresholdMs: this.config.staleJobThresholdMs
      });
    }
  }

  /**
   * Start periodic queue status logging
   */
  private startStatusLogger(): void {
    if (this.statusLoggerInterval) return;
    
    this.statusLoggerInterval = setInterval(() => {
      if (this.requestQueue.length > 0) {
        this.logQueueStatus('periodic');
      }
    }, this.config.logFrequencyMs);
  }

  /**
   * Stop periodic queue status logging
   */
  private stopStatusLogger(): void {
    if (this.statusLoggerInterval) {
      clearInterval(this.statusLoggerInterval);
      this.statusLoggerInterval = null;
    }
  }

  /**
   * Calculate estimated time until next processing attempt
   */
  private getEstimatedProcessingTime(): number {
    if (this.requestQueue.length === 0) return 0;
    
    const rateLimitError = this.checkRateLimits(this.requestQueue[0].tokens);
    if (!rateLimitError) return 0;
    
    if (rateLimitError.type === 'DAILY_LIMIT') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);
      return tomorrow.getTime() - Date.now();
    }
    
    return this.calculateBackoffDelay();
  }

  /**
   * Execute a request with rate limiting and queuing
   */
  async executeRequest<T>(
    request: () => Promise<T>,
    tokens: number,
    priority: number = 5,
    ticker?: string
  ): Promise<T> {
    const rateLimitError = this.checkRateLimits(tokens);
    
    if (rateLimitError) {
      const estimatedWaitTime = this.getEstimatedProcessingTime();
      
      rateLimitLogger.warn(`Rate limit detected, queueing request`, {
        ticker,
        errorType: rateLimitError.type,
        retryAfter: rateLimitError.retryAfter,
        resetTime: rateLimitError.resetTime,
        queueLength: this.requestQueue.length,
        estimatedWaitTimeMs: estimatedWaitTime,
        estimatedWaitTimeMinutes: Math.round(estimatedWaitTime / 60000),
        currentUsage: {
          tokens: this.currentWindow.tokens,
          requests: this.currentWindow.requests,
          tokensRemaining: this.config.tokensPerMinute - this.currentWindow.tokens,
          requestsRemaining: this.config.requestsPerMinute - this.currentWindow.requests
        }
      });

      // Track rate limit metrics
      monitoring.incrementCounter('rate_limiter.requests_queued', 1, {
        errorType: rateLimitError.type,
        ticker: ticker || 'unknown'
      });
      monitoring.recordValue('rate_limiter.queue_length', this.requestQueue.length + 1);
      monitoring.recordValue('rate_limiter.estimated_wait_time_ms', estimatedWaitTime);

      // Check queue size limit before adding
      if (this.requestQueue.length >= this.config.maxQueueSize) {
        rateLimitLogger.error('Queue size limit reached, rejecting request', {
          currentQueueSize: this.requestQueue.length,
          maxQueueSize: this.config.maxQueueSize,
          ticker
        });
        throw new Error(`Rate limiter queue is full (${this.config.maxQueueSize} requests). Try again later.`);
      }

      // Queue the request if rate limited
      return new Promise<T>((resolve, reject) => {
        const queuedRequest: QueuedRequest = {
          id: Math.random().toString(36).slice(2, 11),
          tokens,
          priority,
          queuedAt: new Date(),
          ticker,
          retryAttempts: 0,
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

        // Start status logging if this is the first queued item
        if (this.requestQueue.length === 1) {
          this.startStatusLogger();
          this.logQueueStatus('initial_queue');
        }

        this.processQueue();
      });
    }

    // Execute immediately if within limits
    try {
      const timerName = monitoring.startTimer('rate_limiter.request_processing');
      const result = await request();
      const duration = monitoring.stopTimer(timerName, { ticker: ticker || 'unknown' });
      
      this.updateUsage(tokens);
      
      // Track successful request metrics
      monitoring.incrementCounter('rate_limiter.requests_processed', 1, {
        ticker: ticker || 'unknown',
        processedImmediately: 'true'
      });
      if (duration) {
        monitoring.recordValue('rate_limiter.processing_duration_ms', duration);
      }
      
      return result;
    } catch (error: any) {
      // Handle rate limit errors from API
      if (this.isRateLimitError(error)) {
        this.increaseBackoff();
        
        rateLimitLogger.warn(`API rate limit hit, backing off`, {
          backoffMultiplier: this.backoffMultiplier,
          error: error.message
        });

        // Check queue size limit before retrying
        if (this.requestQueue.length >= this.config.maxQueueSize) {
          rateLimitLogger.error('Queue size limit reached during retry, rejecting request', {
            currentQueueSize: this.requestQueue.length,
            maxQueueSize: this.config.maxQueueSize,
            ticker
          });
          throw new Error(`Rate limiter queue is full (${this.config.maxQueueSize} requests). Cannot retry.`);
        }

        // Queue for retry
        return new Promise<T>((resolve, reject) => {
          const queuedRequest: QueuedRequest = {
            id: Math.random().toString(36).slice(2, 11),
            tokens,
            priority,
            queuedAt: new Date(),
            ticker,
            retryAttempts: 1,
            resolve,
            reject,
            request: request as () => Promise<any>
          };

          this.requestQueue.unshift(queuedRequest); // Add to front for retry
          
          // Start status logging if this is the first queued item
          if (this.requestQueue.length === 1) {
            this.startStatusLogger();
            this.logQueueStatus('retry_queue');
          }
          
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
    rateLimitLogger.info(`Starting queue processing`, {
      queueLength: this.requestQueue.length,
      backoffMultiplier: this.backoffMultiplier
    });

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
          
          rateLimitLogger.warn(`Daily limit reached, waiting until tomorrow`, {
            waitTimeHours: Math.ceil(waitTime / (1000 * 60 * 60)),
            queueLength: this.requestQueue.length,
            nextJob: {
              id: request.id,
              ticker: request.ticker,
              tokens: request.tokens,
              priority: request.priority,
              waitingFor: Math.round((Date.now() - request.queuedAt.getTime()) / 1000)
            }
          });
        } else {
          // Use exponential backoff for rate limits
          waitTime = this.calculateBackoffDelay();
          
          rateLimitLogger.info(`Rate limited, waiting before retry`, {
            waitTimeMs: waitTime,
            waitTimeSeconds: Math.round(waitTime / 1000),
            backoffMultiplier: this.backoffMultiplier,
            queueLength: this.requestQueue.length,
            nextJob: {
              id: request.id,
              ticker: request.ticker,
              tokens: request.tokens,
              priority: request.priority,
              waitingFor: Math.round((Date.now() - request.queuedAt.getTime()) / 1000),
              retryAttempts: request.retryAttempts || 0
            },
            rateLimitType: rateLimitError.type,
            retryAfter: rateLimitError.retryAfter
          });
        }

        // Wait and continue processing
        await new Promise(resolve => setTimeout(resolve, Math.min(waitTime, this.config.maxWaitTimeMs)));
        continue;
      }

      // Remove request from queue and execute
      this.requestQueue.shift();
      
      rateLimitLogger.info(`Processing queued request`, {
        requestId: request.id,
        ticker: request.ticker,
        tokens: request.tokens,
        priority: request.priority,
        totalWaitTime: Math.round((Date.now() - request.queuedAt.getTime()) / 1000),
        retryAttempts: request.retryAttempts || 0,
        remainingQueue: this.requestQueue.length
      });
      
      try {
        const startTime = Date.now();
        const result = await request.request();
        const processingTime = Date.now() - startTime;
        const totalWaitTime = Date.now() - request.queuedAt.getTime();
        
        this.updateUsage(request.tokens);
        request.resolve(result);
        
        rateLimitLogger.info(`Queued request completed successfully`, {
          requestId: request.id,
          ticker: request.ticker,
          totalWaitTime: Math.round(totalWaitTime / 1000),
          processingTime: Math.round(processingTime / 1000),
          retryAttempts: request.retryAttempts || 0,
          remainingQueue: this.requestQueue.length,
          currentUsage: {
            tokens: this.currentWindow.tokens,
            requests: this.currentWindow.requests
          }
        });

        // Track queued request completion metrics
        monitoring.incrementCounter('rate_limiter.requests_processed', 1, {
          ticker: request.ticker || 'unknown',
          processedImmediately: 'false',
          retryAttempts: (request.retryAttempts || 0).toString()
        });
        monitoring.recordValue('rate_limiter.processing_duration_ms', processingTime);
        monitoring.recordValue('rate_limiter.total_wait_time_ms', totalWaitTime);
        monitoring.recordValue('rate_limiter.queue_length', this.requestQueue.length);
      } catch (error) {
        if (this.isRateLimitError(error)) {
          // Put request back at front of queue for retry
          request.retryAttempts = (request.retryAttempts || 0) + 1;
          this.requestQueue.unshift(request);
          this.increaseBackoff();
          
          rateLimitLogger.warn(`Queued request hit rate limit, requeueing`, {
            requestId: request.id,
            ticker: request.ticker,
            retryAttempts: request.retryAttempts,
            totalWaitTime: Math.round((Date.now() - request.queuedAt.getTime()) / 1000),
            backoffMultiplier: this.backoffMultiplier,
            error: (error as Error).message
          });
        } else {
          request.reject(error);
          
          rateLimitLogger.error(`Queued request failed with non-rate-limit error`, {
            requestId: request.id,
            ticker: request.ticker,
            retryAttempts: request.retryAttempts || 0,
            totalWaitTime: Math.round((Date.now() - request.queuedAt.getTime()) / 1000),
            error: (error as Error).message,
            errorStack: (error as Error).stack
          });

          // Track failed request metrics
          monitoring.incrementCounter('rate_limiter.requests_failed', 1, {
            ticker: request.ticker || 'unknown',
            errorType: 'non_rate_limit',
            retryAttempts: (request.retryAttempts || 0).toString()
          });
        }
      }

      // Configurable delay between requests to avoid overwhelming
      await new Promise(resolve => setTimeout(resolve, this.config.requestDelayMs));
    }

    this.isProcessingQueue = false;
    
    // Stop status logging if queue is empty
    if (this.requestQueue.length === 0) {
      this.stopStatusLogger();
      rateLimitLogger.info(`Queue processing completed, all requests processed`);
    } else {
      rateLimitLogger.info(`Queue processing paused`, {
        remainingQueue: this.requestQueue.length,
        backoffMultiplier: this.backoffMultiplier
      });
    }
  }

  /**
   * Get current configuration settings
   */
  getConfiguration(): ResolvedRateLimitConfig {
    return { ...this.config };
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