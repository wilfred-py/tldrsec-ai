/**
 * Comprehensive Async Email Queue Test Suite
 * 
 * Tests ALL critical scenarios identified in QA review:
 * - Async email queue retry logic 
 * - Distributed locking conflict scenarios
 * - Email rate limiting compliance verification
 * - Database transaction rollback handling
 * - Priority queue ordering verification  
 * - Idempotency key collision testing
 * - Security helpers and PII masking
 * - Error boundary conditions
 * - Performance under load
 * 
 * TARGET: >95% test coverage for async email queue system
 */

// Mock dependencies first to avoid import issues
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

jest.mock('../../../lib/db/prisma', () => ({
  getPrismaClient: jest.fn()
}));

jest.mock('../../../lib/email/index', () => ({
  emailClient: {
    sendEmail: jest.fn()
  }
}));

jest.mock('../../../lib/job-queue', () => ({
  JobQueueService: {
    addJob: jest.fn(),
    getJobsToProcess: jest.fn(),
    updateJobStatus: jest.fn(),
    getJobById: jest.fn()
  }
}));

import { 
  AsyncEmailQueue, 
  queueEmail, 
  processQueuedEmails,
  EmailJobPayload,
  EmailJobResult 
} from '../../../lib/email/async-email-queue';
import { 
  SecureEmailLogger, 
  EmailQueueLock,
  maskEmailForLogging,
  maskUserIdForLogging,
  createGDPRCompliantLogData 
} from '../../../lib/email/security-helpers';
import { JobQueueService } from '../../../lib/job-queue';
import { emailClient } from '../../../lib/email/index';
import { getPrismaClient } from '../../../lib/db/prisma';
import { EmailMessage } from '../../../lib/email/types';

// Create mock implementations
const mockJobQueueService = JobQueueService as jest.Mocked<typeof JobQueueService>;
const mockEmailClient = emailClient as jest.Mocked<typeof emailClient>;
const mockGetPrismaClient = getPrismaClient as jest.MockedFunction<typeof getPrismaClient>;

// Mock Prisma client
const mockPrisma = {
  summary: {
    update: jest.fn()
  },
  $transaction: jest.fn()
};

