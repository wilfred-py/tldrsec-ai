/**
 * SEC Filing Content Extractor
 *
 * Handles downloading and preprocessing SEC filings for AI analysis.
 *
 * The deep Filing intake module: a single interface (`extractFilingContent`)
 * fronts URL fetching, directory-listing traversal, form-type-specific
 * dispatch, HTML / XML cleaning, and a worker-pool fallback. A standalone
 * `cleanHtmlContent` export is provided for callers that need just the
 * cleaner without orchestration (used by token-saving preprocessors).
 */

import { SECFilingType } from '../ai/prompts/prompt-types';
import { logger } from '../logging';
import { monitoring } from '../monitoring';
import * as cheerio from 'cheerio';
import { Worker } from 'worker_threads';
import path from 'path';
import { FilingType } from '../sec-edgar/types';
import { SECErrorCode, SECEdgarError } from '../sec-edgar/types';
import axios from 'axios';
import { generateSecureOperationId } from '../security/secure-random';

// Component logger
const componentLogger = logger.child('filing-extractor');

// ---------------------------------------------------------------------------
// Private constants
// ---------------------------------------------------------------------------

const SEC_BASE_URL = 'https://www.sec.gov';
const MAX_CONTENT_SIZE = 10 * 1024 * 1024; // 10MB

const PATTERNS = {
  DIRECTORY_LISTING: /<title>Index of /i,
  XML_STYLESHEET: /<\?xml-stylesheet/i,
  HTML_DOCUMENT: /<html|<!DOCTYPE html/i,
  XML_DOCUMENT: /<\?xml|<xml/i,
  DOCUMENT_LINK: /href="([^"]+\.(htm|html|xml|txt))"/gi,
  IMAGE_FILE: /\.(jpg|jpeg|png|gif|svg|ico|bmp|tiff|webp)$/i,
  FORM4_XML: /<ownershipDocument/i,
  FORM144_XML: /<intentToSell/i
};

const PRIORITY_EXTENSIONS = ['.htm', '.html', '.xml', '.txt'];

// ---------------------------------------------------------------------------
// Private internal helpers (formerly filing-extractor-utils.ts)
// ---------------------------------------------------------------------------

/**
 * Worker pool for CPU-intensive parsing operations.
 */
class WorkerPool {
  private workers: Worker[] = [];
  private maxWorkers: number;
  private taskQueue: Array<{
    task: any,
    resolve: (value: any) => void,
    reject: (reason: any) => void
  }> = [];
  private availableWorkers: Worker[] = [];

  constructor(maxWorkers = 4) {
    this.maxWorkers = maxWorkers;
  }

  async process<T>(task: any): Promise<T> {
    return new Promise((resolve, reject) => {
      this.taskQueue.push({ task, resolve, reject });
      this.processQueue();
    });
  }

  private processQueue() {
    if (this.taskQueue.length === 0) return;

    if (this.availableWorkers.length > 0) {
      const worker = this.availableWorkers.pop()!;
      const { task, resolve, reject } = this.taskQueue.shift()!;

      worker.once('message', (result) => {
        this.availableWorkers.push(worker);
        resolve(result);
        this.processQueue();
      });

      worker.once('error', (err) => {
        this.availableWorkers.push(worker);
        reject(err);
        this.processQueue();
      });

      worker.postMessage(task);
    } else if (this.workers.length < this.maxWorkers) {
      const worker = new Worker(path.join(__dirname, 'parser-worker.js'));
      this.workers.push(worker);

      const { task, resolve, reject } = this.taskQueue.shift()!;

      worker.once('message', (result) => {
        this.availableWorkers.push(worker);
        resolve(result);
        this.processQueue();
      });

      worker.once('error', (err) => {
        this.availableWorkers.push(worker);
        reject(err);
        this.processQueue();
      });

      worker.postMessage(task);
    }
  }

  terminate() {
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.availableWorkers = [];
  }
}

const workerPool = new WorkerPool();

/**
 * Clean HTML content by stripping scripts, styles, comments, and other
 * non-content elements. Preserves table structure (pipe-delimited rows),
 * list structure (bulleted), and headings (markdown-style).
 *
 * Exported because callers outside the filing-extraction pipeline use the
 * cleaner directly (e.g. token-saving preprocessors).
 */
