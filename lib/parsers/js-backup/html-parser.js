/**
 * HTML Parser for SEC Filings
 *
 * This module provides functionality to parse HTML content from SEC filings,
 * extracting structured data while preserving document structure.
 */
import axios from 'axios';
import * as cheerio from 'cheerio';
import { Logger } from '@/lib/logging';
// Create a logger for the HTML parser
const logger = new Logger({}, 'html-parser');
/**
 * Types of filing sections that are commonly found in SEC filings
 */
export var FilingSectionType;
(function (FilingSectionType) {
    FilingSectionType["TITLE"] = "title";
    FilingSectionType["HEADER"] = "header";
    FilingSectionType["PARAGRAPH"] = "paragraph";
    FilingSectionType["TABLE"] = "table";
    FilingSectionType["LIST"] = "list";
    FilingSectionType["SECTION"] = "section";
})(FilingSectionType || (FilingSectionType = {}));
/**
 * Default options for HTML parsing
 */
const DEFAULT_OPTIONS = {
    includeRawHtml: false,
    maxSectionLength: 100000,
    preserveWhitespace: false,
    extractTables: true,
    extractLists: true,
    removeBoilerplate: true,
};
/**
 * Parse HTML content from a URL
 *
 * @param url The URL to fetch and parse
 * @param options Parsing options
 * @returns A promise resolving to the parsed filing sections
 */
export async function parseHTMLFromUrl(url, options = DEFAULT_OPTIONS) {
    try {
        logger.debug(`Fetching HTML content from ${url}`);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'TLDRSec-AI/1.0 (https://tldrsec.com; support@tldrsec.com)'
            }
        });
        const html = response.data;
        return parseHTML(html, options);
    }
    catch (error) {
        logger.error(`Error fetching or parsing HTML from URL ${url}:`, error);
        throw new Error(`Failed to parse HTML from URL: ${url}`);
    }
}
/**
 * Parse HTML content from a string
 *
 * @param html The HTML content to parse
 * @param options Parsing options
 * @returns The parsed filing sections
 */
export function parseHTML(html, options = DEFAULT_OPTIONS) {
    const mergedOptions = Object.assign(Object.assign({}, DEFAULT_OPTIONS), options);
    const $ = cheerio.load(html);
    // Pre-processing: remove unnecessary elements
    if (mergedOptions.removeBoilerplate) {
        removeBoilerplate($);
    }
    // Extract document structure
    const sections = extractDocumentStructure($, mergedOptions);
    // Process tables if enabled
    if (mergedOptions.extractTables) {
        processTables($, sections, mergedOptions);
    }
    // Process lists if enabled
    if (mergedOptions.extractLists) {
        processLists($, sections, mergedOptions);
    }
    return sections;
}
/**
 * Remove boilerplate content like headers, footers, scripts, etc.
 */
function removeBoilerplate($) {
    // Remove scripts, styles, and other non-content elements
    $('script, style, meta, link, noscript').remove();
    // Common SEC EDGAR boilerplate elements
    $('.edgar-header, .edgar-footer, .filer-info').remove();
    // Common navigation elements
    $('.nav, .navigation, .menu, .header, .footer').remove();
}
/**
 * Extract the overall document structure
 */
function extractDocumentStructure($, options) {
    const sections = [];
    // Extract the document title
    const title = $('title').text().trim();
    if (title) {
        sections.push({
            type: FilingSectionType.TITLE,
            content: title,
            rawHtml: options.includeRawHtml ? $('title').html() || undefined : undefined,
        });
    }
    // Extract main sections (div, section, article elements)
    $('body > div, body > section, body > article').each((_, element) => {
        const section = extractSection($, $(element), options);
        if (section) {
            sections.push(section);
        }
    });
    // If no structured sections were found, extract everything from body
    if (sections.length <= 1) { // Only title or nothing
        const bodySection = extractBodyContent($, options);
        if (bodySection) {
            sections.push(bodySection);
        }
    }
    return sections;
}
/**
 * Extract a section from an element
 */
function extractSection($, $element, options) {
    const children = [];
    let titleText = '';
    // Try to find a heading inside this section
    const $heading = $element.find('h1, h2, h3, h4, h5, h6').first();
    if ($heading.length) {
        titleText = $heading.text().trim();
        // Remove the heading so it's not included in content
        $heading.remove();
    }
    // Process child sections recursively
    $element.find('div, section, article').each((_, child) => {
        const childSection = extractSection($, $(child), options);
        if (childSection) {
            children.push(childSection);
            // Remove the child to avoid duplication
            $(child).remove();
        }
    });
    // Get the content of this section (after removing subsections)
    let content = $element.text().trim();
    if (!options.preserveWhitespace) {
        content = normalizeWhitespace(content);
    }
    // Truncate if necessary
    if (options.maxSectionLength && content.length > options.maxSectionLength) {
        content = content.substring(0, options.maxSectionLength) + '...';
    }
    // Skip empty sections
    if (!content && children.length === 0) {
        return null;
    }
    return {
        type: FilingSectionType.SECTION,
        title: titleText || undefined,
        content,
        rawHtml: options.includeRawHtml ? $element.html() || undefined : undefined,
        children: children.length > 0 ? children : undefined,
    };
}
/**
 * Extract content directly from body as a fallback
 */
