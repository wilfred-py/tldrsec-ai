/**
 * SEC Filing Content Extractor
 * 
 * Handles downloading and preprocessing SEC filings for AI analysis
 */

import { SECFilingType } from '../ai/prompts/prompt-types';
import { logger } from '../logging';
import { monitoring } from '../monitoring';
import * as cheerio from 'cheerio';
import { FilingType } from '../sec-edgar/types';
import { SECErrorCode, SECEdgarError } from '../sec-edgar/types';
import axios from 'axios';
import { generateSecureOperationId } from '../security/secure-random';
import {
  cleanHtmlContent as cleanHtml,
  cleanHtmlContentAsync as cleanHtmlAsync,
  extractXmlContent as extractXml,
  extractXmlContentAsync as extractXmlAsync,
  isDirectoryListing as isDirListing,
  extractDocumentLinks as extractDocLinks,
  resolveUrl as resolveUrlPath,
  SEC_BASE_URL,
  MAX_CONTENT_SIZE,
  PATTERNS,
  PRIORITY_EXTENSIONS
} from './filing-extractor-utils';

// Component logger
const componentLogger = logger.child('filing-extractor');

/**
 * Fetch content from URL
 * @param url - URL to fetch
 * @returns Response text
 */
async function fetchContent(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'TLDRSec/1.0 (support@tldrsec.app)'
      }
    });
    
    if (!response.ok) {
      throw new SECEdgarError(
        `Failed to fetch content: ${response.status} ${response.statusText}`,
        SECErrorCode.DOCUMENT_FETCH_ERROR,
        response.status
      );
    }
    
    // Check content size before processing
    const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_CONTENT_SIZE) {
      componentLogger.warn(`Content size exceeds limit: ${contentLength} bytes`);
      // We'll still try to process it, but log a warning
    }
    
    return await response.text();
  } catch (error) {
    if (error instanceof SECEdgarError) {
      throw error;
    }
    
    throw new SECEdgarError(
      `Network error fetching content: ${error instanceof Error ? error.message : String(error)}`,
      SECErrorCode.NETWORK_ERROR
    );
  }
}

/**
 * Extract content from an SEC filing URL
 * 
 * @param filingUrl - URL of the SEC filing
 * @param filingType - Type of SEC filing
 * @returns Extracted and preprocessed content text
 */
