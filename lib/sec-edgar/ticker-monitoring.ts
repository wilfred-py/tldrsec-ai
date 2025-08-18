import { getPrismaClient } from '../db/prisma';
import { fetchSecCompanyRSS, generateSecRssUrl, type RSSFilingEntry } from './rss-parser';
import { logger } from '../logging';

const prisma = getPrismaClient();
const monitoringLogger = logger.child('ticker-monitoring');

export interface ActiveTicker {
  id: string;
  cik: string;
  symbol: string;
  companyName: string;
  rssUrl: string;
  lastChecked: Date | null;
  lastAccessionSeen: string | null;
  subscriberCount: number;
}

/**
 * Get all active tickers that need monitoring
 * A ticker is active if it has at least one user subscription
 */
export async function getActiveTickersForMonitoring(): Promise<ActiveTicker[]> {
  try {
    // Get unique tickers with subscriber counts
    const tickersWithSubscribers = await prisma.ticker.groupBy({
      by: ['symbol'],
      _count: {
        id: true
      },
      having: {
        id: {
          _count: {
            gt: 0
          }
        }
      }
    });

    const activeSymbols = tickersWithSubscribers.map(t => t.symbol);
    
    if (activeSymbols.length === 0) {
      monitoringLogger.info('No active ticker subscriptions found');
      return [];
    }

    // Get or create TickerMonitoring records for active symbols
    const activeMonitoring: (ActiveTicker | null)[] = [];
    
    // Process symbols in smaller batches to avoid overwhelming the database
    const BATCH_SIZE = 10;
    for (let i = 0; i < activeSymbols.length; i += BATCH_SIZE) {
      const symbolBatch = activeSymbols.slice(i, i + BATCH_SIZE);
      
      const batchResults = await Promise.all(
        symbolBatch.map(async (symbol) => {
          try {
            const subscriberCount = tickersWithSubscribers.find(t => t.symbol === symbol)?._count.id || 0;
            
            // Get CIK from CikMapping with better error handling
            const cikMapping = await prisma.cikMapping.findFirst({
              where: { ticker: symbol }
            });

            if (!cikMapping) {
              monitoringLogger.warn(`No CIK mapping found for ticker ${symbol}`, {
                availableTickers: await prisma.cikMapping.count()
              });
              return null;
            }

            // Validate CIK format
            if (!cikMapping.cik || typeof cikMapping.cik !== 'string' || cikMapping.cik.trim() === '') {
              monitoringLogger.error(`Invalid CIK for ticker ${symbol}`, {
                cik: cikMapping.cik,
                cikType: typeof cikMapping.cik
              });
              return null;
            }

            // Get or create TickerMonitoring record with retry logic
            const monitoring = await retryDatabaseOperation(async () => {
              return await prisma.tickerMonitoring.upsert({
                where: { cik: cikMapping.cik },
                update: {
                  subscriberCount,
                  isActive: true,
                  symbol: cikMapping.ticker,
                  companyName: cikMapping.companyName || `Company ${cikMapping.ticker}`,
                  updatedAt: new Date()
                },
                create: {
                  cik: cikMapping.cik,
                  symbol: cikMapping.ticker,
                  companyName: cikMapping.companyName || `Company ${cikMapping.ticker}`,
                  rssUrl: generateSecRssUrl(cikMapping.cik),
                  subscriberCount,
                  isActive: true
                }
              });
            }, 3, `upsert TickerMonitoring for ${symbol}`);

            return {
              id: monitoring.id,
              cik: monitoring.cik,
              symbol: monitoring.symbol,
              companyName: monitoring.companyName,
              rssUrl: monitoring.rssUrl,
              lastChecked: monitoring.lastChecked,
              lastAccessionSeen: monitoring.lastAccessionSeen,
              subscriberCount: monitoring.subscriberCount
            };
          } catch (error) {
            monitoringLogger.error(`Failed to process ticker ${symbol}`, { 
              error: error instanceof Error ? error.message : 'Unknown error',
              symbol 
            });
            return null;
          }
        })
      );
      
      activeMonitoring.push(...batchResults);
    }

    const validMonitoring = activeMonitoring.filter(m => m !== null) as ActiveTicker[];
    
    monitoringLogger.info(`Found ${validMonitoring.length} active tickers for monitoring`, {
      symbols: validMonitoring.map(t => t.symbol),
      totalSubscribers: validMonitoring.reduce((sum, t) => sum + t.subscriberCount, 0),
      failedTickers: activeSymbols.length - validMonitoring.length
    });

    return validMonitoring;

  } catch (error) {
    monitoringLogger.error('Failed to get active tickers for monitoring', { error });
    throw error;
  }
}

/**
 * Check for new filings for a specific ticker using RSS feed
 */
