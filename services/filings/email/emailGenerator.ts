import { FilingSummaryResult, FilingError } from '../../filing/types';
import { getFormMetadata } from '../../../lib/sec-edgar/form-registry';
import { emailClient } from '../../../lib/email';
import { prisma } from '../../../lib/db';
import { monitoring } from '@/lib/monitoring';

// Define a safe version of recordEmailSent that handles missing function
const safeRecordEmailSent = (emailType: string, recipient: string, success: boolean, tags: Record<string, string> = {}): void => {
  try {
    if (typeof monitoring.recordEmailSent === 'function') {
      monitoring.recordEmailSent(emailType, recipient, success, tags);
    }
  } catch (error) {
    console.warn('Failed to record email metrics', { error });
  }
};

/**
 * Generate an HTML version of the email
 */
export function generateHtmlEmail(summaries: FilingSummaryResult[], errors: {ticker: string, error: string}[] = []): string {
  let html = `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>SEC Filing Summaries</title>
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
      h1 { color: #2c3e50; }
      h2 { color: #3498db; margin-top: 30px; }
      .filing { border: 1px solid #ddd; padding: 15px; margin-bottom: 20px; border-radius: 5px; }
      .meta { color: #7f8c8d; font-size: 0.9em; margin-bottom: 10px; }
      .key-points { background-color: #f9f9f9; padding: 10px 15px; border-left: 3px solid #3498db; }
      .key-point { margin-bottom: 8px; }
      .sec-link { display: inline-block; margin-top: 15px; color: #2980b9; text-decoration: none; }
      .sec-link:hover { text-decoration: underline; }
      .divider { border-top: 1px solid #eee; margin: 20px 0; }
      .footer { font-size: 0.8em; color: #7f8c8d; margin-top: 30px; text-align: center; }
      .error { color: #e74c3c; }
    </style>
  </head>
  <body>
    <h1>SEC Filing Summaries - ${new Date().toLocaleDateString()}</h1>`;
  
  // Add summaries
  summaries.forEach(summary => {
    // Normalize the form type before metadata lookup
    const normalizedFilingType = summary.filingType.replace(/\//g, '-').toUpperCase();
    const formMetadata = getFormMetadata(normalizedFilingType);
    const formName = formMetadata ? formMetadata.displayName : summary.filingType;
    const filingDate = new Date(summary.filingDate).toLocaleDateString();
    
    html += `<div class="filing">
      <h2>${summary.companyName} (${summary.ticker}) - ${formName}</h2>
      <div class="meta">Filed on: ${filingDate}</div>
      
      <p>${summary.summaryText || `This is a ${formName} filing from ${summary.companyName}. View the original filing for complete details.`}</p>
      
      <div class="key-points">
        <h3>Key Points:</h3>
        <ul>`;
        
    summary.keyPoints.forEach(point => {
      html += `<li class="key-point">${point}</li>`;
    });
    
    html += `</ul>
      </div>
      
      <a href="${summary.url}" class="sec-link">View on SEC Website</a>
    </div>
    <div class="divider"></div>`;
  });
  
  // Add errors if any
  if (errors.length > 0) {
    html += `<div class="error">
      <h3>Issues Encountered:</h3>
      <ul>`;
    
    errors.forEach(err => {
      html += `<li>${err.ticker}: ${err.error}</li>`;
    });
    
    html += `</ul>
    </div>`;
  }
  
  // Add footer
  html += `<div class="footer">
      <p>This email was generated automatically by TLDR SEC. For more information, visit <a href="https://tldrsec.app">tldrsec.app</a>.</p>
      <p>To unsubscribe, reply to this email with "unsubscribe" in the subject line.</p>
    </div>
  </body>
  </html>`;
  
  return html;
}

/**
 * Generate a plain text version of the email
 */
export function generatePlainTextEmail(summaries: FilingSummaryResult[], errors: {ticker: string, error: string}[] = []): string {
  let text = `SEC Filing Summaries - ${new Date().toLocaleDateString()}\n\n`;
  
  // Add summaries
  summaries.forEach(summary => {
    const normalizedFilingType = summary.filingType.replace(/\//g, '-').toUpperCase();
    const formMetadata = getFormMetadata(normalizedFilingType);
    const formName = formMetadata ? formMetadata.displayName : summary.filingType;
    const filingDate = new Date(summary.filingDate).toLocaleDateString();
    
    text += `${summary.companyName} (${summary.ticker}) - ${formName}\n`;
    text += `Filed on: ${filingDate}\n\n`;
    text += `${summary.summaryText || `This is a ${formName} filing from ${summary.companyName}. View the original filing for complete details.`}\n\n`;
    text += `Key Points:\n`;
    
    summary.keyPoints.forEach(point => {
      text += `- ${point}\n`;
    });
    
    text += `\nView on SEC Website: ${summary.url}\n\n`;
    text += `-------------------------------------------\n\n`;
  });
  
  // Add errors if any
  if (errors.length > 0) {
    text += `Issues Encountered:\n`;
    
    errors.forEach(err => {
      text += `- ${err.ticker}: ${err.error}\n`;
    });
    
    text += `\n`;
  }
  
  // Add footer
  text += `This email was generated automatically by TLDR SEC. For more information, visit https://tldrsec.app\n`;
  text += `To unsubscribe, reply to this email with "unsubscribe" in the subject line.\n`;
  
  return text;
}

/**
 * Marks summaries as sent in the database
 */
export async function markSummariesAsSent(summaries: FilingSummaryResult[]): Promise<number> {
  console.log(`[INFO][EmailGenerator] Marking ${summaries.length} summaries as sent in the database...`);
  let updatedCount = 0;
  
  for (const summary of summaries) {
    if (summary.accessionNumber) {
      const tickerRecord = await prisma.ticker.findFirst({
        where: {
          symbol: summary.ticker.toUpperCase()
        }
      });
      
      if (tickerRecord) {
        const updateResult = await prisma.summary.updateMany({
          where: {
            tickerId: tickerRecord.id,
            filingType: summary.filingType,
            filingUrl: summary.url,
            sentToUser: false
          },
          data: {
            sentToUser: true
            // sentAt field removed as it doesn't exist in the Prisma schema
          }
        });
        
        updatedCount += updateResult.count;
      }
    }
  }
  
  console.log(`[INFO][EmailGenerator] Successfully marked ${updatedCount}/${summaries.length} summaries as sent`);
  return updatedCount;
}

/**
 * Sends an email with filing summaries
 */
export async function sendSummaryEmail(email: string, summaries: FilingSummaryResult[], errors: {ticker: string, error: string}[] = [], debug: boolean = false): Promise<any> {
  if (summaries.length === 0 && !debug) {
    console.warn(`[WARN][EmailGenerator] No filing summaries to send, skipping email`);
    return { success: false, message: 'No summaries to send' };
  }
  
  try {
    // Generate email content
    const emailHtml = generateHtmlEmail(summaries, errors);
    const plainText = generatePlainTextEmail(summaries, errors);
    
    console.log(`[INFO][EmailGenerator] 📧 Sending email to ${email} with ${summaries.length} summaries and ${errors.length} errors`);
    
    const startTime = Date.now();
    
    // Send the email
    const result = await emailClient.sendEmail({
      to: email,
      subject: `SEC Filing Summaries - ${new Date().toLocaleDateString()}`,
      html: emailHtml,
      text: plainText,
      tags: [
        'type_summaries',
        'content_filings'
      ],
      replyTo: 'no-reply@tldrsec.app'
    });
    
    // Record email sending in monitoring
    safeRecordEmailSent(
      'sec_filing_summary',  // emailType
      email,                 // recipient
      true,                  // success
      {                      // tags
        duration_ms: (Date.now() - startTime).toString(),
        content_type: 'filings'
      }
    );
    
    // Mark summaries as sent in the database
    await markSummariesAsSent(summaries);
    
    console.log(`[INFO][EmailGenerator] ✅ Email sent successfully to ${email}`);
    return { 
      success: true, 
      messageId: result.success ? result.id : undefined 
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ERROR][EmailGenerator] ❌ Failed to send email: ${errorMessage}`);
    
    // Record failed email sending in monitoring
    safeRecordEmailSent(
      'sec_filing_summary',  // emailType
      email,                 // recipient
      false,                 // success
      {
        error: errorMessage,
        content_type: 'filings'
      }
    );
    
    return { success: false, error: errorMessage };
  }
}
