/**
 * Optimized Filing Service - Tranche 3 Migration  
 * 
 * Final consolidation: Combines all tranche improvements into a single, optimized service
 * This replaces the complex multi-service architecture with a streamlined, efficient design
 */

import { FilingType } from '../../types/sec/filing';
import { FilingSummaryResult } from '../filing/types';
import { DirectClaudeClient } from '../../lib/ai/directClaudeClient';
import { fetchEnhancedDocumentContent } from './extractors/enhancedDocumentScraper';
import * as secService from '../secService';
import { generateFallbackSummary, generateFallbackKeyPoints } from './summaries/fallbackSummaryGenerator';
import { normalizeFormType } from './utils/formTypeUtils';
import { logger } from '../../lib/logging';
import { monitoring } from '../../lib/monitoring';
import { prisma } from '../../lib/db';

const optimizedLogger = logger.child('optimized-filing-service');

// Safe monitoring wrapper
const safeMonitoring = {
  recordDuration: function(metric: string, value: number, tags: Record<string, string | boolean> = {}) {
    try {
      if (typeof monitoring.recordTiming === 'function') {
        monitoring.recordTiming(metric, value, tags);
      }
    } catch (error) {
      console.warn('Failed to record timing', { error });
    }
  }
};

/**
 * Redis-like cache interface for future extension
 */
interface CacheInterface {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
}

/**
 * In-memory cache implementation (production should use Redis)
 */
class MemoryCache implements CacheInterface {
  private cache: Map<string, { value: string; expiresAt: number }> = new Map();

  async get(key: string): Promise<string | null> {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }

  async set(key: string, value: string, ttlSeconds: number = 3600): Promise<void> {
    const expiresAt = Date.now() + (ttlSeconds * 1000);
    this.cache.set(key, { value, expiresAt });
  }

  async del(key: string): Promise<void> {
    this.cache.delete(key);
  }

  // Cleanup expired entries periodically
  cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * Configuration for optimized filing service
 */
export interface OptimizedFilingConfig {
  // Performance options
  enableDistributedCache?: boolean;
  enableDatabaseCache?: boolean;
  enableInMemoryCache?: boolean;
  cacheTimeoutSeconds?: number;
  
  // Processing options
  useDirectClaude?: boolean;
  enableChunking?: boolean;
  maxRetries?: number;
  
  // Feature flags
  enableAsyncProcessing?: boolean;
  enableBatchProcessing?: boolean;
  prioritizeSpeed?: boolean;
  
  // Claude configuration
  claudeModel?: string;
  claudeTemperature?: number;
  claudeMaxTokens?: number;
}

/**
 * Optimized Filing Service - Single class to replace multi-service architecture
 */
export class OptimizedFilingService {
  private cache: CacheInterface;
  private claudeClient: DirectClaudeClient;
  private config: Required<OptimizedFilingConfig>;

  constructor(config: OptimizedFilingConfig = {}) {
    this.config = {
      enableDistributedCache: config.enableDistributedCache ?? false,
      enableDatabaseCache: config.enableDatabaseCache ?? true,
      enableInMemoryCache: config.enableInMemoryCache ?? true,
      cacheTimeoutSeconds: config.cacheTimeoutSeconds ?? 3600,
      useDirectClaude: config.useDirectClaude ?? true,
      enableChunking: config.enableChunking ?? true,
      maxRetries: config.maxRetries ?? 2,
      enableAsyncProcessing: config.enableAsyncProcessing ?? false,
      enableBatchProcessing: config.enableBatchProcessing ?? false,
      prioritizeSpeed: config.prioritizeSpeed ?? true,
      claudeModel: config.claudeModel ?? 'claude-3-5-sonnet-20241022',
      claudeTemperature: config.claudeTemperature ?? 0.3,
      claudeMaxTokens: config.claudeMaxTokens ?? 4000
    };

    // Initialize cache (in production, this would be Redis)
    this.cache = new MemoryCache();

    // Initialize Claude client
    this.claudeClient = new DirectClaudeClient({
      model: this.config.claudeModel,
      temperature: this.config.claudeTemperature,
      maxTokens: this.config.claudeMaxTokens,
      enableChunking: this.config.enableChunking,
      maxRetries: this.config.maxRetries
    });

    // Cleanup memory cache periodically (for production Redis, this isn't needed)
    if (this.config.enableInMemoryCache && this.cache instanceof MemoryCache) {
      setInterval(() => {
        (this.cache as MemoryCache).cleanup();
      }, 300000); // 5 minutes
    }

    optimizedLogger.info('Optimized Filing Service initialized', {
      config: this.config
    });
  }

