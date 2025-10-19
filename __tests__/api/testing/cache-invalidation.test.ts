/**
 * Cache Invalidation API Endpoint Test Suite
 * 
 * Tests for the cache invalidation REST API endpoints including
 * authentication, validation, and functionality testing.
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { NextRequest } from 'next/server';
import { POST, GET, PUT } from '../../../app/api/testing/cache-invalidation/route';

// Mock environment variables for testing
const mockEnv = {
  NODE_ENV: 'test',
  TESTING_API_KEY: 'test-api-key-123',
  DATABASE_URL: 'postgresql://test',
  OPENROUTER_API_KEY: 'test-openrouter-key',
  ANTHROPIC_API_KEY: 'test-anthropic-key'
};

// Helper function to create mock NextRequest
function createMockRequest(method: string, body?: any, headers?: Record<string, string>): NextRequest {
  const url = 'http://localhost:3000/api/testing/cache-invalidation';
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  return new NextRequest(url, options);
}

describe('Cache Invalidation API Endpoints', () => {
  let originalEnv: typeof process.env;

  beforeAll(() => {
    // Save original environment
    originalEnv = { ...process.env };
    
    // Set test environment variables
    Object.assign(process.env, mockEnv);
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('POST /api/testing/cache-invalidation - Authentication', () => {
    test('should reject requests without API key', async () => {
      const request = createMockRequest('POST', {
        tickers: ['TEST'],
        environment: 'test',
        reason: 'Testing authentication',
        requesterId: 'test-user'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    test('should reject requests with invalid API key', async () => {
      const request = createMockRequest('POST', {
        tickers: ['TEST'],
        environment: 'test',
        reason: 'Testing authentication',
        requesterId: 'test-user'
      }, {
        'Authorization': 'Bearer invalid-key'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Unauthorized');
    });

    test('should accept valid API key in Authorization header', async () => {
      const request = createMockRequest('POST', {
        tickers: ['TEST'],
        environment: 'test',
        reason: 'Testing authentication with valid key',
        requesterId: 'test-user',
        dryRun: true
      }, {
        'Authorization': 'Bearer test-api-key-123'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('should accept valid API key in X-API-Key header', async () => {
      const request = createMockRequest('POST', {
        tickers: ['TEST'],
        environment: 'test',
        reason: 'Testing authentication with X-API-Key',
        requesterId: 'test-user',
        dryRun: true
      }, {
        'X-API-Key': 'test-api-key-123'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });
  });

  describe('POST /api/testing/cache-invalidation - Environment Safety', () => {
    test('should block production environment requests', async () => {
      // Temporarily set NODE_ENV to production
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const request = createMockRequest('POST', {
          tickers: ['TEST'],
          environment: 'test',
          reason: 'Testing production block',
          requesterId: 'test-user'
        }, {
          'Authorization': 'Bearer test-api-key-123'
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(403);
        expect(data.success).toBe(false);
        expect(data.error).toContain('production environment');
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    test('should reject invalid environment values', async () => {
      const request = createMockRequest('POST', {
        tickers: ['TEST'],
        environment: 'production',
        reason: 'Testing invalid environment',
        requesterId: 'test-user'
      }, {
        'Authorization': 'Bearer test-api-key-123'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.details).toBeTruthy();
    });

    test('should accept valid test environments', async () => {
      const validEnvironments = ['test', 'dev', 'staging'];

      for (const env of validEnvironments) {
        const request = createMockRequest('POST', {
          tickers: ['TEST'],
          environment: env,
          reason: `Testing ${env} environment`,
          requesterId: 'test-user',
          dryRun: true
        }, {
          'Authorization': 'Bearer test-api-key-123'
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.environment).toBe(env);
      }
    });
  });

  describe('POST /api/testing/cache-invalidation - Request Validation', () => {
    test('should validate required fields', async () => {
      const request = createMockRequest('POST', {
        tickers: ['TEST']
        // Missing required fields
      }, {
        'Authorization': 'Bearer test-api-key-123'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid request format');
      expect(data.details).toBeTruthy();
    });

    test('should validate ticker format', async () => {
      const request = createMockRequest('POST', {
        tickers: ['', 'TOOLONGTICKERNAMETHATSHOULDNOTBEALLOWED'],
        environment: 'test',
        reason: 'Testing ticker validation',
        requesterId: 'test-user'
      }, {
        'Authorization': 'Bearer test-api-key-123'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should validate reason length', async () => {
      const request = createMockRequest('POST', {
        tickers: ['TEST'],
        environment: 'test',
        reason: 'short', // Too short
        requesterId: 'test-user'
      }, {
        'Authorization': 'Bearer test-api-key-123'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should validate date range format', async () => {
      const request = createMockRequest('POST', {
        tickers: ['TEST'],
        environment: 'test',
        reason: 'Testing date validation',
        requesterId: 'test-user',
        dateRange: {
          start: 'invalid-date',
          end: '2024-12-31'
        }
      }, {
        'Authorization': 'Bearer test-api-key-123'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    test('should accept valid date formats', async () => {
      const validDateFormats = [
        {
          start: '2024-01-01T00:00:00Z',
          end: '2024-12-31T23:59:59Z'
        },
        {
          start: '2024-01-01',
          end: '2024-12-31'
        }
      ];

      for (const dateRange of validDateFormats) {
        const request = createMockRequest('POST', {
          tickers: ['TEST'],
          environment: 'test',
          reason: 'Testing valid date formats',
          requesterId: 'test-user',
          dateRange,
          dryRun: true
        }, {
          'Authorization': 'Bearer test-api-key-123'
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
      }
    });
  });

  describe('POST /api/testing/cache-invalidation - Strategy Validation', () => {
    test('should require confirmation for hard deletion', async () => {
      const request = createMockRequest('POST', {
        tickers: ['TEST'],
        environment: 'test',
        reason: 'Testing hard deletion safety',
        requesterId: 'test-user',
        strategy: 'hard'
        // Missing confirmDestructive: true
      }, {
        'Authorization': 'Bearer test-api-key-123'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('confirmDestructive');
    });

    test('should accept hard deletion with confirmation', async () => {
      const request = createMockRequest('POST', {
        tickers: ['TEST'],
        environment: 'test',
        reason: 'Testing hard deletion with confirmation',
        requesterId: 'test-user',
        strategy: 'hard',
        confirmDestructive: true,
        dryRun: true
      }, {
        'Authorization': 'Bearer test-api-key-123'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
    });

    test('should default to soft strategy', async () => {
      const request = createMockRequest('POST', {
        tickers: ['TEST'],
        environment: 'test',
        reason: 'Testing default strategy',
        requesterId: 'test-user',
        dryRun: true
      }, {
        'Authorization': 'Bearer test-api-key-123'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.strategy).toBe('soft-dryrun');
    });
  });

  describe('GET /api/testing/cache-invalidation - Statistics', () => {
    test('should return cache statistics with authentication', async () => {
      const request = createMockRequest('GET', undefined, {
        'Authorization': 'Bearer test-api-key-123'
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.statistics).toBeTruthy();
      expect(data.statistics).toMatchObject({
        totalSummaries: expect.any(Number),
        invalidatedSummaries: expect.any(Number),
        cacheHitRate: expect.any(Number),
        totalCacheValue: expect.any(Number),
        breakdown: expect.any(Object)
      });
    });

    test('should reject unauthenticated statistics requests', async () => {
      const request = createMockRequest('GET');

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });
  });

  describe('GET /api/testing/cache-invalidation - Preview', () => {
    test('should return preview with valid parameters', async () => {
      const url = new URL('http://localhost:3000/api/testing/cache-invalidation');
      url.searchParams.set('preview', 'true');
      url.searchParams.set('tickers', 'TEST,AAPL');
      url.searchParams.set('filingTypes', '10-K,10-Q');
      url.searchParams.set('environment', 'test');

      const request = new NextRequest(url, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer test-api-key-123'
        }
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.preview).toBeTruthy();
      expect(data.preview).toMatchObject({
        estimatedCount: expect.any(Number),
        sampleSummaries: expect.any(Array),
        tickerBreakdown: expect.any(Object),
        filingTypeBreakdown: expect.any(Object),
        estimatedCostImpact: expect.any(Number)
      });
    });

    test('should validate environment for preview requests', async () => {
      const url = new URL('http://localhost:3000/api/testing/cache-invalidation');
      url.searchParams.set('preview', 'true');
      url.searchParams.set('environment', 'production');

      const request = new NextRequest(url, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer test-api-key-123'
        }
      });

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
    });
  });

  describe('PUT /api/testing/cache-invalidation/restore - Cache Restoration', () => {
    test('should restore cache entries with valid summary IDs', async () => {
      const request = createMockRequest('PUT', {
        summaryIds: ['test-summary-1', 'test-summary-2']
      }, {
        'Authorization': 'Bearer test-api-key-123'
      });

      // Note: This will fail in actual execution because the summaries don't exist
      // but it tests the API validation and authentication
      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.restoredCount).toBe(0); // No matching summaries to restore
    });

    test('should reject restoration without summary IDs', async () => {
      const request = createMockRequest('PUT', {
        summaryIds: []
      }, {
        'Authorization': 'Bearer test-api-key-123'
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('summaryIds array is required');
    });

    test('should reject unauthenticated restoration requests', async () => {
      const request = createMockRequest('PUT', {
        summaryIds: ['test-summary-1']
      });

      const response = await PUT(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
    });
  });

  describe('Response Format Validation', () => {
    test('should return consistent response format for successful operations', async () => {
      const request = createMockRequest('POST', {
        tickers: ['TEST'],
        environment: 'test',
        reason: 'Testing response format',
        requesterId: 'test-user',
        dryRun: true
      }, {
        'Authorization': 'Bearer test-api-key-123'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toMatchObject({
        success: true,
        correlationId: expect.any(String),
        invalidatedCount: expect.any(Number),
        affectedSummaries: expect.any(Array),
        environment: 'test',
        strategy: expect.any(String),
        executionTimeMs: expect.any(Number),
        message: expect.any(String),
        nextSteps: expect.any(String)
      });
    });

    test('should return consistent error format for failed operations', async () => {
      const request = createMockRequest('POST', {
        tickers: ['TEST'],
        environment: 'invalid',
        reason: 'Testing error format',
        requesterId: 'test-user'
      }, {
        'Authorization': 'Bearer test-api-key-123'
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toMatchObject({
        success: false,
        error: expect.any(String),
        correlationId: expect.any(String)
      });
    });

    test('should include correlation ID in all responses', async () => {
      const scenarios = [
        // Successful request
        {
          body: {
            tickers: ['TEST'],
            environment: 'test',
            reason: 'Testing correlation ID',
            requesterId: 'test-user',
            dryRun: true
          },
          headers: { 'Authorization': 'Bearer test-api-key-123' }
        },
        // Failed request
        {
          body: {
            tickers: ['TEST']
            // Missing required fields
          },
          headers: { 'Authorization': 'Bearer test-api-key-123' }
        },
        // Unauthorized request
        {
          body: {
            tickers: ['TEST'],
            environment: 'test',
            reason: 'Testing correlation ID',
            requesterId: 'test-user'
          },
          headers: {}
        }
      ];

      for (const scenario of scenarios) {
        const request = createMockRequest('POST', scenario.body, scenario.headers);
        const response = await POST(request);
        const data = await response.json();

        expect(data.correlationId).toBeTruthy();
        expect(typeof data.correlationId).toBe('string');
      }
    });
  });
});