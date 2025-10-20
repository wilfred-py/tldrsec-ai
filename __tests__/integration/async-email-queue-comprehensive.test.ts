/**
 * Comprehensive Async Email Queue Integration Test Suite
 * 
 * End-to-end integration tests that verify the entire async email queue system
 * works correctly from queuing through processing to completion.
 * 
 * These tests ensure all components work together properly:
 * - AsyncEmailQueue
 * - JobQueueService 
 * - QueueManagerService
 * - Security helpers
 * - Database operations
 * - Error handling and recovery
 */

// Mock environment variables
process.env.TEST_EMAIL = 'test@example.com';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.ANTHROPIC_API_KEY = 'test-key';
process.env.RESEND_API_KEY = 'test-resend-key';

// Mock external dependencies
jest.mock('../../../lib/db/prisma', () => {
  const mockPrisma = {
    jobQueue: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      groupBy: jest.fn(),
      count: jest.fn()
    },
    summary: {
      update: jest.fn(),
      findFirst: jest.fn()
    },
    user: {
      findMany: jest.fn()
    },
    $transaction: jest.fn()
  };
  
  return {
    getPrismaClient: jest.fn(() => mockPrisma),
    prisma: mockPrisma
  };
});

jest.mock('../../../lib/email/index', () => ({
  emailClient: {
    sendEmail: jest.fn()
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

import { 
  AsyncEmailQueue, 
  queueEmail, 
  processQueuedEmails 
} from '../../../lib/email/async-email-queue';
import { EmailQueueLock } from '../../../lib/email/security-helpers';
import { getPrismaClient } from '../../../lib/db/prisma';
import { emailClient } from '../../../lib/email/index';
import { EmailMessage } from '../../../lib/email/types';
import { QueueManagerService } from '../../../lib/job-queue/queue-manager';

// Get mock implementations
const mockPrisma = getPrismaClient();
const mockEmailClient = emailClient as jest.Mocked<typeof emailClient>;

describe('Async Email Queue Comprehensive Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset singleton instances and static state
    (AsyncEmailQueue as any).instance = undefined;
    (QueueManagerService as any).workers = [];
    (QueueManagerService as any).isMonitoring = false;
    
    // Clear all locks
    const activeLocks = (EmailQueueLock as any).activeLocks;
    activeLocks.clear();
    
    // Setup default successful responses
    mockEmailClient.sendEmail.mockResolvedValue({
      success: true,
      id: 'test-email-id'
    });
    
    mockPrisma.summary.update.mockResolvedValue({});
    mockPrisma.jobQueue.create.mockImplementation(async (data) => ({
      id: `job-${Math.random().toString(36).substr(2, 9)}`,
      ...data.data
    }));
  });

  afterEach(() => {
    // Clean up any remaining locks
    const activeLocks = (EmailQueueLock as any).activeLocks;
    activeLocks.clear();
  });

  describe('Complete Email Processing Workflow', () => {
    it('should process a complete email workflow from queue to delivery', async () => {
      const testEmail: EmailMessage = {
        to: 'integration@example.com',
        subject: 'Integration Test Email',
        html: '<h1>Integration Test</h1><p>This is a comprehensive test</p>',
        text: 'Integration Test\n\nThis is a comprehensive test',
        tags: ['integration', 'test']
      };

      const metadata = {
        summaryId: 'summary-123',
        userId: 'user-456',
        testType: 'integration'
      };

      // Step 1: Queue the email
      const emailQueue = AsyncEmailQueue.getInstance();
      
      // Mock JobQueueService.addJob
      const mockJob = {
        id: 'integration-job-123',
        jobType: 'ASYNC_EMAIL_DIGEST',
        payload: {
          emailMessage: testEmail,
          priority: 5,
          metadata,
          requestId: expect.any(String)
        },
        priority: 5,
        status: 'PENDING',
        createdAt: new Date()
      };
      
      mockPrisma.jobQueue.create.mockResolvedValue(mockJob);
      
      const jobId = await emailQueue.queueEmail(testEmail, {
        priority: 5,
        metadata,
        idempotencyKey: 'integration-test-key'
      });
      
      expect(jobId).toBe('integration-job-123');
      expect(mockPrisma.jobQueue.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          jobType: 'ASYNC_EMAIL_DIGEST',
          payload: expect.objectContaining({
            emailMessage: testEmail,
            metadata
          }),
          priority: 5,
          idempotencyKey: 'integration-test-key'
        })
      });

      // Step 2: Mock job retrieval for processing
      mockPrisma.jobQueue.findMany.mockResolvedValue([mockJob]);
      mockPrisma.jobQueue.update.mockResolvedValue(mockJob);

      // Step 3: Process the queued email
      const processed = await emailQueue.processQueuedEmails(1);

      expect(processed).toBe(1);
      
      // Verify email was sent
      expect(mockEmailClient.sendEmail).toHaveBeenCalledWith(testEmail, {
        requestId: expect.any(String),
        timeout: 30000
      });
      
      // Verify summary was updated
      expect(mockPrisma.summary.update).toHaveBeenCalledWith({
        where: { id: 'summary-123' },
        data: {
          sentToUser: true,
          totalEmailsSent: { increment: 1 },
          uniqueUsersServed: { increment: 1 }
        }
      });
      
      // Verify job status updates
      expect(mockPrisma.jobQueue.update).toHaveBeenCalledWith({
        where: { id: 'integration-job-123' },
        data: expect.objectContaining({
          status: 'PROCESSING'
        })
      });
      
      expect(mockPrisma.jobQueue.update).toHaveBeenCalledWith({
        where: { id: 'integration-job-123' },
        data: expect.objectContaining({
          status: 'COMPLETED',
          result: { emailId: 'test-email-id' }
        })
      });
    });

    it('should handle complete failure workflow with retry logic', async () => {
      const testEmail: EmailMessage = {
        to: 'failure@example.com',
        subject: 'Failure Test Email',
        html: '<h1>Failure Test</h1>',
        text: 'Failure Test'
      };

      const emailQueue = AsyncEmailQueue.getInstance();
      
      // Mock job creation
      const mockJob = {
        id: 'failure-job-123',
        jobType: 'ASYNC_EMAIL_DIGEST',
        payload: {
          emailMessage: testEmail,
          requestId: 'failure-req-123'
        },
        priority: 5,
        status: 'PENDING'
      };
      
      mockPrisma.jobQueue.create.mockResolvedValue(mockJob);
      mockPrisma.jobQueue.findMany.mockResolvedValue([mockJob]);
      mockPrisma.jobQueue.update.mockResolvedValue(mockJob);
      
      // Mock email sending failure
      mockEmailClient.sendEmail.mockResolvedValue({
        success: false,
        error: new Error('Network timeout - retryable error')
      });

      // Queue and process
      await emailQueue.queueEmail(testEmail);
      const processed = await emailQueue.processQueuedEmails(1);

      expect(processed).toBe(0); // Failed processing

      // Verify job was marked as failed with retry metadata
      expect(mockPrisma.jobQueue.update).toHaveBeenCalledWith({
        where: { id: 'failure-job-123' },
        data: expect.objectContaining({
          status: 'FAILED',
          error: 'Network timeout - retryable error',
          retryable: true
        })
      });
    });

    it('should handle mixed success and failure scenarios', async () => {
      const emails = [
        {
          to: 'success1@example.com',
          subject: 'Success Email 1',
          html: '<h1>Success 1</h1>',
          text: 'Success 1'
        },
        {
          to: 'failure@example.com', 
          subject: 'Failure Email',
          html: '<h1>Failure</h1>',
          text: 'Failure'
        },
        {
          to: 'success2@example.com',
          subject: 'Success Email 2', 
          html: '<h1>Success 2</h1>',
          text: 'Success 2'
        }
      ];

      const emailQueue = AsyncEmailQueue.getInstance();
      
      // Mock jobs
      const mockJobs = emails.map((email, i) => ({
        id: `mixed-job-${i}`,
        jobType: 'ASYNC_EMAIL_DIGEST',
        payload: {
          emailMessage: email,
          requestId: `mixed-req-${i}`,
          metadata: { summaryId: `summary-${i}` }
        },
        priority: 5,
        status: 'PENDING'
      }));
      
      mockPrisma.jobQueue.findMany.mockResolvedValue(mockJobs);
      mockPrisma.jobQueue.update.mockResolvedValue({});
      
      // Mock email responses: success, failure, success
      mockEmailClient.sendEmail
        .mockResolvedValueOnce({ success: true, id: 'email-1' })
        .mockResolvedValueOnce({ success: false, error: new Error('Invalid email') })
        .mockResolvedValueOnce({ success: true, id: 'email-3' });

      const processed = await emailQueue.processQueuedEmails(3);

      expect(processed).toBe(2); // 2 successful
      expect(mockEmailClient.sendEmail).toHaveBeenCalledTimes(3);
      
      // Verify summary updates only for successful emails
      expect(mockPrisma.summary.update).toHaveBeenCalledTimes(2);
      expect(mockPrisma.summary.update).toHaveBeenCalledWith({
        where: { id: 'summary-0' },
        data: expect.any(Object)
      });
      expect(mockPrisma.summary.update).toHaveBeenCalledWith({
        where: { id: 'summary-2' },
        data: expect.any(Object)
      });
    });
  });

  describe('Priority Processing Integration', () => {
    it('should process emails in priority order end-to-end', async () => {
      const priorityEmails = [
        {
          email: {
            to: 'low@example.com',
            subject: 'Low Priority',
            html: '<h1>Low</h1>',
            text: 'Low'
          },
          priority: 1
        },
        {
          email: {
            to: 'high@example.com', 
            subject: 'High Priority',
            html: '<h1>High</h1>',
            text: 'High'
          },
          priority: 9
        },
        {
          email: {
            to: 'medium@example.com',
            subject: 'Medium Priority', 
            html: '<h1>Medium</h1>',
            text: 'Medium'
          },
          priority: 5
        }
      ];

      const emailQueue = AsyncEmailQueue.getInstance();
      
      // Queue all emails
      const jobIds = [];
      for (const { email, priority } of priorityEmails) {
        mockPrisma.jobQueue.create.mockResolvedValueOnce({
          id: `priority-job-${priority}`,
          jobType: 'ASYNC_EMAIL_DIGEST',
          payload: { emailMessage: email, priority },
          priority,
          status: 'PENDING'
        });
        
        const jobId = await emailQueue.queueEmail(email, { priority });
        jobIds.push(jobId);
      }

      // Mock retrieval in priority order (high to low)
      const sortedJobs = [
        {
          id: 'priority-job-9',
          payload: { emailMessage: priorityEmails[1].email, priority: 9 },
          priority: 9
        },
        {
          id: 'priority-job-5', 
          payload: { emailMessage: priorityEmails[2].email, priority: 5 },
          priority: 5
        },
        {
          id: 'priority-job-1',
          payload: { emailMessage: priorityEmails[0].email, priority: 1 },
          priority: 1
        }
      ];
      
      mockPrisma.jobQueue.findMany.mockResolvedValue(sortedJobs);
      mockPrisma.jobQueue.update.mockResolvedValue({});

      const processed = await emailQueue.processQueuedEmails(3);

      expect(processed).toBe(3);
      
      // Verify emails were processed in priority order
      const emailCalls = mockEmailClient.sendEmail.mock.calls;
      expect(emailCalls[0][0].subject).toBe('High Priority');
      expect(emailCalls[1][0].subject).toBe('Medium Priority');
      expect(emailCalls[2][0].subject).toBe('Low Priority');
    });
  });

  describe('Distributed Locking Integration', () => {
    it('should prevent concurrent processing with distributed locks', async () => {
      const testEmail: EmailMessage = {
        to: 'concurrent@example.com',
        subject: 'Concurrent Test',
        html: '<h1>Concurrent</h1>',
        text: 'Concurrent'
      };

      // Mock jobs for concurrent processing
      const mockJobs = Array.from({ length: 5 }, (_, i) => ({
        id: `concurrent-job-${i}`,
        jobType: 'ASYNC_EMAIL_DIGEST',
        payload: {
          emailMessage: { ...testEmail, to: `concurrent${i}@example.com` },
          requestId: `concurrent-req-${i}`
        },
        priority: 5,
        status: 'PENDING'
      }));

      mockPrisma.jobQueue.findMany.mockResolvedValue(mockJobs);
      mockPrisma.jobQueue.update.mockResolvedValue({});

      // Create multiple queue instances to simulate concurrent workers
      const queue1 = AsyncEmailQueue.getInstance();
      const queue2 = AsyncEmailQueue.getInstance();
      const queue3 = AsyncEmailQueue.getInstance();

      // Process concurrently
      const results = await Promise.all([
        queue1.processQueuedEmails(5),
        queue2.processQueuedEmails(5),
        queue3.processQueuedEmails(5)
      ]);

      // Only one should succeed due to locking
      const successfulResults = results.filter(r => r > 0);
      const blockedResults = results.filter(r => r === 0);

      expect(successfulResults).toHaveLength(1);
      expect(blockedResults).toHaveLength(2);
      expect(successfulResults[0]).toBe(5);
    });

    it('should handle lock expiration and recovery', async () => {
      const testEmail: EmailMessage = {
        to: 'expiration@example.com',
        subject: 'Lock Expiration Test',
        html: '<h1>Expiration</h1>',
        text: 'Expiration'
      };

      const emailQueue = AsyncEmailQueue.getInstance();

      // Manually acquire lock and expire it
      const lockKey = 'email-queue-processing';
      const processId = 'expired-process';
      EmailQueueLock.acquireLock(lockKey, processId);

      // Manually expire the lock
      const activeLocks = (EmailQueueLock as any).activeLocks;
      const lock = activeLocks.get(lockKey);
      if (lock) {
        lock.timestamp = Date.now() - (6 * 60 * 1000); // 6 minutes ago
      }

      // Mock job for processing
      mockPrisma.jobQueue.findMany.mockResolvedValue([{
        id: 'expiration-job',
        jobType: 'ASYNC_EMAIL_DIGEST',
        payload: {
          emailMessage: testEmail,
          requestId: 'expiration-req'
        },
        priority: 5,
        status: 'PENDING'
      }]);
      mockPrisma.jobQueue.update.mockResolvedValue({});

      // Should be able to process despite expired lock
      const processed = await emailQueue.processQueuedEmails(1);

      expect(processed).toBe(1);
      expect(mockEmailClient.sendEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover from database connection failures', async () => {
      const testEmail: EmailMessage = {
        to: 'recovery@example.com',
        subject: 'Recovery Test',
        html: '<h1>Recovery</h1>',
        text: 'Recovery'
      };

      const emailQueue = AsyncEmailQueue.getInstance();

      // First attempt: database failure during job status update
      mockPrisma.jobQueue.findMany.mockResolvedValueOnce([{
        id: 'recovery-job',
        jobType: 'ASYNC_EMAIL_DIGEST',
        payload: {
          emailMessage: testEmail,
          requestId: 'recovery-req'
        },
        priority: 5,
        status: 'PENDING'
      }]);

      // Mock database failure during status update
      mockPrisma.jobQueue.update
        .mockRejectedValueOnce(new Error('Database connection lost'))
        .mockResolvedValue({});

      // Should handle database error gracefully
      const processed1 = await emailQueue.processQueuedEmails(1);
      expect(processed1).toBe(1); // Email still sent successfully

      // Second attempt: full recovery
      mockPrisma.jobQueue.findMany.mockResolvedValueOnce([{
        id: 'recovery-job-2',
        jobType: 'ASYNC_EMAIL_DIGEST',
        payload: {
          emailMessage: { ...testEmail, to: 'recovery2@example.com' },
          requestId: 'recovery-req-2'
        },
        priority: 5,
        status: 'PENDING'
      }]);

      const processed2 = await emailQueue.processQueuedEmails(1);
      expect(processed2).toBe(1);

      expect(mockEmailClient.sendEmail).toHaveBeenCalledTimes(2);
    });

    it('should handle email service outages with proper error classification', async () => {
      const testEmails = [
        { to: 'timeout@example.com', subject: 'Timeout Test' },
        { to: 'invalid@example.com', subject: 'Invalid Test' },
        { to: 'ratelimit@example.com', subject: 'Rate Limit Test' }
      ];

      const emailQueue = AsyncEmailQueue.getInstance();

      const mockJobs = testEmails.map((email, i) => ({
        id: `outage-job-${i}`,
        jobType: 'ASYNC_EMAIL_DIGEST',
        payload: {
          emailMessage: { ...email, html: '<h1>Test</h1>', text: 'Test' },
          requestId: `outage-req-${i}`
        },
        priority: 5,
        status: 'PENDING'
      }));

      mockPrisma.jobQueue.findMany.mockResolvedValue(mockJobs);
      mockPrisma.jobQueue.update.mockResolvedValue({});

      // Mock different types of failures
      mockEmailClient.sendEmail
        .mockResolvedValueOnce({ success: false, error: new Error('Network timeout') })
        .mockResolvedValueOnce({ success: false, error: new Error('Invalid email address') })
        .mockResolvedValueOnce({ success: false, error: new Error('Rate limit exceeded') });

      const processed = await emailQueue.processQueuedEmails(3);

      expect(processed).toBe(0); // All failed
      
      // Verify proper error classification
      const updateCalls = mockPrisma.jobQueue.update.mock.calls
        .filter(call => call[1]?.data?.status === 'FAILED');

      expect(updateCalls).toHaveLength(3);
      
      // Network timeout - retryable
      expect(updateCalls[0][1].data).toEqual(
        expect.objectContaining({
          error: 'Network timeout',
          retryable: true
        })
      );
      
      // Invalid email - not retryable
      expect(updateCalls[1][1].data).toEqual(
        expect.objectContaining({
          error: 'Invalid email address'
          // retryable should not be set for non-retryable errors
        })
      );
      
      // Rate limit - retryable
      expect(updateCalls[2][1].data).toEqual(
        expect.objectContaining({
          error: 'Rate limit exceeded',
          retryable: true
        })
      );
    });
  });

  describe('Security and Data Protection Integration', () => {
    it('should maintain PII protection throughout the entire workflow', async () => {
      const sensitiveEmail: EmailMessage = {
        to: 'sensitive.user@example.com',
        subject: 'Account Information for John Doe (SSN: 123-45-6789)',
        html: '<h1>Private Data</h1><p>Contact: sensitive.user@example.com, Phone: 555-123-4567</p>',
        text: 'Private Data\nContact: sensitive.user@example.com, Phone: 555-123-4567'
      };

      const emailQueue = AsyncEmailQueue.getInstance();

      // Mock job creation and processing
      mockPrisma.jobQueue.create.mockResolvedValue({
        id: 'sensitive-job',
        jobType: 'ASYNC_EMAIL_DIGEST',
        payload: {
          emailMessage: sensitiveEmail,
          requestId: 'sensitive-req'
        }
      });

      mockPrisma.jobQueue.findMany.mockResolvedValue([{
        id: 'sensitive-job',
        payload: {
          emailMessage: sensitiveEmail,
          requestId: 'sensitive-req'
        }
      }]);

      mockPrisma.jobQueue.update.mockResolvedValue({});

      // Process the sensitive email
      await emailQueue.queueEmail(sensitiveEmail);
      await emailQueue.processQueuedEmails(1);

      // Email should be sent (PII protection doesn't block processing)
      expect(mockEmailClient.sendEmail).toHaveBeenCalledWith(sensitiveEmail, expect.any(Object));
      
      // Verify that any logging would have PII masked
      // Note: In a real test environment, we would check actual log outputs
      // Here we verify the masking functions work correctly with the actual data
      const { maskEmailForLogging, createGDPRCompliantLogData } = require('../../../lib/email/security-helpers');
      
      expect(maskEmailForLogging(sensitiveEmail.to)).toBe('se***r@example.com');
      
      const logData = createGDPRCompliantLogData({
        email: sensitiveEmail.to,
        subject: sensitiveEmail.subject,
        content: sensitiveEmail.text
      });
      
      expect(logData.email).toBe('se***r@example.com');
      expect(logData.subject).toContain('[SSN_REDACTED]');
      expect(logData.content).toContain('[EMAIL_REDACTED]');
      expect(logData.content).toContain('[PHONE_REDACTED]');
    });
  });

  describe('Performance and Load Integration', () => {
    it('should handle high-volume email processing efficiently', async () => {
      const emailCount = 50;
      const emails = Array.from({ length: emailCount }, (_, i) => ({
        to: `load${i}@example.com`,
        subject: `Load Test Email ${i}`,
        html: `<h1>Load Test ${i}</h1>`,
        text: `Load Test ${i}`
      }));

      const emailQueue = AsyncEmailQueue.getInstance();

      // Mock all jobs
      const mockJobs = emails.map((email, i) => ({
        id: `load-job-${i}`,
        jobType: 'ASYNC_EMAIL_DIGEST',
        payload: {
          emailMessage: email,
          requestId: `load-req-${i}`
        },
        priority: Math.floor(Math.random() * 10) + 1,
        status: 'PENDING'
      }));

      mockPrisma.jobQueue.findMany.mockResolvedValue(mockJobs);
      mockPrisma.jobQueue.update.mockResolvedValue({});

      // Mock email client with slight delays to simulate real-world conditions
      mockEmailClient.sendEmail.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
        return { success: true, id: `email-${Math.random()}` };
      });

      const startTime = Date.now();
      const processed = await emailQueue.processQueuedEmails(emailCount);
      const duration = Date.now() - startTime;

      expect(processed).toBe(emailCount);
      expect(mockEmailClient.sendEmail).toHaveBeenCalledTimes(emailCount);
      
      // Should complete within reasonable time for integration test
      expect(duration).toBeLessThan(5000); // 5 seconds for 50 emails
    });

    it('should maintain data consistency under concurrent load', async () => {
      const concurrentBatches = 3;
      const emailsPerBatch = 10;
      
      const allResults = [];

      for (let batch = 0; batch < concurrentBatches; batch++) {
        const batchEmails = Array.from({ length: emailsPerBatch }, (_, i) => ({
          id: `concurrent-job-${batch}-${i}`,
          jobType: 'ASYNC_EMAIL_DIGEST',
          payload: {
            emailMessage: {
              to: `concurrent${batch}-${i}@example.com`,
              subject: `Concurrent Email ${batch}-${i}`,
              html: `<h1>Concurrent ${batch}-${i}</h1>`,
              text: `Concurrent ${batch}-${i}`
            },
            requestId: `concurrent-req-${batch}-${i}`,
            metadata: { summaryId: `summary-${batch}-${i}` }
          },
          priority: 5,
          status: 'PENDING'
        }));

        mockPrisma.jobQueue.findMany.mockResolvedValueOnce(batchEmails);
        mockPrisma.jobQueue.update.mockResolvedValue({});
        
        const emailQueue = AsyncEmailQueue.getInstance();
        const resultPromise = emailQueue.processQueuedEmails(emailsPerBatch);
        allResults.push(resultPromise);
      }

      const results = await Promise.all(allResults);
      
      // Due to locking, only one batch should process fully
      const totalProcessed = results.reduce((sum, count) => sum + count, 0);
      expect(totalProcessed).toBe(emailsPerBatch); // Only one batch succeeds
      
      // Verify consistent behavior
      const successfulBatches = results.filter(r => r > 0);
      expect(successfulBatches).toHaveLength(1);
    });
  });

  describe('Idempotency and Deduplication', () => {
    it('should handle duplicate email requests with idempotency keys', async () => {
      const testEmail: EmailMessage = {
        to: 'idempotent@example.com',
        subject: 'Idempotent Test',
        html: '<h1>Idempotent</h1>',
        text: 'Idempotent'
      };

      const idempotencyKey = 'test-idempotency-key-123';
      const emailQueue = AsyncEmailQueue.getInstance();

      // First request succeeds
      mockPrisma.jobQueue.create.mockResolvedValueOnce({
        id: 'idempotent-job-1',
        idempotencyKey,
        jobType: 'ASYNC_EMAIL_DIGEST'
      });

      const jobId1 = await emailQueue.queueEmail(testEmail, { idempotencyKey });
      expect(jobId1).toBe('idempotent-job-1');

      // Second request with same key should be rejected
      mockPrisma.jobQueue.create.mockRejectedValueOnce(new Error('Duplicate idempotency key'));

      await expect(
        emailQueue.queueEmail(testEmail, { idempotencyKey })
      ).rejects.toThrow('Duplicate idempotency key');
    });
  });

  describe('Queue Manager Integration', () => {
    it('should integrate with queue manager for metrics collection', async () => {
      // Mock queue metrics data
      mockPrisma.jobQueue.groupBy
        .mockResolvedValueOnce([
          { status: 'PENDING', _count: { id: 10 } },
          { status: 'PROCESSING', _count: { id: 2 } },
          { status: 'COMPLETED', _count: { id: 50 } }
        ])
        .mockResolvedValueOnce([
          { priority: 9, _count: { id: 8 } },
          { priority: 5, _count: { id: 4 } }
        ])
        .mockResolvedValueOnce([
          { jobType: 'ASYNC_EMAIL_DIGEST', _count: { id: 12 } }
        ]);

      mockPrisma.jobQueue.findMany.mockResolvedValue([
        { executionTime: 30000 },
        { executionTime: 45000 }
      ]);

      mockPrisma.jobQueue.findFirst.mockResolvedValue({
        createdAt: new Date(Date.now() - 2 * 60 * 1000) // 2 minutes ago
      });

      const metrics = await QueueManagerService.getQueueMetrics();

      expect(metrics).toEqual({
        totalJobs: 62,
        pendingJobs: 10,
        processingJobs: 2,
        failedJobs: 0,
        avgProcessingTime: 37500,
        queueDepth: 12,
        oldestPendingJobAge: 2 * 60 * 1000,
        priorityDistribution: {
          'priority_9': 8,
          'priority_5': 4
        },
        jobTypeDistribution: {
          'ASYNC_EMAIL_DIGEST': 12
        }
      });
    });
  });
});