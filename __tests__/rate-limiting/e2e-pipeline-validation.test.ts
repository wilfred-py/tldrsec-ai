/**
 * End-to-End Pipeline Validation Tests for Rate Limiting
 * 
 * Tests complete SEC filing processing pipeline with rate limiting,
 * ensuring data consistency and email delivery under various scenarios.
 */

import { 
  AIProcessingCircuitBreaker, 
  CircuitState 
} from '../../lib/infrastructure/circuit-breaker';
import { 
  InfrastructureRequestQueue 
} from '../../lib/infrastructure/request-queue';

// Import existing test utilities and database helpers
import { getPrismaClient } from '../../lib/db';
import { logger } from '../../lib/logging';

// Mock the full pipeline components
class MockFullPipeline {
  private secAPI: MockSECAPI;
  private aiAPI: MockAIAPI;
  private emailAPI: MockEmailAPI;
  private database: MockDatabase;
  private circuitBreaker: AIProcessingCircuitBreaker;
  private requestQueue: InfrastructureRequestQueue;

  constructor() {
    this.secAPI = new MockSECAPI();
    this.aiAPI = new MockAIAPI();
    this.emailAPI = new MockEmailAPI();
    this.database = new MockDatabase();
    this.circuitBreaker = new AIProcessingCircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 2000,
      monitoringWindow: 10000,
      volumeThreshold: 5
    });
    this.requestQueue = new InfrastructureRequestQueue();
  }

  async processFiling(filing: any): Promise<any> {
    const requestId = await this.requestQueue.enqueueRequest({
      type: 'filing_processing',
      priority: filing.priority || 1,
      payload: filing,
      maxRetries: 3,
      timeout: 30000
    });

    return await this.requestQueue.processRequest(requestId, async (payload: any) => {
      return await this.executeFullPipeline(payload);
    });
  }

  private async executeFullPipeline(filing: any): Promise<any> {
    // Step 1: Fetch SEC filing data with rate limiting
    const secData = await this.circuitBreaker.execute(async () => {
      return await this.secAPI.fetchFiling(filing.cik, filing.formType);
    }, 'sec-filing-fetch');

    // Step 2: Process with AI (with rate limiting)
    const summary = await this.circuitBreaker.execute(async () => {
      return await this.aiAPI.generateSummary(secData.content);
    }, 'ai-summary-generation');

    // Step 3: Store in database (with transaction safety)
    const dbResult = await this.database.storeSummary({
      cik: filing.cik,
      formType: filing.formType,
      summary,
      filingData: secData,
      processedAt: new Date()
    });

    // Step 4: Send email notification (with rate limiting)
    const emailResult = await this.emailAPI.sendSummaryEmail(
      filing.userEmail,
      filing.ticker,
      summary
    );

    return {
      secData,
      summary,
      dbResult,
      emailResult,
      success: true
    };
  }

  async shutdown(): Promise<void> {
    await this.requestQueue.shutdown();
    this.circuitBreaker.reset();
  }

  getStats() {
    return {
      circuit: this.circuitBreaker.getStats(),
      queue: this.requestQueue.getQueueStats(),
      sec: this.secAPI.getStats(),
      ai: this.aiAPI.getStats(),
      email: this.emailAPI.getStats(),
      database: this.database.getStats()
    };
  }

  reset(): void {
    this.secAPI.reset();
    this.aiAPI.reset();
    this.emailAPI.reset();
    this.database.reset();
    this.circuitBreaker.reset();
  }

  // Simulate different failure scenarios
  simulateSecAPIFailure(): void {
    this.secAPI.simulateFailure();
  }

  simulateAIAPIFailure(): void {
    this.aiAPI.simulateFailure();
  }

  simulateEmailAPIFailure(): void {
    this.emailAPI.simulateFailure();
  }

  simulateDatabaseFailure(): void {
    this.database.simulateFailure();
  }
}

class MockSECAPI {
  private requestCount = 0;
  private isRateLimited = false;
  private isDown = false;

