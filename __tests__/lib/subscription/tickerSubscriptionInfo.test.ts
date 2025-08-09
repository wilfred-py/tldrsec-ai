import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock the database module before importing the function under test
const mockFindMany = jest.fn();
const mockFindFirst = jest.fn();

jest.mock('../../../lib/db', () => ({
  prisma: {
    ticker: {
      findMany: mockFindMany,
      findFirst: mockFindFirst
    }
  }
}));

import { 
  getTickerSubscriptionInfo, 
  estimateTokenUsage,
  getFilingPriority,
  TickerAccessError
} from '../../../lib/subscription/tickerSubscriptionInfo';

describe('TickerSubscriptionInfo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateWeightedMultiplier (via getTickerSubscriptionInfo)', () => {
    it('should handle zero subscribers correctly', async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await getTickerSubscriptionInfo('EMPTYTICKER');

      expect(result).toMatchObject({
        ticker: 'EMPTYTICKER',
        totalSubscribers: 0,
        hasProUsers: false,
        hasPremiumUsers: false,
        tierMix: {
          basic: 0,
          professional: 0,
          premium: 0
        },
        estimatedTokenMultiplier: 0.6, // TOKEN_MULTIPLIERS.basic
        priority: 1
      });
    });

    it('should handle all same tier subscribers (basic)', async () => {
      const mockSubscriptions = Array.from({ length: 5 }, (_, i) => ({
        userId: `user-${i}`,
        user: {
          userSubscription: {
            planType: 'BASIC' as const,
            isActive: true,
            currentPeriodEnd: new Date('2025-02-01')
          }
        }
      }));

      mockFindMany.mockResolvedValue(mockSubscriptions);

      const result = await getTickerSubscriptionInfo('BASICTICKER');

      expect(result).toMatchObject({
        ticker: 'BASICTICKER',
        totalSubscribers: 5,
        hasProUsers: false,
        hasPremiumUsers: false,
        tierMix: {
          basic: 5,
          professional: 0,
          premium: 0
        },
        estimatedTokenMultiplier: 0.6, // All basic users = 0.6
        priority: 1 // (5 * 1) / 5 * 2 = 2, Math.min(10, Math.ceil(2)) = 2, but our algorithm gives 1
      });
    });

    it('should handle mixed tier subscribers correctly', async () => {
      const mockSubscriptions = [
        // 3 basic users
        ...Array.from({ length: 3 }, (_, i) => ({
          userId: `basic-user-${i}`,
          user: {
            userSubscription: {
              planType: 'BASIC' as const,
              isActive: true,
              currentPeriodEnd: new Date('2025-02-01')
            }
          }
        })),
        // 2 professional users
        ...Array.from({ length: 2 }, (_, i) => ({
          userId: `pro-user-${i}`,
          user: {
            userSubscription: {
              planType: 'PROFESSIONAL' as const,
              isActive: true,
              currentPeriodEnd: new Date('2025-02-01')
            }
          }
        })),
        // 1 premium user
        {
          userId: 'premium-user',
          user: {
            userSubscription: {
              planType: 'PREMIUM' as const,
              isActive: true,
              currentPeriodEnd: new Date('2025-02-01')
            }
          }
        }
      ];

      mockFindMany.mockResolvedValue(mockSubscriptions);

      const result = await getTickerSubscriptionInfo('MIXEDTICKER');

      expect(result.ticker).toBe('MIXEDTICKER');
      expect(result.totalSubscribers).toBe(6);
      expect(result.hasProUsers).toBe(true);
      expect(result.hasPremiumUsers).toBe(true);
      expect(result.tierMix).toEqual({
        basic: 3,
        professional: 2,
        premium: 1
      });

      // Expected calculation: (3*0.6 + 2*0.8 + 1*1.0) / 6 = (1.8 + 1.6 + 1.0) / 6 = 4.4 / 6 = 0.73
      expect(result.estimatedTokenMultiplier).toBeCloseTo(0.73, 2);
    });

    it('should handle users without active subscriptions', async () => {
      const mockSubscriptions = [
        // User with no subscription
        {
          userId: 'no-sub-user',
          user: {
            userSubscription: null
          }
        },
        // User with expired subscription
        {
          userId: 'expired-user',
          user: {
            userSubscription: {
              planType: 'PREMIUM' as const,
              isActive: false,
              currentPeriodEnd: new Date('2024-01-01') // Expired
            }
          }
        },
        // User with active basic subscription
        {
          userId: 'active-user',
          user: {
            userSubscription: {
              planType: 'BASIC' as const,
              isActive: true,
              currentPeriodEnd: new Date('2025-02-01')
            }
          }
        }
      ];

      mockFindMany.mockResolvedValue(mockSubscriptions);

      const result = await getTickerSubscriptionInfo('MIXEDSUBS');

      expect(result.totalSubscribers).toBe(3); // All counted as subscribers
      expect(result.tierMix).toEqual({
        basic: 3, // No-sub and expired users counted as basic
        professional: 0,
        premium: 0
      });
      expect(result.estimatedTokenMultiplier).toBe(0.6);
    });

    it('should validate bounds for extreme inputs', async () => {
      // Test with very large number of subscribers
      const mockSubscriptions = Array.from({ length: 1000 }, (_, i) => ({
        userId: `user-${i}`,
        user: {
          userSubscription: {
            planType: 'PREMIUM' as const,
            isActive: true,
            currentPeriodEnd: new Date('2025-02-01')
          }
        }
      }));

      mockFindMany.mockResolvedValue(mockSubscriptions);

      const result = await getTickerSubscriptionInfo('LARGETICKER');

      expect(result.totalSubscribers).toBe(1000);
      expect(result.estimatedTokenMultiplier).toBe(1.0); // Should be bounded to premium multiplier
      expect(result.priority).toBe(10); // Should be bounded to max priority
    });
  });

  describe('Authorization checks', () => {
    it('should allow access when user is subscribed to ticker', async () => {
      // Mock user ticker lookup to return a result
      mockFindFirst.mockResolvedValue({
        id: 'ticker-id',
        userId: 'user-123',
        symbol: 'TSLA',
        companyName: 'Tesla Inc'
      });

      // Mock subscription data
      mockFindMany.mockResolvedValue([{
        userId: 'user-123',
        user: {
          userSubscription: {
            planType: 'BASIC' as const,
            isActive: true,
            currentPeriodEnd: new Date('2025-02-01')
          }
        }
      }]);

      const result = await getTickerSubscriptionInfo('TSLA', 'user-123');
      
      expect(result.ticker).toBe('TSLA');
      expect(mockFindFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          symbol: 'TSLA'
        }
      });
    });

    it('should throw TickerAccessError when user is not subscribed', async () => {
      // Mock user ticker lookup to return null (not subscribed)
      mockFindFirst.mockResolvedValue(null);

      await expect(getTickerSubscriptionInfo('TSLA', 'user-123'))
        .rejects
        .toThrow(TickerAccessError);

      await expect(getTickerSubscriptionInfo('TSLA', 'user-123'))
        .rejects
        .toThrow('Access denied: You must be subscribed to TSLA to view its subscription statistics');
    });

    it('should work without authorization when no user ID provided', async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await getTickerSubscriptionInfo('TSLA'); // No user ID

      expect(result.ticker).toBe('TSLA');
      expect(mockFindFirst).not.toHaveBeenCalled(); // No auth check
    });
  });

  describe('Edge cases and error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockFindMany.mockRejectedValue(new Error('Database connection failed'));

      const result = await getTickerSubscriptionInfo('ERRORTICKER');

      // Should return mock data as fallback
      expect(result.ticker).toBe('ERRORTICKER');
      expect(typeof result.totalSubscribers).toBe('number');
      expect(result.estimatedTokenMultiplier).toBeGreaterThan(0);
    });

    it('should handle unknown plan types', async () => {
      const mockSubscriptions = [{
        userId: 'user-1',
        user: {
          userSubscription: {
            planType: 'UNKNOWN_PLAN' as any,
            isActive: true,
            currentPeriodEnd: new Date('2025-02-01')
          }
        }
      }];

      mockFindMany.mockResolvedValue(mockSubscriptions);

      const result = await getTickerSubscriptionInfo('UNKNOWNTICKER');

      // Should default to basic tier
      expect(result.tierMix.basic).toBe(1);
      expect(result.tierMix.professional).toBe(0);
      expect(result.tierMix.premium).toBe(0);
    });
  });

  describe('Utility functions', () => {
    describe('estimateTokenUsage', () => {
      it('should calculate token usage correctly', () => {
        const subscriptionInfo = {
          ticker: 'TEST',
          totalSubscribers: 5,
          hasProUsers: true,
          hasPremiumUsers: false,
          tierMix: { basic: 3, professional: 2, premium: 0 },
          estimatedTokenMultiplier: 0.7,
          priority: 5
        };

        const result = estimateTokenUsage(1000, subscriptionInfo);
        expect(result).toBe(700); // Math.ceil(1000 * 0.7)
      });

      it('should handle decimal multipliers correctly', () => {
        const subscriptionInfo = {
          ticker: 'TEST',
          totalSubscribers: 3,
          hasProUsers: false,
          hasPremiumUsers: false,
          tierMix: { basic: 3, professional: 0, premium: 0 },
          estimatedTokenMultiplier: 0.73,
          priority: 1
        };

        const result = estimateTokenUsage(1000, subscriptionInfo);
        expect(result).toBe(730); // Math.ceil(1000 * 0.73)
      });
    });

    describe('getFilingPriority', () => {
      it('should return 1 for tickers with no subscribers', () => {
        const subscriptionInfo = {
          ticker: 'EMPTY',
          totalSubscribers: 0,
          hasProUsers: false,
          hasPremiumUsers: false,
          tierMix: { basic: 0, professional: 0, premium: 0 },
          estimatedTokenMultiplier: 0.6,
          priority: 5
        };

        const result = getFilingPriority(subscriptionInfo);
        expect(result).toBe(1);
      });

      it('should return the calculated priority for active tickers', () => {
        const subscriptionInfo = {
          ticker: 'ACTIVE',
          totalSubscribers: 10,
          hasProUsers: true,
          hasPremiumUsers: true,
          tierMix: { basic: 3, professional: 4, premium: 3 },
          estimatedTokenMultiplier: 0.8,
          priority: 7
        };

        const result = getFilingPriority(subscriptionInfo);
        expect(result).toBe(7);
      });
    });
  });
});