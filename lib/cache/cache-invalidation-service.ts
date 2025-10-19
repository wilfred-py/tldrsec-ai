/**
 * Cache Invalidation Service for Testing OpenRouter Integration
 * 
 * Provides secure, selective cache invalidation capabilities to force
 * OpenRouter API calls during testing while protecting production data.
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { getPrismaClient } from '../db/prisma';
import { logger } from '../logging';
import { generateSecureCorrelationId } from '../security/secure-random';

const cacheLogger = logger.child('cache-invalidation');

/**
 * Cache invalidation options for selective targeting
 */
export interface CacheInvalidationOptions {
  /** Specific company tickers to invalidate (e.g., ["AAPL", "TSLA"]) */
  tickers?: string[];
  
  /** Specific SEC filing types to invalidate (e.g., ["10-K", "10-Q", "8-K"]) */
  filingTypes?: string[];
  
  /** Date range for targeting filings by filing date */
  dateRange?: {
    start: Date;
    end: Date;
  };
  
  /** Environment constraint - required for safety */
  environment: 'test' | 'dev' | 'staging';
  
  /** Reason for cache invalidation (audit trail) */
  reason: string;
  
  /** User/system requesting invalidation (audit trail) */
  requesterId: string;
  
  /** Invalidation strategy to use */
  strategy?: 'soft' | 'timestamp' | 'hard';
  
  /** Whether to perform dry run (preview mode) */
  dryRun?: boolean;
}

/**
 * Result of cache invalidation operation
 */
export interface CacheInvalidationResult {
  /** Whether the operation was successful */
  success: boolean;
  
  /** Unique correlation ID for tracking */
  correlationId: string;
  
  /** Number of cache entries invalidated */
  invalidatedCount: number;
  
  /** IDs of affected summary records */
  affectedSummaries: string[];
  
  /** Environment where operation was performed */
  environment: string;
  
  /** Timestamp of operation */
  timestamp: Date;
  
  /** Strategy used for invalidation */
  strategy: string;
  
  /** Execution time in milliseconds */
  executionTimeMs: number;
  
  /** Error message if operation failed */
  error?: string;
  
  /** Detailed operation metadata */
  metadata: {
    criteria: CacheInvalidationOptions;
    previewMode: boolean;
    affectedTickers: string[];
    affectedFilingTypes: string[];
  };
}

/**
 * Preview result for dry run operations
 */
export interface CacheInvalidationPreview {
  /** Number of entries that would be invalidated */
  estimatedCount: number;
  
  /** Sample of summaries that would be affected */
  sampleSummaries: Array<{
    id: string;
    ticker: string;
    filingType: string;
    filingDate: Date;
    lastCacheUsed?: Date;
    cacheUsageCount: number;
  }>;
  
  /** Breakdown by ticker */
  tickerBreakdown: Record<string, number>;
  
  /** Breakdown by filing type */
  filingTypeBreakdown: Record<string, number>;
  
  /** Total cache cost that would be lost (approximate) */
  estimatedCostImpact: number;
}

/**
 * Core cache invalidation service with comprehensive safety measures
 */
