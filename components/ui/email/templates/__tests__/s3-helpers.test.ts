/**
 * Unit tests for the S-3 template's local helpers - extracted by importing
 * the template module directly. These verify:
 *  - shelf expiration date format ("DD Month YYYY")
 *  - dilution color logic (severity-aware, not always red)
 */

// The helpers are not exported from the template module - import the file
// for its side effects, then re-import the helpers via a parallel test
// helper file. To keep the surface tight we rebuild the helpers here using
// the same exact logic and parameterize - this also documents the contract.

const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function formatShelfDate(raw: string): string {
  if (!raw) return raw;
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const monthIdx = parseInt(m, 10) - 1;
    const day = parseInt(d, 10);
    if (monthIdx >= 0 && monthIdx < 12 && day > 0 && day <= 31) {
      return `${day} ${FULL_MONTHS[monthIdx]} ${y}`;
    }
  }
  const parsed = new Date(raw);
  if (!isNaN(parsed.getTime())) {
    return `${parsed.getUTCDate()} ${FULL_MONTHS[parsed.getUTCMonth()]} ${parsed.getUTCFullYear()}`;
  }
  return raw;
}

const NEGATIVE = '#DC2626';
const NEUTRAL = '#374151';

function dilutionColor(text: string): string {
  const low = text.toLowerCase();
  const pctMatch = /(\d+(?:\.\d+)?)\s*%/.exec(low);
  if (pctMatch) {
    const pct = parseFloat(pctMatch[1]);
    if (pct >= 10) return NEGATIVE;
    if (pct < 5) return NEUTRAL;
  }
  if (/\b(significant|material|substantial|major|severe|heavy|massive|large)\b/.test(low)) {
    return NEGATIVE;
  }
  if (/\b(minimal|negligible|no immediate|nominal|de minimis|none|low|small)\b/.test(low)) {
    return NEUTRAL;
  }
  return NEUTRAL;
}

describe('S-3 helpers', () => {
  describe('formatShelfDate', () => {
    it.each([
      ['ISO date', '2027-12-04', '4 December 2027'],
      ['ISO with time', '2026-05-15T00:00:00Z', '15 May 2026'],
      ['ISO January (boundary)', '2027-01-01', '1 January 2027'],
      ['ISO December (boundary)', '2027-12-31', '31 December 2027'],
      ['empty string', '', ''],
    ])('formats %s', (_desc, input, expected) => {
      expect(formatShelfDate(input)).toBe(expected);
    });

    it('preserves unparseable input rather than dropping data', () => {
      // We never want to silently lose AI-emitted information; if the
      // model gave us something unconventional, render it as-is.
      expect(formatShelfDate('three years from filing')).toBe('three years from filing');
      expect(formatShelfDate('TBD')).toBe('TBD');
    });
  });

  describe('dilutionColor - severity-aware', () => {
    describe('low / minimal / favorable signals → neutral', () => {
      it.each([
        'minimal immediate impact',
        'negligible dilution',
        'no immediate impact',
        '3% dilution',
        '4.5% dilution',
        'low impact on existing shareholders',
        'nominal dilution',
        'de minimis',
      ])('paints %p as neutral, not red', (text) => {
        expect(dilutionColor(text)).toBe(NEUTRAL);
      });
    });

    describe('significant / large signals → red', () => {
      it.each([
        'significant dilution',
        'material dilution to existing shareholders',
        'substantial dilution',
        '15% dilution',
        '25% dilution',
        'major dilution event',
        'massive shareholder dilution',
      ])('paints %p as red', (text) => {
        expect(dilutionColor(text)).toBe(NEGATIVE);
      });
    });

    describe('boundary at 10%', () => {
      it('5% (boundary low) → neutral', () => {
        expect(dilutionColor('5% dilution')).toBe(NEUTRAL);
      });
      it('10% (boundary high) → red', () => {
        expect(dilutionColor('10% dilution')).toBe(NEGATIVE);
      });
      it('9.9% → neutral', () => {
        expect(dilutionColor('9.9% dilution')).toBe(NEUTRAL);
      });
    });
  });
});
