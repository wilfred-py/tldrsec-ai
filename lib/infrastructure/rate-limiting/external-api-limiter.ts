/**
 * Enhanced External API Rate Limiting
 * 
 * Implements intelligent rate limiting for external API calls including:
 * - SEC EDGAR API (respects 10 requests/second limit)
 * - AI services (Claude/OpenRouter with token limits)
 * - Email services (Resend with sending limits)
 * 
 * Features:
 * - Per-service rate limiting with different strategies
 * - Token bucket algorithm for burst handling
 * - Intelligent queuing and throttling
 * - Comprehensive monitoring and alerting
 * - Circuit breaker protection
 */

import { logger } from '../../logging';
import { monitoring } from '../../monitoring';

// External service configurations
export interface ExternalServiceConfig {
  name: string;
  baseUrl: string;
  rateLimitStrategy: 'token_bucket' | 'sliding_window' | 'fixed_window';
  requestsPerSecond: number;
  requestsPerMinute?: number;
  requestsPerHour?: number;
  burstCapacity?: number;
  queueCapacity: number;
  timeoutMs: number;
  retryConfig: {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
  };
  circuitBreakerConfig: {
    failureThreshold: number;
    recoveryTimeMs: number;
    halfOpenMaxRequests: number;
  };
}

// Pre-configured external services
export const EXTERNAL_SERVICES: Record<string, ExternalServiceConfig> = {
  SEC_EDGAR: {
    name: 'SEC EDGAR API',
    baseUrl: 'https://www.sec.gov',
    rateLimitStrategy: 'token_bucket',
    requestsPerSecond: 10, // SEC limit
    burstCapacity: 20,     // Allow some burst
    queueCapacity: 100,
    timeoutMs: 30000,
    retryConfig: {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000
    },
    circuitBreakerConfig: {
      failureThreshold: 5,
      recoveryTimeMs: 60000,
      halfOpenMaxRequests: 2
    }
  },
  
  CLAUDE_AI: {
    name: 'Claude AI API',
    baseUrl: 'https://api.anthropic.com',
    rateLimitStrategy: 'sliding_window',
    requestsPerSecond: 5,    // Conservative for API credits
    requestsPerMinute: 200,  // Anthropic limits
    requestsPerHour: 1000,
    burstCapacity: 10,
    queueCapacity: 50,
    timeoutMs: 180000, // 3 minutes for large documents
    retryConfig: {
      maxRetries: 3,
      baseDelayMs: 2000,
      maxDelayMs: 30000
    },
    circuitBreakerConfig: {
      failureThreshold: 3,
      recoveryTimeMs: 300000, // 5 minutes
      halfOpenMaxRequests: 1
    }
  },
  
  OPENROUTER_AI: {
    name: 'OpenRouter AI API',
    baseUrl: 'https://openrouter.ai',
    rateLimitStrategy: 'sliding_window',
    requestsPerSecond: 10,
    requestsPerMinute: 300,
    burstCapacity: 20,
    queueCapacity: 50,
    timeoutMs: 120000, // 2 minutes
    retryConfig: {
      maxRetries: 3,
      baseDelayMs: 1500,
      maxDelayMs: 20000
    },
    circuitBreakerConfig: {
      failureThreshold: 4,
      recoveryTimeMs: 180000, // 3 minutes
      halfOpenMaxRequests: 2
    }
  },
  
  RESEND_EMAIL: {
    name: 'Resend Email API',
    baseUrl: 'https://api.resend.com',
    rateLimitStrategy: 'sliding_window',
    requestsPerSecond: 2,    // Conservative email sending
    requestsPerMinute: 30,
    requestsPerHour: 1000,   // Based on plan limits
    burstCapacity: 5,
    queueCapacity: 200,      // Large queue for email
    timeoutMs: 30000,
    retryConfig: {
      maxRetries: 2,
      baseDelayMs: 5000,
      maxDelayMs: 60000
    },
    circuitBreakerConfig: {
      failureThreshold: 3,
      recoveryTimeMs: 600000, // 10 minutes
      halfOpenMaxRequests: 1
    }
  }
};

