/**
 * Summary Cache Service
 * 
 * Provides caching for SEC filing summaries to reduce redundant API calls
 * when multiple users request the same filing.
 */

import { prisma } from '../../db/prisma';
import { logger } from '../../logging';
import { SummarizationResult } from '../summarize';

// Logger for this component
const componentLogger = logger.child('summary-cache');

/**
 * Interface for cache key components
 */
export interface SummaryCacheKey {
  formType: string;      // SEC form type (10-K, 10-Q, 8-K, etc.)
  cik: string;           // Company CIK
  accessionNumber: string; // SEC accession number
}

/**
 * Interface for cache entry
 */
export interface SummaryCacheEntry {
  summaryId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'COMPLETED_WITH_WARNINGS';
  result?: SummarizationResult;
  error?: string;
  lastUpdated: Date;
}

/**
 * Summary Cache Service
 */
export class SummaryCache {
  // In-memory cache for active summaries (to handle concurrent requests)
  private inMemoryCache: Map<string, SummaryCacheEntry> = new Map();
  
  /**
   * Generate a consistent cache key from filing metadata
   */
  generateCacheKey(key: SummaryCacheKey): string {
    return `${key.formType}:${key.cik}:${key.accessionNumber}`;
  }
  
  /**
   * Check if a summary exists in cache (either in-memory or database)
   * @param key Cache key components
   * @returns Cache entry if found, null otherwise
   */
  async checkCache(key: SummaryCacheKey): Promise<SummaryCacheEntry | null> {
    const cacheKey = this.generateCacheKey(key);
    
    // First check in-memory cache for active summaries
    if (this.inMemoryCache.has(cacheKey)) {
      const entry = this.inMemoryCache.get(cacheKey);
      componentLogger.debug(`Cache hit (memory) for ${cacheKey}`);
      return entry || null;
    }
    
    // Then check database for existing summaries
    try {
      // Find the most recent completed summary for this filing
      const existingSummary = await prisma.summary.findFirst({
        where: {
          secFiling: {
            formType: key.formType,
            cik: key.cik,
            accessionNumber: key.accessionNumber
          },
          processingStatus: {
            in: ['COMPLETED', 'COMPLETED_WITH_WARNINGS']
          }
        },
        orderBy: {
          processingCompletedAt: 'desc'
        }
      });
      
      if (existingSummary) {
        componentLogger.debug(`Cache hit (database) for ${cacheKey}`);
        
        // Convert database entry to cache entry
        const cacheEntry: SummaryCacheEntry = {
          summaryId: existingSummary.id,
          status: existingSummary.processingStatus as any,
          result: {
            summaryId: existingSummary.id,
            summaryText: existingSummary.summaryText,
            summaryJSON: existingSummary.summaryJSON as Record<string, unknown>,
            isPartial: existingSummary.isPartialResult || false,
            duration: existingSummary.processingTimeMs || 0,
            modelUsed: existingSummary.model || 'unknown',
            inputTokens: existingSummary.tokensUsed || 0,
            outputTokens: 0,
            cost: existingSummary.cost || 0,
            attempts: existingSummary.attempts || 1
          },
          lastUpdated: existingSummary.processingCompletedAt || new Date()
        };
        
        // Store in memory cache for future requests
        this.inMemoryCache.set(cacheKey, cacheEntry);
        
        return cacheEntry;
      }
      
      componentLogger.debug(`Cache miss for ${cacheKey}`);
      return null;
      
    } catch (error) {
      componentLogger.error(`Error checking summary cache: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }
  
  /**
   * Set a pending entry in the cache
   * @param key Cache key components
   * @param summaryId ID of the summary being processed
   */
  setPending(key: SummaryCacheKey, summaryId: string): void {
    const cacheKey = this.generateCacheKey(key);
    
    this.inMemoryCache.set(cacheKey, {
      summaryId,
      status: 'PENDING',
      lastUpdated: new Date()
    });
    
    componentLogger.debug(`Set pending cache entry for ${cacheKey}`);
  }
  
  /**
   * Update the status of a cache entry
   * @param key Cache key components
   * @param status New status
   * @param result Optional result if completed
   * @param error Optional error if failed
   */
  updateStatus(
    key: SummaryCacheKey, 
    status: 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'COMPLETED_WITH_WARNINGS',
    result?: SummarizationResult,
    error?: string
  ): void {
    const cacheKey = this.generateCacheKey(key);
    const existingEntry = this.inMemoryCache.get(cacheKey);
    
    if (!existingEntry) {
      componentLogger.warn(`Attempted to update non-existent cache entry: ${cacheKey}`);
      return;
    }
    
    this.inMemoryCache.set(cacheKey, {
      ...existingEntry,
      status,
      result,
      error,
      lastUpdated: new Date()
    });
    
    componentLogger.debug(`Updated cache entry for ${cacheKey} to ${status}`);
    
    // Clean up completed/failed entries after a delay
    if (status === 'COMPLETED' || status === 'FAILED' || status === 'COMPLETED_WITH_WARNINGS') {
      setTimeout(() => {
        // Only remove if it's the same entry (not replaced)
        const currentEntry = this.inMemoryCache.get(cacheKey);
        if (currentEntry && currentEntry.summaryId === existingEntry.summaryId) {
          this.inMemoryCache.delete(cacheKey);
          componentLogger.debug(`Removed completed cache entry for ${cacheKey}`);
        }
      }, 60 * 60 * 1000); // Keep in memory for 1 hour
    }
  }
  
  /**
   * Clear a specific entry from the cache
   * @param key Cache key components
   */
  clearEntry(key: SummaryCacheKey): void {
    const cacheKey = this.generateCacheKey(key);
    this.inMemoryCache.delete(cacheKey);
    componentLogger.debug(`Cleared cache entry for ${cacheKey}`);
  }
  
  /**
   * Clear all entries from the in-memory cache
   */
  clearAll(): void {
    this.inMemoryCache.clear();
    componentLogger.debug('Cleared all cache entries');
  }
}

// Export a singleton instance
export const summaryCache = new SummaryCache();
