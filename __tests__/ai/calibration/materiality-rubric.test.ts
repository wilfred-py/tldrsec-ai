/**
 * Materiality Rubric — parser unit tests
 *
 * Tests for the standalone calibration rubric at
 * lib/ai/calibration/materiality-rubric.ts. Coverage focuses on
 * parseMaterialityResponse since that's the deterministic surface;
 * prompt-text shape is tested at the integration layer by the
 * calibration runner.
 */

import {
  MATERIALITY_RATIONALE_MAX_CHARS,
  MATERIALITY_RATIONALE_MIN_CHARS,
  MATERIALITY_SCHEMA,
  MATERIALITY_SYSTEM_PROMPT,
  buildMaterialityUserPrompt,
  emptyConfusionMatrix,
  parseMaterialityResponse,
} from '../../../lib/ai/calibration/materiality-rubric';

const validRationale =
  'Item 1A discloses a new going-concern footnote citing covenant breach on the revolver, first appearance vs prior 10-K.';

describe('parseMaterialityResponse — happy path', () => {
  it('parses a valid score+rationale object', () => {
    const raw = JSON.stringify({ score: 'high', rationale: validRationale });
    const result = parseMaterialityResponse(raw);
    expect(result.ok).toBe(true);
    expect(result.signal?.score).toBe('high');
    expect(result.signal?.rationale).toBe(validRationale);
  });

  it('accepts all four valid score values', () => {
    for (const score of ['high', 'medium', 'low', 'noise'] as const) {
      const raw = JSON.stringify({ score, rationale: validRationale });
      expect(parseMaterialityResponse(raw).signal?.score).toBe(score);
    }
  });

  it('strips markdown code fences (```json ... ```)', () => {
    const raw = '```json\n' + JSON.stringify({ score: 'low', rationale: validRationale }) + '\n```';
    expect(parseMaterialityResponse(raw).signal?.score).toBe('low');
  });

  it('strips bare ``` fences without language tag', () => {
    const raw = '```\n' + JSON.stringify({ score: 'medium', rationale: validRationale }) + '\n```';
    expect(parseMaterialityResponse(raw).signal?.score).toBe('medium');
  });

  it('tolerates surrounding whitespace', () => {
    const raw = '   \n  ' + JSON.stringify({ score: 'noise', rationale: validRationale }) + '\n  ';
    expect(parseMaterialityResponse(raw).signal?.score).toBe('noise');
  });

  it('normalizes score case (HIGH → high)', () => {
    const raw = JSON.stringify({ score: 'HIGH', rationale: validRationale });
    expect(parseMaterialityResponse(raw).signal?.score).toBe('high');
  });

  it('trims whitespace from rationale', () => {
    const raw = JSON.stringify({ score: 'low', rationale: '  ' + validRationale + '  ' });
    expect(parseMaterialityResponse(raw).signal?.rationale).toBe(validRationale);
  });

  it('truncates rationale to MATERIALITY_RATIONALE_MAX_CHARS when length exceeds cap but within tolerance', () => {
    // MAX + 25 chars — within the 50-char overshoot tolerance; should be trimmed to MAX
    const long = 'Item 1A: ' + 'x'.repeat(MATERIALITY_RATIONALE_MAX_CHARS + 25 - 'Item 1A: '.length);
    const raw = JSON.stringify({ score: 'medium', rationale: long });
    const result = parseMaterialityResponse(raw);
    expect(result.ok).toBe(true);
    expect(result.signal?.rationale.length).toBe(MATERIALITY_RATIONALE_MAX_CHARS);
  });
});

