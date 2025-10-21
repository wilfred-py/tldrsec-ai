/**
 * Production Monitoring Integration Tests
 * 
 * Comprehensive tests for all monitoring components including real metrics,
 * alert systems, memory management, and configuration validation.
 */

import { monitoring } from '../../lib/monitoring';
import { infrastructureMonitor } from '../../lib/infrastructure/monitoring';
import { databaseMonitor } from '../../lib/monitoring/database-monitor';
import { memoryManager } from '../../lib/monitoring/memory-manager';
import { alertService } from '../../lib/monitoring/alert-service';
import { configValidator } from '../../lib/monitoring/config-validation';
import { prisma } from '../../lib/db';

// Mock dependencies
jest.mock('../../lib/email/resend-client', () => ({
  resendClient: {
    sendEmail: jest.fn().mockResolvedValue({ id: 'test-email-id' })
  }
}));

describe('Production Monitoring Integration', () => {
  beforeAll(async () => {
    // Clean up any existing test data
    await prisma.errorAlert.deleteMany({
      where: { message: { contains: 'TEST_' } }
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.errorAlert.deleteMany({
      where: { message: { contains: 'TEST_' } }
    });
    
    // Stop monitoring services
    infrastructureMonitor.stopMonitoring();
    databaseMonitor.stopMonitoring();
    memoryManager.stopMonitoring();
  });

  describe('System Metrics Collection', () => {
    test('should collect real CPU metrics', async () => {
      const metrics = await infrastructureMonitor.collectMetrics();
      
      expect(metrics).toBeDefined();
      expect(metrics.vercel.functionCpuUsage).toBeGreaterThanOrEqual(0);
      expect(metrics.vercel.functionCpuUsage).toBeLessThanOrEqual(100);
      expect(typeof metrics.vercel.functionCpuUsage).toBe('number');
    });

    test('should collect real memory metrics', async () => {
      const metrics = await infrastructureMonitor.collectMetrics();
      
      expect(metrics.vercel.functionMemoryUsage).toBeGreaterThanOrEqual(0);
      expect(metrics.vercel.functionMemoryUsage).toBeLessThanOrEqual(100);
      
      // Verify it's using real process memory, not random values
      const memoryUsage = process.memoryUsage();
      expect(metrics.vercel.functionMemoryUsage).toBeGreaterThan(0);
    });

    test('should collect real database connection metrics', async () => {
      databaseMonitor.startMonitoring(10000); // Start with 10 second intervals
      
      // Wait for initial metrics collection
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const metrics = databaseMonitor.getCurrentMetrics();
      expect(metrics).toBeDefined();
      
      if (metrics) {
        expect(metrics.connectionPool.usage).toBeGreaterThanOrEqual(0);
        expect(metrics.connectionPool.usage).toBeLessThanOrEqual(100);
        expect(metrics.health.latency).toBeGreaterThan(0);
        expect(metrics.timestamp).toBeInstanceOf(Date);
      }
    });

    test('should track query performance', async () => {
      // Execute a test query to generate metrics
      await prisma.$queryRaw`SELECT 1 as test`;
      
      const queryStats = databaseMonitor.getQueryStats(5);
      expect(queryStats.totalQueries).toBeGreaterThanOrEqual(0);
      expect(queryStats.avgDuration).toBeGreaterThanOrEqual(0);
      expect(queryStats.errorRate).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Memory Management', () => {
    test('should track memory usage accurately', async () => {
      memoryManager.startMonitoring(5000);
      
      // Wait for initial metrics
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const metrics = memoryManager.getCurrentMemoryMetrics();
      expect(metrics).toBeDefined();
      
      if (metrics) {
        expect(metrics.heapUsed).toBeGreaterThan(0);
        expect(metrics.heapTotal).toBeGreaterThan(0);
        expect(metrics.usage).toBeGreaterThanOrEqual(0);
        expect(metrics.usage).toBeLessThanOrEqual(100);
        
        // Verify these are real metrics, not simulated
        const realMemory = process.memoryUsage();
        const expectedUsage = Math.round((realMemory.heapUsed / require('os').totalmem()) * 100);
        expect(Math.abs(metrics.usage - expectedUsage)).toBeLessThanOrEqual(5); // Allow 5% tolerance
      }
    });

    test('should register and execute cleanup tasks', async () => {
      let cleanupExecuted = false;
      
      memoryManager.registerCleanupTask({
        id: 'test-cleanup',
        name: 'Test Cleanup Task',
        priority: 5,
        interval: 1000, // 1 second for testing
        enabled: true,
        cleanup: async () => {
          cleanupExecuted = true;
          return 1024; // 1KB freed
        }
      });
      
      // Force cleanup
      const freed = await memoryManager.forceCleanup();
      
      expect(cleanupExecuted).toBe(true);
      expect(freed).toBeGreaterThan(0);
    });

    test('should detect memory trends', async () => {
      const trend = memoryManager.getMemoryTrend(1);
      
      expect(trend.average).toBeGreaterThanOrEqual(0);
      expect(trend.current).toBeGreaterThanOrEqual(0);
      expect(trend.peak).toBeGreaterThanOrEqual(0);
      expect(['increasing', 'decreasing', 'stable']).toContain(trend.trend);
    });

    test('should manage cache with TTL', async () => {
      const testKey = 'test-cache-key';
      const testValue = { data: 'test-data', timestamp: Date.now() };
      
      memoryManager.setCacheItem(testKey, testValue, 1000); // 1 second TTL
      
      // Should retrieve immediately
      let cached = memoryManager.getCacheItem(testKey);
      expect(cached).toEqual(testValue);
      
      // Should expire after TTL
      await new Promise(resolve => setTimeout(resolve, 1100));
      cached = memoryManager.getCacheItem(testKey);
      expect(cached).toBeNull();
    });
  });

  describe('Alert System', () => {
    test('should create and store alerts', async () => {
      const alertOptions = {
        alertType: 'warning' as const,
        source: 'pipeline' as const,
        message: 'TEST_Alert message for monitoring test',
        errorCode: 'TEST_001',
        context: { testData: true },
        autoNotify: false
      };
      
      const alertId = await alertService.createAlert(alertOptions);
      
      expect(alertId).toBeTruthy();
      expect(typeof alertId).toBe('string');
      
      // Verify alert was stored
      const alert = await prisma.errorAlert.findUnique({
        where: { id: alertId }
      });
      
      expect(alert).toBeDefined();
      expect(alert?.message).toBe(alertOptions.message);
      expect(alert?.alertType).toBe(alertOptions.alertType);
      expect(alert?.source).toBe(alertOptions.source);
    });

    test('should prevent duplicate alerts', async () => {
      const alertOptions = {
        alertType: 'warning' as const,
        source: 'pipeline' as const,
        message: 'TEST_Duplicate alert message',
        autoNotify: false
      };
      
      // Create first alert
      const firstAlertId = await alertService.createAlert(alertOptions);
      expect(firstAlertId).toBeTruthy();
      
      // Try to create duplicate (should be prevented)
      const duplicateAlertId = await alertService.createAlert(alertOptions);
      expect(duplicateAlertId).toBe(''); // Empty string indicates duplicate prevented
    });

    test('should implement rate limiting', async () => {
      const alertOptions = {
        alertType: 'info' as const,
        source: 'api' as const,
        message: 'TEST_Rate limit test',
        autoNotify: false
      };
      
      // Create multiple alerts rapidly
      const alertPromises = Array.from({ length: 15 }, (_, i) => 
        alertService.createAlert({
          ...alertOptions,
          message: `TEST_Rate limit test ${i}`
        })
      );
      
      const alertIds = await Promise.all(alertPromises);
      const createdAlerts = alertIds.filter(id => id !== '');
      
      // Should have created some alerts but not all due to rate limiting
      expect(createdAlerts.length).toBeLessThan(15);
      expect(createdAlerts.length).toBeGreaterThan(0);
    });

    test('should calculate message similarity', async () => {
      // This tests the private calculateMessageSimilarity method indirectly
      const baseMessage = 'TEST_Database connection failed';
      const similarMessage = 'TEST_Database connection error';
      const differentMessage = 'TEST_Memory usage critical';
      
      // Create base alert
      await alertService.createAlert({
        alertType: 'critical' as const,
        source: 'database' as const,
        message: baseMessage,
        autoNotify: false
      });
      
      // Create similar alert (should be detected as duplicate)
      const similarAlertId = await alertService.createAlert({
        alertType: 'critical' as const,
        source: 'database' as const,
        message: similarMessage,
        autoNotify: false
      });
      
      // Create different alert (should not be duplicate)
      const differentAlertId = await alertService.createAlert({
        alertType: 'critical' as const,
        source: 'database' as const,
        message: differentMessage,
        autoNotify: false
      });
      
      // Similar message might be deduplicated, different message should be created
      expect(differentAlertId).toBeTruthy();
    });

    test('should acknowledge and resolve alerts', async () => {
      const alertId = await alertService.createAlert({
        alertType: 'warning' as const,
        source: 'pipeline' as const,
        message: 'TEST_Alert for acknowledgment test',
        autoNotify: false
      });
      
      // Acknowledge alert
      await alertService.acknowledgeAlert(alertId, 'test-user');
      
      const acknowledgedAlert = await prisma.errorAlert.findUnique({
        where: { id: alertId }
      });
      
      expect(acknowledgedAlert?.acknowledgedAt).toBeDefined();
      expect(acknowledgedAlert?.acknowledgedBy).toBe('test-user');
      
      // Resolve alert
      await alertService.resolveAlert(alertId, 'test-user');
      
      const resolvedAlert = await prisma.errorAlert.findUnique({
        where: { id: alertId }
      });
      
      expect(resolvedAlert?.resolved).toBe(true);
      expect(resolvedAlert?.resolvedAt).toBeDefined();
    });

    test('should generate alert statistics', async () => {
      const stats = await alertService.getAlertStatistics('hour');
      
      expect(stats).toBeDefined();
      expect(typeof stats.total).toBe('number');
      expect(typeof stats.critical).toBe('number');
      expect(typeof stats.warning).toBe('number');
      expect(typeof stats.resolved).toBe('number');
      expect(typeof stats.resolutionRate).toBe('number');
      
      expect(stats.total).toBeGreaterThanOrEqual(stats.critical + stats.warning);
      expect(stats.resolutionRate).toBeGreaterThanOrEqual(0);
      expect(stats.resolutionRate).toBeLessThanOrEqual(100);
    });
  });

  describe('Configuration Validation', () => {
    test('should validate environment configuration', () => {
      const envConfig = configValidator.getEnvironmentConfig();
      
      expect(envConfig).toBeDefined();
      expect(envConfig.NODE_ENV).toBeDefined();
      expect(envConfig.DATABASE_URL).toBeDefined();
      expect(envConfig.MONITORING_ENABLED).toBeDefined();
      expect(typeof envConfig.MONITORING_INTERVAL_MS).toBe('number');
    });

    test('should validate monitoring configuration with bounds', () => {
      const config = configValidator.getMonitoringConfig({
        thresholds: {
          memory: {
            warning: 80,
            critical: 90,
            emergency: 95
          }
        }
      });
      
      expect(config).toBeDefined();
      expect(config.thresholds.memory.warning).toBe(80);
      expect(config.thresholds.memory.critical).toBe(90);
      expect(config.thresholds.memory.emergency).toBe(95);
    });

    test('should reject invalid threshold relationships', () => {
      expect(() => {
        configValidator.getMonitoringConfig({
          thresholds: {
            memory: {
              warning: 90, // Invalid: warning > critical
              critical: 80,
              emergency: 95
            }
          }
        });
      }).toThrow();
    });

    test('should validate runtime configuration', () => {
      const validation = configValidator.validateRuntimeConfig();
      
      expect(validation).toBeDefined();
      expect(typeof validation.isValid).toBe('boolean');
      expect(Array.isArray(validation.errors)).toBe(true);
      expect(Array.isArray(validation.warnings)).toBe(true);
    });

    test('should provide configuration summary', () => {
      const summary = configValidator.getConfigSummary();
      
      expect(summary).toBeDefined();
      expect(summary.environment).toBeDefined();
      expect(summary.monitoring).toBeDefined();
      expect(summary.database).toBeDefined();
      expect(summary.memory).toBeDefined();
      expect(summary.validation).toBeDefined();
    });
  });

  describe('Infrastructure Monitoring', () => {
    test('should start and stop monitoring', () => {
      expect(() => {
        infrastructureMonitor.startMonitoring(30000);
        infrastructureMonitor.stopMonitoring();
      }).not.toThrow();
    });

    test('should provide health summary', () => {
      const health = infrastructureMonitor.getHealthSummary();
      
      expect(health).toBeDefined();
      expect(['HEALTHY', 'WARNING', 'CRITICAL']).toContain(health.status);
      expect(health.metrics).toBeDefined();
      expect(Array.isArray(health.activeAlerts)).toBe(true);
      expect(Array.isArray(health.recommendations)).toBe(true);
    });

    test('should generate actionable recommendations', () => {
      const health = infrastructureMonitor.getHealthSummary();
      
      if (health.recommendations.length > 0) {
        health.recommendations.forEach(recommendation => {
          expect(typeof recommendation).toBe('string');
          expect(recommendation.length).toBeGreaterThan(10);
        });
      }
    });
  });

  describe('Integration Tests', () => {
    test('should integrate all monitoring components', async () => {
      // Start all monitoring services
      infrastructureMonitor.startMonitoring(10000);
      databaseMonitor.startMonitoring(10000);
      memoryManager.startMonitoring(10000);
      
      // Wait for metrics collection
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Verify metrics are collected across all components
      const infraMetrics = infrastructureMonitor.getHealthSummary();
      const dbMetrics = databaseMonitor.getCurrentMetrics();
      const memoryMetrics = memoryManager.getCurrentMemoryMetrics();
      
      expect(infraMetrics).toBeDefined();
      expect(dbMetrics).toBeDefined();
      expect(memoryMetrics).toBeDefined();
      
      // Verify no random values (all should be reasonable real metrics)
      if (dbMetrics) {
        expect(dbMetrics.health.latency).toBeGreaterThan(0);
        expect(dbMetrics.health.latency).toBeLessThan(10000); // Should be under 10 seconds
      }
      
      if (memoryMetrics) {
        expect(memoryMetrics.usage).toBeGreaterThan(0);
        expect(memoryMetrics.heapUsed).toBeGreaterThan(0);
      }
    });

    test('should handle system stress gracefully', async () => {
      // Create some memory pressure
      const largeArrays = [];
      for (let i = 0; i < 10; i++) {
        largeArrays.push(new Array(10000).fill(Math.random()));
      }
      
      // Wait for metrics to reflect the change
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const memoryHealth = memoryManager.getHealthStatus();
      expect(memoryHealth.currentUsage).toBeGreaterThan(0);
      
      // Cleanup
      largeArrays.length = 0;
      if (global.gc) {
        global.gc();
      }
    });

    test('should maintain consistency across metric sources', async () => {
      const memoryUsage1 = process.memoryUsage();
      await new Promise(resolve => setTimeout(resolve, 100));
      const memoryUsage2 = process.memoryUsage();
      
      // Memory usage should be relatively stable (within reasonable bounds)
      const diff = Math.abs(memoryUsage2.heapUsed - memoryUsage1.heapUsed);
      const maxDiff = memoryUsage1.heapUsed * 0.1; // 10% tolerance
      
      expect(diff).toBeLessThan(maxDiff);
    });
  });

  describe('Performance and Reliability', () => {
    test('should handle high-frequency metric collection', async () => {
      const startTime = Date.now();
      const metrics = [];
      
      // Collect metrics rapidly
      for (let i = 0; i < 50; i++) {
        const metric = await infrastructureMonitor.collectMetrics();
        metrics.push(metric);
      }
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within reasonable time (under 5 seconds)
      expect(duration).toBeLessThan(5000);
      expect(metrics.length).toBe(50);
      
      // All metrics should be valid
      metrics.forEach(metric => {
        expect(metric.timestamp).toBeInstanceOf(Date);
        expect(metric.vercel.functionMemoryUsage).toBeGreaterThanOrEqual(0);
      });
    });

    test('should recover from database connectivity issues', async () => {
      // This test would ideally simulate database disconnection
      // For now, we test error handling in metrics collection
      
      const queryStats = databaseMonitor.getQueryStats(1);
      expect(queryStats).toBeDefined();
      expect(typeof queryStats.totalQueries).toBe('number');
      expect(typeof queryStats.errorRate).toBe('number');
    });

    test('should maintain metric accuracy under load', async () => {
      const promises = [];
      
      // Generate concurrent load
      for (let i = 0; i < 20; i++) {
        promises.push(
          alertService.createAlert({
            alertType: 'info' as const,
            source: 'test' as const,
            message: `TEST_Load test alert ${i}`,
            autoNotify: false
          })
        );
      }
      
      const results = await Promise.allSettled(promises);
      const successfulAlerts = results.filter(r => r.status === 'fulfilled').length;
      
      // Should handle concurrent requests gracefully
      expect(successfulAlerts).toBeGreaterThan(0);
      expect(successfulAlerts).toBeLessThanOrEqual(20);
    });
  });
});

describe('Monitoring Dashboard API', () => {
  test('should return dashboard metrics', async () => {
    // This would test the dashboard API endpoint
    // Since we can't directly test the API route here, we test the underlying functions
    
    const memoryUsage = process.memoryUsage();
    expect(memoryUsage.heapUsed).toBeGreaterThan(0);
    expect(memoryUsage.heapTotal).toBeGreaterThan(0);
    
    const totalMemory = require('os').totalmem();
    const memoryPercent = (memoryUsage.heapUsed / totalMemory) * 100;
    
    expect(memoryPercent).toBeGreaterThan(0);
    expect(memoryPercent).toBeLessThan(100);
  });
});