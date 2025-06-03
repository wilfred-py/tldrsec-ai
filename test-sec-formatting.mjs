/**
 * Test script for SEC filing extraction and formatting
 * 
 * This script tests the enhanced SEC filing extractor and formatting functions
 * to ensure they properly preserve important content for summarization.
 */

import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import axios from 'axios';

// Import the enhanced SEC filing integration module
import secIntegration from './lib/parsers/sec-filing-integration.js';

// Load environment variables
dotenv.config();

// Test URLs for SEC filings with fallbacks
const TEST_CASES = [
  {
    description: 'Tesla 10-K (2024 Annual Report)',
    urls: [
      'https://www.sec.gov/Archives/edgar/data/0001318605/000162828025003063/tsla-20241231.htm',
      'https://www.sec.gov/ix?doc=/Archives/edgar/data/0001318605/000162828025003063/tsla-20241231.htm',
      // Fallback to 2022 10-K if 2024 is not available
      'https://www.sec.gov/Archives/edgar/data/1318605/000095017023001409/tsla-20221231.htm',
      'https://www.sec.gov/ix?doc=/Archives/edgar/data/1318605/000095017023001409/tsla-20221231.htm'
    ],
    expectedType: '10-K'
  },
  {
    description: 'Tesla 10-Q (2025 Q1)',
    urls: [
      'https://www.sec.gov/Archives/edgar/data/0001318605/000162828025018911/tsla-20250331.htm',
      'https://www.sec.gov/ix?doc=/Archives/edgar/data/0001318605/000162828025018911/tsla-20250331.htm',
      // Fallback to 2024 Q4 if 2025 Q1 is not available
      'https://www.sec.gov/Archives/edgar/data/0001318605/000162828025003063/tsla-20241231.htm',
      'https://www.sec.gov/ix?doc=/Archives/edgar/data/0001318605/000162828025003063/tsla-20241231.htm'
    ],
    expectedType: '10-Q'
  },
  {
    description: 'Tesla 8-K (May 2025)',
    urls: [
      'https://www.sec.gov/Archives/edgar/data/0001318605/000110465925050072/tm2515421d1_8k.htm',
      'https://www.sec.gov/ix?doc=/Archives/edgar/data/0001318605/000110465925050072/tm2515421d1_8k.htm',
      // Fallback to earlier 8-K if recent one is not available
      'https://www.sec.gov/Archives/edgar/data/0001318605/000162828025018910/tsla-20250423.htm',
      'https://www.sec.gov/ix?doc=/Archives/edgar/data/0001318605/000162828025018910/tsla-20250423.htm'
    ],
    expectedType: '8-K'
  }
];

// Output directory for test results
const OUTPUT_DIR = './sec-formatting-test-results';

// Delay between Claude API calls to avoid rate limiting (in milliseconds)
const CLAUDE_API_DELAY = 15000; // 15 seconds

/**
 * Main test function
 */
