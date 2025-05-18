"use strict";
/**
 * HTML Parser for SEC Filings
 *
 * This module provides functionality to parse HTML content from SEC filings,
 * extracting structured data while preserving document structure.
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FilingSectionType = void 0;
exports.parseHTMLFromUrl = parseHTMLFromUrl;
exports.parseHTML = parseHTML;
exports.getTextContent = getTextContent;
exports.extractParagraphs = extractParagraphs;
exports.extractHeaders = extractHeaders;
var axios_1 = __importDefault(require("axios"));
var cheerio = __importStar(require("cheerio"));
var logging_1 = require("@/lib/logging");
// Create a logger for the HTML parser
var logger = new logging_1.Logger({}, 'html-parser');
/**
 * Types of filing sections that are commonly found in SEC filings
 */
var FilingSectionType;
(function (FilingSectionType) {
    FilingSectionType["TITLE"] = "title";
    FilingSectionType["HEADER"] = "header";
    FilingSectionType["PARAGRAPH"] = "paragraph";
    FilingSectionType["TABLE"] = "table";
    FilingSectionType["LIST"] = "list";
    FilingSectionType["SECTION"] = "section";
})(FilingSectionType || (exports.FilingSectionType = FilingSectionType = {}));
/**
 * Default options for HTML parsing
 */
