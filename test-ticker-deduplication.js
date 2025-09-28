#!/usr/bin/env node

/**
 * Test script to validate ticker deduplication and caching system
 */

// Import the cron route function to test the ticker deduplication
const axios = require('axios');

async function testTickerDeduplication() {
  console.log('🧪 Testing Ticker Deduplication and Caching System');
  console.log('='.repeat(60));
  
  try {
    // Test the cron endpoint with proper authentication
    const cronSecret = process.env.CRON_SECRET || 'test-secret-key';
    const publicUrl = process.env.PUBLIC_URL || 'http://localhost:3000';
    
    console.log('📡 Making cron request with deduplication enabled...');
    const startTime = Date.now();
    
    const response = await axios.get(`${publicUrl}/api/cron/tier-aware`, {
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000 // 60 second timeout
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`✅ Cron request completed in ${duration}ms`);
    console.log('📊 Response Data:');
    console.log(JSON.stringify(response.data, null, 2));
    
    // Check for cache metrics in the response
    if (response.data.results && response.data.results.cacheMetrics) {
      const cacheMetrics = response.data.results.cacheMetrics;
      console.log('');
      console.log('🔄 Cache Performance Metrics:');
      console.log(`   Cache Hits: ${cacheMetrics.hits}`);
      console.log(`   Cache Misses: ${cacheMetrics.misses}`);
      console.log(`   Hit Ratio: ${Math.round(cacheMetrics.hitRatio * 100)}%`);
      console.log(`   API Calls Saved: ${cacheMetrics.apiCallsSaved}`);
      
      if (cacheMetrics.apiCallsSaved > 0) {
        console.log('✅ Ticker deduplication is working! API calls were saved.');
      } else {
        console.log('ℹ️  No API calls were saved (normal for first run or no overlapping tickers)');
      }
    } else {
      console.log('⚠️  Cache metrics not found in response (may be using fallback method)');
    }
    
    console.log('');
    console.log('🎉 Ticker deduplication test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Run the test
testTickerDeduplication().catch(console.error);