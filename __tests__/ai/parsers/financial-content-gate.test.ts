/**
 * Tests for the pre- and post-LLM financial-content gates.
 *
 * Both gates exist to prevent the COIN 2026-05-07 regression where Grok was
 * fed an XBRL-headers-only excerpt, dutifully emitted six rows of
 * `value: "N/A"`, and the email shipped with a "$NaN" scorecard.
 */

import {
  hasFinancialStatementSignal,
  hasUsableFinancialHighlights,
  requiresFinancialContent,
} from '@/lib/ai/parsers/financial-content-gate';

describe('hasFinancialStatementSignal — pre-LLM gate', () => {
  describe('null and degenerate inputs', () => {
    it.each<[string | null | undefined, string]>([
      [null, 'null'],
      [undefined, 'undefined'],
      ['', 'empty string'],
    ])('rejects %s (%s)', (input) => {
      const result = hasFinancialStatementSignal(input);
      expect(result.ok).toBe(false);
      expect(result.reasons.length).toBeGreaterThan(0);
    });
  });

  describe('the COIN regression — XBRL-only excerpts must be rejected', () => {
    // Realistic shape of what the parser fed Grok for COIN 2026-05-07:
    // namespace declarations, CIK identifiers, schema URLs, no actual
    // statements. ~1500 chars of metadata noise.
    const xbrlOnly = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<xbrl xmlns="http://www.xbrl.org/2003/instance"',
      '  xmlns:dei="http://xbrl.sec.gov/dei/2024"',
      '  xmlns:us-gaap="http://fasb.org/us-gaap/2024"',
      '  xmlns:link="http://www.xbrl.org/2003/linkbase"',
      '  xmlns:xlink="http://www.w3.org/1999/xlink">',
      '<context id="C_0001679788_20260101_20260331">',
      '  <entity><identifier scheme="http://www.sec.gov/CIK">0001679788</identifier></entity>',
      '  <period><startDate>2026-01-01</startDate><endDate>2026-03-31</endDate></period>',
      '</context>',
      '<dei:DocumentType>10-Q</dei:DocumentType>',
      '<dei:DocumentPeriodEndDate>2026-03-31</dei:DocumentPeriodEndDate>',
      '<dei:EntityRegistrantName>Coinbase Global, Inc.</dei:EntityRegistrantName>',
      '<dei:EntityCentralIndexKey>0001679788</dei:EntityCentralIndexKey>',
      '<link:roleRef roleURI="http://www.coinbase.com/role/CONDENSEDCONSOLIDATEDSTATEMENTSOFOPERATIONSUNAUDITED" xlink:type="simple" xlink:href="cb-20260331.xsd#i_role"/>',
    ].join('\n').repeat(6);

    it('rejects an XBRL-namespace-only excerpt', () => {
      const result = hasFinancialStatementSignal(xbrlOnly);
      expect(result.ok).toBe(false);
      // None of the substantive financial signals should fire.
      expect(result.signals.hasPeriodHeader).toBe(false);
      expect(result.signals.hasStatementTitle).toBe(false);
      expect(result.signals.hasLineItems).toBe(false);
      expect(result.signals.hasDollarDensity).toBe(false);
    });
  });

  describe('realistic 10-Q income statement excerpts pass', () => {
    const tenQExcerpt = `
      Condensed Consolidated Statements of Operations (Unaudited)

      Three Months Ended March 31, 2026 and 2025

                                                  2026          2025
      Total revenue                          $1,824,531    $1,652,043
      Cost of revenue                          (745,213)     (689,512)
      Gross profit                            1,079,318      962,531
      Operating expenses:
        Technology and development              412,053      385,120
        Sales and marketing                     189,471      176,983
        General and administrative              156,829      143,765
      Total operating expenses                  758,353      705,868
      Operating income                          320,965      256,663
      Net income                              $ 245,127    $ 198,432
      Diluted earnings per share                $  0.95     $  0.78

      The accompanying notes are an integral part of these condensed
      consolidated financial statements. Revenue increased 10.4% year over
      year, driven by transaction volume of $325 billion (up from $287
      billion). Gross margin expanded to 59.2% from 58.3%. Operating
      margin reached 17.6%, up from 15.5% in the prior-year quarter.
      Cost of services rose 8.1% reflecting higher infrastructure spend.
      Free cash flow was $278 million for the quarter on capital
      expenditures of $42 million against operating cash flow of $320
      million. Net income margin of 13.4% compares to 12.0% prior-year.
    `.repeat(2); // ensure >= 3000 chars

    it('accepts a realistic 10-Q income statement excerpt', () => {
      const result = hasFinancialStatementSignal(tenQExcerpt);
      expect(result.ok).toBe(true);
      expect(result.signals.hasPeriodHeader).toBe(true);
      expect(result.signals.hasStatementTitle).toBe(true);
      expect(result.signals.hasLineItems).toBe(true);
      expect(result.signals.hasDollarDensity).toBe(true);
      expect(result.signals.hasMinimumLength).toBe(true);
    });
  });

  describe('realistic 10-K excerpts pass', () => {
    const tenKExcerpt = `
      CONSOLIDATED STATEMENTS OF INCOME

      Year Ended December 31, 2025 and 2024 (in millions, except per share amounts)

                                                  2025          2024
      Net revenues                          $94,825        $87,103
      Cost of revenue                       (39,201)       (37,142)
      Gross profit                           55,624         49,961
      Total operating expenses               25,830         24,118
      Operating income                       29,794         25,843
      Net income                             22,361         18,205
      Earnings per share — diluted           $  4.85        $  3.91

      Revenue grew 8.9% year-over-year. Gross margin expanded 200 basis
      points to 58.7%. Operating margin reached 31.4%. Free cash flow was
      $24.5 billion. Cost of revenues increased 5.5%. The company returned
      $18 billion to shareholders via repurchases and $4.2 billion in
      dividends, totaling $22.2 billion. Net cash from operating activities
      was $32 billion, with capital expenditures of $7.5 billion.
    `.repeat(2);

    it('accepts a realistic 10-K excerpt with "Year Ended" header', () => {
      const result = hasFinancialStatementSignal(tenKExcerpt);
      expect(result.ok).toBe(true);
      expect(result.signals.hasPeriodHeader).toBe(true);
    });
  });

  describe('individual signal detection', () => {
    it('detects "Three Months Ended" period header', () => {
      const result = hasFinancialStatementSignal(
        'X'.repeat(3000) + ' Three Months Ended March 31'
      );
      expect(result.signals.hasPeriodHeader).toBe(true);
    });

    it('detects "Six Months Ended" period header', () => {
      const result = hasFinancialStatementSignal('Six Months Ended');
      expect(result.signals.hasPeriodHeader).toBe(true);
    });

    it('detects "Year Ended" period header', () => {
      const result = hasFinancialStatementSignal('Year Ended December 31');
      expect(result.signals.hasPeriodHeader).toBe(true);
    });

    it('detects "Consolidated Statements of Operations" title', () => {
      const result = hasFinancialStatementSignal('Consolidated Statements of Operations');
      expect(result.signals.hasStatementTitle).toBe(true);
    });

    it('detects "Balance Sheet" title', () => {
      const result = hasFinancialStatementSignal('Consolidated Balance Sheets');
      expect(result.signals.hasStatementTitle).toBe(true);
    });

    it('counts distinct line items toward the line-item criterion', () => {
      // "Revenue" + "Net income" — two distinct items
      const result = hasFinancialStatementSignal('Revenue and Net income lines');
      expect(result.signals.hasLineItems).toBe(true);
    });

    it('a single line-item mention is not enough', () => {
      const result = hasFinancialStatementSignal('Revenue increased');
      expect(result.signals.hasLineItems).toBe(false);
    });

    it('counts $-prefixed dollar figures', () => {
      const text = Array.from({ length: 12 }, (_, i) => `$${i + 1},000`).join(' ');
      const result = hasFinancialStatementSignal(text);
      expect(result.signals.hasDollarDensity).toBe(true);
    });

    it('does NOT count bare comma-separated digits (avoids CIK noise)', () => {
      // "0001679788" or "1,234,567,890" without $ prefix should not
      // satisfy the dollar-density check on its own.
      const text = Array.from({ length: 20 }, () => '1,234,567').join(' ');
      const result = hasFinancialStatementSignal(text);
      expect(result.signals.hasDollarDensity).toBe(false);
    });
  });

  describe('signal-count threshold (3 of 5 required)', () => {
    it('rejects content with only 2 signals', () => {
      // Has length + 1 line item only. No period, no title, no dollars.
      const text = 'Revenue and Net income mentioned'.padEnd(3500, ' filler');
      const result = hasFinancialStatementSignal(text);
      expect(result.signals.hasMinimumLength).toBe(true);
      expect(result.signals.hasLineItems).toBe(true);
      expect(result.signals.hasPeriodHeader).toBe(false);
      expect(result.signals.hasStatementTitle).toBe(false);
      expect(result.signals.hasDollarDensity).toBe(false);
      expect(result.ok).toBe(false);
    });

    it('accepts content with exactly 3 signals', () => {
      // Length + period header + line items. No dollars, no title — but
      // 3 of 5 is the pass threshold.
      const text =
        'Three Months Ended Revenue Net income'.padEnd(3500, ' filler text');
      const result = hasFinancialStatementSignal(text);
      const passing = Object.values(result.signals).filter(Boolean).length;
      expect(passing).toBeGreaterThanOrEqual(3);
      expect(result.ok).toBe(true);
    });
  });
});

