/**
 * Numeric grounding validator (PR 2 in the anti-hallucination plan).
 *
 * Walks the parsed summary structure and confirms every emitted dollar
 * amount, percentage, and large share count appears (or has a normalized
 * variant) somewhere in the SEC source document. Values without a match
 * are redacted to null and a violation is recorded for telemetry.
 *
 * SCOPE: we ground against the SEC source doc only (`processedContent`).
 * Values backed only by web-search or historical-context enrichment WILL be
 * redacted — enrichment is for color, not numeric truth. If the model emits
 * a number that only appeared in enrichment, that's still a fabrication
 * relative to this filing's prospectus.
 *
 * SKIP RULES (false-positive guards):
 *  - Source doc shorter than MIN_SOURCE_LEN: too little signal to ground.
 *  - Field shorter than MIN_VALUE_LEN: noise.
 *  - Prose fields (summary, whyItMatters, headline, emailSubject): handled
 *    by ticker grounding, not numeric grounding.
 *  - *Date paths: dates have too many representational variants for
 *    substring matching to be reliable.
 *  - "approximately"/"approximately equal to" near the candidate value in
 *    the source doc: filings round, AI re-rounds.
 *
 * REDACTION STRATEGY:
 *  - Top-level string field → null.
 *  - Array-item string field → null (the row stays so other fields render).
 *  - DO NOT delete the array entry — that conflates "value unverified" with
 *    "category doesn't exist".
 *
 * ORIGINALLY-REQUIRED FIELDS (e.g. Form 4 `transactions[].shares`) cannot
 * be nulled without breaking the strict-json-schema contract downstream
 * renderers may rely on. For those, we leave the value in place but record
 * the violation under `ai.numeric_grounding_violation_unredactable`.
 */

import { getSchemaForFormType } from '../prompts/unified-prompts';

export interface NumericGroundingViolation {
  path: string;
  value: string;
  reason: string;
}

export interface NumericGroundingResult {
  rejectedFields: NumericGroundingViolation[];
  /** Originally-required paths that violated but were preserved. */
  unredactablePaths: string[];
  durationMs: number;
  /** When true, the validator counted violations but did NOT mutate data. */
  warnOnly: boolean;
}

export interface NumericGroundingOptions {
  formType?: string;
  /** Set true when the source doc represents only one of multiple chunks. */
  chunked?: boolean;
}

const MIN_SOURCE_LEN = 1000;
const MIN_VALUE_LEN = 2;
const APPROXIMATION_WINDOW = 80;

/**
 * Prose fields are excluded — ticker grounding handles them. Listed at
 * module scope so the structured walker can short-circuit.
 */
const PROSE_FIELD_NAMES = new Set([
  'summary',
  'whyItMatters',
  'headline',
  'emailSubject',
  'description',
  'context',
  'commentary',
  'analysis',
  'narrative',
  'governanceContext',
]);

/**
 * Structured walk paths. Validator only checks these; generic recursion
 * would over-flag (e.g. catch a dollar in a free-text description). When
 * a schema adds a new numeric field, extend this list.
 *
 * Path syntax mirrors what we report: `a.b` for nested, `a[].b` for arrays.
 */
const WALK_PATHS: ReadonlyArray<string> = [
  // Top-level dollar / percent / count strings
  'offeringAmount',
  'dilutionImpact',
  'pricePerShare',
  'sharesOffered',
  'ceoPayRatio',
  'planAssets',
  'netAssetsChange',
  'participantCount',
  'companyStockHoldings',
  'contributionsReceived',
  'employerContributions',
  'benefitsDistributed',
  'totalRevenue',
  'netIncome',
  // PR 2 §7 additions
  'coupon',
  'yield',
  'spread',
  'eps',
  'revenue',
  'margin',
  'dividend',
  'maturity',
  'proceeds',
  'nav',
  // Nested objects
  'shelfRegistration.totalAuthorized',
  'shelfRegistration.remainingCapacity',
  'dealTerms.dealValue',
  'dealTerms.consideration',
  // Arrays of objects — array notation `name[].field`
  'financialHighlights[].value',
  'financialHighlights[].change',
  'financialHighlights[].qoqChange',
  'segments[].revenue',
  'segments[].growth',
  'tranches[].amountDisplay',
  'tranches[].coupon',
  'tranches[].yield',
  'tranches[].spread',
  'transactions[].shares',
  'transactions[].pricePerShare',
  'transactions[].totalValue',
  'transactions[].sharesOwnedFollowing',
  'executiveCompensation[].totalCompensation',
  'investmentOptions[].allocation',
  'investmentOptions[].return',
  'securityTypes[].amount',
];