async function runTest() {
  console.log('=== SEC Filing Formatting Test ===');
  
  try {
    // Create output directory if it doesn't exist
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    
    // Create a summary file for test results
    const testResults = [];
    
    // Test each case with fallback URLs
    for (let i = 0; i < TEST_CASES.length; i++) {
      const testCase = TEST_CASES[i];
      console.log(`\nTest ${i + 1}/${TEST_CASES.length}: ${testCase.description}`);
      
      let extractionResult = null;
      let successfulUrl = null;
      
      // Try each URL in the test case until one succeeds
      for (const url of testCase.urls) {
        console.log(`Trying URL: ${url}`);
        try {
          // Extract content with timeout
          console.log('Extracting content...');
          extractionResult = await Promise.race([
            secIntegration.extractEnhancedFilingContent(url, { debug: true }),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Extraction timeout after 30 seconds')), 30000)
            )
          ]);
          
          if (extractionResult.success) {
            successfulUrl = url;
            console.log('Extraction successful!');
            break;
          } else {
            console.warn(`Extraction failed: ${extractionResult.error}`);
          }
        } catch (error) {
          console.warn(`Error trying URL ${url}: ${error.message}`);
        }
      }
      
      // If all URLs failed, record the failure and continue to next test case
      if (!extractionResult?.success) {
        console.error(`All URLs failed for test case: ${testCase.description}`);
        testResults.push({
          testCase: testCase.description,
          success: false,
          error: 'All extraction attempts failed'
        });
        continue;
      }
      
      // Log content size
      const contentSizeKB = (extractionResult.content.length / 1024).toFixed(2);
      console.log(`Raw content size: ${contentSizeKB} KB`);
      
      // Save raw content
      await fs.writeFile(
        path.join(OUTPUT_DIR, `raw_content_${i + 1}.txt`), 
        extractionResult.content
      );
      
      // Format content for summarization
      console.log('Formatting content for summarization...');
      const formattedContent = secIntegration.formatForSummarization(
        extractionResult.content, 
        { maxLength: 100000, includeBoilerplate: false }
      );
      
      // Log formatted content size
      const formattedSizeKB = (formattedContent.length / 1024).toFixed(2);
      console.log(`Formatted content size: ${formattedSizeKB} KB`);
      
      // Save formatted content
      await fs.writeFile(
        path.join(OUTPUT_DIR, `formatted_content_${i + 1}.txt`), 
        formattedContent
      );
      
      // Detect filing type
      const filingType = secIntegration.detectFilingType(successfulUrl, extractionResult.content) || testCase.expectedType;
      console.log(`Detected filing type: ${filingType}`);
      
      // Check if content is inline XBRL
      const isInlineXbrl = secIntegration.isInlineXbrl(extractionResult.content);
      console.log(`Is inline XBRL: ${isInlineXbrl}`);
      
      // Save metadata
      const metadata = {
        description: testCase.description,
        url: successfulUrl,
        filingType,
        expectedType: testCase.expectedType,
        isInlineXbrl,
        rawContentSize: extractionResult.content.length,
        rawContentSizeKB: contentSizeKB,
        formattedContentSize: formattedContent.length,
        formattedContentSizeKB: formattedSizeKB,
        extractionMethod: extractionResult.metadata?.extractionMethod || 'unknown',
        timestamp: new Date().toISOString()
      };
      
      await fs.writeFile(
        path.join(OUTPUT_DIR, `metadata_${i + 1}.json`), 
        JSON.stringify(metadata, null, 2)
      );
      
      // Generate a sample prompt for Claude
      const prompt = generatePrompt(formattedContent, filingType);
      
      // Save prompt
      await fs.writeFile(
        path.join(OUTPUT_DIR, `prompt_${i + 1}.txt`), 
        prompt
      );
      
      // Test Claude summarization if API key is available
      let summary = null;
      let summarySuccess = false;
      
      if (process.env.ANTHROPIC_API_KEY) {
        try {
          console.log('Testing Claude summarization...');
          
          // If this isn't the first test case, add a delay before calling Claude API
          if (i > 0) {
            console.log(`Waiting ${CLAUDE_API_DELAY/1000} seconds before next Claude API call to avoid rate limiting...`);
            await new Promise(resolve => setTimeout(resolve, CLAUDE_API_DELAY));
          }
          
          summary = await generateSummary(prompt);
          summarySuccess = true;
          console.log(`Summary size: ${(summary.length / 1024).toFixed(2)} KB`);
          
          // Save summary
          await fs.writeFile(
            path.join(OUTPUT_DIR, `summary_${i + 1}.txt`),
            summary
          );
        } catch (error) {
          console.error(`Error generating summary: ${error.message}`);
          console.error(`Summarization failed: ${error.message}`);
          
          // Save error
          await fs.writeFile(
            path.join(OUTPUT_DIR, `summary_error_${i + 1}.txt`),
            `Error: ${error.message}`
          );
        }
      } else {
        console.log('Skipping Claude summarization (no API key)');
        summary = 'API key not provided. Summarization skipped.';
      }
      
      // Record test result
      testResults.push({
        testCase: testCase.description,
        success: true,
        url: successfulUrl,
        filingType,
        isInlineXbrl,
        rawContentSizeKB: contentSizeKB,
        formattedContentSizeKB: formattedSizeKB,
        summarization: {
          success: summarySuccess,
          size: summary ? (summary.length / 1024).toFixed(2) + ' KB' : 'N/A'
        }
      });
    }
    
    // Save test results summary
    await fs.writeFile(
      path.join(OUTPUT_DIR, 'test_results_summary.json'),
      JSON.stringify(testResults, null, 2)
    );
    
    // Print test summary
    console.log('\n=== Test Summary ===');
    for (const result of testResults) {
      console.log(`${result.testCase}: ${result.success ? '✓' : '✗'}`);
      if (result.success) {
        console.log(`  URL: ${result.url}`);
        console.log(`  Filing Type: ${result.filingType}`);
        console.log(`  Raw Content: ${result.rawContentSizeKB} KB`);
        console.log(`  Formatted Content: ${result.formattedContentSizeKB} KB`);
        console.log(`  Summarization: ${result.summarization.success ? '✓' : '✗'} (${result.summarization.size})`);
      } else {
        console.log(`  Error: ${result.error}`);
      }
    }
    
    console.log(`\nTest completed. Results saved to ${OUTPUT_DIR}`);
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

/**
 * Generate a prompt for Claude summarization
 */
function generatePrompt(content, filingType) {
  return `
I need you to analyze the following ${filingType} SEC filing for Tesla, Inc. and provide a concise summary focusing on:

1. Key financial results and metrics
2. Important business developments and operations
3. Major risks and challenges
4. Future outlook and guidance
5. Any notable changes from previous filings

Please organize your summary in a clear, structured format that highlights the most important information for investors. Focus on extracting insights that would be most relevant for investment decision-making.

Here is the filing content:

${content}
`;
}

/**
 * Generate a summary using Claude API with retry mechanism
 * @param {string} prompt - The prompt to send to Claude
 * @param {object} options - Options for the API call
 * @returns {Promise<string>} - The generated summary
 */
async function generateSummary(prompt, options = {}) {
  const {
    maxRetries = 3,
    initialBackoff = 2000, // 2 seconds
    maxBackoff = 30000 // 30 seconds
  } = options;
  
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      // Check for API key
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY environment variable is not set');
      }
      
      // If this is a retry, log and wait with exponential backoff
      if (attempt > 0) {
        const backoffTime = Math.min(initialBackoff * Math.pow(2, attempt - 1), maxBackoff);
        console.log(`Retry attempt ${attempt}/${maxRetries} after ${backoffTime/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }

      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60-second timeout

      try {
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
              'x-api-key': process.env.ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01'
            },
            signal: controller.signal
          }
        );

        // Clear the timeout
        clearTimeout(timeoutId);

        // Validate response format
        if (!response.data?.content || !Array.isArray(response.data.content) || response.data.content.length === 0) {
          throw new Error('Invalid response format from Claude API');
        }

        return response.data.content[0].text;
      } catch (axiosError) {
        // Handle timeout
        if (axiosError.name === 'AbortError' || axiosError.code === 'ECONNABORTED') {
          throw new Error('Claude API request timed out after 60 seconds');
        }

        // Get error message
        const errorMessage = axiosError.response?.data?.error?.message || 
                            axiosError.response?.statusText || 
                            axiosError.message || 
                            'Unknown error';
        
        // Check if this is a rate limit error
        const isRateLimit = errorMessage.includes('rate limit') || 
                          axiosError.response?.status === 429;
        
        // If it's a rate limit error and we have retries left, continue to retry
        // Otherwise throw the error
        if (isRateLimit && attempt < maxRetries) {
          console.log(`Rate limit error detected, will retry: ${errorMessage}`);
        } else {
          throw new Error(`Claude API error: ${errorMessage}`);
        }
      } finally {
        // Ensure timeout is cleared in all cases
        clearTimeout(timeoutId);
      }
    } catch (error) {
      // If this is the last attempt or not a retryable error, rethrow
      if (attempt >= maxRetries || !error.message.includes('rate limit')) {
        console.error('Error generating summary after retries:', error.message);
        throw error;
      }
    }
    
    // Increment attempt counter
    attempt++;
  }
  
  // If we've exhausted all retries without returning, throw an error
  throw new Error('Failed to generate summary after all retry attempts');
}

// Run the test
runTest();
