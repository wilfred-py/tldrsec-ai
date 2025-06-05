/**
 * Test script for the SEC filing extractor
 * 
 * This script tests the improved SEC filing extractor against real Tesla SEC filings
 * to verify it can properly extract meaningful content.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import the SEC filing extractor
import { extractFilingContent, SEC_HEADERS } from './lib/parsers/sec-filing-extractor.js';

// Create output directory for test results
const OUTPUT_DIR = path.join(__dirname, 'sec-extractor-test-results');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Helper function to write test results to file
function writeTestResult(filename, content) {
  const filePath = path.join(OUTPUT_DIR, filename);
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  fs.writeFileSync(filePath, contentStr);
  console.log(`Output written to ${filePath}`);
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' bytes';
  else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  else return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// Test URLs for Tesla SEC filings
const TEST_URLS = [
  // Recent 10-K (Annual Report)
  'https://www.sec.gov/Archives/edgar/data/1318605/000095017023001409/tsla-20221231.htm',
  
  // Recent 10-Q (Quarterly Report) - using ix?doc format which is more reliable
  'https://www.sec.gov/ix?doc=/Archives/edgar/data/1318605/000095017023039957/tsla-20230930.htm',
  
  // Recent 8-K (Material Event) - using ix?doc format
  'https://www.sec.gov/ix?doc=/Archives/edgar/data/1318605/000162828023032175/tsla-20231018.htm',
  
  // Try a Form 4 (Insider Trading)
  'https://www.sec.gov/Archives/edgar/data/1494730/000089924323027898/xslF345X04/doc4.xml'
];

// Main test function
async function runTests() {
  console.log('Starting SEC filing extractor tests...');
  
  const results = [];
  
  // Test each URL
  for (let i = 0; i < TEST_URLS.length; i++) {
    const url = TEST_URLS[i];
    console.log(`\nTest ${i + 1}/${TEST_URLS.length}: Processing ${url}`);
    
    try {
      // Extract content with debug info
      console.log('Extracting content...');
      const extractionResult = await extractFilingContent(url, { debug: true });
      
      // Save the full extraction result (including debug info)
      writeTestResult(`extraction_result_${i + 1}.json`, extractionResult);
      
      // Save just the extracted content
      if (extractionResult.success) {
        writeTestResult(`extracted_content_${i + 1}.txt`, extractionResult.content);
        
        // Save a sample of the content
        const contentSample = extractionResult.content.length > 2000 
          ? extractionResult.content.substring(0, 2000) + '...' 
          : extractionResult.content;
        writeTestResult(`content_sample_${i + 1}.txt`, contentSample);
      }
      
      results.push({
        url,
        filingType: extractionResult.metadata?.filingType || 'Unknown',
        isInlineXbrl: extractionResult.metadata?.isInlineXbrl || false,
        success: extractionResult.success,
        contentLength: extractionResult.content?.length || 0,
        error: extractionResult.error
      });
    } catch (error) {
      console.error(`Error processing URL ${url}: ${error.message}`);
      results.push({
        url,
        filingType: 'Unknown',
        success: false,
        error: error.message
      });
    }
  }
  
  // Save the summary results
  writeTestResult('extractor_test_summary.json', results);
  
  // Print summary
  console.log('\n=== Test Summary ===');
  results.forEach((result, index) => {
    console.log(`Test ${index + 1}: ${result.url}`);
    console.log(`  Success: ${result.success}`);
    if (result.success) {
      console.log(`  Filing Type: ${result.filingType}`);
      console.log(`  Inline XBRL: ${result.isInlineXbrl}`);
      console.log(`  Content Length: ${formatFileSize(result.contentLength)}`);
    } else {
      console.log(`  Error: ${result.error || 'Unknown error'}`);
    }
  });
}

// Run the tests
console.log('=== SEC Filing Extractor Test ===');
runTests()
  .then(() => console.log('\nTests completed. Check the sec-extractor-test-results directory for output.'))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
