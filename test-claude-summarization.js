/**
 * Test Claude AI Summarization for SEC filings
 * 
 * This test verifies that:
 * 1. Claude AI summarization is properly integrated
 * 2. Real content is being extracted from SEC filings
 * 3. Summaries are cached in the database and reused when requested again
 * 
 * Run with: node --experimental-specifier-resolution=node test-claude-summarization.js
 */

import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Allow requiring modules in ESM
const require = createRequire(import.meta.url);

// Helper to dynamically import TS or JS files with proper pathing
async function importModule(path) {
  try {
    // First try direct import (works for .js files and TypeScript in Next.js environment)
    return await import(path);
  } catch (error) {
    // If the direct import fails, try alternative paths
    try {
      // Try with explicit .js extension (for ESM resolution)
      return await import(`${path}.js`);
    } catch (innerError) {
      // Try with file: protocol (for local files)
      try {
        return await import(pathToFileURL(path).href);
      } catch (finalError) {
        console.error(`Failed to import ${path}:`, finalError);
        throw finalError;
      }
    }
  }
}

// Main test function
async function testClaudeSummarization() {
  console.log('\n===== TESTING CLAUDE AI SEC FILING SUMMARIZATION =====\n');
  
  try {
    // Import the PrismaClient from generated directory
    console.log('Loading required modules...');
    const prismaModule = await importModule('./lib/generated/prisma/index.js');
    const prisma = new prismaModule.PrismaClient();
    
    // Suppress Prisma query logs to reduce console clutter
    prisma.$on('query', () => {
      // Do nothing with the query event
    });
    
    // Dynamically import the filing service with fallbacks
    console.log('Loading filing service...');
    let filingService;
    try {
      // Try importing directly using Next.js path resolution
      const module = await importModule('./services/filingService');
      filingService = module.default;
    } catch (error) {
      console.error('Error importing filing service:', error);
      throw error;
    }
    
    if (!filingService) {
      throw new Error('Failed to load filing service');
    }
    
    console.log('Services loaded successfully');
    
    // Test settings
    const ticker = 'AAPL';
    const formType = '10-K';
    
    console.log(`\nClearing any existing summaries for ${ticker} ${formType}...`);
    // Find the ticker record
    const tickerRecord = await prisma.ticker.findFirst({
      where: {
        symbol: ticker
      }
    });
    
    if (tickerRecord) {
      // Delete any existing summaries for this ticker and form type
      await prisma.summary.deleteMany({
        where: {
          tickerId: tickerRecord.id,
          filingType: formType
        }
      });
      console.log(`Deleted existing summaries for ${ticker} ${formType}`);
    } else {
      console.log(`No ticker record found for ${ticker}, will be created as needed`);
    }
    
    // Test 1: Generate a new summary with Claude AI
    console.log(`\nGenerating a new summary for ${ticker} ${formType} using Claude AI...`);
    const start = Date.now();
    const result = await filingService.getFilingSummary(ticker, formType);
    const duration = Date.now() - start;
    
    // Verify that the summary was generated successfully
    if (result.error) {
      console.error(`❌ Error: ${result.error}`);
      return;
    }
    
    if (!result.data) {
      console.error(`❌ No summary data returned`);
      return;
    }
    
    console.log(`✅ Generated summary in ${duration}ms`);
    
    // Verify that the summary used Claude AI
    const usedClaudeAi = result.data.model && result.data.model !== 'fallback' && result.data.model !== 'unknown';
    console.log(usedClaudeAi 
      ? `✅ Used Claude AI model: ${result.data.model}, with ${result.data.tokensUsed} tokens` 
      : `❌ Using fallback model: ${result.data.model}`);
    
    // Log summary metrics
    console.log('\nSummary Metrics:');
    console.log(`Model: ${result.data.model}`);
    console.log(`Tokens Used: ${result.data.tokensUsed}`);
    console.log(`Cost: $${result.data.cost}`);
    console.log(`Processing Status: ${result.data.processingStatus}`);
    console.log(`Processing Time: ${result.data.processingTimeMs}ms`);
    
    // Display a sample of the summary
    if (result.data.summaryText) {
      const summaryPreview = result.data.summaryText.length > 300 
        ? result.data.summaryText.substring(0, 300) + '...' 
        : result.data.summaryText;
      
      console.log('\nSummary Preview:');
      console.log(summaryPreview);
    }
    
    // Display key points
    if (result.data.keyPoints && result.data.keyPoints.length > 0) {
      console.log('\nKey Points:');
      result.data.keyPoints.slice(0, 3).forEach((point, index) => {
        console.log(`${index + 1}. ${point}`);
      });
      
      if (result.data.keyPoints.length > 3) {
        console.log(`... and ${result.data.keyPoints.length - 3} more points`);
      }
    }
    
    // Test 2: Verify database caching by requesting the same summary again
    console.log('\nTesting database caching by requesting the same summary again...');
    const cacheStart = Date.now();
    const cachedResult = await filingService.getFilingSummary(ticker, formType);
    const cacheDuration = Date.now() - cacheStart;
    
    // Verify the cached result
    if (!cachedResult.data) {
      console.error(`❌ No cached summary data returned`);
      return;
    }
    
    // The cached result should be returned much faster
    const usedCache = cacheDuration < duration / 2;
    console.log(usedCache
      ? `✅ Cache working: First request ${duration}ms, Second request ${cacheDuration}ms`
      : `❌ Cache not working: First request ${duration}ms, Second request ${cacheDuration}ms`);
    
    // Verify the summary content matches
    const contentMatches = cachedResult.data.summaryText === result.data.summaryText;
    console.log(contentMatches
      ? `✅ Cached summary content matches original`
      : `❌ Cached summary content differs from original`);
    
    // Compare metrics to verify it's the same cached summary
    const metricsMatch = 
      cachedResult.data.tokensUsed === result.data.tokensUsed &&
      cachedResult.data.model === result.data.model;
    
    console.log(metricsMatch
      ? `✅ Metrics consistency confirmed`
      : `❌ Metrics mismatch: Original (${result.data.tokensUsed} tokens, ${result.data.model}) vs Cached (${cachedResult.data.tokensUsed} tokens, ${cachedResult.data.model})`);
      
    console.log('\n===== TEST COMPLETED SUCCESSFULLY =====');
    
  } catch (error) {
    console.error('\nTest failed with error:');
    console.error(error);
  }
}

// Execute the test
testClaudeSummarization().catch(console.error);
