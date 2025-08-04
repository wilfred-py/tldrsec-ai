/**
 * Database Retry Wrapper Tests
 * 
 * Comprehensive tests for the database retry wrapper including:
 * - Basic retry functionality with exponential backoff
 * - Error type detection and retry conditions
 * - Pre-configured retry wrappers (query, mutation, healthCheck)
 * - Edge cases and error scenarios
 */

import { withRetry, dbRetry, RetryOptions } from '@/lib/db/retry-wrapper';
import { PrismaClientInitializationError, PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

// Mock console methods to avoid noise in tests
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

beforeEach(() => {
  console.warn = jest.fn();
  console.error = jest.fn();
  jest.clearAllMocks();
});

afterEach(() => {
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
});

describe('Database Retry Wrapper', () => {
  describe('withRetry', () => {
    it('should execute operation successfully on first try', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      
      const result = await withRetry(mockOperation);
      
      expect(mockOperation).toHaveBeenCalledTimes(1);
      expect(result).toBe('success');
    });
    
    it('should retry on PrismaClientInitializationError and eventually succeed', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new PrismaClientInitializationError('Connection failed', '6.7.0'))
        .mockRejectedValueOnce(new PrismaClientInitializationError('Connection failed', '6.7.0'))
        .mockResolvedValue('success after retries');
      
      const options: RetryOptions = {
        maxRetries: 3,
        baseDelay: 10, // Fast for testing
        maxDelay: 50
      };
      
      const result = await withRetry(mockOperation, options);
      
      expect(mockOperation).toHaveBeenCalledTimes(3);
      expect(result).toBe('success after retries');
      expect(console.warn).toHaveBeenCalledTimes(2); // Two retry warnings
    });
    
    it('should retry on known connection errors', async () => {
      const connectionTimeoutError = new PrismaClientKnownRequestError(
        'Connection timeout',
        { code: 'P1001', clientVersion: '6.7.0' }
      );
      
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(connectionTimeoutError)
        .mockResolvedValue('success after timeout');
      
      const result = await withRetry(mockOperation, { maxRetries: 2, baseDelay: 10 });
      
      expect(mockOperation).toHaveBeenCalledTimes(2);
      expect(result).toBe('success after timeout');
    });
    
    it('should retry on generic connection error messages', async () => {
      const connectionError = new Error("Can't reach database server at host:port");
      
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(connectionError)
        .mockResolvedValue('success after connection error');
      
      const result = await withRetry(mockOperation, { maxRetries: 2, baseDelay: 10 });
      
      expect(mockOperation).toHaveBeenCalledTimes(2);
      expect(result).toBe('success after connection error');
    });
    
    it('should not retry on non-retryable errors', async () => {
      const validationError = new PrismaClientKnownRequestError(
        'Unique constraint violation',
        { code: 'P2002', clientVersion: '6.7.0' }
      );
      
      const mockOperation = jest.fn().mockRejectedValue(validationError);
      
      await expect(withRetry(mockOperation)).rejects.toThrow('Unique constraint violation');
      expect(mockOperation).toHaveBeenCalledTimes(1); // No retries
    });
    
    it('should fail after max retries exceeded', async () => {
      const persistentError = new PrismaClientInitializationError('Persistent connection issue', '6.7.0');
      const mockOperation = jest.fn().mockRejectedValue(persistentError);
      
      const options: RetryOptions = {
        maxRetries: 2,
        baseDelay: 10
      };
      
      await expect(withRetry(mockOperation, options)).rejects.toThrow('Persistent connection issue');
      expect(mockOperation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
    
    it('should apply exponential backoff with jitter', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new PrismaClientInitializationError('Error 1', '6.7.0'))
        .mockRejectedValueOnce(new PrismaClientInitializationError('Error 2', '6.7.0'))
        .mockResolvedValue('success');
      
      const startTime = Date.now();
      
      await withRetry(mockOperation, {
        maxRetries: 3,
        baseDelay: 100,
        backoffMultiplier: 2,
        maxDelay: 1000
      });
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Should take at least the base delays (100ms + 200ms = 300ms minimum)
      expect(totalTime).toBeGreaterThan(250); // Account for some variance
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });
    
    it('should respect maxDelay cap', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce(new PrismaClientInitializationError('Error 1', '6.7.0'))
        .mockRejectedValueOnce(new PrismaClientInitializationError('Error 2', '6.7.0'))
        .mockResolvedValue('success');
      
      const startTime = Date.now();
      
      await withRetry(mockOperation, {
        maxRetries: 3,
        baseDelay: 1000, // Large base delay
        backoffMultiplier: 3,
        maxDelay: 100 // But small max delay
      });
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Should be capped by maxDelay, not baseDelay * backoffMultiplier
      expect(totalTime).toBeLessThan(500); // Should be much less than 1000 + 3000
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });
  });
  
  describe('Pre-configured retry wrappers', () => {
    describe('dbRetry.query', () => {
      it('should use query-optimized settings', async () => {
        const mockQuery = jest.fn()
          .mockRejectedValueOnce(new PrismaClientInitializationError('Cold start', '6.7.0'))
          .mockResolvedValue([{ id: 1, name: 'test' }]);
        
        const result = await dbRetry.query(mockQuery);
        
        expect(mockQuery).toHaveBeenCalledTimes(2);
        expect(result).toEqual([{ id: 1, name: 'test' }]);
      });
      
      it('should fail after query retry limit', async () => {
        const mockQuery = jest.fn().mockRejectedValue(
          new PrismaClientInitializationError('Persistent failure', '6.7.0')
        );
        
        await expect(dbRetry.query(mockQuery)).rejects.toThrow('Persistent failure');
        expect(mockQuery).toHaveBeenCalledTimes(4); // Initial + 3 retries
      });
    });
    
    describe('dbRetry.mutation', () => {
      it('should use mutation-optimized settings', async () => {
        const mockMutation = jest.fn()
          .mockRejectedValueOnce(new PrismaClientInitializationError('Cold start', '6.7.0'))
          .mockResolvedValue({ id: 1, updated: true });
        
        const result = await dbRetry.mutation(mockMutation);
        
        expect(mockMutation).toHaveBeenCalledTimes(2);
        expect(result).toEqual({ id: 1, updated: true });
      });
      
      it('should fail after mutation retry limit', async () => {
        const mockMutation = jest.fn().mockRejectedValue(
          new PrismaClientInitializationError('Persistent failure', '6.7.0')
        );
        
        await expect(dbRetry.mutation(mockMutation)).rejects.toThrow('Persistent failure');
        expect(mockMutation).toHaveBeenCalledTimes(3); // Initial + 2 retries
      });
    });
    
    describe('dbRetry.healthCheck', () => {
      it('should use health-check-optimized settings', async () => {
        const mockHealthCheck = jest.fn()
          .mockRejectedValueOnce(new PrismaClientInitializationError('Cold start', '6.7.0'))
          .mockRejectedValueOnce(new PrismaClientInitializationError('Still cold', '6.7.0'))
          .mockResolvedValue({ status: 'healthy' });
        
        const result = await dbRetry.healthCheck(mockHealthCheck);
        
        expect(mockHealthCheck).toHaveBeenCalledTimes(3);
        expect(result).toEqual({ status: 'healthy' });
      });
      
      it('should have more aggressive retry for health checks', async () => {
        const mockHealthCheck = jest.fn().mockRejectedValue(
          new PrismaClientInitializationError('Persistent failure', '6.7.0')
        );
        
        await expect(dbRetry.healthCheck(mockHealthCheck)).rejects.toThrow('Persistent failure');
        expect(mockHealthCheck).toHaveBeenCalledTimes(6); // Initial + 5 retries
      });
    });
  });
  
  describe('Error classification', () => {
    const testCases = [
      {
        name: 'PrismaClientInitializationError',
        error: new PrismaClientInitializationError('Connection failed', '6.7.0'),
        shouldRetry: true
      },
      {
        name: 'Connection timeout (P1001)',
        error: new PrismaClientKnownRequestError('Timeout', { code: 'P1001', clientVersion: '6.7.0' }),
        shouldRetry: true
      },
      {
        name: 'Operations timeout (P1008)',
        error: new PrismaClientKnownRequestError('Timeout', { code: 'P1008', clientVersion: '6.7.0' }),
        shouldRetry: true
      },
      {
        name: 'Server closed connection (P1017)',
        error: new PrismaClientKnownRequestError('Connection closed', { code: 'P1017', clientVersion: '6.7.0' }),
        shouldRetry: true
      },
      {
        name: 'Can\'t reach database server message',
        error: new Error("Can't reach database server at host:5432"),
        shouldRetry: true
      },
      {
        name: 'Connection timeout message',
        error: new Error('connection timeout occurred'),
        shouldRetry: true
      },
      {
        name: 'Server closed connection message',
        error: new Error('server closed the connection unexpectedly'),
        shouldRetry: true
      },
      {
        name: 'Timed out message',
        error: new Error('operation timed out after 30s'),
        shouldRetry: true
      },
      {
        name: 'Unique constraint violation (P2002)',
        error: new PrismaClientKnownRequestError('Unique constraint', { code: 'P2002', clientVersion: '6.7.0' }),
        shouldRetry: false
      },
      {
        name: 'Foreign key constraint (P2003)',
        error: new PrismaClientKnownRequestError('Foreign key constraint', { code: 'P2003', clientVersion: '6.7.0' }),
        shouldRetry: false
      },
      {
        name: 'Generic application error',
        error: new Error('Invalid user input'),
        shouldRetry: false
      },
      {
        name: 'TypeError',
        error: new TypeError('Cannot read property of undefined'),
        shouldRetry: false
      }
    ];
    
    testCases.forEach(({ name, error, shouldRetry }) => {
      it(`should ${shouldRetry ? 'retry' : 'not retry'} on ${name}`, async () => {
        const mockOperation = jest.fn()
          .mockRejectedValueOnce(error)
          .mockResolvedValue('success');
        
        if (shouldRetry) {
          const result = await withRetry(mockOperation, { maxRetries: 1, baseDelay: 10 });
          expect(result).toBe('success');
          expect(mockOperation).toHaveBeenCalledTimes(2);
        } else {
          await expect(withRetry(mockOperation, { maxRetries: 1, baseDelay: 10 }))
            .rejects.toThrow();
          expect(mockOperation).toHaveBeenCalledTimes(1); // No retry
        }
      });
    });
  });
  
  describe('Edge cases', () => {
    it('should handle operation that throws non-Error objects', async () => {
      const mockOperation = jest.fn()
        .mockRejectedValueOnce('string error')
        .mockResolvedValue('success');
      
      // Should not retry on non-Error objects
      await expect(withRetry(mockOperation)).rejects.toBe('string error');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });
    
    it('should handle operation that returns undefined', async () => {
      const mockOperation = jest.fn().mockResolvedValue(undefined);
      
      const result = await withRetry(mockOperation);
      
      expect(result).toBeUndefined();
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });
    
    it('should handle maxRetries of 0', async () => {
      const mockOperation = jest.fn().mockRejectedValue(
        new PrismaClientInitializationError('Error', '6.7.0')
      );
      
      await expect(withRetry(mockOperation, { maxRetries: 0 })).rejects.toThrow();
      expect(mockOperation).toHaveBeenCalledTimes(1); // No retries
    });
    
    it('should handle negative maxRetries', async () => {
      const mockOperation = jest.fn().mockRejectedValue(
        new PrismaClientInitializationError('Error', '6.7.0')
      );
      
      await expect(withRetry(mockOperation, { maxRetries: -1 })).rejects.toThrow();
      expect(mockOperation).toHaveBeenCalledTimes(1); // No retries
    });
  });
});