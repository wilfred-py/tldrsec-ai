/**
 * Form 4 Transfer Detection Tests
 *
 * Tests for trust/family transfer classification in Form 4 filings.
 * These tests ensure that J/K transaction codes and trust transfer patterns
 * are correctly identified and categorized.
 */

import { extractForm4Data } from '../../lib/email/form4-data-extractor';

describe('Form 4 Transfer Detection', () => {
  describe('Trust Transfer Classification', () => {
    it('should detect trust transfers from J transaction codes', () => {
      // J code in SEC filings typically represents "Other acquisition or
      // disposition (describe transaction)" - commonly used for trust transfers
      const summaryText = `
        **Reporting Person**: John Doe
        **Role**: Director

        | Date | Code | Amount | (A)/(D) | Price |
        |------|------|--------|---------|-------|
        | 2026-01-06 | J | 10,000 | D | $0 |

        Transaction: Transfer to John Doe Family Trust at $0 per share.
        This is a change in form of beneficial ownership, not an open market transaction.
      `;

      const result = extractForm4Data(summaryText);

      expect(result.transactions.length).toBeGreaterThan(0);
      expect(result.transactions[0].type).toBe('Trust Transfer');
    });

    it('should detect family trust transactions from K codes', () => {
      // K code represents "Equity swap or similar transaction"
      // Often used for family trust restructuring
      const summaryText = `
        **Reporting Person**: Jane Smith
        **Role**: Officer

        | Date | Code | Amount | (A)/(D) | Price |
        |------|------|--------|---------|-------|
        | 2026-01-06 | K | 5,000 | A | $0 |

        Family trust equity swap transaction for estate planning purposes.
        Beneficial ownership change from direct to indirect holdings.
      `;

      const result = extractForm4Data(summaryText);

      expect(result.transactions.length).toBeGreaterThan(0);
      // K code maps to "Equity Swap" per SEC official definition
      expect(result.transactions[0].type).toBe('Equity Swap');
    });

    it('should distinguish trust transfers from gifts', () => {
      // Trust transfers at $0 should not be classified as gifts
      const summaryText = `
        **Reporting Person**: John Walker
        **Role**: CLO

        Transfer to revocable trust structure at $0 per share.
        This represents a change in beneficial ownership form from direct holdings
        to holdings through the John Walker Revocable Trust.

        | Date | Transaction | Shares | Price |
        |------|-------------|--------|-------|
        | 2026-01-06 | Trust Transfer | 25,000 | $0 |

        Post-Transaction Ownership: 150,000 shares (indirect via trust)
      `;

      const result = extractForm4Data(summaryText);

      // Should not be categorized as a gift
      const hasGift = result.transactions.some(t => t.type.toLowerCase() === 'gift');
      expect(hasGift).toBe(false);

      // Should be recognized as a transfer in signal strength
      expect(result.signalStrength).toContain('Transfer');
    });

    it('should detect transfers from text patterns', () => {
      // Even without transaction codes, text patterns should identify transfers
      const summaryText = `
        John Doe, Director of GOOGL, transferred 10,000 shares from direct ownership
        to indirect ownership through the Doe Family Trust.

        This is not a sale or gift - it represents a change in the form of
        beneficial ownership for estate planning purposes.

        Post-transaction: 500,000 shares held indirectly through trust.
      `;

      const result = extractForm4Data(summaryText);

      // Should detect transfer pattern
      const hasTransfer = result.transactions.some(t =>
        t.type.toLowerCase().includes('transfer')
      ) || result.signalStrength.toLowerCase().includes('transfer');

      expect(hasTransfer).toBe(true);
    });

    it('should identify indirect to direct transfers', () => {
      const summaryText = `
        **Reporting Person**: Sarah Johnson
        **Role**: CFO

        | Date | Code | Amount | (A)/(D) | Price |
        |------|------|--------|---------|-------|
        | 2026-01-06 | J | 8,000 | A | $0 |

        Transfer from family trust to direct ownership.
        Shares moved from indirect beneficial ownership back to direct holdings.
      `;

      const result = extractForm4Data(summaryText);

      expect(result.transactions.length).toBeGreaterThan(0);
      expect(result.transactions[0].type).toBe('Trust Transfer');
    });
  });

  describe('Signal Strength for Transfers', () => {
    it('should assign neutral signal strength to trust transfers', () => {
      const summaryText = `
        **Reporting Person**: Executive
        **Role**: Director

        Trust transfer of 50,000 shares at $0 per share.
        This is a change in beneficial ownership form, not a market transaction.
      `;

      const result = extractForm4Data(summaryText);

      // Trust transfers should have neutral/weak signal - they don't indicate
      // buying or selling conviction
      expect(result.signalStrength.toLowerCase()).toMatch(
        /(neutral|weak|transfer)/
      );
    });

    it('should not classify trust transfers as strong signals', () => {
      const summaryText = `
        **Reporting Person**: CEO
        **Role**: CEO

        Transferred 1,000,000 shares ($50M value) to family trust.
        Code: J - Other disposition
        Price: $0 per share
      `;

      const result = extractForm4Data(summaryText);

      // Even large value transfers should not be "strong" signals
      // because they don't represent market transactions
      expect(result.signalStrength.toLowerCase()).not.toMatch(/strong/);
    });
  });

  describe('Edge Cases', () => {
    it('should handle mixed transaction types (sale + transfer)', () => {
      const summaryText = `
        **Reporting Person**: John Doe
        **Role**: Director

        | Date | Code | Amount | (A)/(D) | Price |
        |------|------|--------|---------|-------|
        | 2026-01-06 | S | 5,000 | D | $150.00 |
        | 2026-01-06 | J | 10,000 | D | $0 |

        Sold 5,000 shares at $150 and transferred 10,000 to family trust.
      `;

      const result = extractForm4Data(summaryText);

      expect(result.transactions.length).toBe(2);

      // Find the sale and transfer transactions
      const sale = result.transactions.find(t => t.type === 'Sale');
      const transfer = result.transactions.find(t => t.type === 'Trust Transfer');

      expect(sale).toBeDefined();
      expect(transfer).toBeDefined();
    });

    it('should not misclassify $0 purchases as transfers', () => {
      // Awards at $0 are acquisitions, not transfers
      const summaryText = `
        **Reporting Person**: Jane Smith
        **Role**: Officer

        | Date | Code | Amount | (A)/(D) | Price |
        |------|------|--------|---------|-------|
        | 2026-01-06 | A | 10,000 | A | $0 |

        RSU award vesting - 10,000 shares acquired at $0.
      `;

      const result = extractForm4Data(summaryText);

      expect(result.transactions.length).toBeGreaterThan(0);
      expect(result.transactions[0].type).toBe('Award');
      expect(result.transactions[0].type).not.toContain('Transfer');
    });
  });
});
