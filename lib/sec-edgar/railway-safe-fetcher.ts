/**
 * Railway-safe SEC filing fetcher
 * Uses SEC EDGAR REST API instead of RSS feeds since Railway IPs are blocked from RSS
 */

import { logger } from '../logging';

const railwayLogger = logger.child('railway-sec-fetcher');

export interface RailwaySafeFiling {
  accessionNumber: string;
  filingDate: string;
  form: string;
  primaryDocUrl: string;
  filingUrl: string;
  reportDate?: string;
  description: string;
}

/**
 * Fetch company filings using SEC EDGAR REST API (Railway-compatible)
 * This bypasses RSS feeds which are blocked for Railway IPs
 */
export async function fetchCompanyFilingsViaSECAPI(cik: string, limit: number = 10): Promise<RailwaySafeFiling[]> {
  try {
    const paddedCik = cik.padStart(10, '0');
    const url = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;
    
    railwayLogger.info('Fetching company filings via SEC EDGAR API', { 
      cik: paddedCik, 
      url,
      isRailway: !!process.env.RAILWAY_ENVIRONMENT 
    });
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'tldrSEC Research Tool (wilfredchen1@gmail.com)',
        'Accept': 'application/json',
        'Host': 'data.sec.gov'
      }
    });
    
    if (!response.ok) {
      if (response.status === 403) {
        throw new Error(`SEC EDGAR API blocked (403) - Railway IP ranges may be restricted`);
      }
      throw new Error(`SEC EDGAR API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.filings?.recent) {
      railwayLogger.warn('No recent filings found in SEC response', { cik: paddedCik });
      return [];
    }
    
    const filings = [];
    const recent = data.filings.recent;
    const count = Math.min(limit, recent.accessionNumber?.length || 0);
    
    for (let i = 0; i < count; i++) {
      const accessionNumber = recent.accessionNumber[i];
      const formattedAccessionNumber = accessionNumber.replace(/-/g, '');
      
      filings.push({
        accessionNumber,
        filingDate: recent.filingDate[i],
        form: recent.form[i],
        primaryDocUrl: `https://www.sec.gov/Archives/edgar/data/${cik}/${formattedAccessionNumber}/${recent.primaryDocument[i]}`,
        filingUrl: `https://www.sec.gov/Archives/edgar/data/${cik}/${formattedAccessionNumber}`,
        reportDate: recent.reportDate?.[i] || '',
        description: recent.form[i]
      });
    }
    
    railwayLogger.info('Successfully fetched filings via SEC EDGAR API', {
      cik: paddedCik,
      filingsFound: filings.length,
      latestForm: filings[0]?.form,
      latestDate: filings[0]?.filingDate
    });
    
    return filings;
    
  } catch (error) {
    railwayLogger.error('Failed to fetch filings via SEC EDGAR API', {
      cik,
      error: error instanceof Error ? error.message : 'Unknown error',
      isRailway: !!process.env.RAILWAY_ENVIRONMENT
    });
    throw error;
  }
}

/**
 * Check if we're in Railway and should use the safe API approach
 */
export function shouldUseRailwaySafeFetching(): boolean {
  return !!process.env.RAILWAY_ENVIRONMENT;
}

/**
 * Railway-safe RSS alternative: fetch recent filings for multiple tickers
 */
export async function fetchRecentFilingsRailwaySafe(tickers: string[], limit: number = 5): Promise<Map<string, RailwaySafeFiling[]>> {
  const results = new Map<string, RailwaySafeFiling[]>();
  
  for (const ticker of tickers) {
    try {
      // This would need CIK lookup first - simplified for now
      railwayLogger.warn('CIK lookup not implemented yet for Railway-safe fetching', { ticker });
      results.set(ticker, []);
    } catch (error) {
      railwayLogger.error('Failed to fetch Railway-safe filings for ticker', {
        ticker,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      results.set(ticker, []);
    }
  }
  
  return results;
}