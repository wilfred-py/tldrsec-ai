/**
 * SEC Filing Extractor Utilities
 * 
 * Provides utility functions for extracting and processing SEC filing content
 */

import * as cheerio from 'cheerio';
import { logger } from '../logging';
import { monitoring } from '../monitoring';
import { Worker } from 'worker_threads';
import path from 'path';

// Component logger
const componentLogger = logger.child('filing-extractor-utils');

// SEC base URL for resolving relative URLs
export const SEC_BASE_URL = 'https://www.sec.gov';

// Maximum content size to process (in characters)
export const MAX_CONTENT_SIZE = 10 * 1024 * 1024; // 10MB

// Regex patterns for identifying specific content
export const PATTERNS = {
  // Pattern to identify directory listings
  DIRECTORY_LISTING: /<title>Index of /i,
  // Pattern to identify XML stylesheets
  XML_STYLESHEET: /<\?xml-stylesheet/i,
  // Pattern to identify HTML documents
  HTML_DOCUMENT: /<html|<!DOCTYPE html/i,
  // Pattern to identify XML documents
  XML_DOCUMENT: /<\?xml|<xml/i,
  // Pattern to identify document links in directory listings
  DOCUMENT_LINK: /href="([^"]+\.(htm|html|xml|txt))"/gi,
  // Pattern to identify image files (to be skipped)
  IMAGE_FILE: /\.(jpg|jpeg|png|gif|svg|ico|bmp|tiff|webp)$/i,
  // Form 4 XML pattern
  FORM4_XML: /<ownershipDocument/i,
  // Form 144 XML pattern
  FORM144_XML: /<intentToSell/i
};

// File extensions to prioritize when multiple documents are found
export const PRIORITY_EXTENSIONS = [
  '.htm',
  '.html',
  '.xml',
  '.txt'
];

/**
 * Worker pool for CPU-intensive parsing operations
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

// Create a worker pool for parsing operations
const workerPool = new WorkerPool();

/**
 * Clean HTML content by removing scripts, styles, and unnecessary elements
 * @param html - HTML content to clean
 * @param options - Cleaning options
 * @returns Cleaned text content
 */
export async function cleanHtmlContentAsync(html: string, options: { preserveFormatting?: boolean } = {}): Promise<string> {
  try {
    return await workerPool.process({
      type: 'cleanHtml',
      html,
      options
    });
  } catch (error) {
    componentLogger.error(`Error in async HTML cleaning: ${error instanceof Error ? error.message : String(error)}`);
    // Fallback to synchronous processing if worker fails
    return cleanHtmlContent(html, options);
  }
}

/**
 * Clean HTML content synchronously (fallback method)
 * @param html - HTML content to clean
 * @param options - Cleaning options
 * @returns Cleaned text content
 */
