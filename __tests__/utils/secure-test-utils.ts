/**
 * Secure Test Utilities
 * 
 * Provides secure testing infrastructure that doesn't bypass security controls
 * and properly handles async operations with comprehensive mocking.
 */

import { jest } from '@jest/globals';

/**
 * Secure environment management for tests
 * Prevents security bypass vulnerabilities while allowing controlled testing
 */
export class SecureTestEnvironment {
  private originalEnv: Record<string, string | undefined> = {};
  private activeOverrides = new Set<string>();

  /**
   * Safely override environment variables with audit trail
   */
  public setEnvironment(envVars: Record<string, string>): void {
    Object.entries(envVars).forEach(([key, value]) => {
      if (!this.activeOverrides.has(key)) {
        this.originalEnv[key] = process.env[key];
        this.activeOverrides.add(key);
      }
      process.env[key] = value;
    });
  }

  /**
   * Restore original environment variables
   */
  public restoreEnvironment(): void {
    this.activeOverrides.forEach(key => {
      if (this.originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = this.originalEnv[key];
      }
    });
    this.originalEnv = {};
    this.activeOverrides.clear();
  }

  /**
   * Execute test with controlled environment (recommended approach)
   */
  public async withEnvironment<T>(
    envVars: Record<string, string>,
    testFn: () => Promise<T>
  ): Promise<T> {
    // Store original JEST_WORKER_ID if we're changing NODE_ENV to non-test
    const needsJestWorkerIdDeletion = envVars.NODE_ENV && envVars.NODE_ENV !== 'test';
    if (needsJestWorkerIdDeletion && !this.activeOverrides.has('JEST_WORKER_ID')) {
      this.originalEnv.JEST_WORKER_ID = process.env.JEST_WORKER_ID;
      this.activeOverrides.add('JEST_WORKER_ID');
    }
    
    this.setEnvironment(envVars);
    
    // Delete JEST_WORKER_ID when simulating non-test environment
    if (needsJestWorkerIdDeletion) {
      delete process.env.JEST_WORKER_ID;
    }
    
    try {
      return await testFn();
    } finally {
      this.restoreEnvironment();
    }
  }

  /**
   * Check if running in test environment (security-conscious detection)
   */
  public isTestEnvironment(): boolean {
    return process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;
  }

  /**
   * Force test environment for controlled testing
   * Used when we specifically need to test non-test-mode behavior
   */
  public forceNonTestEnvironment(): void {
    this.originalEnv.JEST_WORKER_ID = process.env.JEST_WORKER_ID;
    this.activeOverrides.add('JEST_WORKER_ID');
    this.setEnvironment({
      NODE_ENV: 'development'
    });
    delete process.env.JEST_WORKER_ID;
  }
}

/**
 * Async Alert Queue Mock Factory
 * Provides proper async behavior simulation for alert queue testing
 */
