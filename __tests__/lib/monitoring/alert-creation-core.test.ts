import { CronJobMonitor } from '../../../lib/monitoring/cron-monitor';
import { getPrismaClient } from '../../../lib/db/prisma';
import { logger } from '../../../lib/logging';

// Mock dependencies
jest.mock('../../../lib/db/prisma');
jest.mock('../../../lib/logging');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-execution-id')
}));

describe('Alert Creation Core Functionality', () => {
  let mockPrisma: any;
  let originalEnv: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Override test environment for this test suite
    originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    
    // Also need to unset JEST_WORKER_ID to avoid test mode detection
    delete process.env.JEST_WORKER_ID;
    
    mockPrisma = {
      cronJobExecution: {
        create: jest.fn().mockResolvedValue({ id: 'test-id' }),
        update: jest.fn().mockResolvedValue({ id: 'test-id' })
      },
      cronJobAlert: {
        create: jest.fn().mockResolvedValue({ id: 'alert-id' })
      }
    };

    const mockLogger = {
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

  afterEach(() => {
    // Restore original environment
    process.env.NODE_ENV = originalEnv;
  });

  it('should create alert with required title field', async () => {
    const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

    await monitor.createAlert('EXECUTION_FAILED', {
      severity: 'CRITICAL',
      message: 'Test alert message',
      details: { error: 'Test error' }
    });

    expect(mockPrisma.cronJobAlert.create).toHaveBeenCalledWith({
      data: {
        executionId: 'test-execution-id',
        alertType: 'EXECUTION_FAILED',
        severity: 'CRITICAL',
        title: '🚨 CRITICAL: Cron Job Execution Failed',
        description: 'Test alert message',
        actualValue: { error: 'Test error' },
        jobName: 'test-job',
        environment: 'development',
        triggeredAt: expect.any(Date)
      }
    });
  });

  it('should handle alert creation gracefully when database fails', async () => {
    const monitor = await CronJobMonitor.create('test-job', 'MANUAL');
    
    mockPrisma.cronJobAlert.create.mockRejectedValue(new Error('DB Error'));

    // Should not throw - alert failures shouldn't break cron execution
    await expect(monitor.createAlert('HIGH_ERROR_RATE', {
      severity: 'HIGH',
      message: 'Error rate exceeded'
    })).resolves.not.toThrow();
  });

  it('should generate different titles for different alert types', async () => {
    const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

    await monitor.createAlert('EMAIL_DELIVERY_FAILED', {
      severity: 'MEDIUM',
      message: 'Email failed'
    });

    expect(mockPrisma.cronJobAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title: '⚡ MEDIUM: Email Delivery Failed',
        alertType: 'EMAIL_DELIVERY_FAILED',
        severity: 'MEDIUM'
      })
    });
  });

  it('should map severity strings to proper enums', async () => {
    const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

    await monitor.createAlert('API_RATE_LIMIT_HIT', {
      severity: 'warning',
      message: 'Rate limit hit'
    });

    expect(mockPrisma.cronJobAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        severity: 'MEDIUM' // 'warning' should map to MEDIUM
      })
    });
  });

  it('should default missing details to empty object', async () => {
    const monitor = await CronJobMonitor.create('test-job', 'MANUAL');

    await monitor.createAlert('TIMEOUT_EXCEEDED', {
      severity: 'HIGH',
      message: 'Timeout occurred'
      // no details provided
    });

    expect(mockPrisma.cronJobAlert.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actualValue: {} // Should default to empty object
      })
    });
  });
});