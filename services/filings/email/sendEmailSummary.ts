import { FilingSummaryResult, FilingError } from '../../filing/types';
import { FilingType } from '../../../types/sec/filing';
import * as secService from '../../secService';
import { getFilingSummary } from '../summaries/filingSummaryService';
import { sendSummaryEmail } from './emailGenerator';
import { logger } from '../../../lib/logging';
import { monitoring } from '@/lib/monitoring';
import { checkIfFilingProcessed } from '../utils/filingProcessingStatus';
import { trackEmailDelivery, StoreSummaryOptions } from '../database/filingDatabase';

const emailSummaryLogger = logger.child('email-summary');

// Shape of the rate-limit errors this classifier detects. Kept local to the
// only caller now that the former services/filings/enhanced/rateLimiter.ts
// orbital has been deleted; classifyError is duck-typed on `.type`.
type RateLimitError = Error & {
  type: 'RATE_LIMIT' | 'DAILY_LIMIT' | 'QUOTA_EXCEEDED';
  retryAfter?: number;
  resetTime?: Date;
};

/**
 * Enhanced error classification types
 */
type ErrorCategory = 'rateLimit' | 'network' | 'database' | 'api' | 'unknown';

/**
 * Classify errors using multiple detection methods for better accuracy
 */
function classifyError(error: unknown): { category: ErrorCategory; details?: Record<string, unknown> } {
  if (!error) return { category: 'unknown' };
  
  // Check for RateLimitError interface first (most reliable)
  if (typeof error === 'object' && error !== null && 'type' in error) {
    const rateLimitError = error as RateLimitError;
    if (rateLimitError.type === 'RATE_LIMIT' || 
        rateLimitError.type === 'DAILY_LIMIT' || 
        rateLimitError.type === 'QUOTA_EXCEEDED') {
      return { 
        category: 'rateLimit', 
        details: { 
          type: rateLimitError.type, 
          retryAfter: rateLimitError.retryAfter,
          resetTime: rateLimitError.resetTime
        }
      };
    }
  }
  
  // Check for HTTP status codes if available
  if (typeof error === 'object' && error !== null) {
    const errorWithStatus = error as Record<string, unknown>;
    if (errorWithStatus.status === 429 || errorWithStatus.statusCode === 429) {
      return { category: 'rateLimit', details: { httpStatus: 429 } };
    }
    if (errorWithStatus.status >= 500 || errorWithStatus.statusCode >= 500) {
      return { category: 'api', details: { httpStatus: errorWithStatus.status || errorWithStatus.statusCode } };
    }
  }
  
  // Fallback to string-based classification (enhanced patterns)
  const errorMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  
  // Rate limit patterns (more comprehensive)
  const rateLimitPatterns = [
    'rate limit', 'quota', 'usage limit', 'too many requests', 
    'api limit', 'throttled', 'quota exceeded', 'rate exceeded'
  ];
  if (rateLimitPatterns.some(pattern => errorMessage.includes(pattern))) {
    return { category: 'rateLimit', details: { detectedBy: 'stringPattern' } };
  }
  
  // Network/timeout patterns
  const networkPatterns = [
    'timeout', 'network', 'connection', 'enotfound', 'econnrefused', 
    'econnreset', 'socket hang up', 'request failed', 'fetch failed'
  ];
  if (networkPatterns.some(pattern => errorMessage.includes(pattern))) {
    return { category: 'network', details: { detectedBy: 'stringPattern' } };
  }
  
  // Database patterns
  const databasePatterns = [
    'database', 'prisma', 'connection pool', 'sql', 'query', 
    'transaction', 'unique constraint', 'foreign key'
  ];
  if (databasePatterns.some(pattern => errorMessage.includes(pattern))) {
    return { category: 'database', details: { detectedBy: 'stringPattern' } };
  }
  
  // API-specific patterns
  const apiPatterns = [
    'bad request', 'unauthorized', 'forbidden', 'not found', 
    'internal server error', 'service unavailable', 'bad gateway'
  ];
  if (apiPatterns.some(pattern => errorMessage.includes(pattern))) {
    return { category: 'api', details: { detectedBy: 'stringPattern' } };
  }
  
  return { category: 'unknown', details: { detectedBy: 'fallback' } };
}

/**
 * Sends an email summary of the latest filings for a list of tickers
 *
 * @param email Email address to send the summary to
 * @param tickers List of ticker symbols to include in the summary
 * @param debug Whether to send debug information in the email
 * @param storageOptions Options for marking summaries as test data
 * @returns Object containing success status and message
 */
