#!/usr/bin/env ts-node
"use strict";
/**
 * SEC Content Extraction Strategy Test Script
 *
 * This script demonstrates the unified content extraction strategy for different SEC filing types.
 * It processes sample SEC filings (10-K, 10-Q, 8-K, PDF, XBRL) and shows the extracted content.
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
// Use direct relative paths to the source files
const filing_parser_factory_1 = require("../../lib/parsers/filing-parser-factory");
const content_extraction_strategy_1 = require("../../lib/parsers/content-extraction-strategy");
// Configure paths to sample SEC filings
const SAMPLE_FILES = {
    '10K': path.join(__dirname, '../../assets/sample-10k.html'),
    '10Q': path.join(__dirname, '../../assets/sample-10q.html'),
    '8K': path.join(__dirname, '../../assets/sample-8k.html'),
    'PDF': path.join(__dirname, '../../assets/sample-pdf-filing.pdf'),
    'XBRL': path.join(__dirname, '../../assets/sample-sec-filing.xbrl'),
};
// Utility to format output for display
function formatOutput(label, content) {
    console.log('\n' + '='.repeat(80));
    console.log(`${label}:`);
    console.log('='.repeat(80));
    if (typeof content === 'object') {
        console.log(JSON.stringify(content, null, 2));
    }
    else {
        console.log(content);
    }
}
// Process a single filing
async function processFiling(filingType, filePath) {
    try {
        console.log(`\n\nProcessing ${filingType} filing from ${path.basename(filePath)}...`);
        // Read the file content
        const content = fs.readFileSync(filePath);
        // Auto-detect the filing type
        const detectedType = (0, filing_parser_factory_1.detectFilingType)(content);
        console.log(`Detected filing type: ${detectedType}`);
        // Extract metadata
        const contentSample = Buffer.isBuffer(content)
            ? content.toString('utf8', 0, 10000)
            : content.substring(0, 10000);
        const metadata = (0, content_extraction_strategy_1.extractMetadata)(contentSample, detectedType || filingType);
        formatOutput('Extracted Metadata', metadata);
        // Parse the filing with the auto parser
        const parsedFiling = await (0, filing_parser_factory_1.createAutoParser)(content, {
            extractImportantSections: true,
            extractTables: true,
            extractLists: true,
            removeBoilerplate: true,
        });
        // Display important sections
        formatOutput('Important Sections', Object.keys(parsedFiling.importantSections || {}).map(section => `- ${section} (${parsedFiling.importantSections?.[section].length || 0} chars)`).join('\n'));
        // Display financial metrics if available
        if (parsedFiling.metadata && parsedFiling.metadata.financialMetrics) {
            formatOutput('Financial Metrics', parsedFiling.metadata.financialMetrics);
        }
        else {
            // Extract financial metrics directly
            const financialMetrics = (0, content_extraction_strategy_1.extractFinancialMetrics)(parsedFiling.sections || []);
            formatOutput('Financial Metrics', financialMetrics);
        }
        // Display table count
        const tableCount = parsedFiling.tables ? parsedFiling.tables.length : 0;
        formatOutput('Tables Found', `${tableCount} tables extracted`);
        // Display list count
        const listCount = parsedFiling.lists ? parsedFiling.lists.length : 0;
        formatOutput('Lists Found', `${listCount} lists extracted`);
        console.log('\nProcessing complete!');
    }
    catch (error) {
        console.error(`Error processing ${filingType} filing:`, error);
    }
}
// Main function to process all samples
async function main() {
    console.log('SEC Content Extraction Strategy Test');
    console.log('===================================');
    // Check if a specific filing type was requested
    const requestedType = process.argv[2];
    if (requestedType && SAMPLE_FILES[requestedType]) {
        // Process just the requested filing type
        await processFiling(requestedType, SAMPLE_FILES[requestedType]);
    }
    else {
        // Process all available sample files
        for (const [filingType, filePath] of Object.entries(SAMPLE_FILES)) {
            // Skip files that don't exist
            if (!fs.existsSync(filePath)) {
                console.log(`\nSkipping ${filingType} - file not found: ${filePath}`);
                continue;
            }
            await processFiling(filingType, filePath);
        }
    }
}
// Run the main function
main().catch(error => {
    console.error('Unhandled error:', error);
    process.exit(1);
});
