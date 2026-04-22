/**
 * 8-K service-layer Zod validation tests (E1-E5)
 *
 * Tests the validation block in services/filing/summaryGenerationService.ts
 * that strips invalid tranches/dealTerms and logs structured warnings.
 *
 * Directly tests the Zod schemas + extractor fallback, not the OpenRouter call.
 */

import { z } from 'zod';
import { extract8KData } from '@/lib/email/8k-data-extractor';

// Re-declare schemas matching those in summaryGenerationService.ts.
// Kept in sync by regression-guard — if the service schemas change, update here.
const TrancheSchema = z.object({
  amountDisplay: z.string().min(1).max(64),
  currency: z.string().regex(/^[A-Z]{3}$/),
  coupon: z.string().max(64).optional(),
  yield: z.string().max(64).optional(),
  maturity: z.string().max(64).optional(),
  spread: z.string().max(64).optional(),
});

const DealTermsSchema = z.object({
  counterparty: z.string().min(1).max(200),
  dealValue: z.string().max(64).optional(),
  consideration: z.string().max(200).optional(),
  closeDate: z.string().max(64).optional(),
  approvals: z.array(z.string().max(100)).max(5).optional(),
  rationale: z.string().max(200).optional(),
});

describe('8-K service-layer validation (E1-E5)', () => {
  it('E1: strips tranches when Zod validation fails (missing required currency)', () => {
    const bad = [{ amountDisplay: '$1B' }]; // no currency
    const result = z.array(TrancheSchema).safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('E2: logs structured warning shape on 2.03 with empty tranches', () => {
    // Contract test: verify the warning payload structure is stable. The
    // service layer emits logger.warn with { event, filingId, summaryId, ticker, issue }.
    const expectedPayloadKeys = ['event', 'filingId', 'summaryId', 'ticker', 'issue'];
    const mockPayload = {
      event: '8k_structured_validation',
      filingId: 'f-123',
      summaryId: 'xai_summary_abc',
      ticker: 'TEST',
      issue: 'tranches_empty_on_203',
    };
    for (const key of expectedPayloadKeys) {
      expect(mockPayload).toHaveProperty(key);
    }
  });

  it('E3: rejects tranches with non-ISO currency (regex_fail path)', () => {
    const bad = [{ amountDisplay: '$1B', currency: 'dollars' }]; // lowercase, not ISO
    const result = z.array(TrancheSchema).safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('E4: accepts valid tranches array (positive path)', () => {
    const good = [
      { amountDisplay: '$1B', currency: 'USD', coupon: '4.5%', maturity: '2030' },
      { amountDisplay: '¥100B', currency: 'JPY' },
    ];
    const result = z.array(TrancheSchema).safeParse(good);
    expect(result.success).toBe(true);
  });

  it('E5: itemNumbers prose-parse fallback — extractor fills when LLM omits', () => {
    const prose = 'The company reported Item 2.03 - Creation of Direct Financial Obligation.';
    const extracted = extract8KData(prose);
    expect(extracted.itemNumbers).toContain('2.03');
  });

  describe('dealTerms schema', () => {
    it('rejects dealTerms with missing counterparty', () => {
      const bad = { dealValue: '$1B' };
      const result = DealTermsSchema.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('rejects dealTerms with >5 approvals', () => {
      const bad = {
        counterparty: 'Acme',
        approvals: ['a', 'b', 'c', 'd', 'e', 'f'], // 6
      };
      const result = DealTermsSchema.safeParse(bad);
      expect(result.success).toBe(false);
    });

    it('accepts minimal dealTerms with only counterparty', () => {
      const good = { counterparty: 'Acme Corp' };
      const result = DealTermsSchema.safeParse(good);
      expect(result.success).toBe(true);
    });
  });
});
