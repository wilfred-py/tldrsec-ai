/**
 * Enhanced Cloudflare Worker Rate Limiting Mitigation
 * 
 * Implements sophisticated rate limiting strategies to eliminate 429 errors
 * when Cloudflare Workers call Vercel endpoints.
 * 
 * Features:
 * - Exponential backoff with jitter
 * - Circuit breaker patterns  
 * - Intelligent retry strategies
 * - Rate limit detection and adaptation
 * - Comprehensive monitoring and alerting
 */

import { logger } from '../../logging';
import { monitoring } from '../../monitoring';

// Rate limiting configuration for different scenarios
export interface RateLimitConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterPercentage: number;
  circuitBreakerThreshold: number;
  circuitBreakerTimeoutMs: number;
  requestTimeoutMs: number;
}

// Default configurations for different service types
export const RATE_LIMIT_CONFIGS = {
  CLOUDFLARE_WORKER: {
    maxRetries: 5,
    baseDelayMs: 1000, // 1 second
    maxDelayMs: 60000, // 60 seconds
    jitterPercentage: 20,
    circuitBreakerThreshold: 3,
    circuitBreakerTimeoutMs: 300000, // 5 minutes
    requestTimeoutMs: 540000 // 9 minutes (within Cloudflare Worker limits)
  } as RateLimitConfig,
  
  VERCEL_ENDPOINT: {
    maxRetries: 3,
    baseDelayMs: 500,
    maxDelayMs: 30000,
    jitterPercentage: 15,
    circuitBreakerThreshold: 5,
    circuitBreakerTimeoutMs: 180000, // 3 minutes
    requestTimeoutMs: 300000 // 5 minutes
  } as RateLimitConfig,
  
  EXTERNAL_API: {
    maxRetries: 4,
    baseDelayMs: 2000,
    maxDelayMs: 120000,
    jitterPercentage: 25,
    circuitBreakerThreshold: 3,
    circuitBreakerTimeoutMs: 600000, // 10 minutes
    requestTimeoutMs: 30000 // 30 seconds
  } as RateLimitConfig
};

// Circuit breaker state management
interface CircuitBreakerState {
  isOpen: boolean;
  failureCount: number;
  lastFailureTime: number;
  nextAttemptTime: number;
  successfulRequests: number;
}

// Rate limit detection patterns
const RATE_LIMIT_INDICATORS = {
  STATUS_CODES: [429, 503, 502, 524],
  ERROR_MESSAGES: [
    'rate limit',
    'too many requests', 
    'quota exceeded',
    'throttled',
    'service unavailable',
    'gateway timeout'
  ],
  HEADER_INDICATORS: ['retry-after', 'x-ratelimit-remaining', 'x-ratelimit-reset']
};

// Enhanced rate limiting class
export class CloudflareWorkerRateLimiter {
  private circuitBreakers = new Map<string, CircuitBreakerState>();
  private rateLimitMetrics = new Map<string, { count: number; resetTime: number }>();
  private requestQueue = new Map<string, Array<{ 
    resolve: (value: unknown) => void; 
    reject: (reason?: unknown) => void; 
    timestamp: number 
  }>>();
  private readonly logger = logger.child('cloudflare-rate-limiter');

  constructor() {
    this.logger.info('CloudflareWorkerRateLimiter initialized with enhanced patterns');
    
    // Cleanup old entries every 5 minutes
    setInterval(() => this.cleanup(), 300000);
  }

  /**
   * Execute a request with comprehensive rate limiting protection
   */
  async executeWithRateLimit<T>(
    requestFn: () => Promise<T>,
    serviceKey: string,
    config: RateLimitConfig = RATE_LIMIT_CONFIGS.CLOUDFLARE_WORKER,
    context: Record<string, unknown> = {}
  ): Promise<T> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();
    
    this.logger.debug(`Starting rate-limited request`, {
      serviceKey,
      requestId,
      config,
      context
    });

    // Check circuit breaker state
    const circuitBreakerKey = `${serviceKey}:circuit`;
    if (this.isCircuitBreakerOpen(circuitBreakerKey)) {
      const error = new RateLimitError(
        'Circuit breaker is open',
        'CIRCUIT_BREAKER_OPEN',
        { serviceKey, circuitBreakerKey }
      );
      
      this.logger.warn(`Circuit breaker open for ${serviceKey}`, {
        requestId,
        serviceKey,
        circuitBreakerState: this.circuitBreakers.get(circuitBreakerKey)
      });
      
      throw error;
    }

