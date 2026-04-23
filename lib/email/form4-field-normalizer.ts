/**
 * Form 4 Field Normalizer — Centralized field-name mapping
 *
 * The AI returns field names that don't always match the schema we asked for.
 * This module is the SINGLE source of truth for normalizing AI output into
 * the canonical field names used by templates and extractors.
 *
 * CURRENT_FORM4_SCHEMA_VERSION: Bump when changing field mappings or normalizer
 * behavior. Used by summarize-cached-handler to detect stale summaryJSON.
 *
 * Field name drift observed in production:
 *
 *   AI Returns          │  Schema Expected      │  Template Reads
 *   ────────────────────┼───────────────────────┼──────────────────
 *   price: 0            │  pricePerShare: "$0"  │  pricePerShare
 *   action: "Acquired"  │  type: "Purchase"     │  type
 *   filerRole: "SVP"    │  filerRole: "SVP"     │  relationship (!)
 *   (missing)           │  sharesOwnedFollowing │  sharesOwnedFollowing
 *   table: "I"          │  (not in schema)      │  (ignored)
 *   security: "Common"  │  (not in schema)      │  (ignored)
 *
 * @module form4-field-normalizer
 */

import { logger } from '../logging';
// Circular import: derive-stake.ts imports formatNumberWithCommas from this file.
// Safe only because formatNumberWithCommas (line ~625) is a `function` declaration
// and gets hoisted. Do NOT convert it to `const fn = () => ...` or the cycle crashes
// at module init.
import { deriveNewStake, detectNewStakeNarrativeMismatch } from '../ai/utils/derive-stake';

const componentLogger = logger.child('form4-normalizer');

/**
 * Canonical field names for Form 4 transaction objects
 */
export interface NormalizedTransaction {
  code: string;
  type: string;
  shares: string | number;
  pricePerShare: string | number;
  sharesOwnedFollowing?: string | number;
  acquisitionDisposition?: string;
  date?: string;
  securityType?: string;
  ownershipForm?: string;
  ownershipNature?: string;
}

/**
 * Canonical field names for Form 4 top-level summary data
 */
export interface NormalizedForm4Data {
  company: string;
  summary: string;
  filerName: string;
  filerRole: string;
  filingDate?: string;
  totalValue?: string;
  has10b51Plan?: boolean;
  transactions: NormalizedTransaction[];
  signalStrength?: string;
  percentageChange?: string;
  newStake?: string;
  previousStake?: string;
  vestingDetails?: string;
  /**
   * True when the derived newStake disagrees with a number in summaryText by >5%.
   * Drives dataQuality='degraded' in email templates to fail loud on LLM hallucinations.
   * See .claude/tasks/form4-holdings-mismatch.md.
   */
  hasNarrativeMismatch?: boolean;
  /** Diagnostic: which tier produced newStake. Undefined when no derivation ran. */
  newStakeSource?: 'authoritative' | 'derived-common-direct' | 'derived-fallback' | 'llm-legacy' | 'narrative' | 'none';
}

/**
 * SEC transaction code → human-readable type mapping
 * This is the canonical map used by both parser and template.
 *
 * NOTE: Must stay in sync with TRANSACTION_CODE_MAP in form4-data-extractor.ts
 * which has additional codes (V, I, E, H, O, L, Z, U) for edge cases.
 */

// Bump when changing field mappings or normalizer behavior.
// Used by response-parser (stamp) and summarize-cached-handler (detect stale data).
export const CURRENT_FORM4_SCHEMA_VERSION = 3;

export const TX_CODE_TO_TYPE: Record<string, string> = {
  'P': 'Purchase',
  'S': 'Sale',
  'A': 'Award/Grant',
  'D': 'Disposition',
  'G': 'Gift',
  'M': 'Exercise',
  'F': 'Tax Withholding',
  'J': 'Trust Transfer',
  'K': 'Equity Swap',
  'X': 'Exercise',
  'C': 'Conversion',
  'W': 'Will/Descent',
};

