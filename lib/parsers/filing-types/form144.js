/**
 * Form 144 Filing Type Definition
 *
 * Registers the Form 144 (Notice of Proposed Sale of Securities) filing type with the filing type registry.
 */
import { FilingTypeRegistry } from '../filing-type-registry';
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
FilingTypeRegistry.register('144', config);
FilingTypeRegistry.register('Form 144', config);
// Export the configuration for reference
export default config;
