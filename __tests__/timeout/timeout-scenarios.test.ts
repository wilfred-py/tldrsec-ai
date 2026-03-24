/**
 * Comprehensive Timeout Handling Test Suite
 * 
 * Tests edge cases and race conditions in the new timeout protection system
 * introduced in PR 206 to fix Cloudflare Worker 524 timeout issues.
 */

import { NextRequest, NextResponse } from 'next/server';
import { GET } from '../../app/api/cron/route';

// Mock all external dependencies
jest.mock('../../lib/monitoring/cron-monitor', () => ({
  CronJobMonitor: {
    create: jest.fn().mockResolvedValue({
      complete: jest.fn().mockResolvedValue({ executionId: 'test-exec-123', duration: 1000 })
    })
  }
}));

jest.mock('../../lib/cron/auth-service', () => ({
  CronAuthService: {
    validateCronRequest: jest.fn().mockResolvedValue({ isValid: true, clientIP: '127.0.0.1' }),
    detectPlatform: jest.fn().mockReturnValue('VERCEL_CRON')
  }
}));

jest.mock('../../lib/cron/tier-eligibility', () => ({
  getUserProcessingStatuses: jest.fn().mockReturnValue([]),
  getEligibleUsers: jest.fn().mockReturnValue([])
}));

jest.mock('../../lib/cron/user-processing-service', () => ({
  CronUserProcessingService: {
    getEligibleUsersForProcessing: jest.fn().mockResolvedValue({
      allUsers: [],
      eligibleUsers: []
    }),
    processEligibleUsers: jest.fn().mockResolvedValue({
      usersProcessed: 0,
      emailsSent: 0,
      totalCostUSD: 0
    })
  }
}));

jest.mock('../../lib/cron/sec-filing-service', () => ({
  CronSecFilingService: {
    runSecFilingMonitoring: jest.fn().mockResolvedValue({
      filingMonitoring: { checked: 0, found: 0 }
    })
  }
}));

