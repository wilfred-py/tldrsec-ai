/**
 * Environment-aware [Filing] fetcher.
 *
 * Deep module behind a single function — `fetchCompanyFilingsUnified` — that
 * routes a CIK or ticker to whichever SEC fetch path actually works on the
 * current platform. Callers never branch on platform; the seam owns it.
 *
 * Why the routing exists at all: SEC.gov serves the same data via two paths
 * with mutually-incompatible block patterns. Vercel can hit the RSS feeds
 * but gets HTTP 403 on `data.sec.gov`. Railway is the inverse. Local dev
 * uses RSS for speed and predictability. The module reads
 * `VERCEL`/`VERCEL_URL`/`RAILWAY_ENVIRONMENT` and `NODE_ENV` to pick the
 * working path, with `FORCE_SEC_RSS=true` / `FORCE_SEC_REST_API=true`
 * available as kill switches when a platform's behaviour changes.
 *
 * `isDevelopmentEnvironment` is exported because `ticker-monitoring` uses
 * the same dev-vs-prod signal to log differently — folding it into the
 * fetcher's interface would require the caller to re-derive it from
 * `process.env.NODE_ENV` every time.
 */

import { logger } from '../logging';
import { fetchSecCompanyRSS, type RSSFilingEntry } from './rss-parser';
import { findCompanyByTicker, getCompanyFilings } from '../../services/companyService';
import { getPrismaClient } from '../db/prisma';
import { resolveTicker } from './cik-resolver';

const envLogger = logger.child('environment-aware-fetcher');
const getPrisma = () => getPrismaClient();

export interface UnifiedFilingResponse {
  success: boolean;
  cik: string;
  companyName: string;
  entries: RSSFilingEntry[];
  lastUpdated: Date;
  source: 'rss' | 'rest-api';
  error?: string;
}

export function isDevelopmentEnvironment(): boolean {
  return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
}

function isInputCIK(input: string): boolean {
  return /^\d{1,10}$/.test(input.trim());
}

