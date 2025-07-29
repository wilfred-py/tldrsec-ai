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
    const activeMonitoring = await Promise.all(
      activeSymbols.map(async (symbol) => {
        const subscriberCount = tickersWithSubscribers.find(t => t.symbol === symbol)?._count.id || 0;
        
        // Get CIK from CikMapping
        const cikMapping = await prisma.cikMapping.findFirst({
          where: { ticker: symbol }
        });

        if (!cikMapping) {
          monitoringLogger.warn(`No CIK mapping found for ticker ${symbol}`);
          return null;
        }

        // Get or create TickerMonitoring record
        const monitoring = await prisma.tickerMonitoring.upsert({
          where: { cik: cikMapping.cik },
          update: {
            subscriberCount,
            isActive: true,
            symbol: cikMapping.ticker,
            companyName: cikMapping.companyName
          },
          create: {
            cik: cikMapping.cik,
            symbol: cikMapping.ticker,
            companyName: cikMapping.companyName,
            rssUrl: generateSecRssUrl(cikMapping.cik),
            subscriberCount,
            isActive: true
          }
        });

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
      })
    );

    const validMonitoring = activeMonitoring.filter(m => m !== null) as ActiveTicker[];
    
    monitoringLogger.info(`Found ${validMonitoring.length} active tickers for monitoring`, {
      symbols: validMonitoring.map(t => t.symbol),
      totalSubscribers: validMonitoring.reduce((sum, t) => sum + t.subscriberCount, 0)
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
    monitoringLogger.debug(`Checking for new filings: ${ticker.symbol}`, {
      cik: ticker.cik,
      lastChecked: ticker.lastChecked,
      lastAccessionSeen: ticker.lastAccessionSeen
    });

    // Fetch RSS feed
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

    // Update last checked time and latest accession
    if (rssFeed.entries.length > 0) {
      const latestAccession = rssFeed.entries[0].accessionNumber;
      
      await prisma.tickerMonitoring.update({
        where: { id: ticker.id },
        data: {
          lastChecked: new Date(),
          lastAccessionSeen: latestAccession
        }
      });
    }

    // Save new entries to database
    if (newEntries.length > 0) {
      await prisma.rssFilingCheck.createMany({
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
      error,
      cik: ticker.cik
    });
    
    // Update last checked even on error to avoid getting stuck
    await prisma.tickerMonitoring.update({
      where: { id: ticker.id },
      data: { lastChecked: new Date() }
    }).catch(() => {}); // Ignore update errors
    
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
export async function markFilingAsProcessed(rssFilingCheckId: string): Promise<void> {
  try {
    await prisma.rssFilingCheck.update({
      where: { id: rssFilingCheckId },
      data: { processed: true }
    });
  } catch (error) {
    monitoringLogger.error('Failed to mark filing as processed', { 
      error, 
      rssFilingCheckId 
    });
    throw error;
  }
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