// Simple test script for SEC Edgar API
import { SECEdgarClient } from '../lib/sec-edgar/client.js';

// Initialize SEC Edgar client with a proper user agent
const secClient = new SECEdgarClient({
  userAgent: 'TLDRSEC-AI-App contact@example.com',
  maxRequestsPerSecond: 2 // Be conservative with rate limits
});

// Tesla's CIK and ticker
const teslaCIK = '0001318605';
const teslaTicker = 'TSLA';

async function testSECApi() {
  console.log('Testing SEC Edgar API...');
  
  try {
    // Test 1: Get company info by CIK
    console.log('\nTest 1: Get company info by CIK');
    console.log('--------------------------------');
    try {
      const companyInfo = await secClient.getCompanyInfo(teslaCIK);
      console.log('Company info response type:', typeof companyInfo);
      console.log('Company info keys:', Object.keys(companyInfo || {}));
      console.log('Success!');
    } catch (error) {
      console.error('Error fetching by CIK:', error);
    }
    
    // Test 2: Get company info by ticker
    console.log('\nTest 2: Get company info by ticker');
    console.log('----------------------------------');
    try {
      const companyInfoByTicker = await secClient.getCompanyInfo(teslaTicker);
      console.log('Company info response type:', typeof companyInfoByTicker);
      console.log('Company info keys:', Object.keys(companyInfoByTicker || {}));
      console.log('Success!');
    } catch (error) {
      console.error('Error fetching by ticker:', error);
    }
    
    // Test 3: Get recent filings
    console.log('\nTest 3: Get recent filings');
    console.log('-------------------------');
    try {
      const filings = await secClient.getRecentFilings({
        cik: teslaCIK,
        count: 5
      });
      console.log('Filings response type:', typeof filings);
      console.log('Filings keys:', Object.keys(filings || {}));
      if (filings.entries) {
        console.log(`Found ${filings.entries.length} filings`);
        if (filings.entries.length > 0) {
          console.log('First filing:', filings.entries[0]);
        }
      }
      console.log('Success!');
    } catch (error) {
      console.error('Error fetching recent filings:', error);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testSECApi().catch(console.error);
