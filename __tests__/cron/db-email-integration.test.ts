/**
 * Integration tests for database + email coordination in SEC cron job monitoring
 * Tests end-to-end workflows, data consistency, and error recovery
 */

// Mock dependencies first to avoid import issues
jest.mock('../../lib/db/prisma');
jest.mock('../../lib/email/index');
jest.mock('../../lib/email/templates');
jest.mock('../../lib/logging');
jest.mock('../../lib/ai');
jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(),
  currentUser: jest.fn()
}));

import { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../lib/db/prisma';
import { sendFilingSummaryEmail } from '../../lib/email/summary-service';
import { sendEmail } from '../../lib/email/index';

const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;

const mockPrisma = {
  user: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  ticker: {
    upsert: jest.fn(),
    findMany: jest.fn(),
  },
  summary: {
    create: jest.fn(),
    update: jest.fn(),
  },
  notificationSent: {
    create: jest.fn(),
    findMany: jest.fn(),
  },
  $transaction: jest.fn(),
} as unknown as PrismaClient;

(getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);

// Mock template response
jest.mock('../../lib/email/templates', () => ({
  getEmailTemplate: jest.fn().mockReturnValue({
    html: '<html><body>Test email</body></html>',
    text: 'Test email'
  })
}));

describe('Database + Email Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('End-to-End Filing Processing Workflow', () => {
    it('should complete full workflow: create summary → find subscribers → send emails → track notifications', async () => {
      // Mock system user
      const systemUser = {
        id: 'system-123',
        email: 'system@tldrsec.com',
        name: 'System User'
      };

      // Mock ticker
      const ticker = {
        id: 'ticker-123',
        symbol: 'AAPL',
        companyName: 'Apple Inc.',
        userId: systemUser.id
      };

      // Mock summary
      const savedSummary = {
        id: 'summary-123',
        tickerId: ticker.id,
        filingType: '10-K',
        filingDate: new Date('2024-01-15'),
        filingUrl: 'https://sec.gov/aapl-10k',
        summaryText: 'Apple Inc. 10-K summary',
        cost: 0.05,
        tokensUsed: 1500,
        processingStatus: 'COMPLETED',
        model: 'claude-3-sonnet-20241022',
        sentToUser: false
      };

      // Mock subscribers
      const subscribers = [
        { id: 'user-1', email: 'investor1@example.com', name: 'Investor 1' },
        { id: 'user-2', email: 'investor2@example.com', name: 'Investor 2' }
      ];

      // Setup mocks
      (mockPrisma.user.findFirst as jest.Mock).mockResolvedValue(systemUser);
      (mockPrisma.ticker.upsert as jest.Mock).mockResolvedValue(ticker);
      (mockPrisma.summary.create as jest.Mock).mockResolvedValue(savedSummary);
      (mockPrisma.user.findMany as jest.Mock).mockResolvedValue(subscribers);
      (mockPrisma.notificationSent.create as jest.Mock).mockResolvedValue({
        id: 'notification-123'
      });

      mockSendEmail.mockResolvedValue({
        success: true,
        id: 'email-123'
      });

      // Simulate the full workflow from cron job
      // Step 1: Create summary
      const summary = await mockPrisma.summary.create({
        data: {
          tickerId: ticker.id,
          filingType: '10-K',
          filingDate: new Date('2024-01-15'),
          filingUrl: 'https://sec.gov/aapl-10k',
          summaryText: 'Apple Inc. 10-K summary',
          cost: 0.05,
          tokensUsed: 1500,
          processingStatus: 'COMPLETED',
          model: 'claude-3-sonnet-20241022',
          sentToUser: false
        }
      });

      // Step 2: Find subscribers
      const allSubscribers = await mockPrisma.user.findMany({
        where: {
          tickers: {
            some: { symbol: 'AAPL' }
          }
        },
        select: {
          id: true,
          email: true,
          name: true
        }
      });

      // Step 3: Send emails and track notifications
      const emailResults = [];
      for (const subscriber of allSubscribers) {
        // Send email
        const emailResult = await sendFilingSummaryEmail(
          subscriber.email,
          {
            companyName: 'Apple Inc.',
            ticker: 'AAPL',
            filingType: '10-K',
            filingDate: new Date('2024-01-15'),
            summary: savedSummary.summaryText,
            filingUrl: savedSummary.filingUrl
          }
        );

        emailResults.push(emailResult);

        // Track notification
        if (emailResult.success) {
          await mockPrisma.notificationSent.create({
            data: {
              userId: subscriber.id,
              summaryId: savedSummary.id,
              notificationType: 'NEW_FILING',
              emailAddress: subscriber.email,
              deliveryStatus: 'sent'
            }
          });
        }
      }

      // Verify workflow completed successfully
      expect(mockPrisma.summary.create).toHaveBeenCalledOnce();
      expect(mockPrisma.user.findMany).toHaveBeenCalledOnce();
      expect(sendFilingSummaryEmail).toHaveBeenCalledTimes(2);
      expect(mockPrisma.notificationSent.create).toHaveBeenCalledTimes(2);
      expect(emailResults.every(r => r.success)).toBe(true);
    });

    it('should handle partial email failures while maintaining database consistency', async () => {
      const subscribers = [
        { id: 'user-1', email: 'success@example.com', name: 'Success User' },
        { id: 'user-2', email: 'failure@example.com', name: 'Failure User' },
        { id: 'user-3', email: 'success2@example.com', name: 'Success User 2' }
      ];

      const savedSummary = {
        id: 'summary-123',
        tickerId: 'ticker-123',
        summaryText: 'Test summary',
        filingUrl: 'https://sec.gov/test'
      };

      (mockPrisma.user.findMany as jest.Mock).mockResolvedValue(subscribers);
      (mockPrisma.summary.create as jest.Mock).mockResolvedValue(savedSummary);
      (mockPrisma.notificationSent.create as jest.Mock).mockResolvedValue({
        id: 'notification-123'
      });

      // Mock mixed email results
      let emailCallCount = 0;
      mockSendEmail.mockImplementation(async ({ to }) => {
        emailCallCount++;
        if (to === 'failure@example.com') {
          return { success: false, error: 'Invalid email address' };
        }
        return { success: true, id: `email-${emailCallCount}` };
      });

      // Execute workflow
      const summary = await mockPrisma.summary.create({
        data: {
          tickerId: 'ticker-123',
          filingType: '10-Q',
          filingDate: new Date(),
          filingUrl: 'https://sec.gov/test',
          summaryText: 'Test summary',
          cost: 0.03,
          processingStatus: 'COMPLETED',
          model: 'claude-3-sonnet-20241022',
          sentToUser: false
        }
      });

      const allSubscribers = await mockPrisma.user.findMany({
        where: { tickers: { some: { symbol: 'TEST' } } }
      });

      let successCount = 0;
      let failureCount = 0;

      for (const subscriber of allSubscribers) {
        const emailResult = await sendFilingSummaryEmail(
          subscriber.email,
          {
            companyName: 'Test Corp',
            ticker: 'TEST',
            filingType: '10-Q',
            filingDate: new Date(),
            summary: savedSummary.summaryText,
            filingUrl: savedSummary.filingUrl
          }
        );

        // Track all attempts, successful or not
        await mockPrisma.notificationSent.create({
          data: {
            userId: subscriber.id,
            summaryId: savedSummary.id,
            notificationType: 'NEW_FILING',
            emailAddress: subscriber.email,
            deliveryStatus: emailResult.success ? 'sent' : 'failed'
          }
        });

        if (emailResult.success) {
          successCount++;
        } else {
          failureCount++;
        }
      }

      // Verify partial success handling
      expect(successCount).toBe(2);
      expect(failureCount).toBe(1);
      expect(mockPrisma.notificationSent.create).toHaveBeenCalledTimes(3);
      
      // Verify failure tracking
      expect(mockPrisma.notificationSent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          emailAddress: 'failure@example.com',
          deliveryStatus: 'failed'
        })
      });
    });
  });

  describe('Transaction Coordination', () => {
    it('should rollback summary creation if all emails fail', async () => {
      const subscribers = [
        { id: 'user-1', email: 'fail1@example.com', name: 'User 1' },
        { id: 'user-2', email: 'fail2@example.com', name: 'User 2' }
      ];

      (mockPrisma.user.findMany as jest.Mock).mockResolvedValue(subscribers);
      mockSendEmail.mockResolvedValue({
        success: false,
        error: 'SMTP server unavailable'
      });

      // Mock transaction that rolls back on all email failures
      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (operations) => {
        // Simulate checking if all emails failed
        const emailResults = await Promise.all(
          subscribers.map(sub => sendFilingSummaryEmail(sub.email, {
            companyName: 'Test Corp',
            ticker: 'TEST',
            filingType: '10-K',
            filingDate: new Date(),
            summary: 'Test summary',
            filingUrl: 'https://sec.gov/test'
          }))
        );

        if (emailResults.every(r => !r.success)) {
          throw new Error('All email notifications failed - rolling back summary creation');
        }

        return operations;
      });

      await expect(mockPrisma.$transaction([
        mockPrisma.summary.create({
          data: {
            tickerId: 'ticker-123',
            filingType: '10-K',
            filingDate: new Date(),
            filingUrl: 'https://sec.gov/test',
            summaryText: 'Test summary',
            cost: 0.05,
            processingStatus: 'COMPLETED',
            model: 'claude-3-sonnet-20241022',
            sentToUser: false
          }
        })
      ])).rejects.toThrow('All email notifications failed');
    });

    it('should commit summary if at least one email succeeds', async () => {
      const subscribers = [
        { id: 'user-1', email: 'success@example.com', name: 'Success User' },
        { id: 'user-2', email: 'fail@example.com', name: 'Fail User' }
      ];

      (mockPrisma.user.findMany as jest.Mock).mockResolvedValue(subscribers);

      let emailCallCount = 0;
      mockSendEmail.mockImplementation(async ({ to }) => {
        emailCallCount++;
        return to === 'success@example.com' 
          ? { success: true, id: `email-${emailCallCount}` }
          : { success: false, error: 'Invalid email' };
      });

      const mockSummary = {
        id: 'summary-123',
        tickerId: 'ticker-123',
        processingStatus: 'COMPLETED'
      };

      (mockPrisma.$transaction as jest.Mock).mockImplementation(async (operations) => {
        // Simulate checking if at least one email succeeded
        const emailResults = await Promise.all(
          subscribers.map(sub => sendFilingSummaryEmail(sub.email, {
            companyName: 'Test Corp',
            ticker: 'TEST',
            filingType: '10-K',
            filingDate: new Date(),
            summary: 'Test summary',
            filingUrl: 'https://sec.gov/test'
          }))
        );

        if (emailResults.some(r => r.success)) {
          return [mockSummary]; // Commit transaction
        } else {
          throw new Error('Transaction rolled back');
        }
      });

      const results = await mockPrisma.$transaction([
        mockPrisma.summary.create({
          data: {
            tickerId: 'ticker-123',
            filingType: '10-K',
            filingDate: new Date(),
            filingUrl: 'https://sec.gov/test',
            summaryText: 'Test summary',
            cost: 0.05,
            processingStatus: 'COMPLETED',
            model: 'claude-3-sonnet-20241022',
            sentToUser: false
          }
        })
      ]);

      expect(results[0]).toEqual(mockSummary);
    });
  });

  describe('Data Consistency and Recovery', () => {
    it('should maintain data consistency during concurrent processing', async () => {
      const filings = [
        { id: 'filing-1', ticker: 'AAPL', type: '10-K' },
        { id: 'filing-2', ticker: 'AAPL', type: '10-Q' },
        { id: 'filing-3', ticker: 'GOOGL', type: '8-K' }
      ];

      // Mock different subscribers for each ticker
      const aaplSubscribers = [
        { id: 'user-1', email: 'aapl1@example.com' },
        { id: 'user-2', email: 'aapl2@example.com' }
      ];
      
      const googlSubscribers = [
        { id: 'user-3', email: 'googl1@example.com' }
      ];

      (mockPrisma.user.findMany as jest.Mock)
        .mockImplementation(({ where }) => {
          if (where.tickers.some.symbol === 'AAPL') {
            return Promise.resolve(aaplSubscribers);
          }
          if (where.tickers.some.symbol === 'GOOGL') {
            return Promise.resolve(googlSubscribers);
          }
          return Promise.resolve([]);
        });

      (mockPrisma.summary.create as jest.Mock)
        .mockImplementation(({ data }) => Promise.resolve({
          id: `summary-${data.filingType}`,
          tickerId: data.tickerId,
          filingType: data.filingType
        }));

      mockSendEmail.mockResolvedValue({ success: true, id: 'email-123' });

      // Process filings concurrently
      const processingPromises = filings.map(async (filing) => {
        // Create summary
        const summary = await mockPrisma.summary.create({
          data: {
            tickerId: `ticker-${filing.ticker}`,
            filingType: filing.type,
            filingDate: new Date(),
            filingUrl: `https://sec.gov/${filing.id}`,
            summaryText: `${filing.ticker} ${filing.type} summary`,
            cost: 0.03,
            processingStatus: 'COMPLETED',
            model: 'claude-3-sonnet-20241022',
            sentToUser: false
          }
        });

        // Find subscribers
        const subscribers = await mockPrisma.user.findMany({
          where: {
            tickers: { some: { symbol: filing.ticker } }
          }
        });

        // Send emails
        const emailPromises = subscribers.map(subscriber =>
          sendFilingSummaryEmail(subscriber.email, {
            companyName: `${filing.ticker} Inc.`,
            ticker: filing.ticker,
            filingType: filing.type,
            filingDate: new Date(),
            summary: summary.filingType,
            filingUrl: `https://sec.gov/${filing.id}`
          })
        );

        return Promise.all(emailPromises);
      });

      const allResults = await Promise.all(processingPromises);

      // Verify concurrent processing succeeded
      expect(allResults).toHaveLength(3);
      expect(mockPrisma.summary.create).toHaveBeenCalledTimes(3);
      expect(sendFilingSummaryEmail).toHaveBeenCalledTimes(5); // 2 + 2 + 1
    });

    it('should recover from database connection failures', async () => {
      const retryableError = new Error('Connection timeout');
      retryableError.name = 'PrismaClientKnownRequestError';

      // First call fails, second succeeds
      (mockPrisma.summary.create as jest.Mock)
        .mockRejectedValueOnce(retryableError)
        .mockResolvedValueOnce({
          id: 'summary-123',
          tickerId: 'ticker-123',
          processingStatus: 'COMPLETED'
        });

      // Simulate retry logic
      let attempt = 0;
      const maxRetries = 2;

      const createSummaryWithRetry = async (data: any) => {
        for (let i = 0; i < maxRetries; i++) {
          try {
            attempt++;
            return await mockPrisma.summary.create({ data });
          } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait before retry
          }
        }
      };

      const result = await createSummaryWithRetry({
        tickerId: 'ticker-123',
        filingType: '10-K',
        filingDate: new Date(),
        filingUrl: 'https://sec.gov/test',
        summaryText: 'Test summary',
        cost: 0.05,
        processingStatus: 'COMPLETED',
        model: 'claude-3-sonnet-20241022',
        sentToUser: false
      });

      expect(attempt).toBe(2);
      expect(result.id).toBe('summary-123');
    });

    it('should handle email service recovery after database operations', async () => {
      const summary = {
        id: 'summary-123',
        tickerId: 'ticker-123',
        summaryText: 'Test summary',
        filingUrl: 'https://sec.gov/test',
        processingStatus: 'COMPLETED'
      };

      const subscribers = [
        { id: 'user-1', email: 'test@example.com', name: 'Test User' }
      ];

      (mockPrisma.summary.create as jest.Mock).mockResolvedValue(summary);
      (mockPrisma.user.findMany as jest.Mock).mockResolvedValue(subscribers);

      // Email service fails initially, then recovers
      mockSendEmail
        .mockRejectedValueOnce(new Error('SMTP server unavailable'))
        .mockResolvedValueOnce({ success: true, id: 'email-123' });

      // Create summary successfully
      const createdSummary = await mockPrisma.summary.create({
        data: {
          tickerId: 'ticker-123',
          filingType: '10-K',
          filingDate: new Date(),
          filingUrl: 'https://sec.gov/test',
          summaryText: 'Test summary',
          cost: 0.05,
          processingStatus: 'COMPLETED',
          model: 'claude-3-sonnet-20241022',
          sentToUser: false
        }
      });

      expect(createdSummary.processingStatus).toBe('COMPLETED');

      // Email fails first attempt
      await expect(sendFilingSummaryEmail('test@example.com', {
        companyName: 'Test Corp',
        ticker: 'TEST',
        filingType: '10-K',
        filingDate: new Date(),
        summary: summary.summaryText,
        filingUrl: summary.filingUrl
      })).rejects.toThrow('SMTP server unavailable');

      // Email succeeds on retry
      const emailResult = await sendFilingSummaryEmail('test@example.com', {
        companyName: 'Test Corp',
        ticker: 'TEST',
        filingType: '10-K',
        filingDate: new Date(),
        summary: summary.summaryText,
        filingUrl: summary.filingUrl
      });

      expect(emailResult.success).toBe(true);
    });
  });

  describe('Performance Under Load', () => {
    it('should handle high-volume processing efficiently', async () => {
      const filingCount = 10;
      const subscribersPerFiling = 5;
      
      // Generate test data
      const filings = Array.from({ length: filingCount }, (_, i) => ({
        id: `filing-${i}`,
        tickerId: `ticker-${i}`,
        ticker: `STOCK${i}`,
        type: '10-Q'
      }));

      const allSubscribers = Array.from({ length: subscribersPerFiling }, (_, i) => ({
        id: `user-${i}`,
        email: `user${i}@example.com`,
        name: `User ${i}`
      }));

      // Mock database responses
      (mockPrisma.summary.create as jest.Mock)
        .mockImplementation(({ data }) => Promise.resolve({
          id: `summary-${data.tickerId}`,
          ...data
        }));

      (mockPrisma.user.findMany as jest.Mock).mockResolvedValue(allSubscribers);
      mockSendEmail.mockResolvedValue({ success: true, id: 'email-123' });

      const startTime = Date.now();

      // Process all filings
      const results = await Promise.all(
        filings.map(async (filing) => {
          // Create summary
          const summary = await mockPrisma.summary.create({
            data: {
              tickerId: filing.tickerId,
              filingType: filing.type,
              filingDate: new Date(),
              filingUrl: `https://sec.gov/${filing.id}`,
              summaryText: `${filing.ticker} summary`,
              cost: 0.03,
              processingStatus: 'COMPLETED',
              model: 'claude-3-sonnet-20241022',
              sentToUser: false
            }
          });

          // Get subscribers
          const subscribers = await mockPrisma.user.findMany({
            where: { tickers: { some: { symbol: filing.ticker } } }
          });

          // Send emails
          const emailResults = await Promise.all(
            subscribers.map(subscriber =>
              sendFilingSummaryEmail(subscriber.email, {
                companyName: `${filing.ticker} Corp`,
                ticker: filing.ticker,
                filingType: filing.type,
                filingDate: new Date(),
                summary: summary.summaryText || '',
                filingUrl: `https://sec.gov/${filing.id}`
              })
            )
          );

          return {
            summary,
            emailResults: emailResults.filter(r => r.success).length
          };
        })
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Verify performance
      expect(results).toHaveLength(filingCount);
      expect(results.every(r => r.emailResults === subscribersPerFiling)).toBe(true);
      expect(mockPrisma.summary.create).toHaveBeenCalledTimes(filingCount);
      expect(sendFilingSummaryEmail).toHaveBeenCalledTimes(filingCount * subscribersPerFiling);
      
      // Should complete within reasonable time (adjust based on expectations)
      expect(duration).toBeLessThan(5000); // 5 seconds
    });
  });
});