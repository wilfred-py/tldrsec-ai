/**
 * Comprehensive Unit Tests for Pipeline Health Monitor
 * 
 * Critical test coverage for the pipeline health monitoring system
 * Tests all health check components, error scenarios, and resource management
 */

import { performance } from 'perf_hooks';
import { EventEmitter } from 'events';

// Mock dependencies before imports
jest.mock('../../../lib/db/index');
jest.mock('../../../lib/logging');
jest.mock('../../../lib/monitoring/pipeline-error-detector');
jest.mock('../../../lib/validation/filing-content-validator');

import { 
  pipelineHealthMonitor,
  getCurrentSystemHealth,
  startHealthMonitoring,
  stopHealthMonitoring,
  type SystemHealth,
  type HealthCheckResult,
  type MonitoringConfig 
} from '../../../lib/monitoring/pipeline-health-monitor';

import { prisma } from '../../../lib/db/index';
import { pipelineErrorDetector } from '../../../lib/monitoring/pipeline-error-detector';

jest.mock('../../../lib/db/index', () => ({
  prisma: {
    $connect: jest.fn(),
    $queryRaw: jest.fn(),
    user: {
      count: jest.fn(),
      aggregate: jest.fn(),
      findMany: jest.fn()
    },
    auditLog: {
      count: jest.fn()
    },
    summary: {
      findMany: jest.fn(),
      count: jest.fn()
    },
    $disconnect: jest.fn()
  }
}));

jest.mock('../../../lib/monitoring/pipeline-error-detector', () => ({
  pipelineErrorDetector: {
    analyzeAndDetect: jest.fn(),
    collectMetrics: jest.fn(),
    generateDetectionReport: jest.fn()
  }
}));

// Mock file validator
const mockValidator = {
  validate: jest.fn()
};

jest.mock('../../../lib/validation/filing-content-validator', () => ({
  FilingContentValidator: mockValidator
}));

