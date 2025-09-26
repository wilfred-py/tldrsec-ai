/**
 * Ticker Deduplication Service for Cron Job Optimization
 * 
 * Optimizes processing by:
 * 1. Deduplicating tickers across multiple users
 * 2. Batch processing SEC API calls
 * 3. Mapping results back to users for email delivery
 */

import { getSecApiCache, SecApiCache, withSecApiCache } from '../cache/sec-api-cache';
import { getLatestFilings } from '../../services/company/latestFilings';
import { logger } from '../logging';

const dedupLogger = logger.child('ticker-deduplication');

export interface UserTicker {
  userId: string;
  userEmail: string;
  tier: string;
  symbol: string;
  companyName?: string;
}

export interface TickerGroup {
  symbol: string;
  users: Array<{
    userId: string;
    userEmail: string;
    tier: string;
  }>;
  totalUsers: number;
  tiers: string[];
}

export interface FilingResult {
  ticker: string;
  filings: any[];
  users: Array<{
    userId: string;
    userEmail: string;
    tier: string;
  }>;
  cacheHit: boolean;
  apiCallTime: number;
  error?: string;
}

export interface DeduplicationResult {
  totalTickers: number;
  uniqueTickers: number;
  totalUsers: number;
  deduplicationRatio: number;
  tickerGroups: TickerGroup[];
  filingResults: FilingResult[];
  cacheMetrics: {
    hits: number;
    misses: number;
    hitRatio: number;
  };
  apiCallsSaved: number;
  estimatedTimeSaved: number; // in milliseconds
}

/**
 * Group users by their ticker subscriptions to identify overlap
 */
export function groupUsersByTicker(userTickers: UserTicker[]): TickerGroup[] {
  const tickerGroups = new Map<string, TickerGroup>();

  for (const userTicker of userTickers) {
    const symbol = userTicker.symbol.toUpperCase();
    
    if (!tickerGroups.has(symbol)) {
      tickerGroups.set(symbol, {
        symbol,
        users: [],
        totalUsers: 0,
        tiers: []
      });
    }

    const group = tickerGroups.get(symbol)!;
    group.users.push({
      userId: userTicker.userId,
      userEmail: userTicker.userEmail,
      tier: userTicker.tier
    });
    
    group.totalUsers = group.users.length;
    
    // Track unique tiers for this ticker
    if (!group.tiers.includes(userTicker.tier)) {
      group.tiers.push(userTicker.tier);
    }
  }

  return Array.from(tickerGroups.values());
}

/**
 * Process filings for deduplicated tickers using cached SEC API calls
 */
export async function processDeduplicatedTickers(
  tickerGroups: TickerGroup[],
  limit: number = 10
): Promise<FilingResult[]> {
  const results: FilingResult[] = [];
  const cache = getSecApiCache();

  for (const group of tickerGroups) {
    const startTime = Date.now();
    let cacheHit = false;
    let error: string | undefined;
    let filings: any[] = [];

    try {
      dedupLogger.info(`Processing ticker ${group.symbol} for ${group.totalUsers} users`, {
        symbol: group.symbol,
        users: group.users.length,
        tiers: group.tiers
      });

      // Use cached SEC API call
      const cacheKey = SecApiCache.generateKey('getLatestFilings', group.symbol, { limit });
      
      // Check if we have cached data
      const cachedFilings = cache.get<any[]>(cacheKey);
      if (cachedFilings !== null) {
        filings = cachedFilings;
        cacheHit = true;
        dedupLogger.debug(`Using cached filings for ${group.symbol}`, {
          symbol: group.symbol,
          filingCount: filings.length,
          cacheHit: true
        });
      } else {
        // Make fresh API call and cache result
        dedupLogger.debug(`Making fresh SEC API call for ${group.symbol}`, {
          symbol: group.symbol,
          limit
        });
        
        filings = await withSecApiCache(
          cacheKey,
          () => getLatestFilings(group.symbol, limit),
          10 // 10 minute TTL
        );
        cacheHit = false;
      }

      dedupLogger.info(`Retrieved ${filings.length} filings for ${group.symbol}`, {
        symbol: group.symbol,
        filingCount: filings.length,
        cacheHit,
        users: group.totalUsers
      });

    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      dedupLogger.error(`Failed to get filings for ${group.symbol}`, {
        symbol: group.symbol,
        error,
        users: group.totalUsers
      });
    }

    results.push({
      ticker: group.symbol,
      filings,
      users: group.users,
      cacheHit,
      apiCallTime: Date.now() - startTime,
      error
    });
  }

  return results;
}

