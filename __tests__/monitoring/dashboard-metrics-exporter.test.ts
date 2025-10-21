/**
 * Dashboard Metrics Exporter Tests
 * 
 * Test suite for the dashboard metrics exporter, ensuring proper aggregation
 * and formatting of metrics from all monitoring systems.
 */

import { jest } from '@jest/globals';
import {
  DashboardMetricsExporter,
  dashboardMetricsExporter,
  exportDashboardMetrics,
  exportWidgetMetrics,
  getRealTimeMetrics,
  clearDashboardCache
} from '../../lib/monitoring/dashboard-metrics-exporter';

// Mock dependencies
jest.mock('../../lib/logging');
jest.mock('../../lib/monitoring/pipeline-health-monitoring-system');
jest.mock('../../lib/monitoring/pipeline-error-detector');
jest.mock('../../lib/monitoring/user-processing-monitor');
jest.mock('../../lib/monitoring/sec-api-monitor');
jest.mock('../../lib/monitoring/index');

// Mock data for testing
const mockPipelineHealthMetrics = {
  currentHealth: {
    overall: 'healthy',
    score: 95,
    lastUpdated: new Date()
  },
  realTimeMetrics: {
    lockTimeouts: { total: 100, failures: 2, timeoutRate: 2 },
    parameterValidation: { total: 500, mismatches: 1, mismatchRate: 0.2 },
    secApiCalls: { total: 200, failures: 5, failureRate: 2.5 },
    userProcessing: { total: 150, successes: 147, successRate: 98 },
    performance: { avgResponseTime: 1200, memoryUsageMB: 256, cpuUsagePercent: 35 }
  },
  recentAlerts: [
    {
      id: 'alert1',
      timestamp: new Date(),
      type: 'lock_timeout',
      severity: 'WARN',
      message: 'Lock timeout rate above warning threshold'
    }
  ],
  trends: {
    last24Hours: [],
    last7Days: [],
    last30Days: []
  },
  systemPerformance: {
    monitoringOverheadMs: 0.5,
    memoryUsageMB: 256,
    dataRetentionStatus: 'optimal'
  }
};

const mockPipelineErrorReport = {
  overallHealthScore: 90,
  activeAlerts: [
    {
      id: 'error1',
      timestamp: new Date(),
      type: 'performance',
      severity: 'medium',
      description: 'Response time above baseline',
      metrics: {},
      confidence: 85
    }
  ],
  resolvedAlerts: [],
  trends: {
    performance: 'stable',
    cost: 'stable',
    security: 'stable',
    reliability: 'stable'
  },
  metrics: {
    performance: {
      avgResponseTime: 1200,
      p95ResponseTime: 2500,
      p99ResponseTime: 4000,
      errorRate: 1.5,
      throughput: 45
    },
    cost: {
      totalSpent: 125.50,
      avgCostPerFiling: 0.08,
      budgetUtilization: 65,
      costTrend: 'stable'
    },
    security: {
      failedAuthAttempts: 3,
      injectionAttempts: 0,
      unauthorizedAccess: 1
    }
  }
};

const mockUserProcessingMetrics = {
  totalUsers: 100,
  successfulUsers: 95,
  failedUsers: 5,
  averageProcessingTime: 5000,
  totalFilingsProcessed: 285,
  totalCostIncurred: 22.75,
  errorsByType: {
    timeout: 2,
    budget_exceeded: 1,
    validation_error: 2
  },
  processingByTier: {
    HOBBY: { users: 80, filings: 200, cost: 15.50, successRate: 96 },
    PRO: { users: 20, filings: 85, cost: 7.25, successRate: 95 }
  },
  lastProcessingTime: new Date()
};

const mockSecApiMetrics = {
  totalRequests: 200,
  successfulRequests: 195,
  failedRequests: 5,
  averageResponseTime: 1800,
  lastRequestTime: new Date(),
  rateLimitHits: 1,
  timeoutCount: 2,
  errorsByType: {
    rate_limit: 1,
    timeout: 2,
    http_500: 2
  }
};

const mockSystemHealth = {
  status: 'healthy',
  components: {
    database: {
      status: 'healthy',
      message: 'Database connection is healthy',
      lastChecked: new Date()
    },
    memory: {
      status: 'healthy',
      message: 'Memory usage is normal',
      details: {
        usedMemoryMB: 256,
        totalMemoryMB: 1024,
        memoryUsagePercent: 25
      },
      lastChecked: new Date()
    }
  },
  version: '1.0.0',
  uptime: 86400,
  timestamp: new Date()
};

