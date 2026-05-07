/**
 * Tests for the defensive `isUsableMetricRow` filter.
 *
 * Triggered by two real failure modes seen in production:
 *  - BRK-B 10-Q: AI emitted literal "$NaN" / "N/A" placeholders for fields
 *    it couldn't extract from the filing excerpt.
 *  - TSLA 10-K: financialHighlights array slot was a character-indexed
 *    object (`{"0":"R","1":"e","2":"v",...}`) - looks like a string was
 *    Object.assign-merged, breaking the {label, value} contract.
 *
 * The template-side filter is the only line of defense after these slip
 * past the schema validator - cached pre-fix summaries also rely on it.
 */

import { isUsableMetricRow } from '../../../components/ui/email/design-system';

describe('isUsableMetricRow', () => {
  describe('happy path', () => {
    it.each([
      [{ label: 'Revenue', value: '$394.3B' }],
      [{ label: 'Gross Margin', value: '74.9%' }],
      [{ label: 'EPS', value: 6.42 }],
      [{ label: 'Operating Margin', value: '18%', change: '+340 bps' }],
    ])('accepts well-formed row %j', (row) => {
      expect(isUsableMetricRow(row)).toBe(true);
    });
  });

  describe('rejects malformed rows', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['empty object', {}],
      ['missing label', { value: '$1B' }],
      ['missing value', { label: 'Revenue' }],
      ['empty label string', { label: '', value: '$1B' }],
      ['whitespace label', { label: '   ', value: '$1B' }],
      ['empty value', { label: 'Revenue', value: '' }],
      ['null value', { label: 'Revenue', value: null }],
      ['undefined value', { label: 'Revenue', value: undefined }],
    ])('rejects %s (%j)', (_label, row) => {
      expect(isUsableMetricRow(row as never)).toBe(false);
    });
  });

  describe('rejects AI placeholder values', () => {
    it.each([
      'NaN',
      '$NaN',
      'N/A',
      'n/a',
      'null',
      'undefined',
      'Not disclosed',
      'not provided',
      'Not Specified',
      'TBD',
      'n/m',
    ])('rejects value=%p', (val) => {
      expect(isUsableMetricRow({ label: 'Revenue', value: val })).toBe(false);
    });
  });

  describe('rejects character-indexed-object artifacts (TSLA 10-K bug)', () => {
    it('rejects {"0":"R","1":"e","2":"v",...} shape', () => {
      // Reconstructed from the actual broken Tesla 10-K summaryJSON.
      const charIndexed: Record<string, string> = {};
      const str = 'Revenue: Not disclosed (YoY N/A)';
      for (let i = 0; i < str.length; i++) charIndexed[String(i)] = str[i];
      // Crucially, no `label` or `value` field on this object.
      expect(isUsableMetricRow(charIndexed as never)).toBe(false);
    });
  });

  describe('preserves usable data when only the change field is bad', () => {
    it('accepts row when only `change` is N/A but label+value are good', () => {
      // The change field has its own N/A handling at the call site. The
      // row-level filter is about whether the metric is renderable AT ALL,
      // not whether every field is populated.
      expect(isUsableMetricRow({ label: 'Revenue', value: '$10B', change: 'N/A' })).toBe(true);
    });
  });
});
