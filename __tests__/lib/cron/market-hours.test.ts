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
      // New Year's Day (holiday)
      const holiday = new Date('2024-01-01T15:30:00.000Z');
      jest.useFakeTimers().setSystemTime(holiday);
      
      const context = getMarketHoursContext();
      
      expect(context.isMarketHours).toBe(false);
      expect(context.isMarketDay).toBe(false);
      expect(context.isHoliday).toBe(true);
      
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
      currentTime: new Date('2024-01-15T15:30:00.000Z')
    };

    it('should determine eligibility based on tier frequencies', () => {
      const users = [
        {
          id: 'user1',
          subscriptionTier: 'ENTERPRISE' as const,
          lastProcessedAt: new Date(Date.now() - 6 * 60 * 1000), // 6 minutes ago
          budgetUsed: 0.1
        },
        {
          id: 'user2',
          subscriptionTier: 'FREE' as const,
          lastProcessedAt: new Date(Date.now() - 31 * 60 * 1000), // 31 minutes ago
          budgetUsed: 0.05
        }
      ];

      const statuses = getUserProcessingStatuses(users, marketContext);

      // ENTERPRISE should be eligible (5min frequency, last processed 6min ago)
      const enterpriseStatus = statuses.find(s => s.userId === 'user1');
      expect(enterpriseStatus?.eligible).toBe(true);

      // FREE should be eligible (30min frequency, last processed 31min ago)
      const freeStatus = statuses.find(s => s.userId === 'user2');
      expect(freeStatus?.eligible).toBe(true);
    });

    it('should respect budget limits', () => {
      const users = [
        {
          id: 'user1',
          subscriptionTier: 'FREE' as const,
          lastProcessedAt: new Date(Date.now() - 31 * 60 * 1000),
          budgetUsed: 0.19 // Near budget limit of 0.20
        }
      ];

      const statuses = getUserProcessingStatuses(users, marketContext);
      const status = statuses.find(s => s.userId === 'user1');

      // Should still be eligible but flagged for budget concern
      expect(status?.eligible).toBe(true);
      expect(status?.reason).toContain('budget');
    });

    it('should block users over budget limit', () => {
      const users = [
        {
          id: 'user1',
          subscriptionTier: 'FREE' as const,
          lastProcessedAt: new Date(Date.now() - 31 * 60 * 1000),
          budgetUsed: 0.21 // Over budget limit of 0.20
        }
      ];

      const statuses = getUserProcessingStatuses(users, marketContext);
      const status = statuses.find(s => s.userId === 'user1');

      expect(status?.eligible).toBe(false);
      expect(status?.reason).toBe('budget_exceeded');
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

      expect(status?.eligible).toBe(true);
      expect(status?.reason).toBe('first_time_eligible');
    });

    it('should adjust frequencies for off-market hours', () => {
      const offMarketContext = {
        isMarketHours: false,
        isMarketDay: true,
        isHoliday: false,
        currentTime: new Date('2024-01-15T22:00:00.000Z')
      };

      const users = [
        {
          id: 'user1',
          subscriptionTier: 'ENTERPRISE' as const,
          lastProcessedAt: new Date(Date.now() - 31 * 60 * 1000), // 31 minutes ago
          budgetUsed: 0.1
        }
      ];

      const statuses = getUserProcessingStatuses(users, offMarketContext);
      const status = statuses.find(s => s.userId === 'user1');

      // Should be eligible (off-market frequency is 30min for ENTERPRISE)
      expect(status?.eligible).toBe(true);
    });
  });

  describe('getEligibleUsers', () => {
    const allStatuses = [
      { userId: 'user1', tier: 'ENTERPRISE', eligible: true, reason: 'eligible' },
      { userId: 'user2', tier: 'PROFESSIONAL', eligible: true, reason: 'eligible' },
      { userId: 'user3', tier: 'FREE', eligible: true, reason: 'eligible' },
      { userId: 'user4', tier: 'FREE', eligible: false, reason: 'budget_exceeded' },
      { userId: 'user5', tier: 'ENTERPRISE', eligible: true, reason: 'eligible' }
    ];

    it('should filter to only eligible users', () => {
      const eligible = getEligibleUsers(allStatuses, {
        maxUsersPerCycle: 100,
        respectBudgetLimits: true,
        budgetThreshold: 90
      });

      expect(eligible).toHaveLength(4);
      expect(eligible.every(u => u.eligible)).toBe(true);
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

      // Should get ENTERPRISE users first
      const enterpriseCount = eligible.filter(u => u.tier === 'ENTERPRISE').length;
      expect(enterpriseCount).toBe(2); // Both ENTERPRISE users
      
      // Then PROFESSIONAL
      const professionalCount = eligible.filter(u => u.tier === 'PROFESSIONAL').length;
      expect(professionalCount).toBe(1);
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
      expect(TIER_FREQUENCIES.MARKET_HOURS.INSTITUTION).toBe(5);
      expect(TIER_FREQUENCIES.MARKET_HOURS.ENTERPRISE).toBe(5);
      expect(TIER_FREQUENCIES.MARKET_HOURS.PROFESSIONAL).toBe(15);
      expect(TIER_FREQUENCIES.MARKET_HOURS.FREE).toBe(30);
    });

    it('should have correct tier frequencies for off hours', () => {
      expect(TIER_FREQUENCIES.OFF_HOURS.INSTITUTION).toBe(5);
      expect(TIER_FREQUENCIES.OFF_HOURS.ENTERPRISE).toBe(30);
      expect(TIER_FREQUENCIES.OFF_HOURS.PROFESSIONAL).toBe(60);
      expect(TIER_FREQUENCIES.OFF_HOURS.FREE).toBe(120);
    });

    it('should have correct tier budgets', () => {
      expect(TIER_BUDGETS.INSTITUTION).toBe(999999); // Unlimited
      expect(TIER_BUDGETS.ENTERPRISE).toBe(60);
      expect(TIER_BUDGETS.PROFESSIONAL).toBe(15);
      expect(TIER_BUDGETS.FREE).toBe(5);
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

      // Should fall back to FREE tier behavior
      expect(status?.tier).toBe('FREE');
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
      expect(status?.eligible).toBe(true);
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

      expect(status?.eligible).toBe(true);
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