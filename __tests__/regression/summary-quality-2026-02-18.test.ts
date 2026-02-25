/**
 * Summary Quality Regression Tests (2026-02-18)
 *
 * Verifies the three original production quality issues are fixed end-to-end:
 * 1. GOOGL Form 4: Gift/Transfer transactions shown as "BOUGHT $0"
 * 2. JNJ Form 4: PSU Awards shown as "BOUGHT $0"
 * 3. Complete 21-code coverage: Only code P maps to "purchase" bucket
 *
 * These tests use the real classification functions (not mocked) to verify
 * production behavior matches expected output.
 */

import {
  isTransferTransaction,
  isGiftTransaction,
  isPurchaseTransaction,
  isAwardTransaction,
  isExerciseTransaction,
  isOtherTransaction,
  isSaleTransaction,
  aggregateTransactionsByType,
  getTransactionTypeConfig,
} from '../../components/ui/email/templates/form4-minimalist-template';

// Helper to create a minimal transaction
function tx(overrides: {
  type?: string;
  code?: string;
  shares?: string | number;
  pricePerShare?: string | number;
  totalValue?: string | number;
  acquisitionDisposition?: string;
} = {}) {
  return {
    type: overrides.type,
    code: overrides.code,
    shares: overrides.shares,
    pricePerShare: overrides.pricePerShare,
    totalValue: overrides.totalValue,
    acquisitionDisposition: overrides.acquisitionDisposition,
  };
}

