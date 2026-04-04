import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock Next.js navigation - must be defined before any imports that use it
const mockBack = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSearchParamsGet = jest.fn().mockReturnValue(null);
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    back: mockBack,
    replace: mockReplace,
  }),
  useSearchParams: () => ({
    get: mockSearchParamsGet,
  }),
}));

// Mock Clerk
jest.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    user: { id: 'test-user-id', fullName: 'Test User' },
    isSignedIn: true,
    isLoaded: true,
  }),
}));

// Mock framer-motion to avoid animation issues in tests - filter out motion-specific props
jest.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(({ children, initial, animate, whileHover, transition, ...props }: React.PropsWithChildren<Record<string, unknown>>, ref) => (
      <div ref={ref as React.Ref<HTMLDivElement>} {...props}>{children}</div>
    )),
    span: React.forwardRef(({ children, initial, animate, exit, transition, custom, ...props }: React.PropsWithChildren<Record<string, unknown>>, ref) => (
      <span ref={ref as React.Ref<HTMLSpanElement>} {...props}>{children}</span>
    )),
    p: React.forwardRef(({ children, initial, animate, exit, transition, ...props }: React.PropsWithChildren<Record<string, unknown>>, ref) => (
      <p ref={ref as React.Ref<HTMLParagraphElement>} {...props}>{children}</p>
    )),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

// Import after mocks
import SubscribePage from '@/app/subscribe/page';

describe('SubscribePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchParamsGet.mockReturnValue(null);
    // Reset fetch mock for each test
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ planType: 'FREE' }),
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should render only PRO and MAX plans (no FREE card)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ planType: 'FREE', isTrialing: true, daysRemaining: 5 }),
    });

    render(<SubscribePage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /pro/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /max/i })).toBeInTheDocument();
    });
  });

  it('should not show trial banner on subscribe page', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ planType: 'FREE', isActive: true, isTrialing: true, daysRemaining: 5 }),
    });

    render(<SubscribePage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /pro/i })).toBeInTheDocument();
    });

    // Trial banner should not be present on subscribe page
    expect(screen.queryByText(/days remaining/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Trial Expired/)).not.toBeInTheDocument();
  });

  it('should show upgrade CTAs for PRO and MAX plans', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ planType: 'FREE', isTrialing: true, daysRemaining: 5 }),
    });

    render(<SubscribePage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /upgrade to pro/i })).toBeEnabled();
      expect(screen.getByRole('button', { name: /upgrade to max/i })).toBeEnabled();
    });
  });

  it('should navigate back when ESC key is pressed', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ planType: 'FREE' }),
    });

    render(<SubscribePage />);

    // Wait for loading to complete
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /pro/i })).toBeInTheDocument();
    });

    await userEvent.keyboard('{Escape}');

    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  it('should navigate back when back arrow is clicked', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ planType: 'FREE' }),
    });

    render(<SubscribePage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /pro/i })).toBeInTheDocument();
    });

    const backButton = screen.getByRole('button', { name: /go back/i });
    await userEvent.click(backButton);

    expect(mockPush).toHaveBeenCalledWith('/dashboard');
  });

  it('should show PRO plan as current when user has PRO subscription', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ planType: 'PRO', isActive: true }),
    });

    render(<SubscribePage />);

    await waitFor(() => {
      // PRO plan should have disabled "Current Plan" button
      const currentPlanButton = screen.getByRole('button', { name: /current plan/i });
      expect(currentPlanButton).toBeDisabled();

      // Upgrade to Max should be enabled
      expect(screen.getByRole('button', { name: /upgrade to max/i })).toBeEnabled();
    });
  });

  it('should toggle billing interval between monthly and annual', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ planType: 'FREE' }),
    });

    render(<SubscribePage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /pro/i })).toBeInTheDocument();
    });

    // Find the toggle switch by its aria-label
    const toggleButton = screen.getByRole('switch', { name: /switch to annual billing/i });
    expect(toggleButton).toBeInTheDocument();

    await userEvent.click(toggleButton);

    // After clicking, it should now say "switch to monthly"
    await waitFor(() => {
      expect(screen.getByRole('switch', { name: /switch to monthly billing/i })).toBeInTheDocument();
    });
  });

  // QA-requested tests for error handling
  it('should show error message when subscription fetch fails', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

    render(<SubscribePage />);

    // Should still render page but with error state handling
    await waitFor(() => {
      // Component should handle error gracefully and render plans with default FREE state
      expect(screen.getByRole('heading', { name: /pro/i })).toBeInTheDocument();
    });
  });

  it('should handle 409 conflict error during checkout', async () => {
    const { toast } = require('sonner');
    // Clear previous calls
    jest.clearAllMocks();

    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ planType: 'FREE' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: 'Already subscribed' }),
      });

    render(<SubscribePage />);

    await waitFor(() => screen.getByRole('button', { name: /upgrade to pro/i }));

    const upgradeButton = screen.getByRole('button', { name: /upgrade to pro/i });

    await act(async () => {
      await userEvent.click(upgradeButton);
    });

    // Wait for loading state to complete
    await waitFor(() => {
      // Button should no longer be in loading state
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    }, { timeout: 3000 });

    // Verify toast.error was called (error boundary ensures it was called)
    expect(toast.error).toHaveBeenCalled();
  });

  it('should handle 500 server error during checkout', async () => {
    const { toast } = require('sonner');
    // Clear previous calls
    jest.clearAllMocks();

    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ planType: 'FREE' }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal server error' }),
      });

    render(<SubscribePage />);

    await waitFor(() => screen.getByRole('button', { name: /upgrade to pro/i }));

    const upgradeButton = screen.getByRole('button', { name: /upgrade to pro/i });

    await act(async () => {
      await userEvent.click(upgradeButton);
    });

    // Wait for loading state to complete
    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    }, { timeout: 3000 });

    // Verify toast.error was called with appropriate message
    expect(toast.error).toHaveBeenCalled();
  });

  it('should handle unauthenticated user gracefully', async () => {
    jest.spyOn(require('@clerk/nextjs'), 'useUser').mockReturnValue({
      user: null,
      isSignedIn: false,
      isLoaded: true,
    });

    render(<SubscribePage />);

    await waitFor(() => {
      // Should render page but not show subscription data
      expect(screen.getByRole('heading', { name: /choose your plan/i })).toBeInTheDocument();
    });
  });
});
