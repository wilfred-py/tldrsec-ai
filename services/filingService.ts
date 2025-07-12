/**
 * Filing Service
 * 
 * This service has been refactored into modular components:
 * - Email generation: services/filings/email/emailGenerator.ts
 * - Email sending: services/filings/email/sendEmailSummary.ts
 * - Summary generation: services/filings/summaries/filingSummaryService.ts
 * - Form type utilities: services/filings/utils/formTypeUtils.ts
 * - Document scraping: services/filings/extractors/documentScraper.ts
 * - Database operations: services/filings/database/filingDatabase.ts
 * - Fallback summaries: services/filings/summaries/fallbackSummaryGenerator.ts
 */

// Import types
import { FilingType } from '../types/sec/filing';
import { FilingSummaryResult } from './filings/summaries/types';

// Import modular components
import { getFilingSummary as getFilingSummaryFromService } from './filings/summaries/filingSummaryService';
import { sendEmailSummary } from './filings/email/sendEmailSummary';
import { getFilingLogs } from './filings/database/filingDatabase';
import * as secService from './secService';

// Define the FilingService interface to properly type our service object
interface FilingService {
  getFilingLogs(): Promise<{ data: any }>;
  getFilingById(accessionNumber: string): Promise<any>;
  sendEmailSummary(email: string, tickers?: string[], debug?: boolean): Promise<any>;
  getFilingSummary(ticker: string, formType: FilingType): Promise<{ data: FilingSummaryResult | null, error?: string }>;
}

/**
 * Filing Service
 * 
 * Main service for handling SEC filing operations
 */
const filingService: FilingService = {
  // Get all filing logs
  getFilingLogs: async () => {
    try {
      const logs = await getFilingLogs(100);
      return { data: logs };
    } catch (error) {
      console.error(`[ERROR][FilingService] Error getting filing logs: ${error instanceof Error ? error.message : String(error)}`);
      return { data: [] };
    }
  },
  
  // Get filing summary for a ticker and form type
  getFilingSummary: async (ticker: string, formType: FilingType) => {
    // Call the imported getFilingSummaryFromService function
    return await getFilingSummaryFromService(ticker, formType);
  },
  
  // Get filing by ID
  getFilingById: async (accessionNumber: string) => {
    try {
      // Extract CIK from accessionNumber or use a default value
      // This is a workaround since we don't have the CIK directly
      const cik = accessionNumber.split('-')[0] || '0000000000';
      return secService.getFilingDetails(accessionNumber, cik);
    } catch (error) {
      console.error(`[ERROR][FilingService] Error getting filing by ID: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  },
  
  // Send an email summary of the latest filings
  sendEmailSummary: async (email: string, tickers: string[] = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'], debug: boolean = false) => {
    return sendEmailSummary(email, tickers, debug);
  }
};

// Export the filingService object as default
export default filingService;
