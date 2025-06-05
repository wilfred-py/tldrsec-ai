import 'dotenv/config'; // Load .env file before other imports
// Test script for email summary functionality with enhanced logging
import filingService from './services/filingService';
import * as secService from './services/secService';
import { prisma } from './lib/db/prisma';

// Suppress Prisma query logs to reduce console clutter
// @ts-ignore - Ignore type error for Prisma event listener
prisma.$on('query', () => {
  // Do nothing with the query event
});

async function testEmailSummary() {
  console.log('===== TESTING EMAIL SUMMARY FUNCTIONALITY WITH REAL DATA =====');
  
  try {
    // Use the configured test email or provide a default
    const testEmail = process.env.TEST_EMAIL || 'test@example.com';
    console.log(`Will send test email to: ${testEmail}`);
    
    // Focus on just one ticker for a clean test
    const ticker = 'TSLA'; // Tesla, Inc.
    console.log(`Testing with ticker: ${ticker}`);
    
    // First verify we can fetch filings for this ticker
    console.log('\n===== FETCHING SEC FILINGS =====');
    console.log(`Fetching latest filings for ${ticker}...`);
    
    // Get the latest filings for this ticker, focusing on important ones like 10-K and 10-Q
    const filings = await secService.getLatestFilings(ticker, 5);
    
    if (!filings || filings.length === 0) {
      throw new Error(`No filings found for ${ticker}. Cannot proceed with test.`);
    }
    
    console.log(`SUCCESS: Found ${filings.length} filings for ${ticker}`);
    
    // Get the exact three filings we expect (SD, Form 4, Form 4)
    console.log('Available filings:', filings.slice(0, 5).map(f => 
      `${f.form} (${new Date(f.filingDate).toLocaleDateString()})`).join(', '));
    
    // Use all three filings for our test
    const targetFilings = filings.slice(0, 3);
    
    if (targetFilings.length < 3) {
      console.log('Did not find all three expected filings. Using what we found.');
      var filingsToUse = targetFilings;
    } else {
      console.log('Found all three target filings:');
      targetFilings.forEach(f => {
        console.log(`- ${f.form} from ${new Date(f.filingDate).toLocaleDateString()}`);
      });
      var filingsToUse = targetFilings;
    }
    
    // Now test the full email summary flow with REAL sending
    console.log('\n===== GENERATING AND SENDING REAL EMAIL SUMMARY =====');
    console.log(`Target filings: ${filingsToUse.map(f => f.form).join(', ')}`);
    console.log(`Sending email summary to ${testEmail} for ticker: ${ticker}`);
    
    // Force debug mode for verbose logging but ensure we're actually sending the email
    // Setting ACTUALLY_SEND_EMAIL environment variable to override any default behavior
    process.env.ACTUALLY_SEND_EMAIL = 'true';
    
    console.log('Email sending is ENABLED for this test');
    
    // For a test script we need to inject custom options
    // @ts-ignore - Direct modification of the service function for testing purposes
    const origSendEmailSummary = filingService.sendEmailSummary;
    // @ts-ignore - Temporarily modify the function to bypass debug mode preventing sending
    filingService.sendEmailSummary = async (email, tickers, options = {}) => {
      console.log('Using modified sendEmailSummary function to ensure real email is sent');
      // If ACTUALLY_SEND_EMAIL is true, call the original function with debug: false to send a real email.
      // Otherwise, respect the original debug intention (though this test script always sets ACTUALLY_SEND_EMAIL=true).
      const effectiveDebug = process.env.ACTUALLY_SEND_EMAIL !== 'true';
      return origSendEmailSummary(email, tickers, effectiveDebug);
    };
    
    // Now call the function to send a real email
    const result = await filingService.sendEmailSummary(
      testEmail,
      [ticker]
    );
    
    // Restore original function
    // @ts-ignore - Restore the modified function
    filingService.sendEmailSummary = origSendEmailSummary;
    
    // Analyze the result
    console.log('\n===== EMAIL SUMMARY RESULTS =====');
    if (result.success) {
      console.log(`SUCCESS: Email summary process completed successfully`);
      console.log(`Generated ${result.summaries?.length || 0} summaries`);
      console.log(`Encountered ${result.errors?.length || 0} errors`);
      
      // Display summary information
      if (result.summaries && result.summaries.length > 0) {
        console.log('\n===== SUMMARY DETAILS =====');
        for (const summary of result.summaries) {
          console.log(`\n--- ${summary.ticker} (${summary.filingType}) ---`);
          // Show available summary identifiers - the structure might vary
          console.log(`Summary details: ${JSON.stringify(Object.keys(summary)).substring(0, 100)}`);
          console.log(`Filing URL: ${summary.filingUrl}`);
          // Show the first 300 chars of the summary with ellipsis
          console.log(`Summary Preview: ${summary.summaryText.substring(0, 300)}...`);
        }
        
        console.log(`\n✅ Successfully sent email with ${result.summaries.length} filing summaries to ${testEmail}`);
      } else {
        console.warn(`WARNING: Email was sent but no summaries were generated.`);
      }
      
      // Display error information
      if (result.errors && result.errors.length > 0) {
        console.log('\n===== ERROR DETAILS =====');
        for (const error of result.errors) {
          console.log(`- ${error.ticker}: ${error.error}`);
        }
      }
    } else {
      console.error(`FAILURE: Email summary process failed`);
      console.error(`Error: ${result.error || 'Unknown error'}`);
    }
    
    console.log('\n===== TEST COMPLETED =====');
  } catch (error) {
    console.error('Error testing email summary:', error);
  } finally {
    // Close Prisma client to prevent hanging process
    await prisma.$disconnect();
  }
}

// Run the test
testEmailSummary().catch(error => {
  console.error('Unhandled error in test script:', error);
  prisma.$disconnect().then(() => process.exit(1));
});
