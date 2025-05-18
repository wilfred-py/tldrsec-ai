"use strict";
/**
 * PDF Parser for SEC Filings
 *
 * This module provides functionality to parse PDF content from SEC filings,
 * extracting text, tables, and metadata.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePDFFromBuffer = parsePDFFromBuffer;
exports.parsePDFFromFile = parsePDFFromFile;
exports.getTextContent = getTextContent;
exports.extractParagraphs = extractParagraphs;
exports.extractHeaders = extractHeaders;
const fs_1 = __importDefault(require("fs"));
const pdf_parse_1 = __importDefault(require("pdf-parse"));
const pdf2json_1 = __importDefault(require("pdf2json"));
const logging_1 = require("@/lib/logging");
const html_parser_1 = require("./html-parser");
// Create a logger for the PDF parser
const logger = new logging_1.Logger({}, 'pdf-parser');
/**
 * Default options for PDF parsing
 */
const DEFAULT_OPTIONS = {
    includeRawHtml: false,
    maxSectionLength: 100000,
    preserveWhitespace: false,
    extractTables: true,
    extractLists: true,
    removeBoilerplate: true,
    useOcr: false,
    ocrLanguage: 'eng',
    extractMetadata: true,
};
/**
 * Parse PDF content from a buffer
 *
 * @param buffer The PDF buffer content to parse
 * @param options Parsing options
 * @returns A promise resolving to the parsed filing sections
 */
async function parsePDFFromBuffer(buffer, options = DEFAULT_OPTIONS) {
    try {
        logger.debug(`Parsing PDF content from buffer of size ${buffer.length}`);
        const mergedOptions = { ...DEFAULT_OPTIONS, ...options };
        // First pass: Extract text and metadata using pdf-parse
        const data = await (0, pdf_parse_1.default)(buffer);
        // Extract sections, tables, and metadata
        const sections = await extractDocumentStructure(data, buffer, mergedOptions);
        // Process tables if enabled
        if (mergedOptions.extractTables) {
            await processTables(buffer, sections, mergedOptions);
        }
        return sections;
    }
    catch (error) {
        logger.error(`Error parsing PDF from buffer:`, error);
        throw new Error(`Failed to parse PDF from buffer: ${error}`);
    }
}
/**
 * Parse PDF content from a file path
 *
 * @param filePath The path to the PDF file
 * @param options Parsing options
 * @returns A promise resolving to the parsed filing sections
 */
async function parsePDFFromFile(filePath, options = DEFAULT_OPTIONS) {
    try {
        logger.debug(`Reading PDF file from ${filePath}`);
        const buffer = fs_1.default.readFileSync(filePath);
        return parsePDFFromBuffer(buffer, options);
    }
    catch (error) {
        logger.error(`Error reading or parsing PDF file ${filePath}:`, error);
        throw new Error(`Failed to parse PDF from file ${filePath}: ${error}`);
    }
}
/**
 * Extract the overall document structure
 */
async function extractDocumentStructure(data, buffer, options) {
    const sections = [];
    // Extract the document title if available
    if (data.info?.Title) {
        sections.push({
            type: html_parser_1.FilingSectionType.TITLE,
            content: data.info.Title,
        });
    }
    // Add metadata section if requested
    if (options.extractMetadata && data.info) {
        sections.push({
            type: html_parser_1.FilingSectionType.SECTION,
            title: 'Metadata',
            content: JSON.stringify(data.info, null, 2),
            metadata: data.info,
        });
    }
    // Extract content by splitting text into sections based on newlines and headings
    const lines = data.text.split('\n').filter(line => line.trim().length > 0);
    let currentSection = null;
    let sectionContent = [];
    for (const line of lines) {
        // Heuristic to detect headings
        const isHeading = line.trim().length < 60 &&
            (line.toUpperCase() === line || /^[A-Z0-9\s\.\-]+$/.test(line));
        if (isHeading && sectionContent.length > 0) {
            // Finish the previous section
            if (currentSection) {
                currentSection.content = sectionContent.join('\n');
                sections.push(currentSection);
            }
            // Start a new section
            currentSection = {
                type: html_parser_1.FilingSectionType.SECTION,
                title: line.trim(),
                content: '',
            };
            sectionContent = [];
        }
        else {
            // Add to current section content
            if (!currentSection) {
                // If no section has been created yet, create a default one
                currentSection = {
                    type: html_parser_1.FilingSectionType.SECTION,
                    title: 'Main Content',
                    content: '',
                };
            }
            sectionContent.push(line);
        }
    }
    // Add the last section
    if (currentSection && sectionContent.length > 0) {
        currentSection.content = sectionContent.join('\n');
        sections.push(currentSection);
    }
    return sections;
}
/**
 * Process tables from the PDF
 */
async function processTables(buffer, sections, options) {
    try {
        // Use pdf2json for table extraction
        const pdfParser = new pdf2json_1.default();
        // Convert promise pattern to async/await
        const pdfData = await new Promise((resolve, reject) => {
            pdfParser.on('pdfParser_dataError', (errData) => reject(errData.parserError));
            pdfParser.on('pdfParser_dataReady', (pdfData) => resolve(pdfData));
            pdfParser.parseBuffer(buffer);
        });
        // Process pages to extract tables
        if (pdfData && pdfData.Pages) {
            for (const page of pdfData.Pages) {
                const tables = extractTablesFromPage(page);
                // Add extracted tables to sections
                for (const table of tables) {
                    sections.push({
                        type: html_parser_1.FilingSectionType.TABLE,
                        title: `Table (Page ${table.pageNumber})`,
                        content: formatTableAsText(table.data),
                        tableData: table.data,
                    });
                }
            }
        }
    }
    catch (error) {
        logger.error('Error processing tables from PDF:', error);
    }
}
/**
 * Extract tables from a page
 */
