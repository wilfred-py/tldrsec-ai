/**
 * Content Extraction Strategy
 * 
 * Provides a unified strategy for extracting content from different SEC filing types.
 * This module implements various extraction techniques optimized for HTML, PDF, and XBRL filings.
 */

import { Logger } from '@/lib/logging';
import { FilingSection, FilingSectionType } from './html-parser';
import { SECFilingMetadata } from './sec-filing-parser';
import { FilingType } from '@/lib/sec-edgar/types';

// Create a logger for content extraction
const logger = new Logger({}, 'content-extraction-strategy');

/**
 * Options for content extraction
 */
export interface ContentExtractionOptions {
  /** Whether to extract tables */
  extractTables?: boolean;
  /** Whether to extract lists */
  extractLists?: boolean;
  /** Whether to extract financial metrics */
  extractFinancialMetrics?: boolean;
  /** Whether to standardize metrics */
  standardizeMetrics?: boolean;
  /** Whether to detect boilerplate */
  detectBoilerplate?: boolean;
  /** Maximum section length */
  maxSectionLength?: number;
}

/**
 * Default options for content extraction
 */
export const DEFAULT_EXTRACTION_OPTIONS: ContentExtractionOptions = {
  extractTables: true,
  extractLists: true,
  extractFinancialMetrics: true,
  standardizeMetrics: true,
  detectBoilerplate: true,
  maxSectionLength: 100000,
};

/**
 * Standard sections to extract across filing types
 */
export const STANDARD_SECTIONS = [
  'Management\'s Discussion and Analysis',
  'Risk Factors',
  'Financial Statements',
  'Notes to Financial Statements',
  'Controls and Procedures',
  'Quantitative and Qualitative Disclosures',
  'Business',
  'Executive Compensation',
  'Related Party Transactions',
  'Legal Proceedings',
  'Corporate Governance',
];

/**
 * Financial metrics to extract and standardize
 */
export const FINANCIAL_METRICS = [
  'Revenue',
  'Net Income',
  'Earnings Per Share',
  'Total Assets',
  'Total Liabilities',
  'Cash and Cash Equivalents',
  'Operating Income',
  'Gross Profit',
  'Net Profit Margin',
  'Return on Assets',
  'Return on Equity',
  'Debt to Equity Ratio',
];

/**
 * Common patterns for extracting metadata from different filing types
 */
export const METADATA_PATTERNS = {
  companyName: [
    /<title[^>]*>([^<:]+)(?:[:-]|$)/i,
    /Company[:\s]+([^<\n]+)/i,
  ],
  filingDate: [
    /(?:filing date|date of report|as of)(?:\s*:\s*|\s+)([A-Z][a-z]+ \d{1,2}, \d{4})/i,
    /(?:filed|date)[:\s]+(\d{1,2}\/\d{1,2}\/\d{4})/i,
  ],
  cik: [
    /CIK[:\s]+(\d{10})/i,
    /(\d{10})(?:\s*\([Cc][Ii][Kk]\))/,
  ],
  fiscalYear: [
    /[Ff]iscal\s+[Yy]ear(?:\s+[Ee]nd(?:ed|ing))?[:\s]+(\d{4})/i,
  ],
  fiscalPeriod: [
    /[Ff]iscal\s+(?:[Pp]eriod|[Qq]uarter)[:\s]+(Q\d|[Aa]nnual)/i,
  ],
};

/**
 * Extract metadata from content
 * 
 * @param content The content to extract metadata from
 * @param filingType The filing type
 * @returns The extracted metadata
 */