/** Detection patterns; ORDER MATTERS — dollars before bare share counts. */
const DOLLAR_PATTERN = /\$[\d,]+(?:\.\d+)?\s*(?:billion|million|thousand|trillion|B|M|K|T)?\b/gi;
const PERCENT_PATTERN = /[+\-]?\d+(?:\.\d+)?\s*%/g;
/** Bare share counts: only flag when >= 1000 to avoid matching "5" / "10" etc. */
const SHARE_COUNT_PATTERN = /\b(?:\d{1,3}(?:,\d{3})+|\d{4,})\b/g;

interface RequiredPathSet {
  has(path: string): boolean;
}

/**
 * Build a set of "originally-required" paths from a JSON Schema. Walks the
 * top-level `required` array plus `items.required` for any object-array
 * properties. Output paths use the same `a.b` / `a[].b` notation as
 * `WALK_PATHS`.
 */
function buildRequiredPaths(formType: string | undefined): RequiredPathSet {
  const result = new Set<string>();
  if (!formType) return { has: (p) => result.has(p) };

  let schema: unknown;
  try {
    schema = getSchemaForFormType(formType);
  } catch {
    return { has: (p) => result.has(p) };
  }
  if (!schema || typeof schema !== 'object') return { has: (p) => result.has(p) };
  const sObj = schema as { required?: string[]; properties?: Record<string, unknown> };
  if (!sObj.properties) return { has: (p) => result.has(p) };

  for (const reqName of sObj.required ?? []) {
    result.add(reqName);
  }
  for (const [propName, propRaw] of Object.entries(sObj.properties)) {
    if (!propRaw || typeof propRaw !== 'object') continue;
    const prop = propRaw as { type?: string; items?: { required?: string[] }; required?: string[] };
    if (prop.type === 'array') {
      for (const itemReq of prop.items?.required ?? []) {
        result.add(`${propName}[].${itemReq}`);
      }
    } else if (prop.type === 'object') {
      for (const nestedReq of prop.required ?? []) {
        result.add(`${propName}.${nestedReq}`);
      }
    }
  }
  return { has: (p) => result.has(p) };
}

/**
 * Tokenize the source doc once into the set of bare numeric tokens (with
 * commas/dots intact). Membership-check is O(1) and short-circuits the more
 * expensive substring search for the common case where an emitted value's
 * core digits are already present in the doc.
 */
function buildNumericTokenSet(sourceDoc: string): Set<string> {
  const tokens = sourceDoc.match(/[\d,.]+/g);
  return new Set(tokens ?? []);
}

/** Strip commas and trailing dots from a numeric token. */
function bareDigits(s: string): string {
  return s.replace(/[,$\s]/g, '').replace(/\.$/, '');
}

/**
 * Extract a single canonical numeric value (and unit) from an emitted value
 * like `$5B`, `$5,000,000,000`, `5 billion`, `34%`, `1,234,567`. Returns
 * `{ digits: '5000000000', unit: 'B' | '%' | 'shares' }` or null if the
 * string doesn't look numeric.
 */
interface ExtractedValue {
  raw: string;
  kind: 'dollar' | 'percent' | 'shares';
  /** Canonical numeric form: digits-only string, with multiplier applied for B/M/K. */
  canonical: string;
  /** Decimal form for variant generation (e.g., "5.0" for "$5B"). */
  decimal: string;
}

