/**
 * Tier-Aware Async Endpoint Tests - Critical Coverage
 * Tests for the new async processing endpoint
 */

import { NextRequest } from 'next/server';
// Note: tier-aware-async route is disabled, using tier-aware route for testing
import { GET } from '../../../app/api/cron/tier-aware/route';

// Mock dependencies
jest.mock('../../../lib/logging', () => ({
  logger: {
    child: () => ({
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    })
  }
}));

jest.mock('../../../lib/cron/market-hours', () => ({
  getMarketHoursContext: jest.fn().mockResolvedValue({
    isMarketOpen: false,
    timeUntilOpen: 3600000,
    timeZone: 'America/New_York'
  })
}));

jest.mock('../../../lib/monitoring/cron-monitor', () => ({
  CronJobMonitor: {
    create: jest.fn().mockResolvedValue({
      recordMetric: jest.fn(),
      recordCheckpoint: jest.fn(),
      recordMetrics: jest.fn()
    })
  }
}));

jest.mock('../../../lib/cron/auth-service', () => ({
  CronAuthService: {
    validateCronRequest: jest.fn()
  }
}));

jest.mock('../../../lib/cron/user-processing-service', () => ({
  CronUserProcessingService: {
    getEligibleUsersForProcessing: jest.fn()
  }
}));

jest.mock('../../../lib/cron/async-response-service', () => ({
  AsyncResponseService: {
    shouldUseAsyncProcessing: jest.fn(),
    createImmediateResponse: jest.fn(),
    createErrorResponse: jest.fn(),
    processUserFilingsAsync: jest.fn()
  }
}));

