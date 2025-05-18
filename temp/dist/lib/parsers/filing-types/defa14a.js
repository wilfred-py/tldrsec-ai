"use strict";
/**
 * DEFA14A Filing Type Definition
 *
 * Registers the DEFA14A (Additional Proxy Soliciting Materials) filing type with the filing type registry.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const filing_type_registry_1 = require("../filing-type-registry");
// Configuration for DEFA14A filings
const config = {
    importantSections: [
        'Additional Information',
        'Supplemental Information',
        'Forward-Looking Statements',
        'Voting Instructions',
        'Presentation Materials',
        'Important Information',
    ],
    parserOptions: {
        extractTables: true,
        maxSectionLength: 60000,
        preserveWhitespace: false,
    },
    description: 'Additional proxy soliciting materials that are provided to shareholders regarding a matter to be voted on'
};
// Register both formats
filing_type_registry_1.FilingTypeRegistry.register('DEFA14A', config);
filing_type_registry_1.FilingTypeRegistry.register('DEFA 14A', config);
// Export the configuration for reference
exports.default = config;
