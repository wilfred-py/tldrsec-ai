import { FilingSummaryResult, FilingError } from '../../filing/types';
import { FilingType } from '../../../types/sec/filing';
import * as secService from '../../secService';
import { getFilingSummary } from '../summaries/filingSummaryService';
import { sendSummaryEmail } from './emailGenerator';
import { logger } from '../../../lib/logging';
import { monitoring } from '@/lib/monitoring';

const emailSummaryLogger = logger.child('email-summary');

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
    emailSummaryLogger.info('Starting email summary generation', {
      tickerCount: tickers.length,
      tickers: tickers.join(', ')
    });

    // Track email summary start metrics
    monitoring.incrementCounter('email_summary.started', 1);
    monitoring.recordValue('email_summary.ticker_count', tickers.length);
    const summaryTimerName = monitoring.startTimer('email_summary.total_duration');
    
    // Process each ticker
    for (let i = 0; i < tickers.length; i++) {
      const ticker = tickers[i];
      const progressPercent = Math.round(((i + 1) / tickers.length) * 100);
      emailSummaryLogger.info('Processing ticker', {
        ticker,
        progress: `${i+1}/${tickers.length}`,
        progressPercent,
        index: i + 1,
        total: tickers.length
      });
      
      try {
        // Get the latest filing for this ticker regardless of form type
        emailSummaryLogger.debug('Fetching latest filings', { ticker });
        const latestFilings = await secService.getLatestFilings(ticker, 3);
        
        if (latestFilings && latestFilings.length > 0) {
          // Get the most recent filing
          const latestFiling = latestFilings[0];
          // The property is named 'form' in the filing object, not 'formType'
          const formType = latestFiling.form as FilingType;
          
          emailSummaryLogger.info('Latest filing found', {
            ticker,
            formType,
            filingDate: latestFiling.filingDate
          });
          
          // Generate a summary for this filing
          emailSummaryLogger.debug('Generating summary', { ticker, formType });
          const summaryStartTime = Date.now();
          const result = await getFilingSummary(ticker, formType);
          const summaryDuration = Math.round((Date.now() - summaryStartTime) / 1000);
          
          if (result.data) {
            emailSummaryLogger.info('Successfully generated summary', {
              ticker,
              formType,
              duration: summaryDuration
            });
            summaries.push(result.data);
          } else {
            const errorMessage = result.error || 'Unknown error';
            
            // Check if this is a rate limit related error
            if (errorMessage.toLowerCase().includes('rate limit') || 
                errorMessage.toLowerCase().includes('quota') ||
                errorMessage.toLowerCase().includes('usage limit')) {
              emailSummaryLogger.warn('Rate limit detected during summary generation', {
                ticker,
                formType,
                error: errorMessage,
                duration: summaryDuration
              });
            } else {
              emailSummaryLogger.error('Failed to generate summary', {
                ticker,
                formType,
                error: errorMessage,
                duration: summaryDuration
              });
            }
            
            errors.push({ ticker, error: errorMessage });
          }
        } else {
          emailSummaryLogger.warn('No recent filings found', { ticker });
          errors.push({ ticker, error: 'No recent filings found' });
        }
      } catch (error: unknown) {
        // Handle errors for individual tickers
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        // Enhanced error context for different types of failures
        if (errorMessage.toLowerCase().includes('rate limit') || 
            errorMessage.toLowerCase().includes('quota') ||
            errorMessage.toLowerCase().includes('usage limit')) {
          emailSummaryLogger.warn('Rate limit or quota error during ticker processing', {
            ticker,
            error: errorMessage,
            errorType: 'rateLimit'
          });
        } else if (errorMessage.toLowerCase().includes('timeout') ||
                   errorMessage.toLowerCase().includes('network') ||
                   errorMessage.toLowerCase().includes('connection')) {
          emailSummaryLogger.warn('Network/timeout error during ticker processing', {
            ticker,
            error: errorMessage,
            errorType: 'network'
          });
        } else if (errorMessage.toLowerCase().includes('database') ||
                   errorMessage.toLowerCase().includes('prisma')) {
          emailSummaryLogger.error('Database error during ticker processing', {
            ticker,
            error: errorMessage,
            errorType: 'database'
          });
        } else {
          emailSummaryLogger.error('Unexpected error during ticker processing', {
            ticker,
            error: errorMessage,
            errorType: 'unknown'
          });
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
    
    emailSummaryLogger.info('Processing completed for all tickers', {
      tickerCount: tickers.length,
      successful: summaries.length,
      failed: errors.length,
      rateLimitErrors: rateLimitErrors.length,
      networkErrors: networkErrors.length, 
      databaseErrors: databaseErrors.length,
      otherErrors: otherErrors.length,
      successRate: Math.round((summaries.length / tickers.length) * 100)
    });

    // Track completion metrics
    const totalDuration = monitoring.stopTimer(summaryTimerName);
    monitoring.incrementCounter('email_summary.completed', 1);
    monitoring.recordValue('email_summary.successful_summaries', summaries.length);
    monitoring.recordValue('email_summary.failed_summaries', errors.length);
    monitoring.recordValue('email_summary.rate_limit_errors', rateLimitErrors.length);
    monitoring.recordValue('email_summary.network_errors', networkErrors.length);
    monitoring.recordValue('email_summary.database_errors', databaseErrors.length);
    monitoring.recordValue('email_summary.other_errors', otherErrors.length);
    monitoring.recordValue('email_summary.success_rate_percent', Math.round((summaries.length / tickers.length) * 100));
    
    if (summaries.length === 0 && !debug) {
      // Instead of throwing an error, return a graceful failure response
      emailSummaryLogger.warn('No filing summaries could be generated', {
        tickerCount: tickers.length,
        errorCount: errors.length
      });
      return { 
        success: false, 
        message: `No filing summaries could be generated for any of the ${tickers.length} tickers` 
      };
    }
    
    // Send the email with summaries and errors
    emailSummaryLogger.info('Sending email with summaries', {
      email,
      summaryCount: summaries.length,
      errorCount: errors.length
    });
    const emailResult = await sendSummaryEmail(email, summaries, errors, debug);
    
    if (emailResult.success) {
      emailSummaryLogger.info('Email sent successfully', {
        email,
        summaryCount: summaries.length
      });
      return { 
        success: true, 
        message: `Email sent successfully to ${email} with ${summaries.length} summaries` 
      };
    } else {
      emailSummaryLogger.error('Failed to send email', {
        email,
        error: emailResult.error
      });
      return { 
        success: false, 
        error: `Failed to send email: ${emailResult.error}` 
      };
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    emailSummaryLogger.error('Error sending email summary', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined
    });
    return { 
      success: false, 
      error: `Error sending email summary: ${errorMessage}` 
    };
  }
}
