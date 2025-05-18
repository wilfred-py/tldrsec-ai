"use strict";
/**
 * PDF Parser for SEC Filings
 *
 * This module provides functionality to parse PDF content from SEC filings,
 * extracting text, tables, and metadata.
 */
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parsePDFFromBuffer = parsePDFFromBuffer;
exports.parsePDFFromFile = parsePDFFromFile;
exports.getTextContent = getTextContent;
exports.extractParagraphs = extractParagraphs;
exports.extractHeaders = extractHeaders;
var fs_1 = __importDefault(require("fs"));
var pdf_parse_1 = __importDefault(require("pdf-parse"));
var pdf2json_1 = __importDefault(require("pdf2json"));
var logging_1 = require("@/lib/logging");
var html_parser_1 = require("./html-parser");
// Create a logger for the PDF parser
var logger = new logging_1.Logger({}, 'pdf-parser');
/**
 * Default options for PDF parsing
 */
var DEFAULT_OPTIONS = {
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
function parsePDFFromBuffer(buffer_1) {
    return __awaiter(this, arguments, void 0, function (buffer, options) {
        var mergedOptions, data, sections, error_1;
        if (options === void 0) { options = DEFAULT_OPTIONS; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 5, , 6]);
                    logger.debug("Parsing PDF content from buffer of size ".concat(buffer.length));
                    mergedOptions = __assign(__assign({}, DEFAULT_OPTIONS), options);
                    return [4 /*yield*/, (0, pdf_parse_1.default)(buffer)];
                case 1:
                    data = _a.sent();
                    return [4 /*yield*/, extractDocumentStructure(data, buffer, mergedOptions)];
                case 2:
                    sections = _a.sent();
                    if (!mergedOptions.extractTables) return [3 /*break*/, 4];
                    return [4 /*yield*/, processTables(buffer, sections, mergedOptions)];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4: return [2 /*return*/, sections];
                case 5:
                    error_1 = _a.sent();
                    logger.error("Error parsing PDF from buffer:", error_1);
                    throw new Error("Failed to parse PDF from buffer: ".concat(error_1));
                case 6: return [2 /*return*/];
            }
        });
    });
}
/**
 * Parse PDF content from a file path
 *
 * @param filePath The path to the PDF file
 * @param options Parsing options
 * @returns A promise resolving to the parsed filing sections
 */
function parsePDFFromFile(filePath_1) {
    return __awaiter(this, arguments, void 0, function (filePath, options) {
        var buffer;
        if (options === void 0) { options = DEFAULT_OPTIONS; }
        return __generator(this, function (_a) {
            try {
                logger.debug("Reading PDF file from ".concat(filePath));
                buffer = fs_1.default.readFileSync(filePath);
                return [2 /*return*/, parsePDFFromBuffer(buffer, options)];
            }
            catch (error) {
                logger.error("Error reading or parsing PDF file ".concat(filePath, ":"), error);
                throw new Error("Failed to parse PDF from file ".concat(filePath, ": ").concat(error));
            }
            return [2 /*return*/];
        });
    });
}
/**
 * Extract the overall document structure
 */
