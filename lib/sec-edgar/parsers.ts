import * as cheerio from 'cheerio';
import { 
  FilingMetadata, 
  FilingType, 
  ParsedFiling, 
  SECApiEntry,
  SECApiResponse,
  SECEdgarError,
  SECErrorCode 
} from './types';

/**
 * Parse the SEC EDGAR RSS feed response
 */
export function parseRssFeed(xmlContent: string): SECApiResponse {
  try {
    const $ = cheerio.load(xmlContent, { xmlMode: true });
    const entries: SECApiEntry[] = [];

    // Extract each entry from the feed
    $('entry').each((i, el) => {
      const entry: SECApiEntry = {
        title: $(el).find('title').text().trim(),
        link: $(el).find('link').attr('href') || '',
        summary: $(el).find('summary').text().trim(),
        updated: $(el).find('updated').text().trim(),
        id: $(el).find('id').text().trim(),
        category: $(el).find('category').attr('term')
      };

      entries.push(entry);
    });

    // Extract pagination link if it exists
    const nextPage = $('link[rel="next"]').attr('href');

    return {
      entries,
      nextPage
    };
  } catch (error) {
    throw new SECEdgarError(
      `Failed to parse SEC EDGAR RSS feed: ${(error as Error).message}`,
      SECErrorCode.PARSING_ERROR
    );
  }
}

/**
 * Extract ticker symbol from an SEC EDGAR entry title
 */
export function extractTickerFromTitle(title: string): string | null {
  // Typical format: "Form 10-K for APPLE INC (AAPL)" or "SALESFORCE.COM, INC. (CRM) ownership..."
  const tickerRegex = /\(([A-Z]+)\)/;
  const match = title.match(tickerRegex);
  
  return match ? match[1] : null;
}

/**
 * Determine filing type from an SEC EDGAR entry title
 */
export function determineFilingType(title: string): FilingType | null {
  if (title.includes('10-K')) return '10-K';
  if (title.includes('10-Q')) return '10-Q';
  if (title.includes('8-K')) return '8-K';
  if (title.includes('Form 4')) return 'Form4';
  
  return null;
}

/**
 * Extract company name from an SEC EDGAR entry title
 */
export function extractCompanyName(title: string): string | null {
  // Try different patterns for company name extraction
  
  // Pattern 1: "Form 10-K for APPLE INC (AAPL)"
  let match = title.match(/Form [\w-]+ for ([^(]+)/);
  if (match) return match[1].trim();
  
  // Pattern 2: "SALESFORCE.COM, INC. (CRM) ownership..."
  match = title.match(/^([^(]+)\(/);
  if (match) return match[1].trim();
  
  // Pattern 3: General fallback - take what's between any prefix and the ticker
  match = title.match(/(?:Form [\w-]+ for |^)([^(]+)\(/);
  if (match) return match[1].trim();
  
  return null;
}

/**
 * Extract CIK from filing URL
 */
export function extractCikFromUrl(url: string): string | null {
  const cikRegex = /CIK=(\d+)/i;
  const match = url.match(cikRegex);
  
  return match ? match[1] : null;
}

/**
 * Parse an SEC EDGAR entry into a standardized filing metadata object
 */
export function parseFilingEntry(entry: SECApiEntry): FilingMetadata | null {
  const ticker = extractTickerFromTitle(entry.title);
  const filingType = determineFilingType(entry.title);
  const companyName = extractCompanyName(entry.title);
  const cik = extractCikFromUrl(entry.link);
  
  // If we couldn't extract essential information, return null
  if (!ticker || !filingType || !companyName || !cik) {
    return null;
  }
  
  return {
    ticker,
    companyName,
    cik,
    filingType,
    filingDate: new Date(entry.updated),
    filingUrl: entry.link,
    description: entry.summary
  };
}

/**
 * Process and transform multiple filing entries
 */
export function processFilingEntries(entries: SECApiEntry[]): ParsedFiling[] {
  const filings: ParsedFiling[] = [];
  
  for (const entry of entries) {
    const metadata = parseFilingEntry(entry);
    
    if (metadata) {
      // Generate a unique ID for the filing
      const id = `${metadata.ticker}-${metadata.filingType}-${metadata.filingDate.getTime()}`;
      
      // Create a formatted title for display
      const formattedTitle = `${metadata.companyName} (${metadata.ticker}) - ${metadata.filingType}`;
      
      filings.push({
        ...metadata,
        id,
        formattedTitle
      });
    }
  }
  
  return filings;
}

/**
 * Parse an SEC filing document HTML content
 * (For detailed parsing of specific filing types)
 */
export function parseFilingDocument(html: string, filingType: FilingType): string | null {
  try {
    const $ = cheerio.load(html);
    
    // This is a simple extraction - in a production environment,
    // you would implement more sophisticated parsing based on filing type
    let content = '';
    
    switch (filingType) {
      case '10-K':
      case '10-Q':
        // In production, this would target specific sections of the filing
        content = $('.formContent, #formDiv').text();
        break;
        
      case '8-K':
        // Extract the main content
        content = $('.formContent, #formDiv').text();
        break;
        
      case 'Form4':
        // Extract ownership information
        content = $('.formContent, #formDiv').text();
        break;
        
      default:
        content = $('body').text();
    }
    
    return content.trim() || null;
  } catch (error) {
    console.error('Failed to parse filing document:', error);
    return null;
  }
} 