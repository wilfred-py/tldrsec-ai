import { FilingSummary } from '../../types/sec/filing';
import { FilingSummaryResult, FilingError } from './types';
import { prisma } from '../../lib/db/index';
import { emailClient } from '../../lib/email';
import { getEmailTemplate } from '../../lib/email/templates';
import { EmailType } from '../../lib/email/types';
import { sanitizeForEmail, generatePlainTextEmail } from './utils';

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
        // Find the ticker record
        const tickerRecord = await prisma.ticker.findFirst({
          where: {
            symbol: ticker.toUpperCase()
          }
        });
        
        if (!tickerRecord) {
          console.log(`[INFO][FilingService] No ticker record found for ${ticker}`);
          errors.push({
            ticker,
            error: `No ticker record found for ${ticker}`
          });
          continue;
        }
        
        // Get the latest summaries for this ticker that haven't been sent to the user yet
        const latestSummaries = await prisma.summary.findMany({
          where: {
            tickerId: tickerRecord.id,
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
      
      // Only send the email if not in debug mode
      if (debug) {
        // Create a mock result for testing
        emailResult = { id: 'debug-mode-' + Date.now(), success: true };
        console.log(`[DEBUG][FilingService] Debug mode - email would be sent to ${email}`);
      } else {
        console.log(`[INFO][FilingService] Sending email summary to: ${email} with ${summaries.length} summaries and ${errors.length} errors`);
        emailResult = await emailClient.sendEmail(emailParams);
        console.log(`[INFO][FilingService] Email sent successfully to ${email}`);
      }
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
          // Find the ticker record
          const tickerRecord = await prisma.ticker.findFirst({
            where: {
              symbol: summary.ticker.toUpperCase()
            }
          });
          
          if (tickerRecord) {
            // Find the summary record
            const summaryRecord = await prisma.summary.findFirst({
              where: {
                tickerId: tickerRecord.id,
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
      console.log(`[INFO][FilingService] | ${summary.ticker.padEnd(6)} | ${String(summary.filingType).padEnd(10)} | Success     | ${String(summary.inputTokens || 'N/A').padEnd(4)} | ${String(summary.outputTokens || 'N/A').padEnd(4)} | ${String(summary.cost?.toFixed(4) || '0.0000').padEnd(7)} | `);
    }
    
    // Add each error to the table
    for (const error of errors) {
      const ticker = error.ticker.padEnd(6);
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
