import axios from 'axios';
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
    console.log(`[DEBUG][companyService] Finding company by ticker: ${ticker}`);
    
    // First get the CIK number for the ticker using the correct endpoint
    // Use axios.request with explicit typing to avoid TypeScript errors
    console.log(`[DEBUG][companyService] Fetching CIK lookup data from SEC API using ${SEC_CONFIG.COMPANY_SEARCH_URL}`);
    const tickerResponse = await axios.request({
      method: 'GET',
      url: SEC_CONFIG.COMPANY_SEARCH_URL,
      headers: SEC_CONFIG.HEADERS,
      responseType: 'text' // This tells axios to return the response as text
    });

    // Parse the response to find the CIK
    console.log(`[DEBUG][companyService] Parsing CIK lookup response (length: ${(tickerResponse.data as string)?.length || 0} chars)`);
    const tickerData = tickerResponse.data as string;
    
    // The format of ticker.txt is: ticker	CIK (CIK may have leading zeros)
    // We need to find the line that contains our ticker (case insensitive)
    
    // Search for the ticker in a case-insensitive way
    const tickerUpperCase = ticker.toUpperCase();
    const lines = tickerData.split('\n').filter((line: string) => {
      const parts = line.split('\t');
      return parts[0]?.toUpperCase() === tickerUpperCase;
    });
    console.log(`[DEBUG][companyService] Found ${lines.length} matching lines for ticker ${ticker.toUpperCase()}`);
    
    const tickerLine = lines[0];
    if (!tickerLine) {
      console.log(`[ERROR][companyService] No matching ticker found for ${ticker.toUpperCase()}`);
      return null;
    }
    console.log(`[DEBUG][companyService] Ticker line: ${tickerLine}`);

    // Extract CIK from the line (format is TICKER\tCIK)
    const parts = tickerLine.split('\t');
    const cik = parts[1]?.trim();
    if (!cik) {
      console.log(`[ERROR][companyService] Could not extract CIK from ticker line`);
      return null;
    }
    console.log(`[DEBUG][companyService] Extracted CIK: ${cik}`);

    // Get detailed company info
    console.log(`[DEBUG][companyService] Fetching company details for CIK: ${cik}`);
    const companyResponse = await axios.request({
      method: 'GET',
      url: `${SEC_CONFIG.BASE_URL}/submissions/CIK${cik.padStart(10, '0')}.json`,
      headers: SEC_CONFIG.HEADERS,
      responseType: 'json'
    });

    console.log(`[DEBUG][companyService] Received company details response`);
    const filingSearchResponse = companyResponse.data as FilingSearchResponse;

    // Map to our company info format
    const companyInfo: SecCompanyInfo = {
      cik,
      name: filingSearchResponse.name,
      ticker: filingSearchResponse.tickers[0],
      exchange: filingSearchResponse.exchanges[0],
      filingSearchResponse
    };

    console.log(`[DEBUG][companyService] Returning company info for ${companyInfo.name} (CIK: ${companyInfo.cik})`);
    return companyInfo;

  } catch (error) {
    console.error(`[ERROR][companyService] Error finding company by ticker ${ticker}:`, error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.error(`[ERROR][companyService] Stack trace:`, error.stack);
    }
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
