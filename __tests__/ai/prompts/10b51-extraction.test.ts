/**
 * 10b5-1 Detection Tests
 *
 * Tests for ensuring 10b5-1 trading plan status is correctly extracted
 * and communicated in Form 4 summaries.
 *
 * Key scenarios tested:
 * 1. AI prompt includes explicit 10b5-1 extraction guidance
 * 2. Schema includes has10b51Plan boolean field
 * 3. Signal strength detection from text patterns
 * 4. Signal strength from structured JSON field
 */

import { generateFilingPrompt } from '../../../lib/ai/prompts/unified-prompts';
import { extractForm4Data } from '../../../lib/email/form4-data-extractor';

describe('10b5-1 Detection', () => {
  describe('AI Prompt Guidance', () => {
    it('should include explicit 10b5-1 extraction instructions in Form 4 prompt', () => {
      // When filing content is provided, Form 4 extraction guidance is included in userPrompt
      const { userPrompt } = generateFilingPrompt({
        formType: '4',
        filingContent: 'test filing content'
      });

      // User prompt should contain 10b5-1 extraction guidance
      expect(userPrompt).toContain('10b5-1');
    });

    it('should instruct AI to check footnotes for 10b5-1 mentions', () => {
      const { userPrompt } = generateFilingPrompt({
        formType: '4',
        filingContent: 'test filing content'
      });

      // Prompt should mention footnotes where 10b5-1 info typically appears
      expect(userPrompt.toLowerCase()).toMatch(/footnote|explanation/);
    });

    it('should include has10b51Plan boolean field in Form 4 schema', () => {
      const { userPrompt } = generateFilingPrompt({
        formType: '4',
        filingContent: 'test filing content'
      });

      // Schema in user prompt should include the structured boolean field
      expect(userPrompt).toContain('has10b51Plan');
    });

    it('should instruct to check for pre-arranged trading plan language', () => {
      const { userPrompt } = generateFilingPrompt({
        formType: '4',
        filingContent: 'test filing content'
      });

      // Should mention pre-arranged or trading plan detection
      expect(userPrompt.toLowerCase()).toMatch(/pre-arranged|trading plan|prearranged/);
    });
  });

  describe('Signal Strength via extractForm4Data', () => {
    it('should detect 10b5-1 from explicit mention in summary', () => {
      const summaryText = `
**Reporting Person**: Jensen Huang
**Role**: CEO

Sale of 50,000 shares at $450.00 pursuant to a Rule 10b5-1 trading plan.
This transaction was pre-scheduled and does not represent a discretionary sale.
`;
      const result = extractForm4Data(summaryText);

      // Signal strength should indicate 10b5-1 plan
      expect(result.signalStrength).toMatch(/10b5-1|weak/i);
    });

    it('should detect 10b5-1 from footnote-style reference', () => {
      const summaryText = `
**Reporting Person**: Tim Cook
**Role**: CEO

Sold 100,000 shares at $180.50.

The transaction was effected pursuant to a pre-arranged trading plan adopted on March 1, 2025.
`;
      const result = extractForm4Data(summaryText);

      // Should detect the pre-arranged plan language
      expect(result.signalStrength.toLowerCase()).toMatch(/10b5-1|weak|pre-arranged|plan/);
    });

    it('should NOT falsely detect 10b5-1 when negated', () => {
      const summaryText = `
**Reporting Person**: Elon Musk
**Role**: CEO

Sale of 1,000,000 shares at $250.00.

This transaction was NOT pursuant to a 10b5-1 trading plan.
The sale represents a discretionary decision by the insider.
`;
      const result = extractForm4Data(summaryText);

      // Signal strength should NOT indicate a weak 10b5-1 signal when negated
      // It might be Strong or Moderate, but not "Weak - 10b5-1 Plan"
      if (result.signalStrength.includes('10b5-1')) {
        // This would be a failure - negated 10b5-1 should not trigger weak signal
        expect(result.signalStrength).not.toBe('Weak - 10b5-1 Plan');
      }
    });

    it('should handle "no 10b5-1 plan" negation pattern', () => {
      const summaryText = `
**Reporting Person**: Some Executive
**Role**: Director

Purchase of 5,000 shares at $100.00.

There is no 10b5-1 trading plan associated with this transaction.
`;
      const result = extractForm4Data(summaryText);

      // Should not flag as 10b5-1 plan when explicitly negated
      expect(result.signalStrength).not.toBe('Weak - 10b5-1 Plan');
    });

    it('should detect 10b5-1 from "Rule 10b" variation', () => {
      const summaryText = `
**Reporting Person**: CFO
**Role**: CFO

Sale conducted under Rule 10b pre-arranged trading agreement.
`;
      const result = extractForm4Data(summaryText);

      expect(result.signalStrength.toLowerCase()).toMatch(/10b|weak|plan/);
    });
  });

  describe('Multiple Transaction Types with 10b5-1', () => {
    it('should correctly identify 10b5-1 in mixed transaction filings', () => {
      const summaryText = `
**Reporting Person**: Jane Smith
**Role**: Director

| Date | Code | Amount | Price | A/D |
|------|------|--------|-------|-----|
| 2026-01-10 | S | 5,000 | $890.50 | D |
| 2026-01-10 | J | 10,000 | $0 | D |

The sale was executed under a 10b5-1 pre-planned trading arrangement.
The trust transfer represents estate planning.
`;
      const result = extractForm4Data(summaryText);

      // Should detect 10b5-1 despite mixed transactions
      expect(result.signalStrength.toLowerCase()).toMatch(/10b5-1|weak/);
    });
  });
});
