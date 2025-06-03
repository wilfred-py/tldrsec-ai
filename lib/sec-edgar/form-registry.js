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
  '10-K': {
    name: 'Annual Report',
    description: 'Comprehensive report of a company\'s performance submitted annually to the SEC',
    parsingStrategy: 'detailed',
    importantSections: ['Business', 'Risk Factors', 'MD&A', 'Financial Statements'],
    isFinancial: true,
    hasXBRL: true
  },
  '10-Q': {
    name: 'Quarterly Report',
    description: 'Quarterly report of a company\'s performance submitted to the SEC',
    parsingStrategy: 'detailed',
    importantSections: ['MD&A', 'Financial Statements'],
    isFinancial: true,
    hasXBRL: true
  },
  '8-K': {
    name: 'Current Report',
    description: 'Report of unscheduled material events or corporate changes',
    parsingStrategy: 'standard',
    importantSections: ['Item1.01', 'Item2.01', 'Item5.02', 'Item7.01', 'Item8.01', 'Item9.01'],
    isFinancial: false,
    hasXBRL: false
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
    description: 'Annual report for Canadian companies',
    parsingStrategy: 'detailed',
    importantSections: ['Business', 'Risk Factors', 'MD&A', 'Financial Statements'],
    isFinancial: true,
    hasXBRL: true
  },
  'DEF 14A': {
    name: 'Proxy Statement',
    description: 'Definitive proxy statement for shareholder meetings',
    parsingStrategy: 'standard',
    importantSections: ['Proposal', 'Executive Compensation', 'Corporate Governance'],
    isFinancial: false,
    hasXBRL: false
  },
  'Form4': {
    name: 'Statement of Changes in Beneficial Ownership',
    description: 'Reports insider trading transactions',
    parsingStrategy: 'simple',
    importantSections: ['Transaction'],
    isFinancial: false,
    hasXBRL: false
  },
  '4': {
    name: 'Statement of Changes in Beneficial Ownership',
    description: 'Reports insider trading transactions',
    parsingStrategy: 'simple',
    importantSections: ['Transaction'],
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

export default {
  getFormMetadata,
  getSupportedFilingTypes,
  isFilingTypeSupported,
  getParsingStrategy
};