/**
 * All known field aliases for transaction objects.
 * Key = canonical name, Value = array of known AI-returned variants.
 */
const TRANSACTION_FIELD_ALIASES: Record<string, string[]> = {
  code: ['transactionCode', 'txCode', 'secCode'],
  type: ['transactionType', 'txType', 'action'],
  pricePerShare: ['price', 'unitPrice', 'sharePrice'],
  shares: ['shareCount', 'numberOfShares', 'quantity'],
  sharesOwnedFollowing: ['sharesOwned', 'postTransactionShares', 'remainingShares', 'ownershipAfter'],
  acquisitionDisposition: ['ownershipType', 'adFlag', 'aOrD'],
  date: ['transactionDate', 'txDate'],
};

/**
 * All known field aliases for top-level Form 4 data.
 * Key = canonical name, Value = array of known AI-returned variants.
 */
const FORM4_FIELD_ALIASES: Record<string, string[]> = {
  filerName: ['reportingPerson', 'insiderName', 'personName'],
  filerRole: ['relationship', 'position', 'title', 'role'],
  totalValue: ['transactionValue', 'totalAmount'],
  percentageChange: ['changePercent', 'holdingChange', 'ownershipChange'],
  newStake: ['sharesRemaining', 'currentHoldings', 'postTransactionHoldings'],
  previousStake: ['sharesOwned', 'priorHoldings', 'preTransactionHoldings'],
};

/**
 * Detect if an object has character-indexed keys (from string spread bug).
 * Pattern: {"0":"S","1":"o","2":"l","3":"d",...} — produced by {...string} in JS.
 */
export function isCharacterIndexedObject(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  if (keys.length < 3) return false;
  // Check if first 3 keys are sequential numeric strings
  return keys.slice(0, 3).every((k, i) => k === String(i));
}

/**
 * Reconstruct a string from a character-indexed object.
 * {"0":"S","1":"o","2":"l","3":"d"} → "Sold"
 */
export function reconstructFromCharIndexed(obj: Record<string, string>): string {
  const keys = Object.keys(obj).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b));
  return keys.map(k => obj[k]).join('');
}

/**
 * Resolve a field value from an object using alias chains.
 * Checks the canonical name first, then each alias in order.
 *
 * @param obj - The source object
 * @param canonicalName - The canonical field name
 * @param aliases - Array of alias names to check
 * @returns The first non-empty value found, or undefined
 */
function resolveField(
  obj: Record<string, unknown>,
  canonicalName: string,
  aliases: string[]
): unknown {
  // Check canonical name first
  const canonical = obj[canonicalName];
  if (canonical !== undefined && canonical !== null && canonical !== '') {
    return canonical;
  }

  // Check aliases
  for (const alias of aliases) {
    const val = obj[alias];
    if (val !== undefined && val !== null && val !== '') {
      return val;
    }
  }

  return undefined;
}

/**
 * Resolve a field value with special handling for numeric zero.
 * Unlike resolveField, this treats 0 as a valid value (not falsy).
 * Used for price fields where $0 is a valid price for grants/exercises.
 */
function resolveFieldZeroSafe(
  obj: Record<string, unknown>,
  canonicalName: string,
  aliases: string[]
): unknown {
  // Check canonical name first — treat 0 as valid, but "" falls through to aliases
  const canonical = obj[canonicalName];
  if (canonical !== undefined && canonical !== null && canonical !== '') {
    return canonical;
  }

  // Check aliases — treat 0 as valid, but "" falls through
  for (const alias of aliases) {
    const val = obj[alias];
    if (val !== undefined && val !== null && val !== '') {
      return val;
    }
  }

  return undefined;
}

/**
 * Log unexpected field names for monitoring AI output drift.
 * Fires when the AI returns field names not in our alias registry.
 */
