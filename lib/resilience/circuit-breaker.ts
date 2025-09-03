/**
 * Production-ready circuit breaker implementation
 * 
 * Features:
 * - Three states: CLOSED, OPEN, HALF_OPEN
 * - Configurable failure thresholds and recovery timeouts
 * - Per-service circuit breaker instances
 * - Health check integration
 * - Metrics and monitoring
 * - Graceful degradation support
 */

import { logger } from '../logging';

const circuitLogger = logger.child('circuit-breaker');

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerConfig {
  name: string;
  failureThreshold: number;
  successThreshold: number;
  timeout: number;
  resetTimeout: number;
  monitoringWindow: number;
  minimumThroughput: number;
  slowCallDurationThreshold?: number;
  slowCallRateThreshold?: number;
}

export interface CircuitBreakerMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  rejectedCalls: number;
  slowCalls: number;
  averageResponseTime: number;
  state: CircuitState;
  lastStateChange: Date;
  lastFailure?: Date;
  lastSuccess?: Date;
}

export interface CallResult {
  success: boolean;
  duration: number;
  error?: Error;
  timestamp: Date;
}

/**
 * Production-ready circuit breaker with comprehensive monitoring
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: Date | null = null;
  private lastStateChange = new Date();
  private callHistory: CallResult[] = [];
  private totalCalls = 0;
  private successfulCalls = 0;
  private failedCalls = 0;
  private rejectedCalls = 0;
  private slowCalls = 0;
  private responseTimes: number[] = [];

  constructor(private config: CircuitBreakerConfig) {
    circuitLogger.info('Circuit breaker initialized', {
      name: config.name,
      config
    });
  }

  /**
   * Execute operation through circuit breaker
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    
    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionToHalfOpen();
      } else {
        this.rejectedCalls++;
        const error = new Error(`Circuit breaker is OPEN for ${this.config.name}`);
        circuitLogger.warn('Call rejected - circuit breaker open', {
          name: this.config.name,
          state: this.state,
          lastFailure: this.lastFailureTime,
          timeSinceLastFailure: this.lastFailureTime ? 
            Date.now() - this.lastFailureTime.getTime() : null
        });
        throw error;
      }
    }

    try {
      // Execute the operation with timeout
      const result = await this.executeWithTimeout(operation);
      const duration = Date.now() - startTime;
      
      this.recordSuccess(duration);
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordFailure(error instanceof Error ? error : new Error(String(error)), duration);
      throw error;
    }
  }

  /**
   * Execute operation with timeout
   */
  private async executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
    if (this.config.timeout) {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Circuit breaker timeout: ${this.config.timeout}ms`)), this.config.timeout)
      );
      
      return Promise.race([operation(), timeoutPromise]);
    }
    
    return operation();
  }

  /**
   * Record successful call
   */
  private recordSuccess(duration: number): void {
    this.totalCalls++;
    this.successfulCalls++;
    this.responseTimes.push(duration);
    
    // Check for slow calls
    if (this.config.slowCallDurationThreshold && duration > this.config.slowCallDurationThreshold) {
      this.slowCalls++;
    }
    
    this.addToHistory({
      success: true,
      duration,
      timestamp: new Date()
    });
    
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      circuitLogger.debug('Success in half-open state', {
        name: this.config.name,
        successCount: this.successCount,
        threshold: this.config.successThreshold
      });
      
      if (this.successCount >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    }
    
    this.trimHistory();
  }

  /**
   * Record failed call
   */
  private recordFailure(error: Error, duration: number): void {
    this.totalCalls++;
    this.failedCalls++;
    this.lastFailureTime = new Date();
    this.responseTimes.push(duration);
    
    this.addToHistory({
      success: false,
      duration,
      error,
      timestamp: new Date()
    });
    
    if (this.state === CircuitState.CLOSED || this.state === CircuitState.HALF_OPEN) {
      this.failureCount++;
      circuitLogger.warn('Failure recorded', {
        name: this.config.name,
        state: this.state,
        failureCount: this.failureCount,
        threshold: this.config.failureThreshold,
        error: error.message
      });
      
      if (this.shouldTripCircuit()) {
        this.transitionToOpen();
      }
    }
    
    this.trimHistory();
  }

  /**
   * Check if circuit should trip to open state
   */
  private shouldTripCircuit(): boolean {
    // Ensure minimum throughput before considering failure rate
    if (this.getRecentCallCount() < this.config.minimumThroughput) {
      return false;
    }
    
    const failureRate = this.getFailureRate();
    const slowCallRate = this.getSlowCallRate();
    
    // Trip based on failure threshold
    if (failureRate >= this.config.failureThreshold) {
      circuitLogger.info('Circuit tripping due to failure rate', {
        name: this.config.name,
        failureRate,
        threshold: this.config.failureThreshold
      });
      return true;
    }
    
    // Trip based on slow call rate if configured
    if (this.config.slowCallRateThreshold && slowCallRate >= this.config.slowCallRateThreshold) {
      circuitLogger.info('Circuit tripping due to slow call rate', {
        name: this.config.name,
        slowCallRate,
        threshold: this.config.slowCallRateThreshold
      });
      return true;
    }
    
    return false;
  }

  /**
   * Check if circuit should attempt reset from open to half-open
   */
  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return true;
    
    const timeSinceLastFailure = Date.now() - this.lastFailureTime.getTime();
    return timeSinceLastFailure >= this.config.resetTimeout;
  }

  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastStateChange = new Date();
    
    circuitLogger.info('Circuit breaker transitioned to CLOSED', {
      name: this.config.name,
      previousFailures: this.failureCount,
      metrics: this.getMetrics()
    });
  }

  /**
   * Transition to OPEN state
   */
  private transitionToOpen(): void {
    this.state = CircuitState.OPEN;
    this.lastStateChange = new Date();
    
    circuitLogger.error('Circuit breaker transitioned to OPEN', {
      name: this.config.name,
      failureCount: this.failureCount,
      failureRate: this.getFailureRate(),
      metrics: this.getMetrics()
    });
  }

  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(): void {
    this.state = CircuitState.HALF_OPEN;
    this.successCount = 0;
    this.lastStateChange = new Date();
    
    circuitLogger.info('Circuit breaker transitioned to HALF_OPEN', {
      name: this.config.name,
      timeSinceLastFailure: this.lastFailureTime ? 
        Date.now() - this.lastFailureTime.getTime() : null
    });
  }

  /**
   * Add call result to history
   */
  private addToHistory(result: CallResult): void {
    this.callHistory.push(result);
  }

  /**
   * Trim history to monitoring window
   */
  private trimHistory(): void {
    const cutoffTime = new Date(Date.now() - this.config.monitoringWindow);
    this.callHistory = this.callHistory.filter(call => call.timestamp > cutoffTime);
    
    // Trim response times array
    if (this.responseTimes.length > 1000) {
      this.responseTimes = this.responseTimes.slice(-500);
    }
  }

  /**
   * Calculate failure rate within monitoring window
   */
  private getFailureRate(): number {
    const recentCalls = this.getRecentCalls();
    if (recentCalls.length === 0) return 0;
    
    const failures = recentCalls.filter(call => !call.success).length;
    return failures / recentCalls.length;
  }

  /**
   * Calculate slow call rate within monitoring window
   */
  private getSlowCallRate(): number {
    if (!this.config.slowCallDurationThreshold) return 0;
    
    const recentCalls = this.getRecentCalls();
    if (recentCalls.length === 0) return 0;
    
    const slowCalls = recentCalls.filter(call => 
      call.duration > this.config.slowCallDurationThreshold!
    ).length;
    
    return slowCalls / recentCalls.length;
  }

  /**
   * Get recent calls within monitoring window
   */
  private getRecentCalls(): CallResult[] {
    const cutoffTime = new Date(Date.now() - this.config.monitoringWindow);
    return this.callHistory.filter(call => call.timestamp > cutoffTime);
  }

  /**
   * Get recent call count
   */
  private getRecentCallCount(): number {
    return this.getRecentCalls().length;
  }

  /**
   * Calculate average response time
   */
  private getAverageResponseTime(): number {
    if (this.responseTimes.length === 0) return 0;
    return this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get comprehensive metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    return {
      totalCalls: this.totalCalls,
      successfulCalls: this.successfulCalls,
      failedCalls: this.failedCalls,
      rejectedCalls: this.rejectedCalls,
      slowCalls: this.slowCalls,
      averageResponseTime: this.getAverageResponseTime(),
      state: this.state,
      lastStateChange: this.lastStateChange,
      lastFailure: this.lastFailureTime || undefined,
      lastSuccess: this.callHistory
        .filter(call => call.success)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0]?.timestamp
    };
  }

  /**
   * Reset circuit breaker to initial state
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.lastStateChange = new Date();
    this.callHistory = [];
    this.totalCalls = 0;
    this.successfulCalls = 0;
    this.failedCalls = 0;
    this.rejectedCalls = 0;
    this.slowCalls = 0;
    this.responseTimes = [];
    
    circuitLogger.info('Circuit breaker reset', {
      name: this.config.name
    });
  }

  /**
   * Force circuit to open state (for maintenance or testing)
   */
  forceOpen(): void {
    this.transitionToOpen();
    circuitLogger.warn('Circuit breaker forced to OPEN state', {
      name: this.config.name
    });
  }

  /**
   * Force circuit to closed state (for recovery)
   */
  forceClosed(): void {
    this.transitionToClosed();
    circuitLogger.info('Circuit breaker forced to CLOSED state', {
      name: this.config.name
    });
  }
}

/**
 * Circuit breaker registry for managing multiple circuit breakers
 */
export class CircuitBreakerRegistry {
  private static instance: CircuitBreakerRegistry;
  private circuitBreakers = new Map<string, CircuitBreaker>();

  private constructor() {}

  static getInstance(): CircuitBreakerRegistry {
    if (!CircuitBreakerRegistry.instance) {
      CircuitBreakerRegistry.instance = new CircuitBreakerRegistry();
    }
    return CircuitBreakerRegistry.instance;
  }

  /**
   * Get or create circuit breaker for a service
   */
  getCircuitBreaker(config: CircuitBreakerConfig): CircuitBreaker {
    if (!this.circuitBreakers.has(config.name)) {
      this.circuitBreakers.set(config.name, new CircuitBreaker(config));
    }
    return this.circuitBreakers.get(config.name)!;
  }

  /**
   * Get all circuit breakers
   */
  getAllCircuitBreakers(): Map<string, CircuitBreaker> {
    return new Map(this.circuitBreakers);
  }

  /**
   * Get metrics for all circuit breakers
   */
  getAllMetrics(): Record<string, CircuitBreakerMetrics> {
    const metrics: Record<string, CircuitBreakerMetrics> = {};
    for (const [name, circuitBreaker] of this.circuitBreakers) {
      metrics[name] = circuitBreaker.getMetrics();
    }
    return metrics;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const circuitBreaker of this.circuitBreakers.values()) {
      circuitBreaker.reset();
    }
    circuitLogger.info('All circuit breakers reset');
  }
}

/**
 * Default circuit breaker configurations for common services
 */
export const CIRCUIT_BREAKER_CONFIGS = {
  ANTHROPIC_API: {
    name: 'anthropic-api',
    failureThreshold: 0.5, // 50% failure rate
    successThreshold: 3,   // 3 consecutive successes to close
    timeout: 60000,        // 60s timeout
    resetTimeout: 30000,   // 30s before attempting reset
    monitoringWindow: 60000, // 1 minute window
    minimumThroughput: 5,  // Minimum 5 calls before considering failure rate
    slowCallDurationThreshold: 30000, // 30s slow call threshold
    slowCallRateThreshold: 0.8 // 80% slow call rate
  },
  EMAIL_SERVICE: {
    name: 'email-service',
    failureThreshold: 0.6,
    successThreshold: 2,
    timeout: 30000,
    resetTimeout: 60000,
    monitoringWindow: 300000, // 5 minutes
    minimumThroughput: 3,
    slowCallDurationThreshold: 15000,
    slowCallRateThreshold: 0.7
  },
  SEC_EDGAR_API: {
    name: 'sec-edgar-api',
    failureThreshold: 0.4,
    successThreshold: 3,
    timeout: 45000,
    resetTimeout: 120000, // 2 minutes
    monitoringWindow: 180000, // 3 minutes
    minimumThroughput: 4,
    slowCallDurationThreshold: 20000,
    slowCallRateThreshold: 0.6
  },
  DATABASE: {
    name: 'database',
    failureThreshold: 0.7,
    successThreshold: 2,
    timeout: 10000,
    resetTimeout: 15000,
    monitoringWindow: 30000, // 30 seconds
    minimumThroughput: 10,
    slowCallDurationThreshold: 5000,
    slowCallRateThreshold: 0.9
  }
} as const;