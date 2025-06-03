/**
 * SEC EDGAR Form Registry
 * 
 * This module provides metadata and utilities for working with different
 * SEC filing types (10-K, 10-Q, 8-K, etc.)
 */

/**
 * Form type metadata interface
 * @typedef {Object} FormTypeMetadata
 * @property {string} name - Human-readable name of the form
 * @property {string} description - Description of the form's purpose
 * @property {string} parsingStrategy - Strategy to use for parsing ('detailed', 'standard', 'simple')
 * @property {string[]} importantSections - Array of important section names for this form type
 * @property {boolean} isFinancial - Whether this is a financial report
 * @property {boolean} hasXBRL - Whether this form typically contains XBRL data
 */

/**
 * Registry of SEC form types and their metadata
 * @type {Object.<string, FormTypeMetadata>}
 */
const formRegistry = {
  // Annual Reports
  '10-K': {
    name: 'Annual Report',
    description: 'Comprehensive report of a company\'s performance submitted annually to the SEC',
    parsingStrategy: 'detailed',
    importantSections: ['Business', 'Risk Factors', 'MD&A', 'Financial Statements'],
    documentTypePatterns: [
      /^\s*(form|form:)\s*10-k\b/im,
      /annual\s+report\s+pursuant\s+to\s+section\s+13\s+or\s+15\(d\)/im
    ],
    isFinancial: true,
    hasXBRL: true
  },
  '10-K/A': {
    name: 'Annual Report Amendment',
    description: 'Amendment to a previously filed 10-K annual report',
    parsingStrategy: 'detailed',
    importantSections: ['Business', 'Risk Factors', 'MD&A', 'Financial Statements'],
    isFinancial: true,
    hasXBRL: true
  },
  '20-F': {
    name: 'Annual Report (Foreign)',
    description: 'Annual report for foreign private issuers',
    parsingStrategy: 'detailed',
    importantSections: ['Business', 'Risk Factors', 'MD&A', 'Financial Statements'],
    isFinancial: true,
    hasXBRL: true
  },
  '40-F': {
    name: 'Annual Report (Canadian)',
    description: 'Annual report for Canadian companies registered with the SEC',
    parsingStrategy: 'detailed',
    importantSections: ['Business', 'Risk Factors', 'MD&A', 'Financial Statements'],
    isFinancial: true,
    hasXBRL: true
  },
  'N-CSR': {
    name: 'Investment Company Annual Report',
    description: 'Annual report for registered investment companies',
    parsingStrategy: 'standard',
    importantSections: ['Financial Statements', 'Portfolio Holdings'],
    isFinancial: true,
    hasXBRL: false
  },
  'N-CSRS': {
    name: 'Investment Company Semi-Annual Report',
    description: 'Semi-annual report for registered investment companies',
    parsingStrategy: 'standard',
    importantSections: ['Financial Statements', 'Portfolio Holdings'],
    isFinancial: true,
    hasXBRL: false
  },

  // Quarterly Reports
  '10-Q': {
    name: 'Quarterly Report',
    description: 'Quarterly report of a company\'s performance submitted to the SEC',
    parsingStrategy: 'detailed',
    importantSections: ['MD&A', 'Financial Statements'],
    documentTypePatterns: [
      /^\s*(form|form:)\s*10-q\b/im,
      /quarterly\s+report\s+pursuant\s+to\s+section\s+13\s+or\s+15\(d\)/im
    ],
    isFinancial: true,
    hasXBRL: true
  },
  '10-Q/A': {
    name: 'Quarterly Report Amendment',
    description: 'Amendment to a previously filed 10-Q quarterly report',
    parsingStrategy: 'detailed',
    importantSections: ['MD&A', 'Financial Statements'],
    isFinancial: true,
    hasXBRL: true
  },
  '6-K': {
    name: 'Foreign Issuer Current Report',
    description: 'Current report for foreign private issuers',
    parsingStrategy: 'standard',
    importantSections: ['Financial Statements', 'Press Releases'],
    isFinancial: true,
    hasXBRL: false
  },

  // Current Reports
  '8-K': {
    name: 'Current Report',
    description: 'Report of unscheduled material events or corporate changes',
    parsingStrategy: 'standard',
    importantSections: ['Item1.01', 'Item2.01', 'Item5.02', 'Item7.01', 'Item8.01', 'Item9.01'],
    documentTypePatterns: [
      /^\s*(form|form:)\s*8-k\b/im,
      /current\s+report\s+pursuant\s+to\s+section\s+13\s+or\s+15\(d\)/im
    ],
    isFinancial: false,
    hasXBRL: false
  },

  // Insider Trading Forms
  'Form4': {
    name: 'Statement of Changes in Beneficial Ownership',
    description: 'Report of changes in ownership of securities by company insiders',
    parsingStrategy: 'simple',
    importantSections: ['Transaction'],
    isFinancial: false,
    hasXBRL: false
  },
  '4': {
    name: 'Statement of Changes in Beneficial Ownership',
    description: 'Report of changes in ownership of securities by company insiders',
    parsingStrategy: 'simple',
    importantSections: ['Transaction'],
    isFinancial: false,
    hasXBRL: false
  },
  'Form3': {
    name: 'Initial Statement of Beneficial Ownership',
    description: 'Initial filing of ownership by company insiders',
    parsingStrategy: 'simple',
    importantSections: ['Holdings'],
    isFinancial: false,
    hasXBRL: false
  },
  '3': {
    name: 'Initial Statement of Beneficial Ownership',
    description: 'Initial filing of ownership by company insiders',
    parsingStrategy: 'simple',
    importantSections: ['Holdings'],
    isFinancial: false,
    hasXBRL: false
  },
  'Form5': {
    name: 'Annual Statement of Beneficial Ownership',
    description: 'Annual filing of ownership changes by company insiders',
    parsingStrategy: 'simple',
    importantSections: ['Transaction'],
    isFinancial: false,
    hasXBRL: false
  },
  '5': {
    name: 'Annual Statement of Beneficial Ownership',
    description: 'Annual filing of ownership changes by company insiders',
    parsingStrategy: 'simple',
    importantSections: ['Transaction'],
    isFinancial: false,
    hasXBRL: false
  },
  '144': {
    name: 'Notice of Proposed Sale of Securities',
    description: 'Notice of proposed sale of restricted securities',
    parsingStrategy: 'simple',
    importantSections: ['Transaction'],
    isFinancial: false,
    hasXBRL: false
  },

  // Beneficial Ownership Reports
  'SC 13D': {
    name: 'Beneficial Ownership Report',
    description: 'Filed when a person or group acquires more than 5% of a voting class of a company\'s equity securities',
    parsingStrategy: 'standard',
    importantSections: ['Purpose of Transaction', 'Ownership'],
    isFinancial: false,
    hasXBRL: false
  },
  'SC 13G': {
    name: 'Simplified Beneficial Ownership Report',
    description: 'Short-form beneficial ownership report for passive investors',
    parsingStrategy: 'standard',
    importantSections: ['Ownership'],
    isFinancial: false,
    hasXBRL: false
  },
  '13F': {
    name: 'Institutional Investment Manager Holdings Report',
    description: 'Report of equity holdings by institutional investment managers',
    parsingStrategy: 'simple',
    importantSections: ['Holdings'],
    isFinancial: false,
    hasXBRL: false
  },

  // Proxy Materials
  'DEFA14A': {
    name: 'Additional Definitive Proxy Materials',
    description: 'Additional definitive proxy materials',
    parsingStrategy: 'standard',
    importantSections: ['Proposal'],
    isFinancial: false,
    hasXBRL: false
  },
  'DEF 14A': {
    name: 'Definitive Proxy Statement',
    description: 'Definitive proxy statement for shareholder meetings',
    parsingStrategy: 'standard',
    importantSections: ['Proposal', 'Executive Compensation', 'Corporate Governance'],
    isFinancial: false,
    hasXBRL: false
  },
  'DEFM14A': {
    name: 'Definitive Merger Proxy',
    description: 'Definitive proxy statement relating to merger or acquisition',
    parsingStrategy: 'standard',
    importantSections: ['Merger Terms', 'Risk Factors'],
    isFinancial: false,
    hasXBRL: false
  },

  // Registration Statements
  'S-1': {
    name: 'Registration Statement',
    description: 'Initial registration statement for new securities',
    parsingStrategy: 'detailed',
    importantSections: ['Business', 'Risk Factors', 'Use of Proceeds', 'Financial Statements'],
    isFinancial: true,
    hasXBRL: true
  },
  'S-3': {
    name: 'Simplified Registration Statement',
    description: 'Simplified registration statement for well-known seasoned issuers',
    parsingStrategy: 'detailed',
    importantSections: ['Risk Factors', 'Use of Proceeds'],
    isFinancial: true,
    hasXBRL: true
  },
  'S-4': {
    name: 'Business Combinations Registration',
    description: 'Registration statement for business combinations',
    parsingStrategy: 'detailed',
    importantSections: ['Transaction', 'Risk Factors'],
    isFinancial: true,
    hasXBRL: true
  },
  'F-1': {
    name: 'Foreign Issuer Registration Statement',
    description: 'Registration statement for foreign issuers',
    parsingStrategy: 'detailed',
    importantSections: ['Business', 'Risk Factors', 'Use of Proceeds', 'Financial Statements'],
    isFinancial: true,
    hasXBRL: true
  },
  'F-3': {
    name: 'Foreign Issuer Simplified Registration',
    description: 'Simplified registration statement for foreign issuers',
    parsingStrategy: 'detailed',
    importantSections: ['Risk Factors', 'Use of Proceeds'],
    isFinancial: true,
    hasXBRL: true
  },
  'F-4': {
    name: 'Foreign Issuer Business Combinations',
    description: 'Registration statement for foreign issuer business combinations',
    parsingStrategy: 'detailed',
    importantSections: ['Transaction', 'Risk Factors'],
    isFinancial: true,
    hasXBRL: true
  },
  'N-2': {
    name: 'Investment Company Registration',
    description: 'Registration statement for closed-end management investment companies',
    parsingStrategy: 'standard',
    importantSections: ['Investment Objectives', 'Risk Factors', 'Fees and Expenses'],
    isFinancial: true,
    hasXBRL: false
  },
  'N-MFP': {
    name: 'Money Market Fund Portfolio Holdings',
    description: 'Monthly schedule of portfolio holdings of money market funds',
    parsingStrategy: 'simple',
    importantSections: ['Holdings'],
    isFinancial: true,
    hasXBRL: false
  },

  // Other Forms
  'ARS': {
    name: 'Annual Report to Shareholders',
    description: 'Annual report to shareholders',
    parsingStrategy: 'standard',
    importantSections: ['Letter to Shareholders', 'Business', 'Financial Statements'],
    isFinancial: true,
    hasXBRL: false
  },
  'SD': {
    name: 'Specialized Disclosure Report',
    description: 'Specialized disclosure report (e.g., conflict minerals)',
    parsingStrategy: 'simple',
    importantSections: ['Disclosure'],
    isFinancial: false,
    hasXBRL: false
  },
  'D': {
    name: 'Notice of Exempt Offering of Securities',
    description: 'Notice of an exempt offering of securities',
    parsingStrategy: 'simple',
    importantSections: ['Offering'],
    isFinancial: false,
    hasXBRL: false
  },
  'POS AM': {
    name: 'Post-Effective Amendment to Registration Statement',
    description: 'Post-effective amendment to a registration statement',
    parsingStrategy: 'standard',
    importantSections: ['Amendment'],
    isFinancial: false,
    hasXBRL: false
  },
  '424B2': {
    name: 'Prospectus Filing',
    description: 'Prospectus filed pursuant to Rule 424(b)(2)',
    parsingStrategy: 'standard',
    importantSections: ['Offering', 'Risk Factors'],
    isFinancial: false,
    hasXBRL: false
  },
  '424B3': {
    name: 'Prospectus Filing',
    description: 'Prospectus filed pursuant to Rule 424(b)(3)',
    parsingStrategy: 'standard',
    importantSections: ['Offering', 'Risk Factors'],
    isFinancial: false,
    hasXBRL: false
  },
  '424B5': {
    name: 'Prospectus Filing',
    description: 'Prospectus filed pursuant to Rule 424(b)(5)',
    parsingStrategy: 'standard',
    importantSections: ['Offering', 'Risk Factors'],
    isFinancial: false,
    hasXBRL: false
  },
  '497': {
    name: 'Investment Company Filings',
    description: 'Definitive materials filed under Rule 497',
    parsingStrategy: 'simple',
    importantSections: ['Offering'],
    isFinancial: true,
    hasXBRL: false
  },
  'FWP': {
    name: 'Free Writing Prospectus',
    description: 'Free writing prospectus',
    parsingStrategy: 'standard',
    importantSections: ['Offering', 'Risk Factors'],
    isFinancial: false,
    hasXBRL: false
  }
};

