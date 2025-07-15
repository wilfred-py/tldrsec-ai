/**
 * SEC EDGAR API Constants
 */

// Base URL for SEC EDGAR API
export const SEC_EDGAR_BASE_URL = 'https://www.sec.gov';

// SEC EDGAR API endpoints
export const SEC_EDGAR_ENDPOINTS = {
  COMPANY_TICKERS: `${SEC_EDGAR_BASE_URL}/include/ticker.txt`,
  COMPANY_FACTS: (cik: string) => `${SEC_EDGAR_BASE_URL}/Archives/edgar/data/${cik}/index.json`,
  COMPANY_SUBMISSIONS: (cik: string) => `${SEC_EDGAR_BASE_URL}/Archives/edgar/data/${cik}/submissions.json`,
  FILING_DETAILS: (cik: string, accessionNumber: string) => 
    `${SEC_EDGAR_BASE_URL}/Archives/edgar/data/${cik}/${accessionNumber.replace(/-/g, '')}/0000000000-00-000000.txt`
};

// SEC EDGAR API rate limits
export const SEC_EDGAR_RATE_LIMITS = {
  MAX_REQUESTS_PER_SECOND: 10,
  DELAY_BETWEEN_REQUESTS_MS: 100
};

// SEC EDGAR API user agent
export const SEC_EDGAR_USER_AGENT = 'TLDRSec Filing Analyzer (support@tldrsec.app)';
