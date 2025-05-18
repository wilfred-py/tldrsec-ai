"use strict";
/**
 * 10-Q Filing Type Definition
 *
 * Registers the 10-Q (Quarterly Report) filing type with the filing type registry.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const filing_type_registry_1 = require("../filing-type-registry");
// Configuration for 10-Q filings
const config = {
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
filing_type_registry_1.FilingTypeRegistry.register('10-Q', config);
// Export the configuration for reference
exports.default = config;
