/**
 * Test script for SEC filing summary email sending functionality
 * 
 * This script tests the complete email sending pipeline by:
 * 1. Retrieving summaries from the database
 * 2. Generating email content with both HTML and plain text versions
 * 3. Testing the actual sending of emails using the fixed email client
 * 
 * Run with: node test-email-sending.mjs
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

// Load environment variables
dotenv.config();

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Dynamic import function to handle both .js and .ts files
async function importWithFallback(modulePath, extensions = ['.js', '.ts']) {
  for (const ext of extensions) {
    try {
      const fullPath = modulePath + ext;
      // Check if file exists before attempting import
      await fs.access(fullPath);
      return await import(fullPath);
    } catch (error) {
      // Try next extension or fail if we've tried all extensions
      if (ext === extensions[extensions.length - 1]) {
        throw new Error(`Could not import ${modulePath} with any of the extensions: ${extensions.join(', ')}`);
      }
    }
  }
}

/**
 * Main test function
 */
async function testEmailSending() {
  console.log('===== TESTING SEC FILING SUMMARY EMAIL SENDING =====\n');
  
  try {
    // Use specific import path for Prisma to match the generated location
    console.log('Initializing Prisma client...');
    const { PrismaClient } = await import('./lib/generated/prisma/index.js');
    const prisma = new PrismaClient();
    
    // Suppress Prisma query logs to reduce console clutter
    prisma.$on('query', () => {
      // Do nothing with the query event
    });
    
    // Load the email client module
    console.log('Loading email client...');
    const emailPath = join(__dirname, 'lib', 'email');
    const emailModule = await importWithFallback(emailPath);
    
    // Check if we have a proper email client
    if (!emailModule || !emailModule.getEmailClient) {
      throw new Error('Email client module not found or missing getEmailClient function');
    }
    
    // Get the email client
    const emailClient = emailModule.getEmailClient();
    console.log('Email client loaded successfully');
    
    // Confirm RESEND_API_KEY is available
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY environment variable not found');
    }
    console.log('RESEND_API_KEY environment variable is set');
    
    // Get test email recipient (should be a valid email that you control)
    const testEmail = process.env.TEST_EMAIL || 'test@example.com';
    console.log(`Using test email recipient: ${testEmail}`);
    
    // Get some summaries from the database to test with
    console.log('\nFetching filing summaries from database...');
    
    // Ensure we have the FilingSummary model, not just Summary
    const filingSummaries = await prisma.filingSummary.findMany({
      where: {
        status: 'completed',
      },
      take: 3,
      orderBy: {
        updatedAt: 'desc',
      },
      include: {
        filing: {
          include: {
            ticker: true,
          },
        },
      },
    });
    
    if (!filingSummaries || filingSummaries.length === 0) {
      throw new Error('No completed filing summaries found in database. Please run the Claude AI summarization test first.');
    }
    
    console.log(`Found ${filingSummaries.length} summaries to include in the test email`);
    
    // Process the summaries into a format suitable for the email
    const processedSummaries = [];
    for (const summary of filingSummaries) {
      try {
        // Extract data from the summary and parse JSON content if needed
        let summaryContent;
        if (summary.summaryJson) {
          summaryContent = typeof summary.summaryJson === 'string' 
            ? JSON.parse(summary.summaryJson) 
            : summary.summaryJson;
        } else if (summary.contentJson) {
          summaryContent = typeof summary.contentJson === 'string'
            ? JSON.parse(summary.contentJson)
            : summary.contentJson;
        }
        
        // Build a summary object with the data we need for the email
        processedSummaries.push({
          id: summary.id,
          ticker: summary.filing?.ticker?.symbol || 'Unknown',
          filingType: summary.filing?.formType || 'Unknown',
          filingDate: summary.filing?.filingDate 
            ? new Date(summary.filing.filingDate).toLocaleDateString() 
            : 'Unknown',
          summary: summaryContent?.summary || 'No summary text available',
          keyPoints: summaryContent?.keyPoints || [],
          riskFactors: summaryContent?.riskFactors || [],
          status: summary.status,
          model: summary.model,
          cost: summary.cost,
          inputTokens: summary.inputTokens,
          outputTokens: summary.outputTokens
        });
      } catch (error) {
        console.error(`Error processing summary ${summary.id}:`, error.message);
      }
    }
    
    // Generate email HTML content
    console.log('\nGenerating email content...');
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; }
          .summary { margin-bottom: 30px; border-bottom: 1px solid #eee; padding-bottom: 20px; }
          h2 { color: #1a73e8; }
          .filing-date { color: #666; font-size: 0.9em; margin-top: -15px; }
          .meta { background: #f8f9fa; padding: 10px; border-radius: 4px; font-size: 0.85em; margin: 10px 0; }
          ul { padding-left: 20px; }
          li { margin-bottom: 8px; }
          .section-title { font-weight: bold; margin-top: 15px; color: #555; }
          .footer { margin-top: 30px; font-size: 0.8em; color: #666; border-top: 1px solid #eee; padding-top: 15px; }
        </style>
      </head>
      <body>
        <h1>SEC Filing Summaries - ${new Date().toLocaleDateString()}</h1>
        <p>This is an automated email containing summaries of recent SEC filings for your tracked companies.</p>
        
        ${processedSummaries.map(summary => `
          <div class="summary">
            <h2>${summary.ticker} - ${summary.filingType}</h2>
            <p class="filing-date">Filed on: ${summary.filingDate}</p>
            
            <div class="meta">
              Generated using: ${summary.model || 'Unknown model'}<br>
              Cost: ${summary.cost ? '$' + summary.cost.toFixed(4) : 'Unknown'}<br>
              Tokens: ${summary.inputTokens && summary.outputTokens 
                ? `${summary.inputTokens} input / ${summary.outputTokens} output`
                : 'Unknown'}
            </div>
            
            <p>${summary.summary.substring(0, 500)}${summary.summary.length > 500 ? '...' : ''}</p>
            
            ${summary.keyPoints && summary.keyPoints.length > 0 ? `
              <div class="section-title">Key Points:</div>
              <ul>
                ${summary.keyPoints.slice(0, 5).map(point => `<li>${point}</li>`).join('')}
                ${summary.keyPoints.length > 5 ? `<li>Plus ${summary.keyPoints.length - 5} more points...</li>` : ''}
              </ul>
            ` : ''}
            
            ${summary.riskFactors && summary.riskFactors.length > 0 ? `
              <div class="section-title">Risk Factors:</div>
              <ul>
                ${summary.riskFactors.slice(0, 3).map(risk => `<li>${risk}</li>`).join('')}
                ${summary.riskFactors.length > 3 ? `<li>Plus ${summary.riskFactors.length - 3} more risk factors...</li>` : ''}
              </ul>
            ` : ''}
          </div>
        `).join('')}
        
        <div class="footer">
          <p>This is a test email generated by the test-email-sending.mjs script.</p>
          <p>To unsubscribe or manage your email preferences, please reply to this email.</p>
        </div>
      </body>
      </html>
    `;
    
    // Generate plain text version
    const generatePlainTextEmail = (summaries) => {
      return `
SEC Filing Summaries - ${new Date().toLocaleDateString()}

This is an automated email containing summaries of recent SEC filings for your tracked companies.

${summaries.map(summary => `
${summary.ticker} - ${summary.filingType}
Filed on: ${summary.filingDate}
Generated using: ${summary.model || 'Unknown model'}
Cost: ${summary.cost ? '$' + summary.cost.toFixed(4) : 'Unknown'}
Tokens: ${summary.inputTokens && summary.outputTokens 
  ? `${summary.inputTokens} input / ${summary.outputTokens} output`
  : 'Unknown'}

${summary.summary.substring(0, 300)}${summary.summary.length > 300 ? '...' : ''}

${summary.keyPoints && summary.keyPoints.length > 0 ? `
Key Points:
${summary.keyPoints.slice(0, 3).map(point => `- ${point}`).join('\n')}
${summary.keyPoints.length > 3 ? `- Plus ${summary.keyPoints.length - 3} more points...` : ''}
` : ''}

${summary.riskFactors && summary.riskFactors.length > 0 ? `
Risk Factors:
${summary.riskFactors.slice(0, 2).map(risk => `- ${risk}`).join('\n')}
${summary.riskFactors.length > 2 ? `- Plus ${summary.riskFactors.length - 2} more risk factors...` : ''}
` : ''}

------------------
`).join('\n')}

This is a test email generated by the test-email-sending.mjs script.
To unsubscribe or manage your email preferences, please reply to this email.
      `;
    };
    
    const plainText = generatePlainTextEmail(processedSummaries);
    
    console.log('Email content generated successfully');
    console.log('\nHTML Preview (first 150 chars):');
    console.log(emailHtml.substring(0, 150) + '...');
    
    console.log('\nPlain Text Preview (first 150 chars):');
    console.log(plainText.substring(0, 150) + '...');
    
    // Send the test email
    console.log('\nSending test email...');
    try {
      const result = await emailClient.sendEmail({
        to: testEmail,
        subject: `TEST - SEC Filing Summaries - ${new Date().toLocaleDateString()}`,
        html: emailHtml,
        text: plainText,
        tags: ['type:summaries', 'content:filings', 'test:true'], // Simple string tags as fixed
        replyTo: 'no-reply@tldrsec.app'
      });
      
      console.log('✅ Test email sent successfully!');
      console.log('Email ID:', result.id);
      console.log('Full result:', result);
    } catch (emailError) {
      console.error('❌ Error sending test email:', emailError.message);
      if (emailError.response) {
        console.error('Response status:', emailError.response.status);
        console.error('Response data:', emailError.response.data);
      }
    }
    
    console.log('\n===== TEST COMPLETED =====');
    
    // Clean up resources
    await prisma.$disconnect();
    
  } catch (error) {
    console.error('Test failed with error:');
    console.error(error);
  }
}

// Run the test
testEmailSending().catch(console.error);
