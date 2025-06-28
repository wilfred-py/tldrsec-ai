// Use CommonJS require syntax
const filingService = require('./services/filingService');
const { logger } = require('./lib/logging');

async function testVrtFiling() {
  try {
    console.log('Starting test for VRT filing with accession number 0000950142-25-001652');
    
    // The accession number that was causing the 404 error
    const accessionNumber = '0000950142-25-001652';
    // CIK for Vertiv Holdings Co
    const cik = '0001674101';
    
    console.log(`Fetching filing with accession number ${accessionNumber} and CIK ${cik}`);
    
    const result = await filingService.getFilingById(accessionNumber, cik);
    
    console.log('Successfully fetched filing:');
    console.log(`- Accession Number: ${result.data.accessionNumber}`);
    console.log(`- Filing Date: ${result.data.filingDate}`);
    console.log(`- Filing Code: ${result.data.filingCode}`);
    console.log(`- Company: ${result.data.company}`);
    console.log(`- Primary Document: ${result.data.primaryDocument}`);
    console.log('Content length:', result.data.content.length);
    
    // Check if the content contains some expected text to verify it's valid
    const contentSample = result.data.content.substring(0, 200);
    console.log('Content sample:', contentSample);
    
    console.log('Test completed successfully!');
    return true;
  } catch (error) {
    console.error('Test failed with error:', error);
    return false;
  }
}

// Run the test
testVrtFiling()
  .then(success => {
    console.log(`Test ${success ? 'PASSED' : 'FAILED'}`);
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Unexpected error during test execution:', error);
    process.exit(1);
  });