    // Execute with retry logic
    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt <= config.maxRetries) {
      try {
        // Add request to queue if needed (for rate limiting)
        await this.queueRequest(serviceKey, config);
        
        // Execute the request with timeout
        const result = await this.executeWithTimeout(requestFn, config.requestTimeoutMs, requestId);
        
        // Record successful request
        this.recordSuccess(circuitBreakerKey, serviceKey, startTime, attempt, requestId);
        
        return result;

      } catch (error) {
        lastError = error;
        attempt++;
        
        // Analyze the error to determine if it's rate limit related
        const isRateLimitError = this.isRateLimitRelatedError(error);
        const shouldRetry = this.shouldRetryError(error, attempt, config.maxRetries);
        
        this.logger.warn(`Request attempt ${attempt} failed`, {
          requestId,
          serviceKey,
          attempt,
          error: error.message,
          isRateLimitError,
          shouldRetry,
          remainingRetries: config.maxRetries - attempt
        });

        // Record failure
        this.recordFailure(circuitBreakerKey, serviceKey, error, attempt, requestId);
        
        // If this is the last attempt or non-retriable error, break
        if (!shouldRetry || attempt > config.maxRetries) {
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateBackoffDelay(
          attempt,
          config.baseDelayMs,
          config.maxDelayMs,
          config.jitterPercentage,
          error
        );

        this.logger.info(`Backing off for ${delay}ms before retry ${attempt + 1}`, {
          requestId,
          serviceKey,
          attempt,
          delay,
          isRateLimitError
        });

        // Wait before retry
        await this.sleep(delay);
      }
    }

    // All retries exhausted
    const totalDuration = Date.now() - startTime;
    
    this.logger.error(`Rate-limited request failed after ${attempt} attempts in ${totalDuration}ms`, {
      requestId,
      serviceKey,
      totalAttempts: attempt,
      totalDuration,
      finalError: lastError?.message
    });

    // Record final failure
    monitoring.incrementCounter('rate_limiter.request.failed', 1, {
      serviceKey,
      totalAttempts: attempt.toString(),
      requestId
    });

    throw lastError || new Error('Request failed after all retries');
  }

  /**
   * Queue management for rate limiting
   */
  private async queueRequest(serviceKey: string, config: RateLimitConfig): Promise<void> {
    const queueKey = `${serviceKey}:queue`;
    const now = Date.now();
    
    // Clean up old queue entries
    const queue = this.requestQueue.get(queueKey) || [];
    const validQueue = queue.filter(item => (now - item.timestamp) < config.requestTimeoutMs);
    
    // If queue is too long, implement throttling
    if (validQueue.length > 10) {
      this.logger.warn(`Request queue for ${serviceKey} is full, throttling`, {
        queueLength: validQueue.length,
        serviceKey
      });
      
      // Wait for queue to drain
      await this.sleep(Math.min(5000, config.baseDelayMs * 2));
    }
    
    // Add to queue
    validQueue.push({
      resolve: () => {},
      reject: () => {},
      timestamp: now
    });
    
    this.requestQueue.set(queueKey, validQueue);
  }

  /**
   * Execute request with timeout protection
   */
  private async executeWithTimeout<T>(
    requestFn: () => Promise<T>,
    timeoutMs: number,
    requestId: string
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new RateLimitError(
          `Request timeout after ${timeoutMs}ms`,
          'REQUEST_TIMEOUT',
          { timeoutMs, requestId }
        ));
      }, timeoutMs);

      requestFn()
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Check if circuit breaker is open
   */
  private isCircuitBreakerOpen(circuitBreakerKey: string): boolean {
    const state = this.circuitBreakers.get(circuitBreakerKey);
    if (!state) return false;

    const now = Date.now();
    
    // Check if circuit breaker timeout has passed
    if (state.isOpen && now >= state.nextAttemptTime) {
      // Reset circuit breaker to half-open state
      state.isOpen = false;
      state.failureCount = 0;
      this.logger.info(`Circuit breaker reset to half-open`, { circuitBreakerKey });
    }

    return state.isOpen;
  }

  /**
   * Determine if error is rate limit related
   */
  private isRateLimitRelatedError(error: unknown): boolean {
    if (!error) return false;

    // Check status code
    if (error.status && RATE_LIMIT_INDICATORS.STATUS_CODES.includes(error.status)) {
      return true;
    }

    // Check error message
    const message = (error.message || '').toLowerCase();
    return RATE_LIMIT_INDICATORS.ERROR_MESSAGES.some(indicator => 
      message.includes(indicator)
    );
  }

  /**
   * Determine if error should trigger a retry
   */
  private shouldRetryError(error: unknown, attempt: number, maxRetries: number): boolean {
    if (attempt >= maxRetries) return false;

    // Always retry rate limit errors
    if (this.isRateLimitRelatedError(error)) return true;

    // Retry on network errors
    if (error.name === 'NetworkError' || error.name === 'TimeoutError') return true;

    // Retry on 5xx server errors
    if (error.status && error.status >= 500) return true;

    // Don't retry on 4xx client errors (except 429)
    if (error.status && error.status >= 400 && error.status < 500 && error.status !== 429) {
      return false;
    }

    return true;
  }

  /**
   * Calculate backoff delay with jitter
   */
  private calculateBackoffDelay(
    attempt: number,
    baseDelayMs: number,
    maxDelayMs: number,
    jitterPercentage: number,
    error?: unknown
  ): number {
    // Extract retry-after header if available
    let retryAfter = 0;
    if (error?.headers?.['retry-after']) {
      retryAfter = parseInt(error.headers['retry-after']) * 1000;
    }

    // Calculate exponential backoff
    const exponentialDelay = Math.min(
      baseDelayMs * Math.pow(2, attempt - 1),
      maxDelayMs
    );

    // Use retry-after if it's longer than exponential backoff
    const baseDelay = Math.max(exponentialDelay, retryAfter);

    // Add jitter to prevent thundering herd
    const jitter = baseDelay * (jitterPercentage / 100) * (Math.random() - 0.5) * 2;
    const finalDelay = Math.max(100, baseDelay + jitter); // Minimum 100ms

    return Math.min(finalDelay, maxDelayMs);
  }

  /**
   * Record successful request
   */
  private recordSuccess(
    circuitBreakerKey: string,
    serviceKey: string,
    startTime: number,
    attempts: number,
    requestId: string
  ): void {
    const duration = Date.now() - startTime;
    
    // Update circuit breaker state
    const state = this.circuitBreakers.get(circuitBreakerKey);
    if (state) {
      state.successfulRequests++;
      // Reset failure count on successful request
      if (state.failureCount > 0) {
        state.failureCount = Math.max(0, state.failureCount - 1);
      }
    }

    // Record metrics
    monitoring.recordTiming('rate_limiter.request.duration', duration, {
      serviceKey,
      success: 'true',
      attempts: attempts.toString(),
      requestId
    });

    this.logger.debug(`Request succeeded`, {
      requestId,
      serviceKey,
      duration,
      attempts
    });
  }

  /**
   * Record failed request and update circuit breaker
   */
  private recordFailure(
    circuitBreakerKey: string,
    serviceKey: string,
    error: unknown,
    attempt: number,
    requestId: string
  ): void {
    const now = Date.now();
    
    // Get or create circuit breaker state
    let state = this.circuitBreakers.get(circuitBreakerKey);
    if (!state) {
      state = {
        isOpen: false,
        failureCount: 0,
        lastFailureTime: 0,
        nextAttemptTime: 0,
        successfulRequests: 0
      };
      this.circuitBreakers.set(circuitBreakerKey, state);
    }

    // Update failure count
    state.failureCount++;
    state.lastFailureTime = now;

    // Check if circuit breaker should open
    const config = RATE_LIMIT_CONFIGS.CLOUDFLARE_WORKER;
    if (state.failureCount >= config.circuitBreakerThreshold) {
      state.isOpen = true;
      state.nextAttemptTime = now + config.circuitBreakerTimeoutMs;
      
      this.logger.error(`Circuit breaker opened for ${serviceKey}`, {
        circuitBreakerKey,
        failureCount: state.failureCount,
        nextAttemptTime: new Date(state.nextAttemptTime).toISOString(),
        requestId
      });

      // Alert on circuit breaker opening
      monitoring.incrementCounter('rate_limiter.circuit_breaker.opened', 1, {
        serviceKey,
        circuitBreakerKey
      });
    }

    // Record failure metrics
    monitoring.incrementCounter('rate_limiter.request.failure', 1, {
      serviceKey,
      attempt: attempt.toString(),
      errorType: this.isRateLimitRelatedError(error) ? 'rate_limit' : 'other',
      requestId
    });
  }

  /**
   * Cleanup old entries
   */
  private cleanup(): void {
    const now = Date.now();
    const oldestAllowed = now - 3600000; // 1 hour

    // Cleanup circuit breakers
    for (const [key, state] of this.circuitBreakers.entries()) {
      if (state.lastFailureTime < oldestAllowed && !state.isOpen) {
        this.circuitBreakers.delete(key);
      }
    }

    // Cleanup request queues
    for (const [key, queue] of this.requestQueue.entries()) {
      const validQueue = queue.filter(item => (now - item.timestamp) < 600000); // 10 minutes
      if (validQueue.length === 0) {
        this.requestQueue.delete(key);
      } else {
        this.requestQueue.set(key, validQueue);
      }
    }

    this.logger.debug('Rate limiter cleanup completed', {
      circuitBreakers: this.circuitBreakers.size,
      requestQueues: this.requestQueue.size
    });
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `rl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current status for monitoring
   */
  public getStatus() {
    return {
      circuitBreakers: Array.from(this.circuitBreakers.entries()).map(([key, state]) => ({
        key,
        ...state
      })),
      requestQueues: Array.from(this.requestQueue.entries()).map(([key, queue]) => ({
        key,
        queueLength: queue.length
      }))
    };
  }
}

/**
 * Custom error class for rate limiting
 */
export class RateLimitError extends Error {
  constructor(
    message: string,
    public code: string,
    public details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// Export singleton instance
export const cloudflareWorkerRateLimiter = new CloudflareWorkerRateLimiter();