/**
 * Test script for SEC filing AI summarization
 * 
 * This script tests the AI summarization functionality for SEC filings
 * by fetching a filing for a specific ticker and generating a summary.
 */

// Use CommonJS require for compatibility
const filingService = require('./services/filingService');

// Configure test parameters
const TEST_TICKER = 'AAPL'; // Apple Inc.
const TEST_FILING_TYPE = '10-K'; // Annual report

async function testAiSummary() {
  console.log(`Testing AI summarization for ${TEST_TICKER} ${TEST_FILING_TYPE} filing...`);
  
  try {
    // Get the filing summary
    const result = await filingService.getFilingSummary(TEST_TICKER, TEST_FILING_TYPE);
    
    if (result.error) {
      console.error(`Error getting filing summary: ${result.error}`);
      return;
    }
    
    if (!result.data) {
      console.error('No summary data returned');
      return;
    }
    
    // Log the summary details
    console.log('\n=== FILING SUMMARY RESULTS ===');
    console.log(`Ticker: ${result.data.ticker}`);
    console.log(`Company: ${result.data.companyName}`);
    console.log(`Filing Type: ${result.data.filingType}`);
    console.log(`Filing Date: ${result.data.filingDate}`);
    console.log(`Filing URL: ${result.data.filingUrl}`);
    console.log(`Accession Number: ${result.data.accessionNumber}`);
    
    // Log the summary text (first 500 chars)
    console.log('\n=== SUMMARY TEXT (EXCERPT) ===');
    console.log(result.data.summaryText.substring(0, 500) + '...');
    
    // Log the key points
    console.log('\n=== KEY POINTS ===');
    if (result.data.keyPoints && result.data.keyPoints.length > 0) {
      result.data.keyPoints.forEach((point, index) => {
        console.log(`${index + 1}. ${point}`);
      });
    } else {
      console.log('No key points available');
    }
    
    console.log('\n=== TEST COMPLETED SUCCESSFULLY ===');
  } catch (error) {
    console.error('Error running test:', error);
  }
}

// Run the test
testAiSummary().catch(console.error);
