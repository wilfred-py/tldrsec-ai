// Test script to debug SEC filing summary issues with detailed logging
import axios from 'axios';

// Function to test the debug filing summary endpoint
async function testFilingSummary() {
  const ticker = 'TSLA';
  console.log(`Testing debug filing summary endpoint with ${ticker}...`);
  
  try {
    // Call our new debug API endpoint
    const response = await axios.post('http://localhost:3004/api/debug/filing-summary', {
      ticker
    });
    
    const data = response.data;
    
    // Print company info
    console.log('\n===== COMPANY INFO =====');
    console.log(`Company: ${data.company.name} (${ticker})`);
    console.log(`CIK: ${data.company.cik}`);
    console.log(`Tickers: ${data.company.tickers?.join(', ') || ticker}`);
    
    // Print filing info
    console.log('\n===== RECENT FILINGS =====');
    data.filings.forEach((filing, index) => {
      console.log(`\nFiling #${index + 1}:`);
      console.log(`  Form: ${filing.form}`);
      console.log(`  Filing Date: ${filing.filingDate}`);
      console.log(`  Report Date: ${filing.reportDate}`);
      console.log(`  URL: ${filing.filingUrl}`);
    });
    
    // Print summary results
    console.log('\n===== SUMMARY RESULTS =====');
    data.summaryResults.forEach((result, index) => {
      console.log(`\nSummary #${index + 1} for ${result.formType}:`);
      console.log(`  Success: ${result.success}`);
      
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
      
      if (result.summary) {
        console.log(`  Filing Type: ${result.summary.filingType}`);
        console.log(`  Filing Date: ${result.summary.filingDate}`);
        console.log(`  Key Points: ${result.summary.keyPointsCount}`);
        console.log(`  Summary Text: ${result.summary.summaryText.slice(0, 100)}...`);
      }
    });
    
  } catch (error) {
    console.error('Error response:', error.response?.data || error.message);
    if (error.response) {
      console.log('Status:', error.response.status);
    }
  }
}

// Execute the test
testFilingSummary();
