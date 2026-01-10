/**
 * Tests for Form 10-Q Data Extractor
 *
 * These tests verify extraction of structured data from 10-Q summary text.
 * Form 10-Q = Quarterly Report with quarterly financial performance data.
 *
 * Key differences from 10-K:
 * - Includes QoQ (quarter-over-quarter) changes in addition to YoY
 * - Has quarterlyTrends array with trend direction indicators
 * - Includes guidanceUpdates for forward-looking statements
 */

import {
  extract10QData,
  Form10QExtractedData,
  QuarterlyFinancialHighlight,
  QuarterlyTrend,
} from '@/lib/email/10q-data-extractor';

describe('extract10QData', () => {
  // Sample summary text mimicking AI output for a 10-Q
  const sampleSummaryText = `
    Apple Inc. (AAPL) reported strong Q3 2024 results.

    **Revenue**: $85.8B (+5% YoY, +2% QoQ)
    **Net Income**: $21.4B (+8% YoY, -3% QoQ)
    **Gross Margin**: 46.3% (+1.2 points YoY)
    **EPS**: $1.40 (+10% YoY, +5% QoQ)

    ## Quarterly Trends
    - Services revenue: $22.3B - trending up
    - iPhone revenue: $39.3B - trending flat
    - Mac revenue: $7.0B - trending down

    ## Guidance Updates
    - Management expects Q4 revenue to grow in low-single digits YoY
    - Services segment projected to maintain 20%+ growth rate
    - R&D spending to increase by 15% in next quarter

    ## Key Points
    - Services hit all-time revenue record at $22.3B
    - Active device install base reached 2.2 billion
    - China revenue declined 8% amid economic headwinds

    ## Risk Factors
    - Currency headwinds expected to impact Q4 revenue by 2-3%
    - Supply chain constraints in memory chips
  `;

  describe('Quarterly Financial Highlights Extraction', () => {
    it('should extract financialHighlights with label, value, change, and qoqChange', () => {
      const result = extract10QData(sampleSummaryText);
      expect(result.financialHighlights).toBeDefined();
      expect(result.financialHighlights.length).toBeGreaterThanOrEqual(1);

      // Check structure has quarterly-specific fields
      const firstHighlight = result.financialHighlights[0];
      expect(firstHighlight).toHaveProperty('label');
      expect(firstHighlight).toHaveProperty('value');
    });

    it('should extract YoY and QoQ changes separately', () => {
      const result = extract10QData(sampleSummaryText);
      const revenueHighlight = result.financialHighlights.find(
        h => h.label.toLowerCase().includes('revenue')
      );
      expect(revenueHighlight).toBeDefined();
      expect(revenueHighlight?.change).toMatch(/\+?5%/);
      expect(revenueHighlight?.qoqChange).toMatch(/\+?2%/);
    });

    it('should parse markdown bold format with dual changes', () => {
      const text = '**Revenue**: $85.8B (+5% YoY, +2% QoQ)';
      const result = extract10QData(text);
      expect(result.financialHighlights.length).toBeGreaterThanOrEqual(1);
      expect(result.financialHighlights[0].qoqChange).toBeDefined();
    });

    it('should handle YoY-only changes (no QoQ)', () => {
      const text = '**Gross Margin**: 46.3% (+1.2 points YoY)';
      const result = extract10QData(text);
      const margin = result.financialHighlights.find(h => h.label.toLowerCase().includes('margin'));
      expect(margin).toBeDefined();
      expect(margin?.change).toBeDefined();
      // QoQ may be undefined if not provided
    });

    it('should limit to 6 financial highlights max', () => {
      const text = `**Revenue**: $100B (+10% YoY)
**Net Income**: $20B (+5% YoY)
**Gross Profit**: $60B (+8% YoY)
**Operating Income**: $30B (+12% YoY)
**EBITDA**: $35B (+7% YoY)
**Free Cash Flow**: $15B (+15% YoY)
**EPS**: $2.50 (+20% YoY)
**Return on Equity**: 30% (+5% YoY)`;
      const result = extract10QData(text);
      expect(result.financialHighlights.length).toBeLessThanOrEqual(6);
    });
  });

  describe('Quarterly Trends Extraction', () => {
    it('should extract quarterlyTrends array', () => {
      const result = extract10QData(sampleSummaryText);
      expect(result.quarterlyTrends).toBeDefined();
      expect(Array.isArray(result.quarterlyTrends)).toBe(true);
    });

    it('should extract metric, current, and trend from bullet points', () => {
      const result = extract10QData(sampleSummaryText);
      expect(result.quarterlyTrends.length).toBeGreaterThanOrEqual(1);

      const servicesTrend = result.quarterlyTrends.find(
        t => t.metric.toLowerCase().includes('services')
      );
      expect(servicesTrend).toBeDefined();
      expect(servicesTrend?.current).toMatch(/\$22\.?3?B/);
      expect(servicesTrend?.trend).toBe('up');
    });

    it('should correctly identify trend directions', () => {
      const result = extract10QData(sampleSummaryText);

      const upTrend = result.quarterlyTrends.find(t => t.trend === 'up');
      const flatTrend = result.quarterlyTrends.find(t => t.trend === 'flat');
      const downTrend = result.quarterlyTrends.find(t => t.trend === 'down');

      // Sample has all three types
      expect(upTrend).toBeDefined();
      expect(flatTrend).toBeDefined();
      expect(downTrend).toBeDefined();
    });

    it('should limit to 4 quarterly trends max', () => {
      const text = `## Quarterly Trends
- Metric A: $10B - trending up
- Metric B: $8B - trending down
- Metric C: $6B - trending flat
- Metric D: $4B - trending up
- Metric E: $3B - trending down`;
      const result = extract10QData(text);
      expect(result.quarterlyTrends.length).toBeLessThanOrEqual(4);
    });
  });

  describe('Guidance Updates Extraction', () => {
    it('should extract guidanceUpdates array', () => {
      const result = extract10QData(sampleSummaryText);
      expect(result.guidanceUpdates).toBeDefined();
      expect(Array.isArray(result.guidanceUpdates)).toBe(true);
    });

    it('should extract forward-looking statements', () => {
      const result = extract10QData(sampleSummaryText);
      expect(result.guidanceUpdates.length).toBeGreaterThanOrEqual(1);

      const hasQ4Guidance = result.guidanceUpdates.some(g =>
        g.toLowerCase().includes('q4') || g.toLowerCase().includes('expects')
      );
      expect(hasQ4Guidance).toBe(true);
    });

    it('should limit to 3 guidance updates max', () => {
      const text = `## Guidance Updates
- Guidance item 1 with detail
- Guidance item 2 with detail
- Guidance item 3 with detail
- Guidance item 4 with detail
- Guidance item 5 with detail`;
      const result = extract10QData(text);
      expect(result.guidanceUpdates.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Fiscal Quarter Extraction', () => {
    it('should extract fiscal quarter from text', () => {
      const result = extract10QData(sampleSummaryText);
      expect(result.fiscalQuarter).toMatch(/Q[1-4]\s*\d{4}/);
    });

    it('should handle "Q3 2024" format', () => {
      const text = 'For Q3 2024, the company reported strong results.';
      const result = extract10QData(text);
      expect(result.fiscalQuarter).toBe('Q3 2024');
    });

    it('should handle "third quarter 2024" format', () => {
      const text = 'Third quarter 2024 results exceeded expectations.';
      const result = extract10QData(text);
      expect(result.fiscalQuarter).toMatch(/Q3\s*2024/);
    });

    it('should handle "fiscal Q2 2024" format', () => {
      const text = 'Fiscal Q2 2024 performance summary';
      const result = extract10QData(text);
      expect(result.fiscalQuarter).toMatch(/Q2\s*2024/);
    });
  });

  describe('Risk Factors Extraction', () => {
    it('should extract riskFactors as string array', () => {
      const result = extract10QData(sampleSummaryText);
      expect(result.riskFactors).toBeDefined();
      expect(Array.isArray(result.riskFactors)).toBe(true);
      expect(result.riskFactors.length).toBeGreaterThanOrEqual(1);
    });

    it('should extract risks mentioning currency and supply chain', () => {
      const result = extract10QData(sampleSummaryText);
      const hasCurrencyRisk = result.riskFactors.some(r =>
        r.toLowerCase().includes('currency')
      );
      expect(hasCurrencyRisk).toBe(true);
    });

    it('should limit to 3 risk factors max', () => {
      const text = `## Risk Factors
- Risk 1
- Risk 2
- Risk 3
- Risk 4
- Risk 5`;
      const result = extract10QData(text);
      expect(result.riskFactors.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Key Points Extraction', () => {
    it('should extract keyPoints from Key Points section', () => {
      const result = extract10QData(sampleSummaryText);
      expect(result.keyPoints).toBeDefined();
      expect(Array.isArray(result.keyPoints)).toBe(true);
      expect(result.keyPoints.length).toBeGreaterThanOrEqual(1);
    });

    it('should extract bullet points about services record', () => {
      const result = extract10QData(sampleSummaryText);
      const hasServicesPoint = result.keyPoints.some(p =>
        p.toLowerCase().includes('services')
      );
      expect(hasServicesPoint).toBe(true);
    });

    it('should limit to 5 key points max', () => {
      const text = `## Key Points
- Point 1 with detail
- Point 2 with detail
- Point 3 with detail
- Point 4 with detail
- Point 5 with detail
- Point 6 with detail`;
      const result = extract10QData(text);
      expect(result.keyPoints.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty input gracefully', () => {
      const result = extract10QData('');
      expect(result.financialHighlights).toEqual([]);
      expect(result.quarterlyTrends).toEqual([]);
      expect(result.guidanceUpdates).toEqual([]);
      expect(result.riskFactors).toEqual([]);
      expect(result.keyPoints).toEqual([]);
    });

    it('should handle malformed input without crashing', () => {
      const result = extract10QData('Random text without any structure');
      expect(result).toBeDefined();
      expect(result.financialHighlights).toEqual([]);
    });

    it('should handle null/undefined gracefully', () => {
      // @ts-expect-error - Testing runtime behavior with null
      const result1 = extract10QData(null);
      expect(result1).toBeDefined();

      // @ts-expect-error - Testing runtime behavior with undefined
      const result2 = extract10QData(undefined);
      expect(result2).toBeDefined();
    });
  });

  describe('Real-World Sample: Apple Q3 2024', () => {
    it('should extract all sections from Apple 10-Q sample', () => {
      const result = extract10QData(sampleSummaryText);

      // Financial highlights with QoQ
      expect(result.financialHighlights.length).toBeGreaterThanOrEqual(3);
      const revenue = result.financialHighlights.find(h => h.label.toLowerCase().includes('revenue'));
      expect(revenue).toBeDefined();
      expect(revenue?.qoqChange).toBeDefined();

      // Quarterly trends
      expect(result.quarterlyTrends.length).toBeGreaterThanOrEqual(2);

      // Guidance updates
      expect(result.guidanceUpdates.length).toBeGreaterThanOrEqual(1);

      // Risk factors
      expect(result.riskFactors.length).toBeGreaterThanOrEqual(1);

      // Key points
      expect(result.keyPoints.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Type Safety', () => {
    it('should return properly typed Form10QExtractedData', () => {
      const result: Form10QExtractedData = extract10QData(sampleSummaryText);

      // TypeScript compile-time check
      const highlights: QuarterlyFinancialHighlight[] = result.financialHighlights;
      const trends: QuarterlyTrend[] = result.quarterlyTrends;
      const guidance: string[] = result.guidanceUpdates;
      const risks: string[] = result.riskFactors;
      const points: string[] = result.keyPoints;

      expect(highlights).toBeDefined();
      expect(trends).toBeDefined();
      expect(guidance).toBeDefined();
      expect(risks).toBeDefined();
      expect(points).toBeDefined();
    });
  });
});
