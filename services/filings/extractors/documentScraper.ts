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
    
    // If we have a primaryDocUrl, use it directly
    if (filing.primaryDocUrl) {
      logger.debug(`Using primary document URL directly: ${filing.primaryDocUrl}`);
      return ensureAbsoluteUrl(filing.primaryDocUrl);
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
    
    // Log the HTML structure for debugging
    logger.debug(`HTML structure: ${html.length} characters, ${document.querySelectorAll('table').length} tables`);
    
    // Try multiple strategies to find document links
    
    // Strategy 1: Find the document table
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
        logger.debug(`Found document table at index ${i} with header: ${headerRow.textContent.trim()}`);
        break;
      }
    }
    
    // If we found a document table, extract links from it
    if (documentTable) {
      // Find document links
      const rows = documentTable.querySelectorAll('tr');
      let documentLink = null;
      
      // Priority document types to look for
      const priorityTypes = ['10-K', '10-Q', '8-K', 'EX-13', 'EX-99', 'DEF 14A', '424B2', '144'];
      
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
      
      if (documentLink) {
        // Convert to absolute URL if needed
        return ensureAbsoluteUrl(documentLink);
      }
    } else {
      logger.debug('Could not find standard document table, trying alternative methods');
    }
    
    // Strategy 2: Look for any links that might be document links
    const allLinks = document.querySelectorAll('a');
    const potentialDocLinks = [];
    
    for (let i = 0; i < allLinks.length; i++) {
      const link = allLinks[i];
      const href = link.getAttribute('href');
      const text = link.textContent?.trim();
      
      if (href && text) {
        // Check for links that look like document links
        if (href.includes('.htm') || 
            href.includes('.xml') || 
            href.includes('.txt') || 
            href.includes('.pdf') || 
            text.includes('View') || 
            text.includes('Document')) {
          potentialDocLinks.push({ href, text });
          logger.debug(`Found potential document link: ${text} -> ${href}`);
        }
      }
    }
    
    // If we found potential document links, use the first one
    if (potentialDocLinks.length > 0) {
      const firstLink = potentialDocLinks[0].href;
      logger.debug(`Using first potential document link: ${firstLink}`);
      return ensureAbsoluteUrl(firstLink);
    }
    
    // Strategy 3: If all else fails, try to construct a document URL from the filing information
    if (filing.accessionNumber) {
      // Extract CIK from the filing URL if available
      let cik = '';
      if (filing.filingUrl) {
        // Try to extract CIK from the filing URL which typically has format:
        // https://www.sec.gov/Archives/edgar/data/0001318605/000162828025034692
        const cikMatch = filing.filingUrl.match(/\/data\/([0-9]+)\//);
        if (cikMatch && cikMatch[1]) {
          cik = cikMatch[1];
          logger.debug(`Extracted CIK from filing URL: ${cik}`);
        }
      }
      
      if (cik) {
        const formattedAccession = filing.accessionNumber.replace(/-/g, '');
        const constructedUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${formattedAccession}/${filing.accessionNumber}-index.html`;
        logger.debug(`Constructed document URL from filing info: ${constructedUrl}`);
        return constructedUrl;
      } else {
        logger.debug('Could not extract CIK from filing URL to construct document URL');
      }
    }
    
    logger.warn('No document links found in filing page using any strategy');
    return null;
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
  
  // Ensure we have an absolute URL
  const absoluteUrl = ensureAbsoluteUrl(url);
  
  try {
    logger.debug(`Fetching document content from: ${absoluteUrl}`);
    
    // Determine the appropriate response type based on the URL
    const isXmlFile = absoluteUrl.toLowerCase().includes('.xml');
    const isPdfFile = absoluteUrl.toLowerCase().includes('.pdf');
    const responseType = isPdfFile ? 'arraybuffer' : 'text';
    
    const response = await axios.get(absoluteUrl, { 
      headers: getSecApiHeaders(),
      responseType: responseType
    });
    
    // Handle different response types
    if (responseType === 'arraybuffer') {
      // For PDF files, we can't display the content directly
      // Return a placeholder message with the URL
      logger.debug('Received binary data (likely PDF), returning placeholder');
      return `[PDF Document available at ${absoluteUrl}]`;
    } else if (isXmlFile) {
      // For XML files, pretty-print the content if possible
      logger.debug('Processing XML content');
      try {
        // Just return the raw XML for now
        return typeof response.data === 'string' ? response.data : String(response.data);
      } catch (xmlError) {
        logger.warn(`Error processing XML: ${xmlError instanceof Error ? xmlError.message : String(xmlError)}`);
        return typeof response.data === 'string' ? response.data : String(response.data);
      }
    } else {
      // For HTML and other text formats
      if (typeof response.data === 'string') {
        // Check if this is an HTML document with frames
        if (response.data.includes('<frameset') || response.data.includes('<frame')) {
          logger.debug('Detected framed document, attempting to extract frame sources');
          // Extract frame sources
          const frameMatches = response.data.match(/src="([^"]+)"/g);
          if (frameMatches && frameMatches.length > 0) {
            // Extract the first frame source
            const firstFrameSrc = frameMatches[0].match(/src="([^"]+)"/);
            if (firstFrameSrc && firstFrameSrc[1]) {
              const frameUrl = ensureAbsoluteUrl(firstFrameSrc[1]);
              logger.debug(`Found frame source, fetching content from: ${frameUrl}`);
              // Recursively fetch the frame content
              return await fetchDocumentContent(frameUrl);
            }
          }
        }
        return response.data;
      } else {
        logger.warn(`Unexpected response type from document fetch: ${typeof response.data}`);
        return String(response.data);
      }
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const statusCode = (error as any)?.response?.status || 'unknown';
    const responseText = (error as any)?.response?.data || '';
    
    logger.error(
      `Error fetching document content: ${errorMessage}, Status: ${statusCode}, URL: ${absoluteUrl}`
    );
    
    if (statusCode === 404) {
      logger.debug('Document not found (404), this may be expected for some filings');
    } else if (responseText) {
      logger.debug(`Error response body: ${typeof responseText === 'string' ? responseText.substring(0, 200) : '[non-text response]'}...`);
    }
    
    return null;
  }
}
