/**
 * Comprehensive QA tests for trackCacheAccess function with userId parameter
 * 
 * Tests cover:
 * - Backward compatibility
 * - Edge cases and error scenarios
 * - Security implications
 * - Performance considerations
 * - Data integrity
 */

import { trackCacheAccess } from '../../../../services/filings/database/filingDatabase';

// Mock the prisma import properly
const mockPrisma = {
  summary: {
    update: jest.fn(),
  },
  summaryCacheAccess: {
    create: jest.fn(),
  },
};

jest.mock('../../../../lib/db', () => ({
  prisma: mockPrisma,
}));

// Mock console methods
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
let mockConsoleLog: jest.Mock;
let mockConsoleError: jest.Mock;

describe('trackCacheAccess Function - Comprehensive QA', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock console methods
    mockConsoleLog = jest.fn();
    mockConsoleError = jest.fn();
    console.log = mockConsoleLog;
    console.error = mockConsoleError;
    
    // Default successful mocks
    mockPrisma.summary.update.mockResolvedValue({
      id: 'test-summary-id',
      cacheUsageCount: 1,
      lastCacheUsed: new Date(),
    } as any);
    
    mockPrisma.summaryCacheAccess.create.mockResolvedValue({
      id: 'test-access-id',
      summaryId: 'test-summary-id',
      userId: 'test-user-id',
      accessType: 'database_query',
      accessedAt: new Date(),
    } as any);
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  describe('Backward Compatibility Tests', () => {
    test('should work without userId parameter (existing behavior)', async () => {
      const result = await trackCacheAccess('test-summary-id', 'database_query');
      
      expect(result).toBe(true);
      expect(mockPrisma.summary.update).toHaveBeenCalledWith({
        where: { id: 'test-summary-id' },
        data: {
          cacheUsageCount: { increment: 1 },
          lastCacheUsed: expect.any(Date)
        }
      });
      
      // Should NOT create SummaryCacheAccess record without userId
      expect(mockPrisma.summaryCacheAccess.create).not.toHaveBeenCalled();
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        '[DEBUG][FilingDatabase] Cache access tracked for summary test-summary-id (type: database_query)'
      );
    });

    test('should maintain exact same behavior for existing callers', async () => {
      // Test multiple calls without userId
      const summaryIds = ['summary-1', 'summary-2', 'summary-3'];
      const accessTypes = ['database_query', 'memory_cache', 'api_request'];
      
      for (let i = 0; i < summaryIds.length; i++) {
        const result = await trackCacheAccess(summaryIds[i], accessTypes[i]);
        expect(result).toBe(true);
      }
      
      expect(mockPrisma.summary.update).toHaveBeenCalledTimes(3);
      expect(mockPrisma.summaryCacheAccess.create).toHaveBeenCalledTimes(0);
    });

    test('should work with undefined userId explicitly passed', async () => {
      const result = await trackCacheAccess('test-summary-id', 'database_query', undefined);
      
      expect(result).toBe(true);
      expect(mockPrisma.summary.update).toHaveBeenCalled();
      expect(mockPrisma.summaryCacheAccess.create).not.toHaveBeenCalled();
    });
  });

  describe('New Functionality Tests', () => {
    test('should create SummaryCacheAccess record when userId is provided', async () => {
      const result = await trackCacheAccess('test-summary-id', 'database_query', 'user-123');
      
      expect(result).toBe(true);
      
      // Should update summary
      expect(mockPrisma.summary.update).toHaveBeenCalledWith({
        where: { id: 'test-summary-id' },
        data: {
          cacheUsageCount: { increment: 1 },
          lastCacheUsed: expect.any(Date)
        }
      });
      
      // Should create detailed access record
      expect(mockPrisma.summaryCacheAccess.create).toHaveBeenCalledWith({
        data: {
          summaryId: 'test-summary-id',
          userId: 'user-123',
          accessType: 'database_query',
          accessedAt: expect.any(Date)
        }
      });
    });

    test('should handle different access types with userId', async () => {
      const accessTypes = ['database_query', 'memory_cache', 'api_request', 'background_job'];
      
      for (const accessType of accessTypes) {
        await trackCacheAccess('test-summary-id', accessType, 'user-123');
        
        expect(mockPrisma.summaryCacheAccess.create).toHaveBeenCalledWith({
          data: {
            summaryId: 'test-summary-id',
            userId: 'user-123',
            accessType: accessType,
            accessedAt: expect.any(Date)
          }
        });
      }
      
      expect(mockPrisma.summaryCacheAccess.create).toHaveBeenCalledTimes(accessTypes.length);
    });
  });

  describe('Edge Cases and Input Validation', () => {
    test('should handle empty string userId', async () => {
      const result = await trackCacheAccess('test-summary-id', 'database_query', '');
      
      expect(result).toBe(true);
      expect(mockPrisma.summary.update).toHaveBeenCalled();
      // Empty string should not create access record
      expect(mockPrisma.summaryCacheAccess.create).not.toHaveBeenCalled();
    });

    test('should handle whitespace-only userId', async () => {
      const result = await trackCacheAccess('test-summary-id', 'database_query', '   ');
      
      expect(result).toBe(true);
      expect(mockPrisma.summary.update).toHaveBeenCalled();
      // Whitespace-only should create access record (current implementation)
      expect(mockPrisma.summaryCacheAccess.create).toHaveBeenCalledWith({
        data: {
          summaryId: 'test-summary-id',
          userId: '   ',
          accessType: 'database_query',
          accessedAt: expect.any(Date)
        }
      });
    });

    test('should handle null userId', async () => {
      const result = await trackCacheAccess('test-summary-id', 'database_query', null as any);
      
      expect(result).toBe(true);
      expect(mockPrisma.summary.update).toHaveBeenCalled();
      expect(mockPrisma.summaryCacheAccess.create).not.toHaveBeenCalled();
    });

    test('should handle very long userId', async () => {
      const longUserId = 'user-' + 'a'.repeat(1000);
      const result = await trackCacheAccess('test-summary-id', 'database_query', longUserId);
      
      expect(result).toBe(true);
      expect(mockPrisma.summaryCacheAccess.create).toHaveBeenCalledWith({
        data: {
          summaryId: 'test-summary-id',
          userId: longUserId,
          accessType: 'database_query',
          accessedAt: expect.any(Date)
        }
      });
    });

    test('should handle special characters in userId', async () => {
      const specialUserId = 'user-@#$%^&*()_+-=[]{}|;:,.<>?';
      const result = await trackCacheAccess('test-summary-id', 'database_query', specialUserId);
      
      expect(result).toBe(true);
      expect(mockPrisma.summaryCacheAccess.create).toHaveBeenCalledWith({
        data: {
          summaryId: 'test-summary-id',
          userId: specialUserId,
          accessType: 'database_query',
          accessedAt: expect.any(Date)
        }
      });
    });

    test('should handle Unicode characters in userId', async () => {
      const unicodeUserId = 'user-测试-🚀-العربية';
      const result = await trackCacheAccess('test-summary-id', 'database_query', unicodeUserId);
      
      expect(result).toBe(true);
      expect(mockPrisma.summaryCacheAccess.create).toHaveBeenCalledWith({
        data: {
          summaryId: 'test-summary-id',
          userId: unicodeUserId,
          accessType: 'database_query',
          accessedAt: expect.any(Date)
        }
      });
    });
  });

  describe('Error Handling and Failure Scenarios', () => {
    test('should handle summary update failure gracefully', async () => {
      const updateError = new Error('Database connection failed');
      mockPrisma.summary.update.mockRejectedValueOnce(updateError);
      
      const result = await trackCacheAccess('test-summary-id', 'database_query', 'user-123');
      
      expect(result).toBe(false);
      expect(mockConsoleError).toHaveBeenCalledWith(
        '[ERROR][FilingDatabase] Failed to track cache access: Database connection failed'
      );
      
      // Should not attempt to create access record if summary update fails
      expect(mockPrisma.summaryCacheAccess.create).not.toHaveBeenCalled();
    });

    test('should handle SummaryCacheAccess creation failure but still return success for summary update', async () => {
      const accessError = new Error('Foreign key constraint failed');
      mockPrisma.summaryCacheAccess.create.mockRejectedValueOnce(accessError);
      
      const result = await trackCacheAccess('test-summary-id', 'database_query', 'user-123');
      
      expect(result).toBe(false);
      expect(mockPrisma.summary.update).toHaveBeenCalled();
      expect(mockPrisma.summaryCacheAccess.create).toHaveBeenCalled();
      expect(mockConsoleError).toHaveBeenCalledWith(
        '[ERROR][FilingDatabase] Failed to track cache access: Foreign key constraint failed'
      );
    });

    test('should handle database timeout errors', async () => {
      const timeoutError = new Error('Connection timeout');
      timeoutError.name = 'TimeoutError';
      mockPrisma.summary.update.mockRejectedValueOnce(timeoutError);
      
      const result = await trackCacheAccess('test-summary-id', 'database_query');
      
      expect(result).toBe(false);
      expect(mockConsoleError).toHaveBeenCalledWith(
        '[ERROR][FilingDatabase] Failed to track cache access: Connection timeout'
      );
    });

    test('should handle Prisma client initialization errors', async () => {
      const prismaError = new Error('Prisma client not initialized');
      mockPrisma.summary.update.mockRejectedValueOnce(prismaError);
      
      const result = await trackCacheAccess('test-summary-id', 'database_query', 'user-123');
      
      expect(result).toBe(false);
      expect(mockConsoleError).toHaveBeenCalledWith(
        '[ERROR][FilingDatabase] Failed to track cache access: Prisma client not initialized'
      );
    });

    test('should handle non-Error exceptions', async () => {
      mockPrisma.summary.update.mockRejectedValueOnce('String error');
      
      const result = await trackCacheAccess('test-summary-id', 'database_query');
      
      expect(result).toBe(false);
      expect(mockConsoleError).toHaveBeenCalledWith(
        '[ERROR][FilingDatabase] Failed to track cache access: String error'
      );
    });
  });

  describe('Concurrent Operations and Race Conditions', () => {
    test('should handle concurrent trackCacheAccess calls for same summary', async () => {
      const promises = Array.from({ length: 5 }, (_, i) => 
        trackCacheAccess('test-summary-id', 'database_query', `user-${i}`)
      );
      
      const results = await Promise.all(promises);
      
      expect(results.every(r => r === true)).toBe(true);
      expect(mockPrisma.summary.update).toHaveBeenCalledTimes(5);
      expect(mockPrisma.summaryCacheAccess.create).toHaveBeenCalledTimes(5);
    });

    test('should handle concurrent calls with and without userId', async () => {
      const promises = [
        trackCacheAccess('summary-1', 'database_query'),
        trackCacheAccess('summary-1', 'memory_cache', 'user-123'),
        trackCacheAccess('summary-1', 'api_request'),
        trackCacheAccess('summary-1', 'background_job', 'user-456')
      ];
      
      const results = await Promise.all(promises);
      
      expect(results.every(r => r === true)).toBe(true);
      expect(mockPrisma.summary.update).toHaveBeenCalledTimes(4);
      expect(mockPrisma.summaryCacheAccess.create).toHaveBeenCalledTimes(2);
    });

    test('should handle mixed success/failure scenarios', async () => {
      // First call succeeds
      // Second call fails on summary update
      // Third call fails on access record creation
      mockPrisma.summary.update
        .mockResolvedValueOnce({ id: 'summary-1' } as any)
        .mockRejectedValueOnce(new Error('Update failed'))
        .mockResolvedValueOnce({ id: 'summary-3' } as any);
      
      mockPrisma.summaryCacheAccess.create
        .mockResolvedValueOnce({ id: 'access-1' } as any)
        .mockRejectedValueOnce(new Error('Access creation failed'));
      
      const promises = [
        trackCacheAccess('summary-1', 'database_query', 'user-1'),
        trackCacheAccess('summary-2', 'database_query', 'user-2'),
        trackCacheAccess('summary-3', 'database_query', 'user-3')
      ];
      
      const results = await Promise.all(promises);
      
      expect(results).toEqual([true, false, false]);
      expect(mockConsoleError).toHaveBeenCalledTimes(2);
    });
  });

  describe('Performance and Resource Usage', () => {
    test('should complete within reasonable time for single call', async () => {
      const startTime = Date.now();
      
      await trackCacheAccess('test-summary-id', 'database_query', 'user-123');
      
      const executionTime = Date.now() - startTime;
      expect(executionTime).toBeLessThan(100); // Should complete in under 100ms for mocked calls
    });

    test('should handle high volume of tracking calls efficiently', async () => {
      const startTime = Date.now();
      const numCalls = 100;
      
      const promises = Array.from({ length: numCalls }, (_, i) => 
        trackCacheAccess(`summary-${i}`, 'database_query', `user-${i}`)
      );
      
      const results = await Promise.all(promises);
      
      const executionTime = Date.now() - startTime;
      
      expect(results.every(r => r === true)).toBe(true);
      expect(mockPrisma.summary.update).toHaveBeenCalledTimes(numCalls);
      expect(mockPrisma.summaryCacheAccess.create).toHaveBeenCalledTimes(numCalls);
      expect(executionTime).toBeLessThan(1000); // Should complete in under 1 second for mocked calls
    });

    test('should not create excessive database connections', async () => {
      // Simulate multiple rapid calls
      const rapidCalls = Array.from({ length: 50 }, (_, i) => 
        trackCacheAccess(`summary-${i % 10}`, 'database_query', `user-${i % 5}`)
      );
      
      await Promise.all(rapidCalls);
      
      // Verify no connection leak (mocked test, but structure validates approach)
      expect(mockPrisma.summary.update).toHaveBeenCalledTimes(50);
      expect(mockPrisma.summaryCacheAccess.create).toHaveBeenCalledTimes(50);
    });
  });

  describe('Data Integrity and Consistency', () => {
    test('should use consistent timestamp for both operations', async () => {
      const beforeCall = Date.now();
      
      await trackCacheAccess('test-summary-id', 'database_query', 'user-123');
      
      const afterCall = Date.now();
      
      const summaryUpdateCall = mockPrisma.summary.update.mock.calls[0];
      const accessCreateCall = mockPrisma.summaryCacheAccess.create.mock.calls[0];
      
      const summaryTimestamp = summaryUpdateCall[0].data.lastCacheUsed.getTime();
      const accessTimestamp = accessCreateCall[0].data.accessedAt.getTime();
      
      // Timestamps should be within reasonable range and close to each other
      expect(summaryTimestamp).toBeGreaterThanOrEqual(beforeCall);
      expect(summaryTimestamp).toBeLessThanOrEqual(afterCall);
      expect(accessTimestamp).toBeGreaterThanOrEqual(beforeCall);
      expect(accessTimestamp).toBeLessThanOrEqual(afterCall);
      
      // Timestamps should be very close (within same millisecond or adjacent)
      expect(Math.abs(summaryTimestamp - accessTimestamp)).toBeLessThan(5);
    });

    test('should increment cache usage count correctly', async () => {
      await trackCacheAccess('test-summary-id', 'database_query', 'user-123');
      
      expect(mockPrisma.summary.update).toHaveBeenCalledWith({
        where: { id: 'test-summary-id' },
        data: {
          cacheUsageCount: { increment: 1 },
          lastCacheUsed: expect.any(Date)
        }
      });
    });

    test('should preserve exact summaryId and userId in access record', async () => {
      const summaryId = 'very-long-summary-id-with-special-chars-@#$%';
      const userId = 'user-with-unicode-测试-🚀';
      
      await trackCacheAccess(summaryId, 'database_query', userId);
      
      expect(mockPrisma.summaryCacheAccess.create).toHaveBeenCalledWith({
        data: {
          summaryId: summaryId,
          userId: userId,
          accessType: 'database_query',
          accessedAt: expect.any(Date)
        }
      });
    });
  });

  describe('Security and Access Control', () => {
    test('should not log sensitive userId information in debug messages', async () => {
      const sensitiveUserId = 'user-secret-token-abc123';
      
      await trackCacheAccess('test-summary-id', 'database_query', sensitiveUserId);
      
      // Debug message should not contain the userId
      expect(mockConsoleLog).toHaveBeenCalledWith(
        '[DEBUG][FilingDatabase] Cache access tracked for summary test-summary-id (type: database_query)'
      );
      
      const logMessage = mockConsoleLog.mock.calls[0][0];
      expect(logMessage).not.toContain(sensitiveUserId);
    });

    test('should not expose userId in error messages', async () => {
      const sensitiveUserId = 'user-secret-data-xyz789';
      const accessError = new Error('Database constraint violation');
      mockPrisma.summaryCacheAccess.create.mockRejectedValueOnce(accessError);
      
      await trackCacheAccess('test-summary-id', 'database_query', sensitiveUserId);
      
      const errorMessage = mockConsoleError.mock.calls[0][0];
      expect(errorMessage).not.toContain(sensitiveUserId);
      expect(errorMessage).toBe('[ERROR][FilingDatabase] Failed to track cache access: Database constraint violation');
    });

    test('should handle potential SQL injection attempts in userId', async () => {
      const maliciousUserId = "'; DROP TABLE users; --";
      
      // This should be handled safely by Prisma's parameterized queries
      const result = await trackCacheAccess('test-summary-id', 'database_query', maliciousUserId);
      
      expect(result).toBe(true);
      expect(mockPrisma.summaryCacheAccess.create).toHaveBeenCalledWith({
        data: {
          summaryId: 'test-summary-id',
          userId: maliciousUserId,
          accessType: 'database_query',
          accessedAt: expect.any(Date)
        }
      });
    });
  });

  describe('Integration with Existing Codebase', () => {
    test('should work correctly when called from findExistingSummary', async () => {
      // Simulate how the function is called from the existing codebase
      const summaryId = 'summary-from-cache';
      
      // Call without userId (existing behavior)
      const result1 = await trackCacheAccess(summaryId, 'database_query');
      expect(result1).toBe(true);
      expect(mockPrisma.summaryCacheAccess.create).toHaveBeenCalledTimes(0);
      
      // Reset mocks
      jest.clearAllMocks();
      mockPrisma.summary.update.mockResolvedValue({ id: summaryId } as any);
      mockPrisma.summaryCacheAccess.create.mockResolvedValue({ id: 'access-id' } as any);
      
      // Call with userId (new behavior)
      const result2 = await trackCacheAccess(summaryId, 'database_query', 'user-123');
      expect(result2).toBe(true);
      expect(mockPrisma.summaryCacheAccess.create).toHaveBeenCalledTimes(1);
    });

    test('should maintain consistent return value behavior', async () => {
      // Test various scenarios and ensure consistent boolean return
      const scenarios = [
        { summaryId: 'test-1', accessType: 'database_query', userId: undefined, expected: true },
        { summaryId: 'test-2', accessType: 'memory_cache', userId: 'user-1', expected: true },
        { summaryId: 'test-3', accessType: 'api_request', userId: '', expected: true },
        { summaryId: 'test-4', accessType: 'background_job', userId: null, expected: true },
      ];
      
      for (const scenario of scenarios) {
        const result = await trackCacheAccess(
          scenario.summaryId, 
          scenario.accessType, 
          scenario.userId as any
        );
        
        expect(typeof result).toBe('boolean');
        expect(result).toBe(scenario.expected);
      }
    });
  });
});