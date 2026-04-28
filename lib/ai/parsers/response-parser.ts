/**
 * Response Parser for Claude API Responses
 *
 * Provides a unified interface for extracting, validating, and
 * normalizing JSON data from Claude API responses.
 *
 * Phase 3: Simplified to use single-pass parsing without repair attempts.
 * If the prompt is correct, the response is correct. We don't repair broken JSON.
 */

import { ParserMetrics } from './types';
import { parseJSONResponse, ParseResult as SimpleParseResult } from './simple-parser';
import { normalizeDate, normalizeCurrency, normalizePercentage } from './normalizers';
import { SECFilingType } from '../prompts/prompt-types';
import { secLogger as logger } from '../../../utils/logger';
import { canonicalizeFormType } from '../utils/form-type-utils';
import { jsonParsingMonitor } from '../../monitoring/json-parsing-monitor';
import {
  normalizeTransaction as centralNormalizeTx,
  parseStringTransaction as centralParseStringTx,
  isCharacterIndexedObject,
  CURRENT_FORM4_SCHEMA_VERSION,
  derivePreviousStake,
  formatNumberWithCommas,
  NormalizedTransaction,
} from '../../email/form4-field-normalizer';
import { deriveNewStake } from '../utils/derive-stake';

/**
 * Transaction code to human-readable type mapping
 */
const TX_CODE_TO_TYPE: Record<string, string> = {
  'P': 'Purchase',
  'S': 'Sale',
  'A': 'Award/Grant',
  'D': 'Disposition',
  'G': 'Gift',
  'M': 'Exercise',
  'F': 'Disposition',
  'J': 'Transfer',
  'K': 'Transfer',
  'X': 'Exercise',
  'C': 'Exercise',
  'W': 'Gift',
};

/**
 * Parse a string transaction into a structured object.
 * AI models (especially grok-4.1-fast) sometimes output transactions as strings:
 *   "Sold 80 Common Stock shares at $412.460 (S, D)"
 *   "Exercised into 40,000 Common Stock shares at $14.99 (M, A)"
 *
 * @param str - Transaction string from AI output
 * @returns Structured transaction object, or null if unparseable
 */
export function parseStringTransaction(str: string): Record<string, string> | null {
  if (!str || typeof str !== 'string') return null;

  // Extract (CODE, A/D) parenthetical at end of string
  const codeMatch = str.match(/\(([A-Z]),\s*([AD])\)\s*$/);
  const code = codeMatch?.[1] || '';
  const acquisitionDisposition = codeMatch?.[2] || '';

  // Map code to human-readable type
  const type = code ? (TX_CODE_TO_TYPE[code] || 'Other') : '';

  // Extract share count: look for "N,NNN shares" or "N,NNN [SecurityType]"
  const sharesMatch = str.match(/([\d,]+(?:\.\d+)?)\s+(?:Common\s+Stock\s+)?(?:shares?|Non-Qualified)/i);
  const shares = sharesMatch?.[1] || '';

  // Extract price: look for "at $N.NN" or "$N.NN"
  const priceMatch = str.match(/at\s+\$([\d,.]+)/i) || str.match(/\$([\d,.]+)/);
  const pricePerShare = priceMatch ? `$${priceMatch[1]}` : '';

  // Must have at least code or shares to be useful
  if (!code && !shares) return null;

  return {
    code,
    type,
    shares,
    pricePerShare,
    acquisitionDisposition,
  };
}

/**
 * Normalize fields based on filing type
 *
 * @param data - Data to normalize
 * @param filingType - Type of SEC filing
 * @returns Normalized data
 */
