import axios from 'axios';
import { secLogger } from '../../utils/logger';
import { SEC_CONFIG } from '../../config/sec';
import { SecCompanyInfo, SecFiling, FilingSearchResponse } from '../../types/sec';

export const getCompanyFilings = async (companyInfo: SecCompanyInfo): Promise<SecFiling[]> => {
  try {
    const url = SEC_CONFIG.SUBMISSIONS_URL(companyInfo.cik);
    secLogger.debug(`Fetching filings from: ${url}`);
    
    const response = await axios.get<FilingSearchResponse>(url, {
      headers: SEC_CONFIG.HEADERS
    });

    // Log the response structure to debug
    secLogger.debug(`SEC API response received for ${companyInfo.name} (CIK: ${companyInfo.cik})`);
    secLogger.debug(`Response status: ${response.status}`);
    secLogger.debug(`Response data keys: ${Object.keys(response.data).join(', ')}`);
    
    // Type assertion to ensure TypeScript knows the structure
    const responseData = response.data as FilingSearchResponse;
    
    // More detailed logging
    if (responseData.filings) {
      secLogger.debug(`Filing keys: ${Object.keys(responseData.filings).join(', ')}`);
      
      if (responseData.filings.recent) {
        secLogger.debug(`Recent filings keys: ${Object.keys(responseData.filings.recent).join(', ')}`);
        secLogger.debug(`Recent filings array lengths: ${JSON.stringify({
          accessionNumber: responseData.filings.recent.accessionNumber?.length || 0,
          filingDate: responseData.filings.recent.filingDate?.length || 0,
          form: responseData.filings.recent.form?.length || 0
        })}`);
      } else {
        secLogger.warn(`No 'recent' property in filings for ${companyInfo.name}`);
      }
    } else {
      secLogger.warn(`No 'filings' property in response data for ${companyInfo.name}`);
    }
    
    if (!responseData.filings?.recent) {
      secLogger.warn(`No recent filings found for ${companyInfo.name}`);
      return [];
    }

    const recent = responseData.filings.recent;
    const filings: SecFiling[] = [];

    secLogger.debug(`Processing ${recent.accessionNumber.length} filings for ${companyInfo.name}`);
    
    for (let i = 0; i < recent.accessionNumber.length; i++) {
      const accessionNumber = recent.accessionNumber[i];
      const formType = recent.form[i];
      const primaryDocument = recent.primaryDocument?.[i] || '';
      
      // Construct URLs based on SEC EDGAR patterns
      // Format: https://www.sec.gov/Archives/edgar/data/CIK/ACCESSION/FILENAME
      // Replace dashes with empty string in accessionNumber
      const formattedAccessionNumber = accessionNumber.replace(/-/g, '');
      const cik = companyInfo.cik.padStart(10, '0');
      
      // Construct the filing URL and primary document URL
      const baseUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${formattedAccessionNumber}`;
      const filingUrl = baseUrl;
      const primaryDocUrl = primaryDocument ? `${baseUrl}/${primaryDocument}` : '';
      
      secLogger.debug(`Filing ${i+1}/${recent.accessionNumber.length}: ${formType} (${recent.filingDate[i]})`);
      
      // Create a filing object with only the properties defined in the SecFiling interface
      filings.push({
        accessionNumber,
        filingDate: recent.filingDate[i],
        form: formType,
        primaryDocument,
        primaryDocUrl,
        filingUrl,
        // Optional properties
        reportDate: recent.reportDate?.[i],
        description: recent.primaryDocDescription?.[i]
      });
    }
    
    secLogger.debug(`Successfully processed ${filings.length} filings for ${companyInfo.name}`);
    if (filings.length > 0) {
      secLogger.debug(`Sample filing: ${JSON.stringify(filings[0])}`);
    }

    return filings;
  } catch (error) {
    secLogger.error(`Error getting filings for ${companyInfo.name}:`, error);
    return [];
  }
};
