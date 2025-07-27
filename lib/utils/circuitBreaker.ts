/**
 * Circuit Breaker Pattern Implementation
 * 
 * Provides protection against cascading failures in external API calls
 * by monitoring failure rates and temporarily stopping requests when
 * failure thresholds are exceeded.
 */

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Circuit breaker is open, rejecting requests
  HALF_OPEN = 'HALF_OPEN' // Testing if service has recovered
}

export interface CircuitBreakerConfig {
  failureThreshold: number;     // Number of failures before opening circuit
  recoveryTimeout: number;      // Time in ms before attempting recovery
  monitoringPeriod: number;     // Time window for failure counting
  successThreshold: number;     // Successes needed in half-open to close circuit
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  totalRequests: number;
  lastFailureTime?: number;
  stateChangedAt: number;
}

/**
 * Circuit Breaker implementation for protecting external API calls
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failures = 0;
  private successes = 0;
  private totalRequests = 0;
  private lastFailureTime?: number;
  private stateChangedAt = Date.now();
  private config: CircuitBreakerConfig;
  private name: string;

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.name = name;
    this.config = {
      failureThreshold: config.failureThreshold || 5,
      recoveryTimeout: config.recoveryTimeout || 60000, // 1 minute
      monitoringPeriod: config.monitoringPeriod || 300000, // 5 minutes
      successThreshold: config.successThreshold || 3
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN;
        this.stateChangedAt = Date.now();
        console.log(`Circuit breaker ${this.name}: Attempting recovery (HALF_OPEN)`);
      } else {
        throw new Error(`Circuit breaker ${this.name} is OPEN. Service unavailable.`);
      }
    }

    this.totalRequests++;

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      totalRequests: this.totalRequests,
      lastFailureTime: this.lastFailureTime,
      stateChangedAt: this.stateChangedAt
    };
  }

  /**
   * Reset circuit breaker to initial state
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.totalRequests = 0;
    this.lastFailureTime = undefined;
    this.stateChangedAt = Date.now();
    console.log(`Circuit breaker ${this.name}: Reset to CLOSED state`);
  }

  /**
   * Force circuit breaker to open state
   */
  forceOpen(): void {
    this.state = CircuitState.OPEN;
    this.stateChangedAt = Date.now();
    console.log(`Circuit breaker ${this.name}: Forced to OPEN state`);
  }

  private onSuccess(): void {
    this.clearOldFailures();

    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      if (this.successes >= this.config.successThreshold) {
        this.state = CircuitState.CLOSED;
        this.failures = 0;
        this.successes = 0;
        this.stateChangedAt = Date.now();
        console.log(`Circuit breaker ${this.name}: Recovered to CLOSED state`);
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in closed state
      this.failures = Math.max(0, this.failures - 1);
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state reopens the circuit
      this.state = CircuitState.OPEN;
      this.successes = 0;
      this.stateChangedAt = Date.now();
      console.log(`Circuit breaker ${this.name}: Failed during recovery, reopened`);
    } else if (this.state === CircuitState.CLOSED) {
      // Check if we should open the circuit
      if (this.failures >= this.config.failureThreshold) {
        this.state = CircuitState.OPEN;
        this.stateChangedAt = Date.now();
        console.log(`Circuit breaker ${this.name}: Opened due to ${this.failures} failures`);
      }
    }
  }

  private shouldAttemptReset(): boolean {
    return (
      this.state === CircuitState.OPEN &&
      this.lastFailureTime &&
      (Date.now() - this.lastFailureTime) >= this.config.recoveryTimeout
    );
  }

  private clearOldFailures(): void {
    // Clear failures older than monitoring period
    if (
      this.lastFailureTime &&
      (Date.now() - this.lastFailureTime) > this.config.monitoringPeriod
    ) {
      this.failures = 0;
    }
  }
}

/**
 * Global circuit breaker registry for managing multiple breakers
 */
class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  getBreaker(name: string, config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, config));
    }
    return this.breakers.get(name)!;
  }

  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};
    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

export const circuitBreakerRegistry = new CircuitBreakerRegistry();

/**
 * Utility function to create a circuit breaker protected function
 */
export function withCircuitBreaker<T extends (...args: any[]) => Promise<any>>(
  name: string,
  fn: T,
  config?: Partial<CircuitBreakerConfig>
): T {
  const breaker = circuitBreakerRegistry.getBreaker(name, config);
  
  return ((...args: Parameters<T>) => {
    return breaker.execute(() => fn(...args));
  }) as T;
}