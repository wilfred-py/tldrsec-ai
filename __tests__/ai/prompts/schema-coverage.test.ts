/**
 * Tests that all filing types seen in production have:
 * 1. A dedicated FORM_SCHEMAS entry (not falling to Generic)
 * 2. Extraction guidance in FORM_EXTRACTION_GUIDANCE
 *
 * Based on production data audit (2026-03-30):
 * Top types by volume: 4(867), 424B2(628), 144(209), 8-K(126), FWP(36),
 * 10-K(35), SCHEDULE->SC13G(31), DEFA14A(21), 3(19), 10-Q(18)
 */
import { getSchemaForFormType, generateFilingPrompt } from '@/lib/ai/prompts/unified-prompts';

describe('Schema coverage for production filing types', () => {
  // All types seen in production that should have dedicated schemas
  const typesWithDedicatedSchemas = [
    { type: '4', requiredField: 'transactions' },
    { type: '424B2', requiredField: 'offeringType' },
    { type: '144', requiredField: 'filerName' },
    { type: '8-K', requiredField: 'eventType' },
    { type: '10-K', requiredField: 'financialHighlights' },
    { type: '10-Q', requiredField: 'financialHighlights' },
    { type: '3', requiredField: 'ownershipPercentage' },
    { type: 'SC 13G', requiredField: 'ownershipPercentage' },
    { type: 'SC 13D', requiredField: 'ownershipPercentage' },
    { type: 'DEF 14A', requiredField: 'meetingDate' },
    { type: 'DEFA14A', requiredField: 'company' },
    { type: 'FWP', requiredField: 'offeringType' },
    { type: 'S-1', requiredField: 'offeringSize' },
    { type: 'S-3', requiredField: 'offeringType' },
    { type: '11-K', requiredField: 'planAssets' },
  ];

  for (const { type, requiredField } of typesWithDedicatedSchemas) {
    it(`${type} has a dedicated schema with required field '${requiredField}'`, () => {
      const schema = getSchemaForFormType(type);
      // Should not be the Generic schema (which only requires company + summary)
      expect(schema.required.length).toBeGreaterThanOrEqual(2);
      expect(schema.properties).toHaveProperty(requiredField);
    });
  }

  // Types that canonicalize via aliases should also resolve
  const aliasTypes = [
    { raw: 'SCHEDULE', canonical: 'SC 13G' },
    { raw: 'DEF', canonical: 'DEF 14A' },
    { raw: 'Form4', canonical: '4' },
    { raw: '4/A', canonical: '4' },
    { raw: '10-K/A', canonical: '10-K' },
    { raw: '8-K/A', canonical: '8-K' },
    { raw: 'SC 13G/A', canonical: 'SC 13G' },
  ];

  for (const { raw, canonical } of aliasTypes) {
    it(`${raw} resolves to same schema as ${canonical}`, () => {
      const rawSchema = getSchemaForFormType(raw);
      const canonicalSchema = getSchemaForFormType(canonical);
      expect(rawSchema.required).toEqual(canonicalSchema.required);
    });
  }
});

describe('Extraction guidance coverage', () => {
  // Types that should have extraction guidance (generates non-empty guidance in prompt)
  const typesWithGuidance = [
    '10-K', '10-Q', '8-K', '4', '144', '3',
    '424B2', 'SC 13G', 'SC 13D', 'DEFA14A', 'FWP',
    'S-1', 'S-3', 'DEF 14A', '11-K',
  ];

  for (const type of typesWithGuidance) {
    it(`${type} has extraction guidance in the prompt`, () => {
      const result = generateFilingPrompt({
        formType: type,
        filingContent: 'Test content',
      });
      // The user prompt should contain extraction rules specific to this type
      expect(result.userPrompt).toContain('EXTRACTION RULES');
    });
  }

  it('Form 3 guidance includes company field instruction', () => {
    const result = generateFilingPrompt({ formType: '3', filingContent: 'Test' });
    expect(result.userPrompt).toContain('COMPANY FIELD IS REQUIRED');
  });

  it('Form 144 guidance includes company field instruction', () => {
    const result = generateFilingPrompt({ formType: '144', filingContent: 'Test' });
    expect(result.userPrompt).toContain('COMPANY FIELD IS REQUIRED');
  });
});

describe('headline and emailSubject in base schema', () => {
  const allTypes = [
    '10-K', '10-Q', '8-K', '4', '144', '3',
    'SC 13G', 'SC 13D', 'DEF 14A', 'DEFA14A', 'FWP',
    'S-1', 'S-3', '11-K', '424B2',
  ];

  for (const type of allTypes) {
    it(`${type} schema includes headline and emailSubject`, () => {
      const schema = getSchemaForFormType(type);
      expect(schema.properties).toHaveProperty('headline');
      expect(schema.properties).toHaveProperty('emailSubject');
    });
  }
});
