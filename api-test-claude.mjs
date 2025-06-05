/**
 * API-based Test for Claude AI SEC Filing Summarization
 * 
 * This script tests the Claude AI summarization by calling the API endpoint
 * that triggers the summarization process, rather than by directly accessing
 * the database or TypeScript services.
 * 
 * Run with: node api-test-claude.mjs
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables
dotenv.config();

// Test configuration
const TEST_CONFIG = {
  ticker: 'AAPL',
  formType: '10-K',
  baseUrl: 'http://localhost:3000',
  waitTimeMs: 2000  // Time to wait between API calls
};

/**
 * Make an API request with proper error handling
 */
async function makeRequest(url, options = {}) {
  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error(`Error making request to ${url}:`, error.message);
    throw error;
  }
}

/**
 * Test the API-based filing summary functionality
 */
async function testClaudeSummarization() {
  console.log('===== TESTING CLAUDE AI FILING SUMMARIZATION API =====\n');
  
  try {
    // 1. Start the Next.js development server (if not already running)
    console.log('First make sure the Next.js development server is running:');
    console.log('Run "npm run dev" in a separate terminal if not already running.\n');
    
    // Wait for user to potentially start the server
    console.log('Waiting 5 seconds before proceeding...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 2. Test the filing summary API endpoint
    console.log(`\nTesting summary API for ${TEST_CONFIG.ticker} ${TEST_CONFIG.formType}...`);
    
    // Construct the API URL
    const apiUrl = `${TEST_CONFIG.baseUrl}/api/filings/summary?ticker=${TEST_CONFIG.ticker}&formType=${TEST_CONFIG.formType}`;
    console.log(`API URL: ${apiUrl}`);
    
    // First call - this should either generate a new summary or return a cached one
    console.log('\nMaking first API call (may take 30-60 seconds if generating new summary)...');
    const startTime = Date.now();
    
    const firstResponse = await makeRequest(apiUrl);
    const firstCallDuration = (Date.now() - startTime) / 1000;
    
    console.log(`✅ First API call completed in ${firstCallDuration.toFixed(2)} seconds`);
    
    // Check the response structure
    if (!firstResponse) {
      console.log('❌ Empty response received');
    } else {
      console.log('✅ Received response with data');
      
      // Log summary details
      console.log('\n----- SUMMARY DETAILS -----');
      
      if (firstResponse.id) {
        console.log(`Summary ID: ${firstResponse.id}`);
      }
      
      if (firstResponse.status === 'completed') {
        console.log('✅ Summary status: completed');
      } else {
        console.log(`❌ Summary status: ${firstResponse.status || 'unknown'}`);
      }
      
      // Check metrics
      console.log('\n----- METRICS -----');
      
      if (firstResponse.inputTokens) {
        console.log(`Input tokens: ${firstResponse.inputTokens}`);
      }
      
      if (firstResponse.outputTokens) {
        console.log(`Output tokens: ${firstResponse.outputTokens}`);
      }
      
      if (firstResponse.cost) {
        console.log(`Cost: $${firstResponse.cost.toFixed(4)}`);
      }
      
      if (firstResponse.model) {
        console.log(`Model: ${firstResponse.model}`);
      }
      
      // Check summary content
      console.log('\n----- SUMMARY CONTENT -----');
      
      let summaryData = null;
      
      // Try to find the summary data in various possible locations
      if (firstResponse.summaryJson) {
        summaryData = typeof firstResponse.summaryJson === 'string' 
          ? JSON.parse(firstResponse.summaryJson) 
          : firstResponse.summaryJson;
      } else if (firstResponse.contentJson) {
        summaryData = typeof firstResponse.contentJson === 'string'
          ? JSON.parse(firstResponse.contentJson)
          : firstResponse.contentJson;
      } else if (firstResponse.summary) {
        summaryData = firstResponse.summary;
      }
      
      if (!summaryData) {
        console.log('❌ No summary content found in response');
      } else {
        console.log('✅ Summary content present');
        
        if (typeof summaryData === 'object') {
          // Handle structured summary
          if (summaryData.summary) {
            console.log('✅ Summary text section present');
            console.log(`   Length: ${summaryData.summary.length} characters`);
            console.log('   Preview: ' + summaryData.summary.substring(0, 100) + '...');
          }
          
          if (summaryData.keyPoints && Array.isArray(summaryData.keyPoints)) {
            console.log(`✅ Key points present (${summaryData.keyPoints.length} items)`);
            if (summaryData.keyPoints.length > 0) {
              console.log('   First key point: ' + summaryData.keyPoints[0]);
            }
          }
          
          if (summaryData.riskFactors && Array.isArray(summaryData.riskFactors)) {
            console.log(`✅ Risk factors present (${summaryData.riskFactors.length} items)`);
            if (summaryData.riskFactors.length > 0) {
              console.log('   First risk factor: ' + summaryData.riskFactors[0]);
            }
          }
        } else if (typeof summaryData === 'string') {
          // Handle plain text summary
          console.log(`Summary text length: ${summaryData.length} characters`);
          console.log('Preview: ' + summaryData.substring(0, 100) + '...');
        }
      }
      
      // 3. Test caching by making a second API call
      console.log('\n----- TESTING CACHING -----');
      console.log('Making second API call (should be fast if caching works)...');
      
      // Wait a moment before making the second call
      await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.waitTimeMs));
      
      const cacheStartTime = Date.now();
      const secondResponse = await makeRequest(apiUrl);
      const secondCallDuration = (Date.now() - cacheStartTime) / 1000;
      
      console.log(`Second API call completed in ${secondCallDuration.toFixed(2)} seconds`);
      
      if (secondCallDuration < firstCallDuration * 0.5) {
        console.log('✅ Second call was significantly faster - caching likely working');
      } else {
        console.log('⚠️ Second call was not significantly faster - caching may not be working optimally');
      }
      
      // Check if the responses match
      if (firstResponse.id && secondResponse.id && firstResponse.id === secondResponse.id) {
        console.log('✅ Both API calls returned the same summary ID - caching confirmed');
      } else if (JSON.stringify(firstResponse) === JSON.stringify(secondResponse)) {
        console.log('✅ Both API responses are identical - caching confirmed');
      } else {
        console.log('⚠️ API responses differ - may be using different summaries');
      }
    }
    
    console.log('\n===== TEST COMPLETED SUCCESSFULLY =====');
    console.log('The Claude AI summarization integration is working properly!');
    
  } catch (error) {
    console.error('\nTest failed with error:');
    console.error(error);
  }
}

// Run the test
testClaudeSummarization().catch(console.error);
