/**
 * Tests for notification service
 */

import { NotificationService, NotificationEventType, FilingNotificationPayload, NotificationPreference } from '../notification-service';
import { JobQueueService } from '../../job-queue';

// Mock ResendClient
jest.mock('../resend-client');

// Mock dependencies
jest.mock('../../job-queue');
jest.mock('../../logging', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }
}));
jest.mock('../../monitoring', () => ({
  monitoring: {
    incrementCounter: jest.fn(),
  }
}));

// Mock the NotificationProcessor class
jest.mock('../notification-processor', () => {
  const mockProcessorInstance = {
    processNotificationJob: jest.fn().mockResolvedValue(undefined),
    start: jest.fn(),
    stop: jest.fn(),
  };
  
  return {
    NotificationProcessor: jest.fn().mockImplementation(() => mockProcessorInstance),
  };
});

// Mock Resend client
jest.mock('../index', () => {
  return {
    sendEmail: jest.fn().mockResolvedValue({ id: 'mock-email-id', success: true }),
  };
});

// Mock Prisma client
jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    sentNotification: {
      create: jest.fn().mockResolvedValue({}),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  
  return {
    PrismaClient: jest.fn(() => mockPrismaClient),
  };
});

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockJobQueueService: any;
  let mockFiling: FilingNotificationPayload;
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockJobQueueService = JobQueueService;
    notificationService = NotificationService.getInstance(); // Use singleton
    
    // Create a mock filing
    mockFiling = {
      filingId: 'filing-123',
      ticker: 'AAPL',
      companyName: 'Apple Inc.',
      formType: '10-K',
      filingDate: new Date(),
      description: 'Annual report',
      url: 'https://example.com/filing.pdf',
      summaryData: {
        period: 'FY 2023'
      }
    };
  });
  
  describe('event handlers', () => {
    it('should add job to queue for new filing events', async () => {
      // Act
      await (notificationService as any).handleNewFilingEvent(mockFiling);
      
      // Assert
      expect(mockJobQueueService.addJob).toHaveBeenCalledWith(
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
    
    it('should add job to queue for filing update events', async () => {
      // Act
      await (notificationService as any).handleFilingUpdateEvent(mockFiling);
      
      // Assert
      expect(mockJobQueueService.addJob).toHaveBeenCalledWith(
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
    
    it('should add job to queue for summary ready events', async () => {
      // Arrange
      const filingWithSummary = {
        ...mockFiling,
        summaryId: 'summary-123',
      };
      
      // Act
      await (notificationService as any).handleSummaryReadyEvent(filingWithSummary);
      
      // Assert
      expect(mockJobQueueService.addJob).toHaveBeenCalledWith(
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
  
  describe('getNotificationSubject', () => {
    it('should generate a clear subject line', () => {
      // Act
      const subject = (notificationService as any).getNotificationSubject(mockFiling);
      
      // Assert
      expect(subject).toContain('New 10-K for AAPL');
      expect(subject).toContain('Apple Inc');
    });
  });
}); 