export async function sendEmailSummary(
  email: string,
  tickers: string[] = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'],
  debug: boolean = false,
  storageOptions?: StoreSummaryOptions
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
          
          // Smart cache bypass: only bypass if this specific filing hasn't been processed yet
          // This preserves cost-sharing between users while ensuring fresh filings get processed
          const hasBeenProcessed = await checkIfFilingProcessed(ticker, formType, latestFiling.accessionNumber);
          const shouldBypassCache = !hasBeenProcessed;
          
          emailSummaryLogger.debug('Cache bypass decision', { 
            ticker, 
            formType, 
            accessionNumber: latestFiling.accessionNumber,
            hasBeenProcessed,
            shouldBypassCache
          });
          
          const result = await getFilingSummary(ticker, formType, {
            bypassCache: shouldBypassCache,
            fromCron: false,
            storageOptions
          });
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
            const classification = classifyError(new Error(errorMessage));
            
            // Log based on error classification
            const logData = {
              ticker,
              formType,
              error: errorMessage,
              duration: summaryDuration,
              errorCategory: classification.category,
              errorDetails: classification.details
            };
            
            if (classification.category === 'rateLimit') {
              emailSummaryLogger.warn('Rate limit detected during summary generation', logData);
            } else if (classification.category === 'network') {
              emailSummaryLogger.warn('Network error during summary generation', logData);
            } else if (classification.category === 'database') {
              emailSummaryLogger.error('Database error during summary generation', logData);
            } else if (classification.category === 'api') {
              emailSummaryLogger.warn('API error during summary generation', logData);
            } else {
              emailSummaryLogger.error('Failed to generate summary', logData);
            }
            
            errors.push({ ticker, error: errorMessage });
          }
        } else {
          emailSummaryLogger.warn('No recent filings found', { ticker });
          errors.push({ ticker, error: 'No recent filings found' });
        }
      } catch (error: unknown) {
        // Handle errors for individual tickers using enhanced classification
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const classification = classifyError(error);
        
        // Create enhanced log data with classification details
        const logData = {
          ticker,
          error: errorMessage,
          errorCategory: classification.category,
          errorDetails: classification.details
        };
        
        // Log based on error classification with appropriate severity
        switch (classification.category) {
          case 'rateLimit':
            emailSummaryLogger.warn('Rate limit error during ticker processing', logData);
            break;
          case 'network':
            emailSummaryLogger.warn('Network error during ticker processing', logData);
            break;
          case 'database':
            emailSummaryLogger.error('Database error during ticker processing', logData);
            break;
          case 'api':
            emailSummaryLogger.warn('API error during ticker processing', logData);
            break;
          default:
            emailSummaryLogger.error('Unexpected error during ticker processing', logData);
        }
        
        errors.push({ ticker, error: errorMessage });
      }
    }
    
    // Log summary of processing results using enhanced error classification
    const errorsByCategory = errors.reduce((acc, e) => {
      const classification = classifyError(new Error(e.error));
      acc[classification.category] = (acc[classification.category] || 0) + 1;
      return acc;
    }, {} as Record<ErrorCategory, number>);

    const rateLimitErrors = errorsByCategory.rateLimit || 0;
    const networkErrors = errorsByCategory.network || 0;
    const databaseErrors = errorsByCategory.database || 0;
    const apiErrors = errorsByCategory.api || 0;
    const unknownErrors = errorsByCategory.unknown || 0;
    
    emailSummaryLogger.info('Processing completed for all tickers', {
      tickerCount: tickers.length,
      successful: summaries.length,
      failed: errors.length,
      rateLimitErrors,
      networkErrors, 
      databaseErrors,
      apiErrors,
      unknownErrors,
      successRate: Math.round((summaries.length / tickers.length) * 100),
      errorsByCategory: errorsByCategory
    });

    // Track completion metrics with enhanced categorization
    monitoring.stopTimer(summaryTimerName);
    monitoring.incrementCounter('email_summary.completed', 1);
    monitoring.recordValue('email_summary.successful_summaries', summaries.length);
    monitoring.recordValue('email_summary.failed_summaries', errors.length);
    monitoring.recordValue('email_summary.rate_limit_errors', rateLimitErrors);
    monitoring.recordValue('email_summary.network_errors', networkErrors);
    monitoring.recordValue('email_summary.database_errors', databaseErrors);
    monitoring.recordValue('email_summary.api_errors', apiErrors);
    monitoring.recordValue('email_summary.unknown_errors', unknownErrors);
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
      
      // Track email delivery analytics for each summary that was sent
      for (const summary of summaries) {
        try {
          if (summary.databaseId) {
            await trackEmailDelivery(summary.databaseId, email, 'summary_digest');
            emailSummaryLogger.debug('Email delivery tracked', {
              ticker: summary.ticker,
              filingType: summary.filingType,
              databaseId: summary.databaseId,
              email
            });
          } else {
            // Cache hits may not have databaseId - this is expected for cached results
            emailSummaryLogger.debug('Email delivery tracking skipped - no databaseId', {
              ticker: summary.ticker,
              filingType: summary.filingType,
              isCacheHit: summary.isCacheHit,
              email
            });
          }
        } catch (trackingError) {
          emailSummaryLogger.warn('Failed to track email delivery analytics', {
            error: trackingError,
            ticker: summary.ticker,
            databaseId: summary.databaseId,
            email
          });
        }
      }
      
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
