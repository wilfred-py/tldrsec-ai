/**
 * Tests for ensureTickerPrefix() — guarantees the headline starts with the
 * ticker so users can scan inbox previews quickly. Skips prefixing when the
 * headline already mentions the ticker (avoids "AAPL: AAPL beats earnings").
 */

import { ensureTickerPrefix } from '@/components/ui/email/design-system';

describe('ensureTickerPrefix', () => {
  it('returns empty string for missing headline', () => {
    expect(ensureTickerPrefix(undefined, 'AAPL')).toBe('');
    expect(ensureTickerPrefix('', 'AAPL')).toBe('');
  });

  it('returns headline unchanged when ticker is missing', () => {
    expect(ensureTickerPrefix('Big news today', undefined)).toBe('Big news today');
  });

  it('returns headline unchanged when ticker is N/A', () => {
    expect(ensureTickerPrefix('Big news today', 'N/A')).toBe('Big news today');
  });

  it('prefixes ticker when headline does not contain it', () => {
    expect(ensureTickerPrefix('beats earnings', 'AAPL')).toBe('AAPL: beats earnings');
  });

  it('does not prefix when headline already contains the ticker (case-insensitive)', () => {
    expect(ensureTickerPrefix('AAPL beats earnings', 'AAPL')).toBe('AAPL beats earnings');
    expect(ensureTickerPrefix('aapl beats earnings', 'AAPL')).toBe('aapl beats earnings');
  });

  it('uses word-boundary matching so substrings do not count', () => {
    // "PAPLA" contains the letters of "AAPL" as a substring but not as a whole word
    expect(ensureTickerPrefix('PAPLA filed something', 'AAPL')).toBe('AAPL: PAPLA filed something');
  });

  it('escapes regex special characters in the ticker (e.g. BRK.B)', () => {
    expect(ensureTickerPrefix('BRK.B reported', 'BRK.B')).toBe('BRK.B reported');
    expect(ensureTickerPrefix('reported earnings', 'BRK.B')).toBe('BRK.B: reported earnings');
  });

  it('trims leading/trailing whitespace from the headline', () => {
    expect(ensureTickerPrefix('  beats earnings  ', 'AAPL')).toBe('AAPL: beats earnings');
  });
});
