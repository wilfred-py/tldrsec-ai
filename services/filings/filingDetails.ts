/**
 * Filing Details Module
 * 
 * Provides functionality for retrieving SEC filing details
 */

import { SecFilingDetails, SecFilingDocument } from '../../types/sec/filing';
import { FilingLog } from '../../types/filing';
import { secLogger } from '../../utils/logger';
import axios from 'axios';
import { SEC_EDGAR_BASE_URL } from '../../constants/sec';

// Import the Form 4 XML parser if it exists
let parseForm4Xml: (xmlContent: string) => Promise<any>;
try {
  // Dynamic import to avoid circular dependencies
  import('../filings/parsers/form4Parser').then(module => {
    parseForm4Xml = module.parseForm4Xml;
  }).catch(err => {
    secLogger.warn(`[WARN] Could not import Form 4 parser: ${err instanceof Error ? err.message : String(err)}`);
    // Provide a fallback implementation
    parseForm4Xml = async () => ({ parsedSuccessfully: false });
  });
} catch (error) {
  secLogger.warn(`[WARN] Error importing Form 4 parser: ${error instanceof Error ? error.message : String(error)}`);
  // Provide a fallback implementation
  parseForm4Xml = async () => ({ parsedSuccessfully: false });
}

// Extended interface to include additional properties needed for our implementation
interface ExtendedSecFilingDetails extends SecFilingDetails {
  primaryDocument?: string;
  reportDate?: string;
  documents: (SecFilingDocument & { documentUrl?: string; size?: number; })[];
}

/**
 * Gets the details of a specific filing
 * @param accessionNumber The accession number of the filing
 * @param cik The CIK number of the company
 * @returns The filing details
 */
