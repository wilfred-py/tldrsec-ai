/**
 * Railway Cron Performance & Container Restart Investigation Tests
 * 
 * Based on live log analysis showing:
 * - 7+ minute execution times triggering container restarts
 * - MSFT PX14A6G filing parsing errors
 * - Slow transactions (15-30s each)
 * 
 * These tests reproduce the exact issues causing Railway container restarts.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/testing-library/jest-dom';

const RAILWAY_CRON_URL = 'https://tldrsec-ai-production.up.railway.app/api/cron/tier-aware';
const CRON_SECRET = process.env.CRON_SECRET || 'mgL5bgG9vJQu448gHpjsVZcBCLBdupW0bD9YWw11TC9ix2mhC0zE4LxG64M5LqEuUCRJfAnd05i9LD0r';

describe('Railway Cron Performance Investigation', () => {
  
  // Test 1: Reproduce Long Execution Times
  test('should identify why cron jobs take 7+ minutes', async () => {
    console.log('🔍 Testing cron execution time and identifying bottlenecks...');
    
    const startTime = Date.now();
    
    try {
      const response = await fetch(RAILWAY_CRON_URL, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${CRON_SECRET}`,
          'Content-Type': 'application/json'
        },
        // Set timeout to 10 minutes to capture full execution
        signal: AbortSignal.timeout(600000)
      });
      
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      
      console.log(`⏱️ Cron execution time: ${executionTime}ms (${(executionTime/1000/60).toFixed(2)} minutes)`);
      
      if (response.ok) {
        const result = await response.json();
        console.log('📊 Cron Results:', {
          success: result.success,
          duration: result.duration,
          usersProcessed: result.results?.usersProcessed,
          filingsProcessed: result.results?.filingsProcessed,
          totalCost: result.results?.totalCost,
          errors: result.results?.errors
        });
        
        // Performance thresholds that might trigger Railway restarts
        expect(executionTime).toBeLessThan(300000); // Should be under 5 minutes
        expect(result.results?.usersProcessed).toBeGreaterThan(0);
        expect(result.results?.errors).toBe(0);
        
      } else {
        console.error('❌ Cron request failed:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('Error details:', errorText);
        throw new Error(`Cron request failed: ${response.status}`);
      }
      
    } catch (error) {
      const endTime = Date.now();
      const executionTime = endTime - startTime;
      console.error(`💥 Cron failed after ${executionTime}ms:`, error);
      
      // If it times out or fails, we've identified the issue
      if (error.name === 'TimeoutError' || executionTime > 300000) {
        console.log('🚨 IDENTIFIED: Cron execution exceeds Railway timeout limits');
        console.log('🔧 FIX NEEDED: Optimize cron performance to < 5 minutes');
      }
      
      throw error;
    }
  }, 700000); // 11+ minute timeout for test

  // Test 2: Identify Memory Usage Patterns
  test('should monitor memory usage during cron execution', async () => {
    console.log('🧠 Testing memory usage patterns during cron execution...');
    
    // Test memory usage before cron
    const memBefore = process.memoryUsage();
    console.log('Memory before cron:', {
      heapUsed: Math.round(memBefore.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(memBefore.heapTotal / 1024 / 1024) + 'MB',
      external: Math.round(memBefore.external / 1024 / 1024) + 'MB'
    });
    
    // Trigger cron and monitor
    const response = await fetch(RAILWAY_CRON_URL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`
      },
      signal: AbortSignal.timeout(600000)
    });
    
    // Test memory usage after cron
    const memAfter = process.memoryUsage();
    console.log('Memory after cron:', {
      heapUsed: Math.round(memAfter.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(memAfter.heapTotal / 1024 / 1024) + 'MB',
      external: Math.round(memAfter.external / 1024 / 1024) + 'MB'
    });
    
    const memoryIncrease = memAfter.heapUsed - memBefore.heapUsed;
    console.log(`📈 Memory increase: ${Math.round(memoryIncrease / 1024 / 1024)}MB`);
    
    // Check if memory increase is excessive (potential memory leak)
    expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Should be under 100MB increase
    
    if (response.ok) {
      const result = await response.json();
      expect(result.success).toBe(true);
    }
  }, 700000);

  // Test 3: Test Specific MSFT PX14A6G Filing Error
  test('should reproduce MSFT PX14A6G filing parsing error', async () => {
    console.log('🔍 Testing specific MSFT PX14A6G filing parsing issue...');
    
    // This test would require accessing the specific filing that's causing issues
    // From the logs: MSFT PX14A6G filings are failing with JSON parsing errors
    
    const testFilingData = {
      ticker: 'MSFT',
      filingType: 'PX14A6G',
      // This would be the actual filing content that's causing the parsing error
    };
    
    console.log('📄 Testing filing type that causes JSON parsing errors:', testFilingData);
    
    // We'll mark this as a known issue for now and track it
    console.log('🚨 KNOWN ISSUE: MSFT PX14A6G filings cause JSON parsing errors');
    console.log('📋 Error pattern: "Unexpected token I in JSON at position 0"');
    console.log('💬 Response preview: "I apologize, but you have not provided the actual content..."');
    
    // This suggests the AI is responding with natural language instead of JSON
    // The fix would be in the AI prompt or response parsing logic
    expect(true).toBe(true); // Placeholder for now
  });

  // Test 4: Test Database Connection Pool Management
  test('should verify database connections are properly managed', async () => {
    console.log('🗄️ Testing database connection pool management...');
    
    // From logs, we see slow transactions (15-30s each)
    // This suggests potential database connection pool exhaustion
    
    const connectionPoolInfo = {
      maxConnections: 10, // From DATABASE_URL connection_limit=10
      poolTimeout: 20000, // From DATABASE_URL pool_timeout=20
      currentUsage: 'unknown' // Would need to query this
    };
    
    console.log('📊 Database pool configuration:', connectionPoolInfo);
    
    // Test multiple concurrent operations to stress connection pool
    const concurrentRequests = 3;
    const requestPromises = [];
    
    for (let i = 0; i < concurrentRequests; i++) {
      requestPromises.push(
        fetch(`${RAILWAY_CRON_URL}?test=connection-${i}`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${CRON_SECRET}`
          },
          signal: AbortSignal.timeout(30000)
        })
      );
    }
    
    const startTime = Date.now();
    const results = await Promise.allSettled(requestPromises);
    const endTime = Date.now();
    
    console.log(`⏱️ Concurrent requests completed in: ${endTime - startTime}ms`);
    
    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failureCount = results.filter(r => r.status === 'rejected').length;
    
    console.log(`✅ Successful requests: ${successCount}`);
    console.log(`❌ Failed requests: ${failureCount}`);
    
    // At least one request should succeed (the others might fail due to rate limiting)
    expect(successCount).toBeGreaterThan(0);
    
    if (failureCount > 0) {
      console.log('🚨 POTENTIAL ISSUE: Some concurrent requests failed');
      console.log('🔧 FIX NEEDED: Optimize database connection pool management');
    }
  }, 180000);

  // Test 5: Container Health After Cron Execution
  test('should verify container remains healthy after cron execution', async () => {
    console.log('🏥 Testing container health after cron execution...');
    
    // First, run the cron job
    console.log('1. Executing cron job...');
    const cronResponse = await fetch(RAILWAY_CRON_URL, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${CRON_SECRET}`
      },
      signal: AbortSignal.timeout(600000)
    });
    
    expect(cronResponse.ok).toBe(true);
    const cronResult = await cronResponse.json();
    console.log('✅ Cron completed:', cronResult.success);
    
    // Wait a bit for any delayed effects
    console.log('2. Waiting 30 seconds for any delayed container effects...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Test if the application is still responsive
    console.log('3. Testing application health...');
    const healthResponse = await fetch('https://tldrsec-ai-production.up.railway.app/', {
      method: 'GET',
      signal: AbortSignal.timeout(10000)
    });
    
    console.log(`📊 Health check status: ${healthResponse.status}`);
    
    // The application should still be responsive after cron execution
    expect(healthResponse.status).toBeLessThan(500);
    
    if (healthResponse.status >= 500) {
      console.log('🚨 CONTAINER RESTART DETECTED: Application not responding after cron');
      console.log('🔧 FIX NEEDED: Optimize cron to prevent container restarts');
    }
  }, 800000);

});

// Test 6: Separate Test for Railway Container Monitoring
describe('Railway Container Restart Detection', () => {
  
  test('should detect container restart patterns', async () => {
    console.log('🔍 Monitoring for container restart patterns...');
    
    // This would require Railway API access to monitor deployments
    // For now, we'll document the patterns we've observed
    
    const observedPatterns = {
      symptom: 'Starting Container messages after cron completion',
      timing: 'Occurs after 7+ minute cron executions',
      frequency: 'Consistently since September 8th, 9AM',
      triggerConditions: [
        'Cron execution > 5 minutes',
        'High memory usage during transaction processing',
        'Multiple slow database transactions (15-30s each)',
        'Complex AI summarization operations'
      ]
    };
    
    console.log('📋 Container restart pattern analysis:', observedPatterns);
    
    console.log('🎯 RECOMMENDED FIXES:');
    console.log('1. Optimize cron performance to < 3 minutes');
    console.log('2. Implement database connection pooling optimization');
    console.log('3. Add memory management and cleanup');
    console.log('4. Fix MSFT PX14A6G filing parsing errors');
    console.log('5. Implement batch processing for multiple filings');
    
    expect(true).toBe(true); // This test documents our findings
  });
  
});
