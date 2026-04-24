/**
 * Backward-compat + whyItMatters integration tests for validateAgainstSchema.
 *
 * Pre-whyItMatters fixtures must parse cleanly with whyItMatters === undefined.
 * Post-change fixtures with whyItMatters should be coerced per the two-state contract.
 */

import { validateAgainstSchema } from './schema-validators';

describe('validateAgainstSchema — backward compat (pre-whyItMatters)', () => {
  test('10-K fixture without whyItMatters parses cleanly', () => {
    const data = {
      company: 'Apple Inc.',
      period: 'FY2024',
      financials: [{ label: 'Revenue', value: '$391.0B' }],
      insights: ['Services revenue at record'],
      risks: ['Supply chain concentration'],
      summary: 'Strong annual results.',
      headline: 'Apple posts record FY2024 revenue',
    };
    const result = validateAgainstSchema(data, '10-K');
    expect(result.valid).toBe(true);
    expect((result.validatedData as Record<string, unknown>)?.whyItMatters).toBeUndefined();
  });

  test('10-Q fixture without whyItMatters parses cleanly', () => {
    const data = {
      company: 'Apple Inc.',
      period: 'Q3 FY2024',
      financials: [{ label: 'Revenue', value: '$94.9B' }],
      insights: ['iPhone down YoY'],
      risks: ['FX headwind'],
      summary: 'Third quarter results.',
    };
    const result = validateAgainstSchema(data, '10-Q');
    expect(result.valid).toBe(true);
    expect((result.validatedData as Record<string, unknown>)?.whyItMatters).toBeUndefined();
  });

  test('8-K fixture without whyItMatters parses cleanly', () => {
    const data = {
      company: 'Apple Inc.',
      reportDate: '2026-03-15',
      eventType: 'Item 2.02 Results of Operations',
      summary: 'Quarterly earnings release.',
      positiveDevelopments: 'Revenue beat',
      potentialConcerns: 'Services growth slowed',
    };
    const result = validateAgainstSchema(data, '8-K');
    expect(result.valid).toBe(true);
    expect((result.validatedData as Record<string, unknown>)?.whyItMatters).toBeUndefined();
  });

  test('S-1 fixture without whyItMatters parses cleanly', () => {
    const data = {
      company: 'NewCo Inc.',
      filingDate: '2026-01-15',
      offeringType: 'IPO',
      businessOverview: 'B2B SaaS for logistics.',
      riskFactors: ['Customer concentration'],
      summary: 'Initial public offering.',
    };
    const result = validateAgainstSchema(data, 'S-1');
    expect(result.valid).toBe(true);
    expect((result.validatedData as Record<string, unknown>)?.whyItMatters).toBeUndefined();
  });

  test('DEF 14A fixture without whyItMatters parses cleanly', () => {
    const data = {
      company: 'Apple Inc.',
      filingDate: '2026-01-10',
      meetingDate: '2026-02-28',
      meetingType: 'Annual',
      proposals: [{ number: 1, title: 'Elect directors', description: '11 nominees' }],
      summary: 'Annual meeting of shareholders.',
    };
    const result = validateAgainstSchema(data, 'DEF 14A');
    expect(result.valid).toBe(true);
    expect((result.validatedData as Record<string, unknown>)?.whyItMatters).toBeUndefined();
  });

  test('Generic fixture without whyItMatters parses cleanly', () => {
    const data = {
      company: 'XYZ Corp',
      filingType: '424B2',
      filingDate: '2026-04-15',
      keyPoints: ['Senior notes', '5.5% coupon'],
      summary: 'Debt issuance.',
    };
    const result = validateAgainstSchema(data, 'Generic');
    expect(result.valid).toBe(true);
    expect((result.validatedData as Record<string, unknown>)?.whyItMatters).toBeUndefined();
  });

  test('424B2 falls through to Generic schema and parses cleanly', () => {
    const data = {
      company: 'Berkshire Hathaway',
      filingType: '424B2',
      filingDate: '2026-04-15',
      keyPoints: ['Yen-denominated', '281.8B yen total'],
      summary: 'Multi-tranche debt issuance.',
    };
    // 424B2 is not in schemaMap, canonicalizes to '424B2', falls through to Generic
    const result = validateAgainstSchema(data, '424B2' as never);
    expect(result.valid).toBe(true);
    expect((result.validatedData as Record<string, unknown>)?.whyItMatters).toBeUndefined();
  });
});

describe('validateAgainstSchema — whyItMatters coercion', () => {
  test('valid whyItMatters is preserved (non-strict)', () => {
    const data = {
      company: 'Apple Inc.',
      period: 'FY2024',
      financials: [{ label: 'Revenue', value: '$391B' }],
      insights: ['Services record'],
      risks: ['Supply chain'],
      summary: 'Strong annual results.',
      headline: 'Apple posts record FY2024 revenue',
      whyItMatters: 'Services margin expansion offsets iPhone unit softness and supports the higher-multiple narrative.',
    };
    const result = validateAgainstSchema(data, '10-K');
    expect(result.valid).toBe(true);
    const validated = result.validatedData as Record<string, unknown>;
    expect(validated.whyItMatters).toBe(
      'Services margin expansion offsets iPhone unit softness and supports the higher-multiple narrative.'
    );
  });

  test('empty-string whyItMatters is coerced to absent', () => {
    const data = {
      company: 'Apple Inc.',
      period: 'FY2024',
      financials: [{ label: 'Revenue', value: '$391B' }],
      insights: ['Services record'],
      risks: ['Supply chain'],
      summary: 'Annual results.',
      whyItMatters: '',
    };
    const result = validateAgainstSchema(data, '10-K');
    expect(result.valid).toBe(true);
    const validated = result.validatedData as Record<string, unknown>;
    expect('whyItMatters' in validated).toBe(false);
  });

  test('restating whyItMatters is coerced to absent', () => {
    const data = {
      company: 'Berkshire',
      reportDate: '2026-04-15',
      eventType: 'Item 8.01',
      summary: 'Berkshire Hathaway priced a multi-tranche yen-denominated senior notes offering totaling 281.8 billion yen.',
      positiveDevelopments: 'Debt raised at favorable terms',
      potentialConcerns: 'Increased leverage',
      whyItMatters: 'Berkshire Hathaway priced a multi-tranche yen-denominated senior notes offering totaling 281.8 billion yen.',
    };
    const result = validateAgainstSchema(data, '8-K');
    expect(result.valid).toBe(true);
    const validated = result.validatedData as Record<string, unknown>;
    expect('whyItMatters' in validated).toBe(false);
  });

  test('strict mode applies coercion after successful parse', () => {
    const data = {
      company: 'Apple Inc.',
      reportDate: '2026-03-15',
      eventType: 'Item 2.02',
      summary: 'Q2 earnings release.',
      positiveDevelopments: 'Revenue beat',
      potentialConcerns: 'Services slowed',
      whyItMatters: '   ',
    };
    const result = validateAgainstSchema(data, '8-K', true);
    expect(result.valid).toBe(true);
    const validated = result.validatedData as Record<string, unknown>;
    expect('whyItMatters' in validated).toBe(false);
  });
});
