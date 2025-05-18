/**
 * SEC Filing Parser Factory
 * 
 * Provides factory functions for creating parsers for specific SEC filing types.
 * Implements the unified content extraction strategy for different filing types.
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
import { isXBRL, parseXBRLAsSECFiling } from './xbrl-parser';
import { FilingSection } from './html-parser';
import { 
  STANDARD_SECTIONS,
  extractMetadata,
  extractImportantSections,
  removeBoilerplate,
  extractFinancialMetrics
} from './content-extraction-strategy';

// Initialize all filing types
import './filing-types';

// Create a logger for the factory
const logger = new Logger({}, 'filing-parser-factory');

// Common patterns for detecting filing types
const FILING_TYPE_PATTERNS = {
  '10-K': [
    /Form\s*10-?K/i,
    /Annual\s*Report/i,
    /Pursuant\s*to\s*Section\s*13\s*or\s*15\(d\)\s*of\s*the\s*Securities\s*Exchange\s*Act\s*of\s*1934/i,
  ],
  '10-Q': [
    /Form\s*10-?Q/i,
    /Quarterly\s*Report/i,
    /Pursuant\s*to\s*Section\s*13\s*or\s*15\(d\)\s*of\s*the\s*Securities\s*Exchange\s*Act\s*of\s*1934/i,
  ],
  '8-K': [
    /Form\s*8-?K/i,
    /Current\s*Report/i,
    /Pursuant\s*to\s*Section\s*13\s*or\s*15\(d\)\s*of\s*the\s*Securities\s*Exchange\s*Act\s*of\s*1934/i,
  ],
  'Form4': [
    /Form\s*4/i,
    /Statement\s*of\s*Changes\s*in\s*Beneficial\s*Ownership/i,
  ],
  'DEFA14A': [
    /DEFA\s*14A/i,
    /DEF\s*14A/i,
    /Definitive\s*Proxy\s*Statement/i,
    /Additional\s*Proxy\s*Soliciting\s*Materials/i,
  ],
  'SC 13D': [
    /Schedule\s*13D/i,
    /SC\s*13D/i,
    /beneficial\s*ownership\s*report/i,
  ],
  '144': [
    /Form\s*144/i,
    /Notice\s*of\s*Proposed\s*Sale/i,
  ],
};

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
 * Match content against patterns to determine filing type
 * 
 * @param content The content to analyze
 * @param patterns Array of regex patterns to match against
 * @returns True if any pattern matches, false otherwise
 */
function matchesPatterns(content: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(content));
}

/**
 * Detects the filing type from content
 * 
 * @param content The content to analyze
 * @returns The detected filing type or null if not detected
 */
export function detectFilingType(content: string | Buffer): string | null {
  // Check if this is a PDF file
  if (isPDF(content)) {
    logger.debug('Content appears to be a PDF file');
    return 'PDF'; // Return a special type to indicate PDF
  }
  
  // Check if this is an XBRL file
  if (isXBRL(content)) {
    logger.debug('Content appears to be an XBRL file');
    return 'XBRL'; // Return a special type to indicate XBRL
  }
  
  // Extract HTML sample for pattern detection
  const html = Buffer.isBuffer(content) 
    ? content.toString('utf8', 0, 2000) 
    : content.substring(0, 2000);
  
  // Check against filing type patterns
  for (const [filingType, patterns] of Object.entries(FILING_TYPE_PATTERNS)) {
    if (matchesPatterns(html, patterns)) {
      logger.debug(`Detected filing type: ${filingType}`);
      return filingType;
    }
  }
  
  // Try to extract from title as fallback
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) {
    const title = titleMatch[1].trim();
    
    // Check title against filing type patterns
    for (const [filingType, patterns] of Object.entries(FILING_TYPE_PATTERNS)) {
      if (matchesPatterns(title, patterns)) {
        logger.debug(`Detected filing type from title: ${filingType}`);
        return filingType;
      }
    }
  }
  
  // No recognized pattern found
  logger.debug('Could not detect filing type');
  return null;
}

/**
 * Creates a parser for a filing based on its detected type
 * 
 * @param content The content to parse (HTML/XBRL string or PDF buffer)
 * @param options Parser options to apply
 * @returns The parsed SEC filing
 * @throws Error if the filing type cannot be detected or is not supported
 */
export async function createAutoParser(
  content: string | Buffer,
  options?: Partial<SECFilingParserOptions>
): Promise<ParsedSECFiling> {
  // Handle Buffer input for detection
  const contentSample = Buffer.isBuffer(content) ? content.toString('utf8', 0, 1000) : content.substring(0, 1000);
  
  // Try to detect the filing type
  const detectedType = detectFilingType(contentSample);
  
  if (!detectedType) {
    logger.warn('Could not detect filing type from content');
    throw new Error('Unable to determine SEC filing type from content');
  }
  
  logger.debug(`Auto-detected filing type: ${detectedType}`);
  
  // Check if this is a PDF file
  if (detectedType === 'PDF') {
    // Make sure content is a Buffer for PDF parsing
    if (!Buffer.isBuffer(content)) {
      content = Buffer.from(content);
    }
    
    // Parse the PDF
    return await parsePDFAsSECFiling(content, options);
  }
  
  // Check if this is an XBRL file
  if (detectedType === 'XBRL') {
    // Make sure content is a Buffer for XBRL parsing
    if (!Buffer.isBuffer(content)) {
      content = Buffer.from(content);
    }
    
    // Parse the XBRL
    return await parseXBRLAsSECFiling(content, options);
  }
  
  // For HTML files, create and use the appropriate parser
  const parser = createFilingParser(detectedType);
  const contentString = Buffer.isBuffer(content) ? content.toString('utf8') : content;
  
  // Extract metadata using content extraction strategy
  const metadata = extractMetadata(contentString, detectedType);
  
  // Parse the content with appropriate options
  const parsedResult = parser(contentString, options);
  
  // Add the metadata to the result
  parsedResult.metadata = metadata;
  
  // Extract important sections using content extraction strategy
  if (parsedResult.sections && parsedResult.sections.length > 0) {
    const extractedSections = extractImportantSections(parsedResult.sections, detectedType);
    
    // Merge with existing important sections
    parsedResult.importantSections = {
      ...parsedResult.importantSections,
      ...extractedSections
    };
    
    // Apply boilerplate detection and removal if requested
    if (options?.removeBoilerplate !== false) {
      parsedResult.sections = removeBoilerplate(parsedResult.sections);
    }
    
    // Extract financial metrics if available and add to metadata
    const financialMetrics = extractFinancialMetrics(parsedResult.sections);
    if (Object.keys(financialMetrics).length > 0) {
      if (!parsedResult.metadata) {
        parsedResult.metadata = metadata;
      }
      parsedResult.metadata.financialMetrics = financialMetrics;
    }
  }
  
  return parsedResult;
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
    
    // Use standard sections list for consistency
    const importantSections = extractImportantSections(sections, 'PDF');
    
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
    
    // Apply boilerplate detection and removal if requested
    if (options?.removeBoilerplate !== false) {
      result.sections = removeBoilerplate(result.sections);
    }
    
    // Extract financial metrics if available and add to metadata
    const financialMetrics = extractFinancialMetrics(result.sections);
    if (Object.keys(financialMetrics).length > 0) {
      if (!result.metadata) {
        result.metadata = { filingType: 'PDF' };
      }
      result.metadata.financialMetrics = financialMetrics;
    }
    
    return result;
  } catch (error) {
    logger.error('Error parsing PDF as SEC filing:', error);
    throw new Error(`Failed to parse PDF as SEC filing: ${error}`);
  }
} 