/**
 * API Routes Test Script
 * 
 * This script tests all the migrated API routes to ensure they're working correctly.
 */

const fetch = require('node-fetch');

// Base URL for local testing
const BASE_URL = 'http://localhost:3001/api';

// Validation functions
const validators = {
  debugEmailSummary: (data) => {
    return data && typeof data === 'object' && ('success' in data || 'error' in data);
  },
  debugFilingSummary: (data) => {
    return data && typeof data === 'object' && ('ticker' in data || 'error' in data);
  },
  batchSummary: (data) => {
    return data && typeof data === 'object' && 
      ('success' in data || 'error' in data) && 
      (data.success === false || ('results' in data && Array.isArray(data.results)));
  },
  enhancedSummary: (data) => {
    return data && typeof data === 'object' && 
      (('success' in data && data.success === true && 'data' in data) || 'error' in data);
  },
  testSummarize: (data) => {
    return data && typeof data === 'object' && 
      ('success' in data) && 
      (data.success === false || ('parsedContent' in data && 'processingTimeMs' in data));
  }
};

// Test endpoints
const endpoints = [
  {
    name: 'Debug Email Summary',
    method: 'POST',
    url: `${BASE_URL}/debug/email-summary`,
    body: { 
      ticker: 'AAPL', 
      formType: '10-K',
      email: 'test@example.com'
    },
    expectedStatus: 200,
    validateResponse: validators.debugEmailSummary
  },
  {
    name: 'Debug Filing Summary',
    method: 'POST',
    url: `${BASE_URL}/debug/filing-summary`,
    body: { ticker: 'AAPL' },
    expectedStatus: 200,
    validateResponse: validators.debugFilingSummary
  },
  {
    name: 'Filings Batch Summary',
    method: 'POST',
    url: `${BASE_URL}/filings/batch-summary`,
    body: { 
      requests: [
        { ticker: 'AAPL', formType: '10-K' }
      ],
      concurrencyLimit: 1,
      useCache: true,
      processAllChunks: false
    },
    expectedStatus: 200,
    validateResponse: validators.batchSummary
  },
  {
    name: 'Filings Enhanced Summary',
    method: 'GET',
    url: `${BASE_URL}/filings/enhanced-summary?ticker=AAPL&formType=10-K&useCache=true`,
    expectedStatus: 200,
    validateResponse: validators.enhancedSummary
  },
  {
    name: 'Test Summarize',
    method: 'POST',
    url: `${BASE_URL}/test-summarize`,
    body: { 
      filingUrl: 'https://www.sec.gov/Archives/edgar/data/320193/000032019323000077/aapl-20230930.htm',
      filingType: '10-K',
      dryRun: true
    },
    expectedStatus: 200,
    validateResponse: validators.testSummarize
  }
];

// Test each endpoint
async function testEndpoints() {
  console.log('Starting API route tests...\n');
  let passedTests = 0;
  let failedTests = 0;
  
  for (const endpoint of endpoints) {
    try {
      console.log(`Testing ${endpoint.name}...`);
      
      const options = {
        method: endpoint.method,
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      if (endpoint.method !== 'GET' && endpoint.body) {
        options.body = JSON.stringify(endpoint.body);
      }
      
      const response = await fetch(endpoint.url, options);
      const status = response.status;
      
      if (status === endpoint.expectedStatus) {
        try {
          const data = await response.json();
          
          // Validate response structure if validator function exists
          if (endpoint.validateResponse && !endpoint.validateResponse(data)) {
            console.log(`❌ ${endpoint.name}: Response validation failed`);
            console.log(`Response: ${JSON.stringify(data).substring(0, 200)}...`);
            failedTests++;
          } else {
            console.log(`✅ ${endpoint.name}: Success (${status})`);
            passedTests++;
          }
        } catch (parseError) {
          console.log(`❌ ${endpoint.name}: Failed to parse JSON response - ${parseError.message}`);
          const text = await response.text();
          console.log(`Raw response: ${text.substring(0, 200)}...`);
          failedTests++;
        }
      } else {
        console.log(`❌ ${endpoint.name}: Failed with status ${status} (expected ${endpoint.expectedStatus})`);
        try {
          const data = await response.json();
          console.log(`Response: ${JSON.stringify(data).substring(0, 200)}...`);
        } catch (e) {
          const text = await response.text();
          console.log(`Raw response: ${text.substring(0, 200)}...`);
        }
        failedTests++;
      }
    } catch (error) {
      console.log(`❌ ${endpoint.name}: Error - ${error.message}`);
      failedTests++;
    }
    
    console.log(''); // Add a blank line for readability
  }
  
  console.log(`API route tests completed: ${passedTests} passed, ${failedTests} failed`);
  return { passedTests, failedTests };
}

// Run the tests
testEndpoints().catch(console.error);
