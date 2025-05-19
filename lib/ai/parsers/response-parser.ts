/**
 * Response Parser for Claude API Responses
 * 
 * Provides a unified interface for extracting, validating, and
 * normalizing JSON data from Claude API responses.
 */

import { 
  ExtractedJSON, 
  ExtractionOptions, 
  ParserMetrics, 
  ValidationResult 
} from './types';
import { extractJSON, repairJSON } from './json-extractors';
import { validateAgainstSchema, extractValidFields } from './schema-validators';
import { normalizeDate, normalizeCurrency, normalizePercentage } from './normalizers';
import { SECFilingType } from '../prompts/prompt-types';

/**
 * Options for parsing responses
 */
export interface ParseOptions extends ExtractionOptions {
  normalize?: boolean;
  collectMetrics?: boolean;
  maxAttempts?: number;
}

/**
 * Result of parsing a Claude response
 */
export interface ParseResult<T = any> {
  success: boolean;
  data?: T;
  raw?: string;
  errors?: string[];
  partial?: boolean;
  metrics?: ParserMetrics;
}

/**
 * Parse a Claude API response to extract structured data
 * 
 * @param response - Text response from Claude
 * @param filingType - Type of SEC filing for schema validation
 * @param options - Parsing options
 * @returns Parsed result with data and metadata
 */
export function parseResponse<T = any>(
  response: string,
  filingType: SECFilingType = 'Generic',
  options: ParseOptions = {}
): ParseResult<T> {
  const startTime = Date.now();
  const metrics: ParserMetrics = {
    extractionSuccess: false,
    validationSuccess: false,
    extractionTimeMs: 0,
    validationTimeMs: 0,
    extractionMethod: 'none',
    documentType: filingType
  };
  
  try {
    // Try to extract JSON from the response
    const extractionStartTime = Date.now();
    let extracted = extractJSON(response, {
      allowPartial: options.allowPartial ?? true,
      strictValidation: options.strictValidation,
      filingType,
      ...options
    });
    
    metrics.extractionTimeMs = Date.now() - extractionStartTime;
    metrics.extractionMethod = extracted.extractionMethod;
    metrics.extractionSuccess = extracted.success;
    
    // Try to repair if extraction failed
    if (!extracted.success && (options.maxAttempts ?? 3) > 0) {
      // Try to repair the JSON
      const repairAttempts = options.maxAttempts ?? 3;
      let repaired = false;
      
      for (let attempt = 0; attempt < repairAttempts && !repaired; attempt++) {
        try {
          // If repair becomes more advanced, we'd put each technique here
          const repairedText = repairJSON(extracted.raw || response);
          
          // Try to parse the repaired JSON
          const parsed = JSON.parse(repairedText);
          
          // Update the extraction result
          extracted = {
            raw: repairedText,
            parsed,
            extractionMethod: `${extracted.extractionMethod}-repaired`,
            success: true
          };
          
          repaired = true;
          metrics.extractionSuccess = true;
          metrics.extractionMethod = extracted.extractionMethod;
        } catch (repairError) {
          // Continue to the next repair attempt
        }
      }
    }
    
    // If extraction failed completely, return failure
    if (!extracted.success) {
      return {
        success: false,
        errors: [extracted.error?.message || 'Failed to extract JSON from response'],
        raw: response,
        metrics: options.collectMetrics ? metrics : undefined
      };
    }
    
    // Validate the extracted JSON against the schema
    const validationStartTime = Date.now();
    const validationResult = validateAgainstSchema(
      extracted.parsed,
      filingType,
      options.strictValidation
    );
    
    metrics.validationTimeMs = Date.now() - validationStartTime;
    metrics.validationSuccess = validationResult.valid;
    
    // If validation failed but partial data is allowed, try to extract valid fields
    let data: any = validationResult.valid 
      ? validationResult.validatedData 
      : (options.allowPartial ? extractValidFields(extracted.parsed, filingType) : undefined);
    
    // Normalize the data if requested
    if (options.normalize && data) {
      data = normalizeFields(data, filingType);
    }
    
    // Check if we have at least some usable data
    const hasPartialData = data && Object.keys(data).length > 0;
    
    return {
      success: validationResult.valid || hasPartialData,
      data: data as T,
      raw: extracted.raw,
      errors: validationResult.valid ? undefined : validationResult.errors,
      partial: !validationResult.valid && hasPartialData,
      metrics: options.collectMetrics ? metrics : undefined
    };
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : String(error)],
      raw: response,
      metrics: options.collectMetrics ? {
        ...metrics,
        errorType: error instanceof Error ? error.name : 'Unknown',
        extractionTimeMs: metrics.extractionTimeMs || (Date.now() - startTime)
      } : undefined
    };
  }
}

/**
 * Normalize fields based on filing type
 * 
 * @param data - Data to normalize
 * @param filingType - Type of SEC filing
 * @returns Normalized data
 */
function normalizeFields(data: any, filingType: SECFilingType): any {
  if (!data || typeof data !== 'object') {
    return data;
  }
  
  const normalized = { ...data };
  
  // Normalize common fields regardless of filing type
  if (normalized.filingDate && typeof normalized.filingDate === 'string') {
    normalized.filingDate = normalizeDate(normalized.filingDate);
  }
  
  if (normalized.reportDate && typeof normalized.reportDate === 'string') {
    normalized.reportDate = normalizeDate(normalized.reportDate);
  }
  
  if (normalized.period && typeof normalized.period === 'string') {
    // Only normalize if it contains a date-like string
    if (/\d{4}/.test(normalized.period)) {
      normalized.period = normalizeDate(normalized.period);
    }
  }
  
  // Normalize filing-specific fields
  switch (filingType) {
    case '10-K':
    case '10-Q':
    case '20-F':
    case '6-K':
      // Financial statements
      if (Array.isArray(normalized.financials)) {
        normalized.financials = normalized.financials.map((item: any) => ({
          ...item,
          value: typeof item.value === 'string' || typeof item.value === 'number' 
            ? normalizeCurrency(item.value) 
            : item.value,
          growth: typeof item.growth === 'string' || typeof item.growth === 'number' 
            ? normalizePercentage(item.growth) 
            : item.growth
        }));
      }
      break;
      
    case '8-K':
      // No specific fields that need normalization
      break;
      
    case 'DEF 14A':
      // Executive compensation
      if (Array.isArray(normalized.executiveCompensation)) {
        normalized.executiveCompensation = normalized.executiveCompensation.map((item: any) => {
          const result = { ...item };
          
          // Normalize compensation fields
          for (const field of ['salary', 'bonus', 'stockAwards', 'optionAwards', 'total']) {
            if (result[field] && (typeof result[field] === 'string' || typeof result[field] === 'number')) {
              result[field] = normalizeCurrency(result[field]);
            }
          }
          
          return result;
        });
      }
      
      // Meeting date
      if (normalized.meetingDate && typeof normalized.meetingDate === 'string') {
        normalized.meetingDate = normalizeDate(normalized.meetingDate);
      }
      break;
      
    default:
      // No specific normalization for other filing types
      break;
  }
  
  return normalized;
} 