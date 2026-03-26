/**
 * Tests for SEC EDGAR Submissions API client
 *
 * Covers:
 * - parseAcceptanceDateTime: compact (YYYYMMDDHHMMSS) and ISO 8601 formats
 * - zipColumnarFilings: happy path, empty arrays, array length mismatch
 * - filterNewFilings: new filings found, no new filings, null watermark
 * - padCik: zero-padding to 10 digits
 * - buildSubmissionsUrl: URL construction
 */

import {
  parseAcceptanceDateTime,
  zipColumnarFilings,
  filterNewFilings,
  padCik,
  buildSubmissionsUrl,
  SubmissionsParseError,
  SubmissionsRecentFilings,
} from '@/lib/sec-edgar/submissions-client';

// ── parseAcceptanceDateTime ──────────────────────────────────────────

describe('parseAcceptanceDateTime', () => {
  it('parses compact YYYYMMDDHHMMSS format', () => {
    const result = parseAcceptanceDateTime('20240618160548');
    expect(result.toISOString()).toBe('2024-06-18T16:05:48.000Z');
  });

  it('parses ISO 8601 format with Z suffix', () => {
    const result = parseAcceptanceDateTime('2024-06-18T16:05:48.000Z');
    expect(result.toISOString()).toBe('2024-06-18T16:05:48.000Z');
  });

  it('parses ISO 8601 format with timezone offset', () => {
    const result = parseAcceptanceDateTime('2024-06-18T12:05:48-04:00');
    expect(result.toISOString()).toBe('2024-06-18T16:05:48.000Z');
  });

  it('throws SubmissionsParseError for unparseable string', () => {
    expect(() => parseAcceptanceDateTime('not-a-date'))
      .toThrow(SubmissionsParseError);
    expect(() => parseAcceptanceDateTime('not-a-date'))
      .toThrow('Unparseable acceptanceDateTime');
  });

  it('throws for empty string', () => {
    expect(() => parseAcceptanceDateTime('')).toThrow(SubmissionsParseError);
  });

  it('handles midnight correctly in compact format', () => {
    const result = parseAcceptanceDateTime('20240101000000');
    expect(result.toISOString()).toBe('2024-01-01T00:00:00.000Z');
  });

  it('handles end of day correctly in compact format', () => {
    const result = parseAcceptanceDateTime('20241231235959');
    expect(result.toISOString()).toBe('2024-12-31T23:59:59.000Z');
  });
});

// ── zipColumnarFilings ───────────────────────────────────────────────

describe('zipColumnarFilings', () => {
  const makeRecent = (count: number): SubmissionsRecentFilings => ({
    accessionNumber: Array.from({ length: count }, (_, i) => `0000320193-24-00000${i + 1}`),
    filingDate: Array.from({ length: count }, () => '2024-06-18'),
    reportDate: Array.from({ length: count }, () => '2024-06-15'),
    acceptanceDateTime: Array.from({ length: count }, () => '20240618160548'),
    act: Array.from({ length: count }, () => '34'),
    form: Array.from({ length: count }, () => '8-K'),
    fileNumber: Array.from({ length: count }, () => '001-36743'),
    filmNumber: Array.from({ length: count }, () => '24975558'),
    items: Array.from({ length: count }, () => '2.02,9.01'),
    size: Array.from({ length: count }, () => 123456),
    isXBRL: Array.from({ length: count }, () => 0),
    isInlineXBRL: Array.from({ length: count }, () => 1),
    primaryDocument: Array.from({ length: count }, () => 'doc.htm'),
    primaryDocDescription: Array.from({ length: count }, () => '8-K'),
  });

  it('zips a single filing correctly', () => {
    const recent = makeRecent(1);
    const result = zipColumnarFilings(recent);

    expect(result).toHaveLength(1);
    expect(result[0].accessionNumber).toBe('0000320193-24-000001');
    expect(result[0].form).toBe('8-K');
    expect(result[0].primaryDocument).toBe('doc.htm');
    expect(result[0].acceptanceDateTime).toBeInstanceOf(Date);
    expect(result[0].isXBRL).toBe(false);
    expect(result[0].isInlineXBRL).toBe(true);
  });

  it('zips multiple filings correctly', () => {
    const recent = makeRecent(3);
    const result = zipColumnarFilings(recent);
    expect(result).toHaveLength(3);
    expect(result[0].accessionNumber).toBe('0000320193-24-000001');
    expect(result[2].accessionNumber).toBe('0000320193-24-000003');
  });

  it('handles empty arrays (zero filings)', () => {
    const recent = makeRecent(0);
    const result = zipColumnarFilings(recent);
    expect(result).toHaveLength(0);
  });

  it('throws SubmissionsParseError on array length mismatch', () => {
    const recent = makeRecent(2);
    // Corrupt filingDate to have wrong length
    recent.filingDate = ['2024-06-18'];

    expect(() => zipColumnarFilings(recent)).toThrow(SubmissionsParseError);
    expect(() => zipColumnarFilings(recent)).toThrow('Columnar array length mismatch');
  });

  it('throws on form array length mismatch', () => {
    const recent = makeRecent(2);
    recent.form = ['8-K', '10-K', '10-Q']; // 3 entries instead of 2

    expect(() => zipColumnarFilings(recent)).toThrow(SubmissionsParseError);
  });
});