export class AsyncAlertQueueMockFactory {
  public static createMock() {
    const queuedAlerts: any[] = [];
    let isProcessing = false;
    let circuitBreakerOpen = false;
    let consecutiveFailures = 0;

    return {
      queueAlert: jest.fn().mockImplementation(async (alertData: any) => {
        if (circuitBreakerOpen) {
          return; // Skip queuing when circuit breaker is open
        }
        queuedAlerts.push(alertData);
        return Promise.resolve();
      }),

      flushQueue: jest.fn().mockImplementation(async () => {
        if (isProcessing || queuedAlerts.length === 0) {
          return;
        }
        
        isProcessing = true;
        try {
          // Simulate batch processing - create a copy to avoid modifying original during iteration
          const batch = [...queuedAlerts];
          queuedAlerts.length = 0; // Clear the queue
          
          // If a mock Prisma is available, call it
          const mockPrisma = (global as any).__mockPrisma;
          if (mockPrisma?.cronJobAlert?.createMany) {
            await mockPrisma.cronJobAlert.createMany({
              data: batch.map((alert: any) => ({
                executionId: alert.executionId,
                alertType: alert.alertType,
                severity: alert.severity,
                title: `Test Alert: ${alert.alertType}`,
                description: alert.message,
                actualValue: alert.details || {},
                jobName: alert.jobName,
                environment: alert.environment,
                triggeredAt: new Date()
              }))
            });
          }
          
          consecutiveFailures = 0;
          circuitBreakerOpen = false;
        } catch (error) {
          consecutiveFailures++;
          if (consecutiveFailures >= 5) {
            circuitBreakerOpen = true;
          }
          throw error;
        } finally {
          isProcessing = false;
        }
      }),

      getQueueStats: jest.fn().mockImplementation(() => ({
        queueSize: queuedAlerts.length,
        isProcessing,
        circuitBreakerOpen,
        consecutiveFailures
      })),

      shutdown: jest.fn().mockImplementation(async () => {
        // Flush any remaining alerts
        if (queuedAlerts.length > 0) {
          await this.flushQueue();
        }
      }),

      // Test utilities
      _getQueuedAlerts: () => [...queuedAlerts],
      _setCircuitBreakerOpen: (open: boolean) => { circuitBreakerOpen = open; },
      _setConsecutiveFailures: (failures: number) => { consecutiveFailures = failures; },
      _clearQueue: () => { queuedAlerts.length = 0; }
    };
  }
}

/**
 * Performance Monitor Mock Factory
 * Provides realistic performance monitoring simulation
 */
export class PerformanceMonitorMockFactory {
  public static createMock() {
    const timings: number[] = [];
    
    return {
      recordAlertProcessingTime: jest.fn().mockImplementation((duration: number) => {
        timings.push(duration);
      }),

      recordMainThreadBlocking: jest.fn().mockImplementation((duration: number) => {
        // Mock implementation for thread blocking recording
      }),

      recordDatabaseOperation: jest.fn().mockImplementation((type: 'batched' | 'individual') => {
        // Mock implementation for database operation recording
      }),

      getMetrics: jest.fn().mockImplementation(() => ({
        alertProcessingTime: {
          avg: timings.length > 0 ? timings.reduce((a, b) => a + b, 0) / timings.length : 0,
          max: timings.length > 0 ? Math.max(...timings) : 0,
          min: timings.length > 0 ? Math.min(...timings) : 0,
          count: timings.length
        },
        contextMemoryUsage: { current: 50, peak: 100, evicted: 0 },
        databaseOperations: { batched: 10, individual: 2, batchRatio: 0.83 },
        mainThreadBlocking: { totalBlockingTime: 100, maxBlockingTime: 50, blockingEvents: 5 }
      })),

      checkPerformanceRegression: jest.fn().mockImplementation(() => ({
        hasRegression: false,
        issues: []
      })),

      generateReport: jest.fn().mockImplementation(() => 'Mock Performance Report'),

      measureExecutionTime: jest.fn().mockImplementation(async <T>(
        fn: () => Promise<T>,
        category: string
      ): Promise<T> => {
        const start = Date.now();
        const result = await fn();
        const duration = Date.now() - start;
        timings.push(duration);
        return result;
      }),

      // Test utilities
      _getTimings: () => [...timings],
      _clearTimings: () => { timings.length = 0; }
    };
  }
}

/**
 * Security Module Mock Factory
 * Provides comprehensive security module mocking with realistic behavior
 */
export class SecurityModuleMockFactory {
  public static createDataSanitizerMock() {
    return {
      logContext: jest.fn().mockImplementation((data: any) => data),
      userId: jest.fn().mockImplementation((userId: string) => `sanitized_${userId}`),
      string: jest.fn().mockImplementation((str: string) => str),
      email: jest.fn().mockImplementation((email: string) => email.replace(/(.{2})[^@]*(@.*)/, '$1***$2'))
    };
  }

  public static createValidationSchemasMock() {
    return {
      validateUserNotification: jest.fn().mockImplementation((data: any) => data),
      validateAlertData: jest.fn().mockImplementation((data: any) => data),
      validateSecurityContext: jest.fn().mockImplementation((data: any) => data)
    };
  }

