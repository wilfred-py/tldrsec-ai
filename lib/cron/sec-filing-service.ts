/**
 * [Filing Discovery] — per-ticker RSS-check that emits new [Filing]s into the
 * cron pipeline.
 *
 * Implemented as one deep module behind the single exported function
 * `checkForNewFilings(tickers, userId)`. Called by
 * `lib/cron/handlers/discovery-handler.ts`; no other production caller.
 *
 * Replaces the former `CronSecFilingService` static-only class wrapper. The
 * class had already been reduced (see git history) to a single static
 * method after 9 sibling static methods (`runSecFilingMonitoring`,
 * `validateUserTickersForProcessing`, `getUnprocessedFilingsForUser`,
 * `markFilingAsProcessed`, `getFilingProcessingMetrics`, `shouldProcessFiling`,
 * `getFilingPriority`, `validateFilingData`, `getMonitoringSummary`) plus
 * their private helpers were deleted for having zero production callers.
 * Keeping the `class Foo { static bar() }` wrapper around one function
 * added interface without adding leverage — the class had no instance
 * state, no constructor, and one caller that invoked it as `Foo.bar(...)`.
 * Collapsing it to `checkForNewFilings(...)` shrinks the interface to what
 * the caller actually needs.
 */

import { logger } from '../logging';
import { checkTickerForNewFilings } from '../sec-edgar/ticker-monitoring';

const filingLogger = logger.child('cron-sec-filing');

export interface FilingWithTicker {
  id: string;
  accessionNumber: string;
  formType: string;
  filingDate: string;
  url: string;
  ticker: string;
  title: string;
}

/**
 * Walk a list of tickers and return any new [Filing]s observed since each
 * ticker's last RSS check. Tickers without a CIK or without a
 * `TickerMonitoring` row are skipped silently; failures on one ticker
 * never abort the loop.
 *
 * Supports two modes:
 * 1. User-centric: Pass `userId` for user-specific discovery (legacy)
 * 2. Ticker-centric: Pass `null` for `userId` for multi-user discovery (preferred)
 */
export async function checkForNewFilings(
  tickers: Array<{ id: string; symbol: string; companyName: string | null; cik: string | null }>,
  userId: string | null
): Promise<FilingWithTicker[]> {
  const logContext = userId ? { userId } : { mode: 'ticker-centric' };
  const allNewFilings: FilingWithTicker[] = [];

  for (const tickerItem of tickers) {
    try {
      if (!tickerItem.cik) {
        filingLogger.debug(`Skipping ticker ${tickerItem.symbol} - no CIK`, logContext);
        continue;
      }

      const { getPrismaClient } = await import('../db/prisma');
      const prisma = getPrismaClient();

      const tickerMonitoring = await prisma.tickerMonitoring.findFirst({
        where: { cik: tickerItem.cik }
      });

      if (!tickerMonitoring) {
        filingLogger.debug(`No TickerMonitoring record for ${tickerItem.symbol} (CIK: ${tickerItem.cik})`, logContext);
        continue;
      }

      const activeTicker = {
        id: tickerMonitoring.id,
        cik: tickerMonitoring.cik,
        symbol: tickerMonitoring.symbol,
        companyName: tickerMonitoring.companyName || tickerItem.companyName || '',
        rssUrl: tickerMonitoring.rssUrl || '',
        lastChecked: tickerMonitoring.lastChecked,
        lastAccessionSeen: tickerMonitoring.lastAccessionSeen,
        subscriberCount: 1
      };

      const newFilings = await checkTickerForNewFilings(activeTicker);

      filingLogger.debug(`Checked ${tickerItem.symbol} for new filings`, {
        ...logContext,
        ticker: tickerItem.symbol,
        newFilingsFound: newFilings.length
      });

      for (const filing of newFilings) {
        allNewFilings.push({
          id: `${tickerItem.symbol}-${filing.accessionNumber}`,
          accessionNumber: filing.accessionNumber,
          formType: filing.filingType,
          filingDate: filing.filingDate.toISOString().split('T')[0],
          url: filing.filingUrl,
          ticker: tickerItem.symbol,
          title: filing.title
        });
      }
    } catch (error) {
      filingLogger.error(`Failed to check filings for ${tickerItem.symbol}`, {
        ...logContext,
        ticker: tickerItem.symbol,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  filingLogger.info(`Discovered ${allNewFilings.length} new filings`, {
    ...logContext,
    tickersChecked: tickers.length,
    filingsFound: allNewFilings.length,
    filings: allNewFilings.map(f => ({ ticker: f.ticker, form: f.formType, accession: f.accessionNumber }))
  });

  return allNewFilings;
}
