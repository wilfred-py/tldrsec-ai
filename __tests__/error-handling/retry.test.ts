/**
 * Retry Mechanism Tests
 * 
 * Tests the retry functionality with exponential backoff, jitter, and circuit breaker patterns.
 */

import { 
  executeWithRetry, 
  RetryConfig, 
  DefaultRetryConfig,
  CircuitBreakerConfig,
  DefaultCircuitBreakerConfig,
  TimeoutAbortController 
} from '@/lib/error-handling/retry';
import { ApiError, ErrorCode, ErrorCategory, ErrorSeverity } from '@/lib/error-handling';

// Mock global functions
jest.mock('@/lib/logging', () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockImplementation(() => ({
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
    })),
  }
}));

jest.mock('@/lib/monitoring', () => ({
  monitoring: {
    incrementCounter: jest.fn(),
    recordValue: jest.fn(),
    recordTiming: jest.fn(),
    startTimer: jest.fn(),
    stopTimer: jest.fn()
  }
}));

// Reset mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
});

describe('Retry Mechanisms', () => {
  describe('executeWithRetry', () => {
    it('should successfully execute a function that succeeds on first try', async () => {
      // Create a mock function that succeeds
      const mockFn = jest.fn().mockResolvedValue('success');
      
      // Execute with retry
      const result = await executeWithRetry(
        mockFn,
        'test-service',
        DefaultRetryConfig
      );
      
      // Function should be called once and return success
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(result).toBe('success');
    });
    
    it('should retry and eventually succeed', async () => {
      // Create a mock function that fails twice then succeeds
      const mockFn = jest.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValue('success after retries');
      
      // Create a retry config with a short delay for testing
      const testRetryConfig: RetryConfig = {
        ...DefaultRetryConfig,
        maxRetries: 3,
        initialDelayMs: 10,
        maxDelayMs: 50,
        backoffFactor: 2,
        jitterFactor: 0.1
      };
      
      // Mock onRetry callback
      const onRetry = jest.fn();
      testRetryConfig.onRetry = onRetry;
      
      // Execute with retry
      const result = await executeWithRetry(
        mockFn,
        'test-service',
        testRetryConfig
      );
      
      // Function should be called 3 times (1 initial + 2 retries)
      expect(mockFn).toHaveBeenCalledTimes(3);
      // onRetry should be called twice
      expect(onRetry).toHaveBeenCalledTimes(2);
      // Should eventually succeed
      expect(result).toBe('success after retries');
    });
    
    it('should fail after max retries exceeded', async () => {
      // Create a mock function that always fails
      const mockFn = jest.fn().mockRejectedValue(new Error('Persistent failure'));
      
      // Create a retry config with short delays for testing
      const testRetryConfig: RetryConfig = {
        ...DefaultRetryConfig,
        maxRetries: 2,
        initialDelayMs: 10,
        maxDelayMs: 20,
        backoffFactor: 1.5,
        jitterFactor: 0.1
      };
      
      // Execute with retry and expect failure
      await expect(executeWithRetry(
        mockFn,
        'test-service',
        testRetryConfig
      )).rejects.toThrow('Retry attempts exhausted');
      
      // Function should be called maxRetries + 1 times (1 initial + maxRetries)
      expect(mockFn).toHaveBeenCalledTimes(testRetryConfig.maxRetries + 1);
    });
    
    it('should respect retryable vs non-retryable errors', async () => {
      // Create a mock function that throws a non-retryable error
      const mockFn = jest.fn().mockRejectedValue(
        new ApiError(
          ErrorCode.VALIDATION_ERROR,
          'Invalid input',
          { field: 'username' },
          true,  // isOperational
          'test-request-id'
        )
      );
      
      // Execute with retry and expect immediate failure
      await expect(executeWithRetry(
        mockFn,
        'test-service',
        DefaultRetryConfig
      )).rejects.toThrow('Invalid input');
      
      // Function should be called exactly once (no retries for non-retryable errors)
      expect(mockFn).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('TimeoutAbortController', () => {
    it('should abort execution after specified timeout', async () => {
      // Create a timeout abort controller with a short timeout
      const controller = new TimeoutAbortController();
      controller.setTimeout(50); // 50ms timeout
      
      // Create a promise that checks for abort signal
      const longRunningOperation = new Promise((resolve, reject) => {
        // This simulates checking the abort signal during a long operation
        const interval = setInterval(() => {
          if (controller.signal.aborted) {
            clearInterval(interval);
            reject(new Error('Operation aborted'));
          }
        }, 10);
        
        // This would normally resolve, but should be aborted before it happens
        setTimeout(() => {
          clearInterval(interval);
          resolve('completed');
        }, 200);
      });
      
      // Execution should be aborted
      await expect(longRunningOperation).rejects.toThrow('Operation aborted');
    });
    
    it('should allow clearing timeout to prevent abortion', async () => {
      // Create a timeout abort controller with a short timeout
      const controller = new TimeoutAbortController();
      controller.setTimeout(50); // 50ms timeout
      
      // Clear the timeout immediately
      controller.clearTimeout();
      
      // Create a short operation that should complete
      const shortOperation = new Promise((resolve) => {
        setTimeout(() => resolve('completed'), 100);
      });
      
      // Operation should complete without abortion
      await expect(shortOperation).resolves.toBe('completed');
      expect(controller.signal.aborted).toBe(false);
    });
  });
  
  describe('Circuit Breaker', () => {
    it('should open circuit after threshold failures', async () => {
      // Create a mock function that always fails
      const mockFn = jest.fn().mockRejectedValue(new Error('Service failure'));
      
      // Circuit breaker config with a low threshold for testing
      const testCircuitConfig: CircuitBreakerConfig = {
        ...DefaultCircuitBreakerConfig,
        failureThreshold: 2, // Open after 2 failures
        resetTimeoutMs: 5000
      };
      
      // First call - circuit should be closed
      await expect(executeWithRetry(
        mockFn,
        'test-circuit-service',
        { ...DefaultRetryConfig, maxRetries: 0 }, // No retries to simplify test
        testCircuitConfig
      )).rejects.toThrow('Service failure');
      
      // Second call - circuit should be closed
      await expect(executeWithRetry(
        mockFn,
        'test-circuit-service',
        { ...DefaultRetryConfig, maxRetries: 0 },
        testCircuitConfig
      )).rejects.toThrow('Service failure');
      
      // Third call - circuit should be open
      await expect(executeWithRetry(
        mockFn,
        'test-circuit-service',
        { ...DefaultRetryConfig, maxRetries: 0 },
        testCircuitConfig
      )).rejects.toThrow('Circuit breaker is open');
      
      // Function should only be called twice (circuit prevents third call)
      expect(mockFn).toHaveBeenCalledTimes(2);
    });
  });
}); 