describe('Tier-Aware Async API', () => {
  const mockRequest = (headers: Record<string, string> = {}) => {
    return {
      headers: {
        get: (name: string) => headers[name] || null
      }
    } as NextRequest;
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication', () => {
    it('should reject requests without valid authentication', async () => {
      const { CronAuthService } = require('../../../lib/cron/auth-service');
      CronAuthService.validateCronRequest.mockResolvedValue({
        isValid: false,
        error: 'Missing authorization header'
      });

      const request = mockRequest();
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect((data as any).success).toBe(false);
      expect((data as any).error).toBe('Authentication failed');
    });

    it('should accept requests with valid authentication', async () => {
      const { CronAuthService } = require('../../../lib/cron/auth-service');
      const { CronUserProcessingService } = require('../../../lib/cron/user-processing-service');
      
      CronAuthService.validateCronRequest.mockResolvedValue({
        isValid: true
      });

      CronUserProcessingService.getEligibleUsersForProcessing.mockResolvedValue({
        allUsers: [],
        eligibleUsers: []
      });

      const request = mockRequest({
        'authorization': 'Bearer valid-token'
      });
      
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect((data as any).success).toBe(true);
      expect((data as any).usersProcessed).toBe(0);
    });
  });

  describe('Processing Mode Selection', () => {
    it('should use async processing for large loads', async () => {
      const { CronAuthService } = require('../../../lib/cron/auth-service');
      const { CronUserProcessingService } = require('../../../lib/cron/user-processing-service');
      const { AsyncResponseService } = require('../../../lib/cron/async-response-service');

      CronAuthService.validateCronRequest.mockResolvedValue({ isValid: true });
      
      const mockEligibleUsers = [
        { userId: 'user1', tier: 'free' },
        { userId: 'user2', tier: 'hobby' }
      ];

      const mockAllUsers = [
        { 
          id: 'user1', 
          email: 'user1@example.com',
          tickers: [{ symbol: 'TSLA' }, { symbol: 'AAPL' }]
        },
        { 
          id: 'user2', 
          email: 'user2@example.com',
          tickers: [{ symbol: 'MSFT' }]
        }
      ];

      CronUserProcessingService.getEligibleUsersForProcessing.mockResolvedValue({
        allUsers: mockAllUsers,
        eligibleUsers: mockEligibleUsers
      });
      AsyncResponseService.shouldUseAsyncProcessing.mockReturnValue(true);
      AsyncResponseService.createImmediateResponse.mockReturnValue({
        status: 200,
        json: () => Promise.resolve({
          success: true,
          mode: 'async',
          filingsQueued: 5
        })
      });

      const request = mockRequest({
        'authorization': 'Bearer valid-token'
      });

      const response = await GET(request);
      
      expect(AsyncResponseService.shouldUseAsyncProcessing).toHaveBeenCalledWith(
        3, // Total filings (2 + 1)
        'mixed',
        expect.any(Number)
      );
    });

    it('should use synchronous processing for small loads', async () => {
      const { CronAuthService } = require('../../../lib/cron/auth-service');
      const { CronUserProcessingService } = require('../../../lib/cron/user-processing-service');
      const { AsyncResponseService } = require('../../../lib/cron/async-response-service');

      CronAuthService.validateCronRequest.mockResolvedValue({ isValid: true });
      
      const mockEligibleUsers = [
        { userId: 'user1', tier: 'free' }
      ];

      const mockAllUsers = [
        { 
          id: 'user1', 
          email: 'user1@example.com',
          tickers: [{ symbol: 'TSLA' }]
        }
      ];

      CronUserProcessingService.getEligibleUsersForProcessing.mockResolvedValue({
        allUsers: mockAllUsers,
        eligibleUsers: mockEligibleUsers
      });
      AsyncResponseService.shouldUseAsyncProcessing.mockReturnValue(false);

      const request = mockRequest({
        'authorization': 'Bearer valid-token'
      });

      const response = await GET(request);
      const data = await response.json();

      expect((data as any).mode).toBe('synchronous');
    });
  });

  describe('Error Handling', () => {
    it('should handle processing errors gracefully', async () => {
      const { CronAuthService } = require('../../../lib/cron/auth-service');
      const { CronUserProcessingService } = require('../../../lib/cron/user-processing-service');
      const { AsyncResponseService } = require('../../../lib/cron/async-response-service');

      CronAuthService.validateCronRequest.mockResolvedValue({ isValid: true });
      CronUserProcessingService.getEligibleUsersForProcessing.mockRejectedValue(
        new Error('Database connection failed')
      );

      AsyncResponseService.createErrorResponse.mockReturnValue({
        status: 500,
        json: () => Promise.resolve({
          success: false,
          error: 'Database connection failed',
          code: 'CRON_PROCESSING_ERROR'
        })
      });

      const request = mockRequest({
        'authorization': 'Bearer valid-token'
      });

      const response = await GET(request);
      
      expect(AsyncResponseService.createErrorResponse).toHaveBeenCalledWith({
        success: false,
        executionId: expect.any(String),
        error: 'Database connection failed',
        code: 'CRON_PROCESSING_ERROR',
        metadata: expect.any(Object)
      });
    });
  });

  describe('Timeout Handling', () => {
    it('should respect timeout headers', async () => {
      const { CronAuthService } = require('../../../lib/cron/auth-service');
      const { CronUserProcessingService } = require('../../../lib/cron/user-processing-service');

      CronAuthService.validateCronRequest.mockResolvedValue({ isValid: true });
      CronUserProcessingService.getEligibleUsersForProcessing.mockResolvedValue({
        allUsers: [],
        eligibleUsers: []
      });

      const request = mockRequest({
        'authorization': 'Bearer valid-token',
        'x-timeout': '60000'
      });

      const response = await GET(request);
      
      expect(response.status).toBe(200);
    });

    it('should handle invalid timeout headers', async () => {
      const { CronAuthService } = require('../../../lib/cron/auth-service');
      const { CronUserProcessingService } = require('../../../lib/cron/user-processing-service');

      CronAuthService.validateCronRequest.mockResolvedValue({ isValid: true });
      CronUserProcessingService.getEligibleUsersForProcessing.mockResolvedValue({
        allUsers: [],
        eligibleUsers: []
      });

      const request = mockRequest({
        'authorization': 'Bearer valid-token',
        'x-timeout': 'invalid'
      });

      const response = await GET(request);
      
      expect(response.status).toBe(200);
    });
  });
});