  public static createRbacMock() {
    return {
      authorize: jest.fn().mockImplementation(async () => ({
        authorized: true,
        reason: 'test_authorized'
      })),
      UserRole: {
        GUEST: 'guest',
        USER: 'user',
        PREMIUM_USER: 'premium_user',
        ADMIN: 'admin',
        SYSTEM: 'system'
      },
      ResourceType: {
        ALERT: 'alert',
        FILING: 'filing',
        USER_DATA: 'user_data',
        NOTIFICATION: 'notification',
        SYSTEM_CONFIG: 'system_config'
      },
      Operation: {
        CREATE: 'create',
        READ: 'read',
        UPDATE: 'update',
        DELETE: 'delete',
        EXECUTE: 'execute'
      }
    };
  }

  public static createSecureLoggerMock() {
    return {
      userNotified: jest.fn().mockResolvedValue(undefined),
      securityViolation: jest.fn().mockResolvedValue(undefined),
      accessDenied: jest.fn().mockResolvedValue(undefined),
      dataAccess: jest.fn().mockResolvedValue(undefined),
      SecuritySeverity: {
        LOW: 'low',
        MEDIUM: 'medium',
        HIGH: 'high',
        CRITICAL: 'critical'
      }
    };
  }
}

/**
 * Prisma Mock Factory with Comprehensive Coverage
 * Provides realistic database behavior simulation for testing
 */
export class PrismaMockFactory {
  public static createMock() {
    const executionStore = new Map();
    const alertStore = new Map();
    
    return {
      cronJobExecution: {
        create: jest.fn().mockImplementation(async (args: any) => {
          const id = `exec_${Date.now()}`;
          const execution = { id, ...args.data };
          executionStore.set(args.data.executionId, execution);
          return execution;
        }),

        update: jest.fn().mockImplementation(async (args: any) => {
          const existing = executionStore.get(args.where.executionId);
          if (!existing) {
            throw new Error(`Execution ${args.where.executionId} not found`);
          }
          const updated = { ...existing, ...args.data };
          executionStore.set(args.where.executionId, updated);
          return updated;
        }),

        findMany: jest.fn().mockImplementation(async (args: any) => {
          return Array.from(executionStore.values())
            .slice(0, args?.take || 10)
            .map(exec => ({
              ...exec,
              filingProcessingLogs: [],
              userNotificationLogs: []
            }));
        }),

        findFirst: jest.fn().mockImplementation(async (args: any) => {
          const executions = Array.from(executionStore.values());
          return executions.find((exec: any) => 
            !args?.where?.status || 
            (Array.isArray(args.where.status.in) ? 
              args.where.status.in.includes(exec.status) : 
              exec.status === args.where.status)
          ) || null;
        }),

        groupBy: jest.fn().mockImplementation(async (args: any) => {
          // Mock groupBy implementation
          return [{
            createdAt: new Date(),
            _sum: {
              totalCostUSD: 10.5,
              aiCostUSD: 8.0,
              emailCostUSD: 2.5,
              tokensUsed: 5000
            },
            _count: {
              filingsProcessed: 5,
              usersNotified: 20
            }
          }];
        })
      },

      cronJobAlert: {
        create: jest.fn().mockImplementation(async (args: any) => {
          const id = `alert_${Date.now()}`;
          const alert = { id, ...args.data };
          alertStore.set(id, alert);
          return alert;
        }),

        createMany: jest.fn().mockImplementation(async (args: any) => {
          let count = 0;
          args.data.forEach((alertData: any) => {
            const id = `alert_${Date.now()}_${count++}`;
            alertStore.set(id, { id, ...alertData });
          });
          return { count };
        }),

        findMany: jest.fn().mockImplementation(async (args: any) => {
          return Array.from(alertStore.values()).slice(0, args?.take || 10);
        })
      },

      filingProcessingLog: {
        groupBy: jest.fn().mockImplementation(async (args: any) => {
          return [{
            ticker: 'TSLA',
            _count: { id: 5 },
            _sum: { summaryCostUSD: 2.5, emailsSent: 10 }
          }];
        })
      },

      user: {
        findMany: jest.fn().mockImplementation(async () => []),
        aggregate: jest.fn().mockImplementation(async () => ({ _count: { id: 100 } }))
      },

      auditLog: {
        count: jest.fn().mockImplementation(async () => 50),
        findMany: jest.fn().mockImplementation(async () => [])
      },

      summary: {
        findMany: jest.fn().mockImplementation(async () => [])
      },

      $transaction: jest.fn().mockImplementation(async (fn: any) => {
        // Mock transaction - just execute the function
        return await fn(this);
      }),

      // Test utilities
      _getExecutions: () => Array.from(executionStore.values()),
      _getAlerts: () => Array.from(alertStore.values()),
      _clearStores: () => {
        executionStore.clear();
        alertStore.clear();
      }
    };
  }
}