var DEFAULT_OPTIONS = {
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
function parseHTMLFromUrl(url_1) {
    return __awaiter(this, arguments, void 0, function (url, options) {
        var response, html, error_1;
        if (options === void 0) { options = DEFAULT_OPTIONS; }
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    logger.debug("Fetching HTML content from ".concat(url));
                    return [4 /*yield*/, axios_1.default.get(url, {
                            headers: {
                                'User-Agent': 'TLDRSec-AI/1.0 (https://tldrsec.com; support@tldrsec.com)'
                            }
                        })];
                case 1:
                    response = _a.sent();
                    html = response.data;
                    return [2 /*return*/, parseHTML(html, options)];
                case 2:
                    error_1 = _a.sent();
                    logger.error("Error fetching or parsing HTML from URL ".concat(url, ":"), error_1);
                    throw new Error("Failed to parse HTML from URL: ".concat(url));
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Parse HTML content from a string
 *
 * @param html The HTML content to parse
 * @param options Parsing options
 * @returns The parsed filing sections
 */
function parseHTML(html, options) {
    if (options === void 0) { options = DEFAULT_OPTIONS; }
    var mergedOptions = __assign(__assign({}, DEFAULT_OPTIONS), options);
    var $ = cheerio.load(html);
    // Pre-processing: remove unnecessary elements
    if (mergedOptions.removeBoilerplate) {
        removeBoilerplate($);
    }
    // Extract document structure
    var sections = extractDocumentStructure($, mergedOptions);
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
    var sections = [];
    // Extract the document title
    var title = $('title').text().trim();
    if (title) {
        sections.push({
            type: FilingSectionType.TITLE,
            content: title,
            rawHtml: options.includeRawHtml ? $('title').html() || undefined : undefined,
        });
    }
    // Extract main sections (div, section, article elements)
    $('body > div, body > section, body > article').each(function (_, element) {
        var section = extractSection($, $(element), options);
        if (section) {
            sections.push(section);
        }
    });
    // If no structured sections were found, extract everything from body
    if (sections.length <= 1) { // Only title or nothing
        var bodySection = extractBodyContent($, options);
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
    var children = [];
    var titleText = '';
    // Try to find a heading inside this section
    var $heading = $element.find('h1, h2, h3, h4, h5, h6').first();
    if ($heading.length) {
        titleText = $heading.text().trim();
        // Remove the heading so it's not included in content
        $heading.remove();
    }
    // Process child sections recursively
    $element.find('div, section, article').each(function (_, child) {
        var childSection = extractSection($, $(child), options);
        if (childSection) {
            children.push(childSection);
            // Remove the child to avoid duplication
            $(child).remove();
        }
    });
    // Get the content of this section (after removing subsections)
    var content = $element.text().trim();
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
        content: content,
        rawHtml: options.includeRawHtml ? $element.html() || undefined : undefined,
        children: children.length > 0 ? children : undefined,
    };
}
/**
 * Extract content directly from body as a fallback
 */
function extractBodyContent($, options) {
    var content = $('body').text().trim();
    if (!options.preserveWhitespace) {
        content = normalizeWhitespace(content);
    }
    return {
        type: FilingSectionType.SECTION,
        content: content,
        rawHtml: options.includeRawHtml ? $('body').html() || undefined : undefined,
    };
}
/**
 * Process and extract tables in the document
 */
function processTables($, sections, options) {
    // Find all tables in the document
    $('table').each(function (_, table) {
        var $table = $(table);
        var tableData = extractTableData($, $table);
        // Only process non-empty tables
        if (tableData.length === 0) {
            return;
        }
        // Get table title from caption or preceding header
        var tableTitle = '';
        var $caption = $table.find('caption');
        if ($caption.length) {
            tableTitle = $caption.text().trim();
        }
        else {
            var $prevHeader = $table.prev('h1, h2, h3, h4, h5, h6');
            if ($prevHeader.length) {
                tableTitle = $prevHeader.text().trim();
            }
        }
        var tableSection = {
            type: FilingSectionType.TABLE,
            title: tableTitle || undefined,
            content: '', // Will be filled with text representation of the table
            tableData: tableData,
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
    var tableData = [];
    // Process thead rows
    $table.find('thead tr').each(function (_, row) {
        var rowData = [];
        $(row).find('th, td').each(function (_, cell) {
            rowData.push($(cell).text().trim());
        });
        if (rowData.length > 0) {
            tableData.push(rowData);
        }
    });
    // Process tbody rows
    $table.find('tbody tr, tr').each(function (_, row) {
        var rowData = [];
        $(row).find('td, th').each(function (_, cell) {
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
    return tableData.map(function (row) { return row.join(' | '); }).join('\n');
}
/**
 * Process and extract lists in the document
 */
function processLists($, sections, options) {
    // Find all lists in the document
    $('ul, ol').each(function (_, list) {
        var $list = $(list);
        var listItems = extractListItems($, $list);
        // Only process non-empty lists
        if (listItems.length === 0) {
            return;
        }
        // Get list title from preceding header
        var listTitle = '';
        var $prevHeader = $list.prev('h1, h2, h3, h4, h5, h6');
        if ($prevHeader.length) {
            listTitle = $prevHeader.text().trim();
        }
        var listSection = {
            type: FilingSectionType.LIST,
            title: listTitle || undefined,
            content: '', // Will be filled with text representation of the list
            listItems: listItems,
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
    var items = [];
    $list.find('li').each(function (_, item) {
        var itemText = $(item).text().trim();
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
    return items.map(function (item, index) {
        return isOrdered ? "".concat(index + 1, ". ").concat(item) : "\u2022 ".concat(item);
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
function getTextContent($, $element, preserveWhitespace) {
    if (preserveWhitespace === void 0) { preserveWhitespace = false; }
    var text = $element.text().trim();
    if (!preserveWhitespace) {
        text = normalizeWhitespace(text);
    }
    return text;
}
/**
 * Extract paragraphs from HTML content
 */
function extractParagraphs($) {
    var paragraphs = [];
    $('p').each(function (_, element) {
        var $element = $(element);
        var content = $element.text().trim();
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
function extractHeaders($) {
    var headers = [];
    $('h1, h2, h3, h4, h5, h6').each(function (_, element) {
        var $element = $(element);
        var content = $element.text().trim();
        if (content) {
            headers.push({
                type: FilingSectionType.HEADER,
                content: normalizeWhitespace(content),
            });
        }
    });
    return headers;
}
