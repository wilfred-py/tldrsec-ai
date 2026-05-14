/**
 * Enhanced Document Scraper - Tranche 1 Migration
 * 
 * Migrates document scraping to use enhanced fetch patterns from test-summarize
 * This replaces the existing documentScraper.ts with improved functionality
 */

import { enhancedFetch } from '../../../lib/network/enhanced-fetch';
import { parseFormContentEnhanced } from '../../../lib/parsers/form-parser';
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
    'User-Agent': 'tldrsec.app contact@tldrsec.app',
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
    // Primary indicators of SEC directory listing
    const hasDirectoryTitle = content.includes('Directory Listing') || content.includes('Directory List');
    const hasParentDirectory = content.includes('Parent Directory');
    const hasFileTable = content.includes('<table') && content.includes('Last Modified');
    
    if (hasDirectoryTitle || (hasParentDirectory && hasFileTable)) {
      return true;
    }
    
    // Check for SEC EDGAR specific patterns
    const hasEdgarDirectoryPattern = content.includes('EDGAR') && 
                                   (content.includes('.htm') || content.includes('.txt')) &&
                                   content.includes('Archives/edgar/data');
    
    if (hasEdgarDirectoryPattern) {
      return true;
    }
    
    // Fallback to cheerio parsing for table structure
    const $ = cheerio.load(content);
    const hasDirectoryTable = $('table').find('th, td').text().match(/Name.*Last modified.*Size/i) !== null;
    
    // More sophisticated link analysis for SEC filings
    const links = $('a');
    let filingLinkCount = 0;
    let totalRelevantLinks = 0;
    
    links.each((_, link) => {
      const href = $(link).attr('href');
      if (href && !href.startsWith('mailto:') && !href.startsWith('javascript:')) {
        totalRelevantLinks++;
        
        // Count links that look like SEC filing documents
        if (href.match(/\.(html?|xml|txt|xsd|xbrl)$/i) && 
            !href.includes('sec.gov/index') &&
            !href.includes('sec.gov/search')) {
          filingLinkCount++;
        }
      }
    });
    
    // Consider it a directory if we have table structure OR significant filing links
    const hasSignificantFilingLinks = totalRelevantLinks > 3 && 
                                     filingLinkCount > totalRelevantLinks * 0.4;
    
    return hasDirectoryTable || hasSignificantFilingLinks;
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
      
      // Skip navigation links that go outside the current directory
      if (href.startsWith('http') && !href.includes(baseUrl.split('/').slice(-2, -1)[0])) {
        continue;
      }
      
      // Skip common navigation links
      if (href.includes('sec.gov/index') || 
          href.includes('sec.gov/search') || 
          href.includes('sec.gov/news') ||
          href === '/' || 
          href === '../') {
        continue;
      }
      
      // Only include filing-related document types
      if (href.endsWith('.txt') || href.endsWith('.xml') || 
          href.endsWith('.html') || href.endsWith('.htm') ||
          href.endsWith('.xsd') || href.endsWith('.xbrl')) {
        
        const absoluteUrl = new URL(href, baseUrl).href;
        
        // High priority: Main filing document (usually contains accession number)
        if (accessionNumber && href.includes(accessionNumber.replace(/-/g, ''))) {
          priorityLinks.push(absoluteUrl);
        }
        // Medium priority: HTML/HTM files with dashes (likely main documents)  
        else if (href.endsWith('.htm') && href.includes('-')) {
          priorityLinks.push(absoluteUrl);
        }
        // Medium priority: Files that match common SEC filing patterns
        else if (href.match(/^[a-z]+\d+\.htm?$/i) || // e.g., "d123456.htm"
                 href.match(/^\d{8}\.htm?$/)) {     // e.g., "20250101.htm"
          priorityLinks.push(absoluteUrl);
        }
        // Lower priority: Other document files
        else {
          links.push(absoluteUrl);
        }
      }
    }
    
    // Log the filtering results for debugging
    scraperLogger.debug('Document link extraction results', {
      baseUrl,
      accessionNumber,
      totalAnchors: anchors.length,
      priorityLinks: priorityLinks.length,
      regularLinks: links.length,
      prioritySample: priorityLinks.slice(0, 3),
      regularSample: links.slice(0, 3)
    });
    
    return [...priorityLinks, ...links];
  } catch (error) {
    scraperLogger.error('Error extracting links from directory listing', { error });
    return [];
  }
}

/**
 * Smart URL transformation for common SEC filing patterns
 */
