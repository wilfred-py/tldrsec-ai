/**
 * Filing Details Module
 * 
 * Provides functionality for retrieving SEC filing details
 */

import { SecFilingDetails, SecFilingDocument } from '../../types/sec/filing';
import { FilingLog } from '../../types/filing';
import { secLogger } from '../../utils/logger';
import filingService from '../filingService';

// Extended interface to include additional properties needed for our implementation
interface ExtendedSecFilingDetails extends SecFilingDetails {
  primaryDocument?: string;
  documents: (SecFilingDocument & { documentUrl?: string; size?: number; })[];
}

/**
 * Gets the details of a specific filing
 * @param accessionNumber The accession number of the filing
 * @param cik The CIK number of the company
 * @returns The filing details
 */
export async function getFilingDetails(accessionNumber: string, cik: string): Promise<SecFilingDetails> {
  try {
    // Get filing details from the filing service
    const filingResponse = await filingService.getFilingById(accessionNumber);
    if (!filingResponse?.data) {
      throw new Error(`Could not retrieve filing details for ${accessionNumber}`);
    }

    // Extract available data from the filing response
    // FilingLog interface doesn't have a content property directly
    // We'll use a fallback approach to get content from wherever it might be available
    let filingText = '';
    
    // Try different possible locations for the filing content
    if (typeof filingResponse.data === 'string') {
      filingText = filingResponse.data;
    } else if (filingResponse.data.details && 'content' in filingResponse.data.details) {
      // @ts-ignore - We're checking for existence dynamically
      filingText = filingResponse.data.details.content || '';
    } else if ('content' in filingResponse.data) {
      // @ts-ignore - We're checking for existence dynamically
      filingText = filingResponse.data.content || '';
    }
    const filingDetails: ExtendedSecFilingDetails = {
      accessionNumber,
      filingDate: filingResponse.data.filingDate,
      formType: filingResponse.data.filingCode, // filingCode in FilingLog corresponds to formType in SecFilingDetails
      companyName: filingResponse.data.company || '',
      cik: cik,
      primaryDocument: '',
      documents: [],
      content: filingText
    };

    // Extract documents from the filing text
    let documentsFound = 0;

    // Look for document tags in the filing text
    const documentPattern = /<DOCUMENT>([\s\S]*?)<\/DOCUMENT>/gi;
    const documents: SecFilingDocument[] = [];
    let documentMatch;
    while ((documentMatch = documentPattern.exec(filingText)) !== null) {
      if (documentMatch[1]) {
        // Extract document type
        const typeMatch = documentMatch[1].match(/<TYPE>(.*?)<\/TYPE>/i);
        const type = typeMatch ? typeMatch[1].trim() : 'UNKNOWN';

        // Extract document filename
        const filenameMatch = documentMatch[1].match(/<FILENAME>(.*?)<\/FILENAME>/i);
        const filename = filenameMatch ? filenameMatch[1].trim() : `doc_${documentsFound}.txt`;

        // Extract document description
        const descriptionMatch = documentMatch[1].match(/<DESCRIPTION>(.*?)<\/DESCRIPTION>/i);
        const description = descriptionMatch ? descriptionMatch[1].trim() : '';

        // Extract document content
        const contentMatch = documentMatch[1].match(/<TEXT>([\s\S]*?)<\/TEXT>/i);
        const content = contentMatch ? contentMatch[1] : documentMatch[1];

        // Create document URL
        const documentUrl = `/Archives/edgar/data/${cik}/${accessionNumber.replace(/-/g, '')}/${filename}`;

        // Add document to the list
        const document: SecFilingDocument = {
          type,
          filename,
          description,
          content,
          documentUrl,
          size: content.length
        };
        documents.push(document);

        // Set primary document if it's the first one or if it's an important document type
        if (documentsFound === 0 || 
            type === '10-K' || 
            type === '10-Q' || 
            type === '8-K' || 
            type === 'DEF 14A' || 
            type === '144') {
          filingDetails.primaryDocument = filename;
        }

        documentsFound++;
      }
    }

    // If no documents were found using the traditional approach, try alternative methods
    if (documentsFound === 0) {
      secLogger.debug(`No documents found with traditional approach, trying alternative methods`);
      
      // For Form 4, SD and similar formats that often use XML
      if (filingText.includes('<XML>') || filingText.includes('<?xml')) {
        secLogger.debug(`Detected potential XML-based filing`);
        
        // For Form 4 specifically, look for the primary XML file (often form4.xml)
        const form4Pattern = /filename="(form4\.xml)"/i;
        const form4Match = filingText.match(form4Pattern);
        
        if (form4Match && form4Match[1]) {
          const xmlFilename = form4Match[1];
          secLogger.debug(`Found Form 4 XML file: ${xmlFilename}`);
          
          // Extract the XML content
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
              documentUrl: `/Archives/edgar/data/${cik}/${accessionNumber.replace(/-/g, '')}/${xmlFilename}`,
              size: xmlContent.length
            });
            
            // Set this as the primary document
            filingDetails.primaryDocument = xmlFilename;
            documentsFound++;
          }
        }
        
        // If still no documents found or not Form 4, try to find any XML file patterns
        if (documentsFound === 0) {
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
                  documentUrl: `/Archives/edgar/data/${cik}/${accessionNumber.replace(/-/g, '')}/${xmlFilename}`,
                  size: xmlContent.length
                });
                
                // Set as primary document if none set yet
                if (!filingDetails.primaryDocument) {
                  filingDetails.primaryDocument = xmlFilename;
                }
                documentsFound++;
              }
            }
          }
        }
      }
      
      // If we still don't have any documents, create a synthetic one for the full filing text
      if (filingDetails.documents.length === 0) {
        secLogger.debug(`Creating synthetic document for the full filing`);
        const syntheticFilename = `filing_${accessionNumber.replace(/-/g, '')}.txt`;
        const rawUrl = `/Archives/edgar/data/${cik}/${accessionNumber.replace(/-/g, '')}/0000000000-00-000000.txt`;
        
        filingDetails.documents.push({
          type: filingDetails.formType || 'FILING',
          filename: syntheticFilename,
          description: 'Complete Filing Text',
          content: filingText,
          documentUrl: rawUrl, // Use the raw text URL
          size: filingText.length,
        });
        
        filingDetails.primaryDocument = syntheticFilename;
      }
    }
    
    return filingDetails as SecFilingDetails;
  } catch (error) {
    secLogger.error(`Error getting filing details for ${accessionNumber}`, error);
    throw new Error(`Failed to get details for filing ${accessionNumber}`);
  }
}
