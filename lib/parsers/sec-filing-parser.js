/**
 * SEC Filing Parser
 *
 * This module provides specialized parsing functions for different types of SEC filings
 * (10-K, 10-Q, 8-K, etc.) building on top of the base HTML parser.
 */
import { parseHTML, parseHTMLFromUrl, FilingSectionType } from './html-parser';
import { chunkParsedFiling } from './chunk-manager';
import { Logger } from '@/lib/logging';
// Create a logger for the SEC filing parser
const logger = new Logger({}, 'sec-filing-parser');
// Important section names in SEC filings
const SEC_FILING_SECTIONS = {
    '10-K': [
        'Management\'s Discussion and Analysis',
        'Risk Factors',
        'Financial Statements',
        'Notes to Financial Statements',
        'Controls and Procedures',
        'Quantitative and Qualitative Disclosures about Market Risk',
        'Executive Compensation',
        'Business'
    ],
    '10-Q': [
        'Management\'s Discussion and Analysis',
        'Risk Factors',
        'Financial Statements',
        'Notes to Financial Statements',
        'Controls and Procedures',
        'Quantitative and Qualitative Disclosures about Market Risk',
    ],
    '8-K': [
        'Item 1.01',
        'Item 2.01',
        'Item 5.02',
        'Item 7.01',
        'Item 8.01',
        'Item 9.01',
    ],
    'Form4': [
        'Table I',
        'Table II',
        'Reporting Owner',
        'Transactions',
    ]
};
/**
 * Default options for SEC filing parsing
 */
const DEFAULT_SEC_FILING_OPTIONS = {
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
};
/**
 * Parse an SEC filing from a URL
 *
 * @param url The URL of the SEC filing
 * @param filingType The type of SEC filing
 * @param options Parsing options
 * @returns The parsed SEC filing
 */
export async function parseSECFilingFromUrl(url, filingType, options = DEFAULT_SEC_FILING_OPTIONS) {
    try {
        logger.debug(`Parsing SEC filing of type ${filingType} from URL: ${url}`);
        // Merge options with defaults
        const mergedOptions = Object.assign(Object.assign({}, DEFAULT_SEC_FILING_OPTIONS), options);
        // Use the base HTML parser to get sections
        const sections = await parseHTMLFromUrl(url, mergedOptions);
        // Process the sections based on filing type
        return processSECFiling(sections, filingType, mergedOptions);
    }
    catch (error) {
        logger.error(`Error parsing SEC filing from URL ${url}:`, error);
        throw new Error(`Failed to parse SEC filing from URL: ${url}`);
    }
}
/**
 * Parse an SEC filing from HTML content
 *
 * @param html The HTML content of the SEC filing
 * @param filingType The type of SEC filing
 * @param options Parsing options
 * @returns The parsed SEC filing
 */
export function parseSECFiling(html, filingType, options = DEFAULT_SEC_FILING_OPTIONS) {
    try {
        logger.debug(`Parsing SEC filing of type ${filingType} from HTML content`);
        // Merge options with defaults
        const mergedOptions = Object.assign(Object.assign({}, DEFAULT_SEC_FILING_OPTIONS), options);
        // Use the base HTML parser to get sections
        const sections = parseHTML(html, mergedOptions);
        // Process the sections based on filing type
        return processSECFiling(sections, filingType, mergedOptions);
    }
    catch (error) {
        logger.error(`Error parsing SEC filing from HTML:`, error);
        throw new Error(`Failed to parse SEC filing from HTML`);
    }
}
/**
 * Process the parsed sections based on filing type
 */