export function extractMetadata(
  content: string,
  filingType: string
): SECFilingMetadata {
  logger.debug(`Extracting metadata from ${filingType} filing`);
  
  const metadata: SECFilingMetadata = {
    filingType: filingType as FilingType,
  };
  
  // Extract company name
  for (const pattern of METADATA_PATTERNS.companyName) {
    const match = content.match(pattern);
    if (match && match[1]) {
      metadata.companyName = match[1].trim();
      break;
    }
  }
  
  // Extract filing date
  for (const pattern of METADATA_PATTERNS.filingDate) {
    const match = content.match(pattern);
    if (match && match[1]) {
      try {
        metadata.filingDate = new Date(match[1]);
        break;
      } catch (error) {
        logger.warn(`Could not parse filing date from "${match[1]}"`);
      }
    }
  }
  
  // Extract CIK
  for (const pattern of METADATA_PATTERNS.cik) {
    const match = content.match(pattern);
    if (match && match[1]) {
      metadata.cik = match[1].trim();
      break;
    }
  }
  
  // Extract fiscal year
  for (const pattern of METADATA_PATTERNS.fiscalYear) {
    const match = content.match(pattern);
    if (match && match[1]) {
      metadata.fiscalYear = match[1].trim();
      break;
    }
  }
  
  // Extract fiscal period
  for (const pattern of METADATA_PATTERNS.fiscalPeriod) {
    const match = content.match(pattern);
    if (match && match[1]) {
      metadata.fiscalPeriod = match[1].trim();
      break;
    }
  }
  
  return metadata;
}

/**
 * Detect and extract important sections based on filing type
 * 
 * @param sections The filing sections
 * @param filingType The filing type
 * @returns Map of important section names to their content
 */
export function extractImportantSections(
  sections: FilingSection[],
  filingType: string
): { [sectionName: string]: string } {
  logger.debug(`Extracting important sections from ${filingType} filing`);
  
  const importantSections: { [sectionName: string]: string } = {};
  
  // Extract standard sections
  for (const section of sections) {
    if (section.title) {
      // Check if this section matches any standard section
      for (const standardSection of STANDARD_SECTIONS) {
        if (section.title.includes(standardSection)) {
          importantSections[standardSection] = section.content;
          break;
        }
      }
      
      // Also check for Item X.X sections that are common in filings
      const itemMatch = section.title.match(/Item\s+(\d+\.\d+|\d+)/i);
      if (itemMatch) {
        importantSections[section.title] = section.content;
      }
    }
  }
  
  // Filing-specific section extraction
  switch (filingType) {
    case '10-K':
      // Look for annual financial information
      extractFinancialSections(sections, importantSections, true);
      break;
      
    case '10-Q':
      // Look for quarterly financial information
      extractFinancialSections(sections, importantSections, false);
      break;
      
    case '8-K':
      // Look for material event information
      extractEventSections(sections, importantSections);
      break;
      
    case 'Form4':
      // Look for transaction information
      extractTransactionSections(sections, importantSections);
      break;
  }
  
  return importantSections;
}

/**
 * Extract financial sections from the filing
 * 
 * @param sections The filing sections
 * @param importantSections The map to add sections to
 * @param isAnnual Whether this is an annual report (10-K)
 */
function extractFinancialSections(
  sections: FilingSection[],
  importantSections: { [sectionName: string]: string },
  isAnnual: boolean
): void {
  // Look for common financial tables
  const financialTables = sections.filter(section => 
    section.type === FilingSectionType.TABLE && 
    (section.title?.includes('Financial') || 
     section.title?.includes('Statement') ||
     section.title?.includes('Balance Sheet') ||
     section.title?.includes('Income') ||
     section.title?.includes('Cash Flow'))
  );
  
  // Add each financial table to important sections
  for (const table of financialTables) {
    if (table.title) {
      importantSections[table.title] = table.content;
    }
  }
  
  // For 10-K, also look for audit opinion
  if (isAnnual) {
    for (const section of sections) {
      if (section.title && 
         (section.title.includes('Audit') || 
          section.title.includes('Accountant') ||
          section.title.includes('Independent'))) {
        importantSections['Audit Opinion'] = section.content;
        break;
      }
    }
  }
}

/**
 * Extract event sections from 8-K filings
 * 
 * @param sections The filing sections
 * @param importantSections The map to add sections to
 */
