import { DOMParser } from '@xmldom/xmldom';
import { secLogger } from '../utils/logger';
import { SecFiling, SecFilingDetails, SecFilingDocument } from '../types/sec/filing';
import { CompanyInfo } from '../types/sec/company';
import { findCompanyByTicker } from './companyService';
import filingService from './filingService';
import { SEC_CONFIG } from '../config/sec';

interface FilingLog {
  id: string;
  ticker: string;
  company: string;
  filingName: string;
  filingCode: string;
  filingDate: string;
  status: string;
  details?: {
    content?: string;
    documents?: Array<{
      type: string;
      content: string;
      filename?: string;
      description?: string;
    }>;
  };
}

interface ParsedFilingContent {
  error?: string;
  details?: string;
  issuerName: string;
  issuerTicker?: string;
  securityTitle?: string;
  reportingPerson?: string;
  reportingPersonTitle?: string;
  relationshipToIssuer?: string;
  dateOfSale: string;
  amountOfSecurities?: string;
  proposedSaleDate?: string;
  broker?: string;
  note?: string;
  sharesOutstanding?: string;
  aggregateMarketValue?: string;
}

interface FilingDocument {
  type: string;
  content: string;
}

interface ExtendedSecFilingDetails extends SecFilingDetails {
  documents?: SecFilingDocument[];
  companyName: string;
  filingDate: string;
  formType: string;
  cik: string;
  content: string;
}

/**
 * Extracts Form 144 information from a filing
 * @param filing The filing details
 * @returns Parsed Form 144 data
 */
export async function parseForm144(filing: ExtendedSecFilingDetails): Promise<ParsedFilingContent> {
  try {
    // Find the XML document in the filing
    const xmlDoc = filing.documents?.find(doc => 
      doc.type === 'FORM144' && doc.content?.includes('<XML>')
    );

    if (!xmlDoc) {
      throw new Error('No XML document found in Form 144 filing');
    }

    // Extract XML content
    const xmlMatch = xmlDoc.content?.match(/<XML>([\s\S]*?)<\/XML>/i);
    if (!xmlMatch || !xmlMatch[1]) {
      throw new Error('No XML content found in Form 144 filing');
    }

    const xmlContent = xmlMatch[1].trim();

    // Parse XML content
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, 'text/xml');

    // Helper function to get text content from XML element
    const getElementText = (elementName: string): string | undefined => {
      const element = doc.getElementsByTagName(elementName)[0];
      return element?.textContent?.trim();
    };

    // Extract data from XML
    const parsedContent: ParsedFilingContent = {
      error: undefined,
      details: undefined,
      issuerName: getElementText('issuerName') || filing.companyName,
      issuerTicker: getElementText('issuerTicker'),
      securityTitle: getElementText('securityTitle'),
      reportingPerson: getElementText('reportingPerson'),
      reportingPersonTitle: getElementText('reportingPersonTitle'),
      relationshipToIssuer: getElementText('relationshipToIssuer'),
      dateOfSale: getElementText('dateOfSale') || filing.filingDate,
      amountOfSecurities: getElementText('amountOfSecurities'),
      proposedSaleDate: getElementText('proposedSaleDate'),
      broker: getElementText('broker'),
      note: undefined,
      sharesOutstanding: getElementText('noOfUnitsOutstanding'),
      aggregateMarketValue: getElementText('aggregateMarketValue'),
    };

    return parsedContent;

  } catch (error) {
    return {
      error: 'Failed to parse Form 144 filing',
      details: error instanceof Error ? error.message : String(error),
      issuerName: filing.companyName,
      issuerTicker: undefined,
      securityTitle: undefined,
      reportingPerson: undefined,
      reportingPersonTitle: undefined,
      relationshipToIssuer: undefined,
      dateOfSale: filing.filingDate,
      amountOfSecurities: undefined,
      proposedSaleDate: undefined,
      broker: undefined,
      note: 'Limited information available - parsing error'
    };
  }
}

/**
 * Gets the latest Form 144 filing for a company
 * @param ticker Company ticker symbol
 * @returns Latest Form 144 filing with parsed content
 */
