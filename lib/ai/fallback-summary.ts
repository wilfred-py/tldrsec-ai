/**
 * Fallback summary generation for Claude API failures
 * Provides robust fallback mechanisms to ensure complete, meaningful summaries
 * even when the primary AI call fails or is rate-limited
 */

import { ApiError, ErrorCode } from '../error-handling';
import { logger } from '../logging';
import { monitoring } from '../monitoring';
import { SummarizationResult } from './summarize';
import { SECFilingType } from './prompts/prompt-types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Options for fallback summary generation
 */
export interface FallbackSummaryOptions {
  // Maximum length of fallback summary in words (default: 100)
  maxWords?: number;
  
  // Whether to include error details in the summary (default: true)
  includeErrorDetails?: boolean;
  
  // Custom templates for different filing types
  templates?: Record<string, string>;
  
  // Custom metadata to include in the result
  metadata?: Record<string, unknown>;
}

// Default fallback templates by filing type
const DEFAULT_FALLBACK_TEMPLATES: Record<string, string> = {
  'FORM_4': 'This Form 4 filing reports changes in beneficial ownership of securities. It includes details about the reporting person, their relationship to the issuer, and transaction information including dates, amounts, prices, and resulting ownership.',
  
  'FORM_8K': 'This Form 8-K contains disclosure of significant corporate events that shareholders should be aware of. The company is reporting material information that may affect investment decisions.',
  
  'FORM_10Q': 'This Form 10-Q quarterly report provides financial statements, management discussion and analysis (MD&A), disclosures about market risk, and internal controls. It gives investors an overview of the company\'s financial position and recent business developments.',
  
  'FORM_10K': 'This Form 10-K annual report provides comprehensive information about the company\'s business, financial condition, and operations for the fiscal year. It includes audited financial statements, business overview, risk factors, management discussion, and corporate governance details.',
  
  'FORM_S1': 'This Form S-1 registration statement is filed for a public offering of securities. It contains detailed information about the company, its business operations, financial condition, risk factors, and the securities being offered.',
  
  'FORM_144': 'This Form 144 provides notice of the proposed sale of restricted securities or securities held by affiliates of the issuer. It includes details about the security, amount to be sold, and the broker handling the transaction.',
  
  'DEFAULT': 'This SEC filing contains official information submitted by the company to regulators. Due to technical limitations, a detailed summary could not be generated at this time. The filing likely contains important information about the company\'s financial position, operations, or material events that may be relevant to investors.'
};

/**
 * Generate a fallback summary when the primary AI call fails
 * @param filingType SEC filing type
 * @param error Error that caused the fallback
 * @param documentContent Original document content (optional)
 * @param options Fallback options
 * @returns Fallback summarization result
 */
export function generateFallbackSummary(
  filingType: SECFilingType,
  error: Error,
  documentContent?: string,
  options: FallbackSummaryOptions = {}
): SummarizationResult {
  const startTime = Date.now();
  const summaryId = uuidv4();
  
  // Merge options with defaults
  const mergedOptions: Required<FallbackSummaryOptions> = {
    maxWords: 100,
    includeErrorDetails: true,
    templates: {},
    metadata: {},
    ...options
  };
  
  // Get the appropriate template
  const templates = { ...DEFAULT_FALLBACK_TEMPLATES, ...mergedOptions.templates };
  const template = templates[filingType] || templates.DEFAULT;
  
  // Generate basic metadata from document content if available
  let extractedMetadata: Record<string, unknown> = {};
  if (documentContent) {
    extractedMetadata = extractBasicMetadata(documentContent, filingType);
  }
  
  // Build the fallback summary
  let summaryText = template;
  
  // Add extracted metadata if available
  if (Object.keys(extractedMetadata).length > 0) {
    const metadataStr = Object.entries(extractedMetadata)
      .map(([key, value]) => `${key}: ${value}`)
      .join('. ');
    
    summaryText += `\n\nAdditional details: ${metadataStr}.`;
  }
  
  // Add error information if requested
  if (mergedOptions.includeErrorDetails) {
    let errorMessage = 'A technical issue prevented generating a complete summary.';
    
    // Customize error message based on error type
    if (error instanceof ApiError) {
      switch (error.code) {
        case ErrorCode.QUOTA_EXCEEDED:
        case ErrorCode.RATE_LIMIT_EXCEEDED:
          errorMessage = 'The summary service is currently experiencing high demand. This is a simplified summary.';
          break;
        case ErrorCode.TIMEOUT_ERROR:
          errorMessage = 'The summary generation timed out due to the complexity of the document. This is a simplified summary.';
          break;
        case ErrorCode.CONTEXT_WINDOW_EXCEEDED:
          errorMessage = 'The document was too large for complete analysis. This is a simplified summary of the available content.';
          break;
        default:
          errorMessage = 'A technical issue prevented generating a complete summary.';
      }
    }
    
    summaryText += `\n\n${errorMessage}`;
  }
  
  // Ensure the summary doesn't exceed max words
  const words = summaryText.split(/\s+/);
  if (words.length > mergedOptions.maxWords) {
    summaryText = words.slice(0, mergedOptions.maxWords).join(' ') + '...';
  }
  
  // Calculate duration
  const duration = Date.now() - startTime;
  
  // Log fallback generation
  logger.info(`Generated fallback summary for ${filingType} in ${duration}ms`, {
    summaryId,
    filingType,
    errorType: error instanceof ApiError ? error.code : 'UNKNOWN',
    errorMessage: error.message,
    summaryLength: summaryText.length
  });
  
  // Track fallback usage
  monitoring.incrementCounter('ai.fallback_summary', 1, {
    filingType,
    errorType: error instanceof ApiError ? error.code : 'UNKNOWN'
  });
  
  // Return structured result
  return {
    summaryId,
    summaryText,
    filingType,
    modelUsed: 'fallback-template',
    inputTokens: documentContent ? Math.ceil(documentContent.length / 4) : 0,
    outputTokens: Math.ceil(summaryText.length / 4),
    cost: 0,
    duration,
    metadata: {
      ...extractedMetadata,
      ...mergedOptions.metadata,
      fallbackReason: error.message,
      errorType: error instanceof ApiError ? error.code : 'UNKNOWN'
    },
    fallbackUsed: true
  };
}

