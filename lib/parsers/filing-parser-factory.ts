/**
 * SEC Filing Parser Factory
 * 
 * Provides factory functions for creating parsers for specific SEC filing types.
 */

import { Logger } from '@/lib/logging';
import { FilingTypeRegistry } from './filing-type-registry';
import {
  parseSECFiling,
  SECFilingParserOptions,
  ParsedSECFiling,
  SECFilingMetadata
} from './sec-filing-parser';
import { FilingType } from '@/lib/sec-edgar/types';
import { parsePDFFromBuffer } from './pdf-parser';

// Create a logger for the factory
const logger = new Logger({}, 'filing-parser-factory');

// Get default options from sec-filing-parser.ts
const DEFAULT_OPTIONS: SECFilingParserOptions = {
  extractImportantSections: true,
  includeFullText: false,
  maxFullTextLength: 500000,
  includeRawHtml: false,
  maxSectionLength: 100000,
  preserveWhitespace: false,
  extractTables: true,
  extractLists: true,
  removeBoilerplate: true,
};

/**
 * Creates a parser function for a specific filing type
 * 
 * @param filingType The type of filing to create a parser for
 * @returns A function that parses HTML content into a structured SEC filing
 * @throws Error if the filing type is not supported
 */
export function createFilingParser(
  filingType: string
): (html: string, options?: Partial<SECFilingParserOptions>) => ParsedSECFiling {
  // Check if the filing type is supported
  if (!FilingTypeRegistry.isSupported(filingType)) {
    throw new Error(`Unsupported filing type: ${filingType}`);
  }
  
  // Get the configuration for this filing type
  const config = FilingTypeRegistry.getSectionConfig(filingType);
  
  // Use custom parser if provided
  if (config?.customParser) {
    logger.debug(`Using custom parser for filing type: ${filingType}`);
    return config.customParser;
  }
  
  // Return a function that uses the generic parseSECFiling with type-specific options
  return (html: string, options?: Partial<SECFilingParserOptions>) => {
    logger.debug(`Parsing ${filingType} filing`);
    const mergedOptions = { 
      ...DEFAULT_OPTIONS, 
      ...config?.parserOptions,
      ...options
    };
    return parseSECFiling(html, filingType as FilingType, mergedOptions);
  };
}

/**
 * Detects if the content is a PDF file
 * 
 * @param content The content to analyze
 * @returns True if content appears to be a PDF file, false otherwise
 */
export function isPDF(content: string | Buffer): boolean {
  // Check for PDF signature at the beginning of the file
  if (Buffer.isBuffer(content)) {
    return content.length >= 5 && content.slice(0, 5).toString() === '%PDF-';
  } else {
    return content.startsWith('%PDF-');
  }
}

/**
 * Detects the filing type from HTML content
 * 
 * @param html The HTML content to analyze
 * @returns The detected filing type or null if not detected
 */
export function detectFilingType(html: string): string | null {
  // Check if this is a PDF file - if so, we won't be able to detect by HTML patterns
  if (isPDF(html)) {
    logger.debug('Content appears to be a PDF file');
    return 'PDF'; // Return a special type to indicate PDF
  }
  
  // Simple regex-based detection from title or content
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : '';
  
  // Check for common patterns in the title
  if (/Form 10-K|Annual Report|10-K/i.test(title)) return '10-K';
  if (/Form 10-Q|Quarterly Report|10-Q/i.test(title)) return '10-Q';
  if (/Form 8-K|Current Report|8-K/i.test(title)) return '8-K';
  if (/Form 4|Statement of Changes|beneficial ownership/i.test(title)) return 'Form4';
  if (/DEFA14A|DEFA 14A|Additional Proxy Materials|Additional Proxy Soliciting/i.test(title)) return 'DEFA14A';
  if (/Schedule 13D|SC 13D|beneficial ownership report/i.test(title)) return 'SC 13D';
  if (/Form 144|Notice of Proposed Sale/i.test(title)) return '144';
  
  // Check content if title doesn't provide clear indication
  if (/Form 10-K/i.test(html)) return '10-K';
  if (/Form 10-Q/i.test(html)) return '10-Q';
  if (/Form 8-K/i.test(html)) return '8-K';
  if (/DEFA14A|DEFA 14A|Additional Proxy Materials/i.test(html)) return 'DEFA14A';
  
  // No recognized pattern found
  return null;
}

