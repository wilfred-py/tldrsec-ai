/**
 * Direct test for fallback notification email
 * 
 * This script directly tests the email notification functionality by sending a test email
 * that simulates a fallback generation scenario.
 */

// Import required modules
import dotenv from 'dotenv';
import { Resend } from 'resend';

// Load environment variables
dotenv.config();

// Check for required environment variables
const adminEmail = process.env.ADMIN_EMAIL;
const resendApiKey = process.env.RESEND_API_KEY;

if (!adminEmail) {
  console.error('ADMIN_EMAIL environment variable is not set. Please set it before running this test.');
  process.exit(1);
}

if (!resendApiKey) {
  console.error('RESEND_API_KEY environment variable is not set. Please set it before running this test.');
  process.exit(1);
}

console.log(`Admin email is set to: ${adminEmail}`);

/**
 * Send a test fallback notification email
 */
async function sendTestFallbackEmail() {
  try {
    // Create Resend client directly
    const resend = new Resend(resendApiKey);
    
    // Mock data
    const companyName = 'Test Company, Inc.';
    const ticker = 'TEST';
    const formType = '10-K';
    const filingDate = new Date().toLocaleDateString();
    const filingUrl = 'https://www.sec.gov/Archives/edgar/data/123456/000123456723000123/test-10k.htm';
    const creationDate = new Date().toISOString();
    const summaryId = 'test-summary-123';
    const attempts = 3;
    const inputTokens = 15000;
    const outputTokens = 2500;
    const errorMessage = 'Error generating enhanced AI summary: API key is invalid';
    
    // Create HTML content for the email
    const htmlContent = `
      <h2>⚠️ AI Summary Fallback Generation Alert</h2>
      <p>The system had to use fallback generation for a filing summary.</p>
      
      <h3>Summary Information</h3>
      <ul>
        <li><strong>Summary ID:</strong> ${summaryId}</li>
        <li><strong>Company:</strong> ${companyName} (${ticker})</li>
        <li><strong>Filing Type:</strong> ${formType}</li>
        <li><strong>Filing Date:</strong> ${filingDate}</li>
        <li><strong>Filing URL:</strong> <a href="${filingUrl}">${filingUrl}</a></li>
        <li><strong>Creation Date:</strong> ${creationDate}</li>
        <li><strong>Attempts:</strong> ${attempts}</li>
      </ul>
      
      <h3>Token Usage</h3>
      <ul>
        <li><strong>Input Tokens:</strong> ${inputTokens.toLocaleString()}</li>
        <li><strong>Output Tokens:</strong> ${outputTokens.toLocaleString()}</li>
      </ul>
      
      <h3>Error Information</h3>
      <pre>${errorMessage}</pre>
    `;
    
    // Create plain text version
    const textContent = `
      AI Summary Fallback Generation Alert
      
      The system had to use fallback generation for a filing summary.
      
      Summary Information:
      - Summary ID: ${summaryId}
      - Company: ${companyName} (${ticker})
      - Filing Type: ${formType}
      - Filing Date: ${filingDate}
      - Filing URL: ${filingUrl}
      - Creation Date: ${creationDate}
      - Attempts: ${attempts}
      
      Token Usage:
      - Input Tokens: ${inputTokens.toLocaleString()}
      - Output Tokens: ${outputTokens.toLocaleString()}
      
      Error Information:
      ${errorMessage}
    `;
    
    console.log('Sending test fallback notification email...');
    
    // Send the email using Resend directly
    // Use proper tag format based on project standards (simple strings)
    const result = await resend.emails.send({
      from: 'TLDRSec AI <no-reply@tldrsec.app>',
      to: adminEmail,
      subject: `[TEST] AI Summary Fallback Used - ${companyName} (${ticker}) - ${formType}`,
      html: htmlContent,
      text: textContent,
      tags: [
        { name: 'type_alert', value: 'type_alert' },
        { name: 'content_fallback_summary', value: 'content_fallback_summary' },
        { name: 'test_email', value: 'test_email' }
      ],
      reply_to: 'no-reply@tldrsec.app'
    });
    
    console.log('✅ Test email sent successfully!');
    console.log(`Email ID: ${result.id}`);
    console.log('Please check your inbox to verify the email was received.');
  } catch (error) {
    console.error('❌ Error sending test email:', error);
  }
}

// Run the test
sendTestFallbackEmail()
  .then(() => console.log('Test completed.'))
  .catch(err => console.error('Test failed:', err));
