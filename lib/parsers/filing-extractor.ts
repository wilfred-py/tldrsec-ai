/**
 * SEC Filing Content Extractor
 * 
 * Handles downloading and preprocessing SEC filings for AI analysis
 * Implements factory pattern for filing extractors and async processing
 */

import { SECFilingType } from '../ai/prompts/prompt-types';
import { logger } from '../logging';
import { monitoring } from '../monitoring';
import * as cheerio from 'cheerio';
import { FilingType } from '../sec-edgar/types';
import { SECErrorCode, SECEdgarError } from '../sec-edgar/types';
import { Worker } from 'worker_threads';
import { promisify } from 'util';
import { cpus } from 'os';
import { join } from 'path';

// Component logger
const componentLogger = logger.child('filing-extractor');

// SEC base URL for resolving relative URLs
const SEC_BASE_URL = 'https://www.sec.gov';

// Maximum content size to process (in characters)
const MAX_CONTENT_SIZE = 10 * 1024 * 1024; // 10MB

// Maximum number of worker threads for CPU-intensive operations
const MAX_WORKERS = Math.max(1, Math.min(cpus().length - 1, 4)); // Use at most N-1 cores, max 4

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
 * Interfaces for filing extractor pattern
 */
interface ExtractionResult {
  content: string;
  metadata?: Record<string, any>;
}

interface FilingExtractor {
  canHandle(content: string, filingType: FilingType): boolean;
  extract(content: string, $: cheerio.CheerioAPI): ExtractionResult;
}

interface ExtractionContext {
  content: string;
  $: cheerio.CheerioAPI;
  filingType: FilingType;
  operationId: string;
}

/**
 * Form-specific content extraction strategies using factory pattern
 */
/**
 * Filing Extractor implementations using factory pattern
 */

// Base class for filing extractors
class BaseFilingExtractor implements FilingExtractor {
  canHandle(content: string, filingType: FilingType): boolean {
    return true; // Default extractor handles everything
  }
  
  extract(content: string, $: cheerio.CheerioAPI): ExtractionResult {
    return { content: cleanHtmlContent(content) };
  }
}

// Form 424B2 - Prospectus
class Form424B2Extractor extends BaseFilingExtractor {
  canHandle(content: string, filingType: FilingType): boolean {
    return filingType === '424B2' as FilingType;
  }
  
  extract(content: string, $: cheerio.CheerioAPI): ExtractionResult {
    // For 424B2, focus on the main content and remove navigation/headers
    const mainContent = $('.main-content, .body, #main-content, .filing-content').first();
    if (mainContent.length) {
      return { content: cleanHtmlContent(mainContent.html() || '') };
    }
    // Fallback to standard HTML cleaning if specific elements not found
    return { content: cleanHtmlContent(content) };
  }
}

// Form 11-K - Employee Stock Purchase Plans
class Form11KExtractor extends BaseFilingExtractor {
  canHandle(content: string, filingType: FilingType): boolean {
    return filingType === '11-K' as FilingType || filingType === '11-K/A' as FilingType;
  }
  
  extract(content: string, $: cheerio.CheerioAPI): ExtractionResult {
    // For 11-K, prioritize tables and financial data
    const tables = $('table');
    if (tables.length) {
      let tableContent = '';
      tables.each((_, table) => {
        tableContent += $(table).text() + '\n\n';
      });
      if (tableContent.length > 500) { // Only use tables if substantial content found
        return { content: tableContent };
      }
    }
    // Fallback to standard HTML cleaning
    return { content: cleanHtmlContent(content) };
  }
}

// Form 4 - Insider Trading
class Form4Extractor extends BaseFilingExtractor {
  canHandle(content: string, filingType: FilingType): boolean {
    return filingType === '4' as FilingType || filingType === '4/A' as FilingType;
  }
  
