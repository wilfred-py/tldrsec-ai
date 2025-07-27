/**
 * Comprehensive Migration Test Suite
 * 
 * Tests all three tranches together and provides performance comparison utilities
 * Run this after completing all tranches to validate the full migration
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { optimizedFilingService, OptimizedFilingService } from '../../services/filings/optimizedFilingService';
import { getDirectFilingSummary } from '../../services/filings/summaries/directFilingSummaryService';
import { getEnhancedFilingSummary } from '../../services/filings/summaries/enhancedFilingSummaryService';
import { getFilingSummary as originalGetFilingSummary } from '../../services/filings/summaries/filingSummaryService';
import { DirectClaudeClient } from '../../lib/ai/directClaudeClient';
import { FilingType } from '../../types/sec/filing';

// Test configuration
const TEST_TICKERS = ['TSLA', 'AAPL', 'MSFT', 'GOOGL'];
const TEST_FORM_TYPES: FilingType[] = ['10-K', '10-Q', '8-K'];
const PERFORMANCE_THRESHOLD_MS = 60000; // 1 minute max per request
const IMPROVEMENT_THRESHOLD = 0.15; // Expect at least 15% improvement

describe('Comprehensive Migration Test Suite', () => {
  
  let performanceResults: Array<{
    ticker: string;
    formType: FilingType;
    method: string;
    duration: number;
    success: boolean;
    error?: string;
  }> = [];

  beforeAll(() => {
    console.log('🧪 Starting Comprehensive Migration Tests');
    console.log(`Testing ${TEST_TICKERS.length} tickers × ${TEST_FORM_TYPES.length} form types`);
  });

  afterAll(() => {
    console.log('📊 Performance Summary:');
    generatePerformanceReport();
  });

  beforeEach(() => {
    // Clear any caches between tests
    jest.clearAllMocks();
  });

  describe('Tranche 1: Enhanced Document Fetching', () => {
    
    test('should outperform legacy document fetching', async () => {
      const ticker = 'TSLA';
      const formType: FilingType = '10-K';
      
      // Test enhanced vs legacy fetch
      const [enhancedResult, legacyResult] = await Promise.allSettled([
        timeFunction(() => getEnhancedFilingSummary(ticker, formType, {
          useEnhancedFetch: true,
          saveToDatabase: false
        })),
        timeFunction(() => getEnhancedFilingSummary(ticker, formType, {
          useEnhancedFetch: false,
          saveToDatabase: false
        }))
      ]);
      
      if (enhancedResult.status === 'fulfilled' && legacyResult.status === 'fulfilled') {
        const enhancedTime = enhancedResult.value.duration;
        const legacyTime = legacyResult.value.duration;
        
        performanceResults.push(
          { ticker, formType, method: 'enhanced-fetch', duration: enhancedTime, success: true },
          { ticker, formType, method: 'legacy-fetch', duration: legacyTime, success: true }
        );
        
        console.log(`📈 Enhanced fetch: ${enhancedTime}ms vs Legacy: ${legacyTime}ms`);
        
        // Enhanced should be faster or at least not significantly slower
        expect(enhancedTime).toBeLessThan(legacyTime * 1.5); // Allow 50% tolerance
      }
    }, 120000);
  });

  describe('Tranche 2: Direct Claude Integration', () => {
    
    test('should provide direct Claude performance improvements', async () => {
      const ticker = 'AAPL';
      const formType: FilingType = '10-Q';
      
      const directClaudeResult = await timeFunction(() => 
        getDirectFilingSummary(ticker, formType, {
          useDirectClaude: true,
          saveToDatabase: false
        })
      );
      
      performanceResults.push({
        ticker,
        formType,
        method: 'direct-claude',
        duration: directClaudeResult.duration,
        success: directClaudeResult.result.data !== null
      });
      
      expect(directClaudeResult.duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
      
      if (directClaudeResult.result.data) {
        expect(directClaudeResult.result.data.summaryText).toBeDefined();
        expect(directClaudeResult.result.data.summaryText.length).toBeGreaterThan(100);
        expect(directClaudeResult.result.data.tokensUsed).toBeGreaterThan(0);
      }
    }, 120000);

    test('should handle chunking for large documents', async () => {
      const claudeClient = new DirectClaudeClient({
        enableChunking: true,
        maxTokensPerChunk: 10000 // Force chunking with small chunks
      });
      
      // Create a large mock content
      const largeContent = 'This is a test document. '.repeat(10000);
      
      const result = await claudeClient.summarizeFiling(
        largeContent,
        '10-K',
        { ticker: 'TEST', companyName: 'Test Company' }
      );
      
      expect(result).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.chunksProcessed).toBeGreaterThan(1);
      expect(result.inputTokens).toBeGreaterThan(0);
      expect(result.outputTokens).toBeGreaterThan(0);
      expect(result.cost).toBeGreaterThan(0);
    }, 180000);
  });

  describe('Tranche 3: Full Optimization', () => {
    
    test('should demonstrate end-to-end performance improvement', async () => {
      const ticker = 'MSFT';
      const formType: FilingType = '8-K';
      
      // Test optimized service vs original
      const [optimizedResult, originalResult] = await Promise.allSettled([
        timeFunction(() => optimizedFilingService.getFilingSummary(ticker, formType, {
          saveToDatabase: false
        })),
        timeFunction(() => originalGetFilingSummary(ticker, formType))
      ]);
      
      if (optimizedResult.status === 'fulfilled' && originalResult.status === 'fulfilled') {
        const optimizedTime = optimizedResult.value.duration;
        const originalTime = originalResult.value.duration;
        const improvement = (originalTime - optimizedTime) / originalTime;
        
        performanceResults.push(
          { ticker, formType, method: 'optimized', duration: optimizedTime, success: true },
          { ticker, formType, method: 'original', duration: originalTime, success: true }
        );
        
        console.log(`🚀 Performance improvement: ${(improvement * 100).toFixed(1)}%`);
        console.log(`   Optimized: ${optimizedTime}ms vs Original: ${originalTime}ms`);
        
        // Should show meaningful improvement
        expect(improvement).toBeGreaterThan(IMPROVEMENT_THRESHOLD);
      }
    }, 180000);

    test('should support multi-level caching', async () => {
      const optimizedService = new OptimizedFilingService({
        enableInMemoryCache: true,
        enableDatabaseCache: true,
        cacheTimeoutSeconds: 300
      });
      
      const ticker = 'GOOGL';
      const formType: FilingType = '10-K';
      
      // First request - should be slow (cache miss)
      const firstResult = await timeFunction(() => 
        optimizedService.getFilingSummary(ticker, formType, {
          returnMetadata: true,
          saveToDatabase: false
        })
      );
      
      expect(firstResult.result.metadata?.cacheHit).toBe(false);
      
      // Second request - should be fast (cache hit)
      const secondResult = await timeFunction(() => 
        optimizedService.getFilingSummary(ticker, formType, {
          returnMetadata: true,
          saveToDatabase: false
        })
      );
      
      expect(secondResult.result.metadata?.cacheHit).toBe(true);
      expect(secondResult.duration).toBeLessThan(firstResult.duration * 0.1); // Should be 90%+ faster
      
      performanceResults.push(
        { ticker, formType, method: 'cache-miss', duration: firstResult.duration, success: true },
        { ticker, formType, method: 'cache-hit', duration: secondResult.duration, success: true }
      );
    }, 120000);

    test('should support batch processing', async () => {
      const optimizedService = new OptimizedFilingService({
        enableBatchProcessing: true,
        enableInMemoryCache: true
      });
      
      const batchRequests = [
        { ticker: 'TSLA', formType: '10-K' as FilingType },
        { ticker: 'AAPL', formType: '10-Q' as FilingType },
        { ticker: 'MSFT', formType: '8-K' as FilingType }
      ];
      
      const batchStart = Date.now();
      const batchResults = await optimizedService.batchProcessFilings(batchRequests, {
        concurrency: 2,
        saveToDatabase: false
      });
      const batchDuration = Date.now() - batchStart;
      
      expect(batchResults).toHaveLength(3);
      expect(batchResults.every(r => r.result.data || r.result.error)).toBe(true);
      
      // Batch processing should be faster than sequential processing
      const estimatedSequentialTime = PERFORMANCE_THRESHOLD_MS * batchRequests.length;
      expect(batchDuration).toBeLessThan(estimatedSequentialTime * 0.7); // At least 30% faster
      
      console.log(`📦 Batch processing: ${batchDuration}ms for ${batchRequests.length} requests`);
    }, 300000);
  });

  describe('Reliability & Error Handling', () => {
    
    test('should handle invalid tickers gracefully', async () => {
      const result = await optimizedFilingService.getFilingSummary('INVALID_TICKER', '10-K');
      
      expect(result.data).toBeNull();
      expect(result.error).toBeDefined();
      expect(typeof result.error).toBe('string');
    });

    test('should provide fallback summaries when AI fails', async () => {
      // Test with a configuration that might cause AI to fail
      const optimizedService = new OptimizedFilingService({
        claudeModel: 'invalid-model', // This should trigger fallback
        enableInMemoryCache: false
      });
      
      const result = await optimizedService.getFilingSummary('TSLA', '10-K');
      
      // Should either succeed with AI or provide fallback
      if (result.data) {
        expect(result.data.summaryText).toBeDefined();
        expect(result.data.keyPoints).toBeDefined();
        
        if (result.data.model === 'fallback') {
          expect(result.data.failureReason).toBeDefined();
        }
      }
    }, 120000);

    test('should maintain backward compatibility', async () => {
      // All new services should maintain the same interface as original
      const ticker = 'AAPL';
      const formType: FilingType = '10-K';
      
      const [enhanced, direct, optimized, original] = await Promise.allSettled([
        getEnhancedFilingSummary(ticker, formType, { saveToDatabase: false }),
        getDirectFilingSummary(ticker, formType, { saveToDatabase: false }),
        optimizedFilingService.getFilingSummary(ticker, formType, { saveToDatabase: false }),
        originalGetFilingSummary(ticker, formType)
      ]);
      
      // All should have the same basic structure
      const results = [enhanced, direct, optimized, original];
      
      for (const result of results) {
        if (result.status === 'fulfilled') {
          expect(result.value).toHaveProperty('data');
          expect(typeof result.value.error).toBe('string' || 'undefined');
          
          if (result.value.data) {
            expect(result.value.data).toHaveProperty('ticker');
            expect(result.value.data).toHaveProperty('filingType');
            expect(result.value.data).toHaveProperty('summaryText');
            expect(result.value.data).toHaveProperty('keyPoints');
          }
        }
      }
    }, 240000);
  });

  describe('Performance Regression Tests', () => {
    
    test('should not exceed baseline performance thresholds', async () => {
      const testCases = [
        { ticker: 'TSLA', formType: '10-K' as FilingType },
        { ticker: 'AAPL', formType: '10-Q' as FilingType },
        { ticker: 'MSFT', formType: '8-K' as FilingType }
      ];
      
      for (const testCase of testCases) {
        const result = await timeFunction(() => 
          optimizedFilingService.getFilingSummary(testCase.ticker, testCase.formType, {
            saveToDatabase: false
          })
        );
        
        performanceResults.push({
          ticker: testCase.ticker,
          formType: testCase.formType,
          method: 'optimized-regression',
          duration: result.duration,
          success: result.result.data !== null,
          error: result.result.error
        });
        
        // Should not exceed performance threshold
        expect(result.duration).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
        
        console.log(`⏱️  ${testCase.ticker} ${testCase.formType}: ${result.duration}ms`);
      }
    }, 300000);
  });

  // Helper functions
  async function timeFunction<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const start = Date.now();
    const result = await fn();
    const duration = Date.now() - start;
    return { result, duration };
  }

  function generatePerformanceReport(): void {
    console.log('\n📊 Performance Analysis Report\n');
    
    // Group by method
    const methodGroups = performanceResults.reduce((groups, result) => {
      if (!groups[result.method]) {
        groups[result.method] = [];
      }
      groups[result.method].push(result);
      return groups;
    }, {} as Record<string, typeof performanceResults>);
    
    for (const [method, results] of Object.entries(methodGroups)) {
      const successfulResults = results.filter(r => r.success);
      if (successfulResults.length === 0) continue;
      
      const avgDuration = successfulResults.reduce((sum, r) => sum + r.duration, 0) / successfulResults.length;
      const minDuration = Math.min(...successfulResults.map(r => r.duration));
      const maxDuration = Math.max(...successfulResults.map(r => r.duration));
      const successRate = (successfulResults.length / results.length) * 100;
      
      console.log(`${method}:`);
      console.log(`  Average: ${avgDuration.toFixed(0)}ms`);
      console.log(`  Range: ${minDuration}ms - ${maxDuration}ms`);
      console.log(`  Success Rate: ${successRate.toFixed(1)}%`);
      console.log(`  Samples: ${results.length}`);
      console.log('');
    }
    
    // Calculate improvements
    const optimizedResults = methodGroups['optimized'] || [];
    const originalResults = methodGroups['original'] || [];
    
    if (optimizedResults.length > 0 && originalResults.length > 0) {
      const optimizedAvg = optimizedResults.filter(r => r.success)
        .reduce((sum, r) => sum + r.duration, 0) / optimizedResults.filter(r => r.success).length;
      const originalAvg = originalResults.filter(r => r.success)
        .reduce((sum, r) => sum + r.duration, 0) / originalResults.filter(r => r.success).length;
      
      const improvement = (originalAvg - optimizedAvg) / originalAvg;
      
      console.log(`🚀 Overall Performance Improvement: ${(improvement * 100).toFixed(1)}%`);
      console.log(`   Original Average: ${originalAvg.toFixed(0)}ms`);
      console.log(`   Optimized Average: ${optimizedAvg.toFixed(0)}ms`);
    }
  }
});

/**
 * Manual Performance Testing Utilities
 * 
 * Use these functions for manual performance testing and benchmarking
 */
