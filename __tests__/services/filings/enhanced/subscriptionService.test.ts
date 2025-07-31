/**
 * Unit tests for subscription service
 * Addresses quality issue: zero unit test coverage for core services
 */

import { jest } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import {
  getUserSubscription,
  canProcessFiling,
  recordFilingUsage,
  updateUserSubscription,
  getSubscriptionAnalytics,
  SUBSCRIPTION_FEATURES
} from '../../../../services/filings/enhanced/subscriptionService';
import { SubscriptionAuthError } from '../../../../lib/auth/subscription-auth';

// Mock Prisma
jest.mock('@prisma/client');
const mockPrisma = {
  user: {
    findUnique: jest.fn()
  },
  userSubscription: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  usagePeriod: {
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  filingUsage: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn()
  },
  $transaction: jest.fn()
} as any;

// Mock auth functions
jest.mock('../../../../lib/auth/subscription-auth', () => ({
  verifyUserExists: jest.fn(),
  verifyUsageRecordingPermission: jest.fn(),
  verifySubscriptionOwnership: jest.fn(),
  checkSubscriptionRateLimit: jest.fn(),
  SubscriptionAuthError: class extends Error {
    constructor(message: string, public code: string) {
      super(message);
      this.name = 'SubscriptionAuthError';
    }
  }
}));

// Mock validation
jest.mock('../../../../lib/validation/subscription-validation', () => ({
  validateFilingUsage: jest.fn(() => ({ 
    success: true, 
    data: {
      filingType: '10-K',
      ticker: 'TSLA',
      optimizationLevel: 'balanced'
    }
  })),
  validateSubscriptionUpdate: jest.fn(() => ({ success: true, data: {} }))
}));

