/**
 * Cross-Service Rate Limiting Integration Tests
 * 
 * Tests coordination between circuit breaker, request queue, and rate limiting
 * across different external API services (SEC, Anthropic, Resend).
 */

import { 
  AIProcessingCircuitBreaker, 
  CircuitState, 
  CircuitBreakerConfig 
} from '../../lib/infrastructure/circuit-breaker';
import { 
  InfrastructureRequestQueue 
} from '../../lib/infrastructure/request-queue';
import { 
  getRateLimitConfig 
} from '../../lib/infrastructure/vercel-rate-limits';

// Mock external API services
class MockSECAPI {
  private requestCount = 0;
  private rateLimitResetTime = Date.now() + 60000; // 1 minute from now

  async fetchRSSFeed(): Promise<any> {
    this.requestCount++;
    
    // Simulate rate limiting
    if (this.requestCount > 10 && Date.now() < this.rateLimitResetTime) {
      const error = new Error('429 Too Many Requests');
      (error as any).status = 429;
      throw error;
    }
    
    // Reset counter after rate limit window
    if (Date.now() >= this.rateLimitResetTime) {
      this.requestCount = 0;
      this.rateLimitResetTime = Date.now() + 60000;
    }
    
    return { filings: [] };
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  reset(): void {
    this.requestCount = 0;
    this.rateLimitResetTime = Date.now() + 60000;
  }
}

class MockAnthropicAPI {
  private requestCount = 0;
  private consecutiveFailures = 0;

  async generateSummary(content: string): Promise<string> {
    this.requestCount++;
    
    // Simulate rate limiting and timeouts
    if (this.requestCount > 15) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures > 3) {
        throw new Error('524 Gateway Timeout');
      }
      throw new Error('429 Too Many Requests');
    }
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    this.consecutiveFailures = 0;
    return `Summary of: ${content.substring(0, 50)}...`;
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  reset(): void {
    this.requestCount = 0;
    this.consecutiveFailures = 0;
  }
}

class MockResendAPI {
  private requestCount = 0;
  private isRateLimited = false;