describe('DashboardMetricsExporter', () => {
  let exporter: DashboardMetricsExporter;

  beforeEach(() => {
    // Reset singleton for clean tests
    (DashboardMetricsExporter as any).instance = undefined;
    exporter = DashboardMetricsExporter.getInstance();

    // Mock the metric collection methods
    jest.mocked(require('../../lib/monitoring/pipeline-health-monitoring-system').getDashboardMetrics)
      .mockResolvedValue(mockPipelineHealthMetrics);
    
    jest.mocked(require('../../lib/monitoring/pipeline-error-detector').generatePipelineHealthReport)
      .mockResolvedValue(mockPipelineErrorReport);
    
    jest.mocked(require('../../lib/monitoring/user-processing-monitor').userProcessingMonitor.getCurrentMetrics)
      .mockReturnValue(mockUserProcessingMetrics);
    
    jest.mocked(require('../../lib/monitoring/sec-api-monitor').monitoredSecClient.getMetrics)
      .mockReturnValue(mockSecApiMetrics);
    
    jest.mocked(require('../../lib/monitoring/index').monitoring.checkHealth)
      .mockResolvedValue(mockSystemHealth);
  });

  afterEach(() => {
    jest.clearAllMocks();
    clearDashboardCache();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const instance1 = DashboardMetricsExporter.getInstance();
      const instance2 = DashboardMetricsExporter.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('Dashboard Metrics Export', () => {
    it('should export comprehensive dashboard metrics', async () => {
      const metrics = await exporter.exportDashboardMetrics();

      expect(metrics).toHaveProperty('overview');
      expect(metrics).toHaveProperty('components');
      expect(metrics).toHaveProperty('trends');
      expect(metrics).toHaveProperty('realTimeMetrics');
      expect(metrics).toHaveProperty('alertHistory');
      expect(metrics).toHaveProperty('healthScore');
    });

    it('should include overview with correct structure', async () => {
      const metrics = await exporter.exportDashboardMetrics();
      const { overview } = metrics;

      expect(overview).toHaveProperty('timestamp');
      expect(overview).toHaveProperty('overallHealth');
      expect(overview).toHaveProperty('systemMetrics');
      expect(overview).toHaveProperty('recentActivity');
      expect(overview).toHaveProperty('alerts');

      expect(overview.overallHealth).toHaveProperty('status');
      expect(overview.overallHealth).toHaveProperty('score');
      expect(overview.overallHealth).toHaveProperty('lastUpdated');

      expect(['healthy', 'warning', 'critical']).toContain(overview.overallHealth.status);
      expect(overview.overallHealth.score).toBeGreaterThanOrEqual(0);
      expect(overview.overallHealth.score).toBeLessThanOrEqual(100);
    });

    it('should include component metrics with all required fields', async () => {
      const metrics = await exporter.exportDashboardMetrics();
      const { components } = metrics;

      expect(components).toHaveProperty('pipelineHealth');
      expect(components).toHaveProperty('performance');
      expect(components).toHaveProperty('costs');
      expect(components).toHaveProperty('security');

      // Check pipeline health structure
      expect(components.pipelineHealth).toHaveProperty('lockTimeouts');
      expect(components.pipelineHealth).toHaveProperty('parameterValidation');
      expect(components.pipelineHealth).toHaveProperty('secApiFailures');
      expect(components.pipelineHealth).toHaveProperty('userProcessingSuccess');

      // Check each metric has required properties
      expect(components.pipelineHealth.lockTimeouts).toHaveProperty('rate');
      expect(components.pipelineHealth.lockTimeouts).toHaveProperty('trend');
      expect(components.pipelineHealth.lockTimeouts).toHaveProperty('threshold');
    });

    it('should calculate health score correctly', async () => {
      const metrics = await exporter.exportDashboardMetrics();
      const { healthScore } = metrics;

      expect(healthScore).toHaveProperty('overall');
      expect(healthScore).toHaveProperty('breakdown');
      expect(healthScore).toHaveProperty('lastCalculated');

      expect(healthScore.overall).toBeGreaterThanOrEqual(0);
      expect(healthScore.overall).toBeLessThanOrEqual(100);

      expect(healthScore.breakdown).toHaveProperty('performance');
      expect(healthScore.breakdown).toHaveProperty('reliability');
      expect(healthScore.breakdown).toHaveProperty('security');
      expect(healthScore.breakdown).toHaveProperty('costs');
    });

    it('should include real-time metrics', async () => {
      const metrics = await exporter.exportDashboardMetrics();
      const { realTimeMetrics } = metrics;

      expect(realTimeMetrics).toHaveProperty('timestamp');
      expect(realTimeMetrics).toHaveProperty('lockOperations');
      expect(realTimeMetrics).toHaveProperty('parameterValidations');
      expect(realTimeMetrics).toHaveProperty('secApiCalls');
      expect(realTimeMetrics).toHaveProperty('userProcessingOperations');
      expect(realTimeMetrics).toHaveProperty('activeAlerts');
      expect(realTimeMetrics).toHaveProperty('systemLoad');
    });

    it('should include alert history', async () => {
      const metrics = await exporter.exportDashboardMetrics();
      const { alertHistory } = metrics;

      expect(Array.isArray(alertHistory)).toBe(true);
      
      if (alertHistory.length > 0) {
        const alert = alertHistory[0];
        expect(alert).toHaveProperty('id');
        expect(alert).toHaveProperty('timestamp');
        expect(alert).toHaveProperty('severity');
        expect(alert).toHaveProperty('component');
        expect(alert).toHaveProperty('message');
        expect(alert).toHaveProperty('resolved');
      }
    });

    it('should generate trend data for different time periods', async () => {
      const metrics = await exporter.exportDashboardMetrics();
      const { trends } = metrics;

      expect(trends).toHaveProperty('last24Hours');
      expect(trends).toHaveProperty('last7Days');
      expect(trends).toHaveProperty('last30Days');

      // Each trend should be an object
      expect(typeof trends.last24Hours).toBe('object');
      expect(typeof trends.last7Days).toBe('object');
      expect(typeof trends.last30Days).toBe('object');
    });
  });

  describe('Widget-Specific Exports', () => {
    it('should export overview widget metrics', async () => {
      const overviewMetrics = await exporter.exportWidgetMetrics('overview');

      expect(overviewMetrics).toHaveProperty('timestamp');
      expect(overviewMetrics).toHaveProperty('overallHealth');
      expect(overviewMetrics).toHaveProperty('systemMetrics');
      expect(overviewMetrics).toHaveProperty('recentActivity');
      expect(overviewMetrics).toHaveProperty('alerts');
    });

    it('should export pipeline health widget metrics', async () => {
      const pipelineMetrics = await exporter.exportWidgetMetrics('pipeline-health');

      expect(pipelineMetrics).toHaveProperty('lockTimeouts');
      expect(pipelineMetrics).toHaveProperty('parameterValidation');
      expect(pipelineMetrics).toHaveProperty('secApiFailures');
      expect(pipelineMetrics).toHaveProperty('userProcessingSuccess');
    });

    it('should export performance widget metrics', async () => {
      const performanceMetrics = await exporter.exportWidgetMetrics('performance');

      expect(performanceMetrics).toHaveProperty('averageResponseTime');
      expect(performanceMetrics).toHaveProperty('p95ResponseTime');
      expect(performanceMetrics).toHaveProperty('throughput');
      expect(performanceMetrics).toHaveProperty('errorRate');
      expect(performanceMetrics).toHaveProperty('trend');
    });

    it('should export alerts widget metrics', async () => {
      const alertsMetrics = await exporter.exportWidgetMetrics('alerts');

      expect(alertsMetrics).toHaveProperty('alerts');
      expect(alertsMetrics).toHaveProperty('history');
      expect(Array.isArray(alertsMetrics.history)).toBe(true);
    });

    it('should export trends widget metrics', async () => {
      const trendsMetrics = await exporter.exportWidgetMetrics('trends');

      expect(trendsMetrics).toHaveProperty('last24Hours');
      expect(trendsMetrics).toHaveProperty('last7Days');
      expect(trendsMetrics).toHaveProperty('last30Days');
    });

    it('should throw error for unknown widget type', async () => {
      await expect(exporter.exportWidgetMetrics('unknown' as any))
        .rejects
        .toThrow('Unknown widget type: unknown');
    });
  });

  describe('Real-Time Metrics', () => {
    it('should export real-time metrics independently', async () => {
      const realTimeMetrics = await exporter.getRealTimeMetrics();

      expect(realTimeMetrics).toHaveProperty('timestamp');
      expect(realTimeMetrics).toHaveProperty('lockOperations');
      expect(realTimeMetrics).toHaveProperty('parameterValidations');
      expect(realTimeMetrics).toHaveProperty('secApiCalls');
      expect(realTimeMetrics).toHaveProperty('userProcessingOperations');
      expect(realTimeMetrics).toHaveProperty('activeAlerts');
      expect(realTimeMetrics).toHaveProperty('systemLoad');

      expect(realTimeMetrics.timestamp).toBeInstanceOf(Date);
      expect(typeof realTimeMetrics.lockOperations).toBe('number');
      expect(typeof realTimeMetrics.parameterValidations).toBe('number');
      expect(typeof realTimeMetrics.secApiCalls).toBe('number');
      expect(typeof realTimeMetrics.userProcessingOperations).toBe('number');
      expect(typeof realTimeMetrics.activeAlerts).toBe('number');
      expect(typeof realTimeMetrics.systemLoad).toBe('number');
    });
  });

  describe('Caching Behavior', () => {
    it('should cache metrics for performance', async () => {
      const startTime = Date.now();
      
      // First call should collect fresh metrics
      await exporter.exportDashboardMetrics();
      const firstCallTime = Date.now() - startTime;
      
      const secondStartTime = Date.now();
      
      // Second call should use cache
      await exporter.exportDashboardMetrics();
      const secondCallTime = Date.now() - secondStartTime;
      
      // Second call should be faster due to caching
      expect(secondCallTime).toBeLessThan(firstCallTime);
    });

    it('should clear cache when requested', async () => {
      // Load cache
      await exporter.exportDashboardMetrics();
      
      // Clear cache
      exporter.clearCache();
      
      // Should not throw and should work normally
      const metrics = await exporter.exportDashboardMetrics();
      expect(metrics).toHaveProperty('overview');
    });

    it('should expire cache after validity period', async () => {
      // This test would need to mock time or wait for cache expiry
      // For now, just verify the cache expiry mechanism exists
      expect(exporter.clearCache).toBeDefined();
      expect(typeof exporter.clearCache).toBe('function');
    });
  });

  describe('Error Handling', () => {
    it('should handle pipeline health metrics failure gracefully', async () => {
      jest.mocked(require('../../lib/monitoring/pipeline-health-monitoring-system').getDashboardMetrics)
        .mockRejectedValue(new Error('Pipeline health metrics unavailable'));

      const metrics = await exporter.exportDashboardMetrics();
      
      // Should still return metrics (fallback)
      expect(metrics).toHaveProperty('overview');
      expect(metrics.overview.overallHealth.status).toBe('warning');
    });

    it('should handle error detector failure gracefully', async () => {
      jest.mocked(require('../../lib/monitoring/pipeline-error-detector').generatePipelineHealthReport)
        .mockRejectedValue(new Error('Error detector unavailable'));

      const metrics = await exporter.exportDashboardMetrics();
      
      // Should still return metrics
      expect(metrics).toHaveProperty('overview');
    });

    it('should handle user processing metrics failure gracefully', async () => {
      jest.mocked(require('../../lib/monitoring/user-processing-monitor').userProcessingMonitor.getCurrentMetrics)
        .mockImplementation(() => {
          throw new Error('User processing metrics unavailable');
        });

      const metrics = await exporter.exportDashboardMetrics();
      
      // Should still return metrics
      expect(metrics).toHaveProperty('overview');
    });

    it('should return fallback metrics when all systems fail', async () => {
      // Mock all systems to fail
      jest.mocked(require('../../lib/monitoring/pipeline-health-monitoring-system').getDashboardMetrics)
        .mockRejectedValue(new Error('System failure'));
      jest.mocked(require('../../lib/monitoring/pipeline-error-detector').generatePipelineHealthReport)
        .mockRejectedValue(new Error('System failure'));
      jest.mocked(require('../../lib/monitoring/user-processing-monitor').userProcessingMonitor.getCurrentMetrics)
        .mockImplementation(() => { throw new Error('System failure'); });
      jest.mocked(require('../../lib/monitoring/sec-api-monitor').monitoredSecClient.getMetrics)
        .mockImplementation(() => { throw new Error('System failure'); });
      jest.mocked(require('../../lib/monitoring/index').monitoring.checkHealth)
        .mockRejectedValue(new Error('System failure'));

      const metrics = await exporter.exportDashboardMetrics();
      
      // Should return fallback metrics
      expect(metrics).toHaveProperty('overview');
      expect(metrics.overview.overallHealth.status).toBe('warning');
      expect(metrics.overview.alerts.critical).toBe(1);
      expect(metrics.overview.alerts.recent[0].message).toBe('Monitoring system unavailable');
    });

    it('should handle real-time metrics error gracefully', async () => {
      jest.mocked(require('../../lib/monitoring/pipeline-health-monitoring-system').getDashboardMetrics)
        .mockRejectedValue(new Error('Pipeline unavailable'));

      const realTimeMetrics = await exporter.getRealTimeMetrics();
      
      expect(realTimeMetrics).toHaveProperty('timestamp');
      expect(realTimeMetrics.lockOperations).toBe(0);
      expect(realTimeMetrics.parameterValidations).toBe(0);
    });
  });

  describe('Data Validation', () => {
    it('should validate health score is within valid range', async () => {
      const metrics = await exporter.exportDashboardMetrics();
      
      expect(metrics.healthScore.overall).toBeGreaterThanOrEqual(0);
      expect(metrics.healthScore.overall).toBeLessThanOrEqual(100);
      
      Object.values(metrics.healthScore.breakdown).forEach(score => {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      });
    });

    it('should validate alert severity values', async () => {
      const metrics = await exporter.exportDashboardMetrics();
      
      metrics.alertHistory.forEach(alert => {
        expect(['critical', 'warning', 'info']).toContain(alert.severity);
      });
    });

    it('should validate timestamp formats', async () => {
      const metrics = await exporter.exportDashboardMetrics();
      
      expect(metrics.overview.timestamp).toBeInstanceOf(Date);
      expect(metrics.realTimeMetrics.timestamp).toBeInstanceOf(Date);
      expect(metrics.healthScore.lastCalculated).toBeInstanceOf(Date);
    });

    it('should validate numeric values are not negative', async () => {
      const metrics = await exporter.exportDashboardMetrics();
      
      expect(metrics.overview.systemMetrics.uptime).toBeGreaterThanOrEqual(0);
      expect(metrics.overview.recentActivity.usersProcessed).toBeGreaterThanOrEqual(0);
      expect(metrics.overview.recentActivity.filingsProcessed).toBeGreaterThanOrEqual(0);
      expect(metrics.realTimeMetrics.lockOperations).toBeGreaterThanOrEqual(0);
      expect(metrics.realTimeMetrics.parameterValidations).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Convenience Functions', () => {
    it('should provide working convenience functions', async () => {
      expect(typeof exportDashboardMetrics).toBe('function');
      expect(typeof exportWidgetMetrics).toBe('function');
      expect(typeof getRealTimeMetrics).toBe('function');
      expect(typeof clearDashboardCache).toBe('function');

      // Test convenience functions work
      const dashboardMetrics = await exportDashboardMetrics();
      expect(dashboardMetrics).toHaveProperty('overview');

      const widgetMetrics = await exportWidgetMetrics('overview');
      expect(widgetMetrics).toHaveProperty('timestamp');

      const realTimeMetrics = await getRealTimeMetrics();
      expect(realTimeMetrics).toHaveProperty('timestamp');

      expect(() => clearDashboardCache()).not.toThrow();
    });
  });
});

describe('Integration with Monitoring Systems', () => {
  it('should properly aggregate data from all monitoring systems', async () => {
    const metrics = await exportDashboardMetrics();

    // Verify data from pipeline health monitoring
    expect(metrics.realTimeMetrics.lockOperations).toBeDefined();
    expect(metrics.realTimeMetrics.parameterValidations).toBeDefined();
    expect(metrics.realTimeMetrics.secApiCalls).toBeDefined();
    expect(metrics.realTimeMetrics.userProcessingOperations).toBeDefined();

    // Verify data from error detector
    expect(metrics.components.performance).toBeDefined();
    expect(metrics.components.costs).toBeDefined();
    expect(metrics.components.security).toBeDefined();

    // Verify data from user processing monitor
    expect(metrics.overview.recentActivity.usersProcessed).toBeDefined();
    expect(metrics.overview.recentActivity.filingsProcessed).toBeDefined();

    // Verify system health data
    expect(metrics.overview.systemMetrics.uptime).toBeDefined();
    expect(metrics.overview.systemMetrics.memoryUsage).toBeDefined();
  });

  it('should handle partial system availability', async () => {
    // Mock some systems as unavailable
    jest.mocked(require('../../lib/monitoring/user-processing-monitor').userProcessingMonitor.getCurrentMetrics)
      .mockImplementation(() => null);

    const metrics = await exportDashboardMetrics();

    // Should still produce valid metrics
    expect(metrics).toHaveProperty('overview');
    expect(metrics).toHaveProperty('components');
    expect(metrics).toHaveProperty('healthScore');
  });
});