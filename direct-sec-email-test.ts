/**
 * Direct SEC filing summary email test
 * 
 * This script directly tests sending a SEC filing summary email using the Resend email client
 * It bypasses any debug mode restrictions to ensure actual email sending
 */

import { emailClient } from './lib/email';
import * as secService from './services/secService';
import { prisma } from './lib/db/prisma';
import filingService from './services/filingService';
// Import FilingType from SEC types
import { FilingType } from './lib/sec-edgar/types';
// Import the FilingSummaryResult type from filingService
import { FilingSummaryResult } from './services/filingService';

async function testDirectSecEmailSending() {
  console.log('===== DIRECT SEC FILING EMAIL TEST =====');
  
  try {
    // Use the configured test email or provide a default
    const testEmail = process.env.TEST_EMAIL || 'test@example.com';
    console.log(`Will send test email to: ${testEmail}`);
    
    // Use TSLA as requested
    const ticker = 'TSLA';
    console.log(`Testing with ticker: ${ticker}`);
    
    // Fetch latest filings
    console.log(`\nFetching latest filings for ${ticker}...`);
    const filings = await secService.getLatestFilings(ticker, 10);
    
    if (!filings || filings.length === 0) {
      throw new Error(`No filings found for ${ticker}. Cannot proceed with test.`);
    }
    
    console.log(`SUCCESS: Found ${filings.length} filings for ${ticker}`);
    
    // Display filings to verify we have the expected ones
    console.log('Available filings:');
    filings.slice(0, 5).forEach((filing, i) => {
      console.log(`${i+1}. ${filing.form} (${new Date(filing.filingDate).toLocaleDateString()}): ${filing.accessionNumber}`);
    });
    
    // Get summaries for the first 3 filings
    console.log('\n===== GENERATING SUMMARIES =====');
    const summaries: FilingSummaryResult[] = [];
    const errors: {ticker: string, error: string}[] = [];
    
    // Process the top 3 filings
    for (let i = 0; i < Math.min(3, filings.length); i++) {
      const filing = filings[i];
      console.log(`\nGenerating summary for ${filing.form} filed on ${new Date(filing.filingDate).toLocaleDateString()}...`);
      
      try {
        // Need to cast the form to FilingType to satisfy TypeScript
      const result = await filingService.getFilingSummary(ticker, filing.form as FilingType);
        if (result.data) {
          console.log(`SUCCESS: Generated summary for ${filing.form}`);
          console.log(`Summary preview: ${result.data.summaryText.substring(0, 100)}...`);
          summaries.push(result.data);
        } else if (result.error) {
          console.error(`ERROR: Failed to generate summary: ${result.error}`);
          errors.push({ ticker, error: result.error });
        }
      } catch (error) {
        console.error(`ERROR: Exception while generating summary:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        errors.push({ ticker, error: errorMessage });
      }
    }
    
    if (summaries.length === 0) {
      throw new Error('No summaries could be generated. Cannot proceed with email sending test.');
    }
    
    // Now send an email directly using the email client
    console.log(`\n===== SENDING EMAIL DIRECTLY =====`);
    console.log(`Generated ${summaries.length} summaries and encountered ${errors.length} errors`);
    
    // Since the email template functions aren't directly exposed, we'll create simple HTML and text content
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
          .header { background-color: #0066cc; color: white; padding: 20px; text-align: center; margin-bottom: 20px; }
          .summary { border: 1px solid #ddd; padding: 15px; margin-bottom: 20px; border-radius: 5px; }
          .summary h2 { margin-top: 0; color: #0066cc; }
          .meta { color: #666; font-size: 0.9em; margin-bottom: 10px; }
          .summary-text { margin-bottom: 15px; }
          .filing-link { display: inline-block; margin-top: 15px; background-color: #0066cc; color: white; padding: 8px 15px; text-decoration: none; border-radius: 4px; }
          .footer { margin-top: 30px; text-align: center; font-size: 0.8em; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>SEC Filing Summaries</h1>
          <p>${new Date().toLocaleDateString()}</p>
        </div>
        
        ${summaries.map(summary => `
          <div class="summary">
            <h2>${summary.companyName} (${summary.ticker}) - ${summary.filingType}</h2>
            <div class="meta">Filed on: ${new Date(summary.filingDate).toLocaleDateString()}</div>
            <div class="summary-text">
              <p>${summary.summaryText}</p>
            </div>
            <a href="${summary.url || summary.filingUrl}" class="filing-link" target="_blank">View on SEC Website</a>
          </div>
        `).join('')}
        
        ${errors.length > 0 ? `
          <div style="background-color: #fff0f0; padding: 15px; margin-top: 20px; border-radius: 5px;">
            <h3>Issues Encountered</h3>
            <ul>
              ${errors.map(err => `<li>${err.ticker}: ${err.error}</li>`).join('')}
            </ul>
          </div>
        ` : ''}
        
        <div class="footer">
          <p>This email was generated by tldrSEC. The information provided is for informational purposes only and should not be considered financial advice.</p>
          <p>© ${new Date().getFullYear()} tldrSEC</p>
        </div>
      </body>
      </html>
    `;
    
    // Create simple plain text version
    const emailText = `
      SEC Filing Summaries - ${new Date().toLocaleDateString()}
      
      ${summaries.map(summary => `
      ${summary.companyName} (${summary.ticker}) - ${summary.filingType}
      Filed on: ${new Date(summary.filingDate).toLocaleDateString()}
      
      ${summary.summaryText}
      
      View on SEC Website: ${summary.url || summary.filingUrl}
      `).join('
---
')}
      
      ${errors.length > 0 ? `
      ISSUES ENCOUNTERED:
      ${errors.map(err => `- ${err.ticker}: ${err.error}`).join('
')}
      ` : ''}
      
      This email was generated by tldrSEC. The information provided is for informational purposes only and should not be considered financial advice.
    `;
    
    console.log(`Email content generated. Sending to ${testEmail}...`);
    
    // Send the email directly using the email client
    const result = await emailClient.sendEmail({
      to: testEmail,
      subject: `SEC Filing Summaries for ${ticker} - ${new Date().toLocaleDateString()}`,
      html: emailHtml,
      text: emailText,
      tags: ['type:summaries', 'content:filings', 'test:direct'],
      replyTo: 'no-reply@tldrsec.app'
    });
    
    console.log(`\n===== EMAIL SENDING RESULT =====`);
    console.log(`Email sent successfully!`);
    console.log(`Email response: ${JSON.stringify(result)}`);
    
    // Display summary information
    console.log(`\n===== SUMMARY DETAILS =====`);
    for (const summary of summaries) {
      console.log(`\n--- ${summary.ticker} (${summary.filingType}) ---`);
      console.log(`Filing Date: ${summary.filingDate}`);
      console.log(`Filing URL: ${summary.url || summary.filingUrl}`);
      // Show the first 300 chars of the summary with ellipsis
      console.log(`Summary Preview: ${summary.summaryText.substring(0, 300)}...`);
    }
    
    console.log(`\n✅ Successfully sent email with ${summaries.length} filing summaries to ${testEmail}`);
    
  } catch (error) {
    console.error('\n❌ ERROR: Failed to complete direct SEC email test:', error);
  } finally {
    // Close Prisma client to prevent hanging process
    await prisma.$disconnect();
    console.log('\n===== TEST COMPLETED =====');
  }
}

// Run the test
testDirectSecEmailSending().catch(error => {
  console.error('Unhandled error in direct SEC email test:', error);
  prisma.$disconnect().then(() => process.exit(1));
});