describe('parseMaterialityResponse — failure modes', () => {
  it('returns empty_response for empty string', () => {
    expect(parseMaterialityResponse('').error).toBe('empty_response');
  });

  it('returns empty_response for whitespace-only string', () => {
    expect(parseMaterialityResponse('   \n  ').error).toBe('empty_response');
  });

  it('returns empty_response for non-string input', () => {
    // @ts-expect-error — runtime guard against bad caller input
    expect(parseMaterialityResponse(null).error).toBe('empty_response');
  });

  it('returns invalid_json for malformed JSON', () => {
    expect(parseMaterialityResponse('{score: high}').error).toBe('invalid_json');
  });

  it('returns invalid_json for truncated JSON', () => {
    expect(parseMaterialityResponse('{"score": "high",').error).toBe('invalid_json');
  });

  it('returns not_an_object for top-level array', () => {
    expect(parseMaterialityResponse('[1, 2, 3]').error).toBe('not_an_object');
  });

  it('returns not_an_object for top-level scalar', () => {
    expect(parseMaterialityResponse('"high"').error).toBe('not_an_object');
  });

  it('returns missing_score when score field absent', () => {
    expect(parseMaterialityResponse(JSON.stringify({ rationale: validRationale })).error).toBe(
      'missing_score',
    );
  });

  it('returns missing_score when score is non-string', () => {
    expect(parseMaterialityResponse(JSON.stringify({ score: 1, rationale: validRationale })).error).toBe(
      'missing_score',
    );
  });

  it('returns invalid_score_enum for unknown enum value', () => {
    const result = parseMaterialityResponse(
      JSON.stringify({ score: 'extreme', rationale: validRationale }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/^invalid_score_enum:/);
  });

  it('returns missing_rationale when rationale absent', () => {
    expect(parseMaterialityResponse(JSON.stringify({ score: 'high' })).error).toBe('missing_rationale');
  });

  it('returns rationale_too_short for rationales below MIN_CHARS', () => {
    // 30 chars — below the 40-char minimum
    const tooShort = 'Item 1A: brief.'.padEnd(30, '.');
    const raw = JSON.stringify({ score: 'high', rationale: tooShort });
    expect(tooShort.length).toBeLessThan(MATERIALITY_RATIONALE_MIN_CHARS);
    expect(parseMaterialityResponse(raw).error).toBe('rationale_too_short');
  });

  it('returns rationale_too_long for rationales beyond MAX_CHARS + 50 tolerance', () => {
    const tooLong = 'Item 1A: ' + 'x'.repeat(MATERIALITY_RATIONALE_MAX_CHARS + 60);
    const raw = JSON.stringify({ score: 'high', rationale: tooLong });
    expect(parseMaterialityResponse(raw).error).toBe('rationale_too_long');
  });
});

describe('buildMaterialityUserPrompt', () => {
  const baseInput = {
    formType: '10-K' as const,
    ticker: 'NVDA',
    companyName: 'NVIDIA Corporation',
    filingContent: 'Some filing content discussing Item 7 MD&A trends and outlook.',
  };

  it('includes 10-K rubric when formType is 10-K', () => {
    const prompt = buildMaterialityUserPrompt(baseInput);
    expect(prompt).toMatch(/RUBRIC for 10-K/);
    expect(prompt).not.toMatch(/RUBRIC for 10-Q/);
  });

  it('includes 10-Q rubric when formType is 10-Q', () => {
    const prompt = buildMaterialityUserPrompt({ ...baseInput, formType: '10-Q' });
    expect(prompt).toMatch(/RUBRIC for 10-Q/);
    expect(prompt).not.toMatch(/RUBRIC for 10-K/);
  });

  it('includes 10-K rubric for amended 10-K/A', () => {
    const prompt = buildMaterialityUserPrompt({ ...baseInput, formType: '10-K/A' });
    expect(prompt).toMatch(/RUBRIC for 10-K/);
  });

  it('includes 10-Q rubric for amended 10-Q/A', () => {
    const prompt = buildMaterialityUserPrompt({ ...baseInput, formType: '10-Q/A' });
    expect(prompt).toMatch(/RUBRIC for 10-Q/);
  });

  it('embeds ticker and company name', () => {
    const prompt = buildMaterialityUserPrompt(baseInput);
    expect(prompt).toContain('NVDA');
    expect(prompt).toContain('NVIDIA Corporation');
  });

  it('embeds filing content within <filing> tags', () => {
    const prompt = buildMaterialityUserPrompt({
      ...baseInput,
      filingContent: 'SPECIFIC_FILING_SENTINEL',
    });
    expect(prompt).toMatch(/<filing>[\s\S]*SPECIFIC_FILING_SENTINEL[\s\S]*<\/filing>/);
  });

  it('truncates very long filing content and notes the truncation', () => {
    const huge = 'a'.repeat(200_000);
    const prompt = buildMaterialityUserPrompt({ ...baseInput, filingContent: huge });
    expect(prompt).toMatch(/truncated at \d+ chars/);
  });

  it('does not add truncation note for content within budget', () => {
    const prompt = buildMaterialityUserPrompt(baseInput);
    expect(prompt).not.toMatch(/truncated/);
  });

  it('includes the routing guidance and banned-prose block', () => {
    const prompt = buildMaterialityUserPrompt(baseInput);
    expect(prompt).toMatch(/ROUTING GUIDANCE/);
    expect(prompt).toMatch(/DO NOT use the words/);
  });
});

describe('MATERIALITY_SYSTEM_PROMPT', () => {
  it('explicitly bans "deep dive" wording', () => {
    expect(MATERIALITY_SYSTEM_PROMPT).toMatch(/deep dive/);
    expect(MATERIALITY_SYSTEM_PROMPT).toMatch(/NEVER use/);
  });

  it('demands JSON-only output', () => {
    expect(MATERIALITY_SYSTEM_PROMPT).toMatch(/valid JSON only/);
  });

  it('requires evidence in rationale', () => {
    expect(MATERIALITY_SYSTEM_PROMPT).toMatch(/MUST cite specific filing evidence/);
  });
});

describe('MATERIALITY_SCHEMA', () => {
  it('declares score as a 4-value enum', () => {
    expect(MATERIALITY_SCHEMA.properties.score.enum).toEqual(['high', 'medium', 'low', 'noise']);
  });

  it('marks score and rationale as required', () => {
    expect(MATERIALITY_SCHEMA.required).toEqual(['score', 'rationale']);
  });

  it('enforces rationale length bounds', () => {
    expect(MATERIALITY_SCHEMA.properties.rationale.minLength).toBe(MATERIALITY_RATIONALE_MIN_CHARS);
    expect(MATERIALITY_SCHEMA.properties.rationale.maxLength).toBe(MATERIALITY_RATIONALE_MAX_CHARS);
  });
});

describe('emptyConfusionMatrix', () => {
  it('creates a 4x4 zero matrix indexed by score enum', () => {
    const m = emptyConfusionMatrix();
    const scores = ['high', 'medium', 'low', 'noise'] as const;
    for (const t of scores) {
      for (const p of scores) {
        expect(m[t][p]).toBe(0);
      }
    }
  });

  it('returns a fresh matrix each call (no shared state)', () => {
    const a = emptyConfusionMatrix();
    a.high.high = 5;
    const b = emptyConfusionMatrix();
    expect(b.high.high).toBe(0);
  });
});
