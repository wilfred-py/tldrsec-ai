/**
 * Tests for SC 13G (Passive Beneficial Ownership) Data Extractor
 *
 * SC 13G is filed by passive investors who own more than 5% of a company's stock.
 * Key data includes filer name, ownership percentage, shares owned, and filing purpose.
 */

import { extractSC13GData, SC13GExtractedData } from '@/lib/email/sc13g-data-extractor';

describe('extractSC13GData', () => {
  const sampleMarkdownText = `
    **Filer Name**: Vanguard Group Inc.
    **Ownership Percentage**: 8.5%
    **Shares Owned**: 125,000,000
    **Filing Purpose**: Amendment

    ## Filing Details
    Vanguard Group Inc. filed a Schedule 13G amendment disclosing ownership of
    Apple Inc. common stock. The filing indicates passive investment with no
    intent to influence control of the company.

    ## Ownership Summary
    - Total shares: 125,000,000
    - Percentage of class: 8.5%
    - Sole voting power: 0
    - Shared voting power: 2,500,000
    - Sole dispositive power: 119,000,000
    - Shared dispositive power: 6,000,000
  `;

  const sampleProseText = `
    The Vanguard Group, Inc. has filed a Schedule 13G amendment with the SEC
    reporting beneficial ownership of 125 million shares of Apple Inc. common stock,
    representing approximately 8.5% of the outstanding shares. As a passive institutional
    investor, Vanguard disclaims beneficial ownership of these shares except to the
    extent of its pecuniary interest. The filing indicates sole dispositive power over
    119 million shares and shared dispositive power over 6 million shares.
  `;

  describe('Markdown format extraction', () => {
    it('should extract filerName', () => {
      const result = extractSC13GData(sampleMarkdownText);
      expect(result.filerName).toContain('Vanguard');
    });

    it('should extract ownershipPercentage', () => {
      const result = extractSC13GData(sampleMarkdownText);
      expect(result.ownershipPercentage).toBe('8.5%');
    });

    it('should extract sharesOwned', () => {
      const result = extractSC13GData(sampleMarkdownText);
      expect(result.sharesOwned).toContain('125');
    });

    it('should extract filingPurpose', () => {
      const result = extractSC13GData(sampleMarkdownText);
      expect(result.filingPurpose).toBe('Amendment');
    });
  });

  describe('Prose format extraction', () => {
    it('should extract filerName from prose', () => {
      const result = extractSC13GData(sampleProseText);
      expect(result.filerName).toContain('Vanguard');
    });

    it('should extract ownershipPercentage from prose', () => {
      const result = extractSC13GData(sampleProseText);
      expect(result.ownershipPercentage).toBe('8.5%');
    });

    it('should extract sharesOwned from prose', () => {
      const result = extractSC13GData(sampleProseText);
      expect(result.sharesOwned).toContain('125');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty input gracefully', () => {
      const result = extractSC13GData('');
      expect(result.filerName).toBeUndefined();
      expect(result.ownershipPercentage).toBeUndefined();
      expect(result.sharesOwned).toBeUndefined();
    });

    it('should handle malformed input without crashing', () => {
      const result = extractSC13GData('Random text without any ownership data');
      expect(result).toBeDefined();
    });

    it('should extract percentage from various formats', () => {
      const texts = [
        'beneficial ownership of 5.1%',
        'owns approximately 5.1 percent',
        '5.1% of the outstanding shares',
      ];
      for (const text of texts) {
        const result = extractSC13GData(text);
        expect(result.ownershipPercentage).toBe('5.1%');
      }
    });

    it('should extract shares from various formats', () => {
      const result = extractSC13GData('owns 50,000,000 shares of common stock');
      expect(result.sharesOwned).toBe('50,000,000');
    });

    it('should identify initial filing vs amendment', () => {
      const initial = extractSC13GData('Schedule 13G initial filing');
      expect(initial.filingPurpose).toBe('Initial');

      const amendment = extractSC13GData('Schedule 13G/A amendment');
      expect(amendment.filingPurpose).toBe('Amendment');
    });
  });
});