  async fetchFiling(cik: string, formType: string): Promise<any> {
    this.requestCount++;

    if (this.isDown) {
      throw new Error('SEC API is down');
    }

    if (this.requestCount > 10) {
      this.isRateLimited = true;
      throw new Error('429 Too Many Requests');
    }

    // Simulate some processing time
    await new Promise(resolve => setTimeout(resolve, 100));

    return {
      cik,
      formType,
      content: `SEC filing content for ${cik} - ${formType}`,
      filedAt: new Date(),
      url: `https://sec.gov/filing/${cik}/${formType}`
    };
  }

  getStats() {
    return {
      requestCount: this.requestCount,
      isRateLimited: this.isRateLimited,
      isDown: this.isDown
    };
  }

  reset(): void {
    this.requestCount = 0;
    this.isRateLimited = false;
    this.isDown = false;
  }

  simulateFailure(): void {
    this.isDown = true;
  }
}

class MockAIAPI {
  private requestCount = 0;
  private consecutiveFailures = 0;
  private isDown = false;

  async generateSummary(content: string): Promise<string> {
    this.requestCount++;

    if (this.isDown) {
      throw new Error('AI API is down');
    }

    // Simulate rate limiting and timeouts
    if (this.requestCount > 15) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures > 3) {
        throw new Error('524 Gateway Timeout');
      }
      throw new Error('429 Too Many Requests');
    }

    // Simulate AI processing time
    await new Promise(resolve => setTimeout(resolve, 500));

    this.consecutiveFailures = 0;
    return `AI Summary: ${content.substring(0, 100)}... [Generated at ${new Date().toISOString()}]`;
  }

  getStats() {
    return {
      requestCount: this.requestCount,
      consecutiveFailures: this.consecutiveFailures,
      isDown: this.isDown
    };
  }

  reset(): void {
    this.requestCount = 0;
    this.consecutiveFailures = 0;
    this.isDown = false;
  }

  simulateFailure(): void {
    this.isDown = true;
  }
}

class MockEmailAPI {
  private requestCount = 0;
  private isRateLimited = false;
  private isDown = false;
  private deliveredEmails: any[] = [];

  async sendSummaryEmail(to: string, ticker: string, summary: string): Promise<any> {
    this.requestCount++;

    if (this.isDown) {
      throw new Error('Email API is down');
    }

    if (this.requestCount > 100) {
      this.isRateLimited = true;
      throw new Error('429 Rate limit exceeded');
    }

    // Simulate email processing time
    await new Promise(resolve => setTimeout(resolve, 50));

    const email = {
      id: `email-${this.requestCount}`,
      to,
      subject: `${ticker} Filing Summary`,
      content: summary,
      sentAt: new Date()
    };

    this.deliveredEmails.push(email);
    return email;
  }

  getStats() {
    return {
      requestCount: this.requestCount,
      isRateLimited: this.isRateLimited,
      isDown: this.isDown,
      deliveredCount: this.deliveredEmails.length
    };
  }

  getDeliveredEmails(): any[] {
    return this.deliveredEmails;
  }

  reset(): void {
    this.requestCount = 0;
    this.isRateLimited = false;
    this.isDown = false;
    this.deliveredEmails = [];
  }

  simulateFailure(): void {
    this.isDown = true;
  }
}

class MockDatabase {
  private summaries: any[] = [];
  private transactionCount = 0;
  private isDown = false;

  async storeSummary(data: any): Promise<any> {
    this.transactionCount++;

    if (this.isDown) {
      throw new Error('Database is down');
    }

    // Simulate database processing time
    await new Promise(resolve => setTimeout(resolve, 50));

    const stored = {
      id: `summary-${this.transactionCount}`,
      ...data,
      createdAt: new Date()
    };

    this.summaries.push(stored);
    return stored;
  }

  getSummaries(): any[] {
    return this.summaries;
  }

