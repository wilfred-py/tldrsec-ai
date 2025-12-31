import { FilingSummaryResult, FilingError } from '../../filing/types';
import { getFormMetadata } from '../../../lib/sec-edgar/form-registry';
import { emailClient } from '../../../lib/email';
import { prisma } from '../../../lib/db';
import { monitoring } from '@/lib/monitoring';
import { renderAsync } from '@react-email/render';
import * as React from 'react';
import { Form4MinimalistTemplate } from '../../../components/ui/email/templates/form4-minimalist-template';
import { Form10KMinimalistTemplate } from '../../../components/ui/email/templates/10k-minimalist-template';
import { Form10QMinimalistTemplate } from '../../../components/ui/email/templates/10q-minimalist-template';
import { Form8KMinimalistTemplate } from '../../../components/ui/email/templates/8k-minimalist-template';
import { Form144MinimalistTemplate } from '../../../components/ui/email/templates/form144-minimalist-template';
import { GenericMinimalistTemplate } from '../../../components/ui/email/templates/generic-minimalist-template';
import { FilingTemplateData } from '../../../lib/email/types';
import { EmailColors } from '../../../components/ui/email/design-system';

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
 * Template registry for O(1) lookup - Morning Brew style minimalist templates
 */
const MINIMALIST_TEMPLATE_REGISTRY: Record<string, React.ComponentType<{ filing: FilingTemplateData }>> = {
  'FORM4': Form4MinimalistTemplate,
  'FORM 4': Form4MinimalistTemplate,
  '4': Form4MinimalistTemplate,
  '10-K': Form10KMinimalistTemplate,
  '10K': Form10KMinimalistTemplate,
  '10-Q': Form10QMinimalistTemplate,
  '10Q': Form10QMinimalistTemplate,
  '8-K': Form8KMinimalistTemplate,
  '8K': Form8KMinimalistTemplate,
  'FORM 8-K': Form8KMinimalistTemplate,
  'FORM8-K': Form8KMinimalistTemplate,
  '144': Form144MinimalistTemplate,
  'FORM 144': Form144MinimalistTemplate,
  'FORM144': Form144MinimalistTemplate,
};

/**
 * Get the appropriate minimalist template for a filing type
 */
function getMinimalistTemplate(filingType: string): React.ComponentType<{ filing: FilingTemplateData }> {
  const normalizedType = filingType?.toUpperCase().trim() || '';
  return MINIMALIST_TEMPLATE_REGISTRY[normalizedType] || GenericMinimalistTemplate;
}

/**
 * Convert FilingSummaryResult to FilingTemplateData for minimalist templates
 */
function toFilingTemplateData(summary: FilingSummaryResult): FilingTemplateData {
  // Extract summaryJSON from rawData if available (populated by Phase 1)
  const summaryJSON = (summary.rawData as Record<string, unknown>)?.summaryJSON ||
                      (summary as Record<string, unknown>).summaryJSON ||
                      {};

  return {
    companyName: summary.companyName,
    symbol: summary.ticker,
    ticker: summary.ticker,
    filingType: summary.filingType,
    filingDate: summary.filingDate,
    filingUrl: summary.url,
    summaryText: summary.summaryText,
    summaryData: summaryJSON as FilingTemplateData['summaryData'],
  };
}

/**
 * Generate an HTML version of the email using minimalist templates
 * Morning Brew-style design: clean, scannable, modern
 */
export async function generateHtmlEmail(summaries: FilingSummaryResult[], errors: {ticker: string, error: string}[] = []): Promise<string> {
  // Render each filing with the appropriate minimalist template
  const filingHtmlParts: string[] = [];

  for (const summary of summaries) {
    const filing = toFilingTemplateData(summary);
    const MinimalistTemplate = getMinimalistTemplate(summary.filingType);

    // Render the minimalist template for this filing
    const filingHtml = await renderAsync(React.createElement(MinimalistTemplate, { filing }));
    filingHtmlParts.push(filingHtml);
  }

  // Build the combined email with Morning Brew-style header
  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SEC Filing Summaries - ${formattedDate}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: ${EmailColors.structure.background}; color: ${EmailColors.text.body};">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    <!-- Email Header -->
    <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid ${EmailColors.structure.border};">
      <h1 style="margin: 0; font-size: 28px; color: ${EmailColors.text.headline};">📄 SEC Filing Digest</h1>
      <p style="margin: 8px 0 0; color: ${EmailColors.text.meta}; font-size: 14px;">${formattedDate}</p>
      <p style="margin: 4px 0 0; color: ${EmailColors.text.meta}; font-size: 12px;">${summaries.length} filing${summaries.length !== 1 ? 's' : ''} for your tracked companies</p>
    </div>

    <!-- Filing Summaries -->
    <div style="padding: 20px 0;">`;

  // Add each rendered filing section
  for (let i = 0; i < filingHtmlParts.length; i++) {
    // Extract inner content from each template (skip doctype, html, body wrappers)
    const innerContent = extractInnerContent(filingHtmlParts[i]);
    html += `
      <div style="margin-bottom: 25px; padding-bottom: 25px; border-bottom: 1px solid ${EmailColors.structure.border};">
        ${innerContent}
      </div>`;
  }

  // Add errors if any
  if (errors.length > 0) {
    html += `
      <div style="background-color: #fef2f2; border: 1px solid #fecaca; padding: 15px; border-radius: 8px; margin-top: 20px;">
        <h3 style="margin: 0 0 10px; color: #dc2626; font-size: 14px;">⚠️ Issues Encountered</h3>
        <ul style="margin: 0; padding-left: 20px;">`;

    errors.forEach(err => {
      html += `<li style="color: #7f1d1d; font-size: 13px; margin-bottom: 4px;">${err.ticker}: ${err.error}</li>`;
    });

    html += `</ul>
      </div>`;
  }

  // Add footer
  html += `
    </div>

    <!-- Footer -->
    <div style="text-align: center; padding: 20px; border-top: 1px solid ${EmailColors.structure.border}; margin-top: 20px;">
      <p style="margin: 0 0 8px; color: ${EmailColors.text.meta}; font-size: 12px;">
        Powered by <a href="https://tldrsec.app" style="color: ${EmailColors.brand.primary}; text-decoration: none;">TLDR SEC</a>
      </p>
      <p style="margin: 0; color: ${EmailColors.text.meta}; font-size: 11px;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://tldrsec.app'}/settings/notifications" style="color: ${EmailColors.text.meta}; text-decoration: underline;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>`;

  return html;
}

/**
 * Extract inner content from a fully rendered HTML email template
 * Removes the DOCTYPE, html, head, and body wrappers
 */
function extractInnerContent(fullHtml: string): string {
  // Find the main content div inside the template
  const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (bodyMatch) {
    return bodyMatch[1];
  }
  // Fallback: return as-is if no body tag found
  return fullHtml;
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
    // Generate email content using minimalist templates
    const emailHtml = await generateHtmlEmail(summaries, errors);
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