function extractTablesFromPage(page) {
    const tables = [];
    const pageNumber = page.pageNumber || 1;
    if (!page.Texts || !page.Texts.length) {
        return tables;
    }
    // Step 1: Group text items by y-coordinate (rows)
    const rows = new Map();
    for (const textItem of page.Texts) {
        if (!textItem.R || !textItem.R.length)
            continue;
        const text = decodeURIComponent(textItem.R[0].T);
        const x = textItem.x;
        const y = parseFloat(textItem.y.toFixed(2)); // Round y to handle slight variations
        if (!rows.has(y)) {
            rows.set(y, []);
        }
        rows.get(y).push({ x, text });
    }
    // Step 2: Sort rows by y-coordinate
    const sortedYs = Array.from(rows.keys()).sort((a, b) => a - b);
    // Step 3: Detect tables by analyzing consistent columns
    const potentialTables = [];
    let currentTable = [];
    for (let i = 0; i < sortedYs.length; i++) {
        const y = sortedYs[i];
        const row = rows.get(y);
        // If row has multiple columns
        if (row.length >= 2) {
            currentTable.push(i);
        }
        // Check if next row is close enough to be part of the same table
        else if (i + 1 < sortedYs.length &&
            sortedYs[i + 1] - y < 0.5 &&
            rows.get(sortedYs[i + 1]).length >= 2) {
            currentTable.push(i);
        }
        // End of table
        else if (currentTable.length > 0) {
            if (currentTable.length >= 3) { // Minimum rows for a table
                potentialTables.push([...currentTable]);
            }
            currentTable = [];
        }
    }
    // Process last table if exists
    if (currentTable.length >= 3) {
        potentialTables.push(currentTable);
    }
    // Step 4: Build table data
    for (const tableRows of potentialTables) {
        // Identify column positions by analyzing x-coordinates
        const columnPositions = [];
        const xPositions = new Map();
        for (const rowIndex of tableRows) {
            const row = rows.get(sortedYs[rowIndex]);
            for (const item of row) {
                const xRounded = Math.round(item.x * 10) / 10; // Round to the nearest 0.1
                if (!xPositions.has(xRounded)) {
                    xPositions.set(xRounded, 0);
                }
                xPositions.set(xRounded, xPositions.get(xRounded) + 1);
            }
        }
        // Find consistent x-positions that appear in most rows
        for (const [x, count] of xPositions.entries()) {
            if (count >= tableRows.length * 0.5) { // Column appears in at least half the rows
                columnPositions.push(x);
            }
        }
        columnPositions.sort((a, b) => a - b);
        // Create table with empty cells
        const tableData = [];
        for (const rowIndex of tableRows) {
            const rowData = Array(columnPositions.length).fill('');
            const rowItems = rows.get(sortedYs[rowIndex]);
            // Assign text to the closest column
            for (const item of rowItems) {
                let closestColumn = 0;
                let minDistance = Number.MAX_SAFE_INTEGER;
                for (let i = 0; i < columnPositions.length; i++) {
                    const distance = Math.abs(item.x - columnPositions[i]);
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestColumn = i;
                    }
                }
                // Append to existing content in case multiple items map to same column
                if (rowData[closestColumn]) {
                    rowData[closestColumn] += ' ' + item.text;
                }
                else {
                    rowData[closestColumn] = item.text;
                }
            }
            tableData.push(rowData);
        }
        // Add table to result if it has content
        if (tableData.length > 0 && tableData[0].length > 0) {
            tables.push({
                pageNumber,
                data: tableData,
            });
        }
    }
    return tables;
}
/**
 * Format table data as a text string
 */
function formatTableAsText(tableData) {
    if (tableData.length === 0)
        return '';
    // Calculate column widths
    const colWidths = Array(tableData[0].length).fill(0);
    for (const row of tableData) {
        for (let i = 0; i < row.length; i++) {
            colWidths[i] = Math.max(colWidths[i], row[i].length);
        }
    }
    // Generate table as text
    let result = '';
    for (const row of tableData) {
        for (let i = 0; i < row.length; i++) {
            const padding = ' '.repeat(Math.max(0, colWidths[i] - row[i].length + 2));
            result += row[i] + padding;
        }
        result += '\n';
    }
    return result;
}
/**
 * Use OCR to extract text from an image-based PDF
 * This is a placeholder for future OCR implementation
 */
async function performOcr(buffer, options) {
    try {
        // This is where we would implement OCR logic
        // For now, just return an empty string
        return '';
    }
    catch (error) {
        logger.error('Error performing OCR:', error);
        return '';
    }
}
/**
 * Get text content from a section
 */
function getTextContent(section) {
    return section.content;
}
/**
 * Extract paragraphs from PDF text
 */
function extractParagraphs(text) {
    const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0);
    return paragraphs.map(p => ({
        type: html_parser_1.FilingSectionType.PARAGRAPH,
        content: p.trim(),
    }));
}
/**
 * Extract headers from PDF text based on heuristics
 */
function extractHeaders(text) {
    const lines = text.split('\n');
    const headers = [];
    for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.length > 0 &&
            trimmed.length < 60 &&
            (trimmed.toUpperCase() === trimmed || /^[A-Z0-9\s\.\-]+$/.test(trimmed))) {
            headers.push({
                type: html_parser_1.FilingSectionType.HEADER,
                content: trimmed,
            });
        }
    }
    return headers;
}
