/**
 * SEC EDGAR Submissions API client
 *
 * Polls data.sec.gov/submissions/CIK{padded}.json for near-real-time
 * filing detection. This endpoint updates within seconds of EDGAR
 * acceptance, compared to RSS feeds which update every 10 minutes.
 *
 * Response format is columnar (parallel arrays), not an array of objects.
 * The parser zips these arrays into individual filing records.
 *
 * Rate limit: 10 req/s across all *.sec.gov hostnames (shared with
 * SECEdgarClient's Bottleneck limiter via executeRequest).
 *
 * Data flow:
 *   fetchSubmissions(cik)
 *     → GET https://data.sec.gov/submissions/CIK{padded}.json
 *     → parse columnar JSON → zip into Filing[]
 *     → filter by acceptanceDateTime > watermark
 *     → return { newFilings, latestAcceptanceDateTime }
 */

// ── Types ────────────────────────────────────────────────────────────

/**
 * Raw response from data.sec.gov/submissions/CIK{padded}.json
 *
 * The filings.recent object contains parallel arrays — index i across
 * all arrays corresponds to a single filing. The arrays may contain up
 * to ~1000 entries (most recent filings for the entity).
 */
export interface SubmissionsResponse {
  cik: string;
  entityType: string;
  sic: string;
  sicDescription: string;
  name: string;
  tickers: string[];
  exchanges: string[];
  filings: {
    recent: SubmissionsRecentFilings;
    files: Array<{
      name: string;
      filingCount: number;
      filingFrom: string;
      filingTo: string;
    }>;
  };
}

export interface SubmissionsRecentFilings {
  accessionNumber: string[];
  filingDate: string[];
  reportDate: string[];
  acceptanceDateTime: string[];
  act: string[];
  form: string[];
  fileNumber: string[];
  filmNumber: string[];
  items: string[];
  size: number[];
  isXBRL: number[];
  isInlineXBRL: number[];
  primaryDocument: string[];
  primaryDocDescription: string[];
}

/** A single filing record, zipped from the columnar arrays */
export interface SubmissionsFiling {
  accessionNumber: string;
  filingDate: string;
  reportDate: string;
  acceptanceDateTime: Date;
  form: string;
  primaryDocument: string;
  primaryDocDescription: string;
  items: string;
  size: number;
  isXBRL: boolean;
  isInlineXBRL: boolean;
}

/** Result of polling for new filings since a watermark */
export interface SubmissionsPollResult {
  /** New filings detected since the watermark */
  newFilings: SubmissionsFiling[];
  /** The latest acceptanceDateTime string (raw, for watermark storage) */
  latestAcceptanceDateTime: string | null;
  /** Company name from the response */
  companyName: string;
  /** Whether the response was a 304 Not Modified (ETag cache hit) */
  notModified: boolean;
}

// ── Parsing ──────────────────────────────────────────────────────────

/**
 * Parse acceptanceDateTime from the Submissions API.
 *
 * The SEC API has used two formats historically:
 *   - Compact: "20240618160548" (YYYYMMDDHHMMSS)
 *   - ISO 8601: "2024-06-18T16:05:48.000Z"
 *
 * We handle both defensively. The compact format is the most commonly
 * observed in production responses as of 2026.
 */
export function parseAcceptanceDateTime(raw: string): Date {
  // Try compact format first (most common): "20240618160548"
  const compact = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (compact) {
    const [, yr, mo, dy, hr, mn, sc] = compact;
    return new Date(`${yr}-${mo}-${dy}T${hr}:${mn}:${sc}Z`);
  }

  // Try ISO 8601: "2024-06-18T16:05:48.000Z" or with offset
  const isoDate = new Date(raw);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  throw new SubmissionsParseError(`Unparseable acceptanceDateTime: "${raw}"`);
}

/**
 * Validate and zip columnar arrays into filing records.
 *
 * The SEC returns parallel arrays where index i across all arrays is
 * one filing. We validate array lengths match before zipping to catch
 * data corruption early.
 */
export function zipColumnarFilings(recent: SubmissionsRecentFilings): SubmissionsFiling[] {
  const len = recent.accessionNumber.length;

  // Validate critical arrays have matching lengths
  const criticalArrays = [
    { name: 'filingDate', arr: recent.filingDate },
    { name: 'acceptanceDateTime', arr: recent.acceptanceDateTime },
    { name: 'form', arr: recent.form },
    { name: 'primaryDocument', arr: recent.primaryDocument },
  ];

  for (const { name, arr } of criticalArrays) {
    if (arr.length !== len) {
      throw new SubmissionsParseError(
        `Columnar array length mismatch: accessionNumber has ${len} entries but ${name} has ${arr.length}`
      );
    }
  }

  return Array.from({ length: len }, (_, i) => ({
    accessionNumber: recent.accessionNumber[i],
    filingDate: recent.filingDate[i],
    reportDate: recent.reportDate[i] ?? '',
    acceptanceDateTime: parseAcceptanceDateTime(recent.acceptanceDateTime[i]),
    form: recent.form[i],
    primaryDocument: recent.primaryDocument[i],
    primaryDocDescription: recent.primaryDocDescription[i] ?? '',
    items: recent.items[i] ?? '',
    size: recent.size[i] ?? 0,
    isXBRL: (recent.isXBRL[i] ?? 0) === 1,
    isInlineXBRL: (recent.isInlineXBRL[i] ?? 0) === 1,
  }));
}

/**
 * Filter filings that are newer than the given watermark.
 *
 * The watermark is the raw acceptanceDateTime string from the last
 * successful poll. We compare raw strings (lexicographic for compact
 * format, or parsed dates for ISO) to determine which filings are new.
 *
 * Returns filings sorted newest-first.
 */
export function filterNewFilings(
  filings: SubmissionsFiling[],
  watermark: string | null
): SubmissionsFiling[] {
  if (!watermark) {
    // No watermark — return empty (cold start seeding handles this case)
    return [];
  }

  const watermarkDate = parseAcceptanceDateTime(watermark);

  return filings
    .filter(f => f.acceptanceDateTime.getTime() > watermarkDate.getTime())
    .sort((a, b) => b.acceptanceDateTime.getTime() - a.acceptanceDateTime.getTime());
}

/**
 * Pad a CIK to 10 digits with leading zeros.
 * SEC Submissions API requires zero-padded 10-digit CIKs.
 */
export function padCik(cik: string): string {
  return cik.replace(/^0+/, '').padStart(10, '0');
}

/**
 * Build the Submissions API URL for a given CIK.
 */
export function buildSubmissionsUrl(cik: string): string {
  return `https://data.sec.gov/submissions/CIK${padCik(cik)}.json`;
}

// ── Errors ───────────────────────────────────────────────────────────

export class SubmissionsParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SubmissionsParseError';
  }
}