  getStats() {
    return {
      transactionCount: this.transactionCount,
      storedSummaries: this.summaries.length,
      isDown: this.isDown
    };
  }

  reset(): void {
    this.summaries = [];
    this.transactionCount = 0;
    this.isDown = false;
  }

  simulateFailure(): void {
    this.isDown = true;
  }
}

describe('E2E Pipeline Validation with Rate Limiting', () => {
  let pipeline: MockFullPipeline;

  beforeEach(() => {
    pipeline = new MockFullPipeline();
  });

  afterEach(async () => {
    await pipeline.shutdown();
  });

  describe('Normal Operation Without Rate Limits', () => {
    test('should process single filing successfully', async () => {
      const filing = {
        cik: '1234567890',
        formType: '10-K',
        ticker: 'TEST',
        userEmail: 'test@example.com',
        priority: 1
      };

      const result = await pipeline.processFiling(filing);

      expect(result.success).toBe(true);
      expect(result.data.secData).toBeDefined();
      expect(result.data.summary).toBeDefined();
      expect(result.data.dbResult).toBeDefined();
      expect(result.data.emailResult).toBeDefined();

      const stats = pipeline.getStats();
      expect(stats.circuit.totalSuccesses).toBeGreaterThan(0);
      expect(stats.sec.requestCount).toBe(1);
      expect(stats.ai.requestCount).toBe(1);
      expect(stats.email.deliveredCount).toBe(1);
      expect(stats.database.storedSummaries).toBe(1);
    });

    test('should process multiple filings concurrently', async () => {
      const filings = [
        { cik: '1000001', formType: '10-K', ticker: 'AAPL', userEmail: 'user1@example.com' },
        { cik: '1000002', formType: '10-Q', ticker: 'MSFT', userEmail: 'user2@example.com' },
        { cik: '1000003', formType: '8-K', ticker: 'GOOGL', userEmail: 'user3@example.com' }
      ];

      const promises = filings.map(filing => pipeline.processFiling(filing));
      const results = await Promise.allSettled(promises);

      const successCount = results.filter(r => r.status === 'fulfilled').length;
      expect(successCount).toBe(3);

      const stats = pipeline.getStats();
      expect(stats.email.deliveredCount).toBe(3);
      expect(stats.database.storedSummaries).toBe(3);
    });

    test('should maintain data consistency across pipeline', async () => {
      const filing = {
        cik: '1234567890',
        formType: '10-K',
        ticker: 'TEST',
        userEmail: 'consistency@example.com'
      };

      const result = await pipeline.processFiling(filing);

      // Verify data consistency across all components
      const { secData, summary, dbResult, emailResult } = result.data;

      expect(secData.cik).toBe(filing.cik);
      expect(secData.formType).toBe(filing.formType);
      expect(summary).toContain(secData.content.substring(0, 50));
      expect(dbResult.cik).toBe(filing.cik);
      expect(dbResult.summary).toBe(summary);
      expect(emailResult.to).toBe(filing.userEmail);
      expect(emailResult.content).toBe(summary);
    });
  });

  describe('Rate Limiting Scenarios', () => {
    test('should handle SEC API rate limiting gracefully', async () => {
      const filings = Array.from({ length: 15 }, (_, i) => ({
        cik: `100000${i}`,
        formType: '10-K',
        ticker: `TEST${i}`,
        userEmail: `user${i}@example.com`
      }));

      const promises = filings.map(filing => pipeline.processFiling(filing));
      const results = await Promise.allSettled(promises);

      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failureCount = results.filter(r => r.status === 'rejected').length;

      // Some should succeed before rate limiting kicks in
      expect(successCount).toBeGreaterThan(0);
      expect(successCount).toBeLessThan(15); // Rate limiting should prevent all from succeeding

      const stats = pipeline.getStats();
      expect(stats.sec.isRateLimited).toBe(true);
    });

    test('should handle AI API rate limiting with circuit breaker', async () => {
      const filings = Array.from({ length: 20 }, (_, i) => ({
        cik: `200000${i}`,
        formType: '10-Q',
        ticker: `AI${i}`,
        userEmail: `ai${i}@example.com`
      }));

      const promises = filings.map(filing => pipeline.processFiling(filing));
      const results = await Promise.allSettled(promises);

      const stats = pipeline.getStats();
      
      // Circuit breaker should eventually open
      expect(stats.circuit.state).toBe(CircuitState.OPEN);
      
      // Some filings should have been processed before circuit opened
      expect(stats.database.storedSummaries).toBeGreaterThan(0);
      expect(stats.database.storedSummaries).toBeLessThan(20);
    });

    test('should handle email rate limiting without data loss', async () => {
      const filings = Array.from({ length: 105 }, (_, i) => ({
        cik: `300000${i}`,
        formType: '8-K',
        ticker: `EMAIL${i}`,
        userEmail: `email${i}@example.com`
      }));

      const promises = filings.map(filing => pipeline.processFiling(filing));
      const results = await Promise.allSettled(promises);

      const stats = pipeline.getStats();
      
      // Database should have all successful processing results
      // even if email delivery was rate limited
      expect(stats.database.storedSummaries).toBeGreaterThan(0);
      
      // Email delivery should be rate limited
      expect(stats.email.isRateLimited).toBe(true);
      expect(stats.email.deliveredCount).toBeLessThan(105);
      
      // No data should be lost from database
      expect(stats.database.storedSummaries).toBeGreaterThanOrEqual(stats.email.deliveredCount);
    });
  });

  describe('Service Failure Scenarios', () => {
    test('should handle SEC API downtime gracefully', async () => {
      pipeline.simulateSecAPIFailure();

      const filing = {
        cik: '4000001',
        formType: '10-K',
        ticker: 'DOWN',
        userEmail: 'down@example.com'
      };

      const result = await pipeline.processFiling(filing);

      expect(result.success).toBe(false);
      expect(result.error).toContain('SEC API is down');

      const stats = pipeline.getStats();
      expect(stats.circuit.totalFailures).toBeGreaterThan(0);
      expect(stats.database.storedSummaries).toBe(0); // No data should be stored
    });

    test('should handle AI API failure with proper fallback', async () => {
      pipeline.simulateAIAPIFailure();

      const filing = {
        cik: '4000002',
        formType: '10-Q',
        ticker: 'AIDOWN',
        userEmail: 'aidown@example.com'
      };

      const result = await pipeline.processFiling(filing);

      expect(result.success).toBe(false);
      expect(result.error).toContain('AI API is down');

      const stats = pipeline.getStats();
      expect(stats.circuit.totalFailures).toBeGreaterThan(0);
    });

    test('should handle database failure without affecting other components', async () => {
      pipeline.simulateDatabaseFailure();

      const filing = {
        cik: '4000003',
        formType: '8-K',
        ticker: 'DBDOWN',
        userEmail: 'dbdown@example.com'
      };

      const result = await pipeline.processFiling(filing);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database is down');

      const stats = pipeline.getStats();
      expect(stats.sec.requestCount).toBe(1); // SEC call should have succeeded
      expect(stats.ai.requestCount).toBe(1); // AI call should have succeeded
      expect(stats.database.storedSummaries).toBe(0); // Database write should have failed
    });

    test('should handle email service failure without affecting data storage', async () => {
      pipeline.simulateEmailAPIFailure();

      const filing = {
        cik: '4000004',
        formType: '10-K',
        ticker: 'EMAILDOWN',
        userEmail: 'emaildown@example.com'
      };

      const result = await pipeline.processFiling(filing);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Email API is down');

      const stats = pipeline.getStats();
      expect(stats.sec.requestCount).toBe(1);
      expect(stats.ai.requestCount).toBe(1);
      expect(stats.database.storedSummaries).toBe(1); // Data should still be stored
      expect(stats.email.deliveredCount).toBe(0); // Email should fail
    });
  });

  describe('Circuit Breaker and Recovery', () => {
    test('should trigger circuit breaker after repeated failures', async () => {
      // Generate enough failures to trigger circuit breaker
      const filings = Array.from({ length: 10 }, (_, i) => ({
        cik: `500000${i}`,
        formType: '10-K',
        ticker: `CB${i}`,
        userEmail: `cb${i}@example.com`
      }));

      // Simulate AI failure to trigger circuit breaker
      pipeline.simulateAIAPIFailure();

      const promises = filings.map(filing => pipeline.processFiling(filing));
      await Promise.allSettled(promises);

      const stats = pipeline.getStats();
      expect(stats.circuit.state).toBe(CircuitState.OPEN);
      expect(stats.circuit.totalFailures).toBeGreaterThan(3);
    });

    test('should recover from circuit breaker state', async () => {
      // First trigger circuit breaker
      pipeline.simulateAIAPIFailure();
      
      const failingFiling = {
        cik: '6000001',
        formType: '10-K',
        ticker: 'RECOVER',
        userEmail: 'recover@example.com'
      };

      // This should fail and open circuit
      await pipeline.processFiling(failingFiling);
      await pipeline.processFiling(failingFiling);
      await pipeline.processFiling(failingFiling);
      await pipeline.processFiling(failingFiling);

      let stats = pipeline.getStats();
      expect(stats.circuit.state).toBe(CircuitState.OPEN);

      // Now reset the AI API (simulate recovery)
      pipeline.reset();

      // Wait for circuit breaker timeout
      await new Promise(resolve => setTimeout(resolve, 2100));

      // Try processing again
      const recoveryFiling = {
        cik: '6000002',
        formType: '10-Q',
        ticker: 'RECOVERED',
        userEmail: 'recovered@example.com'
      };

      const result = await pipeline.processFiling(recoveryFiling);

      expect(result.success).toBe(true);
      
      stats = pipeline.getStats();
      expect(stats.circuit.state).toBe(CircuitState.CLOSED);
    });
  });

  describe('Data Consistency and Integrity', () => {
    test('should maintain transaction integrity during failures', async () => {
      const filings = Array.from({ length: 5 }, (_, i) => ({
        cik: `700000${i}`,
        formType: '10-K',
        ticker: `TX${i}`,
        userEmail: `tx${i}@example.com`
      }));

      // Process first 2 successfully
      const results1 = await Promise.all([
        pipeline.processFiling(filings[0]),
        pipeline.processFiling(filings[1])
      ]);

      expect(results1.every(r => r.success)).toBe(true);

      // Simulate database failure for remaining
      pipeline.simulateDatabaseFailure();

      const results2 = await Promise.allSettled([
        pipeline.processFiling(filings[2]),
        pipeline.processFiling(filings[3]),
        pipeline.processFiling(filings[4])
      ]);

      const stats = pipeline.getStats();
      
      // Only the first 2 should be in database
      expect(stats.database.storedSummaries).toBe(2);
      
      // Verify data integrity
      const summaries = stats.database.getSummaries();
      expect(summaries).toHaveLength(2);
      expect(summaries[0].cik).toBe(filings[0].cik);
      expect(summaries[1].cik).toBe(filings[1].cik);
    });

    test('should handle partial pipeline failures without data corruption', async () => {
      const filing = {
        cik: '8000001',
        formType: '10-K',
        ticker: 'PARTIAL',
        userEmail: 'partial@example.com'
      };

      // First successful processing
      const result1 = await pipeline.processFiling(filing);
      expect(result1.success).toBe(true);

      // Now simulate email failure
      pipeline.simulateEmailAPIFailure();

      const filing2 = {
        ...filing,
        cik: '8000002',
        userEmail: 'partial2@example.com'
      };

      const result2 = await pipeline.processFiling(filing2);
      expect(result2.success).toBe(false);

      const stats = pipeline.getStats();
      
      // First filing should be completely processed
      expect(stats.database.storedSummaries).toBe(2); // Both stored (email failure happens after DB)
      expect(stats.email.deliveredCount).toBe(1); // Only first email sent
    });
  });

  describe('Performance Under Rate Limiting', () => {
    test('should maintain reasonable performance under rate limiting', async () => {
      const filings = Array.from({ length: 8 }, (_, i) => ({
        cik: `900000${i}`,
        formType: '10-Q',
        ticker: `PERF${i}`,
        userEmail: `perf${i}@example.com`
      }));

      const startTime = Date.now();
      
      const promises = filings.map(filing => pipeline.processFiling(filing));
      const results = await Promise.allSettled(promises);
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // Should complete within reasonable time even with rate limiting
      expect(totalTime).toBeLessThan(10000); // 10 seconds max

      const successCount = results.filter(r => r.status === 'fulfilled').length;
      expect(successCount).toBeGreaterThan(0);

      const stats = pipeline.getStats();
      expect(stats.queue.activeRequests).toBe(0); // All requests should be processed
    });

    test('should efficiently queue and process requests under load', async () => {
      const filings = Array.from({ length: 12 }, (_, i) => ({
        cik: `950000${i}`,
        formType: i % 2 === 0 ? '10-K' : '10-Q',
        ticker: `QUEUE${i}`,
        userEmail: `queue${i}@example.com`,
        priority: i < 4 ? 1 : 3 // First 4 are high priority
      }));

      const startTime = Date.now();
      
      // Start all requests concurrently
      const promises = filings.map(filing => pipeline.processFiling(filing));
      const results = await Promise.allSettled(promises);
      
      const endTime = Date.now();

      const stats = pipeline.getStats();
      
      // Queue should have processed all requests
      expect(stats.queue.activeRequests).toBe(0);
      
      // Some requests should have succeeded
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      expect(successCount).toBeGreaterThan(0);
      
      // High priority requests should have better success rate if rate limited
      const highPriorityResults = results.slice(0, 4);
      const lowPriorityResults = results.slice(4);
      
      const highPrioritySuccess = highPriorityResults.filter(r => r.status === 'fulfilled').length;
      const lowPrioritySuccess = lowPriorityResults.filter(r => r.status === 'fulfilled').length;
      
      // If any rate limiting occurred, high priority should fare better
      if (successCount < filings.length) {
        expect(highPrioritySuccess / 4).toBeGreaterThanOrEqual(lowPrioritySuccess / 8);
      }
    });
  });

  describe('Monitoring and Alerting Integration', () => {
    test('should provide comprehensive statistics for monitoring', () => {
      const stats = pipeline.getStats();
      
      // Circuit breaker stats
      expect(stats.circuit).toHaveProperty('state');
      expect(stats.circuit).toHaveProperty('totalRequests');
      expect(stats.circuit).toHaveProperty('totalSuccesses');
      expect(stats.circuit).toHaveProperty('totalFailures');

      // Queue stats
      expect(stats.queue).toHaveProperty('activeRequests');
      expect(stats.queue).toHaveProperty('queuedJobs');

      // Service stats
      expect(stats.sec).toHaveProperty('requestCount');
      expect(stats.ai).toHaveProperty('requestCount');
      expect(stats.email).toHaveProperty('deliveredCount');
      expect(stats.database).toHaveProperty('storedSummaries');
    });

    test('should track rate limiting events for alerting', async () => {
      // Generate enough requests to trigger rate limiting
      const filings = Array.from({ length: 15 }, (_, i) => ({
        cik: `999000${i}`,
        formType: '10-K',
        ticker: `ALERT${i}`,
        userEmail: `alert${i}@example.com`
      }));

      const promises = filings.map(filing => pipeline.processFiling(filing));
      await Promise.allSettled(promises);

      const stats = pipeline.getStats();
      
      // Should have indicators for monitoring systems
      expect(stats.sec.isRateLimited || stats.ai.consecutiveFailures > 0).toBe(true);
      expect(stats.circuit.totalFailures).toBeGreaterThan(0);
    });
  });
});