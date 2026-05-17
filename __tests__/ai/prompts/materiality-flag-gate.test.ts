/**
 * Tests for the enable_earnings_mini_deep_dive feature flag gate inside
 * generateFilingPrompt. When the flag is off, materialitySignal must NOT
 * appear in the schema or the extraction guidance — the model should never
 * see the field at all.
 *
 * Single gating layer per autoplan Decision #33 (schema/prompt level).
 */

import { generateFilingPrompt } from '@/lib/ai/prompts/unified-prompts';

describe('enableEarningsMiniDeepDive flag gating', () => {
  describe('flag OFF (default behavior)', () => {
    it('10-K user prompt does NOT mention materialitySignal in schema', () => {
      const { userPrompt } = generateFilingPrompt({
        formType: '10-K',
        filingContent: 'short filing excerpt',
      });
      expect(userPrompt).not.toContain('materialitySignal');
    });

    it('10-K user prompt does NOT contain the MATERIALITY SIGNAL rubric block', () => {
      const { userPrompt } = generateFilingPrompt({
        formType: '10-K',
        filingContent: 'short filing excerpt',
      });
      expect(userPrompt).not.toContain('MATERIALITY SIGNAL (4-tier classification');
    });

    it('10-Q user prompt does NOT mention materialitySignal in schema', () => {
      const { userPrompt } = generateFilingPrompt({
        formType: '10-Q',
        filingContent: 'short filing excerpt',
      });
      expect(userPrompt).not.toContain('materialitySignal');
    });

    it('10-Q user prompt does NOT contain the MATERIALITY SIGNAL rubric block', () => {
      const { userPrompt } = generateFilingPrompt({
        formType: '10-Q',
        filingContent: 'short filing excerpt',
      });
      expect(userPrompt).not.toContain('MATERIALITY SIGNAL (4-tier classification');
    });

    it('schema returned by generateFilingPrompt also omits materialitySignal', () => {
      const { schema } = generateFilingPrompt({
        formType: '10-K',
        filingContent: 'short filing excerpt',
      });
      expect(schema.properties).toBeDefined();
      expect(schema.properties?.materialitySignal).toBeUndefined();
    });
  });

  describe('flag ON', () => {
    it('10-K user prompt includes materialitySignal in schema', () => {
      const { userPrompt } = generateFilingPrompt({
        formType: '10-K',
        filingContent: 'short filing excerpt',
        enableEarningsMiniDeepDive: true,
      });
      expect(userPrompt).toContain('materialitySignal');
    });

    it('10-K user prompt includes the MATERIALITY SIGNAL rubric block', () => {
      const { userPrompt } = generateFilingPrompt({
        formType: '10-K',
        filingContent: 'short filing excerpt',
        enableEarningsMiniDeepDive: true,
      });
      expect(userPrompt).toContain('MATERIALITY SIGNAL (4-tier classification');
    });

    it('10-Q user prompt includes materialitySignal in schema', () => {
      const { userPrompt } = generateFilingPrompt({
        formType: '10-Q',
        filingContent: 'short filing excerpt',
        enableEarningsMiniDeepDive: true,
      });
      expect(userPrompt).toContain('materialitySignal');
    });

    it('10-Q user prompt includes the MATERIALITY SIGNAL rubric block', () => {
      const { userPrompt } = generateFilingPrompt({
        formType: '10-Q',
        filingContent: 'short filing excerpt',
        enableEarningsMiniDeepDive: true,
      });
      expect(userPrompt).toContain('MATERIALITY SIGNAL (4-tier classification');
    });

    it('schema includes materialitySignal property when flag is on', () => {
      const { schema } = generateFilingPrompt({
        formType: '10-K',
        filingContent: 'short filing excerpt',
        enableEarningsMiniDeepDive: true,
      });
      expect(schema.properties?.materialitySignal).toBeDefined();
      const mat = schema.properties?.materialitySignal as { properties?: Record<string, unknown> };
      expect(mat.properties?.score).toBeDefined();
      expect(mat.properties?.rationale).toBeDefined();
    });
  });

  describe('non-earnings forms (flag is ignored)', () => {
    it('8-K user prompt is unaffected by the flag', () => {
      const off = generateFilingPrompt({ formType: '8-K', filingContent: 'x', enableEarningsMiniDeepDive: false });
      const on = generateFilingPrompt({ formType: '8-K', filingContent: 'x', enableEarningsMiniDeepDive: true });
      // Neither version should mention materialitySignal — it's only on 10-K/10-Q
      expect(off.userPrompt).not.toContain('materialitySignal');
      expect(on.userPrompt).not.toContain('materialitySignal');
    });

    it('Form 4 user prompt is unaffected by the flag', () => {
      const off = generateFilingPrompt({ formType: '4', filingContent: 'x', enableEarningsMiniDeepDive: false });
      const on = generateFilingPrompt({ formType: '4', filingContent: 'x', enableEarningsMiniDeepDive: true });
      expect(off.userPrompt).not.toContain('materialitySignal');
      expect(on.userPrompt).not.toContain('materialitySignal');
    });
  });

  describe('materialitySignal field shape (when flag ON)', () => {
    it('field is optional — not in required[]', () => {
      const { schema } = generateFilingPrompt({
        formType: '10-K',
        filingContent: 'x',
        enableEarningsMiniDeepDive: true,
      });
      expect(schema.required).not.toContain('materialitySignal');
    });

    it('score enum is exactly [high, medium, low, noise]', () => {
      const { schema } = generateFilingPrompt({
        formType: '10-Q',
        filingContent: 'x',
        enableEarningsMiniDeepDive: true,
      });
      const mat = schema.properties?.materialitySignal as { properties?: { score?: { enum?: string[] } } };
      expect(mat.properties?.score?.enum).toEqual(['high', 'medium', 'low', 'noise']);
    });

    it('rationale has 400-char max', () => {
      const { schema } = generateFilingPrompt({
        formType: '10-K',
        filingContent: 'x',
        enableEarningsMiniDeepDive: true,
      });
      const mat = schema.properties?.materialitySignal as { properties?: { rationale?: { maxLength?: number } } };
      expect(mat.properties?.rationale?.maxLength).toBe(400);
    });
  });

  describe('whyItMatters per-form swap (flag-gated)', () => {
    it('10-K flag OFF — whyItMatters keeps the legacy 180-char generic description', () => {
      const { schema, userPrompt } = generateFilingPrompt({
        formType: '10-K',
        filingContent: 'x',
      });
      const wim = schema.properties?.whyItMatters as { maxLength?: number; description?: string };
      expect(wim.maxLength).toBe(180);
      expect(wim.description).toContain('40-180 chars');
      // Off-flag 10-K must NOT carry the new WIM WRITING RULES guidance block
      expect(userPrompt).not.toContain('WHY-IT-MATTERS WRITING RULES (10-K)');
    });

    it('10-K flag ON — whyItMatters gets the 400-char form-specific description', () => {
      const { schema, userPrompt } = generateFilingPrompt({
        formType: '10-K',
        filingContent: 'x',
        enableEarningsMiniDeepDive: true,
      });
      const wim = schema.properties?.whyItMatters as { maxLength?: number; description?: string };
      expect(wim.maxLength).toBe(400);
      expect(wim.description).toContain('80-400 chars');
      expect(wim.description).toContain('STRICT BAN ON METRIC RESTATEMENT');
      // Flag-on 10-K must carry the WIM WRITING RULES guidance
      expect(userPrompt).toContain('WHY-IT-MATTERS WRITING RULES (10-K)');
    });

    it('10-Q flag OFF — whyItMatters keeps the legacy 180-char generic description', () => {
      const { schema, userPrompt } = generateFilingPrompt({
        formType: '10-Q',
        filingContent: 'x',
      });
      const wim = schema.properties?.whyItMatters as { maxLength?: number; description?: string };
      expect(wim.maxLength).toBe(180);
      expect(userPrompt).not.toContain('WHY-IT-MATTERS WRITING RULES (10-Q)');
    });

    it('10-Q flag ON — whyItMatters gets the 400-char form-specific description', () => {
      const { schema, userPrompt } = generateFilingPrompt({
        formType: '10-Q',
        filingContent: 'x',
        enableEarningsMiniDeepDive: true,
      });
      const wim = schema.properties?.whyItMatters as { maxLength?: number; description?: string };
      expect(wim.maxLength).toBe(400);
      expect(wim.description).toContain('80-400 chars');
      expect(wim.description).toContain('STRICT BAN ON METRIC RESTATEMENT');
      // 10-Q-specific guidance must be present, and must contain the
      // QoQ DATA REQUIREMENT clause added 2026-05-17 per autoplan PR1-polish D5.
      expect(userPrompt).toContain('WHY-IT-MATTERS WRITING RULES (10-Q)');
      expect(userPrompt).toContain('QoQ DATA REQUIREMENT');
    });

    it('10-K vs 10-Q descriptions are DIFFERENT under flag ON (per-form-type guidance)', () => {
      const onK = generateFilingPrompt({ formType: '10-K', filingContent: 'x', enableEarningsMiniDeepDive: true });
      const onQ = generateFilingPrompt({ formType: '10-Q', filingContent: 'x', enableEarningsMiniDeepDive: true });
      const wimK = onK.schema.properties?.whyItMatters as { description?: string };
      const wimQ = onQ.schema.properties?.whyItMatters as { description?: string };
      expect(wimK.description).not.toBe(wimQ.description);
      expect(wimK.description).toContain('cross-year inflection');
      expect(wimQ.description).toContain('QoQ inflection');
    });

    it('non-earnings 8-K is unaffected by the per-form WIM swap', () => {
      // 8-K has its own whyItMatters slot using the legacy 180-char generic
      // property; the flag must not swap it for any non-10-K/10-Q form.
      const on = generateFilingPrompt({ formType: '8-K', filingContent: 'x', enableEarningsMiniDeepDive: true });
      const wim = on.schema.properties?.whyItMatters as { maxLength?: number };
      expect(wim.maxLength).toBe(180);
    });
  });
});