function extractEventSections(
  sections: FilingSection[],
  importantSections: { [sectionName: string]: string }
): void {
  // Look for Item sections that describe material events
  const eventSections = [
    'Item 1.01', // Entry into a Material Agreement
    'Item 1.02', // Termination of a Material Agreement
    'Item 2.01', // Completion of Acquisition or Disposition
    'Item 2.02', // Results of Operations and Financial Condition
    'Item 4.01', // Changes in Registrant's Certifying Accountant
    'Item 5.01', // Changes in Control of Registrant
    'Item 5.02', // Departure/Election of Directors or Officers
    'Item 7.01', // Regulation FD Disclosure
    'Item 8.01', // Other Events
    'Item 9.01', // Financial Statements and Exhibits
  ];
  
  // Extract each event section
  for (const eventSection of eventSections) {
    for (const section of sections) {
      if (section.title && section.title.includes(eventSection)) {
        importantSections[eventSection] = section.content;
        break;
      }
    }
  }
}

/**
 * Extract transaction sections from Form 4 filings
 * 
 * @param sections The filing sections
 * @param importantSections The map to add sections to
 */
function extractTransactionSections(
  sections: FilingSection[],
  importantSections: { [sectionName: string]: string }
): void {
  // Look for tables containing transaction information
  const tableSections = sections.filter(section => section.type === FilingSectionType.TABLE);
  
  if (tableSections.length > 0) {
    // First table typically contains non-derivative securities
    if (tableSections[0]) {
      importantSections['Table I - Non-Derivative Securities'] = tableSections[0].content;
    }
    
    // Second table typically contains derivative securities
    if (tableSections[1]) {
      importantSections['Table II - Derivative Securities'] = tableSections[1].content;
    }
  }
  
  // Look for reporting owner information
  for (const section of sections) {
    if (section.title) {
      if (section.title.includes('Reporting Owner') || section.title.includes('Insider')) {
        importantSections['Reporting Owner Information'] = section.content;
        break;
      }
    } else if (section.content && section.content.includes('Reporting Owner')) {
      importantSections['Reporting Owner Information'] = section.content;
      break;
    }
  }
}

/**
 * Detects and removes boilerplate content from sections
 * 
 * @param sections The sections to process
 * @returns The sections with boilerplate removed
 */
export function removeBoilerplate(sections: FilingSection[]): FilingSection[] {
  logger.debug('Removing boilerplate content from sections');
  
  // Common boilerplate patterns
  const boilerplatePatterns = [
    /pursuant to the requirements of the securities exchange act of 1934/i,
    /forward-looking statements?/i,
    /safe harbor/i,
    /legal proceedings/i,
    /special note/i,
    /regarding forward-looking/i,
    /except as otherwise/i,
    /all rights reserved/i,
    /statements that are not historical facts/i,
    /risk factors/i,
    /the following factors/i,
    /cautionary statement/i,
  ];
  
  return sections.map(section => {
    if (section.type === FilingSectionType.SECTION && section.content) {
      // Check if this section is likely to be boilerplate
      const isBoilerplate = boilerplatePatterns.some(pattern => 
        pattern.test(section.content.substring(0, Math.min(500, section.content.length)))
      );
      
      if (isBoilerplate) {
        logger.debug(`Detected boilerplate in section: ${section.title || 'Untitled'}`);
        return {
          ...section,
          isBoilerplate: true,
        };
      }
    }
    
    return section;
  });
}

/**
 * Extract standardized financial metrics from sections
 * 
 * @param sections The sections to process
 * @returns Map of financial metrics to their values
 */
