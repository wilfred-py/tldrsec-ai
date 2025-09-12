/**
 * SEC Filing Retrieval Module
 * 
 * Provides functions for retrieving filing information and content from SEC EDGAR database
 */

import { logger } from '../../lib/logging';
import { SEC_CONFIG } from '../../config/sec';
import { FilingType } from '../../types/sec/filing';
import axios from 'axios';
import { SECEdgarClient } from '../../lib/sec-edgar/client';
import { getSecApiHeaders } from './companyInfo';

/**
 * Filing information interface
 */
export interface FilingInfo {
  accessionNumber: string;
  filingDate: string;
  form: string;
  fileNumber?: string;
  items?: string[];
  primaryDocument?: string;
  primaryDocumentUrl?: string;
  filingUrl?: string;
  htmlUrl?: string;
}

/**
 * Get filings for a company by CIK and form type
 * @param cik Company CIK
 * @param formType SEC form type
 * @param limit Maximum number of filings to return
 * @returns Array of filing information
 */
export async function getFilings(cik: string, formType: FilingType, limit: number = 10): Promise<FilingInfo[]> {
  try {
    logger.debug(`Getting filings for CIK ${cik} with form type ${formType}`);
    
    // Create SEC client
    const secClient = new SECEdgarClient(SEC_CONFIG);
    
    // Format CIK by removing leading zeros
    const formattedCik = cik.replace(/^0+/, '');
    
    // Build the URL for the SEC EDGAR API
    // The URL format is typically: https://data.sec.gov/submissions/CIK#########.json
    // Where CIK######### is the CIK with leading zeros padded to 10 digits
    const paddedCik = formattedCik.padStart(10, '0');
    const url = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;
    
    logger.debug(`Fetching filings from ${url}`);
    
    // Get the headers for SEC API
    const headers = getSecApiHeaders();
    
    // Make the request
    const response = await axios.get(url, { headers });
    
    if (!response.data || !response.data.filings) {
      logger.warn(`No filings data found for CIK ${cik}`);
      return [];
    }
    
    // Extract recent filings
    const recentFilings = response.data.filings.recent;
    
    if (!recentFilings || !recentFilings.form || recentFilings.form.length === 0) {
      logger.warn(`No recent filings found for CIK ${cik}`);
      return [];
    }
    
    // Filter by form type and map to FilingInfo
    const filings: FilingInfo[] = [];
    
    for (let i = 0; i < recentFilings.form.length; i++) {
      if (filings.length >= limit) break;
      
      const form = recentFilings.form[i];
      if (form === formType) {
        const accessionNumber = recentFilings.accessionNumber[i];
        const filingDate = recentFilings.filingDate[i];
        const primaryDocument = recentFilings.primaryDocument[i] || '';
        
        // Format accession number with dashes (0000000000-00-000000)
        const formattedAccessionNumber = accessionNumber.replace(/^(\d{10})(\d{2})(\d{6})$/, '$1-$2-$3');
        
        // Create filing info
        const filing: FilingInfo = {
          accessionNumber: formattedAccessionNumber,
          filingDate: filingDate,
          form: formType,
          primaryDocument: primaryDocument,
          primaryDocumentUrl: primaryDocument ? 
            `https://www.sec.gov/Archives/edgar/data/${formattedCik}/${accessionNumber.replace(/-/g, '')}/${primaryDocument}` : undefined,
          filingUrl: `https://www.sec.gov/Archives/edgar/data/${formattedCik}/${accessionNumber.replace(/-/g, '')}`,
          htmlUrl: primaryDocument ? 
            `https://www.sec.gov/ix?doc=/Archives/edgar/data/${formattedCik}/${accessionNumber.replace(/-/g, '')}/${primaryDocument}` : undefined
        };
        
        filings.push(filing);
      }
    }
    
    logger.debug(`Found ${filings.length} filings of type ${formType} for CIK ${cik}`);
    return filings;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting filings for CIK ${cik}:`, { error: errorMessage });
    throw new Error(`Failed to get filings for CIK ${cik}: ${errorMessage}`);
  }
}

/**
 * Get filing content by accession number and document sequence/filename
 * @param accessionNumber SEC accession number
 * @param documentIdentifier Document sequence number or filename (e.g., "1" or "filename.htm")
 * @param cik Optional Company CIK - will be extracted from the document if not provided
 * @returns Filing content as string
 */
export async function getFilingContent(accessionNumber: string, documentIdentifier: string, cik?: string): Promise<string> {
  try {
    logger.debug(`Getting filing content for accession number ${accessionNumber}, document ${documentIdentifier}`);
    
    // Create SEC client
    const secClient = new SECEdgarClient(SEC_CONFIG);
    
    // Format the accession number without dashes for the URL
    const formattedAccessionNumber = accessionNumber.replace(/-/g, '');
    
    // First, get filing details to determine CIK and document filename if needed
    let documentUrl: string;
    let targetCik = cik;
    
    // If we have a numeric document identifier (sequence), we need to get the document filename
    if (/^\d+$/.test(documentIdentifier)) {
      // This is a document sequence number - we need to get the filing details to find the actual filename
      logger.debug(`Document identifier ${documentIdentifier} appears to be a sequence number, fetching filing details`);
      
      // Try to get the filing index page to find the actual document
      const indexUrl = `https://www.sec.gov/Archives/edgar/data/${formattedAccessionNumber.substring(0, 10)}/${formattedAccessionNumber}/${accessionNumber}-index.html`;
      
      try {
        const indexContent = await secClient.getFilingDocument(indexUrl, { handleNotFound: true });
        if (indexContent) {
          // Parse the index to find the document with the specified sequence
          const docMatch = indexContent.match(new RegExp(`<a href="([^"]+)"[^>]*>${documentIdentifier}</a>`, 'i'));
          if (docMatch) {
            const documentFilename = docMatch[1];
            targetCik = targetCik || formattedAccessionNumber.substring(0, 10);
            documentUrl = `https://www.sec.gov/Archives/edgar/data/${targetCik?.replace(/^0+/, '')}/${formattedAccessionNumber}/${documentFilename}`;
          } else {
            // Fallback to common document naming patterns
            const commonExtensions = ['htm', 'html', 'txt', 'xml'];
            let found = false;
            
            for (const ext of commonExtensions) {
              const testFilename = `${accessionNumber}.${ext}`;
              targetCik = targetCik || formattedAccessionNumber.substring(0, 10);
              const testUrl = `https://www.sec.gov/Archives/edgar/data/${targetCik?.replace(/^0+/, '')}/${formattedAccessionNumber}/${testFilename}`;
              
              try {
                const testContent = await secClient.getFilingDocument(testUrl, { handleNotFound: true });
                if (testContent && testContent.length > 100) {  // Basic content validation
                  documentUrl = testUrl;
                  found = true;
                  logger.debug(`Found document using common naming pattern: ${testFilename}`);
                  break;
                }
              } catch {
                // Continue trying other extensions
              }
            }
            
            if (!found) {
              throw new Error(`Could not find document with sequence ${documentIdentifier} for filing ${accessionNumber}`);
            }
          }
        } else {
          throw new Error(`Could not fetch filing index for ${accessionNumber}`);
        }
      } catch (indexError) {
        logger.warn(`Failed to fetch filing index, trying fallback approaches: ${indexError}`);
        
        // Fallback: try common document naming patterns
        const commonExtensions = ['htm', 'html', 'txt'];
        let found = false;
        
        for (const ext of commonExtensions) {
          const testFilename = `${accessionNumber}.${ext}`;
          targetCik = targetCik || formattedAccessionNumber.substring(0, 10);
          const testUrl = `https://www.sec.gov/Archives/edgar/data/${targetCik?.replace(/^0+/, '')}/${formattedAccessionNumber}/${testFilename}`;
          
          try {
            const testContent = await secClient.getFilingDocument(testUrl, { handleNotFound: true });
            if (testContent && testContent.length > 100) {  // Basic content validation
              documentUrl = testUrl;
              found = true;
              logger.debug(`Found document using fallback naming pattern: ${testFilename}`);
              break;
            }
          } catch {
            // Continue trying other extensions
          }
        }
        
        if (!found) {
          throw new Error(`Could not find valid document for filing ${accessionNumber} after trying multiple approaches`);
        }
      }
    } else {
      // This is already a filename, construct the URL directly
      targetCik = targetCik || formattedAccessionNumber.substring(0, 10);
      documentUrl = `https://www.sec.gov/Archives/edgar/data/${targetCik?.replace(/^0+/, '')}/${formattedAccessionNumber}/${documentIdentifier}`;
    }
    
    logger.debug(`Fetching filing content from ${documentUrl}`);
    
    // Get the document content
    const content = await secClient.getFilingDocument(documentUrl!, { handleNotFound: true });
    
    if (!content) {
      logger.warn(`No content found for filing ${accessionNumber}`);
      throw new Error(`No content found for filing ${accessionNumber}`);
    }
    
    logger.debug(`Successfully retrieved content for filing ${accessionNumber} (${content.length} bytes)`);
    return content;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting filing content for ${accessionNumber}:`, { error: errorMessage });
    throw new Error(`Failed to get filing content for ${accessionNumber}: ${errorMessage}`);
  }
}
