/**
 * SC 13D Filing Type Definition
 *
 * Registers the SC 13D (Schedule 13D - Beneficial Ownership Report) filing type with the filing type registry.
 */
import { FilingTypeRegistry } from '../filing-type-registry';
// Configuration for SC 13D filings
const config = {
    importantSections: [
        'Item 1. Security and Issuer',
        'Item 2. Identity and Background',
        'Item 3. Source and Amount of Funds',
        'Item 4. Purpose of Transaction',
        'Item 5. Interest in Securities',
        'Item 6. Contracts, Arrangements, Understandings',
        'Item 7. Material to be Filed as Exhibits',
    ],
    parserOptions: {
        extractTables: true,
        maxSectionLength: 50000,
        preserveWhitespace: false,
    },
    description: 'Filed when an entity acquires more than 5% of voting class of a company\'s securities'
};
// Register both formats
FilingTypeRegistry.register('SC 13D', config);
FilingTypeRegistry.register('SC13D', config);
// Export the configuration for reference
export default config;
