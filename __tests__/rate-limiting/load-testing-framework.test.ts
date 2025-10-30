/**
 * Load Testing Framework for Rate Limiting Infrastructure
 * 
 * Tests system behavior under various load conditions, simulates 429 errors,
 * measures performance impact, and validates graceful degradation.
 */

import { 
  AIProcessingCircuitBreaker, 
  CircuitState 
} from '../../lib/infrastructure/circuit-breaker';
import { 
  InfrastructureRequestQueue 
} from '../../lib/infrastructure/request-queue';

// Performance metrics collection
interface LoadTestMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
  throughputRPS: number;
  errorRate: number;
  circuitBreakerActivations: number;
  queueDepthMax: number;
  memoryUsageMB: number;
  cpuUsagePercent: number;
}

class LoadTestFramework {
  private metrics: LoadTestMetrics;
  private responseTimes: number[] = [];
  private startTime: number = 0;
  private endTime: number = 0;
  private circuitBreaker: AIProcessingCircuitBreaker;
  private requestQueue: InfrastructureRequestQueue;

  constructor() {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      throughputRPS: 0,
      errorRate: 0,
      circuitBreakerActivations: 0,
      queueDepthMax: 0,
      memoryUsageMB: 0,
      cpuUsagePercent: 0
    };

    this.circuitBreaker = new AIProcessingCircuitBreaker({
      failureThreshold: 5,
      successThreshold: 3,
      timeout: 2000,
      monitoringWindow: 10000,
      volumeThreshold: 10
    });

    this.requestQueue = new InfrastructureRequestQueue();
  }

  async runLoadTest(
    requestGenerator: () => Promise<any>,
    concurrentUsers: number,
    testDurationMs: number,
    requestsPerSecond: number
  ): Promise<LoadTestMetrics> {
    this.resetMetrics();
    this.startTime = Date.now();

    console.log(`Starting load test: ${concurrentUsers} users, ${testDurationMs}ms duration, ${requestsPerSecond} RPS`);

    // Start concurrent user sessions
    const userPromises = Array.from({ length: concurrentUsers }, (_, userIndex) => 
      this.simulateUser(userIndex, requestGenerator, testDurationMs, requestsPerSecond / concurrentUsers)
    );

    // Monitor system metrics during test
    const monitoringPromise = this.monitorSystemMetrics(testDurationMs);

    // Wait for all users to complete
    await Promise.allSettled([...userPromises, monitoringPromise]);

    this.endTime = Date.now();
    this.calculateFinalMetrics();

    console.log('Load test completed');
    return this.metrics;
  }

  private async simulateUser(
    userIndex: number,
    requestGenerator: () => Promise<any>,
    testDurationMs: number,
    userRPS: number
  ): Promise<void> {
    const userStartTime = Date.now();
    const requestInterval = 1000 / userRPS; // ms between requests
    let requestCount = 0;

    while (Date.now() - userStartTime < testDurationMs) {
      const requestStart = Date.now();

      try {
        await this.executeRequest(requestGenerator, `user-${userIndex}-req-${requestCount}`);
        this.metrics.successfulRequests++;
      } catch (error) {
        this.metrics.failedRequests++;
      }

      this.metrics.totalRequests++;
      this.responseTimes.push(Date.now() - requestStart);
      requestCount++;

      // Wait for next request interval
      const elapsed = Date.now() - requestStart;
      const waitTime = Math.max(0, requestInterval - elapsed);
      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  private async executeRequest(requestGenerator: () => Promise<any>, requestId: string): Promise<any> {
    // Enqueue request through infrastructure
    const queuedRequestId = await this.requestQueue.enqueueRequest({
      type: 'filing_processing',
      priority: Math.floor(Math.random() * 3) + 1, // Random priority 1-3
      payload: { requestId },
      maxRetries: 3,
      timeout: 10000
    });

    // Process through circuit breaker
    return await this.requestQueue.processRequest(queuedRequestId, async () => {
      return await this.circuitBreaker.execute(async () => {
        return await requestGenerator();
      }, requestId);
    });
  }

  private async monitorSystemMetrics(testDurationMs: number): Promise<void> {
    const monitorInterval = 1000; // Check every second
    const endTime = Date.now() + testDurationMs;

    while (Date.now() < endTime) {
      // Monitor queue depth
      const queueStats = this.requestQueue.getQueueStats();
      this.metrics.queueDepthMax = Math.max(this.metrics.queueDepthMax, queueStats.activeRequests);

      // Monitor circuit breaker state
      const circuitStats = this.circuitBreaker.getStats();
      if (circuitStats.state === CircuitState.OPEN) {
        this.metrics.circuitBreakerActivations++;
      }

      // Monitor memory usage (basic estimation)
      if (typeof process !== 'undefined' && process.memoryUsage) {
        const memUsage = process.memoryUsage();
        this.metrics.memoryUsageMB = Math.max(this.metrics.memoryUsageMB, memUsage.heapUsed / 1024 / 1024);
      }

      await new Promise(resolve => setTimeout(resolve, monitorInterval));
    }
  }

  private calculateFinalMetrics(): void {
    const testDurationSeconds = (this.endTime - this.startTime) / 1000;

    // Calculate response time metrics
    this.responseTimes.sort((a, b) => a - b);
    this.metrics.averageResponseTime = this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;
    
    const p95Index = Math.floor(this.responseTimes.length * 0.95);
    const p99Index = Math.floor(this.responseTimes.length * 0.99);
    this.metrics.p95ResponseTime = this.responseTimes[p95Index] || 0;
    this.metrics.p99ResponseTime = this.responseTimes[p99Index] || 0;

    // Calculate throughput
    this.metrics.throughputRPS = this.metrics.totalRequests / testDurationSeconds;

    // Calculate error rate
    this.metrics.errorRate = (this.metrics.failedRequests / this.metrics.totalRequests) * 100;
  }

  private resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      throughputRPS: 0,
      errorRate: 0,
      circuitBreakerActivations: 0,
      queueDepthMax: 0,
      memoryUsageMB: 0,
      cpuUsagePercent: 0
    };
    this.responseTimes = [];
  }

  async shutdown(): Promise<void> {
    await this.requestQueue.shutdown();
    this.circuitBreaker.reset();
  }
}

