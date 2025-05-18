"use strict";
/**
 * SEC Filing Parser
 *
 * This module provides specialized parsing functions for different types of SEC filings
 * (10-K, 10-Q, 8-K, etc.) building on top of the base HTML parser.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSECFilingFromUrl = parseSECFilingFromUrl;
exports.parseSECFiling = parseSECFiling;
exports.parse10KFiling = parse10KFiling;
exports.parse10QFiling = parse10QFiling;
exports.parse8KFiling = parse8KFiling;
exports.parseForm4Filing = parseForm4Filing;
const html_parser_1 = require("./html-parser");
const logging_1 = require("@/lib/logging");
// Create a logger for the SEC filing parser
const logger = new logging_1.Logger({}, 'sec-filing-parser');
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
};
/**
 * Parse an SEC filing from a URL
 *
 * @param url The URL of the SEC filing
 * @param filingType The type of SEC filing
 * @param options Parsing options
 * @returns The parsed SEC filing
 */
async function parseSECFilingFromUrl(url, filingType, options = DEFAULT_SEC_FILING_OPTIONS) {
    try {
        logger.debug(`Parsing SEC filing of type ${filingType} from URL: ${url}`);
        // Merge options with defaults
        const mergedOptions = { ...DEFAULT_SEC_FILING_OPTIONS, ...options };
        // Use the base HTML parser to get sections
        const sections = await (0, html_parser_1.parseHTMLFromUrl)(url, mergedOptions);
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
function parseSECFiling(html, filingType, options = DEFAULT_SEC_FILING_OPTIONS) {
    try {
        logger.debug(`Parsing SEC filing of type ${filingType} from HTML content`);
        // Merge options with defaults
        const mergedOptions = { ...DEFAULT_SEC_FILING_OPTIONS, ...options };
        // Use the base HTML parser to get sections
        const sections = (0, html_parser_1.parseHTML)(html, mergedOptions);
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
    const tables = sections.filter(section => section.type === html_parser_1.FilingSectionType.TABLE);
    const lists = sections.filter(section => section.type === html_parser_1.FilingSectionType.LIST);
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
    // Create a full text version if requested
    let fullText = undefined;
    if (options.includeFullText) {
        fullText = sections
            .map(section => section.content)
            .join('\n\n')
            .trim();
        if (options.maxFullTextLength && fullText.length > options.maxFullTextLength) {
            fullText = fullText.substring(0, options.maxFullTextLength) + '...';
        }
    }
    return {
        filingType,
        cik: metadata.cik,
        companyName: metadata.companyName,
        filingDate: metadata.filingDate,
        importantSections,
        sections,
        tables,
        lists,
        fullText,
        metadata
    };
}
/**
 * Extract metadata from the SEC filing
 */
function extractSECFilingMetadata(sections, filingType) {
    const metadata = {
        filingType
    };
    // Try to find document header or title section
    const titleSection = sections.find(section => section.type === html_parser_1.FilingSectionType.TITLE ||
        (section.type === html_parser_1.FilingSectionType.SECTION && section.title?.includes('Document')));
    if (titleSection) {
        // Try to extract company name from title
        const companyNameMatch = titleSection.content.match(/([A-Z][A-Z\s&,.]+)(?:\s+\(|\s+-)/);
        if (companyNameMatch) {
            metadata.companyName = companyNameMatch[1].trim();
        }
        // Try to extract CIK from title
        const cikMatch = titleSection.content.match(/CIK\s*[#:]?\s*(\d+)/i) ||
            titleSection.content.match(/(\d{10})/);
        if (cikMatch) {
            metadata.cik = cikMatch[1];
        }
        // Try to extract filing date
        const dateMatch = titleSection.content.match(/(?:filed|date|as of)[\s:]*(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/i);
        if (dateMatch) {
            const [_, month, day, year] = dateMatch;
            const fullYear = year.length === 2 ? `20${year}` : year;
            const dateStr = `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            metadata.filingDate = new Date(dateStr);
        }
    }
    return metadata;
}
/**
 * Find content for a specific section based on its name
 */
function findSectionContent(sections, sectionName) {
    // Search for exact section title match
    const exactMatch = sections.find(section => section.title && section.title.includes(sectionName));
    if (exactMatch) {
        return exactMatch.content;
    }
    // Search in content for section references
    for (const section of sections) {
        if (section.content.includes(sectionName)) {
            // Find the position of the section name in the content
            const position = section.content.indexOf(sectionName);
            // Return the content from that position onwards
            // This is a simplistic approach, but often works for SEC filings
            return section.content.substring(position);
        }
        // Search in children if available
        if (section.children && section.children.length > 0) {
            const childContent = findSectionContent(section.children, sectionName);
            if (childContent) {
                return childContent;
            }
        }
    }
    return undefined;
}
/**
 * Parse a 10-K SEC filing with optimized extraction for this report type
 */
function parse10KFiling(html, options = DEFAULT_SEC_FILING_OPTIONS) {
    // Specialized options for 10-K filings
    const tenKOptions = {
        ...options,
        extractImportantSections: true,
    };
    return parseSECFiling(html, '10-K', tenKOptions);
}
/**
 * Parse a 10-Q SEC filing with optimized extraction for this report type
 */
function parse10QFiling(html, options = DEFAULT_SEC_FILING_OPTIONS) {
    // Specialized options for 10-Q filings
    const tenQOptions = {
        ...options,
        extractImportantSections: true,
    };
    return parseSECFiling(html, '10-Q', tenQOptions);
}
/**
 * Parse an 8-K SEC filing with optimized extraction for this report type
 */
function parse8KFiling(html, options = DEFAULT_SEC_FILING_OPTIONS) {
    // Specialized options for 8-K filings
    const eightKOptions = {
        ...options,
        extractImportantSections: true,
    };
    return parseSECFiling(html, '8-K', eightKOptions);
}
/**
 * Parse a Form 4 SEC filing with optimized extraction for this report type
 */
function parseForm4Filing(html, options = DEFAULT_SEC_FILING_OPTIONS) {
    // Specialized options for Form 4 filings
    const form4Options = {
        ...options,
        extractImportantSections: true,
        extractTables: true, // Form 4 filings have important tables
    };
    return parseSECFiling(html, 'Form4', form4Options);
}