/**
 * Extract basic metadata from document content
 * This function attempts to extract key information like dates, company names,
 * and filing-specific details using regex patterns
 */
function extractBasicMetadata(content: string, filingType: SECFilingType): Record<string, unknown> {
  const metadata: Record<string, unknown> = {};
  
  try {
    // Extract date (common pattern in SEC filings)
    const dateMatch = content.match(/(?:Date|Filed|Report Date|As of):\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\w+ \d{1,2}, \d{4})/i);
    if (dateMatch && dateMatch[1]) {
      metadata.date = dateMatch[1];
    }
    
    // Extract company name (common pattern in SEC filings)
    const companyMatch = content.match(/(?:Company|Issuer|Registrant|Name of):\s*([A-Z][A-Za-z0-9\s\.,&-]{2,50}(?:Inc\.|Corp\.|LLC|Ltd\.)?)/);
    if (companyMatch && companyMatch[1]) {
      metadata.company = companyMatch[1].trim();
    }
    
    // Filing-specific extraction
    switch (filingType) {
      case 'FORM_4':
        // Extract reporting person
        const personMatch = content.match(/(?:Reporting Person|Officer|Director|Name):\s*([A-Z][A-Za-z\s\.,&-]{2,50})/);
        if (personMatch && personMatch[1]) {
          metadata.reportingPerson = personMatch[1].trim();
        }
        
        // Extract transaction type
        const transactionMatch = content.match(/(?:Transaction|Code):\s*([A-Z])/);
        if (transactionMatch && transactionMatch[1]) {
          metadata.transactionCode = transactionMatch[1];
        }
        break;
        
      case 'FORM_8K':
        // Extract event item numbers
        const itemMatch = content.match(/Item\s+(\d\.\d\d?)/g);
        if (itemMatch) {
          metadata.items = itemMatch.join(', ');
        }
        break;
        
      case 'FORM_10Q':
      case 'FORM_10K':
        // Extract fiscal period
        const fiscalMatch = content.match(/(?:Fiscal|Quarter|Period)(?:\s+ended|\s+ending)?\s+(\w+ \d{1,2}, \d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
        if (fiscalMatch && fiscalMatch[1]) {
          metadata.fiscalPeriod = fiscalMatch[1];
        }
        break;
        
      default:
        // No special extraction
        break;
    }
  } catch (error) {
    // If metadata extraction fails, log but continue
    logger.warn(`Error extracting metadata from ${filingType}: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  return metadata;
}

/**
 * Check if a summary is complete and meaningful
 * This function validates if a summary meets minimum quality standards
 */
export function isSummaryComplete(summary: string): boolean {
  if (!summary) return false;
  
  // Check minimum length (at least 50 characters)
  if (summary.length < 50) return false;
  
  // Check for incomplete sentences (ending without period)
  if (!summary.trim().endsWith('.') && 
      !summary.trim().endsWith('!') && 
      !summary.trim().endsWith('?')) {
    return false;
  }
  
  // Check for error indicators
  const errorPatterns = [
    /error/i,
    /exception/i,
    /failed to/i,
    /unable to/i,
    /cannot/i,
    /could not/i
  ];
  
  if (errorPatterns.some(pattern => pattern.test(summary))) {
    return false;
  }
  
  // Check for minimum word count (at least 20 words)
  const wordCount = summary.split(/\s+/).length;
  if (wordCount < 20) return false;
  
  return true;
}
