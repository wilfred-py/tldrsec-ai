/**
 * RSS Cache Integration Tests
 *
 * Tests for RSS feed response caching to prevent duplicate SEC API calls
 * within the same discovery execution window.
 *
 * Reference: docs/plans/2025-12-18-discovery-scalability-optimization.md
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { SecApiCache, getSecApiCache, withSecApiCache } from '../../../lib/cache/sec-api-cache';

describe('RSS Cache Integration', () => {
  let cache: SecApiCache;

  beforeEach(() => {
    cache = getSecApiCache();
    cache.clear();
  });

  describe('RSS Feed Caching', () => {
    it('should generate correct cache key for RSS feeds', () => {
      const key = SecApiCache.generateKey('rss_feed', 'AAPL', { cik: '0000320193' });
      expect(key).toBe('sec_api:rss_feed:AAPL:{"cik":"0000320193"}');
    });

    it('should cache RSS feed responses with 60-second TTL', async () => {
      const mockApiCall = jest.fn<() => Promise<{ entries: { accessionNumber: string }[] }>>().mockResolvedValue({
        entries: [{ accessionNumber: '0000320193-25-000001' }]
      });

      const key = SecApiCache.generateKey('rss_feed', 'AAPL', { cik: '0000320193' });

      // First call - should hit API
      const result1 = await withSecApiCache(key, mockApiCall, 1); // 1 minute TTL
      expect(mockApiCall).toHaveBeenCalledTimes(1);
      expect(result1.entries.length).toBe(1);

      // Second call - should hit cache
      const result2 = await withSecApiCache(key, mockApiCall, 1);
      expect(mockApiCall).toHaveBeenCalledTimes(1); // Still 1 - cache hit
      expect(result2.entries.length).toBe(1);
    });

    it('should allow cache bypass when force refresh is needed', () => {
      const key = SecApiCache.generateKey('rss_feed', 'AAPL', { cik: '0000320193' });
      cache.set(key, { stale: true }, 10);

      // Manually clear to bypass
      cache.clear();

      expect(cache.has(key)).toBe(false);
    });

    it('should generate different keys for different tickers', () => {
      const key1 = SecApiCache.generateKey('rss_feed', 'AAPL', { cik: '0000320193' });
      const key2 = SecApiCache.generateKey('rss_feed', 'TSLA', { cik: '0001318605' });

      expect(key1).not.toBe(key2);
    });

    it('should normalize ticker symbols to uppercase', () => {
      const key1 = SecApiCache.generateKey('rss_feed', 'aapl', { cik: '0000320193' });
      const key2 = SecApiCache.generateKey('rss_feed', 'AAPL', { cik: '0000320193' });

      expect(key1).toBe(key2);
    });
  });

  describe('Cache Metrics for RSS', () => {
    it('should track RSS cache hit ratio', async () => {
      const mockApiCall = jest.fn<() => Promise<{ entries: never[] }>>().mockResolvedValue({ entries: [] });
      const key = SecApiCache.generateKey('rss_feed', 'TSLA', { cik: '0001318605' });

      // First call - miss
      await withSecApiCache(key, mockApiCall, 1);

      // Second call - hit
      await withSecApiCache(key, mockApiCall, 1);
      await withSecApiCache(key, mockApiCall, 1);

      const metrics = cache.getMetrics();
      expect(metrics.cacheHits).toBeGreaterThan(0);
      expect(metrics.hitRatio).toBeGreaterThan(0);
    });

    it('should report accurate hit ratio after multiple operations', async () => {
      const mockApiCall1 = jest.fn<() => Promise<{ data: string }>>().mockResolvedValue({ data: 'result1' });
      const mockApiCall2 = jest.fn<() => Promise<{ data: string }>>().mockResolvedValue({ data: 'result2' });

      const key1 = SecApiCache.generateKey('rss_feed', 'AAPL', { cik: '0000320193' });
      const key2 = SecApiCache.generateKey('rss_feed', 'TSLA', { cik: '0001318605' });

      // Record initial metrics state
      const initialMetrics = cache.getMetrics();
      const initialHits = initialMetrics.cacheHits;
      const initialMisses = initialMetrics.cacheMisses;

      // Initial misses
      await withSecApiCache(key1, mockApiCall1, 1);
      await withSecApiCache(key2, mockApiCall2, 1);

      // Cache hits
      await withSecApiCache(key1, mockApiCall1, 1);
      await withSecApiCache(key2, mockApiCall2, 1);

      const finalMetrics = cache.getMetrics();
      // 2 new misses + 2 new hits from this test
      const newHits = finalMetrics.cacheHits - initialHits;
      const newMisses = finalMetrics.cacheMisses - initialMisses;

      expect(newHits).toBe(2);
      expect(newMisses).toBe(2);
      // API calls should only have been made twice (once per key)
      expect(mockApiCall1).toHaveBeenCalledTimes(1);
      expect(mockApiCall2).toHaveBeenCalledTimes(1);
    });
  });

  describe('Cache Expiry', () => {
    it('should expire entries after TTL', async () => {
      const key = SecApiCache.generateKey('rss_feed', 'NVDA', { cik: '0001045810' });

      // Set with very short TTL (this test is conceptual - actual TTL is in minutes)
      cache.set(key, { data: 'test' }, 0.001); // ~60ms TTL

      expect(cache.has(key)).toBe(true);

      // Wait for expiry
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(cache.has(key)).toBe(false);
    });
  });
});
