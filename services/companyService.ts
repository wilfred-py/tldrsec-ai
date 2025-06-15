import axios from 'axios';
import { secLogger } from '../lib/logger';
import { SEC_API_CONFIG } from '../config/sec';
import { FilingSearchResponse, SecCompanyInfo, SecFiling } from '../types/sec';

/**
 * Finds a company by ticker symbol
 * @param ticker Company ticker symbol
 * @returns Company info or null if not found
 */
export async function findCompanyByTicker(ticker: string): Promise<SecCompanyInfo | null> {
  try {
    // First get the CIK number for the ticker
    const tickerResponse = await axios.get(
      `${SEC_API_CONFIG.BASE_URL}/cik-lookup-data.txt`,
      {
        headers: SEC_API_CONFIG.HEADERS,
        transformResponse: [(data) => data] // Prevent JSON parsing
      }
    );

    // Parse the response to find the CIK
    const lines = tickerResponse.data.split('\n');
    const tickerLine = lines.find(line => line.toLowerCase().includes(ticker.toLowerCase()));
    if (!tickerLine) {
      return null;
    }

    const cik = tickerLine.split(':')[1]?.trim();
    if (!cik) {
      return null;
    }

    // Get detailed company info
    const companyResponse = await axios.get(
      `${SEC_API_CONFIG.BASE_URL}/submissions/CIK${cik.padStart(10, '0')}.json`,
      {
        headers: SEC_API_CONFIG.HEADERS,
        transformResponse: [(data) => {
          const parsed = JSON.parse(data);
          return parsed;
        }]
      }
    );

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

    // Otherwise fetch filing data
    const response = await axios.get(
      `${SEC_API_CONFIG.BASE_URL}/submissions/CIK${company.cik.padStart(10, '0')}.json`,
      {
        headers: SEC_API_CONFIG.HEADERS,
        transformResponse: [(data) => {
          const parsed = JSON.parse(data);
          return parsed;
        }]
      }
    );

    const filingSearchResponse = response.data as FilingSearchResponse;
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