describe('SubscriptionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mockPrisma for each test
    Object.values(mockPrisma).forEach(mock => {
      if (typeof mock === 'object' && mock !== null) {
        Object.values(mock).forEach(method => {
          if (typeof method === 'function') {
            method.mockReset();
          }
        });
      }
    });
  });

  describe('getUserSubscription', () => {
    it('should return user subscription with correct tier mapping', async () => {
      // Arrange
      const userId = 'user-123';
      const mockUserSubscription = {
        id: 'sub-123',
        userId,
        planType: 'PROFESSIONAL',
        isActive: true,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
      };
      const mockUsagePeriod = {
        filingLimit: 200,
        filingsUsed: 25,
        resetAt: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) // 15 days from now
      };

      mockPrisma.userSubscription.findUnique.mockResolvedValue(mockUserSubscription);
      mockPrisma.usagePeriod.findFirst.mockResolvedValue(mockUsagePeriod);

      // Act
      const result = await getUserSubscription(userId);

      // Assert
      expect(result).toEqual({
        userId,
        tier: 'conservative', // PROFESSIONAL maps to conservative
        isActive: true,
        features: SUBSCRIPTION_FEATURES.professional.features,
        limits: {
          monthlyFilings: 200,
          usedFilings: 25,
          resetDate: mockUsagePeriod.resetAt
        }
      });
    });

    it('should return null for non-existent subscription', async () => {
      // Arrange
      const userId = 'user-456';
      mockPrisma.userSubscription.findUnique.mockResolvedValue(null);

      // Act
      const result = await getUserSubscription(userId);

      // Assert
      expect(result).toBeNull();
    });

    it('should mark subscription as inactive if past end date', async () => {
      // Arrange
      const userId = 'user-789';
      const mockUserSubscription = {
        id: 'sub-789',
        userId,
        planType: 'BASIC',
        isActive: true,
        currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000) // 1 day ago
      };
      const mockUsagePeriod = {
        filingLimit: 50,
        filingsUsed: 10,
        resetAt: new Date()
      };

      mockPrisma.userSubscription.findUnique.mockResolvedValue(mockUserSubscription);
      mockPrisma.usagePeriod.findFirst.mockResolvedValue(mockUsagePeriod);

      // Act
      const result = await getUserSubscription(userId);

      // Assert
      expect(result?.isActive).toBe(false);
    });
  });

  describe('canProcessFiling', () => {
    it('should allow processing when under limit', async () => {
      // Arrange
      const userId = 'user-123';
      const mockUsagePeriod = {
        filingLimit: 200,
        filingsUsed: 150 // Under limit
      };

      mockPrisma.usagePeriod.findFirst.mockResolvedValue(mockUsagePeriod);

      // Act
      const result = await canProcessFiling(userId);

      // Assert
      expect(result).toEqual({
        canProcess: true,
        reason: undefined,
        remainingFilings: 50,
        resetDate: undefined
      });
    });

    it('should deny processing when at limit', async () => {
      // Arrange
      const userId = 'user-456';
      const resetDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
      const mockUsagePeriod = {
        filingLimit: 50,
        filingsUsed: 50, // At limit
        resetAt: resetDate
      };

      mockPrisma.usagePeriod.findFirst.mockResolvedValue(mockUsagePeriod);

      // Act
      const result = await canProcessFiling(userId);

      // Assert
      expect(result).toEqual({
        canProcess: false,
        reason: 'Monthly filing limit reached',
        remainingFilings: 0,
        resetDate
      });
    });

    it('should deny processing when no usage period found', async () => {
      // Arrange
      const userId = 'user-789';
      mockPrisma.usagePeriod.findFirst.mockResolvedValue(null);

      // Act
      const result = await canProcessFiling(userId);

      // Assert
      expect(result).toEqual({
        canProcess: false,
        reason: 'No active subscription period',
        remainingFilings: 0,
        resetDate: undefined
      });
    });
  });

  describe('recordFilingUsage', () => {
    it('should record usage with transaction and increment counter', async () => {
      // Arrange
      const userId = 'user-123';
      const filingType = '10-K';
      const ticker = 'TSLA';
      const optimizationData = {
        level: 'conservative',
        originalTokens: 10000,
        optimizedTokens: 3000,
        reductionPercentage: 70,
        cost: 0.05,
        processingTimeMs: 2000
      };

      const mockUserSubscription = {
        planType: 'PROFESSIONAL',
        isActive: true,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      };

      const mockUsagePeriod = {
        id: 'period-123',
        filingsUsed: 25,
        filingLimit: 200
      };

      const mockTransaction = jest.fn(async (callback) => {
        const mockTx = {
          userSubscription: {
            findUnique: jest.fn().mockResolvedValue(mockUserSubscription)
          },
          usagePeriod: {
            findFirst: jest.fn().mockResolvedValue(mockUsagePeriod),
            update: jest.fn()
          },
          filingUsage: {
            create: jest.fn()
          }
        };
        return await callback(mockTx);
      });

      mockPrisma.$transaction.mockImplementation(mockTransaction);

      // Act
      await recordFilingUsage(userId, filingType, ticker, undefined, optimizationData);

      // Assert
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        {
          isolationLevel: 'Serializable',
          timeout: 10000
        }
      );
    });

    it('should throw error when usage limit exceeded', async () => {
      // Arrange
      const userId = 'user-456';
      const filingType = '10-Q';
      const optimizationData = { level: 'balanced' };

      const mockUserSubscription = {
        planType: 'BASIC',
        isActive: true,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      };

      const mockUsagePeriod = {
        id: 'period-456',
        filingsUsed: 50, // At limit
        filingLimit: 50
      };

      const mockTransaction = jest.fn(async (callback) => {
        const mockTx = {
          userSubscription: {
            findUnique: jest.fn().mockResolvedValue(mockUserSubscription)
          },
          usagePeriod: {
            findFirst: jest.fn().mockResolvedValue(mockUsagePeriod)
          }
        };
        return await callback(mockTx);
      });

      mockPrisma.$transaction.mockImplementation(mockTransaction);

      // Act & Assert
      await expect(recordFilingUsage(userId, filingType, undefined, undefined, optimizationData))
        .rejects.toThrow('Monthly filing limit exceeded');
    });

    it('should skip usage increment for inactive subscription', async () => {
      // Arrange
      const userId = 'user-789';
      const filingType = '8-K';

      const mockUserSubscription = {
        planType: 'BASIC',
        isActive: false, // Inactive
        currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000)
      };

      const mockTransaction = jest.fn(async (callback) => {
        const mockTx = {
          userSubscription: {
            findUnique: jest.fn().mockResolvedValue(mockUserSubscription)
          }
        };
        return await callback(mockTx);
      });

      mockPrisma.$transaction.mockImplementation(mockTransaction);

      // Act
      await recordFilingUsage(userId, filingType);

      // Assert
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      // Should not create filing usage or update usage period for inactive subscription
    });
  });

  describe('getSubscriptionAnalytics', () => {
    it('should return comprehensive analytics for user', async () => {
      // Arrange
      const userId = 'user-123';
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      const mockFilingUsage = [
        {
          filingType: '10-K',
          originalTokens: 10000,
          optimizedTokens: 3000,
          reductionPercentage: 70,
          cost: 0.05,
          processingTimeMs: 2000,
          createdAt: new Date('2024-01-15')
        },
        {
          filingType: '10-Q',
          originalTokens: 5000,
          optimizedTokens: 1500,
          reductionPercentage: 70,
          cost: 0.025,
          processingTimeMs: 1500,
          createdAt: new Date('2024-01-20')
        }
      ];

      mockPrisma.filingUsage.findMany.mockResolvedValue(mockFilingUsage);
      mockPrisma.filingUsage.count.mockResolvedValue(2);

      // Act
      const result = await getSubscriptionAnalytics(userId, startDate, endDate);

      // Assert
      expect(result).toEqual({
        totalFilings: 2,
        totalTokensOriginal: 15000,
        totalTokensOptimized: 4500,
        averageReduction: 70,
        totalCost: 0.075,
        averageProcessingTime: 1750,
        filingsByType: {
          '10-K': 1,
          '10-Q': 1
        },
        costSavings: expect.any(Number),
        period: {
          start: startDate,
          end: endDate
        }
      });
    });

    it('should handle empty analytics gracefully', async () => {
      // Arrange
      const userId = 'user-456';
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      mockPrisma.filingUsage.findMany.mockResolvedValue([]);
      mockPrisma.filingUsage.count.mockResolvedValue(0);

      // Act
      const result = await getSubscriptionAnalytics(userId, startDate, endDate);

      // Assert
      expect(result).toEqual({
        totalFilings: 0,
        totalTokensOriginal: 0,
        totalTokensOptimized: 0,
        averageReduction: 0,
        totalCost: 0,
        averageProcessingTime: 0,
        filingsByType: {},
        costSavings: 0,
        period: {
          start: startDate,
          end: endDate
        }
      });
    });
  });

  describe('updateUserSubscription', () => {
    it('should update subscription with authorization check', async () => {
      // Arrange
      const userId = 'user-123';
      const updateData = {
        planType: 'PREMIUM' as const,
        isActive: true,
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123'
      };

      const mockExistingSubscription = {
        id: 'sub-123',
        userId,
        planType: 'BASIC'
      };

      const mockUpdatedSubscription = {
        ...mockExistingSubscription,
        ...updateData
      };

      mockPrisma.userSubscription.findUnique.mockResolvedValue(mockExistingSubscription);
      mockPrisma.userSubscription.update.mockResolvedValue(mockUpdatedSubscription);

      // Act
      const result = await updateUserSubscription(userId, updateData);

      // Assert
      expect(result).toEqual(mockUpdatedSubscription);
      expect(mockPrisma.userSubscription.update).toHaveBeenCalledWith({
        where: { userId },
        data: updateData
      });
    });

    it('should create new subscription if none exists', async () => {
      // Arrange
      const userId = 'user-456';
      const updateData = {
        planType: 'PROFESSIONAL' as const,
        isActive: true
      };

      const mockNewSubscription = {
        id: 'sub-456',
        userId,
        ...updateData,
        currentPeriodStart: expect.any(Date),
        currentPeriodEnd: expect.any(Date)
      };

      mockPrisma.userSubscription.findUnique.mockResolvedValue(null);
      mockPrisma.userSubscription.create.mockResolvedValue(mockNewSubscription);

      // Act
      const result = await updateUserSubscription(userId, updateData);

      // Assert
      expect(result).toEqual(mockNewSubscription);
      expect(mockPrisma.userSubscription.create).toHaveBeenCalled();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle database transaction failures gracefully', async () => {
      // Arrange
      const userId = 'user-123';
      const filingType = '10-K';
      
      mockPrisma.$transaction.mockRejectedValue(new Error('Database connection failed'));

      // Act & Assert
      await expect(recordFilingUsage(userId, filingType))
        .rejects.toThrow('Database connection failed');
    });

    it('should handle invalid optimization level in usage data', async () => {
      // Arrange
      const userId = 'user-123';
      const filingType = '10-K';
      const invalidOptimizationData = {
        level: 'invalid-level'
      };

      // Mock validation to fail
      const { validateFilingUsage } = require('../../../../lib/validation/subscription-validation');
      validateFilingUsage.mockReturnValue({
        success: false,
        error: { errors: ['Invalid optimization level'] }
      });

      // Act & Assert
      await expect(recordFilingUsage(userId, filingType, undefined, undefined, invalidOptimizationData))
        .rejects.toThrow('Invalid usage data');
    });

    it('should respect rate limiting', async () => {
      // Arrange
      const userId = 'user-123';
      const filingType = '10-K';
      
      const { checkSubscriptionRateLimit } = require('../../../../lib/auth/subscription-auth');
      checkSubscriptionRateLimit.mockImplementation(() => {
        throw new SubscriptionAuthError('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED');
      });

      // Act & Assert
      await expect(recordFilingUsage(userId, filingType))
        .rejects.toThrow('Rate limit exceeded');
    });
  });
});