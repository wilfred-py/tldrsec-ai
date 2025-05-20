/**
 * Tests for the Email Notification Service
 */

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { 
  NotificationService, 
  notificationEvents, 
  NotificationEventType, 
  FilingNotificationPayload
} from '../notification-service';
import { EmailSendResult } from '../types';

// Mock ResendClient
const mockSendEmail = jest.fn().mockResolvedValue({
  success: true,
  id: 'mock-email-id'
} as EmailSendResult);

const mockResendClient = {
  sendEmail: mockSendEmail
};

// Mock PrismaClient
jest.mock('@prisma/client', () => {
  return {
    PrismaClient: jest.fn().mockImplementation(() => ({
      user: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'user-1',
            email: 'user1@example.com',
            notificationPreference: 'immediate',
            watchedTickers: ['AAPL', 'MSFT'],
            watchedFormTypes: ['10-K', '8-K']
          },
          {
            id: 'user-2',
            email: 'user2@example.com',
            notificationPreference: 'immediate',
            watchedTickers: ['AAPL'],
            watchedFormTypes: []
          }
        ])
      },
      sentNotification: {
        create: jest.fn().mockResolvedValue({
          id: 'notification-1'
        })
      }
    }))
  };
});

// Mock logger
jest.mock('../../logging', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn()
  }
}));

// Mock monitoring
jest.mock('../../monitoring', () => ({
  monitoring: {
    incrementCounter: jest.fn(),
    startTimer: jest.fn(),
    stopTimer: jest.fn(),
    recordValue: jest.fn()
  }
}));

// Mock uuidv4
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('mock-uuid')
}));

// Mock JobQueueService
jest.mock('../../job-queue', () => ({
  JobQueueService: {
    addJob: jest.fn().mockResolvedValue({ id: 'job-1' })
  }
}));

// Mock sendEmail function
jest.mock('../index', () => ({
  sendEmail: jest.fn().mockResolvedValue({
    success: true,
    id: 'mock-email-id'
  })
}));

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockFiling: FilingNotificationPayload;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create a new notification service with the mock client
    notificationService = new NotificationService(mockResendClient as any);
    
    // Create a mock filing
    mockFiling = {
      filingId: 'filing-1',
      ticker: 'AAPL',
      companyName: 'Apple Inc.',
      formType: '8-K',
      filingDate: new Date('2023-01-01'),
      description: 'Test filing description',
      url: 'https://example.com/filing'
    };
  });
  
  describe('Event handling', () => {
    it('should add new filing event to job queue', async () => {
      // Emit a new filing event
      notificationEvents.emit(NotificationEventType.NEW_FILING, mockFiling);
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check if job was added to queue
      expect(require('../../job-queue').JobQueueService.addJob).toHaveBeenCalledWith(
        expect.objectContaining({
          jobType: 'SEND_FILING_NOTIFICATION',
          payload: {
            notificationType: NotificationEventType.NEW_FILING,
            filing: mockFiling
          },
          idempotencyKey: `filing-notification-${mockFiling.filingId}`
        })
      );
    });
    
    it('should add filing update event to job queue', async () => {
      // Emit a filing update event
      notificationEvents.emit(NotificationEventType.FILING_UPDATE, mockFiling);
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check if job was added to queue
      expect(require('../../job-queue').JobQueueService.addJob).toHaveBeenCalledWith(
        expect.objectContaining({
          jobType: 'SEND_FILING_NOTIFICATION',
          payload: {
            notificationType: NotificationEventType.FILING_UPDATE,
            filing: mockFiling
          },
          idempotencyKey: `filing-update-${mockFiling.filingId}`
        })
      );
    });
    
    it('should add summary ready event to job queue', async () => {
      // Update filing with summary info
      const filingWithSummary = {
        ...mockFiling,
        summaryId: 'summary-1',
        summaryText: 'Test summary text'
      };
      
      // Emit a summary ready event
      notificationEvents.emit(NotificationEventType.SUMMARY_READY, filingWithSummary);
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check if job was added to queue
      expect(require('../../job-queue').JobQueueService.addJob).toHaveBeenCalledWith(
        expect.objectContaining({
          jobType: 'SEND_FILING_NOTIFICATION',
          payload: {
            notificationType: NotificationEventType.SUMMARY_READY,
            filing: filingWithSummary
          },
          idempotencyKey: `summary-ready-${filingWithSummary.summaryId}`
        })
      );
    });
  });
  
  describe('sendImmediateNotification', () => {
    it('should send immediate notifications to eligible users', async () => {
      // Setup mock for sendEmail
      const { sendEmail } = require('../index');
      sendEmail.mockResolvedValue({
        success: true,
        id: 'mock-email-id'
      });
      
      // Call the method
      await notificationService.sendImmediateNotification(mockFiling);
      
      // Check that we got recipients
      const prisma = new PrismaClient();
      expect(prisma.user.findMany).toHaveBeenCalled();
      
      // Should have sent 2 emails (to our 2 mock users)
      expect(sendEmail).toHaveBeenCalledTimes(2);
      
      // Check that email was sent with the right content
      expect(sendEmail.mock.calls[0][0]).toMatchObject({
        to: 'user1@example.com',
        subject: expect.stringContaining('AAPL: 8-K New Filing'),
        tags: expect.arrayContaining(['type:immediate', 'ticker:AAPL', 'form:8-K'])
      });
      
      // Check that we stored the notifications
      expect(prisma.sentNotification.create).toHaveBeenCalledTimes(2);
    });
    
    it('should handle case with no eligible recipients', async () => {
      // Override mock to return no users
      const prisma = new PrismaClient();
      (prisma.user.findMany as jest.Mock).mockResolvedValueOnce([]);
      
      // Call the method
      await notificationService.sendImmediateNotification(mockFiling);
      
      // Should not attempt to send any emails
      const { sendEmail } = require('../index');
      expect(sendEmail).not.toHaveBeenCalled();
      
      // Should log that there were no recipients
      expect(require('../../logging').logger.info).toHaveBeenCalledWith(
        expect.stringContaining('No recipients for immediate notification'),
        expect.any(Object)
      );
    });
    
    it('should handle email send failures gracefully', async () => {
      // Setup mock to fail for the second email
      const { sendEmail } = require('../index');
      sendEmail
        .mockResolvedValueOnce({
          success: true,
          id: 'mock-email-id-1'
        })
        .mockResolvedValueOnce({
          success: false,
          error: { message: 'Failed to send' }
        });
      
      // Call the method
      await notificationService.sendImmediateNotification(mockFiling);
      
      // Check that we attempted to send both emails
      expect(sendEmail).toHaveBeenCalledTimes(2);
      
      // First email should create a notification record
      const prisma = new PrismaClient();
      expect(prisma.sentNotification.create).toHaveBeenCalledTimes(1);
      
      // Should log the failure
      expect(require('../../logging').logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send notification'),
        expect.any(Object),
        expect.any(Object)
      );
    });
  });
}); 