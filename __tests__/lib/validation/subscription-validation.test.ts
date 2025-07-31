/**
 * Unit tests for subscription validation
 * Addresses security issue: input validation testing
 */

import {
  validateSubscriptionUpdate,
  validateFilingUsage,
  validateUsagePeriod,
  validateTokenOptimization,
  subscriptionUpdateSchema,
  filingUsageSchema,
  usagePeriodSchema,
  tokenOptimizationSchema
} from '../../../lib/validation/subscription-validation';

describe('SubscriptionValidation', () => {
  describe('subscriptionUpdateSchema', () => {
    it('should validate correct subscription update data', () => {
      const validData = {
        planType: 'PROFESSIONAL',
        isActive: true,
        cancelAtPeriodEnd: false,
        stripeCustomerId: 'cus_123456789',
        stripeSubscriptionId: 'sub_123456789',
        stripePriceId: 'price_123456789'
      };

      const result = validateSubscriptionUpdate(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validData);
      }
    });

    it('should reject invalid plan type', () => {
      const invalidData = {
        planType: 'INVALID_PLAN',
        isActive: true
      };

      const result = validateSubscriptionUpdate(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain("Invalid enum value");
      }
    });

    it('should allow optional fields to be undefined', () => {
      const minimalData = {
        planType: 'BASIC'
      };

      const result = validateSubscriptionUpdate(minimalData);
      expect(result.success).toBe(true);
    });

    it('should reject non-boolean values for boolean fields', () => {
      const invalidData = {
        planType: 'BASIC',
        isActive: 'yes' // Should be boolean
      };

      const result = validateSubscriptionUpdate(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('filingUsageSchema', () => {
    it('should validate correct filing usage data', () => {
      const validData = {
        filingType: '10-K',
        ticker: 'TSLA',
        accessionNumber: '0000012345-23-000001',
        optimizationLevel: 'conservative',
        originalTokens: 10000,
        optimizedTokens: 3000,
        reductionPercentage: 70.5,
        cost: 0.05,
        processingTimeMs: 2500
      };

      const result = validateFilingUsage(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validData);
      }
    });

    it('should reject empty filing type', () => {
      const invalidData = {
        filingType: '',
        ticker: 'TSLA',
        optimizationLevel: 'balanced'
      };

      const result = validateFilingUsage(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0].message).toContain("String must contain at least 1 character");
      }
    });

    it('should reject invalid ticker format', () => {
      const invalidData = {
        filingType: '10-K',
        ticker: 'ABC!', // Contains invalid characters but within length limit
        optimizationLevel: 'balanced'
      };

      const result = validateFilingUsage(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        // Either length or format error should be caught
        expect(result.error.errors.some(err => 
          err.message.includes("Invalid ticker format") || 
          err.message.includes("String must contain")
        )).toBe(true);
      }
    });

    it('should reject invalid optimization level', () => {
      const invalidData = {
        filingType: '10-K',
        ticker: 'TSLA',
        optimizationLevel: 'super_aggressive' // Not a valid enum value
      };

      const result = validateFilingUsage(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject negative token counts', () => {
      const invalidData = {
        filingType: '10-K',
        ticker: 'TSLA',
        optimizationLevel: 'balanced',
        originalTokens: -100
      };

      const result = validateFilingUsage(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject invalid reduction percentage', () => {
      const invalidData = {
        filingType: '10-K',
        ticker: 'TSLA',
        optimizationLevel: 'balanced',
        reductionPercentage: 150 // Cannot be > 100%
      };

      const result = validateFilingUsage(invalidData);
      expect(result.success).toBe(false);
    });

    it('should allow valid ticker formats', () => {
      const validTickers = ['TSLA', 'AAPL', 'MSFT', 'BRK.A', 'BRK.B'];
      
      validTickers.forEach(ticker => {
        const data = {
          filingType: '10-K',
          ticker,
          optimizationLevel: 'balanced'
        };

        const result = validateFilingUsage(data);
        expect(result.success).toBe(true);
      });
    });
  });

  describe('usagePeriodSchema', () => {
    it('should validate correct usage period data', () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      
      const validData = {
        periodStart: now,
        periodEnd: futureDate,
        planType: 'PROFESSIONAL',
        filingLimit: 200,
        filingsUsed: 50,
        resetAt: futureDate
      };

      const result = validateUsagePeriod(validData);
      expect(result.success).toBe(true);
    });

    it('should reject invalid plan type', () => {
      const invalidData = {
        periodStart: new Date(),
        periodEnd: new Date(),
        planType: 'UNLIMITED', // Invalid plan type
        filingLimit: 100,
        resetAt: new Date()
      };

      const result = validateUsagePeriod(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject zero or negative filing limits', () => {
      const invalidData = {
        periodStart: new Date(),
        periodEnd: new Date(),
        planType: 'BASIC',
        filingLimit: 0, // Should be at least 1
        resetAt: new Date()
      };

      const result = validateUsagePeriod(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject excessive filing limits', () => {
      const invalidData = {
        periodStart: new Date(),
        periodEnd: new Date(),
        planType: 'BASIC',
        filingLimit: 50000, // Exceeds maximum
        resetAt: new Date()
      };

      const result = validateUsagePeriod(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject negative filings used', () => {
      const invalidData = {
        periodStart: new Date(),
        periodEnd: new Date(),
        planType: 'BASIC',
        filingLimit: 50,
        filingsUsed: -5, // Cannot be negative
        resetAt: new Date()
      };

      const result = validateUsagePeriod(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('tokenOptimizationSchema', () => {
    it('should validate correct token optimization data', () => {
      const validData = {
        level: 'conservative',
        preserveFinancialData: true,
        preserveRiskFactors: true,
        preserveMDA: false,
        maxTokens: 100000
      };

      const result = validateTokenOptimization(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(validData);
      }
    });

    it('should apply default values for preservation options', () => {
      const minimalData = {
        level: 'balanced'
      };

      const result = validateTokenOptimization(minimalData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.preserveFinancialData).toBe(true);
        expect(result.data.preserveRiskFactors).toBe(true);
        expect(result.data.preserveMDA).toBe(true);
      }
    });

    it('should reject invalid optimization level', () => {
      const invalidData = {
        level: 'extreme' // Not a valid level
      };

      const result = validateTokenOptimization(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject token limits that are too small', () => {
      const invalidData = {
        level: 'balanced',
        maxTokens: 500 // Below minimum of 1000
      };

      const result = validateTokenOptimization(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject token limits that are too large', () => {
      const invalidData = {
        level: 'balanced',
        maxTokens: 1000000 // Above maximum of 500000
      };

      const result = validateTokenOptimization(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('Edge Cases and Security Tests', () => {
    it('should handle malformed input gracefully', () => {
      const malformedInputs = [
        null,
        undefined,
        'string instead of object',
        123,
        [],
        { toString: () => { throw new Error('malicious toString'); } }
      ];

      malformedInputs.forEach(input => {
        expect(() => validateSubscriptionUpdate(input)).not.toThrow();
        expect(() => validateFilingUsage(input)).not.toThrow();
        expect(() => validateUsagePeriod(input)).not.toThrow();
        expect(() => validateTokenOptimization(input)).not.toThrow();
      });
    });

    it('should prevent SQL injection attempts in string fields', () => {
      const sqlInjectionAttempts = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "<script>alert('xss')</script>",
        "../../etc/passwd"
      ];

      sqlInjectionAttempts.forEach(maliciousInput => {
        const result = validateFilingUsage({
          filingType: maliciousInput,
          ticker: 'TSLA',
          optimizationLevel: 'balanced'
        });

        // Should reject malicious input due to regex validation
        expect(result.success).toBe(false);
      });
    });

    it('should handle very large numbers gracefully', () => {
      const largeNumbers = [
        Number.MAX_SAFE_INTEGER,
        Number.MAX_VALUE,
        Infinity,
        -Infinity,
        NaN
      ];

      largeNumbers.forEach(largeNumber => {
        const result = validateFilingUsage({
          filingType: '10-K',
          ticker: 'TSLA',
          optimizationLevel: 'balanced',
          originalTokens: largeNumber
        });

        if (result.success) {
          expect(Number.isFinite(result.data.originalTokens)).toBe(true);
        }
      });
    });

    it('should validate date objects properly', () => {
      const invalidDates = [
        'not a date',
        new Date('invalid'),
        123456789,
        null
      ];

      invalidDates.forEach(invalidDate => {
        const result = validateUsagePeriod({
          periodStart: invalidDate,
          periodEnd: new Date(),
          planType: 'BASIC',
          filingLimit: 50,
          resetAt: new Date()
        });

        expect(result.success).toBe(false);
      });
    });

    it('should handle circular references in objects', () => {
      const circularObj: any = { filingType: '10-K' };
      circularObj.self = circularObj;

      expect(() => validateFilingUsage(circularObj)).not.toThrow();
    });
  });
});