const UNIT_MULTIPLIERS: Record<string, number> = {
  trillion: 1_000_000_000_000,
  t: 1_000_000_000_000,
  billion: 1_000_000_000,
  b: 1_000_000_000,
  million: 1_000_000,
  m: 1_000_000,
  thousand: 1_000,
  k: 1_000,
};

function extractDollarMagnitude(raw: string): ExtractedValue | null {
  // Match the digits and optional unit
  const m = raw.match(/\$?([\d,]+(?:\.\d+)?)\s*(billion|million|thousand|trillion|B|M|K|T)?\b/i);
  if (!m) return null;
  const digits = m[1];
  const unit = (m[2] ?? '').toLowerCase();
  const baseNum = parseFloat(digits.replace(/,/g, ''));
  if (!Number.isFinite(baseNum)) return null;
  const mult = unit ? (UNIT_MULTIPLIERS[unit] ?? 1) : 1;
  const total = baseNum * mult;
  return {
    raw,
    kind: 'dollar',
    canonical: total.toString(),
    decimal: baseNum.toString(),
  };
}

function extractPercent(raw: string): ExtractedValue | null {
  const m = raw.match(/[+\-]?(\d+(?:\.\d+)?)\s*%/);
  if (!m) return null;
  return { raw, kind: 'percent', canonical: m[1], decimal: m[1] };
}

function extractShareCount(raw: string): ExtractedValue | null {
  const cleaned = bareDigits(raw);
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n) || n < 1000) return null;
  return { raw, kind: 'shares', canonical: cleaned, decimal: cleaned };
}

/**
 * Generate substring variants the source doc might use to express this
 * value. Conservative — we add common forms, accept the false-negative
 * cost of unusual phrasings (an unverified-but-real value gets nulled, the
 * downstream template hides it gracefully).
 */
function generateVariants(extracted: ExtractedValue): string[] {
  const out = new Set<string>();
  const { canonical, decimal, kind } = extracted;

  if (kind === 'dollar') {
    const num = parseFloat(canonical);
    if (!Number.isFinite(num)) return [canonical];
    // Long-form: "5,000,000,000"
    out.add(num.toLocaleString('en-US'));
    // Plain digits: "5000000000"
    out.add(canonical);
    // Magnitude forms based on size
    if (num >= 1e12) {
      const t = num / 1e12;
      out.add(`${t}T`); out.add(`${t} trillion`); out.add(`${t.toFixed(1)} trillion`);
    }
    if (num >= 1e9) {
      const b = num / 1e9;
      out.add(`${b}B`); out.add(`${b} billion`); out.add(`${b.toFixed(1)} billion`);
      out.add(`${b.toFixed(1)}B`);
    }
    if (num >= 1e6) {
      const mm = num / 1e6;
      out.add(`${mm}M`); out.add(`${mm} million`); out.add(`${mm.toFixed(1)} million`);
      out.add(`${mm.toFixed(1)}M`);
    }
    if (num >= 1000) {
      const k = num / 1000;
      out.add(`${k}K`); out.add(`${k} thousand`);
    }
    // Original decimal form (e.g. "5" or "5.5")
    out.add(decimal);
  } else if (kind === 'percent') {
    out.add(`${canonical}%`);
    out.add(`${canonical} percent`);
    out.add(canonical);
    // 34 → 0.34
    const n = parseFloat(canonical);
    if (Number.isFinite(n)) {
      out.add((n / 100).toString());
      out.add(`(${canonical}%)`);
    }
  } else if (kind === 'shares') {
    const n = parseFloat(canonical);
    if (!Number.isFinite(n)) return [canonical];
    // Long-form with commas
    out.add(n.toLocaleString('en-US'));
    out.add(canonical);
    // Magnitude forms (e.g. 1,234,567 → "1.2M shares")
    if (n >= 1e9) out.add(`${(n / 1e9).toFixed(1)}B`);
    if (n >= 1e6) out.add(`${(n / 1e6).toFixed(1)}M`);
    if (n >= 1e3) out.add(`${(n / 1e3).toFixed(1)}K`);
  }

  return Array.from(out).filter((v) => v && v.length >= 2);
}

