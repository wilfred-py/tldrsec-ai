import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock Clerk
jest.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    user: { fullName: 'Test User', imageUrl: null }
  }),
  UserButton: () => <div data-testid="user-button">UserButton</div>,
  ClerkProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock next/navigation
jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

// Mock ProtectedRoute to just render children
jest.mock('@/components/auth', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock ErrorHandler
jest.mock('@/components/ui/error-handler', () => ({
  ErrorHandler: () => null,
}));

// Import the layout after mocks
import DashboardLayout from '@/app/dashboard/layout';

describe('Dashboard Layout - No Sidebar', () => {
  it('should NOT render a sidebar element', () => {
    const { container } = render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );

    // Sidebar has class md:w-64 or role navigation
    const sidebar = container.querySelector('aside');
    expect(sidebar).toBeNull();
  });

  it('should NOT have left padding for sidebar on desktop', () => {
    const { container } = render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );

    // Should NOT have md:pl-64 class
    const main = container.querySelector('main');
    expect(main?.className).not.toContain('pl-64');
  });

  it('should render header with logo and subscription button', () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );

    // Logo
    expect(screen.getByText('tldr')).toBeInTheDocument();
    expect(screen.getByText('SEC')).toBeInTheDocument();

    // Subscription button
    expect(screen.getByRole('link', { name: /manage subscription/i })).toBeInTheDocument();
  });

  it('should have subscription button linking to /dashboard/billing', () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );

    const subscriptionLink = screen.getByRole('link', { name: /manage subscription/i });
    expect(subscriptionLink).toHaveAttribute('href', '/dashboard/billing');
  });

  it('should render user profile in header', () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );

    expect(screen.getByTestId('user-button')).toBeInTheDocument();
    expect(screen.getByText('Test User')).toBeInTheDocument();
  });

  it('should NOT render mobile hamburger menu', () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );

    // No hamburger menu button
    const menuButton = screen.queryByRole('button', { name: /toggle menu/i });
    expect(menuButton).toBeNull();
  });
});
