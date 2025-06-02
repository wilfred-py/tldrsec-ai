// Test script for email summary functionality
import filingService from './services/filingService';
import { FilingSummaryResult } from './services/filingService';

async function testEmailSummary() {
  console.log('Testing email summary functionality...');
  
  try {
    // Replace with a valid email address for testing
    const testEmail = 'test@example.com';
    const tickers = ['TSLA', 'AAPL'];
    
    console.log(`Sending email summary to ${testEmail} for tickers: ${tickers.join(', ')}`);
    
    const result = await filingService.sendEmailSummary(testEmail, tickers);
    
    console.log('Email summary result:', result);
    console.log('Test completed');
  } catch (error) {
    console.error('Error testing email summary:', error);
  }
}

// Run the test
testEmailSummary().catch(error => {
  console.error('Unhandled error in test script:', error);
  process.exit(1);
});
