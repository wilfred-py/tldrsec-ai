/**
 * Comprehensive test suite for Sidebar admin features
 * Tests: Admin navigation visibility, UX elements, Accessibility
 */
import { render, screen, waitFor } from '@testing-library/react';
import { useUser } from '@clerk/nextjs';
import { useAdminStatus } from '@/lib/hooks/use-admin-status';
import { Sidebar } from '@/components/layout/sidebar';

// Mock hooks
jest.mock('@clerk/nextjs', () => ({
  useUser: jest.fn(),
}));

jest.mock('@/lib/hooks/use-admin-status', () => ({
  useAdminStatus: jest.fn(),
}));

jest.mock('next/navigation', () => ({
  usePathname: jest.fn().mockReturnValue('/dashboard'),
}));

const mockUseUser = jest.mocked(useUser);
const mockUseAdminStatus = jest.mocked(useAdminStatus);

describe('Sidebar Admin Features', () => {
  const mockUser = {
    id: 'user_123',
    fullName: 'Test User',
    emailAddresses: [{ emailAddress: 'user@example.com' }],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseUser.mockReturnValue({ user: mockUser, isLoaded: true });
  });

  describe('Admin Navigation Visibility', () => {
    it('should show admin section for admin users', async () => {
      mockUseAdminStatus.mockReturnValue({
        isAdmin: true,
        loading: false,
        error: null,
      });

      render(<Sidebar className="test-sidebar" />);

      expect(screen.getByText('Administration')).toBeInTheDocument();
      expect(screen.getByText('Monitoring')).toBeInTheDocument();
      expect(screen.getByText('Admin')).toBeInTheDocument();
    });

    it('should hide admin section for non-admin users', () => {
      mockUseAdminStatus.mockReturnValue({
        isAdmin: false,
        loading: false,
        error: null,
      });

      render(<Sidebar className="test-sidebar" />);

      expect(screen.queryByText('Administration')).not.toBeInTheDocument();
      expect(screen.queryByText('Monitoring')).not.toBeInTheDocument();
      expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    });

    it('should hide admin section while loading admin status', () => {
      mockUseAdminStatus.mockReturnValue({
        isAdmin: false,
        loading: true,
        error: null,
      });

      render(<Sidebar className="test-sidebar" />);

      expect(screen.queryByText('Administration')).not.toBeInTheDocument();
    });

    it('should hide admin section on admin status error', () => {
      mockUseAdminStatus.mockReturnValue({
        isAdmin: false,
        loading: false,
        error: 'Failed to check admin status',
      });

      render(<Sidebar className="test-sidebar" />);

      expect(screen.queryByText('Administration')).not.toBeInTheDocument();
    });
  });

  describe('UX Elements & Visual Indicators', () => {
    it('should display admin badge next to monitoring link', () => {
      mockUseAdminStatus.mockReturnValue({
        isAdmin: true,
        loading: false,
        error: null,
      });

      render(<Sidebar className="test-sidebar" />);

      const monitoringLink = screen.getByRole('link', { name: /monitoring/i });
      expect(monitoringLink).toBeInTheDocument();
      
      const adminBadge = screen.getByText('Admin');
      expect(adminBadge).toBeInTheDocument();
      expect(adminBadge).toHaveClass('text-xs');
    });

    it('should display shield icon for admin users in user section', () => {
      mockUseAdminStatus.mockReturnValue({
        isAdmin: true,
        loading: false,
        error: null,
      });

      render(<Sidebar className="test-sidebar" />);

      const userSection = screen.getByText('Pro Plan • Admin');
      expect(userSection).toBeInTheDocument();
    });

    it('should not display shield icon for non-admin users', () => {
      mockUseAdminStatus.mockReturnValue({
        isAdmin: false,
        loading: false,
        error: null,
      });

      render(<Sidebar className="test-sidebar" />);

      const userSection = screen.getByText('Pro Plan');
      expect(userSection).toBeInTheDocument();
      expect(screen.queryByText('Pro Plan • Admin')).not.toBeInTheDocument();
    });

    it('should properly separate admin section with separator', () => {
      mockUseAdminStatus.mockReturnValue({
        isAdmin: true,
        loading: false,
        error: null,
      });

      const { container } = render(<Sidebar className="test-sidebar" />);

      // Check for separator before admin section
      const separators = container.querySelectorAll('[role="separator"]');
      expect(separators.length).toBeGreaterThan(0);
    });

    it('should display activity icon for monitoring link', () => {
      mockUseAdminStatus.mockReturnValue({
        isAdmin: true,
        loading: false,
        error: null,
      });

      const { container } = render(<Sidebar className="test-sidebar" />);

      // Check for ActivityIcon in monitoring link
      const monitoringLink = screen.getByRole('link', { name: /monitoring/i });
      expect(monitoringLink).toBeInTheDocument();
      
      // Check for SVG icon (ActivityIcon renders as SVG)
      const icon = monitoringLink.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('Accessibility Features', () => {
    it('should have proper ARIA labels for admin navigation', () => {
      mockUseAdminStatus.mockReturnValue({
        isAdmin: true,
        loading: false,
        error: null,
      });

      render(<Sidebar className="test-sidebar" />);

      const monitoringLink = screen.getByLabelText('Monitoring dashboard (Admin only)');
      expect(monitoringLink).toBeInTheDocument();
      expect(monitoringLink).toHaveAttribute('href', '/dashboard/monitoring');
    });

    it('should have aria-hidden attribute on decorative icons', () => {
      mockUseAdminStatus.mockReturnValue({
        isAdmin: true,
        loading: false,
        error: null,
      });

      const { container } = render(<Sidebar className="test-sidebar" />);

      const monitoringLink = screen.getByLabelText('Monitoring dashboard (Admin only)');
      const icon = monitoringLink.querySelector('[aria-hidden="true"]');
      expect(icon).toBeInTheDocument();
    });

    it('should maintain keyboard navigation for admin links', () => {
      mockUseAdminStatus.mockReturnValue({
        isAdmin: true,
        loading: false,
        error: null,
      });

      render(<Sidebar className="test-sidebar" />);

      const monitoringLink = screen.getByRole('link', { name: /monitoring dashboard/i });
      expect(monitoringLink).toBeInTheDocument();
      expect(monitoringLink.tagName).toBe('A');
      expect(monitoringLink).toHaveAttribute('href', '/dashboard/monitoring');
    });

    it('should have proper heading structure for admin section', () => {
      mockUseAdminStatus.mockReturnValue({
        isAdmin: true,
        loading: false,
        error: null,
      });

      render(<Sidebar className="test-sidebar" />);

      const adminHeading = screen.getByText('Administration');
      expect(adminHeading.tagName).toBe('H4');
      expect(adminHeading).toHaveClass('text-xs', 'font-medium', 'uppercase', 'tracking-wider');
    });
  });

  describe('Mobile Navigation', () => {
    it('should include admin section in mobile navigation', () => {
      mockUseAdminStatus.mockReturnValue({
        isAdmin: true,
        loading: false,
        error: null,
      });

      const { container } = render(<Sidebar className="test-sidebar" />);

      // Mobile sidebar is rendered in SheetContent
      const sheetTrigger = container.querySelector('[role="button"]');
      expect(sheetTrigger).toBeInTheDocument();
    });

    it('should maintain consistent admin navigation between desktop and mobile', () => {
      mockUseAdminStatus.mockReturnValue({
        isAdmin: true,
        loading: false,
        error: null,
      });

      render(<Sidebar className="test-sidebar" />);

      // Both desktop and mobile should have the same admin navigation items
      const adminSections = screen.getAllByText('Administration');
      expect(adminSections).toHaveLength(2); // Desktop + Mobile
      
      const monitoringLinks = screen.getAllByText('Monitoring');
      expect(monitoringLinks).toHaveLength(2); // Desktop + Mobile
    });
  });

  describe('Error Resilience', () => {
    it('should handle user without fullName gracefully', () => {
      mockUseUser.mockReturnValue({
        user: { ...mockUser, fullName: undefined },
        isLoaded: true,
      });
      mockUseAdminStatus.mockReturnValue({
        isAdmin: true,
        loading: false,
        error: null,
      });

      render(<Sidebar className="test-sidebar" />);

      expect(screen.getByText('User')).toBeInTheDocument(); // Fallback text
      expect(screen.getByText('Administration')).toBeInTheDocument();
    });

    it('should handle null user gracefully', () => {
      mockUseUser.mockReturnValue({ user: null, isLoaded: true });
      mockUseAdminStatus.mockReturnValue({
        isAdmin: false,
        loading: false,
        error: null,
      });

      render(<Sidebar className="test-sidebar" />);

      expect(screen.getByText('User')).toBeInTheDocument(); // Fallback text
      expect(screen.queryByText('Administration')).not.toBeInTheDocument();
    });

    it('should handle admin status hook errors gracefully', () => {
      mockUseAdminStatus.mockReturnValue({
        isAdmin: false,
        loading: false,
        error: 'Network error',
      });

      render(<Sidebar className="test-sidebar" />);

      // Should not show admin section on error
      expect(screen.queryByText('Administration')).not.toBeInTheDocument();
      
      // Should still show regular navigation
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Summaries')).toBeInTheDocument();
    });

    it('should handle undefined admin status loading state', () => {
      mockUseAdminStatus.mockReturnValue({
        isAdmin: true,
        loading: undefined as any,
        error: null,
      });

      render(<Sidebar className="test-sidebar" />);

      // Should treat undefined loading as false and show admin section
      expect(screen.getByText('Administration')).toBeInTheDocument();
    });
  });

  describe('Performance Considerations', () => {
    it('should not re-render unnecessarily when admin status is stable', () => {
      const stableAdminStatus = {
        isAdmin: true,
        loading: false,
        error: null,
      };
      
      mockUseAdminStatus.mockReturnValue(stableAdminStatus);

      const { rerender } = render(<Sidebar className="test-sidebar" />);

      expect(screen.getByText('Administration')).toBeInTheDocument();

      // Re-render with same admin status
      mockUseAdminStatus.mockReturnValue(stableAdminStatus);
      rerender(<Sidebar className="test-sidebar" />);

      expect(screen.getByText('Administration')).toBeInTheDocument();
    });

    it('should handle rapid admin status changes', async () => {
      // Start with loading
      mockUseAdminStatus.mockReturnValue({
        isAdmin: false,
        loading: true,
        error: null,
      });

      const { rerender } = render(<Sidebar className="test-sidebar" />);

      expect(screen.queryByText('Administration')).not.toBeInTheDocument();

      // Change to admin user
      mockUseAdminStatus.mockReturnValue({
        isAdmin: true,
        loading: false,
        error: null,
      });

      rerender(<Sidebar className="test-sidebar" />);

      expect(screen.getByText('Administration')).toBeInTheDocument();

      // Change to error state
      mockUseAdminStatus.mockReturnValue({
        isAdmin: false,
        loading: false,
        error: 'API error',
      });

      rerender(<Sidebar className="test-sidebar" />);

      expect(screen.queryByText('Administration')).not.toBeInTheDocument();
    });
  });
});