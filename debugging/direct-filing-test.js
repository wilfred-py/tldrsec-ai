// Direct test of filing service functions to debug SEC filing summary issues
// We need to use the API to interact with the services since they use TypeScript
import axios from 'axios';

// Test function that calls our debug API endpoint
async function testFilingDebug() {
  try {
    console.log('==========================================');
    console.log('Testing filing debug API endpoint');
    console.log('==========================================\n');
    
    const ticker = 'TSLA';
    console.log(`Testing debug API for ticker: ${ticker}\n`);
    
    // Call our debug API endpoint
    const response = await axios.post('http://localhost:3003/api/debug/filing-summary', {
      ticker
    });
    
    // Print the results in a readable format
    console.log('\n==========================================');
    console.log(`RESULTS FOR ${ticker}`);
    console.log('==========================================\n');
    
    const data = response.data;
    
    // Company information
    console.log('COMPANY INFORMATION:');
    console.log(`Name: ${data.company.name}`);
    console.log(`CIK: ${data.company.cik}`);
    console.log(`SIC: ${data.company.sic} - ${data.company.sicDescription}\n`);
    
    // Filings information
    console.log('LATEST FILINGS:');
    data.filings.forEach((filing, index) => {
      console.log(`Filing ${index + 1}:`);
      console.log(`  Form: ${filing.form}`);
      console.log(`  Filing Date: ${filing.filingDate}`);
      console.log(`  Accession Number: ${filing.accessionNumber}`);
      console.log(`  Report Date: ${filing.reportDate}`);
      console.log(`  Filing URL: ${filing.filingUrl}\n`);
    });
    
    // Summary results
    console.log('SUMMARY GENERATION RESULTS:');
    data.summaryResults.forEach((result, index) => {
      console.log(`Summary Test ${index + 1} for Form ${result.formType}:`);
      console.log(`  Success: ${result.success}`);
      
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
      
      if (result.summary) {
        console.log(`  Filing Type: ${result.summary.filingType}`);
        console.log(`  Filing Date: ${result.summary.filingDate}`);
        console.log(`  Key Points Count: ${result.summary.keyPointsCount}`);
        console.log(`  Summary Text: ${result.summary.summaryText}`);
      }
      
      console.log(''); // Empty line for readability
    });
    
    console.log('==========================================');
    console.log('Test completed');
    console.log('==========================================');
  } catch (error) {
    console.error('Error in test:');
    if (error.response) {
      // The request was made and the server responded with a status code
      console.error('Error response:', error.response.data);
      console.error('Status:', error.response.status);
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received from server');
    } else {
      // Something happened in setting up the request
      console.error('Error message:', error.message);
    }
  }
}

// Run the test
testFilingServiceDirectly();
