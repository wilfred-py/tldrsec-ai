'use server';

import { getEmailTemplate } from './templates';
import { EmailType, EmailMessage } from './types';
import { sendEmail } from './index';
import { logger } from '../logging';
import { SecureEmailLogger } from './security-helpers';
import { EmailSubjectService } from './subject-service';
import { resolveSecPrimaryDocumentUrl } from './url-utils';

// Create secure logger to prevent PII exposure
const secureLogger = new SecureEmailLogger(logger.child('summary-service'));

/**
 * Upgrade an EDGAR filing URL to its primary document URL when possible.
 *
 * `Summary.url` (primaryDocUrl) is intermittently null upstream — at the time
 * of the campaign-link audit, 100% of recent rows had `url=null` and a
 * `-index.htm` `filingUrl`. The renderer-layer resolver is the load-bearing
 * mechanism for those rows. `resolveSecPrimaryDocumentUrl` fetches EDGAR's
 * `index.json` (cache-keyed by accession, so a digest with N filings makes at
 * most N EDGAR fetches per process lifetime regardless of recipient count)
 * and returns the input URL unchanged on any failure — never throws.
 */
async function safeResolveFilingUrl(filingUrl: string, formType: string): Promise<string> {
  if (!filingUrl) return filingUrl;
  try {
    return await resolveSecPrimaryDocumentUrl(filingUrl, formType);
  } catch {
    return filingUrl;
  }
}

/**
 * Send a filing summary email for a specific filing
 */
export async function sendFilingSummaryEmail(
  recipientEmail: string,
  filingData: {
    companyName: string;
    ticker: string;
    filingType: string;
    filingDate: Date;
    summary: string;
    filingUrl: string;
    summaryData?: Record<string, unknown>;  // Structured AI response for rich email templates
    userId?: string;      // For feedback token generation
    summaryId?: string;   // For feedback token generation
    importance?: string;  // For importance badge in email
    smartSubject?: string; // AI-generated subject line
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    // Quality gate: don't send Form 4 emails with all-zero transaction data
    if (['3', '4', '144'].includes(filingData.filingType)) {
      const summaryJSON = filingData.summaryData as Record<string, unknown> | undefined;
      const txArr = Array.isArray(summaryJSON?.transactions) ? summaryJSON.transactions as Record<string, unknown>[] : [];

      if (txArr.length > 0) {
        const allZeroValues = txArr.every(t => {
          const shares = parseFloat(String(t.shares || '0').replace(/[$,]/g, '')) || 0;
          const price = parseFloat(String(t.pricePerShare || '0').replace(/[$,]/g, '')) || 0;
          const code = String(t.code || '').toUpperCase();
          const zeroOk = ['A', 'G', 'M', 'X', 'C', 'W', 'J', 'K'].includes(code);
          return shares === 0 && price === 0 && !zeroOk;
        });

        if (allZeroValues) {
          secureLogger.warn('Form 4 quality gate: blocking email with all-zero transaction data', {
            ticker: filingData.ticker,
            filingType: filingData.filingType,
            transactionCount: txArr.length,
          });
          return { success: false, error: 'Quality gate: all transactions have zero values' };
        }
      }
    }

    // Generate feedback links if userId and summaryId provided
    let feedbackUpUrl: string | undefined;
    let feedbackDownUrl: string | undefined;
    if (filingData.userId && filingData.summaryId) {
      try {
        const { generateFeedbackToken } = await import('./email-link-tokens');
        const token = generateFeedbackToken(filingData.userId, filingData.summaryId);
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tldrsec.app';
        feedbackUpUrl = `${baseUrl}/api/feedback?token=${encodeURIComponent(token)}&vote=up`;
        feedbackDownUrl = `${baseUrl}/api/feedback?token=${encodeURIComponent(token)}&vote=down`;
      } catch {
        // Non-fatal: skip feedback links if token generation fails
      }
    }

    // Resolve filingUrl to its primary document via EDGAR index.json. Caller
    // (summarize-cached-handler) already prefers cachedContent.primaryDocUrl,
    // but on cache miss / transient cache failure the URL falls back to the
    // raw -index.htm shape — same backstop the digest path now applies.
    const resolvedFilingUrl = await safeResolveFilingUrl(filingData.filingUrl, filingData.filingType);

    // Generate email content using filing data
    const { html, text } = await getEmailTemplate(EmailType.FILING_NOTIFICATION, {
      recipientName: 'Investor',
      recipientEmail,
      companyName: filingData.companyName,
      ticker: filingData.ticker,
      filingType: filingData.filingType,
      filingDate: filingData.filingDate,
      summary: filingData.summary,
      filingUrl: resolvedFilingUrl,
      summaryData: filingData.summaryData,  // Pass structured data to email template
      importance: filingData.importance,
      feedbackUpUrl,
      feedbackDownUrl,
      unsubscribeUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://tldrsec.app'}/dashboard/settings`,
      preferencesUrl: `${process.env.NEXT_PUBLIC_APP_URL}/settings`
    });

    // Use smart subject if available, fall back to standard
    const subject = filingData.smartSubject || EmailSubjectService.generateSmartSubject(
      filingData.summaryData || null,
      {
        filingType: filingData.filingType,
        companyName: filingData.companyName,
        ticker: filingData.ticker
      }
    );

    const message: EmailMessage = {
      to: recipientEmail,
      subject,
      html,
      text,
      tags: [
        'type:filing-notification',
        `filing-type:${filingData.filingType.toLowerCase()}`,
        `ticker:${filingData.ticker}`,
      ],
      metadata: {
        type: 'filing-notification',
        ticker: filingData.ticker,
        filingType: filingData.filingType,
        companyName: filingData.companyName,
      }
    };
    
    // Send email
    const result = await sendEmail(message);
    
    if (!result.success) {
      secureLogger.warn('Filing notification email failed', {
        error: result.error?.message,
        recipientEmail,
        ticker: filingData.ticker
      });
      return { success: false, error: result.error?.message || 'Failed to send email' };
    }
    
    secureLogger.info('Sent filing notification email', {
      to: recipientEmail,
      ticker: filingData.ticker,
      emailId: result.id
    });
    
    return { success: true };
  } catch (error) {
    secureLogger.error('Error sending filing summary email', {
      error: error instanceof Error ? error.message : 'Unknown error',
      recipientEmail,
      ticker: filingData.ticker
    });
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send filing summary email'
    };
  }
} 