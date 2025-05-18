/**
 * 10-Q Filing Type Definition
 * 
 * Registers the 10-Q (Quarterly Report) filing type with the filing type registry.
 */

import { FilingTypeRegistry, FilingSectionConfig } from '../filing-type-registry';

// Configuration for 10-Q filings
const config: FilingSectionConfig = {
  importantSections: [
    'Management\'s Discussion and Analysis',
    'Risk Factors',
    'Financial Statements',
    'Notes to Financial Statements',
    'Controls and Procedures',
    'Quantitative and Qualitative Disclosures about Market Risk',
  ],
  parserOptions: {
    extractTables: true,
    maxSectionLength: 75000,
    preserveWhitespace: false,
  },
  description: 'Quarterly report providing ongoing view of a company\'s financial position'
};

// Register the 10-Q filing type
FilingTypeRegistry.register('10-Q', config);

// Export the configuration for reference
export default config; 