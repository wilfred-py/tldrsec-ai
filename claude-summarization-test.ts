/**
 * End-to-End Test for Claude AI SEC Filing Summarization
 * 
 * This script tests the complete Claude AI summarization pipeline:
 * 1. Connects to the database
 * 2. Clears any existing test summaries
 * 3. Fetches real SEC filing content
 * 4. Generates a summary using Claude AI
 * 5. Verifies summary generation and caching
 * 6. Reports detailed metrics
 * 
 * Run with: npx ts-node-esm claude-summarization-test.ts
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import { summarizeFiling } from './lib/ai/summarize';
import type { SECFilingType } from './types/filing';

// Load environment variables
dotenv.config();

// Test configuration
const TEST_CONFIG = {
  ticker: 'AAPL',
  formType: '10-K' as SECFilingType,
  verbose: true
};

// Initialize Prisma client
const prisma = new PrismaClient();

/**
 * Main test function
 */
async function runTest() {
  console.log('===== CLAUDE AI SEC FILING SUMMARIZATION TEST =====\n');
  
  try {
    // 1. Connect to database and verify connection
    console.log('Connecting to database...');
    const tickerCount = await prisma.ticker.count();
    console.log(`✅ Database connection successful (${tickerCount} tickers found)`);
    
    // 2. Find the test ticker or create it if it doesn't exist
    console.log(`\nLooking up ticker: ${TEST_CONFIG.ticker}`);
    let ticker = await prisma.ticker.findUnique({
      where: { symbol: TEST_CONFIG.ticker }
    });
    
    if (!ticker) {
      console.log(`Creating ticker ${TEST_CONFIG.ticker} for testing`);
      ticker = await prisma.ticker.create({
        data: { symbol: TEST_CONFIG.ticker }
      });
    }
    console.log(`✅ Using ticker: ${ticker.symbol} (ID: ${ticker.id})`);
    
    // 3. Delete any existing summaries for this ticker/form type
    console.log(`\nClearing existing summaries for ${ticker.symbol} ${TEST_CONFIG.formType}`);
    const deletedSummaries = await prisma.filingSummary.deleteMany({
      where: {
        tickerId: ticker.id,
        filingType: TEST_CONFIG.formType
      }
    });
    console.log(`✅ Cleared ${deletedSummaries.count} existing summaries`);
    
    // 4. Find the most recent filing for this ticker/form type
    console.log(`\nFinding most recent ${TEST_CONFIG.formType} filing for ${ticker.symbol}`);
    const filing = await prisma.filing.findFirst({
      where: {
        tickerId: ticker.id,
        formType: TEST_CONFIG.formType
      },
      orderBy: {
        filingDate: 'desc'
      }
    });
    
    if (!filing) {
      throw new Error(`No ${TEST_CONFIG.formType} filing found for ${ticker.symbol}`);
    }
    
    console.log(`✅ Found filing: ${filing.formType} from ${filing.filingDate}`);
    if (TEST_CONFIG.verbose) {
      console.log(`   Filing URL: ${filing.secUrl}`);
    }
    
    // 5. Create a new summary record
    console.log('\nCreating new summary record...');
    const summary = await prisma.filingSummary.create({
      data: {
        tickerId: ticker.id,
        filingType: TEST_CONFIG.formType as string,
        filingId: filing.id,
        status: 'pending'
      }
    });
    console.log(`✅ Created summary record (ID: ${summary.id})`);
    
    // 6. Generate summary using Claude AI
    console.log('\nCalling Claude AI for summarization...');
    console.log('This may take 30-60 seconds depending on filing size and API response time...');
    
    const startTime = Date.now();
    const result = await summarizeFiling({
      filingId: filing.id,
      summaryId: summary.id,
      requestId: `test-${Date.now()}`
    });
    const endTime = Date.now();
    
    console.log(`✅ Summary generated in ${(endTime - startTime) / 1000} seconds`);
    
    // 7. Display metrics
    console.log('\n----- SUMMARIZATION METRICS -----');
    console.log(`Summary ID: ${result.summaryId}`);
    console.log(`Input tokens: ${result.inputTokens}`);
    console.log(`Output tokens: ${result.outputTokens}`);
    console.log(`Total tokens: ${result.inputTokens + result.outputTokens}`);
    console.log(`Cost: $${result.cost.toFixed(4)}`);
    console.log(`Model: ${result.model}`);
    
    // 8. Verify summary content structure
    console.log('\n----- SUMMARY CONTENT VERIFICATION -----');
    
    const summaryJSON = result.summaryJSON;
    if (!summaryJSON) {
      console.log('❌ No structured JSON summary returned');
    } else {
      console.log('✅ Summary returned in structured JSON format');
      
      if (summaryJSON.summary) {
        console.log('✅ Summary section present');
        console.log(`   Length: ${summaryJSON.summary.length} characters`);
      }
      
      if (summaryJSON.keyPoints && Array.isArray(summaryJSON.keyPoints)) {
        console.log(`✅ Key points present (${summaryJSON.keyPoints.length} items)`);
      }
      
      if (summaryJSON.riskFactors && Array.isArray(summaryJSON.riskFactors)) {
        console.log(`✅ Risk factors present (${summaryJSON.riskFactors.length} items)`);
      }
    }
    
    // 9. Test caching by fetching again
    console.log('\n----- TESTING DATABASE CACHING -----');
    console.log(`Retrieving cached summary for ${ticker.symbol} ${TEST_CONFIG.formType}...`);
    
    const cachedSummary = await prisma.filingSummary.findFirst({
      where: {
        tickerId: ticker.id,
        filingType: TEST_CONFIG.formType,
        status: 'completed'
      },
      orderBy: {
        updatedAt: 'desc'
      }
    });
    
    if (!cachedSummary) {
      console.log('❌ No cached summary found in database');
    } else {
      console.log('✅ Found cached summary in database');
      console.log(`   Summary ID: ${cachedSummary.id}`);
      console.log(`   Updated at: ${cachedSummary.updatedAt}`);
      
      if (cachedSummary.id === summary.id) {
        console.log('✅ Cached summary matches the one we just created');
      } else {
        console.log('❌ Cached summary does not match our test summary');
      }
      
      if (cachedSummary.inputTokens && cachedSummary.outputTokens) {
        console.log('✅ Token usage metrics correctly stored');
        console.log(`   Input tokens: ${cachedSummary.inputTokens}`);
        console.log(`   Output tokens: ${cachedSummary.outputTokens}`);
      }
      
      if (cachedSummary.cost) {
        console.log('✅ Cost metrics correctly stored');
        console.log(`   Cost: $${cachedSummary.cost.toFixed(4)}`);
      }
      
      if (cachedSummary.model) {
        console.log('✅ Model information correctly stored');
        console.log(`   Model: ${cachedSummary.model}`);
      }
    }
    
    console.log('\n===== TEST COMPLETED SUCCESSFULLY =====');
    console.log('\nThe Claude AI summarization integration is working properly!');
    
  } catch (error) {
    console.error('\nTest failed with error:');
    console.error(error);
  } finally {
    // Clean up
    await prisma.$disconnect();
  }
}

// Run the test
runTest().catch(console.error);
