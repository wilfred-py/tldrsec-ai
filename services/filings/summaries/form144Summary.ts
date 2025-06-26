/**
 * Form 144 Summary Module
 * 
 * Provides functionality for generating summaries of Form 144 filings
 */

import { FilingSummary } from '../../../types/sec/filing';
import { CompanyInfo } from '../../../types/sec/company';
import { logger as secLogger } from '../../../lib/logging';
import filingService from '../../filingService';
import { findCompanyByTicker } from '../../companyService';
import { getCompanyFilings } from '../../company/filings';
import { SecFiling, SecCompanyInfo } from '../../../types/sec';
import { parseForm144 } from '../parsers/form144Parser';
import { SEC_CONFIG } from '../../../config/sec';

/**
 * Gets a Form 144 summary for a given company
 * @param ticker Company ticker symbol
 * @returns Form 144 filing summary
 */
export async function getForm144Summary(ticker: string): Promise<FilingSummary> {
  try {
    // Get company info by ticker
    const companyInfo = await findCompanyByTicker(ticker) as CompanyInfo;
    if (!companyInfo) {
      throw new Error(`Company not found for ticker: ${ticker}`);
    }

    // Get latest Form 144 filing
    const latestFiling = await getLatestForm144Filing(ticker);
    if (!latestFiling) {
      throw new Error(`No Form 144 filing found for ${ticker}`);
    }

    // Get full filing details with content
    let filingDetails;
    try {
      filingDetails = await filingService.getFilingById(latestFiling.accessionNumber);
      if (!filingDetails || !filingDetails.data) {
        secLogger.warn(`Could not retrieve filing content for ${latestFiling.accessionNumber}, using fallback data`);
        // Create fallback filing details with available data
        filingDetails = {
          data: {
            filingDate: latestFiling.filingDate || new Date().toISOString().split('T')[0],
            metadata: {
              companyName: companyInfo.name,
              cik: companyInfo.cik
            }
          }
        };
      }
    } catch (error) {
      secLogger.error(`Error retrieving filing content for ${latestFiling.accessionNumber}:`, { error });
      // Create fallback filing details with available data
      filingDetails = {
        data: {
          filingDate: latestFiling.filingDate || new Date().toISOString().split('T')[0],
          metadata: {
            companyName: companyInfo.name,
            cik: companyInfo.cik
          }
        }
      };
    }

    // Generate filing summary
    const summary: FilingSummary = {
      ticker,
      companyName: companyInfo.name,
      filingType: 'Form 144',
      filingDate: filingDetails.data.filingDate,
      summaryText: latestFiling.description || '',
      keyPoints: latestFiling.keyPoints || [],
      // FilingLog doesn't have filingUrl property directly, so construct it
      filingUrl: `${SEC_CONFIG.BASE_URL}/Archives/edgar/data/${companyInfo.cik}/${latestFiling.accessionNumber.replace(/-/g, '')}/index.htm`,
      url: `${SEC_CONFIG.BASE_URL}/Archives/edgar/data/${companyInfo.cik}/${latestFiling.accessionNumber.replace(/-/g, '')}/index.htm`,
      rawData: latestFiling.parsedContent
    };

    return summary;

  } catch (error: unknown) {
    secLogger.error('Error in getForm144Summary:', { error });
    throw error;
  }
}

/**
 * Gets the latest Form 144 filing for a company
 * @param ticker Company ticker symbol
 * @returns Latest Form 144 filing with parsed content
 */
