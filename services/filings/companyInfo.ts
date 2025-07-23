/**
 * SEC Company Information Module
 * 
 * Provides functions for retrieving company information from SEC EDGAR database
 */

import { logger } from '../../lib/logging';
import { SEC_CONFIG } from '../../config/sec';
import axios from 'axios';
import { SECEdgarClient } from '../../lib/sec-edgar/client';

/**
 * Company information interface
 */
export interface CompanyInfo {
  ticker: string;
  name: string;
  cik: string;
}

/**
 * Get company information by ticker symbol
 * @param ticker Company ticker symbol
 * @returns Company information or null if not found
 */
export async function getCompanyInfo(ticker: string): Promise<CompanyInfo | null> {
  try {
    logger.debug(`Getting company information for ticker ${ticker}`);
    
    // Create SEC client with proper config that matches SECEdgarConfig type
    const secEdgarConfig = {
      userAgent: SEC_CONFIG.HEADERS['User-Agent'],
      maxRequestsPerSecond: 10, // SEC fair access policy limit
      baseUrl: 'https://www.sec.gov',
      maxRetries: 3,
      retryDelay: 1000
    };
    const secClient = new SECEdgarClient(secEdgarConfig);
    
    // Normalize ticker (uppercase)
    const normalizedTicker = ticker.toUpperCase();
    
    // Build the URL for the SEC ticker lookup API
    const url = `https://www.sec.gov/files/company_tickers.json`;
    
    logger.debug(`Fetching company tickers from ${url}`);
    
    // Get the headers for SEC API
    const headers = getSecApiHeaders();
    
    // Make the request
    const response = await axios.get(url, { headers });
    
    if (!response.data) {
      logger.warn(`No company data found`);
      return null;
    }
    
    // The SEC API returns an object with numeric keys, each containing company info
    // We need to find the one matching our ticker
    const companies = Object.values(response.data);
    const company = companies.find((c: any) => c.ticker === normalizedTicker);
    
    if (!company) {
      logger.warn(`No company found for ticker ${ticker}`);
      return null;
    }
    
    // Format the CIK with leading zeros (10 digits)
    const paddedCik = String(company.cik_str).padStart(10, '0');
    
    logger.debug(`Found company ${company.title} with CIK ${paddedCik} for ticker ${ticker}`);
    
    return {
      ticker: normalizedTicker,
      name: company.title,
      cik: paddedCik
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting company information for ${ticker}:`, { error: errorMessage });
    throw new Error(`Failed to get company information for ${ticker}: ${errorMessage}`);
  }
}

/**
 * Get SEC API headers for making requests
 * @returns SEC API headers
 */
export function getSecApiHeaders() {
  return SEC_CONFIG.HEADERS || {};
}
