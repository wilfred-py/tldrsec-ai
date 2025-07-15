/**
 * SEC EDGAR API Service
 * Main service module for interacting with SEC EDGAR database
 * Provides high-level functions for filing summaries and company information
 * 
 * This file serves as the main entry point for SEC-related functionality.
 * It re-exports all the modularized components for backward compatibility.
 */

// Import from filings modules
import { getFilingSummary as getGenericFilingSummary } from './filings/summaries';
import { getForm144Summary, getLatestFilingByFormType as getLatestFilingByFormTypeInternal } from './filings/summaries/form144Summary';
import { generateFallbackSummary } from './filings/summaries/fallbackSummary';
import { getFilingDetails } from './filings/filingDetails';
import { 
  extractNodeTextContent, 
  extractTextContent,
  scrapeDocumentLinksFromFilingPage,
  fetchDocumentContent
} from './filings/extractors';
import { 
  extractTableData, 
  extractFilingTableData 
} from './filings/extractors/tableExtractor';
import { parseForm144 } from './filings/parsers/form144Parser';

// Import from company service
import { findCompanyByTicker } from './companyService';
import { getCompanyInfo } from './filings/companyInfo';
import { getFilings, getFilingContent } from './filings/filingRetrieval';

// Import from utils
import { getSecApiHeaders as getSecApiHeadersInternal, normalizeFormType, getFormTypeDescription, isMajorFilingType } from './filings/utils';

// Import from company module
import { getLatestFilings } from './company';

// Import types
import { SecFiling } from '../types/sec';

// Import logger
import { logger } from '../lib/logging';

// getLatestFilings has been moved to services/company/latestFilings.ts

/**
 * Gets the SEC API headers for making requests
 * @returns SEC API headers
 */
export function getSecApiHeaders() {
  return getSecApiHeadersInternal();
}

/**
 * Gets the latest filing by form type using ticker symbol
 * @param ticker Company ticker symbol
 * @param formType The form type to search for
 * @returns The latest filing by form type or null if not found
 */
export async function getLatestFilingByFormType(ticker: string, formType: string) {
  try {
    logger.debug(`Getting latest ${formType} filing for ticker ${ticker}`);
    
    // First get company info
    const companyInfo = await getCompanyInfo(ticker);
    if (!companyInfo) {
      logger.error(`Missing CIK for company ${ticker}`);
      return null;
    }
    
    // Then call the internal function with company info
    return getLatestFilingByFormTypeInternal(companyInfo, formType);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting latest ${formType} filing for ${ticker}:`, { error: errorMessage });
    return null;
  }
}

// Re-export all functions for backward compatibility
export {
  // Filing summaries
  getForm144Summary,
  getGenericFilingSummary as getFilingSummary,
  
  // Filing details
  getFilingDetails,
  
  // Text extraction
  extractNodeTextContent,
  extractTextContent,
  
  // Table extraction
  extractTableData,
  extractFilingTableData,
  
  // Parsers
  parseForm144,
  
  // Company information
  findCompanyByTicker,
  getCompanyInfo,
  getLatestFilings,
  
  // Filing retrieval
  getFilings,
  getFilingContent
};

/**
 * This module has been modularized into smaller components for better maintainability.
 * 
 * The functionality is now organized as follows:
 * 
 * 1. Text and Table Extraction:
 *    - services/filings/extractors/textExtractor.ts
 *    - services/filings/extractors/tableExtractor.ts
 * 
 * 2. Form-specific Parsing:
 *    - services/filings/parsers/form144Parser.ts
 *    - services/filings/parsers/genericParser.ts
 * 
 * 3. Filing Summaries:
 *    - services/filings/summaries/form144Summary.ts
 *    - services/filings/summaries/genericSummary.ts
 * 
 * 4. Filing Details:
 *    - services/filings/filingDetails.ts
 * 
 * Each module has its own specific responsibility, making the code easier to maintain
 * and extend for additional form types in the future.
 */
