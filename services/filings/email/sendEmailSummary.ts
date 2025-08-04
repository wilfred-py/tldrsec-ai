import { FilingSummaryResult, FilingError } from '../../filing/types';
import { FilingType } from '../../../types/sec/filing';
import * as secService from '../../secService';
import { getFilingSummary } from '../summaries/filingSummaryService';
import { sendSummaryEmail } from './emailGenerator';

/**
 * Sends an email summary of the latest filings for a list of tickers
 * 
 * @param email Email address to send the summary to
 * @param tickers List of ticker symbols to include in the summary
 * @param debug Whether to send debug information in the email
 * @returns Object containing success status and message
 */
export async function sendEmailSummary(
  email: string, 
  tickers: string[] = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'], 
  debug: boolean = false
): Promise<{ success: boolean, message?: string, error?: string }> {
  try {
    const summaries: FilingSummaryResult[] = [];
    const errors: FilingError[] = [];
    
    // Log the start of the process with ticker count
    console.log(`[INFO][EmailSummary] 🚀 Starting email summary generation for ${tickers.length} tickers: ${tickers.join(', ')}`);
    
    // Process each ticker
    for (let i = 0; i < tickers.length; i++) {
      const ticker = tickers[i];
      const progressPercent = Math.round(((i + 1) / tickers.length) * 100);
      console.log(`[INFO][EmailSummary] 🔍 Processing ticker ${i+1}/${tickers.length} (${progressPercent}%): ${ticker}`);
      
      try {
        // Get the latest filing for this ticker regardless of form type
        console.log(`[INFO][EmailSummary] 🔗 Fetching latest filings for ${ticker}...`);
        const latestFilings = await secService.getLatestFilings(ticker, 3);
        
        if (latestFilings && latestFilings.length > 0) {
          // Get the most recent filing
          const latestFiling = latestFilings[0];
          // The property is named 'form' in the filing object, not 'formType'
          const formType = latestFiling.form as FilingType;
          
          console.log(`[INFO][EmailSummary] 📄 Latest filing for ${ticker} is ${formType} from ${latestFiling.filingDate}`);
          
          // Generate a summary for this filing
          console.log(`[INFO][EmailSummary] 🤖 Generating summary for ${ticker} - ${formType}...`);
          const summaryStartTime = Date.now();
          const result = await getFilingSummary(ticker, formType);
          const summaryDuration = Math.round((Date.now() - summaryStartTime) / 1000);
          
          if (result.data) {
            console.log(`[INFO][EmailSummary] ✅ Successfully generated summary for ${ticker} - ${formType} (${summaryDuration}s)`);
            summaries.push(result.data);
          } else {
            const errorMessage = result.error || 'Unknown error';
            
            // Check if this is a rate limit related error
            if (errorMessage.toLowerCase().includes('rate limit') || 
                errorMessage.toLowerCase().includes('quota') ||
                errorMessage.toLowerCase().includes('usage limit')) {
              console.warn(`[WARN][EmailSummary] ⏳ Rate limit detected for ${ticker} - ${formType}: ${errorMessage} (waited ${summaryDuration}s)`);
            } else {
              console.error(`[ERROR][EmailSummary] ❌ Failed to generate summary for ${ticker} - ${formType}: ${errorMessage} (${summaryDuration}s)`);
            }
            
            errors.push({ ticker, error: errorMessage });
          }
        } else {
          console.warn(`[WARN][EmailSummary] No recent filings found for ${ticker}`);
          errors.push({ ticker, error: 'No recent filings found' });
        }
      } catch (error: unknown) {
        // Handle errors for individual tickers
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // Enhanced error context for different types of failures
        if (errorMessage.toLowerCase().includes('rate limit') || 
            errorMessage.toLowerCase().includes('quota') ||
            errorMessage.toLowerCase().includes('usage limit')) {
          console.warn(`[WARN][EmailSummary] ⏳ Rate limit or quota error processing ${ticker}: ${errorMessage}`);
        } else if (errorMessage.toLowerCase().includes('timeout') ||
                   errorMessage.toLowerCase().includes('network') ||
                   errorMessage.toLowerCase().includes('connection')) {
          console.warn(`[WARN][EmailSummary] 🌐 Network/timeout error processing ${ticker}: ${errorMessage}`);
        } else if (errorMessage.toLowerCase().includes('database') ||
                   errorMessage.toLowerCase().includes('prisma')) {
          console.error(`[ERROR][EmailSummary] 🗄️ Database error processing ${ticker}: ${errorMessage}`);
        } else {
          console.error(`[ERROR][EmailSummary] ❌ Unexpected error processing ${ticker}: ${errorMessage}`);
        }
        
        errors.push({ ticker, error: errorMessage });
      }
    }
    
    // Log summary of processing results
    const rateLimitErrors = errors.filter(e => 
      e.error.toLowerCase().includes('rate limit') || 
      e.error.toLowerCase().includes('quota') ||
      e.error.toLowerCase().includes('usage limit')
    );
    
    const networkErrors = errors.filter(e => 
      e.error.toLowerCase().includes('timeout') || 
      e.error.toLowerCase().includes('network') ||
      e.error.toLowerCase().includes('connection')
    );
    
    const databaseErrors = errors.filter(e => 
      e.error.toLowerCase().includes('database') || 
      e.error.toLowerCase().includes('prisma')
    );
    
    const otherErrors = errors.filter(e => 
      !rateLimitErrors.includes(e) && 
      !networkErrors.includes(e) && 
      !databaseErrors.includes(e)
    );
    
    console.log(`[INFO][EmailSummary] 📊 Processing completed for ${tickers.length} tickers:`, {
      successful: summaries.length,
      failed: errors.length,
      rateLimitErrors: rateLimitErrors.length,
      networkErrors: networkErrors.length, 
      databaseErrors: databaseErrors.length,
      otherErrors: otherErrors.length,
      successRate: `${Math.round((summaries.length / tickers.length) * 100)}%`
    });
    
    if (summaries.length === 0 && !debug) {
      // Instead of throwing an error, return a graceful failure response
      console.warn(`[WARN][EmailSummary] No filing summaries could be generated for any of the ${tickers.length} tickers`);
      return { 
        success: false, 
        message: `No filing summaries could be generated for any of the ${tickers.length} tickers` 
      };
    }
    
    // Send the email with summaries and errors
    console.log(`[INFO][EmailSummary] 📧 Sending email to ${email} with ${summaries.length} summaries and ${errors.length} errors`);
    const emailResult = await sendSummaryEmail(email, summaries, errors, debug);
    
    if (emailResult.success) {
      console.log(`[INFO][EmailSummary] ✅ Email sent successfully to ${email}`);
      return { 
        success: true, 
        message: `Email sent successfully to ${email} with ${summaries.length} summaries` 
      };
    } else {
      console.error(`[ERROR][EmailSummary] ❌ Failed to send email: ${emailResult.error}`);
      return { 
        success: false, 
        error: `Failed to send email: ${emailResult.error}` 
      };
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[ERROR][EmailSummary] ❌ Error sending email summary: ${errorMessage}`);
    return { 
      success: false, 
      error: `Error sending email summary: ${errorMessage}` 
    };
  }
}
