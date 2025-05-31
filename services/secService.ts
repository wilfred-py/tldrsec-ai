/**
 * SEC EDGAR API Service
 * Provides functions to interact with the SEC EDGAR database
 */

import axios from 'axios';
import { load } from 'cheerio';

// Types for SEC API responses
export interface SecCompanyInfo {
  cik: string;
  name: string;
  tickers?: string[];
}

export interface SecFiling {
  accessionNumber: string;
  filingDate: string;
  reportDate?: string;
  form: string;
  primaryDocument: string;
  primaryDocUrl: string;
  filingUrl: string;
  description?: string;
}

export interface SecFilingDetails {
  accessionNumber: string;
  cik: string;
  companyName: string;
  form: string;
  filingDate: string;
  reportDate?: string;
  primaryDocument: string;
  documents: SecDocument[];
  parsedContent?: any; // This will hold parsed content specific to form types
}

export interface SecDocument {
  fileName: string;
  description: string;
  documentUrl: string;
  type: string;
  size: number;
}

/**
 * SEC API configuration
 */
const SEC_API_CONFIG = {
  baseUrl: 'https://data.sec.gov',
  companySearchUrl: 'https://www.sec.gov/include/ticker.txt',
  submissionsUrl: (cik: string) => `https://data.sec.gov/submissions/CIK${cik}.json`,
  filingUrl: (accessionNumber: string, cik: string) => 
    `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNumber.replace(/-/g, '')}/${accessionNumber}.txt`,
  headers: {
    'User-Agent': 'tldrSEC/1.0 (contact@tldrsec.app)',
    'Accept-Encoding': 'gzip, deflate',
  },
  // Rate limiting - SEC allows 10 requests per second
  maxRequestsPerSecond: 10,
};

/**
 * Formats a CIK number to 10 digits with leading zeros
 */
export function formatCik(cik: string | number): string {
  return cik.toString().padStart(10, '0');
}

/**
 * Searches for a company by ticker symbol
 * @param ticker The ticker symbol to search for
 * @returns Company information including CIK
 */