function extractBodyContent($, options) {
    let content = $('body').text().trim();
    if (!options.preserveWhitespace) {
        content = normalizeWhitespace(content);
    }
    return {
        type: FilingSectionType.SECTION,
        content,
        rawHtml: options.includeRawHtml ? $('body').html() || undefined : undefined,
    };
}
/**
 * Process and extract tables in the document
 */
function processTables($, sections, options) {
    // Find all tables in the document
    $('table').each((_, table) => {
        const $table = $(table);
        const tableData = extractTableData($, $table);
        // Only process non-empty tables
        if (tableData.length === 0) {
            return;
        }
        // Get table title from caption or preceding header
        let tableTitle = '';
        const $caption = $table.find('caption');
        if ($caption.length) {
            tableTitle = $caption.text().trim();
        }
        else {
            const $prevHeader = $table.prev('h1, h2, h3, h4, h5, h6');
            if ($prevHeader.length) {
                tableTitle = $prevHeader.text().trim();
            }
        }
        const tableSection = {
            type: FilingSectionType.TABLE,
            title: tableTitle || undefined,
            content: '', // Will be filled with text representation of the table
            tableData,
            rawHtml: options.includeRawHtml ? $table.html() || undefined : undefined,
        };
        // Create text representation of the table
        tableSection.content = tableDataToString(tableData);
        // Add table as a top-level section
        sections.push(tableSection);
    });
}
/**
 * Extract data from a table
 */
function extractTableData($, $table) {
    const tableData = [];
    // Process thead rows
    $table.find('thead tr').each((_, row) => {
        const rowData = [];
        $(row).find('th, td').each((_, cell) => {
            rowData.push($(cell).text().trim());
        });
        if (rowData.length > 0) {
            tableData.push(rowData);
        }
    });
    // Process tbody rows
    $table.find('tbody tr, tr').each((_, row) => {
        const rowData = [];
        $(row).find('td, th').each((_, cell) => {
            rowData.push($(cell).text().trim());
        });
        if (rowData.length > 0) {
            tableData.push(rowData);
        }
    });
    return tableData;
}
/**
 * Convert table data to string representation
 */
function tableDataToString(tableData) {
    if (tableData.length === 0) {
        return '';
    }
    return tableData.map(row => row.join(' | ')).join('\n');
}
/**
 * Process and extract lists in the document
 */
function processLists($, sections, options) {
    // Find all lists in the document
    $('ul, ol').each((_, list) => {
        const $list = $(list);
        const listItems = extractListItems($, $list);
        // Only process non-empty lists
        if (listItems.length === 0) {
            return;
        }
        // Get list title from preceding header
        let listTitle = '';
        const $prevHeader = $list.prev('h1, h2, h3, h4, h5, h6');
        if ($prevHeader.length) {
            listTitle = $prevHeader.text().trim();
        }
        const listSection = {
            type: FilingSectionType.LIST,
            title: listTitle || undefined,
            content: '', // Will be filled with text representation of the list
            listItems,
            rawHtml: options.includeRawHtml ? $list.html() || undefined : undefined,
        };
        // Create text representation of the list
        listSection.content = listDataToString(listItems, $list.is('ol'));
        // Add list as a top-level section
        sections.push(listSection);
    });
}
/**
 * Extract items from a list
 */
function extractListItems($, $list) {
    const items = [];
    $list.find('li').each((_, item) => {
        const itemText = $(item).text().trim();
        if (itemText) {
            items.push(itemText);
        }
    });
    return items;
}
/**
 * Convert list items to string representation
 */
function listDataToString(items, isOrdered) {
    if (items.length === 0) {
        return '';
    }
    return items.map((item, index) => {
        return isOrdered ? `${index + 1}. ${item}` : `• ${item}`;
    }).join('\n');
}
/**
 * Normalize whitespace in text content
 */
function normalizeWhitespace(text) {
    return text
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, '\n')
        .trim();
}
/**
 * Get text content from an HTML element with normalized whitespace
 */
export function getTextContent($, $element, preserveWhitespace = false) {
    let text = $element.text().trim();
    if (!preserveWhitespace) {
        text = normalizeWhitespace(text);
    }
    return text;
}
/**
 * Extract paragraphs from HTML content
 */
export function extractParagraphs($) {
    const paragraphs = [];
    $('p').each((_, element) => {
        const $element = $(element);
        const content = $element.text().trim();
        if (content) {
            paragraphs.push({
                type: FilingSectionType.PARAGRAPH,
                content: normalizeWhitespace(content),
            });
        }
    });
    return paragraphs;
}
/**
 * Extract headers from HTML content
 */
export function extractHeaders($) {
    const headers = [];
    $('h1, h2, h3, h4, h5, h6').each((_, element) => {
        const $element = $(element);
        const content = $element.text().trim();
        if (content) {
            headers.push({
                type: FilingSectionType.HEADER,
                content: normalizeWhitespace(content),
            });
        }
    });
    return headers;
}
