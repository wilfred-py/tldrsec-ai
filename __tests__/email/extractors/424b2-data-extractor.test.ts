/**
 * Tests for 424B2 (Prospectus Supplement) Data Extractor
 *
 * 424B2 filings are prospectus supplements for securities offerings.
 * Key data includes offering type, amount, interest rate, and maturity date.
 */

import { extract424B2Data, Form424B2ExtractedData } from '@/lib/email/424b2-data-extractor';

describe('extract424B2Data', () => {
  const sampleDebtMarkdownText = `
    **Offering Type**: Senior Notes
    **Offering Amount**: $2,000,000,000
    **Interest Rate**: 5.25%
    **Maturity Date**: March 15, 2034

    ## Offering Terms
    Apple Inc. is offering $2 billion aggregate principal amount of 5.25%
    Senior Notes due 2034. The notes will pay interest semi-annually.

    ## Key Terms
    - Issuer: Apple Inc.
    - Principal Amount: $2,000,000,000
    - Coupon: 5.25% per annum
    - Interest Payment: Semi-annual (March 15 and September 15)
    - Maturity: March 15, 2034
    - Settlement Date: March 18, 2024

    ## Use of Proceeds
    General corporate purposes, including share repurchases and dividend payments.

    ## Underwriters
    Goldman Sachs & Co. LLC, J.P. Morgan Securities LLC, BofA Securities, Inc.
  `;

  const sampleEquityProseText = `
    Tesla Inc. is offering 10 million shares of common stock at a public offering
    price of $250.00 per share. The offering is expected to raise approximately
    $2.5 billion in gross proceeds. The company intends to use the net proceeds
    for general corporate purposes, including capital expenditures and working
    capital. Goldman Sachs is acting as lead underwriter for the offering.
  `;

  const sampleStructuredNotesText = `
    **Offering Type**: Structured Notes
    **Offering Amount**: $500,000,000
    **Maturity Date**: December 31, 2026
    **Linked To**: S&P 500 Index

    JP Morgan is offering $500 million of structured notes linked to the
    performance of the S&P 500 Index. The notes have a 3-year term with
    principal protection at maturity. Investors receive 100% participation
    in index gains up to a cap of 25%.
  `;

  describe('Debt offering extraction', () => {
    it('should extract offeringType', () => {
      const result = extract424B2Data(sampleDebtMarkdownText);
      expect(result.offeringType).toContain('Senior Notes');
    });

    it('should extract offeringAmount', () => {
      const result = extract424B2Data(sampleDebtMarkdownText);
      expect(result.offeringAmount).toContain('2');
    });

    it('should extract interestRate', () => {
      const result = extract424B2Data(sampleDebtMarkdownText);
      expect(result.interestRate).toBe('5.25%');
    });

    it('should extract maturityDate', () => {
      const result = extract424B2Data(sampleDebtMarkdownText);
      expect(result.maturityDate).toContain('2034');
    });

    it('should extract underwriters', () => {
      const result = extract424B2Data(sampleDebtMarkdownText);
      expect(result.underwriters.length).toBeGreaterThanOrEqual(1);
      expect(result.underwriters.some(u => u.includes('Goldman'))).toBe(true);
    });

    it('should extract use of proceeds', () => {
      const result = extract424B2Data(sampleDebtMarkdownText);
      expect(result.useOfProceeds).toContain('corporate');
    });
  });

  describe('Equity offering extraction', () => {
    it('should identify equity offering type', () => {
      const result = extract424B2Data(sampleEquityProseText);
      expect(result.offeringType?.toLowerCase()).toContain('equity');
    });

    it('should extract shares offered', () => {
      const result = extract424B2Data(sampleEquityProseText);
      expect(result.sharesOffered).toContain('10');
    });

    it('should extract price per share', () => {
      const result = extract424B2Data(sampleEquityProseText);
      expect(result.pricePerShare).toBe('$250.00');
    });

    it('should extract offering amount from equity prose', () => {
      const result = extract424B2Data(sampleEquityProseText);
      expect(result.offeringAmount).toContain('2.5');
    });
  });

  describe('Structured notes extraction', () => {
    it('should identify structured notes offering', () => {
      const result = extract424B2Data(sampleStructuredNotesText);
      expect(result.offeringType).toContain('Structured Notes');
    });

    it('should extract linked index', () => {
      const result = extract424B2Data(sampleStructuredNotesText);
      expect(result.linkedTo).toContain('S&P');
    });

    it('should extract maturity for structured notes', () => {
      const result = extract424B2Data(sampleStructuredNotesText);
      expect(result.maturityDate).toContain('2026');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty input gracefully', () => {
      const result = extract424B2Data('');
      expect(result.offeringType).toBeUndefined();
      expect(result.offeringAmount).toBeUndefined();
      expect(result.underwriters).toEqual([]);
    });

    it('should handle malformed input without crashing', () => {
      const result = extract424B2Data('Random text without any offering data');
      expect(result).toBeDefined();
    });

    it('should extract interest rate from various formats', () => {
      const texts = [
        'interest rate of 4.75%',
        '4.75% coupon',
        'bearing interest at 4.75% per annum',
      ];
      for (const text of texts) {
        const result = extract424B2Data(text);
        expect(result.interestRate).toBe('4.75%');
      }
    });

    it('should extract offering amount from various formats', () => {
      const result1 = extract424B2Data('offering $1,500,000,000 aggregate principal');
      expect(result1.offeringAmount).toContain('1,500,000,000');

      const result2 = extract424B2Data('raise approximately $1.5 billion');
      expect(result2.offeringAmount).toContain('1.5');
    });

    it('should extract maturity from various date formats', () => {
      const texts = [
        'due March 15, 2034',
        'matures on 2034-03-15',
        'maturity date of March 2034',
      ];
      for (const text of texts) {
        const result = extract424B2Data(text);
        expect(result.maturityDate).toContain('2034');
      }
    });

    it('should identify settlement date', () => {
      const result = extract424B2Data('Settlement Date: January 25, 2024');
      expect(result.settlementDate).toContain('2024');
    });
  });
});