export class CacheInvalidationService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = getPrismaClient();
  }

  /**
   * Environment safety validation - prevents accidental production operations
   */
  private validateEnvironmentSafety(environment: string): void {
    const currentEnv = process.env.NODE_ENV || 'development';
    const allowedEnvironments = ['test', 'dev', 'staging', 'development'];
    
    // Block any production environment operations
    if (currentEnv === 'production') {
      throw new Error('Cache invalidation is not allowed in production environment');
    }
    
    if (!allowedEnvironments.includes(environment)) {
      throw new Error(`Invalid environment: ${environment}. Allowed: ${allowedEnvironments.join(', ')}`);
    }
    
    cacheLogger.info('Environment safety validation passed', {
      requestedEnvironment: environment,
      currentEnvironment: currentEnv
    });
  }

  /**
   * Build database query criteria from invalidation options
   */
  private buildQueryCriteria(options: CacheInvalidationOptions): Prisma.SummaryWhereInput {
    const criteria: Prisma.SummaryWhereInput = {};

    // Filter by tickers if specified
    if (options.tickers && options.tickers.length > 0) {
      criteria.ticker = {
        symbol: {
          in: options.tickers.map(t => t.toUpperCase())
        }
      };
    }

    // Filter by filing types if specified
    if (options.filingTypes && options.filingTypes.length > 0) {
      criteria.filingType = {
        in: options.filingTypes.map(ft => ft.toUpperCase())
      };
    }

    // Filter by date range if specified
    if (options.dateRange) {
      criteria.filingDate = {
        gte: options.dateRange.start,
        lte: options.dateRange.end
      };
    }

    return criteria;
  }

  /**
   * Preview cache invalidation operation (dry run)
   */
  async previewInvalidation(options: CacheInvalidationOptions): Promise<CacheInvalidationPreview> {
    const correlationId = generateSecureCorrelationId('cache_preview');
    
    try {
      this.validateEnvironmentSafety(options.environment);
      
      const criteria = this.buildQueryCriteria(options);
      
      cacheLogger.info('Starting cache invalidation preview', {
        correlationId,
        criteria,
        environment: options.environment
      });

      // Get count of affected summaries
      const totalCount = await this.prisma.summary.count({
        where: criteria
      });

      // Get sample of summaries for preview
      const sampleSummaries = await this.prisma.summary.findMany({
        where: criteria,
        select: {
          id: true,
          filingType: true,
          filingDate: true,
          lastCacheUsed: true,
          cacheUsageCount: true,
          totalCost: true,
          ticker: {
            select: {
              symbol: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 10
      });

      // Calculate breakdowns
      const tickerBreakdown: Record<string, number> = {};
      const filingTypeBreakdown: Record<string, number> = {};
      
      const summariesForBreakdown = await this.prisma.summary.findMany({
        where: criteria,
        select: {
          filingType: true,
          totalCost: true,
          ticker: {
            select: {
              symbol: true
            }
          }
        }
      });

      let totalCostImpact = 0;
      
      summariesForBreakdown.forEach(summary => {
        const ticker = summary.ticker.symbol;
        const filingType = summary.filingType;
        
        tickerBreakdown[ticker] = (tickerBreakdown[ticker] || 0) + 1;
        filingTypeBreakdown[filingType] = (filingTypeBreakdown[filingType] || 0) + 1;
        
        if (summary.totalCost) {
          totalCostImpact += summary.totalCost;
        }
      });

      const preview: CacheInvalidationPreview = {
        estimatedCount: totalCount,
        sampleSummaries: sampleSummaries.map(s => ({
          id: s.id,
          ticker: s.ticker.symbol,
          filingType: s.filingType,
          filingDate: s.filingDate,
          lastCacheUsed: s.lastCacheUsed,
          cacheUsageCount: s.cacheUsageCount
        })),
        tickerBreakdown,
        filingTypeBreakdown,
        estimatedCostImpact: totalCostImpact
      };

      cacheLogger.info('Cache invalidation preview completed', {
        correlationId,
        estimatedCount: totalCount,
        estimatedCostImpact: totalCostImpact
      });

      return preview;

    } catch (error) {
      cacheLogger.error('Cache invalidation preview failed', {
        correlationId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Execute cache invalidation using soft invalidation strategy
   */
  private async executeSoftInvalidation(
    criteria: Prisma.SummaryWhereInput,
    correlationId: string,
    options: CacheInvalidationOptions
  ): Promise<{ count: number; summaryIds: string[] }> {
    
    return await this.prisma.$transaction(async (tx) => {
      // First, get the summaries that will be affected
      const affectedSummaries = await tx.summary.findMany({
        where: criteria,
        select: { id: true }
      });

      const summaryIds = affectedSummaries.map(s => s.id);

      if (summaryIds.length === 0) {
        return { count: 0, summaryIds: [] };
      }

      // Update summaries with force refresh flag and invalidation metadata
      const updateResult = await tx.summary.updateMany({
        where: { id: { in: summaryIds } },
        data: {
          forceRefreshFlag: true,
          lastInvalidatedAt: new Date(),
          invalidationCount: { increment: 1 },
          invalidationReason: options.reason,
          invalidatedBy: options.requesterId
        }
      });

      cacheLogger.info('Soft invalidation completed', {
        correlationId,
        affectedCount: updateResult.count,
        summaryIds: summaryIds.slice(0, 5) // Log first 5 IDs
      });

      return { count: updateResult.count, summaryIds };
    });
  }

  /**
   * Execute cache invalidation using timestamp strategy
   */
  private async executeTimestampInvalidation(
    criteria: Prisma.SummaryWhereInput,
    correlationId: string,
    options: CacheInvalidationOptions
  ): Promise<{ count: number; summaryIds: string[] }> {
    
    return await this.prisma.$transaction(async (tx) => {
      const affectedSummaries = await tx.summary.findMany({
        where: criteria,
        select: { id: true }
      });

      const summaryIds = affectedSummaries.map(s => s.id);

      if (summaryIds.length === 0) {
        return { count: 0, summaryIds: [] };
      }

      // Update with invalidation timestamp (cache logic will skip these)
      const updateResult = await tx.summary.updateMany({
        where: { id: { in: summaryIds } },
        data: {
          lastInvalidatedAt: new Date(),
          invalidationCount: { increment: 1 },
          invalidationReason: options.reason,
          invalidatedBy: options.requesterId
        }
      });

      return { count: updateResult.count, summaryIds };
    });
  }

  /**
   * Execute cache invalidation using hard deletion (USE WITH EXTREME CAUTION)
   */
  private async executeHardInvalidation(
    criteria: Prisma.SummaryWhereInput,
    correlationId: string,
    options: CacheInvalidationOptions
  ): Promise<{ count: number; summaryIds: string[] }> {
    
    // Extra safety check for hard deletion
    if (options.environment === 'production') {
      throw new Error('Hard invalidation is strictly prohibited in production');
    }

    return await this.prisma.$transaction(async (tx) => {
      // Get summary IDs before deletion for audit trail
      const summariesToDelete = await tx.summary.findMany({
        where: criteria,
        select: { id: true }
      });

      const summaryIds = summariesToDelete.map(s => s.id);

      if (summaryIds.length === 0) {
        return { count: 0, summaryIds: [] };
      }

      cacheLogger.warn('HARD DELETION: About to permanently delete summaries', {
        correlationId,
        summaryCount: summaryIds.length,
        environment: options.environment,
        summaryIds: summaryIds.slice(0, 10) // Log first 10 for audit
      });

      // Delete the summaries permanently
      const deleteResult = await tx.summary.deleteMany({
        where: { id: { in: summaryIds } }
      });

      return { count: deleteResult.count, summaryIds };
    });
  }

  /**
   * Record cache invalidation operation in audit trail
   */
  private async recordInvalidationAudit(
    result: CacheInvalidationResult,
    options: CacheInvalidationOptions
  ): Promise<void> {
    try {
      // Store in database audit table
      await this.prisma.cacheInvalidation.create({
        data: {
          correlationId: result.correlationId,
          requesterId: options.requesterId,
          environment: options.environment,
          reason: options.reason,
          criteria: {
            tickers: options.tickers,
            filingTypes: options.filingTypes,
            dateRange: options.dateRange
          },
          summariesAffected: result.affectedSummaries,
          invalidatedCount: result.invalidatedCount,
          strategy: result.strategy,
          executionTimeMs: result.executionTimeMs,
          success: result.success,
          errorMessage: result.error
        }
      });

      cacheLogger.info('Cache invalidation audit record created', {
        correlationId: result.correlationId,
        requesterId: options.requesterId,
        environment: options.environment,
        invalidatedCount: result.invalidatedCount
      });
    } catch (error) {
      cacheLogger.error('Failed to record invalidation audit', {
        correlationId: result.correlationId,
        error: error instanceof Error ? error.message : String(error)
      });
      // Don't fail the main operation for audit recording issues
    }
  }

  /**
   * Main cache invalidation method with comprehensive safety and logging
   */
  async invalidateCache(options: CacheInvalidationOptions): Promise<CacheInvalidationResult> {
    const correlationId = generateSecureCorrelationId('cache_invalidation');
    const startTime = Date.now();
    
    try {
      // Validate environment safety first
      this.validateEnvironmentSafety(options.environment);
      
      const strategy = options.strategy || 'soft';
      
      cacheLogger.info('Starting cache invalidation operation', {
        correlationId,
        environment: options.environment,
        strategy,
        requesterId: options.requesterId,
        reason: options.reason,
        dryRun: options.dryRun,
        criteria: {
          tickers: options.tickers,
          filingTypes: options.filingTypes,
          dateRange: options.dateRange
        }
      });

      // If dry run, return preview instead
      if (options.dryRun) {
        const preview = await this.previewInvalidation(options);
        
        const result: CacheInvalidationResult = {
          success: true,
          correlationId,
          invalidatedCount: 0, // Dry run doesn't actually invalidate
          affectedSummaries: [],
          environment: options.environment,
          timestamp: new Date(),
          strategy: `${strategy}-dryrun`,
          executionTimeMs: Date.now() - startTime,
          metadata: {
            criteria: options,
            previewMode: true,
            affectedTickers: Object.keys(preview.tickerBreakdown),
            affectedFilingTypes: Object.keys(preview.filingTypeBreakdown)
          }
        };

        cacheLogger.info('Cache invalidation dry run completed', {
          correlationId,
          estimatedCount: preview.estimatedCount
        });

        return result;
      }

      // Build query criteria
      const criteria = this.buildQueryCriteria(options);
      
      // Execute invalidation based on strategy
      let invalidationResult: { count: number; summaryIds: string[] };
      
      switch (strategy) {
        case 'soft':
          invalidationResult = await this.executeSoftInvalidation(criteria, correlationId, options);
          break;
        case 'timestamp':
          invalidationResult = await this.executeTimestampInvalidation(criteria, correlationId, options);
          break;
        case 'hard':
          invalidationResult = await this.executeHardInvalidation(criteria, correlationId, options);
          break;
        default:
          throw new Error(`Invalid invalidation strategy: ${strategy}`);
      }

      const executionTimeMs = Date.now() - startTime;
      
      // Get metadata about affected records
      const affectedTickers = options.tickers || [];
      const affectedFilingTypes = options.filingTypes || [];
      
      const result: CacheInvalidationResult = {
        success: true,
        correlationId,
        invalidatedCount: invalidationResult.count,
        affectedSummaries: invalidationResult.summaryIds,
        environment: options.environment,
        timestamp: new Date(),
        strategy,
        executionTimeMs,
        metadata: {
          criteria: options,
          previewMode: false,
          affectedTickers,
          affectedFilingTypes
        }
      };

      // Record audit trail
      await this.recordInvalidationAudit(result, options);

      cacheLogger.info('Cache invalidation operation completed successfully', {
        correlationId,
        invalidatedCount: result.invalidatedCount,
        strategy,
        executionTimeMs
      });

      return result;

    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      cacheLogger.error('Cache invalidation operation failed', {
        correlationId,
        error: errorMessage,
        executionTimeMs,
        environment: options.environment,
        strategy: options.strategy || 'soft'
      });

      return {
        success: false,
        correlationId,
        invalidatedCount: 0,
        affectedSummaries: [],
        environment: options.environment,
        timestamp: new Date(),
        strategy: options.strategy || 'soft',
        executionTimeMs,
        error: errorMessage,
        metadata: {
          criteria: options,
          previewMode: false,
          affectedTickers: [],
          affectedFilingTypes: []
        }
      };
    }
  }

  /**
   * Restore invalidated cache entries (undo soft invalidation)
   */
  async restoreInvalidatedCache(summaryIds: string[]): Promise<{ restoredCount: number }> {
    const correlationId = generateSecureCorrelationId('cache_restore');
    
    try {
      cacheLogger.info('Starting cache restoration', {
        correlationId,
        summaryIds: summaryIds.slice(0, 10) // Log first 10
      });

      const updateResult = await this.prisma.summary.updateMany({
        where: {
          id: { in: summaryIds },
          forceRefreshFlag: true // Only restore soft-invalidated entries
        },
        data: {
          forceRefreshFlag: false,
          invalidationReason: null,
          invalidatedBy: null
        }
      });

      cacheLogger.info('Cache restoration completed', {
        correlationId,
        restoredCount: updateResult.count
      });

      return { restoredCount: updateResult.count };

    } catch (error) {
      cacheLogger.error('Cache restoration failed', {
        correlationId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get statistics about current cache state
   */
  async getCacheStatistics(): Promise<{
    totalSummaries: number;
    invalidatedSummaries: number;
    cacheHitRate: number;
    totalCacheValue: number;
    breakdown: {
      byTicker: Record<string, number>;
      byFilingType: Record<string, number>;
    };
  }> {
    try {
      const [
        totalSummaries,
        invalidatedSummaries,
        summariesWithUsage,
        summaryBreakdown
      ] = await Promise.all([
        this.prisma.summary.count(),
        this.prisma.summary.count({
          where: { forceRefreshFlag: true }
        }),
        this.prisma.summary.findMany({
          select: {
            cacheUsageCount: true,
            totalCost: true
          }
        }),
        this.prisma.summary.findMany({
          select: {
            filingType: true,
            totalCost: true,
            ticker: {
              select: { symbol: true }
            }
          }
        })
      ]);

      // Calculate cache hit rate (summaries that have been used more than once)
      const cacheHits = summariesWithUsage.filter(s => s.cacheUsageCount > 0).length;
      const cacheHitRate = totalSummaries > 0 ? (cacheHits / totalSummaries) * 100 : 0;

      // Calculate total cache value (sum of all summary costs)
      const totalCacheValue = summariesWithUsage.reduce((sum, s) => {
        return sum + (s.totalCost || 0);
      }, 0);

      // Build breakdowns
      const byTicker: Record<string, number> = {};
      const byFilingType: Record<string, number> = {};

      summaryBreakdown.forEach(summary => {
        byTicker[summary.ticker.symbol] = (byTicker[summary.ticker.symbol] || 0) + 1;
        byFilingType[summary.filingType] = (byFilingType[summary.filingType] || 0) + 1;
      });

      return {
        totalSummaries,
        invalidatedSummaries,
        cacheHitRate: Math.round(cacheHitRate * 100) / 100, // Round to 2 decimal places
        totalCacheValue: Math.round(totalCacheValue * 100) / 100,
        breakdown: {
          byTicker,
          byFilingType
        }
      };

    } catch (error) {
      cacheLogger.error('Failed to get cache statistics', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}

// Export singleton instance
export const cacheInvalidationService = new CacheInvalidationService();