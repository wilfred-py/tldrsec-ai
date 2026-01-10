/**
 * Tests for Form S-3 (Secondary Offering) Data Extractor
 *
 * Form S-3 is filed for secondary offerings by companies already public.
 * Key data includes offering type, amount, dilution impact, and selling shareholders.
 */

import { extractS3Data, FormS3ExtractedData } from '@/lib/email/s3-data-extractor';

describe('extractS3Data', () => {
  const sampleMarkdownText = `
    **Offering Type**: Secondary Offering
    **Offering Amount**: $300M
    **Shares Offered**: 5,000,000
    **Dilution Impact**: 3.5% dilution to existing shareholders

    ## Selling Shareholders
    - Venture Capital Fund A: 2,000,000 shares
    - Founder Holdings LLC: 1,500,000 shares
    - Early Employee Trust: 1,500,000 shares

    ## Use of Proceeds
    - Company will not receive any proceeds
    - All proceeds go to selling shareholders

    ## Shelf Registration
    Total Authorized: $1B
    Remaining Capacity: $700M
    Expiration Date: 2027-03-15
  `;

  const sampleATMText = `
    TechCorp announces an at-the-market (ATM) equity offering program to raise up to
    $500 million. The company may sell shares from time to time at prevailing market prices.

    This shelf registration has a total capacity of $1.5 billion, with $1 billion remaining
    after this offering. The program expires on December 31, 2026.

    Proceeds will be used for general corporate purposes and potential acquisitions.
    The estimated dilution impact is approximately 5% at current stock prices.

    Goldman Sachs is acting as sales agent for the ATM program.
  `;

  describe('Secondary offering extraction', () => {
    it('should extract offeringType', () => {
      const result = extractS3Data(sampleMarkdownText);
      expect(result.offeringType).toBe('Secondary Offering');
    });

    it('should extract offeringAmount', () => {
      const result = extractS3Data(sampleMarkdownText);
      expect(result.offeringAmount).toBe('$300M');
    });

    it('should extract sharesOffered', () => {
      const result = extractS3Data(sampleMarkdownText);
      expect(result.sharesOffered).toBe('5,000,000');
    });

    it('should extract dilutionImpact', () => {
      const result = extractS3Data(sampleMarkdownText);
      expect(result.dilutionImpact).toContain('3.5%');
    });

    it('should extract sellingShareholders', () => {
      const result = extractS3Data(sampleMarkdownText);
      expect(result.sellingShareholders.length).toBeGreaterThanOrEqual(1);
      expect(result.sellingShareholders.some(s => s.name.includes('Venture'))).toBe(true);
    });

    it('should extract shelfRegistration details', () => {
      const result = extractS3Data(sampleMarkdownText);
      expect(result.shelfRegistration).toBeDefined();
      expect(result.shelfRegistration?.totalAuthorized).toBe('$1B');
      expect(result.shelfRegistration?.remainingCapacity).toBe('$700M');
    });
  });

  describe('ATM program extraction', () => {
    it('should identify ATM offering type', () => {
      const result = extractS3Data(sampleATMText);
      expect(result.offeringType?.toLowerCase()).toContain('atm');
    });

    it('should extract offering amount from ATM', () => {
      const result = extractS3Data(sampleATMText);
      expect(result.offeringAmount).toBe('$500M');
    });

    it('should extract shelf registration from ATM text', () => {
      const result = extractS3Data(sampleATMText);
      expect(result.shelfRegistration?.totalAuthorized).toBe('$1.5B');
    });

    it('should extract dilution from ATM', () => {
      const result = extractS3Data(sampleATMText);
      expect(result.dilutionImpact).toContain('5%');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty input gracefully', () => {
      const result = extractS3Data('');
      expect(result.offeringType).toBeUndefined();
      expect(result.sellingShareholders).toEqual([]);
    });

    it('should handle malformed input without crashing', () => {
      const result = extractS3Data('Random text about stocks');
      expect(result).toBeDefined();
      expect(result.sellingShareholders).toEqual([]);
    });

    it('should handle primary offering', () => {
      const text = 'The company is conducting a primary offering of $100M in new shares.';
      const result = extractS3Data(text);
      expect(result.offeringAmount).toBe('$100M');
    });
  });
});
