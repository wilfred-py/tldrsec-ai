/**
 * Tests for the Email Notification Processor
 */

import { notificationProcessor } from '../notification-processor';
import { notificationService } from '../notification-service';
import { JobQueueService } from '../../job-queue';

// Mock JobQueueService
jest.mock('../../job-queue', () => ({
  JobQueueService: {
    getJobs: jest.fn(),
    completeJob: jest.fn().mockResolvedValue(true),
    failJob: jest.fn().mockResolvedValue(true)
  }
}));

// Mock notification service
jest.mock('../notification-service', () => ({
  notificationService: {
    sendImmediateNotification: jest.fn().mockResolvedValue(true)
  },
  NotificationEventType: {
    NEW_FILING: 'new_filing',
    FILING_UPDATE: 'filing_update',
    SUMMARY_READY: 'summary_ready'
  }
}));

// Mock logger
jest.mock('../../logging', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

// Mock monitoring
jest.mock('../../monitoring', () => ({
  monitoring: {
    incrementCounter: jest.fn(),
    startTimer: jest.fn().mockReturnValue('mock-timer-token'),
    stopTimer: jest.fn(),
    recordValue: jest.fn()
  }
}));

describe('NotificationProcessor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    // Stop processor if it's running
    notificationProcessor.stop();
  });
  
  describe('start and stop', () => {
    it('should start and stop the processor', () => {
      // Start the processor
      notificationProcessor.start();
      expect(notificationProcessor.isRunning()).toBe(true);
      
      // Stop the processor
      notificationProcessor.stop();
      expect(notificationProcessor.isRunning()).toBe(false);
    });
    
    it('should not start the processor twice', () => {
      // Start the processor
      notificationProcessor.start();
      
      // Try to start again
      notificationProcessor.start();
      
      // The setInterval should only be called once
      expect(setInterval).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('processJobs', () => {
    beforeEach(() => {
      // Mock getJobs to return some jobs
      (JobQueueService.getJobs as jest.Mock).mockResolvedValue([
        {
          id: 'job-1',
          jobType: 'SEND_FILING_NOTIFICATION',
          payload: {
            notificationType: 'new_filing',
            filing: {
              filingId: 'filing-1',
              ticker: 'AAPL',
              formType: '8-K'
            }
          },
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          id: 'job-2',
          jobType: 'SEND_FILING_NOTIFICATION',
          payload: {
            notificationType: 'summary_ready',
            filing: {
              filingId: 'filing-2',
              ticker: 'MSFT',
              formType: '10-K',
              summaryId: 'summary-1',
              summaryText: 'Test summary text'
            }
          },
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);
    });
    
    it('should process jobs successfully', async () => {
      // Call the method directly
      await notificationProcessor.processJobs();
      
      // Should have called getJobs
      expect(JobQueueService.getJobs).toHaveBeenCalledWith(
        'SEND_FILING_NOTIFICATION',
        expect.any(Number)
      );
      
      // Should have processed both jobs
      expect(notificationService.sendImmediateNotification).toHaveBeenCalledTimes(2);
      
      // Should have marked both jobs as complete
      expect(JobQueueService.completeJob).toHaveBeenCalledTimes(2);
      expect(JobQueueService.completeJob).toHaveBeenCalledWith('job-1');
      expect(JobQueueService.completeJob).toHaveBeenCalledWith('job-2');
    });
    
    it('should handle job processing errors', async () => {
      // Make the second job fail
      (notificationService.sendImmediateNotification as jest.Mock)
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('Failed to send notification'));
      
      // Call the method directly
      await notificationProcessor.processJobs();
      
      // Should have tried to process both jobs
      expect(notificationService.sendImmediateNotification).toHaveBeenCalledTimes(2);
      
      // Should have marked first job as complete
      expect(JobQueueService.completeJob).toHaveBeenCalledTimes(1);
      expect(JobQueueService.completeJob).toHaveBeenCalledWith('job-1');
      
      // Should have marked second job as failed
      expect(JobQueueService.failJob).toHaveBeenCalledTimes(1);
      expect(JobQueueService.failJob).toHaveBeenCalledWith(
        'job-2',
        expect.stringContaining('Failed to send notification')
      );
    });
    
    it('should handle empty job queue', async () => {
      // Mock getJobs to return empty array
      (JobQueueService.getJobs as jest.Mock).mockResolvedValueOnce([]);
      
      // Call the method directly
      await notificationProcessor.processJobs();
      
      // Should not have tried to process any jobs
      expect(notificationService.sendImmediateNotification).not.toHaveBeenCalled();
      
      // Should not have marked any jobs as complete
      expect(JobQueueService.completeJob).not.toHaveBeenCalled();
      expect(JobQueueService.failJob).not.toHaveBeenCalled();
    });
  });
}); 