function auditUnexpectedFields(
  obj: Record<string, unknown>,
  knownFields: Set<string>,
  context: string
): void {
  const unexpected = Object.keys(obj).filter(k => !knownFields.has(k));
  if (unexpected.length > 0) {
    componentLogger.warn('Unexpected field names in AI output', {
      context,
      unexpectedFields: unexpected,
      values: unexpected.reduce((acc, k) => {
        const val = obj[k];
        acc[k] = typeof val === 'string' ? val.substring(0, 50) : typeof val;
        return acc;
      }, {} as Record<string, string>),
    });
  }
}

/**
 * Build a Set of all known field names (canonical + aliases) for audit purposes.
 */
function buildKnownFieldSet(aliases: Record<string, string[]>): Set<string> {
  const known = new Set<string>();
  for (const [canonical, alts] of Object.entries(aliases)) {
    known.add(canonical);
    for (const alt of alts) {
      known.add(alt);
    }
  }
  return known;
}

const KNOWN_TX_FIELDS = buildKnownFieldSet(TRANSACTION_FIELD_ALIASES);
// Add extra fields the AI returns that we intentionally ignore
['table', 'security', 'footnote', 'footnotes', 'ownershipForm', 'ownershipNature', 'nature', 'securityType', 'tableSource'].forEach(f => KNOWN_TX_FIELDS.add(f));

const KNOWN_FORM4_FIELDS = buildKnownFieldSet(FORM4_FIELD_ALIASES);
// Add fields that are always present and don't need aliasing
['company', 'summary', 'filingDate', 'has10b51Plan', 'transactions', 'signalStrength', 'filingType', 'vestingDetails', 'postTransactionCommonShares', '_schemaVersion'].forEach(f => KNOWN_FORM4_FIELDS.add(f));

/**
 * Normalize a single transaction object from AI output.
 *
 * Handles:
 * - Field name aliases (price → pricePerShare, action → type)
 * - Zero-safe price aliasing (price: 0 is valid for grants)
 * - Code → type inference when type is missing
 * - Type → code inference when code is missing
 * - Character-indexed object detection and rejection
 * - Bracket artifact stripping
 *
 * @param raw - Raw transaction object from AI
 * @returns Normalized transaction, or null if unusable
 */