  extract(content: string, $: cheerio.CheerioAPI): ExtractionResult {
    // For Form 4, check if it's XML format
    if (PATTERNS.FORM4_XML.test(content)) {
      return { content: extractXmlContent(content, 'ownershipDocument') };
    }
    // Otherwise treat as HTML
    return { content: cleanHtmlContent(content) };
  }
}

// Form 144 - Notice of Proposed Sale
class Form144Extractor extends BaseFilingExtractor {
  canHandle(content: string, filingType: FilingType): boolean {
    return filingType === '144' as FilingType;
  }
  
  extract(content: string, $: cheerio.CheerioAPI): ExtractionResult {
    // For Form 144, check if it's XML format
    if (PATTERNS.FORM144_XML.test(content)) {
      return { content: extractXmlContent(content, 'intentToSell') };
    }
    // Otherwise treat as HTML
    return { content: cleanHtmlContent(content) };
  }
}

// CORRESP - Correspondence
class CorrespExtractor extends BaseFilingExtractor {
  canHandle(content: string, filingType: FilingType): boolean {
    return filingType === 'CORRESP' as FilingType;
  }
  
  extract(content: string, $: cheerio.CheerioAPI): ExtractionResult {
    // For correspondence, preserve formatting but clean HTML
    return { content: cleanHtmlContent(content, { preserveFormatting: true }) };
  }
}

// UPLOAD - Uploaded documents
class UploadExtractor extends BaseFilingExtractor {
  canHandle(content: string, filingType: FilingType): boolean {
    return filingType === 'UPLOAD' as FilingType;
  }
  
  extract(content: string, $: cheerio.CheerioAPI): ExtractionResult {
    // For uploaded documents, preserve formatting but clean HTML
    return { content: cleanHtmlContent(content, { preserveFormatting: true }) };
  }
}

// PX14A6G - Notice of exempt solicitation
class PX14A6GExtractor extends BaseFilingExtractor {
  canHandle(content: string, filingType: FilingType): boolean {
    return filingType === 'PX14A6G' as FilingType;
  }
  
  extract(content: string, $: cheerio.CheerioAPI): ExtractionResult {
    // For PX14A6G, focus on the main content
    const mainContent = $('.main-content, .body, #main-content').first();
    if (mainContent.length) {
      return { content: cleanHtmlContent(mainContent.html() || '') };
    }
    // Fallback to standard HTML cleaning
    return { content: cleanHtmlContent(content) };
  }
}

/**
 * Filing Extractor Factory
 */
class FilingExtractorFactory {
  private static extractors: FilingExtractor[] = [
    new Form424B2Extractor(),
    new Form11KExtractor(),
    new Form4Extractor(),
    new Form144Extractor(),
    new CorrespExtractor(),
    new UploadExtractor(),
    new PX14A6GExtractor(),
    new BaseFilingExtractor() // Default extractor as fallback
  ];
  
  static getExtractor(content: string, filingType: FilingType): FilingExtractor {
    // Find the first extractor that can handle this filing type
    const extractor = this.extractors.find(ext => ext.canHandle(content, filingType));
    return extractor || new BaseFilingExtractor();
  }
}