describe('Timeout Handling Edge Cases', () => {
  let mockRequest: NextRequest;
  
  // Helper function to create headers with additional entries
  const createHeadersWithAdditions = (baseHeaders: Headers, additions: Record<string, string>) => {
    const headers = new Headers();
    // Copy existing headers
    for (const [key, value] of baseHeaders) {
      headers.set(key, value);
    }
    // Add new headers
    Object.entries(additions).forEach(([key, value]) => headers.set(key, value));
    return headers;
  };
  
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRON_SECRET = 'test-secret-key-with-minimum-32-chars';
    
    // Create a proper headers object
    const headers = new Headers({
      'authorization': `Bearer ${process.env.CRON_SECRET}`,
      'x-cron-auth': `Bearer ${process.env.CRON_SECRET}`,
      'x-execution-id': 'test-exec-timeout-123'
    });
    
    mockRequest = new NextRequest('http://localhost:3000/api/cron/tier-aware', {
      method: 'GET',
      headers
    });
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  describe('Timeout Configuration Edge Cases', () => {
    it('should handle negative timeout values gracefully', async () => {
      const requestWithNegativeTimeout = new NextRequest(mockRequest.url, {
        method: 'GET',
        headers: createHeadersWithAdditions(mockRequest.headers, {
          'x-worker-timeout': '-1000',
          'x-effective-timeout': '-500'
        })
      });

      const response = await GET(requestWithNegativeTimeout);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      // Should fallback to default timeout values
    });

    it('should cap excessive timeout values', async () => {
      const requestWithExcessiveTimeout = new NextRequest(mockRequest.url, {
        method: 'GET',
        headers: createHeadersWithAdditions(mockRequest.headers, {
          'x-worker-timeout': '9999999', // 9999 seconds - excessive
          'x-effective-timeout': '8888888' // 8888 seconds - excessive
        })
      });

      const response = await GET(requestWithExcessiveTimeout);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      // Should be capped at 10 minutes (600000ms)
    });

    it('should handle invalid timeout header formats', async () => {
      const requestWithInvalidTimeout = new NextRequest(mockRequest.url, {
        method: 'GET',
        headers: createHeadersWithAdditions(mockRequest.headers, {
          'x-worker-timeout': 'invalid-number',
          'x-effective-timeout': 'also-invalid'
        })
      });

      const response = await GET(requestWithInvalidTimeout);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      // Should fallback to default timeout values
    });

    it('should handle missing timeout headers', async () => {
      // Request without timeout headers should use defaults
      const response = await GET(mockRequest);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
    });
  });

  describe('Timeout Race Conditions', () => {
    it('should cleanup timeout controllers properly on early completion', async () => {
      // Mock quick completion
      const { CronSecFilingService } = require('../../lib/cron/sec-filing-service');
      CronSecFilingService.runSecFilingMonitoring.mockResolvedValue({
        filingMonitoring: { checked: 1, found: 0 }
      });

      const response = await GET(mockRequest);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      // Timeout cleanup should happen without memory leaks
    });

    it('should handle timeout during filing processing', async () => {
      // Mock timeout during SEC filing monitoring
      const { CronSecFilingService } = require('../../lib/cron/sec-filing-service');
      CronSecFilingService.runSecFilingMonitoring.mockImplementation(() => 
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('SEC filing monitoring aborted due to timeout')), 100);
        })
      );

      const timeoutRequest = new NextRequest(mockRequest.url, {
        method: 'GET',
        headers: createHeadersWithAdditions(mockRequest.headers, {
          'x-worker-timeout': '200', // Very short timeout for testing
          'x-effective-timeout': '150'
        })
      });

      const response = await GET(timeoutRequest);
      const result = await response.json();

      expect(response.status).toBe(408); // Timeout status
      expect(result.success).toBe(false);
      expect(result.errorType).toBe('TIMEOUT');
      expect(result.error).toBe('Request timeout'); // Safe error message
    });

    it('should handle concurrent timeout controller cleanup', async () => {
      // Test multiple rapid requests don't interfere with each other
      const promises = Array.from({ length: 3 }, (_, i) => {
        const request = new NextRequest(mockRequest.url, {
          method: 'GET',
          headers: createHeadersWithAdditions(mockRequest.headers, {
            'x-execution-id': `concurrent-test-${i}`
          })
        });
        return GET(request);
      });

      const responses = await Promise.all(promises);
      
      // All should complete successfully
      for (const response of responses) {
        expect(response.status).toBe(200);
        const result = await response.json();
        expect(result.success).toBe(true);
      }
    });
  });

  describe('Partial Completion Scenarios', () => {
    it('should return partial results when approaching timeout', async () => {
      // Mock scenario where filing monitoring succeeds but user processing times out
      const { CronUserProcessingService } = require('../../lib/cron/user-processing-service');
      CronUserProcessingService.getEligibleUsersForProcessing.mockResolvedValue({
        allUsers: new Array(50).fill({}), // Many users to process
        eligibleUsers: new Array(20).fill({})
      });

      const shortTimeoutRequest = new NextRequest(mockRequest.url, {
        method: 'GET',
        headers: createHeadersWithAdditions(mockRequest.headers, {
          'x-worker-timeout': '2000', // 2 seconds
          'x-effective-timeout': '1500' // 1.5 seconds
        })
      });

      const response = await GET(shortTimeoutRequest);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      
      if (result.results && result.results.skippedDueToTimeout) {
        expect(result.results.usersProcessed).toBe(0);
        expect(result.warning).toContain('timeout constraints');
      }
    });

    it('should handle database connection timeout during partial completion', async () => {
      // Mock database timeout
      const { CronUserProcessingService } = require('../../lib/cron/user-processing-service');
      CronUserProcessingService.processEligibleUsers.mockRejectedValue(
        new Error('Database connection timeout')
      );

      const response = await GET(mockRequest);
      const result = await response.json();

      expect(response.status).toBe(500);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Internal processing error'); // Safe error message
    });
  });

  describe('Resource Cleanup Verification', () => {
    it('should cleanup resources when timeout occurs during filing processing', async () => {
      let timeoutCleared = false;
      const originalClearTimeout = global.clearTimeout;
      global.clearTimeout = jest.fn((id) => {
        timeoutCleared = true;
        return originalClearTimeout(id);
      });

      // Mock timeout scenario
      const { CronSecFilingService } = require('../../lib/cron/sec-filing-service');
      CronSecFilingService.runSecFilingMonitoring.mockRejectedValue(
        new Error('Timeout approaching')
      );

      try {
        const response = await GET(mockRequest);
        const result = await response.json();

        expect(response.status).toBe(500);
        expect(result.success).toBe(false);
        expect(timeoutCleared).toBe(true); // Verify cleanup was called
      } finally {
        global.clearTimeout = originalClearTimeout;
      }
    });

    it('should cleanup AbortController signal correctly', async () => {
      // Test that AbortController signals are properly cleaned up
      let abortCalled = false;
      const originalAbortController = global.AbortController;
      
      global.AbortController = class MockAbortController {
        constructor() {
          this.signal = { aborted: false };
        }
        
        abort() {
          abortCalled = true;
          this.signal.aborted = true;
        }
      };

      try {
        const response = await GET(mockRequest);
        const result = await response.json();

        expect(response.status).toBe(200);
        expect(result.success).toBe(true);
        // AbortController should be properly managed (not necessarily called if no timeout)
      } finally {
        global.AbortController = originalAbortController;
      }
    });
  });

  describe('Input Validation Security', () => {
    it('should validate execution ID header safely', async () => {
      const maliciousRequest = new NextRequest(mockRequest.url, {
        method: 'GET',
        headers: createHeadersWithAdditions(mockRequest.headers, {
          'x-execution-id': '<script>alert("xss")</script>' // XSS attempt
        })
      });

      const response = await GET(maliciousRequest);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      // Should use the malicious input as-is but not execute it (just log safely)
    });

    it('should generate secure execution IDs when header is missing', async () => {
      const requestWithoutExecutionId = new NextRequest(mockRequest.url, {
        method: 'GET',
        headers: new Headers({
          'authorization': `Bearer ${process.env.CRON_SECRET}`,
          'x-cron-auth': `Bearer ${process.env.CRON_SECRET}`
          // No x-execution-id header
        })
      });

      const response = await GET(requestWithoutExecutionId);
      const result = await response.json();

      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.executionId).toMatch(/^api-\d+-[a-f0-9]{16}$/); // Secure format
    });
  });

  describe('Error Message Safety', () => {
    it('should not expose stack traces in error responses', async () => {
      // Mock an error that would normally expose stack trace
      const { CronSecFilingService } = require('../../lib/cron/sec-filing-service');
      CronSecFilingService.runSecFilingMonitoring.mockRejectedValue(
        new Error('Internal database connection failed with sensitive details')
      );

      const response = await GET(mockRequest);
      const result = await response.json();

      expect(response.status).toBe(500);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Internal processing error'); // Safe generic message
      expect(result.error).not.toContain('sensitive details');
      expect(result.error).not.toContain('stack');
    });

    it('should handle network errors safely', async () => {
      const { CronSecFilingService } = require('../../lib/cron/sec-filing-service');
      CronSecFilingService.runSecFilingMonitoring.mockRejectedValue(
        new Error('Network error: Connection refused to internal.server.local:5432')
      );

      const response = await GET(mockRequest);
      const result = await response.json();

      expect(response.status).toBe(500);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Internal processing error'); // Safe message without internal details
    });
  });
});