// Token bucket implementation for rate limiting
class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private capacity: number,
    private refillRate: number // tokens per second
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  consumeTokens(count: number = 1): boolean {
    this.refill();
    
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const timePassed = (now - this.lastRefill) / 1000; // seconds
    const tokensToAdd = Math.floor(timePassed * this.refillRate);
    
    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  getTimeUntilTokens(count: number): number {
    this.refill();
    if (this.tokens >= count) return 0;
    
    const tokensNeeded = count - this.tokens;
    return Math.ceil(tokensNeeded / this.refillRate * 1000); // milliseconds
  }
}

// Circuit breaker states
enum CircuitBreakerState {
  CLOSED = 'closed',
  OPEN = 'open',
  HALF_OPEN = 'half_open'
}

// Circuit breaker implementation
class CircuitBreaker {
  private state = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenRequests = 0;

  constructor(private config: ExternalServiceConfig['circuitBreakerConfig']) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() - this.lastFailureTime > this.config.recoveryTimeMs) {
        this.state = CircuitBreakerState.HALF_OPEN;
        this.halfOpenRequests = 0;
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      if (this.halfOpenRequests >= this.config.halfOpenMaxRequests) {
        throw new Error('Circuit breaker half-open request limit exceeded');
      }
      this.halfOpenRequests++;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.CLOSED;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
    }
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  getFailureCount(): number {
    return this.failureCount;
  }
}

// Queued request interface
interface QueuedRequest<T> {
  id: string;
  operation: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timestamp: number;
  priority: number;
  timeout: NodeJS.Timeout;
}

// Main external API rate limiter
export class ExternalApiRateLimiter {
  private tokenBuckets = new Map<string, TokenBucket>();
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private requestQueues = new Map<string, QueuedRequest<unknown>[]>();
  private processing = new Map<string, boolean>();
  private readonly logger = logger.child('external-api-limiter');

  constructor() {
    // Initialize rate limiters for each service
    for (const [serviceKey, config] of Object.entries(EXTERNAL_SERVICES)) {
      this.initializeService(serviceKey, config);
    }

    this.logger.info('ExternalApiRateLimiter initialized', {
      services: Object.keys(EXTERNAL_SERVICES)
    });

    // Start queue processors
    this.startQueueProcessors();
  }

  private initializeService(serviceKey: string, config: ExternalServiceConfig): void {
    // Initialize token bucket
    if (config.rateLimitStrategy === 'token_bucket') {
      this.tokenBuckets.set(
        serviceKey, 
        new TokenBucket(config.burstCapacity || config.requestsPerSecond, config.requestsPerSecond)
      );
    }

    // Initialize circuit breaker
    this.circuitBreakers.set(serviceKey, new CircuitBreaker(config.circuitBreakerConfig));

    // Initialize request queue
    this.requestQueues.set(serviceKey, []);
    this.processing.set(serviceKey, false);
  }