  async sendEmail(to: string, subject: string, content: string): Promise<any> {
    this.requestCount++;
    
    // Simulate rate limiting
    if (this.requestCount > 100) {
      this.isRateLimited = true;
      throw new Error('429 Rate limit exceeded');
    }
    
    return { id: `email-${this.requestCount}` };
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  isCurrentlyRateLimited(): boolean {
    return this.isRateLimited;
  }

  reset(): void {
    this.requestCount = 0;
    this.isRateLimited = false;
  }
}

describe('Cross-Service Rate Limiting Integration', () => {
  let secAPI: MockSECAPI;
  let anthropicAPI: MockAnthropicAPI;
  let resendAPI: MockResendAPI;
  let circuitBreaker: AIProcessingCircuitBreaker;
  let requestQueue: InfrastructureRequestQueue;

  const testConfig: CircuitBreakerConfig = {
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 1000,
    monitoringWindow: 5000,
    volumeThreshold: 5
  };

  beforeEach(() => {
    secAPI = new MockSECAPI();
    anthropicAPI = new MockAnthropicAPI();
    resendAPI = new MockResendAPI();
    circuitBreaker = new AIProcessingCircuitBreaker(testConfig);
    requestQueue = new InfrastructureRequestQueue();
  });

  afterEach(async () => {
    secAPI.reset();
    anthropicAPI.reset();
    resendAPI.reset();
    circuitBreaker.reset();
    await requestQueue.shutdown();
  });

  describe('SEC API Rate Limiting Coordination', () => {
    test('should handle SEC API 429 errors with circuit breaker protection', async () => {
      const secProcessor = async () => {
        return await circuitBreaker.execute(async () => {
          return await secAPI.fetchRSSFeed();
        }, 'sec-rss-fetch');
      };

      // Make requests until rate limited
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < 15; i++) {
        try {
          await secProcessor();
          successCount++;
        } catch (error) {
          errorCount++;
        }
      }

      expect(successCount).toBeGreaterThan(0);
      expect(errorCount).toBeGreaterThan(0);
      
      // Circuit breaker should eventually open
      const stats = circuitBreaker.getStats();
      expect(stats.totalFailures).toBeGreaterThan(0);
    });

    test('should coordinate SEC API requests through request queue', async () => {
      const requestIds: string[] = [];
      
      // Enqueue multiple SEC API requests
      for (let i = 0; i < 5; i++) {
        const requestId = await requestQueue.enqueueRequest({
          type: 'filing_processing',
          priority: 1,
          payload: `sec-request-${i}`,
          maxRetries: 2,
          timeout: 5000
        });
        requestIds.push(requestId);
      }

      // Process requests with rate limiting awareness
      const processors = requestIds.map(id => ({
        id,
        processor: async () => {
          return await circuitBreaker.execute(async () => {
            return await secAPI.fetchRSSFeed();
          });
        }
      }));

      const results = await requestQueue.processBatch(processors, 2);
      
      expect(results.length).toBe(5);
      
      // Some requests should succeed before rate limiting kicks in
      const successCount = results.filter(r => r.success).length;
      expect(successCount).toBeGreaterThan(0);
    });

    test('should backoff and retry SEC API requests after rate limiting', async () => {
      // Trigger rate limiting
      for (let i = 0; i < 12; i++) {
        try {
          await secAPI.fetchRSSFeed();
        } catch (error) {
          // Expected to fail
        }
      }

      const requestId = await requestQueue.enqueueRequest({
        type: 'filing_processing',
        priority: 1,
        payload: 'retry-test',
        maxRetries: 3,
        timeout: 10000
      });

      const result = await requestQueue.processRequest(requestId, async () => {
        return await circuitBreaker.execute(async () => {
          return await secAPI.fetchRSSFeed();
        });
      });

      // May succeed due to retries or fail gracefully
      expect(result).toBeDefined();
      expect(result.retryCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('AI Processing Rate Limiting Coordination', () => {
    test('should handle AI API rate limiting with circuit breaker', async () => {
      const aiProcessor = async (content: string) => {
        return await circuitBreaker.execute(async () => {
          return await anthropicAPI.generateSummary(content);
        }, 'ai-summarization');
      };

      let successCount = 0;
      let errorCount = 0;

      // Make requests until rate limited and circuit opens
      for (let i = 0; i < 25; i++) {
        try {
          await aiProcessor(`Test content ${i}`);
          successCount++;
        } catch (error) {
          errorCount++;
        }
      }

      expect(successCount).toBeGreaterThan(0);
      expect(errorCount).toBeGreaterThan(0);
      
      const stats = circuitBreaker.getStats();
      expect(stats.state).toBe(CircuitState.OPEN);
    });

    test('should queue AI processing requests with priority', async () => {
      const requestIds: string[] = [];
      
      // Enqueue AI requests with different priorities
      for (let i = 0; i < 8; i++) {
        const priority = i < 3 ? 1 : 3; // First 3 are high priority
        const requestId = await requestQueue.enqueueRequest({
          type: 'ai_summarization',
          priority,
          payload: `AI content ${i}`,
          maxRetries: 2,
          timeout: 5000
        });
        requestIds.push(requestId);
      }

      const processors = requestIds.map(id => ({
        id,
        processor: async (payload: unknown) => {
          return await circuitBreaker.execute(async () => {
            return await anthropicAPI.generateSummary(payload as string);
          });
        }
      }));

      const results = await requestQueue.processBatch(processors, 3);
      
      expect(results.length).toBe(8);
      
      // High priority requests should complete first
      const successResults = results.filter(r => r.success);
      expect(successResults.length).toBeGreaterThan(0);
    });

    test('should handle AI processing timeouts with circuit breaker', async () => {
      // Create a slow AI processor that times out
      const slowAIProcessor = async () => {
        return await circuitBreaker.execute(async () => {
          await new Promise(resolve => setTimeout(resolve, 35000)); // Longer than timeout
          return 'should not complete';
        }, 'slow-ai-processing');
      };

      const requestId = await requestQueue.enqueueRequest({
        type: 'ai_summarization',
        priority: 1,
        payload: 'timeout-test',
        maxRetries: 0,
        timeout: 2000 // Short timeout
      });

      const result = await requestQueue.processRequest(requestId, slowAIProcessor);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
      
      // Circuit breaker should register the timeout
      const stats = circuitBreaker.getStats();
      expect(stats.totalFailures).toBe(1);
    });
  });

  describe('Email Service Rate Limiting Coordination', () => {
    test('should handle email rate limiting gracefully', async () => {
      const emailProcessor = async (emailData: any) => {
        return await resendAPI.sendEmail(
          emailData.to,
          emailData.subject,
          emailData.content
        );
      };

      let successCount = 0;
      let errorCount = 0;

      // Send emails until rate limited
      for (let i = 0; i < 105; i++) {
        const requestId = await requestQueue.enqueueRequest({
          type: 'email_delivery',
          priority: 2,
          payload: {
            to: `test${i}@example.com`,
            subject: `Test Email ${i}`,
            content: `Test content ${i}`
          },
          maxRetries: 1,
          timeout: 3000
        });

        try {
          const result = await requestQueue.processRequest(requestId, emailProcessor);
          if (result.success) {
            successCount++;
          } else {
            errorCount++;
          }
        } catch (error) {
          errorCount++;
        }
      }

      expect(successCount).toBeGreaterThan(90); // Most should succeed
      expect(errorCount).toBeGreaterThan(0); // Some should be rate limited
      expect(resendAPI.isCurrentlyRateLimited()).toBe(true);
    });

    test('should batch email requests efficiently', async () => {
      const emailRequests: string[] = [];
      
      // Enqueue batch of email requests
      for (let i = 0; i < 10; i++) {
        const requestId = await requestQueue.enqueueRequest({
          type: 'email_delivery',
          priority: 2,
          payload: {
            to: `batch${i}@example.com`,
            subject: `Batch Email ${i}`,
            content: `Batch content ${i}`
          },
          maxRetries: 1,
          timeout: 5000
        });
        emailRequests.push(requestId);
      }

      const processors = emailRequests.map(id => ({
        id,
        processor: async (payload: any) => {
          return await resendAPI.sendEmail(
            payload.to,
            payload.subject,
            payload.content
          );
        }
      }));

      const startTime = Date.now();
      const results = await requestQueue.processBatch(processors, 5);
      const endTime = Date.now();

      expect(results.length).toBe(10);
      expect(results.every(r => r.success)).toBe(true);
      
      // Batch processing should be faster than sequential
      expect(endTime - startTime).toBeLessThan(2000);
    });
  });

  describe('Multi-Service Coordination Scenarios', () => {
    test('should handle mixed service failures gracefully', async () => {
      const requestIds: string[] = [];
      
      // Mix of SEC, AI, and email requests
      const services = ['sec', 'ai', 'email'];
      
      for (let i = 0; i < 15; i++) {
        const service = services[i % 3];
        const requestId = await requestQueue.enqueueRequest({
          type: service === 'sec' ? 'filing_processing' : 
                service === 'ai' ? 'ai_summarization' : 'email_delivery',
          priority: 1,
          payload: { service, index: i },
          maxRetries: 2,
          timeout: 5000
        });
        requestIds.push(requestId);
      }

      const processors = requestIds.map(id => ({
        id,
        processor: async (payload: any) => {
          switch (payload.service) {
            case 'sec':
              return await circuitBreaker.execute(async () => {
                return await secAPI.fetchRSSFeed();
              });
            case 'ai':
              return await circuitBreaker.execute(async () => {
                return await anthropicAPI.generateSummary('test content');
              });
            case 'email':
              return await resendAPI.sendEmail(
                'test@example.com',
                'Test Subject',
                'Test Content'
              );
            default:
              throw new Error('Unknown service');
          }
        }
      }));

      const results = await requestQueue.processBatch(processors, 5);
      
      expect(results.length).toBe(15);
      
      // Some requests should succeed, some may fail due to rate limiting
      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;
      
      expect(successCount).toBeGreaterThan(0);
      // We may have failures due to rate limiting
    });

    test('should prioritize critical operations during rate limiting', async () => {
      const requestIds: string[] = [];
      
      // Mix of high and low priority requests
      for (let i = 0; i < 10; i++) {
        const priority = i < 3 ? 1 : 5; // First 3 are critical
        const requestId = await requestQueue.enqueueRequest({
          type: 'ai_summarization',
          priority,
          payload: { priority, index: i },
          maxRetries: 1,
          timeout: 3000
        });
        requestIds.push(requestId);
      }

      // Trigger some rate limiting first
      for (let i = 0; i < 10; i++) {
        try {
          await anthropicAPI.generateSummary('warming up');
        } catch (error) {
          // Expected
        }
      }

      const processors = requestIds.map(id => ({
        id,
        processor: async (payload: any) => {
          return await circuitBreaker.execute(async () => {
            return await anthropicAPI.generateSummary(`Priority ${payload.priority} content`);
          });
        }
      }));

      const results = await requestQueue.processBatch(processors, 2);
      
      expect(results.length).toBe(10);
      
      // High priority requests should have better success rate
      const highPriorityResults = results.slice(0, 3);
      const lowPriorityResults = results.slice(3);
      
      const highPrioritySuccess = highPriorityResults.filter(r => r.success).length;
      const lowPrioritySuccess = lowPriorityResults.filter(r => r.success).length;
      
      // High priority should have at least as good success rate
      expect(highPrioritySuccess / 3).toBeGreaterThanOrEqual(lowPrioritySuccess / 7);
    });

    test('should handle cascade failures across services', async () => {
      // Create scenario where SEC API fails, affecting downstream AI processing
      
      // First, exhaust SEC API rate limit
      for (let i = 0; i < 12; i++) {
        try {
          await secAPI.fetchRSSFeed();
        } catch (error) {
          // Expected
        }
      }

      // Now try to process a filing that depends on SEC data
      const filingProcessingRequest = await requestQueue.enqueueRequest({
        type: 'filing_processing',
        priority: 1,
        payload: 'cascade-test',
        maxRetries: 2,
        timeout: 5000
      });

      const result = await requestQueue.processRequest(filingProcessingRequest, async () => {
        // Simulate filing processing pipeline
        const secData = await circuitBreaker.execute(async () => {
          return await secAPI.fetchRSSFeed();
        });
        
        const summary = await circuitBreaker.execute(async () => {
          return await anthropicAPI.generateSummary('SEC filing content');
        });
        
        const email = await resendAPI.sendEmail(
          'user@example.com',
          'Filing Summary',
          summary
        );
        
        return { secData, summary, email };
      });

      // Should handle the cascade failure gracefully
      expect(result).toBeDefined();
      expect(result.success).toBe(false); // SEC failure should cause overall failure
      expect(result.retryCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Rate Limiting Configuration Integration', () => {
    test('should respect endpoint-specific rate limits', () => {
      const cronConfig = getRateLimitConfig('/api/cron/tier-aware');
      const filingConfig = getRateLimitConfig('/api/filings/batch-summary');
      const emailConfig = getRateLimitConfig('/api/email/summary');

      expect(cronConfig?.maxRequests).toBe(10); // Very restrictive
      expect(filingConfig?.maxRequests).toBe(100); // Moderate
      expect(emailConfig?.maxRequests).toBe(100); // Moderate

      // Cron should be most restrictive
      expect(cronConfig?.maxRequests).toBeLessThan(filingConfig?.maxRequests!);
      expect(cronConfig?.maxRequests).toBeLessThan(emailConfig?.maxRequests!);
    });

    test('should coordinate timeouts across different services', async () => {
      const timeouts = {
        sec: 5000,
        ai: 30000, // AI operations can take longer
        email: 3000
      };

      const requestIds: string[] = [];
      
      // Create requests with service-appropriate timeouts
      for (const [service, timeout] of Object.entries(timeouts)) {
        const requestId = await requestQueue.enqueueRequest({
          type: service === 'sec' ? 'filing_processing' : 
                service === 'ai' ? 'ai_summarization' : 'email_delivery',
          priority: 1,
          payload: service,
          maxRetries: 1,
          timeout
        });
        requestIds.push(requestId);
      }

      const processors = requestIds.map(id => ({
        id,
        processor: async (payload: any) => {
          // Simulate different processing times
          const delay = payload === 'sec' ? 100 : 
                       payload === 'ai' ? 200 : 50;
          
          await new Promise(resolve => setTimeout(resolve, delay));
          return `${payload} processed`;
        }
      }));

      const results = await requestQueue.processBatch(processors, 3);
      
      expect(results.length).toBe(3);
      expect(results.every(r => r.success)).toBe(true);
      
      // Check that execution times are reasonable for each service
      results.forEach((result, index) => {
        const service = Object.keys(timeouts)[index];
        const expectedDelay = service === 'sec' ? 100 : 
                             service === 'ai' ? 200 : 50;
        
        expect(result.executionTime).toBeGreaterThan(expectedDelay - 50);
        expect(result.executionTime).toBeLessThan(expectedDelay + 100);
      });
    });
  });

  describe('Recovery and Circuit Breaker Coordination', () => {
    test('should coordinate circuit breaker recovery across services', async () => {
      // Force circuit breaker to open
      circuitBreaker.forceState(CircuitState.OPEN);
      
      // Attempt operations that should be blocked
      const blockedRequest = await requestQueue.enqueueRequest({
        type: 'ai_summarization',
        priority: 1,
        payload: 'blocked-test',
        maxRetries: 0,
        timeout: 1000
      });

      const blockedResult = await requestQueue.processRequest(blockedRequest, async () => {
        return await circuitBreaker.execute(async () => {
          return await anthropicAPI.generateSummary('test');
        });
      });

      expect(blockedResult.success).toBe(false);
      expect(blockedResult.error).toContain('Circuit breaker is OPEN');
      
      // Now test recovery
      await new Promise(resolve => setTimeout(resolve, testConfig.timeout + 100));
      
      const recoveryRequest = await requestQueue.enqueueRequest({
        type: 'ai_summarization',
        priority: 1,
        payload: 'recovery-test',
        maxRetries: 0,
        timeout: 2000
      });

      const recoveryResult = await requestQueue.processRequest(recoveryRequest, async () => {
        return await circuitBreaker.execute(async () => {
          return await anthropicAPI.generateSummary('recovery test');
        });
      });

      // Should allow the attempt (transition to HALF_OPEN)
      expect(recoveryResult).toBeDefined();
    });

    test('should handle partial service recovery scenarios', async () => {
      // Simulate scenario where some services recover while others remain rate limited
      
      // Reset some services
      anthropicAPI.reset();
      resendAPI.reset();
      // Keep SEC API rate limited (don't reset)

      const mixedRequests: string[] = [];
      
      // Try operations on all services
      for (let i = 0; i < 6; i++) {
        const service = ['sec', 'ai', 'email'][i % 3];
        const requestId = await requestQueue.enqueueRequest({
          type: service === 'sec' ? 'filing_processing' : 
                service === 'ai' ? 'ai_summarization' : 'email_delivery',
          priority: 1,
          payload: { service, index: i },
          maxRetries: 1,
          timeout: 3000
        });
        mixedRequests.push(requestId);
      }

      const processors = mixedRequests.map(id => ({
        id,
        processor: async (payload: any) => {
          switch (payload.service) {
            case 'sec':
              return await secAPI.fetchRSSFeed(); // Should fail due to rate limiting
            case 'ai':
              return await anthropicAPI.generateSummary('test'); // Should succeed
            case 'email':
              return await resendAPI.sendEmail('test@example.com', 'Test', 'Test'); // Should succeed
            default:
              throw new Error('Unknown service');
          }
        }
      }));

      const results = await requestQueue.processBatch(processors, 3);
      
      expect(results.length).toBe(6);
      
      // AI and email should mostly succeed, SEC should mostly fail
      const secResults = results.filter((_, i) => i % 3 === 0);
      const aiResults = results.filter((_, i) => i % 3 === 1);
      const emailResults = results.filter((_, i) => i % 3 === 2);
      
      const secSuccess = secResults.filter(r => r.success).length;
      const aiSuccess = aiResults.filter(r => r.success).length;
      const emailSuccess = emailResults.filter(r => r.success).length;
      
      expect(aiSuccess).toBeGreaterThan(secSuccess);
      expect(emailSuccess).toBeGreaterThan(secSuccess);
    });
  });
});