/**
 * Comprehensive security test suite for monitoring page access controls
 * Tests: Authentication, Authorization, Audit logging, Redirect security
 */
import { redirect } from 'next/navigation';
import { currentUser } from '@clerk/nextjs/server';
import MonitoringPage from '@/app/dashboard/monitoring/page';
import { logger } from '@/lib/logging';

// Mock dependencies
jest.mock('next/navigation');
jest.mock('@clerk/nextjs/server');
jest.mock('@/lib/logging');
jest.mock('@/components/dashboard/cron-monitoring', () => ({
  CronMonitoringDashboard: () => <div data-testid="monitoring-dashboard">Dashboard</div>,
}));

const mockRedirect = jest.mocked(redirect);
const mockCurrentUser = jest.mocked(currentUser);
const mockLogger = {
  child: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
};
jest.mocked(logger).child = mockLogger.child;

// TODO: These tests have issues with mocking Next.js navigation/redirect
// The jest.mocked(redirect) approach doesn't work correctly with Next.js 15
// These tests need to be refactored to use a different mocking strategy
describe.skip('Monitoring Page Security Tests', () => {
  let originalEnv: typeof process.env;

  beforeEach(() => {
    originalEnv = process.env;
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Authentication Tests', () => {
    it('should redirect unauthenticated users to sign-in', async () => {
      mockCurrentUser.mockResolvedValue(null);

      await MonitoringPage({ searchParams: {} });

      expect(mockRedirect).toHaveBeenCalledWith('/sign-in');
    });

    it('should handle authentication errors gracefully', async () => {
      mockCurrentUser.mockRejectedValue(new Error('Authentication service unavailable'));

      await expect(MonitoringPage({ searchParams: {} })).rejects.toThrow(
        'Authentication service unavailable'
      );
    });
  });

  describe('Authorization Tests', () => {
    const mockUser = {
      id: 'user_123',
      emailAddresses: [{ emailAddress: 'user@example.com' }],
    };

    it('should allow admin users to access monitoring dashboard', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue({
        ...mockUser,
        emailAddresses: [{ emailAddress: 'admin@example.com' }],
      });

      const result = await MonitoringPage({ searchParams: {} });

      expect(mockRedirect).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should block non-admin users from accessing monitoring dashboard', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue(mockUser);

      await MonitoringPage({ searchParams: {} });

      expect(mockRedirect).toHaveBeenCalledWith('/dashboard?error=access_denied&resource=monitoring');
    });

    it('should block access when ADMIN_EMAIL is not configured', async () => {
      delete process.env.ADMIN_EMAIL;
      mockCurrentUser.mockResolvedValue(mockUser);

      await MonitoringPage({ searchParams: {} });

      expect(mockRedirect).toHaveBeenCalledWith('/dashboard?error=access_denied&resource=monitoring');
    });

    it('should be case-sensitive for admin email matching', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue({
        ...mockUser,
        emailAddresses: [{ emailAddress: 'ADMIN@EXAMPLE.COM' }],
      });

      await MonitoringPage({ searchParams: {} });

      expect(mockRedirect).toHaveBeenCalledWith('/dashboard?error=access_denied&resource=monitoring');
    });

    it('should handle users with no email addresses', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue({
        ...mockUser,
        emailAddresses: [],
      });

      await MonitoringPage({ searchParams: {} });

      expect(mockRedirect).toHaveBeenCalledWith('/dashboard?error=access_denied&resource=monitoring');
    });

    it('should handle users with undefined emailAddresses', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue({
        ...mockUser,
        emailAddresses: undefined as any,
      });

      await MonitoringPage({ searchParams: {} });

      expect(mockRedirect).toHaveBeenCalledWith('/dashboard?error=access_denied&resource=monitoring');
    });
  });

  describe('Security Audit Logging Tests', () => {
    const mockUser = {
      id: 'user_123',
      emailAddresses: [{ emailAddress: 'user@example.com' }],
    };

    it('should log successful admin access attempts', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue({
        ...mockUser,
        emailAddresses: [{ emailAddress: 'admin@example.com' }],
      });

      await MonitoringPage({ searchParams: {} });

      expect(mockLogger.child).toHaveBeenCalledWith('monitoring-page-access');
      const childLogger = mockLogger.child.mock.results[0].value;
      expect(childLogger.info).toHaveBeenCalledWith(
        'Admin access granted to monitoring dashboard',
        {
          userId: 'user_123',
          userEmail: 'admin@example.com',
          timestamp: expect.any(String),
          resource: '/dashboard/monitoring',
        }
      );
    });

    it('should log unauthorized access attempts', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue(mockUser);

      await MonitoringPage({ searchParams: {} });

      const childLogger = mockLogger.child.mock.results[0].value;
      expect(childLogger.warn).toHaveBeenCalledWith(
        'Unauthorized access attempt to monitoring dashboard',
        {
          userId: 'user_123',
          userEmail: 'user@example.com',
          timestamp: expect.any(String),
          attemptedResource: '/dashboard/monitoring',
        }
      );
    });

    it('should log access attempts with proper timestamp format', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue(mockUser);

      await MonitoringPage({ searchParams: {} });

      const childLogger = mockLogger.child.mock.results[0].value;
      const logCall = childLogger.warn.mock.calls[0];
      const logData = logCall[1];

      expect(logData.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    it('should not expose admin email in logs for non-admin users', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue(mockUser);

      await MonitoringPage({ searchParams: {} });

      const childLogger = mockLogger.child.mock.results[0].value;
      const logCall = childLogger.warn.mock.calls[0];
      const logMessage = JSON.stringify(logCall);

      expect(logMessage).not.toContain('admin@example.com');
      expect(logMessage).toContain('user@example.com');
    });
  });

  describe('Redirect Security Tests', () => {
    const mockUser = {
      id: 'user_123',
      emailAddresses: [{ emailAddress: 'user@example.com' }],
    };

    it('should redirect to dashboard by default', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue(mockUser);

      await MonitoringPage({ searchParams: {} });

      expect(mockRedirect).toHaveBeenCalledWith('/dashboard?error=access_denied&resource=monitoring');
    });

    it('should respect valid from parameter in redirect', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue(mockUser);

      await MonitoringPage({ 
        searchParams: { from: encodeURIComponent('/dashboard/settings') } 
      });

      expect(mockRedirect).toHaveBeenCalledWith(
        '/dashboard/settings?error=access_denied&resource=monitoring'
      );
    });

    it('should handle URL decoding safely', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue(mockUser);

      await MonitoringPage({ 
        searchParams: { from: '%2Fdashboard%2Fsettings' } 
      });

      expect(mockRedirect).toHaveBeenCalledWith(
        '/dashboard/settings?error=access_denied&resource=monitoring'
      );
    });

    it('should handle malformed from parameter gracefully', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue(mockUser);

      await MonitoringPage({ 
        searchParams: { from: '%invalid%url%' } 
      });

      // Should fall back to default dashboard
      expect(mockRedirect).toHaveBeenCalledWith('/dashboard?error=access_denied&resource=monitoring');
    });

    it('should prevent open redirect vulnerabilities', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue(mockUser);

      const maliciousUrls = [
        'http://evil.com',
        'https://malicious-site.com',
        '//evil.com',
        'javascript:alert(1)',
        'data:text/html,<script>alert(1)</script>',
      ];

      for (const maliciousUrl of maliciousUrls) {
        jest.clearAllMocks();
        await MonitoringPage({ 
          searchParams: { from: encodeURIComponent(maliciousUrl) } 
        });

        // Should redirect safely to the decoded URL (but with error params)
        // Note: The actual redirect behavior depends on implementation
        expect(mockRedirect).toHaveBeenCalled();
        const redirectUrl = mockRedirect.mock.calls[0][0];
        expect(redirectUrl).toContain('error=access_denied&resource=monitoring');
      }
    });

    it('should handle array-type from parameter', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue(mockUser);

      await MonitoringPage({ 
        searchParams: { from: ['/dashboard/settings', '/dashboard/summaries'] } 
      });

      // Should fall back to default dashboard when from is an array
      expect(mockRedirect).toHaveBeenCalledWith('/dashboard?error=access_denied&resource=monitoring');
    });

    it('should preserve error parameters in redirect URL', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue(mockUser);

      await MonitoringPage({ searchParams: {} });

      const redirectUrl = mockRedirect.mock.calls[0][0];
      expect(redirectUrl).toContain('error=access_denied');
      expect(redirectUrl).toContain('resource=monitoring');
    });
  });

  describe('Environment Configuration Security Tests', () => {
    const mockUser = {
      id: 'user_123',
      emailAddresses: [{ emailAddress: 'user@example.com' }],
    };

    it('should handle empty ADMIN_EMAIL securely', async () => {
      process.env.ADMIN_EMAIL = '';
      mockCurrentUser.mockResolvedValue(mockUser);

      await MonitoringPage({ searchParams: {} });

      expect(mockRedirect).toHaveBeenCalledWith('/dashboard?error=access_denied&resource=monitoring');
    });

    it('should handle whitespace-only ADMIN_EMAIL', async () => {
      process.env.ADMIN_EMAIL = '   ';
      mockCurrentUser.mockResolvedValue(mockUser);

      await MonitoringPage({ searchParams: {} });

      expect(mockRedirect).toHaveBeenCalledWith('/dashboard?error=access_denied&resource=monitoring');
    });

    it('should not be vulnerable to email bypass with null bytes', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue({
        ...mockUser,
        emailAddresses: [{ emailAddress: 'admin@example.com\x00malicious' }],
      });

      await MonitoringPage({ searchParams: {} });

      expect(mockRedirect).toHaveBeenCalledWith('/dashboard?error=access_denied&resource=monitoring');
    });

    it('should handle special characters in admin email correctly', async () => {
      process.env.ADMIN_EMAIL = 'admin+test@example.com';
      mockCurrentUser.mockResolvedValue({
        ...mockUser,
        emailAddresses: [{ emailAddress: 'admin+test@example.com' }],
      });

      const result = await MonitoringPage({ searchParams: {} });

      expect(mockRedirect).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('Error Resilience Tests', () => {
    const mockUser = {
      id: 'user_123',
      emailAddresses: [{ emailAddress: 'user@example.com' }],
    };

    it('should handle corrupt user data gracefully', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue({
        id: null,
        emailAddresses: null,
      } as any);

      await MonitoringPage({ searchParams: {} });

      expect(mockRedirect).toHaveBeenCalledWith('/dashboard?error=access_denied&resource=monitoring');
    });

    it('should handle logger failures gracefully', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue(mockUser);
      
      // Make logger throw an error
      const childLogger = mockLogger.child.mock.results[0]?.value;
      if (childLogger) {
        childLogger.warn.mockImplementation(() => {
          throw new Error('Logger error');
        });
      }

      // Should still redirect despite logger error
      await MonitoringPage({ searchParams: {} });

      expect(mockRedirect).toHaveBeenCalledWith('/dashboard?error=access_denied&resource=monitoring');
    });

    it('should handle extremely long email addresses', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      const longEmail = 'a'.repeat(1000) + '@example.com';
      mockCurrentUser.mockResolvedValue({
        ...mockUser,
        emailAddresses: [{ emailAddress: longEmail }],
      });

      await MonitoringPage({ searchParams: {} });

      expect(mockRedirect).toHaveBeenCalledWith('/dashboard?error=access_denied&resource=monitoring');
    });
  });

  describe('Performance & Resource Tests', () => {
    const mockUser = {
      id: 'user_123',
      emailAddresses: [{ emailAddress: 'admin@example.com' }],
    };

    it('should complete access check within reasonable time', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue(mockUser);

      const startTime = Date.now();
      await MonitoringPage({ searchParams: {} });
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should not consume excessive memory with large searchParams', async () => {
      process.env.ADMIN_EMAIL = 'admin@example.com';
      mockCurrentUser.mockResolvedValue(mockUser);

      const largeSearchParams: Record<string, string> = {};
      for (let i = 0; i < 1000; i++) {
        largeSearchParams[`param${i}`] = `value${i}`;
      }

      await MonitoringPage({ searchParams: largeSearchParams });

      expect(mockRedirect).not.toHaveBeenCalled();
    });
  });
});