  /**
   * Main method: Get filing summary with full optimization
   */
  async getFilingSummary(
    ticker: string,
    formType: FilingType,
    options: {
      bypassCache?: boolean;
      saveToDatabase?: boolean;
      returnMetadata?: boolean;
    } = {}
  ): Promise<{ 
    data: FilingSummaryResult | null; 
    error?: string; 
    metadata?: Record<string, any>;
  }> {
    const startTime = Date.now();
    const requestId = `${ticker}-${formType}-${Date.now()}`;
    const { bypassCache = false, saveToDatabase = true, returnMetadata = false } = options;
    
    optimizedLogger.info(`🚀 Optimized filing summary request: ${ticker} ${formType}`, { requestId });
    
    try {
      const normalizedFormType = normalizeFormType(formType);
      const cacheKey = this.getCacheKey(ticker, normalizedFormType);
      
      // Step 1: Multi-level cache check
      if (!bypassCache) {
        const cachedResult = await this.getCachedSummary(cacheKey);
        if (cachedResult) {
          safeMonitoring.recordDuration('optimized_filing_summary_cache_hit_ms', Date.now() - startTime, {
            ticker,
            formType: normalizedFormType,
            cache_source: cachedResult.source
          });
          
          optimizedLogger.info(`✅ Cache hit (${cachedResult.source}) for ${ticker} ${normalizedFormType}`);
          return { 
            data: cachedResult.data, 
            metadata: returnMetadata ? { cacheHit: true, cacheSource: cachedResult.source, requestId } : undefined
          };
        }
      }
      
      // Step 2: Process filing with optimized pipeline
      const result = await this.processFiling(ticker, normalizedFormType, startTime, requestId);
      
      if (result.data && !bypassCache) {
        // Cache successful results across all enabled cache layers
        await this.setCachedSummary(cacheKey, result.data);
      }
      
      safeMonitoring.recordDuration('optimized_filing_summary_total_ms', Date.now() - startTime, {
        ticker,
        formType: normalizedFormType,
        success: result.data ? 'true' : 'false',
        request_id: requestId
      });
      
      optimizedLogger.info(`✅ Optimized filing summary completed: ${ticker} ${normalizedFormType}`, {
        success: !!result.data,
        processingTimeMs: Date.now() - startTime,
        requestId
      });
      
      return {
        ...result,
        metadata: returnMetadata ? { 
          cacheHit: false, 
          processingTimeMs: Date.now() - startTime,
          requestId 
        } : undefined
      };
      
    } catch (error) {
      safeMonitoring.recordDuration('optimized_filing_summary_error_ms', Date.now() - startTime, {
        ticker,
        formType: normalizeFormType(formType),
        error: 'true',
        request_id: requestId
      });
      
      optimizedLogger.error(`❌ Optimized filing summary error: ${ticker} ${formType}`, { 
        error, 
        requestId,
        processingTimeMs: Date.now() - startTime
      });
      
      return { 
        data: null, 
        error: error instanceof Error ? error.message : String(error),
        metadata: returnMetadata ? { 
          error: true, 
          processingTimeMs: Date.now() - startTime,
          requestId 
        } : undefined
      };
    }
  }

