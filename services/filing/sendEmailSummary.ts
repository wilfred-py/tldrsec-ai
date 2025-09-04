import { FilingSummary } from '../../types/sec/filing';
import { FilingSummaryResult, FilingError } from './types';
import { prisma } from '../../lib/db/index';
import { emailClient } from '../../lib/email';
import { getEmailTemplate } from '../../lib/email/templates';
import { EmailType } from '../../lib/email/types';
import { sanitizeForEmail, generatePlainTextEmail } from './utils';

/**
 * SECURITY: Comprehensive input validation to prevent SQL injection and other attacks
 */
export function validateAndSanitizeTicker(ticker: string): { valid: boolean; sanitizedValue: string; error?: string } {
  // Type validation
  if (typeof ticker !== 'string') {
    return { valid: false, sanitizedValue: '', error: 'Ticker must be a string' };
  }
  
  // Length validation - tickers are typically 1-5 characters
  if (ticker.length < 1 || ticker.length > 10) {
    return { valid: false, sanitizedValue: '', error: 'Ticker length invalid (1-10 chars)' };
  }
  
  // Character validation - only alphanumeric characters allowed
  const tickerRegex = /^[A-Z0-9]+$/;
  const upperTicker = ticker.toUpperCase().trim();
  
  if (!tickerRegex.test(upperTicker)) {
    return { valid: false, sanitizedValue: '', error: 'Ticker contains invalid characters' };
  }
  
  // Additional security: prevent common SQL injection patterns
  const dangerousPatterns = [
    /['";]/,                    // Quotes and semicolons
    /\b(DROP|DELETE|INSERT|UPDATE|CREATE|ALTER|EXEC|EXECUTE)\b/i, // SQL keywords
    /--/,                       // SQL comments
    /\/\*/,                     // Block comments
    /\*\//,
    /\bunion\b/i,              // Union attacks
    /\bselect\b/i,             // Select statements
    /\bwhere\b/i,              // Where clauses
    /[<>]/                      // HTML/XSS prevention
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(upperTicker)) {
      return { valid: false, sanitizedValue: '', error: 'Ticker contains potentially malicious content' };
    }
  }
  
  return { valid: true, sanitizedValue: upperTicker };
}

/**
 * SECURITY: Validate user ID to prevent injection attacks
 */
export function validateUserId(userId: string): { valid: boolean; sanitizedValue: string; error?: string } {
  // Type validation
  if (typeof userId !== 'string') {
    return { valid: false, sanitizedValue: '', error: 'User ID must be a string' };
  }
  
  // Length validation - UUIDs are typically 36 characters, but allow some flexibility
  if (userId.length < 10 || userId.length > 50) {
    return { valid: false, sanitizedValue: '', error: 'User ID length invalid' };
  }
  
  // Character validation - allow alphanumeric, hyphens, underscores
  const userIdRegex = /^[a-zA-Z0-9_-]+$/;
  const trimmedUserId = userId.trim();
  
  if (!userIdRegex.test(trimmedUserId)) {
    return { valid: false, sanitizedValue: '', error: 'User ID contains invalid characters' };
  }
  
  // Prevent SQL injection patterns
  const dangerousPatterns = [
    /['";]/,
    /\b(DROP|DELETE|INSERT|UPDATE|CREATE|ALTER|EXEC|EXECUTE)\b/i,
    /--/,
    /\/\*/,
    /\*\//,
    /\bunion\b/i,
    /\bselect\b/i
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(trimmedUserId)) {
      return { valid: false, sanitizedValue: '', error: 'User ID contains potentially malicious content' };
    }
  }
  
  return { valid: true, sanitizedValue: trimmedUserId };
}

/**
 * Send an email summary of the latest filings
 * @param email Recipient email address
 * @param tickers List of tickers to include in the summary
 * @param debug Debug mode flag
 */
