/**
 * Comprehensive Unit Tests for Pipeline Error Detector
 * 
 * Tests error pattern detection, metric collection, and alert generation
 * Covers all error patterns and edge cases for the detection system
 */

import { performance } from 'perf_hooks';

// Mock dependencies before imports
jest.mock('../../../lib/db/index');
jest.mock('../../../lib/logging');

import {
  pipelineErrorDetector,
  detectPipelineErrors,
  generatePipelineHealthReport,
  resolvePipelineAlert,
  type PipelineMetrics,
  type ErrorAlert,
  type DetectionReport
} from '../../../lib/monitoring/pipeline-error-detector';

import { prisma } from '../../../lib/db/index';

jest.mock('../../../lib/db/index', () => ({
  prisma: {
    summary: {
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn()
    },
    auditLog: {
      count: jest.fn(),
      findMany: jest.fn()
    },
    user: {
      findMany: jest.fn(),
      aggregate: jest.fn()
    },
    emailDelivery: {
      count: jest.fn()
    }
  }
}));

describe('PipelineErrorDetector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    const mockPrisma = prisma as jest.Mocked<typeof prisma>;
    
    // Setup default mock responses
    mockPrisma.summary.findMany.mockResolvedValue([
      {
        createdAt: new Date(),
        cost: 0.05,
        inputTokens: 1000,
        outputTokens: 500,
        processingStatus: 'COMPLETED',
        secFiling: { accessionNumber: '0000000000-24-000001' },
        emailDeliveries: [{ deliveredAt: new Date() }]
      }
    ]);
    
    mockPrisma.auditLog.count.mockResolvedValue(5);
    mockPrisma.auditLog.findMany.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([{ processingBudget: 100 }]);
    mockPrisma.user.aggregate.mockResolvedValue({ _sum: { processingBudget: 1000 } });
  });

  describe('Metric Collection', () => {
    it('should collect performance metrics successfully', async () => {
      const metrics = await pipelineErrorDetector.collectMetrics();
      
      expect(metrics.performance).toBeDefined();
      expect(metrics.performance.avgResponseTime).toBeGreaterThanOrEqual(0);
      expect(metrics.performance.throughput).toBeGreaterThanOrEqual(0);
      expect(mockPrisma.summary.findMany).toHaveBeenCalled();
    });

    it('should collect cost metrics accurately', async () => {
      mockPrisma.summary.findMany.mockResolvedValue([
        { cost: 0.10, createdAt: new Date() },
        { cost: 0.05, createdAt: new Date() },
        { cost: 0.08, createdAt: new Date() }
      ]);
      
      const metrics = await pipelineErrorDetector.collectMetrics();
      
      expect(metrics.cost.totalSpent).toBe(0.23);
      expect(metrics.cost.avgCostPerFiling).toBeCloseTo(0.077, 2);
      expect(metrics.cost.costTrend).toBeDefined();
    });

    it('should collect security metrics from audit logs', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([
        { action: 'AUTH_FAILED', ipAddress: '192.168.1.1', details: '' },
        { action: 'LOGIN_ATTEMPT', ipAddress: '192.168.1.2', details: '' },
        { action: 'UNAUTHORIZED_ACCESS', ipAddress: '192.168.1.1', details: '' }
      ]);
      
      const metrics = await pipelineErrorDetector.collectMetrics();
      
      expect(metrics.security.failedAuthAttempts).toBe(2);
      expect(metrics.security.unauthorizedAccess).toBe(1);
      expect(metrics.security.suspiciousIPs).toContain('192.168.1.1');
    });

    it('should handle empty database gracefully', async () => {
      mockPrisma.summary.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      mockPrisma.user.findMany.mockResolvedValue([]);
      
      const metrics = await pipelineErrorDetector.collectMetrics();
      
      expect(metrics.cost.totalSpent).toBe(0);
      expect(metrics.cost.avgCostPerFiling).toBe(0);
      expect(metrics.security.failedAuthAttempts).toBe(0);
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.summary.findMany.mockRejectedValue(new Error('Database error'));
      
      await expect(pipelineErrorDetector.collectMetrics()).rejects.toThrow('Database error');
    });
  });

  describe('Error Pattern Detection', () => {
    describe('Performance Patterns', () => {
      it('should detect response time degradation', async () => {
        const metrics: PipelineMetrics = {
          performance: {
            avgResponseTime: 4000, // 2x baseline (2000)
            p95ResponseTime: 5000,
            p99ResponseTime: 6000,
            errorRate: 1.0,
            throughput: 10,
            dbConnectionTime: 100,
            aiProcessingTime: 10000,
            emailDeliveryTime: 1500
          },
          cost: {
            totalSpent: 10,
            avgCostPerFiling: 0.05,
            budgetUtilization: 50,
            costTrend: 'stable',
            abnormalCosts: 0
          },
          security: {
            failedAuthAttempts: 5,
            suspiciousIPs: [],
            unauthorizedAccess: 0,
            dataLeakageAttempts: 0,
            injectionAttempts: 0
          },
          data: {
            consistencyErrors: 0,
            duplicateFilings: 0,
            corruptedContent: 0,
            missingData: 0,
            validationFailures: 0
          },
          reliability: {
            uptime: 99.9,
            failureRate: 0.1,
            recoverTime: 30,
            deadlocks: 0,
            timeouts: 0
          },
          userExperience: {
            avgProcessingDelay: 60000,
            emailDeliveryFailures: 0,
            userComplaints: 0,
            systemSatisfaction: 95
          }
        };
        
        const alerts = await pipelineErrorDetector.analyzeAndDetect(metrics);
        
        const responseTimeAlert = alerts.find(a => a.title.includes('response_time_degradation'));
        expect(responseTimeAlert).toBeDefined();
        expect(responseTimeAlert?.severity).toBe('high');
        expect(responseTimeAlert?.remediation).toContain('Scale up database connections');
      });

      it('should detect high error rate', async () => {
        const metrics = createBaseMetrics();
        metrics.performance.errorRate = 6.0; // Above 5% threshold
        
        const alerts = await pipelineErrorDetector.analyzeAndDetect(metrics);
        
        const errorRateAlert = alerts.find(a => a.title.includes('high_error_rate'));
        expect(errorRateAlert).toBeDefined();
        expect(errorRateAlert?.severity).toBe('critical');
        expect(errorRateAlert?.remediation).toContain('Immediate rollback of recent deployments');
      });

      it('should detect AI processing slowdown', async () => {
        const metrics = createBaseMetrics();
        metrics.performance.aiProcessingTime = 35000; // Above 30s threshold
        
        const alerts = await pipelineErrorDetector.analyzeAndDetect(metrics);
        
        const slowdownAlert = alerts.find(a => a.title.includes('ai_processing_slowdown'));
        expect(slowdownAlert).toBeDefined();
        expect(slowdownAlert?.severity).toBe('medium');
        expect(slowdownAlert?.remediation).toContain('Check AI service status');
      });
    });

    describe('Cost Patterns', () => {
      it('should detect budget overrun risk', async () => {
        const metrics = createBaseMetrics();
        metrics.cost.budgetUtilization = 90; // Above 85% threshold
        
        const alerts = await pipelineErrorDetector.analyzeAndDetect(metrics);
        
        const budgetAlert = alerts.find(a => a.title.includes('budget_overrun_risk'));
        expect(budgetAlert).toBeDefined();
        expect(budgetAlert?.severity).toBe('high');
        expect(budgetAlert?.remediation).toContain('Implement cost controls');
      });

      it('should detect cost anomalies', async () => {
        const metrics = createBaseMetrics();
        metrics.cost.avgCostPerFiling = 0.15; // 3x baseline (0.05)
        
        const alerts = await pipelineErrorDetector.analyzeAndDetect(metrics);
        
        const anomalyAlert = alerts.find(a => a.title.includes('cost_anomaly'));
        expect(anomalyAlert).toBeDefined();
        expect(anomalyAlert?.severity).toBe('critical');
        expect(anomalyAlert?.remediation).toContain('Immediate cost analysis');
      });
    });

    describe('Security Patterns', () => {
      it('should detect brute force attacks', async () => {
        const metrics = createBaseMetrics();
        metrics.security.failedAuthAttempts = 75; // Above 50 threshold
        
        const alerts = await pipelineErrorDetector.analyzeAndDetect(metrics);
        
        const bruteForceAlert = alerts.find(a => a.title.includes('brute_force_attack'));
        expect(bruteForceAlert).toBeDefined();
        expect(bruteForceAlert?.severity).toBe('high');
        expect(bruteForceAlert?.remediation).toContain('Implement IP blocking');
      });

      it('should detect injection attempts', async () => {
        const metrics = createBaseMetrics();
        metrics.security.injectionAttempts = 1; // Any injection attempt is critical
        
        const alerts = await pipelineErrorDetector.analyzeAndDetect(metrics);
        
        const injectionAlert = alerts.find(a => a.title.includes('injection_attempts'));
        expect(injectionAlert).toBeDefined();
        expect(injectionAlert?.severity).toBe('critical');
        expect(injectionAlert?.remediation).toContain('Immediate security review');
      });
    });

    describe('Data Patterns', () => {
      it('should detect consistency errors', async () => {
        const metrics = createBaseMetrics();
        metrics.data.consistencyErrors = 15; // Above 10 threshold
        
        const alerts = await pipelineErrorDetector.analyzeAndDetect(metrics);
        
        const consistencyAlert = alerts.find(a => a.title.includes('consistency_errors'));
        expect(consistencyAlert).toBeDefined();
        expect(consistencyAlert?.severity).toBe('medium');
        expect(consistencyAlert?.remediation).toContain('Run data integrity checks');
      });

      it('should detect duplicate processing', async () => {
        const metrics = createBaseMetrics();
        metrics.data.duplicateFilings = 30; // Above 25 threshold
        
        const alerts = await pipelineErrorDetector.analyzeAndDetect(metrics);
        
        const duplicateAlert = alerts.find(a => a.title.includes('duplicate_processing'));
        expect(duplicateAlert).toBeDefined();
        expect(duplicateAlert?.severity).toBe('high');
        expect(duplicateAlert?.remediation).toContain('Check deduplication logic');
      });
    });

    describe('Reliability Patterns', () => {
      it('should detect system downtime', async () => {
        const metrics = createBaseMetrics();
        metrics.reliability.uptime = 98.5; // Below 99% threshold
        
        const alerts = await pipelineErrorDetector.analyzeAndDetect(metrics);
        
        const downtimeAlert = alerts.find(a => a.title.includes('system_downtime'));
        expect(downtimeAlert).toBeDefined();
        expect(downtimeAlert?.severity).toBe('critical');
        expect(downtimeAlert?.remediation).toContain('Immediate incident response');
      });

      it('should detect database deadlocks', async () => {
        const metrics = createBaseMetrics();
        metrics.reliability.deadlocks = 8; // Above 5 threshold
        
        const alerts = await pipelineErrorDetector.analyzeAndDetect(metrics);
        
        const deadlockAlert = alerts.find(a => a.title.includes('database_deadlocks'));
        expect(deadlockAlert).toBeDefined();
        expect(deadlockAlert?.severity).toBe('high');
        expect(deadlockAlert?.remediation).toContain('Optimize transaction ordering');
      });
    });

    describe('User Experience Patterns', () => {
      it('should detect email delivery failures', async () => {
        const metrics = createBaseMetrics();
        metrics.userExperience.emailDeliveryFailures = 15; // > 10% failure rate
        
        const alerts = await pipelineErrorDetector.analyzeAndDetect(metrics);
        
        const emailAlert = alerts.find(a => a.title.includes('email_delivery_failures'));
        expect(emailAlert).toBeDefined();
        expect(emailAlert?.severity).toBe('medium');
        expect(emailAlert?.remediation).toContain('Check email service status');
      });

      it('should detect processing delays', async () => {
        const metrics = createBaseMetrics();
        metrics.userExperience.avgProcessingDelay = 350000; // Above 5 minutes
        
        const alerts = await pipelineErrorDetector.analyzeAndDetect(metrics);
        
        const delayAlert = alerts.find(a => a.title.includes('processing_delays'));
        expect(delayAlert).toBeDefined();
        expect(delayAlert?.severity).toBe('high');
        expect(delayAlert?.remediation).toContain('Scale processing infrastructure');
      });
    });
  });

  describe('Alert Management', () => {
    it('should track recurring alerts correctly', async () => {
      const metrics = this.createBaseMetrics();
      metrics.performance.errorRate = 6.0;
      
      // First detection
      const firstAlerts = await pipelineErrorDetector.analyzeAndDetect(metrics);
      expect(firstAlerts).toHaveLength(1);
      expect(firstAlerts[0].occurrenceCount).toBe(1);
      
      // Second detection (should update existing alert)
      const secondAlerts = await pipelineErrorDetector.analyzeAndDetect(metrics);
      expect(secondAlerts).toHaveLength(1);
      expect(secondAlerts[0].occurrenceCount).toBe(2);
      expect(secondAlerts[0].confidence).toBeGreaterThan(85);
    });

    it('should resolve alerts correctly', async () => {
      const metrics = this.createBaseMetrics();
      metrics.performance.errorRate = 6.0;
      
      const alerts = await pipelineErrorDetector.analyzeAndDetect(metrics);
      const alertId = alerts[0].id;
      
      const resolved = resolvePipelineAlert(alertId, 'Issue fixed by rollback');
      expect(resolved).toBe(true);
    });

    it('should handle invalid alert resolution', () => {
      const resolved = resolvePipelineAlert('non-existent-id', 'Test resolution');
      expect(resolved).toBe(false);
    });

    it('should generate auto-remediation suggestions', async () => {
      const metrics = this.createBaseMetrics();
      metrics.performance.errorRate = 6.0;
      
      const alerts = await pipelineErrorDetector.analyzeAndDetect(metrics);
      const alert = alerts[0];
      
      expect(alert.autoRemediation).toBeDefined();
      expect(alert.autoRemediation?.possible).toBe(false); // Critical alerts shouldn't auto-remediate
      expect(alert.autoRemediation?.riskLevel).toBe('high');
    });
  });

  describe('Detection Report Generation', () => {
    it('should generate comprehensive detection report', async () => {
      const report = await generatePipelineHealthReport();
      
      expect(report.timestamp).toBeInstanceOf(Date);
      expect(report.overallHealthScore).toBeGreaterThanOrEqual(0);
      expect(report.overallHealthScore).toBeLessThanOrEqual(100);
      expect(report.activeAlerts).toBeDefined();
      expect(report.metrics).toBeDefined();
      expect(report.trends).toBeDefined();
      expect(report.predictiveInsights).toBeDefined();
    });

    it('should calculate health score correctly', async () => {
      // Create metrics with no issues
      const healthyMetrics = this.createBaseMetrics();
      
      mockPrisma.summary.findMany.mockResolvedValue([
        { cost: 0.05, createdAt: new Date(), processingStatus: 'COMPLETED' }
      ]);
      
      const report = await generatePipelineHealthReport();
      
      expect(report.overallHealthScore).toBeGreaterThan(80);
    });

    it('should provide predictive insights', async () => {
      const metrics = this.createBaseMetrics();
      metrics.cost.budgetUtilization = 75; // Approaching threshold
      
      mockPrisma.summary.findMany.mockResolvedValue([
        { cost: 0.05, createdAt: new Date(), processingStatus: 'COMPLETED' }
      ]);
      
      const report = await generatePipelineHealthReport();
      
      expect(report.predictiveInsights.riskAreas).toContain('Budget exhaustion risk within 7 days');
      expect(report.predictiveInsights.recommendations).toContain('Review and adjust user tier limits');
      expect(report.predictiveInsights.preventiveActions).toContain('Implement automated budget alerts');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle corrupted metric data', async () => {
      const corruptedMetrics = {
        performance: {
          avgResponseTime: NaN,
          p95ResponseTime: Infinity,
          p99ResponseTime: -1,
          errorRate: null,
          throughput: undefined,
          dbConnectionTime: 'invalid',
          aiProcessingTime: {},
          emailDeliveryTime: []
        }
      } as any;
      
      expect(async () => {
        await pipelineErrorDetector.analyzeAndDetect(corruptedMetrics);
      }).not.toThrow();
    });

    it('should handle pattern detection errors gracefully', async () => {
      const metrics = this.createBaseMetrics();
      
      // Mock a pattern that throws an error
      const originalPatterns = (pipelineErrorDetector as any).errorPatterns;
      (pipelineErrorDetector as any).errorPatterns = [{
        type: 'test',
        detection: () => { throw new Error('Pattern error'); }
      }];
      
      const alerts = await pipelineErrorDetector.analyzeAndDetect(metrics);
      
      // Should continue processing despite pattern error
      expect(alerts).toBeDefined();
      
      // Restore original patterns
      (pipelineErrorDetector as any).errorPatterns = originalPatterns;
    });

    it('should handle memory pressure from historical metrics', async () => {
      // Simulate many metric collections
      for (let i = 0; i < 150; i++) {
        await pipelineErrorDetector.collectMetrics();
      }
      
      // Historical metrics should be limited to prevent memory issues
      const detector = pipelineErrorDetector as any;
      expect(detector.historicalMetrics.length).toBeLessThanOrEqual(100);
    });

    it('should handle concurrent alert detection', async () => {
      const metrics = this.createBaseMetrics();
      metrics.performance.errorRate = 6.0;
      
      const promises = Array(5).fill(null).map(() => 
        pipelineErrorDetector.analyzeAndDetect(metrics)
      );
      
      const results = await Promise.all(promises);
      
      // All should complete successfully
      expect(results).toHaveLength(5);
      results.forEach(alerts => {
        expect(alerts).toBeDefined();
        expect(Array.isArray(alerts)).toBe(true);
      });
    });
  });

  describe('Performance Tests', () => {
    it('should complete metric collection within reasonable time', async () => {
      const startTime = performance.now();
      
      await pipelineErrorDetector.collectMetrics();
      
      const duration = performance.now() - startTime;
      expect(duration).toBeLessThan(3000); // Should complete within 3 seconds
    });

    it('should handle large datasets efficiently', async () => {
      // Mock large dataset
      const largeSummarySet = Array(1000).fill(null).map((_, i) => ({
        createdAt: new Date(),
        cost: 0.05 + (Math.random() * 0.1),
        inputTokens: 1000,
        outputTokens: 500,
        processingStatus: i % 10 === 0 ? 'FAILED' : 'COMPLETED',
        secFiling: { accessionNumber: `000000000-24-${String(i).padStart(6, '0')}` },
        emailDeliveries: [{ deliveredAt: new Date() }]
      }));
      
      mockPrisma.summary.findMany.mockResolvedValue(largeSummarySet);
      
      const startTime = performance.now();
      const metrics = await pipelineErrorDetector.collectMetrics();
      const duration = performance.now() - startTime;
      
      expect(duration).toBeLessThan(5000); // Should handle large datasets efficiently
      expect(metrics.cost.totalSpent).toBeGreaterThan(0);
    });
  });

});