/**
 * Creates a parser for a filing based on its detected type
 * 
 * @param content The content to parse (HTML string or PDF buffer)
 * @param options Parser options to apply
 * @returns The parsed SEC filing
 * @throws Error if the filing type cannot be detected or is not supported
 */
export async function createAutoParser(
  content: string | Buffer,
  options?: Partial<SECFilingParserOptions>
): Promise<ParsedSECFiling> {
  // Handle Buffer input
  const contentString = Buffer.isBuffer(content) ? content.toString('utf8', 0, 1000) : content;
  
  // Try to detect the filing type
  const detectedType = detectFilingType(contentString);
  
  if (!detectedType) {
    logger.warn('Could not detect filing type from content');
    throw new Error('Unable to determine SEC filing type from content');
  }
  
  logger.debug(`Auto-detected filing type: ${detectedType}`);
  
  // Check if this is a PDF file
  if (detectedType === 'PDF') {
    // For PDF files, we need to process differently
    logger.debug('Processing PDF file');
    
    // For now, we don't have PDF filing type-specific parsing
    // So we'll use a generic approach that returns a basic SEC filing
    if (!Buffer.isBuffer(content)) {
      content = Buffer.from(content);
    }
    
    // Parse the PDF
    return await parsePDFAsSECFiling(content, options);
  }
  
  // For HTML files, create and use the appropriate parser
  const parser = createFilingParser(detectedType);
  return parser(contentString, options);
}

/**
 * Parse a PDF file and convert the results to a ParsedSECFiling structure
 * 
 * @param buffer The PDF buffer content
 * @param options Parser options
 * @returns A ParsedSECFiling object
 */
async function parsePDFAsSECFiling(
  buffer: Buffer,
  options?: Partial<SECFilingParserOptions>
): Promise<ParsedSECFiling> {
  try {
    logger.debug('Parsing PDF as SEC filing');
    
    // Parse the PDF file
    const sections = await parsePDFFromBuffer(buffer, {
      ...DEFAULT_OPTIONS,
      ...options,
    });
    
    // Find metadata
    const metadataSection = sections.find(section => 
      section.type === 'section' && section.title === 'Metadata'
    );
    
    // Extract important sections based on headings
    const importantSections: { [sectionName: string]: string } = {};
    
    // Look for common important sections in SEC filings
    const sectionNames = [
      'Management\'s Discussion and Analysis',
      'Risk Factors',
      'Financial Statements',
      'Notes to Financial Statements',
      'Controls and Procedures',
      'Quantitative and Qualitative Disclosures',
      'Business',
      'Item 1.',
      'Item 1A.',
      'Item 7.',
      'Item 8.',
    ];
    
    // Find sections that match important section names
    for (const section of sections) {
      if (section.title) {
        for (const sectionName of sectionNames) {
          if (section.title.includes(sectionName)) {
            importantSections[sectionName] = section.content;
            break;
          }
        }
      }
    }
    
    // Extract tables
    const tables = sections.filter(section => section.type === 'table');
    
    // Create a ParsedSECFiling object
    const result: ParsedSECFiling = {
      filingType: 'PDF' as FilingType,
      importantSections,
      sections,
      tables,
      lists: sections.filter(section => section.type === 'list'),
    };
    
    // Add metadata if available
    if (metadataSection && metadataSection.metadata) {
      // Create a proper SECFilingMetadata object
      const metadata: SECFilingMetadata = {
        filingType: 'PDF',
        ...metadataSection.metadata
      };
      
      // Add metadata to result
      result.metadata = metadata;
      
      // Extract company name if available
      if (metadataSection.metadata.Author) {
        result.companyName = metadataSection.metadata.Author;
      }
      
      // Extract filing date if available
      if (metadataSection.metadata.CreationDate) {
        try {
          // Parse PDF date format (typically like "D:20201231120000+00'00'")
          const dateString = metadataSection.metadata.CreationDate;
          if (dateString.startsWith('D:')) {
            const year = parseInt(dateString.substring(2, 6));
            const month = parseInt(dateString.substring(6, 8)) - 1;
            const day = parseInt(dateString.substring(8, 10));
            result.filingDate = new Date(year, month, day);
          }
        } catch (error) {
          logger.error('Error parsing PDF creation date:', error);
        }
      }
    }
    
    return result;
  } catch (error) {
    logger.error('Error parsing PDF as SEC filing:', error);
    throw new Error(`Failed to parse PDF as SEC filing: ${error}`);
  }
} 