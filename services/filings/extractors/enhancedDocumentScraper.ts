/**
 * Enhanced Document Scraper - Tranche 1 Migration
 * 
 * Migrates document scraping to use enhanced fetch patterns from test-summarize
 * This replaces the existing documentScraper.ts with improved functionality
 */

import { enhancedFetch } from '../../../lib/network/enhanced-fetch';
import { parseFormContentEnhanced } from '../../../lib/parsers/enhanced-form-parser';
import { JSDOM } from 'jsdom';
import * as cheerio from 'cheerio';
import { logger } from '../../../lib/logging';
import { monitoring } from '../../../lib/monitoring';

const scraperLogger = logger.child('enhanced-document-scraper');

// Safe wrapper for monitoring functions
const safeMonitoring = {
  recordDuration: function(metric: string, value: number, tags: Record<string, string | boolean> = {}) {
    try {
      if (typeof monitoring.recordTiming === 'function') {
        monitoring.recordTiming(metric, value, tags);
      }
    } catch (error) {
      console.warn('Failed to record timing', { error });
    }
  }
};

/**
 * Standard SEC API headers for compliance
 */
export function getEnhancedSecApiHeaders(): Record<string, string> {
  return {
    'User-Agent': 'tldrSEC-AI Bot (contact@tldrsec.com)',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'en-US,en;q=0.9'
  };
}

/**
 * Check if content is a directory listing
 */
function isDirectoryListing(content: string): boolean {
  try {
    // Check for directory listing indicators
    const hasDirectoryTitle = content.includes('Directory Listing') || content.includes('Directory List');
    const hasParentDirectory = content.includes('Parent Directory');
    const hasFileTable = content.includes('<table') && content.includes('Last Modified');
    
    if (hasDirectoryTitle || (hasParentDirectory && hasFileTable)) {
      return true;
    }
    
    // Fallback to cheerio parsing
    const $ = cheerio.load(content);
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
    scraperLogger.warn('Error checking directory listing', { error });
    return false;
  }
}

/**
 * Extract document links from directory listing, prioritizing main filing documents
 */
function extractDocumentLinksFromDirectoryListing(html: string, baseUrl: string): string[] {
  try {
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const links: string[] = [];
    const priorityLinks: string[] = [];
    
    const anchors = document.querySelectorAll('a');
    
    for (let i = 0; i < anchors.length; i++) {
      const anchor = anchors[i];
      const href = anchor.getAttribute('href');
      
      if (href && !href.includes('?') && !href.includes('..')) {
        if (href.endsWith('.txt') || href.endsWith('.xml') || 
            href.endsWith('.html') || href.endsWith('.htm')) {
          
          const absoluteUrl = new URL(href, baseUrl).href;
          
          // Prioritize main filing documents
          if (href.endsWith('.htm') && 
              (href.includes('-') || href.match(/\d{8}\.htm$/))) {
            priorityLinks.push(absoluteUrl);
          } else {
            links.push(absoluteUrl);
          }
        }
      }
    }
    
    return [...priorityLinks, ...links];
  } catch (error) {
    scraperLogger.error('Error extracting links from directory listing', { error });
    return [];
  }
}

/**
 * Enhanced document content fetcher with directory listing support
 */
