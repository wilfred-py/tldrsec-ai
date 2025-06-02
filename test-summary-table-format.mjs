// Test script to demonstrate the filing summary table format in server logs
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testSummaryTableFormat() {
  console.log('===== TESTING FILING SUMMARY TABLE FORMAT =====');
  
  // Mock data for demonstration
  const email = 'test@example.com';
  const summaries = [
    {
      ticker: 'AAPL',
      filingType: '10-K',
      tokensUsed: 15420,
      cost: 0.0235,
      processingStatus: 'COMPLETED'
    },
    {
      ticker: 'MSFT',
      filingType: '10-Q',
      tokensUsed: 8750,
      cost: 0.0142,
      processingStatus: 'COMPLETED'
    },
    {
      ticker: 'GOOGL',
      filingType: '8-K',
      tokensUsed: 5230,
      cost: 0.0087,
      processingStatus: 'COMPLETED'
    }
  ];
  
  const errors = [
    { ticker: 'AMZN', error: 'No recent filings found' },
    { ticker: 'META', error: 'API rate limit exceeded' }
  ];
  
  // Generate a summary table for the logs
  console.log(`\n[INFO][FilingService] ========== FILING SUMMARY REPORT ==========`);
  console.log(`[INFO][FilingService] Time: ${new Date().toISOString()}`);
  console.log(`[INFO][FilingService] Recipient: ${email}`);
  console.log(`[INFO][FilingService] ----------------------------------------`);
  console.log(`[INFO][FilingService] | Ticker | Filing Type | Status      | Tokens | Cost ($) |`);
  console.log(`[INFO][FilingService] |--------|------------|-------------|--------|---------|`);
  
  // Add each summary to the table
  for (const summary of summaries) {
    const ticker = summary.ticker.padEnd(6);
    const filingType = summary.filingType.padEnd(10);
    const status = 'Success'.padEnd(11);
    const tokens = (summary.tokensUsed?.toString() || 'N/A').padEnd(6);
    const cost = (summary.cost?.toFixed(4) || 'N/A').padEnd(7);
    console.log(`[INFO][FilingService] | ${ticker} | ${filingType} | ${status} | ${tokens} | ${cost} |`);
  }
  
  // Add each error to the table
  for (const error of errors) {
    const ticker = error.ticker.padEnd(6);
    const filingType = 'N/A'.padEnd(10);
    const status = 'Failed'.padEnd(11);
    const tokens = 'N/A'.padEnd(6);
    const cost = 'N/A'.padEnd(7);
    console.log(`[INFO][FilingService] | ${ticker} | ${filingType} | ${status} | ${tokens} | ${cost} |`);
  }
  
  // Add summary statistics
  console.log(`[INFO][FilingService] ----------------------------------------`);
  const totalTokens = summaries.reduce((sum, s) => sum + (s.tokensUsed || 0), 0);
  const totalCost = summaries.reduce((sum, s) => sum + (s.cost || 0), 0).toFixed(4);
  console.log(`[INFO][FilingService] | Total  | ${summaries.length} success | ${errors.length} failed | ${totalTokens} | ${totalCost} |`);
  console.log(`[INFO][FilingService] ========================================\n`);
  
  console.log('\n===== TEST COMPLETED =====');
  console.log('The above table format will be displayed in the server logs after the filing service completes.');
  console.log('This provides a clear summary of processing results, token usage, and costs.');
}

// Run the test
testSummaryTableFormat().catch(error => {
  console.error('Unhandled error in test script:', error);
});
