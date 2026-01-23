/**
 * Filing Type Preferences Mapper
 *
 * Maps SEC filing types to ticker preference keys and checks if a filing
 * should be processed based on user preferences.
 */

import { FilingPreferences } from '../api/types';

/**
 * Map of SEC filing types to their corresponding preference keys
 */
const FILING_TYPE_TO_PREFERENCE_KEY: Record<string, keyof FilingPreferences> = {
  // Annual Reports
  '10-K': 'tenK',
  '10K': 'tenK',
  '20-F': 'twentyF',
  '20F': 'twentyF',
  '40-F': 'fortyF',
  '40F': 'fortyF',

  // Quarterly Reports
  '10-Q': 'tenQ',
  '10Q': 'tenQ',
  '6-K': 'sixK',
  '6K': 'sixK',

  // Current Reports
  '8-K': 'eightK',
  '8K': 'eightK',

  // Insider Trading
  '3': 'form3',
  'FORM 3': 'form3',
  '4': 'form4',
  'FORM 4': 'form4',
  '5': 'form5',
  'FORM 5': 'form5',
  '144': 'form144',
  'FORM 144': 'form144',

  // Beneficial Ownership
  'SC 13D': 'sc13D',
  'SC13D': 'sc13D',
  'SC 13G': 'sc13G',
  'SC13G': 'sc13G',
  '13F-HR': 'thirteenF',
  '13F': 'thirteenF',

  // Proxy Materials
  'DEF 14A': 'def14A',
  'DEF14A': 'def14A',
  'DEFA14A': 'def14A',
  'PRE 14A': 'pre14A',
  'PRE14A': 'pre14A',
  'PREA14A': 'pre14A',

  // Registration
  'S-1': 'sOne',
  'S1': 'sOne',
  'S-3': 'sThree',
  'S3': 'sThree',

  // Prospectus Filings (Structured Products, Offerings)
  '424B2': 'fourTwoFourB2',
  '424B3': 'fourTwoFourB3',
  'FWP': 'fwp',
  'SCHEDULE': 'schedule',
  'SCHEDULE 13D': 'schedule',
  'SCHEDULE 13G': 'schedule',
  'SCHEDULE 14A': 'schedule',
};

/**
 * Normalize filing type string for consistent matching
 * Handles variations like "10-K", "10K", "FORM 4", etc.
 */
function normalizeFilingType(filingType: string): string {
  return filingType.toUpperCase().trim();
}

/**
 * Check if a filing should be processed based on user's ticker preferences
 *
 * @param filingType - The SEC filing type (e.g., "10-K", "424B2", "FORM 4")
 * @param preferences - User's filing preferences for this ticker
 * @returns true if the filing should be processed, false otherwise
 */
export function shouldProcessFiling(
  filingType: string,
  preferences: FilingPreferences | null | undefined
): boolean {
  // If no preferences are set, default to processing only core filings
  if (!preferences) {
    const defaultTypes = ['10-K', '10Q', '10-Q', '8-K', '8K', 'tenK', 'tenQ', 'eightK'];
    return defaultTypes.includes(normalizeFilingType(filingType));
  }

  const normalizedType = normalizeFilingType(filingType);
  const prefKey = FILING_TYPE_TO_PREFERENCE_KEY[normalizedType];

  // If we have a specific preference for this filing type, use it
  if (prefKey && prefKey in preferences) {
    return preferences[prefKey] === true;
  }

  // If it's an unknown filing type, check the "other" preference
  // Default to false (don't process) if "other" is not explicitly enabled
  return preferences.other === true;
}

/**
 * Get the preference key for a given filing type
 *
 * @param filingType - The SEC filing type
 * @returns The preference key, or 'other' if not found
 */
export function getPreferenceKeyForFilingType(
  filingType: string
): keyof FilingPreferences {
  const normalizedType = normalizeFilingType(filingType);
  return FILING_TYPE_TO_PREFERENCE_KEY[normalizedType] || 'other';
}

/**
 * Get all filing types that map to a specific preference key
 *
 * @param prefKey - The preference key
 * @returns Array of filing type strings
 */
export function getFilingTypesForPreferenceKey(
  prefKey: keyof FilingPreferences
): string[] {
  return Object.entries(FILING_TYPE_TO_PREFERENCE_KEY)
    .filter(([_, key]) => key === prefKey)
    .map(([filingType, _]) => filingType);
}
