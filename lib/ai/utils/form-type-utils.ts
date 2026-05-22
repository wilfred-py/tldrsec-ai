/**
 * Centralized form type normalization utility.
 *
 * SEC filing types appear in many string variants across the codebase:
 * - 'Form4' vs '4' vs 'Form 4' vs 'form4'
 * - 'SCHEDULE 13G' vs 'SC 13G' vs '13G'
 * - '10-K/A' (amendment) vs '10-K' (parent)
 *
 * This utility normalizes all variants to canonical form type strings
 * that match the keys in FORM_SCHEMAS.
 */

/**
 * Maps non-canonical form type strings to their canonical equivalents.
 * Canonical types are the keys used in FORM_SCHEMAS (unified-prompts.ts).
 */
const FORM_TYPE_ALIASES: Record<string, string> = {
  // Amendments -> parent type (isAmendment flag tracks the /A suffix separately)
  '10-K/A': '10-K',
  '10-Q/A': '10-Q',
  '8-K/A': '8-K',
  '4/A': '4',
  'SC 13G/A': 'SC 13G',
  'SC 13D/A': 'SC 13D',

  // Schedule 13G/D alternate names
  // DB stores some as just "SCHEDULE" (truncated from "SCHEDULE 13G/A")
  'SCHEDULE 13G': 'SC 13G',
  'SCHEDULE 13D': 'SC 13D',
  'SCHEDULE': 'SC 13G',
  '13G': 'SC 13G',
  '13D': 'SC 13D',

  // DEF 14A variants (DB sometimes stores as just "DEF")
  'DEF': 'DEF 14A',

  // Form 4 variants (canonical is '4')
  'Form4': '4',
  'Form 4': '4',
  'form4': '4',

  // Form 3 variants (canonical is '3')
  'Form 3': '3',
  'Form3': '3',
  'form3': '3',

  // Form 144 variants (canonical is '144')
  'Form 144': '144',
  'Form144': '144',
  'form144': '144',
};

export interface CanonicalFormType {
  /** The canonical form type string (e.g., '10-K', '4', 'SC 13G') */
  type: string;
  /** Whether the original type was an amendment (ended with '/A') */
  isAmendment: boolean;
}

/**
 * Normalizes a raw form type string to its canonical form.
 *
 * @param raw - The raw form type string from the database or SEC
 * @returns Object with canonical type and amendment flag
 *
 * @example
 * canonicalizeFormType('10-K/A')     // { type: '10-K', isAmendment: true }
 * canonicalizeFormType('Form4')      // { type: '4', isAmendment: false }
 * canonicalizeFormType('SCHEDULE 13G') // { type: 'SC 13G', isAmendment: false }
 * canonicalizeFormType('10-K')       // { type: '10-K', isAmendment: false }
 */
export function canonicalizeFormType(raw: string): CanonicalFormType {
  const isAmendment = raw.endsWith('/A');
  // Strip /A suffix before alias lookup so 'Form 4/A', 'SCHEDULE 13D/A' etc. resolve correctly
  const stripped = isAmendment ? raw.slice(0, -2) : raw;
  const canonical = FORM_TYPE_ALIASES[stripped] ?? FORM_TYPE_ALIASES[raw] ?? stripped;
  return { type: canonical, isAmendment };
}
