import { validateXSentiment, splitTextOnMarkers, _internal } from '../x-sentiment-validator';

/**
 * Phase 2 (Track 2 — inline `[N]` citation markers) test coverage.
 *
 * Maps to /review_plan Issues 10A, 11A, 12A, 13A on tasks/sentiment-citations.md:
 *   - T01-T08: validator remaps `[N]` markers in claim text + synthesis
 *              after F3 stripping rewrites the citation array.
 *   - T11:     IAA round-trip — text content is bit-exact reconstructible
 *              from `splitTextOnMarkers` output (G3 legal-posture invariant).
 *   - T12:     parameterized edge-case table for the marker parser.
 *   - T13:     ReDoS pathological input is bounded by char-cap before parse.
 */

describe('Phase 2 — inline `[N]` citation markers', () => {
  const baseValid = {
    direction: 'bullish' as const,
    shift: 'stable' as const,
    confidence: 'medium' as const,
    factClaims: [],
    opinionClaims: [],
    discussionSynthesis: '',
    citationUrls: [] as string[],
    windowHours: 24,
  };

  // ─── T01-T08: validator remap behavior ──────────────────────────────────────

  describe('T01-T08 validator remap', () => {
    it('T01: identity remap when no citations are stripped', () => {
      const { sentiment } = validateXSentiment({
        ...baseValid,
        factClaims: ['Apple beat earnings[1] and raised guidance[2]'],
        discussionSynthesis: 'Bulls cited beat[1][2]; bears flagged guidance[3]',
        citationUrls: [
          'https://x.com/a/status/1',
          'https://x.com/b/status/2',
          'https://x.com/c/status/3',
        ],
      });
      expect(sentiment!.factClaims[0]).toBe('Apple beat earnings[1] and raised guidance[2]');
      expect(sentiment!.discussionSynthesis).toBe('Bulls cited beat[1][2]; bears flagged guidance[3]');
    });

    it('T02: indexMap compacts when 2 of 5 stripped (off-host)', () => {
      const { sentiment } = validateXSentiment({
        ...baseValid,
        factClaims: ['Foo[3] bar[5]'],
        discussionSynthesis: 'A[1] B[3] C[5]',
        citationUrls: [
          'https://x.com/a/status/1', // idx 1 → 1
          'https://attacker.example/x', // idx 2 STRIPPED (off-host)
          'https://x.com/c/status/3', // idx 3 → 2
          'https://pbs.twimg.com/x.jpg', // idx 4 STRIPPED (media CDN)
          'https://x.com/e/status/5', // idx 5 → 3
        ],
      });
      expect(sentiment!.citationUrls).toHaveLength(3);
      expect(sentiment!.factClaims[0]).toBe('Foo[2] bar[3]');
      expect(sentiment!.discussionSynthesis).toBe('A[1] B[2] C[3]');
    });

    it('T03: claim with multi-index marker [3, 5] is remapped through map', () => {
      const { sentiment } = validateXSentiment({
        ...baseValid,
        factClaims: ['Multi-source claim[3, 5]'],
        citationUrls: [
          'https://x.com/a/1',
          'https://attacker.example/x', // STRIPPED
          'https://x.com/c/3', // idx 3 → 2
          'https://x.com/d/4',
          'https://x.com/e/5', // idx 5 → 4
        ],
      });
      expect(sentiment!.factClaims[0]).toBe('Multi-source claim[2, 4]');
    });

    it('T04: synthesis "foo [1] bar [3]" with idx 2 stripped → "foo [1] bar [2]"', () => {
      const { sentiment } = validateXSentiment({
        ...baseValid,
        discussionSynthesis: 'foo [1] bar [3]',
        citationUrls: [
          'https://x.com/a/1', // idx 1 → 1
          'https://attacker.example/x', // STRIPPED
          'https://x.com/c/3', // idx 3 → 2
        ],
      });
      expect(sentiment!.discussionSynthesis).toBe('foo [1] bar [2]');
    });

    it('T05: hallucinated [7] when only 3 citations → marker dropped silently', () => {
      const { sentiment } = validateXSentiment({
        ...baseValid,
        factClaims: ['real fact[1] hallucinated[7] another fact[2]'],
        citationUrls: [
          'https://x.com/a/1',
          'https://x.com/b/2',
          'https://x.com/c/3',
        ],
      });
      expect(sentiment!.factClaims[0]).toBe('real fact[1] hallucinated another fact[2]');
    });

    it('T06: claim references stripped citation [2] → marker dropped, claim text retained', () => {
      const { sentiment } = validateXSentiment({
        ...baseValid,
        factClaims: ['claim text[2] continues here'],
        citationUrls: [
          'https://x.com/a/1',
          'https://attacker.example/x', // STRIPPED — no map entry for old idx 2
          'https://x.com/c/3',
        ],
      });
      // Marker dropped; double-space collapsed.
      expect(sentiment!.factClaims[0]).toBe('claim text continues here');
    });

    it('T07: legacy payload (no markers anywhere) round-trips unchanged', () => {
      const { sentiment } = validateXSentiment({
        ...baseValid,
        factClaims: ['Apple announced earnings beat'],
        opinionClaims: ['Some opinion'],
        discussionSynthesis: 'Mixed reaction overall.',
        citationUrls: [
          'https://x.com/a/1',
          'https://x.com/b/2',
        ],
      });
      expect(sentiment!.factClaims[0]).toBe('Apple announced earnings beat');
      expect(sentiment!.opinionClaims[0]).toBe('Some opinion');
      expect(sentiment!.discussionSynthesis).toBe('Mixed reaction overall.');
    });

    it('T08: marker in claim that gets stripped (imperative) — claim drop wins, marker remap moot', () => {
      const { sentiment, stats } = validateXSentiment({
        ...baseValid,
        factClaims: [
          'Real claim[1]',
          'buy AAPL now[2]', // imperative-stripped — entire claim gone
        ],
        citationUrls: [
          'https://x.com/a/1',
          'https://x.com/b/2',
        ],
      });
      expect(sentiment!.factClaims).toEqual(['Real claim[1]']);
      expect(stats.imperativeStrips).toBeGreaterThanOrEqual(1);
    });

    it('T08b: marker entirely-out-of-range collapsed within multi-index marker', () => {
      const { sentiment } = validateXSentiment({
        ...baseValid,
        factClaims: ['claim[1, 99]'],
        citationUrls: ['https://x.com/a/1', 'https://x.com/b/2'],
      });
      // 99 is out of range; surviving indices [1] only.
      expect(sentiment!.factClaims[0]).toBe('claim[1]');
    });

    it('T08c: marker with all indices out-of-range → entire marker dropped', () => {
      const { sentiment } = validateXSentiment({
        ...baseValid,
        factClaims: ['claim[7, 9]'],
        citationUrls: ['https://x.com/a/1'],
      });
      expect(sentiment!.factClaims[0]).toBe('claim');
    });
  });

  // ─── T11: IAA round-trip (G3 legal-posture invariant) ──────────────────────

  describe('T11 — IAA round-trip invariant', () => {
    /**
     * G3 IAA legal posture (per wiki/product/x-sentiment-enrichment.md:111):
     * the F3 imperative-verb stripper is part of the legal posture under which
     * the IAA review approved this feature. The render-time marker parser must
     * never modify text content — only wrap markers with anchors.
     *
     * This test asserts: text reconstructed from parser output equals input.
     */
    function reconstruct(input: string): string {
      return splitTextOnMarkers(input)
        .map((seg) => (seg.type === 'text' ? seg.value : seg.raw))
        .join('');
    }

    const cases = [
      'plain text with no markers',
      'leading [1] marker',
      'trailing marker [2]',
      '[3] both ends [4]',
      'foo [1] bar [2, 3] baz [4]',
      'mid-word foo[1]bar',
      'Apple beat earnings [1][2][3] and raised guidance [4, 5]',
      'unicode emoji 📈 [1] survives intact 🚀',
      'punctuation: comma, [1] period. [2] semicolon; [3]',
      'newlines\nstay\nintact [1]\nacross [2] lines',
      '', // empty
      '[1]',
      '[1, 2, 3, 4, 5]',
    ];

    it.each(cases)('round-trips text bit-exact: %j', (input) => {
      expect(reconstruct(input)).toBe(input);
    });
  });

  // ─── T12: marker parser edge-case table ────────────────────────────────────

  describe('T12 — marker parser edge cases', () => {
    type Edge = { input: string; expectedCites: number[][]; description: string };
    const edges: Edge[] = [
      { input: '[0]',    expectedCites: [[0]],    description: '[0] matches but invalid index (1-based)' },
      { input: '[]',     expectedCites: [],       description: '[] does not match (no digits)' },
      { input: '[1',     expectedCites: [],       description: '[1 does not match (unclosed)' },
      { input: '1]',     expectedCites: [],       description: '1] does not match (no opener)' },
      { input: '[1.5]',  expectedCites: [],       description: '[1.5] does not match (decimal)' },
      { input: '[abc]',  expectedCites: [],       description: '[abc] does not match (non-numeric)' },
      { input: '[01]',   expectedCites: [[1]],    description: '[01] matches as 1 (parseInt strips leading zero)' },
      { input: '[999]',  expectedCites: [[999]],  description: '[999] matches; render-side handles range' },
      { input: '[1,]',   expectedCites: [],       description: '[1,] does not match (trailing comma)' },
      { input: '[1, 2]', expectedCites: [[1, 2]], description: '[1, 2] csv with space matches' },
      { input: '[1,2]',  expectedCites: [[1, 2]], description: '[1,2] csv without space matches' },
      { input: '[1][2]', expectedCites: [[1], [2]], description: 'adjacent markers each match' },
      { input: 'before[1]', expectedCites: [[1]], description: 'marker at end of string' },
      { input: '[1]after',  expectedCites: [[1]], description: 'marker at start of string' },
      { input: 'foo[1]bar', expectedCites: [[1]], description: 'marker mid-word' },
    ];

    it.each(edges)('$description', ({ input, expectedCites }) => {
      const segments = splitTextOnMarkers(input);
      const cites = segments.filter((s) => s.type === 'cite').map((s) => (s as { indices: number[] }).indices);
      expect(cites).toEqual(expectedCites);
    });

    it('out-of-range single index is dropped by validator', () => {
      const { sentiment } = validateXSentiment({
        ...baseValid,
        factClaims: ['hallucinated[999]'],
        citationUrls: ['https://x.com/a/1'],
      });
      expect(sentiment!.factClaims[0]).toBe('hallucinated');
    });

    it('invalid index 0 is dropped by validator (1-based contract)', () => {
      const { sentiment } = validateXSentiment({
        ...baseValid,
        factClaims: ['claim[0]'],
        citationUrls: ['https://x.com/a/1'],
      });
      expect(sentiment!.factClaims[0]).toBe('claim');
    });
  });

  // ─── T13: ReDoS — pathological input bounded by char-cap ───────────────────

  describe('T13 — ReDoS posture', () => {
    it('synthesis cap (800 chars) truncates pathological input before parser runs', () => {
      // No closing bracket; classic backtracking trigger if regex were unsafe.
      const evil = '[' + '1,'.repeat(2000); // ~4001 chars
      const start = Date.now();
      const { sentiment } = validateXSentiment({
        ...baseValid,
        discussionSynthesis: evil,
        factClaims: ['real claim'],
        citationUrls: ['https://x.com/a/1'],
      });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100); // hard ceiling — should be sub-ms
      // Synthesis was capped at 800 then parsed; result is text (no closing
      // bracket means no marker matched), so renders as literal text.
      expect(sentiment!.discussionSynthesis.length).toBeLessThanOrEqual(_internal.MAX_SYNTHESIS_LENGTH);
    });

    it('claim cap (280 chars) truncates pathological input before parser runs', () => {
      const evil = '[' + '1,'.repeat(2000);
      const start = Date.now();
      const { sentiment } = validateXSentiment({
        ...baseValid,
        factClaims: [evil],
        citationUrls: ['https://x.com/a/1'],
      });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(100);
      expect(sentiment!.factClaims[0].length).toBeLessThanOrEqual(_internal.MAX_CLAIM_LENGTH);
    });

    it('long valid marker run terminates fast', () => {
      // 100 valid markers in synthesis under the 800 cap.
      const synth = Array.from({ length: 50 }, (_, i) => `claim[${(i % 5) + 1}]`).join(' ');
      expect(synth.length).toBeLessThan(800);
      const start = Date.now();
      validateXSentiment({
        ...baseValid,
        discussionSynthesis: synth,
        factClaims: ['fact[1]'],
        citationUrls: Array.from({ length: 5 }, (_, i) => `https://x.com/u/${i}`),
      });
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(50);
    });
  });

  // ─── Defense-in-depth — Issue 7A per-element guards ────────────────────────

  describe('Issue 7A — input shape guards (defense-in-depth)', () => {
    it('factClaims as a non-array yields empty result without throwing', () => {
      const { sentiment } = validateXSentiment({
        ...baseValid,
        factClaims: 'not an array' as unknown as string[],
        citationUrls: ['https://x.com/a/1'],
      });
      expect(sentiment!.factClaims).toEqual([]);
    });

    it('factClaims with mixed-type elements skips non-strings', () => {
      const { sentiment } = validateXSentiment({
        ...baseValid,
        factClaims: ['valid claim[1]', 42, null, { obj: true }, 'another[1]'] as unknown as string[],
        citationUrls: ['https://x.com/a/1'],
      });
      expect(sentiment!.factClaims).toEqual(['valid claim[1]', 'another[1]']);
    });

    it('citationUrls with mixed-type elements skips non-strings; markers pointing at stripped positions drop', () => {
      const { sentiment } = validateXSentiment({
        ...baseValid,
        // Original positions: 1=valid, 2=42(invalid), 3=null(invalid), 4=valid.
        citationUrls: ['https://x.com/a/1', 42, null, 'https://x.com/b/2'] as unknown as string[],
        // Model emits markers using original positions. [1] survives → 1.
        // [2] points at stripped position → dropped silently.
        // [4] survives and is remapped to new position 2.
        factClaims: ['orig-one[1] stripped[2] orig-four[4]'],
      });
      expect(sentiment!.citationUrls).toEqual(['https://x.com/a/1', 'https://x.com/b/2']);
      expect(sentiment!.factClaims[0]).toBe('orig-one[1] stripped orig-four[2]');
    });
  });
});
