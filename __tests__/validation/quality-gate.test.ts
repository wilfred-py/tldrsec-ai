import { QualityGate, QualityGateResult } from '@/lib/validation/quality-gate';

describe('QualityGate', () => {
  describe('shouldBlockDelivery', () => {
    it('should allow delivery when all scores are above thresholds', () => {
      const result = QualityGate.evaluate({
        accuracyScore: 80,
        completenessScore: 70,
        relevanceScore: 75,
        confidenceScore: 75,
        isValid: true,
        issues: [],
      });
      expect(result.shouldBlock).toBe(false);
      expect(result.action).toBe('deliver');
    });

    it('should block delivery when accuracy score is below 60', () => {
      const result = QualityGate.evaluate({
        accuracyScore: 45,
        completenessScore: 70,
        relevanceScore: 75,
        confidenceScore: 55,
        isValid: false,
        issues: ['Low accuracy'],
      });
      expect(result.shouldBlock).toBe(true);
      expect(result.action).toBe('retry');
    });

    it('should block delivery when completeness score is below 50', () => {
      const result = QualityGate.evaluate({
        accuracyScore: 80,
        completenessScore: 35,
        relevanceScore: 75,
        confidenceScore: 60,
        isValid: false,
        issues: ['Incomplete summary'],
      });
      expect(result.shouldBlock).toBe(true);
    });

    it('should block delivery when confidence score is below 55', () => {
      const result = QualityGate.evaluate({
        accuracyScore: 60,
        completenessScore: 50,
        relevanceScore: 50,
        confidenceScore: 45,
        isValid: false,
        issues: ['Low confidence'],
      });
      expect(result.shouldBlock).toBe(true);
    });

    it('should return "drop" action on second failure (retry exhausted)', () => {
      const result = QualityGate.evaluate({
        accuracyScore: 45,
        completenessScore: 35,
        relevanceScore: 40,
        confidenceScore: 40,
        isValid: false,
        issues: ['Low quality'],
      }, { isRetry: true });
      expect(result.shouldBlock).toBe(true);
      expect(result.action).toBe('drop');
    });

    it('should allow delivery when validation was skipped (cached summary)', () => {
      const result = QualityGate.evaluate(null);
      expect(result.shouldBlock).toBe(false);
      expect(result.action).toBe('deliver');
    });

    // Boundary tests (Review Decision #11)
    it('should allow delivery when scores are exactly at thresholds', () => {
      const result = QualityGate.evaluate({
        accuracyScore: 60,
        completenessScore: 50,
        relevanceScore: 55,
        confidenceScore: 55,
        isValid: true,
        issues: [],
      });
      expect(result.shouldBlock).toBe(false);
      expect(result.action).toBe('deliver');
    });

    it('should block when accuracy is one below threshold (59)', () => {
      const result = QualityGate.evaluate({
        accuracyScore: 59,
        completenessScore: 50,
        relevanceScore: 55,
        confidenceScore: 55,
        isValid: false,
        issues: ['Borderline accuracy'],
      });
      expect(result.shouldBlock).toBe(true);
    });

    it('should handle zero scores gracefully', () => {
      const result = QualityGate.evaluate({
        accuracyScore: 0,
        completenessScore: 0,
        relevanceScore: 0,
        confidenceScore: 0,
        isValid: false,
        issues: ['All zeros'],
      });
      expect(result.shouldBlock).toBe(true);
      expect(result.action).toBe('retry');
    });

    it('should handle over-100 scores (malformed AI response)', () => {
      const result = QualityGate.evaluate({
        accuracyScore: 150,
        completenessScore: 200,
        relevanceScore: 100,
        confidenceScore: 100,
        isValid: true,
        issues: [],
      });
      expect(result.shouldBlock).toBe(false);
    });

    it('should block when one score fails even if others pass', () => {
      const result = QualityGate.evaluate({
        accuracyScore: 90,
        completenessScore: 90,
        relevanceScore: 54, // below 55 threshold
        confidenceScore: 90,
        isValid: false,
        issues: ['Low relevance'],
      });
      expect(result.shouldBlock).toBe(true);
    });
  });

  describe('detectEmptySections', () => {
    it('should detect when 10-K summary has no financial highlights', () => {
      const issues = QualityGate.detectEmptySections('10-K', {
        summary: 'Apple filed a 10-K.',
        financialHighlights: [],
        segments: [],
        riskFactors: [],
        keyPoints: [],
      });
      expect(issues).toContain('MISSING_FINANCIAL_HIGHLIGHTS');
    });

    it('should detect when 8-K has no key highlights', () => {
      const issues = QualityGate.detectEmptySections('8-K', {
        summary: 'Company filed an 8-K.',
        keyHighlights: [],
        eventType: '',
      });
      expect(issues).toContain('MISSING_KEY_HIGHLIGHTS');
    });

    it('should detect when Form 4 has no transactions', () => {
      const issues = QualityGate.detectEmptySections('Form 4', {
        summary: 'Insider filed Form 4.',
        filerName: '',
        transactions: [],
      });
      expect(issues).toContain('MISSING_TRANSACTIONS');
      expect(issues).toContain('MISSING_FILER_NAME');
    });

    it('should return empty array when all required sections present', () => {
      const issues = QualityGate.detectEmptySections('8-K', {
        summary: 'Company reported earnings.',
        keyHighlights: ['Revenue beat estimates'],
        eventType: 'Earnings Release',
        itemNumbers: ['2.02'],
      });
      expect(issues).toEqual([]);
    });

    it('should detect when 10-Q has no financial highlights', () => {
      const issues = QualityGate.detectEmptySections('10-Q', {
        summary: 'Apple filed a 10-Q.',
        financialHighlights: [],
        quarterlyTrends: [],
      });
      expect(issues).toContain('MISSING_FINANCIAL_HIGHLIGHTS');
    });

    it('should detect missing event type for 8-K', () => {
      const issues = QualityGate.detectEmptySections('8-K', {
        summary: 'Company filed an 8-K.',
        keyHighlights: ['Something happened'],
        eventType: '',
      });
      expect(issues).toContain('MISSING_EVENT_TYPE');
    });
  });
});