export async function checkTickerForNewFilings(ticker: ActiveTicker): Promise<RSSFilingEntry[]> {
  try {
    // Validate ticker data
    if (!ticker.cik || typeof ticker.cik !== 'string' || ticker.cik.trim() === '') {
      throw new Error(`Invalid CIK for ticker ${ticker.symbol}: ${ticker.cik}`);
    }

    monitoringLogger.debug(`Checking for new filings: ${ticker.symbol}`, {
      cik: ticker.cik,
      lastChecked: ticker.lastChecked,
      lastAccessionSeen: ticker.lastAccessionSeen
    });

    // Fetch RSS feed with error handling
    const rssFeed = await fetchSecCompanyRSS(ticker.cik);
    
    // Get existing accession numbers from database
    const existingChecks = await prisma.rssFilingCheck.findMany({
      where: {
        tickerMonitoringId: ticker.id
      },
      select: {
        accessionNumber: true
      }
    });

    const existingAccessions = new Set(existingChecks.map(c => c.accessionNumber));
    
    // Filter for new entries
    const newEntries = rssFeed.entries.filter(entry => 
      !existingAccessions.has(entry.accessionNumber)
    );

    // Update last checked time and latest accession with upsert fallback
    if (rssFeed.entries.length > 0) {
      const latestAccession = rssFeed.entries[0].accessionNumber;
      
      await retryDatabaseOperation(async () => {
        return await prisma.tickerMonitoring.update({
          where: { id: ticker.id },
          data: {
            lastChecked: new Date(),
            lastAccessionSeen: latestAccession
          }
        });
      }, 3, `update ticker monitoring for ${ticker.symbol}`);
    } else {
      // Update last checked even if no new filings
      await retryDatabaseOperation(async () => {
        return await prisma.tickerMonitoring.update({
          where: { id: ticker.id },
          data: {
            lastChecked: new Date()
          }
        });
      }, 3, `update last checked for ${ticker.symbol}`, true); // Allow silent failure
    }

    // Save new entries to database
    if (newEntries.length > 0) {
      await retryDatabaseOperation(async () => {
        return await prisma.rssFilingCheck.createMany({
          data: newEntries.map(entry => ({
            tickerMonitoringId: ticker.id,
            accessionNumber: entry.accessionNumber,
            filingType: entry.filingType,
            filingDate: entry.filingDate,
            filingUrl: entry.filingUrl,
            rssEntryDate: entry.rssEntryDate,
            processed: false
          })),
          skipDuplicates: true
        });
      }, 3, `create filing checks for ${ticker.symbol}`);

      monitoringLogger.info(`Found ${newEntries.length} new filings for ${ticker.symbol}`, {
        cik: ticker.cik,
        newFilings: newEntries.map(e => ({
          accession: e.accessionNumber,
          type: e.filingType,
          date: e.filingDate
        }))
      });
    } else {
      monitoringLogger.debug(`No new filings found for ${ticker.symbol}`, { cik: ticker.cik });
    }

    return newEntries;

  } catch (error) {
    monitoringLogger.error(`Failed to check for new filings: ${ticker.symbol}`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      cik: ticker.cik,
      tickerId: ticker.id
    });
    
    // Update last checked even on error to avoid getting stuck, but don't throw if this fails
    try {
      await prisma.tickerMonitoring.update({
        where: { id: ticker.id },
        data: { lastChecked: new Date() }
      });
    } catch (updateError) {
      monitoringLogger.warn(`Failed to update lastChecked for ${ticker.symbol} after error`, {
        updateError: updateError instanceof Error ? updateError.message : 'Unknown error'
      });
    }
    
    throw error;
  }
}

/**
 * Get unprocessed filings that need summarization
 */
export async function getUnprocessedFilings(limit: number = 10): Promise<Array<{
  id: string;
  accessionNumber: string;
  filingType: string;
  filingDate: Date;
  filingUrl: string;
  ticker: {
    cik: string;
    symbol: string;
    companyName: string;
  };
}>> {
  try {
    const unprocessed = await prisma.rssFilingCheck.findMany({
      where: {
        processed: false
      },
      include: {
        tickerMonitoring: {
          select: {
            cik: true,
            symbol: true,
            companyName: true
          }
        }
      },
      orderBy: {
        rssEntryDate: 'desc'
      },
      take: limit
    });

    return unprocessed.map(filing => ({
      id: filing.id,
      accessionNumber: filing.accessionNumber,
      filingType: filing.filingType,
      filingDate: filing.filingDate,
      filingUrl: filing.filingUrl,
      ticker: {
        cik: filing.tickerMonitoring.cik,
        symbol: filing.tickerMonitoring.symbol,
        companyName: filing.tickerMonitoring.companyName
      }
    }));

  } catch (error) {
    monitoringLogger.error('Failed to get unprocessed filings', { error });
    throw error;
  }
}

/**
 * Mark a filing as processed
 */
