/**
 * SEC Filing Parser
 * 
 * This module provides specialized parsing functions for different types of SEC filings
 * (10-K, 10-Q, 8-K, etc.) building on top of the base HTML parser.
 */

import { 
  parseHTML, 
  parseHTMLFromUrl, 
  FilingSection, 
  FilingSectionType,
  HTMLParserOptions
} from './html-parser';
import { Logger } from '@/lib/logging';
import { FilingType } from '@/lib/sec-edgar/types';

// Create a logger for the SEC filing parser
const logger = new Logger({}, 'sec-filing-parser');

// Define a type for SEC filing section mappings
type SECFilingSections = {
  [key in '10-K' | '10-Q' | '8-K' | 'Form4']: string[];
};

// Important section names in SEC filings
const SEC_FILING_SECTIONS: SECFilingSections = {
  '10-K': [
    'Management\'s Discussion and Analysis',
    'Risk Factors',
    'Financial Statements',
    'Notes to Financial Statements',
    'Controls and Procedures',
    'Quantitative and Qualitative Disclosures about Market Risk',
    'Executive Compensation',
    'Business'
  ],
  '10-Q': [
    'Management\'s Discussion and Analysis',
    'Risk Factors',
    'Financial Statements',
    'Notes to Financial Statements',
    'Controls and Procedures',
    'Quantitative and Qualitative Disclosures about Market Risk',
  ],
  '8-K': [
    'Item 1.01',
    'Item 2.01',
    'Item 5.02',
    'Item 7.01',
    'Item 8.01',
    'Item 9.01',
  ],
  'Form4': [
    'Table I',
    'Table II',
    'Reporting Owner',
    'Transactions',
  ]
};

/**
 * Options for SEC filing parsing
 */
export interface SECFilingParserOptions extends HTMLParserOptions {
  extractImportantSections?: boolean;
  includeFullText?: boolean;
  maxFullTextLength?: number;
}

/**
 * Default options for SEC filing parsing
 */
