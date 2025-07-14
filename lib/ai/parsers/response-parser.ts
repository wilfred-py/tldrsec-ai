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
  switch (filingType as string) {
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
      
    case '3' as SECFilingType:
    case '4' as SECFilingType:
    case '144' as SECFilingType:
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
    
    // First, normalize and post-process the data to ensure required fields are present
    // before validation occurs
    if (data) {
      // Always normalize fields regardless of options to ensure consistent validation
      // Forward reference to normalizeFields function defined below
      data = normalizeFields(data, filingType as SECFilingType);
      
      // Store the original response in the data object for potential summary recovery
      data._originalResponse = response;
      
      // Post-process to handle missing required fields for all form types
      data = postProcessFilingData(data, filingType as SECFilingType);
      
      // Remove the _originalResponse field after processing to avoid storing it in the database
      if (data._originalResponse) {
        delete data._originalResponse;
      }
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
  
  // Ensure we have a company field by checking all possible variations
  // This is critical for validation to pass
  if (!processed.company) {
    logger.debug(`${filingType} post-processing: Company field is missing, attempting to derive`);
    
    // Try to derive company from other fields - expanded list of possible field names
    const possibleCompanyFields = [
      'issuer', 'issuerName', 'issuerCompany', 'companyName', 'ticker', 'filerName',
      'registrant', 'registrantName', 'entityName', 'entity', 'name', 'businessName',
      'corporateName', 'corporateEntity', 'organization', 'organizationName'
    ];
    
    // Try each possible field
    for (const field of possibleCompanyFields) {
      if (processed[field] && typeof processed[field] === 'string') {
        processed.company = processed[field];
        logger.debug(`${filingType} post-processing: Derived company from ${field}: ${processed.company}`);
        break;
      }
    }
    
// If we still don't have a company fiel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              d, create a fallback
    if (!processed.company) {
      // For insider forms, use a special format
      if (['3', '4', '144'].includes(filingType)) {
        processed.company = processed.filerName ? 
          `Filing by ${processed.filerName}` : 
          `Insider filing (${filingType})`;
      } else {
        // For other forms, use a generic company name with the form type
        processed.company = `Company filing (${filingType})`;
      }
      logger.debug(`${filingType} post-processing: Created fallback company name: ${processed.company}`);
    }
  }
  
  // Handle summary field - detect and attempt to recover truncated summaries
  if (processed.summary && typeof processed.summary === 'string') {
    // Check for signs of truncation
    const isTruncated = processed.summary.endsWith('...') || 
                       processed.summary.endsWith('w...') || 
                       processed.summary.endsWith('wi...') ||
                       !processed.summary.match(/[.!?]\s*$/) ||
                       processed.summary.match(/[a-z]\s*$/); // Ends with lowercase letter
    
    if (isTruncated) {
      logger.debug(`${filingType} post-processing: Detected potentially truncated summary`);
      
      // Store the original truncated summary in case recovery fails
      const originalSummary = processed.summary;
      
      // We'll set this flag if we successfully recover the summary
      let recoverySuccessful = false;
      
      // If we have access to the original response, try to recover the full summary
      if (processed._originalResponse && typeof processed._originalResponse === 'string') {
        logger.debug(`${filingType} post-processing: Attempting to recover full summary from original response`);
        const recoveredSummary = attemptSummaryRecovery(processed._originalResponse, originalSummary);
        
        if (recoveredSummary && recoveredSummary !== originalSummary) {
          processed.summary = recoveredSummary;
          logger.debug(`${filingType} post-processing: Successfully recovered fuller summary`);
          recoverySuccessful = true;
        }
      }
      
      // If we couldn't recover the summary, at least ensure it doesn't look abruptly cut off
      if (!recoverySuccessful) {
        // Only apply this if the summary doesn't already end with proper punctuation
        if (!processed.summary.endsWith('.') && 
            !processed.summary.endsWith('!') && 
            !processed.summary.endsWith('?')) {
          // Replace trailing ellipsis with a period for better readability
          if (processed.summary.endsWith('...')) {
            processed.summary = processed.summary.substring(0, processed.summary.length - 3) + '.';
          } else {
            processed.summary += '.';
          }
          logger.debug(`${filingType} post-processing: Could not recover full summary, added proper ending`);
        }
      }
    }
    
    // Ensure summary doesn't exceed database limits
    const MAX_SUMMARY_LENGTH = 5000; // Reasonable limit for database storage
    if (processed.summary.length > MAX_SUMMARY_LENGTH) {
      processed.summary = processed.summary.substring(0, MAX_SUMMARY_LENGTH - 3) + '...';
      logger.debug(`${filingType} post-processing: Truncated summary to ${MAX_SUMMARY_LENGTH} chars for database storage`);
    }
    
    // Form-specific post-processing to generate summary if missing
    if (!processed.summary) {
      logger.debug(`${filingType} post-processing: Summary field is missing, generating based on form type`);
      
      switch (filingType as string) {
      case '3':
      case '4':
      case '144':
        // For insider trading forms
        if (processed.transactions && processed.transactions.length > 0) {
          const tx = processed.transactions[0];
          const action = tx.action || 'traded';
          const shares = tx.shares || 'an undisclosed number of';
          const price = tx.price ? `at ${tx.price}` : '';
          
          processed.summary = `${processed.insiderName || 'An insider'} ${action} ${shares} shares ${price} of ${processed.company || 'the company'}.`;
          logger.debug(`Generated fallback summary for ${filingType}: ${processed.summary}`);
        } else {
          processed.summary = `An insider filing was submitted for ${processed.company || 'a company'}.`;
        }
        break;
        
      case '8-K':
        // For 8-K forms
        if (processed.events && processed.events.length > 0) {
          processed.summary = `${processed.company || 'A company'} reported the following event: ${processed.events[0].description || processed.events[0].title || 'an undisclosed event'}.`;
        } else {
          processed.summary = `${processed.company || 'A company'} filed an 8-K report disclosing a material event.`;
        }
        logger.debug(`Generated fallback summary for 8-K: ${processed.summary}`);
        break;
        
      case '10-K':
      case '10-Q':
      case '20-F':
      case '6-K':
        // For financial reports
        processed.summary = `${processed.company || 'A company'} filed a ${filingType} financial report${processed.period ? ` for the period ending ${processed.period}` : ''}.`;
        logger.debug(`Generated fallback summary for ${filingType}: ${processed.summary}`);
        break;
        
      case '424B1':
      case '424B2':
      case '424B3':
      case '424B4':
      case '424B5':
      case '424B':
        // For prospectus filings
        processed.summary = `${processed.company || 'A company'} filed a ${filingType} prospectus${processed.offeringDetails ? ` regarding ${processed.offeringDetails}` : ''}.`;
        logger.debug(`Generated fallback summary for ${filingType}: ${processed.summary}`);
        break;
        
      default:
        // Generic fallback
        processed.summary = `${processed.company || 'A company'} filed a ${filingType} SEC document.`;
        logger.debug(`Generated fallback summary for ${filingType}: ${processed.summary}`);
    }
  }
  
  logger.debug(`${filingType} post-processing: Finished with fields: ${Object.keys(processed).join(', ')}`);
  return processed;
}

/**
 * Attempts to recover a complete summary from the original response when truncation is detected
 * 
 * @param originalResponse - The complete original response from Claude
 * @param truncatedSummary - The truncated summary that was extracted
 * @returns A more complete summary if recovery was successful, or the original truncated summary
 */
function attemptSummaryRecovery(originalResponse: string, truncatedSummary: string): string {
  if (!originalResponse || !truncatedSummary) {
    return truncatedSummary;
  }
  
  try {
    logger.debug('Summary recovery: Attempting to recover truncated summary');
    
    // Strategy 1: Look for the truncated summary in the original response and extract more content
    // This works when JSON extraction cut off the summary
    const escapedPrefix = truncatedSummary
      .substring(0, Math.min(100, truncatedSummary.length)) // Use first 100 chars as search anchor
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // Escape regex special chars
    
    // Create a regex that finds our truncated summary prefix and captures text after it
    const summaryRegex = new RegExp(`(${escapedPrefix}[^"]{0,10000})["]`, 'i');
    const match = originalResponse.match(summaryRegex);
    
    if (match && match[1] && match[1].length > truncatedSummary.length) {
      logger.debug('Summary recovery: Found longer version of summary in original response');
      return match[1];
    }
    
    // Strategy 2: Look for summary section in the original response
    // This works when the JSON structure was malformed but the summary text exists elsewhere
    const summaryPatterns = [
      /["']?summary["']?\s*[:]\s*["']([^"']{100,10000})["']/i,
      /summary[\s\n]*(?:of|:)[\s\n]*([^\n]{100,}(?:\n[^\n]{10,}){0,20})/i,
      /(?:here(?:'s|\sis)\sthe\ssummary)[^:]*:\s*([^\n]{100,}(?:\n[^\n]{10,}){0,20})/i
    ];
    
    for (const pattern of summaryPatterns) {
      const sectionMatch = originalResponse.match(pattern);
      if (sectionMatch && sectionMatch[1] && sectionMatch[1].length > truncatedSummary.length) {
        logger.debug('Summary recovery: Extracted summary from dedicated section');
        return sectionMatch[1].trim();
      }
    }
    
    // Strategy 3: Try to find the longest paragraph that contains the start of our truncated summary
    // This works when the summary was split across multiple parts of the response
    if (truncatedSummary.length > 30) {
      // Use the first 30 characters as an anchor
      const anchorText = truncatedSummary.substring(0, 30)
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      
      // Find paragraphs containing our anchor
      const paragraphRegex = new RegExp(`(${anchorText}[^\n]{0,10000})(?:\n|$)`, 'i');
      const paragraphMatch = originalResponse.match(paragraphRegex);
      
      if (paragraphMatch && paragraphMatch[1] && paragraphMatch[1].length > truncatedSummary.length) {
        logger.debug('Summary recovery: Found paragraph containing summary start');
        return paragraphMatch[1].trim();
      }
    }
    
    logger.debug('Summary recovery: Could not recover a more complete summary');
    return truncatedSummary;
  } catch (error) {
    logger.error(`Summary recovery failed: ${error instanceof Error ? error.message : String(error)}`);
    return truncatedSummary; // Return original summary if recovery fails
  }
}

/**
 * Legacy function for backward compatibility
 * @deprecated Use postProcessFilingData instead
 */
function postProcessForm4Data(data: any): any {
  return postProcessFilingData(data, '4' as SECFilingType);
}
}