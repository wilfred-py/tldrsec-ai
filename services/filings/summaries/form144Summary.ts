/**
 * Form 144 Summary Module
 * 
 * Provides functionality for generating summaries of Form 144 filings
 */

import { FilingSummary } from '../../../types/sec/filing';
import { CompanyInfo } from '../../../types/sec/company';
import { secLogger } from '../../../utils/logger';
import { SEC_CONFIG } from '../../../config/sec';
import { findCompanyByTicker } from '../../companyService';
import filingService from '../../filingService';
import { parseForm144 } from '../parsers/form144Parser';

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
    const filingDetails = await filingService.getFilingById(latestFiling.accessionNumber);
    if (!filingDetails || !filingDetails.data) {
      throw new Error(`Could not retrieve filing content for ${latestFiling.accessionNumber}`);
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

  } catch (error) {
    secLogger.error('Error in getForm144Summary:', error);
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
    if (!form144Data) {
      throw new Error(`Failed to parse Form 144 content for ${ticker}`);
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

  } catch (error) {
    secLogger.error(`Error getting Form 144 filing for ${ticker}:`, error);
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
    // Get company filings
    const filingResponse = await filingService.getFilingLogs();
    if (!filingResponse || !Array.isArray(filingResponse)) {
      throw new Error('Failed to retrieve filing logs');
    }

    // Filter filings by company and form type
    const companyFilings = filingResponse.filter(filing => 
      filing.ticker.toUpperCase() === (company.ticker || '').toUpperCase() && 
      filing.filingCode === formType
    );

    if (companyFilings.length === 0) {
      return null;
    }

    // Sort by filing date (newest first)
    companyFilings.sort((a, b) => 
      new Date(b.filingDate).getTime() - new Date(a.filingDate).getTime()
    );

    // Return the latest filing
    return {
      accessionNumber: companyFilings[0].id,
      companyName: company.name,
      filingDate: companyFilings[0].filingDate,
      content: companyFilings[0].content || ''
    };
  } catch (error) {
    secLogger.error(`Error getting latest ${formType} filing:`, error);
    return null;
  }
}
