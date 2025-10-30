/**
 * Comprehensive Circuit Breaker Testing Suite
 * 
 * Tests all circuit breaker functionality including state transitions,
 * failure detection, recovery mechanisms, and edge cases.
 */

import { 
  AIProcessingCircuitBreaker, 
  CircuitState, 
  CircuitBreakerConfig 
} from '../../lib/infrastructure/circuit-breaker';

describe('Circuit Breaker Comprehensive Tests', () => {
  let circuitBreaker: AIProcessingCircuitBreaker;
  
  const testConfig: CircuitBreakerConfig = {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 1000,
    monitoringWindow: 5000,
    volumeThreshold: 5
  };

  beforeEach(() => {
    circuitBreaker = new AIProcessingCircuitBreaker(testConfig);
  });

  afterEach(() => {
    circuitBreaker.reset();
  });

  describe('State Transition Logic', () => {
    test('should start in CLOSED state', () => {
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
    });

    test('should transition from CLOSED to OPEN after failure threshold', async () => {
      // Need to reach volume threshold first
      for (let i = 0; i < testConfig.volumeThreshold - testConfig.failureThreshold; i++) {
        await circuitBreaker.execute(async () => 'success');
      }

      // Now trigger failures
      for (let i = 0; i < testConfig.failureThreshold; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Test failure');
          });
        } catch (error) {
          // Expected to fail
        }
      }

      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.OPEN);
    });

    test('should transition from OPEN to HALF_OPEN after timeout', async () => {
      // Force circuit to OPEN state
      circuitBreaker.forceState(CircuitState.OPEN);
      
      // Wait for timeout period
      await new Promise(resolve => setTimeout(resolve, testConfig.timeout + 100));
      
      // Next execution should transition to HALF_OPEN
      try {
        await circuitBreaker.execute(async () => 'success');
      } catch (error) {
        // Circuit breaker should allow the attempt and transition to HALF_OPEN
      }
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.HALF_OPEN);
    });

    test('should transition from HALF_OPEN to CLOSED after success threshold', async () => {
      circuitBreaker.forceState(CircuitState.HALF_OPEN);

      // Execute successful operations to reach success threshold
      for (let i = 0; i < testConfig.successThreshold; i++) {
        await circuitBreaker.execute(async () => 'success');
      }

      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
    });

    test('should transition from HALF_OPEN back to OPEN on failure', async () => {
      circuitBreaker.forceState(CircuitState.HALF_OPEN);

      try {
        await circuitBreaker.execute(async () => {
          throw new Error('Test failure');
        });
      } catch (error) {
        // Expected to fail
      }

      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.OPEN);
    });
  });

  describe('Failure Detection and Timeout Handling', () => {
    test('should detect timeout errors correctly', async () => {
      const longRunningOperation = async () => {
        await new Promise(resolve => setTimeout(resolve, 35000)); // 35 seconds
        return 'completed';
      };

      // Reach volume threshold first
      for (let i = 0; i < testConfig.volumeThreshold; i++) {
        await circuitBreaker.execute(async () => 'success');
      }

      try {
        await circuitBreaker.execute(longRunningOperation, 'long-operation');
      } catch (error) {
        // Should be caught as timeout
      }

      const stats = circuitBreaker.getStats();
      expect(stats.totalFailures).toBe(1);
    });

    test('should detect 524 errors as timeout', async () => {
      const error524Operation = async () => {
        throw new Error('524 Gateway Timeout');
      };

      // Reach volume threshold first
      for (let i = 0; i < testConfig.volumeThreshold; i++) {
        await circuitBreaker.execute(async () => 'success');
      }

      try {
        await circuitBreaker.execute(error524Operation, '524-error');
      } catch (error) {
        // Expected to fail
      }

      const stats = circuitBreaker.getStats();
      expect(stats.totalFailures).toBe(1);
    });

    test('should handle errors with timeout keyword', async () => {
      const timeoutOperation = async () => {
        throw new Error('Request timeout after 30 seconds');
      };

      // Reach volume threshold first
      for (let i = 0; i < testConfig.volumeThreshold; i++) {
        await circuitBreaker.execute(async () => 'success');
      }

      try {
        await circuitBreaker.execute(timeoutOperation, 'timeout-error');
      } catch (error) {
        // Expected to fail
      }

      const stats = circuitBreaker.getStats();
      expect(stats.totalFailures).toBe(1);
    });
  });

  describe('Volume Threshold Protection', () => {
    test('should not open circuit before volume threshold', async () => {
      // Execute failures below volume threshold
      for (let i = 0; i < testConfig.volumeThreshold - 1; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Test failure');
          });
        } catch (error) {
          // Expected to fail
        }
      }

      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.totalFailures).toBe(testConfig.volumeThreshold - 1);
    });

    test('should open circuit after volume threshold is reached', async () => {
      // Execute enough requests to reach volume threshold
      for (let i = 0; i < testConfig.volumeThreshold; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Test failure');
          });
        } catch (error) {
          // Expected to fail
        }
      }

      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.OPEN);
    });
  });

  describe('Monitoring Window Behavior', () => {
    test('should clean old failures outside monitoring window', async () => {
      const shortWindowConfig = { ...testConfig, monitoringWindow: 500 };
      const shortWindowBreaker = new AIProcessingCircuitBreaker(shortWindowConfig);

      // Execute some failures
      for (let i = 0; i < 2; i++) {
        try {
          await shortWindowBreaker.execute(async () => {
            throw new Error('Test failure');
          });
        } catch (error) {
          // Expected to fail
        }
      }

      // Wait for monitoring window to expire
      await new Promise(resolve => setTimeout(resolve, 600));

      // Execute more operations - old failures should be cleaned
      await shortWindowBreaker.execute(async () => 'success');

      const stats = shortWindowBreaker.getStats();
      expect(stats.failureCount).toBe(0); // Old failures should be cleaned
      
      shortWindowBreaker.reset();
    });

    test('should count recent failures within monitoring window', async () => {
      // Execute failures within monitoring window
      for (let i = 0; i < testConfig.failureThreshold; i++) {
        try {
          await circuitBreaker.execute(async () => {
            throw new Error('Test failure');
          });
        } catch (error) {
          // Expected to fail
        }
      }

      const stats = circuitBreaker.getStats();
      expect(stats.failureCount).toBe(testConfig.failureThreshold);
    });
  });

  describe('Concurrent Operations', () => {
    test('should handle concurrent successful operations', async () => {
      const concurrentOperations = Array.from({ length: 10 }, (_, i) => 
        circuitBreaker.execute(async () => `success-${i}`)
      );

      const results = await Promise.allSettled(concurrentOperations);
      
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      expect(successCount).toBe(10);

      const stats = circuitBreaker.getStats();
      expect(stats.totalSuccesses).toBe(10);
      expect(stats.state).toBe(CircuitState.CLOSED);
    });

    test('should handle concurrent failing operations', async () => {
      // First reach volume threshold with successes
      for (let i = 0; i < testConfig.volumeThreshold; i++) {
        await circuitBreaker.execute(async () => 'success');
      }

      const concurrentFailures = Array.from({ length: testConfig.failureThreshold }, (_, i) => 
        circuitBreaker.execute(async () => {
          throw new Error(`failure-${i}`);
        }).catch(() => 'failed')
      );

      await Promise.all(concurrentFailures);

      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.OPEN);
    });

    test('should handle mixed concurrent operations', async () => {
      const mixedOperations = [
        ...Array.from({ length: 5 }, (_, i) => 
          circuitBreaker.execute(async () => `success-${i}`)
        ),
        ...Array.from({ length: 3 }, (_, i) => 
          circuitBreaker.execute(async () => {
            throw new Error(`failure-${i}`);
          }).catch(() => 'failed')
        )
      ];

      await Promise.allSettled(mixedOperations);

      const stats = circuitBreaker.getStats();
      expect(stats.totalSuccesses).toBe(5);
      expect(stats.totalFailures).toBe(3);
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    test('should handle zero failure threshold', () => {
      const zeroThresholdConfig = { ...testConfig, failureThreshold: 0 };
      expect(() => new AIProcessingCircuitBreaker(zeroThresholdConfig)).not.toThrow();
    });

    test('should handle very small timeout values', async () => {
      const smallTimeoutConfig = { ...testConfig, timeout: 1 };
      const smallTimeoutBreaker = new AIProcessingCircuitBreaker(smallTimeoutConfig);
      
      smallTimeoutBreaker.forceState(CircuitState.OPEN);
      
      // Wait for tiny timeout
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Should allow transition to HALF_OPEN
      try {
        await smallTimeoutBreaker.execute(async () => 'success');
      } catch (error) {
        // May be blocked initially
      }
      
      smallTimeoutBreaker.reset();
    });

    test('should handle very large monitoring window', () => {
      const largeWindowConfig = { ...testConfig, monitoringWindow: 24 * 60 * 60 * 1000 }; // 24 hours
      expect(() => new AIProcessingCircuitBreaker(largeWindowConfig)).not.toThrow();
    });

    test('should handle rapid state transitions', async () => {
      // Force rapid state changes
      circuitBreaker.forceState(CircuitState.OPEN);
      circuitBreaker.forceState(CircuitState.HALF_OPEN);
      circuitBreaker.forceState(CircuitState.CLOSED);
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
    });

    test('should handle operation that throws non-Error objects', async () => {
      try {
        await circuitBreaker.execute(async () => {
          throw 'string error';
        });
      } catch (error) {
        expect(error).toBe('string error');
      }

      const stats = circuitBreaker.getStats();
      expect(stats.totalFailures).toBe(1);
    });

    test('should handle operation that returns undefined', async () => {
      const result = await circuitBreaker.execute(async () => {
        return undefined;
      });
      
      expect(result).toBeUndefined();

      const stats = circuitBreaker.getStats();
      expect(stats.totalSuccesses).toBe(1);
    });
  });

  describe('Statistics and Monitoring', () => {
    test('should provide accurate statistics', async () => {
      // Execute mixed operations
      await circuitBreaker.execute(async () => 'success1');
      await circuitBreaker.execute(async () => 'success2');
      
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('failure1');
        });
      } catch (error) {
        // Expected to fail
      }

      const stats = circuitBreaker.getStats();
      expect(stats.totalRequests).toBe(3);
      expect(stats.totalSuccesses).toBe(2);
      expect(stats.totalFailures).toBe(1);
      expect(stats.lastSuccessTime).toBeDefined();
      expect(stats.lastFailureTime).toBeDefined();
    });

    test('should track circuit opened timestamp', async () => {
      // Force circuit to open
      circuitBreaker.forceState(CircuitState.OPEN);
      
      const stats = circuitBreaker.getStats();
      expect(stats.circuitOpenedAt).toBeDefined();
      expect(stats.nextAttemptAt).toBeDefined();
    });

    test('should clear timestamps when circuit closes', async () => {
      circuitBreaker.forceState(CircuitState.OPEN);
      circuitBreaker.forceState(CircuitState.CLOSED);
      
      const stats = circuitBreaker.getStats();
      expect(stats.circuitOpenedAt).toBeUndefined();
      expect(stats.nextAttemptAt).toBeUndefined();
    });
  });

  describe('Reset Functionality', () => {
    test('should reset all statistics and state', async () => {
      // Execute some operations
      await circuitBreaker.execute(async () => 'success');
      try {
        await circuitBreaker.execute(async () => {
          throw new Error('failure');
        });
      } catch (error) {
        // Expected to fail
      }

      // Reset the circuit breaker
      circuitBreaker.reset();

      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.totalRequests).toBe(0);
      expect(stats.totalSuccesses).toBe(0);
      expect(stats.totalFailures).toBe(0);
      expect(stats.failureCount).toBe(0);
      expect(stats.successCount).toBe(0);
      expect(stats.lastSuccessTime).toBeUndefined();
      expect(stats.lastFailureTime).toBeUndefined();
    });
  });

  describe('Force State Functionality', () => {
    test('should allow forcing to OPEN state', () => {
      circuitBreaker.forceState(CircuitState.OPEN);
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.OPEN);
      expect(stats.circuitOpenedAt).toBeDefined();
      expect(stats.nextAttemptAt).toBeDefined();
    });

    test('should allow forcing to CLOSED state', () => {
      circuitBreaker.forceState(CircuitState.OPEN);
      circuitBreaker.forceState(CircuitState.CLOSED);
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.CLOSED);
      expect(stats.circuitOpenedAt).toBeUndefined();
      expect(stats.nextAttemptAt).toBeUndefined();
    });

    test('should allow forcing to HALF_OPEN state', () => {
      circuitBreaker.forceState(CircuitState.HALF_OPEN);
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.HALF_OPEN);
    });
  });

  describe('Request Blocking in OPEN State', () => {
    test('should block requests when circuit is OPEN', async () => {
      circuitBreaker.forceState(CircuitState.OPEN);
      
      await expect(
        circuitBreaker.execute(async () => 'should not execute')
      ).rejects.toThrow('Circuit breaker is OPEN for AI processing');
    });

    test('should allow requests when circuit transitions to HALF_OPEN', async () => {
      const shortTimeoutConfig = { ...testConfig, timeout: 50 };
      const quickBreaker = new AIProcessingCircuitBreaker(shortTimeoutConfig);
      
      quickBreaker.forceState(CircuitState.OPEN);
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Should allow execution now
      const result = await quickBreaker.execute(async () => 'allowed');
      expect(result).toBe('allowed');
      
      quickBreaker.reset();
    });
  });
});