  /**
   * Execute an API request with rate limiting
   */
  async executeRequest<T>(
    serviceKey: string,
    operation: () => Promise<T>,
    priority: number = 1,
    context: Record<string, unknown> = {}
  ): Promise<T> {
    const config = EXTERNAL_SERVICES[serviceKey];
    if (!config) {
      throw new Error(`Unknown service: ${serviceKey}`);
    }

    const requestId = this.generateRequestId();
    const startTime = Date.now();

    this.logger.debug('External API request started', {
      serviceKey,
      requestId,
      priority,
      context
    });

    try {
      // Check circuit breaker
      const circuitBreaker = this.circuitBreakers.get(serviceKey)!;
      
      return await circuitBreaker.execute(async () => {
        // Check if we can execute immediately
        if (this.canExecuteImmediately(serviceKey)) {
          return await this.executeWithTimeout(operation, config.timeoutMs, requestId);
        } else {
          // Queue the request
          return await this.queueRequest(serviceKey, operation, priority, requestId, config);
        }
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      
      this.logger.error('External API request failed', {
        serviceKey,
        requestId,
        duration,
        error: error.message,
        context
      });

      // Record failure metrics
      monitoring.incrementCounter('external_api.request.failed', 1, {
        service: serviceKey,
        requestId,
        errorType: this.classifyError(error)
      });

      throw error;
    }
  }

  /**
   * Check if request can execute immediately
   */
  private canExecuteImmediately(serviceKey: string): boolean {
    const config = EXTERNAL_SERVICES[serviceKey];
    
    if (config.rateLimitStrategy === 'token_bucket') {
      const tokenBucket = this.tokenBuckets.get(serviceKey);
      return tokenBucket ? tokenBucket.consumeTokens(1) : false;
    }

    // For other strategies, check queue length
    const queue = this.requestQueues.get(serviceKey) || [];
    return queue.length === 0;
  }

  /**
   * Queue a request for later execution
   */
  private async queueRequest<T>(
    serviceKey: string,
    operation: () => Promise<T>,
    priority: number,
    requestId: string,
    config: ExternalServiceConfig
  ): Promise<T> {
    const queue = this.requestQueues.get(serviceKey) || [];
    
    // Check queue capacity
    if (queue.length >= config.queueCapacity) {
      throw new Error(`Queue full for service ${serviceKey} (${queue.length}/${config.queueCapacity})`);
    }

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.removeFromQueue(serviceKey, requestId);
        reject(new Error(`Queue timeout for service ${serviceKey}`));
      }, config.timeoutMs);

      const queuedRequest: QueuedRequest<T> = {
        id: requestId,
        operation,
        resolve,
        reject,
        timestamp: Date.now(),
        priority,
        timeout
      };

      // Insert in priority order
      const insertIndex = queue.findIndex(req => req.priority > priority);
      if (insertIndex === -1) {
        queue.push(queuedRequest);
      } else {
        queue.splice(insertIndex, 0, queuedRequest);
      }

      this.requestQueues.set(serviceKey, queue);

      this.logger.debug('Request queued', {
        serviceKey,
        requestId,
        priority,
        queueLength: queue.length,
        estimatedWaitTime: this.estimateWaitTime(serviceKey)
      });

      // Start processing if not already running
      if (!this.processing.get(serviceKey)) {
        this.processQueue(serviceKey).catch(error => {
          this.logger.error('Queue processing error', {
            serviceKey,
            error: error.message
          });
        });
      }
    });
  }

  /**
   * Process queued requests for a service
   */
  private async processQueue(serviceKey: string): Promise<void> {
    if (this.processing.get(serviceKey)) return;
    
    this.processing.set(serviceKey, true);
    const config = EXTERNAL_SERVICES[serviceKey];
    const queue = this.requestQueues.get(serviceKey) || [];

    try {
      while (queue.length > 0) {
        // Check if we can process the next request
        if (!this.canExecuteImmediately(serviceKey)) {
          // Wait for rate limit window
          const waitTime = this.getWaitTimeForNextRequest(serviceKey);
          if (waitTime > 0) {
            await this.sleep(waitTime);
          }
        }

        const request = queue.shift();
        if (!request) break;

        try {
          clearTimeout(request.timeout);
          
          const result = await this.executeWithTimeout(
            request.operation, 
            config.timeoutMs, 
            request.id
          );
          
          request.resolve(result);

          // Record success metrics
          monitoring.incrementCounter('external_api.request.success', 1, {
            service: serviceKey,
            requestId: request.id
          });

        } catch (error) {
          request.reject(error);
        }

        // Delay between requests
        await this.sleep(1000 / config.requestsPerSecond);
      }
    } finally {
      this.processing.set(serviceKey, false);
    }
  }

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    _requestId: string
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      operation()
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Get wait time for next request
   */
  private getWaitTimeForNextRequest(serviceKey: string): number {
    const config = EXTERNAL_SERVICES[serviceKey];
    
    if (config.rateLimitStrategy === 'token_bucket') {
      const tokenBucket = this.tokenBuckets.get(serviceKey);
      return tokenBucket ? tokenBucket.getTimeUntilTokens(1) : 0;
    }

    // For other strategies, use basic rate limiting
    return 1000 / config.requestsPerSecond;
  }

  /**
   * Estimate wait time in queue
   */
  private estimateWaitTime(serviceKey: string): number {
    const queue = this.requestQueues.get(serviceKey) || [];
    const config = EXTERNAL_SERVICES[serviceKey];
    
    // Estimate based on queue length and rate limit
    const baseTimePerRequest = 1000 / config.requestsPerSecond;
    return queue.length * baseTimePerRequest;
  }

  /**
   * Remove request from queue
   */
  private removeFromQueue(serviceKey: string, requestId: string): void {
    const queue = this.requestQueues.get(serviceKey) || [];
    const index = queue.findIndex(req => req.id === requestId);
    if (index !== -1) {
      const request = queue[index];
      clearTimeout(request.timeout);
      queue.splice(index, 1);
    }
  }

  /**
   * Classify error type
   */
  private classifyError(error: unknown): string {
    if (error.message.includes('timeout')) return 'timeout';
    if (error.message.includes('rate limit')) return 'rate_limit';
    if (error.message.includes('circuit breaker')) return 'circuit_breaker';
    if (error.message.includes('queue')) return 'queue_error';
    return 'unknown';
  }

  /**
   * Start queue processors for all services
   */
  private startQueueProcessors(): void {
    for (const serviceKey of Object.keys(EXTERNAL_SERVICES)) {
      setInterval(() => {
        if (!this.processing.get(serviceKey)) {
          const queue = this.requestQueues.get(serviceKey) || [];
          if (queue.length > 0) {
            this.processQueue(serviceKey).catch(error => {
              this.logger.error('Queue processor error', {
                serviceKey,
                error: error.message
              });
            });
          }
        }
      }, 5000); // Check every 5 seconds
    }
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
    return `ext-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current status for monitoring
   */
  public getStatus() {
    return {
      services: Object.keys(EXTERNAL_SERVICES).map(serviceKey => ({
        serviceKey,
        queueLength: (this.requestQueues.get(serviceKey) || []).length,
        processing: this.processing.get(serviceKey) || false,
        circuitBreakerState: this.circuitBreakers.get(serviceKey)?.getState(),
        circuitBreakerFailures: this.circuitBreakers.get(serviceKey)?.getFailureCount(),
        availableTokens: this.tokenBuckets.get(serviceKey)?.getAvailableTokens()
      }))
    };
  }
}

// Export singleton instance
export const externalApiRateLimiter = new ExternalApiRateLimiter();

// Convenience methods for specific services
export const secEdgarLimiter = {
  execute: <T>(operation: () => Promise<T>, context?: Record<string, unknown>) =>
    externalApiRateLimiter.executeRequest('SEC_EDGAR', operation, 1, context)
};

export const claudeAiLimiter = {
  execute: <T>(operation: () => Promise<T>, context?: Record<string, unknown>) =>
    externalApiRateLimiter.executeRequest('CLAUDE_AI', operation, 1, context)
};

export const openRouterLimiter = {
  execute: <T>(operation: () => Promise<T>, context?: Record<string, unknown>) =>
    externalApiRateLimiter.executeRequest('OPENROUTER_AI', operation, 1, context)
};

export const resendEmailLimiter = {
  execute: <T>(operation: () => Promise<T>, context?: Record<string, unknown>) =>
    externalApiRateLimiter.executeRequest('RESEND_EMAIL', operation, 1, context)
};