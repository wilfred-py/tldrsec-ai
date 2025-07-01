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
import { secLogger as logger } from '../../../utils/logger';

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
    
    // Post-process to handle missing required fields for all form types
    if (data) {
      data = postProcessFilingData(data, filingType);
    }
    
    // Check if we have at least some usable data
    const hasPartialData = data && Object.keys(data).length > 0;
    
    // For successful validation, set partial to undefined explicitly (not just omitted)
    if (validationResult.valid) {
      return {
        success: true,
        data: data as T,
        raw: extracted.raw,
        partial: undefined,
        errors: undefined,
        metrics: options.collectMetrics ? metrics : undefined
      };
    }
    
    // For partial data, make sure we properly indicate it's partial
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
/**
 * Post-process filing data to handle missing required fields for any form type
 * 
 * @param data - Partially processed filing data
 * @param filingType - Type of SEC filing
 * @returns Enhanced data with derived fields where possible
 */
function postProcessFilingData(data: any, filingType: SECFilingType = 'Generic'): any {
  if (!data || typeof data !== 'object') {
    logger.debug(`${filingType} post-processing: Input data is not an object`);
    return data;
  }
  
  logger.debug(`${filingType} post-processing: Starting with fields: ${Object.keys(data).join(', ')}`);
  
  const processed = { ...data };
  
  // If company field is missing but we have other identifying information
  if (!processed.company) {
    logger.debug(`${filingType} post-processing: Company field is missing, attempting to derive`);
    
    // Try to derive company from other fields
    if (processed.issuer) {
      processed.company = processed.issuer;
      logger.debug(`${filingType} post-processing: Derived company from issuer: ${processed.company}`);
    } else if (processed.issuerName) {
      processed.company = processed.issuerName;
      logger.debug(`${filingType} post-processing: Derived company from issuerName: ${processed.company}`);
    } else if (processed.issuerCompany) {
      processed.company = processed.issuerCompany;
      logger.debug(`${filingType} post-processing: Derived company from issuerCompany: ${processed.company}`);
    } else if (processed.companyName) {
      processed.company = processed.companyName;
      logger.debug(`${filingType} post-processing: Derived company from companyName: ${processed.company}`);
    } else if (processed.ticker) {
      processed.company = processed.ticker;
      logger.debug(`${filingType} post-processing: Derived company from ticker: ${processed.company}`);
    } else if (processed.filerName && ['3', '4', '144'].includes(filingType)) {
      // For insider forms, filerName can be used as a fallback for company
      processed.company = `Filing by ${processed.filerName}`;
      logger.debug(`${filingType} post-processing: Derived company from filerName: ${processed.company}`);
    } else {
      logger.debug(`${filingType} post-processing: Could not derive company field from available data`);
    }
  }
  
  // Form-specific post-processing
  switch (filingType) {
    case '3': 
    case '4':
    case '144':
      // Ensure summary field exists for insider forms
      if (!processed.summary && processed.transactions && processed.transactions.length > 0) {
        logger.debug(`${filingType} post-processing: Summary field is missing, generating from transaction data`);
        
        // Create a basic summary from transaction data
        const filer = processed.filerName || 'An insider';
        const txType = processed.transactions[0].type || 'executed';
        const shares = processed.transactions[0].shares || 'multiple';
        
        processed.summary = `${filer} ${txType} ${shares} shares of the company stock.`;
        logger.debug(`${filingType} post-processing: Generated summary: ${processed.summary}`);
      } else if (!processed.summary && processed.filerName) {
        // If no transactions but we have a filer name
        processed.summary = `Initial filing by ${processed.filerName} with the SEC.`;
        logger.debug(`${filingType} post-processing: Generated basic summary for filing without transactions`);
      }
      break;
      
    case '8-K':
      // Ensure summary field exists for 8-K
      if (!processed.summary && processed.eventType) {
        processed.summary = `The company reported a ${processed.eventType} event.`;
        logger.debug(`${filingType} post-processing: Generated summary from event type: ${processed.summary}`);
      }
      break;
      
    case '10-K':
    case '10-Q':
    case '20-F':
    case '6-K':
      // Ensure summary field exists for financial reports
      if (!processed.summary && processed.period) {
        processed.summary = `Financial report for the period ending ${processed.period}.`;
        logger.debug(`${filingType} post-processing: Generated summary from period: ${processed.summary}`);
      }
      break;
      
    default:
      // For other form types, create a basic summary if missing
      if (!processed.summary) {
        processed.summary = `${filingType} filing for ${processed.company || 'the company'}.`;
        logger.debug(`${filingType} post-processing: Generated generic summary: ${processed.summary}`);
      }
      break;
  }
  
  logger.debug(`${filingType} post-processing: Finished with fields: ${Object.keys(processed).join(', ')}`);
  return processed;
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use postProcessFilingData instead
 */
function postProcessForm4Data(data: any): any {
  return postProcessFilingData(data, '4');
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
      
    case '3':
    case '4':
    case '144':
      // Insider trading forms
      if (Array.isArray(normalized.transactions)) {
        normalized.transactions = normalized.transactions.map((tx: any) => {
          const result = { ...tx };
          
          // Normalize transaction values
          if (result.price && (typeof result.price === 'string' || typeof result.price === 'number')) {
            result.price = normalizeCurrency(result.price);
          }
          
          if (result.value && (typeof result.value === 'string' || typeof result.value === 'number')) {
            result.value = normalizeCurrency(result.value);
          }
          
          if (result.date && typeof result.date === 'string') {
            result.date = normalizeDate(result.date);
          }
          
          return result;
        });
      }
      
      // Normalize stake values
      if (normalized.previousStake && typeof normalized.previousStake === 'string') {
        if (/\d/.test(normalized.previousStake)) {
          normalized.previousStake = normalized.previousStake.replace(/([\d,]+)\s*shares?/i, '$1 shares');
        }
      }
      
      if (normalized.newStake && typeof normalized.newStake === 'string') {
        if (/\d/.test(normalized.newStake)) {
          normalized.newStake = normalized.newStake.replace(/([\d,]+)\s*shares?/i, '$1 shares');
        }
      }
      
      if (normalized.totalValue && typeof normalized.totalValue === 'string') {
        normalized.totalValue = normalizeCurrency(normalized.totalValue);
      }
      
      if (normalized.percentageChange && typeof normalized.percentageChange === 'string') {
        normalized.percentageChange = normalizePercentage(normalized.percentageChange);
      }
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