/**
 * Approximation tolerance: scan for "approximately N [unit]" patterns in
 * the source doc (already lowercased) and accept if any of those numbers
 * is within 5% of `target`.
 */
const APPROXIMATE_PATTERN = /approximate(?:ly)?\s+\$?\s*([\d,]+(?:\.\d+)?)\s*(billion|million|thousand|trillion|b|m|k|t)?\b/g;

function hasApproximateMatch(sourceLower: string, target: number): boolean {
  let match: RegExpExecArray | null;
  // Reset lastIndex since the regex is module-scoped with the `g` flag.
  APPROXIMATE_PATTERN.lastIndex = 0;
  while ((match = APPROXIMATE_PATTERN.exec(sourceLower)) !== null) {
    const baseNum = parseFloat(match[1].replace(/,/g, ''));
    if (!Number.isFinite(baseNum)) continue;
    const unit = (match[2] ?? '').toLowerCase();
    const mult = unit ? (UNIT_MULTIPLIERS[unit] ?? 1) : 1;
    const approxValue = baseNum * mult;
    const ratio = Math.abs(approxValue - target) / Math.max(approxValue, target);
    if (ratio <= 0.05) return true;
  }
  return false;
}

/**
 * Check if a candidate value's numeric content is grounded in the source.
 * Fast path: the value's raw digit token is in the source's numeric token
 * set. Slow path: substring-search any of the normalized variants.
 *
 * Returns `null` if grounded, or a reason string if not.
 */
