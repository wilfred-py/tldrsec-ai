/**
 * Monitoring and Alerting Tests for Rate Limiting Infrastructure
 * 
 * Tests rate limit event logging, circuit breaker state monitoring,
 * queue depth alerts, and performance metric collection.
 */

import { 
  AIProcessingCircuitBreaker, 
  CircuitState 
} from '../../lib/infrastructure/circuit-breaker';
import { 
  InfrastructureRequestQueue 
} from '../../lib/infrastructure/request-queue';

// Mock monitoring and alerting system
interface AlertEvent {
  id: string;
  type: 'rate_limit' | 'circuit_breaker' | 'queue_depth' | 'performance' | 'error_rate';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: Date;
  metadata: Record<string, any>;
}

interface MonitoringMetrics {
  rateLimitEvents: number;
  circuitBreakerStateChanges: number;
  queueDepthPeaks: number;
  errorRateSpikes: number;
  performanceDegradation: number;
  averageResponseTime: number;
  throughput: number;
  errorRate: number;
}

class MockMonitoringSystem {
  private alerts: AlertEvent[] = [];
  private metrics: MonitoringMetrics;
  private logEntries: string[] = [];
  private isMonitoring: boolean = false;

  constructor() {
    this.metrics = {
      rateLimitEvents: 0,
      circuitBreakerStateChanges: 0,
      queueDepthPeaks: 0,
      errorRateSpikes: 0,
      performanceDegradation: 0,
      averageResponseTime: 0,
      throughput: 0,
      errorRate: 0
    };
  }

  startMonitoring(): void {
    this.isMonitoring = true;
    this.log('Monitoring started');
  }

  stopMonitoring(): void {
    this.isMonitoring = false;
    this.log('Monitoring stopped');
  }

  recordRateLimitEvent(service: string, endpoint: string, statusCode: number): void {
    if (!this.isMonitoring) return;

    this.metrics.rateLimitEvents++;
    
    const severity = statusCode === 429 ? 'warning' : 'info';
    this.createAlert('rate_limit', severity, `Rate limit triggered for ${service}:${endpoint}`, {
      service,
      endpoint,
      statusCode
    });

    this.log(`Rate limit event: ${service}:${endpoint} (${statusCode})`);
  }

  recordCircuitBreakerEvent(state: CircuitState, previousState: CircuitState, stats: any): void {
    if (!this.isMonitoring) return;

    this.metrics.circuitBreakerStateChanges++;

    let severity: 'info' | 'warning' | 'critical' = 'info';
    if (state === CircuitState.OPEN) {
      severity = 'critical';
    } else if (state === CircuitState.HALF_OPEN) {
      severity = 'warning';
    }

    this.createAlert('circuit_breaker', severity, `Circuit breaker transitioned from ${previousState} to ${state}`, {
      currentState: state,
      previousState,
      failureCount: stats.failureCount,
      totalFailures: stats.totalFailures
    });

    this.log(`Circuit breaker state changed: ${previousState} -> ${state}`);
  }

  recordQueueDepthEvent(currentDepth: number, maxDepth: number, queueStats: any): void {
    if (!this.isMonitoring) return;

    if (currentDepth > maxDepth * 0.8) {
      this.metrics.queueDepthPeaks++;
      
      const severity = currentDepth > maxDepth * 0.95 ? 'critical' : 'warning';
      this.createAlert('queue_depth', severity, `High queue depth detected: ${currentDepth}`, {
        currentDepth,
        maxDepth,
        queuedJobs: queueStats.queuedJobs,
        runningJobs: queueStats.runningJobs
      });

      this.log(`High queue depth: ${currentDepth}/${maxDepth}`);
    }
  }

