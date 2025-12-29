import { FORM_SCHEMAS } from '../../../lib/ai/prompts/unified-prompts';

describe('8-K Schema - Completeness', () => {
  const schema8K = FORM_SCHEMAS['8-K'];

  it('should include keyHighlights array for material facts', () => {
    expect(schema8K.properties.keyHighlights).toBeDefined();
    expect(schema8K.properties.keyHighlights.type).toBe('array');
  });

  it('should have guidance for extracting specific figures', () => {
    const financialImpact = schema8K.properties.financialImpact;
    expect(financialImpact.description.toLowerCase()).toContain('specific');
  });

  it('should include managementCommentary field', () => {
    expect(schema8K.properties.managementCommentary).toBeDefined();
  });

  it('should include sentiment field for market signal', () => {
    expect(schema8K.properties.sentiment).toBeDefined();
    expect(schema8K.properties.sentiment.enum).toEqual(
      expect.arrayContaining(['positive', 'negative', 'neutral', 'mixed'])
    );
  });

  it('should have keyHighlights as a required field', () => {
    expect(schema8K.required).toContain('keyHighlights');
  });

  it('should have sentiment as a required field', () => {
    expect(schema8K.required).toContain('sentiment');
  });
});