export function normalizeTransaction(raw: unknown): NormalizedTransaction | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const obj = raw as Record<string, unknown>;

  // Detect character-indexed objects from string spread bug
  if (isCharacterIndexedObject(obj)) {
    const reconstructed = reconstructFromCharIndexed(obj as Record<string, string>);
    componentLogger.warn('Detected character-indexed transaction (stale data from string spread bug)', {
      reconstructedText: reconstructed.substring(0, 100),
    });
    return null; // Template will fall back to extractor
  }

  // Resolve fields using alias chains
  let code = resolveField(obj, 'code', TRANSACTION_FIELD_ALIASES.code) as string || '';
  let type = resolveField(obj, 'type', TRANSACTION_FIELD_ALIASES.type) as string || '';
  const shares = resolveFieldZeroSafe(obj, 'shares', TRANSACTION_FIELD_ALIASES.shares);
  const pricePerShare = resolveFieldZeroSafe(obj, 'pricePerShare', TRANSACTION_FIELD_ALIASES.pricePerShare);
  const sharesOwnedFollowing = resolveFieldZeroSafe(obj, 'sharesOwnedFollowing', TRANSACTION_FIELD_ALIASES.sharesOwnedFollowing);
  const acquisitionDisposition = resolveField(obj, 'acquisitionDisposition', TRANSACTION_FIELD_ALIASES.acquisitionDisposition) as string || '';
  const date = resolveField(obj, 'date', TRANSACTION_FIELD_ALIASES.date) as string || '';

  // Strip bracket artifacts from all string fields (AI sometimes includes stray [ or ])
  const stripBrackets = (val: unknown): unknown => {
    if (typeof val === 'string') return val.replace(/[\[\]]/g, '').trim();
    return val;
  };
  if (typeof code === 'string') code = code.replace(/[\[\]]/g, '').trim();
  if (typeof type === 'string') type = type.replace(/[\[\]]/g, '').trim();
  const cleanShares = stripBrackets(shares);
  const cleanPrice = stripBrackets(pricePerShare);
  const cleanOwnership = stripBrackets(sharesOwnedFollowing);

  // Infer code from type when code is missing
  if (!code && type) {
    const typeStr = type.toLowerCase();
    if (typeStr.includes('sale') || typeStr.includes('sell') || typeStr === 's') code = 'S';
    else if (typeStr.includes('purchase') || typeStr.includes('bought') || typeStr === 'p') code = 'P';
    else if (typeStr.includes('award') || typeStr.includes('grant') || typeStr.includes('rsu')) code = 'A';
    else if (typeStr.includes('gift')) code = 'G';
    else if (typeStr.includes('exercise') || typeStr.includes('conversion')) code = 'M';
    else if (typeStr.includes('disposition') || typeStr.includes('withhold')) code = 'D';
    else if (typeStr.includes('transfer') || typeStr.includes('trust')) code = 'J';
  }

  // Infer type from code when type is missing
  if (!type && code) {
    type = TX_CODE_TO_TYPE[code.toUpperCase()] || '';
  }

  // Must have at least code or shares to be useful
  if (!code && !cleanShares) return null;

  // Audit unexpected fields
  auditUnexpectedFields(obj, KNOWN_TX_FIELDS, 'transaction');

  // Extract new optional fields
  const securityType = (obj.securityType as string) || '';
  const ownershipFormVal = (obj.ownershipForm as string) || '';
  const ownershipNature = (obj.ownershipNature as string) || '';

  const result: NormalizedTransaction = {
    code,
    type,
    shares: (cleanShares as string | number) ?? '',
    pricePerShare: (cleanPrice as string | number) ?? '',
  };
  if (cleanOwnership !== undefined) result.sharesOwnedFollowing = cleanOwnership as string | number;
  if (acquisitionDisposition) result.acquisitionDisposition = acquisitionDisposition;
  if (date) result.date = date;
  if (securityType) result.securityType = securityType;
  if (ownershipFormVal) result.ownershipForm = ownershipFormVal;
  if (ownershipNature) result.ownershipNature = ownershipNature;
  return result;
}

/**
 * Derive previousStake from transactions using first-chronological approach.
 *
 * Sort transactions by date (if available), take the FIRST transaction,
 * and derive the position BEFORE that transaction:
 *   - Disposition (S, D, G, F): before = sharesOwnedFollowing + shares
 *   - Acquisition (A, P, J, M): before = sharesOwnedFollowing - shares
 *
 * This is the shared algorithm used by both response-parser and normalizer.
 */
export function derivePreviousStake(transactions: NormalizedTransaction[]): number | null {
  if (transactions.length === 0) return null;

  // Sort by date if available, otherwise preserve array order (filing order)
  const sorted = [...transactions].sort((a, b) => {
    if (a.date && b.date) return a.date.localeCompare(b.date);
    return 0;
  });

  // Find first transaction with valid sharesOwnedFollowing
  for (const tx of sorted) {
    const sof = parseFloat(String(tx.sharesOwnedFollowing || '').replace(/[$,\[\]]/g, ''));
    const shares = parseFloat(String(tx.shares || '').replace(/[$,\[\]]/g, ''));
    if (isNaN(sof) || isNaN(shares) || shares <= 0) continue;

    const code = (tx.code || '').toUpperCase();
    const ad = (tx.acquisitionDisposition || '').toUpperCase();
    const isDisposition = ad === 'D' || code === 'S' || code === 'D' || code === 'G' || code === 'F';
    const before = isDisposition ? sof + shares : sof - shares;

    if (before > 0) {
      componentLogger.debug('Derived previousStake from first-chronological transaction', {
        code, shares, sof, before, date: tx.date,
      });
      return Math.round(before);
    }
    return null;
  }
  return null;
}

