"use strict";
/**
 * Form 4 Filing Type Definition
 *
 * Registers the Form 4 (Statement of Changes in Beneficial Ownership)
 * filing type with the filing type registry.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const filing_type_registry_1 = require("../filing-type-registry");
// Configuration for Form 4 filings
const config = {
    importantSections: [
        'Table I', // Non-Derivative Securities Acquired, Disposed of, or Beneficially Owned
        'Table II', // Derivative Securities Acquired, Disposed of, or Beneficially Owned
        'Reporting Owner',
        'Transactions',
    ],
    parserOptions: {
        extractTables: true,
        maxSectionLength: 25000,
        preserveWhitespace: false,
    },
    description: 'Statement of changes in beneficial ownership of securities by insiders'
};
// Register both 'Form4' and '4' identifiers for the same filing type
filing_type_registry_1.FilingTypeRegistry.register('Form4', config);
filing_type_registry_1.FilingTypeRegistry.register('4', config);
// Export the configuration for reference
exports.default = config;
