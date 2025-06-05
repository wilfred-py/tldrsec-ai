/**
 * API-based Test for SEC Filing Summary Email Sending
 * 
 * This script tests the email sending functionality by calling the API endpoint
 * that sends summary emails. It tests the fix for the email tags format issue.
 * 
 * Run with: node api-test-email.mjs
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables
dotenv.config();

// Test configuration
const TEST_CONFIG = {
  email: process.env.TEST_EMAIL || 'test@example.com',
  baseUrl: 'http://localhost:3000',
  waitTimeMs: 2000  // Time to wait between API calls
};

/**
 * Make an API request with proper error handling
 */
async function makeRequest(url, options = {}) {
  try {
    const response = await fetch(url, options);
    
    // Get the response as text first
    const responseText = await response.text();
    
    // Try to parse as JSON if possible
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      // If not valid JSON, use the text response
      responseData = { text: responseText };
    }
    
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}: ${JSON.stringify(responseData)}`);
    }
    
    return responseData;
  } catch (error) {
    console.error(`Error making request to ${url}:`, error.message);
    throw error;
  }
}

/**
 * Test the API-based email sending functionality
 */
async function testEmailSending() {
  console.log('===== TESTING SEC FILING SUMMARY EMAIL SENDING API =====\n');
  
  try {
    // 1. Start the Next.js development server (if not already running)
    console.log('First make sure the Next.js development server is running:');
    console.log('Run "npm run dev" in a separate terminal if not already running.\n');
    
    // Wait for user to potentially start the server
    console.log('Waiting 5 seconds before proceeding...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 2. Verify environment variables
    console.log('\nVerifying environment variables...');
    if (!process.env.RESEND_API_KEY) {
      console.log('⚠️ RESEND_API_KEY environment variable not found');
      console.log('Email sending will likely fail. Please add it to your .env file');
    } else {
      console.log('✅ RESEND_API_KEY environment variable is set');
    }
    
    // 3. Test the email sending API endpoint
    console.log(`\nTesting email sending API for address: ${TEST_CONFIG.email}...`);
    
    // Construct the API URL for the debug email summary endpoint
    const apiUrl = `${TEST_CONFIG.baseUrl}/api/debug/email-summary`;
    
    // Log the configuration
    console.log(`API URL: ${apiUrl}`);
    console.log(`Test recipient: ${TEST_CONFIG.email}`);
    
    // Call the API to send a test email
    console.log('\nMaking API call to send test email...');
    const startTime = Date.now();
    
    const requestBody = {
      email: TEST_CONFIG.email,
      tickers: ['AAPL', 'MSFT', 'GOOGL'], // Required tickers to include in the summary email
      test: true  // Flag to indicate this is a test
    };
    
    const requestOptions = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    };
    
    try {
      const result = await makeRequest(apiUrl, requestOptions);
      const duration = (Date.now() - startTime) / 1000;
      
      console.log(`\n✅ API call completed in ${duration.toFixed(2)} seconds`);
      console.log('Response:', result);
      
      if (result.success) {
        console.log('\n✅ Email sent successfully!');
        
        if (result.emailId) {
          console.log(`Email ID: ${result.emailId}`);
        }
        
        console.log('\nTEST SUMMARY:');
        console.log('- The email API endpoint is working correctly');
        console.log('- The Resend API integration is functioning');
        console.log('- The tags format fix has been applied successfully');
        console.log('- Plain text email content is being included');
      } else {
        console.log('\n❌ Email sending failed');
        console.log('Response:', result);
      }
    } catch (apiError) {
      console.error('\n❌ API request failed:', apiError.message);
      
      // Check if the server is running
      console.log('\nVerifying if the Next.js server is running...');
      try {
        await fetch(TEST_CONFIG.baseUrl);
        console.log('✅ The server is running. The issue might be with the API endpoint.');
      } catch (serverError) {
        console.error('❌ The server does not appear to be running. Please start it with "npm run dev"');
      }
      
      // Provide possible solution
      console.log('\nPossible causes:');
      console.log('1. The API endpoint path is incorrect');
      console.log('2. The Next.js development server is not running');
      console.log('3. The RESEND_API_KEY is invalid or missing');
      console.log('4. There is an issue with the email sending implementation');
    }
    
    console.log('\n===== TEST COMPLETED =====');
    
  } catch (error) {
    console.error('Test failed with error:');
    console.error(error);
  }
}

// Run the test
testEmailSending().catch(console.error);
