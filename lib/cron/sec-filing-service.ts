/**
 * SEC Filing monitoring service for cron jobs
 * Handles RSS feed monitoring, filing discovery, and ticker validation
 * Extracted from app/api/cron/tier-aware/route.ts
 */

import { logger } from '../logging';
import { CronJobMonitor } from '../monitoring/cron-monitor';
import { 
  getActiveTickersForMonitoring, 
  checkTickerForNewFilings,
  validateUserTickers,
  getUnprocessedFilingsForTicker,
  markFilingAsProcessedByAccession
} from '../sec-edgar/ticker-monitoring';
// import type { DatabaseUser } from './types';
import { MAX_CONCURRENT_RSS_CHECKS } from './types';

const filingLogger = logger.child('cron-sec-filing');

interface TickerMonitoring {
  id: string;
  symbol: string;
  cik: string;
  companyName: string;
  isActive: boolean;
  rssUrl: string;
  subscriberCount: number;
}

interface FilingInfo {
  id: string;
  accessionNumber: string;
  filingType: string;
  filingDate: Date;
  filingUrl: string;
}

interface TickerValidation {
  symbol: string;
  valid: boolean;
  cik?: string;
  companyName?: string;
  error?: string;
}

// Interface for filing with ticker context (used by discovery handler)
export interface FilingWithTicker {
  id: string;
  accessionNumber: string;
  formType: string;
  filingDate: string;
  url: string;
  ticker: string;
  title: string;
}

