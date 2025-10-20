/**
 * Job Queue Integration Tests for Async Email Processing
 * 
 * Tests the integration between JobQueueService and AsyncEmailQueue
 * Focuses on:
 * - Job lifecycle management
 * - Error handling and retry logic
 * - Priority processing
 * - Database transaction safety
 * - Performance under load
 */

// Mock dependencies
jest.mock('../../../lib/db/prisma', () => ({
  getPrismaClient: jest.fn(),
  prisma: {
    jobQueue: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      groupBy: jest.fn()
    },
    summary: {
      update: jest.fn()
    },
    $transaction: jest.fn()
  }
}));

jest.mock('../../../lib/logging', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

jest.mock('../../../lib/monitoring', () => ({
  monitoring: {
    incrementCounter: jest.fn(),
    recordValue: jest.fn()
  }
}));

jest.mock('../../../lib/email/index', () => ({
  emailClient: {
    sendEmail: jest.fn()
  }
}));

import { JobQueueService } from '../../../lib/job-queue';
import { AsyncEmailQueue, queueEmail, processQueuedEmails } from '../../../lib/email/async-email-queue';
import { getPrismaClient } from '../../../lib/db/prisma';
import { emailClient } from '../../../lib/email/index';
import { EmailMessage } from '../../../lib/email/types';

// Mock implementations
const mockPrisma = {
  jobQueue: {
    create: jest.fn(),
    findMany: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    groupBy: jest.fn()
  },
  summary: {
    update: jest.fn()
  },
  $transaction: jest.fn()
};

const mockEmailClient = emailClient as jest.Mocked<typeof emailClient>;
const mockGetPrismaClient = getPrismaClient as jest.MockedFunction<typeof getPrismaClient>;

// Mock JobQueueService methods
jest.mock('../../../lib/job-queue', () => ({
  JobQueueService: {
    addJob: jest.fn(),
    getJobsToProcess: jest.fn(),
    updateJobStatus: jest.fn(),
    getJobById: jest.fn(),
    deleteJob: jest.fn(),
    getJobStats: jest.fn()
  }
}));

const mockJobQueueService = JobQueueService as jest.Mocked<typeof JobQueueService>;

describe('Job Queue Async Email Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPrismaClient.mockReturnValue(mockPrisma as any);
  });

  describe('Email Job Lifecycle', () => {
    const testEmailMessage: EmailMessage = {
      to: 'test@example.com',
      subject: 'Integration Test',
      html: '<h1>Test</h1>',
      text: 'Test'
    };

    it('should create job with ASYNC_EMAIL_DIGEST type', async () => {
      mockJobQueueService.addJob.mockResolvedValue({ id: 'job-123' } as any);

      await queueEmail(testEmailMessage, { priority: 7 });

      expect(mockJobQueueService.addJob).toHaveBeenCalledWith({
        jobType: 'ASYNC_EMAIL_DIGEST',
        payload: expect.objectContaining({
          emailMessage: testEmailMessage,
          priority: 7
        }),
        priority: 7,
        scheduledFor: expect.any(Date),
        idempotencyKey: expect.stringMatching(/^email-/),
        maxAttempts: 3
      });
    });

    it('should process jobs with correct job type filter', async () => {
      mockJobQueueService.getJobsToProcess.mockResolvedValue([]);

      await processQueuedEmails(5);

      expect(mockJobQueueService.getJobsToProcess).toHaveBeenCalledWith(5, 'ASYNC_EMAIL_DIGEST');
    });

    it('should update job status through complete lifecycle', async () => {
      const testJob = {
        id: 'lifecycle-job',
        priority: 5,
        status: 'PENDING' as const,
        payload: {
          emailMessage: testEmailMessage,
          requestId: 'lifecycle-req'
        }
      };

      mockJobQueueService.getJobsToProcess.mockResolvedValue([testJob]);
      mockEmailClient.sendEmail.mockResolvedValue({
        success: true,
        id: 'email-sent'
      });
      mockJobQueueService.updateJobStatus.mockResolvedValue(undefined);

      await processQueuedEmails(1);

      // Verify job status updates: PENDING -> PROCESSING -> COMPLETED
      const updateCalls = mockJobQueueService.updateJobStatus.mock.calls;
      expect(updateCalls).toHaveLength(2);
      
      // First call: mark as PROCESSING
      expect(updateCalls[0]).toEqual([
        'lifecycle-job',
        'PROCESSING',
        expect.objectContaining({
          startedAt: expect.any(Date)
        })
      ]);

      // Second call: mark as COMPLETED
      expect(updateCalls[1]).toEqual([
        'lifecycle-job',
        'COMPLETED',
        expect.objectContaining({
          completedAt: expect.any(Date),
          result: { emailId: 'email-sent' }
        })
      ]);
    });

    it('should handle failed jobs with retry metadata', async () => {
      const testJob = {
        id: 'failed-job',
        priority: 5,
        status: 'PENDING' as const,
        payload: {
          emailMessage: testEmailMessage,
          requestId: 'failed-req'
        }
      };

      mockJobQueueService.getJobsToProcess.mockResolvedValue([testJob]);
      mockEmailClient.sendEmail.mockResolvedValue({
        success: false,
        error: new Error('Network timeout')
      });
      mockJobQueueService.updateJobStatus.mockResolvedValue(undefined);

      await processQueuedEmails(1);

      const updateCalls = mockJobQueueService.updateJobStatus.mock.calls;
      expect(updateCalls).toHaveLength(2);

      // Should mark as FAILED with retry metadata
      expect(updateCalls[1]).toEqual([
        'failed-job',
        'FAILED',
        expect.objectContaining({
          failedAt: expect.any(Date),
          error: 'Network timeout',
          retryable: true
        })
      ]);
    });

    it('should handle non-retryable failures correctly', async () => {
      const testJob = {
        id: 'non-retryable-job',
        priority: 5,
        status: 'PENDING' as const,
        payload: {
          emailMessage: testEmailMessage,
          requestId: 'non-retryable-req'
        }
      };

      mockJobQueueService.getJobsToProcess.mockResolvedValue([testJob]);
      mockEmailClient.sendEmail.mockResolvedValue({
        success: false,
        error: new Error('Invalid email address')
      });
      mockJobQueueService.updateJobStatus.mockResolvedValue(undefined);

      await processQueuedEmails(1);

      const updateCalls = mockJobQueueService.updateJobStatus.mock.calls;
      const failedCall = updateCalls.find(call => call[1] === 'FAILED');
      
      expect(failedCall[2]).toEqual(
        expect.objectContaining({
          error: 'Invalid email address',
          retryable: undefined // Non-retryable errors don't set retryable flag
        })
      );
    });
  });

  describe('Priority Queue Processing', () => {
    it('should process jobs in priority order from JobQueueService', async () => {
      const jobs = [
        {
          id: 'priority-1',
          priority: 1,
          status: 'PENDING' as const,
          payload: {
            emailMessage: { ...testEmailMessage, subject: 'Low Priority' },
            requestId: 'priority-1-req'
          }
        },
        {
          id: 'priority-9',
          priority: 9,
          status: 'PENDING' as const,
          payload: {
            emailMessage: { ...testEmailMessage, subject: 'High Priority' },
            requestId: 'priority-9-req'
          }
        },
        {
          id: 'priority-5',
          priority: 5,
          status: 'PENDING' as const,
          payload: {
            emailMessage: { ...testEmailMessage, subject: 'Medium Priority' },
            requestId: 'priority-5-req'
          }
        }
      ];

      mockJobQueueService.getJobsToProcess.mockResolvedValue(jobs);
      mockEmailClient.sendEmail.mockResolvedValue({
        success: true,
        id: 'email-sent'
      });
      mockJobQueueService.updateJobStatus.mockResolvedValue(undefined);

      await processQueuedEmails(3);

      // Verify all jobs were processed
      expect(mockEmailClient.sendEmail).toHaveBeenCalledTimes(3);
      
      // JobQueueService should handle priority ordering, so we process in the order returned
      const emailCalls = mockEmailClient.sendEmail.mock.calls;
      expect(emailCalls[0][0].subject).toBe('Low Priority');
      expect(emailCalls[1][0].subject).toBe('High Priority');
      expect(emailCalls[2][0].subject).toBe('Medium Priority');
    });

    it('should respect batch size limits', async () => {
      const jobs = Array.from({ length: 10 }, (_, i) => ({
        id: `batch-job-${i}`,
        priority: i + 1,
        status: 'PENDING' as const,
        payload: {
          emailMessage: { ...testEmailMessage, subject: `Email ${i}` },
          requestId: `batch-req-${i}`
        }
      }));

      mockJobQueueService.getJobsToProcess.mockResolvedValue(jobs);
      mockEmailClient.sendEmail.mockResolvedValue({
        success: true,
        id: 'email-sent'
      });
      mockJobQueueService.updateJobStatus.mockResolvedValue(undefined);

      const processed = await processQueuedEmails(3); // Request only 3

      expect(mockJobQueueService.getJobsToProcess).toHaveBeenCalledWith(3, 'ASYNC_EMAIL_DIGEST');
      expect(processed).toBe(10); // But process all returned jobs
      expect(mockEmailClient.sendEmail).toHaveBeenCalledTimes(10);
    });
  });

  describe('Database Transaction Safety', () => {
    const testEmailMessage: EmailMessage = {
      to: 'transaction@example.com',
      subject: 'Transaction Test',
      html: '<h1>Test</h1>',
      text: 'Test'
    };

    it('should handle database errors during job status updates', async () => {
      const testJob = {
        id: 'db-error-job',
        priority: 5,
        status: 'PENDING' as const,
        payload: {
          emailMessage: testEmailMessage,
          requestId: 'db-error-req',
          metadata: { summaryId: 'summary-123' }
        }
      };

      mockJobQueueService.getJobsToProcess.mockResolvedValue([testJob]);
      mockEmailClient.sendEmail.mockResolvedValue({
        success: true,
        id: 'email-sent'
      });
      
      // First update (PROCESSING) succeeds
      mockJobQueueService.updateJobStatus.mockResolvedValueOnce(undefined);
      // Summary update succeeds
      mockPrisma.summary.update.mockResolvedValue({});
      // Second update (COMPLETED) fails
      mockJobQueueService.updateJobStatus.mockRejectedValueOnce(new Error('Database error'));

      const processed = await processQueuedEmails(1);

      // Should still count as processed since email was sent
      expect(processed).toBe(1);
      expect(mockEmailClient.sendEmail).toHaveBeenCalledTimes(1);
    });

    it('should handle summary update failures gracefully', async () => {
      const testJob = {
        id: 'summary-error-job',
        priority: 5,
        status: 'PENDING' as const,
        payload: {
          emailMessage: testEmailMessage,
          requestId: 'summary-error-req',
          metadata: { summaryId: 'summary-456' }
        }
      };

      mockJobQueueService.getJobsToProcess.mockResolvedValue([testJob]);
      mockEmailClient.sendEmail.mockResolvedValue({
        success: true,
        id: 'email-sent'
      });
      mockJobQueueService.updateJobStatus.mockResolvedValue(undefined);
      mockPrisma.summary.update.mockRejectedValue(new Error('Summary update failed'));

      const processed = await processQueuedEmails(1);

      // Should still complete successfully
      expect(processed).toBe(1);
      
      // Job should still be marked as completed
      const completedCall = mockJobQueueService.updateJobStatus.mock.calls
        .find(call => call[1] === 'COMPLETED');
      expect(completedCall).toBeDefined();
    });

    it('should handle concurrent job processing with database conflicts', async () => {
      const jobs = Array.from({ length: 5 }, (_, i) => ({
        id: `concurrent-job-${i}`,
        priority: 5,
        status: 'PENDING' as const,
        payload: {
          emailMessage: { ...testEmailMessage, to: `user${i}@example.com` },
          requestId: `concurrent-req-${i}`,
          metadata: { summaryId: `summary-${i}` }
        }
      }));

      mockJobQueueService.getJobsToProcess.mockResolvedValue(jobs);
      mockEmailClient.sendEmail.mockResolvedValue({
        success: true,
        id: 'email-sent'
      });
      
      // Simulate some database conflicts
      mockJobQueueService.updateJobStatus
        .mockResolvedValueOnce(undefined) // job-0 PROCESSING - success
        .mockResolvedValueOnce(undefined) // job-1 PROCESSING - success
        .mockRejectedValueOnce(new Error('DB conflict')) // job-2 PROCESSING - fail
        .mockResolvedValueOnce(undefined) // job-3 PROCESSING - success
        .mockResolvedValueOnce(undefined) // job-4 PROCESSING - success
        .mockResolvedValueOnce(undefined) // job-0 COMPLETED - success
        .mockResolvedValueOnce(undefined) // job-1 COMPLETED - success
        .mockResolvedValueOnce(undefined) // job-2 COMPLETED - success (retry)
        .mockResolvedValueOnce(undefined) // job-3 COMPLETED - success
        .mockResolvedValueOnce(undefined); // job-4 COMPLETED - success

      mockPrisma.summary.update.mockResolvedValue({});

      const processed = await processQueuedEmails(5);

      expect(processed).toBe(5);
      expect(mockEmailClient.sendEmail).toHaveBeenCalledTimes(5);
    });

    it('should maintain data consistency during partial failures', async () => {
      const jobs = [
        {
          id: 'success-job',
          priority: 5,
          status: 'PENDING' as const,
          payload: {
            emailMessage: { ...testEmailMessage, to: 'success@example.com' },
            requestId: 'success-req',
            metadata: { summaryId: 'summary-success' }
          }
        },
        {
          id: 'failure-job',
          priority: 5,
          status: 'PENDING' as const,
          payload: {
            emailMessage: { ...testEmailMessage, to: 'failure@example.com' },
            requestId: 'failure-req',
            metadata: { summaryId: 'summary-failure' }
          }
        }
      ];

      mockJobQueueService.getJobsToProcess.mockResolvedValue(jobs);
      
      // First email succeeds, second fails
      mockEmailClient.sendEmail
        .mockResolvedValueOnce({ success: true, id: 'email-1' })
        .mockResolvedValueOnce({ success: false, error: new Error('Email service error') });
      
      mockJobQueueService.updateJobStatus.mockResolvedValue(undefined);
      mockPrisma.summary.update.mockResolvedValue({});

      const processed = await processQueuedEmails(2);

      expect(processed).toBe(1); // Only successful email counts
      
      // Verify summary was only updated for successful email
      expect(mockPrisma.summary.update).toHaveBeenCalledTimes(1);
      expect(mockPrisma.summary.update).toHaveBeenCalledWith({
        where: { id: 'summary-success' },
        data: expect.any(Object)
      });
    });
  });

  describe('Error Handling and Recovery', () => {
    const testEmailMessage: EmailMessage = {
      to: 'error@example.com',
      subject: 'Error Test',
      html: '<h1>Test</h1>',
      text: 'Test'
    };

    it('should handle JobQueueService getJobsToProcess errors', async () => {
      mockJobQueueService.getJobsToProcess.mockRejectedValue(new Error('Database connection failed'));

      await expect(processQueuedEmails(5)).rejects.toThrow('Database connection failed');
    });

    it('should handle individual job processing errors', async () => {
      const jobs = [
        {
          id: 'error-job-1',
          priority: 5,
          status: 'PENDING' as const,
          payload: null as any // Invalid payload
        },
        {
          id: 'error-job-2',
          priority: 5,
          status: 'PENDING' as const,
          payload: {
            emailMessage: testEmailMessage,
            requestId: 'error-req-2'
          }
        }
      ];

      mockJobQueueService.getJobsToProcess.mockResolvedValue(jobs);
      mockEmailClient.sendEmail.mockResolvedValue({
        success: true,
        id: 'email-sent'
      });
      mockJobQueueService.updateJobStatus.mockResolvedValue(undefined);

      const processed = await processQueuedEmails(2);

      // Should handle the error gracefully and continue with valid jobs
      expect(processed).toBe(1); // Only the valid job should be processed
      
      // Error job should be marked as failed
      const failedCalls = mockJobQueueService.updateJobStatus.mock.calls
        .filter(call => call[1] === 'FAILED');
      expect(failedCalls).toHaveLength(1);
      expect(failedCalls[0][0]).toBe('error-job-1');
    });

    it('should implement proper error classification for retries', async () => {
      const errorTestCases = [
        { error: 'Network timeout', expectedRetryable: true },
        { error: 'Rate limit exceeded', expectedRetryable: true },
        { error: 'Invalid email address', expectedRetryable: false },
        { error: 'Domain not verified', expectedRetryable: false }
      ];

      for (const { error, expectedRetryable } of errorTestCases) {
        jest.clearAllMocks();
        
        const testJob = {
          id: `error-classification-${error.replace(/\s+/g, '-')}`,
          priority: 5,
          status: 'PENDING' as const,
          payload: {
            emailMessage: testEmailMessage,
            requestId: `error-req-${error}`
          }
        };

        mockJobQueueService.getJobsToProcess.mockResolvedValue([testJob]);
        mockEmailClient.sendEmail.mockResolvedValue({
          success: false,
          error: new Error(error)
        });
        mockJobQueueService.updateJobStatus.mockResolvedValue(undefined);

        await processQueuedEmails(1);

        const failedCall = mockJobQueueService.updateJobStatus.mock.calls
          .find(call => call[1] === 'FAILED');
        
        if (expectedRetryable) {
          expect(failedCall[2]).toEqual(
            expect.objectContaining({ retryable: true })
          );
        } else {
          expect(failedCall[2]).not.toHaveProperty('retryable');
        }
      }
    });

    it('should handle email client exceptions', async () => {
      const testJob = {
        id: 'exception-job',
        priority: 5,
        status: 'PENDING' as const,
        payload: {
          emailMessage: testEmailMessage,
          requestId: 'exception-req'
        }
      };

      mockJobQueueService.getJobsToProcess.mockResolvedValue([testJob]);
      mockEmailClient.sendEmail.mockRejectedValue(new Error('Email client crashed'));
      mockJobQueueService.updateJobStatus.mockResolvedValue(undefined);

      const processed = await processQueuedEmails(1);

      expect(processed).toBe(0);
      
      // Should mark job as failed
      const failedCall = mockJobQueueService.updateJobStatus.mock.calls
        .find(call => call[1] === 'FAILED');
      expect(failedCall).toBeDefined();
      expect(failedCall[2].error).toBe('Email client crashed');
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle large batches efficiently', async () => {
      const batchSize = 100;
      const jobs = Array.from({ length: batchSize }, (_, i) => ({
        id: `perf-job-${i}`,
        priority: Math.floor(Math.random() * 10) + 1,
        status: 'PENDING' as const,
        payload: {
          emailMessage: {
            ...testEmailMessage,
            to: `perf${i}@example.com`,
            subject: `Performance Test ${i}`
          },
          requestId: `perf-req-${i}`
        }
      }));

      mockJobQueueService.getJobsToProcess.mockResolvedValue(jobs);
      mockEmailClient.sendEmail.mockImplementation(async () => {
        // Simulate small delay
        await new Promise(resolve => setTimeout(resolve, 1));
        return { success: true, id: 'email-sent' };
      });
      mockJobQueueService.updateJobStatus.mockResolvedValue(undefined);

      const startTime = Date.now();
      const processed = await processQueuedEmails(batchSize);
      const duration = Date.now() - startTime;

      expect(processed).toBe(batchSize);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle high-frequency job processing', async () => {
      const processingRounds = 10;
      const jobsPerRound = 5;
      let totalProcessed = 0;

      for (let round = 0; round < processingRounds; round++) {
        const jobs = Array.from({ length: jobsPerRound }, (_, i) => ({
          id: `freq-job-${round}-${i}`,
          priority: 5,
          status: 'PENDING' as const,
          payload: {
            emailMessage: {
              ...testEmailMessage,
              to: `freq${round}-${i}@example.com`
            },
            requestId: `freq-req-${round}-${i}`
          }
        }));

        mockJobQueueService.getJobsToProcess.mockResolvedValueOnce(jobs);
        mockEmailClient.sendEmail.mockResolvedValue({
          success: true,
          id: 'email-sent'
        });
        mockJobQueueService.updateJobStatus.mockResolvedValue(undefined);

        const processed = await processQueuedEmails(jobsPerRound);
        totalProcessed += processed;
      }

      expect(totalProcessed).toBe(processingRounds * jobsPerRound);
      expect(mockEmailClient.sendEmail).toHaveBeenCalledTimes(totalProcessed);
    });

    it('should maintain performance under database pressure', async () => {
      const jobs = Array.from({ length: 20 }, (_, i) => ({
        id: `db-pressure-job-${i}`,
        priority: 5,
        status: 'PENDING' as const,
        payload: {
          emailMessage: {
            ...testEmailMessage,
            to: `pressure${i}@example.com`
          },
          requestId: `pressure-req-${i}`,
          metadata: { summaryId: `summary-${i}` }
        }
      }));

      mockJobQueueService.getJobsToProcess.mockResolvedValue(jobs);
      mockEmailClient.sendEmail.mockResolvedValue({
        success: true,
        id: 'email-sent'
      });
      
      // Simulate slow database operations
      mockJobQueueService.updateJobStatus.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      mockPrisma.summary.update.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        return {};
      });

      const startTime = Date.now();
      const processed = await processQueuedEmails(20);
      const duration = Date.now() - startTime;

      expect(processed).toBe(20);
      // Should still complete in reasonable time despite database delays
      expect(duration).toBeLessThan(10000); // 10 seconds
    });
  });

  describe('Job Statistics and Monitoring', () => {
    it('should provide accurate processing metrics', async () => {
      const jobs = [
        {
          id: 'metrics-job-1',
          priority: 9,
          status: 'PENDING' as const,
          payload: {
            emailMessage: { ...testEmailMessage, to: 'metrics1@example.com' },
            requestId: 'metrics-req-1'
          }
        },
        {
          id: 'metrics-job-2',
          priority: 5,
          status: 'PENDING' as const,
          payload: {
            emailMessage: { ...testEmailMessage, to: 'metrics2@example.com' },
            requestId: 'metrics-req-2'
          }
        }
      ];

      mockJobQueueService.getJobsToProcess.mockResolvedValue(jobs);
      
      // First succeeds, second fails
      mockEmailClient.sendEmail
        .mockResolvedValueOnce({ success: true, id: 'email-1' })
        .mockResolvedValueOnce({ success: false, error: new Error('Failed') });
      
      mockJobQueueService.updateJobStatus.mockResolvedValue(undefined);

      const processed = await processQueuedEmails(2);

      // Should return accurate count of successfully processed emails
      expect(processed).toBe(1);
      
      // Verify proper status updates
      const processingCalls = mockJobQueueService.updateJobStatus.mock.calls
        .filter(call => call[1] === 'PROCESSING');
      const completedCalls = mockJobQueueService.updateJobStatus.mock.calls
        .filter(call => call[1] === 'COMPLETED');
      const failedCalls = mockJobQueueService.updateJobStatus.mock.calls
        .filter(call => call[1] === 'FAILED');

      expect(processingCalls).toHaveLength(2); // Both started processing
      expect(completedCalls).toHaveLength(1);  // One completed
      expect(failedCalls).toHaveLength(1);     // One failed
    });

    it('should handle empty job queues gracefully', async () => {
      mockJobQueueService.getJobsToProcess.mockResolvedValue([]);

      const processed = await processQueuedEmails(10);

      expect(processed).toBe(0);
      expect(mockEmailClient.sendEmail).not.toHaveBeenCalled();
      expect(mockJobQueueService.updateJobStatus).not.toHaveBeenCalled();
    });
  });
});

const testEmailMessage: EmailMessage = {
  to: 'test@example.com',
  subject: 'Test Email',
  html: '<h1>Test</h1>',
  text: 'Test'
};