export async function markFilingAsProcessed(rssFilingCheckId: string, userId?: string): Promise<void> {
  try {
    await retryDatabaseOperation(async () => {
      return await prisma.rssFilingCheck.update({
        where: { id: rssFilingCheckId },
        data: { 
          processed: true
        }
      });
    }, 3, `mark filing ${rssFilingCheckId} as processed`);
  } catch (error) {
    monitoringLogger.error('Failed to mark filing as processed', { 
      error: error instanceof Error ? error.message : 'Unknown error', 
      rssFilingCheckId,
      userId 
    });
    throw error;
  }
}

/**
 * Get CIK for a specific ticker with validation and fallback
 */
export async function getCikForTicker(ticker: string): Promise<string | null> {
  try {
    // First try exact match
    let cikMapping = await prisma.cikMapping.findFirst({
      where: { ticker: ticker.toUpperCase() }
    });

    // If not found, try case-insensitive search
    if (!cikMapping) {
      cikMapping = await prisma.cikMapping.findFirst({
        where: { 
          ticker: {
            equals: ticker,
            mode: 'insensitive'
          }
        }
      });
    }

    if (!cikMapping) {
      monitoringLogger.warn(`No CIK mapping found for ticker ${ticker}`, {
        ticker,
        searchedUppercase: ticker.toUpperCase()
      });
      return null;
    }

    // Validate CIK
    const validation = validateCik(cikMapping.cik, ticker);
    if (!validation.valid) {
      monitoringLogger.error(`Invalid CIK found for ticker ${ticker}`, {
        cik: cikMapping.cik,
        error: validation.error
      });
      return null;
    }

    return cikMapping.cik;
  } catch (error) {
    monitoringLogger.error(`Failed to get CIK for ticker ${ticker}`, { 
      error: error instanceof Error ? error.message : 'Unknown error',
      ticker 
    });
    return null;
  }
}

/**
 * Validate user tickers and ensure they have valid CIKs
 */
export async function validateUserTickers(userId: string, tickers: Array<{symbol: string}>): Promise<Array<{symbol: string; cik: string | null; valid: boolean}>> {
  const results = [];
  
  for (const ticker of tickers) {
    try {
      const cik = await getCikForTicker(ticker.symbol);
      const valid = cik !== null;
      
      results.push({
        symbol: ticker.symbol,
        cik,
        valid
      });
      
      if (!valid) {
        monitoringLogger.warn(`Ticker ${ticker.symbol} for user ${userId} has no valid CIK`, {
          userId,
          ticker: ticker.symbol
        });
      }
    } catch (error) {
      monitoringLogger.error(`Failed to validate ticker ${ticker.symbol} for user ${userId}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        ticker: ticker.symbol
      });
      
      results.push({
        symbol: ticker.symbol,
        cik: null,
        valid: false
      });
    }
  }
  
  return results;
}

/**
 * Retry database operations with exponential backoff
 */
async function retryDatabaseOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  operationName: string = 'database operation',
  allowSilentFailure: boolean = false
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');
      
      if (attempt === maxRetries) {
        if (allowSilentFailure) {
          monitoringLogger.warn(`Final attempt failed for ${operationName}, but allowing silent failure`, {
            error: lastError.message,
            attempts: attempt
          });
          throw lastError;
        }
        monitoringLogger.error(`All ${maxRetries} attempts failed for ${operationName}`, {
          error: lastError.message
        });
        throw lastError;
      }
      
      // Exponential backoff: 100ms, 200ms, 400ms
      const delay = Math.min(100 * Math.pow(2, attempt - 1), 1000);
      monitoringLogger.warn(`Attempt ${attempt} failed for ${operationName}, retrying in ${delay}ms`, {
        error: lastError.message
      });
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

/**
 * Validate CIK format and existence
 */
export function validateCik(cik: string | null | undefined, ticker?: string): { valid: boolean; error?: string } {
  if (!cik) {
    return { valid: false, error: `CIK is null or undefined${ticker ? ` for ticker ${ticker}` : ''}` };
  }
  
  if (typeof cik !== 'string') {
    return { valid: false, error: `CIK must be a string${ticker ? ` for ticker ${ticker}` : ''}, got ${typeof cik}` };
  }
  
  const trimmedCik = cik.trim();
  if (trimmedCik === '') {
    return { valid: false, error: `CIK is empty${ticker ? ` for ticker ${ticker}` : ''}` };
  }
  
  // CIK should be numeric and 1-10 digits
  if (!/^\d{1,10}$/.test(trimmedCik)) {
    return { valid: false, error: `CIK format invalid${ticker ? ` for ticker ${ticker}` : ''}: ${cik}` };
  }
  
  return { valid: true };
}

/**
 * Clean up old monitoring data (keep last 30 days)
 */
export async function cleanupOldMonitoringData(): Promise<void> {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { count } = await prisma.rssFilingCheck.deleteMany({
      where: {
        processed: true,
        createdAt: {
          lt: thirtyDaysAgo
        }
      }
    });

    monitoringLogger.info(`Cleaned up ${count} old processed filing checks`);

  } catch (error) {
    monitoringLogger.error('Failed to cleanup old monitoring data', { error });
    // Don't throw - cleanup failures shouldn't break the main flow
  }
}