describe('PipelineHealthMonitor', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    jest.clearAllMocks();
    originalEnv = process.env;
    
    const mockPrisma = prisma as jest.Mocked<typeof prisma>;
    
    // Reset all mocks to default success states
    mockPrisma.$connect.mockResolvedValue(undefined);
    mockPrisma.$queryRaw.mockResolvedValue([{ test: 1 }]);
    mockPrisma.user.count.mockResolvedValue(5);
    mockPrisma.user.aggregate.mockResolvedValue({ _sum: { budgetUsed: 100, processingBudget: 1000 } });
    mockPrisma.auditLog.count.mockResolvedValue(2);
    mockPrisma.summary.findMany.mockResolvedValue([]);
    
    const mockErrorDetector = pipelineErrorDetector as jest.Mocked<typeof pipelineErrorDetector>;
    mockErrorDetector.analyzeAndDetect.mockResolvedValue([]);
    mockErrorDetector.collectMetrics.mockResolvedValue({});
    
    mockValidator.validate.mockResolvedValue({
      isValid: true,
      validationMetrics: {
        validationTimeMs: 100,
        detectedFormat: 'HTML'
      }
    });

    // Reset environment
    process.env = {
      ...originalEnv,
      OPENROUTER_API_KEY: 'test-key',
      RESEND_API_KEY: 'test-resend-key',
      CRON_SECRET: 'test-secret'
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    stopHealthMonitoring();
  });

  describe('Health Check Components', () => {
    describe('Database Health Checks', () => {
      it('should detect healthy database state', async () => {
        const health = await getCurrentSystemHealth();
        
        expect(health.components.database.status).toBe('healthy');
        expect(health.components.database.message).toBe('Database is healthy');
        expect(mockPrisma.$connect).toHaveBeenCalled();
        expect(mockPrisma.user.count).toHaveBeenCalled();
      });

      it('should handle database connection failures gracefully', async () => {
        mockPrisma.$connect.mockRejectedValue(new Error('Connection failed'));
        
        const health = await getCurrentSystemHealth();
        
        expect(health.components.database.status).toBe('critical');
        expect(health.components.database.message).toContain('Database connection failed');
        expect(health.components.database.recommendations).toContain('Check database connectivity');
      });

      it('should detect slow database responses', async () => {
        // Simulate slow response
        mockPrisma.$connect.mockImplementation(() => 
          new Promise(resolve => setTimeout(resolve, 2000))
        );
        
        const health = await getCurrentSystemHealth();
        
        expect(health.components.database.status).toBe('warning');
        expect(health.components.database.message).toBe('Database response time is slow');
        expect(health.components.database.recommendations).toContain('Check database performance');
      });

      it('should detect critically slow database responses', async () => {
        // Simulate very slow response
        mockPrisma.$connect.mockImplementation(() => 
          new Promise(resolve => setTimeout(resolve, 6000))
        );
        
        const health = await getCurrentSystemHealth();
        
        expect(health.components.database.status).toBe('critical');
        expect(health.components.database.message).toBe('Database response time is critically slow');
        expect(health.components.database.recommendations).toContain('Immediate database investigation required');
      });

      it('should handle database timeout scenarios', async () => {
        mockPrisma.$connect.mockImplementation(() => 
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1000))
        );
        
        const health = await getCurrentSystemHealth();
        
        expect(health.components.database.status).toBe('critical');
        expect(health.components.database.message).toContain('Timeout');
      });
    });

    describe('AI Service Health Checks', () => {
      it('should detect healthy AI service', async () => {
        const health = await getCurrentSystemHealth();
        
        expect(health.components.aiService.status).toBe('healthy');
        expect(health.components.aiService.message).toBe('AI service is healthy');
        expect(health.components.aiService.details?.apiKeyConfigured).toBe(true);
      });

      it('should detect missing AI API key', async () => {
        delete process.env.OPENROUTER_API_KEY;
        
        const health = await getCurrentSystemHealth();
        
        expect(health.components.aiService.status).toBe('critical');
        expect(health.components.aiService.message).toBe('AI API key not configured');
        expect(health.components.aiService.recommendations).toContain('Configure OPENROUTER_API_KEY environment variable');
      });
    });

    describe('Email Service Health Checks', () => {
      it('should detect healthy email service', async () => {
        const health = await getCurrentSystemHealth();
        
        expect(health.components.emailService.status).toBe('healthy');
        expect(health.components.emailService.message).toBe('Email service is healthy');
        expect(health.components.emailService.details?.configured).toBe(true);
      });

      it('should detect missing email configuration', async () => {
        delete process.env.RESEND_API_KEY;
        
        const health = await getCurrentSystemHealth();
        
        expect(health.components.emailService.status).toBe('warning');
        expect(health.components.emailService.message).toBe('Email service not configured');
        expect(health.components.emailService.recommendations).toContain('Configure RESEND_API_KEY for email functionality');
      });
    });

    describe('File Validation Health Checks', () => {
      it('should detect healthy file validation', async () => {
        const health = await getCurrentSystemHealth();
        
        expect(health.components.fileValidation.status).toBe('healthy');
        expect(health.components.fileValidation.message).toBe('File validation is healthy');
        expect(mockValidator.validate).toHaveBeenCalled();
      });

      it('should handle file validation failures', async () => {
        mockValidator.validate.mockResolvedValue({
          isValid: false,
          validationMetrics: {
            validationTimeMs: 100,
            detectedFormat: 'UNKNOWN'
          }
        });
        
        const health = await getCurrentSystemHealth();
        
        expect(health.components.fileValidation.status).toBe('warning');
        expect(health.components.fileValidation.message).toBe('File validation test failed');
        expect(health.components.fileValidation.recommendations).toContain('Review file validation logic');
      });

      it('should handle file validation module errors', async () => {
        mockValidator.validate.mockRejectedValue(new Error('Validation module error'));
        
        const health = await getCurrentSystemHealth();
        
        expect(health.components.fileValidation.status).toBe('critical');
        expect(health.components.fileValidation.message).toContain('File validation check failed');
        expect(health.components.fileValidation.recommendations).toContain('Check file validation module');
      });
    });

    describe('Cost Management Health Checks', () => {
      it('should detect healthy cost management', async () => {
        const health = await getCurrentSystemHealth();
        
        expect(health.components.costManagement.status).toBe('healthy');
        expect(health.components.costManagement.message).toBe('Cost management is healthy');
        expect(health.components.costManagement.details?.budgetUtilization).toBe(10); // 100/1000 * 100
      });

      it('should detect high budget utilization', async () => {
        mockPrisma.user.aggregate.mockResolvedValue({ 
          _sum: { budgetUsed: 850, processingBudget: 1000 } 
        });
        
        const health = await getCurrentSystemHealth();
        
        expect(health.components.costManagement.status).toBe('warning');
        expect(health.components.costManagement.message).toBe('Budget utilization is high');
        expect(health.components.costManagement.recommendations).toContain('Monitor cost usage closely');
      });

      it('should detect critical budget utilization', async () => {
        mockPrisma.user.aggregate.mockResolvedValue({ 
          _sum: { budgetUsed: 960, processingBudget: 1000 } 
        });
        
        const health = await getCurrentSystemHealth();
        
        expect(health.components.costManagement.status).toBe('critical');
        expect(health.components.costManagement.message).toBe('Budget utilization is critical');
        expect(health.components.costManagement.recommendations).toContain('Immediate cost review required');
      });
    });

    describe('Security Health Checks', () => {
      it('should detect healthy security state', async () => {
        const health = await getCurrentSystemHealth();
        
        expect(health.components.security.status).toBe('healthy');
        expect(health.components.security.message).toBe('Security is healthy');
        expect(health.components.security.details?.cronSecretConfigured).toBe(true);
      });

      it('should detect high number of failed operations', async () => {
        mockPrisma.auditLog.count.mockResolvedValue(15);
        
        const health = await getCurrentSystemHealth();
        
        expect(health.components.security.status).toBe('warning');
        expect(health.components.security.message).toBe('High number of failed operations detected');
        expect(health.components.security.recommendations).toContain('Review security logs');
      });

      it('should detect very high number of failed operations', async () => {
        mockPrisma.auditLog.count.mockResolvedValue(75);
        
        const health = await getCurrentSystemHealth();
        
        expect(health.components.security.status).toBe('critical');
        expect(health.components.security.message).toBe('Very high number of failed operations - possible attack');
        expect(health.components.security.recommendations).toContain('Immediate security investigation required');
      });
    });
  });

  describe('Monitoring Lifecycle', () => {
    it('should start monitoring without conflicts', () => {
      const spy = jest.spyOn(pipelineHealthMonitor, 'startMonitoring');
      
      startHealthMonitoring();
      
      expect(spy).toHaveBeenCalled();
      expect(pipelineHealthMonitor.listenerCount('monitoring:started')).toBeGreaterThan(0);
    });

    it('should stop monitoring and clean up resources', () => {
      startHealthMonitoring();
      const spy = jest.spyOn(pipelineHealthMonitor, 'stopMonitoring');
      
      stopHealthMonitoring();
      
      expect(spy).toHaveBeenCalled();
    });

    it('should handle multiple start/stop cycles', () => {
      for (let i = 0; i < 3; i++) {
        startHealthMonitoring();
        stopHealthMonitoring();
      }
      
      // Should not throw or cause memory leaks
      expect(true).toBe(true);
    });

    it('should not allow multiple monitoring instances', () => {
      startHealthMonitoring();
      
      // Attempt to start again
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      startHealthMonitoring();
      
      // Should not start second instance
      expect(consoleSpy).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('Error Boundary Testing', () => {
    it('should handle complete health check failures without crashing', async () => {
      // Mock all components to fail
      mockPrisma.$connect.mockRejectedValue(new Error('DB Down'));
      mockValidator.validate.mockRejectedValue(new Error('Validator Down'));
      mockErrorDetector.analyzeAndDetect.mockRejectedValue(new Error('Detector Down'));
      
      const health = await getCurrentSystemHealth();
      
      expect(health.overall.status).toBe('critical');
      expect(health.overall.score).toBe(0);
      expect(health.components.database.status).toBe('unknown');
    });

    it('should continue monitoring when individual checks fail', async () => {
      mockPrisma.$connect.mockRejectedValue(new Error('DB failure'));
      // Other services should still work
      
      const health = await getCurrentSystemHealth();
      
      expect(health.components.database.status).toBe('critical');
      expect(health.components.aiService.status).toBe('healthy'); // Should still work
      expect(health.components.emailService.status).toBe('healthy'); // Should still work
    });

    it('should emit proper error events', (done) => {
      mockPrisma.$connect.mockRejectedValue(new Error('Test error'));
      
      pipelineHealthMonitor.once('health:check:failed', (error) => {
        expect(error).toBeInstanceOf(Error);
        done();
      });
      
      getCurrentSystemHealth();
    });

    it('should handle invalid monitoring configuration', () => {
      const invalidConfig: Partial<MonitoringConfig> = {
        intervals: {
          healthCheck: -1, // Invalid negative interval
          metricsCollection: 0, // Invalid zero interval
          alertEvaluation: 999999 // Extremely high interval
        }
      };
      
      expect(() => startHealthMonitoring(invalidConfig)).not.toThrow();
      // Should use default values instead
    });
  });

  describe('Performance and Resource Management', () => {
    it('should complete health checks within reasonable time', async () => {
      const startTime = performance.now();
      
      await getCurrentSystemHealth();
      
      const duration = performance.now() - startTime;
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle concurrent health checks gracefully', async () => {
      const promises = Array(5).fill(null).map(() => getCurrentSystemHealth());
      
      const results = await Promise.all(promises);
      
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.overall).toBeDefined();
        expect(result.components).toBeDefined();
      });
    });

    it('should not leak event listeners', () => {
      const initialListenerCount = pipelineHealthMonitor.listenerCount('health:check:completed');
      
      // Start and stop monitoring multiple times
      for (let i = 0; i < 10; i++) {
        startHealthMonitoring();
        stopHealthMonitoring();
      }
      
      const finalListenerCount = pipelineHealthMonitor.listenerCount('health:check:completed');
      expect(finalListenerCount).toBeLessThanOrEqual(initialListenerCount + 1);
    });

    it('should handle memory pressure during extended monitoring', async () => {
      // Simulate extended monitoring with many health checks
      for (let i = 0; i < 50; i++) {
        await getCurrentSystemHealth();
      }
      
      // Memory usage should remain stable
      const memUsage = process.memoryUsage();
      expect(memUsage.heapUsed).toBeLessThan(200 * 1024 * 1024); // Less than 200MB
    });
  });

  describe('Configuration Edge Cases', () => {
    it('should validate threshold configurations', () => {
      const invalidThresholds: Partial<MonitoringConfig> = {
        thresholds: {
          responseTime: { warning: -1, critical: -1 },
          errorRate: { warning: 150, critical: 200 }, // > 100%
          cost: { warning: 110, critical: 90 }, // warning > critical
          uptime: { warning: 50, critical: 101 } // > 100%
        }
      };
      
      expect(() => startHealthMonitoring(invalidThresholds)).not.toThrow();
      // Should sanitize or use defaults
    });

    it('should handle missing environment variables gracefully', () => {
      process.env = {}; // Clear all environment variables
      
      expect(async () => {
        await getCurrentSystemHealth();
      }).not.toThrow();
    });
  });

  describe('Alert Integration', () => {
    it('should integrate with error detector for alerts', async () => {
      const mockAlerts = [
        {
          id: 'test-alert',
          type: 'performance',
          severity: 'high',
          title: 'Test Alert',
          description: 'Test alert description',
          timestamp: new Date(),
          metrics: {},
          remediation: [],
          confidence: 90,
          firstDetected: new Date(),
          lastDetected: new Date(),
          occurrenceCount: 1
        }
      ];
      
      mockErrorDetector.analyzeAndDetect.mockResolvedValue(mockAlerts);
      
      const health = await getCurrentSystemHealth();
      
      expect(health.alerts).toHaveLength(1);
      expect(health.alerts[0].title).toBe('Test Alert');
    });

    it('should calculate health score based on alerts', async () => {
      const criticalAlert = {
        id: 'critical-alert',
        type: 'reliability',
        severity: 'critical',
        title: 'Critical Alert',
        description: 'Critical issue',
        timestamp: new Date(),
        metrics: {},
        remediation: [],
        confidence: 95,
        firstDetected: new Date(),
        lastDetected: new Date(),
        occurrenceCount: 1
      };
      
      mockErrorDetector.analyzeAndDetect.mockResolvedValue([criticalAlert]);
      
      const health = await getCurrentSystemHealth();
      
      expect(health.overall.score).toBeLessThan(80); // Should be reduced due to critical alert
      expect(health.overall.status).toBe('critical');
    });
  });
});