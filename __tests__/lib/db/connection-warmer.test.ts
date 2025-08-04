/**
 * Database Connection Warmer Tests
 * 
 * Tests for the database connection warming utilities including:
 * - One-time warmup functionality
 * - Periodic connection warmer
 * - Error handling and cleanup
 */

import { warmupDatabaseConnection, ConnectionWarmer, connectionWarmer } from '@/lib/db/connection-warmer';

// Mock the database utilities
jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    $queryRaw: jest.fn()
  }
}));

jest.mock('@/lib/db/retry-wrapper', () => ({
  dbRetry: {
    healthCheck: jest.fn()
  }
}));

import { prisma } from '@/lib/db/prisma';
import { dbRetry } from '@/lib/db/retry-wrapper';

// Mock console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeEach(() => {
  console.log = jest.fn();
  console.error = jest.fn();
  jest.clearAllMocks();
  jest.clearAllTimers();
  jest.useFakeTimers();
});

afterEach(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  jest.useRealTimers();
  
  // Clean up any running intervals
  connectionWarmer.stop();
});

describe('Database Connection Warmer', () => {
  describe('warmupDatabaseConnection', () => {
    it('should successfully warm up database connection', async () => {
      // Mock successful database query
      (dbRetry.healthCheck as jest.Mock).mockResolvedValue(undefined);
      
      const result = await warmupDatabaseConnection();
      
      expect(result).toBe(true);
      expect(dbRetry.healthCheck).toHaveBeenCalledTimes(1);
      expect(dbRetry.healthCheck).toHaveBeenCalledWith(expect.any(Function));
      expect(console.log).toHaveBeenCalledWith('✅ Database connection warmed up successfully');
    });
    
    it('should handle warmup failures gracefully', async () => {
      // Mock database query failure
      const error = new Error('Connection failed');
      (dbRetry.healthCheck as jest.Mock).mockRejectedValue(error);
      
      const result = await warmupDatabaseConnection();
      
      expect(result).toBe(false);
      expect(dbRetry.healthCheck).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith('⚠️ Database warmup failed:', 'Connection failed');
    });
    
    it('should execute the correct warmup query', async () => {
      let capturedOperation: (() => Promise<any>) | undefined;
      
      (dbRetry.healthCheck as jest.Mock).mockImplementation((operation) => {
        capturedOperation = operation;
        return Promise.resolve();
      });
      
      await warmupDatabaseConnection();
      
      expect(capturedOperation).toBeDefined();
      
      // Execute the captured operation to verify it calls the right query
      if (capturedOperation) {
        await capturedOperation();
        expect(prisma.$queryRaw).toHaveBeenCalledWith(['SELECT 1 as warmup']);
      }
    });
  });
  
  describe('ConnectionWarmer class', () => {
    let warmer: ConnectionWarmer;
    
    beforeEach(() => {
      warmer = new ConnectionWarmer();
    });
    
    afterEach(() => {
      warmer.stop();
    });
    
    it('should start periodic warming with default interval', async () => {
      (dbRetry.healthCheck as jest.Mock).mockResolvedValue(undefined);
      
      warmer.start();
      
      // Should warm up immediately
      expect(dbRetry.healthCheck).toHaveBeenCalledTimes(1);
      expect(console.log).toHaveBeenCalledWith('Connection warmer started (interval: 5 minutes)');
      
      // Fast-forward 5 minutes and check if it warms up again
      jest.advanceTimersByTime(5 * 60 * 1000);
      
      // Should have warmed up again
      expect(dbRetry.healthCheck).toHaveBeenCalledTimes(2);
    });
    
    it('should start periodic warming with custom interval', async () => {
      (dbRetry.healthCheck as jest.Mock).mockResolvedValue(undefined);
      
      warmer.start(2); // 2 minutes
      
      expect(console.log).toHaveBeenCalledWith('Connection warmer started (interval: 2 minutes)');
      
      // Fast-forward 2 minutes
      jest.advanceTimersByTime(2 * 60 * 1000);
      
      // Should have warmed up twice (initial + after 2 minutes)
      expect(dbRetry.healthCheck).toHaveBeenCalledTimes(2);
    });
    
    it('should not start multiple warmers if already running', () => {
      (dbRetry.healthCheck as jest.Mock).mockResolvedValue(undefined);
      
      warmer.start();
      warmer.start(); // Try to start again
      
      expect(console.log).toHaveBeenCalledWith('Connection warmer started (interval: 5 minutes)');
      expect(console.log).toHaveBeenCalledWith('Connection warmer already running');
    });
    
    it('should stop periodic warming', () => {
      (dbRetry.healthCheck as jest.Mock).mockResolvedValue(undefined);
      
      warmer.start();
      expect(console.log).toHaveBeenCalledWith('Connection warmer started (interval: 5 minutes)');
      
      warmer.stop();
      expect(console.log).toHaveBeenCalledWith('Connection warmer stopped');
      
      // Fast-forward and verify no more warming calls
      const callCountBeforeStop = (dbRetry.healthCheck as jest.Mock).mock.calls.length;
      jest.advanceTimersByTime(10 * 60 * 1000);
      
      expect((dbRetry.healthCheck as jest.Mock).mock.calls.length).toBe(callCountBeforeStop);
    });
    
    it('should handle warming errors during periodic operation', async () => {
      const error = new Error('Periodic warming failed');
      (dbRetry.healthCheck as jest.Mock)
        .mockResolvedValueOnce(undefined) // Initial warmup succeeds
        .mockRejectedValue(error); // Subsequent warmups fail
      
      warmer.start(1); // 1 minute for faster testing
      
      // Initial warmup should succeed
      expect(dbRetry.healthCheck).toHaveBeenCalledTimes(1);
      
      // Fast-forward to trigger periodic warmup
      jest.advanceTimersByTime(60 * 1000);
      
      // Wait for async operation to complete
      await new Promise(resolve => setImmediate(resolve));
      
      // Should have attempted periodic warmup
      expect(dbRetry.healthCheck).toHaveBeenCalledTimes(2);
      expect(console.error).toHaveBeenCalledWith('⚠️ Database warmup failed:', 'Periodic warming failed');
    });
    
    it('should prevent concurrent warming operations', async () => {
      let resolveWarmup: (() => void) | undefined;
      const slowWarmup = new Promise<void>((resolve) => {
        resolveWarmup = resolve;
      });
      
      (dbRetry.healthCheck as jest.Mock)
        .mockReturnValueOnce(slowWarmup) // First call is slow
        .mockResolvedValue(undefined); // Subsequent calls are fast
      
      warmer.start(1); // 1 minute interval
      
      // Fast-forward to trigger second warmup while first is still running
      jest.advanceTimersByTime(60 * 1000);
      
      expect(console.log).toHaveBeenCalledWith('Connection warming already in progress, skipping...');
      
      // Complete the first warmup
      if (resolveWarmup) {
        resolveWarmup();
      }
      await slowWarmup;
      
      // Fast-forward again - now it should warm up normally
      jest.advanceTimersByTime(60 * 1000);
      await new Promise(resolve => setImmediate(resolve));
      
      // Should have called dbRetry.healthCheck three times:
      // 1. Initial start
      // 2. First slow periodic warmup  
      // 3. Second periodic warmup (after first completed)
      expect(dbRetry.healthCheck).toHaveBeenCalledTimes(3);
    });
  });
  
  describe('Singleton connection warmer', () => {
    afterEach(() => {
      connectionWarmer.stop();
    });
    
    it('should provide a singleton instance', () => {
      expect(connectionWarmer).toBeInstanceOf(ConnectionWarmer);
    });
    
    it('should work with the singleton instance', () => {
      (dbRetry.healthCheck as jest.Mock).mockResolvedValue(undefined);
      
      connectionWarmer.start(3); // 3 minutes
      
      expect(console.log).toHaveBeenCalledWith('Connection warmer started (interval: 3 minutes)');
      expect(dbRetry.healthCheck).toHaveBeenCalledTimes(1);
      
      connectionWarmer.stop();
      expect(console.log).toHaveBeenCalledWith('Connection warmer stopped');
    });
  });
  
  describe('Integration scenarios', () => {
    it('should handle rapid start/stop cycles', () => {
      (dbRetry.healthCheck as jest.Mock).mockResolvedValue(undefined);
      
      const warmer = new ConnectionWarmer();
      
      // Rapid start/stop cycles
      warmer.start();
      warmer.stop();
      warmer.start();
      warmer.stop();
      warmer.start();
      
      expect(console.log).toHaveBeenCalledWith('Connection warmer started (interval: 5 minutes)');
      expect(console.log).toHaveBeenCalledWith('Connection warmer stopped');
      
      // Should still be functional after rapid cycles
      jest.advanceTimersByTime(5 * 60 * 1000);
      expect(dbRetry.healthCheck).toHaveBeenCalledTimes(3); // Three start calls
      
      warmer.stop();
    });
    
    it('should handle stopping when not started', () => {
      const warmer = new ConnectionWarmer();
      
      // Stop without starting - should not throw or log error
      warmer.stop();
      
      // No error messages should be logged
      expect(console.error).not.toHaveBeenCalled();
    });
  });
});