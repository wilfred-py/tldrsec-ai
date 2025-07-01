import axios from 'axios';
import { SEC_CONFIG } from '../../config/sec';
import { logger } from '../../lib/logging';
import { logXmlDocument, generateXmlSummary } from '../../lib/xmlLogging';
import secFetchMonitor, { UrlAttempt, FetchAttemptData } from '../monitoring/secFetchMonitor';

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
    logger.info(`Getting filing by ID: ${accessionNumber}`); // Upgraded to INFO level for better visibility
    
    // Track all URL attempts for this filing request
    const urlAttempts: UrlAttempt[] = [];
    
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
    
    // Format CIK with leading zeros to ensure consistent 10-digit format
    const formattedCik = normalizedCik ? normalizedCik.padStart(10, '0') : '';
    
    // Construct the URL for the filing metadata
    // Use FILING_URL which requires both accession number and CIK
    // Only attempt to fetch metadata if we have a CIK
    const metadataUrl = normalizedCik 
      ? SEC_CONFIG.FILING_URL(normalizedAccessionNumber, formattedCik)
      : null; // Don't try to fetch index.json as it doesn't exist in SEC EDGAR
    
    // Variables to store the responses
    let filingMetadata: Record<string, any> | null = null;
    let filingContent: string = '';
    
    // First, try to get the filing metadata if we have a valid URL
    try {
      // Only attempt to fetch metadata if we have a valid URL
      if (metadataUrl) {
        // Log with visual indicator for parsing stage
        logger.debug(`🔍 Fetching filing metadata from ${metadataUrl}`);
        
        const metadataResponse = await axios.get(metadataUrl, {
          headers: SEC_CONFIG.HEADERS
        });
      
        // Record this URL attempt with parsing stage indicator
        urlAttempts.push({
          url: metadataUrl,
          success: true,
          statusCode: metadataResponse.status,
          timestamp: Date.now(),
          parsingStages: {
            fetchComplete: true,
            xmlParsed: false,
            namespacesResolved: false,
            contextRefsValid: false
          }
        });
      
        filingMetadata = metadataResponse.data as Record<string, any>;
        
        if (!filingMetadata) {
          throw new Error(`No metadata found for filing ${accessionNumber}`);
        }
      } else {
        logger.info(`✅ Skipping metadata fetch - no CIK provided for ${accessionNumber}`);
      }
      
      // Success logs only needed for errors
    } catch (error: any) {
      // Only track failed URL attempt if we actually tried to fetch metadata
      if (metadataUrl) {
        urlAttempts.push({
          url: metadataUrl,
          success: false,
          statusCode: error.response?.status,
          error: error.message,
          timestamp: Date.now(),
          parsingStages: {
            fetchComplete: false,
            xmlParsed: false,
            namespacesResolved: false,
            contextRefsValid: false
          }
        });
        logger.error(`❌ Error fetching filing metadata from ${metadataUrl}: ${error.message}`);
      
        // If we can't get the metadata, we'll try to get the content directly
        logger.info(`ℹ️ Metadata fetch failed, attempting to fetch filing content directly`); // More informative message
      }
    }
    
    // Construct the URL for the filing content
    let rawUrl: string;
    if (filingMetadata && filingMetadata.primaryDocument) {
      // If we have metadata with the primary document, use that
      // Use PRIMARY_DOC_URL instead of FILING_DOCUMENT_URL which doesn't exist
      rawUrl = normalizedCik 
        ? SEC_CONFIG.PRIMARY_DOC_URL(
            normalizedAccessionNumber,
            formattedCik,
            filingMetadata.primaryDocument
          )
        : `https://www.sec.gov/Archives/edgar/data/${normalizedAccessionNumber}/${filingMetadata.primaryDocument}`;
    } else {
      // Otherwise, use the raw filing URL
      rawUrl = normalizedCik 
        ? SEC_CONFIG.RAW_FILING_URL(normalizedAccessionNumber, formattedCik)
        : `https://www.sec.gov/Archives/edgar/data/${normalizedAccessionNumber}/${accessionNumber}.txt`;
    }
    
    // Try to get the filing content
    try {
      // Log with visual indicator for parsing stage
      logger.debug(`📄 Fetching filing content from ${rawUrl}`);
      
      const rawResponse = await axios.get(rawUrl, {
        headers: SEC_CONFIG.HEADERS
      });
      
      // Check if the content is XML and log it with our structured format
      const contentType = rawResponse.headers['content-type'] || '';
      const isXml = contentType.includes('xml') || 
                   (rawResponse.data as string).trim().startsWith('<?xml');
      
      // Create URL attempt with parsing stage indicators
      const urlAttempt: UrlAttempt = {
        url: rawUrl,
        success: true,
        statusCode: rawResponse.status,
        timestamp: Date.now(),
        parsingStages: {
          fetchComplete: true,
          xmlParsed: isXml,
          namespacesResolved: false,
          contextRefsValid: false
        }
      };
      
      // Record this URL attempt
      urlAttempts.push(urlAttempt);
      
      filingContent = rawResponse.data as string;
      
      // Process XML content if applicable
      if (typeof filingContent === 'string' && (
        filingContent.trim().startsWith('<?xml') ||
        filingContent.trim().startsWith('<XML>') ||
        filingContent.trim().startsWith('<xbrl:') ||
        filingContent.includes('<xbrl')
      )) {
        // Log with visual indicator for parsing stage
        logger.debug(`🔄 Processing XML content for filing ${accessionNumber}`);
        
        // Update parsing stage indicators
        if (urlAttempt.parsingStages) {
          urlAttempt.parsingStages.xmlParsed = true;
          
          // Generate XML summary
          const xmlSummary = generateXmlSummary(filingContent);
          urlAttempt.xmlSummary = xmlSummary;
          
          // Update namespace resolution status
          const namespaceCount = Object.keys(xmlSummary.namespaces).length;
          urlAttempt.parsingStages.namespacesResolved = namespaceCount > 0;
          
          // Update context reference validation status
          const contextRefCount = xmlSummary.contextRefs ? Object.keys(xmlSummary.contextRefs).length : 0;
          urlAttempt.parsingStages.contextRefsValid = contextRefCount > 0;
          
          // Log visual indicator of parsing completion
          const parsingStatus = urlAttempt.parsingStages.contextRefsValid ? '✅' : '⚠️';
          logger.debug(`${parsingStatus} XML parsing complete for ${accessionNumber}: ${namespaceCount} namespaces, ${contextRefCount} context references`);
        }
      }
    } catch (error: any) {
      // Record this failed URL attempt with parsing stage information
      urlAttempts.push({
        url: rawUrl,
        success: false,
        error: error.message,
        timestamp: Date.now(),
        parsingStages: {
          fetchComplete: false,
          xmlParsed: false,
          namespacesResolved: false,
          contextRefsValid: false
        }
      });
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
      
      // Check if this is a Form 144 filing based on metadata or accession number
      const isForm144 = 
        (filingMetadata && filingMetadata.formType && filingMetadata.formType.includes('144')) ||
        accessionNumber.toLowerCase().includes('form144') ||
        accessionNumber.toLowerCase().includes('144');
      
      if (isForm144) {
        // Form type detection logging not needed
        
        // For Form 144 filings, we need to ensure the CIK is properly formatted
        // Form 144 URLs have a specific structure
        // We're using the formattedCik defined earlier
        const normalizedAccNum = normalizedAccessionNumber;
        
        // Add Form 144 specific URL patterns with proper CIK formatting
        alternativeUrls.push(
          // Primary Form 144 URL patterns
          `https://www.sec.gov/Archives/edgar/data/${formattedCik}/${normalizedAccNum}/xslF144X01/${accessionNumber}.xml`,
          `https://www.sec.gov/Archives/edgar/data/${formattedCik}/${normalizedAccNum}/form144.xml`,
          `https://www.sec.gov/Archives/edgar/data/${formattedCik}/${normalizedAccNum}/form144.html`,
          // Additional Form 144 patterns
          `https://www.sec.gov/Archives/edgar/data/${formattedCik}/${normalizedAccNum}/form144.txt`,
          `https://www.sec.gov/Archives/edgar/data/${formattedCik}/${normalizedAccNum}/form144.pdf`
        );
      }
      
      // Add general fallback URLs for all filing types with proper CIK formatting
      // Ensure we're using the CIK when available, not the accession number in the path
      if (normalizedCik) {
        // We're using the formattedCik defined earlier
        const normalizedAccNum = normalizedAccessionNumber;
        
        alternativeUrls.push(
          // Standard SEC URL patterns with CIK
          `https://www.sec.gov/Archives/edgar/data/${formattedCik}/${normalizedAccNum}/${accessionNumber}.txt`,
          `https://www.sec.gov/Archives/edgar/data/${formattedCik}/${normalizedAccNum}/index.htm`,
          `https://www.sec.gov/Archives/edgar/data/${formattedCik}/${normalizedAccNum}/index.html`
        );
      } else {
        // Fallback URLs when CIK is not available (less reliable)
        alternativeUrls.push(
          `https://www.sec.gov/Archives/edgar/data/${accessionNumber.replace(/-/g, '')}`,
          `https://www.sec.gov/Archives/edgar/data/${accessionNumber}`
        );
      }
      
      // Try each alternative URL
      let foundContent = false;
      for (const altUrl of alternativeUrls) {
        try {
          logger.info(`Trying alternative URL: ${altUrl}`);
          const altResponse = await axios.get(altUrl, {
            headers: SEC_CONFIG.HEADERS
          });
          
          // Check if the content is XML and log it with our structured format
          const contentType = altResponse.headers['content-type'] || '';
          const isXml = contentType.includes('xml') || 
                       (altResponse.data as string).trim().startsWith('<?xml');
          
          // Create URL attempt with parsing stage indicators
          const urlAttempt: UrlAttempt = {
            url: altUrl,
            success: true,
            statusCode: altResponse.status,
            timestamp: Date.now(),
            parsingStages: {
              fetchComplete: true,
              xmlParsed: isXml,
              namespacesResolved: false,
              contextRefsValid: false
            }
          };
          
          // Record this URL attempt
          urlAttempts.push(urlAttempt);
          
          filingContent = altResponse.data as string;
          
          // Process XML content if applicable
          if (typeof filingContent === 'string' && filingContent.trim().startsWith('<?xml')) {
            // Log with visual indicator for parsing stage
            logger.debug(`🔄 Processing XML content for filing ${accessionNumber}`);
            
            // Update parsing stage indicators
            if (urlAttempt.parsingStages) {
              urlAttempt.parsingStages.xmlParsed = true;
              
              // Generate XML summary
              const xmlSummary = generateXmlSummary(filingContent);
              urlAttempt.xmlSummary = xmlSummary;
              
              // Update namespace resolution status
              const namespaceCount = Object.keys(xmlSummary.namespaces).length;
              urlAttempt.parsingStages.namespacesResolved = namespaceCount > 0;
              
              // Update context reference validation status
              const contextRefCount = xmlSummary.contextRefs ? Object.keys(xmlSummary.contextRefs).length : 0;
              urlAttempt.parsingStages.contextRefsValid = contextRefCount > 0;
              
              // Log visual indicator of parsing completion
              const parsingStatus = urlAttempt.parsingStages.contextRefsValid ? '✅' : '⚠️';
              logger.debug(`${parsingStatus} XML parsing complete for ${accessionNumber}: ${namespaceCount} namespaces, ${contextRefCount} context references`);
            }
          }
          
          logger.info(`Successfully fetched content using alternative URL: ${altUrl}`);
          foundContent = true;
          break;
        } catch (altError: any) {
          logger.error(`Error fetching from alternative URL ${altUrl}: ${altError.message}`);
          
          // Record this failed URL attempt with parsing stage information
          urlAttempts.push({
            url: altUrl,
            success: false,
            error: altError.message,
            timestamp: Date.now(),
            parsingStages: {
              fetchComplete: false,
              xmlParsed: false,
              namespacesResolved: false,
              contextRefsValid: false
            }
          });
        }
      }
      
      // If we still don't have content after trying alternatives
      if (!foundContent) {
        // If we get a 404 using the primary document URL, try the raw filing URL as a fallback
        if (error.response && error.response.status === 404 && filingMetadata && filingMetadata.primaryDocument) {
          logger.info(`Primary document not found, trying raw filing URL as fallback`); // Keep this as INFO for visibility
          // Ensure consistent normalization of accession number and CIK formatting
          const normalizedAccNum = accessionNumber.replace(/-/g, '');
          const formattedCik = normalizedCik ? normalizedCik.padStart(10, '0') : undefined;
          
          const fallbackUrl = formattedCik !== undefined 
            ? SEC_CONFIG.RAW_FILING_URL(normalizedAccNum, formattedCik)
            : `https://www.sec.gov/Archives/edgar/data/${normalizedAccNum}/${accessionNumber}.txt`;
          try {
            // Log with visual indicator for parsing stage
            logger.debug(`📄 Fetching filing content from ${fallbackUrl}`);
            
            const fallbackResponse = await axios.get(fallbackUrl, {
              headers: SEC_CONFIG.HEADERS
            });
            
            // Check if the content is XML and log it with our structured format
            const contentType = fallbackResponse.headers['content-type'] || '';
            const isXml = contentType.includes('xml') || 
                         (fallbackResponse.data as string).trim().startsWith('<?xml');
            
            // Create URL attempt with parsing stage indicators
            const urlAttempt: UrlAttempt = {
              url: fallbackUrl,
              success: true,
              statusCode: fallbackResponse.status,
              timestamp: Date.now(),
              parsingStages: {
                fetchComplete: true,
                xmlParsed: isXml,
                namespacesResolved: false,
                contextRefsValid: false
              }
            };
            
            // Record this URL attempt
            urlAttempts.push(urlAttempt);
            
            filingContent = fallbackResponse.data as string;
            
            // Process XML content if applicable
            if (typeof filingContent === 'string' && filingContent.trim().startsWith('<?xml')) {
              // Log with visual indicator for parsing stage
              logger.debug(`🔄 Processing XML content for filing ${accessionNumber}`);
              
              // Update parsing stage indicators
              if (urlAttempt.parsingStages) {
                urlAttempt.parsingStages.xmlParsed = true;
                
                // Generate XML summary
                const xmlSummary = generateXmlSummary(filingContent);
                urlAttempt.xmlSummary = xmlSummary;
                
                // Update namespace resolution status
                const namespaceCount = Object.keys(xmlSummary.namespaces).length;
                urlAttempt.parsingStages.namespacesResolved = namespaceCount > 0;
                
                // Update context reference validation status
                const contextRefCount = xmlSummary.contextRefs ? Object.keys(xmlSummary.contextRefs).length : 0;
                urlAttempt.parsingStages.contextRefsValid = contextRefCount > 0;
                
                // Log visual indicator of parsing completion
                const parsingStatus = urlAttempt.parsingStages.contextRefsValid ? '✅' : '⚠️';
                logger.debug(`${parsingStatus} XML parsing complete for ${accessionNumber}: ${namespaceCount} namespaces, ${contextRefCount} context references`);
              }
            }
          } catch (fallbackError: any) {
            logger.error(`Error fetching filing content from fallback URL: ${fallbackError.message}`);
            
            // Record this failed URL attempt with parsing stage information
            urlAttempts.push({
              url: fallbackUrl,
              success: false,
              error: fallbackError.message,
              timestamp: Date.now(),
              parsingStages: {
                fetchComplete: false,
                xmlParsed: false,
                namespacesResolved: false,
                contextRefsValid: false
              }
            });
            
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
    
    // Add URL attempts to the response for monitoring
    filingData.urlAttempts = urlAttempts;
    
    // Log summary of URL attempts
    const successfulAttempts = urlAttempts.filter(attempt => attempt.success).length;
    const totalAttempts = urlAttempts.length;
    
    if (successfulAttempts > 0) {
      logger.info(`✓ Successfully retrieved filing ${accessionNumber} after ${totalAttempts} URL attempts (${successfulAttempts} successful)`);
    } else {
      logger.error(`✘ Failed to retrieve filing ${accessionNumber} after ${totalAttempts} URL attempts`);
    }
    
    // Record the fetch attempt for monitoring and analysis
    try {
      const formType = filingData.metadata?.formType || '';
      const ticker = filingData.metadata?.ticker || '';
      
      // Check if content is XML (more robust detection)
      const isXmlContent = typeof filingContent === 'string' && (
        filingContent.trim().startsWith('<?xml') ||
        filingContent.trim().startsWith('<XML>') ||
        filingContent.trim().startsWith('<xbrl:') ||
        filingContent.includes('<xbrl')
      );
      
      // Don't await this to avoid blocking the response
      secFetchMonitor.recordFetchAttempt({
        filingId: accessionNumber,
        ticker: ticker,
        formType: formType,
        attempts: urlAttempts,
        successful: filingMetadata !== null,
        timestamp: Date.now(),
        xmlContent: isXmlContent ? filingContent : undefined
      })
        .catch(monitorError => {
          logger.error(`Failed to record SEC fetch attempt: ${monitorError instanceof Error ? monitorError.message : String(monitorError)}`);
        });
    } catch (monitorError) {
      // Don't let monitoring errors affect the main flow
      logger.error(`Error in SEC fetch monitoring: ${monitorError instanceof Error ? monitorError.message : String(monitorError)}`);
    }
    
    return { data: filingData };
  } catch (error: any) {
    logger.error(`Error in getFilingById: ${error.message}`);
    throw error;
  }
}
