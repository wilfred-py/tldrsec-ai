/**
 * 8-K Filing Type Definition
 *
 * Registers the 8-K (Current Report) filing type with the filing type registry.
 */
import { FilingTypeRegistry } from '../filing-type-registry';
// Configuration for 8-K filings
const config = {
    importantSections: [
        'Item 1.01', // Entry into a Material Definitive Agreement
        'Item 2.01', // Completion of Acquisition or Disposition of Assets
        'Item 5.02', // Departure of Directors or Certain Officers
        'Item 7.01', // Regulation FD Disclosure
        'Item 8.01', // Other Events
        'Item 9.01', // Financial Statements and Exhibits
    ],
    parserOptions: {
        extractTables: true,
        maxSectionLength: 50000,
        preserveWhitespace: false,
    },
    description: 'Current report disclosing material events that shareholders should know about'
};
// Register the 8-K filing type
FilingTypeRegistry.register('8-K', config);
// Export the configuration for reference
export default config;