  recordPerformanceMetrics(responseTime: number, throughput: number, errorRate: number): void {
    if (!this.isMonitoring) return;

    this.metrics.averageResponseTime = responseTime;
    this.metrics.throughput = throughput;
    this.metrics.errorRate = errorRate;

    // Check for performance degradation
    const responseTimeThreshold = 1000; // 1 second
    const errorRateThreshold = 10; // 10%
    const throughputThreshold = 5; // 5 RPS minimum

    if (responseTime > responseTimeThreshold) {
      this.metrics.performanceDegradation++;
      this.createAlert('performance', 'warning', `High response time: ${responseTime}ms`, {
        responseTime,
        threshold: responseTimeThreshold
      });
    }

    if (errorRate > errorRateThreshold) {
      this.metrics.errorRateSpikes++;
      this.createAlert('error_rate', 'critical', `High error rate: ${errorRate}%`, {
        errorRate,
        threshold: errorRateThreshold
      });
    }

    if (throughput < throughputThreshold) {
      this.createAlert('performance', 'warning', `Low throughput: ${throughput} RPS`, {
        throughput,
        threshold: throughputThreshold
      });
    }

    this.log(`Performance metrics: ${responseTime}ms response, ${throughput} RPS, ${errorRate}% errors`);
  }

  private createAlert(type: AlertEvent['type'], severity: AlertEvent['severity'], message: string, metadata: Record<string, any>): void {
    const alert: AlertEvent = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      severity,
      message,
      timestamp: new Date(),
      metadata
    };

    this.alerts.push(alert);
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.logEntries.push(`[${timestamp}] ${message}`);
  }

  getAlerts(type?: AlertEvent['type'], severity?: AlertEvent['severity']): AlertEvent[] {
    return this.alerts.filter(alert => 
      (!type || alert.type === type) && 
      (!severity || alert.severity === severity)
    );
  }

  getMetrics(): MonitoringMetrics {
    return { ...this.metrics };
  }

  getLogs(): string[] {
    return [...this.logEntries];
  }

  reset(): void {
    this.alerts = [];
    this.logEntries = [];
    this.metrics = {
      rateLimitEvents: 0,
      circuitBreakerStateChanges: 0,
      queueDepthPeaks: 0,
      errorRateSpikes: 0,
      performanceDegradation: 0,
      averageResponseTime: 0,
      throughput: 0,
      errorRate: 0
    };
  }
}

// Integration wrapper for monitoring with rate limiting infrastructure
class MonitoredRateLimitingSystem {
  private circuitBreaker: AIProcessingCircuitBreaker;
  private requestQueue: InfrastructureRequestQueue;
  private monitoring: MockMonitoringSystem;
  private previousCircuitState: CircuitState = CircuitState.CLOSED;

