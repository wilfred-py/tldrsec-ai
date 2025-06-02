// Test script for email summary functionality with enhanced logging
import filingService from './services/filingService';
import * as secService from './services/secService';
import { prisma } from './lib/db/prisma';

// Suppress Prisma query logs to reduce console clutter
prisma.$on('query', () => {
  // Do nothing with the query event
});

async function testEmailSummary() {
  console.log('===== TESTING EMAIL SUMMARY FUNCTIONALITY =====');
  
  try {
    // Replace with a valid email address for testing
    const testEmail = 'test@example.com';
    
    // Get some tickers from the database to test with
    console.log('Fetching tickers from database...');
    const dbTickers = await prisma.ticker.findMany({
      take: 3, // Limit to 3 tickers for testing
      orderBy: { addedAt: 'desc' }
    });
    
    if (!dbTickers || dbTickers.length === 0) {
      console.log('No tickers found in database. Using default test tickers.');
      var tickers = ['AAPL', 'MSFT', 'GOOGL'];
    } else {
      var tickers = dbTickers.map(t => t.symbol);
      console.log(`Found ${tickers.length} tickers in database: ${tickers.join(', ')}`);
    }
    
    // First verify we can fetch filings for these tickers
    console.log('\n===== VERIFYING SEC FILINGS FETCH =====');
    for (const ticker of tickers) {
      console.log(`Fetching latest filings for ${ticker}...`);
      const filings = await secService.getLatestFilings(ticker, 3);
      
      if (filings && filings.length > 0) {
        console.log(`SUCCESS: Found ${filings.length} filings for ${ticker}`);
        console.log(`Latest filing: ${filings[0].form} (${new Date(filings[0].filingDate).toLocaleDateString()})`);
      } else {
        console.warn(`WARNING: No filings found for ${ticker}`);
      }
    }
    
    // Now test the full email summary flow
    console.log('\n===== TESTING FULL EMAIL SUMMARY FLOW =====');
    console.log(`Sending email summary to ${testEmail} for tickers: ${tickers.join(', ')}`);
    
    // Enable debug mode to see detailed logs but don't actually send the email
    const result = await filingService.sendEmailSummary(testEmail, tickers, { debug: true, skipSend: true });
    
    // Analyze the result
    console.log('\n===== EMAIL SUMMARY RESULTS =====');
    if (result.success) {
      console.log(`SUCCESS: Email summary process completed successfully`);
      console.log(`Generated ${result.summaries.length} summaries`);
      console.log(`Encountered ${result.errors.length} errors`);
      
      // Display summary information
      if (result.summaries.length > 0) {
        console.log('\n===== SUMMARY DETAILS =====');
        for (const summary of result.summaries) {
          console.log(`- ${summary.ticker} (${summary.filingType}): ${summary.summaryText.substring(0, 100)}...`);
        }
      }
      
      // Display error information
      if (result.errors.length > 0) {
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
