/**
 * 10-K Filing Type Definition
 * 
 * Registers the 10-K (Annual Report) filing type with the filing type registry.
 */

import { FilingTypeRegistry, FilingSectionConfig } from '../filing-type-registry';

// Configuration for 10-K filings
const config: FilingSectionConfig = {
  importantSections: [
    'Management\'s Discussion and Analysis',
    'Risk Factors',
    'Financial Statements',
    'Notes to Financial Statements',
    'Controls and Procedures',
    'Quantitative and Qualitative Disclosures about Market Risk',
    'Executive Compensation',
    'Business'
  ],
  parserOptions: {
    extractTables: true,
    maxSectionLength: 100000,
    preserveWhitespace: false,
  },
  description: 'Annual report providing a comprehensive overview of a company\'s business and financial condition'
};

// Register the 10-K filing type
FilingTypeRegistry.register('10-K', config);

// Export the configuration for reference
export default config; 