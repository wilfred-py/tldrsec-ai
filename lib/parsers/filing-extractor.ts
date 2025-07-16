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

// Component logger
const componentLogger = logger.child('filing-extractor');

// SEC base URL for resolving relative URLs
const SEC_BASE_URL = 'https://www.sec.gov';

// Maximum content size to process (in characters)
const MAX_CONTENT_SIZE = 10 * 1024 * 1024; // 10MB

// Regex patterns for identifying specific content
const PATTERNS = {
  // Pattern to identify directory listings
  DIRECTORY_LISTING: /<title>Index of /i,
  // Pattern to identify XML stylesheets
  XML_STYLESHEET: /<\?xml-stylesheet/i,
  // Pattern to identify HTML documents
  HTML_DOCUMENT: /<html|<!DOCTYPE html/i,
  // Pattern to identify XML documents
  XML_DOCUMENT: /<\?xml|<xml/i,
  // Pattern to identify Form 4 XML
  FORM4_XML: /<(?:ownershipDocument|sec:ownershipDocument)/i,
  // Pattern to identify Form 144 XML
  FORM144_XML: /<(?:intentToSell|sec:intentToSell)/i,
  // Pattern to identify document links in directory listings
  DOCUMENT_LINK: /href="([^"]+\.(htm|html|xml|txt))"/gi,
  // Pattern to identify image files (to be skipped)
  IMAGE_FILE: /\.(jpg|jpeg|png|gif|svg|ico|bmp|tiff|webp)$/i
};

// File extensions to prioritize when multiple documents are found
const PRIORITY_EXTENSIONS = [
  '.htm',
  '.html',
  '.xml',
  '.txt'
];

/**
 * Form-specific content extraction strategies
 */
const formExtractors: Record<string, (content: string, $: cheerio.CheerioAPI) => string> = {
  // Form 424B2 - Prospectus
  '424B2': (content, $) => {
    // For 424B2, focus on the main content and remove navigation/headers
    const mainContent = $('.main-content, .body, #main-content, .filing-content').first();
    if (mainContent.length) {
      return cleanHtmlContent(mainContent.html() || '');
    }
    // Fallback to standard HTML cleaning if specific elements not found
    return cleanHtmlContent(content);
  },
  
  // Form 11-K - Employee Stock Purchase Plans
  '11-K': (content, $) => {
    // For 11-K, prioritize tables and financial data
    const tables = $('table');
    if (tables.length) {
      let tableContent = '';
      tables.each((_, table) => {
        tableContent += $(table).text() + '\n\n';
      });
      if (tableContent.length > 500) { // Only use tables if substantial content found
        return tableContent;
      }
    }
    // Fallback to standard HTML cleaning
    return cleanHtmlContent(content);
  },
  
  // Form 4 - Insider Trading
  '4': (content, $) => {
    // For Form 4, check if it's XML format
    if (PATTERNS.FORM4_XML.test(content)) {
      return extractXmlContent(content, 'ownershipDocument');
    }
    // Otherwise treat as HTML
    return cleanHtmlContent(content);
  },
  
  // Form 144 - Notice of Proposed Sale
  '144': (content, $) => {
    // For Form 144, check if it's XML format
    if (PATTERNS.FORM144_XML.test(content)) {
      return extractXmlContent(content, 'intentToSell');
    }
    // Otherwise treat as HTML
    return cleanHtmlContent(content);
  },
  
  // CORRESP - Correspondence
  'CORRESP': (content, $) => {
    // For correspondence, preserve formatting but clean HTML
    return cleanHtmlContent(content, { preserveFormatting: true });
  },
  
  // UPLOAD - Uploaded documents
  'UPLOAD': (content, $) => {
    // For uploaded documents, preserve formatting but clean HTML
    return cleanHtmlContent(content, { preserveFormatting: true });
  },
  
  // PX14A6G - Notice of exempt solicitation
  'PX14A6G': (content, $) => {
    // For PX14A6G, focus on the main content
    const mainContent = $('.main-content, .body, #main-content').first();
    if (mainContent.length) {
      return cleanHtmlContent(mainContent.html() || '');
    }
    // Fallback to standard HTML cleaning
    return cleanHtmlContent(content);
  },
  
  // Default extractor for all other forms
  'default': (content, $) => {
    return cleanHtmlContent(content);
  }
};

/**
 * Clean HTML content by removing scripts, styles, and unnecessary elements
 * @param html - HTML content to clean
 * @param options - Cleaning options
 * @returns Cleaned text content
 */
