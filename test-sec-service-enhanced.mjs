/**
 * Enhanced SEC Service Integration Test
 * 
 * This script tests the integration of our enhanced SEC filing extractor
 * with the existing SEC service to improve content extraction for Tesla filings.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import axios from 'axios';

// Load environment variables
dotenv.config();

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import the enhanced SEC filing extractor
import { 
  extractEnhancedFilingContent, 
  formatForSummarization,
  detectFilingType 
} from './lib/parsers/sec-filing-integration.js';

// Import the enhanced form parser
import {
  parseFormContentEnhanced,
  extractImportantContentEnhanced
} from './lib/parsers/enhanced-form-parser.js';

// Create output directory for test results
const OUTPUT_DIR = path.join(__dirname, 'enhanced-sec-service-test-results');
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
  // Recent 10-K (Annual Report) - inline XBRL
  {
    url: 'https://www.sec.gov/Archives/edgar/data/1318605/000095017023001409/tsla-20221231.htm',
    type: '10-K',
    description: 'Tesla 2022 Annual Report (10-K) - inline XBRL'
  },
  // Recent 10-Q (Quarterly Report) - inline XBRL - Updated URL
  {
    url: 'https://www.sec.gov/Archives/edgar/data/1318605/000095017023045546/tsla-20230930.htm',
    type: '10-Q',
    description: 'Tesla 2023 Q3 Report (10-Q) - inline XBRL'
  },
  // Recent 8-K (Current Report) - Updated URL
  {
    url: 'https://www.sec.gov/Archives/edgar/data/1318605/000119312523249096/d561302d8k.htm',
    type: '8-K',
    description: 'Tesla 8-K Report - standard HTML'
  },
  // SEC viewer URL (ix?doc=)
  {
    url: 'https://www.sec.gov/ix?doc=/Archives/edgar/data/1318605/000095017023001409/tsla-20221231.htm',
    type: '10-K',
    description: 'Tesla 2022 Annual Report (10-K) - SEC viewer URL'
  },
  // SEC viewer URL for 10-Q
  {
    url: 'https://www.sec.gov/ix?doc=/Archives/edgar/data/1318605/000095017023045546/tsla-20230930.htm',
    type: '10-Q',
    description: 'Tesla 2023 Q3 Report (10-Q) - SEC viewer URL'
  }
];

/**
 * Call Claude AI to generate a summary
 */
async function generateSummaryWithClaude(prompt) {
  // Check if ANTHROPIC_API_KEY is set
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.log('ANTHROPIC_API_KEY not set, using mock response');
    return {
      success: false,
      error: 'ANTHROPIC_API_KEY not set',
      mockResponse: 'This is a mock summary response. In production, Claude AI would generate a detailed summary of the filing.'
    };
  }
  
  try {
    console.log('Calling Claude API to generate summary...');
    
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-3-opus-20240229',
        max_tokens: 4000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        }
      }
    );
    
    return {
      success: true,
      summary: response.data.content[0].text,
      usage: response.data.usage
    };
  } catch (error) {
    console.error('Error calling Claude API:', error.message);
    return {
      success: false,
      error: error.message || 'Unknown error calling Claude API'
    };
  }
}

/**
 * Generate a prompt for Claude AI to summarize an SEC filing
 */
function generateSummaryPrompt(filingContent, filingType, companyName) {
  return `
Human: You are an expert financial analyst assistant. I need you to analyze and summarize the following ${filingType} SEC filing for ${companyName}.

Focus on the most important information that would be relevant to investors, including:
1. Key financial results and metrics
2. Significant business developments
3. Risk factors or challenges
4. Management's outlook and guidance
5. Any notable changes from previous periods

Please provide a concise, well-structured summary that highlights the most important points. Use bullet points where appropriate.

Here is the filing content:

${filingContent}

Assistant: `;
}

/**
 * Main test function to test the enhanced SEC filing extraction and summarization
 */
