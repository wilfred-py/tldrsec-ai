/**
 * SEC EDGAR API Service
 * Main service module for interacting with SEC EDGAR database
 * Provides high-level functions for filing summaries and company information
 */

import { SecFiling, SecFilingDetails, FilingSummary, FilingType } from '../types/sec/filing';
import { CompanyInfo } from '../types/sec/company';
import { findCompanyByTicker } from './companyService';
import filingService from './filingService';
import { getLatestForm144 } from './form144Service';
import { secLogger } from '../utils/logger';
import { SEC_CONFIG } from '../config/sec';

interface Form144Filing extends SecFiling {
  description?: string;
  keyPoints?: string[];
  parsedContent?: any;
}

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

    // Get latest Form 144 filing with parsed content
    const latestFiling = await getLatestForm144(ticker) as Form144Filing;
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
      filingUrl: filingDetails.data.filingUrl || '',
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
 * Gets a summary for a specific filing type
 * @param ticker Company ticker symbol
 * @param formType Type of SEC form to get summary for
 * @returns Filing summary
 */
export async function getFilingSummary(ticker: string, formType: FilingType): Promise<FilingSummary> {
  try {
    switch (formType) {
      case 'Form 144':
      case '144':
        return getForm144Summary(ticker);
      default:
        throw new Error(`Filing type ${formType} not yet supported`);
    }
  } catch (error) {
    secLogger.error('Error in getFilingSummary:', error);
    throw error;
  }
}

/**
 * Helper function to extract text content from an XML node
 * @param node XML Element node
 * @returns Extracted text content
 */
export function extractTextContent(node: Element): string {
  const textNodes = Array.from(node.childNodes)
    .filter(child => child.nodeType === 3) // Text nodes only
    .map(child => child.textContent?.trim())
    .filter(text => text && text.length > 0);

  return textNodes.join(' ');
}

/**
 * Helper function to extract table data from an XML table element
 * @param table XML table Element
 * @returns 2D array of table cell contents
 */
export function extractTableData(table: Element): string[][] {
  const rows = Array.from(table.getElementsByTagName('tr'));
  return rows.map(row => {
    const cells = Array.from(row.getElementsByTagName('td'));
    return cells.map(cell => cell.textContent?.trim() || '');
  });
}

/**
 * Extracts text content from a filing
 * @param content The filing content
 * @returns Extracted text content
 */
export async function extractTextContent(content: string): Promise<string> {
  try {
    const textPattern = /<TEXT>([\s\S]*?)<\/TEXT>/gi;
    const textMatches = content.match(textPattern);
    if (!textMatches) return '';

    const textContent = textMatches
      .map(match => {
        const textOnly = match.replace(/<\/?TEXT>/gi, '');
        return textOnly.trim();
      })
      .join('\n\n');

    return textContent;
  } catch (error) {
    secLogger.error('Error extracting text content:', error);
    return '';
  }
}

/**
 * Extracts table data from a filing
 * @param content The filing content
 * @returns Extracted table data
 */
export async function extractTableData(content: string): Promise<{ [key: string]: string[] }> {
  try {
    const tablePattern = /<TABLE>([\s\S]*?)<\/TABLE>/gi;
    const tableMatches = content.match(tablePattern);
    if (!tableMatches) return {};

    const tables: { [key: string]: string[] } = {};
    let tableCount = 0;

    for (const tableMatch of tableMatches) {
      const rowPattern = /<TR[^>]*>([\s\S]*?)<\/TR>/gi;
      const rowMatches = tableMatch.match(rowPattern);
      if (!rowMatches) continue;

      const rows: string[] = [];
      for (const rowMatch of rowMatches) {
        const cellPattern = /<T[HD][^>]*>([\s\S]*?)<\/T[HD]>/gi;
        const cellMatches = rowMatch.match(cellPattern);
        if (!cellMatches) continue;

        const cells = cellMatches.map(cell => {
          return cell.replace(/<[^>]+>/g, '').trim();
        });

        rows.push(cells.join('\t'));
      }

      if (rows.length > 0) {
        tables[`Table${++tableCount}`] = rows;
      }
    }

    return tables;
  } catch (error) {
    secLogger.error('Error extracting table data:', error);
    return {};
  }
}

/**
 * Gets company information and recent filings
 * @param company The company information
 * @returns Company information and recent filings
 */
export async function getCompanyFilings(company: SecCompanyInfo): Promise<{ recentFilings: SecFiling[] }> {
  try {
    const formattedCik = formatCik(company.cik);
    const url = `${SEC_API_BASE_URL}/submissions/CIK${formattedCik}.json`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': SEC_USER_AGENT,
        'Accept': 'application/json'
      }
    });

    if (!response?.data?.filings?.recent) {
      throw new Error(`No filings found for CIK ${company.cik}`);
    }

    const recentFilings = response.data.filings.recent.map((filing: any) => ({
      accessionNumber: filing.accessionNumber,
      form: filing.form,
      filingDate: filing.filingDate,
      filingUrl: `${SEC_EDGAR_URL}/${filing.accessionNumber}`,
      primaryDocument: filing.primaryDocument,
      primaryDocUrl: `${SEC_EDGAR_URL}/${filing.accessionNumber}/${filing.primaryDocument}`,
      documents: filing.documents || [],
      cik: company.cik,
      companyName: company.name
    }));

    return { recentFilings };
  } catch (error) {
    secLogger.error(`Error getting filings for ${company.cik}:`, error);
    throw error;
    secLogger.error(`Error getting company filings for ${company.ticker}:`, error);
    throw new Error(`Failed to get company filings for ${company.ticker}`);
  }
}

