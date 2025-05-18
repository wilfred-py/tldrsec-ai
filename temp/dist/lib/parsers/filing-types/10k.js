"use strict";
/**
 * 10-K Filing Type Definition
 *
 * Registers the 10-K (Annual Report) filing type with the filing type registry.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const filing_type_registry_1 = require("../filing-type-registry");
// Configuration for 10-K filings
const config = {
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
filing_type_registry_1.FilingTypeRegistry.register('10-K', config);
// Export the configuration for reference
exports.default = config;
