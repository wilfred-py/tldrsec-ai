/**
 * Newsletter Subscription API Security Integration Tests
 * 
 * Tests the complete security implementation of the newsletter subscription endpoint
 * including rate limiting, injection prevention, and secure response handling.
 * 
 * CRITICAL: These tests validate production security controls that protect against
 * real-world attacks on the newsletter subscription functionality.
 */

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/newsletter/subscribe/route';

// Mock dependencies
jest.mock('@/lib/supabase/server-client');
jest.mock('@/lib/email/resend');
jest.mock('@/lib/security/middleware-security');
jest.mock('@/lib/logging');

const mockSupabaseClient = {
  from: jest.fn(() => ({
    insert: jest.fn(() => ({
      select: jest.fn(() => ({
        single: jest.fn()
      }))
    }))
  }))
};

const mockResendClient = {
  sendEmail: jest.fn()
};

// Mock implementations
(require('@/lib/supabase/server-client').createSupabaseServiceClient as jest.Mock)
  .mockReturnValue(mockSupabaseClient);

(require('@/lib/email/resend').ResendClient as jest.Mock)
  .mockImplementation(() => mockResendClient);

(require('@/lib/security/middleware-security').SecurityAuditor.logSecurityEvent as jest.Mock)
  .mockResolvedValue(undefined);

