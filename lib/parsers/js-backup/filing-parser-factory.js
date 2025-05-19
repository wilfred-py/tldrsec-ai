/**
 * SEC Filing Parser Factory
 *
 * Provides factory functions for creating parsers for specific SEC filing types.
 */
import { Logger } from '@/lib/logging';
import { FilingTypeRegistry } from './filing-type-registry';
import { parseSECFiling } from './sec-filing-parser';
import { parsePDFFromBuffer } from './pdf-parser';
import { isXBRL, parseXBRLAsSECFiling } from './xbrl-parser';
// Create a logger for the factory
const logger = new Logger({}, 'filing-parser-factory');
// Get default options from sec-filing-parser.ts
const DEFAULT_OPTIONS = {
    extractImportantSections: true,
    includeFullText: false,
    maxFullTextLength: 500000,
    includeRawHtml: false,
    maxSectionLength: 100000,
    preserveWhitespace: false,
    extractTables: true,
    extractLists: true,
    removeBoilerplate: true,
    enableChunking: false,
    chunkOptions: {
        maxChunkSize: 4000,
        chunkOverlap: 500,
        respectSemanticBoundaries: true
    }
};
/**
 * Creates a parser function for a specific filing type
 *
 * @param filingType The type of filing to create a parser for
 * @returns A function that parses HTML content into a structured SEC filing
 * @throws Error if the filing type is not supported
 */
export function createFilingParser(filingType) {
    // Check if the filing type is supported
    if (!FilingTypeRegistry.isSupported(filingType)) {
        throw new Error(`Unsupported filing type: ${filingType}`);
    }
    // Get the configuration for this filing type
    const config = FilingTypeRegistry.getSectionConfig(filingType);
    // Use custom parser if provided
    if (config === null || config === void 0 ? void 0 : config.customParser) {
        logger.debug(`Using custom parser for filing type: ${filingType}`);
        return config.customParser;
    }
    // Return a function that uses the generic parseSECFiling with type-specific options
    return (html, options) => {
        logger.debug(`Parsing ${filingType} filing`);
        const mergedOptions = Object.assign(Object.assign(Object.assign({}, DEFAULT_OPTIONS), config === null || config === void 0 ? void 0 : config.parserOptions), options);
        return parseSECFiling(html, filingType, mergedOptions);
    };
}
/**
 * Detects if the content is a PDF file
 *
 * @param content The content to analyze
 * @returns True if content appears to be a PDF file, false otherwise
 */
export function isPDF(content) {
    // Check for PDF signature at the beginning of the file
    if (Buffer.isBuffer(content)) {
        return content.length >= 5 && content.slice(0, 5).toString() === '%PDF-';
    }
    else {
        return content.startsWith('%PDF-');
    }
}
/**
 * Detects the filing type from content
 *
 * @param content The content to analyze
 * @returns The detected filing type or null if not detected
 */
export function detectFilingType(content) {
    // Check if this is a PDF file - if so, we won't be able to detect by HTML patterns
    if (isPDF(content)) {
        logger.debug('Content appears to be a PDF file');
        return 'PDF'; // Return a special type to indicate PDF
    }
    // Check if this is an XBRL file
    if (isXBRL(content)) {
        logger.debug('Content appears to be an XBRL file');
        return 'XBRL'; // Return a special type to indicate XBRL
    }
    // Extract HTML sample for pattern detection
    const html = Buffer.isBuffer(content)
        ? content.toString('utf8', 0, 2000)
        : content.substring(0, 2000);
    // Simple regex-based detection from title or content
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';
    // Check for common patterns in the title
    if (/Form 10-K|Annual Report|10-K/i.test(title))
        return '10-K';
    if (/Form 10-Q|Quarterly Report|10-Q/i.test(title))
        return '10-Q';
    if (/Form 8-K|Current Report|8-K/i.test(title))
        return '8-K';
    if (/Form 4|Statement of Changes|beneficial ownership/i.test(title))
        return 'Form4';
    if (/DEFA14A|DEFA 14A|Additional Proxy Materials|Additional Proxy Soliciting/i.test(title))
        return 'DEFA14A';
    if (/Schedule 13D|SC 13D|beneficial ownership report/i.test(title))
        return 'SC 13D';
    if (/Form 144|Notice of Proposed Sale/i.test(title))
        return '144';
    // Check content if title doesn't provide clear indication
    if (/Form 10-K/i.test(html))
        return '10-K';
    if (/Form 10-Q/i.test(html))
        return '10-Q';
    if (/Form 8-K/i.test(html))
        return '8-K';
    if (/DEFA14A|DEFA 14A|Additional Proxy Materials/i.test(html))
        return 'DEFA14A';
    // No recognized pattern found
    return null;
}
/**
 * Creates a parser for a filing based on its detected type
 *
 * @param content The content to parse (HTML/XBRL string or PDF buffer)
 * @param options Parser options to apply
 * @returns The parsed SEC filing
 * @throws Error if the filing type cannot be detected or is not supported
 */
