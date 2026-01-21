/**
 * Extractor Merge Utilities
 *
 * Utilities for merging AI-generated data with extractor-parsed data.
 * AI data takes precedence; extractors fill gaps when AI output is sparse.
 *
 * @module extractor-merge-utils
 */

import { logger } from '../logging';

const componentLogger = logger.child('extractor-merge');

/**
 * Result of merging AI data with extracted data
 */
export interface MergeResult {
  /** The merged data object */
  data: Record<string, unknown>;
  /** Fields that were filled by the extractor (not present in AI data) */
  fieldsFilledByExtractor: string[];
  /** Fields that had discrepancies between AI and extractor */
  fieldsWithDiscrepancies: string[];
}

/**
 * Check if a value is considered "empty" for merge purposes
 *
 * Empty values:
 * - undefined / null
 * - empty string (after trim)
 * - empty array
 *
 * @param value - The value to check
 * @returns true if the value is considered empty
 */
function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }

  if (typeof value === 'string') {
    return value.trim() === '';
  }

  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return false;
}

/**
 * Check if two values are structurally different
 *
 * Used for logging discrepancies between AI and extractor data.
 *
 * @param aiValue - Value from AI output
 * @param extractedValue - Value from extractor
 * @returns true if values are meaningfully different
 */
function hasDifference(aiValue: unknown, extractedValue: unknown): boolean {
  if (isEmpty(aiValue) || isEmpty(extractedValue)) {
    return false; // Can't compare if one is empty
  }

  // For arrays, compare lengths as a simple heuristic
  if (Array.isArray(aiValue) && Array.isArray(extractedValue)) {
    // Significant difference if array lengths differ by more than 1
    return Math.abs(aiValue.length - extractedValue.length) > 1;
  }

  // For strings, check if they're substantially different
  if (typeof aiValue === 'string' && typeof extractedValue === 'string') {
    // Normalize and compare
    const normalizedAi = aiValue.toLowerCase().trim();
    const normalizedExtracted = extractedValue.toLowerCase().trim();
    return normalizedAi !== normalizedExtracted;
  }

  return false;
}

/**
 * Merge AI-generated data with extractor-parsed data
 *
 * Strategy:
 * 1. Start with AI data as base (AI wins conflicts)
 * 2. Fill any empty fields with extractor data
 * 3. Track which fields were filled by extractor for monitoring
 *
 * @param aiData - Data from AI response (takes precedence)
 * @param extractedData - Data parsed by extractor
 * @returns Merged result with metadata about which fields were filled
 *
 * @example
 * ```typescript
 * const aiData = { company: 'NVIDIA', summary: 'Summary text' };
 * const extractedData = { financialHighlights: [...], segments: [...] };
 *
 * const result = mergeWithFallback(aiData, extractedData);
 * // result.data has all fields
 * // result.fieldsFilledByExtractor = ['financialHighlights', 'segments']
 * ```
 */
export function mergeWithFallback(
  aiData: Record<string, unknown> | null | undefined,
  extractedData: Record<string, unknown>
): MergeResult {
  const fieldsFilledByExtractor: string[] = [];
  const fieldsWithDiscrepancies: string[] = [];

  // Handle null/undefined AI data
  if (!aiData) {
    return {
      data: { ...extractedData },
      fieldsFilledByExtractor: Object.keys(extractedData),
      fieldsWithDiscrepancies: [],
    };
  }

  // Start with AI data as the base
  const mergedData: Record<string, unknown> = { ...aiData };

  // Fill in gaps from extracted data
  for (const [key, extractedValue] of Object.entries(extractedData)) {
    const aiValue = aiData[key];

    // Check for discrepancies (for monitoring)
    if (!isEmpty(aiValue) && !isEmpty(extractedValue) && hasDifference(aiValue, extractedValue)) {
      fieldsWithDiscrepancies.push(key);
    }

    // Only fill if AI value is empty
    if (isEmpty(aiValue) && !isEmpty(extractedValue)) {
      mergedData[key] = extractedValue;
      fieldsFilledByExtractor.push(key);
    }
  }

  return {
    data: mergedData,
    fieldsFilledByExtractor,
    fieldsWithDiscrepancies,
  };
}

/**
 * Log discrepancies between AI and extractor data for monitoring
 *
 * This helps track AI quality over time and identify patterns where
 * AI output differs from extractable structured data.
 *
 * @param formType - The SEC form type being processed
 * @param aiData - Data from AI response
 * @param extractedData - Data parsed by extractor
 */
export function logDataDiscrepancies(
  formType: string,
  aiData: Record<string, unknown> | null | undefined,
  extractedData: Record<string, unknown> | null | undefined
): void {
  // Guard against null/undefined
  if (!aiData || !extractedData) {
    return;
  }

  try {
    const discrepancies: Array<{
      field: string;
      aiValue: unknown;
      extractedValue: unknown;
    }> = [];

    for (const [key, extractedValue] of Object.entries(extractedData)) {
      const aiValue = aiData[key];

      if (!isEmpty(aiValue) && !isEmpty(extractedValue)) {
        if (hasDifference(aiValue, extractedValue)) {
          discrepancies.push({ field: key, aiValue, extractedValue });
        }
      }
    }

    if (discrepancies.length > 0) {
      componentLogger.info('Data discrepancies detected between AI and extractor', {
        formType,
        discrepancyCount: discrepancies.length,
        fields: discrepancies.map(d => d.field),
      });

      // Log details at debug level
      componentLogger.debug('Discrepancy details', {
        formType,
        discrepancies: discrepancies.map(d => ({
          field: d.field,
          aiSummary: summarizeValue(d.aiValue),
          extractedSummary: summarizeValue(d.extractedValue),
        })),
      });
    }
  } catch (error) {
    // Don't let logging failures affect the main flow
    componentLogger.warn('Error logging discrepancies', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Create a summary of a value for logging (avoid logging huge objects)
 */
function summarizeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'string') {
    return value.length > 50 ? `"${value.substring(0, 47)}..."` : `"${value}"`;
  }

  if (Array.isArray(value)) {
    return `Array(${value.length})`;
  }

  if (typeof value === 'object') {
    return `Object(${Object.keys(value).length} keys)`;
  }

  return String(value);
}

/**
 * Calculate the extractor fill rate for monitoring
 *
 * @param mergeResult - The result from mergeWithFallback
 * @returns Percentage of fields filled by extractor (0-100)
 */
export function calculateFillRate(mergeResult: MergeResult): number {
  const totalFields = Object.keys(mergeResult.data).length;
  if (totalFields === 0) {
    return 0;
  }

  return Math.round((mergeResult.fieldsFilledByExtractor.length / totalFields) * 100);
}