async function convertCIKToTicker(cik: string): Promise<string | null> {
  try {
    envLogger.debug('Converting CIK to ticker', { cik });

    const mapping = await getPrisma().cikMapping.findFirst({
      where: {
        cik: cik.padStart(10, '0'),
        isActive: true
      },
      select: {
        ticker: true,
        companyName: true
      }
    });

    if (mapping?.ticker) {
      envLogger.debug('CIK to ticker conversion successful', {
        cik,
        ticker: mapping.ticker,
        companyName: mapping.companyName
      });
      return mapping.ticker;
    }

    envLogger.debug('CIK not found in mapping database', { cik });
    return null;
  } catch (error) {
    envLogger.warn('CIK to ticker conversion failed', {
      cik,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return null;
  }
}

// Platform routing. SEC.gov blocks different fetch paths on different hosts:
//   - Vercel: RSS works, REST API returns 403
//   - Railway: RSS returns 403, REST API works
//   - Local dev: RSS works and is faster
// FORCE_SEC_REST_API / FORCE_SEC_RSS are kill switches for when a platform
// flips behaviour and we need to override before redeploying.
function shouldUseRSSFeeds(): boolean {
  if (process.env.FORCE_SEC_REST_API === 'true') return false;
  if (process.env.FORCE_SEC_RSS === 'true') return true;

  if (process.env.VERCEL_URL || process.env.VERCEL) return true;
  if (process.env.RAILWAY_ENVIRONMENT) return false;

  return isDevelopmentEnvironment();
}

export async function fetchCompanyFilingsUnified(
  cikOrTicker: string,
  limit: number = 10
): Promise<UnifiedFilingResponse> {
  const useRSS = shouldUseRSSFeeds();
  const environment = isDevelopmentEnvironment() ? 'Development' : 'Production';

  envLogger.info('Fetching company filings with environment-aware routing', {
    input: cikOrTicker,
    limit,
    useRSS,
    environment,
    isDev: isDevelopmentEnvironment()
  });

  try {
    if (useRSS) {
      return await fetchViaRSS(cikOrTicker, limit);
    } else {
      return await fetchViaRestAPI(cikOrTicker, limit);
    }
  } catch (error) {
    envLogger.error('Unified filing fetch failed', {
      input: cikOrTicker,
      useRSS,
      environment,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return {
      success: false,
      cik: 'unknown',
      companyName: 'Unknown',
      entries: [],
      lastUpdated: new Date(),
      source: useRSS ? 'rss' : 'rest-api',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function fetchViaRSS(cik: string, limit: number): Promise<UnifiedFilingResponse> {
  envLogger.debug('Fetching via RSS feeds', { cik, limit });

  try {
    const rssData = await fetchSecCompanyRSS(cik);

    const limitedEntries = limit > 0 ? rssData.entries.slice(0, limit) : rssData.entries;

    return {
      success: true,
      cik: rssData.cik,
      companyName: rssData.companyName,
      entries: limitedEntries,
      lastUpdated: rssData.lastUpdated,
      source: 'rss'
    };
  } catch (error) {
    envLogger.warn('RSS fetch failed, falling back to REST API', {
      cik,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return await fetchViaRestAPI(cik, limit);
  }
}

async function fetchViaRestAPI(tickerOrCik: string, limit: number): Promise<UnifiedFilingResponse> {
  envLogger.debug('Fetching via SEC EDGAR REST API', { tickerOrCik, limit });

  let ticker: string;

  try {
    if (isInputCIK(tickerOrCik)) {
      envLogger.debug('Input detected as CIK, converting to ticker', { cik: tickerOrCik });

      const convertedTicker = await convertCIKToTicker(tickerOrCik);
      if (!convertedTicker) {
        envLogger.debug('Primary CIK lookup failed, trying CIK resolver service');

        const resolverResult = await resolveTicker(tickerOrCik);
        if (resolverResult.success && resolverResult.ticker) {
          ticker = resolverResult.ticker;
          envLogger.debug('CIK resolver fallback succeeded', {
            cik: tickerOrCik,
            ticker: resolverResult.ticker
          });
        } else {
          return {
            success: false,
            cik: tickerOrCik,
            companyName: 'Unknown',
            entries: [],
            lastUpdated: new Date(),
            source: 'rest-api',
            error: `CIK ${tickerOrCik} not found in CIK mapping database or resolver service`
          };
        }
      } else {
        ticker = convertedTicker;
        envLogger.debug('Successfully converted CIK to ticker', {
          cik: tickerOrCik,
          ticker: convertedTicker
        });
      }
    } else {
      ticker = tickerOrCik;
      envLogger.debug('Input detected as ticker symbol', { ticker });
    }

    envLogger.debug('Parameter processing completed', {
      originalInput: tickerOrCik,
      inputType: isInputCIK(tickerOrCik) ? 'CIK' : 'ticker',
      finalTicker: ticker,
      conversionRequired: isInputCIK(tickerOrCik)
    });

    const company = await findCompanyByTicker(ticker);

    if (!company) {
      return {
        success: false,
        cik: 'unknown',
        companyName: 'Unknown',
        entries: [],
        lastUpdated: new Date(),
        source: 'rest-api',
        error: `Company not found for ticker: ${ticker} (original input: ${tickerOrCik})`
      };
    }

    const filingsResult = await getCompanyFilings(company);

    const limitedFilings = limit > 0 ? filingsResult.recentFilings.slice(0, limit) : filingsResult.recentFilings;
    const entries: RSSFilingEntry[] = limitedFilings.map(filing => ({
      accessionNumber: filing.accessionNumber,
      filingType: filing.form,
      filingDate: new Date(filing.filingDate),
      filingUrl: filing.filingUrl,
      rssEntryDate: new Date(filing.filingDate),
      title: `${filing.form} - ${company.name}`
    }));

    return {
      success: true,
      cik: company.cik,
      companyName: company.name,
      entries: entries,
      lastUpdated: new Date(),
      source: 'rest-api'
    };
  } catch (error) {
    envLogger.error('REST API fetch failed', {
      originalInput: tickerOrCik,
      convertedTicker: ticker || 'conversion failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return {
      success: false,
      cik: 'unknown',
      companyName: 'Unknown',
      entries: [],
      lastUpdated: new Date(),
      source: 'rest-api',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