export async function createAutoParser(content, options) {
    // Handle Buffer input for detection
    const contentSample = Buffer.isBuffer(content) ? content.toString('utf8', 0, 1000) : content.substring(0, 1000);
    // Try to detect the filing type
    const detectedType = detectFilingType(contentSample);
    if (!detectedType) {
        logger.warn('Could not detect filing type from content');
        throw new Error('Unable to determine SEC filing type from content');
    }
    logger.debug(`Auto-detected filing type: ${detectedType}`);
    // Check if this is a PDF file
    if (detectedType === 'PDF') {
        // Make sure content is a Buffer for PDF parsing
        if (!Buffer.isBuffer(content)) {
            content = Buffer.from(content);
        }
        // Parse the PDF
        return await parsePDFAsSECFiling(content, options);
    }
    // Check if this is an XBRL file
    if (detectedType === 'XBRL') {
        // Make sure content is a Buffer for XBRL parsing
        if (!Buffer.isBuffer(content)) {
            content = Buffer.from(content);
        }
        // Parse the XBRL
        return await parseXBRLAsSECFiling(content, options);
    }
    // For HTML files, create and use the appropriate parser
    const parser = createFilingParser(detectedType);
    return parser(Buffer.isBuffer(content) ? content.toString('utf8') : content, options);
}
/**
 * Parse a PDF file and convert the results to a ParsedSECFiling structure
 *
 * @param buffer The PDF buffer content
 * @param options Parser options
 * @returns A ParsedSECFiling object
 */
async function parsePDFAsSECFiling(buffer, options) {
    try {
        logger.debug('Parsing PDF as SEC filing');
        // Parse the PDF file
        const sections = await parsePDFFromBuffer(buffer, Object.assign(Object.assign({}, DEFAULT_OPTIONS), options));
        // Find metadata
        const metadataSection = sections.find(section => section.type === 'section' && section.title === 'Metadata');
        // Extract important sections based on headings
        const importantSections = {};
        // Look for common important sections in SEC filings
        const sectionNames = [
            'Management\'s Discussion and Analysis',
            'Risk Factors',
            'Financial Statements',
            'Notes to Financial Statements',
            'Controls and Procedures',
            'Quantitative and Qualitative Disclosures',
            'Business',
            'Item 1.',
            'Item 1A.',
            'Item 7.',
            'Item 8.',
        ];
        // Find sections that match important section names
        for (const section of sections) {
            if (section.title) {
                for (const sectionName of sectionNames) {
                    if (section.title.includes(sectionName)) {
                        importantSections[sectionName] = section.content;
                        break;
                    }
                }
            }
        }
        // Extract tables
        const tables = sections.filter(section => section.type === 'table');
        // Create a ParsedSECFiling object
        const result = {
            filingType: 'PDF',
            importantSections,
            sections,
            tables,
            lists: sections.filter(section => section.type === 'list'),
        };
        // Add metadata if available
        if (metadataSection && metadataSection.metadata) {
            // Create a proper SECFilingMetadata object
            const metadata = Object.assign({ filingType: 'PDF' }, metadataSection.metadata);
            // Add metadata to result
            result.metadata = metadata;
            // Extract company name if available
            if (metadataSection.metadata.Author) {
                result.companyName = metadataSection.metadata.Author;
            }
            // Extract filing date if available
            if (metadataSection.metadata.CreationDate) {
                try {
                    // Parse PDF date format (typically like "D:20201231120000+00'00'")
                    const dateString = metadataSection.metadata.CreationDate;
                    if (dateString.startsWith('D:')) {
                        const year = parseInt(dateString.substring(2, 6));
                        const month = parseInt(dateString.substring(6, 8)) - 1;
                        const day = parseInt(dateString.substring(8, 10));
                        result.filingDate = new Date(year, month, day);
                    }
                }
                catch (error) {
                    logger.error('Error parsing PDF creation date:', error);
                }
            }
        }
        return result;
    }
    catch (error) {
        logger.error('Error parsing PDF as SEC filing:', error);
        throw new Error(`Failed to parse PDF as SEC filing: ${error}`);
    }
}
/**
 * Creates a parser for a filing based on its detected type and with chunking support
 *
 * @param content The content to parse (HTML/XBRL string or PDF buffer)
 * @param options Parser options to apply
 * @param enableChunking Whether to enable document chunking
 * @returns The parsed SEC filing
 * @throws Error if the filing type cannot be detected or is not supported
 */
export async function createAutoParserWithChunking(content, options, enableChunking = false) {
    // Build options with chunking enabled if requested
    const chunkingOptions = Object.assign(Object.assign({}, options), { enableChunking, 
        // If custom chunk options weren't provided, use defaults
        chunkOptions: (options === null || options === void 0 ? void 0 : options.chunkOptions) || DEFAULT_OPTIONS.chunkOptions });
    // Use the standard auto parser with chunking options
    return createAutoParser(content, chunkingOptions);
}