function normalizeFields(data: unknown, filingType: SECFilingType): unknown {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const dataObj = data as Record<string, unknown>;

  const normalized = { ...dataObj };

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

  // Normalize headline field (all form types)
  if (normalized.headline && typeof normalized.headline === 'string') {
    // Strip ticker prefixes (e.g., "AAPL: Revenue surged..." -> "Revenue surged...")
    normalized.headline = normalized.headline.replace(/^[A-Z]{1,5}:\s*/, '');
    // Strip form type prefixes (e.g., "8-K: Company announced..." -> "Company announced...")
    normalized.headline = normalized.headline.replace(/^(?:Form\s*)?\d+-[A-Z](?:\/A)?:\s*/i, '');
    normalized.headline = normalized.headline.trim().substring(0, 120);
    // Quality gate: delete generic/useless headlines so templates use their fallback
    const genericPatterns = /^(this|the company|a new|an? )/i;
    if (normalized.headline.length < 20 || genericPatterns.test(normalized.headline)) {
      delete normalized.headline;
    }
  }

  // Normalize emailSubject field (all form types).
  // Why 78: Gmail's reading-pane header visually truncates subjects past ~80 chars
  // and renders its own ellipsis, producing ugly mid-word cuts like
  // "CMG: ... June 1, 2026, and...". Cap to 78 with a word-boundary fold so the
  // ellipsis (if any) is ours, lands on a real word, and the full subject fits.
  if (normalized.emailSubject && typeof normalized.emailSubject === 'string') {
    let subject = normalized.emailSubject.trim();
    const MAX_SUBJECT_CHARS = 78;
    if (subject.length > MAX_SUBJECT_CHARS) {
      const sliced = subject.slice(0, MAX_SUBJECT_CHARS - 1); // reserve 1 char for "…"
      const lastSpace = sliced.lastIndexOf(' ');
      const cut = lastSpace > 30 ? sliced.slice(0, lastSpace) : sliced;
      subject = `${cut.replace(/[,;:.\-–—]+$/, '')}…`;
    }
    normalized.emailSubject = subject;
    if (normalized.emailSubject.length < 15) {
      delete normalized.emailSubject;
    }
  }

  // Canonicalize form type: '10-K/A' -> '10-K', 'SCHEDULE 13G' -> 'SC 13G', etc.
  // This ensures amendments and alternate names route to the correct normalization branch.
  const { type: canonicalType } = canonicalizeFormType(filingType);

  // Normalize filing-specific fields using the canonical type
  switch (canonicalType) {
    case '10-K':
    case '10-Q':
    case '20-F':
    case '6-K': {
      // Financial statements — schema uses `financialHighlights`, AI may return `financials`
      // Alias: if AI returned `financials` but not `financialHighlights`, copy it over
      if (Array.isArray(normalized.financials) && !Array.isArray(normalized.financialHighlights)) {
        normalized.financialHighlights = normalized.financials;
        delete normalized.financials;
      }

      // Normalize currency/percentage in financial highlights
      const finArray = (normalized.financialHighlights || normalized.financials) as unknown[] | undefined;
      if (Array.isArray(finArray)) {
        const normalizedArray = finArray.map((item: unknown) => {
          const itemObj = item as Record<string, unknown>;
          return {
            ...itemObj,
            value: typeof itemObj.value === 'string' || typeof itemObj.value === 'number'
              ? normalizeCurrency(itemObj.value)
              : itemObj.value,
            growth: typeof itemObj.growth === 'string' || typeof itemObj.growth === 'number'
              ? normalizePercentage(itemObj.growth)
              : itemObj.growth
          };
        });
        // Always write to the canonical field name
        normalized.financialHighlights = normalizedArray;
        if (normalized.financials) delete normalized.financials;
      }
      break;
    }
      
    case '8-K': {
      // Normalize sentiment to lowercase enum values
      if (typeof normalized.sentiment === 'string') {
        const sentimentLower = normalized.sentiment.toLowerCase().trim();
        const validSentiments = ['positive', 'negative', 'neutral', 'mixed'];
        normalized.sentiment = validSentiments.includes(sentimentLower) ? sentimentLower : 'neutral';
      }

      // Normalize itemNumbers to array format
      if (normalized.itemNumbers && !Array.isArray(normalized.itemNumbers)) {
        normalized.itemNumbers = [String(normalized.itemNumbers)];
      }

      // Derive eventType from itemNumbers if missing
      if (!normalized.eventType && Array.isArray(normalized.itemNumbers) && normalized.itemNumbers.length > 0) {
        const itemDescriptions: Record<string, string> = {
          '1.01': 'Entry into Material Agreement',
          '1.02': 'Termination of Material Agreement',
          '1.03': 'Bankruptcy',
          '1.05': 'Cybersecurity Incident',
          '2.01': 'Acquisition/Disposition of Assets',
          '2.02': 'Results of Operations',
          '2.06': 'Material Impairment',
          '4.01': 'Auditor Change',
          '4.02': 'Restatement',
          '5.02': 'Executive Departure/Appointment',
          '7.01': 'Regulation FD Disclosure',
          '8.01': 'Other Events',
        };
        const firstItem = String(normalized.itemNumbers[0]);
        normalized.eventType = itemDescriptions[firstItem] || `Item ${firstItem}`;
      }

      // Normalize positiveDevelopments to array (can be string OR array from AI)
      if (typeof normalized.positiveDevelopments === 'string') {
        normalized.positiveDevelopments = [normalized.positiveDevelopments];
      }

      break;
    }
      
    case '3' as SECFilingType:
    case '4' as SECFilingType:
    case '144' as SECFilingType:
      // Insider trading forms — use centralized normalizer for field-name resolution
      if (Array.isArray(normalized.transactions)) {
        normalized.transactions = (normalized.transactions as unknown[]).map((tx: unknown) => {
          // Handle string transactions: AI sometimes outputs strings like
          // "Sold 80 shares at $412.460 (S, D)" instead of structured objects
          if (typeof tx === 'string') {
            const parsed = centralParseStringTx(tx);
            if (!parsed) return null; // Drop unparseable strings
            return parsed;
          }

          // Detect and skip character-indexed objects from stale string-spread data
          if (isCharacterIndexedObject(tx)) {
            logger.warn('Skipping character-indexed transaction object (stale data)');
            return null;
          }

          // Use centralized normalizer for all field-name resolution
          // This handles: price→pricePerShare (zero-safe), action→type,
          // transactionCode→code, code↔type inference, bracket stripping
          const normalizedTx = centralNormalizeTx(tx);
          if (!normalizedTx) return null;

          // Additional normalization: currency and date formatting
          const result = normalizedTx as unknown as Record<string, unknown>;
          if (result.pricePerShare && (typeof result.pricePerShare === 'string' || typeof result.pricePerShare === 'number')) {
            result.pricePerShare = normalizeCurrency(result.pricePerShare);
          }
          if (result.date && typeof result.date === 'string') {
            result.date = normalizeDate(result.date);
          }

          return result;
        }).filter(Boolean);
      }

      // Derive newStake using three-tier precedence helper:
      //   1. authoritative postTransactionCommonShares (LLM-extracted Table I Col 5)
      //   2. derived from Common-Stock + Direct transactions with SOF (date-sorted)
      //   3. derived-fallback: any transaction with SOF (derivative-only filings)
      //   4. LLM's legacy newStake string (pass-through, preserves original suffix)
      // See .claude/tasks/form4-holdings-mismatch.md — the `!normalized.newStake`
      // gate was removed because the LLM's top-level newStake unreliably picked
      // the last-indexed transaction, which is often a derivative (RSU) row.
      {
        const txArr = Array.isArray(normalized.transactions)
          ? (normalized.transactions as unknown as NormalizedTransaction[])
          : [];
        const stakeResult = deriveNewStake({
          transactions: txArr,
          postTransactionCommonShares: normalized.postTransactionCommonShares,
          llmNewStake: typeof normalized.newStake === 'string' ? normalized.newStake : undefined,
        });

        if (stakeResult.source === 'llm-legacy') {
          // Preserve LLM's raw string verbatim (may already have suffix/text)
          normalized.newStake = stakeResult.llmLegacyRaw;
        } else if (stakeResult.source !== 'none') {
          const suffix = stakeResult.isDerivative ? 'derivative securities' : 'shares';
          normalized.newStake = `${stakeResult.formattedNumber} ${suffix}`;
        }
      }

      // Derive previousStake using shared first-chronological algorithm
      if (!normalized.previousStake && normalized.newStake && Array.isArray(normalized.transactions)) {
        const txArr = normalized.transactions as NormalizedTransaction[];
        const prevNum = derivePreviousStake(txArr);
        if (prevNum !== null) {
          // Use same suffix as newStake (shares vs derivative securities)
          const suffix = String(normalized.newStake).includes('derivative securities')
            ? 'derivative securities' : 'shares';
          normalized.previousStake = `${formatNumberWithCommas(prevNum)} ${suffix}`;
        }
      }

      // Derive percentageChange from previousStake and newStake
      if (!normalized.percentageChange && normalized.previousStake && normalized.newStake) {
        // Skip % calc when comparing different security types (shares vs derivative securities)
        const prevStr = String(normalized.previousStake);
        const newStr = String(normalized.newStake);
        const prevIsDerivative = prevStr.includes('derivative');
        const newIsDerivative = newStr.includes('derivative');
        if (prevIsDerivative === newIsDerivative) {
          const prevNum = parseFloat(prevStr.replace(/[^0-9.]/g, ''));
          const newNum = parseFloat(newStr.replace(/[^0-9.]/g, ''));
          if (!isNaN(prevNum) && !isNaN(newNum) && isFinite(prevNum) && prevNum > 0) {
            const pctChange = ((newNum - prevNum) / prevNum) * 100;
            const sign = pctChange >= 0 ? '+' : '';
            normalized.percentageChange = `${sign}${pctChange.toFixed(1)}%`;
          }
        }
      }

      // Normalize stake values
      if (normalized.previousStake && typeof normalized.previousStake === 'string') {
        if (/\d/.test(normalized.previousStake)) {
          normalized.previousStake = normalized.previousStake.replace(/([\d,]+)\s*shares?/i, '$1 shares');
        }
      }
      
      if (normalized.newStake && typeof normalized.newStake === 'string') {
        if (/\d/.test(normalized.newStake)) {
          // Don't normalize "derivative securities" suffix - only normalize bare "share(s)"
          if (!normalized.newStake.includes('derivative securities')) {
            normalized.newStake = normalized.newStake.replace(/([\d,]+)\s*shares?/i, '$1 shares');
          }
        }
      }
      
      if (normalized.totalValue && typeof normalized.totalValue === 'string') {
        normalized.totalValue = normalizeCurrency(normalized.totalValue);
      }
      
      if (normalized.percentageChange && typeof normalized.percentageChange === 'string') {
        normalized.percentageChange = normalizePercentage(normalized.percentageChange);
      }

      // Stamp schema version for stale-data detection in shared summary handler
      normalized._schemaVersion = CURRENT_FORM4_SCHEMA_VERSION;
      break;
      
    case 'DEF 14A':
      // Executive compensation
      if (Array.isArray(normalized.executiveCompensation)) {
        normalized.executiveCompensation = (normalized.executiveCompensation as unknown[]).map((item: unknown) => {
          const itemObj = item as Record<string, unknown>;
          const result = { ...itemObj };

          // Alias: AI may return SEC column names instead of schema field names
          // Schema expects `totalCompensation`, AI may return `total` or individual components
          if (!result.totalCompensation && result.total) {
            result.totalCompensation = result.total;
            delete result.total;
          }

          // If AI returned individual components but no totalCompensation, sum them
          if (!result.totalCompensation) {
            const components = ['salary', 'bonus', 'stockAwards', 'optionAwards', 'otherCompensation'];
            const hasComponents = components.some(f => result[f]);
            if (hasComponents) {
              // Try to compute total from components
              let sum = 0;
              let hasValidNumber = false;
              for (const field of components) {
                if (result[field]) {
                  const num = parseFloat(String(result[field]).replace(/[$,]/g, ''));
                  if (!isNaN(num)) { sum += num; hasValidNumber = true; }
                }
              }
              if (hasValidNumber) {
                // Use explicit comma formatting instead of toLocaleString (locale-dependent)
                result.totalCompensation = `$${sum.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
              }
            }
          }

          // Normalize currency in totalCompensation
          if (result.totalCompensation && (typeof result.totalCompensation === 'string' || typeof result.totalCompensation === 'number')) {
            result.totalCompensation = normalizeCurrency(result.totalCompensation);
          }

          // Also normalize individual components if present (for display flexibility)
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
 *
 * Note: maxAttempts is kept for backward compatibility but is ignored.
 * We use single-pass parsing - no repair attempts.
 */
export interface ParseOptions {
  normalize?: boolean;
  collectMetrics?: boolean;
  /** @deprecated Single-pass parsing - no repair attempts */
  maxAttempts?: number;
  /** Allow partial data extraction if validation fails */
  allowPartial?: boolean;
}

/**
 * Result of parsing a Claude response
 */
export interface ParseResult<T = unknown> {
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
 * Phase 3: Uses single-pass parsing without repair attempts.
 * If the prompt is correct, the response is correct.
 *
 * @param response - Text response from Claude
 * @param filingType - Type of SEC filing for schema validation
 * @param options - Parsing options
 * @returns Parsed result with data and metadata
 */
export function parseResponse<T = unknown>(
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
    // Single-pass JSON extraction using the simple parser
    const simpleResult: SimpleParseResult = parseJSONResponse(response, filingType);

    // Phase 5: Record parsing metrics for monitoring and prompt improvement
    jsonParsingMonitor.recordParsingAttempt(simpleResult, filingType);

    metrics.extractionTimeMs = simpleResult.parseTimeMs;
    metrics.extractionMethod = simpleResult.method;
    metrics.extractionSuccess = simpleResult.success || !!simpleResult.data;

    // If parsing failed completely, return failure
    if (!simpleResult.success && !simpleResult.data) {
      return {
        success: false,
        errors: simpleResult.error
          ? [simpleResult.error]
          : simpleResult.validationErrors || ['Failed to parse JSON from response'],
        raw: response,
        metrics: options.collectMetrics ? metrics : undefined
      };
    }

    // Track validation success
    metrics.validationSuccess = simpleResult.success && !simpleResult.validationErrors;

    // Get the parsed data
    let data: Record<string, unknown> | undefined = simpleResult.data;

    // Normalize and post-process the data
    if (data) {
      // Normalize fields (dates, currencies, etc.)
      data = normalizeFields(data, filingType as SECFilingType) as Record<string, unknown>;

      // Store the original response for potential summary recovery
      const dataWithResponse = data as Record<string, unknown> & { _originalResponse?: string };
      dataWithResponse._originalResponse = response;

      // Post-process to handle missing required fields
      data = postProcessFilingData(dataWithResponse, filingType as SECFilingType) as Record<string, unknown>;

      // Remove the _originalResponse field to avoid storing in database
      delete (data as Record<string, unknown> & { _originalResponse?: string })._originalResponse;
    }

    // Determine if we have partial data
    const hasValidationErrors = !!(simpleResult.validationErrors && simpleResult.validationErrors.length > 0);
    const hasPartialData = data && Object.keys(data).length > 0;

    // For fully successful validation
    if (simpleResult.success && !hasValidationErrors) {
      return {
        success: true,
        data: data as T,
        raw: simpleResult.rawResponse,
        partial: undefined,
        errors: undefined,
        metrics: options.collectMetrics ? metrics : undefined
      };
    }

    // For partial data (validation errors but some data extracted)
    if (hasPartialData && options.allowPartial !== false) {
      return {
        success: true,
        data: data as T,
        raw: simpleResult.rawResponse,
        errors: simpleResult.validationErrors,
        partial: true,
        metrics: options.collectMetrics ? metrics : undefined
      };
    }

    // Parsing or validation failed
    return {
      success: false,
      data: data as T,
      raw: simpleResult.rawResponse,
      errors: simpleResult.validationErrors || [simpleResult.error || 'Unknown parsing error'],
      partial: hasPartialData,
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
function postProcessFilingData(data: unknown, filingType: SECFilingType = 'Generic'): unknown {
  if (!data || typeof data !== 'object') {
    logger.debug(`${filingType} post-processing: Input data is not an object`);
    return data;
  }
  
  const dataObj = data as Record<string, unknown>;
  
  logger.debug(`${filingType} post-processing: Starting with fields: ${Object.keys(dataObj).join(', ')}`);
  
  const processed = { ...dataObj };
  
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
    
    // If we still don't have a company field, create a fallback
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
    
    // No longer truncating summaries to fixed length
    // We'll store the full summary in the database
    logger.debug(`${filingType} post-processing: Preserving full summary length of ${processed.summary.length} chars`);
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
        break;
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