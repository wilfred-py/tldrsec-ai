import { JSDOM } from 'jsdom';
import * as cheerio from 'cheerio';
import { enhancedFetch } from '../../../lib/network/enhanced-fetch';
import { logger } from '../../../lib/logging';

// Create a module-specific logger
const docLogger = logger.child('enhanced-document-processor');

/**
 * Document priority levels for SEC filing analysis
 */
export interface DocumentPriority {
  critical: string[];    // Main SEC filing documents (95% relevance)
  high: string[];        // Navigation and index documents (85-90% relevance)
  medium: string[];      // Report sections and material announcements (50-60% relevance)
  low: string[];         // XML and supplementary files (30-35% relevance)
  exhibits: string[];    // Exhibit files and schemas (0-25% relevance)
}

/**
 * Document processing options
 */
export interface DocumentProcessingOptions {
  maxRetries?: number;
  timeout?: number;
  prioritizeHtml?: boolean;
  userAgent?: string;
}

/**
 * Document processing result
 */
export interface DocumentProcessingResult {
  content: string;
  actualUrl: string;
  isDirectoryListing: boolean;
  documentLinks?: string[];
  selectedDocument?: string;
  processingTimeMs: number;
}

/**
 * Check if content is a directory listing
 * @param content HTML content to check
 * @returns True if content appears to be a directory listing
 */
