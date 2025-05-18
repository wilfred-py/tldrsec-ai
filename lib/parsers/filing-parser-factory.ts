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
  ParsedSECFiling
} from './sec-filing-parser';
import { FilingType } from '@/lib/sec-edgar/types';

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
 * Detects the filing type from HTML content
 * 
 * @param html The HTML content to analyze
 * @returns The detected filing type or null if not detected
 */
export function detectFilingType(html: string): string | null {
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
 * @param html The HTML content to parse
 * @param options Parser options to apply
 * @returns The parsed SEC filing
 * @throws Error if the filing type cannot be detected or is not supported
 */
export function createAutoParser(
  html: string,
  options?: Partial<SECFilingParserOptions>
): ParsedSECFiling {
  // Try to detect the filing type
  const detectedType = detectFilingType(html);
  
  if (!detectedType) {
    logger.warn('Could not detect filing type from content');
    throw new Error('Unable to determine SEC filing type from content');
  }
  
  logger.debug(`Auto-detected filing type: ${detectedType}`);
  
  // Create and use the appropriate parser
  const parser = createFilingParser(detectedType);
  return parser(html, options);
} 