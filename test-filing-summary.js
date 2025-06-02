// Test script to verify SEC filing summary functionality
import filingService from './services/filingService.js';
import * as secService from './services/secService.js';

async function testFilingSummary() {
  console.log('Starting SEC Filing Summary Test');
  
  // Test ticker
  const ticker = 'AAPL';
  
  try {
    // 1. Get latest filing for the ticker
    console.log(`Fetching latest filing for ${ticker}...`);
    const latestFilings = await secService.getLatestFilings(ticker, 1);
    
    if (!latestFilings || latestFilings.length === 0) {
      console.error('No filings found for the ticker');
      return;
    }
    
    const latestFiling = latestFilings[0];
    console.log(`Latest filing found: ${latestFiling.form} filed on ${latestFiling.filingDate}`);
    
    // 2. Generate a summary for the filing
    console.log(`Generating summary for ${ticker} - ${latestFiling.form}...`);
    const result = await filingService.getFilingSummary(ticker, latestFiling.form);
    
    if (result.error) {
      console.error(`Error generating summary: ${result.error}`);
      return;
    }
    
    // 3. Verify the filing URL is using the HTML viewer format
    console.log('\n--- Filing Summary Results ---');
    console.log(`Company: ${result.data.companyName} (${result.data.ticker})`);
    console.log(`Filing Type: ${result.data.filingType}`);
    console.log(`Filing Date: ${result.data.filingDate}`);
    console.log(`Accession Number: ${result.data.accessionNumber}`);
    
    // Check if the URL is using the HTML viewer format (not ending with .txt)
    const filingUrl = result.data.filingUrl;
    console.log(`Filing URL: ${filingUrl}`);
    
    if (filingUrl.endsWith('.txt')) {
      console.error('ERROR: Filing URL is still using raw text format!');
    } else if (filingUrl.includes('/Archives/edgar/data/')) {
      console.log('SUCCESS: Filing URL is using the HTML viewer format');
    } else {
      console.warn('WARNING: Filing URL format could not be verified');
    }
    
    // 4. Check if summary text and key points were generated
    console.log('\n--- Summary Content ---');
    console.log(`Summary Text: ${result.data.summaryText.substring(0, 200)}...`);
    console.log(`Key Points: ${result.data.keyPoints.length} points found`);
    
    // 5. Generate email content to verify
    console.log('\n--- Email Content Preview ---');
    const emailHtml = filingService.generateEmailHtml([result.data], []);
    console.log(`HTML Email generated: ${emailHtml.length} characters`);
    
    const plainTextEmail = filingService.generatePlainTextEmail([result.data], []);
    console.log(`Plain Text Email generated: ${plainTextEmail.length} characters`);
    
    // Check if the HTML email contains the correct URL
    if (emailHtml.includes(filingUrl)) {
      console.log('SUCCESS: Email HTML contains the correct filing URL');
    } else {
      console.error('ERROR: Email HTML does not contain the correct filing URL');
    }
    
    // Check if the plain text email contains the correct URL
    if (plainTextEmail.includes(filingUrl)) {
      console.log('SUCCESS: Plain text email contains the correct filing URL');
    } else {
      console.error('ERROR: Plain text email does not contain the correct filing URL');
    }
    
    console.log('\nTest completed successfully!');
    
  } catch (error) {
    console.error('Test failed with error:', error);
  }
}

// Run the test
testFilingSummary();

// Export for module compatibility
export { testFilingSummary };
