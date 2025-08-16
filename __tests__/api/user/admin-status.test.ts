/**
 * Comprehensive test suite for admin status API endpoint
 * Tests: Authentication, Authorization, Security, Error Handling
 */
import { NextRequest } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { GET } from '@/app/api/user/admin-status/route';

// Mock dependencies
jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn()
}));

jest.mock('@/lib/logging', () => ({
  logger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

const mockCurrentUser = jest.mocked(currentUser);

describe('API: /api/user/admin-status', () => {
  let originalEnv: typeof process.env;
  let mockRequest: NextRequest;

  beforeEach(() => {
    originalEnv = process.env;
    mockRequest = {
      headers: new Headers({
        'user-agent': 'test-browser',
        'x-forwarded-for': '127.0.0.1',
      }),
      ip: '127.0.0.1',
    } as NextRequest;

    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Authentication Tests', () => {
    it('should return 401 for unauthenticated users', async () => {
      mockCurrentUser.mockResolvedValue(null);

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('Authentication required');
    });

    it('should handle Clerk authentication errors', async () => {
      mockCurrentUser.mockRejectedValue(new Error('Clerk API error'));

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Failed to check admin status');
      expect(data.isAdmin).toBe(false);
    });
  });

  describe('Authorization Tests', () => {
    const mockUser = {
      id: 'user_123',
      emailAddresses: [{ emailAddress: 'user@example.com' }],
    };

    it('should return isAdmin: true for admin users', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue({
        ...mockUser,
        emailAddresses: [{ emailAddress: 'admin@example.com' }],
      });

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isAdmin).toBe(true);
      expect(data.timestamp).toBeDefined();
    });

    it('should return isAdmin: false for non-admin users', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue(mockUser);

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isAdmin).toBe(false);
      expect(data.timestamp).toBeDefined();
    });

    it('should be case-sensitive for email matching', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue({
        ...mockUser,
        emailAddresses: [{ emailAddress: 'ADMIN@EXAMPLE.COM' }],
      });

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isAdmin).toBe(false);
    });

    it('should handle users with multiple email addresses', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue({
        ...mockUser,
        emailAddresses: [
          { emailAddress: 'user@example.com' },
          { emailAddress: 'admin@example.com' },
        ],
      });

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isAdmin).toBe(false); // Only checks first email
    });
  });

  describe('Environment Configuration Tests', () => {
    const mockUser = {
      id: 'user_123',
      emailAddresses: [{ emailAddress: 'user@example.com' }],
    };

    it('should handle missing ADMIN_EMAIL environment variable', async () => {
      delete process.env.ADMIN_EMAIL;
      mockCurrentUser.mockResolvedValue(mockUser);

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isAdmin).toBe(false);
    });

    it('should handle empty ADMIN_EMAIL environment variable', async () => {
      process.env.ADMIN_EMAIL = '';
      mockCurrentUser.mockResolvedValue(mockUser);

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isAdmin).toBe(false);
    });

    it('should handle malformed email in ADMIN_EMAIL', async () => {
      process.env.ADMIN_EMAIL = 'not-an-email';
      mockCurrentUser.mockResolvedValue({
        ...mockUser,
        emailAddresses: [{ emailAddress: 'not-an-email' }],
      });

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isAdmin).toBe(true); // Still allows exact match
    });
  });

  describe('Security & Audit Logging Tests', () => {
    const mockUser = {
      id: 'user_123',
      emailAddresses: [{ emailAddress: 'user@example.com' }],
    };

    it('should log admin status checks with audit information', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue(mockUser);

      await GET(mockRequest);

      const { logger } = require('@/lib/logging');
      expect(logger.child).toHaveBeenCalledWith('admin-status-api');
      const childLogger = logger.child.mock.results[0].value;
      expect(childLogger.info).toHaveBeenCalledWith(
        'Admin status check',
        expect.objectContaining({
          userId: 'user_123',
          userEmail: 'user@example.com',
          isAdmin: false,
          timestamp: expect.any(String),
          userAgent: 'test-browser',
          ip: '127.0.0.1',
        })
      );
    });

    it('should log warning when ADMIN_EMAIL is not configured', async () => {
      delete process.env.ADMIN_EMAIL;
      mockCurrentUser.mockResolvedValue(mockUser);

      await GET(mockRequest);

      const { logger } = require('@/lib/logging');
      const childLogger = logger.child.mock.results[0].value;
      expect(childLogger.warn).toHaveBeenCalledWith(
        'ADMIN_EMAIL environment variable not configured'
      );
    });

    it('should not expose admin email in response', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue(mockUser);

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(data).not.toHaveProperty('adminEmail');
      expect(JSON.stringify(data)).not.toContain('admin@example.com');
    });

    it('should handle missing user agent gracefully', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue(mockUser);
      mockRequest.headers = new Headers({});

      await GET(mockRequest);

      const { logger } = require('@/lib/logging');
      const childLogger = logger.child.mock.results[0].value;
      expect(childLogger.info).toHaveBeenCalledWith(
        'Admin status check',
        expect.objectContaining({
          userAgent: null,
        })
      );
    });
  });

  describe('Error Handling Tests', () => {
    it('should handle users with no email addresses', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue({
        id: 'user_123',
        emailAddresses: [],
      });

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isAdmin).toBe(false);
    });

    it('should handle users with undefined emailAddresses', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue({
        id: 'user_123',
        emailAddresses: undefined as any,
      });

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.isAdmin).toBe(false);
    });

    it('should log errors when unexpected exceptions occur', async () => {
      mockCurrentUser.mockRejectedValue(new Error('Database connection failed'));

      await GET(mockRequest);

      const { logger } = require('@/lib/logging');
      const childLogger = logger.child.mock.results[0].value;
      expect(childLogger.error).toHaveBeenCalledWith(
        'Error checking admin status',
        { error: expect.any(Error) }
      );
    });
  });

  describe('Response Format Tests', () => {
    const mockUser = {
      id: 'user_123',
      emailAddresses: [{ emailAddress: 'admin@example.com' }],
    };

    it('should return consistent response format for admin users', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue(mockUser);

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(data).toMatchObject({
        isAdmin: true,
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/),
      });
      expect(Object.keys(data)).toHaveLength(2);
    });

    it('should return consistent response format for non-admin users', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue({
        ...mockUser,
        emailAddresses: [{ emailAddress: 'user@example.com' }],
      });

      const response = await GET(mockRequest);
      const data = await response.json();

      expect(data).toMatchObject({
        isAdmin: false,
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/),
      });
      expect(Object.keys(data)).toHaveLength(2);
    });
  });

  describe('Performance & Rate Limiting Tests', () => {
    const mockUser = {
      id: 'user_123',
      emailAddresses: [{ emailAddress: 'user@example.com' }],
    };

    it('should handle concurrent requests', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue(mockUser);

      const promises = Array.from({ length: 10 }, () => GET(mockRequest));
      const responses = await Promise.all(promises);

      expect(responses).toHaveLength(10);
      responses.forEach((response) => {
        expect(response.status).toBe(200);
      });
    });

    it('should execute within reasonable time limits', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue(mockUser);

      const startTime = Date.now();
      await GET(mockRequest);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});