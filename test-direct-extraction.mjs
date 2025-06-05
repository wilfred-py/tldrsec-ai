/**
 * Direct SEC Filing Content Extraction Test
 * 
 * This script directly tests content extraction from Tesla SEC filings
 * without relying on the secService module.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import axios from 'axios';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create output directory for test results
const OUTPUT_DIR = path.join(__dirname, 'extraction-test-results');
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

// SEC API headers - CRITICAL for avoiding 403 errors
const SEC_HEADERS = {
  'User-Agent': 'tldrSEC/1.0 (contact@tldrsec.app)',
  'Accept-Encoding': 'gzip, deflate',
  'Host': 'www.sec.gov'
};

// Test URLs for Tesla SEC filings
const TEST_URLS = [
  // Recent 10-K (Annual Report)
  'https://www.sec.gov/Archives/edgar/data/1318605/000095017023001409/tsla-20221231.htm',
  
  // Recent 10-Q (Quarterly Report)
  'https://www.sec.gov/Archives/edgar/data/1318605/000095017023014423/tsla-20230331.htm',
  
  // Recent 8-K (Material Event)
  'https://www.sec.gov/Archives/edgar/data/1318605/000119312523082241/d450853d8k.htm',
  
  // Form 4 (Insider Trading)
  'https://www.sec.gov/Archives/edgar/data/1318605/000089924323000794/xslF345X03/doc4.xml',
  
  // Try an alternative document URL format
  'https://www.sec.gov/ix?doc=/Archives/edgar/data/1318605/000095017023014423/tsla-20230331.htm'
];

// Function to extract content from a URL
async function extractContent(url, index) {
  console.log(`\nTest ${index + 1}/${TEST_URLS.length}: Extracting content from ${url}`);
  
  try {
    // Get the filing type from the URL
    let filingType = 'Unknown';
    if (url.includes('10-k') || url.includes('10k') || url.includes('-20')) filingType = '10-K';
    else if (url.includes('10-q') || url.includes('10q')) filingType = '10-Q';
    else if (url.includes('8-k') || url.includes('8k')) filingType = '8-K';
    else if (url.includes('form4') || url.includes('xslF345')) filingType = 'Form 4';
    
    console.log(`Detected filing type: ${filingType}`);
    
    // Fetch the content with proper headers
    console.log('Fetching content...');
    const response = await axios.get(url, {
      headers: SEC_HEADERS,
      timeout: 15000 // 15 second timeout
    });
    
    const content = response.data;
    console.log(`Received content (${typeof content}): ${formatFileSize(typeof content === 'string' ? content.length : JSON.stringify(content).length)}`);
    
    // Save the raw content
    writeTestResult(`raw_content_${index + 1}_${filingType}.txt`, typeof content === 'string' ? content : JSON.stringify(content));
    
    // Check if this is an inline XBRL document
    const isInlineXbrl = typeof content === 'string' && (
      content.includes('inline XBRL') || 
      content.includes('ix:header') || 
      content.includes('ix:hidden')
    );
    
    if (isInlineXbrl) {
      console.log('⚠️ DETECTED INLINE XBRL DOCUMENT');
      
      // Try to extract the viewer URL if present
      const viewerUrlMatch = typeof content === 'string' && content.match(/href="(https:\/\/www\.sec\.gov\/ix\?doc=[^"]+)"/);
      if (viewerUrlMatch && viewerUrlMatch[1]) {
        const viewerUrl = viewerUrlMatch[1];
        console.log(`Found inline XBRL viewer URL: ${viewerUrl}`);
        
        // Try to fetch the content from the viewer URL
        try {
          console.log('Fetching content from viewer URL...');
          const viewerResponse = await axios.get(viewerUrl, {
            headers: SEC_HEADERS,
            timeout: 15000
          });
          
          const viewerContent = viewerResponse.data;
          console.log(`Received viewer content: ${formatFileSize(typeof viewerContent === 'string' ? viewerContent.length : JSON.stringify(viewerContent).length)}`);
          
          // Save the viewer content
          writeTestResult(`viewer_content_${index + 1}_${filingType}.txt`, typeof viewerContent === 'string' ? viewerContent : JSON.stringify(viewerContent));
        } catch (viewerError) {
          console.error(`Error fetching viewer content: ${viewerError.message}`);
        }
      }
    }
    
    // Clean the content
    let cleanedContent = '';
    if (typeof content === 'string') {
      console.log('Cleaning content...');
      
      if (content.includes('<html') || content.includes('<!DOCTYPE')) {
        // HTML content
        cleanedContent = content
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
          .replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, '')
          .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
          .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
          .replace(/<!--[\s\S]*?-->/g, '')
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      } else if (content.includes('<?xml')) {
        // XML content
        cleanedContent = content
          .replace(/<[^>]*>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
      } else {
        // Plain text
        cleanedContent = content;
      }
      
      console.log(`Cleaned content: ${formatFileSize(cleanedContent.length)}`);
      
      // Save the cleaned content
      writeTestResult(`cleaned_content_${index + 1}_${filingType}.txt`, cleanedContent);
      
      // Save a sample of the cleaned content
      const contentSample = cleanedContent.length > 1000 ? cleanedContent.substring(0, 1000) + '...' : cleanedContent;
      writeTestResult(`cleaned_sample_${index + 1}_${filingType}.txt`, contentSample);
      
      return {
        url,
        filingType,
        rawSize: content.length,
        cleanedSize: cleanedContent.length,
        isInlineXbrl,
        success: true
      };
    } else {
      console.warn('Content is not a string, cannot clean');
      return {
        url,
        filingType,
        rawSize: JSON.stringify(content).length,
        cleanedSize: 0,
        isInlineXbrl: false,
        success: false,
        error: 'Content is not a string'
      };
    }
  } catch (error) {
    console.error(`Error extracting content: ${error.message}`);
    return {
      url,
      success: false,
      error: error.message
    };
  }
}

// Main test function
async function runTests() {
  console.log('Starting direct SEC filing content extraction tests...');
  
  const results = [];
  
  // Test each URL
  for (let i = 0; i < TEST_URLS.length; i++) {
    const result = await extractContent(TEST_URLS[i], i);
    results.push(result);
  }
  
  // Save the summary results
  writeTestResult('extraction_summary.json', results);
  
  // Print summary
  console.log('\n=== Test Summary ===');
  results.forEach((result, index) => {
    console.log(`Test ${index + 1}: ${result.url}`);
    console.log(`  Success: ${result.success}`);
    if (result.success) {
      console.log(`  Filing Type: ${result.filingType}`);
      console.log(`  Raw Size: ${formatFileSize(result.rawSize)}`);
      console.log(`  Cleaned Size: ${formatFileSize(result.cleanedSize)}`);
      console.log(`  Inline XBRL: ${result.isInlineXbrl}`);
    } else {
      console.log(`  Error: ${result.error}`);
    }
  });
}

// Run the tests
console.log('=== Direct SEC Filing Content Extraction Test ===');
runTests()
  .then(() => console.log('\nTests completed. Check the extraction-test-results directory for output.'))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