/**
 * Test Setup Helper
 * Provides complete test environment setup with all necessary mocks
 */
export class TestSetupHelper {
  private secureEnv = new SecureTestEnvironment();
  private mockPrisma: any;
  private mockAsyncAlertQueue: any;
  private mockPerformanceMonitor: any;
  private mockSecurityModules: any;

  constructor() {
    this.setupMocks();
  }

  private setupMocks(): void {
    // Create all mocks
    this.mockPrisma = PrismaMockFactory.createMock();
    this.mockAsyncAlertQueue = AsyncAlertQueueMockFactory.createMock();
    this.mockPerformanceMonitor = PerformanceMonitorMockFactory.createMock();
    
    this.mockSecurityModules = {
      dataSanitizer: SecurityModuleMockFactory.createDataSanitizerMock(),
      validationSchemas: SecurityModuleMockFactory.createValidationSchemasMock(),
      rbac: SecurityModuleMockFactory.createRbacMock(),
      secureLogger: SecurityModuleMockFactory.createSecureLoggerMock()
    };

    // Store globally for access by other components
    (global as any).__mockPrisma = this.mockPrisma;
    (global as any).__mockAsyncAlertQueue = this.mockAsyncAlertQueue;
    (global as any).__mockPerformanceMonitor = this.mockPerformanceMonitor;
    (global as any).__mockSecurityModules = this.mockSecurityModules;
  }

  public getMocks() {
    return {
      prisma: this.mockPrisma,
      asyncAlertQueue: this.mockAsyncAlertQueue,
      performanceMonitor: this.mockPerformanceMonitor,
      security: this.mockSecurityModules
    };
  }

  public async withControlledEnvironment<T>(
    envVars: Record<string, string>,
    testFn: () => Promise<T>
  ): Promise<T> {
    return this.secureEnv.withEnvironment(envVars, testFn);
  }

  public forceNonTestEnvironment(): void {
    this.secureEnv.forceNonTestEnvironment();
  }

  public restoreEnvironment(): void {
    this.secureEnv.restoreEnvironment();
  }

  public clearAllMocks(): void {
    this.mockPrisma._clearStores();
    this.mockAsyncAlertQueue._clearQueue();
    this.mockPerformanceMonitor._clearTimings();
    
    // Clear all jest mocks
    Object.values(this.mockPrisma.cronJobExecution).forEach((mock: any) => {
      if (mock.mockClear) mock.mockClear();
    });
    Object.values(this.mockPrisma.cronJobAlert).forEach((mock: any) => {
      if (mock.mockClear) mock.mockClear();
    });
    Object.values(this.mockAsyncAlertQueue).forEach((mock: any) => {
      if (mock.mockClear) mock.mockClear();
    });
    Object.values(this.mockPerformanceMonitor).forEach((mock: any) => {
      if (mock.mockClear) mock.mockClear();
    });
  }
}

// Global test utilities instance
export const secureTestUtils = new TestSetupHelper();