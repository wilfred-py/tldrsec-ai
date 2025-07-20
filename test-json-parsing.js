// Test script to verify JSON parsing error handling in summarize.ts
// Using ES Module imports as per project configuration
import { parseResponse } from './lib/ai/parsers/response-parser.js';
import { validateRequiredFields, ensureMinimumFields } from './lib/ai/parsers/response-fixer.js';

// Sample malformed responses for different filing types
const testCases = [
  {
    name: 'Form 4 with missing transactions',
    filingType: '4',
    response: `
    Here's a summary of the Form 4 filing:
    
    {
      "company": "Acme Corp",
      "filerName": "John Smith",
      "relationship": "Director",
      "summary": "John Smith, Director, reported no transactions in this filing."
    }
    `
  },
  {
    name: 'Form 8-K with malformed JSON',
    filingType: '8-K',
    response: `
    Here's a summary of the Form 8-K filing:
    
    {
      "company": "Acme Corp",
      "eventType": "Change in Directors or Principal Officers",
      "summary": "Acme Corp announced the appointment of Jane Doe as CFO effective immediately."
    
    The filing details that Ms. Doe brings over 15 years of experience in financial management.
    `
  },
  {
    name: 'Schedule 13G with partial data',
    filingType: 'SC 13G',
    response: `
    Here's my analysis of the Schedule 13G filing:
    
    BlackRock Inc. has reported a 7.5% ownership stake in XYZ Corporation.
    
    The filing indicates this is a passive investment with no intention to influence control.
    `
  }
];

async function runTests() {
  console.log('Testing JSON parsing error handling...\n');
  
  for (const test of testCases) {
    console.log(`\n=== Test: ${test.name} ===`);
    
    // First try normal parsing
    console.log('1. Attempting standard parsing...');
    const parsedResult = parseResponse(test.response, test.filingType);
    console.log(`   Success: ${parsedResult.success}`);
    
    if (parsedResult.success && parsedResult.data) {
      console.log('   Parsed data:', JSON.stringify(parsedResult.data, null, 2));
      
      // Validate required fields
      const validation = validateRequiredFields(parsedResult.data, test.filingType);
      console.log(`   Validation passed: ${validation.valid}`);
      if (!validation.valid) {
        console.log(`   Missing fields: ${validation.missingFields.join(', ')}`);
      }
    } else {
      console.log(`   Parsing errors: ${parsedResult.errors?.join('; ')}`);
      
      // Try fallback mechanism
      console.log('2. Attempting fallback with ensureMinimumFields...');
      const fallbackData = ensureMinimumFields(test.response, test.filingType, 'Test Company');
      console.log('   Fallback data:', JSON.stringify(fallbackData, null, 2));
      
      // Validate fallback data
      const fallbackValidation = validateRequiredFields(fallbackData, test.filingType);
      console.log(`   Fallback validation passed: ${fallbackValidation.valid}`);
      if (!fallbackValidation.valid) {
        console.log(`   Still missing fields: ${fallbackValidation.missingFields.join(', ')}`);
      }
    }
  }
}

runTests().catch(error => console.error('Test failed:', error));
