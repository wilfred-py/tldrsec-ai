/**
 * Bounded Context Manager
 * Addresses memory growth from unbounded context aggregation
 * Implements LRU cache with size limits and cleanup mechanisms
 */

import { logger } from '../logging';
import type { ProcessingContext } from './types';

const contextLogger = logger.child('bounded-context-manager');

interface ContextEntry {
  context: ProcessingContext;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
}

interface ContextStats {
  totalContexts: number;
  activeContexts: number;
  memoryUsageMB: number;
  cacheHitRatio: number;
  evictedContexts: number;
}

export class BoundedContextManager {
  private static instance: BoundedContextManager;
  private contextCache = new Map<string, ContextEntry>();
  private aggregatedContexts = new Map<string, ProcessingContext[]>();
  
  // Configuration
  private readonly maxContextsPerUser = Number(process.env.MAX_CONTEXTS_PER_USER) || 100;
  private readonly maxTotalContexts = Number(process.env.MAX_TOTAL_CONTEXTS) || 1000;
  private readonly contextTTLMs = Number(process.env.CONTEXT_TTL_MS) || 3600000; // 1 hour
  private readonly cleanupIntervalMs = Number(process.env.CONTEXT_CLEANUP_INTERVAL) || 300000; // 5 minutes
  
  // Statistics
  private evictedContexts = 0;
  private cacheHits = 0;
  private cacheMisses = 0;
  private cleanupTimer?: NodeJS.Timeout;

  private constructor() {
    this.startCleanupTimer();
    
    // Graceful shutdown handling
    process.on('SIGTERM', () => this.shutdown());
    process.on('SIGINT', () => this.shutdown());
  }

  public static getInstance(): BoundedContextManager {
    if (!BoundedContextManager.instance) {
      BoundedContextManager.instance = new BoundedContextManager();
    }
    return BoundedContextManager.instance;
  }