/**
 * Normalize top-level Form 4 summary data from AI output.
 *
 * Handles:
 * - Field name aliases (filerRole → relationship mapping)
 * - Transaction array normalization (delegates to normalizeTransaction)
 * - String transaction parsing (AI returns "Sold 3,004 shares..." strings)
 * - newStake/previousStake derivation from transactions
 * - Unexpected field audit logging
 *
 * @param summaryJSON - Raw summaryJSON from database or AI parser
 * @param summaryText - Optional summary text for fallback extraction of missing fields
 * @returns Normalized data with canonical field names
 */
export function normalizeForm4Data(summaryJSON: Record<string, unknown> | null | undefined, summaryText?: string): NormalizedForm4Data | null {
  if (!summaryJSON) return null;

  // Resolve top-level fields
  const filerName = resolveField(summaryJSON, 'filerName', FORM4_FIELD_ALIASES.filerName) as string || '';
  const filerRole = resolveField(summaryJSON, 'filerRole', FORM4_FIELD_ALIASES.filerRole) as string || '';
  const totalValue = resolveField(summaryJSON, 'totalValue', FORM4_FIELD_ALIASES.totalValue) as string || '';
  const percentageChange = resolveField(summaryJSON, 'percentageChange', FORM4_FIELD_ALIASES.percentageChange) as string || '';
  let newStake = resolveField(summaryJSON, 'newStake', FORM4_FIELD_ALIASES.newStake) as string || '';
  let previousStake = resolveField(summaryJSON, 'previousStake', FORM4_FIELD_ALIASES.previousStake) as string || '';

  // Normalize transactions
  const rawTxns = summaryJSON.transactions;
  let transactions: NormalizedTransaction[] = [];

  if (Array.isArray(rawTxns)) {
    transactions = rawTxns
      .map((tx: unknown) => {
        // Handle string transactions (AI sometimes returns prose instead of objects)
        if (typeof tx === 'string') {
          return parseStringTransaction(tx);
        }
        return normalizeTransaction(tx);
      })
      .filter((t): t is NormalizedTransaction => t !== null);
  }

  // Derive newStake using three-tier precedence helper:
  //   1. authoritative postTransactionCommonShares (LLM-extracted Table I Col 5)
  //   2. derived from Common-Stock + Direct transactions with SOF (date-sorted)
  //   3. derived-fallback: any transaction with SOF
  //   4. LLM's legacy newStake string (pass-through — already in `newStake` var)
  //   5. narrative regex over summaryText (last resort)
  // Gate removed: we always recompute so that an LLM-hallucinated top-level
  // newStake (e.g., picked from a derivative RSU row) gets overridden by the
  // correct Common Stock row. See .claude/tasks/form4-holdings-mismatch.md.
  const stakeResult = deriveNewStake({
    transactions,
    postTransactionCommonShares: summaryJSON.postTransactionCommonShares,
    llmNewStake: newStake || undefined,
    summaryText,
  });
  const newStakeSource: NormalizedForm4Data['newStakeSource'] = stakeResult.source;
  if (stakeResult.source !== 'none') {
    // The normalizer contract is a bare formatted number (no " shares" suffix).
    // Parser callers append suffixes themselves; template reads this verbatim.
    newStake = stakeResult.formattedNumber;
  }

  // Detect narrative mismatch for fail-loud dataQuality='degraded' guard.
  // Only run when we have a derived numeric value AND a non-llm-legacy source
  // (LLM-legacy strings are already narrative-derived by the model, so comparing
  // them to the narrative would double-count the same hallucination).
  let hasNarrativeMismatch = false;
  if (
    stakeResult.numericValue !== null &&
    stakeResult.source !== 'llm-legacy' &&
    stakeResult.source !== 'narrative' &&
    summaryText
  ) {
    const mismatch = detectNewStakeNarrativeMismatch(stakeResult.numericValue, summaryText);
    if (mismatch) {
      hasNarrativeMismatch = true;
      componentLogger.warn('form4_newStake_narrative_mismatch', {
        derived: mismatch.derivedNumber,
        narrativeExtracted: mismatch.narrativeNumber,
        diffPct: Number(mismatch.diffPct.toFixed(2)),
        source: stakeResult.source,
      });
    }
  }

  // Derive previousStake using shared first-chronological algorithm
  if (!previousStake && transactions.length > 0 && newStake) {
    const prevNum = derivePreviousStake(transactions);
    if (prevNum !== null) {
      previousStake = formatNumberWithCommas(prevNum);
    }
  }

  // Audit unexpected top-level fields
  auditUnexpectedFields(summaryJSON, KNOWN_FORM4_FIELDS, 'form4-top-level');

  // Extract vestingDetails
  const vestingDetails = (summaryJSON.vestingDetails as string) || undefined;

  return {
    company: (summaryJSON.company as string) || '',
    summary: (summaryJSON.summary as string) || '',
    filerName,
    filerRole,
    filingDate: summaryJSON.filingDate as string,
    totalValue,
    has10b51Plan: summaryJSON.has10b51Plan as boolean | undefined,
    transactions,
    signalStrength: summaryJSON.signalStrength as string,
    percentageChange,
    newStake,
    previousStake,
    vestingDetails: vestingDetails ? vestingDetails.substring(0, 300) : undefined,
    hasNarrativeMismatch,
    newStakeSource,
  };
}