async function runTests() {
  const results = [];
  
  for (let i = 0; i < TEST_URLS.length; i++) {
    const { url, type, description } = TEST_URLS[i];
    console.log(`\nTest ${i + 1}/${TEST_URLS.length}: ${description}`);
    console.log(`URL: ${url}`);
    
    try {
      // Step 1: Extract content using enhanced extractor
      console.log('Step 1: Extracting content using enhanced extractor...');
      const extractionResult = await extractEnhancedFilingContent(url, { debug: true, maxRetries: 3 });
      
      // Save extraction metadata even if extraction failed
      writeTestResult(`extraction_metadata_${i + 1}.json`, {
        url,
        success: extractionResult.success,
        error: extractionResult.error,
        metadata: extractionResult.metadata
      });
      
      if (!extractionResult.success) {
        console.error(`Extraction failed: ${extractionResult.error}`);
        results.push({
          url,
          type,
          description,
          extractionSuccess: false,
          extractionError: extractionResult.error
        });
        continue; // Skip to next URL
      }
      
      // Save the raw content
      writeTestResult(`raw_content_${i + 1}.txt`, extractionResult.content);
      console.log(`Raw content size: ${formatFileSize(extractionResult.content.length)}`);
      
      // Detect filing type from content if not specified
      const detectedType = detectFilingType(url, extractionResult.content) || type;
      console.log(`Detected filing type: ${detectedType}`);
      
      // Step 2: Format content for summarization
      console.log('Step 2: Formatting content for summarization...');
      const formattedContent = formatForSummarization(extractionResult.content, {
        maxLength: 100000,
        includeBoilerplate: false
      });
      
      // Save the formatted content
      writeTestResult(`formatted_content_${i + 1}.txt`, formattedContent);
      console.log(`Formatted content size: ${formatFileSize(formattedContent.length)}`);
      
      // Check if formatted content is too small (potential formatting issue)
      if (formattedContent.length < 1000 && extractionResult.content.length > 10000) {
        console.warn('WARNING: Formatted content is suspiciously small. Possible formatting issue.');
        // Save a backup using just the raw content with minimal formatting
        const backupFormatted = extractionResult.content.substring(0, 100000);
        writeTestResult(`formatted_content_backup_${i + 1}.txt`, backupFormatted);
        console.log(`Created backup formatted content: ${formatFileSize(backupFormatted.length)}`);
      }
      
      // Step 3: Parse content with enhanced form parser
      console.log('Step 3: Parsing content with enhanced form parser...');
      let parsedContent;
      try {
        parsedContent = await parseFormContentEnhanced(formattedContent, detectedType, url);
      } catch (parseError) {
        console.warn(`Warning: Error parsing content: ${parseError.message}`);
        console.log('Continuing with unparsed content...');
        parsedContent = { content: formattedContent, sections: [], metadata: { type: detectedType } };
      }
      
      // Save the parsed content
      writeTestResult(`parsed_content_${i + 1}.json`, parsedContent);
      
      // Step 4: Extract important content for summarization
      console.log('Step 4: Extracting important content for summarization...');
      let importantContent;
      try {
        importantContent = extractImportantContentEnhanced(parsedContent, 50000);
      } catch (extractError) {
        console.warn(`Warning: Error extracting important content: ${extractError.message}`);
        console.log('Using formatted content as fallback...');
        importantContent = formattedContent.substring(0, 50000);
      }
      
      // Save the important content
      writeTestResult(`important_content_${i + 1}.txt`, importantContent);
      console.log(`Important content size: ${formatFileSize(importantContent.length)}`);
      
      // Step 5: Generate prompt for Claude AI
      console.log('Step 5: Generating prompt for Claude AI...');
      const prompt = generateSummaryPrompt(importantContent, detectedType, 'Tesla, Inc.');
      
      // Save the prompt
      writeTestResult(`claude_prompt_${i + 1}.txt`, prompt);
      
      // Step 6: Call Claude AI to generate summary
      console.log('Step 6: Calling Claude AI to generate summary...');
      const summaryResult = await generateSummaryWithClaude(prompt);
      
      // Save the summary result
      writeTestResult(`summary_result_${i + 1}.json`, summaryResult);
      
      if (summaryResult.success) {
        // Save the summary
        writeTestResult(`summary_${i + 1}.txt`, summaryResult.summary);
        console.log(`Summary length: ${formatFileSize(summaryResult.summary.length)}`);
      } else if (summaryResult.mockResponse) {
        // Save the mock response if API key is not available
        writeTestResult(`summary_${i + 1}.txt`, summaryResult.mockResponse);
        console.log('Using mock summary (no API key available)');
      }
      
      results.push({
        url,
        type: detectedType,
        description,
        extractionSuccess: true,
        contentLength: extractionResult.content.length,
        formattedLength: formattedContent.length,
        importantLength: importantContent.length,
        summarySuccess: summaryResult.success || !!summaryResult.mockResponse,
        summaryError: summaryResult.error,
        summaryLength: summaryResult.summary?.length || summaryResult.mockResponse?.length
      });
    } catch (error) {
      console.error(`Error processing URL ${url}: ${error.message}`);
      results.push({
        url,
        type,
        description,
        extractionSuccess: false,
        extractionError: error.message
      });
    }
  }
  
  // Save the summary results
  writeTestResult('test_summary.json', results);
  
  // Print summary
  console.log('\n=== Test Summary ===');
  results.forEach((result, index) => {
    console.log(`Test ${index + 1}: ${result.description}`);
    console.log(`  URL: ${result.url}`);
    console.log(`  Filing Type: ${result.type}`);
    console.log(`  Extraction Success: ${result.extractionSuccess ? '✓' : '✗'}`);
    if (result.extractionSuccess) {
      console.log(`  Raw Content Length: ${formatFileSize(result.contentLength)}`);
      console.log(`  Formatted Content Length: ${formatFileSize(result.formattedLength)}`);
      console.log(`  Important Content Length: ${formatFileSize(result.importantLength)}`);
      console.log(`  Summary Success: ${result.summarySuccess ? '✓' : '✗'}`);
      if (result.summarySuccess) {
        console.log(`  Summary Length: ${formatFileSize(result.summaryLength)}`);
      } else {
        console.log(`  Summary Error: ${result.summaryError || 'Unknown error'}`);
      }
    } else {
      console.log(`  Extraction Error: ${result.extractionError || 'Unknown error'}`);
    }
  });
}

// Run the tests
console.log('=== Enhanced SEC Service Integration Test ===');
runTests()
  .then(() => console.log('\nTests completed. Check the enhanced-sec-service-test-results directory for output.'))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