  /**
   * Add processing context with automatic eviction
   * Prevents unbounded memory growth
   */
  public addContext(userId: string, context: ProcessingContext): void {
    const contextKey = this.generateContextKey(userId, context);
    const timestamp = Date.now();

    try {
      // Check if we need to evict old contexts first
      this.enforceMemoryLimits();

      // Create context entry
      const entry: ContextEntry = {
        context: { ...context }, // Deep copy to prevent mutations
        timestamp,
        accessCount: 1,
        lastAccessed: timestamp
      };

      this.contextCache.set(contextKey, entry);

      // Add to user aggregation (with bounds)
      this.addToUserAggregation(userId, context);

      contextLogger.debug('Context added', {
        userId,
        contextKey,
        totalContexts: this.contextCache.size,
        userContextCount: this.getUserContextCount(userId)
      });

    } catch (error) {
      contextLogger.error('Failed to add context', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        contextKey
      });
    }
  }

  /**
   * Get aggregated contexts for a user (bounded)
   */
  public getAggregatedContexts(userId: string): ProcessingContext[] {
    const contexts = this.aggregatedContexts.get(userId) || [];
    
    if (contexts.length > 0) {
      this.cacheHits++;
      
      // Update access statistics for all contexts
      contexts.forEach(context => {
        const contextKey = this.generateContextKey(userId, context);
        const entry = this.contextCache.get(contextKey);
        if (entry) {
          entry.accessCount++;
          entry.lastAccessed = Date.now();
        }
      });
      
      contextLogger.debug('Retrieved aggregated contexts', {
        userId,
        contextCount: contexts.length,
        cacheHit: true
      });
    } else {
      this.cacheMisses++;
      contextLogger.debug('No aggregated contexts found', {
        userId,
        cacheHit: false
      });
    }

    return contexts.slice(); // Return copy to prevent mutations
  }

  /**
   * Create aggregate context with memory bounds
   */
  public createBoundedAggregateContext(
    userId: string,
    tier: string,
    individualContexts: ProcessingContext[],
    totalCost: number,
    filingsProcessed: number
  ): ProcessingContext {
    // Limit the number of contexts we process to prevent memory issues
    const boundedContexts = individualContexts.slice(0, this.maxContextsPerUser);
    
    if (individualContexts.length > boundedContexts.length) {
      contextLogger.warn('Truncated individual contexts to prevent memory issues', {
        userId,
        originalCount: individualContexts.length,
        boundedCount: boundedContexts.length
      });
    }

    if (boundedContexts.length === 0) {
      return this.createFallbackContext(userId, tier);
    }

    // Analyze bounded contexts
    const cacheHits = boundedContexts.filter(ctx => ctx.cacheHit).length;
    const aiGenerations = boundedContexts.filter(ctx => ctx.aiGenerated).length;
    const errors = boundedContexts.filter(ctx => ctx.errorOccurred).length;

    // Determine primary operation type
    let operationType: 'cached_summary' | 'ai_generation' | 'failed_operation';
    if (errors > 0 && errors >= boundedContexts.length / 2) {
      operationType = 'failed_operation';
    } else if (cacheHits > aiGenerations) {
      operationType = 'cached_summary';
    } else {
      operationType = 'ai_generation';
    }

    // Aggregate timing with bounds
    const validStartTimes = boundedContexts
      .map(ctx => ctx.processingStartTime)
      .filter(t => t !== undefined) as number[];
    const validEndTimes = boundedContexts
      .map(ctx => ctx.processingEndTime)
      .filter(t => t !== undefined) as number[];

    const aggregateContext: ProcessingContext = {
      userId,
      tier,
      operation: 'tier-aware-cron-processing',
      operationType,
      isCached: cacheHits > 0,
      cacheHit: cacheHits > 0,
      aiGenerated: aiGenerations > 0,
      errorOccurred: errors > 0,
      processingStartTime: validStartTimes.length > 0 ? Math.min(...validStartTimes) : undefined,
      processingEndTime: validEndTimes.length > 0 ? Math.max(...validEndTimes) : undefined
    };

    // Store the aggregate context
    this.addContext(userId, aggregateContext);

    contextLogger.debug('Created bounded aggregate context', {
      userId,
      tier,
      boundedContextsUsed: boundedContexts.length,
      operationType,
      totalCost,
      filingsProcessed
    });

    return aggregateContext;
  }

  /**
   * Clean up completed processing contexts
   */
  public cleanupCompletedContexts(userId: string): void {
    const userContexts = this.aggregatedContexts.get(userId) || [];
    const now = Date.now();

    // Remove completed contexts older than TTL
    const activeContexts = userContexts.filter(context => {
      const isCompleted = context.processingEndTime !== undefined;
      const age = context.processingEndTime ? now - context.processingEndTime : 0;
      
      if (isCompleted && age > this.contextTTLMs) {
        const contextKey = this.generateContextKey(userId, context);
        this.contextCache.delete(contextKey);
        return false;
      }
      
      return true;
    });

    if (activeContexts.length < userContexts.length) {
      this.aggregatedContexts.set(userId, activeContexts);
      this.evictedContexts += (userContexts.length - activeContexts.length);
      
      contextLogger.debug('Cleaned up completed contexts', {
        userId,
        removed: userContexts.length - activeContexts.length,
        remaining: activeContexts.length
      });
    }
  }

  /**
   * Enforce memory limits with LRU eviction
   */
  private enforceMemoryLimits(): void {
    // Check total context limit
    if (this.contextCache.size >= this.maxTotalContexts) {
      this.evictLeastRecentlyUsed(Math.floor(this.maxTotalContexts * 0.2)); // Evict 20%
    }

    // Check per-user limits
    for (const [userId, contexts] of this.aggregatedContexts.entries()) {
      if (contexts.length > this.maxContextsPerUser) {
        this.evictUserContexts(userId, contexts.length - this.maxContextsPerUser);
      }
    }
  }

  /**
   * Evict least recently used contexts
   */
  private evictLeastRecentlyUsed(countToEvict: number): void {
    // Sort by last accessed time (ascending)
    const sortedEntries = Array.from(this.contextCache.entries())
      .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

    for (let i = 0; i < Math.min(countToEvict, sortedEntries.length); i++) {
      const [contextKey, entry] = sortedEntries[i];
      this.contextCache.delete(contextKey);
      this.removeFromUserAggregation(entry.context.userId, entry.context);
      this.evictedContexts++;
    }

    if (countToEvict > 0) {
      contextLogger.info('Evicted LRU contexts', {
        evicted: Math.min(countToEvict, sortedEntries.length),
        remainingContexts: this.contextCache.size
      });
    }
  }

  /**
   * Evict specific user contexts
   */
  private evictUserContexts(userId: string, countToEvict: number): void {
    const userContexts = this.aggregatedContexts.get(userId) || [];
    
    // Remove oldest contexts first
    const contextsToRemove = userContexts
      .sort((a, b) => (a.processingStartTime || 0) - (b.processingStartTime || 0))
      .slice(0, countToEvict);

    contextsToRemove.forEach(context => {
      const contextKey = this.generateContextKey(userId, context);
      this.contextCache.delete(contextKey);
    });

    const remainingContexts = userContexts.slice(countToEvict);
    this.aggregatedContexts.set(userId, remainingContexts);
    this.evictedContexts += countToEvict;

    contextLogger.debug('Evicted user contexts', {
      userId,
      evicted: countToEvict,
      remaining: remainingContexts.length
    });
  }

  /**
   * Add context to user aggregation with bounds
   */
  private addToUserAggregation(userId: string, context: ProcessingContext): void {
    const userContexts = this.aggregatedContexts.get(userId) || [];
    
    // Prevent unbounded growth
    if (userContexts.length >= this.maxContextsPerUser) {
      userContexts.shift(); // Remove oldest
    }
    
    userContexts.push(context);
    this.aggregatedContexts.set(userId, userContexts);
  }

  /**
   * Remove context from user aggregation
   */
  private removeFromUserAggregation(userId: string, context: ProcessingContext): void {
    const userContexts = this.aggregatedContexts.get(userId) || [];
    const contextKey = this.generateContextKey(userId, context);
    
    const filteredContexts = userContexts.filter(ctx => 
      this.generateContextKey(userId, ctx) !== contextKey
    );
    
    if (filteredContexts.length === 0) {
      this.aggregatedContexts.delete(userId);
    } else {
      this.aggregatedContexts.set(userId, filteredContexts);
    }
  }

  /**
   * Generate unique context key
   */
  private generateContextKey(userId: string, context: ProcessingContext): string {
    return `${userId}-${context.operation}-${context.processingStartTime || Date.now()}`;
  }

  /**
   * Get user context count
   */
  private getUserContextCount(userId: string): number {
    return this.aggregatedContexts.get(userId)?.length || 0;
  }

  /**
   * Create fallback context for edge cases
   */
  private createFallbackContext(userId: string, tier: string): ProcessingContext {
    return {
      userId,
      tier,
      operation: 'tier-aware-cron-processing',
      operationType: 'failed_operation',
      isCached: false,
      errorOccurred: true
    };
  }

  /**
   * Start periodic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.performPeriodicCleanup();
    }, this.cleanupIntervalMs);
  }

  /**
   * Perform periodic cleanup of stale contexts
   */
  private performPeriodicCleanup(): void {
    const startTime = Date.now();
    const initialSize = this.contextCache.size;

    try {
      // Clean up expired contexts
      const now = Date.now();
      const expiredKeys: string[] = [];

      for (const [key, entry] of this.contextCache.entries()) {
        if (now - entry.timestamp > this.contextTTLMs) {
          expiredKeys.push(key);
        }
      }

      // Remove expired contexts
      expiredKeys.forEach(key => {
        const entry = this.contextCache.get(key);
        if (entry) {
          this.contextCache.delete(key);
          this.removeFromUserAggregation(entry.context.userId, entry.context);
          this.evictedContexts++;
        }
      });

      const cleanupTime = Date.now() - startTime;
      const cleanedUp = initialSize - this.contextCache.size;

      if (cleanedUp > 0) {
        contextLogger.info('Periodic context cleanup completed', {
          cleanedUpContexts: cleanedUp,
          remainingContexts: this.contextCache.size,
          cleanupTimeMs: cleanupTime
        });
      }

    } catch (error) {
      contextLogger.error('Periodic cleanup failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get context manager statistics
   */
  public getStats(): ContextStats {
    const memoryUsageMB = process.memoryUsage().heapUsed / 1024 / 1024;
    const totalRequests = this.cacheHits + this.cacheMisses;
    const cacheHitRatio = totalRequests > 0 ? this.cacheHits / totalRequests : 0;

    return {
      totalContexts: this.contextCache.size,
      activeContexts: this.aggregatedContexts.size,
      memoryUsageMB: Math.round(memoryUsageMB * 100) / 100,
      cacheHitRatio: Math.round(cacheHitRatio * 100) / 100,
      evictedContexts: this.evictedContexts
    };
  }

  /**
   * Graceful shutdown
   */
  public shutdown(): void {
    contextLogger.info('Shutting down bounded context manager');
    
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    // Clear all contexts
    this.contextCache.clear();
    this.aggregatedContexts.clear();

    contextLogger.info('Bounded context manager shutdown complete');
  }
}

// Export singleton instance
export const boundedContextManager = BoundedContextManager.getInstance();