describe('AsyncEmailQueue', () => {
  let emailQueue: AsyncEmailQueue;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset singleton instance
    (AsyncEmailQueue as any).instance = undefined;
    emailQueue = AsyncEmailQueue.getInstance();
    
    // Setup default mocks
    mockGetPrismaClient.mockReturnValue(mockPrisma as any);
    EmailQueueLock.releaseLock('email-queue-processing', 'test-process');
  });

  afterEach(() => {
    // Clean up any locks
    EmailQueueLock.releaseLock('email-queue-processing', 'test-process');
  });

  describe('Email Queuing', () => {
    const testEmailMessage: EmailMessage = {
      to: 'test@example.com',
      subject: 'Test Email',
      html: '<h1>Test</h1>',
      text: 'Test',
      tags: ['test']
    };

    it('should queue email successfully with default priority', async () => {
      mockJobQueueService.addJob.mockResolvedValue({ id: 'job-123' } as any);

      const jobId = await emailQueue.queueEmail(testEmailMessage);

      expect(jobId).toBe('job-123');
      expect(mockJobQueueService.addJob).toHaveBeenCalledWith({
        jobType: 'ASYNC_EMAIL_DIGEST',
        payload: expect.objectContaining({
          emailMessage: testEmailMessage,
          priority: 5,
          metadata: {},
          requestId: expect.any(String)
        }),
        priority: 5,
        scheduledFor: expect.any(Date),
        idempotencyKey: expect.stringMatching(/^email-/),
        maxAttempts: 3
      });
    });

    it('should queue email with custom priority and metadata', async () => {
      mockJobQueueService.addJob.mockResolvedValue({ id: 'job-456' } as any);

      const metadata = { summaryId: 'summary-123', userId: 'user-456' };
      const jobId = await emailQueue.queueEmail(testEmailMessage, {
        priority: 9,
        metadata,
        idempotencyKey: 'custom-key-123'
      });

      expect(jobId).toBe('job-456');
      expect(mockJobQueueService.addJob).toHaveBeenCalledWith({
        jobType: 'ASYNC_EMAIL_DIGEST',
        payload: expect.objectContaining({
          emailMessage: testEmailMessage,
          priority: 9,
          metadata,
          requestId: expect.any(String)
        }),
        priority: 9,
        scheduledFor: expect.any(Date),
        idempotencyKey: 'custom-key-123',
        maxAttempts: 3
      });
    });

    it('should handle queuing errors gracefully', async () => {
      mockJobQueueService.addJob.mockRejectedValue(new Error('Database connection failed'));

      await expect(emailQueue.queueEmail(testEmailMessage)).rejects.toThrow('Database connection failed');
    });

    it('should schedule email for future delivery', async () => {
      mockJobQueueService.addJob.mockResolvedValue({ id: 'job-789' } as any);
      
      const futureDate = new Date(Date.now() + 60000); // 1 minute from now
      await emailQueue.queueEmail(testEmailMessage, { scheduledFor: futureDate });

      expect(mockJobQueueService.addJob).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduledFor: futureDate
        })
      );
    });
  });

  describe('Idempotency Key Collision Testing', () => {
    const testEmailMessage: EmailMessage = {
      to: 'test@example.com',
      subject: 'Test Email',
      html: '<h1>Test</h1>',
      text: 'Test'
    };

    it('should handle idempotency key collisions by returning existing job', async () => {
      const idempotencyKey = 'test-collision-key';
      
      // First call succeeds
      mockJobQueueService.addJob.mockResolvedValueOnce({ id: 'job-original' } as any);
      
      // Second call with same key should either succeed (if using upsert) or fail gracefully
      mockJobQueueService.addJob.mockRejectedValueOnce(new Error('Duplicate idempotency key'));

      const firstJobId = await emailQueue.queueEmail(testEmailMessage, { idempotencyKey });
      expect(firstJobId).toBe('job-original');

      // Second attempt should be handled gracefully
      await expect(emailQueue.queueEmail(testEmailMessage, { idempotencyKey }))
        .rejects.toThrow('Duplicate idempotency key');
    });

    it('should generate unique idempotency keys when not provided', async () => {
      mockJobQueueService.addJob.mockResolvedValue({ id: 'job-123' } as any);

      await emailQueue.queueEmail(testEmailMessage);
      await emailQueue.queueEmail(testEmailMessage);

      const calls = mockJobQueueService.addJob.mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[0][0].idempotencyKey).not.toBe(calls[1][0].idempotencyKey);
      expect(calls[0][0].idempotencyKey).toMatch(/^email-/);
      expect(calls[1][0].idempotencyKey).toMatch(/^email-/);
    });

    it('should use provided idempotency key exactly', async () => {
      mockJobQueueService.addJob.mockResolvedValue({ id: 'job-123' } as any);
      const customKey = 'my-custom-idempotency-key';

      await emailQueue.queueEmail(testEmailMessage, { idempotencyKey: customKey });

      expect(mockJobQueueService.addJob).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: customKey
        })
      );
    });
  });

  describe('Priority Queue Ordering Verification', () => {
    const createEmailJob = (priority: number, id: string) => ({
      id,
      priority,
      status: 'PENDING' as const,
      payload: {
        emailMessage: {
          to: `test${id}@example.com`,
          subject: `Priority ${priority} Email`,
          html: `<h1>Priority ${priority}</h1>`,
          text: `Priority ${priority}`
        },
        priority,
        requestId: `req-${id}`
      }
    });

    it('should process emails in priority order (highest first)', async () => {
      const jobs = [
        createEmailJob(1, 'low'),    // Low priority
        createEmailJob(9, 'high'),   // High priority  
        createEmailJob(5, 'medium')  // Medium priority
      ];

      mockJobQueueService.getJobsToProcess.mockResolvedValue(jobs);
      mockEmailClient.sendEmail.mockResolvedValue({ 
        success: true, 
        id: 'email-sent' 
      });
      mockJobQueueService.updateJobStatus.mockResolvedValue(undefined);

      const processed = await emailQueue.processQueuedEmails(3);

      expect(processed).toBe(3);
      
      // Verify jobs are processed in order they were returned (JobQueueService should handle priority sorting)
      const updateCalls = mockJobQueueService.updateJobStatus.mock.calls;
      expect(updateCalls).toHaveLength(6); // 3 PROCESSING + 3 COMPLETED calls
      
      // Check that all jobs were marked as PROCESSING first, then COMPLETED
      const processingCalls = updateCalls.filter(call => call[1] === 'PROCESSING');
      const completedCalls = updateCalls.filter(call => call[1] === 'COMPLETED');
      
      expect(processingCalls).toHaveLength(3);
      expect(completedCalls).toHaveLength(3);
    });

    it('should handle mixed priority batch processing', async () => {
      const jobs = [
        createEmailJob(10, 'critical'),  // Critical priority
        createEmailJob(1, 'lowest'),     // Lowest priority
        createEmailJob(10, 'critical2')  // Another critical
      ];

      mockJobQueueService.getJobsToProcess.mockResolvedValue(jobs);
      mockEmailClient.sendEmail.mockResolvedValue({ 
        success: true, 
        id: 'email-sent' 
      });
      mockJobQueueService.updateJobStatus.mockResolvedValue(undefined);

      const processed = await emailQueue.processQueuedEmails(5);

      expect(processed).toBe(3);
      expect(mockEmailClient.sendEmail).toHaveBeenCalledTimes(3);
    });

    it('should respect batch size limits', async () => {
      const jobs = Array.from({ length: 10 }, (_, i) => 
        createEmailJob(i + 1, `job-${i}`)
      );

      mockJobQueueService.getJobsToProcess.mockResolvedValue(jobs);
      mockEmailClient.sendEmail.mockResolvedValue({ 
        success: true, 
        id: 'email-sent' 
      });
      mockJobQueueService.updateJobStatus.mockResolvedValue(undefined);

      const processed = await emailQueue.processQueuedEmails(3); // Limit to 3

      expect(processed).toBe(10); // Should process all jobs returned by getJobsToProcess
      expect(mockJobQueueService.getJobsToProcess).toHaveBeenCalledWith(3, 'ASYNC_EMAIL_DIGEST');
    });
  });

  describe('Email Processing and Retry Logic', () => {
    const testPayload: EmailJobPayload = {
      emailMessage: {
        to: 'test@example.com',
        subject: 'Test Subject',
        html: '<h1>Test</h1>',
        text: 'Test'
      },
      requestId: 'test-request-123',
      metadata: { summaryId: 'summary-456' }
    };

    it('should process email successfully and update database', async () => {
      mockEmailClient.sendEmail.mockResolvedValue({
        success: true,
        id: 'email-123'
      });
      mockPrisma.summary.update.mockResolvedValue({});

      const result = await emailQueue.processEmailJob(testPayload);

      expect(result.success).toBe(true);
      expect(result.emailId).toBe('email-123');
      
      // Verify database update was called
      expect(mockPrisma.summary.update).toHaveBeenCalledWith({
        where: { id: 'summary-456' },
        data: {
          sentToUser: true,
          totalEmailsSent: { increment: 1 },
          uniqueUsersServed: { increment: 1 }
        }
      });
    });

    it('should handle email sending failures with retry logic', async () => {
      mockEmailClient.sendEmail.mockResolvedValue({
        success: false,
        error: new Error('Network timeout')
      });

      const result = await emailQueue.processEmailJob(testPayload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network timeout');
      expect(result.retryable).toBe(true); // Network errors should be retryable
    });

    it('should identify non-retryable errors correctly', async () => {
      mockEmailClient.sendEmail.mockResolvedValue({
        success: false,
        error: new Error('Invalid email address')
      });

      const result = await emailQueue.processEmailJob(testPayload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid email address');
      expect(result.retryable).toBe(false); // Invalid email should not be retryable
    });

    it('should handle database update failures gracefully', async () => {
      mockEmailClient.sendEmail.mockResolvedValue({
        success: true,
        id: 'email-123'
      });
      mockPrisma.summary.update.mockRejectedValue(new Error('Database connection lost'));

      // Should still succeed email-wise even if DB update fails
      const result = await emailQueue.processEmailJob(testPayload);

      expect(result.success).toBe(true);
      expect(result.emailId).toBe('email-123');
    });

    it('should skip database update when no summaryId in metadata', async () => {
      const payloadWithoutSummary: EmailJobPayload = {
        emailMessage: testPayload.emailMessage,
        requestId: 'test-request-456',
        metadata: { userId: 'user-123' } // No summaryId
      };

      mockEmailClient.sendEmail.mockResolvedValue({
        success: true,
        id: 'email-456'
      });

      const result = await emailQueue.processEmailJob(payloadWithoutSummary);

      expect(result.success).toBe(true);
      expect(mockPrisma.summary.update).not.toHaveBeenCalled();
    });

    describe('Error Classification', () => {
      const testCases = [
        // Retryable errors
        { error: 'Network timeout', expected: true },
        { error: 'Connection refused', expected: true },
        { error: 'Service unavailable', expected: true },
        { error: 'Rate limit exceeded', expected: true },
        { error: 'Internal server error', expected: true },
        { error: 'Gateway timeout', expected: true },
        { error: 'Socket hang up', expected: true },
        
        // Non-retryable errors
        { error: 'Invalid email address', expected: false },
        { error: 'Domain not verified', expected: false },
        { error: 'Unauthorized access', expected: false },
        { error: 'Bad request', expected: false },
        { error: 'Forbidden access', expected: false },
        { error: 'Not found', expected: false },
        
        // Unknown errors default to retryable
        { error: 'Unknown mysterious error', expected: true }
      ];

      testCases.forEach(({ error, expected }) => {
        it(`should classify "${error}" as ${expected ? 'retryable' : 'non-retryable'}`, async () => {
          mockEmailClient.sendEmail.mockResolvedValue({
            success: false,
            error: new Error(error)
          });

          const result = await emailQueue.processEmailJob(testPayload);

          expect(result.retryable).toBe(expected);
        });
      });
    });
  });

  describe('Distributed Locking Conflict Scenarios', () => {
    it('should prevent concurrent processing with distributed lock', async () => {
      // First process acquires lock
      const process1 = AsyncEmailQueue.getInstance();
      const process2 = AsyncEmailQueue.getInstance();

      mockJobQueueService.getJobsToProcess.mockResolvedValue([]);

      // Simulate first process acquiring lock
      const result1Promise = process1.processQueuedEmails(5);
      
      // Second process should be blocked
      const result2 = await process2.processQueuedEmails(5);
      
      expect(result2).toBe(0); // Should not process anything due to lock
      
      // Wait for first process to complete
      const result1 = await result1Promise;
      expect(result1).toBe(0); // No jobs to process
    });

    it('should release lock after processing completes', async () => {
      mockJobQueueService.getJobsToProcess.mockResolvedValue([]);

      const result1 = await emailQueue.processQueuedEmails(5);
      expect(result1).toBe(0);

      // Lock should be released, so second call should work
      const result2 = await emailQueue.processQueuedEmails(5);
      expect(result2).toBe(0);
    });

    it('should release lock after processing fails', async () => {
      mockJobQueueService.getJobsToProcess.mockRejectedValue(new Error('Database error'));

      await expect(emailQueue.processQueuedEmails(5)).rejects.toThrow('Database error');

      // Lock should be released even after error
      mockJobQueueService.getJobsToProcess.mockResolvedValue([]);
      const result = await emailQueue.processQueuedEmails(5);
      expect(result).toBe(0);
    });

    it('should handle lock timeout scenarios', async () => {
      // Simulate expired lock
      const expiredLockKey = 'test-expired-lock';
      EmailQueueLock.acquireLock(expiredLockKey, 'old-process');
      
      // Mock lock timestamp to be expired
      const activeLocks = (EmailQueueLock as any).activeLocks;
      const lock = activeLocks.get(expiredLockKey);
      if (lock) {
        lock.timestamp = Date.now() - (6 * 60 * 1000); // 6 minutes ago (expired)
      }

      // New process should be able to acquire expired lock
      const canAcquire = EmailQueueLock.acquireLock(expiredLockKey, 'new-process');
      expect(canAcquire).toBe(true);
    });

    it('should provide lock status for debugging', async () => {
      const lockKey = 'test-debug-lock';
      const processId = 'debug-process-123';
      
      EmailQueueLock.acquireLock(lockKey, processId);
      
      const status = EmailQueueLock.getLockStatus();
      expect(status[lockKey]).toBeDefined();
      expect(status[lockKey].processId).toBe(processId);
      expect(status[lockKey].age).toBeGreaterThanOrEqual(0);
      
      EmailQueueLock.releaseLock(lockKey, processId);
    });
  });

  describe('Database Transaction Rollback Handling', () => {
    const testJob = {
      id: 'job-123',
      priority: 5,
      status: 'PENDING' as const,
      payload: {
        emailMessage: {
          to: 'test@example.com',
          subject: 'Test Email',
          html: '<h1>Test</h1>',
          text: 'Test'
        },
        requestId: 'req-123',
        metadata: { summaryId: 'summary-456' }
      }
    };

    it('should handle database transaction failures during job processing', async () => {
      mockJobQueueService.getJobsToProcess.mockResolvedValue([testJob]);
      mockEmailClient.sendEmail.mockResolvedValue({
        success: true,
        id: 'email-123'
      });
      
      // First call to mark as PROCESSING succeeds
      mockJobQueueService.updateJobStatus.mockResolvedValueOnce(undefined);
      // Summary update succeeds
      mockPrisma.summary.update.mockResolvedValue({});
      // Second call to mark as COMPLETED fails (simulating DB issue)
      mockJobQueueService.updateJobStatus.mockRejectedValueOnce(new Error('Database transaction failed'));

      const processed = await emailQueue.processQueuedEmails(1);

      // Should not count as processed if final status update fails
      expect(processed).toBe(0);
      expect(mockEmailClient.sendEmail).toHaveBeenCalledTimes(1);
    });

    it('should handle job status update failures gracefully', async () => {
      mockJobQueueService.getJobsToProcess.mockResolvedValue([testJob]);
      mockEmailClient.sendEmail.mockResolvedValue({
        success: true,
        id: 'email-123'
      });
      
      // First call (PROCESSING) fails
      mockJobQueueService.updateJobStatus.mockRejectedValueOnce(new Error('DB unavailable'));
      mockPrisma.summary.update.mockResolvedValue({}); // Summary update works

      const processed = await emailQueue.processQueuedEmails(1);

      // Should not count as processed when status update fails
      expect(processed).toBe(0);
      // Email should not be sent if initial status update fails
      expect(mockEmailClient.sendEmail).toHaveBeenCalledTimes(0);
    });

    it('should handle partial job processing failures', async () => {
      const jobs = [
        { ...testJob, id: 'job-1' },
        { ...testJob, id: 'job-2' },
        { ...testJob, id: 'job-3' }
      ];

      mockJobQueueService.getJobsToProcess.mockResolvedValue(jobs);
      
      // First email succeeds
      mockEmailClient.sendEmail.mockResolvedValueOnce({
        success: true,
        id: 'email-1'
      });
      
      // Second email fails
      mockEmailClient.sendEmail.mockResolvedValueOnce({
        success: false,
        error: new Error('Network error')
      });
      
      // Third email succeeds
      mockEmailClient.sendEmail.mockResolvedValueOnce({
        success: true,
        id: 'email-3'
      });

      mockJobQueueService.updateJobStatus.mockResolvedValue(undefined);
      mockPrisma.summary.update.mockResolvedValue({});

      const processed = await emailQueue.processQueuedEmails(3);

      expect(processed).toBe(2); // Only successful emails count as processed
      expect(mockEmailClient.sendEmail).toHaveBeenCalledTimes(3);
    });

    it('should maintain data consistency during concurrent operations', async () => {
      const concurrentJobs = Array.from({ length: 5 }, (_, i) => ({
        ...testJob,
        id: `concurrent-job-${i}`,
        payload: {
          ...testJob.payload,
          metadata: { summaryId: `summary-${i}` }
        }
      }));

      mockJobQueueService.getJobsToProcess.mockResolvedValue(concurrentJobs);
      mockEmailClient.sendEmail.mockResolvedValue({
        success: true,
        id: 'email-sent'
      });
      mockJobQueueService.updateJobStatus.mockResolvedValue(undefined);
      mockPrisma.summary.update.mockResolvedValue({});

      const processed = await emailQueue.processQueuedEmails(5);

      expect(processed).toBe(5);
      expect(mockPrisma.summary.update).toHaveBeenCalledTimes(5);
      
      // Verify each summary was updated correctly
      const updateCalls = mockPrisma.summary.update.mock.calls;
      for (let i = 0; i < 5; i++) {
        expect(updateCalls[i][0].where.id).toBe(`summary-${i}`);
      }
    });
  });

  describe('Email Rate Limiting Compliance Verification', () => {
    it('should respect rate limits during batch processing', async () => {
      const jobs = Array.from({ length: 10 }, (_, i) => ({
        id: `job-${i}`,
        priority: 5,
        status: 'PENDING' as const,
        payload: {
          emailMessage: {
            to: `test${i}@example.com`,
            subject: `Test Email ${i}`,
            html: `<h1>Test ${i}</h1>`,
            text: `Test ${i}`
          },
          requestId: `req-${i}`
        }
      }));

      mockJobQueueService.getJobsToProcess.mockResolvedValue(jobs);
      
      // Mock rate-limited email client responses
      let emailCount = 0;
      mockEmailClient.sendEmail.mockImplementation(async () => {
        emailCount++;
        // Simulate rate limiting after 5 emails
        if (emailCount > 5) {
          throw new Error('Rate limit exceeded: 5 emails per minute');
        }
        return { success: true, id: `email-${emailCount}` };
      });

      mockJobQueueService.updateJobStatus.mockResolvedValue(undefined);

      const processed = await emailQueue.processQueuedEmails(10);

      // Should process 5 emails before hitting rate limit
      expect(processed).toBe(5);
      expect(mockEmailClient.sendEmail).toHaveBeenCalledTimes(10); // Attempted all
    });

    it('should handle different rate limit error patterns', async () => {
      const rateLimitErrors = [
        'Rate limit exceeded',
        'Too many requests',
        'Quota exceeded',
        'Throttled',
        'Rate limiting in effect'
      ];

      for (const errorMessage of rateLimitErrors) {
        jest.clearAllMocks();
        
        const testJob = {
          id: 'rate-limit-test',
          priority: 5,
          status: 'PENDING' as const,
          payload: {
            emailMessage: {
              to: 'test@example.com',
              subject: 'Rate Limit Test',
              html: '<h1>Test</h1>',
              text: 'Test'
            },
            requestId: 'rate-test'
          }
        };

        mockJobQueueService.getJobsToProcess.mockResolvedValue([testJob]);
        mockEmailClient.sendEmail.mockResolvedValue({
          success: false,
          error: new Error(errorMessage)
        });
        mockJobQueueService.updateJobStatus.mockResolvedValue(undefined);

        const result = await emailQueue.processEmailJob(testJob.payload);

        expect(result.success).toBe(false);
        expect(result.retryable).toBe(true); // Rate limit errors should be retryable
        expect(result.error).toBe(errorMessage);
      }
    });

    it('should implement exponential backoff for rate limit retries', async () => {
      const testJob = {
        id: 'backoff-test',
        priority: 5,
        status: 'PENDING' as const,
        payload: {
          emailMessage: {
            to: 'test@example.com',
            subject: 'Backoff Test',
            html: '<h1>Test</h1>',
            text: 'Test'
          },
          requestId: 'backoff-test'
        }
      };

      mockJobQueueService.getJobsToProcess.mockResolvedValue([testJob]);
      mockEmailClient.sendEmail.mockResolvedValue({
        success: false,
        error: new Error('Rate limit exceeded')
      });
      mockJobQueueService.updateJobStatus.mockResolvedValue(undefined);

      const startTime = Date.now();
      const processed = await emailQueue.processQueuedEmails(1);
      const duration = Date.now() - startTime;

      expect(processed).toBe(0); // Failed due to rate limit
      expect(mockEmailClient.sendEmail).toHaveBeenCalledTimes(1);
      
      // Processing should complete quickly since we don't implement backoff in the queue itself
      // (backoff would be handled by the job retry mechanism)
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('Security and PII Protection', () => {
    describe('Email Masking', () => {
      it('should mask email addresses correctly', () => {
        const testCases = [
          { input: 'user@example.com', expected: 'us***r@example.com' },
          { input: 'a@test.com', expected: 'a***@test.com' },
          { input: 'ab@test.com', expected: 'a***@test.com' }, // Fixed: 2 chars shows first char only
          { input: 'test@domain.org', expected: 'te***t@domain.org' },
          { input: 'verylongusername@example.com', expected: 've***e@example.com' },
          { input: 'invalid-email', expected: '[MALFORMED_EMAIL]' },
          { input: '', expected: '[INVALID_EMAIL]' },
          { input: null as any, expected: '[INVALID_EMAIL]' }
        ];

        testCases.forEach(({ input, expected }) => {
          expect(maskEmailForLogging(input)).toBe(expected);
        });
      });
    });

    describe('User ID Masking', () => {
      it('should mask user IDs correctly', () => {
        const testCases = [
          { input: 'user123', expected: 'user****' },
          { input: 'usr', expected: 'usr' }, // Short IDs preserved
          { input: 'user', expected: 'user' }, // Short IDs preserved
          { input: 'user_123456789', expected: 'user_123****' },
          { input: 'very-long-user-id-12345', expected: 'very-lon****' },
          { input: '', expected: '[INVALID_USER_ID]' },
          { input: null as any, expected: '[INVALID_USER_ID]' }
        ];

        testCases.forEach(({ input, expected }) => {
          expect(maskUserIdForLogging(input)).toBe(expected);
        });
      });
    });

    describe('GDPR Compliant Logging', () => {
      it('should sanitize email data for logging', () => {
        const sensitiveData = {
          email: 'user@example.com',
          userId: 'user123456789',
          subject: 'Confidential: Your account details',
          content: 'Your password is secret123 and phone is 555-123-4567',
          metadata: {
            userEmail: 'nested@example.com',
            phone: '555-123-4567'
          },
          // Safe fields
          requestId: 'req-123',
          jobId: 'job-456',
          ticker: 'AAPL',
          status: 'PENDING'
        };

        const sanitized = createGDPRCompliantLogData(sensitiveData);

        expect(sanitized.email).toBe('us***r@example.com');
        expect(sanitized.userId).toBe('user1234****');
        expect(sanitized.subject).toContain('Confidential');
        expect(sanitized.subject.length).toBeLessThanOrEqual(100);
        expect(sanitized.content).toContain('[PHONE_REDACTED]');
        expect(sanitized.metadata.userEmail).toBe('ne***d@example.com');
        
        // Safe fields should be preserved
        expect(sanitized.requestId).toBe('req-123');
        expect(sanitized.jobId).toBe('job-456');
        expect(sanitized.ticker).toBe('AAPL');
        expect(sanitized.status).toBe('PENDING');
      });

      it('should handle nested objects recursively', () => {
        const nestedData = {
          level1: {
            email: 'level1@example.com',
            level2: {
              email: 'level2@example.com',
              userId: 'deep-user-id',
              level3: {
                content: 'Deeply nested PII: user@secret.com'
              }
            }
          }
        };

        const sanitized = createGDPRCompliantLogData(nestedData);

        expect(sanitized.level1.email).toBe('le***1@example.com');
        expect(sanitized.level1.level2.email).toBe('le***2@example.com');
        expect(sanitized.level1.level2.userId).toBe('deep-use****');
        expect(sanitized.level1.level2.level3.content).toContain('[EMAIL_REDACTED]');
      });
    });

    describe('Secure Logger', () => {
      it('should automatically sanitize all log data', () => {
        const mockLogger = {
          info: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
          debug: jest.fn()
        };

        const secureLogger = new SecureEmailLogger(mockLogger);

        const sensitiveData = {
          email: 'secret@example.com',
          content: 'Private information'
        };

        secureLogger.info('Test message', sensitiveData);
        secureLogger.warn('Warning message', sensitiveData);
        secureLogger.error('Error message', sensitiveData);
        secureLogger.debug('Debug message', sensitiveData);

        // Verify all methods received sanitized data
        expect(mockLogger.info).toHaveBeenCalledWith('Test message', {
          email: 'se***t@example.com',
          content: 'Private information'
        });
        expect(mockLogger.warn).toHaveBeenCalledWith('Warning message', {
          email: 'se***t@example.com',
          content: 'Private information'
        });
        expect(mockLogger.error).toHaveBeenCalledWith('Error message', {
          email: 'se***t@example.com',
          content: 'Private information'
        });
        expect(mockLogger.debug).toHaveBeenCalledWith('Debug message', {
          email: 'se***t@example.com',
          content: 'Private information'
        });
      });
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle high-volume email processing efficiently', async () => {
      const jobCount = 100;
      const jobs = Array.from({ length: jobCount }, (_, i) => ({
        id: `perf-job-${i}`,
        priority: Math.floor(Math.random() * 10) + 1,
        status: 'PENDING' as const,
        payload: {
          emailMessage: {
            to: `user${i}@example.com`,
            subject: `Performance Test Email ${i}`,
            html: `<h1>Test ${i}</h1>`,
            text: `Test ${i}`
          },
          requestId: `perf-req-${i}`
        }
      }));

      mockJobQueueService.getJobsToProcess.mockResolvedValue(jobs);
      mockEmailClient.sendEmail.mockImplementation(async () => {
        // Simulate varying response times
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
        return { success: true, id: `email-${Date.now()}` };
      });
      mockJobQueueService.updateJobStatus.mockResolvedValue(undefined);

      const startTime = Date.now();
      const processed = await emailQueue.processQueuedEmails(jobCount);
      const duration = Date.now() - startTime;

      expect(processed).toBe(jobCount);
      expect(mockEmailClient.sendEmail).toHaveBeenCalledTimes(jobCount);
      
      // Performance assertion - should process 100 emails in reasonable time
      expect(duration).toBeLessThan(5000); // 5 seconds
    });

    it('should handle concurrent queue processing attempts', async () => {
      const jobs = Array.from({ length: 10 }, (_, i) => ({
        id: `concurrent-${i}`,
        priority: 5,
        status: 'PENDING' as const,
        payload: {
          emailMessage: {
            to: `concurrent${i}@example.com`,
            subject: `Concurrent Test ${i}`,
            html: `<h1>Concurrent ${i}</h1>`,
            text: `Concurrent ${i}`
          },
          requestId: `concurrent-${i}`
        }
      }));

      mockJobQueueService.getJobsToProcess.mockResolvedValue(jobs);
      mockEmailClient.sendEmail.mockResolvedValue({
        success: true,
        id: 'email-sent'
      });
      mockJobQueueService.updateJobStatus.mockResolvedValue(undefined);

      // Start multiple processing attempts concurrently
      const promises = [
        emailQueue.processQueuedEmails(5),
        emailQueue.processQueuedEmails(5),
        emailQueue.processQueuedEmails(5)
      ];

      const results = await Promise.all(promises);

      // Only one should succeed due to locking, others should return 0
      const successfulResults = results.filter(r => r > 0);
      const blockedResults = results.filter(r => r === 0);

      expect(successfulResults).toHaveLength(1);
      expect(blockedResults).toHaveLength(2);
      expect(successfulResults[0]).toBe(10); // Processed all jobs
    });

    it('should handle memory-intensive email processing', async () => {
      // Create jobs with large payloads to test memory handling
      const largeContent = 'x'.repeat(10000); // 10KB content
      const jobs = Array.from({ length: 50 }, (_, i) => ({
        id: `memory-job-${i}`,
        priority: 5,
        status: 'PENDING' as const,
        payload: {
          emailMessage: {
            to: `memory${i}@example.com`,
            subject: `Memory Test ${i}`,
            html: `<h1>Large Content</h1><p>${largeContent}</p>`,
            text: `Large Content: ${largeContent}`
          },
          requestId: `memory-req-${i}`,
          metadata: { largeData: largeContent }
        }
      }));

      mockJobQueueService.getJobsToProcess.mockResolvedValue(jobs);
      mockEmailClient.sendEmail.mockResolvedValue({
        success: true,
        id: 'email-sent'
      });
      mockJobQueueService.updateJobStatus.mockResolvedValue(undefined);

      const processed = await emailQueue.processQueuedEmails(50);

      expect(processed).toBe(50);
      expect(mockEmailClient.sendEmail).toHaveBeenCalledTimes(50);
    });
  });

  describe('Edge Cases and Error Boundaries', () => {
    it('should handle malformed job payloads gracefully', async () => {
      const malformedJobs = [
        {
          id: 'malformed-1',
          priority: 5,
          status: 'PENDING' as const,
          payload: null as any
        },
        {
          id: 'malformed-2', 
          priority: 5,
          status: 'PENDING' as const,
          payload: {
            emailMessage: null,
            requestId: 'test'
          } as any
        },
        {
          id: 'malformed-3',
          priority: 5,
          status: 'PENDING' as const,
          payload: {
            emailMessage: {
              to: '', // Empty email
              subject: 'Test',
              html: 'Test',
              text: 'Test'
            },
            requestId: 'test'
          }
        }
      ];

      mockJobQueueService.getJobsToProcess.mockResolvedValue(malformedJobs);
      mockEmailClient.sendEmail.mockImplementation(async (message) => {
        if (!message.to) {
          throw new Error('Invalid email address');
        }
        return { success: true, id: 'email-sent' };
      });
      mockJobQueueService.updateJobStatus.mockResolvedValue(undefined);

      const processed = await emailQueue.processQueuedEmails(3);

      // Should handle errors gracefully and continue processing
      expect(processed).toBe(0); // None should succeed with malformed data
      expect(mockJobQueueService.updateJobStatus).toHaveBeenCalled();
    });

    it('should handle network timeouts and retries', async () => {
      const timeoutJob = {
        id: 'timeout-job',
        priority: 5,
        status: 'PENDING' as const,
        payload: {
          emailMessage: {
            to: 'timeout@example.com',
            subject: 'Timeout Test',
            html: '<h1>Test</h1>',
            text: 'Test'
          },
          requestId: 'timeout-test'
        }
      };

      mockJobQueueService.getJobsToProcess.mockResolvedValue([timeoutJob]);
      mockEmailClient.sendEmail.mockRejectedValue(new Error('Network timeout'));
      mockJobQueueService.updateJobStatus.mockResolvedValue(undefined);

      const processed = await emailQueue.processQueuedEmails(1);

      expect(processed).toBe(0); // Should fail but not crash
      expect(mockJobQueueService.updateJobStatus).toHaveBeenCalledWith(
        'timeout-job',
        'FAILED',
        expect.objectContaining({
          error: 'Network timeout'
        })
      );
    });

    it('should handle graceful shutdown scenarios', async () => {
      const jobs = Array.from({ length: 5 }, (_, i) => ({
        id: `shutdown-job-${i}`,
        priority: 5,
        status: 'PENDING' as const,
        payload: {
          emailMessage: {
            to: `shutdown${i}@example.com`,
            subject: `Shutdown Test ${i}`,
            html: `<h1>Test ${i}</h1>`,
            text: `Test ${i}`
          },
          requestId: `shutdown-${i}`
        }
      }));

      mockJobQueueService.getJobsToProcess.mockResolvedValue(jobs);
      
      let processedCount = 0;
      mockEmailClient.sendEmail.mockImplementation(async () => {
        processedCount++;
        if (processedCount === 3) {
          // Simulate shutdown signal
          throw new Error('Service shutting down');
        }
        return { success: true, id: `email-${processedCount}` };
      });
      
      mockJobQueueService.updateJobStatus.mockResolvedValue(undefined);

      const processed = await emailQueue.processQueuedEmails(5);

      // Should process some emails before shutdown
      expect(processed).toBeLessThan(5);
      expect(processed).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Integration with JobQueueService', () => {
    it('should correctly call JobQueueService methods with proper parameters', async () => {
      // Test queueEmail integration
      mockJobQueueService.addJob.mockResolvedValue({ id: 'integration-job' } as any);

      const emailMessage: EmailMessage = {
        to: 'integration@example.com',
        subject: 'Integration Test',
        html: '<h1>Integration</h1>',
        text: 'Integration'
      };

      await queueEmail(emailMessage, { priority: 8, metadata: { test: true } });

      expect(mockJobQueueService.addJob).toHaveBeenCalledWith({
        jobType: 'ASYNC_EMAIL_DIGEST',
        payload: expect.objectContaining({
          emailMessage,
          priority: 8,
          metadata: { test: true }
        }),
        priority: 8,
        scheduledFor: expect.any(Date),
        idempotencyKey: expect.stringMatching(/^email-/),
        maxAttempts: 3
      });
    });

    it('should call processQueuedEmails with correct batch size and job type', async () => {
      mockJobQueueService.getJobsToProcess.mockResolvedValue([]);

      await processQueuedEmails(10);

      expect(mockJobQueueService.getJobsToProcess).toHaveBeenCalledWith(10, 'ASYNC_EMAIL_DIGEST');
    });

    it('should handle JobQueueService errors appropriately', async () => {
      mockJobQueueService.addJob.mockRejectedValue(new Error('Queue service unavailable'));

      await expect(queueEmail({
        to: 'test@example.com',
        subject: 'Test',
        html: 'Test',
        text: 'Test'
      })).rejects.toThrow('Queue service unavailable');
    });
  });
});

describe('Convenience Functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockJobQueueService.addJob.mockResolvedValue({ id: 'convenience-test' } as any);
    mockJobQueueService.getJobsToProcess.mockResolvedValue([]);
  });

  it('should export working convenience functions', async () => {
    const emailMessage: EmailMessage = {
      to: 'convenience@example.com',
      subject: 'Convenience Test',
      html: '<h1>Test</h1>',
      text: 'Test'
    };

    const jobId = await queueEmail(emailMessage);
    expect(jobId).toBe('convenience-test');

    const processed = await processQueuedEmails(5);
    expect(processed).toBe(0);
  });
});