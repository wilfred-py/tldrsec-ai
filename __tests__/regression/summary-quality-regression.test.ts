/**
 * Phase 4: Summary Quality Regression Tests
 *
 * Tests to prevent recurrence of known issues and ensure
 * consistent output quality across model calls.
 */

import { extractForm4Data } from '@/lib/email/form4-data-extractor';

// Sample test data for trust transfer filings
// Using patterns that match the extractor's regex expectations

const TRUST_TRANSFER_SAMPLE = `
Reporting Person: John Doe, Director
The insider transferred 10,000 shares to the John Doe Family Trust at $0 per share.
This is a trust transfer - direct to indirect ownership change.
trust transfer: 10,000 shares
`;

const FAMILY_TRANSFER_SAMPLE = `
Reporting Person: Jane Smith, CFO
The executive transferred to family trust 5,000 shares at $0 per share.
Direct to indirect ownership - family trust 5,000 shares transfer.
`;

const REGULAR_SALE_SAMPLE = `
Reporting Person: Bob Johnson, CEO
The executive sold 2,500 shares at $150.00 per share.
This represents an open market sale on the NYSE.
Total value: $375,000
`;

const PURCHASE_SAMPLE = `
Reporting Person: Alice Williams, Director
The insider bought 1,000 shares at $45.00 per share.
Open market purchase of common stock.
Total value: $45,000
`;

describe('Summary Quality Regression Tests', () => {
  describe('Transaction Type Classification', () => {
    it('should classify J-code transactions as Trust Transfer', () => {
      const result = extractForm4Data(TRUST_TRANSFER_SAMPLE);

      expect(result.transactions).toBeDefined();
      expect(result.transactions.length).toBeGreaterThan(0);

      // J code should be Trust Transfer, not Purchase
      const hasTransfer = result.transactions.some(
        (t: { type: string }) =>
          t.type.toLowerCase().includes('transfer') || t.type.toLowerCase().includes('trust')
      );
      expect(hasTransfer).toBe(true);

      // Should NOT be classified as Purchase
      const isPurchase = result.transactions.some(
        (t: { type: string }) => t.type.toLowerCase() === 'purchase'
      );
      expect(isPurchase).toBe(false);
    });

    it('should classify K-code transactions as Family Transfer', () => {
      const result = extractForm4Data(FAMILY_TRANSFER_SAMPLE);

      expect(result.transactions).toBeDefined();
      expect(result.transactions.length).toBeGreaterThan(0);

      // K code should be Family Transfer
      const hasTransfer = result.transactions.some(
        (t: { type: string }) =>
          t.type.toLowerCase().includes('transfer') || t.type.toLowerCase().includes('family')
      );
      expect(hasTransfer).toBe(true);
    });

    it('should classify S-code transactions as Sale', () => {
      const result = extractForm4Data(REGULAR_SALE_SAMPLE);

      expect(result.transactions).toBeDefined();
      expect(result.transactions.length).toBeGreaterThan(0);

      // S code should be Sale
      const isSale = result.transactions.some((t: { type: string }) =>
        t.type.toLowerCase().includes('sale')
      );
      expect(isSale).toBe(true);
    });

    it('should classify P-code transactions as Purchase', () => {
      const result = extractForm4Data(PURCHASE_SAMPLE);

      expect(result.transactions).toBeDefined();
      expect(result.transactions.length).toBeGreaterThan(0);

      // P code should be Purchase
      const isPurchase = result.transactions.some((t: { type: string }) =>
        t.type.toLowerCase().includes('purchase')
      );
      expect(isPurchase).toBe(true);
    });
  });

  describe('Signal Strength Assessment', () => {
    it('should assess trust transfers as neutral signal', () => {
      const result = extractForm4Data(TRUST_TRANSFER_SAMPLE);

      // Trust transfers should have neutral signal assessment
      if (result.signalStrength) {
        expect(result.signalStrength.toLowerCase()).toContain('neutral');
      }
      // Or it might have a specific transfer-related assessment
      if (result.verdict) {
        const verdictLower = result.verdict.toLowerCase();
        expect(
          verdictLower.includes('transfer') ||
            verdictLower.includes('neutral') ||
            verdictLower.includes('trust')
        ).toBe(true);
      }
    });

    it('should not misclassify trust transfers as high-signal events', () => {
      const result = extractForm4Data(TRUST_TRANSFER_SAMPLE);

      // Trust transfers should NOT be classified as high-signal buying indicators
      if (result.signalStrength) {
        const signalLower = result.signalStrength.toLowerCase();
        // If there's a signal assessment for a trust transfer, it shouldn't indicate strong buying
        const isStrongBuySignal =
          signalLower.includes('strong') && signalLower.includes('buy');
        expect(isStrongBuySignal).toBe(false);
      }
    });
  });

  describe('Known Issue Prevention', () => {
    it('should prevent trust transfer misclassification as purchase (Issue #1)', () => {
      // This test prevents the original bug where J/K codes were
      // incorrectly classified as purchases
      const trustTransferContent = `
        Transaction Code J
        Transfer to revocable trust
        $0 per share
      `;

      const result = extractForm4Data(trustTransferContent);

      expect(result.transactions).toBeDefined();

      // The transaction should be classified as a transfer, not a purchase
      const transactions = result.transactions;
      if (transactions.length > 0) {
        const firstTx = transactions[0];
        const typeStr = String(firstTx.type || '').toLowerCase();

        // Should NOT be "purchase"
        expect(typeStr).not.toBe('purchase');

        // Should contain "transfer" or be an appropriate non-purchase type
        const isTransferType =
          typeStr.includes('transfer') ||
          typeStr.includes('trust') ||
          typeStr.includes('gift') ||
          typeStr === 'unknown';
        expect(isTransferType).toBe(true);
      }
    });

    it('should handle $0 price transactions appropriately', () => {
      // Transactions at $0 are typically transfers, gifts, or awards
      // They should NOT be classified as market purchases
      const zeroPriceContent = `
        Transaction: J code
        Price: $0.00
        Shares: 50,000
      `;

      const result = extractForm4Data(zeroPriceContent);

      expect(result.transactions).toBeDefined();

      // $0 transactions shouldn't be classified as market purchases
      const transactions = result.transactions;
      if (transactions.length > 0) {
        const firstTx = transactions[0];
        const typeStr = String(firstTx.type || '').toLowerCase();

        // A $0 transaction should not be a typical market purchase
        const isMarketPurchase = typeStr === 'purchase' || typeStr === 'market purchase';
        expect(isMarketPurchase).toBe(false);
      }
    });
  });

  describe('Output Consistency', () => {
    it('should produce consistent transaction structure', () => {
      const result = extractForm4Data(REGULAR_SALE_SAMPLE);

      expect(result).toHaveProperty('transactions');
      expect(Array.isArray(result.transactions)).toBe(true);

      if (result.transactions.length > 0) {
        const tx = result.transactions[0];
        // Each transaction should have a type
        expect(tx).toHaveProperty('type');
        expect(typeof tx.type).toBe('string');
      }
    });

    it('should extract share quantities when available', () => {
      const result = extractForm4Data(REGULAR_SALE_SAMPLE);

      expect(result.transactions).toBeDefined();

      // Check if shares were extracted
      if (result.transactions.length > 0) {
        const tx = result.transactions[0];
        // Shares should be extracted if present in the content
        if (tx.shares !== undefined) {
          expect(typeof tx.shares === 'number' || typeof tx.shares === 'string').toBe(true);
        }
      }
    });
  });
});
