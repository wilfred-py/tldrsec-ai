import axios from 'axios';
import { SEC_CONFIG } from '../../config/sec';
import { logger } from '../../lib/logging';

/**
 * Get filing details by ID (accessionNumber)
 * @param accessionNumber SEC filing accession number
 * @param cik Optional CIK number
 * @returns Filing data
 */
export async function getFilingById(
  accessionNumber: string,
  cik?: string
): Promise<{ data: Record<string, any> }> {
  try {
    logger.debug(`Getting filing by ID: ${accessionNumber}`);
    
    // Normalize the accession number (remove dashes)
    const normalizedAccessionNumber = accessionNumber.replace(/-/g, '');
    
    // Check if the accession number contains 'VRT' (case insensitive)
    const containsVrt = accessionNumber.toLowerCase().includes('vrt');
    
    // If CIK is provided, use it; otherwise, try to extract it from the accession number
    let normalizedCik = cik;
    if (!normalizedCik && normalizedAccessionNumber.length > 10) {
      // Try to extract CIK from accession number format
      normalizedCik = normalizedAccessionNumber.substring(0, 10);
    }
    
    // Construct the URL for the filing metadata
    // Use FILING_URL which requires both accession number and CIK
    const metadataUrl = normalizedCik 
      ? SEC_CONFIG.FILING_URL(normalizedAccessionNumber, normalizedCik)
      : `https://www.sec.gov/Archives/edgar/data/${normalizedAccessionNumber.replace(/-/g, '')}/index.json`;
    
    // Variables to store the responses
    let filingMetadata: Record<string, any> | null = null;
    let filingContent: string = '';
    
    // First, try to get the filing metadata
    try {
      logger.debug(`Fetching filing metadata from ${metadataUrl}`);
      const metadataResponse = await axios.get(metadataUrl, {
        headers: SEC_CONFIG.HEADERS
      });
      filingMetadata = metadataResponse.data as Record<string, any>;
      
      if (!filingMetadata) {
        throw new Error(`No metadata found for filing ${accessionNumber}`);
      }
      
      logger.debug(`Successfully fetched metadata for filing ${accessionNumber}`);
    } catch (error: any) {
      logger.error(`Error fetching filing metadata from ${metadataUrl}: ${error.message}`);
      
      // If we can't get the metadata, we'll try to get the content directly
      logger.debug(`Attempting to fetch filing content directly without metadata`);
    }
    
    // Construct the URL for the filing content
    let rawUrl: string;
    if (filingMetadata && filingMetadata.primaryDocument) {
      // If we have metadata with the primary document, use that
      // Use PRIMARY_DOC_URL instead of FILING_DOCUMENT_URL which doesn't exist
      rawUrl = normalizedCik 
        ? SEC_CONFIG.PRIMARY_DOC_URL(
            normalizedAccessionNumber,
            normalizedCik,
            filingMetadata.primaryDocument
          )
        : `https://www.sec.gov/Archives/edgar/data/${normalizedAccessionNumber.replace(/-/g, '')}/${filingMetadata.primaryDocument}`;
    } else {
      // Otherwise, use the raw filing URL
      rawUrl = normalizedCik 
        ? SEC_CONFIG.RAW_FILING_URL(normalizedAccessionNumber, normalizedCik)
        : `https://www.sec.gov/Archives/edgar/data/${normalizedAccessionNumber.replace(/-/g, '')}/${normalizedAccessionNumber}.txt`;
    }
    
    // Try to get the filing content
    try {
      logger.debug(`Fetching filing content from ${rawUrl}`);
      const rawResponse = await axios.get(rawUrl, {
        headers: SEC_CONFIG.HEADERS
      });
      filingContent = rawResponse.data as string;
    } catch (error: any) {
      logger.error(`Error fetching filing content from ${rawUrl}: ${error.message}`);
      
      // Try alternative URL formats if the first attempt fails
      // This is especially helpful for VRT filings and other edge cases
      const alternativeUrls = [];
      
      // Add VRT-specific URLs if the accession number contains 'VRT'
      if (containsVrt) {
        alternativeUrls.push(
          `https://www.sec.gov/Archives/edgar/data/${accessionNumber.toUpperCase()}`,
          `https://www.sec.gov/Archives/edgar/data/${accessionNumber.toLowerCase()}`,
          `https://www.sec.gov/Archives/edgar/vrtdata/${accessionNumber}`
        );
      }
      
      // Add general fallback URLs for all filing types
      alternativeUrls.push(
        `https://www.sec.gov/Archives/edgar/data/${accessionNumber.replace(/-/g, '')}`,
        `https://www.sec.gov/Archives/edgar/data/${accessionNumber}`
      );
      
      // Try each alternative URL
      let foundContent = false;
      for (const altUrl of alternativeUrls) {
        try {
          logger.debug(`Trying alternative URL: ${altUrl}`);
          const altResponse = await axios.get(altUrl, {
            headers: SEC_CONFIG.HEADERS
          });
          filingContent = altResponse.data as string;
          
          if (filingContent) {
            logger.debug(`Successfully fetched content from alternative URL: ${altUrl}`);
            foundContent = true;
            break;
          }
        } catch (altError: any) {
          logger.error(`Error fetching from alternative URL ${altUrl}: ${altError.message}`);
        }
      }
      
      // If we still don't have content after trying alternatives
      if (!foundContent) {
        // If we get a 404 using the primary document URL, try the raw filing URL as a fallback
        if (error.response && error.response.status === 404 && filingMetadata && filingMetadata.primaryDocument) {
          logger.debug(`Primary document not found, trying raw filing URL as fallback`);
          const fallbackUrl = normalizedCik !== undefined 
            ? SEC_CONFIG.RAW_FILING_URL(accessionNumber, normalizedCik)
            : `https://www.sec.gov/Archives/edgar/data/${accessionNumber.replace(/-/g, '')}/${accessionNumber}.txt`;
          try {
            logger.debug(`Fetching filing content from fallback URL: ${fallbackUrl}`);
            const fallbackResponse = await axios.get(fallbackUrl, {
              headers: SEC_CONFIG.HEADERS
            });
            filingContent = fallbackResponse.data as string;
          } catch (fallbackError: any) {
            logger.error(`Error fetching filing content from fallback URL: ${fallbackError.message}`);
            throw new Error(`Could not retrieve filing content for ${accessionNumber}`);
          }
        } else {
          throw new Error(`Could not retrieve filing content for ${accessionNumber}`);
        }
      }
    }

    // Combine the data from both responses
    const filingData: Record<string, any> = {
      metadata: filingMetadata || {},
      content: filingContent,
      accessionNumber: accessionNumber,
      cik: normalizedCik,
      urls: {
        metadata: metadataUrl,
        content: rawUrl,
        html: `https://www.sec.gov/Archives/edgar/data/${normalizedCik}/${normalizedAccessionNumber}/${accessionNumber}-index.htm`
      }
    };
    
    // Extract additional metadata from the content if needed
    if (filingContent) {
      try {
        // Extract the filing date if not available in the metadata
        if (!filingData.metadata.filingDate) {
          const filingDateMatch = filingContent.match(/FILED AS OF DATE:\s*(\d{8})/i);
          if (filingDateMatch && filingDateMatch[1]) {
            const dateStr = filingDateMatch[1];
            filingData.metadata.filingDate = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
          }
        }
        
        // Extract the form type if not available in the metadata
        if (!filingData.metadata.formType) {
          const formTypeMatch = filingContent.match(/CONFORMED SUBMISSION TYPE:\s*([^\n]+)/i);
          if (formTypeMatch && formTypeMatch[1]) {
            filingData.metadata.formType = formTypeMatch[1].trim();
          }
        }
        
        // Extract the company name if not available in the metadata
        if (!filingData.metadata.companyName) {
          const companyNameMatch = filingContent.match(/COMPANY CONFORMED NAME:\s*([^\n]+)/i);
          if (companyNameMatch && companyNameMatch[1]) {
            filingData.metadata.companyName = companyNameMatch[1].trim();
          }
        }
        
        // Extract the CIK if not available
        if (!filingData.cik) {
          const cikMatch = filingContent.match(/CENTRAL INDEX KEY:\s*(\d+)/i);
          if (cikMatch && cikMatch[1]) {
            filingData.cik = cikMatch[1].trim();
          }
        }
      } catch (extractError) {
        logger.error(`Error extracting additional metadata from content: ${extractError}`);
        // Continue with the data we have
      }
    }
    
    return { data: filingData };
  } catch (error: any) {
    logger.error(`Error in getFilingById: ${error.message}`);
    throw error;
  }
}