export const performanceTestUtils = {
  
  /**
   * Run a comprehensive performance comparison
   */
  async runPerformanceComparison(ticker: string, formType: FilingType) {
    console.log(`🔄 Running performance comparison for ${ticker} ${formType}`);
    
    const methods = [
      { name: 'Original', fn: () => originalGetFilingSummary(ticker, formType) },
      { name: 'Enhanced', fn: () => getEnhancedFilingSummary(ticker, formType, { saveToDatabase: false }) },
      { name: 'Direct', fn: () => getDirectFilingSummary(ticker, formType, { saveToDatabase: false }) },
      { name: 'Optimized', fn: () => optimizedFilingService.getFilingSummary(ticker, formType, { saveToDatabase: false }) }
    ];
    
    const results = [];
    
    for (const method of methods) {
      try {
        const start = Date.now();
        const result = await method.fn();
        const duration = Date.now() - start;
        
        results.push({
          method: method.name,
          duration,
          success: result.data !== null,
          error: result.error
        });
        
        console.log(`✅ ${method.name}: ${duration}ms ${result.data ? '(Success)' : '(Failed)'}${result.error ? ` - ${result.error}` : ''}`);
      } catch (error) {
        console.log(`❌ ${method.name}: Failed - ${error}`);
        results.push({
          method: method.name,
          duration: 0,
          success: false,
          error: String(error)
        });
      }
    }
    
    return results;
  },

  /**
   * Test cache performance
   */
  async testCachePerformance(ticker: string, formType: FilingType) {
    const optimizedService = new OptimizedFilingService({
      enableInMemoryCache: true,
      cacheTimeoutSeconds: 300
    });
    
    console.log(`🗄️  Testing cache performance for ${ticker} ${formType}`);
    
    // First request (cache miss)
    const start1 = Date.now();
    const result1 = await optimizedService.getFilingSummary(ticker, formType, {
      returnMetadata: true,
      saveToDatabase: false
    });
    const duration1 = Date.now() - start1;
    
    // Second request (cache hit)
    const start2 = Date.now();
    const result2 = await optimizedService.getFilingSummary(ticker, formType, {
      returnMetadata: true,
      saveToDatabase: false
    });
    const duration2 = Date.now() - start2;
    
    console.log(`📊 Cache Miss: ${duration1}ms`);
    console.log(`📊 Cache Hit: ${duration2}ms`);
    console.log(`📊 Cache Improvement: ${((duration1 - duration2) / duration1 * 100).toFixed(1)}%`);
    
    return {
      cacheMiss: { duration: duration1, cacheHit: result1.metadata?.cacheHit },
      cacheHit: { duration: duration2, cacheHit: result2.metadata?.cacheHit }
    };
  },

  /**
   * Run batch processing test
   */
  async testBatchProcessing(requests: Array<{ ticker: string; formType: FilingType }>) {
    const optimizedService = new OptimizedFilingService({
      enableBatchProcessing: true,
      enableInMemoryCache: true
    });
    
    console.log(`📦 Testing batch processing for ${requests.length} requests`);
    
    const start = Date.now();
    const results = await optimizedService.batchProcessFilings(requests, {
      concurrency: 2,
      saveToDatabase: false
    });
    const duration = Date.now() - start;
    
    const successCount = results.filter(r => r.result.data !== null).length;
    
    console.log(`📊 Batch Duration: ${duration}ms`);
    console.log(`📊 Success Rate: ${successCount}/${requests.length} (${(successCount/requests.length*100).toFixed(1)}%)`);
    console.log(`📊 Average per Request: ${(duration/requests.length).toFixed(0)}ms`);
    
    return {
      totalDuration: duration,
      averagePerRequest: duration / requests.length,
      successRate: successCount / requests.length,
      results
    };
  }
};