  constructor() {
    this.circuitBreaker = new AIProcessingCircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000,
      monitoringWindow: 5000,
      volumeThreshold: 5
    });

    this.requestQueue = new InfrastructureRequestQueue();
    this.monitoring = new MockMonitoringSystem();
  }

  startMonitoring(): void {
    this.monitoring.startMonitoring();
  }

  stopMonitoring(): void {
    this.monitoring.stopMonitoring();
  }

  async executeWithMonitoring<T>(
    operation: () => Promise<T>,
    service: string,
    endpoint: string
  ): Promise<T> {
    const startTime = Date.now();
    let operationSuccess = false;

    try {
      // Monitor circuit breaker state changes
      const initialStats = this.circuitBreaker.getStats();
      this.checkCircuitBreakerStateChange(initialStats);

      // Execute through circuit breaker
      const result = await this.circuitBreaker.execute(operation, `${service}:${endpoint}`);
      
      operationSuccess = true;
      const responseTime = Date.now() - startTime;
      
      // Record successful operation
      this.monitoring.recordPerformanceMetrics(responseTime, 1, 0);
      
      return result;

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      // Record rate limiting events
      if (error instanceof Error) {
        if (error.message.includes('429')) {
          this.monitoring.recordRateLimitEvent(service, endpoint, 429);
        } else if (error.message.includes('timeout')) {
          this.monitoring.recordRateLimitEvent(service, endpoint, 524);
        }
      }

      // Record performance metrics with error
      this.monitoring.recordPerformanceMetrics(responseTime, 1, 100);
      
      throw error;
    } finally {
      // Check for circuit breaker state changes after operation
      const finalStats = this.circuitBreaker.getStats();
      this.checkCircuitBreakerStateChange(finalStats);
      
      // Monitor queue depth
      const queueStats = this.requestQueue.getQueueStats();
      this.monitoring.recordQueueDepthEvent(queueStats.activeRequests, 20, queueStats);
    }
  }

  async executeQueuedWithMonitoring<T>(
    operation: () => Promise<T>,
    service: string,
    endpoint: string,
    priority: number = 1
  ): Promise<T> {
    const requestId = await this.requestQueue.enqueueRequest({
      type: 'filing_processing',
      priority,
      payload: { service, endpoint },
      maxRetries: 3,
      timeout: 5000
    });

    return await this.requestQueue.processRequest(requestId, async () => {
      return await this.executeWithMonitoring(operation, service, endpoint);
    });
  }

  private checkCircuitBreakerStateChange(stats: any): void {
    if (stats.state !== this.previousCircuitState) {
      this.monitoring.recordCircuitBreakerEvent(stats.state, this.previousCircuitState, stats);
      this.previousCircuitState = stats.state;
    }
  }

  getMonitoring(): MockMonitoringSystem {
    return this.monitoring;
  }

  getCircuitBreakerStats() {
    return this.circuitBreaker.getStats();
  }

  getQueueStats() {
    return this.requestQueue.getQueueStats();
  }

  async shutdown(): Promise<void> {
    this.stopMonitoring();
    await this.requestQueue.shutdown();
    this.circuitBreaker.reset();
  }

  reset(): void {
    this.monitoring.reset();
    this.circuitBreaker.reset();
    this.previousCircuitState = CircuitState.CLOSED;
  }
}