// Mock services for load testing
class Mock429API {
  private requestCount = 0;
  private rate429Threshold: number;
  private recoveryInterval: number;

  constructor(rate429Threshold: number = 50, recoveryInterval: number = 30000) {
    this.rate429Threshold = rate429Threshold;
    this.recoveryInterval = recoveryInterval;
  }

  async processRequest(): Promise<string> {
    this.requestCount++;

    // Simulate rate limiting
    if (this.requestCount > this.rate429Threshold) {
      // Reset periodically to simulate recovery
      if (this.requestCount % (this.rate429Threshold * 2) === 0) {
        this.requestCount = 0;
      }
      
      const error = new Error('429 Too Many Requests');
      (error as any).status = 429;
      throw error;
    }

    // Simulate processing time with some variance
    const processingTime = 50 + Math.random() * 100; // 50-150ms
    await new Promise(resolve => setTimeout(resolve, processingTime));

    return `Processed request ${this.requestCount}`;
  }

  reset(): void {
    this.requestCount = 0;
  }
}

class MockTimeoutAPI {
  private requestCount = 0;
  private timeoutProbability: number;

  constructor(timeoutProbability: number = 0.1) {
    this.timeoutProbability = timeoutProbability;
  }

  async processRequest(): Promise<string> {
    this.requestCount++;

    // Simulate random timeouts
    if (Math.random() < this.timeoutProbability) {
      await new Promise(resolve => setTimeout(resolve, 35000)); // Long timeout
      return 'Should not reach here';
    }

    // Normal processing
    const processingTime = 100 + Math.random() * 200; // 100-300ms
    await new Promise(resolve => setTimeout(resolve, processingTime));

    return `Processed request ${this.requestCount}`;
  }

  reset(): void {
    this.requestCount = 0;
  }
}

class MockVariableLatencyAPI {
  private requestCount = 0;
  private latencySpikes: boolean = false;

  async processRequest(): Promise<string> {
    this.requestCount++;

    // Toggle latency spikes every 100 requests
    if (this.requestCount % 100 === 0) {
      this.latencySpikes = !this.latencySpikes;
    }

    let processingTime: number;
    if (this.latencySpikes) {
      // High latency period
      processingTime = 500 + Math.random() * 1000; // 500-1500ms
    } else {
      // Normal latency
      processingTime = 50 + Math.random() * 100; // 50-150ms
    }

    await new Promise(resolve => setTimeout(resolve, processingTime));
    return `Processed request ${this.requestCount}`;
  }

  reset(): void {
    this.requestCount = 0;
    this.latencySpikes = false;
  }
}