export async function findCompanyByTicker(ticker: string): Promise<SecCompanyInfo | null> {
  try {
    // SEC provides a simple ticker-to-CIK mapping file
    const response = await axios.get(SEC_API_CONFIG.companySearchUrl, {
      headers: SEC_API_CONFIG.headers,
    });

    // Parse the ticker-to-CIK mapping file
    const lines = response.data.split('\n');
    for (const line of lines) {
      const [tickerFromFile, cik] = line.split('\t');
      if (tickerFromFile && tickerFromFile.toUpperCase() === ticker.toUpperCase() && cik) {
        return {
          cik: formatCik(cik),
          name: '', // Name will be populated from submissions API
          tickers: [ticker.toUpperCase()],
        };
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error finding company by ticker:', error);
    throw new Error(`Failed to find company with ticker ${ticker}`);
  }
}

/**
 * Gets company information and recent filings
 * @param cik The CIK number of the company
 * @returns Company information and recent filings
 */
export async function getCompanyFilings(cik: string): Promise<{
  companyInfo: SecCompanyInfo;
  recentFilings: SecFiling[];
}> {
  try {
    const formattedCik = formatCik(cik);
    const url = SEC_API_CONFIG.submissionsUrl(formattedCik);
    
    const response = await axios.get(url, {
      headers: SEC_API_CONFIG.headers,
    });
    
    const data = response.data;
    
    // Extract company info
    const companyInfo: SecCompanyInfo = {
      cik: formattedCik,
      name: data.name || '',
      tickers: data.tickers || [],
    };
    
    // Extract recent filings
    const recentFilings: SecFiling[] = [];
    
    if (data.filings && data.filings.recent) {
      const recent = data.filings.recent;
      const forms = recent.form || [];
      const filingDates = recent.filingDate || [];
      const reportDates = recent.reportDate || [];
      const accessionNumbers = recent.accessionNumber || [];
      const primaryDocuments = recent.primaryDocument || [];
      
      for (let i = 0; i < forms.length; i++) {
        if (forms[i] && filingDates[i] && accessionNumbers[i]) {
          const accessionNumber = accessionNumbers[i];
          const primaryDocument = primaryDocuments[i] || '';
          
          recentFilings.push({
            accessionNumber,
            filingDate: filingDates[i],
            reportDate: reportDates[i] || '',
            form: forms[i],
            primaryDocument,
            primaryDocUrl: primaryDocument ? 
              `https://www.sec.gov/Archives/edgar/data/${formattedCik}/${accessionNumber.replace(/-/g, '')}/${primaryDocument}` : '',
            filingUrl: `https://www.sec.gov/Archives/edgar/data/${formattedCik}/${accessionNumber.replace(/-/g, '')}/${accessionNumber}.txt`,
          });
        }
      }
    }
    
    return { companyInfo, recentFilings };
  } catch (error) {
    console.error('Error getting company filings:', error);
    throw new Error(`Failed to get filings for CIK ${cik}`);
  }
}

/**
 * Gets the latest filing of a specific form type for a company
 * @param ticker The ticker symbol of the company
 * @param formType The form type to filter by (e.g., '10-K', '10-Q', '8-K', '144')
 * @returns The latest filing of the specified form type, or null if not found
 */
export async function getLatestFilingByFormType(
  ticker: string, 
  formType: string
): Promise<SecFiling | null> {
  try {
    // First, find the company by ticker
    const company = await findCompanyByTicker(ticker);
    if (!company) {
      throw new Error(`Company with ticker ${ticker} not found`);
    }
    
    // Then, get all recent filings
    const { recentFilings } = await getCompanyFilings(company.cik);
    
    // Filter filings by form type and sort by filing date (newest first)
    const filteredFilings = recentFilings
      .filter(filing => filing.form.toUpperCase().includes(formType.toUpperCase()))
      .sort((a, b) => new Date(b.filingDate).getTime() - new Date(a.filingDate).getTime());
    
    // Return the latest filing, or null if none found
    return filteredFilings.length > 0 ? filteredFilings[0] : null;
  } catch (error) {
    console.error(`Error getting latest ${formType} filing for ${ticker}:`, error);
    throw new Error(`Failed to get latest ${formType} filing for ${ticker}`);
  }
}

/**
 * Gets the details of a specific filing
 * @param accessionNumber The accession number of the filing
 * @param cik The CIK number of the company
 * @returns The filing details
 */
export async function getFilingDetails(
  accessionNumber: string,
  cik: string
): Promise<SecFilingDetails> {
  try {
    const formattedCik = formatCik(cik);
    const url = SEC_API_CONFIG.filingUrl(accessionNumber, formattedCik);
    
    const response = await axios.get(url, {
      headers: SEC_API_CONFIG.headers,
    });
    
    // Parse the filing text
    const filingText = response.data;
    
    // Extract filing details
    const filingDetails: SecFilingDetails = {
      accessionNumber,
      cik: formattedCik,
      companyName: '',
      form: '',
      filingDate: '',
      primaryDocument: '',
      documents: [],
    };
    
    // Extract form type
    const formMatch = filingText.match(/CONFORMED SUBMISSION TYPE:\s*(.+)/i);
    if (formMatch && formMatch[1]) {
      filingDetails.form = formMatch[1].trim();
    }
    
    // Extract company name
    const nameMatch = filingText.match(/COMPANY CONFORMED NAME:\s*(.+)/i);
    if (nameMatch && nameMatch[1]) {
      filingDetails.companyName = nameMatch[1].trim();
    }
    
    // Extract filing date
    const dateMatch = filingText.match(/FILED AS OF DATE:\s*(\d{8})/i);
    if (dateMatch && dateMatch[1]) {
      const dateStr = dateMatch[1];
      filingDetails.filingDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
    }
    
    // Extract documents
    const docStartMatches = [...filingText.matchAll(/<DOCUMENT>([\s\S]*?)<\/DOCUMENT>/g)];
    
    for (const docMatch of docStartMatches) {
      if (docMatch && docMatch[1]) {
        const docText = docMatch[1];
        
        // Extract document type
        const typeMatch = docText.match(/<TYPE>([\s\S]*?)<\/TYPE>/);
        const type = typeMatch && typeMatch[1] ? typeMatch[1].trim() : '';
        
        // Extract document filename
        const filenameMatch = docText.match(/<FILENAME>([\s\S]*?)<\/FILENAME>/);
        const filename = filenameMatch && filenameMatch[1] ? filenameMatch[1].trim() : '';
        
        // Extract document description
        const descMatch = docText.match(/<DESCRIPTION>([\s\S]*?)<\/DESCRIPTION>/);
        const description = descMatch && descMatch[1] ? descMatch[1].trim() : '';
        
        if (filename) {
          filingDetails.documents.push({
            fileName: filename,
            description: description || type,
            documentUrl: `https://www.sec.gov/Archives/edgar/data/${formattedCik}/${accessionNumber.replace(/-/g, '')}/${filename}`,
            type,
            size: docText.length,
          });
          
          // Set primary document
          if (type === filingDetails.form || !filingDetails.primaryDocument) {
            filingDetails.primaryDocument = filename;
          }
        }
      }
    }
    
    return filingDetails;
  } catch (error) {
    console.error('Error getting filing details:', error);
    throw new Error(`Failed to get details for filing ${accessionNumber}`);
  }
}

/**
 * Extracts Form 144 information from a filing
 * @param filingDetails The filing details
 * @returns Parsed Form 144 data
 */
export async function parseForm144(filingDetails: SecFilingDetails): Promise<any> {
  try {
    // Find the XML document in the filing
    const xmlDoc = filingDetails.documents.find(doc => 
      doc.fileName.toLowerCase().includes('.xml') || 
      doc.type.toLowerCase().includes('144')
    );
    
    if (!xmlDoc) {
      throw new Error('XML document not found in Form 144 filing');
    }
    
    // Fetch the XML document
    const response = await axios.get(xmlDoc.documentUrl, {
      headers: SEC_API_CONFIG.headers,
    });
    
    const xmlContent = response.data;
    
    // Parse the XML using cheerio
    const $ = load(xmlContent, { xmlMode: true });
    
    // Extract Form 144 data
    const form144Data = {
      issuerName: $('issuerName').text() || filingDetails.companyName,
      issuerTicker: $('issuerTradingSymbol').text(),
      securityTitle: $('securityTitle').text(),
      reportingPerson: $('rptOwnerName').text(),
      reportingPersonTitle: $('rptOwnerOfficerTitle').text(),
      relationshipToIssuer: $('rptOwnerRelationship').text(),
      dateOfSale: $('earliestTransDate').text(),
      amountOfSecurities: $('amt').text(),
      proposedSaleDate: $('sellDate').text(),
      broker: $('brokerName').text(),
    };
    
    return form144Data;
  } catch (error) {
    console.error('Error parsing Form 144:', error);
    // Return a simplified object with error information
    return {
      error: 'Failed to parse Form 144 filing',
      details: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Generates a human-readable summary of a Form 144 filing
 * @param ticker The ticker symbol of the company
 * @returns A summary of the latest Form 144 filing
 */
export async function getForm144Summary(ticker: string): Promise<{
  ticker: string;
  companyName: string;
  filingType: string;
  filingDate: string;
  summaryText: string;
  keyPoints: string[];
  filingUrl: string;
  rawData?: any;
}> {
  try {
    // Get the latest Form 144 filing
    const latestFiling = await getLatestFilingByFormType(ticker, '144');
    
    if (!latestFiling) {
      throw new Error(`No Form 144 filings found for ${ticker}`);
    }
    
    // Get the company info
    const company = await findCompanyByTicker(ticker);
    if (!company) {
      throw new Error(`Company with ticker ${ticker} not found`);
    }
    
    // Get filing details
    const filingDetails = await getFilingDetails(latestFiling.accessionNumber, company.cik);
    
    // Parse Form 144 data
    const form144Data = await parseForm144(filingDetails);
    
    // Generate a summary
    const summaryText = form144Data.error 
      ? `This Form 144 filing from ${filingDetails.companyName} (${ticker}) indicates a proposed sale of securities by an insider. Form 144 is a notice of the intent to sell restricted securities, typically by company executives or directors. The filing from ${latestFiling.filingDate} shows that a company insider is planning to sell shares in the near future. This is a routine filing required by the SEC when insiders plan to sell a significant amount of company stock.`
      : `This Form 144 filing indicates that ${form144Data.reportingPerson || 'an insider'} (${form144Data.reportingPersonTitle || 'company insider'}) of ${form144Data.issuerName || filingDetails.companyName} (${ticker}) intends to sell ${form144Data.amountOfSecurities || 'a portion'} of ${form144Data.securityTitle || 'company securities'}. The proposed sale date is ${form144Data.proposedSaleDate || 'in the near future'} through ${form144Data.broker || 'a broker'}. Form 144 is required when affiliates of the company intend to sell restricted or control securities.`;
    
    // Generate key points
    const keyPoints = [
      'Form 144 indicates a proposed sale of restricted securities',
      form144Data.reportingPerson 
        ? `Filed by ${form144Data.reportingPerson}${form144Data.reportingPersonTitle ? ` (${form144Data.reportingPersonTitle})` : ''}`
        : 'Filed by a company insider',
      `Filing date: ${filingDetails.filingDate}`,
      'Required by SEC regulations for insider sales',
      'Does not necessarily indicate negative sentiment about the company'
    ];
    
    return {
      ticker: ticker.toUpperCase(),
      companyName: filingDetails.companyName,
      filingType: 'Form 144',
      filingDate: filingDetails.filingDate,
      summaryText,
      keyPoints,
      filingUrl: latestFiling.filingUrl,
      rawData: form144Data
    };
  } catch (error) {
    console.error(`Error generating Form 144 summary for ${ticker}:`, error);
    throw new Error(`Failed to generate Form 144 summary for ${ticker}`);
  }
}