export function extractFinancialMetrics(
  sections: FilingSection[]
): { [metric: string]: { value: string, source: string } } {
  logger.debug('Extracting financial metrics from sections');
  
  const metrics: { [metric: string]: { value: string, source: string } } = {};
  
  // Define patterns for common financial metrics
  const metricPatterns = {
    'Revenue': [
      /(?:Total\s+)?Revenues?(?:\s+and\s+Other\s+Income)?[:\s]+([$€£]?[\d,.]+\s*(?:billion|million|thousand|[bmk])?)(?:\s*(?:USD|EUR|GBP))?/i,
      /Revenue(?:s|)[:\s]+([$€£]?[\d,.]+\s*(?:billion|million|thousand|[bmk])?)(?:\s*(?:USD|EUR|GBP))?/i,
    ],
    'Net Income': [
      /Net\s+Income(?:\s+\(Loss\))?[:\s]+([$€£]?[\d,.]+\s*(?:billion|million|thousand|[bmk])?)(?:\s*(?:USD|EUR|GBP))?/i,
      /Net\s+Earnings[:\s]+([$€£]?[\d,.]+\s*(?:billion|million|thousand|[bmk])?)(?:\s*(?:USD|EUR|GBP))?/i,
    ],
    'Earnings Per Share': [
      /(?:Basic\s+)?Earnings\s+Per\s+Share[:\s]+([$€£]?[\d,.]+)(?:\s*(?:USD|EUR|GBP))?/i,
      /EPS[:\s]+([$€£]?[\d,.]+)(?:\s*(?:USD|EUR|GBP))?/i,
    ],
    'Total Assets': [
      /Total\s+Assets[:\s]+([$€£]?[\d,.]+\s*(?:billion|million|thousand|[bmk])?)(?:\s*(?:USD|EUR|GBP))?/i,
      /Assets[:\s]+([$€£]?[\d,.]+\s*(?:billion|million|thousand|[bmk])?)(?:\s*(?:USD|EUR|GBP))?/i,
    ],
    'Total Liabilities': [
      /Total\s+Liabilities[:\s]+([$€£]?[\d,.]+\s*(?:billion|million|thousand|[bmk])?)(?:\s*(?:USD|EUR|GBP))?/i,
      /Liabilities[:\s]+([$€£]?[\d,.]+\s*(?:billion|million|thousand|[bmk])?)(?:\s*(?:USD|EUR|GBP))?/i,
    ],
    'Cash and Cash Equivalents': [
      /Cash\s+and\s+Cash\s+Equivalents[:\s]+([$€£]?[\d,.]+\s*(?:billion|million|thousand|[bmk])?)(?:\s*(?:USD|EUR|GBP))?/i,
      /Cash(?:\s+and\s+(?:cash\s+)?equivalents)?[:\s]+([$€£]?[\d,.]+\s*(?:billion|million|thousand|[bmk])?)(?:\s*(?:USD|EUR|GBP))?/i,
    ],
  };
  
  // Check all sections for financial metrics
  for (const section of sections) {
    if (section.content) {
      // Look for each metric in this section
      for (const [metricName, patterns] of Object.entries(metricPatterns)) {
        // Skip if we already found this metric
        if (metrics[metricName]) continue;
        
        // Try each pattern
        for (const pattern of patterns) {
          const match = section.content.match(pattern);
          if (match && match[1]) {
            metrics[metricName] = {
              value: match[1].trim(),
              source: section.title || 'Untitled Section',
            };
            break;
          }
        }
      }
      
      // Also check table sections specifically
      if (section.type === FilingSectionType.TABLE && section.tableData) {
        extractMetricsFromTable(section, metrics);
      }
    }
  }
  
  return metrics;
}

/**
 * Extract metrics from a table section
 * 
 * @param tableSection The table section
 * @param metrics The metrics object to populate
 */
