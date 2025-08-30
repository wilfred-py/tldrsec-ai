/**
 * CIK Resolution Service for Railway-Safe SEC Data Fetching
 * Provides ticker-to-CIK lookup with database caching and SEC API fallback
 */

import { getPrismaClient } from '../db/prisma';
import { logger } from '../logging';

const prisma = getPrismaClient();
const cikLogger = logger.child('cik-resolver');

export interface CIKResolutionResult {
  success: boolean;
  ticker: string;
  cik?: string;
  companyName?: string;
  source?: 'database' | 'sec-api' | 'cache';
  error?: string;
}

// In-memory cache for CIK lookups to reduce database load
const cikCache = new Map<string, { cik: string; companyName: string; timestamp: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_CACHE_SIZE = 1000;

/**
 * Resolve ticker symbol to CIK number with multiple fallback strategies
 */
export async function resolveTicker(ticker: string): Promise<CIKResolutionResult> {
  if (!ticker || typeof ticker !== 'string') {
    return {
      success: false,
      ticker: ticker || 'undefined',
      error: 'Invalid ticker symbol provided'
    };
  }

  const normalizedTicker = ticker.trim().toUpperCase();

  try {
    // Strategy 1: Check in-memory cache first
    const cacheResult = checkCache(normalizedTicker);
    if (cacheResult) {
      return {
        success: true,
        ticker: normalizedTicker,
        cik: cacheResult.cik,
        companyName: cacheResult.companyName,
        source: 'cache'
      };
    }

    // Strategy 2: Check database CikMapping table
    const dbResult = await checkDatabase(normalizedTicker);
    if (dbResult) {
      // Add to cache for future requests
      addToCache(normalizedTicker, dbResult);
      
      return {
        success: true,
        ticker: normalizedTicker,
        cik: dbResult.cik,
        companyName: dbResult.companyName,
        source: 'database'
      };
    }

    // Strategy 3: Fallback to SEC ticker.txt lookup (implemented as placeholder for now)
    const secResult = await fallbackSecLookup(normalizedTicker);
    if (secResult) {
      // Store in database for future use
      await storeCikMapping(normalizedTicker, secResult);
      addToCache(normalizedTicker, secResult);
      
      return {
        success: true,
        ticker: normalizedTicker,
        cik: secResult.cik,
        companyName: secResult.companyName,
        source: 'sec-api'
      };
    }

    // All strategies failed
    return {
      success: false,
      ticker: normalizedTicker,
      error: `CIK not found for ticker ${normalizedTicker} in any available sources`
    };

  } catch (error) {
    cikLogger.error('CIK resolution failed', {
      ticker: normalizedTicker,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return {
      success: false,
      ticker: normalizedTicker,
      error: `CIK resolution error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Batch resolve multiple tickers efficiently
 */
export async function batchResolveTickers(tickers: string[]): Promise<Record<string, CIKResolutionResult>> {
  const results: Record<string, CIKResolutionResult> = {};
  
  // Process in parallel but with some concurrency control
  const BATCH_SIZE = 5;
  
  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    
    const batchPromises = batch.map(async (ticker) => {
      const result = await resolveTicker(ticker);
      return { ticker, result };
    });
    
    const batchResults = await Promise.all(batchPromises);
    
    for (const { ticker, result } of batchResults) {
      results[ticker] = result;
    }
    
    // Brief pause between batches to be respectful
    if (i + BATCH_SIZE < tickers.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return results;
}

/**
 * Check in-memory cache for ticker
 */
function checkCache(ticker: string): { cik: string; companyName: string } | null {
  const entry = cikCache.get(ticker);
  
  if (!entry) {
    return null;
  }
  
  // Check if cache entry is expired
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cikCache.delete(ticker);
    return null;
  }
  
  return {
    cik: entry.cik,
    companyName: entry.companyName
  };
}

/**
 * Add ticker to in-memory cache
 */
function addToCache(ticker: string, data: { cik: string; companyName: string }): void {
  // Evict old entries if cache is too large
  if (cikCache.size >= MAX_CACHE_SIZE) {
    const keysToDelete = Array.from(cikCache.keys()).slice(0, Math.floor(MAX_CACHE_SIZE * 0.1));
    keysToDelete.forEach(key => cikCache.delete(key));
  }
  
  cikCache.set(ticker, {
    ...data,
    timestamp: Date.now()
  });
}

/**
 * Check database CikMapping table for ticker
 */
async function checkDatabase(ticker: string): Promise<{ cik: string; companyName: string } | null> {
  try {
    const mapping = await prisma.cikMapping.findFirst({
      where: {
        OR: [
          { ticker: { equals: ticker, mode: 'insensitive' } },
          { aliases: { has: ticker.toUpperCase() } }
        ],
        isActive: true
      },
      select: {
        cik: true,
        companyName: true
      }
    });
    
    if (!mapping || !mapping.cik || mapping.cik === 'UNKNOWN') {
      return null;
    }
    
    return {
      cik: mapping.cik,
      companyName: mapping.companyName || `Company ${ticker}`
    };
    
  } catch (error) {
    cikLogger.warn('Database lookup failed', {
      ticker,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return null;
  }
}

/**
 * Fallback SEC API lookup (placeholder implementation)
 * In production, this would use SEC's ticker.txt or company tickers endpoint
 */
async function fallbackSecLookup(ticker: string): Promise<{ cik: string; companyName: string } | null> {
  try {
    cikLogger.info(`Attempting SEC fallback lookup for ticker ${ticker}`);
    
    // PLACEHOLDER: In a real implementation, this would:
    // 1. Download and parse SEC's ticker.txt file: https://www.sec.gov/files/company_tickers.json
    // 2. Or use a third-party service for ticker-to-CIK mapping
    // 3. Or maintain our own comprehensive ticker database
    
    // For now, we'll return null to indicate no fallback is available
    // This ensures the system gracefully handles missing CIK mappings
    
    cikLogger.warn(`SEC fallback lookup not implemented for ticker ${ticker}`);
    return null;
    
  } catch (error) {
    cikLogger.warn('SEC fallback lookup failed', {
      ticker,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return null;
  }
}

/**
 * Store new CIK mapping in database
 */
async function storeCikMapping(ticker: string, data: { cik: string; companyName: string }): Promise<void> {
  try {
    await prisma.cikMapping.upsert({
      where: {
        ticker: ticker.toUpperCase()
      },
      create: {
        ticker: ticker.toUpperCase(),
        cik: data.cik,
        companyName: data.companyName,
        aliases: [ticker.toUpperCase()],
        exchangeCodes: [],
        isActive: true,
        fetchAttempts: 1,
        lastFetchStatus: 'success'
      },
      update: {
        companyName: data.companyName,
        lastFetchStatus: 'success',
        fetchAttempts: { increment: 1 },
        lastUpdated: new Date()
      }
    });
    
    cikLogger.info('Stored new CIK mapping', {
      ticker,
      cik: data.cik,
      companyName: data.companyName
    });
    
  } catch (error) {
    cikLogger.error('Failed to store CIK mapping', {
      ticker,
      cik: data.cik,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    // Don't throw - storing is optional
  }
}

/**
 * Validate CIK format
 */
export function isValidCIK(cik: string): boolean {
  if (!cik || typeof cik !== 'string') {
    return false;
  }
  
  const trimmedCik = cik.trim();
  
  // CIK should be numeric and 1-10 digits
  return /^\d{1,10}$/.test(trimmedCik);
}

/**
 * Format CIK with leading zeros (10 digits)
 */
export function formatCIK(cik: string): string {
  if (!isValidCIK(cik)) {
    throw new Error(`Invalid CIK format: ${cik}`);
  }
  
  return cik.trim().padStart(10, '0');
}

/**
 * Clear cache (useful for testing)
 */
export function clearCache(): void {
  cikCache.clear();
  cikLogger.info('CIK cache cleared');
}