/**
 * Calculate deduplication metrics and performance gains
 */
export function calculateDeduplicationMetrics(
  userTickers: UserTicker[],
  tickerGroups: TickerGroup[],
  filingResults: FilingResult[]
): DeduplicationResult {
  const totalTickers = userTickers.length;
  const uniqueTickers = tickerGroups.length;
  const totalUsers = new Set(userTickers.map(ut => ut.userId)).size;
  const deduplicationRatio = totalTickers > 0 ? (totalTickers - uniqueTickers) / totalTickers : 0;
  
  // Cache metrics
  const cache = getSecApiCache();
  const cacheMetrics = cache.getMetrics();
  
  // API calls saved calculation
  const apiCallsSaved = totalTickers - uniqueTickers;
  
  // Estimate time saved (assume ~500ms per SEC API call)
  const estimatedTimeSaved = apiCallsSaved * 500;

  return {
    totalTickers,
    uniqueTickers,
    totalUsers,
    deduplicationRatio,
    tickerGroups,
    filingResults,
    cacheMetrics: {
      hits: cacheMetrics.cacheHits,
      misses: cacheMetrics.cacheMisses,
      hitRatio: cacheMetrics.hitRatio
    },
    apiCallsSaved,
    estimatedTimeSaved
  };
}

/**
 * Extract user-ticker relationships from database users
 */
export function extractUserTickers(users: Array<{
  id: string;
  email: string | null;
  subscriptionTier: string;
  tickers: Array<{ symbol: string; companyName?: string | null }>;
}>): UserTicker[] {
  const userTickers: UserTicker[] = [];

  for (const user of users) {
    for (const ticker of user.tickers) {
      userTickers.push({
        userId: user.id,
        userEmail: user.email || `user_${user.id}`,
        tier: user.subscriptionTier,
        symbol: ticker.symbol,
        companyName: ticker.companyName || undefined
      });
    }
  }

  return userTickers;
}

/**
 * Main deduplication orchestrator function
 */
export async function optimizeCronProcessing(
  users: Array<{
    id: string;
    email: string | null;
    subscriptionTier: string;
    tickers: Array<{ symbol: string; companyName?: string | null }>;
  }>,
  filingLimit: number = 10
): Promise<DeduplicationResult> {
  const startTime = Date.now();
  
  dedupLogger.info('Starting ticker deduplication optimization', {
    totalUsers: users.length,
    totalUserTickerPairs: users.reduce((sum, u) => sum + u.tickers.length, 0)
  });

  // Step 1: Extract all user-ticker relationships
  const userTickers = extractUserTickers(users);
  
  // Step 2: Group users by ticker to identify overlaps
  const tickerGroups = groupUsersByTicker(userTickers);
  
  // Step 3: Process unique tickers with caching
  const filingResults = await processDeduplicatedTickers(tickerGroups, filingLimit);
  
  // Step 4: Calculate metrics and performance gains
  const result = calculateDeduplicationMetrics(userTickers, tickerGroups, filingResults);
  
  const processingTime = Date.now() - startTime;
  
  dedupLogger.info('Ticker deduplication completed', {
    totalTickers: result.totalTickers,
    uniqueTickers: result.uniqueTickers,
    deduplicationRatio: Math.round(result.deduplicationRatio * 100) + '%',
    apiCallsSaved: result.apiCallsSaved,
    estimatedTimeSaved: result.estimatedTimeSaved + 'ms',
    actualProcessingTime: processingTime + 'ms',
    cacheHitRatio: Math.round(result.cacheMetrics.hitRatio * 100) + '%'
  });

  return result;
}