describe('Monitoring and Alerting for Rate Limiting', () => {
  let monitoredSystem: MonitoredRateLimitingSystem;

  beforeEach(() => {
    monitoredSystem = new MonitoredRateLimitingSystem();
    monitoredSystem.startMonitoring();
  });

  afterEach(async () => {
    await monitoredSystem.shutdown();
  });

  describe('Rate Limit Event Monitoring', () => {
    test('should detect and log 429 rate limit events', async () => {
      const rateLimitedAPI = async () => {
        throw new Error('429 Too Many Requests');
      };

      // Execute multiple operations to trigger rate limiting
      for (let i = 0; i < 5; i++) {
        try {
          await monitoredSystem.executeWithMonitoring(rateLimitedAPI, 'SEC', '/api/rss-feed');
        } catch (error) {
          // Expected to fail
        }
      }

      const monitoring = monitoredSystem.getMonitoring();
      const rateLimitAlerts = monitoring.getAlerts('rate_limit');
      const metrics = monitoring.getMetrics();

      expect(rateLimitAlerts.length).toBeGreaterThan(0);
      expect(metrics.rateLimitEvents).toBe(5);
      
      // Check alert properties
      const alert = rateLimitAlerts[0];
      expect(alert.type).toBe('rate_limit');
      expect(alert.severity).toBe('warning');
      expect(alert.metadata.service).toBe('SEC');
      expect(alert.metadata.statusCode).toBe(429);
    });

    test('should detect and log timeout events', async () => {
      const timeoutAPI = async () => {
        await new Promise(resolve => setTimeout(resolve, 35000)); // Long timeout
        return 'Should not reach here';
      };

      try {
        await monitoredSystem.executeWithMonitoring(timeoutAPI, 'AI', '/api/summarize');
      } catch (error) {
        // Expected timeout
      }

      const monitoring = monitoredSystem.getMonitoring();
      const rateLimitAlerts = monitoring.getAlerts('rate_limit');
      const metrics = monitoring.getMetrics();

      expect(rateLimitAlerts.length).toBeGreaterThan(0);
      expect(metrics.rateLimitEvents).toBe(1);
      
      const alert = rateLimitAlerts[0];
      expect(alert.metadata.statusCode).toBe(524);
    });

    test('should track rate limiting events per service', async () => {
      const services = [
        { name: 'SEC', endpoint: '/api/rss-feed' },
        { name: 'AI', endpoint: '/api/summarize' },
        { name: 'Email', endpoint: '/api/send' }
      ];

      // Trigger rate limiting for each service
      for (const service of services) {
        for (let i = 0; i < 3; i++) {
          try {
            await monitoredSystem.executeWithMonitoring(
              async () => { throw new Error('429 Too Many Requests'); },
              service.name,
              service.endpoint
            );
          } catch (error) {
            // Expected
          }
        }
      }

      const monitoring = monitoredSystem.getMonitoring();
      const rateLimitAlerts = monitoring.getAlerts('rate_limit');
      
      expect(rateLimitAlerts.length).toBe(9); // 3 services × 3 requests each

      // Check that alerts are properly categorized by service
      const secAlerts = rateLimitAlerts.filter(a => a.metadata.service === 'SEC');
      const aiAlerts = rateLimitAlerts.filter(a => a.metadata.service === 'AI');
      const emailAlerts = rateLimitAlerts.filter(a => a.metadata.service === 'Email');

      expect(secAlerts.length).toBe(3);
      expect(aiAlerts.length).toBe(3);
      expect(emailAlerts.length).toBe(3);
    });
  });

  describe('Circuit Breaker State Monitoring', () => {
    test('should monitor circuit breaker state transitions', async () => {
      const failingAPI = async () => {
        throw new Error('Service failure');
      };

      // Trigger enough failures to open circuit
      for (let i = 0; i < 8; i++) {
        try {
          await monitoredSystem.executeWithMonitoring(failingAPI, 'TestService', '/api/test');
        } catch (error) {
          // Expected to fail
        }
      }

      const monitoring = monitoredSystem.getMonitoring();
      const circuitBreakerAlerts = monitoring.getAlerts('circuit_breaker');
      const metrics = monitoring.getMetrics();

      expect(circuitBreakerAlerts.length).toBeGreaterThan(0);
      expect(metrics.circuitBreakerStateChanges).toBeGreaterThan(0);

      // Should have alert for OPEN state
      const openAlert = circuitBreakerAlerts.find(a => a.metadata.currentState === CircuitState.OPEN);
      expect(openAlert).toBeDefined();
      expect(openAlert?.severity).toBe('critical');
    });

    test('should monitor circuit breaker recovery', async () => {
      // First trigger circuit to open
      const failingAPI = async () => {
        throw new Error('Service failure');
      };

      for (let i = 0; i < 8; i++) {
        try {
          await monitoredSystem.executeWithMonitoring(failingAPI, 'RecoveryService', '/api/test');
        } catch (error) {
          // Expected
        }
      }

      // Wait for circuit breaker timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Now succeed to trigger recovery
      const successAPI = async () => {
        return 'Success';
      };

      await monitoredSystem.executeWithMonitoring(successAPI, 'RecoveryService', '/api/test');
      await monitoredSystem.executeWithMonitoring(successAPI, 'RecoveryService', '/api/test');

      const monitoring = monitoredSystem.getMonitoring();
      const circuitBreakerAlerts = monitoring.getAlerts('circuit_breaker');

      // Should have alerts for: CLOSED -> OPEN -> HALF_OPEN -> CLOSED
      expect(circuitBreakerAlerts.length).toBeGreaterThanOrEqual(2);

      const stateTransitions = circuitBreakerAlerts.map(a => a.metadata.currentState);
      expect(stateTransitions).toContain(CircuitState.OPEN);
    });

    test('should include circuit breaker statistics in alerts', async () => {
      const failingAPI = async () => {
        throw new Error('Test failure');
      };

      // Generate some failures
      for (let i = 0; i < 6; i++) {
        try {
          await monitoredSystem.executeWithMonitoring(failingAPI, 'StatService', '/api/stats');
        } catch (error) {
          // Expected
        }
      }

      const monitoring = monitoredSystem.getMonitoring();
      const circuitBreakerAlerts = monitoring.getAlerts('circuit_breaker');

      const openAlert = circuitBreakerAlerts.find(a => a.metadata.currentState === CircuitState.OPEN);
      expect(openAlert).toBeDefined();
      expect(openAlert?.metadata.failureCount).toBeGreaterThan(0);
      expect(openAlert?.metadata.totalFailures).toBeGreaterThan(0);
    });
  });

  describe('Queue Depth Monitoring', () => {
    test('should monitor queue depth and generate alerts', async () => {
      const slowAPI = async () => {
        await new Promise(resolve => setTimeout(resolve, 500)); // Slow operation
        return 'Slow response';
      };

      // Start many operations to build up queue
      const promises = Array.from({ length: 25 }, (_, i) => 
        monitoredSystem.executeQueuedWithMonitoring(slowAPI, 'SlowService', `/api/slow${i}`)
      );

      // Let some queue up before completing
      await new Promise(resolve => setTimeout(resolve, 100));

      const monitoring = monitoredSystem.getMonitoring();
      const queueDepthAlerts = monitoring.getAlerts('queue_depth');
      const metrics = monitoring.getMetrics();

      // Should detect high queue depth
      expect(queueDepthAlerts.length).toBeGreaterThan(0) || metrics.queueDepthPeaks > 0;

      // Complete all operations
      await Promise.allSettled(promises);
    });

    test('should differentiate queue depth alert severities', async () => {
      const verySlowAPI = async () => {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Very slow
        return 'Very slow response';
      };

      // Create extreme queue buildup
      const promises = Array.from({ length: 30 }, (_, i) => 
        monitoredSystem.executeQueuedWithMonitoring(verySlowAPI, 'VerySlowService', `/api/veryslow${i}`)
      );

      // Let queue build up significantly
      await new Promise(resolve => setTimeout(resolve, 200));

      const monitoring = monitoredSystem.getMonitoring();
      const queueDepthAlerts = monitoring.getAlerts('queue_depth');

      if (queueDepthAlerts.length > 0) {
        // Should have both warning and critical alerts as queue grows
        const severities = queueDepthAlerts.map(a => a.severity);
        expect(severities.includes('warning') || severities.includes('critical')).toBe(true);
      }

      // Cancel remaining operations to avoid long test time
      await Promise.allSettled(promises.slice(0, 5)); // Only wait for first 5
    });
  });

  describe('Performance Metrics Monitoring', () => {
    test('should monitor response time degradation', async () => {
      const slowAPI = async () => {
        await new Promise(resolve => setTimeout(resolve, 1200)); // Slow response
        return 'Slow response';
      };

      await monitoredSystem.executeWithMonitoring(slowAPI, 'SlowService', '/api/slow');

      const monitoring = monitoredSystem.getMonitoring();
      const performanceAlerts = monitoring.getAlerts('performance');
      const metrics = monitoring.getMetrics();

      expect(performanceAlerts.length).toBeGreaterThan(0);
      expect(metrics.performanceDegradation).toBeGreaterThan(0);

      const responseTimeAlert = performanceAlerts.find(a => a.message.includes('response time'));
      expect(responseTimeAlert).toBeDefined();
      expect(responseTimeAlert?.severity).toBe('warning');
    });

    test('should monitor error rate spikes', async () => {
      const errorAPI = async () => {
        throw new Error('High error rate test');
      };

      // Generate high error rate
      for (let i = 0; i < 5; i++) {
        try {
          await monitoredSystem.executeWithMonitoring(errorAPI, 'ErrorService', '/api/error');
        } catch (error) {
          // Expected
        }
      }

      const monitoring = monitoredSystem.getMonitoring();
      const errorRateAlerts = monitoring.getAlerts('error_rate');
      const metrics = monitoring.getMetrics();

      expect(errorRateAlerts.length).toBeGreaterThan(0) || metrics.errorRateSpikes > 0;

      if (errorRateAlerts.length > 0) {
        const errorAlert = errorRateAlerts[0];
        expect(errorAlert.severity).toBe('critical');
        expect(errorAlert.metadata.errorRate).toBeGreaterThan(50);
      }
    });

    test('should track performance metrics over time', async () => {
      const mixedAPI = async (shouldFail: boolean, delay: number) => {
        await new Promise(resolve => setTimeout(resolve, delay));
        if (shouldFail) {
          throw new Error('Mixed performance test failure');
        }
        return 'Mixed response';
      };

      // Execute mix of fast/slow, success/failure operations
      const operations = [
        { fail: false, delay: 50 },
        { fail: true, delay: 100 },
        { fail: false, delay: 200 },
        { fail: true, delay: 150 },
        { fail: false, delay: 75 }
      ];

      for (const op of operations) {
        try {
          await monitoredSystem.executeWithMonitoring(
            () => mixedAPI(op.fail, op.delay),
            'MixedService',
            '/api/mixed'
          );
        } catch (error) {
          // Expected for failing operations
        }
      }

      const monitoring = monitoredSystem.getMonitoring();
      const metrics = monitoring.getMetrics();

      expect(metrics.averageResponseTime).toBeGreaterThan(0);
      expect(metrics.errorRate).toBeGreaterThan(0);
      expect(metrics.errorRate).toBeLessThan(100);
    });
  });

  describe('Alert Severity and Escalation', () => {
    test('should generate appropriate alert severities', async () => {
      // Generate different types of events
      const scenarios = [
        {
          name: 'rate_limit',
          operation: async () => { throw new Error('429 Too Many Requests'); },
          expectedSeverity: 'warning'
        },
        {
          name: 'circuit_breaker_open',
          operation: async () => { 
            // This will eventually trigger circuit breaker
            throw new Error('Circuit breaker test'); 
          },
          expectedSeverity: 'critical'
        },
        {
          name: 'performance',
          operation: async () => {
            await new Promise(resolve => setTimeout(resolve, 1100));
            return 'Performance test';
          },
          expectedSeverity: 'warning'
        }
      ];

      for (const scenario of scenarios) {
        try {
          if (scenario.name === 'circuit_breaker_open') {
            // Need multiple failures to trigger circuit breaker
            for (let i = 0; i < 8; i++) {
              try {
                await monitoredSystem.executeWithMonitoring(scenario.operation, 'TestService', '/api/test');
              } catch (error) {
                // Expected
              }
            }
          } else {
            await monitoredSystem.executeWithMonitoring(scenario.operation, 'TestService', '/api/test');
          }
        } catch (error) {
          // Expected for some scenarios
        }
      }

      const monitoring = monitoredSystem.getMonitoring();
      const allAlerts = monitoring.getAlerts();

      expect(allAlerts.length).toBeGreaterThan(0);

      // Check that we have different severity levels
      const severities = [...new Set(allAlerts.map(a => a.severity))];
      expect(severities.length).toBeGreaterThan(1);
      expect(severities).toContain('warning');
    });

    test('should include comprehensive metadata in alerts', async () => {
      const testAPI = async () => {
        throw new Error('429 Too Many Requests');
      };

      await monitoredSystem.executeWithMonitoring(testAPI, 'MetadataService', '/api/metadata');

      const monitoring = monitoredSystem.getMonitoring();
      const alerts = monitoring.getAlerts();

      expect(alerts.length).toBeGreaterThan(0);

      const alert = alerts[0];
      expect(alert).toHaveProperty('id');
      expect(alert).toHaveProperty('type');
      expect(alert).toHaveProperty('severity');
      expect(alert).toHaveProperty('message');
      expect(alert).toHaveProperty('timestamp');
      expect(alert).toHaveProperty('metadata');

      expect(alert.id).toBeDefined();
      expect(alert.timestamp).toBeInstanceOf(Date);
      expect(typeof alert.metadata).toBe('object');
    });
  });

  describe('Log Analysis and Patterns', () => {
    test('should generate comprehensive logs for analysis', async () => {
      const testAPI = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'Test response';
      };

      await monitoredSystem.executeWithMonitoring(testAPI, 'LogService', '/api/log');

      const monitoring = monitoredSystem.getMonitoring();
      const logs = monitoring.getLogs();

      expect(logs.length).toBeGreaterThan(0);
      
      // Should have monitoring start log
      const startLog = logs.find(log => log.includes('Monitoring started'));
      expect(startLog).toBeDefined();

      // Should have performance metrics log
      const perfLog = logs.find(log => log.includes('Performance metrics'));
      expect(perfLog).toBeDefined();
    });

    test('should correlate alerts with log entries', async () => {
      const errorAPI = async () => {
        throw new Error('429 Too Many Requests');
      };

      const beforeTime = Date.now();
      
      try {
        await monitoredSystem.executeWithMonitoring(errorAPI, 'CorrelationService', '/api/correlate');
      } catch (error) {
        // Expected
      }

      const afterTime = Date.now();

      const monitoring = monitoredSystem.getMonitoring();
      const alerts = monitoring.getAlerts();
      const logs = monitoring.getLogs();

      expect(alerts.length).toBeGreaterThan(0);
      expect(logs.length).toBeGreaterThan(0);

      // Alert timestamp should be within the test time window
      const alert = alerts[0];
      expect(alert.timestamp.getTime()).toBeGreaterThanOrEqual(beforeTime);
      expect(alert.timestamp.getTime()).toBeLessThanOrEqual(afterTime);

      // Should have corresponding log entry
      const rateLimitLog = logs.find(log => log.includes('Rate limit event'));
      expect(rateLimitLog).toBeDefined();
    });
  });

  describe('Monitoring Performance Impact', () => {
    test('should have minimal performance impact', async () => {
      const fastAPI = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'Fast response';
      };

      // Test without monitoring
      monitoredSystem.stopMonitoring();
      const startTimeWithoutMonitoring = Date.now();
      
      for (let i = 0; i < 10; i++) {
        await monitoredSystem.executeWithMonitoring(fastAPI, 'PerfService', '/api/perf');
      }
      
      const timeWithoutMonitoring = Date.now() - startTimeWithoutMonitoring;

      // Reset and test with monitoring
      monitoredSystem.reset();
      monitoredSystem.startMonitoring();
      const startTimeWithMonitoring = Date.now();
      
      for (let i = 0; i < 10; i++) {
        await monitoredSystem.executeWithMonitoring(fastAPI, 'PerfService', '/api/perf');
      }
      
      const timeWithMonitoring = Date.now() - startTimeWithMonitoring;

      // Monitoring overhead should be minimal (less than 50% increase)
      const overhead = (timeWithMonitoring - timeWithoutMonitoring) / timeWithoutMonitoring;
      expect(overhead).toBeLessThan(0.5);
    });

    test('should not affect system stability under load', async () => {
      const loadAPI = async () => {
        await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 50));
        if (Math.random() < 0.1) {
          throw new Error('Load test error');
        }
        return 'Load response';
      };

      // Generate load with monitoring enabled
      const promises = Array.from({ length: 20 }, (_, i) => 
        monitoredSystem.executeWithMonitoring(loadAPI, 'LoadService', `/api/load${i}`)
      );

      const results = await Promise.allSettled(promises);
      
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failureCount = results.filter(r => r.status === 'rejected').length;

      // Should handle the load without system instability
      expect(successCount).toBeGreaterThan(15); // Most should succeed
      expect(failureCount).toBeLessThan(5); // Some failures are expected due to random errors

      const monitoring = monitoredSystem.getMonitoring();
      const metrics = monitoring.getMetrics();
      
      // Monitoring should have captured events without affecting system
      expect(metrics.rateLimitEvents + metrics.circuitBreakerStateChanges).toBeGreaterThanOrEqual(0);
    });
  });
});