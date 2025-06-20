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
    // Get filing details from the filing service
    secLogger.debug(`[DEBUG] Calling filingService.getFilingById for ${accessionNumber}`);
    const filingResponse = await filingService.getFilingById(accessionNumber);
    secLogger.debug(`[DEBUG] filingResponse received: ${JSON.stringify(filingResponse?.data || {}, null, 2)}`);
    if (!filingResponse?.data) {
      throw new Error(`Could not retrieve filing details for ${accessionNumber}`);
    }

    // Extract available data from the filing response
    // FilingLog interface doesn't have a content property directly
    // We'll use a fallback approach to get content from wherever it might be available
    let filingText = '';
    
    // Try different possible locations for the filing content
    if (filingResponse.data.content) {
      filingText = filingResponse.data.content;
    } else if ((filingResponse.data as any).rawText) {
      filingText = (filingResponse.data as any).rawText;
    } else if (filingResponse.data.documents && filingResponse.data.documents.length > 0) {
      // Try to get content from the first document
      const firstDoc = filingResponse.data.documents[0];
      if (firstDoc.content) {
        filingText = firstDoc.content;
      }
    }
    
    if (!filingText) {
      secLogger.warn(`No content found in filing response for ${accessionNumber}`);
      filingText = ''; // Ensure it's at least an empty string
    }
    
    // Initialize filing details with data from the response
    const filingDetails: ExtendedSecFilingDetails = {
      accessionNumber,
      cik,
      filingDate: filingResponse.data.filingDate || '',
      formType: filingResponse.data.filingCode || '',
      companyName: filingResponse.data.company || '',
      reportDate: filingResponse.data.reportDate || '',
      content: filingText,
      documents: [],
    };
    
    // If primaryDocument is available in the response, use it
    if (filingResponse.data.primaryDocument) {
      filingDetails.primaryDocument = filingResponse.data.primaryDocument;
      secLogger.debug(`Using primaryDocument from response: ${filingDetails.primaryDocument}`);
      
      // For Form 4 filings, immediately create a document for the primary XML file
      if (filingDetails.formType === '4' && filingResponse.data.primaryDocument && filingResponse.data.primaryDocument.endsWith('.xml')) {
        const xmlFilename = filingResponse.data.primaryDocument;
        secLogger.debug(`Creating document for Form 4 XML file: ${xmlFilename}`);
        
        // Create document URL for the XML file
        const documentUrl = `/Archives/edgar/data/${cik}/${accessionNumber.replace(/-/g, '')}/${xmlFilename}`;
        
        // Extract XML content - try to find it in the filing text
        let xmlContent = '';
        
        // Method 1: Look for <XML> tags
        const xmlPattern = /<XML>([\s\S]*?)<\/XML>/i;
        const xmlMatch = filingText.match(xmlPattern);
        if (xmlMatch && xmlMatch[1]) {
          xmlContent = xmlMatch[1].trim();
          secLogger.debug(`Found XML content between <XML> tags (${xmlContent.length} bytes)`);
        } else {
          // Method 2: Look for <?xml declaration
          const xmlStartIndex = filingText.indexOf('<?xml');
          if (xmlStartIndex !== -1) {
            // Try various end tags to find the end of the XML content
            const possibleEndTags = ['</XML>', '</ownershipDocument>', '</documentType>', '</text>', '</ownershipDocument>'];
            let endIndex = -1;
            
            for (const tag of possibleEndTags) {
              const tagIndex = filingText.indexOf(tag, xmlStartIndex);
              if (tagIndex !== -1 && (endIndex === -1 || tagIndex < endIndex)) {
                endIndex = tagIndex + tag.length;
              }
            }
            
            if (endIndex !== -1) {
              xmlContent = filingText.substring(xmlStartIndex, endIndex);
              secLogger.debug(`Found XML content from <?xml to end tag (${xmlContent.length} bytes)`);
            }
          }
        }
        
        // If we still don't have content, use the full filing text
        if (!xmlContent) {
          xmlContent = filingText;
          secLogger.debug(`Using full filing text as content (${xmlContent.length} bytes)`);
        }
        
        // Add as a document
        filingDetails.documents.push({
          type: 'XML',
          filename: xmlFilename,
          description: 'Form 4 XML Data',
          content: xmlContent,
          documentUrl,
          size: xmlContent.length
        });
        
        secLogger.debug(`Added Form 4 XML document: ${xmlFilename} with ${xmlContent.length} bytes`);
      }
    }
    
    // Parse documents from the filing text
    secLogger.debug(`[DEBUG] Parsing documents from filing text (${filingText.length} bytes)`);
    
    // Check if we already have a primary XML document
    const hasXmlDocument = filingDetails.documents.some(doc => 
      doc.type === 'XML' && doc.filename === filingDetails.primaryDocument
    );
    
    // Skip standard document parsing if we already have an XML document for Form 4
    if (filingDetails.formType === '4' && hasXmlDocument) {
      secLogger.debug(`Already have XML document for Form 4, skipping standard document parsing`);
      return filingDetails;
    }
    
    // Initialize document counter
    let documentsFound = 0;
    
    // Look for document tags in the filing text
    const docTagPattern = /<DOCUMENT>([\s\S]*?)<\/DOCUMENT>/gi;
    let docMatch;
    
    while ((docMatch = docTagPattern.exec(filingText)) !== null) {
      const docContent = docMatch[1];
      
      // Extract document type
      const typeMatch = /<TYPE>(.*?)<\/TYPE>/i.exec(docContent);
      const docType = typeMatch ? typeMatch[1].trim() : 'UNKNOWN';
      
      // Extract document filename
      const filenameMatch = /<FILENAME>(.*?)<\/FILENAME>/i.exec(docContent);
      const docFilename = filenameMatch ? filenameMatch[1].trim() : `doc_${documentsFound}.txt`;
      
      // Extract document description
      const descMatch = /<DESCRIPTION>(.*?)<\/DESCRIPTION>/i.exec(docContent);
      const docDescription = descMatch ? descMatch[1].trim() : docType;
      
      // Extract document text (between <TEXT> tags if present, otherwise use the whole document content)
      const textMatch = /<TEXT>([\s\S]*?)<\/TEXT>/i.exec(docContent);
      const docText = textMatch ? textMatch[1] : docContent;
      
      // Create document URL
      const documentUrl = `/Archives/edgar/data/${cik}/${accessionNumber.replace(/-/g, '')}/${docFilename}`;
      
      // Add document to the list
      filingDetails.documents.push({
        type: docType,
        filename: docFilename,
        description: docDescription,
        content: docText,
        documentUrl,
        size: docText.length,
      });
      
      // If this is the first document, or if it's an HTML document, set it as the primary
      if (documentsFound === 0 || docType === 'HTML') {
        filingDetails.primaryDocument = docFilename;
      }
      
      documentsFound++;
    }
    
    // If no documents were found using the traditional approach, try alternative methods
    if (documentsFound === 0) {
      secLogger.debug(`No documents found with traditional approach, trying alternative methods`);
      
      // For Form 4, SD and similar formats that often use XML
      if (filingText.includes('<XML>') || filingText.includes('<?xml')) {
        secLogger.debug(`Detected potential XML-based filing`);
        
        // Check if we have a primary document from filingResponse
        if (filingResponse.data.primaryDocument) {
          secLogger.debug(`Using primaryDocument from filingResponse: ${filingResponse.data.primaryDocument}`);
          
          // For Form 4 filings, handle the special case
          if (filingDetails.formType === '4' && filingResponse.data.primaryDocument === 'edgardoc.xml') {
            secLogger.debug(`Special handling for Form 4 with edgardoc.xml`);
          }
        
        // For Form 4 specifically, look for the primary XML file (often form4.xml)
        const form4Pattern = /filename="(form4\.xml)"/i;
        const form4Match = filingText.match(form4Pattern);
        
        if (form4Match && form4Match[1]) {
          const xmlFilename = form4Match[1];
          secLogger.debug(`Found Form 4 XML filename: ${xmlFilename}`);
          
          // Extract the XML content
          const xmlPattern = /<XML>([\s\S]*?)<\/XML>/i;
          const xmlMatch = filingText.match(xmlPattern);
          
          if (xmlMatch && xmlMatch[1]) {
            const xmlContent = xmlMatch[1].trim();
            
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
      
      // Special handling for Form 4 filings that have XML data but no standard document tags
      // Only do this if we haven't already created a document for the primary XML file
      const hasXmlDocument = filingDetails.documents.some(doc => 
        doc.type === 'XML' && doc.filename === filingDetails.primaryDocument
      );
      
      if (filingDetails.documents.length === 0 && filingDetails.formType === '4' && !hasXmlDocument) {
        secLogger.debug(`Form 4 filing detected with no documents - looking for XML content`);
        
        // For Form 4, always create a document regardless of what we find
        // Use the primaryDocument from filingResponse if available, or create a default name
        const xmlFilename = filingResponse.data.primaryDocument || 'edgardoc.xml';
        secLogger.debug(`Using XML filename for Form 4: ${xmlFilename}`);
        
        // Create document URL for the XML file
        const documentUrl = `/Archives/edgar/data/${cik}/${accessionNumber.replace(/-/g, '')}/${xmlFilename}`;
        
        // For Form 4, try to extract the XML section
        // First, look for the XML section between <XML> tags
        let xmlContent = '';
        let xmlFound = false;
        
        // Method 1: Look for <XML> tags
        const xmlPattern = /<XML>([\s\S]*?)<\/XML>/i;
        const xmlMatch = filingText.match(xmlPattern);
        if (xmlMatch && xmlMatch[1]) {
          xmlContent = xmlMatch[1].trim();
          xmlFound = true;
          secLogger.debug(`Found XML content between <XML> tags (${xmlContent.length} bytes)`);
        }
        
        // Method 2: Look for <?xml declaration
        if (!xmlFound) {
          const xmlStartIndex = filingText.indexOf('<?xml');
          if (xmlStartIndex !== -1) {
            // Try various end tags to find the end of the XML content
            const possibleEndTags = ['</XML>', '</ownershipDocument>', '</documentType>', '</text>', '</ownershipDocument>'];
            let endIndex = -1;
            
            for (const tag of possibleEndTags) {
              const tagIndex = filingText.indexOf(tag, xmlStartIndex);
              if (tagIndex !== -1 && (endIndex === -1 || tagIndex < endIndex)) {
                endIndex = tagIndex + tag.length;
              }
            }
            
            if (endIndex !== -1) {
              xmlContent = filingText.substring(xmlStartIndex, endIndex);
              xmlFound = true;
              secLogger.debug(`Found XML content from <?xml to end tag (${xmlContent.length} bytes)`);
            }
          }
        }
        
        // Method 3: If still no XML found, look for <ownershipDocument> tag
        if (!xmlFound) {
          const ownershipStartIndex = filingText.indexOf('<ownershipDocument>');
          if (ownershipStartIndex !== -1) {
            const ownershipEndIndex = filingText.indexOf('</ownershipDocument>', ownershipStartIndex);
            if (ownershipEndIndex !== -1) {
              xmlContent = filingText.substring(ownershipStartIndex, ownershipEndIndex + '</ownershipDocument>'.length);
              xmlFound = true;
              secLogger.debug(`Found XML content from <ownershipDocument> (${xmlContent.length} bytes)`);
            }
          }
        }
        
        // Method 4: If still no XML found, look for SEC-DOCUMENT section
        if (!xmlFound) {
          const secDocStartIndex = filingText.indexOf('<SEC-DOCUMENT>');
          if (secDocStartIndex !== -1) {
            const secDocEndIndex = filingText.indexOf('</SEC-DOCUMENT>', secDocStartIndex);
            if (secDocEndIndex !== -1) {
              xmlContent = filingText.substring(secDocStartIndex, secDocEndIndex + '</SEC-DOCUMENT>'.length);
              xmlFound = true;
              secLogger.debug(`Found content from <SEC-DOCUMENT> (${xmlContent.length} bytes)`);
            }
          }
        }
        
        // If we still don't have content, use the full filing text
        if (!xmlFound || xmlContent.length === 0) {
          xmlContent = filingText;
          secLogger.debug(`Using full filing text as content (${xmlContent.length} bytes)`);
        }
        
        // Add as a document
        filingDetails.documents.push({
          type: 'XML',
          filename: xmlFilename,
          description: 'Form 4 XML Data',
          content: xmlContent,
          documentUrl,
          size: xmlContent.length
        });
        
        // Set this as the primary document
        filingDetails.primaryDocument = xmlFilename;
        secLogger.debug(`Added Form 4 XML document: ${xmlFilename} with ${xmlContent.length} bytes`);
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
        secLogger.debug(`Added synthetic document: ${syntheticFilename}`);
      }
    }
    
    secLogger.debug(`[DEBUG] Final filingDetails: primaryDocument=${filingDetails.primaryDocument}, documents.length=${filingDetails.documents.length}`);
    return filingDetails;
  } catch (error) {
    secLogger.error(`Error getting filing details for ${accessionNumber}`, error);
    throw new Error(`Failed to get details for filing ${accessionNumber}`);
  }
}
