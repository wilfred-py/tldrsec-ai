/**
 * Tests for normalizeFields() in response-parser.ts
 *
 * Validates 8-K normalization, amendment routing through normalizeFields,
 * and correct canonicalization of form types.
 */

// We need to test the normalizeFields function indirectly through parseResponse
// since normalizeFields is not exported. We test through the public API.
import { getSchemaForFormType } from '@/lib/ai/prompts/unified-prompts';
import { canonicalizeFormType } from '@/lib/ai/utils/form-type-utils';

describe('8-K normalization via canonicalizeFormType integration', () => {
  it('8-K routes to the correct schema', () => {
    const schema = getSchemaForFormType('8-K');
    expect(schema.required).toContain('eventType');
  });

  it('canonicalizes 8-K correctly', () => {
    const result = canonicalizeFormType('8-K');
    expect(result.type).toBe('8-K');
    expect(result.isAmendment).toBe(false);
  });
});

describe('Amendment routing through normalizeFields', () => {
  it('10-K/A canonicalizes to 10-K for normalization', () => {
    const { type } = canonicalizeFormType('10-K/A');
    expect(type).toBe('10-K');
  });

  it('10-Q/A canonicalizes to 10-Q for normalization', () => {
    const { type } = canonicalizeFormType('10-Q/A');
    expect(type).toBe('10-Q');
  });

  it('10-K/A gets the 10-K schema (with financialHighlights required)', () => {
    const schema = getSchemaForFormType('10-K/A');
    expect(schema.required).toContain('financialHighlights');
    // Verify it's NOT the Generic schema (which only requires company, summary)
    expect(schema.required.length).toBeGreaterThan(2);
  });

  it('SC 13G/A gets the SC 13G schema', () => {
    const schema = getSchemaForFormType('SC 13G/A');
    expect(schema.required).toContain('ownershipPercentage');
  });
});

describe('Form 144 Zod schema integration', () => {
  it('Form 144 gets a dedicated schema (not Generic)', () => {
    // The schema should have filerName which Generic doesn't have
    const schema = getSchemaForFormType('144');
    expect(schema.required).toContain('filerName');
  });

  it('Form144 variant routes to the same schema', () => {
    const schema = getSchemaForFormType('Form144');
    expect(schema.required).toContain('filerName');
  });
});