export function isDirectoryListing(content: string): boolean {
  try {
    // Check for directory listing indicators in the content
    const hasDirectoryTitle = content.includes('Directory Listing') || content.includes('Directory List');
    const hasParentDirectory = content.includes('Parent Directory');
    const hasFileTable = content.includes('<table') && content.includes('Last Modified');
    
    // If it has clear directory listing indicators, return true
    if (hasDirectoryTitle || (hasParentDirectory && hasFileTable)) {
      return true;
    }
    
    // Fallback to cheerio parsing for more complex detection
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
 * Intelligent document prioritization based on SEC filing analysis
 * Prioritizes HTML files for AI cost-efficiency and material shareholder content
 * @param links Array of document links to prioritize
 * @param accessionNumber Accession number for pattern matching
 * @param baseUrl Base URL for context
 * @returns Prioritized array of document links
 */
export function prioritizeDocuments(links: string[], accessionNumber: string | null, baseUrl: string): string[] {
  const priorityLevels: DocumentPriority = {
    critical: [],    // Main SEC filing documents (95% relevance)
    high: [],        // Navigation and index documents (85-90% relevance)
    medium: [],      // Report sections and material announcements (50-60% relevance)
    low: [],         // XML and supplementary files (30-35% relevance)
    exhibits: []     // Exhibit files and schemas (0-25% relevance)
  };
  
  const accessionClean = accessionNumber ? accessionNumber.replace(/-/g, '') : '';
  
  // Track categorization for debugging
  const categorization: { [key: string]: string } = {};
  
  links.forEach(link => {
    const filename = link.split('/').pop()?.toLowerCase() || '';
    const href = filename;
    
    // CRITICAL: Main SEC filing documents (95% shareholder relevance)
    if (
      // Primary pattern: d{accession}.htm - most reliable main document
      (accessionClean && href === `d${accessionClean}.htm`) ||
      // Alternative main document patterns
      (accessionClean && href.includes(accessionClean) && href.match(/^d\d+\.html?$/i)) ||
      // Generic SEC form patterns: d123456d[formtype].htm
      href.match(/^d\d+d(8k|10k|10q|144|3|4|5)\.html?$/i)
    ) {
      priorityLevels.critical.push(link);
      categorization[filename] = 'critical-main-filing';
    }
    // HIGH: Index and navigation documents (85-90% relevance)
    else if (
      // Index documents
      href.includes('index.html') ||
      href.includes('index.htm') ||
      // Complete submission text files
      (accessionClean && href === `${accessionClean}.txt`) ||
      // Alternative main document patterns
      (accessionClean && href.includes(accessionClean) && href.match(/\.(html?|txt)$/i))
    ) {
      priorityLevels.high.push(link);
      categorization[filename] = 'high-navigation';
    }
    // MEDIUM: Material content documents (50-60% relevance)
    else if (
      // Report sections
      href.match(/^r\d+\.html?$/i) ||
      // Material announcements
      href.match(/^ex-99\.\d+\.html?$/i) ||
      // Material contracts
      href.match(/^ex-10\.\d+\.html?$/i) ||
      // Other meaningful HTML/TXT files
      (href.match(/\.(html?|txt)$/i) && 
       !href.includes('exhibit') && 
       !href.includes('ex-') &&
       !href.includes('ex_') &&
       href.includes('-'))
    ) {
      priorityLevels.medium.push(link);
      categorization[filename] = 'medium-material';
    }
    // LOW: XML and supplementary files (30-35% relevance)
    else if (
      // Primary XML documents (structured but less AI-friendly)
      href === 'primary_doc.xml' ||
      href === 'filing.xml' ||
      href === 'filingsummary.xml' ||
      // Other XML files
      (href.endsWith('.xml') && 
       !href.includes('exhibit') && 
       !href.includes('ex-') &&
       !href.includes('.xsd'))
    ) {
      priorityLevels.low.push(link);
      categorization[filename] = 'low-xml';
    }
    // EXHIBITS: Low value files (0-25% relevance)
    else if (
      // Schema definitions (avoid completely)
      href.endsWith('.xsd') ||
      // Clear exhibit patterns
      href.includes('exhibit') ||
      href.includes('ex-') ||
      href.includes('ex_') ||
      href.match(/^ex-\d+/) ||
      // Technical metadata
      href === 'metalinks.json' ||
      href.includes('schema')
    ) {
      priorityLevels.exhibits.push(link);
      categorization[filename] = 'exhibits-schemas';
    }
    // DEFAULT: Other files
    else {
      priorityLevels.low.push(link);
      categorization[filename] = 'low-other';
    }
  });
  
  const result = [
    ...priorityLevels.critical,
    ...priorityLevels.high,
    ...priorityLevels.medium,
    ...priorityLevels.low,
    ...priorityLevels.exhibits
  ];
  
  docLogger.info(`Document prioritization results (HTML-first approach)`, {
    baseUrl,
    accessionNumber,
    totals: {
      critical: priorityLevels.critical.length,
      high: priorityLevels.high.length,
      medium: priorityLevels.medium.length,
      low: priorityLevels.low.length,
      exhibits: priorityLevels.exhibits.length
    },
    topResults: {
      critical: priorityLevels.critical.slice(0, 3).map(url => url.split('/').pop()),
      high: priorityLevels.high.slice(0, 3).map(url => url.split('/').pop()),
      medium: priorityLevels.medium.slice(0, 3).map(url => url.split('/').pop())
    },
    materiality_focus: 'HTML documents prioritized for AI processing efficiency',
    categorization: Object.fromEntries(
      Object.entries(categorization).slice(0, 10) // Limit for readability
    )
  });
  
  return result;
}

/**
 * Extract document links from a directory listing HTML with intelligent prioritization
 * Enhanced version based on SEC filing pattern analysis
 * @param html HTML content of the directory listing
 * @param baseUrl Base URL for resolving relative links
 * @returns Array of document links, sorted by priority (main filing first)
 */
export function extractDocumentLinksFromDirectoryListing(html: string, baseUrl: string): string[] {
  try {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const allLinks: string[] = [];
    
    // Extract accession number from base URL for filtering
    const accessionMatch = baseUrl.match(/(\d{10}-\d{2}-\d{6})/);
    const accessionNumber = accessionMatch ? accessionMatch[1] : null;
    
    const anchors = document.querySelectorAll('a');
    
    for (let i = 0; i < anchors.length; i++) {
      const anchor = anchors[i];
      const href = anchor.getAttribute('href');
      
      if (!href || href.includes('?') || href.includes('..')) {
        continue;
      }
      
      // Skip absolute URLs that go outside SEC or the current accession directory
      if (href.startsWith('http')) {
        // Allow SEC URLs but only within the same accession directory or known filing patterns
        if (href.includes('sec.gov')) {
          // Skip general SEC navigation pages
          if (href.includes('sec.gov/index') || 
              href.includes('sec.gov/search') || 
              href.includes('sec.gov/news') ||
              href.includes('sec.gov/about') ||
              href.includes('sec.gov/newsroom')) {
            continue;
          }
          // Only allow if it's in the same data directory or a direct filing URL
          const currentDataPath = baseUrl.match(/\/data\/\d+\/\d+/)?.[0];
          if (currentDataPath && !href.includes(currentDataPath)) {
            continue;
          }
        } else {
          // Skip all non-SEC external links
          continue;
        }
      }
      
      // Skip directory navigation
      if (href === '/' || href === '../' || href.startsWith('/index') || href.startsWith('/search')) {
        continue;
      }
      
      // Only include filing-related document types (prioritize HTML for AI efficiency)
      if (href.endsWith('.htm') || href.endsWith('.html') || 
          href.endsWith('.txt') || href.endsWith('.xml') ||
          href.endsWith('.xsd') || href.endsWith('.xbrl')) {
        
        const absoluteUrl = new URL(href, baseUrl).href;
        allLinks.push(absoluteUrl);
      }
    }
    
    // Use intelligent prioritization
    const prioritizedLinks = prioritizeDocuments(allLinks, accessionNumber, baseUrl);
    
    // Additional smart URL transformation for missing patterns
    const transformedUrls: string[] = [...prioritizedLinks];
    
    // If we don't have any critical documents, try to construct them
    if (prioritizedLinks.length === 0 || 
        (prioritizedLinks[0] && !prioritizedLinks.some(url => url.includes(accessionNumber?.replace(/-/g, '') || '')))) {
      if (accessionNumber) {
        const basePath = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
        const accessionClean = accessionNumber.replace(/-/g, '');
        
        // Try common SEC filing patterns (prioritize HTML for AI efficiency)
        const possibleUrls = [
          `${basePath}d${accessionClean}.htm`, // Primary pattern: most reliable main document
          `${basePath}${accessionClean}-index.html`, // Index document pattern
          `${basePath}${accessionClean}.txt`, // Complete submission text
          `${basePath}${accessionClean}.htm`, // Generic HTML pattern
          `${basePath}primary_doc.xml`, // XML fallback (less AI-friendly)
        ];
        
        transformedUrls.unshift(...possibleUrls);
      }
    }
    
    docLogger.debug(`Extracted ${transformedUrls.length} document links from directory listing`, {
      baseUrl,
      accessionNumber,
      totalExtracted: allLinks.length,
      afterPrioritization: prioritizedLinks.length,
      withTransformations: transformedUrls.length,
      firstFew: transformedUrls.slice(0, 3)
    });
    
    return transformedUrls;
  } catch (error) {
    docLogger.error('Error extracting links from directory listing', { error });
    return [];
  }
}

/**
 * Process a filing URL to get the actual document content
 * Handles directory listings and document prioritization
 */
export async function processFilingDocument(
  filingUrl: string,
  options: DocumentProcessingOptions = {}
): Promise<DocumentProcessingResult> {
  const startTime = Date.now();
  const {
    maxRetries = 3,
    timeout = 30000,
    prioritizeHtml = true,
    userAgent = 'tldrSEC-AI Bot (contact@tldrsec.com)'
  } = options;

  try {
    docLogger.debug(`Processing filing document from ${filingUrl}`);
    
    // Step 1: Fetch initial content
    let content = await enhancedFetch(filingUrl, {
      responseType: 'text',
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      operationName: 'enhanced-filing-fetch',
      timeout
    });

    let actualUrl = filingUrl;
    let documentLinks: string[] = [];
    let selectedDocument: string | undefined;

    // Step 2: Check if this is a directory listing
    const isDirectory = isDirectoryListing(content);
    docLogger.debug(`Content type detection: ${isDirectory ? 'directory listing' : 'document content'}`);

    if (isDirectory) {
      docLogger.info(`Processing directory listing at ${filingUrl}`);
      
      // Extract and prioritize document links
      documentLinks = extractDocumentLinksFromDirectoryListing(content, filingUrl);
      docLogger.info(`Found ${documentLinks.length} prioritized document links`);

      if (documentLinks.length > 0) {
        // Select the best document based on prioritization
        selectedDocument = selectBestDocument(documentLinks, prioritizeHtml);
        
        if (selectedDocument) {
          actualUrl = selectedDocument;
          docLogger.info(`Selected document: ${actualUrl}`, {
            filename: selectedDocument.split('/').pop(),
            index: documentLinks.indexOf(selectedDocument)
          });

          // Fetch the actual document content
          content = await enhancedFetch(actualUrl, {
            responseType: 'text',
            headers: {
              'User-Agent': userAgent,
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
              'Accept-Encoding': 'gzip, deflate, br',
              'Accept-Language': 'en-US,en;q=0.9'
            },
            operationName: 'enhanced-filing-fetch',
            timeout
          });
          
          docLogger.info(`Fetched selected document, content length: ${content.length}`);
        } else {
          docLogger.warn('No suitable document found in directory listing');
          // Try to construct a fallback URL
          const fallbackUrl = constructFallbackUrl(filingUrl);
          if (fallbackUrl) {
            try {
              actualUrl = fallbackUrl;
              content = await enhancedFetch(actualUrl, {
                responseType: 'text',
                headers: { 'User-Agent': userAgent },
                operationName: 'enhanced-filing-fetch',
                timeout
              });
              docLogger.info(`Successfully used fallback URL: ${actualUrl}`);
            } catch (fallbackError) {
              docLogger.warn(`Fallback URL failed: ${fallbackError}`);
            }
          }
        }
      }
    }

    return {
      content,
      actualUrl,
      isDirectoryListing: isDirectory,
      documentLinks: documentLinks.length > 0 ? documentLinks : undefined,
      selectedDocument,
      processingTimeMs: Date.now() - startTime
    };

  } catch (error) {
    docLogger.error(`Error processing filing document: ${error}`, { filingUrl });
    throw new Error(`Failed to process filing document: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Select the best document from a prioritized list
 */
function selectBestDocument(documentLinks: string[], prioritizeHtml: boolean): string | null {
  if (documentLinks.length === 0) return null;

  for (const link of documentLinks) {
    const filename = link.split('/').pop()?.toLowerCase() || '';
    
    // Exclude navigation and non-filing URLs
    if (link.includes('sec.gov/index.htm') || 
        link.includes('sec.gov/search') || 
        link.includes('sec.gov/news') ||
        link.includes('sec.gov/about') ||
        link.includes('sec.gov/newsroom') ||
        link.endsWith('/') ||
        filename.includes('index') ||
        filename.includes('upcoming-events')) {
      continue;
    }
    
    // Must be a filing document type
    if (filename.match(/\.(html?|txt|xml|xbrl)$/i)) {
      // Prefer HTML files if prioritizeHtml is true
      if (prioritizeHtml && (filename.endsWith('.htm') || filename.endsWith('.html'))) {
        return link;
      }
      // Otherwise return the first valid document (already prioritized)
      return link;
    }
  }

  return null;
}

/**
 * Construct a fallback URL for missing documents
 */
function constructFallbackUrl(baseUrl: string): string | null {
  const accessionMatch = baseUrl.match(/(\d{10}-\d{2}-\d{6})/);
  if (accessionMatch) {
    const accessionNumber = accessionMatch[1];
    const basePath = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';
    const fallbackUrl = `${basePath}d${accessionNumber.replace(/-/g, '')}.htm`;
    return fallbackUrl;
  }
  return null;
}