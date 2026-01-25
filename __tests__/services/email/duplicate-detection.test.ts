/**
 * Phase 4: Email Duplicate Detection Tests
 *
 * Tests for preventing true duplicate email delivery through:
 * 1. Same summary detection
 * 2. Concurrent delivery protection
 * 3. Delivery tracking consistency
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { sendEmailSummary } from '../../../services/filing/sendEmailSummary';
import { getPrismaClient } from '../../../lib/db/index';

// Mock email client to prevent actual emails during testing
jest.mock('../../../lib/email/resend-client', () => {
  return {
    ResendClient: jest.fn().mockImplementation(() => {
      return {
        sendEmail: jest.fn().mockImplementation(() => {
          return Promise.resolve({
            success: true,
            id: `mock-email-${Date.now()}`,
            to: 'test@example.com'
          });
        })
      };
    })
  };
});

describe('Email Duplicate Detection', () => {
  let testUser: any;
  let testCompany: any;
  let testTicker: any;

  beforeEach(async () => {
    const prisma = getPrismaClient();
    // Clean up test data
    await prisma.summaryEmailDelivery.deleteMany({
      where: { emailAddress: { contains: 'duplicate-test' } }
    });

    await prisma.summary.deleteMany({
      where: { filingUrl: { contains: 'duplicate-test' } }
    });

    // Create test user
    testUser = await prisma.user.upsert({
      where: { email: 'duplicate-test@example.com' },
      update: {},
      create: {
        id: `test-user-${Date.now()}`,
        email: 'duplicate-test@example.com',
        clerkUserId: `clerk_test_${Date.now()}`,
        onboardingCompleted: true
      }
    });

    // Create test company and ticker
    testCompany = await prisma.company.upsert({
      where: { ticker: 'DTEST' },
      update: {},
      create: {
        cik: '9999999',
        ticker: 'DTEST',
        name: 'Duplicate Test Inc.',
        sicCode: 7370,
        stateOfIncorporation: 'DE'
      }
    });

    testTicker = await prisma.ticker.upsert({
      where: {
        userId_symbol: {
          userId: testUser.id,
          symbol: 'DTEST'
        }
      },
      update: {},
      create: {
        userId: testUser.id,
        symbol: 'DTEST',
        companyId: testCompany.id
      }
    });
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.summaryEmailDelivery.deleteMany({
      where: { userId: testUser.id }
    });

    await prisma.summary.deleteMany({
      where: { tickerId: testTicker.id }
    });

    await prisma.ticker.deleteMany({
      where: { id: testTicker.id }
    });
  });

  describe('same summary detection', () => {
    it('should prevent sending same summary twice to same user', async () => {
      // Arrange - Create a test summary
      const filing = await prisma.secFiling.create({
        data: {
          formType: 'Form 4',
          filingDate: new Date(),
          tickerId: testTicker.id,
          filingUrl: `https://www.sec.gov/duplicate-test/${Date.now()}`,
          accessionNumber: `0000000000-${Date.now()}-00000`,
          processingStatus: 'COMPLETED'
        }
      });

      const summary = await prisma.summary.create({
        data: {
          filingUrl: filing.filingUrl,
          filingType: 'Form 4',
          filingDate: new Date(),
          tickerId: testTicker.id,
          summaryText: 'Test summary for duplicate detection',
          summaryJSON: {
            ticker: 'DTEST',
            companyName: 'Duplicate Test Inc.',
            filingType: 'Form 4',
            filingDate: new Date().toISOString(),
            accessionNumber: filing.accessionNumber,
            summaryText: 'Test summary',
            keyPoints: ['Test point'],
            url: filing.filingUrl,
            filingUrl: filing.filingUrl
          },
          processingStatus: 'COMPLETED',
          processingCompletedAt: new Date(),
          sentToUser: false,
          secFilingId: filing.id
        }
      });

      // Act - Send email first time
      const result1 = await sendEmailSummary(
        'duplicate-test@example.com',
        ['DTEST'],
        false,
        testUser.id
      );

      // Act - Try to send again immediately
      const result2 = await sendEmailSummary(
        'duplicate-test@example.com',
        ['DTEST'],
        false,
        testUser.id
      );

      // Assert
      expect(result1.success).toBe(true);
      expect(result1.summaryCount).toBeGreaterThan(0);

      expect(result2.success).toBe(true);
      expect(result2.summaryCount).toBe(0);
      expect(result2.duplicatesDetected).toBeGreaterThan(0);
    });

    it('should track duplicate attempts in delivery records', async () => {
      // Arrange - Create a test summary
      const filing = await prisma.secFiling.create({
        data: {
          formType: 'Form 4',
          filingDate: new Date(),
          tickerId: testTicker.id,
          filingUrl: `https://www.sec.gov/duplicate-test/${Date.now()}`,
          accessionNumber: `0000000000-${Date.now()}-00000`,
          processingStatus: 'COMPLETED'
        }
      });

      const summary = await prisma.summary.create({
        data: {
          filingUrl: filing.filingUrl,
          filingType: 'Form 4',
          filingDate: new Date(),
          tickerId: testTicker.id,
          summaryText: 'Test summary for tracking',
          summaryJSON: {
            ticker: 'DTEST',
            companyName: 'Duplicate Test Inc.',
            filingType: 'Form 4',
            filingDate: new Date().toISOString(),
            accessionNumber: filing.accessionNumber,
            summaryText: 'Test summary',
            keyPoints: ['Test point'],
            url: filing.filingUrl,
            filingUrl: filing.filingUrl
          },
          processingStatus: 'COMPLETED',
          processingCompletedAt: new Date(),
          sentToUser: false,
          secFilingId: filing.id
        }
      });

      // Act - Send first time
      await sendEmailSummary(
        'duplicate-test@example.com',
        ['DTEST'],
        false,
        testUser.id
      );

      // Verify delivery record was created
      const deliveryCount = await prisma.summaryEmailDelivery.count({
        where: {
          userId: testUser.id,
          summaryId: summary.id,
          deliveryStatus: 'sent'
        }
      });

      expect(deliveryCount).toBe(1);

      // Try duplicate - should not create another record
      await sendEmailSummary(
        'duplicate-test@example.com',
        ['DTEST'],
        false,
        testUser.id
      );

      const deliveryCountAfter = await prisma.summaryEmailDelivery.count({
        where: {
          userId: testUser.id,
          summaryId: summary.id
        }
      });

      // Should still be 1, not 2
      expect(deliveryCountAfter).toBe(1);
    });
  });

  describe('concurrent delivery protection', () => {
    it('should handle concurrent sends gracefully', async () => {
      // Arrange - Create a test summary
      const filing = await prisma.secFiling.create({
        data: {
          formType: 'Form 4',
          filingDate: new Date(),
          tickerId: testTicker.id,
          filingUrl: `https://www.sec.gov/duplicate-test/${Date.now()}`,
          accessionNumber: `0000000000-${Date.now()}-00000`,
          processingStatus: 'COMPLETED'
        }
      });

      const summary = await prisma.summary.create({
        data: {
          filingUrl: filing.filingUrl,
          filingType: 'Form 4',
          filingDate: new Date(),
          tickerId: testTicker.id,
          summaryText: 'Test summary for concurrency',
          summaryJSON: {
            ticker: 'DTEST',
            companyName: 'Duplicate Test Inc.',
            filingType: 'Form 4',
            filingDate: new Date().toISOString(),
            accessionNumber: filing.accessionNumber,
            summaryText: 'Test summary',
            keyPoints: ['Test point'],
            url: filing.filingUrl,
            filingUrl: filing.filingUrl
          },
          processingStatus: 'COMPLETED',
          processingCompletedAt: new Date(),
          sentToUser: false,
          secFilingId: filing.id
        }
      });

      // Act - Send concurrently (3 parallel requests)
      const results = await Promise.all([
        sendEmailSummary('duplicate-test@example.com', ['DTEST'], false, testUser.id),
        sendEmailSummary('duplicate-test@example.com', ['DTEST'], false, testUser.id),
        sendEmailSummary('duplicate-test@example.com', ['DTEST'], false, testUser.id)
      ]);

      // Assert - Only one should succeed with summaryCount > 0
      const successCount = results.filter(r => r.success && r.summaryCount && r.summaryCount > 0).length;
      expect(successCount).toBeLessThanOrEqual(1);

      // Verify only one delivery record exists
      const deliveryCount = await prisma.summaryEmailDelivery.count({
        where: {
          userId: testUser.id,
          summaryId: summary.id
        }
      });

      expect(deliveryCount).toBeLessThanOrEqual(1);
    });
  });

  describe('delivery tracking consistency', () => {
    it('should not create orphaned delivery records on email failure', async () => {
      // This test verifies that if email sending fails,
      // the delivery record is not left in 'pending' state

      // Mock email client to fail
      const emailClient = require('../../../lib/email/resend-client');
      const mockSendEmail = jest.fn().mockRejectedValueOnce(new Error('Email service down'));

      emailClient.ResendClient.mockImplementation(() => ({
        sendEmail: mockSendEmail
      }));

      // Arrange - Create a test summary
      const filing = await prisma.secFiling.create({
        data: {
          formType: 'Form 4',
          filingDate: new Date(),
          tickerId: testTicker.id,
          filingUrl: `https://www.sec.gov/duplicate-test/${Date.now()}`,
          accessionNumber: `0000000000-${Date.now()}-00000`,
          processingStatus: 'COMPLETED'
        }
      });

      const summary = await prisma.summary.create({
        data: {
          filingUrl: filing.filingUrl,
          filingType: 'Form 4',
          filingDate: new Date(),
          tickerId: testTicker.id,
          summaryText: 'Test summary for atomicity',
          summaryJSON: {
            ticker: 'DTEST',
            companyName: 'Duplicate Test Inc.',
            filingType: 'Form 4',
            filingDate: new Date().toISOString(),
            accessionNumber: filing.accessionNumber,
            summaryText: 'Test summary',
            keyPoints: ['Test point'],
            url: filing.filingUrl,
            filingUrl: filing.filingUrl
          },
          processingStatus: 'COMPLETED',
          processingCompletedAt: new Date(),
          sentToUser: false,
          secFilingId: filing.id
        }
      });

      // Act - Try to send (should fail)
      try {
        await sendEmailSummary(
          'duplicate-test@example.com',
          ['DTEST'],
          false,
          testUser.id
        );
      } catch (error) {
        // Expected failure
      }

      // Assert - No orphaned delivery records in 'pending' status
      const pendingDeliveries = await prisma.summaryEmailDelivery.findMany({
        where: {
          userId: testUser.id,
          summaryId: summary.id,
          deliveryStatus: 'pending'
        }
      });

      expect(pendingDeliveries).toHaveLength(0);
    });
  });
});
