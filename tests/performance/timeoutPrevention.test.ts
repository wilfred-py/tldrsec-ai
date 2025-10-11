/**
 * Comprehensive test suite for 524 timeout prevention optimizations
 * 
 * Tests circuit breaker, filing prioritization, and performance monitoring
 */

import { describe, beforeEach, afterEach, it, expect, jest } from '@jest/globals';
import { IntelligentCircuitBreaker, createCircuitBreaker } from '../../lib/services/circuitBreaker';
import { filingPrioritizer, FilingPriority } from '../../lib/services/filingPrioritizer';
import { PerformanceMetricsCollector } from '../../lib/monitoring/performanceMetrics';

// Mock external dependencies
jest.mock('../../lib/logging', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

describe('Circuit Breaker - Timeout Prevention', () => {
  let circuitBreaker: IntelligentCircuitBreaker;
  
  beforeEach(() => {
    circuitBreaker = createCircuitBreaker(600000, {
      effectiveTimeoutMs: 540000,
      minFilingProcessingTime: 90000,
      safetyBuffer: 30000
    });
  });

  describe('Time Constraint Calculation', () => {
    it('should calculate time constraints correctly', () => {
      const constraints = circuitBreaker.calculateTimeConstraints();
      
      expect(constraints).toHaveProperty('elapsed');
      expect(constraints).toHaveProperty('remaining');
      expect(constraints).toHaveProperty('shouldContinue');
      expect(constraints).toHaveProperty('remainingFilingsCapacity');
      expect(constraints.elapsed).toBeGreaterThanOrEqual(0);
      expect(constraints.remaining).toBeLessThanOrEqual(540000);
    });

    it('should indicate when timeout is approaching', async () => {
      // Simulate time passing to near timeout
      const nearTimeoutBreaker = new IntelligentCircuitBreaker({
        effectiveTimeoutMs: 1000, // 1 second
        minFilingProcessingTime: 90000,
        safetyBuffer: 30000
      });

      // Wait a bit to let time pass
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const constraints = nearTimeoutBreaker.calculateTimeConstraints();
      expect(constraints.shouldContinue).toBe(false);
    });

    it('should calculate filing capacity based on remaining time', () => {
      const constraints = circuitBreaker.calculateTimeConstraints();
      const expectedCapacity = Math.floor((constraints.remaining - 30000) / 90000);
      
      expect(constraints.remainingFilingsCapacity).toBe(Math.max(0, expectedCapacity));
    });
  });

  describe('Filing Processing Decisions', () => {
    it('should allow processing when sufficient time remains', () => {
      const decision = circuitBreaker.shouldProcessFiling('CRITICAL');
      
      expect(decision.shouldProcess).toBe(true);
      expect(decision.reason).toContain('Proceeding');
      expect(decision.timeConstraints).toBeDefined();
    });

    it('should skip backlog processing when time is limited', () => {
      const limitedTimeBreaker = new IntelligentCircuitBreaker({
        effectiveTimeoutMs: 120000, // 2 minutes
        minFilingProcessingTime: 90000,
        safetyBuffer: 30000
      });

      const decision = limitedTimeBreaker.shouldProcessFiling('BACKLOG');
      expect(decision.shouldProcess).toBe(false);
      expect(decision.reason).toContain('skipping backlog');
    });

    it('should activate circuit breaker when time is insufficient', () => {
      const urgentBreaker = new IntelligentCircuitBreaker({
        effectiveTimeoutMs: 10000, // 10 seconds
        minFilingProcessingTime: 90000,
        safetyBuffer: 30000
      });

      const decision = urgentBreaker.shouldProcessFiling('NORMAL');
      expect(decision.shouldProcess).toBe(false);
      expect(decision.reason).toContain('Circuit breaker active');
    });
  });

  describe('Batch Size Optimization', () => {
    it('should calculate optimal batch sizes based on priority', () => {
      const criticalBatch = circuitBreaker.calculateOptimalBatchSize(10, 'CRITICAL');
      const normalBatch = circuitBreaker.calculateOptimalBatchSize(10, 'NORMAL');
      const backlogBatch = circuitBreaker.calculateOptimalBatchSize(10, 'BACKLOG');

      expect(criticalBatch).toBeGreaterThanOrEqual(normalBatch);
      expect(normalBatch).toBeGreaterThanOrEqual(backlogBatch);
      expect(criticalBatch).toBeLessThanOrEqual(5); // Max concurrent processing
    });

    it('should limit batch size by remaining capacity', () => {
      const constraints = circuitBreaker.calculateTimeConstraints();
      const batchSize = circuitBreaker.calculateOptimalBatchSize(100, 'NORMAL');
      
      expect(batchSize).toBeLessThanOrEqual(constraints.remainingFilingsCapacity);
    });
  });

  describe('Processing Wrapper', () => {
    it('should execute processing when circuit breaker allows', async () => {
      const mockProcess = jest.fn().mockResolvedValue('success');
      
      const result = await circuitBreaker.wrapProcessing(mockProcess, 'HIGH');
      
      expect(result.skipped).toBe(false);
      expect(result.result).toBe('success');
      expect(mockProcess).toHaveBeenCalled();
    });

    it('should skip processing when circuit breaker prevents', async () => {
      const mockProcess = jest.fn().mockResolvedValue('success');
      const urgentBreaker = new IntelligentCircuitBreaker({
        effectiveTimeoutMs: 1000,
        minFilingProcessingTime: 90000,
        safetyBuffer: 30000
      });
      
      const result = await urgentBreaker.wrapProcessing(mockProcess, 'NORMAL');
      
      expect(result.skipped).toBe(true);
      expect(result.result).toBe(null);
      expect(mockProcess).not.toHaveBeenCalled();
    });
  });
});

describe('Filing Prioritizer', () => {
  describe('Priority Determination', () => {
    it('should assign CRITICAL priority to 10-K and 10-Q filings', () => {
      const filing10K = { formType: '10-K', filingDate: new Date().toISOString() };
      const filing10Q = { formType: '10-Q', filingDate: new Date().toISOString() };
      
      expect(filingPrioritizer.determinePriority(filing10K)).toBe(FilingPriority.CRITICAL);
      expect(filingPrioritizer.determinePriority(filing10Q)).toBe(FilingPriority.CRITICAL);
    });

    it('should assign HIGH priority to 8-K and Form 4 filings', () => {
      const filing8K = { formType: '8-K', filingDate: new Date().toISOString() };
      const formType4 = { formType: 'FORM 4', filingDate: new Date().toISOString() };
      
      expect(filingPrioritizer.determinePriority(filing8K)).toBe(FilingPriority.HIGH);
      expect(filingPrioritizer.determinePriority(formType4)).toBe(FilingPriority.HIGH);
    });

    it('should assign BACKLOG priority when specified', () => {
      const filing = { formType: 'DEF 14A', filingDate: new Date().toISOString() };
      
      expect(filingPrioritizer.determinePriority(filing, true)).toBe(FilingPriority.BACKLOG);
    });

    it('should escalate recent filings to HIGH priority', () => {
      const recentFiling = { 
        formType: 'DEF 14A', 
        filingDate: new Date().toISOString() // Today
      };
      
      expect(filingPrioritizer.determinePriority(recentFiling)).toBe(FilingPriority.HIGH);
    });
  });

  describe('Processing Time Estimation', () => {
    it('should estimate longer times for complex filings', () => {
      const filing10K = { formType: '10-K' };
      const filing8K = { formType: '8-K' };
      const filingForm4 = { formType: 'FORM 4' };
      
      const time10K = filingPrioritizer.estimateProcessingTime(filing10K);
      const time8K = filingPrioritizer.estimateProcessingTime(filing8K);
      const timeForm4 = filingPrioritizer.estimateProcessingTime(filingForm4);
      
      expect(time10K).toBeGreaterThan(time8K);
      expect(time8K).toBeGreaterThan(timeForm4);
    });

    it('should provide default time for unknown form types', () => {
      const unknownFiling = { formType: 'UNKNOWN-FORM' };
      const defaultTime = filingPrioritizer.estimateProcessingTime(unknownFiling);
      
      expect(defaultTime).toBe(60000); // 1 minute default
    });
  });

  describe('Filing Prioritization', () => {
    it('should sort filings by priority and date', () => {
      const mockFilings = [
        { 
          formType: 'DEF 14A', 
          filingDate: '2024-01-01',
          ticker: { symbol: 'TEST', cik: '123', companyName: 'Test Corp' }
        },
        { 
          formType: '10-K', 
          filingDate: '2024-01-02',
          ticker: { symbol: 'TEST', cik: '123', companyName: 'Test Corp' }
        },
        { 
          formType: '8-K', 
          filingDate: '2024-01-03',
          ticker: { symbol: 'TEST', cik: '123', companyName: 'Test Corp' }
        }
      ];
      
      const result = filingPrioritizer.prioritizeFilings(mockFilings);
      
      expect(result.critical.length).toBe(1);
      expect(result.high.length).toBe(1);
      expect(result.normal.length).toBe(1);
      expect(result.critical[0].filing.formType).toBe('10-K');
      expect(result.high[0].filing.formType).toBe('8-K');
    });
  });

  describe('Optimal Processing Order', () => {
    it('should recommend filings that fit within time constraints', () => {
      const mockFilings = Array.from({ length: 10 }, (_, i) => ({
        formType: 'FORM 4',
        filingDate: new Date().toISOString(),
        ticker: { symbol: `TEST${i}`, cik: `${i}`, companyName: `Test Corp ${i}` }
      }));
      
      const prioritized = filingPrioritizer.prioritizeFilings(mockFilings);
      const optimal = filingPrioritizer.getOptimalProcessingOrder(
        prioritized,
        300000, // 5 minutes
        30000   // 30 second buffer
      );
      
      expect(optimal.recommended.length).toBeGreaterThan(0);
      expect(optimal.totalEstimatedTime).toBeLessThanOrEqual(270000); // 4.5 minutes
      expect(optimal.willCompleteInTime).toBe(true);
    });

    it('should skip filings when time is insufficient', () => {
      const mockFilings = Array.from({ length: 10 }, (_, i) => ({
        formType: '10-K', // Long processing time
        filingDate: new Date().toISOString(),
        ticker: { symbol: `TEST${i}`, cik: `${i}`, companyName: `Test Corp ${i}` }
      }));
      
      const prioritized = filingPrioritizer.prioritizeFilings(mockFilings);
      const optimal = filingPrioritizer.getOptimalProcessingOrder(
        prioritized,
        60000, // 1 minute - insufficient for many 10-K filings
        30000  // 30 second buffer
      );
      
      expect(optimal.skipped.length).toBeGreaterThan(0);
      expect(optimal.totalEstimatedTime).toBeLessThanOrEqual(30000); // Effective time
    });
  });

  describe('Batch Creation', () => {
    it('should create appropriately sized batches', () => {
      const mockFilings = Array.from({ length: 7 }, (_, i) => ({
        filing: {
          formType: 'FORM 4',
          filingDate: new Date().toISOString(),
          ticker: { symbol: `TEST${i}`, cik: `${i}`, companyName: `Test Corp ${i}` }
        },
        priority: FilingPriority.HIGH,
        estimatedProcessingTime: 45000,
        reasoning: 'Test filing'
      }));
      
      const batches = filingPrioritizer.createProcessingBatches(mockFilings, 3);
      
      expect(batches.length).toBe(3); // ceil(7/3) = 3 batches
      expect(batches[0].length).toBe(3);
      expect(batches[1].length).toBe(3);
      expect(batches[2].length).toBe(1);
    });
  });
});

describe('Performance Metrics Collector', () => {
  let metrics: PerformanceMetricsCollector;
  
  beforeEach(() => {
    metrics = new PerformanceMetricsCollector();
  });

  describe('Processing Time Recording', () => {
    it('should record successful processing times', () => {
      metrics.recordProcessingTime(5000, true);
      metrics.recordProcessingTime(3000, true);
      
      const status = metrics.getPerformanceStatus();
      expect(status.metrics.successfulProcessingCount).toBe(2);
      expect(status.metrics.avgProcessingTime).toBe(4000);
      expect(status.metrics.timeoutCount).toBe(0);
    });

    it('should record timeout failures', () => {
      metrics.recordProcessingTime(10000, false);
      metrics.recordProcessingTime(15000, false);
      
      const status = metrics.getPerformanceStatus();
      expect(status.metrics.timeoutCount).toBe(2);
      expect(status.metrics.timeoutRate).toBe(1.0); // 100% timeout rate
    });

    it('should calculate percentiles correctly', () => {
      const times = [1000, 2000, 3000, 4000, 5000];
      times.forEach(time => metrics.recordProcessingTime(time, true));
      
      const status = metrics.getPerformanceStatus();
      expect(status.metrics.processingTimeP95).toBe(5000);
      expect(status.metrics.processingTimeP99).toBe(5000);
    });
  });

  describe('Alert Generation', () => {
    it('should create alerts for high timeout rates', () => {
      // Record many timeouts
      for (let i = 0; i < 10; i++) {
        metrics.recordProcessingTime(300000, false); // 5 minute timeouts
      }
      
      const status = metrics.getPerformanceStatus();
      expect(status.alerts.length).toBeGreaterThan(0);
      expect(status.alerts.some(alert => alert.thresholdBreached.includes('timeout'))).toBe(true);
    });

    it('should create alerts for large backlogs', () => {
      metrics.recordBacklogSize(50); // Large backlog
      
      const status = metrics.getPerformanceStatus();
      expect(status.alerts.some(alert => alert.thresholdBreached === 'large_backlog')).toBe(true);
    });

    it('should create alerts for frequent circuit breaker activations', () => {
      for (let i = 0; i < 5; i++) {
        metrics.recordCircuitBreakerActivation(2);
      }
      
      const status = metrics.getPerformanceStatus();
      expect(status.alerts.some(alert => alert.thresholdBreached === 'frequent_circuit_breaker')).toBe(true);
    });
  });

  describe('Health Score Calculation', () => {
    it('should return perfect health score for good performance', () => {
      metrics.recordProcessingTime(30000, true); // 30 seconds - good time
      metrics.recordBacklogSize(2); // Small backlog
      metrics.recordAIMetrics(1000, true, 5000, 0.05);
      
      const status = metrics.getPerformanceStatus();
      expect(status.healthScore).toBeGreaterThan(80);
    });

    it('should penalize health score for poor performance', () => {
      metrics.recordProcessingTime(300000, false); // 5 minute timeout
      metrics.recordBacklogSize(50); // Large backlog
      metrics.recordCircuitBreakerActivation(10); // Many activations
      
      const status = metrics.getPerformanceStatus();
      expect(status.healthScore).toBeLessThan(50);
    });
  });

  describe('Recommendations', () => {
    it('should provide recommendations for performance issues', () => {
      metrics.recordProcessingTime(300000, false); // Timeout
      metrics.recordBacklogSize(20); // Large backlog
      
      const status = metrics.getPerformanceStatus();
      expect(status.recommendations.length).toBeGreaterThan(0);
      expect(status.recommendations.some(rec => rec.includes('timeout'))).toBe(true);
      expect(status.recommendations.some(rec => rec.includes('backlog'))).toBe(true);
    });

    it('should indicate healthy status when no issues', () => {
      metrics.recordProcessingTime(30000, true);
      metrics.recordBacklogSize(2);
      
      const status = metrics.getPerformanceStatus();
      expect(status.recommendations).toContain('Performance is healthy - continue current monitoring');
    });
  });

  describe('Metrics Export', () => {
    it('should export metrics in correct format', () => {
      metrics.recordProcessingTime(45000, true);
      metrics.recordBacklogSize(5);
      metrics.recordAIMetrics(2000, true, 10000, 0.10);
      
      const exported = metrics.exportMetrics();
      
      expect(exported).toHaveProperty('tldrsec.processing.avg_time_ms');
      expect(exported).toHaveProperty('tldrsec.backlog.size');
      expect(exported).toHaveProperty('tldrsec.ai.success_rate');
      expect(exported['tldrsec.processing.avg_time_ms']).toBe(45000);
      expect(exported['tldrsec.backlog.size']).toBe(5);
    });
  });
});

describe('Integration Tests - Timeout Prevention System', () => {
  it('should work together to prevent timeouts', async () => {
    const circuitBreaker = createCircuitBreaker(300000, { // 5 minutes total
      effectiveTimeoutMs: 270000, // 4.5 minutes effective
      minFilingProcessingTime: 60000, // 1 minute per filing
      safetyBuffer: 30000
    });
    
    const mockFilings = [
      { 
        formType: '10-K', 
        filingDate: new Date().toISOString(),
        ticker: { symbol: 'AAPL', cik: '320193', companyName: 'Apple Inc.' }
      },
      { 
        formType: '8-K', 
        filingDate: new Date().toISOString(),
        ticker: { symbol: 'MSFT', cik: '789019', companyName: 'Microsoft Corp.' }
      },
      { 
        formType: 'FORM 4', 
        filingDate: new Date().toISOString(),
        ticker: { symbol: 'GOOGL', cik: '1652044', companyName: 'Alphabet Inc.' }
      }
    ];
    
    // Prioritize filings
    const prioritized = filingPrioritizer.prioritizeFilings(mockFilings);
    expect(prioritized.critical.length).toBe(1); // 10-K
    expect(prioritized.high.length).toBe(2); // 8-K and Form 4
    
    // Get optimal processing order within time constraints
    const constraints = circuitBreaker.calculateTimeConstraints();
    const optimal = filingPrioritizer.getOptimalProcessingOrder(
      prioritized,
      constraints.remaining,
      30000
    );
    
    // Should recommend all filings since we have enough time
    expect(optimal.recommended.length).toBe(3);
    expect(optimal.willCompleteInTime).toBe(true);
    
    // Test circuit breaker decisions
    for (const filing of optimal.recommended) {
      const decision = circuitBreaker.shouldProcessFiling(
        filing.priority === FilingPriority.CRITICAL ? 'CRITICAL' :
        filing.priority === FilingPriority.HIGH ? 'HIGH' : 'NORMAL'
      );
      expect(decision.shouldProcess).toBe(true);
    }
  });

  it('should gracefully degrade under extreme time pressure', async () => {
    const circuitBreaker = createCircuitBreaker(60000, { // 1 minute total
      effectiveTimeoutMs: 45000, // 45 seconds effective
      minFilingProcessingTime: 30000, // 30 seconds per filing
      safetyBuffer: 15000 // 15 second buffer
    });
    
    const manyFilings = Array.from({ length: 10 }, (_, i) => ({
      formType: i < 2 ? '10-K' : i < 5 ? '8-K' : 'FORM 4',
      filingDate: new Date().toISOString(),
      ticker: { symbol: `TEST${i}`, cik: `${i}`, companyName: `Test Corp ${i}` }
    }));
    
    const prioritized = filingPrioritizer.prioritizeFilings(manyFilings);
    const constraints = circuitBreaker.calculateTimeConstraints();
    const optimal = filingPrioritizer.getOptimalProcessingOrder(
      prioritized,
      constraints.remaining,
      15000
    );
    
    // Should prioritize critical filings and skip others
    expect(optimal.recommended.length).toBeLessThan(manyFilings.length);
    expect(optimal.skipped.length).toBeGreaterThan(0);
    
    // Critical filings should be recommended first
    const criticalRecommended = optimal.recommended.filter(f => f.priority === FilingPriority.CRITICAL);
    expect(criticalRecommended.length).toBeGreaterThan(0);
  });
});

// Performance benchmark tests
describe('Performance Benchmarks', () => {
  it('should complete circuit breaker decisions quickly', () => {
    const circuitBreaker = createCircuitBreaker();
    const startTime = Date.now();
    
    for (let i = 0; i < 1000; i++) {
      circuitBreaker.shouldProcessFiling('NORMAL');
    }
    
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(100); // Should complete in under 100ms
  });

  it('should handle filing prioritization efficiently', () => {
    const manyFilings = Array.from({ length: 1000 }, (_, i) => ({
      formType: ['10-K', '10-Q', '8-K', 'FORM 4', 'DEF 14A'][i % 5],
      filingDate: new Date(Date.now() - i * 86400000).toISOString(), // Spread over days
      ticker: { symbol: `TEST${i}`, cik: `${i}`, companyName: `Test Corp ${i}` }
    }));
    
    const startTime = Date.now();
    const prioritized = filingPrioritizer.prioritizeFilings(manyFilings);
    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(500); // Should complete in under 500ms
    expect(prioritized.total).toBe(1000);
  });
});