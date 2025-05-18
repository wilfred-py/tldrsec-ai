/**
 * DEFA14A Filing Type Definition
 *
 * Registers the DEFA14A (Additional Proxy Soliciting Materials) filing type with the filing type registry.
 */
import { FilingTypeRegistry } from '../filing-type-registry';
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
FilingTypeRegistry.register('DEFA14A', config);
FilingTypeRegistry.register('DEFA 14A', config);
// Export the configuration for reference
export default config;
