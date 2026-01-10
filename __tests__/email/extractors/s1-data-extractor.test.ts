/**
 * Tests for Form S-1 (IPO Registration) Data Extractor
 *
 * Form S-1 is filed when a company goes public for the first time.
 * Key data includes offering size, price range, use of proceeds, and underwriters.
 */

import { extractS1Data, FormS1ExtractedData } from '@/lib/email/s1-data-extractor';

describe('extractS1Data', () => {
  const sampleMarkdownText = `
    **Offering Size**: $500M
    **Price Range**: $18-$21 per share
    **Shares Offered**: 25,000,000

    ## Business Description
    Leading provider of cloud-based enterprise software solutions.

    ## Use of Proceeds
    - General corporate purposes and working capital
    - R&D and product development ($150M)
    - Sales and marketing expansion ($100M)
    - Potential acquisitions

    ## Financial Highlights
    - Revenue: $450M (+45% YoY)
    - Net Loss: -$50M (narrowing from -$80M)
    - Gross Margin: 72%

    ## Risk Factors
    - Significant customer concentration (top 3 = 40% revenue)
    - Operating losses expected to continue
    - Highly competitive market

    ## Underwriters
    - Goldman Sachs (Lead)
    - Morgan Stanley
    - JP Morgan
  `;

  const sampleProseText = `
    CloudTech Inc. is filing an S-1 registration statement for an initial public offering
    of $500 million. The company plans to offer 25 million shares at an expected price range
    of $18-$21 per share. CloudTech provides cloud-based enterprise software solutions.

    The company reported $450 million in revenue for fiscal year 2024, representing 45%
    year-over-year growth. Despite a net loss of $50 million, this represents an improvement
    from the prior year's $80 million loss. Gross margin stands at 72%.

    Proceeds will be used for general corporate purposes, R&D investment of approximately
    $150 million, and sales and marketing expansion. Goldman Sachs is serving as lead
    underwriter with Morgan Stanley and JP Morgan as joint bookrunners.

    Key risks include customer concentration, with the top 3 customers representing 40%
    of revenue, and continued operating losses expected in the near term.
  `;

  describe('Markdown format extraction', () => {
    it('should extract offeringSize', () => {
      const result = extractS1Data(sampleMarkdownText);
      expect(result.offeringSize).toBe('$500M');
    });

    it('should extract priceRange', () => {
      const result = extractS1Data(sampleMarkdownText);
      expect(result.priceRange).toBe('$18-$21 per share');
    });

    it('should extract sharesOffered', () => {
      const result = extractS1Data(sampleMarkdownText);
      expect(result.sharesOffered).toBe('25,000,000');
    });

    it('should extract businessDescription', () => {
      const result = extractS1Data(sampleMarkdownText);
      expect(result.businessDescription).toContain('cloud-based');
    });

    it('should extract useOfProceeds', () => {
      const result = extractS1Data(sampleMarkdownText);
      expect(result.useOfProceeds.length).toBeGreaterThanOrEqual(2);
      expect(result.useOfProceeds.some(p => p.includes('R&D') || p.includes('corporate'))).toBe(true);
    });

    it('should extract financialHighlights', () => {
      const result = extractS1Data(sampleMarkdownText);
      expect(result.financialHighlights.length).toBeGreaterThanOrEqual(1);
      expect(result.financialHighlights.some(h => h.label === 'Revenue')).toBe(true);
    });

    it('should extract riskFactors', () => {
      const result = extractS1Data(sampleMarkdownText);
      expect(result.riskFactors.length).toBeGreaterThanOrEqual(1);
      expect(result.riskFactors.some(r => r.includes('customer') || r.includes('concentration'))).toBe(true);
    });

    it('should extract underwriters', () => {
      const result = extractS1Data(sampleMarkdownText);
      expect(result.underwriters.length).toBeGreaterThanOrEqual(1);
      expect(result.underwriters.some(u => u.includes('Goldman'))).toBe(true);
    });
  });

  describe('Prose format extraction', () => {
    it('should extract offeringSize from prose', () => {
      const result = extractS1Data(sampleProseText);
      expect(result.offeringSize).toBe('$500M');
    });

    it('should extract priceRange from prose', () => {
      const result = extractS1Data(sampleProseText);
      expect(result.priceRange).toContain('$18');
    });

    it('should extract financialHighlights from prose', () => {
      const result = extractS1Data(sampleProseText);
      expect(result.financialHighlights.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty input gracefully', () => {
      const result = extractS1Data('');
      expect(result.offeringSize).toBeUndefined();
      expect(result.financialHighlights).toEqual([]);
      expect(result.useOfProceeds).toEqual([]);
    });

    it('should handle malformed input without crashing', () => {
      const result = extractS1Data('Random text without any IPO data');
      expect(result).toBeDefined();
      expect(result.financialHighlights).toEqual([]);
    });

    it('should handle partial data', () => {
      const result = extractS1Data('The company is raising $200M in its IPO.');
      expect(result.offeringSize).toBe('$200M');
    });
  });
});
