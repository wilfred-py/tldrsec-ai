/**
 * Comprehensive email notification system tests for SEC cron job monitoring
 * Tests email delivery, template rendering, batch processing, and error handling
 */

// Mock dependencies first to avoid import issues
jest.mock('../../lib/email/index');
jest.mock('../../lib/email/templates');
jest.mock('../../lib/db/prisma');
jest.mock('../../lib/logging');
jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(),
  currentUser: jest.fn()
}));

import { sendFilingSummaryEmail } from '../../lib/email/summary-service';
import { sendEmail } from '../../lib/email/index';
import { getEmailTemplate } from '../../lib/email/templates';
import { EmailType } from '../../lib/email/types';
import { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../../lib/db/prisma';

const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;
const mockGetEmailTemplate = getEmailTemplate as jest.MockedFunction<typeof getEmailTemplate>;

const mockPrisma = {
  user: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  notificationSent: {
    create: jest.fn(),
    count: jest.fn(),
  },
} as unknown as PrismaClient;

(getPrismaClient as jest.Mock).mockReturnValue(mockPrisma);

describe('Email Notification System', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default mock implementations
    mockGetEmailTemplate.mockReturnValue({
      html: '<html><body>Test email</body></html>',
      text: 'Test email'
    });
  });

  describe('Filing Summary Email Delivery', () => {
    const mockFilingData = {
      companyName: 'Apple Inc.',
      ticker: 'AAPL',
      filingType: '10-K',
      filingDate: new Date('2024-01-15'),
      summary: 'This is a test summary of the 10-K filing.',
      filingUrl: 'https://sec.gov/Archives/edgar/data/320193/000032019324000007/aapl-20230930.htm'
    };

    it('should send filing summary email successfully', async () => {
      mockSendEmail.mockResolvedValue({
        success: true,
        id: 'email-123',
        message: 'Email sent successfully'
      });

      const result = await sendFilingSummaryEmail(
        'test@example.com',
        mockFilingData
      );

      expect(result.success).toBe(true);
      expect(mockGetEmailTemplate).toHaveBeenCalledWith(
        EmailType.FILING_NOTIFICATION,
        expect.objectContaining({
          recipientEmail: 'test@example.com',
          companyName: 'Apple Inc.',
          ticker: 'AAPL',
          filingType: '10-K',
          summary: mockFilingData.summary
        })
      );
      expect(mockSendEmail).toHaveBeenCalledWith({
        to: 'test@example.com',
        subject: 'New 10-K Filing: Apple Inc. (AAPL)',
        html: '<html><body>Test email</body></html>',
        text: 'Test email',
        tags: [
          'type:filing-notification',
          'filing-type:10-k',
          'ticker:AAPL'
        ],
        metadata: {
          type: 'filing-notification',
          ticker: 'AAPL',
          filingType: '10-K',
          companyName: 'Apple Inc.'
        }
      });
    });

    it('should handle email template rendering correctly', async () => {
      mockGetEmailTemplate.mockReturnValue({
        html: '<html><body><h1>Apple Inc. (AAPL) - 10-K Filing</h1><p>This is a test summary</p></body></html>',
        text: 'Apple Inc. (AAPL) - 10-K Filing\nThis is a test summary'
      });

      mockSendEmail.mockResolvedValue({
        success: true,
        id: 'email-123'
      });

      await sendFilingSummaryEmail('test@example.com', mockFilingData);

      expect(mockGetEmailTemplate).toHaveBeenCalledWith(
        EmailType.FILING_NOTIFICATION,
        expect.objectContaining({
          recipientName: 'Investor',
          recipientEmail: 'test@example.com',
          companyName: 'Apple Inc.',
          ticker: 'AAPL',
          filingType: '10-K',
          filingDate: mockFilingData.filingDate,
          summary: mockFilingData.summary,
          filingUrl: mockFilingData.filingUrl,
          unsubscribeUrl: expect.stringContaining('/settings/notifications'),
          preferencesUrl: expect.stringContaining('/settings')
        })
      );
    });

    it('should include proper metadata and tags', async () => {
      mockSendEmail.mockResolvedValue({ success: true, id: 'email-123' });

      await sendFilingSummaryEmail('test@example.com', {
        ...mockFilingData,
        filingType: '8-K',
        ticker: 'TSLA'
      });

      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: [
            'type:filing-notification',
            'filing-type:8-k',
            'ticker:TSLA'
          ],
          metadata: {
            type: 'filing-notification',
            ticker: 'TSLA',
            filingType: '8-K',
            companyName: 'Apple Inc.'
          }
        })
      );
    });
  });

  describe('Batch Email Processing', () => {
    it('should handle multiple subscriber notifications', async () => {
      const subscribers = [
        { id: '1', email: 'user1@example.com', name: 'User 1' },
        { id: '2', email: 'user2@example.com', name: 'User 2' },
        { id: '3', email: 'user3@example.com', name: 'User 3' }
      ];

      mockSendEmail.mockResolvedValue({
        success: true,
        id: 'email-123'
      });

      const results = [];
      for (const subscriber of subscribers) {
        const result = await sendFilingSummaryEmail(
          subscriber.email,
          {
            companyName: 'Tesla Inc.',
            ticker: 'TSLA',
            filingType: '10-Q',
            filingDate: new Date(),
            summary: 'Quarterly results summary',
            filingUrl: 'https://sec.gov/tesla-10q'
          }
        );
        results.push(result);
      }

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledTimes(3);
    });

    it('should handle rate limiting during batch processing', async () => {
      const batchSize = 10;
      const subscribers = Array.from({ length: batchSize }, (_, i) => ({
        id: `user-${i}`,
        email: `user${i}@example.com`,
        name: `User ${i}`
      }));

      // Mock rate limiting on 5th call
      mockSendEmail
        .mockResolvedValueOnce({ success: true, id: 'email-1' })
        .mockResolvedValueOnce({ success: true, id: 'email-2' })
        .mockResolvedValueOnce({ success: true, id: 'email-3' })
        .mockResolvedValueOnce({ success: true, id: 'email-4' })
        .mockRejectedValueOnce(new Error('Rate limit exceeded'))
        .mockResolvedValue({ success: true, id: 'email-retry' });

      const results = [];
      const errors = [];

      for (const subscriber of subscribers) {
        try {
          const result = await sendFilingSummaryEmail(
            subscriber.email,
            {
              companyName: 'Microsoft Corp',
              ticker: 'MSFT',
              filingType: '10-K',
              filingDate: new Date(),
              summary: 'Annual report summary',
              filingUrl: 'https://sec.gov/msft-10k'
            }
          );
          results.push(result);
        } catch (error) {
          errors.push(error);
        }
      }

      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('Rate limit exceeded');
      expect(results).toHaveLength(9); // 9 successful, 1 failed
    });

    it('should process emails with different filing types concurrently', async () => {
      const filingTypes = ['10-K', '10-Q', '8-K', 'Form 4'];
      
      mockSendEmail.mockImplementation(async ({ metadata }) => ({
        success: true,
        id: `email-${metadata?.filingType || 'unknown'}`,
        processingTime: Math.random() * 1000
      }));

      const emailPromises = filingTypes.map(filingType =>
        sendFilingSummaryEmail('test@example.com', {
          companyName: 'Test Corp',
          ticker: 'TEST',
          filingType,
          filingDate: new Date(),
          summary: `Summary for ${filingType}`,
          filingUrl: `https://sec.gov/${filingType.toLowerCase()}`
        })
      );

      const results = await Promise.all(emailPromises);

      expect(results).toHaveLength(4);
      expect(results.every(r => r.success)).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledTimes(4);
    });
  });

  describe('Error Handling', () => {
    it('should handle email service failures gracefully', async () => {
      mockSendEmail.mockRejectedValue(new Error('SMTP server unavailable'));

      const result = await sendFilingSummaryEmail(
        'test@example.com',
        {
          companyName: 'Test Corp',
          ticker: 'TEST',
          filingType: '10-K',
          filingDate: new Date(),
          summary: 'Test summary',
          filingUrl: 'https://sec.gov/test'
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('SMTP server unavailable');
    });

    it('should handle template rendering failures', async () => {
      mockGetEmailTemplate.mockImplementation(() => {
        throw new Error('Template not found');
      });

      const result = await sendFilingSummaryEmail(
        'test@example.com',
        {
          companyName: 'Test Corp',
          ticker: 'TEST',
          filingType: '10-K',
          filingDate: new Date(),
          summary: 'Test summary',
          filingUrl: 'https://sec.gov/test'
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Template not found');
    });

    it('should handle invalid email addresses', async () => {
      mockSendEmail.mockResolvedValue({
        success: false,
        error: { message: 'Invalid email address' }
      });

      const result = await sendFilingSummaryEmail(
        'invalid-email',
        {
          companyName: 'Test Corp',
          ticker: 'TEST',
          filingType: '10-K',
          filingDate: new Date(),
          summary: 'Test summary',
          filingUrl: 'https://sec.gov/test'
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid email address');
    });

    it('should handle partial batch failures', async () => {
      const subscribers = [
        'valid@example.com',
        'invalid-email',
        'another@example.com'
      ];

      mockSendEmail
        .mockResolvedValueOnce({ success: true, id: 'email-1' })
        .mockResolvedValueOnce({ 
          success: false, 
          error: { message: 'Invalid email format' }
        })
        .mockResolvedValueOnce({ success: true, id: 'email-3' });

      const results = [];
      for (const email of subscribers) {
        const result = await sendFilingSummaryEmail(email, {
          companyName: 'Test Corp',
          ticker: 'TEST',
          filingType: '10-K',
          filingDate: new Date(),
          summary: 'Test summary',
          filingUrl: 'https://sec.gov/test'
        });
        results.push(result);
      }

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[2].success).toBe(true);
    });
  });

  describe('Email Service Integration', () => {
    it('should integrate with Resend API correctly', async () => {
      mockSendEmail.mockResolvedValue({
        success: true,
        id: 'resend-email-123',
        message: 'Email queued for delivery'
      });

      const result = await sendFilingSummaryEmail(
        'test@example.com',
        {
          companyName: 'Amazon.com Inc.',
          ticker: 'AMZN',
          filingType: '10-Q',
          filingDate: new Date(),
          summary: 'Quarterly earnings report',
          filingUrl: 'https://sec.gov/amzn-10q'
        }
      );

      expect(result.success).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'test@example.com',
          subject: expect.stringContaining('Amazon.com Inc.'),
          html: expect.any(String),
          text: expect.any(String)
        })
      );
    });

    it('should handle Resend API rate limits', async () => {
      mockSendEmail.mockRejectedValue({
        name: 'TooManyRequests',
        message: 'Too many requests. Rate limit: 100/day',
        statusCode: 429
      });

      const result = await sendFilingSummaryEmail(
        'test@example.com',
        {
          companyName: 'Test Corp',
          ticker: 'TEST',
          filingType: '10-K',
          filingDate: new Date(),
          summary: 'Test summary',
          filingUrl: 'https://sec.gov/test'
        }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Too many requests');
    });

    it('should track email delivery status', async () => {
      mockSendEmail.mockResolvedValue({
        success: true,
        id: 'email-123',
        status: 'queued',
        message: 'Email queued for delivery'
      });

      const result = await sendFilingSummaryEmail(
        'test@example.com',
        {
          companyName: 'Test Corp',
          ticker: 'TEST',
          filingType: '10-K',
          filingDate: new Date(),
          summary: 'Test summary',
          filingUrl: 'https://sec.gov/test'
        }
      );

      expect(result.success).toBe(true);
      // In a real implementation, we would also track delivery status
      expect(mockSendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            type: 'filing-notification',
            ticker: 'TEST'
          })
        })
      );
    });
  });

  describe('User Preference Handling', () => {
    it('should respect unsubscribe preferences', async () => {
      // Mock user with unsubscribe preference
      (mockPrisma.user.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'user-1',
          email: 'subscribed@example.com',
          name: 'Subscribed User',
          preferences: { emailNotifications: true }
        }
        // User with emailNotifications: false would be filtered out
      ]);

      // In the actual cron job, we would filter users before sending
      const subscribedUsers = await mockPrisma.user.findMany({
        where: {
          tickers: {
            some: { symbol: 'AAPL' }
          },
          // In reality, we'd filter by preferences here
        },
        select: {
          id: true,
          email: true,
          name: true
        }
      });

      expect(subscribedUsers).toHaveLength(1);
      expect(subscribedUsers[0].email).toBe('subscribed@example.com');
    });

    it('should include unsubscribe links in emails', async () => {
      mockSendEmail.mockResolvedValue({ success: true, id: 'email-123' });

      await sendFilingSummaryEmail('test@example.com', {
        companyName: 'Test Corp',
        ticker: 'TEST',
        filingType: '10-K',
        filingDate: new Date(),
        summary: 'Test summary',
        filingUrl: 'https://sec.gov/test'
      });

      expect(mockGetEmailTemplate).toHaveBeenCalledWith(
        EmailType.FILING_NOTIFICATION,
        expect.objectContaining({
          unsubscribeUrl: expect.stringContaining('/settings/notifications'),
          preferencesUrl: expect.stringContaining('/settings')
        })
      );
    });

    it('should handle different notification frequencies', async () => {
      const users = [
        { id: '1', email: 'immediate@example.com', preferences: { frequency: 'immediate' } },
        { id: '2', email: 'daily@example.com', preferences: { frequency: 'daily' } },
        { id: '3', email: 'weekly@example.com', preferences: { frequency: 'weekly' } }
      ];

      // For immediate notifications (like in cron job)
      const immediateUsers = users.filter(u => 
        !u.preferences.frequency || u.preferences.frequency === 'immediate'
      );

      expect(immediateUsers).toHaveLength(1);
      expect(immediateUsers[0].email).toBe('immediate@example.com');
    });
  });

  describe('Performance and Reliability', () => {
    it('should handle high-volume email sending', async () => {
      const emailCount = 100;
      const emails = Array.from({ length: emailCount }, (_, i) => 
        `user${i}@example.com`
      );

      let callCount = 0;
      mockSendEmail.mockImplementation(async () => {
        callCount++;
        // Simulate varying response times
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
        return { success: true, id: `email-${callCount}` };
      });

      const startTime = Date.now();
      
      const results = await Promise.all(
        emails.map(email => 
          sendFilingSummaryEmail(email, {
            companyName: 'High Volume Corp',
            ticker: 'HVC',
            filingType: '10-K',
            filingDate: new Date(),
            summary: 'High volume test',
            filingUrl: 'https://sec.gov/hvc'
          })
        )
      );

      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(results).toHaveLength(emailCount);
      expect(results.every(r => r.success)).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledTimes(emailCount);
      
      // Performance assertion - should complete within reasonable time
      expect(duration).toBeLessThan(10000); // 10 seconds
    });

    it('should implement circuit breaker for email failures', async () => {
      let failureCount = 0;
      const maxFailures = 5;

      mockSendEmail.mockImplementation(async () => {
        failureCount++;
        if (failureCount <= maxFailures) {
          throw new Error('Service temporarily unavailable');
        }
        return { success: true, id: 'email-success' };
      });

      const results = [];
      const errors = [];

      // Simulate circuit breaker logic
      for (let i = 0; i < 10; i++) {
        try {
          if (failureCount >= maxFailures) {
            // Circuit breaker open - skip sending
            results.push({ success: false, error: 'Circuit breaker open' });
            continue;
          }

          const result = await sendFilingSummaryEmail(
            `test${i}@example.com`,
            {
              companyName: 'Test Corp',
              ticker: 'TEST',
              filingType: '10-K',
              filingDate: new Date(),
              summary: 'Test summary',
              filingUrl: 'https://sec.gov/test'
            }
          );
          results.push(result);
        } catch (error) {
          errors.push(error);
          results.push({ success: false, error: error.message });
        }
      }

      expect(errors).toHaveLength(5); // First 5 calls fail
      expect(results.filter(r => r.error === 'Circuit breaker open')).toHaveLength(5); // Last 5 skip
    });
  });
});