describe('hasUsableFinancialHighlights — post-LLM gate', () => {
  it('rejects null / non-object input', () => {
    expect(hasUsableFinancialHighlights(null).ok).toBe(false);
    expect(hasUsableFinancialHighlights(undefined).ok).toBe(false);
    expect(hasUsableFinancialHighlights('not an object').ok).toBe(false);
    expect(hasUsableFinancialHighlights(42).ok).toBe(false);
  });

  it('rejects when financialHighlights field is missing', () => {
    const result = hasUsableFinancialHighlights({ summary: 'no highlights' });
    expect(result.ok).toBe(false);
    expect(result.signals.arrayPresent).toBe(false);
  });

  it('rejects when financialHighlights is not an array', () => {
    const result = hasUsableFinancialHighlights({ financialHighlights: 'oops' });
    expect(result.ok).toBe(false);
    expect(result.signals.arrayPresent).toBe(false);
  });

  it('rejects when financialHighlights is an empty array', () => {
    const result = hasUsableFinancialHighlights({ financialHighlights: [] });
    expect(result.ok).toBe(false);
    expect(result.signals.arrayNonEmpty).toBe(false);
  });

  it('the COIN regression: rejects when every row is a "$NaN" sentinel', () => {
    const result = hasUsableFinancialHighlights({
      financialHighlights: [
        { label: 'Revenue', value: '$NaN', change: 'N/A', qoqChange: 'N/A' },
        { label: 'Gross Margin', value: '$NaN', change: 'N/A', qoqChange: 'N/A' },
        { label: 'Operating Margin', value: '$NaN', change: 'N/A', qoqChange: 'N/A' },
        { label: 'FCF Margin', value: '$NaN', change: 'N/A', qoqChange: 'N/A' },
        { label: 'Net Income', value: '$NaN', change: 'N/A', qoqChange: 'N/A' },
        { label: 'EPS (diluted)', value: '$NaN', change: 'N/A', qoqChange: 'N/A' },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.signals.arrayPresent).toBe(true);
    expect(result.signals.arrayNonEmpty).toBe(true);
    expect(result.signals.hasUsableRow).toBe(false);
    expect(result.reasons[0]).toMatch(/0 usable/);
  });

  it.each([
    'N/A',
    'null',
    'Null',
    'undefined',
    'Not disclosed',
    'TBD',
    'n/m',
  ])('rejects when every row has sentinel value %s', (sentinel) => {
    const result = hasUsableFinancialHighlights({
      financialHighlights: [{ label: 'Revenue', value: sentinel }],
    });
    expect(result.ok).toBe(false);
  });

  it('accepts when at least one row has a usable value', () => {
    const result = hasUsableFinancialHighlights({
      financialHighlights: [
        { label: 'Revenue', value: '$611M', change: '+7.07%' },
        { label: 'FCF Margin', value: '$NaN', change: 'N/A' },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.signals.hasUsableRow).toBe(true);
  });

  it('accepts a fully-populated scorecard', () => {
    const result = hasUsableFinancialHighlights({
      financialHighlights: [
        { label: 'Revenue', value: '$94B', change: '+6.10%' },
        { label: 'EPS', value: '$1.65', change: '-3.50%' },
      ],
    });
    expect(result.ok).toBe(true);
  });
});

describe('requiresFinancialContent', () => {
  it.each(['10-K', '10-Q', '20-F', '6-K', '10-K/A', '10-Q/A'])(
    'returns true for %s (financial-data hard requirement)',
    (formType) => {
      expect(requiresFinancialContent(formType)).toBe(true);
    }
  );

  it.each(['8-K', '4', '3', '144', 'S-1', 'DEF 14A', 'SC 13G', 'Generic'])(
    'returns false for %s (different content contract)',
    (formType) => {
      expect(requiresFinancialContent(formType)).toBe(false);
    }
  );

  it('returns false for null / undefined / empty', () => {
    expect(requiresFinancialContent(null)).toBe(false);
    expect(requiresFinancialContent(undefined)).toBe(false);
    expect(requiresFinancialContent('')).toBe(false);
  });

  it('is case-insensitive for the form-type match', () => {
    expect(requiresFinancialContent('10-q')).toBe(true);
    expect(requiresFinancialContent('10-k')).toBe(true);
  });
});
