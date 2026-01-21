/**
 * Tests for Form 11-K (Employee Stock Plan) Data Extractor
 *
 * Form 11-K is the annual report for employee benefit plans like 401(k) and ESOP.
 * Key data includes plan assets, participant count, contributions, and distributions.
 */

import { extractForm11KData, Form11KExtractedData } from '@/lib/email/form11k-data-extractor';

describe('extractForm11KData', () => {
  const sampleMarkdownText = `
    **Plan Name**: TechCorp 401(k) Savings Plan
    **Plan Fiscal Year**: December 31, 2025
    **Plan Assets**: $2.5B
    **Net Assets Change**: +$150M (+6.4%)
    **Participant Count**: 45,000

    ## Contributions
    - Employee Contributions: $350M
    - Employer Match: $125M
    - Total Contributions: $475M

    ## Distributions
    - Benefits Paid: $200M
    - Withdrawals and Loans: $50M

    ## Investment Options
    | Fund Name | Allocation | Return |
    |-----------|------------|--------|
    | S&P 500 Index | 35% | +22% |
    | Company Stock | 15% | +18% |
    | Bond Index | 25% | +5% |
    | Target Date 2040 | 20% | +15% |
    | Money Market | 5% | +4% |

    ## Company Stock
    Company stock holdings represent $375M (15% of total assets).
  `;

  const sampleProseText = `
    The TechCorp 401(k) Savings Plan reported net assets available for benefits of
    $2.5 billion as of December 31, 2025. This represents a $150 million increase
    from the prior year, reflecting strong investment returns.

    The plan had 45,000 active participants during the year. Employee contributions
    totaled $350 million, with employer matching contributions of $125 million.
    Benefits distributed to participants and beneficiaries totaled $200 million.

    The S&P 500 Index fund represents the largest allocation at 35% of plan assets,
    followed by bond investments at 25%. Company stock holdings represent 15% of
    total plan assets, or approximately $375 million.

    Investment returns were strong across most options, with the S&P 500 Index fund
    returning 22% and company stock returning 18%.
  `;

  describe('Markdown format extraction', () => {
    it('should extract planName', () => {
      const result = extractForm11KData(sampleMarkdownText);
      expect(result.planName).toBe('TechCorp 401(k) Savings Plan');
    });

    it('should extract planFiscalYear', () => {
      const result = extractForm11KData(sampleMarkdownText);
      expect(result.planFiscalYear).toContain('2025');
    });

    it('should extract planAssets', () => {
      const result = extractForm11KData(sampleMarkdownText);
      expect(result.planAssets).toBe('$2.5B');
    });

    it('should extract netAssetsChange', () => {
      const result = extractForm11KData(sampleMarkdownText);
      expect(result.netAssetsChange).toContain('$150M');
    });

    it('should extract participantCount', () => {
      const result = extractForm11KData(sampleMarkdownText);
      expect(result.participantCount).toBe('45,000');
    });

    it('should extract contributionsReceived', () => {
      const result = extractForm11KData(sampleMarkdownText);
      // Could be employee contributions or total
      expect(result.contributionsReceived).toMatch(/\$\d+/);
    });

    it('should extract employerContributions', () => {
      const result = extractForm11KData(sampleMarkdownText);
      expect(result.employerContributions).toBe('$125M');
    });

    it('should extract benefitsDistributed', () => {
      const result = extractForm11KData(sampleMarkdownText);
      expect(result.benefitsDistributed).toBe('$200M');
    });

    it('should extract investmentOptions', () => {
      const result = extractForm11KData(sampleMarkdownText);
      expect(result.investmentOptions.length).toBeGreaterThanOrEqual(2);
      expect(result.investmentOptions.some(o => o.name.includes('S&P'))).toBe(true);
    });

    it('should extract companyStockHoldings', () => {
      const result = extractForm11KData(sampleMarkdownText);
      expect(result.companyStockHoldings).toContain('$375M');
    });
  });

  describe('Prose format extraction', () => {
    it('should extract planAssets from prose', () => {
      const result = extractForm11KData(sampleProseText);
      expect(result.planAssets).toBe('$2.5B');
    });

    it('should extract participantCount from prose', () => {
      const result = extractForm11KData(sampleProseText);
      expect(result.participantCount).toBe('45,000');
    });

    it('should extract contributionsReceived from prose', () => {
      const result = extractForm11KData(sampleProseText);
      expect(result.contributionsReceived).toMatch(/\$\d+/);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty input gracefully', () => {
      const result = extractForm11KData('');
      expect(result.planAssets).toBeUndefined();
      expect(result.investmentOptions).toEqual([]);
    });

    it('should handle malformed input without crashing', () => {
      const result = extractForm11KData('Random text about employee plans');
      expect(result).toBeDefined();
      expect(result.investmentOptions).toEqual([]);
    });

    it('should identify ESOP plan type', () => {
      const text = 'The Employee Stock Ownership Plan (ESOP) holds $500M in company stock.';
      const result = extractForm11KData(text);
      expect(result.planType?.toLowerCase()).toContain('esop');
    });

    it('should identify 401(k) plan type', () => {
      const text = 'The company 401(k) plan had $1.2B in assets.';
      const result = extractForm11KData(text);
      expect(result.planType).toContain('401(k)');
    });
  });
});
