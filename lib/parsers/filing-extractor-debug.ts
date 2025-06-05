/**
 * SEC Filing Content Extractor with Enhanced Debugging
 * 
 * This is a debug version of the filing-extractor.ts file with additional
 * logging to help diagnose issues with content extraction.
 */

import { SECFilingType } from '../ai/prompts/prompt-types';
import { logger } from '../logging';
import { monitoring } from '../monitoring';
import fs from 'fs';
import path from 'path';

// Component logger
const componentLogger = logger.child('filing-extractor-debug');

// Create a debug log directory if it doesn't exist
const DEBUG_LOG_DIR = path.join(process.cwd(), 'debug-logs');
if (!fs.existsSync(DEBUG_LOG_DIR)) {
  fs.mkdirSync(DEBUG_LOG_DIR, { recursive: true });
}

// Function to write debug logs to file
function writeDebugLog(filename: string, content: string | object) {
  try {
    const logPath = path.join(DEBUG_LOG_DIR, filename);
    const logContent = typeof content === 'string' 
      ? content 
      : JSON.stringify(content, null, 2);
    
    fs.writeFileSync(logPath, logContent);
    componentLogger.info(`Debug log written to ${logPath}`);
  } catch (error) {
    componentLogger.error(`Failed to write debug log: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Extract content from an SEC filing URL with enhanced debugging
 * 
 * @param filingUrl - URL of the SEC filing
 * @param filingType - Type of SEC filing
 * @returns Extracted and preprocessed content text
 */
export async function extractFilingContent(filingUrl: string, filingType: SECFilingType): Promise<string> {
  const startTime = Date.now();
  const debugId = `${filingType}_${Date.now()}`;
  
  // Log start of extraction with more details
  componentLogger.info(`[DEBUG] Starting extraction for ${filingType} filing`, {
    debugId,
    filingUrl,
    filingType,
    timestamp: new Date().toISOString()
  });
  
  // Write the input parameters to debug log
  writeDebugLog(`${debugId}_input_params.json`, {
    filingUrl,
    filingType,
    timestamp: new Date().toISOString()
  });
  
  // Track metric for extraction attempt
  monitoring.incrementCounter('filing.extraction_started', 1, {
    filingType
  });
  
  try {
    // Import necessary modules to access SEC service
    componentLogger.info(`[DEBUG] Importing SEC service`, { debugId });
    
    // Log the dynamic import attempt
    try {
      const { default: secService } = await import('@/services/secService');
      componentLogger.info(`[DEBUG] Successfully imported secService`, { debugId });
      writeDebugLog(`${debugId}_sec_service_import_success.txt`, 'SEC service imported successfully');
    } catch (importError) {
      componentLogger.error(`[DEBUG] Failed to import secService: ${importError instanceof Error ? importError.message : String(importError)}`, { debugId });
      writeDebugLog(`${debugId}_sec_service_import_error.json`, {
        error: importError instanceof Error ? importError.message : String(importError),
        stack: importError instanceof Error ? importError.stack : 'No stack trace'
      });
      throw new Error(`Failed to import secService: ${importError instanceof Error ? importError.message : String(importError)}`);
    }
    
    const { default: secService } = await import('@/services/secService');
    const axios = require('axios');
    
    // Parse the filing URL to extract important components
    // Example URL: https://www.sec.gov/Archives/edgar/data/1318605/000095017023000794/tsla-20221231.htm
    const urlParts = filingUrl.split('/');
    let cik = '';
    let accessionNumber = '';
    
    // Extract CIK and accession number from URL
    for (let i = 0; i < urlParts.length; i++) {
      if (urlParts[i] === 'data' && i + 1 < urlParts.length) {
        cik = urlParts[i + 1];
      }
      if (cik && i === urlParts.indexOf(cik) + 1 && i < urlParts.length) {
        accessionNumber = urlParts[i];
      }
    }
    
    componentLogger.info(`[DEBUG] Extracted URL components`, {
      debugId,
      filingUrl,
      cik,
      accessionNumber
    });
    
    writeDebugLog(`${debugId}_url_components.json`, {
      filingUrl,
      urlParts,
      cik,
      accessionNumber
    });
    
    // If we couldn't extract CIK or accessionNumber, try an alternative approach
    if (!cik || !accessionNumber) {
      componentLogger.warn(`[DEBUG] Could not extract CIK or accessionNumber from URL, trying alternative approach`, {
        debugId,
        filingUrl,
        filingType
      });
      
      // Get the SEC API headers for proper requests
      const secHeaders = await secService.getSecApiHeaders();
      componentLogger.info(`[DEBUG] Got SEC API headers`, {
        debugId,
        headers: secHeaders
      });
      
      writeDebugLog(`${debugId}_sec_headers.json`, secHeaders);
      
      // Fetch the content directly from the URL
      componentLogger.info(`[DEBUG] Fetching content directly from URL: ${filingUrl}`, { debugId });
      
      try {
        const response = await axios.get(filingUrl, {
          headers: secHeaders,
          timeout: 15000 // 15 second timeout
        });
        
        let content = response.data;
        componentLogger.info(`[DEBUG] Received direct content response`, {
          debugId,
          contentType: typeof content,
          contentLength: typeof content === 'string' ? content.length : 'not a string',
          isHtml: typeof content === 'string' && (content.includes('<html') || content.includes('<!DOCTYPE')),
          isXml: typeof content === 'string' && content.includes('<?xml')
        });
        
        // Save a sample of the raw content
        if (typeof content === 'string') {
          const contentSample = content.length > 1000 ? content.substring(0, 1000) + '...' : content;
          writeDebugLog(`${debugId}_direct_content_sample.txt`, contentSample);
        } else {
          writeDebugLog(`${debugId}_direct_content_type.txt`, `Content is not a string: ${typeof content}`);
        }
        
        // If content is HTML, extract text and clean it up
        if (typeof content === 'string' && (content.includes('<html') || content.includes('<!DOCTYPE'))) {
          componentLogger.info(`[DEBUG] Cleaning HTML content`, { debugId });
          
          // Save original HTML before cleaning
          writeDebugLog(`${debugId}_original_html_sample.html`, content.substring(0, 5000) + '...');
          
          // Remove HTML tags, scripts, styles while preserving content structure
          content = content
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .replace(/<[^>]*>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
            
          componentLogger.info(`[DEBUG] HTML content cleaned`, {
            debugId,
            cleanedContentLength: content.length
          });
          
          // Save cleaned content sample
          writeDebugLog(`${debugId}_cleaned_html_sample.txt`, content.substring(0, 1000) + '...');
        }
        
        // Track successful extraction
        const duration = Date.now() - startTime;
        monitoring.recordTiming('filing.extraction_duration', duration, {
          filingType,
          success: 'true'
        });
        
        // Log successful extraction
        componentLogger.info(`[DEBUG] Successfully extracted content from ${filingType} filing via direct URL`, {
          debugId,
          filingUrl,
          filingType,
          contentLength: content.length,
          duration
        });
        
        return content;
      } catch (directFetchError) {
        componentLogger.error(`[DEBUG] Error fetching content directly: ${directFetchError instanceof Error ? directFetchError.message : String(directFetchError)}`, {
          debugId,
          filingUrl
        });
        
        writeDebugLog(`${debugId}_direct_fetch_error.json`, {
          error: directFetchError instanceof Error ? directFetchError.message : String(directFetchError),
          stack: directFetchError instanceof Error ? directFetchError.stack : 'No stack trace'
        });
        
        throw directFetchError;
      }
    }
    
    // Use secService to get filing details
    componentLogger.info(`[DEBUG] Getting filing details from SEC service`, {
      debugId,
      accessionNumber,
      cik
    });
    
    let filingDetails;
    try {
      filingDetails = await secService.getFilingDetails(accessionNumber, cik);
      componentLogger.info(`[DEBUG] Got filing details`, {
        debugId,
        companyName: filingDetails.companyName,
        form: filingDetails.form,
        filingDate: filingDetails.filingDate,
        documentCount: filingDetails.documents?.length || 0
      });
      
      // Save filing details for debugging
      writeDebugLog(`${debugId}_filing_details.json`, filingDetails);
    } catch (filingDetailsError) {
      componentLogger.error(`[DEBUG] Error getting filing details: ${filingDetailsError instanceof Error ? filingDetailsError.message : String(filingDetailsError)}`, {
        debugId,
        accessionNumber,
        cik
      });
      
      writeDebugLog(`${debugId}_filing_details_error.json`, {
        error: filingDetailsError instanceof Error ? filingDetailsError.message : String(filingDetailsError),
        stack: filingDetailsError instanceof Error ? filingDetailsError.stack : 'No stack trace'
      });
      
      throw filingDetailsError;
    }
    
    // Find the main document
    let mainDocument = null;
    
    // Special handling for different filing types
    if (['4', 'SC 13G', 'SC 13D', 'SD', '3', '5'].includes(filingType)) {
      // For these forms, prioritize XML files
      mainDocument = filingDetails.documents.find((doc) => 
        doc.fileName.endsWith('.xml') || 
        doc.type === 'XML' ||
        doc.description.includes('PRIMARY DOCUMENT')
      );
      
      componentLogger.info(`[DEBUG] Looking for XML document for form type ${filingType}`, {
        debugId,
        foundDocument: !!mainDocument,
        documentName: mainDocument?.fileName || 'none found'
      });
    } else {
      // For standard forms (10-K, 10-Q, 8-K, etc.), look for HTML documents first
      mainDocument = filingDetails.documents.find((doc) => 
        doc.fileName.endsWith('.htm') || 
        doc.fileName.endsWith('.html') ||
        doc.description.includes('FILING DOCUMENT') ||
        doc.description.includes('PRIMARY DOCUMENT')
      );
      
      componentLogger.info(`[DEBUG] Looking for HTML document for form type ${filingType}`, {
        debugId,
        foundDocument: !!mainDocument,
        documentName: mainDocument?.fileName || 'none found'
      });
    }
    
    // If still no document found, try a more permissive approach
    if (!mainDocument && filingDetails.documents && filingDetails.documents.length > 0) {
      // Take the first document that's not a graphic or exhibit
      mainDocument = filingDetails.documents.find((doc) => 
        !doc.fileName.toLowerCase().includes('graphic') && 
        !doc.fileName.toLowerCase().includes('image') &&
        !doc.description.toLowerCase().includes('graphic')
      ) || filingDetails.documents[0]; // Absolute fallback: just use the first document
      
      componentLogger.info(`[DEBUG] Using fallback document selection`, {
        debugId,
        foundDocument: !!mainDocument,
        documentName: mainDocument?.fileName || 'none found'
      });
    }
    
    if (!mainDocument) {
      const error = new Error(`No main document found in ${filingType} filing at ${filingUrl}`);
      componentLogger.error(`[DEBUG] ${error.message}`, {
        debugId,
        filingUrl,
        filingType
      });
      
      writeDebugLog(`${debugId}_no_main_document_error.txt`, error.message);
      throw error;
    }
    
    // Get the document content
    const documentUrl = mainDocument.documentUrl;
    componentLogger.info(`[DEBUG] Getting document content from URL: ${documentUrl}`, {
      debugId,
      documentType: mainDocument.type,
      documentName: mainDocument.fileName
    });
    
    // Get the SEC API headers for proper requests
    const secHeaders = await secService.getSecApiHeaders();
    
    // Fetch the document content
    try {
      const response = await axios.get(documentUrl, {
        headers: secHeaders,
        timeout: 15000 // 15 second timeout
      });
      
      let content = response.data;
      componentLogger.info(`[DEBUG] Received document content response`, {
        debugId,
        contentType: typeof content,
        contentLength: typeof content === 'string' ? content.length : 'not a string',
        isHtml: typeof content === 'string' && (content.includes('<html') || content.includes('<!DOCTYPE')),
        isXml: typeof content === 'string' && content.includes('<?xml')
      });
      
      // Save a sample of the raw content
      if (typeof content === 'string') {
        const contentSample = content.length > 1000 ? content.substring(0, 1000) + '...' : content;
        writeDebugLog(`${debugId}_document_content_sample.txt`, contentSample);
      } else {
        writeDebugLog(`${debugId}_document_content_type.txt`, `Content is not a string: ${typeof content}`);
      }
      
      // If content is HTML, extract text and clean it up
      if (typeof content === 'string' && (content.includes('<html') || content.includes('<!DOCTYPE'))) {
        componentLogger.info(`[DEBUG] Cleaning HTML document content`, { debugId });
        
        // Save original HTML before cleaning
        writeDebugLog(`${debugId}_original_document_html_sample.html`, content.substring(0, 5000) + '...');
        
        // Remove HTML tags, scripts, styles while preserving content structure
        content = content
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
          
        componentLogger.info(`[DEBUG] HTML document content cleaned`, {
          debugId,
          cleanedContentLength: content.length
        });
        
        // Save cleaned content sample
        writeDebugLog(`${debugId}_cleaned_document_html_sample.txt`, content.substring(0, 1000) + '...');
      }
      
      // If content is XML, convert it to a more readable format
      if (typeof content === 'string' && content.includes('<?xml')) {
        componentLogger.info(`[DEBUG] Cleaning XML document content`, { debugId });
        
        // Save original XML before cleaning
        writeDebugLog(`${debugId}_original_document_xml_sample.xml`, content.substring(0, 5000) + '...');
        
        // Try to extract readable text from XML
        content = content
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
          
        componentLogger.info(`[DEBUG] XML document content cleaned`, {
          debugId,
          cleanedContentLength: content.length
        });
        
        // Save cleaned content sample
        writeDebugLog(`${debugId}_cleaned_document_xml_sample.txt`, content.substring(0, 1000) + '...');
      }
      
      // Track successful extraction
      const duration = Date.now() - startTime;
      monitoring.recordTiming('filing.extraction_duration', duration, {
        filingType,
        success: 'true'
      });
      
      // Log successful extraction
      componentLogger.info(`[DEBUG] Successfully extracted content from ${filingType} filing`, {
        debugId,
        filingUrl,
        filingType,
        contentLength: content.length,
        duration
      });
      
      return content;
    } catch (documentError) {
      componentLogger.error(`[DEBUG] Error fetching document content: ${documentError instanceof Error ? documentError.message : String(documentError)}`, {
        debugId,
        documentUrl
      });
      
      writeDebugLog(`${debugId}_document_fetch_error.json`, {
        error: documentError instanceof Error ? documentError.message : String(documentError),
        stack: documentError instanceof Error ? documentError.stack : 'No stack trace'
      });
      
      throw documentError;
    }
  } catch (error) {
    // Track failed extraction
    const duration = Date.now() - startTime;
    monitoring.recordTiming('filing.extraction_duration', duration, {
      filingType,
      success: 'false'
    });
    monitoring.incrementCounter('filing.extraction_failed', 1, {
      filingType
    });
    
    // Log error
    componentLogger.error(`[DEBUG] Error extracting content from ${filingType} filing: ${error instanceof Error ? error.message : String(error)}`, {
      debugId,
      filingUrl,
      filingType,
      errorStack: error instanceof Error ? error.stack : 'No stack trace'
    });
    
    writeDebugLog(`${debugId}_extraction_error.json`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack trace',
      filingUrl,
      filingType
    });
    
    throw new Error(`Failed to extract content from ${filingType} filing: ${error instanceof Error ? error.message : String(error)}`);
  }
}
