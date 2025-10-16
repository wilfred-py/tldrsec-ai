/**
 * In-Memory Caching Layer for SEC API Calls
 * 
 * Reduces duplicate SEC API calls for tickers subscribed by multiple users
 * Implements TTL-based caching with automatic cleanup
 */

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  hitCount: number;
}

export interface CacheMetrics {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  hitRatio: number;
  entriesCount: number;
  totalHitCount: number;
}

export class SecApiCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private defaultTTL: number;
  private cleanupInterval: NodeJS.Timeout;
  private operationLocks: Map<string, Promise<void>> = new Map();
  private metrics: CacheMetrics = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    hitRatio: 0,
    entriesCount: 0,
    totalHitCount: 0
  };

  constructor(defaultTTLMinutes: number = 10) {
    this.defaultTTL = defaultTTLMinutes * 60 * 1000; // Convert to milliseconds
    
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  /**
   * Get cached data or return null if not found/expired
   */
  get<T>(key: string): T | null {
    this.metrics.totalRequests++;
    
    const entry = this.cache.get(key);
    if (!entry) {
      this.metrics.cacheMisses++;
      this.updateHitRatio();
      return null;
    }

    // Check if entry has expired
    if (Date.now() > entry.timestamp + entry.ttl) {
      this.cache.delete(key);
      this.metrics.cacheMisses++;
      this.updateHitRatio();
      return null;
    }

    // Update hit count and metrics
    entry.hitCount++;
    this.metrics.cacheHits++;
    this.metrics.totalHitCount++;
    this.updateHitRatio();
    
    console.log(`[SecApiCache] Cache HIT for ${key} (hitCount: ${entry.hitCount})`);
    return entry.data;
  }

  /**
   * Store data in cache with optional custom TTL
   */
  set<T>(key: string, data: T, customTTLMinutes?: number): void {
    const ttl = customTTLMinutes ? customTTLMinutes * 60 * 1000 : this.defaultTTL;
    
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
      hitCount: 0
    });

    this.metrics.entriesCount = this.cache.size;
    console.log(`[SecApiCache] Cached ${key} (TTL: ${ttl / 60000} minutes, total entries: ${this.cache.size})`);
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.timestamp + entry.ttl) {
      this.cache.delete(key);
      this.metrics.entriesCount = this.cache.size;
      return false;
    }
    
    return true;
  }

  /**
   * Clear all cached entries
   */
  clear(): void {
    this.cache.clear();
    this.metrics.entriesCount = 0;
    console.log('[SecApiCache] Cache cleared');
  }

  /**
   * Get cache performance metrics
   */
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  /**
   * Get detailed cache statistics
   */
  getStats(): {
    metrics: CacheMetrics;
    entries: Array<{
      key: string;
      age: number;
      ttl: number;
      hitCount: number;
      sizeEstimate: number;
    }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      age: now - entry.timestamp,
      ttl: entry.ttl,
      hitCount: entry.hitCount,
      sizeEstimate: JSON.stringify(entry.data).length
    }));

    return {
      metrics: this.getMetrics(),
      entries
    };
  }

  /**
   * Remove expired entries from cache
   */
  private cleanup(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.timestamp + entry.ttl) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    this.metrics.entriesCount = this.cache.size;
    
    if (removedCount > 0) {
      console.log(`[SecApiCache] Cleanup: removed ${removedCount} expired entries, ${this.cache.size} remaining`);
    }
  }

  /**
   * Update hit ratio calculation
   */
  private updateHitRatio(): void {
    this.metrics.hitRatio = this.metrics.totalRequests > 0 
      ? this.metrics.cacheHits / this.metrics.totalRequests 
      : 0;
  }

  /**
   * Generate cache key for SEC API calls
   */
  static generateKey(operation: string, ticker: string, additionalParams?: Record<string, unknown>): string {
    const params = additionalParams ? JSON.stringify(additionalParams) : '';
    return `sec_api:${operation}:${ticker.toUpperCase()}:${params}`;
  }

  /**
   * Get operation locks for atomic operations
   */
  getOperationLocks(): Map<string, Promise<void>> {
    return this.operationLocks;
  }

  /**
   * Destroy cache and cleanup resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.clear();
  }
}

// Global cache instance
let globalSecApiCache: SecApiCache | null = null;

/**
 * Get the global SEC API cache instance
 */
