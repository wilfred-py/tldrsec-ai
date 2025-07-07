import axios from 'axios';
import { JSDOM } from 'jsdom';
import { logger } from '../../../lib/logging';
import { SecFiling } from '../../../types/sec';
import { getSecApiHeaders } from '../../filings/utils';

/**
 * Base URL for SEC EDGAR
 */
const SEC_EDGAR_BASE_URL = 'https://www.sec.gov';

/**
 * Converts a relative URL to an absolute URL
 * @param url URL to convert
 * @returns Absolute URL
 */
function ensureAbsoluteUrl(url: string): string {
  if (url.startsWith('http')) {
    return url;
  }
  
  // Handle relative URLs by prepending the SEC base URL
  return `${SEC_EDGAR_BASE_URL}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * Scrapes document links from a filing page HTML
 * @param filing SEC filing information
 * @param headers HTTP headers to use for the request
 * @returns URL of the document or null if not found
 */
export async function scrapeDocumentLinksFromFilingPage(
  filing: SecFiling, 
  headers: Record<string, string>
): Promise<string | null> {
  try {
    if (!filing.filingUrl) {
      logger.error('No filing URL provided for document scraping');
      return null;
    }
    
    // Ensure we have an absolute URL
    const absoluteUrl = ensureAbsoluteUrl(filing.filingUrl);
    logger.debug(`Scraping document links from: ${absoluteUrl}`);
    
    // Fetch the filing page HTML
    const response = await axios.get(absoluteUrl, { headers });
    const html = response.data as string;
    
    // Parse the HTML
    const dom = new JSDOM(html);
    const document = dom.window.document;
    
    // Find the document table
    const tables = document.querySelectorAll('table');
    let documentTable = null;
    
    // Look for the table with document links
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i];
      const headerRow = table.querySelector('tr');
      
      if (headerRow && headerRow.textContent && 
          (headerRow.textContent.includes('Document') || 
           headerRow.textContent.includes('Type') || 
           headerRow.textContent.includes('Description'))) {
        documentTable = table;
        break;
      }
    }
    
    if (!documentTable) {
      logger.warn('Could not find document table in filing page');
      return null;
    }
    
    // Find document links
    const rows = documentTable.querySelectorAll('tr');
    let documentLink = null;
    
    // Priority document types to look for
    const priorityTypes = ['10-K', '10-Q', '8-K', 'EX-13', 'EX-99'];
    
    // First pass: look for priority document types
    for (let i = 1; i < rows.length; i++) { // Skip header row
      const row = rows[i];
      const cells = row.querySelectorAll('td');
      
      if (cells.length >= 2) {
        const typeCell = cells[0].textContent?.trim();
        const linkCell = cells[1].querySelector('a');
        
        if (typeCell && linkCell) {
          const href = linkCell.getAttribute('href');
          
          if (href) {
            // Check if this is a priority document type
            if (priorityTypes.some(type => typeCell.includes(type))) {
              documentLink = href;
              logger.debug(`Found priority document link: ${typeCell} -> ${href}`);
              break;
            }
          }
        }
      }
    }
    
    // If no priority document found, take the first document link
    if (!documentLink) {
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const cells = row.querySelectorAll('td');
        
        if (cells.length >= 2) {
          const linkCell = cells[1].querySelector('a');
          
          if (linkCell) {
            const href = linkCell.getAttribute('href');
            
            if (href) {
              documentLink = href;
              logger.debug(`Found document link: ${href}`);
              break;
            }
          }
        }
      }
    }
    
    if (!documentLink) {
      logger.warn('No document links found in filing page');
      return null;
    }
    
    // Convert to absolute URL if needed
    return ensureAbsoluteUrl(documentLink);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const statusCode = (error as any)?.response?.status || 'unknown';
    
    logger.error(
      `Error scraping document links: ${errorMessage}, Status: ${statusCode}, URL: ${filing.filingUrl}`
    );
    return null;
  }
}

/**
 * Fetches the document content from a URL
 * @param url URL of the document to fetch
 * @returns Document content or null if not found
 */
export async function fetchDocumentContent(url: string): Promise<string | null> {
  if (!url) {
    logger.error('No URL provided for document content fetch');
    return null;
  }
  
  try {
    logger.debug(`Fetching document content from: ${url}`);
    const response = await axios.get(url, { 
      headers: getSecApiHeaders(),
      responseType: 'text'
    });
    
    // Ensure we return a string or null, not unknown
    if (typeof response.data === 'string') {
      return response.data;
    } else {
      logger.warn(`Unexpected response type from document fetch: ${typeof response.data}`);
      return String(response.data);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const statusCode = (error as any)?.response?.status || 'unknown';
    
    logger.error(
      `Error fetching document content: ${errorMessage}, Status: ${statusCode}, URL: ${url}`
    );
    return null;
  }
}