const DEFAULT_SEC_FILING_OPTIONS: SECFilingParserOptions = {
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
 * Metadata extracted from SEC filings
 */
export interface SECFilingMetadata {
  filingType: string;
  cik?: string;
  companyName?: string;
  filingDate?: Date;
  [key: string]: any;
}

/**
 * Represents a parsed SEC filing
 */
export interface ParsedSECFiling {
  filingType: FilingType;
  cik?: string;
  companyName?: string;
  filingDate?: Date;
  importantSections: {
    [sectionName: string]: string;
  };
  sections: FilingSection[];
  tables: FilingSection[];
  lists: FilingSection[];
  fullText?: string;
  metadata?: SECFilingMetadata;
}

/**
 * Parse an SEC filing from a URL
 * 
 * @param url The URL of the SEC filing
 * @param filingType The type of SEC filing
 * @param options Parsing options
 * @returns The parsed SEC filing
 */
export async function parseSECFilingFromUrl(
  url: string,
  filingType: FilingType,
  options: SECFilingParserOptions = DEFAULT_SEC_FILING_OPTIONS
): Promise<ParsedSECFiling> {
  try {
    logger.debug(`Parsing SEC filing of type ${filingType} from URL: ${url}`);
    
    // Merge options with defaults
    const mergedOptions = { ...DEFAULT_SEC_FILING_OPTIONS, ...options };
    
    // Use the base HTML parser to get sections
    const sections = await parseHTMLFromUrl(url, mergedOptions);
    
    // Process the sections based on filing type
    return processSECFiling(sections, filingType, mergedOptions);
  } catch (error) {
    logger.error(`Error parsing SEC filing from URL ${url}:`, error);
    throw new Error(`Failed to parse SEC filing from URL: ${url}`);
  }
}

/**
 * Parse an SEC filing from HTML content
 * 
 * @param html The HTML content of the SEC filing
 * @param filingType The type of SEC filing
 * @param options Parsing options
 * @returns The parsed SEC filing
 */
export function parseSECFiling(
  html: string,
  filingType: FilingType,
  options: SECFilingParserOptions = DEFAULT_SEC_FILING_OPTIONS
): ParsedSECFiling {
  try {
    logger.debug(`Parsing SEC filing of type ${filingType} from HTML content`);
    
    // Merge options with defaults
    const mergedOptions = { ...DEFAULT_SEC_FILING_OPTIONS, ...options };
    
    // Use the base HTML parser to get sections
    const sections = parseHTML(html, mergedOptions);
    
    // Process the sections based on filing type
    return processSECFiling(sections, filingType, mergedOptions);
  } catch (error) {
    logger.error(`Error parsing SEC filing from HTML:`, error);
    throw new Error(`Failed to parse SEC filing from HTML`);
  }
}

/**
 * Process the parsed sections based on filing type
 */
function processSECFiling(
  sections: FilingSection[],
  filingType: FilingType,
  options: SECFilingParserOptions
): ParsedSECFiling {
  // Extract metadata from the document
  const metadata = extractSECFilingMetadata(sections, filingType);
  
  // Find tables and lists
  const tables = sections.filter(section => section.type === FilingSectionType.TABLE);
  const lists = sections.filter(section => section.type === FilingSectionType.LIST);
  
  // Extract important sections based on filing type
  const importantSections: { [sectionName: string]: string } = {};
  
  if (options.extractImportantSections) {
    // Handle all possible filing types
    const sectionType = filingType === '4' ? 'Form4' : filingType;
    const sectionNames = (SEC_FILING_SECTIONS[sectionType as keyof SECFilingSections] || []);
    
    for (const sectionName of sectionNames) {
      const sectionContent = findSectionContent(sections, sectionName);
      if (sectionContent) {
        importantSections[sectionName] = sectionContent;
      }
    }
  }
  
  // Create a full text version if requested
  let fullText: string | undefined = undefined;
  if (options.includeFullText) {
    fullText = sections
      .map(section => section.content)
      .join('\n\n')
      .trim();
    
    if (options.maxFullTextLength && fullText.length > options.maxFullTextLength) {
      fullText = fullText.substring(0, options.maxFullTextLength) + '...';
    }
  }
  
  return {
    filingType,
    cik: metadata.cik,
    companyName: metadata.companyName,
    filingDate: metadata.filingDate,
    importantSections,
    sections,
    tables,
    lists,
    fullText,
    metadata
  };
}

/**
 * Extract metadata from the SEC filing
 */
function extractSECFilingMetadata(
  sections: FilingSection[],
  filingType: FilingType
): SECFilingMetadata {
  const metadata: SECFilingMetadata = {
    filingType
  };
  
  // Try to find document header or title section
  const titleSection = sections.find(section => 
    section.type === FilingSectionType.TITLE || 
    (section.type === FilingSectionType.SECTION && section.title?.includes('Document'))
  );
  
  if (titleSection) {
    // Try to extract company name from title
    const companyNameMatch = titleSection.content.match(/([A-Z][A-Z\s&,.]+)(?:\s+\(|\s+-)/);
    if (companyNameMatch) {
      metadata.companyName = companyNameMatch[1].trim();
    }
    
    // Try to extract CIK from title
    const cikMatch = titleSection.content.match(/CIK\s*[#:]?\s*(\d+)/i) || 
                     titleSection.content.match(/(\d{10})/);
    if (cikMatch) {
      metadata.cik = cikMatch[1];
    }
    
    // Try to extract filing date
    const dateMatch = titleSection.content.match(
      /(?:filed|date|as of)[\s:]*(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/i
    );
    if (dateMatch) {
      const [_, month, day, year] = dateMatch;
      const fullYear = year.length === 2 ? `20${year}` : year;
      const dateStr = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      metadata.filingDate = new Date(dateStr);
    }
  }
  
  return metadata;
}

/**
 * Find content for a specific section based on its name
 */
function findSectionContent(
  sections: FilingSection[],
  sectionName: string
): string | undefined {
  // Search for exact section title match
  const exactMatch = sections.find(section => 
    section.title && section.title.includes(sectionName)
  );
  
  if (exactMatch) {
    return exactMatch.content;
  }
  
  // Search in content for section references
  for (const section of sections) {
    if (section.content.includes(sectionName)) {
      // Find the position of the section name in the content
      const position = section.content.indexOf(sectionName);
      
      // Return the content from that position onwards
      // This is a simplistic approach, but often works for SEC filings
      return section.content.substring(position);
    }
    
    // Search in children if available
    if (section.children && section.children.length > 0) {
      const childContent = findSectionContent(section.children, sectionName);
      if (childContent) {
        return childContent;
      }
    }
  }
  
  return undefined;
}

/**
 * Parse a 10-K SEC filing with optimized extraction for this report type
 */
export function parse10KFiling(
  html: string,
  options: SECFilingParserOptions = DEFAULT_SEC_FILING_OPTIONS
): ParsedSECFiling {
  // Specialized options for 10-K filings
  const tenKOptions: SECFilingParserOptions = {
    ...options,
    extractImportantSections: true,
  };
  
  return parseSECFiling(html, '10-K', tenKOptions);
}

/**
 * Parse a 10-Q SEC filing with optimized extraction for this report type
 */
export function parse10QFiling(
  html: string,
  options: SECFilingParserOptions = DEFAULT_SEC_FILING_OPTIONS
): ParsedSECFiling {
  // Specialized options for 10-Q filings
  const tenQOptions: SECFilingParserOptions = {
    ...options,
    extractImportantSections: true,
  };
  
  return parseSECFiling(html, '10-Q', tenQOptions);
}

/**
 * Parse an 8-K SEC filing with optimized extraction for this report type
 */
export function parse8KFiling(
  html: string,
  options: SECFilingParserOptions = DEFAULT_SEC_FILING_OPTIONS
): ParsedSECFiling {
  // Specialized options for 8-K filings
  const eightKOptions: SECFilingParserOptions = {
    ...options,
    extractImportantSections: true,
  };
  
  return parseSECFiling(html, '8-K', eightKOptions);
}

/**
 * Parse a Form 4 SEC filing with optimized extraction for this report type
 */
export function parseForm4Filing(
  html: string,
  options: SECFilingParserOptions = DEFAULT_SEC_FILING_OPTIONS
): ParsedSECFiling {
  // Specialized options for Form 4 filings
  const form4Options: SECFilingParserOptions = {
    ...options,
    extractImportantSections: true,
    extractTables: true, // Form 4 filings have important tables
  };
  
  return parseSECFiling(html, 'Form4', form4Options);
} 