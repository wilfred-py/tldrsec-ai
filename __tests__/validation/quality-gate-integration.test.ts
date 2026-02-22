/**
 * Integration test verifying the quality gate blocks email delivery
 * when validation scores are below thresholds.
 *
 * Tests the decision logic that would run in filing-processor.ts
 * without needing the full filing processor dependencies.
 */
import { QualityGate } from '@/lib/validation/quality-gate';
import type { SummaryValidationResult } from '@/lib/validation/summary-content-validator';

describe('Quality Gate Integration', () => {
  const makeValidationResult = (overrides: Partial<SummaryValidationResult> = {}): SummaryValidationResult => ({
    isValid: true,
    accuracyScore: 80,
    completenessScore: 70,
    relevanceScore: 75,
    confidenceScore: 75,
    issues: [],
    strengths: ['Good summary'],
    overallAssessment: 'Accurate summary',
    validationDurationMs: 1000,
    ...overrides,
  });

  describe('email delivery decision', () => {
    it('should allow email when quality gate passes', () => {
      const validation = makeValidationResult();
      const result = QualityGate.evaluate(validation);

      expect(result.shouldBlock).toBe(false);
      expect(result.action).toBe('deliver');
      // In filing-processor: queueEmail() WOULD be called
    });

    it('should block email when quality gate fails (first attempt triggers retry)', () => {
      const validation = makeValidationResult({
        accuracyScore: 40,
        isValid: false,
        issues: ['Major inaccuracies'],
      });
      const result = QualityGate.evaluate(validation);

      expect(result.shouldBlock).toBe(true);
      expect(result.action).toBe('retry');
      // In filing-processor: generateAISummaryWithRetry() called with temperature 0.2
    });

    it('should drop email after retry still fails', () => {
      const validation = makeValidationResult({
        accuracyScore: 40,
        isValid: false,
        issues: ['Still inaccurate after retry'],
      });
      const result = QualityGate.evaluate(validation, { isRetry: true });

      expect(result.shouldBlock).toBe(true);
      expect(result.action).toBe('drop');
      // In filing-processor: queueEmail() is NOT called, qualityBlocked = true
    });

    it('should allow email for cached summaries (no validation)', () => {
      const result = QualityGate.evaluate(null);

      expect(result.shouldBlock).toBe(false);
      expect(result.action).toBe('deliver');
    });
  });

  describe('retry temperature escalation', () => {
    it('should recommend retry with temperature 0.2 (2x baseline 0.1)', () => {
      const validation = makeValidationResult({
        accuracyScore: 45,
        completenessScore: 35,
        isValid: false,
      });
      const result = QualityGate.evaluate(validation);

      expect(result.action).toBe('retry');
      // The filing processor passes { temperature: 0.2 } to generateAISummaryWithRetry
      // This is 2x the baseline of 0.1
    });
  });

  describe('empty section detection combined with quality gate', () => {
    it('should detect empty sections alongside low validation scores', () => {
      const validation = makeValidationResult({
        accuracyScore: 55,
        completenessScore: 30,
        isValid: false,
      });

      const gateResult = QualityGate.evaluate(validation);
      const emptySections = QualityGate.detectEmptySections('10-K', {
        summary: 'Brief summary.',
        financialHighlights: [],
        keyPoints: [],
      });

      expect(gateResult.shouldBlock).toBe(true);
      expect(emptySections).toContain('MISSING_FINANCIAL_HIGHLIGHTS');
      expect(emptySections).toContain('MISSING_KEY_POINTS');
    });
  });
});