/**
 * Parse a string transaction into a structured object.
 *
 * AI models sometimes return transactions as prose:
 *   "Sold 3,004 shares of Common stock at $184.90 per share on 2026-03-13 (Code: S, Disposition)"
 *   "Sold 80 Common Stock shares at $412.460 (S, D)"
 *
 * This handles both formats.
 */
export function parseStringTransaction(str: string): NormalizedTransaction | null {
  if (!str || typeof str !== 'string') return null;

  // Format 1: "(S, D)" at end — short format from grok
  const shortCodeMatch = str.match(/\(([A-Z]),\s*([AD])\)\s*$/);
  // Format 2: "(Code: S, Disposition)" — verbose format
  const verboseCodeMatch = str.match(/\((?:Code:?\s*)?([A-Z]),\s*(Acquisition|Disposition|A|D)\)\s*$/i);

  const codeMatch = shortCodeMatch || verboseCodeMatch;
  const code = codeMatch?.[1] || '';
  let acquisitionDisposition = '';
  if (codeMatch) {
    const adRaw = codeMatch[2];
    acquisitionDisposition = adRaw.length === 1 ? adRaw.toUpperCase() :
      adRaw.toLowerCase().startsWith('a') ? 'A' : 'D';
  }

  const type = code ? (TX_CODE_TO_TYPE[code] || 'Other') : '';

  // Extract share count
  const sharesMatch = str.match(/([\d,]+(?:\.\d+)?)\s+(?:Common\s+Stock\s+)?(?:shares?|Non-Qualified|RSU|Stock\s+Unit)/i);
  const shares = sharesMatch?.[1] || '';

  // Extract price
  const priceMatch = str.match(/at\s+\$([\d,.]+)/i) || str.match(/\$([\d,.]+)/);
  const pricePerShare = priceMatch ? `$${priceMatch[1]}` : '';

  // Must have at least code or shares
  if (!code && !shares) return null;

  return { code, type, shares, pricePerShare, acquisitionDisposition };
}

/**
 * Normalize a filer name from SEC format to natural order.
 *
 * SEC stores names as "LAST FIRST MIDDLE" or "Last First".
 * This converts to "First Last" with proper Title Case.
 *
 * Examples:
 *   "MOYNIHAN BRIAN T" → "Brian T. Moynihan"
 *   "Newstead Jennifer" → "Jennifer Newstead"
 *   "Puri Ajay K" → "Ajay K. Puri"
 *   "Jennifer Newstead" → "Jennifer Newstead" (already natural)
 *   "BANK OF AMERICA CORP /DE/" → "Bank of America Corp /DE/" (entity, not person)
 */
