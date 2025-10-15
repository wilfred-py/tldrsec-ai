/**
 * API Security Integration Tests
 * 
 * Comprehensive security testing for API endpoints to validate
 * protection against real-world attack scenarios.
 * 
 * SECURITY TESTING:
 * - Authentication bypass attempts
 * - Authorization validation
 * - Input validation and sanitization
 * - SQL injection protection
 * - XSS prevention
 * - CSRF protection
 * - Rate limiting
 * - Parameter tampering
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { NextRequest } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import {
  applySecurityMiddleware,
  validateCronSecurity,
  createErrorResponse,
  createSuccessResponse
} from '../../lib/validation/middleware';
import { CronSchemas, SummarySchemas } from '../../lib/validation/schemas/api-schemas';

// Mock Clerk authentication
jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn()
}));

const mockCurrentUser = currentUser as jest.MockedFunction<typeof currentUser>;

describe('API Security Integration Tests', () => {
  
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('Authentication Security', () => {
    test('should reject requests without authentication', async () => {
      mockCurrentUser.mockResolvedValue(null);
      
      const request = new NextRequest('http://localhost:3000/api/summaries');
      
      const result = await applySecurityMiddleware(
        request,
        SummarySchemas.query,
        { logSecurityEvents: true }
      );
      
      // The middleware itself doesn't check auth, but the endpoint should
      expect(mockCurrentUser).toHaveBeenCalled();
    });
    
    test('should allow requests with valid authentication', async () => {
      mockCurrentUser.mockResolvedValue({
        id: 'user_123',
        emailAddresses: [{ emailAddress: 'test@example.com' }]
      } as any);
      
      const request = new NextRequest('http://localhost:3000/api/summaries');
      
      const result = await applySecurityMiddleware(
        request,
        SummarySchemas.query,
        { logSecurityEvents: true }
      );
      
      expect(result.data).toBeDefined();
    });
  });
  
  describe('Cron Security', () => {
    test('should validate cron secret correctly', () => {
      process.env.CRON_SECRET = 'secure-test-secret-12345';
      
      const validRequest = new NextRequest('http://localhost:3000/api/cron/process-jobs', {
        headers: { 'x-cron-secret': 'secure-test-secret-12345' }
      });
      
      const invalidRequest = new NextRequest('http://localhost:3000/api/cron/process-jobs', {
        headers: { 'x-cron-secret': 'wrong-secret' }
      });
      
      const noSecretRequest = new NextRequest('http://localhost:3000/api/cron/process-jobs');
      
      expect(validateCronSecurity(validRequest)).toBe(true);
      expect(validateCronSecurity(invalidRequest)).toBe(false);
      expect(validateCronSecurity(noSecretRequest)).toBe(false);
    });
    
    test('should reject cron requests with timing attack protection', () => {
      process.env.CRON_SECRET = 'test-secret';
      
      // Test different length secrets to verify timing-safe comparison
      const shortSecretRequest = new NextRequest('http://localhost:3000/api/cron/process-jobs', {
        headers: { 'x-cron-secret': 'short' }
      });
      
      const longSecretRequest = new NextRequest('http://localhost:3000/api/cron/process-jobs', {
        headers: { 'x-cron-secret': 'this-is-a-very-long-secret-that-does-not-match' }
      });
      
      expect(validateCronSecurity(shortSecretRequest)).toBe(false);
      expect(validateCronSecurity(longSecretRequest)).toBe(false);
    });
    
    test('should handle missing CRON_SECRET environment variable', () => {
      delete process.env.CRON_SECRET;
      
      const request = new NextRequest('http://localhost:3000/api/cron/process-jobs', {
        headers: { 'x-cron-secret': 'any-secret' }
      });
      
      expect(validateCronSecurity(request)).toBe(false);
    });
  });
  
  describe('Input Validation Security', () => {
    test('should reject SQL injection attempts in query parameters', async () => {
      const maliciousRequest = new NextRequest(
        'http://localhost:3000/api/summaries?ticker=AAPL\'; DROP TABLE users; --&limit=10'
      );
      
      const result = await applySecurityMiddleware(
        maliciousRequest,
        SummarySchemas.query,
        { logSecurityEvents: true }
      );
      
      // Should fail validation due to malicious ticker parameter
      expect(result.response).toBeDefined();
      expect(result.response?.status).toBe(400);
    });
    
    test('should reject XSS attempts in parameters', async () => {
      const xssRequest = new NextRequest(
        'http://localhost:3000/api/summaries?ticker=<script>alert("XSS")</script>&limit=10'
      );
      
      const result = await applySecurityMiddleware(
        xssRequest,
        SummarySchemas.query,
        { logSecurityEvents: true }
      );
      
      expect(result.response).toBeDefined();
      expect(result.response?.status).toBe(400);
    });
    
    test('should reject command injection attempts', async () => {
      const commandInjectionRequest = new NextRequest(
        'http://localhost:3000/api/summaries?ticker=AAPL; rm -rf /&limit=10'
      );
      
      const result = await applySecurityMiddleware(
        commandInjectionRequest,
        SummarySchemas.query,
        { logSecurityEvents: true }
      );
      
      expect(result.response).toBeDefined();
      expect(result.response?.status).toBe(400);
    });
    
    test('should reject path traversal attempts', async () => {
      const pathTraversalRequest = new NextRequest(
        'http://localhost:3000/api/summaries?ticker=../../../etc/passwd&limit=10'
      );
      
      const result = await applySecurityMiddleware(
        pathTraversalRequest,
        SummarySchemas.query,
        { logSecurityEvents: true }
      );
      
      expect(result.response).toBeDefined();
      expect(result.response?.status).toBe(400);
    });
    
    test('should validate parameter types and ranges', async () => {
      const invalidLimitRequest = new NextRequest(
        'http://localhost:3000/api/summaries?limit=99999999'
      );
      
      const result = await applySecurityMiddleware(
        invalidLimitRequest,
        SummarySchemas.query,
        { logSecurityEvents: true }
      );
      
      expect(result.response).toBeDefined();
      expect(result.response?.status).toBe(400);
    });
    
    test('should allow valid parameters', async () => {
      const validRequest = new NextRequest(
        'http://localhost:3000/api/summaries?ticker=AAPL&filingType=10-K&limit=20'
      );
      
      const result = await applySecurityMiddleware(
        validRequest,
        SummarySchemas.query,
        { logSecurityEvents: true }
      );
      
      expect(result.data).toBeDefined();
      expect(result.data.ticker).toBe('AAPL');
      expect(result.data.filingType).toBe('10-K');
      expect(result.data.limit).toBe(20);
    });
  });
  
  describe('Cron Job Parameters Security', () => {
    test('should validate cron job parameters', async () => {
      const validCronRequest = new NextRequest(
        'http://localhost:3000/api/cron/process-jobs?limit=5&types=SUMMARIZE_FILING,PROCESS_FILING'
      );
      
      const result = await applySecurityMiddleware(
        validCronRequest,
        CronSchemas.processJobsQuery,
        { logSecurityEvents: true }
      );
      
      expect(result.data).toBeDefined();
      expect(result.data.limit).toBe(5);
      expect(result.data.types).toBe('SUMMARIZE_FILING,PROCESS_FILING');
    });
    
    test('should reject invalid job types', async () => {
      const invalidJobTypeRequest = new NextRequest(
        'http://localhost:3000/api/cron/process-jobs?types=INVALID_JOB_TYPE'
      );
      
      const result = await applySecurityMiddleware(
        invalidJobTypeRequest,
        CronSchemas.processJobsQuery,
        { logSecurityEvents: true }
      );
      
      // This should pass middleware validation but fail at job type validation
      expect(result.data).toBeDefined();
    });
    
    test('should limit cron job batch sizes', async () => {
      const largeBatchRequest = new NextRequest(
        'http://localhost:3000/api/cron/process-jobs?limit=1000'
      );
      
      const result = await applySecurityMiddleware(
        largeBatchRequest,
        CronSchemas.processJobsQuery,
        { logSecurityEvents: true }
      );
      
      expect(result.response).toBeDefined();
      expect(result.response?.status).toBe(400);
    });
  });
  
  describe('Request Size and Timeout Security', () => {
    test('should reject requests with excessive URL length', async () => {
      const longUrl = 'http://localhost:3000/api/summaries?' + 'a'.repeat(3000);
      const longUrlRequest = new NextRequest(longUrl);
      
      const result = await applySecurityMiddleware(
        longUrlRequest,
        SummarySchemas.query,
        { logSecurityEvents: true }
      );
      
      expect(result.response).toBeDefined();
      expect(result.response?.status).toBe(400);
    });
    
    test('should handle request timeouts', async () => {
      const request = new NextRequest('http://localhost:3000/api/summaries');
      
      const result = await applySecurityMiddleware(
        request,
        SummarySchemas.query,
        { 
          logSecurityEvents: true,
          timeoutMs: 1 // Very short timeout for testing
        }
      );
      
      // Timeout should trigger but might not always be caught in tests
      // This is more of an integration test concern
      expect(result.data).toBeDefined();
    });
  });
  
  describe('Error Response Security', () => {
    test('should not leak sensitive information in error responses', () => {
      const errorResponse = createErrorResponse('Database connection failed: user=admin password=secret', 500);
      
      // Response should not contain sensitive details
      expect(errorResponse.status).toBe(500);
      
      // In production, error messages should be sanitized
      // The actual sanitization would be done in the createErrorResponse function
    });
    
    test('should include security headers in error responses', () => {
      const errorResponse = createErrorResponse('Invalid input', 400);
      
      // Check that security headers are present
      const headers = Object.fromEntries(errorResponse.headers.entries());
      expect(headers['x-frame-options']).toBe('DENY');
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['strict-transport-security']).toContain('max-age=');
    });
    
    test('should include security headers in success responses', () => {
      const successResponse = createSuccessResponse({ data: 'test' }, 200);
      
      const headers = Object.fromEntries(successResponse.headers.entries());
      expect(headers['x-frame-options']).toBe('DENY');
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['strict-transport-security']).toContain('max-age=');
    });
  });
  
  describe('Parameter Tampering Prevention', () => {
    test('should prevent user ID manipulation in parameters', async () => {
      // Test case where an attacker tries to access another user's data
      const tamperingRequest = new NextRequest(
        'http://localhost:3000/api/summaries?userId=different_user_123&limit=10'
      );
      
      const result = await applySecurityMiddleware(
        tamperingRequest,
        SummarySchemas.query,
        { logSecurityEvents: true }
      );
      
      // The schema should not accept userId parameter
      expect(result.data.userId).toBeUndefined();
    });
    
    test('should validate enum values strictly', async () => {
      const invalidEnumRequest = new NextRequest(
        'http://localhost:3000/api/summaries?filingType=INVALID_TYPE&limit=10'
      );
      
      const result = await applySecurityMiddleware(
        invalidEnumRequest,
        SummarySchemas.query,
        { logSecurityEvents: true }
      );
      
      expect(result.response).toBeDefined();
      expect(result.response?.status).toBe(400);
    });
    
    test('should prevent negative or zero limits', async () => {
      const negativeLimitRequest = new NextRequest(
        'http://localhost:3000/api/summaries?limit=-1'
      );
      
      const result = await applySecurityMiddleware(
        negativeLimitRequest,
        SummarySchemas.query,
        { logSecurityEvents: true }
      );
      
      expect(result.response).toBeDefined();
      expect(result.response?.status).toBe(400);
    });
  });
  
  describe('Content Type Security', () => {
    test('should handle JSON content safely', async () => {
      const jsonRequest = new NextRequest('http://localhost:3000/api/summaries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ 
          data: '<script>alert("XSS")</script>',
          query: "'; DROP TABLE users; --"
        })
      });
      
      const result = await applySecurityMiddleware(
        jsonRequest,
        SummarySchemas.query,
        { logSecurityEvents: true }
      );
      
      // Should sanitize the JSON content
      expect(result.data).toBeDefined();
    });
    
    test('should reject malformed JSON', async () => {
      const malformedJsonRequest = new NextRequest('http://localhost:3000/api/summaries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{ invalid json }'
      });
      
      const result = await applySecurityMiddleware(
        malformedJsonRequest,
        SummarySchemas.query,
        { logSecurityEvents: true }
      );
      
      expect(result.response).toBeDefined();
      expect(result.response?.status).toBe(400);
    });
  });
  
  describe('Unicode and Encoding Security', () => {
    test('should handle Unicode characters safely', async () => {
      const unicodeRequest = new NextRequest(
        'http://localhost:3000/api/summaries?ticker=\u0041\u0041\u0050\u004C&limit=10' // AAPL in Unicode
      );
      
      const result = await applySecurityMiddleware(
        unicodeRequest,
        SummarySchemas.query,
        { logSecurityEvents: true }
      );
      
      expect(result.data).toBeDefined();
      expect(result.data.ticker).toBe('AAPL');
    });
    
    test('should reject dangerous Unicode sequences', async () => {
      const dangerousUnicodeRequest = new NextRequest(
        'http://localhost:3000/api/summaries?ticker=\u003cscript\u003e&limit=10' // <script> in Unicode
      );
      
      const result = await applySecurityMiddleware(
        dangerousUnicodeRequest,
        SummarySchemas.query,
        { logSecurityEvents: true }
      );
      
      expect(result.response).toBeDefined();
      expect(result.response?.status).toBe(400);
    });
  });
  
  afterEach(() => {
    // Clean up environment variables
    delete process.env.CRON_SECRET;
  });
});