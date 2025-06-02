/**
 * Script to check if user tickers are properly set up to receive SEC filings
 * 
 * This script:
 * 1. Fetches the current user's tracked tickers
 * 2. Checks if there are any SEC filings for these tickers
 * 3. Validates that the filing processing workflow is correctly configured
 */

// Import required modules
import { PrismaClient } from './lib/generated/prisma/index.js';

// Initialize Prisma client
const prisma = new PrismaClient();

// Mock user ID for testing (replace with actual user ID in production)
const TEST_USER_ID = process.argv[2] || 'test-user';

async function checkTickerSetup() {
  console.log(`\n=== Checking Ticker Setup for User: ${TEST_USER_ID} ===\n`);
  
  try {
    // 1. Get user and their tracked tickers
    const user = await prisma.user.findUnique({
      where: { id: TEST_USER_ID },
      include: { tickers: true },
    });

    if (!user) {
      console.error(`❌ User ${TEST_USER_ID} not found in database`);
      return false;
    }

    console.log(`✅ Found user: ${user.email || 'No email'}`);
    
    // 2. Check if user has any tracked tickers
    if (!user.tickers || user.tickers.length === 0) {
      console.log(`❌ User has no tracked tickers`);
      return false;
    }
    
    console.log(`✅ User is tracking ${user.tickers.length} tickers:`);
    user.tickers.forEach(ticker => {
      console.log(`   - ${ticker.symbol} (${ticker.companyName || 'Unknown Company'})`);
    });
    
    // 3. Check for SEC filings for each ticker
    console.log(`\n=== Checking SEC Filings for Tracked Tickers ===\n`);
    
    let hasFilings = false;
    for (const ticker of user.tickers) {
      const filings = await prisma.secFiling.findMany({
        where: {
          ticker: { id: ticker.id }
        },
        orderBy: { filingDate: 'desc' },
        take: 5
      });
      
      if (filings.length > 0) {
        hasFilings = true;
        console.log(`✅ Found ${filings.length} filings for ${ticker.symbol}:`);
        filings.forEach(filing => {
          console.log(`   - ${filing.formType} filed on ${filing.filingDate.toISOString().split('T')[0]}`);
          
          // Check if filing has a summary
          checkSummaryForFiling(filing.id);
        });
      } else {
        console.log(`❌ No filings found for ${ticker.symbol}`);
      }
    }
    
    if (!hasFilings) {
      console.log(`\n❌ No SEC filings found for any tracked tickers`);
      console.log(`   This could mean either:`);
      console.log(`   1. The system hasn't fetched filings yet`);
      console.log(`   2. There's an issue with the SEC filing fetching process`);
      return false;
    }
    
    // 4. Check the filing processing workflow configuration
    console.log(`\n=== Checking Filing Processing Workflow ===\n`);
    
    // Check if there are any pending summaries
    const pendingSummaries = await prisma.summary.findMany({
      where: { processingStatus: 'PENDING' },
      include: { filing: true },
      take: 5
    });
    
    if (pendingSummaries.length > 0) {
      console.log(`ℹ️ Found ${pendingSummaries.length} pending summaries:`);
      pendingSummaries.forEach(summary => {
        console.log(`   - Summary ID: ${summary.id} for filing: ${summary.filing?.formType || 'Unknown'}`);
      });
    } else {
      console.log(`✅ No pending summaries found - processing is up to date`);
    }
    
    // Check for failed summaries
    const failedSummaries = await prisma.summary.findMany({
      where: { processingStatus: 'FAILED' },
      include: { filing: true },
      take: 5
    });
    
    if (failedSummaries.length > 0) {
      console.log(`⚠️ Found ${failedSummaries.length} failed summaries:`);
      failedSummaries.forEach(summary => {
        console.log(`   - Summary ID: ${summary.id} for filing: ${summary.filing?.formType || 'Unknown'}`);
        console.log(`     Error: ${summary.processingError || 'Unknown error'}`);
      });
    } else {
      console.log(`✅ No failed summaries found`);
    }
    
    console.log(`\n=== Summary ===\n`);
    console.log(`✅ User ${TEST_USER_ID} is properly set up to receive SEC filings`);
    console.log(`✅ Tracked tickers: ${user.tickers.map(t => t.symbol).join(', ')}`);
    
    if (hasFilings) {
      console.log(`✅ SEC filings are being tracked for these tickers`);
    } else {
      console.log(`⚠️ No SEC filings found yet - system may still be fetching`);
    }
    
    return true;
  } catch (error) {
    console.error(`❌ Error checking ticker setup:`, error);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

async function checkSummaryForFiling(filingId) {
  try {
    const summary = await prisma.summary.findFirst({
      where: { filingId }
    });
    
    if (summary) {
      console.log(`     ✅ Summary: ${summary.processingStatus} ${summary.processingCompletedAt ? '(completed)' : '(pending)'}`);
    } else {
      console.log(`     ❌ No summary found for this filing`);
    }
  } catch (error) {
    console.error(`     ❌ Error checking summary:`, error);
  }
}

// Run the check
checkTickerSetup()
  .then(success => {
    if (success) {
      console.log('\n✅ Ticker setup check completed successfully');
    } else {
      console.log('\n⚠️ Ticker setup check completed with issues');
    }
    process.exit(0);
  })
  .catch(error => {
    console.error('\n❌ Ticker setup check failed:', error);
    process.exit(1);
  });
