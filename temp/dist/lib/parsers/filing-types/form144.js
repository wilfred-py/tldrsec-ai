"use strict";
/**
 * Form 144 Filing Type Definition
 *
 * Registers the Form 144 (Notice of Proposed Sale of Securities) filing type with the filing type registry.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const filing_type_registry_1 = require("../filing-type-registry");
// Configuration for Form 144 filings
const config = {
    importantSections: [
        'Issuer Information',
        'Security Information',
        'Person for whose Account the Securities are to be Sold',
        'Broker Information',
        'Proposed Sale Information',
    ],
    parserOptions: {
        extractTables: true,
        maxSectionLength: 25000,
        preserveWhitespace: false,
    },
    description: 'Notice of proposed sale of restricted securities by affiliates'
};
// Register both formats
filing_type_registry_1.FilingTypeRegistry.register('144', config);
filing_type_registry_1.FilingTypeRegistry.register('Form 144', config);
// Export the configuration for reference
exports.default = config;