export async function getFilingDetails(accessionNumber: string, cik: string): Promise<SecFilingDetails> {
  secLogger.debug(`[DEBUG] getFilingDetails called for accessionNumber: ${accessionNumber}, cik: ${cik}`);
  try {
    // Direct SEC API access instead of using filingService to avoid circular dependency
    secLogger.debug(`[DEBUG] Fetching filing details directly from SEC API for ${accessionNumber}`);
    
    // Format the accession number for the URL (remove dashes)
    const formattedAccessionNumber = accessionNumber.replace(/-/g, '');
    
    // Construct the URL for the filing
    const filingUrl = `${SEC_EDGAR_BASE_URL}/Archives/edgar/data/${cik}/${formattedAccessionNumber}/0000000000-00-000000.txt`;
    
    secLogger.debug(`[DEBUG] Requesting filing from URL: ${filingUrl}`);
    
    // Fetch the filing directly
    const response = await axios.get(filingUrl, {
      headers: {
        'User-Agent': 'TLDRSec Filing Analyzer (support@tldrsec.app)'
      }
    });
    
    if (!response.data) {
      throw new Error(`Could not retrieve filing details for ${accessionNumber}`);
    }
    
    // Use the response data directly
    const filingData = {
      content: response.data,
      filingDate: '', // We'll try to extract this from the content later
      filingCode: '', // We'll try to extract this from the content later
      company: '',
      reportDate: ''
    };
    
    secLogger.debug(`[DEBUG] Filing data retrieved, content length: ${typeof filingData.content === 'string' ? filingData.content.length : 0}`);
    
    // Extract metadata from the filing content if possible
    try {
      const contentStr = typeof filingData.content === 'string' ? filingData.content : '';
      
      const filingDateMatch = contentStr.match(/FILED AS OF DATE:\s*(\d{8})/);
      if (filingDateMatch && filingDateMatch[1]) {
        const dateStr = filingDateMatch[1];
        filingData.filingDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
      }
      
      const formTypeMatch = contentStr.match(/FORM TYPE:\s*([^\n\r]+)/);
      if (formTypeMatch && formTypeMatch[1]) {
        filingData.filingCode = formTypeMatch[1].trim();
      }
      
      const companyMatch = contentStr.match(/COMPANY CONFORMED NAME:\s*([^\n\r]+)/);
      if (companyMatch && companyMatch[1]) {
        filingData.company = companyMatch[1].trim();
      }
      
      const reportDateMatch = contentStr.match(/PERIOD OF REPORT:\s*(\d{8})/);
      if (reportDateMatch && reportDateMatch[1]) {
        const dateStr = reportDateMatch[1];
        filingData.reportDate = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
      }
    } catch (metadataError) {
      secLogger.warn(`[WARN] Error extracting metadata from filing content: ${metadataError instanceof Error ? metadataError.message : String(metadataError)}`);
    }

    // Use the filing content from our direct API call
    let filingText = typeof filingData.content === 'string' ? filingData.content : '';
    
    if (!filingText) {
      secLogger.warn(`No content found in filing response for ${accessionNumber}`);
      filingText = ''; // Ensure it's at least an empty string
    }
    
    // Initialize filing details with data from the response
    const filingDetails: ExtendedSecFilingDetails = {
      accessionNumber,
      cik,
      filingDate: filingData.filingDate || '',
      form: filingData.filingCode || '', // Use filingCode as form
      formType: filingData.filingCode || '',
      companyName: filingData.company || '',
      reportDate: filingData.reportDate || '',
      content: filingText,
      documents: [],
    };
    
    // Try to determine if this is a Form 4 filing and extract the primary document
    const primaryDocMatch = filingText.match(/FILENAME:\s*([^\n\r]+\.xml)/i);
    if (primaryDocMatch && primaryDocMatch[1]) {
      const primaryDocument = primaryDocMatch[1].trim();
      filingDetails.primaryDocument = primaryDocument;
      secLogger.debug(`Extracted primaryDocument from content: ${filingDetails.primaryDocument}`);
      
      // For Form 4 filings, immediately create a document for the primary XML file
      if (filingDetails.formType === '4' && primaryDocument.endsWith('.xml')) {
        const xmlFilename = primaryDocument;
        secLogger.debug(`Creating document for Form 4 XML file: ${xmlFilename}`);
        
        // Create a document for the XML file
        const xmlDocument: SecFilingDocument = {
          type: 'XML',
          filename: xmlFilename,
          description: 'Form 4 XML Filing',
          content: filingText, // Use the same content for now
          documentUrl: `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNumber.replace(/-/g, '')}/${xmlFilename}`,
          size: filingText.length
        };
        
        filingDetails.documents.push(xmlDocument);
      }
    }
    
    // Extract documents from the filing content if available
    // Since we're now fetching directly, we need to parse the document list from the content
    const documentMatches = filingText.matchAll(/FILENAME:\s*([^\n\r]+)\s*DESCRIPTION:\s*([^\n\r]+)/gi);
    const documents: SecFilingDocument[] = [];
    
    // Convert iterator to array for easier processing
    const documentMatchesArray = Array.from(documentMatches || []);
    
    if (documentMatchesArray.length > 0) {
      secLogger.debug(`Found ${documentMatchesArray.length} potential documents in filing content`);
      
      // Process each document match
      for (const match of documentMatchesArray) {
        if (match[1]) {
          const filename = match[1].trim();
          const description = match[2] ? match[2].trim() : '';
          
          // Determine document type from filename extension
          const fileExtension = filename.split('.').pop()?.toLowerCase() || '';
          let documentType = '';
          
          if (fileExtension === 'htm' || fileExtension === 'html') {
            documentType = 'HTML';
          } else if (fileExtension === 'xml') {
            documentType = 'XML';
          } else if (fileExtension === 'pdf') {
            documentType = 'PDF';
          } else if (fileExtension === 'jpg' || fileExtension === 'jpeg' || fileExtension === 'png') {
            documentType = 'IMAGE';
          } else {
            documentType = fileExtension.toUpperCase();
          }
          
          const document: SecFilingDocument = {
            type: documentType,
            filename,
            description,
            content: '', // We don't have the content yet
            documentUrl: `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNumber.replace(/-/g, '')}/${filename}`,
            size: 0
          };
          
          filingDetails.documents.push(document);
        }
      }
    } else {
      // If no documents found in the content, try alternative methods
      secLogger.debug(`No documents found in filing content, trying alternative methods`);
      
      // For Form 4, SD and similar formats that often use XML
      if (filingText.includes('<XML>') || filingText.includes('<?xml')) {
        secLogger.debug(`Detected potential XML-based filing`);
        
        // Check if we have a Form 4 XML filing
        if (filingDetails.formType === '4' && filingText.includes('<ownershipDocument>')) {
          secLogger.debug(`Detected Form 4 XML content for ${accessionNumber}`);
          // This is a Form 4 XML filing, parse it directly
          try {
            const form4Data = await parseForm4Xml(filingText);
            if (form4Data) {
              // Add the parsed data to the filing details
              (filingDetails as any).parsedForm4 = form4Data;
              secLogger.debug(`Successfully parsed Form 4 XML for ${accessionNumber}`);
            }
          } catch (xmlError) {
            secLogger.error(`Error parsing Form 4 XML: ${xmlError instanceof Error ? xmlError.message : String(xmlError)}`);
          }
        }
        
        // For Form 4 specifically, look for the primary XML file (often form4.xml)
        const form4Pattern = /filename="(form4\.xml)"/i;
        const form4Match = filingText.match(form4Pattern);
        
        if (form4Match && form4Match[1]) {
          const xmlFilename = form4Match[1];
          secLogger.debug(`Found Form 4 XML filename: ${xmlFilename}`);
          
          // Extract the XML content - this is a simplified approach
          const xmlContentPattern = new RegExp(`<XML>(\\s*${xmlFilename}\\s*)?([\\s\\S]*?)<\\/XML>`, 'i');
          const xmlContentMatch = filingText.match(xmlContentPattern);
          
          if (xmlContentMatch && xmlContentMatch[2]) {
            const xmlContent = xmlContentMatch[2].trim();
            
            // Add as a document
            filingDetails.documents.push({
              type: 'XML',
              filename: xmlFilename,
              description: 'Form 4 XML Data',
              content: xmlContent,
              documentUrl: `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNumber.replace(/-/g, '')}/${xmlFilename}`,
              size: xmlContent.length
            });
            
            // Set this as the primary document
            filingDetails.primaryDocument = xmlFilename;
            secLogger.debug(`Added Form 4 XML document: ${xmlFilename} with ${xmlContent.length} bytes`);
          }
        }
        
        // If still no documents found or not Form 4, try to find any XML file patterns
        if (filingDetails.documents.length === 0) {
          secLogger.debug(`Looking for general XML files`);
          const xmlFilePattern = new RegExp('(\\w+\\.xml)', 'gi');
          // Use a more compatible approach to find XML files
          const xmlMatches: string[][] = [];
          let xmlMatch;
          while ((xmlMatch = xmlFilePattern.exec(filingText)) !== null) {
            xmlMatches.push([xmlMatch[0], xmlMatch[1]]);
          }
          
          if (xmlMatches.length > 0) {
            // Get unique XML filenames
            // Create a unique set of XML filenames without using spread on Set
            const xmlFilenamesSet = new Set<string>();
            xmlMatches.forEach(m => xmlFilenamesSet.add(m[1]));
            const xmlFilenames = Array.from(xmlFilenamesSet);
            
            for (const xmlFilename of xmlFilenames) {
              secLogger.debug(`Found XML file: ${xmlFilename}`);
              
              // Extract the XML content - this is a simplified approach
              const xmlContentPattern = new RegExp(`<XML>(\\s*${xmlFilename}\\s*)?([\\s\\S]*?)<\\/XML>`, 'i');
              const xmlContentMatch = filingText.match(xmlContentPattern);
              
              if (xmlContentMatch && xmlContentMatch[2]) {
                const xmlContent = xmlContentMatch[2].trim();
                
                // Add as a document
                filingDetails.documents.push({
                  type: 'XML',
                  filename: xmlFilename,
                  description: 'XML Data',
                  content: xmlContent,
                  documentUrl: `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNumber.replace(/-/g, '')}/${xmlFilename}`,
                  size: xmlContent.length
                });
                
                // Set as primary document if none set yet
                if (!filingDetails.primaryDocument) {
                  filingDetails.primaryDocument = xmlFilename;
                }
              }
            }
          }
        }
      }
    }
    
    // If we don't have any documents yet, create a fallback document
    if (filingDetails.documents.length === 0) {
      secLogger.debug(`No documents found in filing content, creating fallback document`);
      
      // Create a fallback document with the filing content
      const fallbackDocument: SecFilingDocument = {
        type: 'TXT',
        filename: `${accessionNumber}.txt`,
        description: 'Filing Text',
        content: filingText,
        documentUrl: `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNumber.replace(/-/g, '')}/${accessionNumber}.txt`,
        size: filingText.length
      };
      
      filingDetails.documents.push(fallbackDocument);
      filingDetails.primaryDocument = fallbackDocument.filename;
      secLogger.debug(`Added fallback document: ${fallbackDocument.filename}`);
    }
    
    secLogger.debug(`[DEBUG] Final filingDetails: primaryDocument=${filingDetails.primaryDocument}, documents.length=${filingDetails.documents.length}`);
    return filingDetails;
  } catch (error: any) {
    // Check if this is a 404 error from axios
    if (error.response && error.response.status === 404) {
      secLogger.warn(`Filing not found (404) for ${accessionNumber} - this may be a valid response for some tickers`);
      // Return a minimal filing details object instead of throwing
      return {
        accessionNumber,
        cik,
        filingDate: '',
        form: '', // Add required form property
        formType: '',
        companyName: '',
        content: '',
        documents: []
      };
    }
    
    secLogger.error(`Error getting filing details for ${accessionNumber}: ${error instanceof Error ? error.message : String(error)}`);
    throw new Error(`Failed to get details for filing ${accessionNumber}`);
  }
}
