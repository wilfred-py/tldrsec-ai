/**
 * Form 4 Transaction Classification - All 21 SEC Codes
 *
 * Tests for the expanded transaction classification system that maps
 * all 21 SEC Form 4 transaction codes into 7 semantically correct display buckets:
 * purchase, sale, award, exercise, gift, transfer, other
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

// Helper to create a minimal TransactionData object
function tx(overrides: { type?: string; code?: string; shares?: string | number; pricePerShare?: string | number; totalValue?: string | number; acquisitionDisposition?: string } = {}) {
  return {
    type: overrides.type,
    code: overrides.code,
    shares: overrides.shares,
    pricePerShare: overrides.pricePerShare,
    totalValue: overrides.totalValue,
    acquisitionDisposition: overrides.acquisitionDisposition,
  };
}

describe('Form 4 Transaction Classification - All 21 SEC Codes', () => {
  describe('isAwardTransaction', () => {
    it('should return true for code A (Award/Grant)', () => {
      expect(isAwardTransaction(tx({ code: 'A' }))).toBe(true);
    });

    it('should return true for code I (Discretionary 16b-3)', () => {
      expect(isAwardTransaction(tx({ code: 'I' }))).toBe(true);
    });

    it('should return true for type containing "award"', () => {
      expect(isAwardTransaction(tx({ type: 'Stock Award' }))).toBe(true);
    });

    it('should return true for type containing "grant"', () => {
      expect(isAwardTransaction(tx({ type: 'Option Grant' }))).toBe(true);
    });

    it('should return true for type containing "rsu" or "psu"', () => {
      expect(isAwardTransaction(tx({ type: 'RSU Vesting' }))).toBe(true);
      expect(isAwardTransaction(tx({ type: 'PSU Award' }))).toBe(true);
    });

    it('should return true for type containing "restricted stock"', () => {
      expect(isAwardTransaction(tx({ type: 'Restricted Stock Units' }))).toBe(true);
      expect(isAwardTransaction(tx({ type: 'Restricted Stock' }))).toBe(true);
      expect(isAwardTransaction(tx({ type: 'restricted stock award' }))).toBe(true);
    });

    it('should return false for transfers even with award-like text', () => {
      expect(isAwardTransaction(tx({ type: 'Trust Transfer Award', code: 'J' }))).toBe(false);
    });

    it('should return false for code P (Purchase)', () => {
      expect(isAwardTransaction(tx({ code: 'P' }))).toBe(false);
    });
  });

  describe('isExerciseTransaction', () => {
    it('should return true for code M (Exercise/Conversion 16b-3)', () => {
      expect(isExerciseTransaction(tx({ code: 'M' }))).toBe(true);
    });

    it('should return true for code C (Conversion)', () => {
      expect(isExerciseTransaction(tx({ code: 'C' }))).toBe(true);
    });

    it('should return true for code X (Exercise ITM/ATM)', () => {
      expect(isExerciseTransaction(tx({ code: 'X' }))).toBe(true);
    });

    it('should return true for code O (Exercise OTM)', () => {
      expect(isExerciseTransaction(tx({ code: 'O' }))).toBe(true);
    });

    it('should return true for code E (Expiration short)', () => {
      expect(isExerciseTransaction(tx({ code: 'E' }))).toBe(true);
    });

    it('should return true for code H (Expiration/cancellation long)', () => {
      expect(isExerciseTransaction(tx({ code: 'H' }))).toBe(true);
    });

    it('should return true for type containing "exercise"', () => {
      expect(isExerciseTransaction(tx({ type: 'Option Exercise' }))).toBe(true);
    });

    it('should return true for type containing "conversion"', () => {
      expect(isExerciseTransaction(tx({ type: 'Conversion of Derivative' }))).toBe(true);
    });

    it('should return true for type containing "expir"', () => {
      expect(isExerciseTransaction(tx({ type: 'Expiration of Options' }))).toBe(true);
    });

    it('should return false for transfers', () => {
      expect(isExerciseTransaction(tx({ type: 'Trust Transfer', code: 'J' }))).toBe(false);
    });
  });

  describe('isOtherTransaction (Other bucket)', () => {
    it('should return true for code D (Disposition to issuer)', () => {
      expect(isOtherTransaction(tx({ code: 'D' }))).toBe(true);
    });

    it('should return true for code F (Tax withholding)', () => {
      expect(isOtherTransaction(tx({ code: 'F' }))).toBe(true);
    });

    it('should return true for code U (Tender of shares)', () => {
      expect(isOtherTransaction(tx({ code: 'U' }))).toBe(true);
    });

    it('should return true for code V (Voluntarily reported 10b5-1)', () => {
      expect(isOtherTransaction(tx({ code: 'V' }))).toBe(true);
    });

    it('should return true for code L (Small acquisition)', () => {
      expect(isOtherTransaction(tx({ code: 'L' }))).toBe(true);
    });

    it('should return true for type containing "tax"', () => {
      expect(isOtherTransaction(tx({ type: 'Tax Withholding' }))).toBe(true);
    });

    it('should return true for type containing "withholding"', () => {
      expect(isOtherTransaction(tx({ type: 'Shares Withholding' }))).toBe(true);
    });

    it('should return true for type containing "disposition"', () => {
      expect(isOtherTransaction(tx({ type: 'Disposition to Issuer' }))).toBe(true);
    });

    it('should return false for code A (Award)', () => {
      expect(isOtherTransaction(tx({ code: 'A' }))).toBe(false);
    });

    it('should return false for transfers', () => {
      expect(isOtherTransaction(tx({ type: 'Trust Transfer', code: 'J' }))).toBe(false);
    });
  });

  describe('Updated isGiftTransaction', () => {
    it('should return true for code W (Will/descent)', () => {
      expect(isGiftTransaction(tx({ code: 'W' }))).toBe(true);
    });

    it('should still return true for code G (Gift)', () => {
      expect(isGiftTransaction(tx({ code: 'G' }))).toBe(true);
    });

    it('should return true for type containing "gift"', () => {
      expect(isGiftTransaction(tx({ type: 'Gift Transaction' }))).toBe(true);
    });
  });

  describe('Updated isTransferTransaction', () => {
    it('should return true for code Z (Voting trust)', () => {
      expect(isTransferTransaction(tx({ code: 'Z' }))).toBe(true);
    });

    it('should still return true for code J (Trust transfer)', () => {
      expect(isTransferTransaction(tx({ code: 'J' }))).toBe(true);
    });

    it('should still return true for code K (Family transfer)', () => {
      expect(isTransferTransaction(tx({ code: 'K' }))).toBe(true);
    });
  });

  describe('Updated isSaleTransaction', () => {
    it('should return true for code S', () => {
      expect(isSaleTransaction(tx({ code: 'S', type: 'Sale' }))).toBe(true);
    });

    it('should return false when code is present and not S', () => {
      // SEC code is authoritative - code A with type "sale" is NOT a sale
      expect(isSaleTransaction(tx({ code: 'A', type: 'Sale' }))).toBe(false);
    });

    it('should use text fallback when code is empty', () => {
      expect(isSaleTransaction(tx({ type: 'Sale of shares' }))).toBe(true);
    });
  });

  describe('aggregateTransactionsByType - 7 buckets', () => {
    it('should place code A transaction in award bucket, not purchase', () => {
      const result = aggregateTransactionsByType([
        tx({ code: 'A', shares: 1000, pricePerShare: 0, acquisitionDisposition: 'A' }),
      ]);
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('award');
    });

    it('should place code M transaction in exercise bucket', () => {
      const result = aggregateTransactionsByType([
        tx({ code: 'M', shares: 500, pricePerShare: 50, acquisitionDisposition: 'A' }),
      ]);
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('exercise');
    });

    it('should place code D transaction in other bucket', () => {
      const result = aggregateTransactionsByType([
        tx({ code: 'D', shares: 200, pricePerShare: 0, acquisitionDisposition: 'D' }),
      ]);
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('other');
    });

    it('should place unknown code in other bucket (not purchase)', () => {
      const result = aggregateTransactionsByType([
        tx({ code: 'ZZ', shares: 100, pricePerShare: 0 }),
      ]);
      expect(result.length).toBe(1);
      expect(result[0].type).toBe('other');
    });

    it('should handle mixed filing with A + F codes (award + tax withholding)', () => {
      const result = aggregateTransactionsByType([
        tx({ code: 'A', shares: 1000, pricePerShare: 0, acquisitionDisposition: 'A' }),
        tx({ code: 'F', shares: 300, pricePerShare: 150, acquisitionDisposition: 'D' }),
      ]);
      expect(result.length).toBe(2);
      const award = result.find(r => r.type === 'award');
      const other = result.find(r => r.type === 'other');
      expect(award).toBeDefined();
      expect(other).toBeDefined();
      expect(award!.totalShares).toBe(1000);
      expect(other!.totalShares).toBe(300);
    });
  });

  describe('getAggregatedTransactionConfig - all 7 types', () => {
    it('should return amber config for award type', () => {
      const config = getTransactionTypeConfig('award');
      expect(config.label).toBe('Awarded');
      expect(config.bgColor).toBe('#FFFBEB');
    });

    it('should return teal config for exercise type', () => {
      const config = getTransactionTypeConfig('exercise');
      expect(config.label).toBe('Exercised Options');
      expect(config.bgColor).toBe('#F0FDFA');
    });

    it('should return slate config for other type', () => {
      const config = getTransactionTypeConfig('other');
      expect(config.label).toBe('Other');
      expect(config.bgColor).toBe('#F8FAFC');
    });

    it('should preserve existing configs for purchase/sale/gift/transfer', () => {
      expect(getTransactionTypeConfig('purchase').label).toBe('Bought');
      expect(getTransactionTypeConfig('sale').label).toBe('Sold');
      expect(getTransactionTypeConfig('gift').label).toBe('Gift');
      expect(getTransactionTypeConfig('transfer').label).toBe('Transfer');
    });
  });

  describe('SEC code authority over AI text (Review Issue 9A)', () => {
    it('should classify as award when code=A even if type="Sale"', () => {
      const result = aggregateTransactionsByType([
        tx({ code: 'A', type: 'Sale', shares: 100 }),
      ]);
      expect(result[0].type).toBe('award');
    });

    it('should classify as exercise when code=M even if type="Gift"', () => {
      const result = aggregateTransactionsByType([
        tx({ code: 'M', type: 'Gift', shares: 100 }),
      ]);
      expect(result[0].type).toBe('exercise');
    });

    it('should classify as other when code=F even if type="Purchase"', () => {
      const result = aggregateTransactionsByType([
        tx({ code: 'F', type: 'Purchase', shares: 100 }),
      ]);
      expect(result[0].type).toBe('other');
    });

    it('should classify as sale when code=S even if type="Award"', () => {
      const result = aggregateTransactionsByType([
        tx({ code: 'S', type: 'Award', shares: 100, pricePerShare: 50 }),
      ]);
      expect(result[0].type).toBe('sale');
    });

    it('should classify as gift when code=G even if type="Exercise"', () => {
      const result = aggregateTransactionsByType([
        tx({ code: 'G', type: 'Exercise', shares: 100 }),
      ]);
      expect(result[0].type).toBe('gift');
    });

    it('should classify as transfer when code=J even if type="Sale"', () => {
      const result = aggregateTransactionsByType([
        tx({ code: 'J', type: 'Sale', shares: 100 }),
      ]);
      expect(result[0].type).toBe('transfer');
    });

    it('should use text fallback when code is empty/null', () => {
      const result = aggregateTransactionsByType([
        tx({ type: 'Award', shares: 100 }),
      ]);
      expect(result[0].type).toBe('award');
    });
  });

  describe('Codeless acquisition classification (Bug 2)', () => {
    it('should NOT classify $0 codeless acquisition as purchase', () => {
      // A $0 codeless acquisition is an award/grant, not a purchase
      expect(isPurchaseTransaction(tx({
        acquisitionDisposition: 'A',
        pricePerShare: '$0',
      }))).toBe(false);
    });

    it('should NOT classify $0 numeric codeless acquisition as purchase', () => {
      expect(isPurchaseTransaction(tx({
        acquisitionDisposition: 'A',
        pricePerShare: 0,
      }))).toBe(false);
    });

    it('should classify priced codeless acquisition as purchase', () => {
      // Non-zero codeless acquisition IS a purchase
      expect(isPurchaseTransaction(tx({
        acquisitionDisposition: 'A',
        pricePerShare: '$150.00',
      }))).toBe(true);
    });

    it('should classify priced numeric codeless acquisition as purchase', () => {
      expect(isPurchaseTransaction(tx({
        acquisitionDisposition: 'A',
        pricePerShare: 150,
      }))).toBe(true);
    });

    it('should still classify code P as purchase regardless of price', () => {
      expect(isPurchaseTransaction(tx({ code: 'P', pricePerShare: '$0' }))).toBe(true);
      expect(isPurchaseTransaction(tx({ code: 'P', pricePerShare: '$100' }))).toBe(true);
    });
  });

  describe('Option keyword classification (Bug 2 addendum)', () => {
    it('should classify "stock option" type as award', () => {
      expect(isAwardTransaction(tx({ type: 'Stock Option' }))).toBe(true);
    });

    it('should classify "option award" type as award', () => {
      expect(isAwardTransaction(tx({ type: 'Option Award' }))).toBe(true);
    });

    it('should classify "option grant" type as award', () => {
      expect(isAwardTransaction(tx({ type: 'Option Grant' }))).toBe(true);
    });

    it('should aggregate $0 codeless acquisition as other (not purchase)', () => {
      // Without code, $0 A/D='A' should NOT be purchase
      const result = aggregateTransactionsByType([
        tx({ shares: 5000, pricePerShare: '$0', acquisitionDisposition: 'A' }),
      ]);
      expect(result.length).toBe(1);
      // Should be 'other' since no code and $0 price means it's not a purchase
      expect(result[0].type).not.toBe('purchase');
    });
  });

  describe('Edge cases - null/empty/lowercase (Review Issue 12A)', () => {
    it('should classify { code: null, type: "" } into other bucket', () => {
      const result = aggregateTransactionsByType([
        tx({ code: undefined, type: '', shares: 100 }),
      ]);
      expect(result[0].type).toBe('other');
    });

    it('should classify { code: "", type: "" } into other bucket', () => {
      const result = aggregateTransactionsByType([
        tx({ code: '', type: '', shares: 100 }),
      ]);
      expect(result[0].type).toBe('other');
    });

    it('should classify { code: "a" } into award (lowercase normalized)', () => {
      expect(isAwardTransaction(tx({ code: 'a' }))).toBe(true);
    });

    it('should classify { code: undefined, type: "Award" } into award (text fallback)', () => {
      expect(isAwardTransaction(tx({ type: 'Award' }))).toBe(true);
    });

    it('should classify { code: "A", type: undefined } into award (code alone sufficient)', () => {
      expect(isAwardTransaction(tx({ code: 'A' }))).toBe(true);
    });

    it('should classify { code: "ZZ", type: "" } into other (unknown multi-char code)', () => {
      const result = aggregateTransactionsByType([
        tx({ code: 'ZZ', type: '', shares: 100 }),
      ]);
      expect(result[0].type).toBe('other');
    });
  });

  describe('Complete 21-code mapping', () => {
    const codeToExpectedBucket: [string, string][] = [
      ['P', 'purchase'], ['S', 'sale'],
      ['A', 'award'], ['I', 'award'],
      ['M', 'exercise'], ['C', 'exercise'], ['X', 'exercise'],
      ['O', 'exercise'], ['E', 'exercise'], ['H', 'exercise'],
      ['G', 'gift'], ['W', 'gift'],
      ['J', 'transfer'], ['K', 'transfer'], ['Z', 'transfer'],
      ['D', 'other'], ['F', 'other'], ['U', 'other'],
      ['V', 'other'], ['L', 'other'],
    ];

    it.each(codeToExpectedBucket)(
      'should classify code %s into %s bucket',
      (code, expectedBucket) => {
        const result = aggregateTransactionsByType([
          tx({ code, shares: 100, pricePerShare: expectedBucket === 'sale' ? 50 : 0 }),
        ]);
        expect(result.length).toBe(1);
        expect(result[0].type).toBe(expectedBucket);
      }
    );
  });
});
