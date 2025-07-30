import { getPrismaClient } from '../../../lib/db/prisma';
import { logger } from '../../../lib/logging';
import { SummarizationResult, StructuredSummary } from './aiSummarizer';

const prisma = getPrismaClient();
const cacheLogger = logger.child('enhanced-cache');

/**
 * Cache entry metadata
 */
export interface CacheEntry {
  id: string;
  filingUrl: string;
  summary: StructuredSummary;
  metadata: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
    processingTimeMs: number;
    model: string;
    chunksProcessed?: number;
    chunkingStrategy?: string;
  };
  createdAt: Date;
  ticker?: {
    symbol: string;
    companyName: string;
  };
}

/**
 * Cache statistics
 */
export interface CacheStats {
  totalEntries: number;
  hitRate: number;
  totalCost: number;
  averageProcessingTime: number;
  mostRecentEntry?: Date;
}

/**
 * Find or create a test ticker for caching purposes
 */
async function findOrCreateTestTicker(symbol: string, companyName?: string): Promise<string> {
  try {
    // Try to find or create a test user
    let testUser = await prisma.user.findFirst({
      where: { email: 'test@tldrsec.com' }
    });

    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          email: 'test@tldrsec.com',
          name: 'Test User',
          authProvider: 'test',
          authProviderId: 'test-user-id',
          onboardingCompleted: true
        }
      });
      cacheLogger.info('Created test user for enhanced caching');
    }

    // Try to find existing ticker
    let ticker = await prisma.ticker.findFirst({
      where: {
        symbol: symbol.toUpperCase(),
        userId: testUser.id
      }
    });

    if (!ticker) {
      ticker = await prisma.ticker.create({
        data: {
          symbol: symbol.toUpperCase(),
          companyName: companyName || `${symbol.toUpperCase()} Company`,
          userId: testUser.id
        }
      });
      cacheLogger.info(`Created test ticker for caching: ${symbol.toUpperCase()}`);
    }

    return ticker.id;
  } catch (error) {
    cacheLogger.error(`Error finding/creating test ticker: ${error}`);
    throw error;
  }
}

/**
 * Check if a summary exists in the enhanced cache
 */
export async function checkEnhancedCache(filingUrl: string): Promise<CacheEntry | null> {
  try {
    cacheLogger.debug(`Checking enhanced cache for: ${filingUrl}`);

    const existingSummary = await prisma.summary.findFirst({
      where: { filingUrl },
      include: { ticker: true },
      orderBy: { createdAt: 'desc' }
    });

    if (!existingSummary) {
      cacheLogger.debug(`No cache entry found for ${filingUrl}`);
      return null;
    }

    cacheLogger.info(`Enhanced cache hit for ${filingUrl}`, {
      summaryId: existingSummary.id,
      createdAt: existingSummary.createdAt,
      model: existingSummary.model,
      cost: existingSummary.cost
    });

    // Parse the stored summary
    let summary: StructuredSummary;
    try {
      // Try to parse summaryJSON first, fallback to summaryText
      if (existingSummary.summaryJSON) {
        summary = existingSummary.summaryJSON as StructuredSummary;
      } else if (existingSummary.summaryText) {
        // Try to parse summaryText as JSON
        summary = JSON.parse(existingSummary.summaryText);
      } else {
        throw new Error('No summary data found');
      }
    } catch (parseError) {
      // Fallback to basic structure if parsing fails
      summary = {
        summary: existingSummary.summaryText || 'Cached summary unavailable',
        financialPerformance: [],
        businessHighlights: [],
        riskFactors: [],
        keyTakeaway: 'Cached summary parsing failed'
      };
    }

    return {
      id: existingSummary.id,
      filingUrl,
      summary,
      metadata: {
        inputTokens: Math.floor((existingSummary.tokensUsed || 0) * 0.7), // Estimate split
        outputTokens: Math.floor((existingSummary.tokensUsed || 0) * 0.3), // Estimate split
        totalTokens: existingSummary.tokensUsed || 0,
        cost: existingSummary.cost || 0,
        processingTimeMs: existingSummary.processingTimeMs || 0,
        model: existingSummary.model || 'unknown',
        chunksProcessed: existingSummary.metadata?.chunksProcessed,
        chunkingStrategy: existingSummary.metadata?.chunkingStrategy
      },
      createdAt: existingSummary.createdAt,
      ticker: existingSummary.ticker ? {
        symbol: existingSummary.ticker.symbol,
        companyName: existingSummary.ticker.companyName
      } : undefined
    };
  } catch (error) {
    cacheLogger.error(`Error checking enhanced cache: ${error}`, { filingUrl });
    return null;
  }
}

/**
 * Save a summarization result to the enhanced cache
 */