/**
 * Get metadata for a specific filing type
 * @param {string} filingType - The filing type code (e.g., '10-K', '10-Q')
 * @returns {FormTypeMetadata|null} Metadata for the filing type or null if not found
 */
export function getFormMetadata(filingType) {
  if (!filingType) return null;
  
  // Try direct lookup
  if (formRegistry[filingType]) {
    return formRegistry[filingType];
  }
  
  // Try case-insensitive lookup
  const upperFilingType = filingType.toUpperCase();
  for (const [key, value] of Object.entries(formRegistry)) {
    if (key.toUpperCase() === upperFilingType) {
      return value;
    }
  }
  
  // Try partial match (e.g., '10K' should match '10-K')
  for (const [key, value] of Object.entries(formRegistry)) {
    if (key.replace('-', '').toUpperCase() === upperFilingType.replace('-', '')) {
      return value;
    }
  }
  
  return null;
}

/**
 * Get a list of all supported filing types
 * @returns {string[]} Array of supported filing type codes
 */
export function getSupportedFilingTypes() {
  return Object.keys(formRegistry);
}

/**
 * Check if a filing type is supported
 * @param {string} filingType - The filing type to check
 * @returns {boolean} True if the filing type is supported
 */
export function isFilingTypeSupported(filingType) {
  return getFormMetadata(filingType) !== null;
}

