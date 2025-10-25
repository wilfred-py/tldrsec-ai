/**
 * Comprehensive Performance and Load Testing Suite
 * 
 * Tests system performance under various loads, validates optimization
 * implementations, and ensures performance regressions are detected.
 */

import { jest } from '@jest/globals';
import { performance } from 'perf_hooks';
import { secureTestUtils } from '../../utils/secure-test-utils';

// Mock heavy dependencies
jest.mock('../../../lib/db/prisma');
jest.mock('../../../lib/logging');

// Import performance-critical modules
const { asyncAlertQueue } = jest.requireActual('../../../lib/monitoring/async-alert-queue');
const { dataSanitizer } = jest.requireActual('../../../lib/security/data-sanitizer');
const { rbacAuthorizer } = jest.requireActual('../../../lib/security/rbac');
const { MemoryManager } = jest.requireActual('../../../lib/monitoring/memory-manager');

describe('Performance and Load Testing Suite', () => {
  let mockPrisma: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma = secureTestUtils.getMocks().prisma;
    require('../../../lib/db/prisma').getPrismaClient = jest.fn().mockReturnValue(mockPrisma);
  });

  afterEach(() => {
    secureTestUtils.restoreEnvironment();
  });

  describe('Memory Management Performance', () => {
    describe('Memory Monitoring and Cleanup', () => {
      it('should handle memory monitoring within performance thresholds', async () => {
        const memoryManager = new MemoryManager();
        
        // Test memory monitoring startup performance
        const monitorStart = performance.now();
        memoryManager.startMonitoring();
        const monitorTime = performance.now() - monitorStart;

        expect(monitorTime).toBeLessThan(10); // Should start monitoring quickly
        // Memory manager doesn't expose isMonitoring, but we can test that it started without errors

        // Test metrics collection performance
        const metricsStart = performance.now();
        const metrics = memoryManager.getCurrentMemoryMetrics();
        const metricsTime = performance.now() - metricsStart;

        expect(metricsTime).toBeLessThan(5); // Should collect metrics quickly
        expect(metrics).toBeDefined();
        expect(metrics?.heapUsed).toBeGreaterThan(0);

        memoryManager.stopMonitoring();
      });

      it('should handle cache operations efficiently', async () => {
        const memoryManager = new MemoryManager();
        
        // Test cache write performance
        const cacheStart = performance.now();
        for (let i = 0; i < 1000; i++) {
          memoryManager.setCacheItem(`key_${i}`, { data: `value_${i}` }, 5000);
        }
        const cacheTime = performance.now() - cacheStart;

        expect(cacheTime).toBeLessThan(50); // Should cache 1000 items within 50ms
        
        // Test cache read performance
        const readStart = performance.now();
        for (let i = 0; i < 1000; i++) {
          const value = memoryManager.getCacheItem(`key_${i}`);
          expect(value).toBeDefined();
        }
        const readTime = performance.now() - readStart;

        expect(readTime).toBeLessThan(50); // Should read 1000 items within 50ms
      });

      it('should handle cleanup operations efficiently', async () => {
        const memoryManager = new MemoryManager();
        
        // Register a test cleanup task
        const cleanupTask = {
          id: 'performance-test-cleanup',
          name: 'Performance Test Cleanup',
          priority: 5,
          cleanup: jest.fn().mockResolvedValue(1024), // Returns bytes freed
          interval: 1000,
          enabled: true
        };

        const registerStart = performance.now();
        memoryManager.registerCleanupTask(cleanupTask);
        const registerTime = performance.now() - registerStart;

        expect(registerTime).toBeLessThan(5); // Should register quickly
        
        // Test cleanup execution
        const cleanupStart = performance.now();
        await memoryManager.forceCleanup();
        const cleanupTime = performance.now() - cleanupStart;

        expect(cleanupTime).toBeLessThan(50); // Should complete cleanup within 50ms
        expect(cleanupTask.cleanup).toHaveBeenCalled();
      });
    });
  });

  describe('Async Alert Queue Performance', () => {
    describe('Queueing Performance', () => {
      it('should queue alerts within performance threshold', async () => {
        const testAlerts = Array.from({ length: 1000 }, (_, i) => ({
          executionId: `exec_${i}`,
          alertType: 'PERFORMANCE_TEST',
          severity: 'LOW',
          message: `Test alert ${i}`,
          details: { index: i, data: Array(50).fill(`data_${i}`) },
          jobName: 'performance-test',
          environment: 'test'
        }));

        const queueStart = performance.now();
        const queuePromises = testAlerts.map(alert => asyncAlertQueue.queueAlert(alert));
        await Promise.all(queuePromises);
        const queueTime = performance.now() - queueStart;

        // Should queue 1000 alerts within 100ms (avg <0.1ms per alert)
        expect(queueTime).toBeLessThan(100);
        
        const stats = asyncAlertQueue.getQueueStats();
        expect(stats.queueSize).toBeGreaterThan(0);
      });

      it('should handle burst queueing efficiently', async () => {
        const burstSize = 500;
        const burstAlerts = Array.from({ length: burstSize }, (_, i) => ({
          executionId: `burst_${i}`,
          alertType: 'BURST_TEST',
          severity: 'HIGH',
          message: `Burst alert ${i}`,
          details: { burstIndex: i },
          jobName: 'burst-test',
          environment: 'test'
        }));

        const burstStart = performance.now();
        
        // Queue all alerts simultaneously (burst scenario)
        await Promise.all(burstAlerts.map(alert => asyncAlertQueue.queueAlert(alert)));
        
        const burstTime = performance.now() - burstStart;

        expect(burstTime).toBeLessThan(50); // Should handle burst within 50ms
        expect(asyncAlertQueue.getQueueStats().queueSize).toBeGreaterThan(0);
      });
    });

    describe('Batch Processing Performance', () => {
      it('should process batches efficiently', async () => {
        // Set up mock for database operations
        mockPrisma.cronJobAlert.createMany.mockResolvedValue({ count: 100 });

        // Queue alerts for batch processing
        const batchAlerts = Array.from({ length: 100 }, (_, i) => ({
          executionId: `batch_${i}`,
          alertType: 'BATCH_TEST',
          severity: 'MEDIUM',
          message: `Batch alert ${i}`,
          details: { batchIndex: i },
          jobName: 'batch-test',
          environment: 'test'
        }));

        for (const alert of batchAlerts) {
          await asyncAlertQueue.queueAlert(alert);
        }

        const flushStart = performance.now();
        await asyncAlertQueue.flushQueue();
        const flushTime = performance.now() - flushStart;

        expect(flushTime).toBeLessThan(100); // Should flush within 100ms
        expect(mockPrisma.cronJobAlert.createMany).toHaveBeenCalled();
      });
    });

    describe('Circuit Breaker Performance', () => {
      it('should fail fast when circuit breaker is open', async () => {
        // Mock database failures to trigger circuit breaker
        mockPrisma.cronJobAlert.createMany.mockRejectedValue(new Error('Database down'));

        const alert = {
          executionId: 'circuit_test',
          alertType: 'CIRCUIT_TEST',
          severity: 'HIGH',
          message: 'Circuit breaker test',
          details: {},
          jobName: 'circuit-test',
          environment: 'test'
        };

        // Queue alerts to trigger failures
        await asyncAlertQueue.queueAlert(alert);
        
        const failFastStart = performance.now();
        try {
          await asyncAlertQueue.flushQueue();
        } catch (error) {
          // Expected to fail
        }
        const failFastTime = performance.now() - failFastStart;

        // Should fail quickly when circuit breaker is active
        expect(failFastTime).toBeLessThan(10);
      });
    });
  });

  describe('Data Sanitization Performance', () => {
    describe('Large Object Sanitization', () => {
      it('should sanitize large objects within performance threshold', async () => {
        const largeObject = {
          users: Array.from({ length: 1000 }, (_, i) => ({
            id: `user_${i}`,
            email: `user${i}@example.com`,
            profile: {
              firstName: `User${i}`,
              lastName: `Test${i}`,
              phone: `+1-555-${String(i).padStart(3, '0')}-${String(i + 1000).padStart(4, '0')}`,
              ssn: `${String(i + 100).padStart(3, '0')}-${String(i + 10).padStart(2, '0')}-${String(i + 1000).padStart(4, '0')}`
            },
            metadata: {
              createdAt: new Date().toISOString(),
              preferences: Array(20).fill(`pref_${i}`),
              tags: Array(10).fill(`tag_${i}`)
            }
          }))
        };

        const sanitizeStart = performance.now();
        const sanitized = dataSanitizer.sanitizeObject(largeObject);
        const sanitizeTime = performance.now() - sanitizeStart;

        expect(sanitizeTime).toBeLessThan(200); // Should complete within 200ms
        expect(sanitized).toBeDefined();
        expect(Array.isArray((sanitized as any).users)).toBe(true);
      });

      it('should sanitize deep nested objects efficiently', async () => {
        const createNestedObject = (depth: number): any => {
          if (depth === 0) {
            return {
              email: 'deep@example.com',
              phone: '+1-555-123-4567',
              ssn: '123-45-6789',
              data: Array(100).fill('sensitive_data')
            };
          }
          return {
            level: depth,
            nested: createNestedObject(depth - 1),
            siblingData: Array(50).fill(`level_${depth}_data`)
          };
        };

        const deepObject = createNestedObject(20); // 20 levels deep

        const sanitizeStart = performance.now();
        const sanitized = dataSanitizer.sanitizeObject(deepObject);
        const sanitizeTime = performance.now() - sanitizeStart;

        expect(sanitizeTime).toBeLessThan(100); // Should handle deep nesting efficiently
        expect(sanitized).toBeDefined();
      });
    });

    describe('String Sanitization Performance', () => {
      it('should sanitize strings with multiple PII patterns efficiently', async () => {
        const sensitiveStrings = Array.from({ length: 500 }, (_, i) => 
          `User ${i} with email user${i}@company.com, phone +1-555-${String(i).padStart(3, '0')}-${String(i + 1000).padStart(4, '0')}, SSN ${String(i + 100).padStart(3, '0')}-${String(i + 10).padStart(2, '0')}-${String(i + 1000).padStart(4, '0')}, and credit card 4111-1111-1111-${String(i).padStart(4, '0')} made a transaction.`
        );

        const sanitizeStart = performance.now();
        const sanitizedStrings = sensitiveStrings.map(str => dataSanitizer.sanitizeString(str));
        const sanitizeTime = performance.now() - sanitizeStart;

        expect(sanitizeTime).toBeLessThan(150); // Should sanitize 500 complex strings within 150ms
        expect(sanitizedStrings).toHaveLength(500);
        expect(sanitizedStrings.every(str => typeof str === 'string')).toBe(true);
      });
    });
  });

  describe('RBAC Authorization Performance', () => {
    describe('Authorization Decision Performance', () => {
      it('should handle authorization decisions within performance threshold', async () => {
        const authContexts = Array.from({ length: 500 }, (_, i) => ({
          userId: `user_${i}`,
          userRole: ['USER', 'PREMIUM_USER', 'ADMIN'][i % 3] as any,
          subscriptionTier: ['FREE', 'PREMIUM', 'ENTERPRISE'][i % 3],
          environment: 'production',
          resourceId: `resource_${i}`,
          resourceOwnerId: `user_${i}`
        }));

        const authStart = performance.now();
        const authPromises = authContexts.map(context => 
          rbacAuthorizer.authorize(context, 'USER_DATA' as any, 'read' as any)
        );
        const results = await Promise.all(authPromises);
        const authTime = performance.now() - authStart;

        expect(authTime).toBeLessThan(200); // Should complete 500 auth checks within 200ms
        expect(results).toHaveLength(500);
        expect(results.every(result => typeof result.authorized === 'boolean')).toBe(true);
      });

      it('should leverage caching for performance optimization', async () => {
        const authContext = {
          userId: 'cache_test_user',
          userRole: 'SYSTEM' as any, // Use SYSTEM role to ensure authorization
          subscriptionTier: 'SYSTEM',
          environment: 'production',
          resourceId: 'cache_test_resource',
          resourceOwnerId: 'cache_test_user'
        };

        // First authorization (cache miss)
        const firstStart = performance.now();
        const firstResult = await rbacAuthorizer.authorize(authContext, 'USER_DATA' as any, 'read' as any);
        const firstTime = performance.now() - firstStart;

        // Subsequent authorizations (cache hits)
        const cachedStart = performance.now();
        const cachedPromises = Array(100).fill(null).map(() => 
          rbacAuthorizer.authorize(authContext, 'USER_DATA' as any, 'read' as any)
        );
        await Promise.all(cachedPromises);
        const cachedTime = performance.now() - cachedStart;

        expect(firstResult.authorized).toBe(true);
        expect(cachedTime).toBeLessThan(firstTime); // Cached operations should be faster
        expect(cachedTime).toBeLessThan(20); // 100 cached operations within 20ms
      });
    });
  });

  describe('Memory Usage and Leak Detection', () => {
    describe('Memory Stability Tests', () => {
      it('should maintain stable memory usage under sustained load', async () => {
        const measureMemory = () => {
          if (typeof process !== 'undefined' && process.memoryUsage) {
            return process.memoryUsage().heapUsed;
          }
          return 0;
        };

        const initialMemory = measureMemory();
        
        // Simulate sustained load
        for (let cycle = 0; cycle < 10; cycle++) {
          // Create and process data
          const testData = Array.from({ length: 100 }, (_, i) => ({
            id: `load_test_${cycle}_${i}`,
            data: Array(100).fill(`cycle_${cycle}_data_${i}`)
          }));

          // Process through various components
          await Promise.all([
            ...testData.map(item => dataSanitizer.sanitizeObject(item)),
            ...testData.map((_, i) => rbacAuthorizer.authorize({
              userId: `user_${i}`,
              userRole: 'USER' as any,
              subscriptionTier: 'FREE',
              environment: 'test'
            }, 'USER_DATA' as any, 'read' as any))
          ]);

          // Force garbage collection if available
          if (global.gc) {
            global.gc();
          }
        }

        const finalMemory = measureMemory();
        const memoryIncrease = finalMemory - initialMemory;
        
        // Memory increase should be reasonable (less than 50MB)
        expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
      });
    });
  });

  describe('Performance Regression Detection', () => {
    describe('Baseline Performance Validation', () => {
      it('should meet baseline performance requirements for critical operations', async () => {
        const performanceBaselines = {
          singleAuthCheck: 5, // ms
          bulkDataSanitization: 100, // ms for 1000 items
          cacheOperations: 1, // ms for 100 operations
          alertQueueing: 0.1 // ms per alert
        };

        // Test single auth check
        const authStart = performance.now();
        await rbacAuthorizer.authorize({
          userId: 'perf_user',
          userRole: 'USER' as any,
          subscriptionTier: 'FREE',
          environment: 'production'
        }, 'USER_DATA' as any, 'read' as any);
        const authTime = performance.now() - authStart;
        expect(authTime).toBeLessThan(performanceBaselines.singleAuthCheck);

        // Test bulk data sanitization
        const bulkData = Array.from({ length: 1000 }, (_, i) => ({
          email: `user${i}@test.com`,
          data: `sensitive_data_${i}`
        }));
        const sanitizeStart = performance.now();
        bulkData.forEach(item => dataSanitizer.sanitizeObject(item));
        const sanitizeTime = performance.now() - sanitizeStart;
        expect(sanitizeTime).toBeLessThan(performanceBaselines.bulkDataSanitization);

        // Test memory operations
        const memoryManager = new MemoryManager();
        const memoryStart = performance.now();
        for (let i = 0; i < 100; i++) {
          memoryManager.setCacheItem(`perf_key_${i}`, { data: i }, 5000);
          memoryManager.getCacheItem(`perf_key_${i}`);
        }
        const memoryTime = performance.now() - memoryStart;
        expect(memoryTime).toBeLessThan(performanceBaselines.cacheOperations);

        // Test alert queueing
        const queueStart = performance.now();
        await asyncAlertQueue.queueAlert({
          executionId: 'perf_test',
          alertType: 'PERFORMANCE_BASELINE',
          severity: 'LOW',
          message: 'Performance test',
          details: {},
          jobName: 'perf-test',
          environment: 'test'
        });
        const queueTime = performance.now() - queueStart;
        expect(queueTime).toBeLessThan(performanceBaselines.alertQueueing);
      });
    });
  });

  describe('Load Testing Scenarios', () => {
    describe('Realistic Load Simulation', () => {
      it('should handle typical production load patterns', async () => {
        await secureTestUtils.withControlledEnvironment(
          { NODE_ENV: 'production' },
          async () => {
            // Simulate realistic production load
            const simulateUserSession = async (userId: string) => {
              const sessionStart = performance.now();
              
              // Typical user session operations
              await Promise.all([
                // Authorization checks (multiple per session)
                rbacAuthorizer.authorize({
                  userId,
                  userRole: 'USER' as any,
                  subscriptionTier: 'PREMIUM',
                  environment: 'production'
                }, 'FILING' as any, 'read' as any),
                
                // Data sanitization (logging)
                dataSanitizer.sanitizeObject({
                  userId,
                  sessionData: Array(50).fill(`session_data_${userId}`),
                  userAgent: 'Mozilla/5.0 (compatible test browser)',
                  timestamp: new Date().toISOString()
                }),
                
                // Alert processing (occasional)
                Math.random() > 0.8 ? asyncAlertQueue.queueAlert({
                  executionId: `session_${userId}`,
                  alertType: 'USER_ACTION',
                  severity: 'LOW',
                  message: `User ${userId} performed action`,
                  details: { userId, action: 'filing_access' },
                  jobName: 'user-session',
                  environment: 'production'
                }) : Promise.resolve()
              ]);
              
              return performance.now() - sessionStart;
            };

            // Simulate 50 concurrent user sessions
            const loadStart = performance.now();
            const sessionPromises = Array.from({ length: 50 }, (_, i) => 
              simulateUserSession(`load_user_${i}`)
            );
            const sessionTimes = await Promise.all(sessionPromises);
            const totalLoadTime = performance.now() - loadStart;

            // Validate performance under load
            expect(totalLoadTime).toBeLessThan(2000); // Complete within 2 seconds
            expect(Math.max(...sessionTimes)).toBeLessThan(500); // No session over 500ms
            expect(sessionTimes.reduce((a, b) => a + b, 0) / sessionTimes.length).toBeLessThan(100); // Average under 100ms
          }
        );
      });
    });
  });
});