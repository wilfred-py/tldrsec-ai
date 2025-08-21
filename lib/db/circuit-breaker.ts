/**
 * Circuit Breaker for High-Conflict Database Resources
 * 
 * Prevents cascading failures during high concurrency scenarios
 * by temporarily bypassing conflict-prone operations.
 */

import { logger } from '../logging';

const circuitLogger = logger.child('circuit-breaker');

export interface CircuitBreakerConfig {
  failureThreshold: number;     // Number of failures before opening
  recoveryTimeout: number;      // Time to wait before trying again (ms)
  monitoringWindow: number;     // Time window for failure counting (ms)
  successThreshold: number;     // Successes needed to close circuit
}

export interface CircuitBreakerState {
  isOpen: boolean;
  failures: number;
  lastFailureTime: number;
  consecutiveSuccesses: number;
  nextAttemptTime: number;
}

const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,      // Open after 5 failures
  recoveryTimeout: 30000,   // Wait 30 seconds
  monitoringWindow: 60000,  // 1 minute window
  successThreshold: 3       // 3 successes to close
};

export class CircuitBreaker {
  private state: CircuitBreakerState;
  private config: CircuitBreakerConfig;
  private resourceName: string;

  constructor(resourceName: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.resourceName = resourceName;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      isOpen: false,
      failures: 0,
      lastFailureTime: 0,
      consecutiveSuccesses: 0,
      nextAttemptTime: 0
    };
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const now = Date.now();

    // Check if circuit is open
    if (this.state.isOpen) {
      if (now < this.state.nextAttemptTime) {
        circuitLogger.warn(`Circuit breaker OPEN for ${this.resourceName}`, {
          nextAttemptIn: this.state.nextAttemptTime - now,
          failures: this.state.failures
        });
        throw new Error(`Circuit breaker open for ${this.resourceName}`);
      } else {
        // Half-open state: allow one attempt
        circuitLogger.info(`Circuit breaker HALF-OPEN for ${this.resourceName}`);
      }
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
    this.state.consecutiveSuccesses++;
    
    if (this.state.isOpen && this.state.consecutiveSuccesses >= this.config.successThreshold) {
      // Close the circuit
      this.state.isOpen = false;
      this.state.failures = 0;
      this.state.consecutiveSuccesses = 0;
      
      circuitLogger.info(`Circuit breaker CLOSED for ${this.resourceName}`, {
        successThreshold: this.config.successThreshold
      });
    }
  }

  private onFailure(): void {
    const now = Date.now();
    this.state.failures++;
    this.state.lastFailureTime = now;
    this.state.consecutiveSuccesses = 0;

    // Clean old failures outside monitoring window
    if (now - this.state.lastFailureTime > this.config.monitoringWindow) {
      this.state.failures = 1; // Reset to current failure
    }

    if (this.state.failures >= this.config.failureThreshold && !this.state.isOpen) {
      // Open the circuit
      this.state.isOpen = true;
      this.state.nextAttemptTime = now + this.config.recoveryTimeout;
      
      circuitLogger.error(`Circuit breaker OPENED for ${this.resourceName}`, {
        failures: this.state.failures,
        failureThreshold: this.config.failureThreshold,
        recoveryTimeout: this.config.recoveryTimeout
      });
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitBreakerState & { resourceName: string } {
    return {
      ...this.state,
      resourceName: this.resourceName
    };
  }

  /**
   * Manually reset circuit breaker
   */
  reset(): void {
    this.state = {
      isOpen: false,
      failures: 0,
      lastFailureTime: 0,
      consecutiveSuccesses: 0,
      nextAttemptTime: 0
    };
    
    circuitLogger.info(`Circuit breaker manually RESET for ${this.resourceName}`);
  }
}

/**
 * Global circuit breakers for high-conflict resources
 */
export const circuitBreakers = {
  userBudgetUpdate: new CircuitBreaker('user-budget-update', {
    failureThreshold: 3,
    recoveryTimeout: 15000,
    successThreshold: 2
  }),
  
  popularTickerUpdate: new CircuitBreaker('popular-ticker-update', {
    failureThreshold: 5,
    recoveryTimeout: 20000,
    successThreshold: 3
  }),
  
  subscriptionTierValidation: new CircuitBreaker('subscription-tier-validation', {
    failureThreshold: 3,
    recoveryTimeout: 10000,
    successThreshold: 2
  })
};

/**
 * Check if a ticker is considered "popular" (high conflict risk)
 */
export function isPopularTicker(subscriberCount: number): boolean {
  return subscriberCount >= 100; // Configurable threshold
}

/**
 * Apply circuit breaker to user budget operations
 */
export async function executeWithBudgetCircuitBreaker<T>(
  operation: () => Promise<T>
): Promise<T> {
  return circuitBreakers.userBudgetUpdate.execute(operation);
}

/**
 * Apply circuit breaker to ticker monitoring operations
 */
export async function executeWithTickerCircuitBreaker<T>(
  subscriberCount: number,
  operation: () => Promise<T>
): Promise<T> {
  if (isPopularTicker(subscriberCount)) {
    return circuitBreakers.popularTickerUpdate.execute(operation);
  } else {
    // Low-conflict ticker, execute directly
    return operation();
  }
}