/**
 * Gets the latest filing by form type
 * @param company The company information
 * @param formType The form type to search for
 * @returns The latest filing by form type
 */
export async function getLatestFilingByFormType(
  company: SecCompanyInfo, 
  formType: string
): Promise<SecFiling | null> {
  try {
    const filingResponse = await getCompanyFilings(company);
    if (!filingResponse?.recentFilings?.length) {
      return null;
    }

    return filingResponse.recentFilings.find(filing => filing.form === formType) || null;
  } catch (error) {
    secLogger.error(`Error getting latest ${formType} filing for ${company.ticker}:`, error);
    return null;
  }
}

/**
 * Gets the latest Form 144 filing
 * @param ticker The ticker symbol
 * @returns The latest Form 144 filing
 */
export async function getLatestForm144(ticker: string): Promise<SecFilingDetails | null> {
  try {
  }
}

/**
 * Gets the details of a specific filing
 * @param accessionNumber The accession number of the filing
 * @param cik The CIK number of the company
 * @returns The filing details
 */
export async function getFilingDetails(accessionNumber: string, cik: string): Promise<SecFilingDetails> {
  // Initialize filing details with default values
  const filingDetails: SecFilingDetails = {
    accessionNumber,
    cik,
    companyName: '',
    form: '',
    filingDate: '',
    primaryDocument: '',
    documents: [],
    parsedContent: undefined,
    filingUrl: undefined,
  try {
    const formattedCik = filing.cik.padStart(10, '0');
    const url = `${SEC_API_CONFIG.baseUrl}/Archives/edgar/data/${formattedCik}/${filing.accessionNumber}/primary-document.xml`;
          
          // Set primary document
          if (type === filingDetails.form || !filingDetails.primaryDocument) {
            filingDetails.primaryDocument = filename;
          }
          documentsFound++;
        }
      }
    }
    
    secLogger.debug(`Found ${documentsFound} documents using traditional approach`);
    
    // If no documents were found using the traditional approach, try alternative methods
    if (documentsFound === 0) {
      secLogger.debug(`No documents found with traditional approach, trying alternative methods`);
      
      // For Form 4, SD and similar formats that often use XML
      if (filingText.includes('<XML>') || filingText.includes('<?xml')) {
        secLogger.debug(`Detected potential XML-based filing`);
        
        // For Form 4 specifically, look for the primary XML file (often form4.xml)
        if (filingDetails.form === '4') {
          secLogger.debug(`Detected Form 4 filing, looking for form4.xml`);
          const form4Pattern = new RegExp('(form4\.xml)', 'i');
          const form4Match = filingText.match(form4Pattern);
          
          if (form4Match && form4Match[1]) {
            const xmlFilename = form4Match[1];
            secLogger.debug(`Found Form 4 XML file: ${xmlFilename}`);
            
            // Format: https://www.sec.gov/Archives/edgar/data/XXXXXXXXXX/XXXXXXXXXXXX/filename.xml
            const documentUrl = `https://www.sec.gov/Archives/edgar/data/${filingDetails.cik}/${filingDetails.accessionNumber.replace(/-/g, '')}/${xmlFilename}`;
            
            filingDetails.documents.push({
              fileName: xmlFilename,
              description: `Form 4 XML Document`,
              documentUrl,
              type: 'XML',
              size: 0, // We don't know the size
            });
            
            // Set this as the primary document
            filingDetails.primaryDocument = xmlFilename;
            documentsFound++;
          }
        }
        
        // If still no documents found or not Form 4, try to find any XML file patterns
        if (documentsFound === 0) {
          secLogger.debug(`Looking for general XML files`);
          const xmlFilePattern = new RegExp('(\w+\.xml)', 'gi');
          const xmlMatches = [...filingText.matchAll(xmlFilePattern)];
          
          for (const xmlMatch of xmlMatches) {
            if (xmlMatch && xmlMatch[1]) {
              const xmlFilename = xmlMatch[1];
              secLogger.debug(`Found potential XML file: ${xmlFilename}`);
              
              // Format: https://www.sec.gov/Archives/edgar/data/XXXXXXXXXX/XXXXXXXXXXXX/filename.xml
              const documentUrl = `https://www.sec.gov/Archives/edgar/data/${filingDetails.cik}/${filingDetails.accessionNumber.replace(/-/g, '')}/${xmlFilename}`;
              
              filingDetails.documents.push({
                fileName: xmlFilename,
                description: `XML Document for ${filingDetails.form}`,
                documentUrl,
                type: 'XML',
                size: 0, // We don't know the size
              });
              
              // If we haven't set a primary document yet, use this one
              if (!filingDetails.primaryDocument) {
                filingDetails.primaryDocument = xmlFilename;
              }
              documentsFound++;
            }
          }
        }
      }
      
      // If we still don't have any documents, create a synthetic one for the full filing text
      if (filingDetails.documents.length === 0) {
        secLogger.debug(`Creating synthetic document for the full filing`);
        const syntheticFilename = `${accessionNumber.replace(/-/g, '')}.txt`;
        
        filingDetails.documents.push({
          fileName: syntheticFilename,
          description: 'COMPLETE SUBMISSION TEXT',
          documentUrl: rawUrl, // Use the raw text URL
          type: filingDetails.form || 'FILING',
          size: filingText.length,
        });
        
        filingDetails.primaryDocument = syntheticFilename;
      }
    }
    
    return filingDetails;
  } catch (error) {
    secLogger.error(`Error getting filing details for ${accessionNumber}`, error);
    throw new Error(`Failed to get details for filing ${accessionNumber}`);
  }
}

 * Extracts Form 144 information from a filing
 * @param filing The filing details
 * @returns Parsed Form 144 data
 */