  /**
   * Optimized filing processing pipeline
   */
  private async processFiling(
    ticker: string,
    formType: string,
    startTime: number,
    requestId: string
  ): Promise<{ data: FilingSummaryResult | null; error?: string }> {
    
    // Get company info and filing in parallel
    const [companyInfo, filing] = await Promise.all([
      secService.getCompanyInfo(ticker),
      secService.getLatestFilingByFormType(ticker, formType)
    ]);
    
    if (!companyInfo) {
      return { data: null, error: `Company information not found for ticker: ${ticker}` };
    }
    
    if (!filing) {
      return { data: null, error: `No ${formType} filing found for ${ticker}` };
    }
    
    // Generate filing URL
    const htmlViewerUrl = filing.filingUrl || 
      `https://www.sec.gov/Archives/edgar/data/${filing.cik}/${filing.accessionNumber.replace(/-/g, '')}/` + 
      `${filing.accessionNumber}-index.html`;
    
    // Fetch content with enhanced method
    let content = '';
    let contentMetadata: Record<string, any> = {};
    
    try {
      const contentStart = Date.now();
      const fetchResult = await fetchEnhancedDocumentContent(htmlViewerUrl);
      content = fetchResult.content;
      contentMetadata = fetchResult.metadata;
      
      safeMonitoring.recordDuration('optimized_content_fetch_ms', Date.now() - contentStart, {
        ticker,
        formType,
        content_length: content.length.toString(),
        was_directory: contentMetadata.wasDirectoryListing?.toString() || 'false'
      });
      
      optimizedLogger.debug(`📄 Content fetched successfully: ${content.length} chars`, {
        requestId,
        wasDirectory: contentMetadata.wasDirectoryListing
      });
      
    } catch (fetchError) {
      optimizedLogger.warn(`⚠️ Enhanced content fetch failed, using fallback`, { fetchError, requestId });
      
      // Use optimized fallback
      return await this.createOptimizedFallback(
        ticker, formType, filing, companyInfo, htmlViewerUrl, startTime, requestId
      );
    }
    
    if (!content) {
      return await this.createOptimizedFallback(
        ticker, formType, filing, companyInfo, htmlViewerUrl, startTime, requestId
      );
    }
    
    // Generate summary with direct Claude
    try {
      const summarizeStart = Date.now();
      const claudeResult = await this.claudeClient.summarizeFiling(
        content,
        formType as FilingType,
        {
          ticker: ticker,
          companyName: companyInfo.name || ticker
        }
      );
      
      safeMonitoring.recordDuration('optimized_claude_summarization_ms', Date.now() - summarizeStart, {
        ticker,
        formType,
        input_tokens: claudeResult.inputTokens.toString(),
        output_tokens: claudeResult.outputTokens.toString(),
        chunks_processed: claudeResult.chunksProcessed?.toString() || '1'
      });
      
      // Create summary result
      const summaryResult: FilingSummaryResult = {
        ticker: ticker,
        companyName: companyInfo.name || ticker,
        filingType: formType as FilingType,
        filingDate: filing.filingDate || new Date().toISOString(),
        accessionNumber: filing.accessionNumber || '',
        summaryText: typeof claudeResult.summary === 'string' ? claudeResult.summary : JSON.stringify(claudeResult.summary),
        keyPoints: this.extractKeyPoints(claudeResult.summary),
        url: htmlViewerUrl,
        filingUrl: filing.filingUrl,
        tokensUsed: claudeResult.inputTokens + claudeResult.outputTokens,
        inputTokens: claudeResult.inputTokens,
        outputTokens: claudeResult.outputTokens,
        model: claudeResult.model,
        cost: claudeResult.cost,
        processingStatus: 'COMPLETED',
        processingTimeMs: Date.now() - startTime
      };
      
      // Async database save (don't block the response)
      if (this.config.enableDatabaseCache) {
        this.saveSummaryToDatabase(summaryResult, contentMetadata, requestId).catch(error => {
          optimizedLogger.warn(`Database save failed (non-blocking):`, { error, requestId });
        });
      }
      
      optimizedLogger.info(`🤖 Claude summarization completed`, {
        requestId,
        tokensUsed: claudeResult.inputTokens + claudeResult.outputTokens,
        cost: claudeResult.cost,
        chunksProcessed: claudeResult.chunksProcessed
      });
      
      return { data: summaryResult };
      
    } catch (claudeError) {
      optimizedLogger.error(`❌ Claude summarization failed:`, { claudeError, requestId });
      
      // Use optimized fallback
      return await this.createOptimizedFallback(
        ticker, formType, filing, companyInfo, htmlViewerUrl, startTime, requestId
      );
    }
  }

  /**
   * Multi-level cache retrieval
   */
  private async getCachedSummary(cacheKey: string): Promise<{
    data: FilingSummaryResult;
    source: 'memory' | 'distributed' | 'database';
  } | null> {
    
    // Level 1: In-memory cache (fastest)
    if (this.config.enableInMemoryCache) {
      try {
        const memoryResult = await this.cache.get(cacheKey);
        if (memoryResult) {
          return {
            data: JSON.parse(memoryResult),
            source: 'memory'
          };
        }
      } catch (error) {
        optimizedLogger.warn('Memory cache retrieval failed', { error });
      }
    }
    
    // Level 2: Distributed cache (Redis in production)
    if (this.config.enableDistributedCache) {
      // TODO: Implement Redis integration
      // const distributedResult = await redis.get(cacheKey);
    }
    
    // Level 3: Database cache
    if (this.config.enableDatabaseCache) {
      try {
        const [ticker, formType] = cacheKey.split('-');
        const dbResult = await this.findExistingDatabaseSummary(ticker, formType);
        if (dbResult) {
          // Also populate higher-level caches
          if (this.config.enableInMemoryCache) {
            await this.cache.set(cacheKey, JSON.stringify(dbResult), this.config.cacheTimeoutSeconds);
          }
          
          return {
            data: dbResult,
            source: 'database'
          };
        }
      } catch (error) {
        optimizedLogger.warn('Database cache retrieval failed', { error });
      }
    }
    
    return null;
  }

