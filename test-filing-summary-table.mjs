// Test script to verify the filing summary table in server logs
import { PrismaClient } from './lib/generated/prisma/index.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Initialize Prisma client
const prisma = new PrismaClient();

// Suppress Prisma query logs to reduce console clutter
prisma.$on('query', () => {
  // Do nothing with the query event
});

async function testFilingSummaryTable() {
  console.log('===== TESTING FILING SUMMARY TABLE IN SERVER LOGS =====');
  
  try {
    // Import the filing service
    const filingService = (await import('./services/filingService.js')).default;
    
    // Test email and tickers
    const testEmail = 'test@example.com';
    const testTickers = ['AAPL', 'MSFT', 'GOOGL'];
    
    console.log(`\nSending email summary for tickers: ${testTickers.join(', ')} to ${testEmail}`);
    console.log('This will generate a summary table in the server logs');
    
    // Call the sendEmailSummary function with debug mode to prevent actual email sending
    const result = await filingService.sendEmailSummary(testEmail, testTickers, true);
    
    console.log('\n===== TEST RESULTS =====');
    console.log(`Success: ${result.success}`);
    console.log(`Message: ${result.message}`);
    console.log(`Summaries generated: ${result.summaries?.length || 0}`);
    console.log(`Errors encountered: ${result.errors?.length || 0}`);
    
    console.log('\n===== TEST COMPLETED =====');
  } catch (error) {
    console.error('Error testing filing summary table:', error);
  } finally {
    // Close Prisma client to prevent hanging process
    await prisma.$disconnect();
  }
}

// Run the test
testFilingSummaryTable().catch(error => {
  console.error('Unhandled error in test script:', error);
  prisma.$disconnect().then(() => process.exit(1));
});