export async function parseForm144(filing: { content: string; companyName: string; filingDate: string }): Promise<Form144ParsedContent> {
  try {
    // Extract XML content using string pattern matching
    const xmlPattern = /<XML>([\s\S]*?)<\/XML>/i;
    const xmlMatch = filing.content.match(xmlPattern);
    if (!xmlMatch || !xmlMatch[1]) {
      throw new Error('No XML content found in Form 144 filing');
    }

    const xmlContent = xmlMatch[1].trim();
    const doc = new DOMParser().parseFromString(xmlContent, 'text/xml') as Document;
    const select = xpath.useNamespaces({ 'ns1': 'http://www.sec.gov/edgar/form144' });
    
    // Helper function to safely extract text from XML node
    const getNodeText = (xpath: string): string => {
      const nodes = select(xpath, doc) as Node[];
      return nodes[0]?.nodeValue || '';
    };
    
    // Extract data from XML nodes
    const reportingPerson = getNodeText('//ns1:reportingOwnerName/text()');
    const reportingPersonTitle = getNodeText('//ns1:reportingOwnerTitle/text()');
    const relationshipToIssuer = getNodeText('//ns1:relationshipToIssuer/text()');
    const dateOfSale = getNodeText('//ns1:dateOfSale/text()') || filing.filingDate;
    const amountOfSecurities = getNodeText('//ns1:amountOfSecurities/text()');
    const proposedSaleDate = getNodeText('//ns1:proposedSaleDate/text()');
    const broker = getNodeText('//ns1:brokerName/text()');
    const note = getNodeText('//ns1:remarks/text()');

    return {
      reportingPerson,
      reportingPersonTitle,
      relationshipToIssuer,
      dateOfSale,
      amountOfSecurities,
      proposedSaleDate,
      broker,
      note
    };
  } catch (error) {
    secLogger.error('Error parsing Form 144 filing:', error);
    return null;
  }
}

/**
 * Extracts text content from a filing
 * @param content The filing content
 * @returns Extracted text content
 */
export async function extractTextContent(content: string): Promise<string> {
  try {
    const textPattern = /<TEXT>([\s\S]*?)<\/TEXT>/gi;
    const textMatches = content.match(textPattern);
    if (!textMatches) return '';

    const textContent = textMatches
      .map(match => {
        const textOnly = match.replace(/<\/?TEXT>/gi, '');
        return textOnly.trim();
      })
      .join('\n\n');

    return textContent;
  } catch (error) {
    secLogger.error('Error extracting text content:', error);
    return '';
  }
}

/**
 * Extracts table data from a filing
 * @param content The filing content
 * @returns Extracted table data
 */
export async function extractTableData(content: string): Promise<{ [key: string]: string[] }> {
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

    // Construct SEC HTML viewer URL
    const secHtmlUrl = `${SEC_CONFIG.BASE_URL}/Archives/edgar/data/${company.cik}/${filingDetails.accessionNumber.replace(/-/g, '')}/index.htm`;

    return {
      ticker: ticker.toUpperCase(),
      companyName: filingDetails.companyName,
      filingType: 'Form 144' as FilingType,
      filingDate: filingDetails.filingDate,
      summaryText,
      keyPoints,
      filingUrl: secHtmlUrl,
      url: secHtmlUrl,
      rawData: form144Data
    };
  } catch (error) {
    secLogger.error(`Error generating Form 144 summary for ${ticker}:`, error);
    throw new Error(`Failed to generate Form 144 summary for ${ticker}`);
  }
};

/**
 * Gets a summary for any supported filing type
 * @param ticker The company's ticker symbol
 * @param formType The type of form to get a summary for
 * @returns A summary of the filing
 */
export const getFilingSummary = async (ticker: string, formType: FilingType): Promise<FilingSummary> => {
  switch (formType) {
    case 'Form 144':
    case '144':
      return getForm144Summary(ticker);
    default:
      throw new Error(`Filing type ${formType} is not supported yet`);
  }
};