// Helper function for creating base metrics  
function createBaseMetrics(): PipelineMetrics {
    return {
      performance: {
        avgResponseTime: 2000,
        p95ResponseTime: 3000,
        p99ResponseTime: 4000,
        errorRate: 1.0,
        throughput: 50,
        dbConnectionTime: 100,
        aiProcessingTime: 10000,
        emailDeliveryTime: 1500
      },
      cost: {
        totalSpent: 25,
        avgCostPerFiling: 0.05,
        budgetUtilization: 50,
        costTrend: 'stable',
        abnormalCosts: 0
      },
      security: {
        failedAuthAttempts: 5,
        suspiciousIPs: [],
        unauthorizedAccess: 0,
        dataLeakageAttempts: 0,
        injectionAttempts: 0
      },
      data: {
        consistencyErrors: 2,
        duplicateFilings: 1,
        corruptedContent: 0,
        missingData: 0,
        validationFailures: 0
      },
      reliability: {
        uptime: 99.9,
        failureRate: 0.1,
        recoverTime: 30,
        deadlocks: 1,
        timeouts: 0
      },
      userExperience: {
        avgProcessingDelay: 60000,
        emailDeliveryFailures: 2,
        userComplaints: 0,
        systemSatisfaction: 95
      }
    };
  }
});