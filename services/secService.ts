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
import { getCompanyInfo, getSecApiHeaders as getSecApiHeadersInternal } from './filings/companyInfo';
import { getFilings, getFilingContent } from './filings/filingRetrieval';

// Import from API utilities
import { SEC_CONFIG } from '../config/sec';

// Import types
import { SecFiling } from '../types/sec';

// Import logger
import { logger } from '../lib/logging';

// Import company filings function
import { getCompanyFilings } from './company/filings';

/**
 * Gets the latest filings for a company
 * @param ticker Company ticker symbol
 * @param limit Maximum number of filings to return
 * @returns Array of latest filings
 */
export async function getLatestFilings(ticker: string, limit: number = 5): Promise<SecFiling[]> {
  try {
    console.log(`[DEBUG][secService] Getting latest filings for ${ticker}, limit: ${limit}`);
    logger.debug(`Getting latest filings for ${ticker}, limit: ${limit}`);
    
    // First, find the company by ticker
    console.log(`[DEBUG][secService] Finding company by ticker: ${ticker}`);
    const company = await findCompanyByTicker(ticker);
    
    if (!company) {
      console.log(`[ERROR][secService] Company with ticker ${ticker} not found`);
      throw new Error(`Company with ticker ${ticker} not found`);
    }
    
    console.log(`[DEBUG][secService] Found company: ${company.name} (CIK: ${company.cik})`);
    
    // Get company filings - pass the full company object
    console.log(`[DEBUG][secService] Getting filings for company: ${company.name} (CIK: ${company.cik})`);
    const filings = await getCompanyFilings(company);
    console.log(`[DEBUG][secService] Retrieved ${filings.length} filings for ${ticker}`);
    
    // Sort by filing date and take the most recent ones
    let latestFilings = filings
      .sort((a, b) => new Date(b.filingDate).getTime() - new Date(a.filingDate).getTime())
      .slice(0, limit);
    
    console.log(`[DEBUG][secService] Returning ${latestFilings.length} latest filings for ${ticker}`);
    if (latestFilings.length > 0) {
      console.log(`[DEBUG][secService] First filing: ${JSON.stringify(latestFilings[0])}`);
    }
    
    logger.debug(`Found ${latestFilings.length} latest filings for ${ticker}`);
    
    return latestFilings;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[ERROR][secService] Error getting latest filings for ${ticker}:`, errorMessage);
    if (error instanceof Error && error.stack) {
      console.error(`[ERROR][secService] Stack trace:`, error.stack);
    }
    
    logger.error(`Error getting latest filings for ${ticker}:`, { error: errorMessage });
    throw new Error(`Failed to get latest filings for ${ticker}`);
  }
}

/**
 * Gets the SEC API headers for making requests
 * @returns SEC API headers
 */
export function getSecApiHeaders() {
  return getSecApiHeadersInternal();
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
  
  // Filing retrieval
  getLatestFilingByFormType,
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