// ── filterNewFilings ─────────────────────────────────────────────────

describe('filterNewFilings', () => {
  const makeFilings = (timestamps: string[]) =>
    timestamps.map((ts, i) => ({
      accessionNumber: `0000320193-24-00000${i + 1}`,
      filingDate: '2024-06-18',
      reportDate: '2024-06-15',
      acceptanceDateTime: parseAcceptanceDateTime(ts),
      form: '8-K',
      primaryDocument: 'doc.htm',
      primaryDocDescription: '8-K',
      items: '',
      size: 100,
      isXBRL: false,
      isInlineXBRL: false,
    }));

  it('returns filings newer than watermark', () => {
    const filings = makeFilings([
      '20240618160548', // newest
      '20240618140000', // middle
      '20240618120000', // oldest
    ]);
    const result = filterNewFilings(filings, '20240618140000');

    expect(result).toHaveLength(1);
    expect(result[0].accessionNumber).toBe('0000320193-24-000001');
  });

  it('returns empty when no filings are newer than watermark', () => {
    const filings = makeFilings(['20240618120000', '20240618100000']);
    const result = filterNewFilings(filings, '20240618140000');
    expect(result).toHaveLength(0);
  });

  it('returns empty when watermark is null (cold start)', () => {
    const filings = makeFilings(['20240618160548']);
    const result = filterNewFilings(filings, null);
    expect(result).toHaveLength(0);
  });

  it('returns filings sorted newest-first', () => {
    const filings = makeFilings([
      '20240618100000',
      '20240618160000',
      '20240618130000',
    ]);
    const result = filterNewFilings(filings, '20240618090000');

    expect(result).toHaveLength(3);
    expect(result[0].acceptanceDateTime.getTime())
      .toBeGreaterThan(result[1].acceptanceDateTime.getTime());
    expect(result[1].acceptanceDateTime.getTime())
      .toBeGreaterThan(result[2].acceptanceDateTime.getTime());
  });

  it('excludes filings at exactly the watermark time', () => {
    const filings = makeFilings(['20240618140000']);
    const result = filterNewFilings(filings, '20240618140000');
    expect(result).toHaveLength(0);
  });
});

// ── padCik ───────────────────────────────────────────────────────────

describe('padCik', () => {
  it('pads short CIK to 10 digits', () => {
    expect(padCik('320193')).toBe('0000320193');
  });

  it('handles already-padded CIK', () => {
    expect(padCik('0000320193')).toBe('0000320193');
  });

  it('handles single digit CIK', () => {
    expect(padCik('1')).toBe('0000000001');
  });

  it('strips leading zeros before padding', () => {
    expect(padCik('00320193')).toBe('0000320193');
  });
});

// ── buildSubmissionsUrl ──────────────────────────────────────────────

describe('buildSubmissionsUrl', () => {
  it('builds correct URL with padded CIK', () => {
    expect(buildSubmissionsUrl('320193'))
      .toBe('https://data.sec.gov/submissions/CIK0000320193.json');
  });

  it('builds correct URL with already-padded CIK', () => {
    expect(buildSubmissionsUrl('0000320193'))
      .toBe('https://data.sec.gov/submissions/CIK0000320193.json');
  });
});