export function cleanHtmlContent(html: string, options: { preserveFormatting?: boolean } = {}): string {
  if (!html) return '';

  try {
    const $ = cheerio.load(html);

    // Remove scripts, styles, and comments
    $('script, style, noscript, iframe, object, embed').remove();

    $('*').contents().each(function() {
      if (this.type === 'comment') {
        $(this).remove();
      }
    });

    const bodyContent = $('body').length ? $('body') : $.root();

    // Handle tables specially to preserve structure
    bodyContent.find('table').each(function() {
      const $table = $(this);
      const rows: string[] = [];

      $table.find('tr').each(function() {
        const cells: string[] = [];
        $(this).find('td, th').each(function() {
          cells.push($(this).text().trim());
        });
        if (cells.length > 0) {
          rows.push(cells.join(' | '));
        }
      });

      if (rows.length > 0) {
        $table.replaceWith(rows.join('\n'));
      }
    });

    // Handle lists to preserve structure
    bodyContent.find('ul, ol').each(function() {
      const $list = $(this);
      const items: string[] = [];

      $list.find('li').each(function() {
        items.push('• ' + $(this).text().trim());
      });

      if (items.length > 0) {
        $list.replaceWith(items.join('\n'));
      }
    });

    if (!options.preserveFormatting) {
      bodyContent.find('div, p, br, hr').each(function() {
        $(this).replaceWith('\n' + $(this).text() + '\n');
      });
    }

    bodyContent.find('h1, h2, h3, h4, h5, h6').each(function() {
      const level = this.name.charAt(1);
      const prefix = '#'.repeat(parseInt(level));
      $(this).replaceWith('\n' + prefix + ' ' + $(this).text() + '\n');
    });

    let text = bodyContent.text();
    text = text.replace(/\s+/g, ' ').trim();
    text = text.replace(/\.\s+([A-Z])/g, '.\n\n$1');

    return text;
  } catch (error) {
    componentLogger.error(`Error cleaning HTML: ${error instanceof Error ? error.message : String(error)}`);

    // Basic fallback if cheerio fails
    return html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

/**
 * Async clean HTML content (worker-pool offloaded). Falls back to sync
 * implementation on worker failure.
 */
async function cleanHtmlContentAsync(html: string, options: { preserveFormatting?: boolean } = {}): Promise<string> {
  try {
    return await workerPool.process({
      type: 'cleanHtml',
      html,
      options
    });
  } catch (error) {
    componentLogger.error(`Error in async HTML cleaning: ${error instanceof Error ? error.message : String(error)}`);
    return cleanHtmlContent(html, options);
  }
}

/**
 * Extract content from XML document synchronously.
 */
function extractXmlContent(xml: string, rootElement?: string): string {
  if (!xml) return '';

  try {
    const $ = cheerio.load(xml, {
      xmlMode: true
    });

    const root = rootElement ? $(rootElement).first() : $.root();

    if (rootElement && !root.length) {
      componentLogger.warn(`Root element "${rootElement}" not found in XML`);
    }

    let result = '';

    function extractTextFromNode(node: cheerio.Element) {
      const $node = $(node);

      if (node.type === 'directive' || node.type === 'comment') {
        return;
      }

      const nodeName = node.name?.toLowerCase();

      if (['style', 'script', 'noscript'].includes(nodeName)) {
        return;
      }

      if (node.type === 'text') {
        const text = $(node).text().trim();
        if (text) {
          result += text + ' ';
        }
        return;
      }

      if (['p', 'div', 'br', 'tr', 'li'].includes(nodeName)) {
        result += '\n';
      }

      if (nodeName && nodeName.match(/^h[1-6]$/)) {
        const level = nodeName.charAt(1);
        result += '\n' + '#'.repeat(parseInt(level)) + ' ';
      }

      $node.contents().each((_, child) => {
        extractTextFromNode(child);
      });

      if (['p', 'div', 'tr', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(nodeName)) {
        result += '\n';
      }
    }

    root.contents().each((_, child) => {
      extractTextFromNode(child);
    });

    result = result.replace(/\s+/g, ' ').trim();
    result = result.replace(/\.\s+([A-Z])/g, '.\n\n$1');

    return result;
  } catch (error) {
    componentLogger.error(`Error extracting XML: ${error instanceof Error ? error.message : String(error)}`);

    return xml
      .replace(/<\?[^>]+\?>/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

/**
 * Async XML extraction (worker-pool offloaded). Falls back to sync on worker failure.
 */
async function extractXmlContentAsync(xml: string, rootElement?: string): Promise<string> {
  try {
    return await workerPool.process({
      type: 'extractXml',
      xml,
      rootElement
    });
  } catch (error) {
    componentLogger.error(`Error in async XML extraction: ${error instanceof Error ? error.message : String(error)}`);
    return extractXmlContent(xml, rootElement);
  }
}

/**
 * Heuristic check whether content is an EDGAR directory listing page rather
 * than a filing document.
 */
function isDirectoryListing(content: string): boolean {
  if (PATTERNS.DIRECTORY_LISTING.test(content)) {
    return true;
  }

  try {
    const $ = cheerio.load(content);

    const hasDirectoryTable = $('table').find('th, td').text().match(/Name.*Last modified.*Size/i) !== null;

    const links = $('a');
    let directoryLinkCount = 0;

    links.each((_, link) => {
      const href = $(link).attr('href');
      if (href && (href.endsWith('/') || href.match(/\.(html?|xml|txt|pdf)$/i))) {
        directoryLinkCount++;
      }
    });

    return hasDirectoryTable || (links.length > 5 && directoryLinkCount > links.length * 0.7);
  } catch (error) {
    return false;
  }
}

/**
 * Pull document links out of a directory listing, sorted by priority extension.
 */
function extractDocumentLinks(content: string): string[] {
  const links: string[] = [];

  try {
    const $ = cheerio.load(content);

    $('a').each((_, link) => {
      const href = $(link).attr('href');

      if (!href || href === '../' || href === './') {
        return;
      }

      if (PATTERNS.IMAGE_FILE.test(href)) {
        return;
      }

      if (href.match(/\.(htm|html|xml|txt)$/i)) {
        links.push(href);
      }
    });

    return links.sort((a, b) => {
      const aExt = path.extname(a).toLowerCase();
      const bExt = path.extname(b).toLowerCase();

      const aIndex = PRIORITY_EXTENSIONS.indexOf(aExt);
      const bIndex = PRIORITY_EXTENSIONS.indexOf(bExt);

      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex;
      } else if (aIndex !== -1) {
        return -1;
      } else if (bIndex !== -1) {
        return 1;
      }

      return a.localeCompare(b);
    });
  } catch (error) {
    componentLogger.error(`Error extracting document links: ${error instanceof Error ? error.message : String(error)}`);

    const matches = [...content.matchAll(PATTERNS.DOCUMENT_LINK)];
    return matches.map(match => match[1]).filter(link => !PATTERNS.IMAGE_FILE.test(link));
  }
}

/**
 * Resolve a relative URL against a base URL.
 */
function resolveUrl(relativeUrl: string, baseUrl: string = SEC_BASE_URL): string {
  try {
    if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
      return relativeUrl;
    }

    if (relativeUrl.startsWith('/')) {
      const url = new URL(baseUrl);
      return `${url.protocol}//${url.host}${relativeUrl}`;
    } else {
      if (!baseUrl.endsWith('/')) {
        baseUrl = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
      }
      return baseUrl + relativeUrl;
    }
  } catch (error) {
    componentLogger.error(`Error resolving URL: ${error instanceof Error ? error.message : String(error)}`);

    if (relativeUrl.startsWith('/')) {
      return `${baseUrl.replace(/\/$/, '')}${relativeUrl}`;
    } else {
      return `${baseUrl.replace(/\/[^/]*$/, '/')}${relativeUrl}`;
    }
  }
}

// Internal aliases (preserve call-site names from the previous split).
const cleanHtml = cleanHtmlContent;
const cleanHtmlAsync = cleanHtmlContentAsync;
const extractXml = extractXmlContent;
const extractXmlAsync = extractXmlContentAsync;
const isDirListing = isDirectoryListing;
const extractDocLinks = extractDocumentLinks;
const resolveUrlPath = resolveUrl;

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