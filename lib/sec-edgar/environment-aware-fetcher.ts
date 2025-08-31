/**
 * Environment-Aware SEC Filing Fetcher
 * Automatically routes to RSS (local) or REST API (Railway) based on environment
 * Provides unified interface for seamless integration with existing code
 */

import { logger } from '../logging';
import { fetchSecCompanyRSS, type CompanyRSSFeed } from './rss-parser';
import { fetchCompanyFilingsByTicker } from './railway-safe-fetcher';
import type { RSSFilingEntry } from './rss-parser';

const envLogger = logger.child('environment-aware-fetcher');

export interface UnifiedFilingResponse {
  success: boolean;
  cik: string;
  companyName: string;
  entries: RSSFilingEntry[];
  lastUpdated: Date;
  source: 'rss' | 'rest-api';
  error?: string;
}

/**
 * Detect if we're running in Railway environment
 */
export function isRailwayEnvironment(): boolean {
  return !!(
    process.env.RAILWAY_ENVIRONMENT || 
    process.env.RAILWAY_PUBLIC_DOMAIN ||
    process.env.RAILWAY_PROJECT_ID
  );
}

/**
 * Detect if we should use RSS feeds 
 * CRITICAL FIX: RSS monitoring does NOT work in Railway - SEC gives errors
 * Railway must use REST API, local can use RSS
 */
export function shouldUseRSSFeeds(): boolean {
  const isLocal = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  const isRailway = isRailwayEnvironment();
  
  // CRITICAL: RSS monitoring does NOT work in Railway (SEC website gives errors)
  // Use REST API for Railway, RSS for local development
  if (isRailway) {
    return false; // Use REST API in Railway since RSS monitoring fails
  }
  
  // Allow manual override via environment variable
  if (process.env.FORCE_SEC_REST_API === 'true') {
    return false;
  }
  
  if (process.env.FORCE_SEC_RSS === 'true') {
    return true;
  }
  
  // Default: use RSS for local development, REST API gets used for Railway above
  return isLocal; // RSS for local, REST API for Railway
}

/**
 * Unified filing fetcher that automatically chooses the best method based on environment
 * Maintains identical interface to existing RSS parser for backward compatibility
 */
export async function fetchCompanyFilingsUnified(
  cikOrTicker: string,
  limit: number = 10
): Promise<UnifiedFilingResponse> {
  const useRSS = shouldUseRSSFeeds();
  const environment = isRailwayEnvironment() ? 'Railway' : 'Local';
  
  envLogger.info('Fetching company filings with environment-aware routing', {
    input: cikOrTicker,
    limit,
    useRSS,
    environment,
    isRailway: isRailwayEnvironment()
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

/**
 * Fetch using traditional RSS feeds (for local development)
 */
async function fetchViaRSS(cik: string, limit: number): Promise<UnifiedFilingResponse> {
  envLogger.debug('Fetching via RSS feeds', { cik, limit });
  
  try {
    // Assume input is CIK for RSS method
    const rssData = await fetchSecCompanyRSS(cik);
    
    // Limit entries if requested
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

    // Fallback to REST API if RSS fails
    return await fetchViaRestAPI(cik, limit);
  }
}

/**
 * Fetch using SEC EDGAR REST API (for Railway and production)
 */
async function fetchViaRestAPI(tickerOrCik: string, limit: number): Promise<UnifiedFilingResponse> {
  envLogger.debug('Fetching via SEC EDGAR REST API', { tickerOrCik, limit });
  
  try {
    // Use the Railway-safe fetcher with ticker resolution
    const result = await fetchCompanyFilingsByTicker(tickerOrCik, limit);
    
    if (result.success) {
      return {
        success: true,
        cik: result.cik || 'unknown',
        companyName: result.companyName,
        entries: result.filings,
        lastUpdated: new Date(),
        source: 'rest-api'
      };
    } else {
      return {
        success: false,
        cik: 'unknown',
        companyName: 'Unknown',
        entries: [],
        lastUpdated: new Date(),
        source: 'rest-api',
        error: result.error
      };
    }
  } catch (error) {
    envLogger.error('REST API fetch failed', {
      tickerOrCik,
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

/**
 * Batch fetch filings for multiple tickers/CIKs with environment awareness
 */
export async function fetchMultipleCompanyFilingsUnified(
  inputs: string[], 
  limit: number = 5
): Promise<Map<string, UnifiedFilingResponse>> {
  const results = new Map<string, UnifiedFilingResponse>();
  const useRSS = shouldUseRSSFeeds();
  
  envLogger.info('Batch fetching company filings', {
    inputCount: inputs.length,
    limit,
    useRSS,
    environment: isRailwayEnvironment() ? 'Railway' : 'Local'
  });

  // Process with appropriate concurrency based on source
  const BATCH_SIZE = useRSS ? 2 : 3; // RSS is more restrictive
  
  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const batch = inputs.slice(i, i + BATCH_SIZE);
    
    const batchPromises = batch.map(async (input) => {
      const result = await fetchCompanyFilingsUnified(input, limit);
      return { input, result };
    });

    const batchResults = await Promise.all(batchPromises);
    
    for (const { input, result } of batchResults) {
      results.set(input, result);
    }
    
    // Pause between batches to respect rate limits
    if (i + BATCH_SIZE < inputs.length) {
      const delay = useRSS ? 1000 : 200; // RSS needs more time
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  envLogger.info('Completed batch filing fetch', {
    processedInputs: results.size,
    successCount: Array.from(results.values()).filter(r => r.success).length,
    totalFilings: Array.from(results.values()).reduce((sum, r) => sum + r.entries.length, 0)
  });
  
  return results;
}

/**
 * Health check function to test the current environment's filing fetch capability
 */
export async function testEnvironmentFilingFetch(): Promise<{
  success: boolean;
  environment: string;
  method: string;
  testResults: {
    canReachSEC: boolean;
    rssWorking?: boolean;
    restApiWorking?: boolean;
  };
  error?: string;
}> {
  const useRSS = shouldUseRSSFeeds();
  const environment = isRailwayEnvironment() ? 'Railway' : 'Local';
  
  envLogger.info('Testing environment filing fetch capability', {
    environment,
    method: useRSS ? 'RSS' : 'REST API'
  });

  try {
    // Test with Tesla (CIK: 1318605) - a well-known company
    const testInput = useRSS ? '1318605' : 'TSLA';
    const result = await fetchCompanyFilingsUnified(testInput, 1);
    
    return {
      success: result.success,
      environment,
      method: useRSS ? 'RSS' : 'REST API',
      testResults: {
        canReachSEC: result.success,
        rssWorking: useRSS ? result.success : undefined,
        restApiWorking: !useRSS ? result.success : undefined
      },
      error: result.error
    };
  } catch (error) {
    return {
      success: false,
      environment,
      method: useRSS ? 'RSS' : 'REST API',
      testResults: {
        canReachSEC: false,
        rssWorking: useRSS ? false : undefined,
        restApiWorking: !useRSS ? false : undefined
      },
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}