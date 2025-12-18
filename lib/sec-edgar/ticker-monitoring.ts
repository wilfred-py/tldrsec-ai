import { getPrismaClient } from '../db/prisma';
import { fetchSecCompanyRSS, generateSecRssUrl, type RSSFilingEntry } from './rss-parser';
import { fetchCompanyFilingsUnified, isDevelopmentEnvironment } from './environment-aware-fetcher';
import { logger } from '../logging';
import { upsertTickerMonitoringWithLock, updateTickerMonitoringWithLock, ConcurrencyOptions } from '../db/concurrency';
import { SecApiCache, getSecApiCache, withSecApiCache } from '../cache/sec-api-cache';

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

export interface RSSFilingEntryWithId extends RSSFilingEntry {
  id: string; // Database ID for transaction processing
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

            // Get or create TickerMonitoring record with optimistic locking
            const monitoringResult = await upsertTickerMonitoringWithLock(
              cikMapping.cik,
              {
                symbol: cikMapping.ticker,
                companyName: cikMapping.companyName || `Company ${cikMapping.ticker}`,
                rssUrl: generateSecRssUrl(cikMapping.cik),
                subscriberCount,
                isActive: true
              },
              {
                subscriberCount,
                isActive: true,
                symbol: cikMapping.ticker,
                companyName: cikMapping.companyName || `Company ${cikMapping.ticker}`
              },
              {
                maxRetries: 3,
                baseDelay: 100,
                maxDelay: 1000
              }
            );
            
            // Get the full monitoring record for return
            const monitoring = await prisma.tickerMonitoring.findUnique({
              where: { id: monitoringResult.id },
              select: {
                id: true,
                cik: true,
                symbol: true,
                companyName: true,
                rssUrl: true,
                lastChecked: true,
                lastAccessionSeen: true,
                subscriberCount: true
              }
            });
            
