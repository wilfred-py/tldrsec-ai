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
import { parseResponse } from '@/lib/ai/parsers/response-parser';

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

describe('Headline and emailSubject normalization', () => {
  // Exercise the quality gate through the public parseResponse API.
  // Use allowPartial so we get back the normalized data even if Zod validation
  // fails on other required fields for the schema.

  it('schemas expose headline and emailSubject via BASE_SCHEMA', () => {
    const eightK = getSchemaForFormType('8-K');
    const tenK = getSchemaForFormType('10-K');
    expect(eightK.properties).toHaveProperty('headline');
    expect(tenK.properties).toHaveProperty('emailSubject');
  });

  it('strips ticker prefix from headline', () => {
    const json = JSON.stringify({
      company: 'Apple Inc.',
      summary: 'Apple reported strong Q4 results with record iPhone revenue.',
      headline: 'AAPL: Apple reported record iPhone revenue in Q4 earnings',
    });
    const result = parseResponse<Record<string, unknown>>(json, 'Generic', { allowPartial: true });
    expect(result.data?.headline).toBe('Apple reported record iPhone revenue in Q4 earnings');
  });

  it('strips form-type prefix from headline', () => {
    const json = JSON.stringify({
      company: 'Apple Inc.',
      summary: 'Apple announced a new CEO succession plan for next year.',
      headline: '8-K: Apple announced a new CEO succession plan for next year',
    });
    const result = parseResponse<Record<string, unknown>>(json, 'Generic', { allowPartial: true });
    expect(result.data?.headline).toBe('Apple announced a new CEO succession plan for next year');
  });

  it('truncates headline to 120 chars', () => {
    const longHeadline = 'A'.repeat(150);
    const json = JSON.stringify({
      company: 'Apple Inc.',
      summary: 'Apple filed a disclosure.',
      headline: longHeadline,
    });
    const result = parseResponse<Record<string, unknown>>(json, 'Generic', { allowPartial: true });
    expect((result.data?.headline as string).length).toBe(120);
  });

  it('quality gate deletes headline shorter than 20 chars', () => {
    const json = JSON.stringify({
      company: 'Apple Inc.',
      summary: 'Apple filed a disclosure with the SEC today.',
      headline: 'Short one',
    });
    const result = parseResponse<Record<string, unknown>>(json, 'Generic', { allowPartial: true });
    expect(result.data?.headline).toBeUndefined();
  });

  it('quality gate deletes headlines matching generic patterns', () => {
    const genericHeadlines = [
      'This filing discloses material information about the company.',
      'The company reported several updates in this quarterly filing.',
      'A new development was announced in the filing today.',
      'An executive departure was disclosed in the recent filing.',
    ];
    for (const bad of genericHeadlines) {
      const json = JSON.stringify({
        company: 'Apple Inc.',
        summary: 'Apple filed a disclosure with the SEC today.',
        headline: bad,
      });
      const result = parseResponse<Record<string, unknown>>(json, 'Generic', { allowPartial: true });
      expect(result.data?.headline).toBeUndefined();
    }
  });

  it('quality gate accepts a valid headline', () => {
    const json = JSON.stringify({
      company: 'Apple Inc.',
      summary: 'Apple reported record iPhone revenue in Q4.',
      headline: 'Apple posts record iPhone revenue beating analyst estimates',
    });
    const result = parseResponse<Record<string, unknown>>(json, 'Generic', { allowPartial: true });
    expect(result.data?.headline).toBe('Apple posts record iPhone revenue beating analyst estimates');
  });

  it('truncates emailSubject to 100 chars', () => {
    const longSubject = 'B'.repeat(130);
    const json = JSON.stringify({
      company: 'Apple Inc.',
      summary: 'Apple filed a disclosure.',
      emailSubject: longSubject,
    });
    const result = parseResponse<Record<string, unknown>>(json, 'Generic', { allowPartial: true });
    expect((result.data?.emailSubject as string).length).toBe(100);
  });

  it('quality gate deletes emailSubject shorter than 15 chars', () => {
    const json = JSON.stringify({
      company: 'Apple Inc.',
      summary: 'Apple filed a disclosure with the SEC today.',
      emailSubject: 'Too short',
    });
    const result = parseResponse<Record<string, unknown>>(json, 'Generic', { allowPartial: true });
    expect(result.data?.emailSubject).toBeUndefined();
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
