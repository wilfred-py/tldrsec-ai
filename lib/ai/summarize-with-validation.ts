import { summarizeFiling, SummarizationOptions, SummarizationResult } from './summarize';
import { extract8KData } from '../email/8k-data-extractor';
import { extractForm4Data } from '../email/form4-data-extractor';
import { extractForm144Data } from '../email/form144-data-extractor';
import { extract10KData } from '../email/10k-data-extractor';
import { extract10QData } from '../email/10q-data-extractor';
import { extractS1Data } from '../email/s1-data-extractor';
import { extractS3Data } from '../email/s3-data-extractor';
import { extractDEF14AData } from '../email/def14a-data-extractor';
import { extractForm11KData } from '../email/form11k-data-extractor';
import { extractSC13GData } from '../email/sc13g-data-extractor';
import { extractSC13DData } from '../email/sc13d-data-extractor';
import { extract424B2Data } from '../email/424b2-data-extractor';
import { logger } from '../logging';
import { monitoring } from '../monitoring';

const componentLogger = logger.child('summarize-with-validation');

// ---------------------------------------------------------------------------
// Private implementation: extractor dispatch
// ---------------------------------------------------------------------------

type ExtractorFunction = (summaryText: string) => Record<string, unknown>;

const EXTRACTOR_REGISTRY: Record<string, ExtractorFunction> = {
  '10-K': extract10KData as ExtractorFunction,
  '10-Q': extract10QData as ExtractorFunction,
  '8-K': extract8KData as ExtractorFunction,
  '4': extractForm4Data as ExtractorFunction,
  'Form 4': extractForm4Data as ExtractorFunction,
  '144': extractForm144Data as ExtractorFunction,
  'Form 144': extractForm144Data as ExtractorFunction,
  'S-1': extractS1Data as ExtractorFunction,
  'S-3': extractS3Data as ExtractorFunction,
  'DEF 14A': extractDEF14AData as ExtractorFunction,
  'DEF14A': extractDEF14AData as ExtractorFunction,
  '11-K': extractForm11KData as ExtractorFunction,
  '11K': extractForm11KData as ExtractorFunction,
  'SC 13G': extractSC13GData as ExtractorFunction,
  'SC13G': extractSC13GData as ExtractorFunction,
  'SC 13D': extractSC13DData as ExtractorFunction,
  'SC13D': extractSC13DData as ExtractorFunction,
  '424B2': extract424B2Data as ExtractorFunction,
};

function getExtractor(formType: string): ExtractorFunction | null {
  if (!formType) return null;
  return EXTRACTOR_REGISTRY[formType] ?? null;
}

// ---------------------------------------------------------------------------
// Private implementation: merge + discrepancy logging
// ---------------------------------------------------------------------------

interface MergeResult {
  data: Record<string, unknown>;
  fieldsFilledByExtractor: string[];
  fieldsWithDiscrepancies: string[];
}

function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function hasDifference(aiValue: unknown, extractedValue: unknown): boolean {
  if (isEmpty(aiValue) || isEmpty(extractedValue)) return false;
  if (Array.isArray(aiValue) && Array.isArray(extractedValue)) {
    return Math.abs(aiValue.length - extractedValue.length) > 1;
  }
  if (typeof aiValue === 'string' && typeof extractedValue === 'string') {
    return aiValue.toLowerCase().trim() !== extractedValue.toLowerCase().trim();
  }
  return false;
}

function mergeWithFallback(
  aiData: Record<string, unknown> | null | undefined,
  extractedData: Record<string, unknown>
): MergeResult {
  if (!aiData) {
    return {
      data: { ...extractedData },
      fieldsFilledByExtractor: Object.keys(extractedData),
      fieldsWithDiscrepancies: [],
    };
  }

  const mergedData: Record<string, unknown> = { ...aiData };
  const fieldsFilledByExtractor: string[] = [];
  const fieldsWithDiscrepancies: string[] = [];

  for (const [key, extractedValue] of Object.entries(extractedData)) {
    const aiValue = aiData[key];
    if (!isEmpty(aiValue) && !isEmpty(extractedValue) && hasDifference(aiValue, extractedValue)) {
      fieldsWithDiscrepancies.push(key);
    }
    if (isEmpty(aiValue) && !isEmpty(extractedValue)) {
      mergedData[key] = extractedValue;
      fieldsFilledByExtractor.push(key);
    }
  }

  return { data: mergedData, fieldsFilledByExtractor, fieldsWithDiscrepancies };
}

function summarizeValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') {
    return value.length > 50 ? `"${value.substring(0, 47)}..."` : `"${value}"`;
  }
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === 'object') return `Object(${Object.keys(value as object).length} keys)`;
  return String(value);
}

function logDataDiscrepancies(
  formType: string,
  aiData: Record<string, unknown> | null | undefined,
  extractedData: Record<string, unknown> | null | undefined
): void {
  if (!aiData || !extractedData) return;
  try {
    const discrepancies: Array<{ field: string; aiValue: unknown; extractedValue: unknown }> = [];
    for (const [key, extractedValue] of Object.entries(extractedData)) {
      const aiValue = aiData[key];
      if (!isEmpty(aiValue) && !isEmpty(extractedValue) && hasDifference(aiValue, extractedValue)) {
        discrepancies.push({ field: key, aiValue, extractedValue });
      }
    }
    if (discrepancies.length > 0) {
      componentLogger.info('Data discrepancies detected between AI and extractor', {
        formType,
        discrepancyCount: discrepancies.length,
        fields: discrepancies.map(d => d.field),
      });
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
    componentLogger.warn('Error logging discrepancies', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function calculateFillRate(mergeResult: MergeResult): number {
  const totalFields = Object.keys(mergeResult.data).length;
  if (totalFields === 0) return 0;
  return Math.round((mergeResult.fieldsFilledByExtractor.length / totalFields) * 100);
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface ValidatedSummarizationResult extends SummarizationResult {
  extractorValidated: boolean;
  fieldsFilledByExtractor?: string[];
  fieldsWithDiscrepancies?: string[];
  extractorFillRate?: number;
}

export interface ValidatedSummarizationOptions extends SummarizationOptions {
  skipValidation?: boolean;
  formType?: string;
}

export async function summarizeFilingWithValidation(
  content: string,
  options: ValidatedSummarizationOptions
): Promise<ValidatedSummarizationResult> {
  const { skipValidation = false, formType, ...baseOptions } = options;
  const effectiveFormType = formType ?? options.metadata?.formType;

  const aiResult = await summarizeFiling(content, baseOptions);

  if (skipValidation || !effectiveFormType) {
    return { ...aiResult, extractorValidated: false };
  }

  const extractor = getExtractor(effectiveFormType);
  if (!extractor) {
    componentLogger.debug('No extractor available for form type', { formType: effectiveFormType });
    return { ...aiResult, extractorValidated: false };
  }

  if (!aiResult.summaryText) {
    componentLogger.warn('No summaryText available for extraction', { formType: effectiveFormType });
    return { ...aiResult, extractorValidated: false };
  }

  try {
    const extractedData = extractor(aiResult.summaryText);
    const mergeResult = mergeWithFallback(
      aiResult.summaryJSON as Record<string, unknown> | null,
      extractedData
    );
    logDataDiscrepancies(
      effectiveFormType,
      aiResult.summaryJSON as Record<string, unknown> | null,
      extractedData
    );
    const fillRate = calculateFillRate(mergeResult);

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
    componentLogger.error('Extractor validation failed', {
      formType: effectiveFormType,
      error: error instanceof Error ? error.message : String(error),
    });
    monitoring.incrementCounter(`ai.extractor_error.${effectiveFormType}`, 1);
    return { ...aiResult, extractorValidated: false };
  }
}

export function supportsExtractorValidation(formType: string): boolean {
  return getExtractor(formType) !== null;
}
