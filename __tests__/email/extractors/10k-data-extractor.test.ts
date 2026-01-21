/**
 * Tests for Form 10-K Data Extractor
 *
 * These tests verify extraction of structured data from 10-K summary text.
 * The extractor handles both AI-generated strings (parsing needed) and
 * existing object structures (pass-through).
 */

import { extract10KData, Form10KExtractedData, FinancialHighlight, BusinessSegment } from '@/lib/email/10k-data-extractor';

describe('extract10KData', () => {
  // Sample summary text mimicking AI output
  const sampleSummaryText = `
    **Revenue**: $50.5B (+15% YoY)
    **Net Income**: $12.3B (+8% YoY)
    **Operating Margin**: 24.3% (-2 points)

    ## Key Highlights
    - Cloud services grew 28% to $25B, now 50% of total revenue
    - International expansion drove 20% of growth
    - R&D investment increased to $8B

    ## Business Segments
    - Cloud Services: $25B (+28%)
    - Enterprise Software: $15B (+5%)
    - Consumer Products: $10.5B (-3%)

    ## Risk Factors
    - Supply chain disruptions could impact margins by 3-5%
    - Currency headwinds expected to reduce international revenue
    - Regulatory scrutiny in EU markets
  `;

  describe('Financial Highlights Extraction', () => {
    it('should extract financialHighlights with label, value, and change', () => {
      const result = extract10KData(sampleSummaryText);
      expect(result.financialHighlights).toBeDefined();
      expect(result.financialHighlights.length).toBeGreaterThanOrEqual(1);

      // Check first highlight has required structure
      const firstHighlight = result.financialHighlights[0];
      expect(firstHighlight).toHaveProperty('label');
      expect(firstHighlight).toHaveProperty('value');
    });

    it('should extract Revenue highlight correctly', () => {
      const result = extract10KData(sampleSummaryText);
      const revenueHighlight = result.financialHighlights.find(
        h => h.label.toLowerCase().includes('revenue')
      );
      expect(revenueHighlight).toBeDefined();
      expect(revenueHighlight?.value).toMatch(/\$50\.?5?B/i);
      expect(revenueHighlight?.change).toMatch(/\+?15%/);
    });

    it('should parse markdown bold format: **Label**: $Value (+X%)', () => {
      const text = '**Revenue**: $45.2B (+12% YoY)\n**Net Income**: $8.1B (-5% YoY)';
      const result = extract10KData(text);
      expect(result.financialHighlights.length).toBeGreaterThanOrEqual(2);
    });

    it('should parse plain format: Label: $Value (+X%)', () => {
      const text = 'Revenue: $45.2B (+12%)\nNet Income: $8.1B (-5%)';
      const result = extract10KData(text);
      expect(result.financialHighlights.length).toBeGreaterThanOrEqual(1);
    });

    it('should parse table format: | Label | Value | Change |', () => {
      const text = `| Metric | Value | Change |
|--------|-------|--------|
| Revenue | $45.2B | +12% |
| Net Income | $8.1B | -5% |`;
      const result = extract10KData(text);
      expect(result.financialHighlights.length).toBeGreaterThanOrEqual(2);
    });

    it('should limit to 6 financial highlights max', () => {
      const text = `**Revenue**: $50B (+10%)
**Net Income**: $10B (+5%)
**Gross Profit**: $30B (+8%)
**Operating Income**: $15B (+12%)
**EBITDA**: $20B (+7%)
**Free Cash Flow**: $8B (+15%)
**Earnings Per Share**: $5.50 (+20%)
**Return on Equity**: 25% (+3%)`;
      const result = extract10KData(text);
      expect(result.financialHighlights.length).toBeLessThanOrEqual(6);
    });

    it('should deduplicate highlights by label', () => {
      const text = '**Revenue**: $50B (+10%)\n**Revenue**: $50B (+10%)';
      const result = extract10KData(text);
      const revenueCount = result.financialHighlights.filter(
        h => h.label.toLowerCase().includes('revenue')
      ).length;
      expect(revenueCount).toBe(1);
    });
  });

  describe('Business Segments Extraction', () => {
    it('should extract segments with name, revenue, and growth', () => {
      const result = extract10KData(sampleSummaryText);
      expect(result.segments).toBeDefined();
      expect(result.segments.length).toBeGreaterThanOrEqual(1);

      const firstSegment = result.segments[0];
      expect(firstSegment).toHaveProperty('name');
      expect(firstSegment).toHaveProperty('revenue');
    });

    it('should parse segment bullet format: - Name: $Value (+X%)', () => {
      const text = `## Segments
- Cloud Services: $25B (+28%)
- Enterprise: $15B (+5%)`;
      const result = extract10KData(text);
      expect(result.segments.length).toBeGreaterThanOrEqual(2);

      const cloudSegment = result.segments.find(s => s.name.toLowerCase().includes('cloud'));
      expect(cloudSegment).toBeDefined();
      expect(cloudSegment?.revenue).toMatch(/\$25B/);
      expect(cloudSegment?.growth).toMatch(/\+?28%/);
    });

    it('should parse segment table format', () => {
      const text = `| Segment | Revenue | Growth |
|---------|---------|--------|
| Data Center | $10.5B | +122% |
| Gaming | $2.5B | -25% |`;
      const result = extract10KData(text);
      expect(result.segments.length).toBeGreaterThanOrEqual(2);
    });

    it('should limit to 5 segments max', () => {
      const text = `- Segment A: $10B (+5%)
- Segment B: $8B (+3%)
- Segment C: $6B (+7%)
- Segment D: $4B (+2%)
- Segment E: $3B (+4%)
- Segment F: $2B (+6%)`;
      const result = extract10KData(text);
      expect(result.segments.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Risk Factors Extraction', () => {
    it('should extract riskFactors as string array', () => {
      const result = extract10KData(sampleSummaryText);
      expect(result.riskFactors).toBeDefined();
      expect(Array.isArray(result.riskFactors)).toBe(true);
      expect(result.riskFactors.length).toBeGreaterThanOrEqual(1);
    });

    it('should extract risks under "Risk" section headers', () => {
      const result = extract10KData(sampleSummaryText);
      const hasSupplyChainRisk = result.riskFactors.some(r =>
        r.toLowerCase().includes('supply chain')
      );
      expect(hasSupplyChainRisk).toBe(true);
    });

    it('should limit to 3 risk factors max', () => {
      const text = `## Risk Factors
- Risk 1
- Risk 2
- Risk 3
- Risk 4
- Risk 5`;
      const result = extract10KData(text);
      expect(result.riskFactors.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Key Points Extraction', () => {
    it('should extract keyPoints from Key Highlights section', () => {
      const result = extract10KData(sampleSummaryText);
      expect(result.keyPoints).toBeDefined();
      expect(Array.isArray(result.keyPoints)).toBe(true);
      expect(result.keyPoints.length).toBeGreaterThanOrEqual(1);
    });

    it('should extract bullet points under Highlights header', () => {
      const result = extract10KData(sampleSummaryText);
      const hasCloudPoint = result.keyPoints.some(p =>
        p.toLowerCase().includes('cloud')
      );
      expect(hasCloudPoint).toBe(true);
    });

    it('should limit to 5 key points max', () => {
      const text = `## Highlights
- Point 1 with detail
- Point 2 with detail
- Point 3 with detail
- Point 4 with detail
- Point 5 with detail
- Point 6 with detail`;
      const result = extract10KData(text);
      expect(result.keyPoints.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Fiscal Year Extraction', () => {
    it('should extract fiscal year from text', () => {
      const text = 'For fiscal year 2024, the company reported strong results.';
      const result = extract10KData(text);
      expect(result.fiscalYear).toBe('2024');
    });

    it('should handle "FY2024" format', () => {
      const text = 'FY2024 annual report shows significant growth.';
      const result = extract10KData(text);
      expect(result.fiscalYear).toBe('2024');
    });

    it('should handle "fiscal year ended December 31, 2024" format', () => {
      const text = 'For the fiscal year ended December 31, 2024';
      const result = extract10KData(text);
      expect(result.fiscalYear).toBe('2024');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input gracefully', () => {
      const result = extract10KData('');
      expect(result.financialHighlights).toEqual([]);
      expect(result.segments).toEqual([]);
      expect(result.riskFactors).toEqual([]);
      expect(result.keyPoints).toEqual([]);
    });

    it('should handle malformed input without crashing', () => {
      const result = extract10KData('Random text without any structure');
      expect(result).toBeDefined();
      expect(result.financialHighlights).toEqual([]);
    });

    it('should handle null/undefined gracefully', () => {
      // @ts-expect-error - Testing runtime behavior with null
      const result1 = extract10KData(null);
      expect(result1).toBeDefined();

      // @ts-expect-error - Testing runtime behavior with undefined
      const result2 = extract10KData(undefined);
      expect(result2).toBeDefined();
    });

    it('should preserve special characters in extracted text', () => {
      const text = "**Revenue**: $50.5B (+15% YoY) - Company's best quarter";
      const result = extract10KData(text);
      // Should not crash and should extract what it can
      expect(result).toBeDefined();
    });
  });

  describe('Real-World Sample: NVIDIA 10-K', () => {
    const nvidiaSample = `NVIDIA Corporation (NVDA) reported exceptional fiscal year 2024 results.

**Revenue**: $60.9B (+126% YoY)
**Net Income**: $29.8B (+581% YoY)
**Gross Margin**: 72.7% (+17.5 points)
**Operating Income**: $33.0B (+681% YoY)

## Business Segments
- Data Center: $47.5B (+217%)
- Gaming: $10.4B (+15%)
- Professional Visualization: $1.6B (+1%)
- Automotive: $1.1B (+21%)

## Key Highlights
- AI chip demand drove unprecedented growth
- Data Center revenue now represents 78% of total
- H100 GPU became the dominant AI training accelerator
- Supply constraints limited revenue potential

## Risk Factors
- Customer concentration risk with major cloud providers
- Export restrictions to China impacting revenue
- Competition from AMD and custom silicon increasing`;

    it('should extract all sections from NVIDIA 10-K sample', () => {
      const result = extract10KData(nvidiaSample);

      // Financial highlights
      expect(result.financialHighlights.length).toBeGreaterThanOrEqual(3);
      const revenue = result.financialHighlights.find(h => h.label.toLowerCase().includes('revenue'));
      expect(revenue?.value).toMatch(/\$60\.?9?B/);
      expect(revenue?.change).toMatch(/\+?126%/);

      // Segments
      expect(result.segments.length).toBeGreaterThanOrEqual(3);
      const dataCenter = result.segments.find(s => s.name.toLowerCase().includes('data center'));
      expect(dataCenter).toBeDefined();
      expect(dataCenter?.revenue).toMatch(/\$47\.?5?B/);

      // Risk factors
      expect(result.riskFactors.length).toBeGreaterThanOrEqual(2);

      // Key points
      expect(result.keyPoints.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Type Safety', () => {
    it('should return properly typed Form10KExtractedData', () => {
      const result: Form10KExtractedData = extract10KData(sampleSummaryText);

      // TypeScript compile-time check - these should not error
      const highlights: FinancialHighlight[] = result.financialHighlights;
      const segments: BusinessSegment[] = result.segments;
      const risks: string[] = result.riskFactors;
      const points: string[] = result.keyPoints;

      expect(highlights).toBeDefined();
      expect(segments).toBeDefined();
      expect(risks).toBeDefined();
      expect(points).toBeDefined();
    });
  });
});