export async function extractFilingContent(filingUrl: string, filingType: FilingType): Promise<string> {
  const startTime = Date.now();
  const operationId = generateSecureOperationId('extract');
  
  // Log start of extraction
  componentLogger.info(`Extracting content from ${filingType} filing`, {
    filingUrl,
    filingType,
    operationId
  });
  
  // Track metric for extraction attempt
  monitoring.incrementCounter('filing.extraction_started', 1, {
    filingType
  });
  
  try {
    // Ensure URL is absolute
    const absoluteUrl = filingUrl.startsWith('http') ? filingUrl : resolveUrlPath(filingUrl);
    componentLogger.debug(`Fetching content from ${absoluteUrl}`, { operationId });
    
    // Fetch the initial content
    let content = await fetchContent(absoluteUrl);
    let finalUrl = absoluteUrl;
    let attempts = 1;
    const maxAttempts = 3;
    
    // Check if we got a directory listing
    if (isDirListing(content)) {
      componentLogger.debug(`Received directory listing, extracting document links`, { operationId });
      
      // Extract document links
      const links = extractDocLinks(content);
      
      if (links.length === 0) {
        throw new SECEdgarError(
          `No document links found in directory listing at ${absoluteUrl}`,
          SECErrorCode.DOCUMENT_NOT_FOUND
        );
      }
      
      // Try each link until we find valid content
      for (const link of links) {
        if (attempts > maxAttempts) break;
        
        try {
          // Resolve relative URL to absolute URL
          const documentUrl = resolveUrlPath(link, absoluteUrl);
          componentLogger.debug(`Trying document link: ${documentUrl}`, { operationId, attempt: attempts });
          
          // Skip image files
          if (PATTERNS.IMAGE_FILE.test(documentUrl)) {
            componentLogger.debug(`Skipping image file: ${documentUrl}`, { operationId });
            continue;
          }
          
          // Fetch document content
          content = await fetchContent(documentUrl);
          finalUrl = documentUrl;
          
          // If this is not a directory listing, we found our content
          if (!isDirListing(content)) {
            componentLogger.debug(`Found valid content at ${documentUrl}`, { operationId });
            break;
          }
          
          attempts++;
        } catch (error) {
          componentLogger.warn(`Error fetching document link: ${error instanceof Error ? error.message : String(error)}`, { operationId });
          attempts++;
          // Continue to next link
        }
      }
      
      // If we still have a directory listing after trying all links, throw error
      if (isDirListing(content)) {
        throw new SECEdgarError(
          `Failed to find valid content after trying ${attempts} document links`,
          SECErrorCode.DOCUMENT_NOT_FOUND
        );
      }
    }
    
    // Process the content based on filing type
    const $ = cheerio.load(content);
    let extractedContent = '';

    // Form-specific extraction logic
    if (filingType === '424B2' as FilingType) {
      // For 424B2, focus on the prospectus and pricing supplement sections
      const prospectus = $('div.filing-prospectus, div.prospectus, div.p424b2');
      if (prospectus.length) {
        extractedContent = cleanHtml(prospectus.html() || '');
      } else {
        extractedContent = cleanHtml(content);
      }
    } else if (filingType === '4' as FilingType || filingType === '4/A' as FilingType) {
      // For Form 4, extract XML content if available
      if (content.includes('<?xml') || content.includes('<XML>')) {
        extractedContent = extractXml(content);
      } else {
        // Otherwise clean the HTML
        extractedContent = cleanHtml(content);
      }
    } else if (filingType === '144' as FilingType) {
      // For Form 144, focus on the form content
      const form144 = $('div.form144, div.doc-content');
      if (form144.length) {
        extractedContent = cleanHtml(form144.html() || '');
      } else {
        extractedContent = cleanHtml(content);
      }
    } else if (filingType === '11-K' as FilingType || filingType === '11-K/A' as FilingType) {
      // For 11-K, focus on financial statements
      const financials = $('div.financial-statements, div.doc-content');
      if (financials.length) {
        extractedContent = cleanHtml(financials.html() || '');
      } else {
        extractedContent = cleanHtml(content);
      }
    } else if (filingType === 'CORRESP' as FilingType || filingType === 'UPLOAD' as FilingType) {
      // For correspondence, clean the content
      extractedContent = cleanHtml(content);
    } else if (filingType === 'PX14A6G' as FilingType) {
      // For proxy statements, focus on the proposal sections
      const proposals = $('div.proposal, div.doc-content, div.px14a6g');
      if (proposals.length) {
        extractedContent = cleanHtml(proposals.html() || '');
      } else {
        extractedContent = cleanHtml(content);
      }
    } else {
      // Default extraction for other filing types
      extractedContent = cleanHtml(content);
    }
    
    // Validate processed content
    if (!extractedContent || extractedContent.trim().length < 50) {
      componentLogger.warn(`Extracted content is too short (${extractedContent?.length || 0} chars), falling back to raw content`, { operationId });
      
      // Fallback to basic HTML cleaning
      extractedContent = cleanHtml(content);
    }
    
    // Track successful extraction
    const duration = Date.now() - startTime;
    monitoring.recordTiming('filing.extraction_duration', duration, {
      filingType,
      success: 'true'
    });
    
    // Log successful extraction
    componentLogger.info(`Successfully extracted content from ${filingType} filing`, {
      filingUrl: finalUrl,
      filingType,
      contentLength: extractedContent.length,
      duration,
      operationId
    });
    
    // Record content size for monitoring - safely handle missing method
    try {
      const monitoringAny = monitoring as any;
      if (typeof monitoringAny.recordDistribution === 'function') {
        monitoringAny.recordDistribution('sec_filing_content_size', content.length, {
          filing_type: filingType,
          operation_id: operationId,
        });
      }
    } catch (error) {
      componentLogger.warn(`Failed to record metrics: ${error instanceof Error ? error.message : String(error)}`);
    }
    
    return extractedContent;
  } catch (error) {
    // Track failed extraction
    const duration = Date.now() - startTime;
    monitoring.recordTiming('filing.extraction_duration', duration, {
      filingType,
      success: 'false'
    });
    monitoring.incrementCounter('filing.extraction_failed', 1, {
      filingType,
      errorType: error instanceof SECEdgarError ? error.code : 'UNKNOWN_ERROR'
    });
    
    // Log error
    componentLogger.error(`Error extracting content from ${filingType} filing`, {
      filingUrl,
      filingType,
      error: error instanceof Error ? error.message : String(error),
      errorCode: error instanceof SECEdgarError ? error.code : 'UNKNOWN_ERROR',
      operationId
    });
    
    // Rethrow with appropriate error message
    if (error instanceof SECEdgarError) {
      throw error;
    }
    
    throw new SECEdgarError(
      `Failed to extract content from ${filingType} filing: ${error instanceof Error ? error.message : String(error)}`,
      SECErrorCode.PARSING_ERROR
    );
  }
} 