/**
 * Cron [Filing] discovery.
 *
 * Deep module behind one function — `CronSecFilingService.checkForNewFilings` —
 * that walks a batch of tickers, resolves each one's `TickerMonitoring` row,
 * and returns the new [Filing]s observed since the last RSS check. Called by
 * `lib/cron/handlers/discovery-handler.ts`; no other production caller.
 *
 * The static-class shape is retained so the caller's existing
 * `CronSecFilingService.checkForNewFilings(...)` invocation site doesn't
 * have to change.
 *
 * Previously the same class exported 9 additional methods
 * (`runSecFilingMonitoring`, `validateUserTickersForProcessing`,
 * `getUnprocessedFilingsForUser`, `markFilingAsProcessed`,
 * `getFilingProcessingMetrics`, `shouldProcessFiling`,
 * `getFilingPriority`, `validateFilingData`, `getMonitoringSummary`)
 * plus the private helpers they leaned on. None of those nine had a
 * production caller; `runSecFilingMonitoring` was only mocked by two
 * test files (`__tests__/timeout/timeout-scenarios.test.ts` — already
 * fails to load because `../../lib/cron/user-processing-service` doesn't
 * exist — and `__tests__/cron/comprehensive-cron-integration.test.ts` —
 * 27 of 28 suites already failing). The shallow interface was inviting
 * future callers to wire up to methods that hadn't been alive in months;
 * deleting them concentrates the cron discovery seam on its actual job.
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

export class CronSecFilingService {
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
  static async checkForNewFilings(
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
}
