/**
 * Circuit Breaker for AI Processing Infrastructure
 * 
 * Prevents cascading failures and 524 timeouts by monitoring
 * AI API health and automatically failing fast when issues detected
 */

import { logger } from '../logging';
import { generateSecureOperationId } from '../security/secure-random';

export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Failing fast
  HALF_OPEN = 'HALF_OPEN' // Testing recovery
}

export interface CircuitBreakerConfig {
  failureThreshold: number;      // Number of failures before opening
  successThreshold: number;      // Number of successes to close from half-open
  timeout: number;               // Time in ms before trying half-open
  monitoringWindow: number;      // Time window for failure counting
  volumeThreshold: number;       // Minimum requests before circuit can trip
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  circuitOpenedAt?: Date;
  nextAttemptAt?: Date;
}

/**
 * Circuit breaker specifically designed for AI processing timeouts
 */
export class AIProcessingCircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private totalRequests: number = 0;
  private totalFailures: number = 0;
  private totalSuccesses: number = 0;
  private circuitOpenedAt?: Date;
  private nextAttemptAt?: Date;
  private failures: Date[] = [];

  constructor(private config: CircuitBreakerConfig) {
    logger.info('AI Processing Circuit Breaker initialized', {
      failureThreshold: config.failureThreshold,
      successThreshold: config.successThreshold,
      timeout: config.timeout,
      monitoringWindow: config.monitoringWindow
    });
  }

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>, operationName?: string): Promise<T> {
    const requestId = this.generateRequestId();
    
    // Check if circuit allows execution
    if (!this.canExecute()) {
      const error = new Error(`Circuit breaker is ${this.state} for AI processing`);
      logger.warn('Circuit breaker blocking request', {
        requestId,
        operationName,
        state: this.state,
        nextAttemptAt: this.nextAttemptAt?.toISOString()
      });
      throw error;
    }

    this.totalRequests++;
    const startTime = Date.now();

    try {
      logger.debug('Executing operation through circuit breaker', {
        requestId,
        operationName,
        state: this.state,
        failureCount: this.failureCount
      });

      const result = await operation();
      
      const executionTime = Date.now() - startTime;
      this.onSuccess(requestId, operationName, executionTime);
      
      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.onFailure(error, requestId, operationName, executionTime);
      throw error;
    }
  }

  /**
   * Check if circuit allows execution
   */
  private canExecute(): boolean {
    const now = new Date();

    switch (this.state) {
      case CircuitState.CLOSED:
        return true;

      case CircuitState.OPEN:
        // Check if timeout period has elapsed
        if (this.nextAttemptAt && now >= this.nextAttemptAt) {
          logger.info('Circuit breaker transitioning to HALF_OPEN', {
            openDuration: this.circuitOpenedAt ? now.getTime() - this.circuitOpenedAt.getTime() : 0
          });
          this.state = CircuitState.HALF_OPEN;
          this.successCount = 0;
          return true;
        }
        return false;

      case CircuitState.HALF_OPEN:
        return true;

      default:
        return false;
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(requestId: string, operationName?: string, executionTime?: number): void {
    this.totalSuccesses++;
    this.lastSuccessTime = new Date();
    
    logger.debug('Circuit breaker: operation succeeded', {
      requestId,
      operationName,
      executionTime,
      state: this.state,
      successCount: this.successCount + 1
    });

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      
      if (this.successCount >= this.config.successThreshold) {
        logger.info('Circuit breaker closing: success threshold reached', {
          successCount: this.successCount,
          successThreshold: this.config.successThreshold
        });
        this.close();
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success
      this.failureCount = 0;
      this.cleanOldFailures();
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(error: unknown, requestId: string, operationName?: string, executionTime?: number): void {
    this.totalFailures++;
    this.failureCount++;
    this.lastFailureTime = new Date();
    this.failures.push(this.lastFailureTime);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isTimeoutError = errorMessage.toLowerCase().includes('timeout') || 
                          errorMessage.includes('524') ||
                          (executionTime && executionTime > 30000); // Consider >30s as timeout

    logger.warn('Circuit breaker: operation failed', {
      requestId,
      operationName,
      error: errorMessage,
      isTimeoutError,
      executionTime,
      state: this.state,
      failureCount: this.failureCount,
      failureThreshold: this.config.failureThreshold
    });

    // Clean old failures outside monitoring window
    this.cleanOldFailures();

    // Check if we should open the circuit
    if (this.shouldOpenCircuit()) {
      this.open();
    } else if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state reopens the circuit
      logger.info('Circuit breaker reopening: failure in HALF_OPEN state');
      this.open();
    }
  }

  /**
   * Check if circuit should be opened
   */
  private shouldOpenCircuit(): boolean {
    if (this.state !== CircuitState.CLOSED) {
      return false;
    }

    // Need minimum volume before circuit can trip
    if (this.totalRequests < this.config.volumeThreshold) {
      return false;
    }

    // Count recent failures within monitoring window
    const recentFailures = this.getRecentFailures();
    
    return recentFailures >= this.config.failureThreshold;
  }

  /**
   * Get count of recent failures within monitoring window
   */
  private getRecentFailures(): number {
    const cutoff = new Date(Date.now() - this.config.monitoringWindow);
    return this.failures.filter(failure => failure >= cutoff).length;
  }

  /**
   * Remove failures outside monitoring window
   */
  private cleanOldFailures(): void {
    const cutoff = new Date(Date.now() - this.config.monitoringWindow);
    this.failures = this.failures.filter(failure => failure >= cutoff);
  }

  /**
   * Open the circuit
   */
  private open(): void {
    this.state = CircuitState.OPEN;
    this.circuitOpenedAt = new Date();
    this.nextAttemptAt = new Date(Date.now() + this.config.timeout);
    
    logger.error('Circuit breaker opened: too many failures detected', {
      failureCount: this.failureCount,
      failureThreshold: this.config.failureThreshold,
      recentFailures: this.getRecentFailures(),
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      nextAttemptAt: this.nextAttemptAt.toISOString()
    });
  }

  /**
   * Close the circuit
   */
  private close(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.circuitOpenedAt = undefined;
    this.nextAttemptAt = undefined;
    this.failures = [];
    
    logger.info('Circuit breaker closed: service recovered', {
      totalRequests: this.totalRequests,
      totalSuccesses: this.totalSuccesses,
      totalFailures: this.totalFailures
    });
  }

  /**
   * Get circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      circuitOpenedAt: this.circuitOpenedAt,
      nextAttemptAt: this.nextAttemptAt
    };
  }

  /**
   * Force circuit state (for testing or manual intervention)
   */
  forceState(state: CircuitState): void {
    logger.warn('Circuit breaker state forced', {
      oldState: this.state,
      newState: state
    });
    
    this.state = state;
    
    if (state === CircuitState.CLOSED) {
      this.close();
    } else if (state === CircuitState.OPEN) {
      this.open();
    }
  }

  /**
   * Reset circuit breaker statistics
   */
  reset(): void {
    logger.info('Circuit breaker reset');
    
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
    this.totalRequests = 0;
    this.totalFailures = 0;
    this.totalSuccesses = 0;
    this.circuitOpenedAt = undefined;
    this.nextAttemptAt = undefined;
    this.failures = [];
  }

  private generateRequestId(): string {
    return generateSecureOperationId('cb');
  }
}

// Default configuration for AI processing
export const AI_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,        // Open after 5 failures
  successThreshold: 3,        // Close after 3 successes in half-open
  timeout: 60000,             // Try again after 1 minute
  monitoringWindow: 300000,   // 5 minute failure window
  volumeThreshold: 10         // Need 10 requests before circuit can trip
};

// Export singleton instance for AI processing
export const aiProcessingCircuitBreaker = new AIProcessingCircuitBreaker(AI_CIRCUIT_BREAKER_CONFIG);