export class CronSecFilingService {
  /**
   * Check for new filings for a user's tickers
   * Used by discovery-handler to find new filings across all tracked tickers
   *
   * @param userTickers - Array of user's tracked tickers with basic info
   * @param userId - The user ID (for logging)
   * @returns Array of new filings with ticker context
   */
  static async checkForNewFilings(
    userTickers: Array<{ id: string; symbol: string; companyName: string | null; cik: string | null }>,
    userId: string
  ): Promise<FilingWithTicker[]> {
    const allNewFilings: FilingWithTicker[] = [];

    for (const userTicker of userTickers) {
      try {
        // Skip tickers without CIK
        if (!userTicker.cik) {
          filingLogger.debug(`Skipping ticker ${userTicker.symbol} - no CIK`, { userId });
          continue;
        }

        // Look up TickerMonitoring record to get full ActiveTicker info
        const { getPrismaClient } = await import('../db/prisma');
        const prisma = getPrismaClient();

        const tickerMonitoring = await prisma.tickerMonitoring.findFirst({
          where: { cik: userTicker.cik }
        });

        if (!tickerMonitoring) {
          filingLogger.debug(`No TickerMonitoring record for ${userTicker.symbol} (CIK: ${userTicker.cik})`, { userId });
          continue;
        }

        // Convert to ActiveTicker format expected by checkTickerForNewFilings
        const activeTicker = {
          id: tickerMonitoring.id,
          cik: tickerMonitoring.cik,
          symbol: tickerMonitoring.symbol,
          companyName: tickerMonitoring.companyName || userTicker.companyName || '',
          rssUrl: tickerMonitoring.rssUrl || '',
          lastChecked: tickerMonitoring.lastChecked,
          lastAccessionSeen: tickerMonitoring.lastAccessionSeen,
          subscriberCount: 1 // Not critical for this use case
        };

        // Check for new filings using the existing function
        const newFilings = await checkTickerForNewFilings(activeTicker);

        filingLogger.debug(`Checked ${userTicker.symbol} for new filings`, {
          userId,
          ticker: userTicker.symbol,
          newFilingsFound: newFilings.length
        });

        // Convert RSSFilingEntry to FilingWithTicker format
        for (const filing of newFilings) {
          allNewFilings.push({
            id: `${userTicker.symbol}-${filing.accessionNumber}`,
            accessionNumber: filing.accessionNumber,
            formType: filing.filingType,
            filingDate: filing.filingDate.toISOString().split('T')[0],
            url: filing.filingUrl,
            ticker: userTicker.symbol,
            title: filing.title
          });
        }
      } catch (error) {
        filingLogger.error(`Failed to check filings for ${userTicker.symbol}`, {
          userId,
          ticker: userTicker.symbol,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Continue with other tickers
      }
    }

    filingLogger.info(`Discovered ${allNewFilings.length} new filings for user`, {
      userId,
      tickersChecked: userTickers.length,
      filingsFound: allNewFilings.length,
      filings: allNewFilings.map(f => ({ ticker: f.ticker, form: f.formType, accession: f.accessionNumber }))
    });

    return allNewFilings;
  }

  /**
   * Core SEC filing monitoring - runs continuously regardless of market hours
   * SEC filings can be published 24/7 including weekends and holidays
   */
  static async runSecFilingMonitoring(monitor?: CronJobMonitor): Promise<{
    tickersChecked: number;
    newFilingsFound: number;
    errors: number;
  }> {
    try {
      filingLogger.info('Starting core SEC filing monitoring phase');
      
      // Phase 1: Check for new filings via RSS feeds
      const activeTickers = await getActiveTickersForMonitoring();
      
      if (activeTickers.length === 0) {
        filingLogger.info('No active tickers to monitor');
        return {
          tickersChecked: 0,
          newFilingsFound: 0,
          errors: 0
        };
      }
      
      filingLogger.info(`Monitoring ${activeTickers.length} active tickers for new SEC filings`);
      
      let newFilingsFound = 0;
      let errorCount = 0;
      
      // Process tickers in batches to avoid overwhelming SEC servers
      const batches = this.createTickerBatches(activeTickers, MAX_CONCURRENT_RSS_CHECKS);
      
      for (const batch of batches) {
        const batchResults = await this.processBatchOfTickers(batch, monitor);
        newFilingsFound += batchResults.newFilingsFound;
        errorCount += batchResults.errors;
        
        // Brief pause between batches to be respectful to SEC servers
        if (batches.indexOf(batch) < batches.length - 1) {
          await this.delay(1000);
        }
      }
      
      // Update monitoring metrics
      if (monitor) {
        await monitor.updateMetrics({
          tickersChecked: activeTickers.length,
          newFilingsFound,
          errorCount
        });
      }
      
      filingLogger.info('SEC filing RSS monitoring completed', {
        tickersChecked: activeTickers.length,
        newFilingsFound,
        errors: errorCount
      });
      
      return {
        tickersChecked: activeTickers.length,
        newFilingsFound,
        errors: errorCount
      };
      
    } catch (error) {
      filingLogger.error('SEC filing monitoring failed', { error });
      if (monitor) await monitor.updateMetrics({ errorCount: 1 });
      throw error;
    }
  }

  /**
   * Validate user tickers and return valid ones with CIK information
   */
  static async validateUserTickersForProcessing(
    userId: string,
    userTickers: Array<{ symbol: string; [key: string]: unknown }>
  ): Promise<TickerValidation[]> {
    try {
      if (!userTickers || userTickers.length === 0) {
        filingLogger.warn(`No tickers found for user ${userId}`);
        return [];
      }

      filingLogger.debug(`Validating ${userTickers.length} tickers for user ${userId}`);

      const tickerValidations = await validateUserTickers(userId, userTickers);
      
      const validTickers = (tickerValidations || []).filter(t => t && t.valid);
      const invalidTickers = (tickerValidations || []).filter(t => t && !t.valid);

      if (invalidTickers.length > 0) {
        filingLogger.warn(`Some tickers invalid for user ${userId}`, {
          userId,
          validCount: validTickers.length,
          totalCount: userTickers.length,
          invalidTickers: invalidTickers.map(t => t.symbol).filter(Boolean)
        });
      }

      filingLogger.info(`Validated tickers for user ${userId}`, {
        totalTickers: userTickers.length,
        validTickers: validTickers.length,
        invalidTickers: invalidTickers.length
      });

      return tickerValidations || [];

    } catch (error) {
      filingLogger.error(`Failed to validate tickers for user ${userId}`, {
        error: error instanceof Error ? error.message : 'Unknown validation error',
        userId,
        tickerCount: userTickers?.length || 0
      });
      return [];
    }
  }

  /**
   * Get unprocessed filings for a specific ticker and user
   */
  static async getUnprocessedFilingsForUser(
    tickerSymbol: string,
    userId: string
  ): Promise<FilingInfo[]> {
    try {
      filingLogger.debug(`Getting unprocessed filings for ${tickerSymbol} and user ${userId}`);

      const unprocessedFilings = await getUnprocessedFilingsForTicker(tickerSymbol, userId);

      if (!Array.isArray(unprocessedFilings)) {
        filingLogger.error(`Invalid response from getUnprocessedFilingsForTicker for ${tickerSymbol}`, {
          userId,
          ticker: tickerSymbol,
          responseType: typeof unprocessedFilings,
          response: unprocessedFilings
        });
        return [];
      }

      filingLogger.info(`Found ${unprocessedFilings.length} unprocessed filings for ${tickerSymbol}`, {
        userId,
        filingsFound: (unprocessedFilings || []).map(f => ({
          accession: f?.accessionNumber || 'unknown',
          type: f?.filingType || 'unknown',
          date: f?.filingDate || 'unknown'
        })).filter(f => f.accession !== 'unknown')
      });

      return unprocessedFilings.map(filing => ({
        id: filing.id,
        accessionNumber: filing.accessionNumber,
        filingType: filing.filingType,
        filingDate: filing.filingDate,
        filingUrl: filing.filingUrl || ''
      }));

    } catch (error) {
      filingLogger.error(`Failed to get unprocessed filings for ${tickerSymbol}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        ticker: tickerSymbol,
        errorStack: error instanceof Error ? error.stack : undefined
      });
      return [];
    }
  }

  /**
   * Mark a filing as processed after successful processing
   */
  static async markFilingAsProcessed(
    accessionNumber: string,
    tickerSymbol: string,
    userId: string
  ): Promise<void> {
    try {
      await markFilingAsProcessedByAccession(accessionNumber, tickerSymbol, userId);
      filingLogger.debug(`Marked filing as processed: ${accessionNumber} for ${tickerSymbol}`, {
        userId
      });
    } catch (error) {
      // Log error but don't fail the entire processing - the filing was successfully processed
      filingLogger.warn(`Failed to mark filing as processed, but filing processing was successful`, {
        filingId: accessionNumber,
        userId,
        ticker: tickerSymbol,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get filing processing metrics for monitoring
   */
  static async getFilingProcessingMetrics(
    tickerSymbol: string,
    userId: string
  ): Promise<{
    totalFilings: number;
    processedFilings: number;
    pendingFilings: number;
    lastProcessedDate?: Date;
  }> {
    try {
      // This would require additional database queries
      // For now, return basic metrics structure
      return {
        totalFilings: 0,
        processedFilings: 0,
        pendingFilings: 0
      };
    } catch (error) {
      filingLogger.error('Failed to get filing processing metrics', {
        error: error instanceof Error ? error.message : 'Unknown error',
        tickerSymbol,
        userId
      });
      return {
        totalFilings: 0,
        processedFilings: 0,
        pendingFilings: 0
      };
    }
  }

  /**
   * Create batches of tickers for concurrent processing
   */
  private static createTickerBatches<T>(
    tickers: T[],
    batchSize: number
  ): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < tickers.length; i += batchSize) {
      batches.push(tickers.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Process a batch of tickers for new filings
   */
  private static async processBatchOfTickers(
    batch: TickerMonitoring[],
    monitor?: CronJobMonitor
  ): Promise<{ newFilingsFound: number; errors: number }> {
    let newFilingsFound = 0;
    let errors = 0;

    const batchPromises = batch.map(async (ticker) => {
      try {
        const newFilings = await checkTickerForNewFilings(ticker);
        const filingsCount = newFilings.length;
        newFilingsFound += filingsCount;
        
        filingLogger.debug(`Checked ${ticker.symbol}: ${filingsCount} new filings`);
        
        return { filingsFound: filingsCount, error: null };
      } catch (error) {
        filingLogger.error(`Failed to check ticker ${ticker.symbol}`, { error });
        if (monitor) await monitor.updateMetrics({ errorCount: 1 });
        errors++;
        return { filingsFound: 0, error };
      }
    });

    const results = await Promise.allSettled(batchPromises);
    
    // Aggregate results from settled promises
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        if (result.value.error) {
          errors++;
        } else {
          newFilingsFound += result.value.filingsFound;
        }
      } else {
        errors++;
      }
    }

    return { newFilingsFound, errors };
  }

  /**
   * Helper function to create delays between batch processing
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if a filing should be processed based on form type and other criteria
   */
  static shouldProcessFiling(
    filingType: string,
    filingDate: Date,
    userPreferences?: {
      excludedFormTypes?: string[];
      minFilingAge?: number; // in hours
    }
  ): boolean {
    // Exclude certain form types if specified
    if (userPreferences?.excludedFormTypes?.includes(filingType.toUpperCase())) {
      return false;
    }

    // Check minimum filing age if specified
    if (userPreferences?.minFilingAge) {
      const ageInHours = (Date.now() - filingDate.getTime()) / (1000 * 60 * 60);
      if (ageInHours < userPreferences.minFilingAge) {
        return false;
      }
    }

    // Common form types that are typically processed
    const processableFormTypes = [
      '10-K', '10-Q', '8-K', 'DEF 14A', 'FORM 4', 'SC 13D', 'SC 13G',
      '10-K/A', '10-Q/A', '8-K/A', 'FORM 144'
    ];

    return processableFormTypes.includes(filingType.toUpperCase());
  }

  /**
   * Get filing priority based on form type (for processing order)
   */
  static getFilingPriority(filingType: string): number {
    const priorities: Record<string, number> = {
      '8-K': 1,     // Highest priority - current reports
      'FORM 4': 2,  // Insider trading reports
      '10-Q': 3,    // Quarterly reports
      '10-K': 4,    // Annual reports
      'DEF 14A': 5, // Proxy statements
      'SC 13D': 6,  // Beneficial ownership reports
      'SC 13G': 7,  // Beneficial ownership reports (passive)
      'FORM 144': 8, // Notice of proposed sale
    };

    return priorities[filingType.toUpperCase()] || 9; // Default to lowest priority
  }

  /**
   * Validate filing data structure
   */
  static validateFilingData(filing: unknown): filing is FilingInfo {
    if (!filing || typeof filing !== 'object') return false;
    
    const f = filing as Record<string, unknown>;
    return (
      typeof f.id === 'string' &&
      typeof f.accessionNumber === 'string' &&
      typeof f.filingType === 'string' &&
      f.filingDate instanceof Date &&
      (typeof f.filingUrl === 'string' || f.filingUrl === undefined)
    );
  }

  /**
   * Get summary of filing monitoring status
   */
  static async getMonitoringSummary(): Promise<{
    activeTickers: number;
    totalFilingsToday: number;
    processingErrors: number;
  }> {
    try {
      const activeTickers = await getActiveTickersForMonitoring();
      
      return {
        activeTickers: activeTickers.length,
        totalFilingsToday: 0, // Would require additional database query
        processingErrors: 0   // Would require error tracking
      };
    } catch (error) {
      filingLogger.error('Failed to get monitoring summary', { error });
      return {
        activeTickers: 0,
        totalFilingsToday: 0,
        processingErrors: 1
      };
    }
  }
}