export async function fetchEnhancedDocumentContent(filingUrl: string): Promise<{
  content: string;
  actualUrl: string;
  metadata: Record<string, any>;
}> {
  const startTime = Date.now();
  scraperLogger.debug(`Fetching enhanced document content from ${filingUrl}`);
  
  try {
    // Step 1: Initial fetch with enhanced headers
    let content = await enhancedFetch(filingUrl, {
      responseType: 'text',
      headers: getEnhancedSecApiHeaders(),
      operationName: 'enhanced-sec-filing-fetch'
    });
    
    safeMonitoring.recordDuration('enhanced_sec_filing_fetch_ms', Date.now() - startTime, { 
      source: 'enhanced-scraper',
      initial_fetch: 'true' 
    });
    
    let actualUrl = filingUrl;
    let isDirectory = false;
    
    // Step 2: Check if this is a directory listing
    if (isDirectoryListing(content)) {
      scraperLogger.info(`URL ${filingUrl} is a directory listing, extracting document links`);
      isDirectory = true;
      
      const documentLinks = extractDocumentLinksFromDirectoryListing(content, filingUrl);
      scraperLogger.info(`Found ${documentLinks.length} document links`, { 
        links: documentLinks.slice(0, 3) 
      });
      
      if (documentLinks.length > 0) {
        actualUrl = documentLinks[0];
        scraperLogger.info(`Using first document from listing: ${actualUrl}`);
        
        // Fetch the actual document
        const docFetchStart = Date.now();
        content = await enhancedFetch(actualUrl, {
          responseType: 'text',
          headers: getEnhancedSecApiHeaders(),
          operationName: 'enhanced-sec-filing-fetch'
        });
        
        safeMonitoring.recordDuration('enhanced_sec_filing_fetch_ms', Date.now() - docFetchStart, { 
          source: 'enhanced-scraper',
          is_directory: 'true' 
        });
        
        scraperLogger.info(`Fetched actual document, content length: ${content.length}`);
      } else {
        throw new Error('No document links found in directory listing');
      }
    }
    
    // Step 3: Parse the content for metadata
    let parsedMetadata: Record<string, any> = {};
    try {
      const parsed = parseFormContentEnhanced(content);
      parsedMetadata = parsed.metadata || {};
      scraperLogger.debug('Successfully parsed content metadata', { 
        sections: Object.keys(parsed.sections).length,
        metadata: Object.keys(parsedMetadata)
      });
    } catch (parseError) {
      scraperLogger.warn('Failed to parse content for metadata', { parseError });
    }
    
    safeMonitoring.recordDuration('enhanced_document_scrape_total_ms', Date.now() - startTime, {
      source: 'enhanced-scraper',
      was_directory: isDirectory.toString(),
      content_length: content.length.toString()
    });
    
    return {
      content,
      actualUrl,
      metadata: {
        ...parsedMetadata,
        wasDirectoryListing: isDirectory,
        originalUrl: filingUrl,
        fetchedAt: new Date().toISOString(),
        contentLength: content.length
      }
    };
    
  } catch (error) {
    safeMonitoring.recordDuration('enhanced_document_scrape_error_ms', Date.now() - startTime, {
      source: 'enhanced-scraper',
      error: 'true'
    });
    
    scraperLogger.error(`Failed to fetch enhanced document content: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

/**
 * Enhanced document links scraper with improved reliability
 */
export async function scrapeEnhancedDocumentLinks(
  filing: { accessionNumber: string; cik?: string; filingUrl?: string },
  headers?: Record<string, string>
): Promise<string | null> {
  try {
    const filingUrl = filing.filingUrl || 
      `https://www.sec.gov/Archives/edgar/data/${filing.cik}/${filing.accessionNumber.replace(/-/g, '')}/` +
      `${filing.accessionNumber}-index.html`;
    
    scraperLogger.debug(`Scraping enhanced document links from ${filingUrl}`);
    
    const result = await fetchEnhancedDocumentContent(filingUrl);
    return result.actualUrl;
    
  } catch (error) {
    scraperLogger.error(`Error scraping enhanced document links: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Backward compatibility wrapper for existing code
 */
export async function scrapeDocumentLinksFromFilingPage(
  filing: { accessionNumber: string; cik?: string; filingUrl?: string },
  headers?: Record<string, string>
): Promise<string | null> {
  return scrapeEnhancedDocumentLinks(filing, headers);
}

/**
 * Enhanced document content fetcher with backward compatibility
 */
export async function fetchDocumentContent(documentUrl: string): Promise<string | null> {
  try {
    const result = await fetchEnhancedDocumentContent(documentUrl);
    return result.content;
  } catch (error) {
    scraperLogger.error(`Error fetching document content: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}