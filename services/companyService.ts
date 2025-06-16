import * as axios from 'axios';
import { secLogger } from '../utils/logger';
import { SEC_CONFIG } from '../config/sec';
import { FilingSearchResponse, SecCompanyInfo, SecFiling } from '../types/sec';

/**
 * Finds a company by ticker symbol
 * @param ticker Company ticker symbol
 * @returns Company info or null if not found
 */
export async function findCompanyByTicker(ticker: string): Promise<SecCompanyInfo | null> {
  try {
    // First get the CIK number for the ticker
    // Use axios.request with explicit typing to avoid TypeScript errors
    const tickerResponse = await axios.request({
      method: 'GET',
      url: `${SEC_CONFIG.BASE_URL}/cik-lookup-data.txt`,
      headers: SEC_CONFIG.HEADERS,
      responseType: 'text' // This tells axios to return the response as text
    });

    // Parse the response to find the CIK
    const tickerData = tickerResponse.data as string;
    const lines = tickerData.split('\n').filter((line: string) => line.includes(ticker.toUpperCase()));
    const tickerLine = lines[0];
    if (!tickerLine) {
      return null;
    }

    const cik = tickerLine.split(':')[1]?.trim();
    if (!cik) {
      return null;
    }

    // Get detailed company info
    const companyResponse = await axios.request({
      method: 'GET',
      url: `${SEC_CONFIG.BASE_URL}/submissions/CIK${cik.padStart(10, '0')}.json`,
      headers: SEC_CONFIG.HEADERS,
      responseType: 'json'
    });

    const filingSearchResponse = companyResponse.data as FilingSearchResponse;

    // Map to our company info format
    const companyInfo: SecCompanyInfo = {
      cik,
      name: filingSearchResponse.name,
      ticker: filingSearchResponse.tickers[0],
      exchange: filingSearchResponse.exchanges[0],
      filingSearchResponse
    };

    return companyInfo;

  } catch (error) {
    secLogger.error('Error finding company by ticker:', error);
    return null;
  }
}

/**
 * Gets company filings
 * @param company Company info
 * @returns Recent filings
 */
export async function getCompanyFilings(company: SecCompanyInfo): Promise<{ recentFilings: SecFiling[] }> {
  try {
    // If we have cached filing search response, use it
    if (company.filingSearchResponse) {
      const recentFilings = company.filingSearchResponse.filings.recent;
      
      // Map to our filing format
      const filings: SecFiling[] = recentFilings.accessionNumber.map((accessionNumber, index) => ({
        accessionNumber,
        filingDate: recentFilings.filingDate[index],
        form: recentFilings.form[index],
        reportDate: recentFilings.reportDate[index],
        primaryDocument: recentFilings.primaryDocument[index],
        primaryDocUrl: recentFilings.primaryDocUrl[index],
        filingUrl: recentFilings.filingUrl[index]
      }));

      return { recentFilings: filings };
    }

    // Get company filings from the SEC API
    const filingsResponse = await axios.request({
      method: 'GET',
      url: `${SEC_CONFIG.BASE_URL}/submissions/CIK${company.cik.padStart(10, '0')}.json`,
      headers: SEC_CONFIG.HEADERS,
      responseType: 'json'
    });

    const filingSearchResponse = filingsResponse.data as FilingSearchResponse;
    const recentFilings = filingSearchResponse.filings.recent;

    // Map to our filing format
    const filings: SecFiling[] = recentFilings.accessionNumber.map((accessionNumber, index) => ({
      accessionNumber,
      filingDate: recentFilings.filingDate[index],
      form: recentFilings.form[index],
      reportDate: recentFilings.reportDate[index],
      primaryDocument: recentFilings.primaryDocument[index],
      primaryDocUrl: recentFilings.primaryDocUrl[index],
      filingUrl: recentFilings.filingUrl[index]
    }));

    return { recentFilings: filings };

  } catch (error) {
    secLogger.error('Error getting company filings:', error);
    throw error;
  }
}
