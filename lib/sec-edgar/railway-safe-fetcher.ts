/**
 * Railway-safe SEC filing fetcher
 * Uses SEC EDGAR REST API instead of RSS feeds since Railway IPs are blocked from RSS
 * Provides data format compatibility with existing RSS parser interfaces
 */

import { logger } from '../logging';
import { resolveTicker, formatCIK, isValidCIK } from './cik-resolver';
import type { RSSFilingEntry } from './rss-parser';

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

// SEC EDGAR API response interfaces
interface SECFilingData {
  accessionNumber: string[];
  filingDate: string[];
  reportDate?: string[];
  form: string[];
  fileNumber?: string[];
  filmNumber?: string[];
  items?: string[];
  size?: number[];
  primaryDocument: string[];
  primaryDocDescription?: string[];
}

interface SECCompanySubmissions {
  name: string;
  cik: string;
  entityType: string;
  sic?: string;
  sicDescription?: string;
  ownerOrg?: string;
  stateOfIncorporation?: string;
  fiscalYearEnd?: string;
  formerNames?: Array<{
    name: string;
    from: string;
    to: string;
  }>;
  filings: {
    recent: SECFilingData;
    files?: Array<{
      name: string;
      filingCount: number;
      filingFrom: string;
      filingTo: string;
    }>;
  };
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
 * Convert SEC EDGAR API filing data to RSS-compatible format
 * Maintains backward compatibility with existing RSS parser interfaces
 */
export function convertToRSSFilingEntry(
  railwayFiling: RailwaySafeFiling,
  companyName: string = 'Unknown'
): RSSFilingEntry {
  return {
    accessionNumber: railwayFiling.accessionNumber,
    filingType: railwayFiling.form,
    filingDate: new Date(railwayFiling.filingDate),
    filingUrl: railwayFiling.primaryDocUrl || railwayFiling.filingUrl,
    rssEntryDate: new Date(railwayFiling.filingDate), // Use filing date as RSS entry date
    title: `${railwayFiling.form} - ${railwayFiling.description || 'SEC Filing'}`
  };
}

/**
 * Fetch company filings by ticker using SEC EDGAR API with CIK resolution
 * Returns data in RSS-compatible format for seamless integration
 */
export async function fetchCompanyFilingsByTicker(
  ticker: string, 
  limit: number = 10
): Promise<{ 
  success: boolean; 
  filings: RSSFilingEntry[]; 
  companyName: string;
  cik?: string;
  error?: string;
}> {
  try {
    railwayLogger.info('Fetching company filings by ticker via SEC EDGAR API', { 
      ticker, 
      limit,
      isRailway: !!process.env.RAILWAY_ENVIRONMENT 
    });

    // Step 1: Resolve ticker to CIK
    const cikResolution = await resolveTicker(ticker);
    
    if (!cikResolution.success || !cikResolution.cik) {
      return {
        success: false,
        filings: [],
        companyName: 'Unknown',
        error: `CIK resolution failed: ${cikResolution.error}`
      };
    }

    const { cik, companyName } = cikResolution;

    // Step 2: Fetch filings using CIK
    const railwayFilings = await fetchCompanyFilingsViaSECAPI(cik, limit);

    // Step 3: Convert to RSS-compatible format
    const rssFilings = railwayFilings.map(filing => 
      convertToRSSFilingEntry(filing, companyName)
    );

    railwayLogger.info('Successfully converted SEC EDGAR data to RSS format', {
      ticker,
      cik,
      companyName,
      filingsFound: rssFilings.length
    });

    return {
      success: true,
      filings: rssFilings,
      companyName,
      cik
    };

  } catch (error) {
    railwayLogger.error('Failed to fetch company filings by ticker', {
      ticker,
      error: error instanceof Error ? error.message : 'Unknown error',
      isRailway: !!process.env.RAILWAY_ENVIRONMENT
    });

    return {
      success: false,
      filings: [],
      companyName: 'Unknown',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Railway-safe RSS alternative: fetch recent filings for multiple tickers
 * Now fully implemented with CIK lookup and RSS format compatibility
 */
export async function fetchRecentFilingsRailwaySafe(
  tickers: string[], 
  limit: number = 5
): Promise<Map<string, RSSFilingEntry[]>> {
  const results = new Map<string, RSSFilingEntry[]>();
  
  railwayLogger.info('Fetching recent filings for multiple tickers', {
    tickerCount: tickers.length,
    limit,
    isRailway: !!process.env.RAILWAY_ENVIRONMENT
  });

  // Process tickers with some concurrency control
  const BATCH_SIZE = 3; // Respect SEC rate limits
  
  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    
    const batchPromises = batch.map(async (ticker) => {
      try {
        const result = await fetchCompanyFilingsByTicker(ticker, limit);
        
        if (result.success) {
          railwayLogger.debug(`Successfully fetched ${result.filings.length} filings for ${ticker}`);
          results.set(ticker, result.filings);
        } else {
          railwayLogger.warn(`Failed to fetch filings for ${ticker}`, { error: result.error });
          results.set(ticker, []);
        }
      } catch (error) {
        railwayLogger.error('Failed to fetch Railway-safe filings for ticker', {
          ticker,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        results.set(ticker, []);
      }
    });

    await Promise.all(batchPromises);
    
    // Brief pause between batches to respect SEC rate limits
    if (i + BATCH_SIZE < tickers.length) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  railwayLogger.info('Completed Railway-safe filing fetch for all tickers', {
    processedTickers: results.size,
    totalFilings: Array.from(results.values()).reduce((sum, filings) => sum + filings.length, 0)
  });
  
  return results;
}