// Legacy compatibility layer for existing code
const formExtractors: Record<string, (content: string, $: cheerio.CheerioAPI) => string> = {
  // Form 424B2 - Prospectus
  '424B2': (content, $) => FilingExtractorFactory.getExtractor(content, '424B2' as FilingType).extract(content, $).content,
  
  // Form 11-K - Employee Stock Purchase Plans
  '11-K': (content, $) => FilingExtractorFactory.getExtractor(content, '11-K' as FilingType).extract(content, $).content,
  
  // Form 4 - Insider Trading
  '4': (content, $) => FilingExtractorFactory.getExtractor(content, '4' as FilingType).extract(content, $).content,
  
  // Form 144 - Notice of Proposed Sale
  '144': (content, $) => FilingExtractorFactory.getExtractor(content, '144' as FilingType).extract(content, $).content,
  
  // CORRESP - Correspondence
  'CORRESP': (content, $) => FilingExtractorFactory.getExtractor(content, 'CORRESP' as FilingType).extract(content, $).content,
  
  // UPLOAD - Uploaded documents
  'UPLOAD': (content, $) => FilingExtractorFactory.getExtractor(content, 'UPLOAD' as FilingType).extract(content, $).content,
  
  // PX14A6G - Notice of exempt solicitation
  'PX14A6G': (content, $) => FilingExtractorFactory.getExtractor(content, 'PX14A6G' as FilingType).extract(content, $).content,
  
  // Default extractor for all other forms
  'default': (content, $) => FilingExtractorFactory.getExtractor(content, 'default' as FilingType).extract(content, $).content
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
    
    // Remove script and style tags
    $('script, style, link, meta, noscript').remove();
    
    // Remove comments
    $('*').contents().each(function(this: any) {
      if (this.type === 'comment') {
        $(this).remove();
      }
    });
    
    // Remove hidden elements
    $('[style*="display:none"], [style*="display: none"], [hidden], .hidden').remove();
    
    // Remove navigation elements
    $('nav, .navigation, .nav, .menu, .sidebar, .footer, footer, header, .header').remove();
    
    // Replace line breaks and paragraphs with newlines
    $('br').replaceWith('\n');
    $('p').append('\n\n');
    $('div').append('\n');
    
    // Replace headings with formatted text
    $('h1, h2, h3, h4, h5, h6').each(function(this: any) {
      const text = $(this).text().trim();
      $(this).replaceWith(`\n\n${text}\n\n`);
    });
    
    // Handle tables specially to preserve structure
    $('table').each(function(this: any) {
      const $table = $(this);
      const tableText: string[] = [];
      
      $table.find('tr').each(function(this: any) {
        const rowText: string[] = [];
        $(this).find('th, td').each(function(this: any) {
          rowText.push($(this).text().trim());
        });
        tableText.push(rowText.join(' | '));
      });
      
      $table.replaceWith(`\n${tableText.join('\n')}\n`);
    });
    
    // Get the text content
    let text = '';
    
    if (options.preserveFormatting) {
      // For documents where formatting matters, use a more careful approach
      $('body').find('*').each(function(this: any) {
        const element = $(this);
        const tagName = element.prop('tagName')?.toLowerCase();
        
        // Add appropriate spacing based on element type
        if (['div', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li'].includes(tagName)) {
          text += element.text().trim() + '\n\n';
        } else if (['span', 'strong', 'em', 'b', 'i'].includes(tagName)) {
          text += element.text().trim() + ' ';
        }
      });
    } else {
      // For regular documents, just get the text
      text = $('body').text();
    }
    
    // Clean up whitespace
    text = text.replace(/\s+/g, ' ');
    text = text.replace(/\n\s*\n/g, '\n\n');
    text = text.trim();
    
    return text;
  } catch (error) {
    componentLogger.warn(`Error cleaning HTML content: ${error instanceof Error ? error.message : String(error)}`);
    // Return raw HTML with simple tag removal as fallback
    return html.replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

/**
 * Clean HTML content asynchronously using worker threads
 * @param html - HTML content to clean
 * @param options - Cleaning options
 * @returns Promise with cleaned text content
 */
async function cleanHtmlContentAsync(html: string, options: { preserveFormatting?: boolean } = {}): Promise<string> {
  if (!html) return '';
  if (html.length < 50000) {
    // For small HTML content, process synchronously
    return cleanHtmlContent(html, options);
  }
  
  try {
    // For large HTML content, use worker threads to avoid blocking the event loop
    const workerScript = `
      import { parentPort, workerData } from 'worker_threads';
      import * as cheerio from 'cheerio';
      
      const { html, options } = workerData;
      const $ = cheerio.load(html);
      
      // Remove script and style tags
      $('script, style, link, meta, noscript').remove();
      
      // Remove comments
      $('*').contents().each(function(this: any) {
        if (this.type === 'comment') {
          $(this).remove();
        }
      });
      
      // Remove hidden elements
      $('[style*="display:none"], [style*="display: none"], [hidden], .hidden').remove();
      
      // Remove navigation elements
      $('nav, .navigation, .nav, .menu, .sidebar, .footer, footer, header, .header').remove();
      
      // Replace line breaks and paragraphs with newlines
      $('br').replaceWith('\\n');
      $('p').append('\\n\\n');
      $('div').append('\\n');
      
      // Get the text content
      let text = $('body').text();
      
      // Clean up whitespace
      text = text.replace(/\\s+/g, ' ');
      text = text.replace(/\\n\\s*\\n/g, '\\n\\n');
      text = text.trim();
      
      parentPort.postMessage(text);
    `;
    
    // Create a temporary worker file with .mjs extension for ES modules
    const tempWorkerPath = join(__dirname, 'temp-worker.mjs');
    const fs = await import('fs/promises');
    await fs.writeFile(tempWorkerPath, workerScript);
    
    return new Promise((resolve, reject) => {
      const worker = new Worker(tempWorkerPath, { workerData: { html, options } });
      
      worker.on('message', (result) => {
        // Clean up the temporary worker file
        fs.unlink(tempWorkerPath).catch(() => {});
        resolve(result);
      });
      
      worker.on('error', (err) => {
        // Clean up the temporary worker file
        fs.unlink(tempWorkerPath).catch(() => {});
        reject(err);
      });
      
      worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
    });
  } catch (error) {
    componentLogger.warn(`Error in async HTML cleaning: ${error instanceof Error ? error.message : String(error)}`);
    // Fallback to synchronous processing
    return cleanHtmlContent(html, options);
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
 * Log the start of the extraction process
 * @param filingUrl - URL of the filing
 * @param filingType - Type of filing
 * @param operationId - Operation ID for tracking
 */
function logExtractionStart(filingUrl: string, filingType: FilingType, operationId: string): void {
  componentLogger.info(`Extracting content from ${filingType} filing`, {
    filingUrl,
    filingType,
    operationId
  });
  
  monitoring.incrementCounter('filing.extraction_started', 1, {
    filingType
  });
}

/**
 * Fetch filing content, handling directory listings
 * @param filingUrl - URL of the filing
 * @param operationId - Operation ID for tracking
 * @returns Object containing content and final URL
 */
async function fetchFilingContent(filingUrl: string, operationId: string): Promise<{ content: string, finalUrl: string }> {
  // Ensure URL is absolute
  const absoluteUrl = filingUrl.startsWith('http') ? filingUrl : resolveUrl(filingUrl);
  componentLogger.debug(`Fetching content from ${absoluteUrl}`, { operationId });
  
  // Fetch the initial content
  let content = await fetchContent(absoluteUrl);
  let finalUrl = absoluteUrl;
  
  // Handle directory listings
  if (isDirectoryListing(content)) {
    const result = await handleDirectoryListing(content, absoluteUrl, operationId);
    content = result.content;
    finalUrl = result.finalUrl;
  }
  
  return { content, finalUrl };
}

/**
 * Handle directory listings by extracting and following document links
 * @param content - Directory listing content
 * @param baseUrl - Base URL for resolving relative links
 * @param operationId - Operation ID for tracking
 * @returns Object containing content and final URL
 */
async function handleDirectoryListing(
  content: string, 
  baseUrl: string, 
  operationId: string
): Promise<{ content: string, finalUrl: string }> {
  componentLogger.debug(`Received directory listing, extracting document links`, { operationId });
  
  // Extract document links
  const links = extractDocumentLinks(content);
  
  if (links.length === 0) {
    throw new SECEdgarError(
      `No document links found in directory listing at ${baseUrl}`,
      SECErrorCode.DOCUMENT_NOT_FOUND
    );
  }
  
  // Try each link until we find valid content
  let attempts = 1;
  const maxAttempts = 3;
  let finalContent = content;
  let finalUrl = baseUrl;
  
  for (const link of links) {
    if (attempts > maxAttempts) break;
    
    try {
      // Resolve relative URL to absolute URL
      const documentUrl = resolveUrl(link, baseUrl);
      componentLogger.debug(`Trying document link: ${documentUrl}`, { operationId, attempt: attempts });
      
      // Skip image files
      if (PATTERNS.IMAGE_FILE.test(documentUrl)) {
        componentLogger.debug(`Skipping image file: ${documentUrl}`, { operationId });
        continue;
      }
      
      // Fetch document content
      finalContent = await fetchContent(documentUrl);
      finalUrl = documentUrl;
      
      // If this is not a directory listing, we found our content
      if (!isDirectoryListing(finalContent)) {
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
  if (isDirectoryListing(finalContent)) {
    throw new SECEdgarError(
      `Failed to find valid content after trying ${attempts} document links`,
      SECErrorCode.DOCUMENT_NOT_FOUND
    );
  }
  
  return { content: finalContent, finalUrl };
}

/**
 * Extract content based on filing type
 * @param content - Raw content
 * @param filingType - Type of filing
 * @param operationId - Operation ID for tracking
 * @returns Extracted content
 */
async function extractContentByFilingType(
  content: string, 
  filingType: FilingType, 
  operationId: string
): Promise<string> {
  // Process the content based on filing type
  const $ = cheerio.load(content);
  
  // Use the factory pattern to get the appropriate extractor
  const extractor = FilingExtractorFactory.getExtractor(content, filingType);
  // Pass $ as a CheerioAPI parameter by casting it to any to avoid type errors
  // This is safe because the extractor implementations handle it correctly
  const extractionResult = extractor.extract(content, $ as any);
  let extractedContent = extractionResult.content;
  
  // Validate processed content
  if (!extractedContent || extractedContent.trim().length < 50) {
    componentLogger.warn(`Extracted content is too short (${extractedContent?.length || 0} chars), falling back to raw content`, { operationId });
    
    // Fallback to basic HTML cleaning
    extractedContent = cleanHtmlContent(content);
  }
  
  return extractedContent;
}

/**
 * Handle extraction errors
 * @param error - Error that occurred
 * @param filingUrl - URL of the filing
 * @param filingType - Type of filing
 * @param startTime - Start time of extraction
 * @param operationId - Operation ID for tracking
 */
function handleExtractionError(
  error: unknown, 
  filingUrl: string, 
  filingType: FilingType, 
  startTime: number, 
  operationId: string
): never {
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

/**
 * Log successful extraction and record metrics
 * @param extractedContent - Extracted content
 * @param filingType - Type of filing
 * @param finalUrl - Final URL used
 * @param startTime - Start time of extraction
 * @param operationId - Operation ID for tracking
 * @param rawContentLength - Length of raw content for metrics
 */
function logExtractionSuccess(
  extractedContent: string, 
  filingType: FilingType, 
  finalUrl: string, 
  startTime: number, 
  operationId: string,
  rawContentLength: number
): void {
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
      monitoringAny.recordDistribution('sec_filing_content_size', rawContentLength, {
        filing_type: filingType,
        operation_id: operationId,
      });
    }
  } catch (error) {
    componentLogger.warn(`Failed to record metrics: ${error instanceof Error ? error.message : String(error)}`);
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
  
  try {
    // Step 1: Log the start of extraction
    logExtractionStart(filingUrl, filingType, operationId);
    
    // Step 2: Fetch the content, handling directory listings
    const { content, finalUrl } = await fetchFilingContent(filingUrl, operationId);
    
    // Step 3: Extract content based on filing type
    const extractedContent = await extractContentByFilingType(content, filingType, operationId);
    
    // Step 4: Log success and record metrics
    logExtractionSuccess(extractedContent, filingType, finalUrl, startTime, operationId, content.length);
    
    return extractedContent;
  } catch (error) {
    // Step 5: Handle errors
    handleExtractionError(error, filingUrl, filingType, startTime, operationId);
  }
}