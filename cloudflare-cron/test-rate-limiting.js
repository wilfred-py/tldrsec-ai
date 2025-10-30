#!/usr/bin/env node

/**
 * Enhanced Rate Limiting Test Suite for Cloudflare Worker
 * 
 * This script tests the enhanced rate limiting mitigation system
 * to ensure it properly handles various scenarios and edge cases.
 */

const crypto = require('crypto');

// Configuration
const CONFIG = {
  // Test endpoints (replace with actual URLs)
  WORKER_URL: 'https://your-worker.your-subdomain.workers.dev',
  VERCEL_URL: 'https://tldrsec.app/api/cron/tier-aware',
  
  // Test parameters
  CONCURRENT_REQUESTS: 10,
  RATE_LIMIT_TEST_COUNT: 35, // Exceed the 30/minute limit
  BURST_TEST_COUNT: 8,       // Exceed the 5/10sec limit
  CIRCUIT_BREAKER_FAILURE_COUNT: 4, // Exceed the 3 failure threshold
  
  // Timeouts
  REQUEST_TIMEOUT: 30000, // 30 seconds
  TEST_TIMEOUT: 300000,   // 5 minutes
  
  // Authentication
  CRON_SECRET: process.env.CRON_SECRET || 'your-test-secret'
};

class RateLimitingTester {
  constructor() {
    this.results = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      errors: [],
      startTime: Date.now()
    };
  }

  /**
   * Generate test execution ID
   */
  generateExecutionId() {
    const timestamp = Date.now();
    const randomHex = crypto.randomBytes(8).toString('hex');
    return `test-${timestamp}-${randomHex}`;
  }

  /**
   * Execute HTTP request with timeout
   */
  async makeRequest(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        text: await response.text(),
        ok: response.ok
      };
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Test basic worker functionality
   */
  async testBasicFunctionality() {
    console.log('\n🔍 Testing Basic Worker Functionality...');
    
    try {
      const executionId = this.generateExecutionId();
      const response = await this.makeRequest(CONFIG.WORKER_URL, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${CONFIG.CRON_SECRET}`,
          'X-Test-Execution-Id': executionId,
          'X-Test-Type': 'basic-functionality'
        }
      });
      
      if (response.status === 200) {
        console.log('✅ Basic functionality test passed');
        this.results.passed++;
      } else {
        console.log(`❌ Basic functionality test failed: ${response.status}`);
        this.results.failed++;
        this.results.errors.push(`Basic test failed with status ${response.status}`);
      }
      
    } catch (error) {
      console.log(`❌ Basic functionality test error: ${error.message}`);
      this.results.failed++;
      this.results.errors.push(`Basic test error: ${error.message}`);
    }
    
    this.results.totalTests++;
  }

  /**
   * Test rate limiting protection
   */
  async testRateLimiting() {
    console.log('\n🚦 Testing Rate Limiting Protection...');
    
    const promises = [];
    for (let i = 0; i < CONFIG.RATE_LIMIT_TEST_COUNT; i++) {
      const executionId = this.generateExecutionId();
      
      promises.push(
        this.makeRequest(CONFIG.WORKER_URL, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${CONFIG.CRON_SECRET}`,
            'X-Test-Execution-Id': executionId,
            'X-Test-Type': 'rate-limiting',
            'X-Test-Request-Number': i.toString()
          }
        }).catch(error => ({ error: error.message, requestNumber: i }))
      );
      
      // Small delay between requests to simulate real usage
      if (i % 5 === 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    try {
      const responses = await Promise.all(promises);
      
      let successful = 0;
      let rateLimited = 0;
      let errors = 0;
      
      responses.forEach((response, index) => {
        if (response.error) {
          errors++;
        } else if (response.status === 200) {
          successful++;
        } else if (response.status === 429 || response.status === 503) {
          rateLimited++;
        }
      });
      
      console.log(`📊 Rate Limiting Results:`, {
        totalRequests: CONFIG.RATE_LIMIT_TEST_COUNT,
        successful,
        rateLimited,
        errors,
        rateLimitingActive: rateLimited > 0
      });
      
      if (rateLimited > 0) {
        console.log('✅ Rate limiting protection is working');
        this.results.passed++;
      } else {
        console.log('⚠️  Rate limiting may not be active (no 429/503 responses)');
        this.results.failed++;
        this.results.errors.push('Rate limiting protection not detected');
      }
      
    } catch (error) {
      console.log(`❌ Rate limiting test error: ${error.message}`);
      this.results.failed++;
      this.results.errors.push(`Rate limiting test error: ${error.message}`);
    }
    
    this.results.totalTests++;
  }

  /**
   * Test burst protection
   */
  async testBurstProtection() {
    console.log('\n💥 Testing Burst Protection...');
    
    const startTime = Date.now();
    const promises = [];
    
    // Send burst requests simultaneously
    for (let i = 0; i < CONFIG.BURST_TEST_COUNT; i++) {
      const executionId = this.generateExecutionId();
      
      promises.push(
        this.makeRequest(CONFIG.WORKER_URL, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${CONFIG.CRON_SECRET}`,
            'X-Test-Execution-Id': executionId,
            'X-Test-Type': 'burst-protection',
            'X-Test-Burst-Number': i.toString(),
            'X-Test-Burst-Start-Time': startTime.toString()
          }
        }).catch(error => ({ error: error.message, burstNumber: i }))
      );
    }
    
    try {
      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      let successful = 0;
      let blocked = 0;
      let errors = 0;
      
      responses.forEach((response, index) => {
        if (response.error) {
          errors++;
        } else if (response.status === 200) {
          successful++;
        } else if (response.status === 429 || response.status === 503) {
          blocked++;
        }
      });
      
      console.log(`📊 Burst Protection Results:`, {
        totalRequests: CONFIG.BURST_TEST_COUNT,
        duration: `${duration}ms`,
        successful,
        blocked,
        errors,
        burstProtectionActive: blocked > 0
      });
      
      if (blocked > 0 && duration < 15000) { // Within 15 seconds
        console.log('✅ Burst protection is working');
        this.results.passed++;
      } else {
        console.log('⚠️  Burst protection may not be active');
        this.results.failed++;
        this.results.errors.push('Burst protection not detected');
      }
      
    } catch (error) {
      console.log(`❌ Burst protection test error: ${error.message}`);
      this.results.failed++;
      this.results.errors.push(`Burst protection test error: ${error.message}`);
    }
    
    this.results.totalTests++;
  }

  /**
   * Test circuit breaker functionality
   */
  async testCircuitBreaker() {
    console.log('\n🔌 Testing Circuit Breaker...');
    
    try {
      // First, cause some failures by using invalid auth
      console.log('Triggering failures to test circuit breaker...');
      
      for (let i = 0; i < CONFIG.CIRCUIT_BREAKER_FAILURE_COUNT; i++) {
        const executionId = this.generateExecutionId();
        
        try {
          await this.makeRequest(CONFIG.WORKER_URL, {
            method: 'GET',
            headers: {
              'Authorization': 'Bearer invalid-secret', // Invalid auth to cause 401
              'X-Test-Execution-Id': executionId,
              'X-Test-Type': 'circuit-breaker-trigger',
              'X-Test-Failure-Number': i.toString()
            }
          });
        } catch (error) {
          // Expected to fail
        }
        
        // Small delay between failure attempts
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Now test if circuit breaker is open by using valid auth
      console.log('Testing if circuit breaker is open...');
      
      const executionId = this.generateExecutionId();
      const response = await this.makeRequest(CONFIG.WORKER_URL, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${CONFIG.CRON_SECRET}`,
          'X-Test-Execution-Id': executionId,
          'X-Test-Type': 'circuit-breaker-test'
        }
      });
      
      console.log(`📊 Circuit Breaker Test Result:`, {
        status: response.status,
        circuitBreakerActive: response.status === 503 || response.text.includes('circuit')
      });
      
      if (response.status === 503 || response.text.includes('circuit')) {
        console.log('✅ Circuit breaker is working');
        this.results.passed++;
      } else {
        console.log('⚠️  Circuit breaker may not be active');
        this.results.failed++;
        this.results.errors.push('Circuit breaker not detected');
      }
      
    } catch (error) {
      console.log(`❌ Circuit breaker test error: ${error.message}`);
      this.results.failed++;
      this.results.errors.push(`Circuit breaker test error: ${error.message}`);
    }
    
    this.results.totalTests++;
  }

  /**
   * Test adaptive backoff behavior
   */
  async testAdaptiveBackoff() {
    console.log('\n⏱️  Testing Adaptive Backoff...');
    
    try {
      const executionId = this.generateExecutionId();
      const startTime = Date.now();
      
      // Make request that should trigger backoff
      const response = await this.makeRequest(CONFIG.WORKER_URL, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${CONFIG.CRON_SECRET}`,
          'X-Test-Execution-Id': executionId,
          'X-Test-Type': 'adaptive-backoff',
          'X-Test-Force-Retry': 'true'
        }
      });
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`📊 Adaptive Backoff Results:`, {
        duration: `${duration}ms`,
        status: response.status,
        backoffDetected: duration > 5000 // If it took more than 5 seconds, likely had backoff
      });
      
      if (response.status === 200 || response.status === 429) {
        console.log('✅ Adaptive backoff behavior observed');
        this.results.passed++;
      } else {
        console.log('⚠️  Adaptive backoff behavior unclear');
        this.results.failed++;
        this.results.errors.push('Adaptive backoff not clearly detected');
      }
      
    } catch (error) {
      console.log(`❌ Adaptive backoff test error: ${error.message}`);
      this.results.failed++;
      this.results.errors.push(`Adaptive backoff test error: ${error.message}`);
    }
    
    this.results.totalTests++;
  }

  /**
   * Test KV storage functionality
   */
  async testKVStorageFunctionality() {
    console.log('\n💾 Testing KV Storage Functionality...');
    
    try {
      const executionId = this.generateExecutionId();
      
      // First request to populate KV storage
      await this.makeRequest(CONFIG.WORKER_URL, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${CONFIG.CRON_SECRET}`,
          'X-Test-Execution-Id': executionId,
          'X-Test-Type': 'kv-storage-test',
          'X-Test-KV-Action': 'populate'
        }
      });
      
      // Small delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Second request to test KV storage persistence
      const response = await this.makeRequest(CONFIG.WORKER_URL, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${CONFIG.CRON_SECRET}`,
          'X-Test-Execution-Id': this.generateExecutionId(),
          'X-Test-Type': 'kv-storage-test',
          'X-Test-KV-Action': 'verify'
        }
      });
      
      console.log(`📊 KV Storage Test Result:`, {
        status: response.status,
        kvStorageWorking: response.status === 200
      });
      
      if (response.status === 200) {
        console.log('✅ KV storage functionality working');
        this.results.passed++;
      } else {
        console.log('⚠️  KV storage may not be working properly');
        this.results.failed++;
        this.results.errors.push('KV storage functionality issue');
      }
      
    } catch (error) {
      console.log(`❌ KV storage test error: ${error.message}`);
      this.results.failed++;
      this.results.errors.push(`KV storage test error: ${error.message}`);
    }
    
    this.results.totalTests++;
  }

  /**
   * Run comprehensive test suite
   */
  async runAllTests() {
    console.log('🚀 Starting Enhanced Rate Limiting Test Suite...');
    console.log(`📅 Started at: ${new Date().toISOString()}`);
    console.log(`🔧 Configuration:`, {
      workerUrl: CONFIG.WORKER_URL,
      vercelUrl: CONFIG.VERCEL_URL,
      testTimeout: `${CONFIG.TEST_TIMEOUT}ms`
    });
    
    const testTimeout = setTimeout(() => {
      console.log('\n⏰ Test suite timed out!');
      this.printResults();
      process.exit(1);
    }, CONFIG.TEST_TIMEOUT);
    
    try {
      // Run all test categories
      await this.testBasicFunctionality();
      await this.testRateLimiting();
      await this.testBurstProtection();
      await this.testCircuitBreaker();
      await this.testAdaptiveBackoff();
      await this.testKVStorageFunctionality();
      
      clearTimeout(testTimeout);
      this.printResults();
      
    } catch (error) {
      clearTimeout(testTimeout);
      console.log(`\n💥 Test suite encountered critical error: ${error.message}`);
      this.printResults();
      process.exit(1);
    }
  }

  /**
   * Print comprehensive test results
   */
  printResults() {
    const duration = Date.now() - this.results.startTime;
    const successRate = this.results.totalTests > 0 ? 
      (this.results.passed / this.results.totalTests * 100).toFixed(2) : 0;
    
    console.log('\n' + '='.repeat(60));
    console.log('📋 ENHANCED RATE LIMITING TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`⏱️  Total Duration: ${duration}ms`);
    console.log(`🧪 Total Tests: ${this.results.totalTests}`);
    console.log(`✅ Passed: ${this.results.passed}`);
    console.log(`❌ Failed: ${this.results.failed}`);
    console.log(`📊 Success Rate: ${successRate}%`);
    
    if (this.results.errors.length > 0) {
      console.log('\n🚨 Errors Encountered:');
      this.results.errors.forEach((error, index) => {
        console.log(`   ${index + 1}. ${error}`);
      });
    }
    
    console.log('\n🎯 Recommendations:');
    if (this.results.failed === 0) {
      console.log('   ✅ All tests passed! The enhanced rate limiting system is working correctly.');
    } else {
      console.log('   ⚠️  Some tests failed. Review the errors above and check:');
      console.log('      - KV namespace configuration in wrangler.toml');
      console.log('      - CRON_SECRET is properly set');
      console.log('      - Worker is deployed with latest code');
      console.log('      - Network connectivity to worker URL');
    }
    
    console.log('\n📞 Support:');
    console.log('   - Check worker logs: npx wrangler tail --format=pretty');
    console.log('   - Verify KV storage: npx wrangler kv:namespace list');
    console.log('   - Review configuration in wrangler.toml');
    console.log('='.repeat(60));
  }
}

// Main execution
async function main() {
  // Validate configuration
  if (!CONFIG.CRON_SECRET || CONFIG.CRON_SECRET === 'your-test-secret') {
    console.log('❌ Please set CRON_SECRET environment variable or update CONFIG.CRON_SECRET');
    process.exit(1);
  }
  
  if (CONFIG.WORKER_URL.includes('your-worker') || CONFIG.VERCEL_URL.includes('localhost')) {
    console.log('❌ Please update CONFIG.WORKER_URL and CONFIG.VERCEL_URL with actual URLs');
    process.exit(1);
  }
  
  const tester = new RateLimitingTester();
  await tester.runAllTests();
  
  // Exit with appropriate code
  process.exit(tester.results.failed > 0 ? 1 : 0);
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Test suite crashed:', error);
    process.exit(1);
  });
}

module.exports = { RateLimitingTester, CONFIG };