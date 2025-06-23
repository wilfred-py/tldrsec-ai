import axios from 'axios';
import { secLogger } from '../../utils/logger';
import { SEC_CONFIG } from '../../config/sec';
import { CompanyInfo } from '../../types/sec';

export const findCompanyByTicker = async (ticker: string): Promise<CompanyInfo | null> => {
  try {
    const response = await axios.get(SEC_CONFIG.COMPANY_SEARCH_URL, {
      headers: SEC_CONFIG.HEADERS
    });

    const lines = response.data.split('\n');
    const tickerLine = lines.find(line => line.toLowerCase().startsWith(ticker.toLowerCase()));
    
    if (!tickerLine) {
      secLogger.warn(`No company found for ticker ${ticker}`);
      return null;
    }

    const [foundTicker, cik] = tickerLine.split('\t');
    if (!cik) {
      secLogger.warn(`No CIK found for ticker ${ticker}`);
      return null;
    }

    return {
      cik: cik.padStart(10, '0'),
      ticker: foundTicker,
      name: '' // Name will be populated from company info
    };
  } catch (error) {
    secLogger.error(`Error finding company by ticker ${ticker}:`, error);
    return null;
  }
};
