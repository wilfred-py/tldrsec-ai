import { findCompanyByTicker } from '../companyService';
import { getCompanyFilings } from './filings';
import { SecFiling } from '../../types/sec';
import { logger } from '../../lib/logging';

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