export async function sendEmailSummary(
  email: string,
  tickers: string[] = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'],
  debug: boolean = false
) {
  try {
    console.log(`[INFO][FilingService] Starting email summary process for ${email}`);
    console.log(`[INFO][FilingService] Tickers: ${tickers.join(', ')}`);
    
    // Get the latest summaries for each ticker
    const summaries: FilingSummaryResult[] = [];
    const errors: FilingError[] = [];
    
    for (const ticker of tickers) {
      try {
        // Input validation and sanitization - prevent SQL injection
        const sanitizedTicker = validateAndSanitizeTicker(ticker);
        if (!sanitizedTicker.valid) {
          console.log(`[SECURITY][FilingService] Invalid ticker input: ${ticker}`);
          errors.push({
            ticker,
            error: `Invalid ticker format: ${sanitizedTicker.error}`
          });
          continue;
        }
        
        // Find ALL ticker records with this symbol (there might be duplicates from different users)
        const tickerRecords = await prisma.ticker.findMany({
          where: {
            symbol: sanitizedTicker.sanitizedValue
          }
        });
        
        if (tickerRecords.length === 0) {
          console.log(`[INFO][FilingService] No ticker record found for ${ticker}`);
          errors.push({
            ticker,
            error: `No ticker record found for ${ticker}`
          });
          continue;
        }
        
        // Get the latest summaries from ALL ticker records for this symbol that haven't been sent to the user yet
        const latestSummaries = await prisma.summary.findMany({
          where: {
            tickerId: {
              in: tickerRecords.map(t => t.id)
            },
            sentToUser: false
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 5 // Limit to 5 latest summaries per ticker
        });
        
        if (latestSummaries.length === 0) {
          console.log(`[INFO][FilingService] No new summaries found for ${ticker}`);
          continue;
        }
        
        // Process each summary
        for (const summary of latestSummaries) {
          try {
            // Parse the summary JSON
            const summaryData = summary.summaryJSON as unknown as FilingSummary;
            
            if (!summaryData) {
              console.log(`[INFO][FilingService] Invalid summary data for ${ticker}`);
              errors.push({
                ticker,
                error: `Invalid summary data for ${ticker}`
              });
              continue;
            }
            
            // Create a summary result object
            const summaryResult: FilingSummaryResult = {
              ticker: summaryData.ticker,
              companyName: summaryData.companyName,
              filingType: summaryData.filingType,
              filingDate: summaryData.filingDate,
              accessionNumber: summaryData.accessionNumber,
              summaryText: summaryData.summaryText,
              keyPoints: summaryData.keyPoints || [],
              url: summaryData.url,
              filingUrl: summaryData.filingUrl,
              inputTokens: summaryData.inputTokens,
              outputTokens: summaryData.outputTokens,
              cost: summaryData.cost
            };
            
            summaries.push(summaryResult);
          } catch (summaryError: any) {
            console.error(`[ERROR][FilingService] Error processing summary for ${ticker}: ${summaryError.message}`);
            errors.push({
              ticker,
              error: `Error processing summary: ${summaryError.message}`
            });
          }
        }
      } catch (tickerError: any) {
        console.error(`[ERROR][FilingService] Error getting summaries for ${ticker}: ${tickerError.message}`);
        errors.push({
          ticker,
          error: `Error getting summaries: ${tickerError.message}`
        });
      }
    }
    
    // If there are no summaries and no errors, don't send an email
    if (summaries.length === 0 && errors.length === 0) {
      console.log(`[INFO][FilingService] No summaries or errors to send for ${email}`);
      return {
        success: true,
        message: 'No summaries to send',
        summaryCount: 0,
        errorCount: 0
      };
    }
    
    // Create a single email with all summaries instead of concatenating multiple HTML documents
    // Create filing data for the digest template
    
    // Define types for the ticker groups structure
    type FilingData = {
      symbol: string;
      companyName: string;
      filingType: string;
      filingDate: Date;
      filingUrl: string;
      summaryUrl: string;
      summaryId: string;
      summaryText: string;
      summaryData: FilingSummary;
    };
    
    type TickerGroup = {
      symbol: string;
      companyName: string;
      filings: FilingData[];
    };
    
    // Group summaries by ticker with sanitized data
    const tickerGroups = summaries.reduce<TickerGroup[]>((groups, summary) => {
      // Find the existing group for this ticker
      const existingGroup = groups.find(g => g.symbol === summary.ticker);
      
      // Sanitize text fields
      const sanitizedSummary = {
        ticker: sanitizeForEmail(summary.ticker),
        companyName: sanitizeForEmail(summary.companyName),
        filingType: sanitizeForEmail(summary.filingType),
        filingDate: summary.filingDate,
        filingUrl: sanitizeForEmail(summary.filingUrl || summary.url || ''),
        summaryUrl: sanitizeForEmail(summary.url || ''),
        accessionNumber: sanitizeForEmail(summary.accessionNumber),
        summaryText: sanitizeForEmail(summary.summaryText)
      };
      
      if (existingGroup) {
        // Add this filing to the existing group
        existingGroup.filings.push({
          symbol: sanitizedSummary.ticker,
          companyName: sanitizedSummary.companyName,
          filingType: sanitizedSummary.filingType,
          filingDate: new Date(sanitizedSummary.filingDate),
          filingUrl: sanitizedSummary.filingUrl,
          summaryUrl: sanitizedSummary.summaryUrl,
          summaryId: sanitizedSummary.accessionNumber,
          summaryText: sanitizedSummary.summaryText,
          summaryData: summary // Keep the original data for reference
        });
      } else {
        // Create a new group for this ticker
        groups.push({
          symbol: sanitizedSummary.ticker,
          companyName: sanitizedSummary.companyName,
          filings: [{
            symbol: sanitizedSummary.ticker,
            companyName: sanitizedSummary.companyName,
            filingType: sanitizedSummary.filingType,
            filingDate: new Date(sanitizedSummary.filingDate),
            filingUrl: sanitizedSummary.filingUrl,
            summaryUrl: sanitizedSummary.summaryUrl,
            summaryId: sanitizedSummary.accessionNumber,
            summaryText: sanitizedSummary.summaryText,
            summaryData: summary // Keep the original data for reference
          }]
        });
      }
      return groups;
    }, []);
    
    // Generate a single email using the digest template
    // Don't pass errors directly to the template as it may not handle them correctly
    const { html: emailHtml, text: emailText } = await getEmailTemplate(EmailType.DIGEST, {
      recipientName: '',
      recipientEmail: email,
      unsubscribeUrl: process.env.UNSUBSCRIBE_URL || '',
      preferencesUrl: process.env.PREFERENCES_URL || '',
      currentYear: new Date().getFullYear(),
      tickerGroups: tickerGroups
    });
    
    // If there are errors, sanitize them and append to the text version
    let finalEmailText = emailText;
    if (errors.length > 0) {
      // Sanitize error messages to prevent invalid characters
      const sanitizedErrors = errors.map(err => ({
        ticker: sanitizeForEmail(err.ticker),
        error: sanitizeForEmail(err.error || 'Unknown error')
      }));
      
      finalEmailText += '\n\nIssues Encountered:\n' + 
        sanitizedErrors.map(err => `${err.ticker}: ${err.error}`).join('\n');
    }
    
    
    // Send email using the pre-initialized emailClient
    let emailResult;
    try {
      const emailParams = {
        to: email,
        subject: `SEC Filing Summaries - ${new Date().toLocaleDateString()}`,
        html: emailHtml,
        text: finalEmailText, // Using the properly generated text version
        tags: ['type:summaries', 'content:filings'], // Using simple string tags with colons
        replyTo: 'no-reply@tldrsec.app'
      };
      
      // Log email sending details, with debug flag indication if applicable
      console.log(`[INFO][FilingService] Sending email summary to: ${email} with ${summaries.length} summaries and ${errors.length} errors${debug ? ' (debug mode)' : ''}`);
      
      // Always use the real email client
      emailResult = await emailClient.sendEmail(emailParams);
      console.log(`[INFO][FilingService] Email sent successfully to ${email}`);
    } catch (error) {
      console.error(`[ERROR][FilingService] Failed to send email:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send email'
      };
    }
    
    // Check if the email was actually sent successfully
    if (!emailResult || !('id' in emailResult)) {
      console.error('[ERROR][FilingService] Failed to send email: No valid ID returned from email service');
      return {
        success: false,
        message: 'Failed to send email: No valid ID returned',
        summaryCount: summaries.length,
        errorCount: errors.length
      };
    }
    
    // Mark summaries as sent to users
    try {
      // Update the summary records in the database to mark them as sent
      if (summaries.length > 0) {
        for (const summary of summaries) {
          // Find ALL ticker records for this symbol
          const tickerRecords = await prisma.ticker.findMany({
            where: {
              symbol: (summary.ticker || '').toUpperCase()
            }
          });
          
          if (tickerRecords.length > 0) {
            // Find the summary record across all ticker records for this symbol
            const summaryRecord = await prisma.summary.findFirst({
              where: {
                tickerId: {
                  in: tickerRecords.map(t => t.id)
                },
                filingType: summary.filingType as string,
                summaryJSON: {
                  path: ['accessionNumber'],
                  equals: summary.accessionNumber
                }
              }
            });
            
            if (summaryRecord) {
              // Update the summary record to mark it as sent
              await prisma.summary.update({
                where: { id: summaryRecord.id },
                data: { sentToUser: true }
              });
            }
          }
        }
      }
    } catch (dbError) {
      console.error(`[ERROR][FilingService] Error updating summary records: ${dbError}`);
      // Continue with the process, don't fail the email just because of DB update issues
    }
    
    console.log('[INFO][FilingService] Email sent successfully to', email);
    console.log('[INFO][FilingService] Time:', new Date().toISOString());
    console.log('[INFO][FilingService] Recipient:', email);
    console.log('[INFO][FilingService] ----------------------------------------');
    console.log('[INFO][FilingService] | Ticker | Filing Type | Status      | In  | Out | Cost ($) | Failure Reason');
    console.log('[INFO][FilingService] |--------|------------|-------------|-----|-----|---------|----------------');
    
    // Log each filing's status
    for (const summary of summaries) {
      const ticker = (summary.ticker || 'N/A').padEnd(6);
      const filingType = String(summary.filingType || 'N/A').padEnd(10);
      const inputTokens = String(summary.inputTokens || 'N/A').padEnd(4);
      const outputTokens = String(summary.outputTokens || 'N/A').padEnd(4);
      const cost = String(summary.cost?.toFixed(4) || '0.0000').padEnd(7);
      console.log(`[INFO][FilingService] | ${ticker} | ${filingType} | Success     | ${inputTokens} | ${outputTokens} | ${cost} | `);
    }
    
    // Add each error to the table
    for (const error of errors) {
      const ticker = (error.ticker || 'N/A').padEnd(6);
      const filingType = 'N/A'.padEnd(10);
      const status = 'Failed'.padEnd(11);
      const inTokens = 'N/A'.padEnd(4);
      const outTokens = 'N/A'.padEnd(4);
      const cost = 'N/A'.padEnd(7);
      const failureReason = error.error ? error.error.substring(0, 40) : '';
      console.log(`[INFO][FilingService] | ${ticker} | ${filingType} | ${status} | ${inTokens} | ${outTokens} | ${cost} | ${failureReason}`);
    }
    
    // Add summary statistics
    console.log(`[INFO][FilingService] ----------------------------------------`);
    const totalInputTokens = summaries.reduce((sum, s) => sum + (s.inputTokens || 0), 0);
    const totalOutputTokens = summaries.reduce((sum, s) => sum + (s.outputTokens || 0), 0);
    const totalCost = summaries.reduce((sum, s) => sum + (s.cost || 0), 0).toFixed(4);
    console.log(`[INFO][FilingService] | Total  | ${summaries.length} success | ${errors.length} failed | ${totalInputTokens} | ${totalOutputTokens} | ${totalCost} |`);
    console.log(`[INFO][FilingService] ========================================\n`);
    
    console.log(`[INFO][FilingService] Email summary process completed successfully`);
    
    // The emailResult is already set from the previous code block
    
    // Final return
    return {
      success: true,
      message: 'Email summary sent successfully!',
      summaries,
      errors
    };
  } catch (error) {
    console.error(`[ERROR][FilingService] Failed to send email summary: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.error(`[ERROR][FilingService] Stack trace: ${error instanceof Error ? error.stack : 'No stack trace'}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send email summary'
    };
  }
}

/**
 * Send email notification when summary generation fails
 */
export async function sendSummaryFailureNotification(
  userEmail: string,
  companyName: string,
  ticker: string,
  filingType: string,
  error: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const displayName = `${companyName} (${ticker})`;
    
    // Create HTML content for error notification
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin-bottom: 20px;">
          <div style="display: flex; align-items: center; margin-bottom: 12px;">
            <div style="width: 20px; height: 20px; color: #ef4444; margin-right: 8px;">⚠️</div>
            <h3 style="margin: 0; color: #991b1b; font-size: 16px;">Summary Generation Failed</h3>
          </div>
          
          <p style="color: #991b1b; margin: 8px 0; font-size: 14px;">
            We encountered an issue generating the AI summary for the <strong>${filingType}</strong> filing from <strong>${displayName}</strong>.
          </p>
          
          <p style="color: #7f1d1d; margin: 8px 0; font-size: 12px;">
            Our team has been automatically notified and is working to resolve the issue. 
            You can view the original filing or try again later through your dashboard.
          </p>
          
          <div style="background-color: #fee2e2; padding: 8px; border-radius: 4px; margin-top: 12px;">
            <p style="color: #7f1d1d; margin: 0; font-size: 11px; font-family: monospace;">
              Technical details: ${error}
            </p>
          </div>
        </div>
        
        <div style="background-color: #f0f9ff; border: 1px solid #bfdbfe; padding: 16px; border-radius: 8px;">
          <p style="color: #1e40af; margin: 0; font-size: 12px;">
            <strong>💡 What you can do:</strong> You can still access the original SEC filing document for complete details. 
            Summary generation typically resolves within 15-30 minutes, after which you can try accessing the summary again from your dashboard.
          </p>
        </div>
        
        <div style="text-align: center; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
          <a href="https://tldrsec.app/dashboard" 
             style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-size: 14px;">
            Visit Dashboard
          </a>
        </div>
        
        <div style="text-align: center; margin-top: 16px;">
          <p style="color: #6b7280; font-size: 12px; margin: 0;">
            Need help? Contact us at 
            <a href="mailto:support@tldrsec.app" style="color: #2563eb;">support@tldrsec.app</a>
          </p>
        </div>
      </div>
    `;

    // Create plain text version
    const textContent = `
Summary Generation Failed

We encountered an issue generating the AI summary for the ${filingType} filing from ${displayName}.

Our team has been automatically notified and is working to resolve the issue. You can view the original filing or try again later through your dashboard.

Technical details: ${error}

What you can do:
You can still access the original SEC filing document for complete details. Summary generation typically resolves within 15-30 minutes, after which you can try accessing the summary again from your dashboard.

Visit your dashboard: https://tldrsec.app/dashboard

Need help? Contact us at support@tldrsec.app
    `;

    // Send the email notification
    const emailResult = await emailClient.sendEmail({
      to: userEmail,
      subject: `Summary Generation Issue - ${displayName} ${filingType}`,
      html: htmlContent,
      text: textContent,
      tags: ['type_notification', 'content_error', 'priority_low']
    });

    if (emailResult.success) {
      console.log(`[INFO] Summary failure notification sent to ${userEmail} for ${ticker} ${filingType}`);
      return {
        success: true,
        messageId: emailResult.messageId
      };
    } else {
      console.error(`[ERROR] Failed to send summary failure notification: ${emailResult.error}`);
      return {
        success: false,
        error: emailResult.error
      };
    }

  } catch (error) {
    console.error(`[ERROR] Error sending summary failure notification: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send notification'
    };
  }
}
