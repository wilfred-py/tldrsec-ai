import { validateXSentiment, _internal } from '../x-sentiment-validator';

describe('validateXSentiment', () => {
  const baseValid = {
    direction: 'bullish',
    shift: 'shifting_bullish',
    confidence: 'medium',
    factClaims: ['Apple reports Thursday April 30, 2026.'],
    opinionClaims: ['Cook transition seen as smooth by Wall Street.'],
    discussionSynthesis: 'Mixed but skewing positive on leadership transition.',
    citationUrls: ['https://x.com/Bloomberg/status/123', 'https://x.com/CNBC/status/456'],
    windowHours: 24,
  };

  describe('structural validation', () => {
    it('accepts a well-formed payload', () => {
      const { sentiment, stats } = validateXSentiment(baseValid);
      expect(sentiment).not.toBeNull();
      expect(sentiment!.direction).toBe('bullish');
      expect(sentiment!.factClaims).toHaveLength(1);
      expect(stats.factClaimsStripped).toBe(0);
    });

    it('rejects non-object input', () => {
      expect(validateXSentiment('not an object').sentiment).toBeNull();
      expect(validateXSentiment(null).sentiment).toBeNull();
      expect(validateXSentiment(42).sentiment).toBeNull();
    });

    it('rejects invalid direction', () => {
      const result = validateXSentiment({ ...baseValid, direction: 'mooning' });
      expect(result.sentiment).toBeNull();
      expect(result.rejectionReason).toContain('direction');
    });

    it('rejects invalid shift', () => {
      const result = validateXSentiment({ ...baseValid, shift: 'rocketing' });
      expect(result.sentiment).toBeNull();
    });

    it('rejects invalid confidence', () => {
      const result = validateXSentiment({ ...baseValid, confidence: 'extreme' });
      expect(result.sentiment).toBeNull();
    });
  });

  describe('F3 — adversarial output sanitization', () => {
    it('strips claims containing imperative trading verbs', () => {
      const payload = {
        ...baseValid,
        factClaims: [
          'Apple reports Thursday April 30, 2026.',
          'Buy AAPL now before earnings',
          'Load up while you can',
        ],
      };
      const { sentiment, stats } = validateXSentiment(payload);
      expect(sentiment!.factClaims).toEqual(['Apple reports Thursday April 30, 2026.']);
      expect(stats.imperativeStrips).toBeGreaterThanOrEqual(2);
    });

    it('does NOT strip "buyback" (false positive guard)', () => {
      const { sentiment } = validateXSentiment({
        ...baseValid,
        factClaims: ['Apple announced a $90B buyback program.'],
      });
      expect(sentiment!.factClaims).toContain('Apple announced a $90B buyback program.');
    });

    it('does NOT strip "shorting" used descriptively', () => {
      const { sentiment } = validateXSentiment({
        ...baseValid,
        opinionClaims: ['Hedge funds are shorting the position aggressively.'],
      });
      expect(sentiment!.opinionClaims).toContain('Hedge funds are shorting the position aggressively.');
    });

    it('strips claims containing price targets', () => {
      const payload = {
        ...baseValid,
        opinionClaims: [
          'Analyst sees Apple as fairly valued.',
          'AAPL going to $300 by year end',
          'PT $250 from Goldman',
        ],
      };
      const { sentiment, stats } = validateXSentiment(payload);
      expect(sentiment!.opinionClaims).toEqual(['Analyst sees Apple as fairly valued.']);
      expect(stats.priceTargetStrips).toBe(2);
    });

    it('strips claims with URLs not in citationUrls', () => {
      const payload = {
        ...baseValid,
        citationUrls: ['https://x.com/Bloomberg/status/123'],
        factClaims: [
          'Trusted claim from Bloomberg https://x.com/Bloomberg/status/123',
          'Sketchy claim https://attacker.example/pump',
        ],
      };
      const { sentiment, stats } = validateXSentiment(payload);
      expect(sentiment!.factClaims).toHaveLength(1);
      expect(sentiment!.factClaims[0]).toContain('Bloomberg');
      expect(stats.urlsStripped).toBeGreaterThanOrEqual(1);
    });

    it('strips synthesis with imperatives', () => {
      const { sentiment } = validateXSentiment({
        ...baseValid,
        discussionSynthesis: 'Buy AAPL now, sentiment is bullish.',
      });
      expect(sentiment!.discussionSynthesis).toBe('');
    });

    it('strips synthesis with price targets', () => {
      const { sentiment } = validateXSentiment({
        ...baseValid,
        discussionSynthesis: 'Sentiment bullish, AAPL going to $400.',
      });
      expect(sentiment!.discussionSynthesis).toBe('');
    });
  });

  describe('confidence floor', () => {
    it('demotes high confidence to low when citations < 2', () => {
      const { sentiment, stats } = validateXSentiment({
        ...baseValid,
        confidence: 'high',
        citationUrls: ['https://x.com/Bloomberg/status/123'],
      });
      expect(sentiment!.confidence).toBe('low');
      expect(stats.confidenceDemoted).toBe(true);
    });

    it('demotes high confidence to low when factClaims is empty', () => {
      const { sentiment, stats } = validateXSentiment({
        ...baseValid,
        confidence: 'high',
        factClaims: [],
      });
      expect(sentiment!.confidence).toBe('low');
      expect(stats.confidenceDemoted).toBe(true);
    });

    it('preserves medium confidence regardless of citation count', () => {
      const { sentiment, stats } = validateXSentiment({
        ...baseValid,
        confidence: 'medium',
        citationUrls: ['https://x.com/Bloomberg/status/123'],
      });
      expect(sentiment!.confidence).toBe('medium');
      expect(stats.confidenceDemoted).toBe(false);
    });
  });

  describe('claim count limits', () => {
    it('caps factClaims at 3', () => {
      const { sentiment } = validateXSentiment({
        ...baseValid,
        factClaims: ['a', 'b', 'c', 'd', 'e'],
      });
      expect(sentiment!.factClaims).toHaveLength(3);
    });

    it('caps citationUrls at 10', () => {
      const manyUrls = Array.from({ length: 20 }, (_, i) => `https://x.com/u/status/${i}`);
      const { sentiment } = validateXSentiment({ ...baseValid, citationUrls: manyUrls });
      expect(sentiment!.citationUrls).toHaveLength(10);
    });

    it('deduplicates citationUrls', () => {
      const { sentiment } = validateXSentiment({
        ...baseValid,
        citationUrls: ['https://x.com/a/1', 'https://x.com/a/1', 'https://x.com/b/2'],
      });
      expect(sentiment!.citationUrls).toHaveLength(2);
    });

    it('rejects non-https/http citation URLs', () => {
      const { sentiment } = validateXSentiment({
        ...baseValid,
        citationUrls: ['javascript:alert(1)', 'ftp://x.com/file', 'https://x.com/ok/1'],
      });
      expect(sentiment!.citationUrls).toEqual(['https://x.com/ok/1']);
    });

    it('drops media-CDN and off-host URLs from citations', () => {
      const { sentiment, stats } = validateXSentiment({
        ...baseValid,
        citationUrls: [
          'https://pbs.twimg.com/media/HGbqxSuWgAAl9ma.jpg',
          'https://video.twimg.com/ext_tw_video/abc.mp4',
          'https://attacker.example/pump',
          'https://x.com/Bloomberg/status/123',
          'https://twitter.com/CNBC/status/456',
        ],
      });
      expect(sentiment!.citationUrls).toEqual([
        'https://x.com/Bloomberg/status/123',
        'https://twitter.com/CNBC/status/456',
      ]);
      expect(stats.urlsStripped).toBe(3);
    });
  });

  describe('windowHours bounds', () => {
    it('clamps windowHours to [1, 168]', () => {
      expect(validateXSentiment({ ...baseValid, windowHours: 0 }).sentiment!.windowHours).toBe(1);
      expect(validateXSentiment({ ...baseValid, windowHours: 999 }).sentiment!.windowHours).toBe(168);
      expect(validateXSentiment({ ...baseValid, windowHours: 48 }).sentiment!.windowHours).toBe(48);
    });

    it('defaults to 24 when missing', () => {
      const { windowHours, ...withoutWindow } = baseValid;
      const { sentiment } = validateXSentiment(withoutWindow);
      expect(sentiment!.windowHours).toBe(24);
    });
  });

  describe('all-stripped degradation', () => {
    it('demotes to no_signal when every claim is stripped', () => {
      const { sentiment, rejectionReason } = validateXSentiment({
        ...baseValid,
        direction: 'bullish',
        factClaims: ['Buy AAPL now', 'PT $300'],
        opinionClaims: ['Load up before earnings'],
        discussionSynthesis: '',
      });
      expect(sentiment!.direction).toBe('no_signal');
      expect(rejectionReason).toContain('demoted');
    });
  });

  describe('claim length cap', () => {
    it('truncates claims over 280 chars', () => {
      const longClaim = 'A'.repeat(500);
      const { sentiment } = validateXSentiment({
        ...baseValid,
        factClaims: [longClaim],
      });
      expect(sentiment!.factClaims[0].length).toBe(280);
    });
  });
});

describe('_internal patterns (regression guards)', () => {
  it('imperative pattern matches "buy" but not "buyback"', () => {
    const buyMatched = _internal.containsImperative('Buy now');
    const buybackMatched = _internal.containsImperative('Apple announced a buyback');
    expect(buyMatched).toBe(true);
    expect(buybackMatched).toBe(false);
  });

  it('price target pattern matches PT and price target keywords', () => {
    expect(_internal.containsPriceTarget('PT $250')).toBe(true);
    expect(_internal.containsPriceTarget('price target $300')).toBe(true);
    expect(_internal.containsPriceTarget('AAPL going to $400')).toBe(true);
    expect(_internal.containsPriceTarget('reports earnings')).toBe(false);
  });
});