export function normalizePersonName(name: string): string {
  if (!name || typeof name !== 'string') return name || '';

  const trimmed = name.trim();
  if (!trimmed) return '';

  // Detect entity names (contain /, Corp, Inc, LLC, etc.)
  if (/[\/]|Corp|Inc|LLC|Ltd|Holdings|Partners/i.test(trimmed)) {
    return titleCase(trimmed);
  }

  // Split into parts
  const parts = trimmed.split(/\s+/);
  if (parts.length < 2) return titleCase(trimmed);

  // Heuristic: ALL UPPERCASE = definitely SEC format (LAST FIRST MIDDLE)
  const allUpper = parts.every(p => p === p.toUpperCase() && /^[A-Z]/.test(p));

  // Mixed case heuristic: "Newstead Jennifer" is SEC format (Last First)
  // "Jennifer Newstead" is already natural order — DON'T flip
  // Detection: if the FIRST part looks like a surname (capitalized, >1 char)
  // and the SECOND part also looks like a name, check if the comma convention
  // or the SEC "last-name-first" pattern applies.
  // Best heuristic: SEC ALWAYS puts last name first. If name is mixed case,
  // we only flip if the first word is NOT a plausible first name.
  // Since we can't reliably distinguish, only flip ALL CAPS names.
  if (!allUpper) {
    // Mixed case — assume already in natural order, just title-case
    return titleCase(trimmed);
  }

  // ALL CAPS SEC format: LAST FIRST [MIDDLE] [SUFFIX]
  const suffixes = ['JR', 'JR.', 'SR', 'SR.', 'II', 'III', 'IV', 'V'];
  const remainingParts = [...parts];

  // Extract suffix if present at end (with correct precedence)
  let suffix = '';
  if (remainingParts.length > 2) {
    const lastPart = remainingParts[remainingParts.length - 1].toUpperCase();
    const lastPartNoDot = lastPart.replace(/\./g, '');
    if (suffixes.includes(lastPart) || suffixes.includes(lastPartNoDot)) {
      suffix = remainingParts.pop()!;
    }
  }

  // First part is last name, rest are given names
  const lastName = remainingParts.shift()!;
  const givenNames = remainingParts;

  if (givenNames.length === 0) {
    return titleCase(trimmed);
  }

  // Format middle initials with periods
  const formattedGiven = givenNames.map(n => {
    if (n.length === 1) return `${n.toUpperCase()}.`;
    return titleCase(n);
  });

  const result = [...formattedGiven, titleCase(lastName)];
  if (suffix) result.push(titleCase(suffix));
  return result.join(' ');
}

/**
 * Format a number with US-style commas. Locale-independent.
 * 14788 → "14,788"
 */
export function formatNumberWithCommas(num: number): string {
  return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Convert a string to Title Case.
 * "BRIAN" → "Brian", "moynihan" → "Moynihan"
 */
function titleCase(str: string): string {
  return str.replace(/\w\S*/g, (word) => {
    // Preserve common abbreviations
    if (['LLC', 'LP', 'CEO', 'CFO', 'COO', 'SVP', 'EVP', 'VP', 'GC', 'CTO', 'CMO'].includes(word.toUpperCase())) {
      return word.toUpperCase();
    }
    // Preserve /DE/ style designators
    if (word.startsWith('/') && word.endsWith('/')) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

/**
 * Truncate a string to maxLen characters with ellipsis.
 */
export function truncateWithEllipsis(str: string, maxLen: number): string {
  if (!str || str.length <= maxLen) return str || '';
  return str.substring(0, maxLen - 1) + '\u2026';
}
