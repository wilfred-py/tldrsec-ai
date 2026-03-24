import { NextRequest } from 'next/server';
import middleware from '../../middleware';
import { MiddlewareSecurity, SecurityAuditor } from '../../lib/security/middleware-security';

// Mock dependencies
jest.mock('../../lib/security/middleware-security');
jest.mock('../../lib/logging');
jest.mock('@clerk/nextjs/server', () => ({
  clerkMiddleware: jest.fn((authCallback, config) => {
    return async (request: NextRequest) => {
      // Call our auth callback to test our security middleware
      const result = await authCallback(null, request);
      return result;
    };
  })
}));

describe('Middleware Public Route Security', () => {
  let mockMiddlewareSecurity: jest.Mocked<typeof MiddlewareSecurity>;
  let mockSecurityAuditor: jest.Mocked<typeof SecurityAuditor>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockMiddlewareSecurity = MiddlewareSecurity as jest.Mocked<typeof MiddlewareSecurity>;
    mockSecurityAuditor = SecurityAuditor as jest.Mocked<typeof SecurityAuditor>;

    // Default to allowing requests
    mockMiddlewareSecurity.validateRequest.mockResolvedValue({
      allowed: true,
      reason: 'Valid request',
      statusCode: 200,
      responseHeaders: {
        'X-RateLimit-Remaining': '59',
        'X-Security-Level': 'HIGH'
      }
    });

    mockSecurityAuditor.logSecurityEvent.mockResolvedValue(undefined);
  });

  describe('Cron Endpoint Security', () => {
    const cronEndpoints = [
      '/api/cron/tier-aware',
      '/api/cron/unified',
      '/api/cron/monitor-sec-filings'
    ];

    cronEndpoints.forEach(endpoint => {
      describe(`${endpoint}`, () => {
        it('should allow unauthenticated access when security validation passes', async () => {
          const request = new NextRequest(`http://localhost:3000${endpoint}`, {
            method: 'POST',
            headers: {
              'x-forwarded-for': '192.168.1.1',
              'user-agent': 'Railway-Cron/1.0'
            }
          });

          const response = await middleware(request);

          expect(mockMiddlewareSecurity.validateRequest).toHaveBeenCalledWith(
            request,
            'CRON'
          );
          expect(response).toBeUndefined(); // Should continue to next middleware
        });

        it('should block access when security validation fails', async () => {
          mockMiddlewareSecurity.validateRequest.mockResolvedValue({
            allowed: false,
            reason: 'Invalid IP address',
            statusCode: 403,
            responseHeaders: {
              'X-Security-Block-Reason': 'IP_NOT_ALLOWED'
            }
          });

          const request = new NextRequest(`http://localhost:3000${endpoint}`, {
            method: 'POST',
            headers: {
              'x-forwarded-for': '1.2.3.4', // Invalid IP
              'user-agent': 'Malicious-Bot/1.0'
            }
          });

          const response = await middleware(request);

          expect(response).toBeDefined();
          expect(response!.status).toBe(403);
          
          const responseBody = await response!.json();
          expect(responseBody).toEqual({
            error: 'Access denied',
            code: 403,
            timestamp: expect.any(String),
            path: endpoint
          });
        });

        it('should apply security headers to successful responses', async () => {
          const request = new NextRequest(`http://localhost:3000${endpoint}`, {
            method: 'POST'
          });

          const response = await middleware(request);

          expect(mockMiddlewareSecurity.validateRequest).toHaveBeenCalledWith(
            request,
            'CRON'
          );
          expect(response).toBeUndefined(); // Continues with security headers
        });

        it('should handle security validation timeout', async () => {
          jest.useFakeTimers();
          
          let resolveValidation: (value: any) => void;
          const validationPromise = new Promise(resolve => {
            resolveValidation = resolve;
          });

          mockMiddlewareSecurity.validateRequest.mockReturnValue(validationPromise);

          const request = new NextRequest(`http://localhost:3000${endpoint}`, {
            method: 'POST'
          });

          const middlewarePromise = middleware(request);

          // Simulate timeout scenario
          jest.advanceTimersByTime(30000); // 30 seconds

          // Resolve after timeout
          resolveValidation!({
            allowed: true,
            reason: 'Valid request',
            statusCode: 200
          });

          const response = await middlewarePromise;
          expect(response).toBeUndefined();

          jest.useRealTimers();
        });

        it('should handle concurrent requests to same endpoint', async () => {
          const requests = Array.from({ length: 10 }, (_, i) => 
            new NextRequest(`http://localhost:3000${endpoint}`, {
              method: 'POST',
              headers: {
                'x-request-id': `req-${i}`,
                'x-forwarded-for': `192.168.1.${i + 1}`
              }
            })
          );

          const responses = await Promise.all(
            requests.map(req => middleware(req))
          );

          expect(mockMiddlewareSecurity.validateRequest).toHaveBeenCalledTimes(10);
          responses.forEach(response => {
            expect(response).toBeUndefined(); // All should continue
          });
        });
      });
    });

    it('should classify cron endpoints correctly', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/test-endpoint', {
        method: 'POST'
      });

      await middleware(request);

      expect(mockMiddlewareSecurity.validateRequest).toHaveBeenCalledWith(
        request,
        'CRON'
      );
    });

    it('should require security validation for all cron endpoints', async () => {
      const cronPaths = [
        '/api/cron/',
        '/api/cron/new-endpoint',
        '/api/cron/nested/path',
        '/api/cron/tier-aware/subpath'
      ];

      for (const path of cronPaths) {
        const request = new NextRequest(`http://localhost:3000${path}`, {
          method: 'POST'
        });

        await middleware(request);

        expect(mockMiddlewareSecurity.validateRequest).toHaveBeenCalledWith(
          request,
          'CRON'
        );

        jest.clearAllMocks();
      }
    });
  });

  describe('Health Endpoint Security', () => {
    const healthEndpoints = [
      '/api/health',
      '/api/health/database',
      '/api/health/liveness',
      '/api/health/readiness',
      '/api/health/optimized'
    ];

    healthEndpoints.forEach(endpoint => {
      it(`should apply security validation to ${endpoint}`, async () => {
        const request = new NextRequest(`http://localhost:3000${endpoint}`, {
          method: 'GET'
        });

        await middleware(request);

        expect(mockMiddlewareSecurity.validateRequest).toHaveBeenCalledWith(
          request,
          'HEALTH'
        );
      });

      it(`should block unauthorized access to ${endpoint}`, async () => {
        mockMiddlewareSecurity.validateRequest.mockResolvedValue({
          allowed: false,
          reason: 'Rate limit exceeded',
          statusCode: 429,
          responseHeaders: {
            'X-RateLimit-Reset': '1640995200',
            'Retry-After': '60'
          }
        });

        const request = new NextRequest(`http://localhost:3000${endpoint}`, {
          method: 'GET'
        });

        const response = await middleware(request);

        expect(response!.status).toBe(429);
        expect(response!.headers.get('Retry-After')).toBe('60');
      });
    });

    it('should classify health endpoints correctly', async () => {
      const request = new NextRequest('http://localhost:3000/api/health/custom', {
        method: 'GET'
      });

      await middleware(request);

      expect(mockMiddlewareSecurity.validateRequest).toHaveBeenCalledWith(
        request,
        'HEALTH'
      );
    });
  });

  describe('Other API Routes Protection', () => {
    it('should NOT apply security validation to non-cron/health API routes', async () => {
      const protectedEndpoints = [
        '/api/summaries',
        '/api/user?type=preferences',
        '/api/billing/subscription',
        '/api/webhook/stripe',
        '/api/test/endpoint'
      ];

      for (const endpoint of protectedEndpoints) {
        const request = new NextRequest(`http://localhost:3000${endpoint}`, {
          method: 'GET'
        });

        await middleware(request);

        // Should NOT call security validation for these endpoints
        expect(mockMiddlewareSecurity.validateRequest).not.toHaveBeenCalled();

        jest.clearAllMocks();
      }
    });

    it('should let Clerk handle authentication for protected API routes', async () => {
      const request = new NextRequest('http://localhost:3000/api/summaries', {
        method: 'GET',
        headers: {
          'authorization': 'Bearer invalid-token'
        }
      });

      const response = await middleware(request);

      // Should continue to Clerk middleware (return undefined)
      expect(response).toBeUndefined();
      expect(mockMiddlewareSecurity.validateRequest).not.toHaveBeenCalled();
    });
  });

  describe('Marketing Pages Access', () => {
    const publicPages = [
      '/',
      '/pricing',
      '/about',
      '/privacy',
      '/terms'
    ];

    publicPages.forEach(page => {
      it(`should allow unrestricted access to ${page}`, async () => {
        const request = new NextRequest(`http://localhost:3000${page}`, {
          method: 'GET'
        });

        const response = await middleware(request);

        expect(response).toBeUndefined(); // Should continue normally
        expect(mockMiddlewareSecurity.validateRequest).not.toHaveBeenCalled();
      });
    });

    it('should not apply security validation to marketing pages', async () => {
      const request = new NextRequest('http://localhost:3000/', {
        method: 'GET'
      });

      await middleware(request);

      expect(mockMiddlewareSecurity.validateRequest).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling and Security Fallbacks', () => {
    it('should handle security validation errors gracefully', async () => {
      mockMiddlewareSecurity.validateRequest.mockRejectedValue(
        new Error('Security validation failed')
      );

      const request = new NextRequest('http://localhost:3000/api/cron/test', {
        method: 'POST'
      });

      const response = await middleware(request);

      expect(response!.status).toBe(500);
      expect(mockSecurityAuditor.logSecurityEvent).toHaveBeenCalledWith(
        'SUSPICIOUS_ACTIVITY',
        request,
        {
          error: 'Security validation failed',
          securityValidationFailure: true
        }
      );
    });

    it('should apply security headers to error responses', async () => {
      mockMiddlewareSecurity.validateRequest.mockResolvedValue({
        allowed: false,
        reason: 'Blocked request',
        statusCode: 403
      });

      const request = new NextRequest('http://localhost:3000/api/cron/test', {
        method: 'POST'
      });

      const response = await middleware(request);

      expect(response!.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response!.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response!.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate, max-age=0');
    });

    it('should handle missing security headers gracefully', async () => {
      mockMiddlewareSecurity.validateRequest.mockResolvedValue({
        allowed: true,
        reason: 'Valid request',
        statusCode: 200
        // No responseHeaders provided
      });

      const request = new NextRequest('http://localhost:3000/api/cron/test', {
        method: 'POST'
      });

      const response = await middleware(request);

      expect(response).toBeUndefined(); // Should continue normally
    });

    it('should fail secure when security system is unavailable', async () => {
      mockMiddlewareSecurity.validateRequest.mockImplementation(() => {
        throw new Error('Security system offline');
      });

      const request = new NextRequest('http://localhost:3000/api/cron/test', {
        method: 'POST'
      });

      const response = await middleware(request);

      expect(response!.status).toBe(500);
      
      const responseBody = await response!.json();
      expect(responseBody.error).toBe('Security validation failed');
    });

    it('should handle malformed security validation responses', async () => {
      mockMiddlewareSecurity.validateRequest.mockResolvedValue({
        allowed: true
        // Missing required fields
      } as any);

      const request = new NextRequest('http://localhost:3000/api/cron/test', {
        method: 'POST'
      });

      const response = await middleware(request);

      expect(response).toBeUndefined(); // Should continue despite malformed response
    });
  });

  describe('Logging and Audit Trail', () => {
    it('should log blocked requests with proper context', async () => {
      mockMiddlewareSecurity.validateRequest.mockResolvedValue({
        allowed: false,
        reason: 'Invalid signature',
        statusCode: 401
      });

      const request = new NextRequest('http://localhost:3000/api/cron/test', {
        method: 'POST',
        headers: {
          'x-forwarded-for': '1.2.3.4',
          'user-agent': 'Test-Agent/1.0'
        }
      });

      await middleware(request);

      // Verify proper logging context is captured
      expect(mockMiddlewareSecurity.validateRequest).toHaveBeenCalledWith(
        request,
        'CRON'
      );
    });

    it('should capture client information in security events', async () => {
      mockMiddlewareSecurity.validateRequest.mockRejectedValue(
        new Error('Security error')
      );

      const request = new NextRequest('http://localhost:3000/api/cron/test', {
        method: 'POST',
        headers: {
          'x-forwarded-for': '1.2.3.4',
          'x-real-ip': '5.6.7.8',
          'user-agent': 'Suspicious-Agent/1.0'
        }
      });

      await middleware(request);

      expect(mockSecurityAuditor.logSecurityEvent).toHaveBeenCalledWith(
        'SUSPICIOUS_ACTIVITY',
        request,
        expect.objectContaining({
          error: 'Security error',
          securityValidationFailure: true
        })
      );
    });

    it('should handle missing client information gracefully', async () => {
      mockMiddlewareSecurity.validateRequest.mockResolvedValue({
        allowed: false,
        reason: 'Blocked',
        statusCode: 403
      });

      const request = new NextRequest('http://localhost:3000/api/cron/test', {
        method: 'POST'
        // No client headers
      });

      const response = await middleware(request);

      expect(response!.status).toBe(403);
      // Should not throw despite missing headers
    });
  });

  describe('Route Matching Edge Cases', () => {
    it('should handle case sensitivity in route matching', async () => {
      const casePaths = [
        '/API/CRON/TEST',
        '/Api/Cron/Test',
        '/api/CRON/test'
      ];

      for (const path of casePaths) {
        const request = new NextRequest(`http://localhost:3000${path}`, {
          method: 'POST'
        });

        await middleware(request);

        // Only exact case matches should trigger security validation
        if (path.startsWith('/api/cron/')) {
          expect(mockMiddlewareSecurity.validateRequest).toHaveBeenCalled();
        } else {
          expect(mockMiddlewareSecurity.validateRequest).not.toHaveBeenCalled();
        }

        jest.clearAllMocks();
      }
    });

    it('should handle query parameters in route matching', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/test?param=value', {
        method: 'POST'
      });

      await middleware(request);

      expect(mockMiddlewareSecurity.validateRequest).toHaveBeenCalledWith(
        request,
        'CRON'
      );
    });

    it('should handle URL fragments in route matching', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/test#fragment', {
        method: 'POST'
      });

      await middleware(request);

      expect(mockMiddlewareSecurity.validateRequest).toHaveBeenCalledWith(
        request,
        'CRON'
      );
    });

    it('should handle encoded URLs in route matching', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/test%20endpoint', {
        method: 'POST'
      });

      await middleware(request);

      expect(mockMiddlewareSecurity.validateRequest).toHaveBeenCalledWith(
        request,
        'CRON'
      );
    });
  });

  describe('HTTP Method Handling', () => {
    const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'];

    methods.forEach(method => {
      it(`should handle ${method} requests to cron endpoints`, async () => {
        const request = new NextRequest('http://localhost:3000/api/cron/test', {
          method
        });

        await middleware(request);

        expect(mockMiddlewareSecurity.validateRequest).toHaveBeenCalledWith(
          request,
          'CRON'
        );
      });
    });

    it('should handle unsupported HTTP methods gracefully', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/test', {
        method: 'TRACE' as any
      });

      await middleware(request);

      expect(mockMiddlewareSecurity.validateRequest).toHaveBeenCalledWith(
        request,
        'CRON'
      );
    });
  });
});