function extractDocumentStructure(data, buffer, options) {
    return __awaiter(this, void 0, void 0, function () {
        var sections, lines, currentSection, sectionContent, _i, lines_1, line, isHeading;
        var _a;
        return __generator(this, function (_b) {
            sections = [];
            // Extract the document title if available
            if ((_a = data.info) === null || _a === void 0 ? void 0 : _a.Title) {
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
            lines = data.text.split('\n').filter(function (line) { return line.trim().length > 0; });
            currentSection = null;
            sectionContent = [];
            for (_i = 0, lines_1 = lines; _i < lines_1.length; _i++) {
                line = lines_1[_i];
                isHeading = line.trim().length < 60 &&
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
            return [2 /*return*/, sections];
        });
    });
}
/**
 * Process tables from the PDF
 */
function processTables(buffer, sections, options) {
    return __awaiter(this, void 0, void 0, function () {
        var pdfParser_1, pdfData, _i, _a, page, tables, _b, tables_1, table, error_2;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    _c.trys.push([0, 2, , 3]);
                    pdfParser_1 = new pdf2json_1.default();
                    return [4 /*yield*/, new Promise(function (resolve, reject) {
                            pdfParser_1.on('pdfParser_dataError', function (errData) { return reject(errData.parserError); });
                            pdfParser_1.on('pdfParser_dataReady', function (pdfData) { return resolve(pdfData); });
                            pdfParser_1.parseBuffer(buffer);
                        })];
                case 1:
                    pdfData = _c.sent();
                    // Process pages to extract tables
                    if (pdfData && pdfData.Pages) {
                        for (_i = 0, _a = pdfData.Pages; _i < _a.length; _i++) {
                            page = _a[_i];
                            tables = extractTablesFromPage(page);
                            // Add extracted tables to sections
                            for (_b = 0, tables_1 = tables; _b < tables_1.length; _b++) {
                                table = tables_1[_b];
                                sections.push({
                                    type: html_parser_1.FilingSectionType.TABLE,
                                    title: "Table (Page ".concat(table.pageNumber, ")"),
                                    content: formatTableAsText(table.data),
                                    tableData: table.data,
                                });
                            }
                        }
                    }
                    return [3 /*break*/, 3];
                case 2:
                    error_2 = _c.sent();
                    logger.error('Error processing tables from PDF:', error_2);
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Extract tables from a page
 */
function extractTablesFromPage(page) {
    var tables = [];
    var pageNumber = page.pageNumber || 1;
    if (!page.Texts || !page.Texts.length) {
        return tables;
    }
    // Step 1: Group text items by y-coordinate (rows)
    var rows = new Map();
    for (var _i = 0, _a = page.Texts; _i < _a.length; _i++) {
        var textItem = _a[_i];
        if (!textItem.R || !textItem.R.length)
            continue;
        var text = decodeURIComponent(textItem.R[0].T);
        var x = textItem.x;
        var y = parseFloat(textItem.y.toFixed(2)); // Round y to handle slight variations
        if (!rows.has(y)) {
            rows.set(y, []);
        }
        rows.get(y).push({ x: x, text: text });
    }
    // Step 2: Sort rows by y-coordinate
    var sortedYs = Array.from(rows.keys()).sort(function (a, b) { return a - b; });
    // Step 3: Detect tables by analyzing consistent columns
    var potentialTables = [];
    var currentTable = [];
    for (var i = 0; i < sortedYs.length; i++) {
        var y = sortedYs[i];
        var row = rows.get(y);
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
                potentialTables.push(__spreadArray([], currentTable, true));
            }
            currentTable = [];
        }
    }
    // Process last table if exists
    if (currentTable.length >= 3) {
        potentialTables.push(currentTable);
    }
    // Step 4: Build table data
    for (var _b = 0, potentialTables_1 = potentialTables; _b < potentialTables_1.length; _b++) {
        var tableRows = potentialTables_1[_b];
        // Identify column positions by analyzing x-coordinates
        var columnPositions = [];
        var xPositions = new Map();
        for (var _c = 0, tableRows_1 = tableRows; _c < tableRows_1.length; _c++) {
            var rowIndex = tableRows_1[_c];
            var row = rows.get(sortedYs[rowIndex]);
            for (var _d = 0, row_1 = row; _d < row_1.length; _d++) {
                var item = row_1[_d];
                var xRounded = Math.round(item.x * 10) / 10; // Round to the nearest 0.1
                if (!xPositions.has(xRounded)) {
                    xPositions.set(xRounded, 0);
                }
                xPositions.set(xRounded, xPositions.get(xRounded) + 1);
            }
        }
        // Find consistent x-positions that appear in most rows
        for (var _e = 0, _f = xPositions.entries(); _e < _f.length; _e++) {
            var _g = _f[_e], x = _g[0], count = _g[1];
            if (count >= tableRows.length * 0.5) { // Column appears in at least half the rows
                columnPositions.push(x);
            }
        }
        columnPositions.sort(function (a, b) { return a - b; });
        // Create table with empty cells
        var tableData = [];
        for (var _h = 0, tableRows_2 = tableRows; _h < tableRows_2.length; _h++) {
            var rowIndex = tableRows_2[_h];
            var rowData = Array(columnPositions.length).fill('');
            var rowItems = rows.get(sortedYs[rowIndex]);
            // Assign text to the closest column
            for (var _j = 0, rowItems_1 = rowItems; _j < rowItems_1.length; _j++) {
                var item = rowItems_1[_j];
                var closestColumn = 0;
                var minDistance = Number.MAX_SAFE_INTEGER;
                for (var i = 0; i < columnPositions.length; i++) {
                    var distance = Math.abs(item.x - columnPositions[i]);
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
                pageNumber: pageNumber,
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
    var colWidths = Array(tableData[0].length).fill(0);
    for (var _i = 0, tableData_1 = tableData; _i < tableData_1.length; _i++) {
        var row = tableData_1[_i];
        for (var i = 0; i < row.length; i++) {
            colWidths[i] = Math.max(colWidths[i], row[i].length);
        }
    }
    // Generate table as text
    var result = '';
    for (var _a = 0, tableData_2 = tableData; _a < tableData_2.length; _a++) {
        var row = tableData_2[_a];
        for (var i = 0; i < row.length; i++) {
            var padding = ' '.repeat(Math.max(0, colWidths[i] - row[i].length + 2));
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
function performOcr(buffer, options) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            try {
                // This is where we would implement OCR logic
                // For now, just return an empty string
                return [2 /*return*/, ''];
            }
            catch (error) {
                logger.error('Error performing OCR:', error);
                return [2 /*return*/, ''];
            }
            return [2 /*return*/];
        });
    });
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
    var paragraphs = text.split(/\n\s*\n/).filter(function (p) { return p.trim().length > 0; });
    return paragraphs.map(function (p) { return ({
        type: html_parser_1.FilingSectionType.PARAGRAPH,
        content: p.trim(),
    }); });
}
/**
 * Extract headers from PDF text based on heuristics
 */
function extractHeaders(text) {
    var lines = text.split('\n');
    var headers = [];
    for (var _i = 0, lines_2 = lines; _i < lines_2.length; _i++) {
        var line = lines_2[_i];
        var trimmed = line.trim();
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
