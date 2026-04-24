/**
 * 8-K itemNumbers parse regex variants (decision 12A)
 *
 * Locked primary regex: /\bitems?\s*§?\s*(\d+\.\d+)(?!%)\b/gi
 * Secondary pass for coordinated lists runs only when primary matched.
 */

import { extract8KData } from '@/lib/email/8k-data-extractor';

function parseItems(input: string): string[] {
  return extract8KData(input).itemNumbers;
}

describe('8-K itemNumbers regex variants', () => {
  it('N1: matches "Item 2.03"', () => {
    expect(parseItems('Item 2.03')).toEqual(['2.03']);
  });

  it('N2: matches lowercase "item 2.03"', () => {
    expect(parseItems('item 2.03')).toEqual(['2.03']);
  });

  it('N3: matches "Item § 2.03" (section sign after item)', () => {
    expect(parseItems('Item § 2.03')).toEqual(['2.03']);
  });

  it('N4: plural compound "Items 2.03 and 5.02" extracts both', () => {
    expect(parseItems('Items 2.03 and 5.02')).toEqual(['2.03', '5.02']);
  });

  it('N5: parenthesized description "Item 2.03 (Creation of Direct Financial Obligation)"', () => {
    expect(parseItems('Item 2.03 (Creation of Direct Financial Obligation)')).toEqual(['2.03']);
  });

  it('N6: percentage "2.03% coupon" is NOT treated as item number', () => {
    expect(parseItems('2.03% coupon')).toEqual([]);
  });

  it('N7: impossible "Item 99.99" is extracted (renderer gate drops it downstream)', () => {
    expect(parseItems('Item 99.99')).toEqual(['99.99']);
  });

  it('N8: duplicate "Item 2.03, and Item 2.03 again" dedupes to single', () => {
    expect(parseItems('Item 2.03, and Item 2.03 again')).toEqual(['2.03']);
  });

  it('N9: empty input returns []', () => {
    expect(parseItems('')).toEqual([]);
  });
});