function extractMetricsFromTable(
  tableSection: FilingSection,
  metrics: { [metric: string]: { value: string, source: string } }
): void {
  if (!tableSection.tableData || tableSection.tableData.length < 2) return;
  
  // Get column headers (first row)
  const headers = tableSection.tableData[0];
  
  // Look for value columns (typically years or periods)
  const valueColumnIndexes: number[] = [];
  
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i].toLowerCase();
    // Look for year or date patterns in headers
    if (/20\d{2}|(?:q\d|quarter|period)/.test(header)) {
      valueColumnIndexes.push(i);
    }
  }
  
  // If no value columns found, use the last column
  if (valueColumnIndexes.length === 0 && headers.length > 1) {
    valueColumnIndexes.push(headers.length - 1);
  }
  
  // Define patterns for common financial metrics
  const metricPatterns = {
    'Revenue': [
      /(?:Total\s+)?Revenues?(?:\s+and\s+Other\s+Income)?[:\s]+([$€£]?[\d,.]+\s*(?:billion|million|thousand|[bmk])?)(?:\s*(?:USD|EUR|GBP))?/i,
      /Revenue(?:s|)[:\s]+([$€£]?[\d,.]+\s*(?:billion|million|thousand|[bmk])?)(?:\s*(?:USD|EUR|GBP))?/i,
    ],
    'Net Income': [
      /Net\s+Income(?:\s+\(Loss\))?[:\s]+([$€£]?[\d,.]+\s*(?:billion|million|thousand|[bmk])?)(?:\s*(?:USD|EUR|GBP))?/i,
      /Net\s+Earnings[:\s]+([$€£]?[\d,.]+\s*(?:billion|million|thousand|[bmk])?)(?:\s*(?:USD|EUR|GBP))?/i,
    ],
    'Earnings Per Share': [
      /(?:Basic\s+)?Earnings\s+Per\s+Share[:\s]+([$€£]?[\d,.]+)(?:\s*(?:USD|EUR|GBP))?/i,
      /EPS[:\s]+([$€£]?[\d,.]+)(?:\s*(?:USD|EUR|GBP))?/i,
    ],
    'Total Assets': [
      /Total\s+Assets[:\s]+([$€£]?[\d,.]+\s*(?:billion|million|thousand|[bmk])?)(?:\s*(?:USD|EUR|GBP))?/i,
      /Assets[:\s]+([$€£]?[\d,.]+\s*(?:billion|million|thousand|[bmk])?)(?:\s*(?:USD|EUR|GBP))?/i,
    ],
    'Total Liabilities': [
      /Total\s+Liabilities[:\s]+([$€£]?[\d,.]+\s*(?:billion|million|thousand|[bmk])?)(?:\s*(?:USD|EUR|GBP))?/i,
      /Liabilities[:\s]+([$€£]?[\d,.]+\s*(?:billion|million|thousand|[bmk])?)(?:\s*(?:USD|EUR|GBP))?/i,
    ],
    'Cash and Cash Equivalents': [
      /Cash\s+and\s+Cash\s+Equivalents[:\s]+([$€£]?[\d,.]+\s*(?:billion|million|thousand|[bmk])?)(?:\s*(?:USD|EUR|GBP))?/i,
      /Cash(?:\s+and\s+(?:cash\s+)?equivalents)?[:\s]+([$€£]?[\d,.]+\s*(?:billion|million|thousand|[bmk])?)(?:\s*(?:USD|EUR|GBP))?/i,
    ],
  };
  
  // Process each row to look for metrics
  for (let i = 1; i < tableSection.tableData.length; i++) {
    const row = tableSection.tableData[i];
    if (row.length <= 1) continue;
    
    // Check first column for metric names
    const cellText = row[0].toLowerCase();
    
    // Look for common financial metrics in the row
    for (const [metricName, patterns] of Object.entries(metricPatterns)) {
      // Skip if we already found this metric
      if (metrics[metricName]) continue;
      
      // Check if this row contains the metric name
      const metricNameLower = metricName.toLowerCase();
      if (cellText.includes(metricNameLower)) {
        // Use the value from the first value column
        if (valueColumnIndexes.length > 0 && row[valueColumnIndexes[0]]) {
          metrics[metricName] = {
            value: row[valueColumnIndexes[0]].trim(),
            source: tableSection.title || 'Financial Table',
          };
        }
      }
    }
  }
} 