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
import { getForm144Summary, getLatestFilingByFormType } from './filings/summaries/form144Summary';
import { getFilingDetails } from './filings/filingDetails';
import { 
  extractNodeTextContent, 
  extractTextContent 
} from './filings/extractors/textExtractor';
import { 
  extractTableData, 
  extractFilingTableData 
} from './filings/extractors/tableExtractor';
import { parseForm144 } from './filings/parsers/form144Parser';

// Import from company service
import { findCompanyByTicker } from './companyService';

// Import from API utilities
import { SEC_CONFIG } from '../config/sec';

/**
 * Gets the latest filings for a company
 * @param ticker Company ticker symbol
 * @param limit Maximum number of filings to return
 * @returns Array of latest filings
 */
export async function getLatestFilings(ticker: string, limit: number = 5) {
  // This is a wrapper function that will be implemented later
  // For now, it returns an empty array
  return [];
}

/**
 * Gets the SEC API headers for making requests
 * @returns SEC API headers
 */
export function getSecApiHeaders() {
  return SEC_CONFIG.HEADERS || {};
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
  
  // Filing retrieval
  getLatestFilingByFormType
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