function processSECFiling(sections, filingType, options) {
    // Extract metadata from the document
    const metadata = extractSECFilingMetadata(sections, filingType);
    // Find tables and lists
    const tables = sections.filter(section => section.type === FilingSectionType.TABLE);
    const lists = sections.filter(section => section.type === FilingSectionType.LIST);
    // Extract important sections based on filing type
    const importantSections = {};
    if (options.extractImportantSections) {
        // Handle all possible filing types
        const sectionType = filingType === '4' ? 'Form4' : filingType;
        const sectionNames = (SEC_FILING_SECTIONS[sectionType] || []);
        for (const sectionName of sectionNames) {
            const sectionContent = findSectionContent(sections, sectionName);
            if (sectionContent) {
                importantSections[sectionName] = sectionContent;
            }
        }
    }
    // Create the parsed filing object
    const parsedFiling = {
        filingType,
        cik: metadata.cik,
        companyName: metadata.companyName,
        filingDate: metadata.filingDate,
        importantSections,
        sections,
        tables,
        lists,
        metadata,
    };
    // Include full text if requested
    if (options.includeFullText) {
        const fullText = sections
            .map(section => section.content)
            .join('\n\n')
            .trim();
        parsedFiling.fullText = options.maxFullTextLength && fullText.length > options.maxFullTextLength
            ? fullText.substring(0, options.maxFullTextLength)
            : fullText;
    }
    // Apply chunking if enabled
    if (options.enableChunking && options.chunkOptions) {
        try {
            logger.debug(`Applying chunking to ${filingType} filing`);
            const chunkResult = chunkParsedFiling(parsedFiling, options.chunkOptions);
            parsedFiling.chunks = chunkResult.chunks;
            parsedFiling.isChunked = true;
            logger.debug(`Created ${chunkResult.totalChunks} chunks with avg size ${chunkResult.averageChunkSize.toFixed(0)} chars`);
        }
        catch (error) {
            logger.error(`Error chunking SEC filing:`, error);
            parsedFiling.isChunked = false;
        }
    }
    return parsedFiling;
}
/**
 * Extract metadata from the SEC filing
 */
function extractSECFilingMetadata(sections, filingType) {
    const metadata = {
        filingType
    };
    // Try to find the company name and CIK
    for (const section of sections) {
        const content = section.content.trim();
        // Look for CIK pattern
        const cikMatch = content.match(/CIK=(\d{10})/i) ||
            content.match(/CIK[:\s]*(\d{10})/i) ||
            content.match(/(\d{10})(?=\s*\(Filer\))/i);
        if (cikMatch && !metadata.cik) {
            metadata.cik = cikMatch[1];
        }
        // Look for company name in standard formats
        if (!metadata.companyName) {
            // Check for common company name formats in SEC filings
            const nameMatch = content.match(/COMPANY\s*:\s*([^\n]+)/i) ||
                content.match(/Registrant\s*:\s*([^\n]+)/i) ||
                content.match(/^([^,\n]+),?\s*INC\.?/i) ||
                content.match(/^([^,\n]+),?\s*CORP\.?/i) ||
                content.match(/^([^,\n]+),?\s*CORPORATION/i) ||
                content.match(/^([^,\n]+),?\s*LLC/i) ||
                content.match(/^([^,\n]+),?\s*CO\./i);
            if (nameMatch) {
                metadata.companyName = nameMatch[1].trim();
            }
        }
        // Look for filing date
        const dateMatch = content.match(/filed\s*(?:on|as of)?\s*(?:date)?:?\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/i) ||
            content.match(/filing\s*date:?\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/i);
        if (dateMatch && !metadata.filingDate) {
            const month = parseInt(dateMatch[1], 10);
            const day = parseInt(dateMatch[2], 10);
            let year = parseInt(dateMatch[3], 10);
            // Handle 2-digit years
            if (year < 100) {
                year += year < 50 ? 2000 : 1900;
            }
            metadata.filingDate = new Date(year, month - 1, day);
        }
    }
    return metadata;
}
/**
 * Find content for a specific section by name
 */
function findSectionContent(sections, sectionName) {
    // First, try to find an exact section title match
    for (const section of sections) {
        if (section.title && section.title.includes(sectionName)) {
            return section.content;
        }
        // Check children recursively if no direct match
        if (section.children) {
            for (const child of section.children) {
                if (child.title && child.title.includes(sectionName)) {
                    return child.content;
                }
            }
        }
    }
    // If no title match, search in content (less reliable)
    for (const section of sections) {
        if (section.content && section.content.includes(sectionName)) {
            return section.content;
        }
    }
    return undefined;
}
// Type-specific parsing functions below, for convenience
/**
 * Parse a 10-K filing
 */
export function parse10KFiling(html, options = DEFAULT_SEC_FILING_OPTIONS) {
    return parseSECFiling(html, '10-K', options);
}
/**
 * Parse a 10-Q filing
 */
export function parse10QFiling(html, options = DEFAULT_SEC_FILING_OPTIONS) {
    return parseSECFiling(html, '10-Q', options);
}
/**
 * Parse an 8-K filing
 */
export function parse8KFiling(html, options = DEFAULT_SEC_FILING_OPTIONS) {
    return parseSECFiling(html, '8-K', options);
}
/**
 * Parse a Form 4 filing
 */
export function parseForm4Filing(html, options = DEFAULT_SEC_FILING_OPTIONS) {
    return parseSECFiling(html, '4', options);
}
