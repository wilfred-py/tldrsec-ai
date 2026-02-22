import { QualityGate } from '@/lib/validation/quality-gate';

describe('Content Quality Checks', () => {
  describe('10-K/10-Q sparse section detection', () => {
    it('should flag 10-K with all-empty financial highlights', () => {
      const issues = QualityGate.detectEmptySections('10-K', {
        summary: 'Apple filed a 10-K annual report.',
        financialHighlights: [],
        segments: [],
        riskFactors: [],
        keyPoints: [],
      });
      expect(issues.length).toBeGreaterThan(0);
      expect(issues).toContain('MISSING_FINANCIAL_HIGHLIGHTS');
    });

    it('should flag 10-Q with missing quarterly trends', () => {
      const issues = QualityGate.detectEmptySections('10-Q', {
        summary: 'Apple filed a 10-Q.',
        financialHighlights: [],
        quarterlyTrends: [],
      });
      expect(issues).toContain('MISSING_FINANCIAL_HIGHLIGHTS');
    });

    it('should not flag 10-K with populated financial highlights', () => {
      const issues = QualityGate.detectEmptySections('10-K', {
        summary: 'Apple 10-K report.',
        financialHighlights: [{ label: 'Revenue', value: '$50B' }],
        segments: [],
        riskFactors: [],
        keyPoints: ['Strong growth'],
      });
      expect(issues).not.toContain('MISSING_FINANCIAL_HIGHLIGHTS');
    });

    it('should flag 8-K with missing key highlights and event type', () => {
      const issues = QualityGate.detectEmptySections('8-K', {
        summary: 'Company filed an 8-K.',
        keyHighlights: [],
        eventType: '',
      });
      expect(issues).toContain('MISSING_KEY_HIGHLIGHTS');
      expect(issues).toContain('MISSING_EVENT_TYPE');
    });
  });

  describe('Form 4 section detection', () => {
    it('should flag Form 4 with missing transactions and filer name', () => {
      const issues = QualityGate.detectEmptySections('Form 4', {
        summary: 'Insider filing.',
        filerName: '',
        transactions: [],
      });
      expect(issues).toContain('MISSING_TRANSACTIONS');
      expect(issues).toContain('MISSING_FILER_NAME');
    });

    it('should not flag Form 4 with populated fields', () => {
      const issues = QualityGate.detectEmptySections('Form 4', {
        summary: 'Insider sold shares.',
        filerName: 'John Doe',
        transactions: [{ type: 'Sale', shares: '10,000' }],
      });
      expect(issues).toEqual([]);
    });
  });
});
