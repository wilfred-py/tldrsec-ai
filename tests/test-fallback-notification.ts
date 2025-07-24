/**
 * Test script for fallback generation email notification
 * 
 * This script tests the email notification functionality when fallback generation is used
 * in the enhanced AI summary generation process.
 */

import dotenv from 'dotenv';
import { generateEnhancedAISummaryWithRetry } from '../services/filing/enhancedSummaryGeneration';
import { SECFiling, Company } from '../services/filing/types';
import { logger } from '../lib/logging';

// Store original API key
const originalApiKey = process.env.ANTHROPIC_API_KEY;

// Load environment variables from .env file
dotenv.config();

// Check if ADMIN_EMAIL is set
if (!process.env.ADMIN_EMAIL) {
  console.error('ADMIN_EMAIL environment variable is not set. Please set it before running this test.');
  process.exit(1);
}

// Force the Anthropic API to fail by setting an invalid API key
process.env.ANTHROPIC_API_KEY = 'invalid-key-to-force-fallback';

// Set up mock data
const mockFiling: SECFiling = {
  id: 'test-filing-123',
  formType: '10-K',
  filingDate: new Date().toISOString(),
  accessionNumber: '0001234567-23-000123',
  filingHtmlUrl: 'https://www.sec.gov/Archives/edgar/data/123456/000123456723000123/test-10k.htm',
  cik: '0001234567',
  description: 'Annual report for fiscal year ended December 31, 2024'
};

const mockCompany: Company = {
  name: 'Test Company, Inc.',
  ticker: 'TEST',
  cik: '0001234567',
  description: 'A test company for fallback notification testing'
};

// Content that will cause the AI to fail (intentionally empty or too short)
const mockContent = 'This content is too short to generate a proper summary.';

/**
 * Run the test
 */
async function runTest() {
  console.log('Starting fallback notification test...');
  console.log(`Admin email is set to: ${process.env.ADMIN_EMAIL}`);
  
  try {
    // Force a fallback by:
    // 1. Using very short content
    // 2. Setting max retries to 1 to speed up the test
    console.log('Generating summary with intentionally short content to trigger fallback...');
    const result = await generateEnhancedAISummaryWithRetry(mockContent, mockFiling, mockCompany, 1);
    
    // Check if fallback was used
    if (result.error) {
      console.log('✅ Fallback generation was triggered as expected');
      console.log(`Error message: ${result.error}`);
      console.log('An email notification should have been sent to the admin email.');
      console.log('Please check your inbox to verify the email was received.');
    } else {
      console.log('❌ Test failed: Fallback generation was not triggered.');
      console.log('The summary was generated successfully, which was not expected.');
    }
  } catch (error) {
    console.error('❌ Test failed with an unexpected error:', error);
  }
}

// Run the test
runTest()
  .then(() => {
    console.log('Test completed.');
    // Restore the original API key
    if (originalApiKey) {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    }
  })
  .catch(err => {
    console.error('Test failed:', err);
    // Restore the original API key
    if (originalApiKey) {
      process.env.ANTHROPIC_API_KEY = originalApiKey;
    }
  });