  /**
   * Multi-level cache storage
   */
  private async setCachedSummary(cacheKey: string, data: FilingSummaryResult): Promise<void> {
    const serializedData = JSON.stringify(data);
    
    // Store in all enabled cache layers
    const cachePromises: Promise<void>[] = [];
    
    if (this.config.enableInMemoryCache) {
      cachePromises.push(
        this.cache.set(cacheKey, serializedData, this.config.cacheTimeoutSeconds)
          .catch(error => optimizedLogger.warn('Memory cache storage failed', { error }))
      );
    }
    
    if (this.config.enableDistributedCache) {
      // TODO: Implement Redis integration
      // cachePromises.push(redis.setex(cacheKey, this.config.cacheTimeoutSeconds, serializedData));
    }
    
    // Database cache is handled separately in processFiling for async operation
    
    // Execute all cache operations in parallel
    await Promise.allSettled(cachePromises);
  }

  /**
   * Create optimized fallback summary
   */
  private async createOptimizedFallback(
    ticker: string,
    formType: string,
    filing: any,
    companyInfo: any,
    htmlViewerUrl: string,
    startTime: number,
    requestId: string
  ): Promise<{ data: FilingSummaryResult | null; error?: string }> {
    
    const summaryText = generateFallbackSummary(filing, companyInfo, formType);
    const keyPoints = generateFallbackKeyPoints(filing, companyInfo, formType);
    
    const fallbackResult: FilingSummaryResult = {
      ticker: ticker,
      companyName: companyInfo.name || ticker,
      filingType: formType as FilingType,
      filingDate: filing.filingDate || new Date().toISOString(),
      accessionNumber: filing.accessionNumber || '',
      summaryText: summaryText,
      keyPoints: keyPoints,
      url: htmlViewerUrl,
      filingUrl: filing.filingUrl,
      model: 'fallback',
      failureReason: 'Content fetch or AI summarization failed',
      processingTimeMs: Date.now() - startTime
    };
    
    optimizedLogger.info(`📋 Fallback summary generated`, { 
      ticker, 
      formType, 
      requestId,
      processingTimeMs: Date.now() - startTime
    });
    
    return { data: fallbackResult };
  }

  /**
   * Async database save (non-blocking)
   */
  private async saveSummaryToDatabase(
    summary: FilingSummaryResult,
    contentMetadata: Record<string, any>,
    requestId: string
  ): Promise<void> {
    try {
      // This is a simplified version - in production you'd use the full storeSummary function
      await prisma.summary.create({
        data: {
          ticker: { connect: { symbol: summary.ticker } },
          filingType: summary.filingType,
          filingDate: new Date(summary.filingDate),
          filingUrl: summary.url,
          summaryText: summary.summaryText,
          keyPoints: summary.keyPoints,
          cost: summary.cost || 0,
          tokensUsed: summary.tokensUsed || 0,
          model: summary.model || 'unknown',
          processingTimeMs: summary.processingTimeMs,
          processingStatus: summary.processingStatus || 'COMPLETED',
          processingCompletedAt: new Date(),
          sentToUser: false,
          // Add metadata
          metadata: {
            requestId,
            contentMetadata,
            inputTokens: summary.inputTokens,
            outputTokens: summary.outputTokens,
            accessionNumber: summary.accessionNumber
          }
        }
      });
      
      optimizedLogger.debug(`💾 Summary saved to database`, { requestId, ticker: summary.ticker });
    } catch (error) {
      optimizedLogger.error(`❌ Database save failed:`, { error, requestId });
      // Don't throw - this is async and non-blocking
    }
  }

  /**
   * Find existing summary in database
   */
  private async findExistingDatabaseSummary(ticker: string, formType: string): Promise<FilingSummaryResult | null> {
    try {
      const summary = await prisma.summary.findFirst({
        where: {
          ticker: { symbol: ticker.toUpperCase() },
          filingType: formType.toUpperCase()
        },
        orderBy: {
          createdAt: 'desc'
        },
        include: {
          ticker: true
        }
      });
      
      if (!summary) return null;
      
      // Convert database record to FilingSummaryResult
      return {
        ticker: summary.ticker.symbol,
        companyName: summary.ticker.companyName || ticker,
        filingType: summary.filingType as FilingType,
        filingDate: summary.filingDate.toISOString(),
        accessionNumber: summary.accessionNumber || '',
        summaryText: summary.summaryText,
        keyPoints: summary.keyPoints || [],
        url: summary.filingUrl,
        filingUrl: summary.filingUrl,
        tokensUsed: summary.tokensUsed,
        inputTokens: (summary.metadata as any)?.inputTokens,
        outputTokens: (summary.metadata as any)?.outputTokens,
        model: summary.model,
        cost: summary.cost,
        processingStatus: summary.processingStatus as any,
        processingTimeMs: summary.processingTimeMs
      };
    } catch (error) {
      optimizedLogger.warn('Database summary lookup failed', { error, ticker, formType });
      return null;
    }
  }

