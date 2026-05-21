import {
  extractMaterialitySignal,
  materialityToBadge,
  buildMaterialityFeedbackMailto,
  type MaterialitySignal,
} from '@/lib/email/materiality';

describe('extractMaterialitySignal', () => {
  it('returns DEFAULT noise signal when summaryJSON is null', () => {
    expect(extractMaterialitySignal(null)).toEqual({
      score: 'noise',
      rationale: 'Filing did not produce a materiality signal.',
    });
  });

  it('returns DEFAULT noise signal when summaryJSON is undefined', () => {
    expect(extractMaterialitySignal(undefined).score).toBe('noise');
  });

  it('returns DEFAULT noise signal when summaryJSON is a string', () => {
    expect(extractMaterialitySignal('not an object').score).toBe('noise');
  });

  it('returns DEFAULT noise signal when materialitySignal key is absent', () => {
    expect(extractMaterialitySignal({ company: 'X' }).score).toBe('noise');
  });

  it('returns DEFAULT noise signal when score enum is invalid', () => {
    expect(
      extractMaterialitySignal({
        materialitySignal: { score: 'CRITICAL', rationale: 'something bad' },
      }).score,
    ).toBe('noise');
  });

  it('returns DEFAULT noise signal when rationale is empty', () => {
    expect(
      extractMaterialitySignal({
        materialitySignal: { score: 'high', rationale: '' },
      }).score,
    ).toBe('noise');
  });

  it('parses a valid high signal', () => {
    const result = extractMaterialitySignal({
      materialitySignal: {
        score: 'high',
        rationale: 'FY2025 net income +13% YoY per Item 7',
      },
    });
    expect(result).toEqual({
      score: 'high',
      rationale: 'FY2025 net income +13% YoY per Item 7',
    });
  });

  it('normalizes score case (HIGH → high)', () => {
    const result = extractMaterialitySignal({
      materialitySignal: { score: 'HIGH', rationale: 'valid rationale' },
    });
    expect(result.score).toBe('high');
  });

  it('trims whitespace from rationale', () => {
    const result = extractMaterialitySignal({
      materialitySignal: { score: 'low', rationale: '  routine quarter  ' },
    });
    expect(result.rationale).toBe('routine quarter');
  });

  it('handles all 4 valid enum values', () => {
    for (const score of ['high', 'medium', 'low', 'noise'] as const) {
      const result = extractMaterialitySignal({
        materialitySignal: { score, rationale: 'test rationale' },
      });
      expect(result.score).toBe(score);
    }
  });
});

describe('materialityToBadge', () => {
  it('maps high → amber pill', () => {
    expect(materialityToBadge({ score: 'high', rationale: 'r' })).toEqual({
      label: 'HIGH MATERIALITY',
      colorKey: 'high',
    });
  });

  it('maps medium → indigo pill', () => {
    expect(materialityToBadge({ score: 'medium', rationale: 'r' })).toEqual({
      label: 'MEDIUM MATERIALITY',
      colorKey: 'moderate',
    });
  });

  it('maps low → slate pill', () => {
    expect(materialityToBadge({ score: 'low', rationale: 'r' })).toEqual({
      label: 'LOW MATERIALITY',
      colorKey: 'low',
    });
  });

  it('maps noise → null (caller suppresses badge)', () => {
    expect(materialityToBadge({ score: 'noise', rationale: 'r' })).toBeNull();
  });
});

describe('buildMaterialityFeedbackMailto', () => {
  it('produces a mailto with subject', () => {
    const url = buildMaterialityFeedbackMailto({
      ticker: 'NVDA',
      formType: '10-K',
      accessionNumber: '0001045810-26-000021',
    });
    expect(url).toMatch(/^mailto:materiality-feedback@tldrsec\.com\?subject=/);
    expect(decodeURIComponent(url)).toContain('NVDA 10-K (0001045810-26-000021)');
  });

  it('omits accession number when not provided', () => {
    const url = buildMaterialityFeedbackMailto({ ticker: 'AAPL', formType: '10-Q' });
    expect(decodeURIComponent(url)).toContain('AAPL 10-Q');
    expect(url).not.toContain('(');
  });

  it('lets caller override the to: address', () => {
    const url = buildMaterialityFeedbackMailto({
      ticker: 'TSLA',
      formType: '10-Q',
      to: 'wilfred@example.com',
    });
    expect(url).toMatch(/^mailto:wilfred@example\.com\?/);
  });

  it('URL-encodes special characters in the subject', () => {
    const url = buildMaterialityFeedbackMailto({
      ticker: 'BRK-B',
      formType: '10-K/A',
    });
    // form-slash should be percent-encoded
    expect(url).toContain('10-K%2FA');
  });
});
