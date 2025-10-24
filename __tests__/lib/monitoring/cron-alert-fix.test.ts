import { CronJobMonitor } from '../../../lib/monitoring/cron-monitor';
import { getPrismaClient } from '../../../lib/db/prisma';
import { logger } from '../../../lib/logging';

// Mock dependencies
jest.mock('../../../lib/db/prisma');
jest.mock('../../../lib/logging');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234')
}));

describe('CronJobMonitor Alert Creation Fix', () => {
  let mockPrisma: any;
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockPrisma = {
      cronJobExecution: {
        create: jest.fn().mockResolvedValue({ id: 'test-id' }),
        update: jest.fn().mockResolvedValue({ id: 'test-id' })
      },
      cronJobAlert: {
        create: jest.fn().mockResolvedValue({ id: 'alert-id' })
      }
    };

    mockLogger = {
      child: jest.fn(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      }))
    };

    (getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);
    (logger as any).child = mockLogger.child;
  });

  describe('Alert Creation with Required Title Field', () => {
    it('should create alerts with required title field and proper enum mapping', async () => {
      // Temporarily override test environment to test production behavior
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

      await monitor.createAlert('EXECUTION_FAILED', {
        severity: 'CRITICAL',
        message: 'Job execution failed due to database error',
        details: { error: 'Connection timeout' }
      });

      expect(mockPrisma.cronJobAlert.create).toHaveBeenCalledWith({
        data: {
          executionId: 'mock-uuid-1234',
          alertType: 'EXECUTION_FAILED',
          severity: 'CRITICAL',
          title: '🚨 CRITICAL: Cron Job Execution Failed',
          description: 'Job execution failed due to database error',
          actualValue: { error: 'Connection timeout' },
          jobName: 'test-job',
          environment: 'development',
          triggeredAt: expect.any(Date)
        }
      });
      
      // Restore environment
      process.env.NODE_ENV = originalEnv;
    });

    it('should generate appropriate titles for all supported alert types', async () => {
      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

      const testCases = [
        { type: 'HIGH_ERROR_RATE', severity: 'HIGH', expectedTitle: '⚠️ HIGH: High Error Rate Detected' },
        { type: 'COST_THRESHOLD_EXCEEDED', severity: 'MEDIUM', expectedTitle: '⚡ MEDIUM: Cost Threshold Exceeded' },
        { type: 'EMAIL_DELIVERY_FAILED', severity: 'LOW', expectedTitle: '📋 LOW: Email Delivery Failed' },
        { type: 'API_RATE_LIMIT_HIT', severity: 'CRITICAL', expectedTitle: '🚨 CRITICAL: API Rate Limit Hit' },
        { type: 'DATABASE_CONNECTION_FAILED', severity: 'HIGH', expectedTitle: '⚠️ HIGH: Database Connection Failed' }
      ];

      for (const testCase of testCases) {
        await monitor.createAlert(testCase.type, {
          severity: testCase.severity,
          message: `Test ${testCase.type} message`
        });

        expect(mockPrisma.cronJobAlert.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            title: testCase.expectedTitle,
            alertType: testCase.type,
            severity: testCase.severity
          })
        });

        jest.clearAllMocks();
        mockPrisma.cronJobExecution.create.mockResolvedValue({ id: 'test-id' });
        mockPrisma.cronJobAlert.create.mockResolvedValue({ id: 'alert-id' });
      }
    });

    it('should handle case-insensitive alert type and severity mapping', async () => {
      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

      await monitor.createAlert('api_rate_limit_hit', {
        severity: 'warning',
        message: 'Rate limit exceeded'
      });

      expect(mockPrisma.cronJobAlert.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          alertType: 'API_RATE_LIMIT_HIT', // Should be mapped to uppercase enum
          severity: 'MEDIUM', // 'warning' should map to 'MEDIUM'
          title: '⚡ MEDIUM: API Rate Limit Hit'
        })
      });
    });

    it('should handle missing alert details gracefully', async () => {
      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

      await monitor.createAlert('NO_FILINGS_PROCESSED', {
        severity: 'HIGH',
        message: 'No filings were processed'
        // details omitted
      });

      expect(mockPrisma.cronJobAlert.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actualValue: {}, // Should default to empty object
          title: '⚠️ HIGH: No Filings Processed'
        })
      });
    });

    it('should handle alert creation database failures gracefully', async () => {
      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');
      
      mockPrisma.cronJobAlert.create.mockRejectedValue(new Error('Database error'));

      // Should not throw error - alert creation failure shouldn't break cron execution
      await expect(monitor.createAlert('EXECUTION_FAILED', {
        severity: 'CRITICAL',
        message: 'Test alert'
      })).resolves.not.toThrow();

      expect(mockPrisma.cronJobAlert.create).toHaveBeenCalled();
    });

    it('should update execution metrics based on alert severity', async () => {
      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

      // Critical alert should increment error count
      await monitor.createAlert('EXECUTION_FAILED', {
        severity: 'CRITICAL',
        message: 'Critical error'
      });

      expect(mockPrisma.cronJobExecution.update).toHaveBeenCalledWith({
        where: { executionId: 'mock-uuid-1234' },
        data: { errorsCount: 1 }
      });
    });

    it('should handle unknown alert types with fallback', async () => {
      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

      await monitor.createAlert('UNKNOWN_ALERT_TYPE', {
        severity: 'HIGH',
        message: 'Unknown alert type'
      });

      expect(mockPrisma.cronJobAlert.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          alertType: 'EXECUTION_FAILED', // Should fallback to EXECUTION_FAILED
          severity: 'HIGH',
          title: '⚠️ HIGH: UNKNOWN_ALERT_TYPE Alert'
        })
      });
    });

    it('should handle unknown severity with fallback', async () => {
      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

      await monitor.createAlert('EXECUTION_FAILED', {
        severity: 'UNKNOWN_SEVERITY',
        message: 'Unknown severity'
      });

      expect(mockPrisma.cronJobAlert.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          alertType: 'EXECUTION_FAILED',
          severity: 'MEDIUM', // Should fallback to MEDIUM
          title: '⚡ MEDIUM: Cron Job Execution Failed'
        })
      });
    });

    it('should skip alert creation in test environment', async () => {
      // Ensure test environment is set
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

      await monitor.createAlert('EXECUTION_FAILED', {
        severity: 'CRITICAL',
        message: 'Test alert'
      });

      // Should not call database in test mode
      expect(mockPrisma.cronJobAlert.create).not.toHaveBeenCalled();

      // Restore environment
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Production Alert Creation', () => {
    it('should create alerts in production environment', async () => {
      // Set production environment
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

      await monitor.createAlert('COST_THRESHOLD_EXCEEDED', {
        severity: 'HIGH',
        message: 'Monthly cost threshold exceeded',
        details: { currentCost: 150, threshold: 100 }
      });

      expect(mockPrisma.cronJobAlert.create).toHaveBeenCalledWith({
        data: {
          executionId: 'mock-uuid-1234',
          alertType: 'COST_THRESHOLD_EXCEEDED',
          severity: 'HIGH',
          title: '⚠️ HIGH: Cost Threshold Exceeded',
          description: 'Monthly cost threshold exceeded',
          actualValue: { currentCost: 150, threshold: 100 },
          jobName: 'test-job',
          environment: 'production',
          triggeredAt: expect.any(Date)
        }
      });

      // Restore environment
      process.env.NODE_ENV = originalEnv;
    });
  });
});