describe('Summary Quality Regression Tests (2026-02-18)', () => {
  describe('GOOGL Form 4 - Gift/Transfer not shown as BOUGHT', () => {
    it('should classify gift transaction with code G into gift bucket', () => {
      // Simulate GOOGL filing: Director gift of Class C shares
      const transactions = [
        tx({ code: 'G', type: 'Gift', shares: 5000, pricePerShare: 0, acquisitionDisposition: 'D' }),
      ];
      const result = aggregateTransactionsByType(transactions);

      expect(result.length).toBe(1);
      expect(result[0].type).toBe('gift');
      expect(result[0].type).not.toBe('purchase');
    });

    it('should classify transfer transaction with trust text into transfer bucket', () => {
      // Simulate: transfer from direct to revocable trust
      const transactions = [
        tx({ code: 'J', type: 'Trust Transfer', shares: 10000, pricePerShare: 0 }),
      ];
      const result = aggregateTransactionsByType(transactions);

      expect(result.length).toBe(1);
      expect(result[0].type).toBe('transfer');
      expect(result[0].type).not.toBe('purchase');
    });

    it('should display "Gift" label for gift transactions, not "Bought"', () => {
      const config = getTransactionTypeConfig('gift');
      expect(config.label).toBe('Gift');
      expect(config.label).not.toBe('Bought');
    });

    it('should display "Transfer" label for transfer transactions, not "Bought"', () => {
      const config = getTransactionTypeConfig('transfer');
      expect(config.label).toBe('Transfer');
      expect(config.label).not.toBe('Bought');
    });
  });

  describe('JNJ Form 4 - PSU Awards not shown as BOUGHT $0', () => {
    it('should classify PSU award with code A into award bucket', () => {
      // Simulate JNJ filing: PSU award transactions
      const transactions = [
        tx({ code: 'A', type: 'PSU Award', shares: 2500, pricePerShare: 0, acquisitionDisposition: 'A' }),
      ];
      const result = aggregateTransactionsByType(transactions);

      expect(result.length).toBe(1);
      expect(result[0].type).toBe('award');
      expect(result[0].type).not.toBe('purchase');
    });

    it('should handle multiple insider awards in same filing', () => {
      // Multiple transactions all code A
      const transactions = [
        tx({ code: 'A', type: 'PSU Award', shares: 1000, pricePerShare: 0, acquisitionDisposition: 'A' }),
        tx({ code: 'A', type: 'RSU Award', shares: 2000, pricePerShare: 0, acquisitionDisposition: 'A' }),
        tx({ code: 'A', type: 'Stock Grant', shares: 500, pricePerShare: 0, acquisitionDisposition: 'A' }),
      ];
      const result = aggregateTransactionsByType(transactions);

      // All should aggregate into a single award bucket
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('award');
      expect(result[0].totalShares).toBe(3500);
      expect(result[0].count).toBe(3);
    });

    it('should display "Awarded" label for award transactions, not "Bought"', () => {
      const config = getTransactionTypeConfig('award');
      expect(config.label).toBe('Awarded');
      expect(config.label).not.toBe('Bought');
    });

    it('should classify "Restricted Stock Units" type as award (COIN Form 4 fix)', () => {
      // When AI returns type="Restricted Stock Units" without a SEC code,
      // the text-based detection should catch it
      const transactions = [
        tx({ type: 'Restricted Stock Units', shares: 121713, pricePerShare: 0, acquisitionDisposition: 'A' }),
      ];
      const result = aggregateTransactionsByType(transactions);

      expect(result.length).toBe(1);
      expect(result[0].type).toBe('award');
      expect(result[0].type).not.toBe('other');
    });

    it('should classify "restricted stock" in type text as award', () => {
      expect(isAwardTransaction(tx({ type: 'Restricted Stock' }))).toBe(true);
      expect(isAwardTransaction(tx({ type: 'Restricted Stock Units' }))).toBe(true);
      expect(isAwardTransaction(tx({ type: 'restricted stock award' }))).toBe(true);
    });

    it('should not show misleading green color for awards', () => {
      const awardConfig = getTransactionTypeConfig('award');
      const purchaseConfig = getTransactionTypeConfig('purchase');
      // Award (amber) should be visually distinct from purchase (green)
      expect(awardConfig.bgColor).not.toBe(purchaseConfig.bgColor);
      expect(awardConfig.color).not.toBe(purchaseConfig.color);
    });
  });

  describe('Classification functions correctly exclude non-matching codes', () => {
    it('should NOT classify code A as purchase (the original bug)', () => {
      expect(isPurchaseTransaction(tx({ code: 'A' }))).toBe(false);
      expect(isPurchaseTransaction(tx({ code: 'A', type: 'PSU Award' }))).toBe(false);
    });

    it('should NOT classify code G as purchase', () => {
      expect(isPurchaseTransaction(tx({ code: 'G' }))).toBe(false);
    });

    it('should NOT classify code F as sale (tax withholding, not a sale)', () => {
      expect(isSaleTransaction(tx({ code: 'F', type: 'Tax Withholding' }))).toBe(false);
    });

    it('should NOT classify code D as sale (disposition to issuer)', () => {
      expect(isSaleTransaction(tx({ code: 'D', acquisitionDisposition: 'D', pricePerShare: 100 }))).toBe(false);
    });

    it('should correctly identify code P as purchase', () => {
      expect(isPurchaseTransaction(tx({ code: 'P' }))).toBe(true);
    });

    it('should correctly identify code S as sale', () => {
      expect(isSaleTransaction(tx({ code: 'S', type: 'Sale', pricePerShare: 50 }))).toBe(true);
    });
  });

  describe('Default fallback is "other", not "purchase"', () => {
    it('should classify unknown/empty transaction as "other"', () => {
      const result = aggregateTransactionsByType([
        tx({ shares: 100 }),
      ]);
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('other');
    });

    it('should classify unknown code as "other"', () => {
      const result = aggregateTransactionsByType([
        tx({ code: 'QQ', shares: 100 }),
      ]);
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('other');
    });
  });

  describe('Complete 21-code coverage', () => {
    const allCodes = ['P', 'S', 'V', 'A', 'D', 'F', 'I', 'M', 'C', 'E', 'H', 'O', 'X', 'G', 'L', 'W', 'Z', 'J', 'K', 'U'];

    it.each(allCodes)(
      'should not classify code %s as "purchase" (unless code is P)',
      (code) => {
        const result = aggregateTransactionsByType([
          tx({ code, shares: 100, pricePerShare: code === 'S' ? 50 : 0 }),
        ]);
        expect(result.length).toBe(1);
        if (code === 'P') {
          expect(result[0].type).toBe('purchase');
        } else {
          expect(result[0].type).not.toBe('purchase');
        }
      }
    );

    it('should map all 20 non-P codes to their semantically correct buckets', () => {
      const expectedBuckets: Record<string, string> = {
        S: 'sale',
        A: 'award', I: 'award',
        M: 'exercise', C: 'exercise', X: 'exercise', O: 'exercise', E: 'exercise', H: 'exercise',
        G: 'gift', W: 'gift',
        J: 'transfer', K: 'transfer', Z: 'transfer',
        D: 'other', F: 'other', U: 'other', V: 'other', L: 'other',
      };

      for (const [code, expectedBucket] of Object.entries(expectedBuckets)) {
        const result = aggregateTransactionsByType([
          tx({ code, shares: 100, pricePerShare: code === 'S' ? 50 : 0 }),
        ]);
        expect(result[0].type).toBe(expectedBucket);
      }
    });
  });

  describe('Mixed transaction filings (real-world patterns)', () => {
    it('should handle award + tax withholding filing (common RSU vest pattern)', () => {
      // Common pattern: RSU vest (code A) + tax withholding (code F)
      const transactions = [
        tx({ code: 'A', type: 'RSU Vesting', shares: 1000, pricePerShare: 0, acquisitionDisposition: 'A' }),
        tx({ code: 'F', type: 'Tax Withholding', shares: 350, pricePerShare: 150, acquisitionDisposition: 'D' }),
      ];
      const result = aggregateTransactionsByType(transactions);

      expect(result.length).toBe(2);
      const award = result.find(r => r.type === 'award');
      const other = result.find(r => r.type === 'other');
      expect(award).toBeDefined();
      expect(other).toBeDefined();
      expect(award!.totalShares).toBe(1000);
      expect(other!.totalShares).toBe(350);
    });

    it('should handle exercise + sale filing (cashless exercise pattern)', () => {
      // Common pattern: Option exercise (code M) + Sale (code S)
      const transactions = [
        tx({ code: 'M', type: 'Option Exercise', shares: 5000, pricePerShare: 25, acquisitionDisposition: 'A' }),
        tx({ code: 'S', type: 'Sale', shares: 5000, pricePerShare: 150, acquisitionDisposition: 'D' }),
      ];
      const result = aggregateTransactionsByType(transactions);

      expect(result.length).toBe(2);
      const exercise = result.find(r => r.type === 'exercise');
      const sale = result.find(r => r.type === 'sale');
      expect(exercise).toBeDefined();
      expect(sale).toBeDefined();
    });

    it('should handle gift + transfer in same filing', () => {
      const transactions = [
        tx({ code: 'G', type: 'Gift', shares: 1000, pricePerShare: 0 }),
        tx({ code: 'J', type: 'Trust Transfer', shares: 5000, pricePerShare: 0 }),
      ];
      const result = aggregateTransactionsByType(transactions);

      expect(result.length).toBe(2);
      expect(result.find(r => r.type === 'gift')).toBeDefined();
      expect(result.find(r => r.type === 'transfer')).toBeDefined();
      // Neither should be "purchase"
      expect(result.find(r => r.type === 'purchase')).toBeUndefined();
    });
  });
});
