/**
 * Tests for SC 13D (Activist Beneficial Ownership) Data Extractor
 *
 * SC 13D is filed when an entity acquires more than 5% with intent to influence.
 * Key data includes filer name, ownership percentage, shares owned, and stated purpose.
 */

import { extractSC13DData, SC13DExtractedData } from '@/lib/email/sc13d-data-extractor';

describe('extractSC13DData', () => {
  const sampleMarkdownText = `
    **Filer Name**: Elliott Management Corporation
    **Ownership Percentage**: 12.3%
    **Shares Owned**: 45,000,000
    **Purpose**: Seek board representation and strategic alternatives

    ## Filing Details
    Elliott Management Corporation filed a Schedule 13D disclosing a significant
    ownership stake in Target Corp. The activist investor intends to engage with
    management and the board regarding strategic alternatives.

    ## Stated Intentions
    - Seek board representation (2-3 seats)
    - Evaluate strategic alternatives including potential sale
    - Improve operational efficiency
    - Return capital to shareholders

    ## Source of Funds
    Working capital and investment fund assets.
  `;

  const sampleProseText = `
    Elliott Management, the activist hedge fund led by Paul Singer, has disclosed
    a 12.3% stake in Target Corp, representing approximately 45 million shares of
    common stock. In their Schedule 13D filing, Elliott stated their purpose is to
    seek board representation and explore strategic alternatives for the company.
    The firm indicated it may engage in discussions with management regarding
    operational improvements and potential return of capital to shareholders.
    Elliott has acquired shares through open market purchases using working capital.
  `;

  describe('Markdown format extraction', () => {
    it('should extract filerName', () => {
      const result = extractSC13DData(sampleMarkdownText);
      expect(result.filerName).toContain('Elliott');
    });

    it('should extract ownershipPercentage', () => {
      const result = extractSC13DData(sampleMarkdownText);
      expect(result.ownershipPercentage).toBe('12.3%');
    });

    it('should extract sharesOwned', () => {
      const result = extractSC13DData(sampleMarkdownText);
      expect(result.sharesOwned).toContain('45');
    });

    it('should extract purpose', () => {
      const result = extractSC13DData(sampleMarkdownText);
      expect(result.purpose).toContain('board');
    });

    it('should extract intentions as array', () => {
      const result = extractSC13DData(sampleMarkdownText);
      expect(result.intentions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Prose format extraction', () => {
    it('should extract filerName from prose', () => {
      const result = extractSC13DData(sampleProseText);
      expect(result.filerName).toContain('Elliott');
    });

    it('should extract ownershipPercentage from prose', () => {
      const result = extractSC13DData(sampleProseText);
      expect(result.ownershipPercentage).toBe('12.3%');
    });

    it('should extract sharesOwned from prose', () => {
      const result = extractSC13DData(sampleProseText);
      expect(result.sharesOwned).toContain('45');
    });

    it('should extract purpose from prose', () => {
      const result = extractSC13DData(sampleProseText);
      expect(result.purpose).toContain('board');
    });
  });

  describe('Activist signals detection', () => {
    it('should detect board seat requests', () => {
      const result = extractSC13DData('seeking two board seats');
      expect(result.isActivist).toBe(true);
    });

    it('should detect strategic alternatives language', () => {
      const result = extractSC13DData('evaluate strategic alternatives including sale');
      expect(result.isActivist).toBe(true);
    });

    it('should detect investment-only purpose', () => {
      const result = extractSC13DData('acquired shares for investment purposes only');
      expect(result.isActivist).toBe(false);
      expect(result.purpose?.toLowerCase()).toContain('investment');
    });

    it('should detect management change intentions', () => {
      const result = extractSC13DData('seek to replace CEO and implement restructuring');
      expect(result.isActivist).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty input gracefully', () => {
      const result = extractSC13DData('');
      expect(result.filerName).toBeUndefined();
      expect(result.ownershipPercentage).toBeUndefined();
      expect(result.purpose).toBeUndefined();
      expect(result.intentions).toEqual([]);
    });

    it('should handle malformed input without crashing', () => {
      const result = extractSC13DData('Random text without any ownership data');
      expect(result).toBeDefined();
    });

    it('should extract percentage from various formats', () => {
      const texts = [
        'beneficial ownership of 15.5%',
        'owns approximately 15.5 percent',
        '15.5% of the outstanding shares',
      ];
      for (const text of texts) {
        const result = extractSC13DData(text);
        expect(result.ownershipPercentage).toBe('15.5%');
      }
    });

    it('should handle group filings', () => {
      const result = extractSC13DData('Filed by a group consisting of ABC Partners and XYZ Fund');
      expect(result.isGroupFiling).toBe(true);
    });
  });
});