            if (!monitoring) {
              throw new Error(`Failed to retrieve TickerMonitoring record ${monitoringResult.id}`);
            }

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
 * Check for new filings for a specific ticker using environment-aware fetcher
 * Automatically uses RSS (local) or REST API (Railway) based on environment
 *
 * Uses RSS response caching to prevent duplicate SEC API calls within
 * the same discovery execution window (60-second TTL).
 */
export async function checkTickerForNewFilings(ticker: ActiveTicker): Promise<RSSFilingEntry[]> {
  try {
    // Validate ticker data
    if (!ticker.cik || typeof ticker.cik !== 'string' || ticker.cik.trim() === '') {
      throw new Error(`Invalid CIK for ticker ${ticker.symbol}: ${ticker.cik}`);
    }

    monitoringLogger.debug(`Checking for new filings: ${ticker.symbol}`, {
      cik: ticker.cik,
      symbol: ticker.symbol,
      lastChecked: ticker.lastChecked,
      lastAccessionSeen: ticker.lastAccessionSeen,
      environment: isDevelopmentEnvironment() ? 'Development' : 'Production'
    });

    // Generate cache key for RSS feed response
    const cacheKey = SecApiCache.generateKey('rss_feed', ticker.symbol, { cik: ticker.cik });

    // Use cached RSS response or fetch from SEC API with 1-minute TTL
    // This prevents duplicate SEC API calls during the same discovery execution
    const filingResponse = await withSecApiCache(
      cacheKey,
      async () => {
        monitoringLogger.debug(`Fetching RSS feed for ${ticker.symbol} (cache miss)`, {
          cik: ticker.cik
        });
        return await fetchCompanyFilingsUnified(ticker.cik, 20); // Get more entries for better filtering
      },
      1 // 1 minute TTL - prevents duplicate calls within same discovery window
    );
    
    if (!filingResponse.success) {
      throw new Error(`Environment-aware fetch failed: ${filingResponse.error}`);
    }

    // Convert unified response to RSS feed format for compatibility
    const rssFeed = {
      cik: filingResponse.cik,
      companyName: filingResponse.companyName,
      entries: filingResponse.entries,
      lastUpdated: filingResponse.lastUpdated
    };
    
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

    // Update last checked time and latest accession with optimistic locking
    if (rssFeed.entries.length > 0) {
      const latestAccession = rssFeed.entries[0].accessionNumber;
      
      await updateTickerMonitoringWithLock(
        ticker.id,
        {
          lastChecked: new Date(),
          lastAccessionSeen: latestAccession
        },
        {
          maxRetries: 3,
          baseDelay: 100,
          maxDelay: 1000
        }
      );
    } else {
      // Update last checked even if no new filings
      try {
        await updateTickerMonitoringWithLock(
          ticker.id,
          {
            lastChecked: new Date()
          },
          {
            maxRetries: 2,
            baseDelay: 100,
            maxDelay: 500
          }
        );
      } catch (error) {
        // Allow silent failure for lastChecked updates to avoid breaking the flow
        monitoringLogger.warn(`Failed to update lastChecked for ${ticker.symbol}, continuing`, {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
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
        fetchMethod: filingResponse.source,
        environment: isDevelopmentEnvironment() ? 'Development' : 'Production',
        companyName: filingResponse.companyName,
        newFilings: newEntries.map(e => ({
          accession: e.accessionNumber,
          type: e.filingType,
          date: e.filingDate
        }))
      });
    } else {
      monitoringLogger.debug(`No new filings found for ${ticker.symbol}`, { 
        cik: ticker.cik,
        fetchMethod: filingResponse.source,
        totalEntries: rssFeed.entries.length
      });
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
      await updateTickerMonitoringWithLock(
        ticker.id,
        { lastChecked: new Date() },
        { 
          maxRetries: 1, 
          baseDelay: 50, 
          maxDelay: 200 
        }
      );
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
 * Get unprocessed filings for a specific ticker symbol
 * This replaces the second call to checkTickerForNewFilings in the cron job pipeline
 */
export async function getUnprocessedFilingsForTicker(
  tickerSymbol: string, 
  userId?: string
): Promise<RSSFilingEntryWithId[]> {
  try {
    // SECURITY: Validate ticker symbol parameter
    if (!tickerSymbol || typeof tickerSymbol !== 'string') {
      throw new Error('Invalid ticker symbol: must be a non-empty string');
    }

    // Sanitize ticker symbol - only allow alphanumeric characters, 1-10 chars
    const sanitizedSymbol = tickerSymbol.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10);
    if (sanitizedSymbol.length === 0 || sanitizedSymbol !== tickerSymbol.toUpperCase()) {
      monitoringLogger.warn(`Invalid ticker symbol format: ${tickerSymbol}`, {
        originalSymbol: tickerSymbol,
        sanitizedSymbol,
        userId
      });
      throw new Error(`Invalid ticker symbol format: ${tickerSymbol}`);
    }

    monitoringLogger.debug(`Getting unprocessed filings for ticker: ${sanitizedSymbol}`, {
      userId
    });

    // Find unprocessed filings for this specific ticker
    const unprocessedFilings = await prisma.rssFilingCheck.findMany({
      where: {
        processed: false,
        tickerMonitoring: {
          symbol: sanitizedSymbol
        }
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
      }
    });

    // Convert database records to RSSFilingEntryWithId format (includes database ID)
    const rssEntries: RSSFilingEntryWithId[] = unprocessedFilings.map(filing => ({
      id: filing.id, // Include database ID for transaction processing
      accessionNumber: filing.accessionNumber,
      filingType: filing.filingType,
      filingDate: filing.filingDate,
      filingUrl: filing.filingUrl,
      rssEntryDate: filing.rssEntryDate,
      title: `${filing.filingType} - ${filing.tickerMonitoring.companyName}`
    }));

    monitoringLogger.info(`Found ${rssEntries.length} unprocessed filings for ${sanitizedSymbol}`, {
      userId,
      filings: rssEntries.map(f => ({
        accession: f.accessionNumber,
        type: f.filingType,
        date: f.filingDate
      }))
    });

    return rssEntries;

  } catch (error) {
    monitoringLogger.error(`Failed to get unprocessed filings for ticker: ${tickerSymbol}`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      tickerSymbol,
      userId
    });
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
 * Mark a filing as processed by accession number for a specific ticker
 * This is used when we only have the accession number and need to find the corresponding RssFilingCheck record
 */
export async function markFilingAsProcessedByAccession(
  accessionNumber: string, 
  tickerSymbol: string, 
  userId?: string
): Promise<void> {
  try {
    monitoringLogger.debug(`Marking filing as processed: ${accessionNumber} for ${tickerSymbol}`, {
      userId
    });

    await retryDatabaseOperation(async () => {
      return await prisma.rssFilingCheck.updateMany({
        where: { 
          accessionNumber,
          tickerMonitoring: {
            symbol: tickerSymbol.toUpperCase()
          }
        },
        data: { 
          processed: true
        }
      });
    }, 3, `mark filing ${accessionNumber} as processed for ${tickerSymbol}`);

    monitoringLogger.info(`Successfully marked filing as processed: ${accessionNumber} for ${tickerSymbol}`, {
      userId
    });

  } catch (error) {
    monitoringLogger.error('Failed to mark filing as processed by accession', { 
      error: error instanceof Error ? error.message : 'Unknown error', 
      accessionNumber,
      tickerSymbol,
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
  // SECURITY: Validate userId parameter to prevent injection attacks
  if (!userId || typeof userId !== 'string') {
    throw new Error('Invalid userId: must be a non-empty string');
  }
  
  // Sanitize userId to prevent log injection and other attacks
  const sanitizedUserId = userId.replace(/[^\w-]/g, '').substring(0, 50);
  if (sanitizedUserId !== userId || sanitizedUserId.length < 10) {
    throw new Error('Invalid userId format: contains invalid characters or too short');
  }
  
  const results = [];
  
  for (const ticker of tickers) {
    try {
      // SECURITY: Validate ticker symbol to prevent injection attacks
      if (!ticker || !ticker.symbol || typeof ticker.symbol !== 'string') {
        results.push({
          symbol: 'INVALID',
          cik: null,
          valid: false
        });
        continue;
      }
      
      // Sanitize ticker symbol - only allow alphanumeric characters, 1-10 chars
      const sanitizedSymbol = ticker.symbol.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10);
      if (sanitizedSymbol.length === 0 || sanitizedSymbol !== ticker.symbol.toUpperCase()) {
        monitoringLogger.warn(`Invalid ticker symbol format: ${ticker.symbol}`, {
          userId: sanitizedUserId,
          originalSymbol: ticker.symbol,
          sanitizedSymbol
        });
        results.push({
          symbol: ticker.symbol,
          cik: null,
          valid: false
        });
        continue;
      }
      
      const cik = await getCikForTicker(sanitizedSymbol);
      const valid = cik !== null;
      
      results.push({
        symbol: sanitizedSymbol,
        cik,
        valid
      });
      
      if (!valid) {
        monitoringLogger.warn(`Ticker ${sanitizedSymbol} for user ${sanitizedUserId} has no valid CIK`, {
          userId: sanitizedUserId,
          ticker: sanitizedSymbol
        });
      }
    } catch (error) {
      monitoringLogger.error(`Failed to validate ticker ${sanitizedSymbol} for user ${sanitizedUserId}`, {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: sanitizedUserId,
        ticker: sanitizedSymbol
      });
      
      results.push({
        symbol: sanitizedSymbol,
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