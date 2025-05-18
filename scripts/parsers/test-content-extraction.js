#!/usr/bin/env node

/**
 * SEC Content Extraction Strategy Test Script
 * 
 * This script demonstrates the unified content extraction strategy for different SEC filing types.
 * It processes sample SEC filings (10-K, 10-Q, 8-K, PDF, XBRL) and shows the extracted content.
 */

const fs = require('fs');
const path = require('path');

// Use direct relative paths to the source files
const { createAutoParser, detectFilingType } = require('../../lib/parsers/filing-parser-factory');
const { 
  extractMetadata, 
  extractImportantSections,
  extractFinancialMetrics,
  removeBoilerplate 
} = require('../../lib/parsers/content-extraction-strategy');

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
  } else {
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
    const detectedType = detectFilingType(content);
    console.log(`Detected filing type: ${detectedType}`);
    
    // Extract metadata
    const contentSample = Buffer.isBuffer(content) 
      ? content.toString('utf8', 0, 10000) 
      : content.substring(0, 10000);
    
    const metadata = extractMetadata(contentSample, detectedType || filingType);
    formatOutput('Extracted Metadata', metadata);
    
    // Parse the filing with the auto parser
    const parsedFiling = await createAutoParser(content, {
      extractImportantSections: true,
      extractTables: true,
      extractLists: true,
      removeBoilerplate: true,
    });
    
    // Display important sections
    formatOutput('Important Sections', 
      Object.keys(parsedFiling.importantSections || {}).map(section => 
        `- ${section} (${parsedFiling.importantSections[section].length} chars)`
      ).join('\n')
    );
    
    // Display financial metrics if available
    if (parsedFiling.metadata && parsedFiling.metadata.financialMetrics) {
      formatOutput('Financial Metrics', parsedFiling.metadata.financialMetrics);
    } else {
      // Extract financial metrics directly
      const financialMetrics = extractFinancialMetrics(parsedFiling.sections || []);
      formatOutput('Financial Metrics', financialMetrics);
    }
    
    // Display table count
    const tableCount = parsedFiling.tables ? parsedFiling.tables.length : 0;
    formatOutput('Tables Found', `${tableCount} tables extracted`);
    
    // Display list count
    const listCount = parsedFiling.lists ? parsedFiling.lists.length : 0;
    formatOutput('Lists Found', `${listCount} lists extracted`);
    
    console.log('\nProcessing complete!');
  } catch (error) {
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
  } else {
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