describe('Load Testing Framework for Rate Limiting', () => {
  let loadTester: LoadTestFramework;

  beforeEach(() => {
    loadTester = new LoadTestFramework();
  });

  afterEach(async () => {
    await loadTester.shutdown();
  });

  describe('429 Error Simulation Tests', () => {
    test('should handle sustained 429 errors gracefully', async () => {
      const mock429API = new Mock429API(20, 15000); // Rate limit after 20 requests
      
      const requestGenerator = () => mock429API.processRequest();
      
      const metrics = await loadTester.runLoadTest(
        requestGenerator,
        5, // 5 concurrent users
        10000, // 10 second test
        10 // 10 RPS
      );

      expect(metrics.totalRequests).toBeGreaterThan(0);
      expect(metrics.errorRate).toBeGreaterThan(0); // Should have some 429 errors
      expect(metrics.errorRate).toBeLessThan(80); // But not everything should fail
      expect(metrics.circuitBreakerActivations).toBeGreaterThan(0);
      
      console.log('429 Error Test Metrics:', metrics);
    });

    test('should recover from 429 errors when API recovers', async () => {
      const mock429API = new Mock429API(15, 5000); // Faster recovery
      
      const requestGenerator = () => mock429API.processRequest();
      
      const metrics = await loadTester.runLoadTest(
        requestGenerator,
        3, // 3 concurrent users
        15000, // 15 second test (longer to see recovery)
        8 // 8 RPS
      );

      expect(metrics.totalRequests).toBeGreaterThan(50);
      expect(metrics.successfulRequests).toBeGreaterThan(0);
      expect(metrics.errorRate).toBeLessThan(90); // Should recover and have some successes
      
      console.log('429 Recovery Test Metrics:', metrics);
    });

    test('should maintain system stability under heavy 429 load', async () => {
      const mock429API = new Mock429API(10, 20000); // Very aggressive rate limiting
      
      const requestGenerator = () => mock429API.processRequest();
      
      const metrics = await loadTester.runLoadTest(
        requestGenerator,
        10, // 10 concurrent users
        8000, // 8 second test
        20 // 20 RPS
      );

      // System should remain stable even under heavy rate limiting
      expect(metrics.totalRequests).toBeGreaterThan(0);
      expect(metrics.averageResponseTime).toBeLessThan(5000); // Should not hang
      expect(metrics.queueDepthMax).toBeLessThan(50); // Queue should not grow unbounded
      
      console.log('Heavy 429 Load Test Metrics:', metrics);
    });
  });

  describe('Timeout and Latency Tests', () => {
    test('should handle timeout scenarios gracefully', async () => {
      const mockTimeoutAPI = new MockTimeoutAPI(0.2); // 20% timeout rate
      
      const requestGenerator = () => mockTimeoutAPI.processRequest();
      
      const metrics = await loadTester.runLoadTest(
        requestGenerator,
        3, // 3 concurrent users
        8000, // 8 second test
        5 // 5 RPS
      );

      expect(metrics.totalRequests).toBeGreaterThan(0);
      expect(metrics.errorRate).toBeGreaterThan(10); // Should have timeouts
      expect(metrics.circuitBreakerActivations).toBeGreaterThan(0);
      expect(metrics.p99ResponseTime).toBeLessThan(12000); // Should timeout before 12s
      
      console.log('Timeout Test Metrics:', metrics);
    });

    test('should handle variable latency spikes', async () => {
      const mockVariableAPI = new MockVariableLatencyAPI();
      
      const requestGenerator = () => mockVariableAPI.processRequest();
      
      const metrics = await loadTester.runLoadTest(
        requestGenerator,
        4, // 4 concurrent users
        12000, // 12 second test
        8 // 8 RPS
      );

      expect(metrics.totalRequests).toBeGreaterThan(50);
      expect(metrics.p95ResponseTime).toBeGreaterThan(200); // Should see some latency spikes
      expect(metrics.p99ResponseTime).toBeGreaterThan(metrics.averageResponseTime * 2); // High variance
      
      console.log('Variable Latency Test Metrics:', metrics);
    });
  });

  describe('Concurrent Load Tests', () => {
    test('should handle high concurrency without deadlocks', async () => {
      const fastAPI = {
        requestCount: 0,
        async processRequest() {
          this.requestCount++;
          await new Promise(resolve => setTimeout(resolve, 10 + Math.random() * 20)); // 10-30ms
          return `Fast response ${this.requestCount}`;
        }
      };
      
      const requestGenerator = () => fastAPI.processRequest();
      
      const metrics = await loadTester.runLoadTest(
        requestGenerator,
        20, // 20 concurrent users
        5000, // 5 second test
        50 // 50 RPS
      );

      expect(metrics.totalRequests).toBeGreaterThan(200);
      expect(metrics.successfulRequests).toBeGreaterThan(180);
      expect(metrics.errorRate).toBeLessThan(10);
      expect(metrics.averageResponseTime).toBeLessThan(100);
      expect(metrics.throughputRPS).toBeGreaterThan(30);
      
      console.log('High Concurrency Test Metrics:', metrics);
    });

    test('should prioritize requests under load', async () => {
      const priorityAPI = {
        requestCount: 0,
        async processRequest() {
          this.requestCount++;
          
          // Simulate some requests being slower (simulating lower priority)
          const isSlowRequest = this.requestCount % 3 === 0;
          const processingTime = isSlowRequest ? 200 : 50;
          
          await new Promise(resolve => setTimeout(resolve, processingTime));
          return `Priority response ${this.requestCount}`;
        }
      };
      
      const requestGenerator = () => priorityAPI.processRequest();
      
      const metrics = await loadTester.runLoadTest(
        requestGenerator,
        8, // 8 concurrent users
        6000, // 6 second test
        15 // 15 RPS
      );

      expect(metrics.totalRequests).toBeGreaterThan(60);
      expect(metrics.successfulRequests).toBeGreaterThan(50);
      expect(metrics.p95ResponseTime).toBeLessThan(500); // Even slow requests should complete
      
      console.log('Priority Test Metrics:', metrics);
    });
  });

  describe('Memory and Resource Tests', () => {
    test('should not leak memory under sustained load', async () => {
      const memoryAPI = {
        data: new Map<number, string>(),
        requestCount: 0,
        async processRequest() {
          this.requestCount++;
          
          // Create some data (simulating processing overhead)
          const data = 'x'.repeat(1000); // 1KB per request
          this.data.set(this.requestCount, data);
          
          // Clean up old data to prevent unbounded growth
          if (this.data.size > 100) {
            const oldKey = this.requestCount - 100;
            this.data.delete(oldKey);
          }
          
          await new Promise(resolve => setTimeout(resolve, 50));
          return `Memory test ${this.requestCount}`;
        }
      };
      
      const requestGenerator = () => memoryAPI.processRequest();
      
      const metrics = await loadTester.runLoadTest(
        requestGenerator,
        6, // 6 concurrent users
        8000, // 8 second test
        12 // 12 RPS
      );

      expect(metrics.totalRequests).toBeGreaterThan(80);
      expect(metrics.memoryUsageMB).toBeLessThan(100); // Should not use excessive memory
      expect(metrics.queueDepthMax).toBeLessThan(20); // Queue should not grow unbounded
      
      console.log('Memory Test Metrics:', metrics);
    });

    test('should handle queue overflow gracefully', async () => {
      const slowAPI = {
        requestCount: 0,
        async processRequest() {
          this.requestCount++;
          
          // Very slow processing to back up the queue
          await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 500)); // 500-1000ms
          return `Slow response ${this.requestCount}`;
        }
      };
      
      const requestGenerator = () => slowAPI.processRequest();
      
      const metrics = await loadTester.runLoadTest(
        requestGenerator,
        15, // 15 concurrent users
        5000, // 5 second test
        25 // 25 RPS (higher than processing capacity)
      );

      expect(metrics.totalRequests).toBeGreaterThan(50);
      expect(metrics.queueDepthMax).toBeGreaterThan(10); // Queue should build up
      expect(metrics.errorRate).toBeLessThan(50); // Should handle gracefully, not catastrophically fail
      
      console.log('Queue Overflow Test Metrics:', metrics);
    });
  });

  describe('Mixed Failure Scenarios', () => {
    test('should handle mixed 429 and timeout failures', async () => {
      const mixedFailureAPI = {
        requestCount: 0,
        async processRequest() {
          this.requestCount++;
          
          // 429 errors after 30 requests
          if (this.requestCount > 30 && this.requestCount % 50 < 30) {
            throw new Error('429 Too Many Requests');
          }
          
          // Random timeouts (5% chance)
          if (Math.random() < 0.05) {
            await new Promise(resolve => setTimeout(resolve, 35000)); // Long timeout
          }
          
          // Variable processing time
          const processingTime = 50 + Math.random() * 150;
          await new Promise(resolve => setTimeout(resolve, processingTime));
          
          return `Mixed failure response ${this.requestCount}`;
        }
      };
      
      const requestGenerator = () => mixedFailureAPI.processRequest();
      
      const metrics = await loadTester.runLoadTest(
        requestGenerator,
        8, // 8 concurrent users
        10000, // 10 second test
        12 // 12 RPS
      );

      expect(metrics.totalRequests).toBeGreaterThan(80);
      expect(metrics.errorRate).toBeGreaterThan(20); // Should have mixed failures
      expect(metrics.errorRate).toBeLessThan(70); // But not everything should fail
      expect(metrics.circuitBreakerActivations).toBeGreaterThan(0);
      expect(metrics.successfulRequests).toBeGreaterThan(20); // Some should succeed
      
      console.log('Mixed Failure Test Metrics:', metrics);
    });

    test('should demonstrate graceful degradation', async () => {
      const degradationAPI = {
        requestCount: 0,
        phase: 'normal' as 'normal' | 'degraded' | 'failing',
        
        async processRequest() {
          this.requestCount++;
          
          // Change phases based on request count
          if (this.requestCount < 30) {
            this.phase = 'normal';
          } else if (this.requestCount < 60) {
            this.phase = 'degraded';
          } else {
            this.phase = 'failing';
          }
          
          switch (this.phase) {
            case 'normal':
              await new Promise(resolve => setTimeout(resolve, 50));
              return `Normal response ${this.requestCount}`;
              
            case 'degraded':
              if (Math.random() < 0.3) {
                throw new Error('429 Too Many Requests');
              }
              await new Promise(resolve => setTimeout(resolve, 200));
              return `Degraded response ${this.requestCount}`;
              
            case 'failing':
              if (Math.random() < 0.7) {
                throw new Error('Service unavailable');
              }
              await new Promise(resolve => setTimeout(resolve, 500));
              return `Failing response ${this.requestCount}`;
          }
        }
      };
      
      const requestGenerator = () => degradationAPI.processRequest();
      
      const metrics = await loadTester.runLoadTest(
        requestGenerator,
        6, // 6 concurrent users
        12000, // 12 second test
        10 // 10 RPS
      );

      expect(metrics.totalRequests).toBeGreaterThan(100);
      expect(metrics.errorRate).toBeGreaterThan(30); // Should increase over time
      expect(metrics.circuitBreakerActivations).toBeGreaterThan(0);
      
      // System should still function, not completely crash
      expect(metrics.successfulRequests).toBeGreaterThan(20);
      expect(metrics.averageResponseTime).toBeLessThan(2000);
      
      console.log('Graceful Degradation Test Metrics:', metrics);
    });
  });

  describe('Performance Benchmarks', () => {
    test('should meet performance targets under normal load', async () => {
      const benchmarkAPI = {
        requestCount: 0,
        async processRequest() {
          this.requestCount++;
          
          // Consistent processing time
          await new Promise(resolve => setTimeout(resolve, 75)); // 75ms
          return `Benchmark response ${this.requestCount}`;
        }
      };
      
      const requestGenerator = () => benchmarkAPI.processRequest();
      
      const metrics = await loadTester.runLoadTest(
        requestGenerator,
        10, // 10 concurrent users
        6000, // 6 second test
        20 // 20 RPS
      );

      // Performance targets
      expect(metrics.throughputRPS).toBeGreaterThan(15); // At least 15 RPS
      expect(metrics.averageResponseTime).toBeLessThan(200); // Under 200ms average
      expect(metrics.p95ResponseTime).toBeLessThan(500); // Under 500ms for 95th percentile
      expect(metrics.errorRate).toBeLessThan(5); // Under 5% error rate
      expect(metrics.queueDepthMax).toBeLessThan(15); // Reasonable queue depth
      
      console.log('Performance Benchmark Metrics:', metrics);
    });

    test('should maintain stability under stress conditions', async () => {
      const stressAPI = {
        requestCount: 0,
        async processRequest() {
          this.requestCount++;
          
          // Varying load to stress test
          const processingTime = 25 + Math.random() * 100; // 25-125ms
          
          // Occasional spike
          if (Math.random() < 0.1) {
            await new Promise(resolve => setTimeout(resolve, 300));
          } else {
            await new Promise(resolve => setTimeout(resolve, processingTime));
          }
          
          return `Stress response ${this.requestCount}`;
        }
      };
      
      const requestGenerator = () => stressAPI.processRequest();
      
      const metrics = await loadTester.runLoadTest(
        requestGenerator,
        25, // 25 concurrent users (high load)
        8000, // 8 second test
        40 // 40 RPS (high throughput)
      );

      // Stress test targets - more lenient but still stable
      expect(metrics.totalRequests).toBeGreaterThan(200);
      expect(metrics.errorRate).toBeLessThan(15); // Under 15% error rate under stress
      expect(metrics.averageResponseTime).toBeLessThan(1000); // Under 1s average
      expect(metrics.queueDepthMax).toBeLessThan(50); // Queue should not explode
      
      console.log('Stress Test Metrics:', metrics);
    });
  });
});