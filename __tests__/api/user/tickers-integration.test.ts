/**
 * Integration Test for dbRetry.mutation() Fix
 * Validates PR #257 fix: dbRetry.transaction() → dbRetry.mutation()
 */

import { dbRetry } from '@/lib/db/retry-wrapper';

describe('Database Retry Integration', () => {
  describe('dbRetry methods validation', () => {
    it('should have mutation method available (not transaction)', () => {
      // This test validates the fix by ensuring the correct method exists
      expect(dbRetry).toHaveProperty('mutation');
      expect(dbRetry.mutation).toBeInstanceOf(Function);
      
      // Verify transaction method does not exist (was causing TypeError)
      expect(dbRetry).not.toHaveProperty('transaction');
    });

    it('should be able to call dbRetry.mutation without TypeError', async () => {
      // Mock a simple database operation
      const mockOperation = jest.fn().mockResolvedValue({ id: 'test' });
      
      // This should not throw TypeError (which was the original issue)
      expect(async () => {
        await dbRetry.mutation(mockOperation);
      }).not.toThrow();
      
      // Verify the operation was executed
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });
  });

  describe('API Route import validation', () => {
    it('should import route module without errors', async () => {
      // This test ensures the route file can be imported without throwing
      expect(() => {
        require('@/app/api/user/tickers/route');
      }).not.toThrow();
    });
  });
});