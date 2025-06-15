import axios from 'axios';
import { secLogger } from '../../utils/logger';
import { SEC_CONFIG } from '../../config/sec';
import { SecCompanyInfo, SecFiling } from '../../types/sec';

export const getCompanyFilings = async (companyInfo: SecCompanyInfo): Promise<SecFiling[]> => {
  try {
    const url = SEC_CONFIG.SUBMISSIONS_URL(companyInfo.cik);
    const response = await axios.get(url, {
      headers: SEC_CONFIG.HEADERS
    });

    if (!response.data?.filings?.recent) {
      secLogger.warn(`No recent filings found for ${companyInfo.name}`);
      return [];
    }

    const recent = response.data.filings.recent;
    const filings: SecFiling[] = [];

    for (let i = 0; i < recent.accessionNumber.length; i++) {
      filings.push({
        accessionNumber: recent.accessionNumber[i],
        filingDate: recent.filingDate[i],
        formType: recent.form[i],
        cik: companyInfo.cik,
        companyName: companyInfo.name
      });
    }

    return filings;
  } catch (error) {
    secLogger.error(`Error getting filings for ${companyInfo.name}:`, error);
    return [];
  }
};