/**
 * Get the parsing strategy for a filing type
 * @param {string} filingType - The filing type
 * @returns {string} The parsing strategy ('detailed', 'standard', 'simple', or 'generic' if not found)
 */
export function getParsingStrategy(filingType) {
  const metadata = getFormMetadata(filingType);
  return metadata ? metadata.parsingStrategy : 'generic';
}

/**
 * Get all forms in a specific category
 * @param {string} category - The category to filter by ('annual', 'quarterly', 'current', etc.)
 * @returns {Array} Array of form metadata in the specified category
 */
export function getFormsByCategory(category) {
  return Object.values(formRegistry).filter(form => {
    // Map the existing form metadata to categories based on form type
    let derivedCategory = 'other';
    
    if (['10-K', '10-K/A', '20-F', '40-F', 'N-CSR', 'N-CSRS'].includes(form.name)) {
      derivedCategory = 'annual';
    } else if (['10-Q', '10-Q/A', '6-K'].includes(form.name)) {
      derivedCategory = 'quarterly';
    } else if (['8-K'].includes(form.name)) {
      derivedCategory = 'current';
    } else if (['Form4', '4', 'Form3', '3', 'Form5', '5', '144'].includes(form.name)) {
      derivedCategory = 'insider';
    } else if (['SC 13D', 'SC 13G', '13F'].includes(form.name)) {
      derivedCategory = 'beneficial';
    } else if (['S-1', 'S-3', 'S-4', 'F-1', 'F-3', 'F-4', 'N-2', 'POS AM', '424B2', '424B3', '424B5', 'FWP'].includes(form.name)) {
      derivedCategory = 'registration';
    } else if (['DEFA14A', 'DEF 14A', 'DEFM14A'].includes(form.name)) {
      derivedCategory = 'proxy';
    }
    
    return derivedCategory === category;
  });
}

/**
 * Get all high importance forms
 * @returns {Array} Array of high importance form metadata
 */
export function getHighImportanceForms() {
  // Define high importance forms
  const highImportanceForms = ['10-K', '10-Q', '8-K', 'S-1', 'DEF 14A', 'Form4', '4'];
  return Object.entries(formRegistry)
    .filter(([key]) => highImportanceForms.includes(key))
    .map(([_, value]) => value);
}

/**
 * Get all forms that use a specific parsing strategy
 * @param {string} strategy - The parsing strategy to filter by ('detailed', 'standard', 'simple')
 * @returns {Array} Array of form metadata using the specified parsing strategy
 */
export function getFormsByParsingStrategy(strategy) {
  return Object.values(formRegistry).filter(form => form.parsingStrategy === strategy);
}

/**
 * Get all forms that are financial reports
 * @returns {Array} Array of form metadata for financial reports
 */
export function getFinancialReportForms() {
  return Object.values(formRegistry).filter(form => form.isFinancial === true);
}

/**
 * Get all forms that typically contain XBRL data
 * @returns {Array} Array of form metadata for forms with XBRL data
 */
export function getFormsWithXBRL() {
  return Object.values(formRegistry).filter(form => form.hasXBRL === true);
}

export default formRegistry;
