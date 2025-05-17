import * as cheerio from 'cheerio';
import { 
  FilingMetadata, 
  FilingType, 
  ParsedFiling, 
  SECApiEntry,
  SECApiResponse,
  SECEdgarError,
  SECErrorCode,
  ProcessedFilingsResult
} from './types';
import { XMLParser } from 'fast-xml-parser';
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@prisma/client';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
  isArray: (name, jpath) => {
    if (name === 'entry') return true;
    return false;
  }
});

/**
 * Parse the SEC EDGAR RSS feed response
 */
export function parseRssFeed(xmlData: string): SECApiResponse {
  try {
    // Parse the XML
    const result = parser.parse(xmlData);
    
    // Handle different XML structures
    const feed = result.feed || result.rss?.channel;
    
    if (!feed) {
      throw new Error('Unsupported RSS format');
    }
    
    // Extract entries
    const entries = feed.entry || feed.item || [];
    
    return {
      entries: entries.map((entry: any) => ({
        title: entry.title || '',
        link: entry.link?.href || entry.link || '',
        summary: entry.summary || entry.description || '',
        updated: entry.updated || entry.pubDate || '',
        id: entry.id || entry.guid || uuidv4(),
        category: entry.category || ''
      })),
      nextPage: feed.link?.find((link: any) => link.rel === 'next')?.href
    };
  } catch (error) {
    console.error('Error parsing RSS feed:', error);
    throw new Error(`Failed to parse RSS feed: ${(error as Error).message}`);
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
export async function processFilingEntries(entries: SECApiEntry[], prisma: PrismaClient): Promise<ProcessedFilingsResult> {
  const filings: ParsedFiling[] = [];
  const newFilings: ParsedFiling[] = [];
  const existingFilings: ParsedFiling[] = [];
  
  for (const entry of entries) {
    try {
      // Extract ticker and form type from title
      // Example title: "10-K - APPLE INC (0000320193) (Filer)"
      const titleMatch = entry.title.match(/^([^-]+)\s*-\s*(.+?)\s*\((\d+)\)/);
      
      if (!titleMatch) {
        console.log(`Skipping entry with unrecognized title format: ${entry.title}`);
        continue;
      }
      
      const [_, formTypeRaw, companyName, cik] = titleMatch;
      
      // Clean up form type
      const formType = formTypeRaw.trim() as FilingType;
      
      if (!isValidFormType(formType)) {
        console.log(`Skipping entry with unsupported form type: ${formType}`);
        continue;
      }
      
      // Extract filing date
      const filingDate = new Date(entry.updated);
      
      // Generate a unique ID
      const id = entry.id || uuidv4();
      
      // Create parsed filing object
      const parsedFiling: ParsedFiling = {
        id,
        companyName: companyName.trim(),
        ticker: '', // Will extract from database below
        cik: cik,
        formType,
        filingDate,
        filingUrl: entry.link,
        url: entry.link,
        formattedTitle: `${formType} - ${companyName.trim()}`
      };
      
      // Try to lookup ticker by CIK
      const company = await prisma.company.findFirst({
        where: { cik: cik }
      });
      
      if (company) {
        parsedFiling.ticker = company.ticker;
        
        // Check if we already have this filing in the database
        const existingFiling = await prisma.filing.findFirst({
          where: {
            cik: cik,
            formType: formType,
            filingDate: {
              // Look for filings on the same day (ignoring time)
              gte: new Date(filingDate.setHours(0, 0, 0, 0)),
              lt: new Date(filingDate.setHours(23, 59, 59, 999))
            }
          }
        });
        
        if (existingFiling) {
          existingFilings.push(parsedFiling);
        } else {
          // Store the filing in the database
          await prisma.filing.create({
            data: {
              id: parsedFiling.id,
              cik: parsedFiling.cik,
              companyId: company.id,
              formType: parsedFiling.formType,
              filingDate: parsedFiling.filingDate,
              url: parsedFiling.url,
              processed: false
            }
          });
          
          newFilings.push(parsedFiling);
        }
      } else {
        console.log(`Skipping filing for unknown company with CIK: ${cik}`);
        continue;
      }
      
      filings.push(parsedFiling);
    } catch (error) {
      console.error(`Error processing filing entry:`, error);
      // Continue with next entry
    }
  }
  
  return {
    newFilings,
    existingFilings
  };
}

/**
 * Validate that a form type is supported
 */
function isValidFormType(formType: string): formType is FilingType {
  const validTypes: FilingType[] = ['10-K', '10-Q', '8-K', 'Form4', '4'];
  return validTypes.includes(formType as FilingType);
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