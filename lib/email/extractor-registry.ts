/**
 * Extractor Registry
 *
 * Central registry mapping form types to their data extractors.
 * Extractors parse AI-generated summaryText to produce structured data
 * that can fill gaps in summaryJSON.
 *
 * Usage:
 * ```typescript
 * const extractor = getExtractor('10-K');
 * if (extractor) {
 *   const structuredData = extractor(summaryText);
 * }
 * ```
 *
 * @module extractor-registry
 */

import { extract8KData, Form8KExtractedData } from './8k-data-extractor';
import { extractForm4Data, Form4ExtractedData } from './form4-data-extractor';
import { extractForm144Data, Form144ExtractedData } from './form144-data-extractor';
import { extract10KData, Form10KExtractedData } from './10k-data-extractor';
import { extract10QData, Form10QExtractedData } from './10q-data-extractor';
import { extractS1Data, FormS1ExtractedData } from './s1-data-extractor';
import { extractS3Data, FormS3ExtractedData } from './s3-data-extractor';
import { extractDEF14AData, FormDEF14AExtractedData } from './def14a-data-extractor';
import { extractForm11KData, Form11KExtractedData } from './form11k-data-extractor';

/**
 * Union type of all extracted data types
 */
export type ExtractedData =
  | Form10KExtractedData
  | Form10QExtractedData
  | Form8KExtractedData
  | Form4ExtractedData
  | Form144ExtractedData
  | FormS1ExtractedData
  | FormS3ExtractedData
  | FormDEF14AExtractedData
  | Form11KExtractedData;

/**
 * Type for extractor functions
 */
export type ExtractorFunction = (summaryText: string) => ExtractedData;

/**
 * Registry mapping form types to their extractors
 *
 * Supported form types:
 * - 10-K: Annual Report (extract10KData)
 * - 10-Q: Quarterly Report (extract10QData)
 * - 8-K: Current Report (extract8KData)
 * - 4 / Form 4: Insider Transaction (extractForm4Data)
 * - 144 / Form 144: Notice of Proposed Sale (extractForm144Data)
 * - S-1: IPO Registration Statement (extractS1Data)
 * - S-3: Secondary Offering Registration (extractS3Data)
 * - DEF 14A: Proxy Statement (extractDEF14AData)
 * - 11-K: Employee Stock Plan Annual Report (extract11KData)
 */
export const EXTRACTOR_REGISTRY: Record<string, ExtractorFunction> = {
  // Annual and Quarterly Reports
  '10-K': extract10KData,
  '10-Q': extract10QData,

  // Current Report
  '8-K': extract8KData,

  // Insider Transactions - multiple aliases for flexibility
  '4': extractForm4Data,
  'Form 4': extractForm4Data,

  // Notice of Proposed Sale - multiple aliases for flexibility
  '144': extractForm144Data,
  'Form 144': extractForm144Data,

  // Registration Statements
  'S-1': extractS1Data,
  'S-3': extractS3Data,

  // Proxy Statement - multiple aliases for flexibility
  'DEF 14A': extractDEF14AData,
  'DEF14A': extractDEF14AData,

  // Employee Stock Plan - multiple aliases for flexibility
  '11-K': extractForm11KData,
  '11K': extractForm11KData,
};

/**
 * Get the appropriate extractor for a form type
 *
 * @param formType - The SEC form type (e.g., '10-K', '8-K', 'Form 4')
 * @returns The extractor function or null if not supported
 *
 * @example
 * ```typescript
 * const extractor = getExtractor('10-K');
 * if (extractor) {
 *   const data = extractor(summaryText);
 *   console.log(data.financialHighlights);
 * }
 * ```
 */
export function getExtractor(formType: string): ExtractorFunction | null {
  if (!formType) {
    return null;
  }

  return EXTRACTOR_REGISTRY[formType] || null;
}

/**
 * Check if a form type has a registered extractor
 *
 * @param formType - The SEC form type to check
 * @returns true if an extractor exists for this form type
 */
export function hasExtractor(formType: string): boolean {
  return !!formType && formType in EXTRACTOR_REGISTRY;
}

/**
 * Get all supported form types with extractors
 *
 * @returns Array of form type strings
 */
export function getSupportedFormTypes(): string[] {
  return Object.keys(EXTRACTOR_REGISTRY);
}