async function getLatestForm144Filing(ticker: string) {
  try {
    // Get company info first
    const company = await findCompanyByTicker(ticker);
    if (!company) {
      throw new Error(`Company not found for ticker ${ticker}`);
    }

    // Get latest Form 144 filing
    const filingDetails = await getLatestFilingByFormType(company, '144');
    if (!filingDetails) {
      throw new Error(`No Form 144 filings found for ${ticker}`);
    }

    // Parse Form 144 content
    const form144Data = await parseForm144(filingDetails);
    // Even if parsing fails, parseForm144 now returns a fallback object with basic information
    // so we should never get null here, but let's handle it just in case
    if (!form144Data) {
      secLogger.warn(`Failed to parse Form 144 content for ${ticker}, using fallback summary`);
      // Create a minimal fallback object
      return {
        ...filingDetails,
        description: `Form 144 filing for ${filingDetails.companyName} indicates an intent to sell securities by an insider.`,
        keyPoints: [
          `Filing Date: ${filingDetails.filingDate}`,
          `Company: ${filingDetails.companyName}`
        ],
        parsedContent: {
          reportingPerson: 'Unknown',
          reportingPersonTitle: 'Unknown',
          relationshipToIssuer: 'Insider',
          dateOfSale: filingDetails.filingDate,
          amountOfSecurities: 'Unknown',
          proposedSaleDate: filingDetails.filingDate,
          broker: 'Unknown',
          note: `This Form 144 filing could not be automatically parsed. It indicates an intent to sell securities by an insider.`
        },
        accessionNumber: filingDetails.accessionNumber
      };
    }

    // Generate summary
    const summaryText = `Form 144 filing from ${form144Data.reportingPerson} (${form144Data.reportingPersonTitle}) ` +
      `indicates a proposed sale of ${form144Data.amountOfSecurities} securities. ` +
      `The reporting person's relationship to the issuer is ${form144Data.relationshipToIssuer}. ` +
      `The proposed sale date is ${form144Data.proposedSaleDate} through broker ${form144Data.broker}.`;

    const keyPoints = [
      `Filing Date: ${filingDetails.filingDate}`,
      `Reporting Person: ${form144Data.reportingPerson}`,
      `Title: ${form144Data.reportingPersonTitle}`,
      `Relationship: ${form144Data.relationshipToIssuer}`,
      `Amount: ${form144Data.amountOfSecurities}`,
      `Sale Date: ${form144Data.dateOfSale}`,
      `Broker: ${form144Data.broker}`,
      form144Data.note ? `Note: ${form144Data.note}` : null
    ].filter(Boolean) as string[];

    return {
      ...filingDetails,
      description: summaryText,
      keyPoints,
      parsedContent: form144Data,
      accessionNumber: filingDetails.accessionNumber
    };

  } catch (error: unknown) {
    secLogger.error(`Error getting Form 144 filing for ${ticker}:`, { error });
    throw error;
  }
}

/**
 * Gets the latest filing by form type
 * @param company The company information
 * @param formType The form type to search for
 * @returns The latest filing by form type
 */
export async function getLatestFilingByFormType(company: CompanyInfo, formType: string) {
  try {
    secLogger.debug(`Getting latest ${formType} filing for ${company.name} (${company.ticker || company.cik})`);
    
    // Convert CompanyInfo to SecCompanyInfo for getCompanyFilings
    const secCompany: SecCompanyInfo = {
      cik: company.cik,
      ticker: company.ticker || '',
      name: company.name,
      exchange: 'UNKNOWN' // CompanyInfo doesn't have exchange property, so provide a default
    };
    
    // Get company filings directly from SEC API using getCompanyFilings
    const filings = await getCompanyFilings(secCompany);
    secLogger.debug(`Retrieved ${filings.length} filings for ${company.name}`);
    
    // Normalize the form type for comparison (handle variations like '25-NSE' vs '25')
    let normalizedFormType = formType;
    if (formType.includes('144') || formType === 'Form 144') {
      normalizedFormType = '144';
    } else if (formType.includes('25-NSE') || formType === '25') {
      normalizedFormType = '25-NSE';
    }
    
    // Filter filings by form type, handling variations
    const matchingFilings = filings.filter((filing: SecFiling) => {
      // Check if filing.form matches formType or normalized variations
      const filingForm = filing.form;
      return filingForm === formType || 
             filingForm === normalizedFormType || 
             (normalizedFormType === '25-NSE' && filingForm.includes('25')) ||
             (normalizedFormType === '144' && filingForm.includes('144'));
    });
    
    secLogger.debug(`Found ${matchingFilings.length} ${formType} filings for ${company.name}`);
    
    if (matchingFilings.length === 0) {
      secLogger.warn(`No ${formType} filings found for ${company.name}`);
      return null;
    }
    
    // Sort by filing date (newest first)
    matchingFilings.sort((a: SecFiling, b: SecFiling) => 
      new Date(b.filingDate).getTime() - new Date(a.filingDate).getTime()
    );
    
    const latestFiling = matchingFilings[0];
    secLogger.debug(`Latest ${formType} filing: ${JSON.stringify({
      accessionNumber: latestFiling.accessionNumber,
      filingDate: latestFiling.filingDate,
      form: latestFiling.form
    })}`);
    
    // Return a more complete filing object that includes all necessary fields
    return {
      accessionNumber: latestFiling.accessionNumber,
      companyName: company.name,
      filingDate: latestFiling.filingDate,
      form: latestFiling.form,
      content: '', // This will be populated later if needed
      primaryDocument: latestFiling.primaryDocument || '',
      primaryDocUrl: latestFiling.primaryDocUrl || '',
      filingUrl: latestFiling.filingUrl || ''
    };
  } catch (error: unknown) {
    secLogger.error(`Error getting latest ${formType} filing for ${company.name}:`, { error });
    return null;
  }
}