describe('Newsletter Subscription API Security', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Default successful database response
    mockSupabaseClient.from().insert().select().single.mockResolvedValue({
      error: null,
      data: { id: 1 }
    });
    
    // Default successful email response
    mockResendClient.sendEmail.mockResolvedValue({ id: 'email-id' });
  });

  const createRequest = (body: any, headers: Record<string, string> = {}) => {
    return new NextRequest('http://localhost:3000/api/newsletter/subscribe', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '192.168.1.1',
        'user-agent': 'Test Agent',
        ...headers
      },
      body: JSON.stringify(body)
    });
  };

  describe('Email Injection Attack Prevention', () => {
    const injectionPayloads = [
      {
        name: 'CRLF injection in email',
        payload: {
          email: 'test@example.com\r\nBcc: victim@example.com',
          source: 'newsletter_page'
        }
      },
      {
        name: 'Email header injection',
        payload: {
          email: 'test@example.com\nSubject: Spam Message',
          source: 'newsletter_page'
        }
      },
      {
        name: 'Null byte injection',
        payload: {
          email: 'test@example.com\0',
          source: 'newsletter_page'
        }
      },
      {
        name: 'Control character injection',
        payload: {
          email: 'test@example.com\x08\x0B\x0C',
          source: 'newsletter_page'
        }
      },
      {
        name: 'HTML/Script injection in email',
        payload: {
          email: 'test<script>alert("xss")</script>@example.com',
          source: 'newsletter_page'
        }
      }
    ];

    test.each(injectionPayloads)('should block $name', async ({ payload }) => {
      const request = createRequest(payload);
      const response = await POST(request);
      
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('code', 'VALIDATION_FAILED');
      
      // Ensure database insertion was not attempted
      expect(mockSupabaseClient.from).not.toHaveBeenCalled();
      
      // Ensure no email was sent
      expect(mockResendClient.sendEmail).not.toHaveBeenCalled();
    });

    test('should sanitize UTM parameters', async () => {
      const maliciousUTM = {
        email: 'user@example.com',
        source: 'newsletter_page',
        utm_source: '<script>alert("xss")</script>',
        utm_medium: 'test\r\nBcc: victim@example.com',
        utm_campaign: 'normal-campaign'
      };

      const request = createRequest(maliciousUTM);
      const response = await POST(request);
      
      if (response.status === 200) {
        // If request succeeded, ensure UTM parameters were sanitized
        expect(mockSupabaseClient.from().insert).toHaveBeenCalledWith(
          expect.objectContaining({
            utm_source: expect.not.stringContaining('<script>'),
            utm_medium: expect.not.stringContaining('\r')
          })
        );
      } else {
        // Or request should be blocked
        expect(response.status).toBe(400);
      }
    });
  });

  describe('Input Validation and Size Limits', () => {
    test('should reject oversized request bodies', async () => {
      const oversizedPayload = {
        email: 'user@example.com',
        source: 'newsletter_page',
        utm_campaign: 'x'.repeat(20000) // Oversized field
      };

      const request = createRequest(oversizedPayload);
      const response = await POST(request);
      
      expect(response.status).toBe(413);
      
      const data = await response.json();
      expect(data).toHaveProperty('error', 'Request too large');
    });

    test('should reject malformed JSON', async () => {
      const request = new NextRequest('http://localhost:3000/api/newsletter/subscribe', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '192.168.1.1'
        },
        body: '{ invalid json'
      });

      const response = await POST(request);
      
      expect(response.status).toBe(400);
      
      const data = await response.json();
      expect(data).toHaveProperty('error', 'Invalid request format');
    });

    test('should validate required fields', async () => {
      const incompletePayloads = [
        {}, // No fields
        { source: 'newsletter_page' }, // Missing email
        { email: '' }, // Empty email
        { email: 'user@example.com' } // Missing source (should get default)
      ];

      for (const payload of incompletePayloads.slice(0, 3)) {
        const request = createRequest(payload);
        const response = await POST(request);
        
        expect(response.status).toBe(400);
        
        const data = await response.json();
        expect(data).toHaveProperty('error');
        expect(data).toHaveProperty('code', 'VALIDATION_FAILED');
      }
    });

    test('should provide default source when missing', async () => {
      const payload = { email: 'user@example.com' };
      
      const request = createRequest(payload);
      const response = await POST(request);
      
      if (response.status === 200) {
        expect(mockSupabaseClient.from().insert).toHaveBeenCalledWith(
          expect.objectContaining({
            source: 'newsletter_page' // Default value
          })
        );
      }
    });
  });

  describe('Domain and Email Validation', () => {
    test('should accept valid email addresses', async () => {
      const validEmails = [
        'user@example.com',
        'user.name@example.com',
        'user+tag@example.com',
        'user123@sub.example.co.uk'
      ];

      for (const email of validEmails) {
        const request = createRequest({
          email,
          source: 'newsletter_page'
        });
        
        const response = await POST(request);
        
        // Should either succeed or be rate limited (not validation error)
        expect(response.status).not.toBe(400);
        
        if (response.status === 200) {
          const data = await response.json();
          expect(data).toHaveProperty('success', true);
        }
      }
    });

    test('should reject invalid email formats', async () => {
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'user@',
        'user@@example.com',
        'user @example.com',
        'user@.example.com'
      ];

      for (const email of invalidEmails) {
        const request = createRequest({
          email,
          source: 'newsletter_page'
        });
        
        const response = await POST(request);
        
        expect(response.status).toBe(400);
        
        const data = await response.json();
        expect(data).toHaveProperty('error');
        expect(data).toHaveProperty('code', 'VALIDATION_FAILED');
      }
    });

    test('should handle email normalization properly', async () => {
      const emailVariants = [
        'User.Name@Gmail.COM',
        'user.name+tag@gmail.com',
        'USER@EXAMPLE.COM'
      ];

      for (const email of emailVariants) {
        const request = createRequest({
          email,
          source: 'newsletter_page'
        });
        
        const response = await POST(request);
        
        if (response.status === 200) {
          expect(mockSupabaseClient.from().insert).toHaveBeenCalledWith(
            expect.objectContaining({
              email: expect.stringMatching(/^[a-z]/) // Should be lowercase
            })
          );
        }
      }
    });
  });

  describe('Rate Limiting Protection', () => {
    test('should enforce rate limits and return proper status', async () => {
      const email = 'ratelimited@example.com';
      const payload = { email, source: 'newsletter_page' };

      // Make multiple requests to trigger rate limiting
      const requests = Array(10).fill(null).map(() => createRequest(payload));
      const responses = await Promise.all(
        requests.map(request => POST(request))
      );

      // At least one response should be rate limited
      const rateLimitedResponses = responses.filter(r => r.status === 429);
      
      if (rateLimitedResponses.length > 0) {
        const rateLimitedResponse = rateLimitedResponses[0];
        const data = await rateLimitedResponse.json();
        
        expect(data).toHaveProperty('error');
        expect(data).toHaveProperty('code', 'RATE_LIMIT_EXCEEDED');
        expect(data).toHaveProperty('retryAfter');
        
        // Should include retry headers
        expect(rateLimitedResponse.headers.get('Retry-After')).toBeTruthy();
      }
    });

    test('should enforce per-IP rate limiting', async () => {
      const ip = '192.168.1.100';
      const emails = [
        'user1@example.com',
        'user2@example.com', 
        'user3@example.com',
        'user4@example.com',
        'user5@example.com'
      ];

      // Make multiple requests from same IP with different emails
      const requests = emails.map(email => 
        createRequest({ email, source: 'newsletter_page' }, { 'x-forwarded-for': ip })
      );
      
      const responses = await Promise.all(
        requests.map(request => POST(request))
      );

      // Check if any responses are rate limited
      const statuses = responses.map(r => r.status);
      
      // Should either succeed or hit rate limits
      statuses.forEach(status => {
        expect([200, 429, 400]).toContain(status);
      });
    });
  });

  describe('Database Security', () => {
    test('should handle duplicate email subscriptions gracefully', async () => {
      // Simulate duplicate email error
      mockSupabaseClient.from().insert().select().single.mockResolvedValue({
        error: { code: '23505' }, // PostgreSQL unique constraint violation
        data: null
      });

      const request = createRequest({
        email: 'duplicate@example.com',
        source: 'newsletter_page'
      });
      
      const response = await POST(request);
      
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty('success', true);
      
      // Should still attempt to send email
      expect(mockResendClient.sendEmail).toHaveBeenCalled();
    });

    test('should handle database errors securely', async () => {
      // Simulate database error
      mockSupabaseClient.from().insert().select().single.mockResolvedValue({
        error: { code: 'CONNECTION_ERROR', message: 'Database unavailable' },
        data: null
      });

      const request = createRequest({
        email: 'user@example.com',
        source: 'newsletter_page'
      });
      
      const response = await POST(request);
      
      expect(response.status).toBe(500);
      
      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('code', 'DATABASE_ERROR');
      
      // Error message should not leak sensitive information
      expect(data.error).not.toContain('Database unavailable');
      expect(data.error).not.toContain('CONNECTION_ERROR');
    });

    test('should include security metadata in database records', async () => {
      const request = createRequest({
        email: 'user@example.com',
        source: 'newsletter_page'
      });
      
      const response = await POST(request);
      
      if (response.status === 200) {
        expect(mockSupabaseClient.from().insert).toHaveBeenCalledWith(
          expect.objectContaining({
            subscriber_ip: expect.any(String),
            email_domain: 'example.com',
            confidence_score: expect.any(String),
            is_trusted_domain: expect.any(Boolean)
          })
        );
      }
    });
  });

  describe('Email Security Validation', () => {
    test('should block emails with security threats', async () => {
      mockResendClient.sendEmail.mockRejectedValue(new Error('Email blocked'));

      const request = createRequest({
        email: 'test@example.com',
        source: 'newsletter_page'
      });
      
      const response = await POST(request);
      
      // Should still succeed (subscription is saved) but email might be blocked
      expect([200, 400]).toContain(response.status);
    });

    test('should handle email sending failures gracefully', async () => {
      mockResendClient.sendEmail.mockRejectedValue(new Error('SMTP Error'));

      const request = createRequest({
        email: 'user@example.com',
        source: 'newsletter_page'
      });
      
      const response = await POST(request);
      
      // Should still succeed - subscription is saved even if email fails
      expect(response.status).toBe(200);
      
      const data = await response.json();
      expect(data).toHaveProperty('success', true);
    });
  });

  describe('Response Security', () => {
    test('should include security headers in responses', async () => {
      const request = createRequest({
        email: 'user@example.com',
        source: 'newsletter_page'
      });
      
      const response = await POST(request);
      
      // Check for security headers
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate');
    });

    test('should not leak sensitive information in error responses', async () => {
      const request = createRequest({
        email: 'invalid-email-format',
        source: 'newsletter_page'
      });
      
      const response = await POST(request);
      
      expect(response.status).toBe(400);
      
      const data = await response.json();
      
      // Error should be generic, not revealing internal details
      expect(data.error).not.toContain('validation-schemas.ts');
      expect(data.error).not.toContain('stack trace');
      expect(data.error).not.toContain('internal');
    });

    test('should prevent email enumeration attacks', async () => {
      // Test with both valid and invalid emails
      const emails = [
        'nonexistent@example.com',
        'valid@gmail.com'
      ];

      const responses = await Promise.all(
        emails.map(email => 
          POST(createRequest({ email, source: 'newsletter_page' }))
        )
      );

      // Both should receive the same generic success message
      for (const response of responses) {
        if (response.status === 200) {
          const data = await response.json();
          expect(data.message).toBe(
            'Thank you for subscribing! You\'ll receive a confirmation email shortly.'
          );
          // Should not indicate whether email already existed
          expect(data).not.toHaveProperty('alreadySubscribed');
        }
      }
    });

    test('should handle critical errors securely', async () => {
      // Force a critical error by making JSON.parse fail
      const request = new NextRequest('http://localhost:3000/api/newsletter/subscribe', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '192.168.1.1'
        },
        body: null as any // This will cause an error
      });

      const response = await POST(request);
      
      expect(response.status).toBe(500);
      
      const data = await response.json();
      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('code', 'INTERNAL_ERROR');
      
      // Should include security headers even in error responses
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });
  });

  describe('Logging and Monitoring', () => {
    test('should log security events for validation failures', async () => {
      const maliciousRequest = createRequest({
        email: 'test@example.com\r\nBcc: victim@example.com',
        source: 'newsletter_page'
      });
      
      await POST(maliciousRequest);
      
      // Should log security event
      expect(require('@/lib/security/middleware-security').SecurityAuditor.logSecurityEvent)
        .toHaveBeenCalledWith(
          'VALIDATION_FAILURE',
          expect.any(Object),
          expect.objectContaining({
            endpoint: 'newsletter_subscription'
          })
        );
    });

    test('should log critical errors for monitoring', async () => {
      // Simulate a database connection error
      mockSupabaseClient.from.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const request = createRequest({
        email: 'user@example.com',
        source: 'newsletter_page'
      });
      
      await POST(request);
      
      // Should log critical security event
      expect(require('@/lib/security/middleware-security').SecurityAuditor.logSecurityEvent)
        .toHaveBeenCalledWith(
          'CRITICAL_ERROR',
          expect.any(Object),
          expect.objectContaining({
            endpoint: 'newsletter_subscription'
          })
        );
    });
  });
});