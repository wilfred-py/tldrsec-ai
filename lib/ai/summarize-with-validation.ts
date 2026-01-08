/**
 * Validated Summary Generation
 *
 * Wraps the core summarizeFiling function to add extractor validation.
 * Extractors run after AI generation to validate and enrich output.
 *
 * This module provides:
 * 1. Post-generation validation using extractors
 * 2. Gap-filling for sparse AI output
 * 3. Discrepancy logging for monitoring AI quality
 *
 * @module summarize-with-validation
 */

import { summarizeFiling, SummarizationOptions, SummarizationResult } from './summarize';
import { getExtractor } from '../email/extractor-registry';
import { mergeWithFallback, logDataDiscrepancies, calculateFillRate } from '../email/extractor-merge-utils';
import { logger } from '../logging';
import { monitoring } from '../monitoring';

const componentLogger = logger.child('summarize-with-validation');

/**
 * Extended summarization result with validation metadata
 */
export interface ValidatedSummarizationResult extends SummarizationResult {
  /** Whether extractor validation was applied */
  extractorValidated: boolean;
  /** Fields that were filled by the extractor */
  fieldsFilledByExtractor?: string[];
  /** Fields that had discrepancies between AI and extractor */
  fieldsWithDiscrepancies?: string[];
  /** Percentage of fields filled by extractor (0-100) */
  extractorFillRate?: number;
}

/**
 * Options for validated summarization
 */
export interface ValidatedSummarizationOptions extends SummarizationOptions {
  /** Skip extractor validation (default: false) */
  skipValidation?: boolean;
  /** Form type for extractor lookup (if not in metadata) */
  formType?: string;
}

/**
 * Summarize an SEC filing with post-generation extractor validation
 *
 * This function:
 * 1. Calls the core summarizeFiling to get AI-generated summary
 * 2. Runs the appropriate extractor on the summaryText
 * 3. Merges AI data with extracted data (AI wins conflicts)
 * 4. Logs discrepancies for monitoring
 * 5. Returns enriched result with validation metadata
 *
 * @param content - The SEC filing content to summarize
 * @param options - Summarization options including metadata
 * @returns Validated summarization result with enriched summaryJSON
 *
 * @example
 * ```typescript
 * const result = await summarizeFilingWithValidation(filingContent, {
 *   filingId: 'abc123',
 *   metadata: {
 *     formType: '10-K',
 *     companyName: 'NVIDIA Corporation',
 *     ticker: 'NVDA',
 *   },
 * });
 *
 * if (result.fieldsFilledByExtractor?.length) {
 *   console.log('Extractor filled:', result.fieldsFilledByExtractor);
 * }
 * ```
 */
export async function summarizeFilingWithValidation(
  content: string,
  options: ValidatedSummarizationOptions
): Promise<ValidatedSummarizationResult> {
  const { skipValidation = false, formType, ...baseOptions } = options;

  // Get form type from options or metadata
  const effectiveFormType = formType || options.metadata?.formType;

  // Call core summarization
  const aiResult = await summarizeFiling(content, baseOptions);

  // If validation is skipped or no form type, return as-is
  if (skipValidation || !effectiveFormType) {
    return {
      ...aiResult,
      extractorValidated: false,
    };
  }

  // Get appropriate extractor
  const extractor = getExtractor(effectiveFormType);

  // If no extractor available for this form type, return as-is
  if (!extractor) {
    componentLogger.debug('No extractor available for form type', {
      formType: effectiveFormType,
    });
    return {
      ...aiResult,
      extractorValidated: false,
    };
  }

  // If no summary text, can't extract
  if (!aiResult.summaryText) {
    componentLogger.warn('No summaryText available for extraction', {
      formType: effectiveFormType,
    });
    return {
      ...aiResult,
      extractorValidated: false,
    };
  }

  try {
    // Extract structured data from summaryText
    const extractedData = extractor(aiResult.summaryText) as Record<string, unknown>;

    // Merge AI data with extracted data
    const mergeResult = mergeWithFallback(
      aiResult.summaryJSON as Record<string, unknown> | null,
      extractedData
    );

    // Log discrepancies for monitoring
    logDataDiscrepancies(
      effectiveFormType,
      aiResult.summaryJSON as Record<string, unknown> | null,
      extractedData
    );

    // Calculate fill rate for monitoring
    const fillRate = calculateFillRate(mergeResult);

    // Record metrics
    monitoring.incrementCounter(`ai.extractor_validation.${effectiveFormType}`, 1);
    if (mergeResult.fieldsFilledByExtractor.length > 0) {
      monitoring.incrementCounter(`ai.extractor_gap_fill.${effectiveFormType}`, 1);
      monitoring.recordMetric('ai.extractor_fill_rate', fillRate);
    }
    if (mergeResult.fieldsWithDiscrepancies.length > 0) {
      monitoring.incrementCounter(`ai.extractor_discrepancies.${effectiveFormType}`, 1);
    }

    componentLogger.info('Extractor validation complete', {
      formType: effectiveFormType,
      fieldsFilledByExtractor: mergeResult.fieldsFilledByExtractor,
      fieldsWithDiscrepancies: mergeResult.fieldsWithDiscrepancies,
      fillRate,
    });

    return {
      ...aiResult,
      summaryJSON: mergeResult.data,
      extractorValidated: true,
      fieldsFilledByExtractor: mergeResult.fieldsFilledByExtractor,
      fieldsWithDiscrepancies: mergeResult.fieldsWithDiscrepancies,
      extractorFillRate: fillRate,
    };
  } catch (error) {
    // Don't let extractor errors fail the summarization
    componentLogger.error('Extractor validation failed', {
      formType: effectiveFormType,
      error: error instanceof Error ? error.message : String(error),
    });
    monitoring.incrementCounter(`ai.extractor_error.${effectiveFormType}`, 1);

    return {
      ...aiResult,
      extractorValidated: false,
    };
  }
}

/**
 * Check if a form type supports extractor validation
 *
 * @param formType - The SEC form type to check
 * @returns true if validation is available for this form type
 */
export function supportsExtractorValidation(formType: string): boolean {
  return getExtractor(formType) !== null;
}