export async function getLatestForm144(ticker: string): Promise<SecFiling> {
  try {
    // Get company info first
    const company = await findCompanyByTicker(ticker) as CompanyInfo;
    if (!company) {
      throw new Error(`Company with ticker ${ticker} not found`);
    }

    // Get company filings
    const filings = await filingService.getFilingLogs();
    if (!filings?.data) {
      throw new Error(`No filings found for ${ticker}`);
    }
    
    // Find the latest Form 144 filing for this company
    const latestForm144 = filings.data.find(filing => 
      filing.filingCode === 'Form 144' && 
      filing.company === company.name
    );
    if (!latestForm144) {
      throw new Error(`No Form 144 filings found for ${ticker}`);
    }
    
    // Get filing details
    const filingResponse = await filingService.getFilingById(latestForm144.accessionNumber);
if (!filingResponse?.data) {
  throw new Error(`Could not retrieve filing details for ${latestForm144.accessionNumber}`);
}

const filingDetails: ExtendedSecFilingDetails = {
  ...filingResponse.data,
  companyName: company.name || ticker,
  filingDate: latestForm144.filingDate,
  accessionNumber: latestForm144.accessionNumber,
  content: filingResponse.data.content || '',
  formType: 'Form 144',
  cik: company.cik,
  documents: (filingResponse.data.documents || []).map(doc => ({
    type: doc.type || '',
    content: doc.content || '',
    filename: doc.filename || '',
    description: doc.description || ''
  }))
};
    if (!filingDetails) {
      throw new Error(`Could not retrieve filing details for ${latestForm144.accessionNumber}`);
    }
    
    // Parse Form 144 data
    let form144Data: ParsedFilingContent;
    try {
      form144Data = await parseForm144(filingDetails);
    } catch (parseError) {
      secLogger.warn(`Error parsing Form 144 for ${ticker}, using fallback data:`, parseError);
      // Provide fallback data if parsing fails
      form144Data = {
        error: 'Failed to parse Form 144 filing',
        details: parseError instanceof Error ? parseError.message : String(parseError),
        issuerName: filingDetails.companyName,
        issuerTicker: ticker,
        securityTitle: 'Company Securities',
        reportingPerson: 'Company Insider',
        reportingPersonTitle: '',
        relationshipToIssuer: '',
        dateOfSale: filingDetails.filingDate,
        amountOfSecurities: '',
        proposedSaleDate: '',
        broker: '',
        note: 'Limited information available - parsing error'
      };
    }

    // Generate a summary
    const summaryText = form144Data.error 
      ? `This Form 144 filing from ${filingDetails.companyName} (${ticker}) indicates a proposed sale of securities by an insider. Form 144 is a notice of the intent to sell restricted securities, typically by company executives or directors. The filing from ${latestForm144.filingDate} shows that a company insider is planning to sell shares in the near future. This is a routine filing required by the SEC when insiders plan to sell a significant amount of company stock.`
      : `This Form 144 filing indicates that ${form144Data.reportingPerson || 'an insider'} (${form144Data.reportingPersonTitle || 'company insider'}) of ${form144Data.issuerName || filingDetails.companyName} (${ticker}) intends to sell ${form144Data.amountOfSecurities || 'a portion'} of ${form144Data.securityTitle || 'company securities'}. The proposed sale date is ${form144Data.proposedSaleDate || 'in the near future'} through ${form144Data.broker || 'a broker'}. Form 144 is required when affiliates of the company intend to sell restricted or control securities.`;
    
    // Generate key points
    const keyPoints = [
      `Filing Date: ${filingDetails.filingDate}`,
      `Company: ${filingDetails.companyName} (${ticker})`,
      `Form Type: Form 144`,
      `Purpose: Notice of proposed sale of securities`,
      form144Data.reportingPerson ? `Reporting Person: ${form144Data.reportingPerson}` : null,
      form144Data.reportingPersonTitle ? `Title: ${form144Data.reportingPersonTitle}` : null,
      form144Data.amountOfSecurities ? `Amount: ${form144Data.amountOfSecurities}` : null,
      form144Data.proposedSaleDate ? `Proposed Sale Date: ${form144Data.proposedSaleDate}` : null,
      form144Data.broker ? `Broker: ${form144Data.broker}` : null
    ].filter(Boolean) as string[];

    const result: SecFiling & {
      description: string;
      keyPoints: string[];
      parsedContent: ParsedFilingContent;
    } = {
      ...latestForm144,
      description: summaryText,
      keyPoints,
      parsedContent: form144Data,
      form: 'Form 144',
      filingDate: latestForm144.filingDate,
      accessionNumber: latestForm144.id,
      content: filingResponse.data.details?.content || '',
      companyName: company.name
    };
    
    return result;

  } catch (error) {
    secLogger.error('Error getting Form 144 filing:', error);
    throw error;
  }
}
