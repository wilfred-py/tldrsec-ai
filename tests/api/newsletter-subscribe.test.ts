/**
 * Newsletter Subscribe API Route Tests
 * Tests email validation, personalization, and security features
 */

import { POST } from '../../app/api/newsletter/subscribe/route';
import { NextRequest } from 'next/server';
import { supabaseServerClient } from '../../lib/supabase/server-client';
import { EmailValidator } from '../../lib/security/email-validation';
import { resend } from '../../lib/email/resend';

// Mock dependencies
jest.mock('../../lib/supabase/server-client');
jest.mock('../../lib/security/email-validation');
jest.mock('../../lib/email/resend');
jest.mock('../../lib/logging');

describe('/api/newsletter/subscribe', () => {
  let mockRequest: Partial<NextRequest>;
  const mockSupabaseClient = {
    from: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn()
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Setup default mocks
    (supabaseServerClient as jest.Mock).mockResolvedValue(mockSupabaseClient);
    (EmailValidator.validate as jest.Mock).mockResolvedValue({ isValid: true });
    (resend.emails.send as jest.Mock).mockResolvedValue({ id: 'email-id' });
    
    // Mock request
    mockRequest = {
      json: jest.fn(),
      headers: new Headers(),
      url: 'http://localhost:3000/api/newsletter/subscribe'
    };
  });

  describe('POST /api/newsletter/subscribe', () => {
    test('should successfully subscribe valid email', async () => {
      const validEmail = 'investor@example.com';
      
      (mockRequest.json as jest.Mock).mockResolvedValue({
        email: validEmail,
        interests: ['earnings-reports', 'market-analysis']
      });
      
      mockSupabaseClient.single.mockResolvedValue({
        data: { id: 1, email: validEmail },
        error: null
      });
      
      const response = await POST(mockRequest as NextRequest);
      const result = await response.json();
      
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.message).toContain('subscribed');
      expect(EmailValidator.validate).toHaveBeenCalledWith(validEmail);
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        email: validEmail,
        interests: ['earnings-reports', 'market-analysis'],
        subscribed_at: expect.any(String)
      });
    });

    test('should reject invalid email addresses', async () => {
      const invalidEmail = 'not-an-email';
      
      (mockRequest.json as jest.Mock).mockResolvedValue({
        email: invalidEmail
      });
      
      (EmailValidator.validate as jest.Mock).mockResolvedValue({
        isValid: false,
        reason: 'Invalid email format'
      });
      
      const response = await POST(mockRequest as NextRequest);
      const result = await response.json();
      
      expect(response.status).toBe(400);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid email');
      expect(mockSupabaseClient.insert).not.toHaveBeenCalled();
    });

    test('should handle duplicate email subscriptions', async () => {
      const duplicateEmail = 'existing@example.com';
      
      (mockRequest.json as jest.Mock).mockResolvedValue({
        email: duplicateEmail
      });
      
      mockSupabaseClient.single.mockResolvedValue({
        data: null,
        error: { code: '23505', message: 'Email already exists' }
      });
      
      const response = await POST(mockRequest as NextRequest);
      const result = await response.json();
      
      expect(response.status).toBe(409);
      expect(result.success).toBe(false);
      expect(result.error).toContain('already subscribed');
    });

    test('should sanitize email input', async () => {
      const emailWithSpaces = '  INVESTOR@EXAMPLE.COM  ';
      const sanitizedEmail = 'investor@example.com';
      
      (mockRequest.json as jest.Mock).mockResolvedValue({
        email: emailWithSpaces
      });
      
      mockSupabaseClient.single.mockResolvedValue({
        data: { id: 1, email: sanitizedEmail },
        error: null
      });
      
      await POST(mockRequest as NextRequest);
      
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        email: sanitizedEmail,
        interests: [],
        subscribed_at: expect.any(String)
      });
    });

    test('should handle malformed JSON requests', async () => {
      (mockRequest.json as jest.Mock).mockRejectedValue(new Error('Invalid JSON'));
      
      const response = await POST(mockRequest as NextRequest);
      const result = await response.json();
      
      expect(response.status).toBe(400);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid request');
    });

    test('should validate required email field', async () => {
      (mockRequest.json as jest.Mock).mockResolvedValue({
        interests: ['earnings-reports']
        // Missing email field
      });
      
      const response = await POST(mockRequest as NextRequest);
      const result = await response.json();
      
      expect(response.status).toBe(400);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Email is required');
    });

    test('should handle database connection errors', async () => {
      (mockRequest.json as jest.Mock).mockResolvedValue({
        email: 'investor@example.com'
      });
      
      (supabaseServerClient as jest.Mock).mockRejectedValue(new Error('Database connection failed'));
      
      const response = await POST(mockRequest as NextRequest);
      const result = await response.json();
      
      expect(response.status).toBe(500);
      expect(result.success).toBe(false);
      expect(result.error).toContain('database error');
    });

    test('should validate interest categories', async () => {
      const validInterests = ['earnings-reports', 'market-analysis', 'sec-filings'];
      const invalidInterests = ['invalid-category', 'another-invalid'];
      
      (mockRequest.json as jest.Mock).mockResolvedValue({
        email: 'investor@example.com',
        interests: [...validInterests, ...invalidInterests]
      });
      
      mockSupabaseClient.single.mockResolvedValue({
        data: { id: 1, email: 'investor@example.com' },
        error: null
      });
      
      await POST(mockRequest as NextRequest);
      
      // Should only store valid interests
      expect(mockSupabaseClient.insert).toHaveBeenCalledWith({
        email: 'investor@example.com',
        interests: validInterests,
        subscribed_at: expect.any(String)
      });
    });

    test('should send welcome email after successful subscription', async () => {
      (mockRequest.json as jest.Mock).mockResolvedValue({
        email: 'investor@example.com'
      });
      
      mockSupabaseClient.single.mockResolvedValue({
        data: { id: 1, email: 'investor@example.com' },
        error: null
      });
      
      await POST(mockRequest as NextRequest);
      
      expect(resend.emails.send).toHaveBeenCalledWith({
        from: expect.any(String),
        to: 'investor@example.com',
        subject: expect.stringContaining('Welcome'),
        html: expect.any(String)
      });
    });

    test('should handle welcome email delivery failures gracefully', async () => {
      (mockRequest.json as jest.Mock).mockResolvedValue({
        email: 'investor@example.com'
      });
      
      mockSupabaseClient.single.mockResolvedValue({
        data: { id: 1, email: 'investor@example.com' },
        error: null
      });
      
      (resend.emails.send as jest.Mock).mockRejectedValue(new Error('Email delivery failed'));
      
      const response = await POST(mockRequest as NextRequest);
      const result = await response.json();
      
      // Should still return success for subscription, but note email issue
      expect(response.status).toBe(200);
      expect(result.success).toBe(true);
      expect(result.message).toContain('subscribed');
      expect(result.emailDelivered).toBe(false);
    });

    test('should implement rate limiting for subscription attempts', async () => {
      const email = 'investor@example.com';
      
      // Setup rate limiting mock
      const mockRateLimit = jest.fn();
      mockRateLimit
        .mockResolvedValueOnce({ success: true, remaining: 4 })
        .mockResolvedValueOnce({ success: true, remaining: 3 })
        .mockResolvedValueOnce({ success: false, remaining: 0 });
      
      // Mock rate limiter
      jest.doMock('../../lib/ai/rate-limiter', () => ({
        checkRateLimit: mockRateLimit
      }));
      
      (mockRequest.json as jest.Mock).mockResolvedValue({ email });
      
      // First request should succeed
      let response = await POST(mockRequest as NextRequest);
      expect(response.status).toBe(200);
      
      // Second request should succeed
      response = await POST(mockRequest as NextRequest);
      expect(response.status).toBe(200);
      
      // Third request should be rate limited
      response = await POST(mockRequest as NextRequest);
      expect(response.status).toBe(429);
    });
  });

  describe('Security Validation', () => {
    test('should reject potentially malicious email patterns', async () => {
      const maliciousEmails = [
        'test@test.com<script>alert("xss")</script>',
        'test+injection@evil.com',
        '../../../etc/passwd@example.com'
      ];
      
      for (const email of maliciousEmails) {
        (mockRequest.json as jest.Mock).mockResolvedValue({ email });
        
        (EmailValidator.validate as jest.Mock).mockResolvedValue({
          isValid: false,
          reason: 'Potentially malicious pattern detected'
        });
        
        const response = await POST(mockRequest as NextRequest);
        expect(response.status).toBe(400);
      }
    });

    test('should validate Content-Type header', async () => {
      // Mock request without proper Content-Type
      const requestWithoutContentType = {
        ...mockRequest,
        headers: new Headers()
      };
      
      (requestWithoutContentType.json as jest.Mock).mockResolvedValue({
        email: 'investor@example.com'
      });
      
      const response = await POST(requestWithoutContentType as NextRequest);
      
      // Should still work but log warning
      expect(response.status).toBe(200);
    });

    test('should implement CSRF protection', async () => {
      const requestWithoutOrigin = {
        ...mockRequest,
        headers: new Headers({
          'origin': 'http://malicious-site.com'
        })
      };
      
      (requestWithoutOrigin.json as jest.Mock).mockResolvedValue({
        email: 'investor@example.com'
      });
      
      const response = await POST(requestWithoutOrigin as NextRequest);
      
      // Should reject requests from unauthorized origins
      expect(response.status).toBe(403);
    });
  });
});