export function cleanHtmlContent(html: string, options: { preserveFormatting?: boolean } = {}): string {
  if (!html) return '';
  
  try {
    const $ = cheerio.load(html);
    
    // Remove scripts, styles, and comments
    $('script, style, noscript, iframe, object, embed').remove();
    
    // Remove comments
    $('*').contents().each(function() {
      if (this.type === 'comment') {
        $(this).remove();
      }
    });
    
    // Process the body content
    let bodyContent = $('body').length ? $('body') : $.root();
    
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
    
    // Replace divs and paragraphs with newlines
    if (!options.preserveFormatting) {
      bodyContent.find('div, p, br, hr').each(function() {
        $(this).replaceWith('\n' + $(this).text() + '\n');
      });
    }
    
    // Replace headings with emphasized text
    bodyContent.find('h1, h2, h3, h4, h5, h6').each(function() {
      const level = this.name.charAt(1);
      const prefix = '#'.repeat(parseInt(level));
      $(this).replaceWith('\n' + prefix + ' ' + $(this).text() + '\n');
    });
    
    // Get the text content
    let text = bodyContent.text();
    
    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    // Restore some paragraph breaks
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
 * Extract content from XML document asynchronously
 * @param xml - XML content
 * @param rootElement - Root element to extract from
 * @returns Extracted text content
 */
export async function extractXmlContentAsync(xml: string, rootElement?: string): Promise<string> {
  try {
    return await workerPool.process({
      type: 'extractXml',
      xml,
      rootElement
    });
  } catch (error) {
    componentLogger.error(`Error in async XML extraction: ${error instanceof Error ? error.message : String(error)}`);
    // Fallback to synchronous processing if worker fails
    return extractXmlContent(xml, rootElement);
  }
}

/**
 * Extract content from XML document synchronously (fallback method)
 * @param xml - XML content
 * @param rootElement - Root element to extract from
 * @returns Extracted text content
 */
export function extractXmlContent(xml: string, rootElement?: string): string {
  if (!xml) return '';
  
  try {
    // Load the XML
    const $ = cheerio.load(xml, {
      xmlMode: true
    });
    
    // If a root element is specified, focus on that element
    const root = rootElement ? $(rootElement).first() : $.root();
    
    if (rootElement && !root.length) {
      componentLogger.warn(`Root element "${rootElement}" not found in XML`);
    }
    
    // Process the content
    let result = '';
    
    // Extract text from all elements, preserving structure
    function extractTextFromNode(node: cheerio.Element) {
      const $node = $(node);
      
      // Skip XML processing instructions and comments
      if (node.type === 'directive' || node.type === 'comment') {
        return;
      }
      
      // Get the node name
      const nodeName = node.name?.toLowerCase();
      
      // Skip certain elements
      if (['style', 'script', 'noscript'].includes(nodeName)) {
        return;
      }
      
      // Handle text nodes
      if (node.type === 'text') {
        const text = $(node).text().trim();
        if (text) {
          result += text + ' ';
        }
        return;
      }
      
      // Handle elements that should create line breaks
      if (['p', 'div', 'br', 'tr', 'li'].includes(nodeName)) {
        result += '\n';
      }
      
      // Handle heading elements
      if (nodeName && nodeName.match(/^h[1-6]$/)) {
        const level = nodeName.charAt(1);
        result += '\n' + '#'.repeat(parseInt(level)) + ' ';
      }
      
      // Process children
      $node.contents().each((_, child) => {
        extractTextFromNode(child);
      });
      
      // Add line breaks after certain elements
      if (['p', 'div', 'tr', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(nodeName)) {
        result += '\n';
      }
    }
    
    // Start extraction from the root
    root.contents().each((_, child) => {
      extractTextFromNode(child);
    });
    
    // Clean up whitespace
    result = result.replace(/\s+/g, ' ').trim();
    
    // Restore some paragraph breaks
    result = result.replace(/\.\s+([A-Z])/g, '.\n\n$1');
    
    return result;
  } catch (error) {
    componentLogger.error(`Error extracting XML: ${error instanceof Error ? error.message : String(error)}`);
    
    // Basic fallback if cheerio fails
    return xml
      .replace(/<\?[^>]+\?>/g, '') // Remove XML processing instructions
      .replace(/<[^>]+>/g, ' ')    // Remove all XML tags
      .replace(/\s+/g, ' ')        // Normalize whitespace
      .trim();
  }
}

/**
 * Check if content is a directory listing
 * @param content - HTML content to check
 * @returns True if content appears to be a directory listing
 */
export function isDirectoryListing(content: string): boolean {
  // Check for directory listing patterns
  if (PATTERNS.DIRECTORY_LISTING.test(content)) {
    return true;
  }
  
  // Check for common directory listing elements
  try {
    const $ = cheerio.load(content);
    
    // Check for table with "Name", "Last modified", "Size" headers
    const hasDirectoryTable = $('table').find('th, td').text().match(/Name.*Last modified.*Size/i) !== null;
    
    // Check for links that look like directory entries
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
    return false; // If we can't parse the HTML, assume it's not a directory listing
  }
}

/**
 * Extract document links from directory listing
 * @param content - Directory listing HTML
 * @returns Array of document links
 */
export function extractDocumentLinks(content: string): string[] {
  const links: string[] = [];
  
  try {
    const $ = cheerio.load(content);
    
    // Find all links
    $('a').each((_, link) => {
      const href = $(link).attr('href');
      
      // Skip if no href or it's a parent directory link
      if (!href || href === '../' || href === './') {
        return;
      }
      
      // Skip image files and other non-document files
      if (PATTERNS.IMAGE_FILE.test(href)) {
        return;
      }
      
      // Only include document files
      if (href.match(/\.(htm|html|xml|txt)$/i)) {
        links.push(href);
      }
    });
    
    // Sort links by priority extensions
    return links.sort((a, b) => {
      const aExt = path.extname(a).toLowerCase();
      const bExt = path.extname(b).toLowerCase();
      
      const aIndex = PRIORITY_EXTENSIONS.indexOf(aExt);
      const bIndex = PRIORITY_EXTENSIONS.indexOf(bExt);
      
      if (aIndex !== -1 && bIndex !== -1) {
        return aIndex - bIndex; // Sort by priority if both have priority extensions
      } else if (aIndex !== -1) {
        return -1; // a has priority extension, b doesn't
      } else if (bIndex !== -1) {
        return 1; // b has priority extension, a doesn't
      }
      
      return a.localeCompare(b); // Alphabetical sort for non-priority extensions
    });
  } catch (error) {
    componentLogger.error(`Error extracting document links: ${error instanceof Error ? error.message : String(error)}`);
    
    // Fallback to regex-based extraction
    const matches = [...content.matchAll(PATTERNS.DOCUMENT_LINK)];
    return matches.map(match => match[1]).filter(link => !PATTERNS.IMAGE_FILE.test(link));
  }
}

/**
 * Resolve relative URL to absolute URL
 * @param relativeUrl - Relative URL
 * @param baseUrl - Base URL
 * @returns Absolute URL
 */
export function resolveUrl(relativeUrl: string, baseUrl: string = SEC_BASE_URL): string {
  try {
    // Check if already absolute URL
    if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
      return relativeUrl;
    }
    
    // Handle relative URLs
    if (relativeUrl.startsWith('/')) {
      // Absolute path
      const url = new URL(baseUrl);
      return `${url.protocol}//${url.host}${relativeUrl}`;
    } else {
      // Relative path - combine with base URL
      if (!baseUrl.endsWith('/')) {
        baseUrl = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1);
      }
      return baseUrl + relativeUrl;
    }
  } catch (error) {
    componentLogger.error(`Error resolving URL: ${error instanceof Error ? error.message : String(error)}`);
    
    // Basic fallback
    if (relativeUrl.startsWith('/')) {
      return `${baseUrl.replace(/\/$/, '')}${relativeUrl}`;
    } else {
      return `${baseUrl.replace(/\/[^/]*$/, '/')}${relativeUrl}`;
    }
  }
}