  /**
   * Extract key points from summary
   */
  private extractKeyPoints(summary: string | Record<string, any>): string[] {
    if (typeof summary === 'string') {
      const lines = summary.split('\n').filter(line => 
        line.trim().startsWith('•') || 
        line.trim().startsWith('-') || 
        line.trim().startsWith('*')
      );
      return lines.map(line => line.trim().replace(/^[•\-*]\s*/, ''));
    }
    
    if (typeof summary === 'object' && summary !== null) {
      const keyPoints: string[] = [];
      
      if (Array.isArray(summary.financialPerformance)) {
        keyPoints.push(...summary.financialPerformance.map((fp: any) => 
          `${fp.metric}: ${fp.value} (${fp.insight || 'No insight provided'})`
        ));
      }
      
      if (Array.isArray(summary.businessHighlights)) {
        keyPoints.push(...summary.businessHighlights.map((bh: any) => 
          `${bh.topic}: ${bh.detail}`
        ));
      }
      
      if (Array.isArray(summary.riskFactors)) {
        keyPoints.push(...summary.riskFactors.map((rf: any) => 
          `Risk - ${rf.category}: ${rf.description}`
        ));
      }
      
      if (summary.keyTakeaway) {
        keyPoints.push(`Key Takeaway: ${summary.keyTakeaway}`);
      }
      
      return keyPoints.slice(0, 10);
    }
    
    return ['Unable to extract key points from summary'];
  }

  /**
   * Generate cache key
   */
  private getCacheKey(ticker: string, formType: string): string {
    return `${ticker.toUpperCase()}-${formType.toUpperCase()}`;
  }

  /**
   * Batch processing for multiple tickers (optional)
   */
  async batchProcessFilings(
    requests: Array<{ ticker: string; formType: FilingType }>,
    options: { concurrency?: number; saveToDatabase?: boolean } = {}
  ): Promise<Array<{ ticker: string; formType: FilingType; result: { data: FilingSummaryResult | null; error?: string } }>> {
    
    if (!this.config.enableBatchProcessing) {
      throw new Error('Batch processing is disabled in configuration');
    }
    
    const { concurrency = 3, saveToDatabase = true } = options;
    
    optimizedLogger.info(`🔄 Starting batch processing: ${requests.length} requests`, { concurrency });
    
    // Process in chunks to control concurrency
    const results: Array<{ ticker: string; formType: FilingType; result: { data: FilingSummaryResult | null; error?: string } }> = [];
    
    for (let i = 0; i < requests.length; i += concurrency) {
      const chunk = requests.slice(i, i + concurrency);
      
      const chunkPromises = chunk.map(async ({ ticker, formType }) => {
        try {
          const result = await this.getFilingSummary(ticker, formType, { saveToDatabase });
          return { ticker, formType, result };
        } catch (error) {
          return {
            ticker,
            formType,
            result: {
              data: null,
              error: error instanceof Error ? error.message : String(error)
            }
          };
        }
      });
      
      const chunkResults = await Promise.allSettled(chunkPromises);
      
      for (const chunkResult of chunkResults) {
        if (chunkResult.status === 'fulfilled') {
          results.push(chunkResult.value);
        } else {
          optimizedLogger.error('Batch processing item failed', { error: chunkResult.reason });
        }
      }
    }
    
    optimizedLogger.info(`✅ Batch processing completed: ${results.length}/${requests.length} processed`);
    
    return results;
  }
}

/**
 * Default optimized service instance
 */
export const optimizedFilingService = new OptimizedFilingService({
  enableInMemoryCache: true,
  enableDatabaseCache: true,
  useDirectClaude: true,
  enableChunking: true,
  prioritizeSpeed: true,
  cacheTimeoutSeconds: 3600 // 1 hour
});

/**
 * Backward compatibility export - drop-in replacement
 */
export async function getFilingSummary(
  ticker: string, 
  formType: FilingType
): Promise<{ data: FilingSummaryResult | null, error?: string }> {
  return optimizedFilingService.getFilingSummary(ticker, formType);
}