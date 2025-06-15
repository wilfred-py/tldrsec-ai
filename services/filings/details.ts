import axios from 'axios';
import { secLogger } from '../../utils/logger';
import { SEC_CONFIG } from '../../config/sec';
import { SecCompanyInfo, SecFiling, SecFilingDetails } from '../../types/sec';
import { getCompanyFilings } from '../company/filings';

export const getLatestFilingByFormType = async (
  companyInfo: SecCompanyInfo,
  formType: string
): Promise<SecFilingDetails | null> => {
  try {
    const filings = await getCompanyFilings(companyInfo);
    const latestFiling = filings.find(f => f.formType === formType);

    if (!latestFiling) {
      secLogger.warn(`No ${formType} filing found for ${companyInfo.name}`);
      return null;
    }

    return await getFilingDetails(latestFiling);
  } catch (error) {
    secLogger.error(`Error getting latest ${formType} for ${companyInfo.name}:`, error);
    return null;
  }
};

export const getFilingDetails = async (filing: SecFiling): Promise<SecFilingDetails | null> => {
  try {
    const url = SEC_CONFIG.RAW_FILING_URL(filing.accessionNumber, filing.cik);
    const response = await axios.get(url, {
      headers: SEC_CONFIG.HEADERS
    });

    return {
      ...filing,
      content: response.data
    };
  } catch (error) {
    secLogger.error(`Error getting filing details for ${filing.accessionNumber}:`, error);
    return null;
  }
};
