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

  it('should render all three subscription plans', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ planType: 'FREE' }),
    });

    render(<SubscribePage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /free/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /pro/i })).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /max/i })).toBeInTheDocument();
    });
  });

  it('should show disabled CTA for current plan (FREE)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ planType: 'FREE' }),
    });

    render(<SubscribePage />);

    await waitFor(() => {
      const currentPlanButton = screen.getByRole('button', { name: /current plan/i });
      expect(currentPlanButton).toBeDisabled();
    });
  });

  it('should show upgrade CTAs for non-current plans', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ planType: 'FREE' }),
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
      expect(screen.getByRole('heading', { name: /free/i })).toBeInTheDocument();
    });

    await userEvent.keyboard('{Escape}');

    expect(mockBack).toHaveBeenCalled();
  });

  it('should navigate back when back arrow is clicked', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ planType: 'FREE' }),
    });

    render(<SubscribePage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /free/i })).toBeInTheDocument();
    });

    const backButton = screen.getByRole('button', { name: /go back/i });
    await userEvent.click(backButton);

    expect(mockBack).toHaveBeenCalled();
  });

  it('should show PRO plan as current when user has PRO subscription', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ planType: 'PRO' }),
    });

    render(<SubscribePage />);

    await waitFor(() => {
      // PRO plan should have disabled "Current Plan" button
      const buttons = screen.getAllByRole('button');
      const currentPlanButton = buttons.find(btn =>
        btn.textContent?.toLowerCase().includes('current plan')
      );
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
      expect(screen.getByRole('heading', { name: /free/i })).toBeInTheDocument();
    });

    // Find the toggle button by its aria-label
    const toggleButton = screen.getByRole('button', { name: /switch to annual billing/i });
    expect(toggleButton).toBeInTheDocument();

    await userEvent.click(toggleButton);

    // After clicking, it should now say "switch to monthly"
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /switch to monthly billing/i })).toBeInTheDocument();
    });
  });
});
