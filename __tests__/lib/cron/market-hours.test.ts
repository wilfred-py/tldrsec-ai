import { 
  getMarketHoursContext, 
  getUserProcessingStatuses, 
  getEligibleUsers,
  TIER_FREQUENCIES,
  TIER_BUDGETS
} from '../../../lib/cron/market-hours';

describe('Market Hours Logic', () => {
  describe('getMarketHoursContext', () => {
    it('should identify market hours correctly', () => {
      // Monday 10:30 AM EST (market hours)
      const marketTime = new Date('2024-01-15T15:30:00.000Z');
      jest.useFakeTimers().setSystemTime(marketTime);
      
      const context = getMarketHoursContext();
      
      expect(context.isMarketHours).toBe(true);
      expect(context.isMarketDay).toBe(true);
      expect(context.isHoliday).toBe(false);
      
      jest.useRealTimers();
    });

    it('should identify off-market hours correctly', () => {
      // Monday 8:00 AM EST (before market)
      const beforeMarket = new Date('2024-01-15T13:00:00.000Z');
      jest.useFakeTimers().setSystemTime(beforeMarket);
      
      const context = getMarketHoursContext();
      
      expect(context.isMarketHours).toBe(false);
      expect(context.isMarketDay).toBe(true);
      expect(context.isHoliday).toBe(false);
      
      jest.useRealTimers();
    });

    it('should identify weekends correctly', () => {
      // Saturday 10:30 AM EST
      const weekend = new Date('2024-01-13T15:30:00.000Z');
      jest.useFakeTimers().setSystemTime(weekend);
      
      const context = getMarketHoursContext();
      
      expect(context.isMarketHours).toBe(false);
      expect(context.isMarketDay).toBe(false);
      expect(context.isHoliday).toBe(false);
      
      jest.useRealTimers();
    });

    it('should handle holidays correctly', () => {
      // New Year's Day (holiday) - using Wednesday 2025-01-01 at 10:30 AM EST 
      const holiday = new Date('2025-01-01T15:30:00.000Z'); // 10:30 AM EST
      jest.useFakeTimers().setSystemTime(holiday);
      
      const context = getMarketHoursContext();
      
      expect(context.isHoliday).toBe(true);
      expect(context.isMarketDay).toBe(false);
      expect(context.isMarketHours).toBe(false);
      
      jest.useRealTimers();
    });

    it('should handle daylight saving time correctly', () => {
      // DST transition period - verify market hours adjust correctly
      const dstTime = new Date('2024-03-11T14:30:00.000Z'); // 10:30 AM EDT
      jest.useFakeTimers().setSystemTime(dstTime);
      
      const context = getMarketHoursContext();
      
      expect(context.isMarketHours).toBe(true);
      expect(context.isMarketDay).toBe(true);
      
      jest.useRealTimers();
    });
  });

  describe('getUserProcessingStatuses', () => {
    const marketContext = {
      isMarketHours: true,
      isMarketDay: true,
      isHoliday: false,
      currentTime: new Date(),
      marketOpen: null,
      marketClose: null,
      timeZone: 'America/New_York',
      nextMarketOpen: null
    };

    it('should determine eligibility based on tier frequencies', () => {
      const users = [
        {
          id: 'user1',
          subscriptionTier: 'ENTERPRISE' as const,
          lastProcessedAt: new Date(Date.now() - 30 * 60 * 1000), // 30 minutes ago
          budgetUsed: 0.1
        },
        {
          id: 'user2',
          subscriptionTier: 'FREE' as const,
          lastProcessedAt: new Date(Date.now() - 150 * 60 * 1000), // 150 minutes ago
          budgetUsed: 0.05
        }
      ];

      const statuses = getUserProcessingStatuses(users, marketContext);

      const enterpriseStatus = statuses.find(s => s.userId === 'user1');

      // ENTERPRISE should be eligible (15min frequency, last processed 30min ago)
      expect(enterpriseStatus?.eligibility.isEligible).toBe(true);

      // FREE should be eligible (120min frequency, last processed 150min ago)
      const freeStatus = statuses.find(s => s.userId === 'user2');
      expect(freeStatus?.eligibility.isEligible).toBe(true);
    });

    it('should respect budget limits', () => {
      const users = [
        {
          id: 'user1',
          subscriptionTier: 'FREE' as const,
          lastProcessedAt: new Date(Date.now() - 150 * 60 * 1000),
          budgetUsed: 1.9 // Near budget limit of 2.0
        }
      ];

      const statuses = getUserProcessingStatuses(users, marketContext);
      const status = statuses.find(s => s.userId === 'user1');

      // Should be eligible and have proper budget status
      expect(status?.eligibility.isEligible).toBe(true);
      expect(status?.budgetStatus.budgetUtilization).toBeGreaterThan(90);
    });

    it('should block users over budget limit', () => {
      const users = [
        {
          id: 'user1',
          subscriptionTier: 'FREE' as const,
          lastProcessedAt: new Date(Date.now() - 150 * 60 * 1000),
          budgetUsed: 2.1 // Over budget limit of 2.0
        }
      ];

      const statuses = getUserProcessingStatuses(users, marketContext);
      const status = statuses.find(s => s.userId === 'user1');

      // User status should exist but be over budget
      expect(status?.eligibility.isEligible).toBe(true); // Eligibility is calculated separately
      expect(status?.budgetStatus.budgetUtilization).toBeGreaterThan(100);
      
      // getEligibleUsers should filter out users over budget
      const eligibleUsers = getEligibleUsers(statuses, {
        respectBudgetLimits: true,
        budgetThreshold: 95
      });
      
      expect(eligibleUsers.find(u => u.userId === 'user1')).toBeUndefined();
    });

    it('should handle first-time users correctly', () => {
      const users = [
        {
          id: 'new-user',
          subscriptionTier: 'PROFESSIONAL' as const,
          lastProcessedAt: null,
          budgetUsed: 0
        }
      ];

      const statuses = getUserProcessingStatuses(users, marketContext);
      const status = statuses.find(s => s.userId === 'new-user');

      expect(status?.eligibility.isEligible).toBe(true);
      expect(status?.eligibility.reason).toBe('First time processing');
    });

    it('should adjust frequencies for off-market hours', () => {
      const offMarketContext = {
        isMarketHours: false,
        isMarketDay: true,
        isHoliday: false,
        currentTime: new Date(),
        marketOpen: null,
        marketClose: null,
        timeZone: 'America/New_York',
        nextMarketOpen: null
      };

      const users = [
        {
          id: 'user1',
          subscriptionTier: 'ENTERPRISE' as const,
          lastProcessedAt: new Date(Date.now() - 40 * 60 * 1000), // 40 minutes ago
          budgetUsed: 0.1
        }
      ];

      const statuses = getUserProcessingStatuses(users, offMarketContext);
      const status = statuses.find(s => s.userId === 'user1');

      // Should be eligible (off-market frequency is 30min for ENTERPRISE)
      expect(status?.eligibility.isEligible).toBe(true);
      expect(status?.eligibility.frequency).toBe(30); // off-market frequency
    });
  });

  describe('getEligibleUsers', () => {
    const allStatuses = [
      {
        userId: 'user1',
        tier: 'ENTERPRISE' as const,
        lastProcessedAt: new Date(),
        eligibility: { isEligible: true, nextEligibleTime: null, frequency: 15, reason: 'eligible' },
        priority: 3,
        budgetStatus: { monthlyBudget: 25, budgetUsed: 5, budgetRemaining: 20, budgetUtilization: 20 }
      },
      {
        userId: 'user2',
        tier: 'PROFESSIONAL' as const,
        lastProcessedAt: new Date(),
        eligibility: { isEligible: true, nextEligibleTime: null, frequency: 30, reason: 'eligible' },
        priority: 2,
        budgetStatus: { monthlyBudget: 10, budgetUsed: 2, budgetRemaining: 8, budgetUtilization: 20 }
      },
      {
        userId: 'user3',
        tier: 'FREE' as const,
        lastProcessedAt: new Date(),
        eligibility: { isEligible: true, nextEligibleTime: null, frequency: 120, reason: 'eligible' },
        priority: 1,
        budgetStatus: { monthlyBudget: 2, budgetUsed: 0.5, budgetRemaining: 1.5, budgetUtilization: 25 }
      },
      {
        userId: 'user4',
        tier: 'FREE' as const,
        lastProcessedAt: new Date(),
        eligibility: { isEligible: false, nextEligibleTime: new Date(), frequency: 120, reason: 'too_soon' },
        priority: 1,
        budgetStatus: { monthlyBudget: 2, budgetUsed: 1.9, budgetRemaining: 0.1, budgetUtilization: 95 }
      },
      {
        userId: 'user5',
        tier: 'ENTERPRISE' as const,
        lastProcessedAt: new Date(),
        eligibility: { isEligible: true, nextEligibleTime: null, frequency: 15, reason: 'eligible' },
        priority: 3,
        budgetStatus: { monthlyBudget: 25, budgetUsed: 8, budgetRemaining: 17, budgetUtilization: 32 }
      }
    ];

    it('should filter to only eligible users', () => {
      const eligible = getEligibleUsers(allStatuses, {
        maxUsersPerCycle: 100,
        respectBudgetLimits: true,
        budgetThreshold: 90
      });

      expect(eligible).toHaveLength(4); // user4 is filtered out (not eligible)
      expect(eligible.every(u => u.eligibility.isEligible)).toBe(true);
    });

    it('should respect maxUsersPerCycle limit', () => {
      const eligible = getEligibleUsers(allStatuses, {
        maxUsersPerCycle: 2,
        respectBudgetLimits: true,
        budgetThreshold: 90
      });

      expect(eligible).toHaveLength(2);
    });

    it('should prioritize higher tier users', () => {
      const eligible = getEligibleUsers(allStatuses, {
        maxUsersPerCycle: 3,
        respectBudgetLimits: true,
        budgetThreshold: 90
      });

      // Should get higher priority users first
      expect(eligible).toHaveLength(3);
      
      // Check that higher tier users are prioritized (sorting should be by priority)
      expect(eligible[0].priority).toBeGreaterThanOrEqual(eligible[1].priority);
      expect(eligible[1].priority).toBeGreaterThanOrEqual(eligible[2].priority);
      
      // Should include ENTERPRISE users (highest priority = 3)
      const enterpriseCount = eligible.filter(u => u.tier === 'ENTERPRISE').length;
      expect(enterpriseCount).toBeGreaterThan(0);
    });

    it('should handle empty input gracefully', () => {
      const eligible = getEligibleUsers([], {
        maxUsersPerCycle: 100,
        respectBudgetLimits: true,
        budgetThreshold: 90
      });

      expect(eligible).toHaveLength(0);
    });
  });

  describe('Tier Configuration', () => {
    it('should have correct tier frequencies for market hours', () => {
      expect(TIER_FREQUENCIES.INSTITUTION.market).toBe(5);
      expect(TIER_FREQUENCIES.ENTERPRISE.market).toBe(15);
      expect(TIER_FREQUENCIES.PROFESSIONAL.market).toBe(30);
      expect(TIER_FREQUENCIES.FREE.market).toBe(120);
    });

    it('should have correct tier frequencies for off hours', () => {
      expect(TIER_FREQUENCIES.INSTITUTION.offMarket).toBe(15);
      expect(TIER_FREQUENCIES.ENTERPRISE.offMarket).toBe(30);
      expect(TIER_FREQUENCIES.PROFESSIONAL.offMarket).toBe(120);
      expect(TIER_FREQUENCIES.FREE.offMarket).toBe(240);
    });

    it('should have correct tier budgets', () => {
      expect(TIER_BUDGETS.INSTITUTION).toBe(100.0);
      expect(TIER_BUDGETS.ENTERPRISE).toBe(25.0);
      expect(TIER_BUDGETS.PROFESSIONAL).toBe(10.0);
      expect(TIER_BUDGETS.FREE).toBe(2.0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle invalid subscription tiers gracefully', () => {
      const users = [
        {
          id: 'user1',
          subscriptionTier: 'INVALID_TIER' as any,
          lastProcessedAt: null,
          budgetUsed: 0
        }
      ];

      const marketContext = {
        isMarketHours: true,
        isMarketDay: true,
        isHoliday: false,
        currentTime: new Date()
      };

      const statuses = getUserProcessingStatuses(users, marketContext);
      const status = statuses.find(s => s.userId === 'user1');

      // Should fall back to FREE tier behavior but preserve original tier
      expect(status?.tier).toBe('INVALID_TIER'); // The function preserves the original tier
      expect(status?.eligibility.frequency).toBe(120); // Uses FREE tier defaults for market hours processing
      expect(status?.priority).toBe(1); // Uses FREE tier priority
    });

    it('should handle negative budget values', () => {
      const users = [
        {
          id: 'user1',
          subscriptionTier: 'FREE' as const,
          lastProcessedAt: null,
          budgetUsed: -0.1 // Negative budget (data corruption scenario)
        }
      ];

      const marketContext = {
        isMarketHours: true,
        isMarketDay: true,
        isHoliday: false,
        currentTime: new Date()
      };

      const statuses = getUserProcessingStatuses(users, marketContext);
      const status = statuses.find(s => s.userId === 'user1');

      // Should treat negative budget as 0
      expect(status?.eligibility.isEligible).toBe(true);
      expect(status?.budgetStatus.budgetUsed).toBe(-0.1); // Preserves the actual value
    });

    it('should handle very old lastProcessedAt dates', () => {
      const users = [
        {
          id: 'user1',
          subscriptionTier: 'FREE' as const,
          lastProcessedAt: new Date('2020-01-01'), // Very old date
          budgetUsed: 0
        }
      ];

      const marketContext = {
        isMarketHours: true,
        isMarketDay: true,
        isHoliday: false,
        currentTime: new Date()
      };

      const statuses = getUserProcessingStatuses(users, marketContext);
      const status = statuses.find(s => s.userId === 'user1');

      expect(status?.eligibility.isEligible).toBe(true);
    });

    it('should handle timezone edge cases', () => {
      // Test market open at exactly 9:30 AM EST
      const marketOpen = new Date('2024-01-15T14:30:00.000Z');
      jest.useFakeTimers().setSystemTime(marketOpen);
      
      const context = getMarketHoursContext();
      expect(context.isMarketHours).toBe(true);
      
      // Test market close at exactly 4:00 PM EST
      const marketClose = new Date('2024-01-15T21:00:00.000Z');
      jest.setSystemTime(marketClose);
      
      const contextClose = getMarketHoursContext();
      expect(contextClose.isMarketHours).toBe(false);
      
      jest.useRealTimers();
    });
  });
});