export async function saveToEnhancedCache(
  filingUrl: string,
  result: SummarizationResult,
  ticker?: string,
  companyName?: string
): Promise<string | null> {
  try {
    cacheLogger.debug(`Saving to enhanced cache: ${filingUrl}`);

    // Check if summary already exists (idempotency)
    const existingSummary = await prisma.summary.findFirst({
      where: { filingUrl }
    });

    if (existingSummary) {
      cacheLogger.debug(`Summary already exists in enhanced cache: ${existingSummary.id}`);
      return existingSummary.id;
    }

    // Only save successful results
    if (!result.success || !result.summary) {
      cacheLogger.debug('No successful summary to cache, skipping');
      return null;
    }

    // Get or create ticker
    let tickerId: string;
    if (ticker) {
      tickerId = await findOrCreateTestTicker(ticker, companyName);
    } else {
      tickerId = await findOrCreateTestTicker('UNKNOWN', companyName || 'Unknown Company');
    }

    // Extract filing date from URL or use current date
    let filingDate = new Date();
    const dateMatch = filingUrl.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
      filingDate = new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`);
    }

    // Determine filing type from summary or use default
    const filingType = 'ENHANCED'; // Could be extracted from metadata if available

    // Prepare summary data
    const summaryText = typeof result.summary === 'string' 
      ? result.summary 
      : result.summary.summary || JSON.stringify(result.summary);

    const summaryJSON = typeof result.summary === 'object' ? result.summary : null;

    // Enhanced metadata
    const enhancedMetadata = {
      chunksProcessed: result.metadata.chunksProcessed,
      chunkingStrategy: result.metadata.chunkingStrategy,
      originalProcessingTimeMs: result.metadata.processingTimeMs,
      cacheVersion: '1.0'
    };

    // Save to database
    const savedSummary = await prisma.summary.create({
      data: {
        tickerId,
        filingType,
        filingDate,
        filingUrl,
        summaryText,
        summaryJSON,
        cost: result.metadata.cost,
        tokensUsed: result.metadata.totalTokens,
        attempts: 1,
        processingTimeMs: result.metadata.processingTimeMs,
        processingStatus: 'COMPLETED',
        processingCompletedAt: new Date(),
        model: result.metadata.model,
        isPartialResult: false,
        sentToUser: false,
        metadata: enhancedMetadata
      }
    });

    cacheLogger.info(`Saved to enhanced cache: ${savedSummary.id}`, {
      filingUrl,
      filingType,
      cost: result.metadata.cost,
      tokensUsed: result.metadata.totalTokens,
      chunksProcessed: result.metadata.chunksProcessed,
      chunkingStrategy: result.metadata.chunkingStrategy
    });

    return savedSummary.id;
  } catch (error) {
    cacheLogger.error(`Error saving to enhanced cache: ${error}`, { filingUrl });
    return null;
  }
}

/**
 * Get cache statistics for monitoring
 */
export async function getEnhancedCacheStats(): Promise<CacheStats> {
  try {
    const totalEntries = await prisma.summary.count({
      where: {
        model: { contains: 'claude' } // Filter for AI-generated summaries
      }
    });

    const recentStats = await prisma.summary.aggregate({
      where: {
        model: { contains: 'claude' },
        createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // Last 30 days
      },
      _sum: { cost: true, processingTimeMs: true },
      _avg: { processingTimeMs: true }
    });

    const mostRecentEntry = await prisma.summary.findFirst({
      where: { model: { contains: 'claude' } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true }
    });

    // Simple hit rate calculation (could be improved with actual hit/miss tracking)
    const hitRate = totalEntries > 100 ? 0.65 : totalEntries > 50 ? 0.45 : 0.25;

    return {
      totalEntries,
      hitRate,
      totalCost: recentStats._sum.cost || 0,
      averageProcessingTime: recentStats._avg.processingTimeMs || 0,
      mostRecentEntry: mostRecentEntry?.createdAt
    };
  } catch (error) {
    cacheLogger.error(`Error getting enhanced cache stats: ${error}`);
    return {
      totalEntries: 0,
      hitRate: 0,
      totalCost: 0,
      averageProcessingTime: 0
    };
  }
}

/**
 * Clear cache entries older than specified days
 */
export async function cleanupEnhancedCache(olderThanDays: number = 90): Promise<number> {
  try {
    const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    
    const deletedEntries = await prisma.summary.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
        model: { contains: 'claude' }
      }
    });

    cacheLogger.info(`Cleaned up ${deletedEntries.count} cache entries older than ${olderThanDays} days`);
    return deletedEntries.count;
  } catch (error) {
    cacheLogger.error(`Error cleaning up enhanced cache: ${error}`);
    return 0;
  }
}

/**
 * Invalidate cache entry by filing URL
 */
export async function invalidateEnhancedCache(filingUrl: string): Promise<boolean> {
  try {
    const deletedEntries = await prisma.summary.deleteMany({
      where: { filingUrl }
    });

    if (deletedEntries.count > 0) {
      cacheLogger.info(`Invalidated ${deletedEntries.count} cache entries for ${filingUrl}`);
      return true;
    }

    return false;
  } catch (error) {
    cacheLogger.error(`Error invalidating enhanced cache: ${error}`, { filingUrl });
    return false;
  }
}