function smartTransformFilingUrl(filingUrl: string): string[] {
  const urls = [filingUrl]; // Always try the original URL first
  
  try {
    // Pattern 1: If URL ends with a directory path without -index.html, try adding it
    if (!filingUrl.includes('-index.html') && filingUrl.match(/\d{10}-\d{2}-\d{6}\/?$/)) {
      const indexUrl = filingUrl.replace(/\/?$/, '') + '/' + 
                       filingUrl.match(/(\d{10}-\d{2}-\d{6})/)?.[1] + '-index.html';
      urls.push(indexUrl);
    }
    
    // Pattern 2: Transform directory URL to specific document patterns
    const accessionMatch = filingUrl.match(/(\d{10}-\d{2}-\d{6})/);
    if (accessionMatch) {
      const accession = accessionMatch[1];
      const baseDir = filingUrl.replace(/\/?$/, '');
      
      // Try common document naming patterns
      urls.push(`${baseDir}/${accession.replace(/-/g, '')}.htm`);
      urls.push(`${baseDir}/d${accession.replace(/-/g, '')}.htm`);
      urls.push(`${baseDir}/${accession}-index.htm`);
    }
    
    return urls;
  } catch (error) {
    scraperLogger.warn('Error in smart URL transformation', { error, filingUrl });
    return urls;
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
  
  // Get smart URL variants to try
  const urlsToTry = smartTransformFilingUrl(filingUrl);
  let lastError: Error | null = null;
  
  // Try each URL variant
  for (let urlIndex = 0; urlIndex < urlsToTry.length; urlIndex++) {
    const currentUrl = urlsToTry[urlIndex];
    
    try {
      scraperLogger.debug(`Trying URL variant ${urlIndex + 1}/${urlsToTry.length}: ${currentUrl}`);
      
      // Step 1: Initial fetch with enhanced headers
      let content = await enhancedFetch(currentUrl, {
        responseType: 'text',
        headers: getEnhancedSecApiHeaders(),
        operationName: 'enhanced-sec-filing-fetch'
      });
      
      safeMonitoring.recordDuration('enhanced_sec_filing_fetch_ms', Date.now() - startTime, { 
        source: 'enhanced-scraper',
        initial_fetch: 'true',
        url_variant: (urlIndex + 1).toString()
      });
      
      let actualUrl = currentUrl;
      let isDirectory = false;
      
      // Step 2: Check if this is a directory listing
      if (isDirectoryListing(content)) {
        scraperLogger.info(`URL ${currentUrl} is a directory listing, extracting document links`);
        isDirectory = true;
        
        const documentLinks = extractDocumentLinksFromDirectoryListing(content, currentUrl);
        scraperLogger.info(`Found ${documentLinks.length} document links`, { 
          links: documentLinks.slice(0, 3) 
        });
        
        if (documentLinks.length > 0) {
          // Try the priority links first, then fallback to others
          let documentFetched = false;
          let docLastError: Error | null = null;
          
          for (let i = 0; i < Math.min(documentLinks.length, 3); i++) {
            try {
              actualUrl = documentLinks[i];
              scraperLogger.info(`Attempting to fetch document ${i + 1}/${documentLinks.length}: ${actualUrl}`);
              
              // Fetch the actual document
              const docFetchStart = Date.now();
              content = await enhancedFetch(actualUrl, {
                responseType: 'text',
                headers: getEnhancedSecApiHeaders(),
                operationName: 'enhanced-sec-filing-fetch'
              });
              
              safeMonitoring.recordDuration('enhanced_sec_filing_fetch_ms', Date.now() - docFetchStart, { 
                source: 'enhanced-scraper',
                is_directory: 'true',
                attempt: (i + 1).toString()
              });
              
              // Validate that we got actual filing content (not another directory or error page)
              if (content.length > 1000 && !isDirectoryListing(content)) {
                scraperLogger.info(`Successfully fetched document, content length: ${content.length}`);
                documentFetched = true;
                break;
              } else {
                scraperLogger.warn(`Document ${actualUrl} appears to be invalid (length: ${content.length}, isDirectory: ${isDirectoryListing(content)})`);
              }
            } catch (error) {
              docLastError = error instanceof Error ? error : new Error(String(error));
              scraperLogger.warn(`Failed to fetch document ${actualUrl}: ${docLastError.message}`);
              continue;
            }
          }
          
          if (!documentFetched) {
            throw new Error(
              `Failed to fetch any valid document from ${documentLinks.length} candidates. ` +
              `Last error: ${docLastError?.message || 'Unknown error'}`
            );
          }
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
        content_length: content.length.toString(),
        url_variants_tried: (urlIndex + 1).toString()
      });
      
      // Success! Return the result
      return {
        content,
        actualUrl,
        metadata: {
          ...parsedMetadata,
          wasDirectoryListing: isDirectory,
          originalUrl: filingUrl,
          fetchedAt: new Date().toISOString(),
          contentLength: content.length,
          urlVariantUsed: urlIndex + 1,
          totalUrlVariants: urlsToTry.length
        }
      };
      
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      scraperLogger.warn(`Failed with URL variant ${urlIndex + 1}: ${lastError.message}`);
      
      // If this was the last URL variant, we'll throw the error below
      if (urlIndex === urlsToTry.length - 1) {
        break;
      }
      
      // Otherwise, continue to the next URL variant
      continue;
    }
  }
  
  // If we get here, all URL variants failed
  safeMonitoring.recordDuration('enhanced_document_scrape_error_ms', Date.now() - startTime, {
    source: 'enhanced-scraper',
    error: 'true',
    url_variants_tried: urlsToTry.length.toString()
  });
  
  scraperLogger.error(`Failed to fetch enhanced document content from any URL variant. Last error: ${lastError?.message || 'Unknown error'}`);
  throw lastError || new Error('Failed to fetch document from any URL variant');
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