function checkGrounded(
  value: string,
  sourceDoc: string,
  sourceLowerWindow: string,
  numericTokens: Set<string>,
): { grounded: true } | { grounded: false; reason: string } {
  if (value.length < MIN_VALUE_LEN) return { grounded: true };

  // Pull the strongest signal — order matters: try dollar first since
  // "$5,000,000" would also match the share-count pattern.
  const dollar = value.match(DOLLAR_PATTERN);
  const percent = value.match(PERCENT_PATTERN);
  const shares = value.match(SHARE_COUNT_PATTERN);

  const candidates: ExtractedValue[] = [];
  for (const raw of dollar ?? []) {
    const ex = extractDollarMagnitude(raw);
    if (ex) candidates.push(ex);
  }
  for (const raw of percent ?? []) {
    const ex = extractPercent(raw);
    if (ex) candidates.push(ex);
  }
  // Only count bare share counts if we didn't already classify as dollar/percent.
  if (candidates.length === 0) {
    for (const raw of shares ?? []) {
      const ex = extractShareCount(raw);
      if (ex) candidates.push(ex);
    }
  }
  if (candidates.length === 0) {
    // Nothing numeric to ground — value is opaque / categorical, accept.
    return { grounded: true };
  }

  for (const ex of candidates) {
    // Fast path: bare-digit token already in source.
    const bare = bareDigits(ex.canonical);
    if (numericTokens.has(bare)) continue;

    // Slow path: try variants.
    const variants = generateVariants(ex);
    let matched = false;
    for (const v of variants) {
      if (sourceLowerWindow.includes(v.toLowerCase())) {
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Approximation tolerance: when source says "approximately N <unit>"
    // where N is within 5% of the emitted value's magnitude, accept.
    // Filings often round ("approximately $79.9 billion") and the AI
    // re-rounds ("$80B"). This avoids false positives on benign rounding.
    if (ex.kind === 'dollar' || ex.kind === 'shares') {
      const target = parseFloat(ex.canonical);
      if (Number.isFinite(target) && hasApproximateMatch(sourceLowerWindow, target)) {
        continue;
      }
    }

    return { grounded: false, reason: `No source match for ${ex.kind} "${ex.raw}"` };
  }

  return { grounded: true };
}

/**
 * Resolve a path like 'shelfRegistration.totalAuthorized' against the parsed
 * data and apply `visit` to each terminal value. Yields:
 *   - { exists: true, value, path } for each matched terminal.
 *   - For `a[].b` paths, iterates each array element.
 */
type Visitor = (path: string, value: unknown, redact: () => void) => void;

function visitPath(data: Record<string, unknown>, path: string, visitor: Visitor): void {
  if (path.includes('[].')) {
    const [arrayPart, fieldName] = path.split('[].');
    const arr = resolveDeep(data, arrayPart);
    if (!Array.isArray(arr)) return;
    for (let i = 0; i < arr.length; i++) {
      const entry = arr[i];
      if (entry && typeof entry === 'object') {
        const obj = entry as Record<string, unknown>;
        if (fieldName in obj) {
          visitor(`${arrayPart}[${i}].${fieldName}`, obj[fieldName], () => {
            obj[fieldName] = null;
          });
        }
      }
    }
  } else if (path.includes('.')) {
    const segments = path.split('.');
    const last = segments.pop()!;
    let cur: Record<string, unknown> | undefined = data;
    for (const seg of segments) {
      const next = cur?.[seg];
      if (!next || typeof next !== 'object' || Array.isArray(next)) return;
      cur = next as Record<string, unknown>;
    }
    if (cur && last in cur) {
      visitor(path, cur[last], () => {
        cur![last] = null;
      });
    }
  } else {
    if (path in data) {
      visitor(path, data[path], () => {
        data[path] = null;
      });
    }
  }
}

function resolveDeep(data: Record<string, unknown>, path: string): unknown {
  let cur: unknown = data;
  for (const seg of path.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/**
 * Validator entry point.
 */
export function validateNumericGrounding(
  data: Record<string, unknown>,
  sourceDoc: string,
  options: NumericGroundingOptions = {},
): NumericGroundingResult {
  const startedAt = Date.now();
  const empty: NumericGroundingResult = {
    rejectedFields: [],
    unredactablePaths: [],
    durationMs: 0,
    warnOnly: false,
  };

  if (process.env.ENRICHMENT_DISABLE_NUMERIC_GROUNDING === '1') {
    return empty;
  }
  if (!sourceDoc || sourceDoc.length < MIN_SOURCE_LEN) {
    return empty;
  }

  // When the source was chunked we only see one chunk — emitted values that
  // came from a different chunk would be redacted as fabrications. Run in
  // warn-only mode: count the violations but DO NOT mutate data.
  const warnOnly = Boolean(options.chunked);

  const requiredPaths = buildRequiredPaths(options.formType);
  const numericTokens = buildNumericTokenSet(sourceDoc);
  // Lowercase once for substring search.
  const sourceLower = sourceDoc.toLowerCase();

  const rejected: NumericGroundingViolation[] = [];
  const unredactable: string[] = [];

  for (const walkPath of WALK_PATHS) {
    visitPath(data, walkPath, (concretePath, value, redact) => {
      // Only ground string values (JSON-numeric typed values are skipped).
      if (typeof value !== 'string' || !value.trim()) return;
      // Skip prose-like field names.
      const leaf = concretePath.split(/[.[]/).pop()!.replace(/\]/g, '');
      if (PROSE_FIELD_NAMES.has(leaf)) return;
      if (/date$/i.test(leaf) || /maturityDate/i.test(leaf)) return;

      const result = checkGrounded(value, sourceDoc, sourceLower, numericTokens);
      if (result.grounded) return;

      // Determine redaction policy: originally-required paths cannot be
      // nulled without violating strict-schema invariants.
      const normalizedRequiredKey = walkPath; // matches buildRequiredPaths output
      if (requiredPaths.has(normalizedRequiredKey)) {
        unredactable.push(concretePath);
        return;
      }

      rejected.push({ path: concretePath, value, reason: result.reason });
      if (!warnOnly) redact();
    });
  }

  return {
    rejectedFields: rejected,
    unredactablePaths: unredactable,
    durationMs: Date.now() - startedAt,
    warnOnly,
  };
}
