/**
 * Tests for the Resend email client
 */
import { ResendClient } from '../resend-client';
import { EmailMessage, EmailSendSuccess, EmailSendFailure } from '../types';

// Mock Resend constructor and methods
jest.mock('resend', () => {
  return {
    Resend: jest.fn().mockImplementation(() => {
      return {
        emails: {
          send: jest.fn().mockImplementation(() => {
            return Promise.resolve({
              data: {
                id: 'test-email-id-123',
              }
            });
          })
        }
      };
    })
  };
});

// Mock error handling
jest.mock('../../error-handling', () => {
  const original = jest.requireActual('../../error-handling');
  return {
    ...original,
    createExternalApiError: jest.fn().mockImplementation((message) => new Error(message)),
    createTimeoutError: jest.fn().mockImplementation((message) => new Error(message)),
  };
});

// Mock logger
jest.mock('../../logging', () => {
  return {
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }
  };
});

// Mock monitoring
jest.mock('../../monitoring', () => {
  return {
    monitoring: {
      startTimer: jest.fn(),
      stopTimer: jest.fn(),
      recordValue: jest.fn(),
      incrementCounter: jest.fn(),
    }
  };
});

describe('ResendClient', () => {
  let client: ResendClient;
  
  beforeEach(() => {
    jest.clearAllMocks();
    client = new ResendClient('test_api_key');
  });
  
  describe('sendEmail', () => {
    it('should successfully send an email', async () => {
      const message: EmailMessage = {
        to: 'test@example.com',
        subject: 'Test Email',
        html: '<p>Test email content</p>'
      };
      
      const result = await client.sendEmail(message);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.id).toBe('test-email-id-123');
      }
    });
    
    it('should validate required fields', async () => {
      // Missing subject
      const message: Partial<EmailMessage> = {
        to: 'test@example.com',
        html: '<p>Test email content</p>'
      };
      
      await expect(client.sendEmail(message as EmailMessage)).rejects.toThrow('Missing subject');
    });
    
    it('should handle API errors', async () => {
      // Mock implementation to throw an error
      const mockSend = jest.fn().mockRejectedValue({
        name: 'ResendError',
        statusCode: 400,
        message: 'Invalid request',
        code: 'invalid_payload',
      });
      
      // Override the mock implementation for this test
      const ResendMock = require('resend').Resend;
      ResendMock.mockImplementation(() => ({
        emails: {
          send: mockSend
        }
      }));
      
      const client = new ResendClient('test_api_key');
      const message: EmailMessage = {
        to: 'test@example.com',
        subject: 'Test Email',
        html: '<p>Test email content</p>'
      };
      
      const result = await client.sendEmail(message);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });
  
  describe('getUsage', () => {
    it('should return usage statistics', async () => {
      // Send a few emails - 2 successful, 1 failed
      const mockSend = jest.fn()
        .mockResolvedValueOnce({ data: { id: 'email-1' } })
        .mockResolvedValueOnce({ data: { id: 'email-2' } })
        .mockRejectedValueOnce(new Error('Failed'));
      
      // Override the mock implementation
      const ResendMock = require('resend').Resend;
      ResendMock.mockImplementation(() => ({
        emails: {
          send: mockSend
        }
      }));
      
      const client = new ResendClient('test_api_key');
      const message: EmailMessage = {
        to: 'test@example.com',
        subject: 'Test Email',
        html: '<p>Test email content</p>'
      };
      
      // Send 3 emails (2 successful, 1 failed)
      await client.sendEmail(message);
      await client.sendEmail(message);
      try {
        await client.sendEmail(message);
      } catch (error) {
        // Ignore error
      }
      
      const usage = client.getUsage();
      
      expect(usage.totalSent).toBe(2);
      expect(usage.totalFailed).toBe(1);
      expect(usage.lastReset).toBeInstanceOf(Date);
    });
    
    it('should reset usage statistics', () => {
      // Manually set usage stats
      client['totalSent'] = 10;
      client['totalFailed'] = 5;
      
      client.resetUsage();
      
      const usage = client.getUsage();
      expect(usage.totalSent).toBe(0);
      expect(usage.totalFailed).toBe(0);
    });
  });
}); 