function cleanHtmlContent(html: string, options: { preserveFormatting?: boolean } = {}): string {
  if (!html) return '';
  
  try {
    const $ = cheerio.load(html);
    
    // Remove scripts, styles, and other non-content elements
    $('script, style, meta, link, noscript, svg, canvas, img, iframe, [style*="display:none"], [style*="display: none"]').remove();
    
    // Remove image references
    $('img').remove();
    
    // Replace line breaks and paragraphs with newlines
    $('br').replaceWith('\n');
    $('p').append('\n\n');
    $('div').append('\n');
    
    // Replace tables with structured text if not preserving formatting
    if (!options.preserveFormatting) {
      $('table').each((_, table) => {
        const $table = $(table);
        let tableText = '\n';
        
        $table.find('tr').each((_, row) => {
          const $row = $(row);
          const cells = $row.find('th, td');
          
          if (cells.length) {
            const rowText = cells.map((_, cell) => $(cell).text().trim()).get().join(' | ');
            tableText += rowText + '\n';
          }
        });
        
        $table.replaceWith(tableText + '\n');
      });
    }
    
    // Get the text content - use root() to get the root element
    let text = $.root().text();
    
    // Clean up whitespace
    text = text.replace(/\s+/g, ' ');
    text = text.replace(/\n\s*\n/g, '\n\n');
    text = text.trim();
    
    return text;
  } catch (error) {
    componentLogger.warn(`Error cleaning HTML content: ${error instanceof Error ? error.message : String(error)}`);
    // Fallback to basic HTML tag removal if cheerio fails
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

/**
 * Extract content from XML document
 * @param xml - XML content
 * @param rootElement - Root element to extract from
 * @returns Extracted text content
 */
function extractXmlContent(xml: string, rootElement?: string): string {
  try {
    const $ = cheerio.load(xml, { xmlMode: true });
    
    // If root element specified, focus on that
    const root = rootElement ? $(rootElement) : $.root();
    
    // Convert XML to structured text
    let result = '';
    
    // Process each element
    root.children().each((_, elem) => {
      const $elem = $(elem);
      // Use name property for element name in cheerio
      const tagName = elem.type === 'tag' ? elem.name : '';
      
      // Skip processing XML processing instructions
      if (tagName === '?xml' || tagName === '?xml-stylesheet') {
        return;
      }
      
      // Get element text
      const text = $elem.text().trim();
      
      if (text) {
        // Format as "TagName: Text"
        result += `${tagName}: ${text}\n`;
      }
      
      // Process attributes if any
      if (elem.type === 'tag' && elem.attribs) {
        const attributes = elem.attribs;
        if (Object.keys(attributes).length > 0) {
          for (const [key, value] of Object.entries(attributes)) {
            if (value && typeof value === 'string' && value.trim()) {
              result += `${tagName}.${key}: ${value}\n`;
            }
          }
        }
      }
    });
    
    return result;
  } catch (error) {
    componentLogger.warn(`Error extracting XML content: ${error instanceof Error ? error.message : String(error)}`);
    // Fallback to returning the raw XML
    return xml;
  }
}

/**
 * Check if content is a directory listing
 * @param content - HTML content to check
 * @returns True if content appears to be a directory listing
 */
function isDirectoryListing(content: string): boolean {
  if (!content) return false;
  
  try {
    const $ = cheerio.load(content);
    
    // Check for directory listing indicators
    const hasDirectoryHeader = $('title').text().toLowerCase().includes('index of') || 
                              $('h1').text().toLowerCase().includes('index of');
    
    // Check for table with Name, Last modified, Size columns
    const hasDirectoryTable = $('table').find('th, td').text().match(/name.*last modified.*size/i) !== null;
    
    // Check for parent directory link
    const hasParentLink = $('a[href="../"]').length > 0 || 
                         $('a').filter((_, el) => $(el).text().includes('Parent Directory')).length > 0;
    
    return hasDirectoryHeader || hasDirectoryTable || hasParentLink;
  } catch (error) {
    componentLogger.warn(`Error checking for directory listing: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/**
 * Extract document links from directory listing
 * @param content - Directory listing HTML
 * @returns Array of document links
 */
function extractDocumentLinks(content: string): string[] {
  const links: string[] = [];
  let match;
  
  // Reset regex state
  PATTERNS.DOCUMENT_LINK.lastIndex = 0;
  
  // Extract all document links
  while ((match = PATTERNS.DOCUMENT_LINK.exec(content)) !== null) {
    const link = match[1];
    
    // Skip image files
    if (!PATTERNS.IMAGE_FILE.test(link)) {
      links.push(link);
    }
  }
  
  // Sort links by priority extension
  return links.sort((a, b) => {
    const aExt = a.substring(a.lastIndexOf('.'));
    const bExt = b.substring(b.lastIndexOf('.'));
    
    const aIndex = PRIORITY_EXTENSIONS.indexOf(aExt);
    const bIndex = PRIORITY_EXTENSIONS.indexOf(bExt);
    
    // If both extensions are in priority list, sort by priority
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }
    
    // If only one extension is in priority list, prioritize it
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;
    
    // Otherwise, sort alphabetically
    return a.localeCompare(b);
  });
}

/**
 * Resolve relative URL to absolute URL
 * @param relativeUrl - Relative URL
 * @param baseUrl - Base URL
 * @returns Absolute URL
 */
function resolveUrl(relativeUrl: string, baseUrl: string = SEC_BASE_URL): string {
  if (relativeUrl.startsWith('http')) {
    return relativeUrl;
  }
  
  // Ensure baseUrl ends with slash if it doesn't already
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  
  // Remove leading slash from relativeUrl if present
  const relative = relativeUrl.startsWith('/') ? relativeUrl.substring(1) : relativeUrl;
  
  return `${base}${relative}`;
}

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
  const operationId = `extract-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
  
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
    const absoluteUrl = filingUrl.startsWith('http') ? filingUrl : resolveUrl(filingUrl);
    componentLogger.debug(`Fetching content from ${absoluteUrl}`, { operationId });
    
    // Fetch the initial content
    let content = await fetchContent(absoluteUrl);
    let finalUrl = absoluteUrl;
    let attempts = 1;
    const maxAttempts = 3;
    
    // Check if we got a directory listing
    if (isDirectoryListing(content)) {
      componentLogger.debug(`Received directory listing, extracting document links`, { operationId });
      
      // Extract document links
      const links = extractDocumentLinks(content);
      
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
          const documentUrl = resolveUrl(link, absoluteUrl);
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
          if (!isDirectoryListing(content)) {
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
      if (isDirectoryListing(content)) {
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
        extractedContent = cleanHtmlContent(prospectus.html() || '');
      } else {
        extractedContent = cleanHtmlContent(content);
      }
    } else if (filingType === '4' as FilingType || filingType === '4/A' as FilingType) {
      // For Form 4, extract XML content if available
      if (content.includes('<?xml') || content.includes('<XML>')) {
        extractedContent = extractXmlContent(content);
      } else {
        // Otherwise clean the HTML
        extractedContent = cleanHtmlContent(content);
      }
    } else if (filingType === '144' as FilingType) {
      // For Form 144, focus on the form content
      const form144 = $('div.form144, div.doc-content');
      if (form144.length) {
        extractedContent = cleanHtmlContent(form144.html() || '');
      } else {
        extractedContent = cleanHtmlContent(content);
      }
    } else if (filingType === '11-K' as FilingType || filingType === '11-K/A' as FilingType) {
      // For 11-K, focus on financial statements
      const financials = $('div.financial-statements, div.doc-content');
      if (financials.length) {
        extractedContent = cleanHtmlContent(financials.html() || '');
      } else {
        extractedContent = cleanHtmlContent(content);
      }
    } else if (filingType === 'CORRESP' as FilingType || filingType === 'UPLOAD' as FilingType) {
      // For correspondence, clean the content
      extractedContent = cleanHtmlContent(content);
    } else if (filingType === 'PX14A6G' as FilingType) {
      // For proxy statements, focus on the proposal sections
      const proposals = $('div.proposal, div.doc-content, div.px14a6g');
      if (proposals.length) {
        extractedContent = cleanHtmlContent(proposals.html() || '');
      } else {
        extractedContent = cleanHtmlContent(content);
      }
    } else {
      // Default extraction for other filing types
      extractedContent = cleanHtmlContent(content);
    }
    
    // Validate processed content
    if (!extractedContent || extractedContent.trim().length < 50) {
      componentLogger.warn(`Extracted content is too short (${extractedContent?.length || 0} chars), falling back to raw content`, { operationId });
      
      // Fallback to basic HTML cleaning
      extractedContent = cleanHtmlContent(content);
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