export function getSecApiCache(): SecApiCache {
  if (!globalSecApiCache) {
    globalSecApiCache = new SecApiCache(10); // 10 minute default TTL
  }
  return globalSecApiCache;
}

/**
 * Atomic cache operation wrapper
 * RACE CONDITION FIX: Prevents concurrent operations on same key
 */
export async function withAtomicCacheOperation<T>(
  cache: SecApiCache,
  key: string,
  operation: () => Promise<T>
): Promise<T> {
  const operationKey = `atomic_${key}`;
  
  // Check if operation is already in progress
  const operationLocks = cache.getOperationLocks();
  if (operationLocks.has(operationKey)) {
    console.log(`[SecApiCache] Waiting for ongoing operation on ${key}`);
    await operationLocks.get(operationKey);
    
    // Try to get from cache after waiting
    const cachedResult = cache.get<T>(key);
    if (cachedResult !== null) {
      return cachedResult;
    }
  }
  
  // Create operation promise
  const operationPromise = (async () => {
    try {
      return await operation();
    } finally {
      operationLocks.delete(operationKey);
    }
  })();
  
  operationLocks.set(operationKey, operationPromise.then(() => {}));
  
  return operationPromise;
}

/**
 * Wrapper function for caching SEC API calls with race condition prevention
 * RACE CONDITION FIX: Atomic operations and duplicate request prevention
 */
export async function withSecApiCache<T>(
  key: string,
  apiCall: () => Promise<T>,
  ttlMinutes?: number
): Promise<T> {
  const cache = getSecApiCache();
  
  return withAtomicCacheOperation(cache, key, async () => {
    // Try to get from cache first (double-check inside atomic operation)
    const cached = cache.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Make API call and cache result
    console.log(`[SecApiCache] Cache MISS for ${key}, making API call`);
    const result = await apiCall();
    cache.set(key, result, ttlMinutes);
    
    return result;
  });
}

/**
 * Bulk cache operations with coordination
 * RACE CONDITION FIX: Batch operations for efficiency
 */
export async function withBulkSecApiCache<T>(
  requests: Array<{ key: string; apiCall: () => Promise<T>; ttlMinutes?: number }>
): Promise<T[]> {
  const cache = getSecApiCache();
  const results: T[] = [];
  const pendingRequests: Array<{ index: number; key: string; apiCall: () => Promise<T>; ttlMinutes?: number }> = [];
  
  // First pass: check cache for all requests
  for (let i = 0; i < requests.length; i++) {
    const { key, apiCall, ttlMinutes } = requests[i];
    const cached = cache.get<T>(key);
    
    if (cached !== null) {
      results[i] = cached;
    } else {
      pendingRequests.push({ index: i, key, apiCall, ttlMinutes });
    }
  }
  
  // Second pass: process cache misses
  const pendingPromises = pendingRequests.map(async ({ index, key, apiCall, ttlMinutes }) => {
    return withAtomicCacheOperation(cache, key, async () => {
      // Double-check cache (may have been populated by another request)
      const cached = cache.get<T>(key);
      if (cached !== null) {
        return { index, result: cached };
      }
      
      // Make API call
      const result = await apiCall();
      cache.set(key, result, ttlMinutes);
      
      return { index, result };
    });
  });
  
  // Wait for all pending requests
  const pendingResults = await Promise.all(pendingPromises);
  
  // Merge results
  for (const { index, result } of pendingResults) {
    results[index] = result;
  }
  
  return results;
}