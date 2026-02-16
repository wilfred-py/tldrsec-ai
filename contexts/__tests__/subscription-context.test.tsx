import { render, screen, waitFor, act } from '@testing-library/react';
import { SubscriptionProvider, useSubscriptionContext } from '../subscription-context';
import { useAuth } from '../auth-context';
import { SubscriptionData } from '@/lib/validation/subscription-schema';

// Mock dependencies
jest.mock('../auth-context');
jest.mock('swr', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockUseAuth = useAuth as jest.MockedFunction<typeof useAuth>;
const useSWR = require('swr').default;

// Test component to consume context
function TestComponent() {
  const { subscription, loading, error, refetch } = useSubscriptionContext();

  return (
    <div>
      <div data-testid="loading">{loading ? 'loading' : 'loaded'}</div>
      <div data-testid="error">{error || 'no-error'}</div>
      <div data-testid="plan">{subscription?.planType || 'no-plan'}</div>
      <button onClick={refetch}>Refetch</button>
    </div>
  );
}

describe('SubscriptionContext', () => {
  const mockSubscription: SubscriptionData = {
    planType: 'PRO',
    isActive: true,
    isTrialing: false,
    daysRemaining: 30,
    trialEndsAt: null,
    isGrandfathered: false,
    currentPeriodStart: '2024-01-01',
    currentPeriodEnd: '2024-02-01',
    cancelAtPeriodEnd: false,
    stripeCustomerId: 'cus_123',
    stripeSubscriptionId: 'sub_123',
    limits: {
      monthlyFilings: 100,
      usedFilings: 50,
      remainingFilings: 50,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default auth mock
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      isLoaded: true,
      user: { id: 'user_123' } as any,
      isOnboarded: true,
    });

    // Default SWR mock
    useSWR.mockReturnValue({
      data: null,
      error: null,
      isLoading: true,
      mutate: jest.fn(),
    });

    // Mock EventSource
    global.EventSource = jest.fn().mockImplementation(() => ({
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      close: jest.fn(),
      onmessage: null,
      onerror: null,
    })) as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Context Provider', () => {
    it('should provide subscription context to children', () => {
      useSWR.mockReturnValue({
        data: mockSubscription,
        error: null,
        isLoading: false,
        mutate: jest.fn(),
      });

      render(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      expect(screen.getByTestId('plan')).toHaveTextContent('PRO');
      expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
    });

    it('should throw error if used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        render(<TestComponent />);
      }).toThrow('useSubscriptionContext must be used within SubscriptionProvider');

      consoleSpy.mockRestore();
    });
  });

  describe('Loading States', () => {
    it('should show loading state initially', () => {
      useSWR.mockReturnValue({
        data: null,
        error: null,
        isLoading: true,
        mutate: jest.fn(),
      });

      render(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      expect(screen.getByTestId('loading')).toHaveTextContent('loading');
      expect(screen.getByTestId('plan')).toHaveTextContent('no-plan');
    });

    it('should transition from loading to loaded state', async () => {
      useSWR.mockReturnValue({
        data: null,
        error: null,
        isLoading: true,
        mutate: jest.fn(),
      });

      const { rerender } = render(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      expect(screen.getByTestId('loading')).toHaveTextContent('loading');

      // Update SWR mock to simulate data loaded
      useSWR.mockReturnValue({
        data: mockSubscription,
        error: null,
        isLoading: false,
        mutate: jest.fn(),
      });

      rerender(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      expect(screen.getByTestId('loading')).toHaveTextContent('loaded');
      expect(screen.getByTestId('plan')).toHaveTextContent('PRO');
    });
  });

  describe('Error Handling', () => {
    it('should handle fetch errors', () => {
      const error = new Error('Failed to fetch subscription');

      useSWR.mockReturnValue({
        data: null,
        error,
        isLoading: false,
        mutate: jest.fn(),
      });

      render(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      expect(screen.getByTestId('error')).toHaveTextContent('Failed to fetch subscription');
      expect(screen.getByTestId('plan')).toHaveTextContent('no-plan');
    });

    it('should clear error on successful refetch', async () => {
      const error = new Error('Failed to fetch subscription');
      const mutate = jest.fn();

      useSWR.mockReturnValue({
        data: null,
        error,
        isLoading: false,
        mutate,
      });

      render(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      expect(screen.getByTestId('error')).toHaveTextContent('Failed to fetch subscription');

      // Simulate refetch
      act(() => {
        screen.getByText('Refetch').click();
      });

      expect(mutate).toHaveBeenCalled();
    });
  });

  describe('Authentication States', () => {
    it('should not fetch subscription if user not loaded', () => {
      mockUseAuth.mockReturnValue({
        isSignedIn: false,
        isLoaded: false,
        user: null,
        isOnboarded: false,
      });

      render(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      // SWR should not be called with a key
      expect(useSWR).toHaveBeenCalledWith(
        null,
        expect.any(Function),
        expect.any(Object)
      );
    });

    it('should not fetch subscription if user not signed in', () => {
      mockUseAuth.mockReturnValue({
        isSignedIn: false,
        isLoaded: true,
        user: null,
        isOnboarded: false,
      });

      render(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      expect(useSWR).toHaveBeenCalledWith(
        null,
        expect.any(Function),
        expect.any(Object)
      );
    });

    it('should fetch subscription if user is signed in', () => {
      mockUseAuth.mockReturnValue({
        isSignedIn: true,
        isLoaded: true,
        user: { id: 'user_123' } as any,
        isOnboarded: true,
      });

      render(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      expect(useSWR).toHaveBeenCalledWith(
        '/api/user/subscription',
        expect.any(Function),
        expect.any(Object)
      );
    });
  });

  describe('SWR Configuration', () => {
    it('should use correct SWR options', () => {
      mockUseAuth.mockReturnValue({
        isSignedIn: true,
        isLoaded: true,
        user: { id: 'user_123' } as any,
        isOnboarded: true,
      });

      render(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      expect(useSWR).toHaveBeenCalledWith(
        '/api/user/subscription',
        expect.any(Function),
        expect.objectContaining({
          revalidateOnFocus: false,
          revalidateOnReconnect: true,
          dedupingInterval: 300000,
          errorRetryCount: 2,
          errorRetryInterval: 5000,
        })
      );
    });
  });

  describe('SSE Integration', () => {
    it('should establish SSE connection for trial users with <1 day remaining', () => {
      mockUseAuth.mockReturnValue({
        isSignedIn: true,
        isLoaded: true,
        user: { id: 'user_123' } as any,
        isOnboarded: true,
      });

      const trialSubscription: SubscriptionData = {
        ...mockSubscription,
        isTrialing: true,
        daysRemaining: 0,
      };

      useSWR.mockReturnValue({
        data: trialSubscription,
        error: null,
        isLoading: false,
        mutate: jest.fn(),
      });

      render(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      expect(global.EventSource).toHaveBeenCalledWith('/api/subscription/sse');
    });

    it('should not establish SSE connection for trial users with >1 day remaining', () => {
      mockUseAuth.mockReturnValue({
        isSignedIn: true,
        isLoaded: true,
        user: { id: 'user_123' } as any,
        isOnboarded: true,
      });

      const trialSubscription: SubscriptionData = {
        ...mockSubscription,
        isTrialing: true,
        daysRemaining: 5,
      };

      useSWR.mockReturnValue({
        data: trialSubscription,
        error: null,
        isLoading: false,
        mutate: jest.fn(),
      });

      render(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      expect(global.EventSource).not.toHaveBeenCalled();
    });

    it('should handle SSE messages with authProviderId comparison', () => {
      const mockEventSource = {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        close: jest.fn(),
        onmessage: null,
        onerror: null,
      };

      (global.EventSource as jest.Mock).mockImplementation(() => mockEventSource);

      mockUseAuth.mockReturnValue({
        isSignedIn: true,
        isLoaded: true,
        user: { id: 'user_123' } as any,
        isOnboarded: true,
      });

      const trialSubscription: SubscriptionData = {
        ...mockSubscription,
        isTrialing: true,
        daysRemaining: 0,
      };

      const mutate = jest.fn();

      useSWR.mockReturnValue({
        data: trialSubscription,
        error: null,
        isLoading: false,
        mutate,
      });

      render(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      // Simulate SSE message
      const sseUpdate = {
        authProviderId: 'user_123',
        subscription: {
          planType: 'FREE',
          isActive: true,
          isTrialing: false,
          daysRemaining: 0,
          trialEndsAt: null,
          isGrandfathered: false,
        },
        timestamp: new Date().toISOString(),
      };

      if (mockEventSource.onmessage) {
        mockEventSource.onmessage({ data: JSON.stringify(sseUpdate) } as MessageEvent);
      }

      // Should update cache with correct authProviderId match
      expect(mutate).toHaveBeenCalled();
    });

    it('should close SSE connection on component unmount', () => {
      const mockEventSource = {
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        close: jest.fn(),
        onmessage: null,
        onerror: null,
      };

      (global.EventSource as jest.Mock).mockImplementation(() => mockEventSource);

      mockUseAuth.mockReturnValue({
        isSignedIn: true,
        isLoaded: true,
        user: { id: 'user_123' } as any,
        isOnboarded: true,
      });

      const trialSubscription: SubscriptionData = {
        ...mockSubscription,
        isTrialing: true,
        daysRemaining: 0,
      };

      useSWR.mockReturnValue({
        data: trialSubscription,
        error: null,
        isLoading: false,
        mutate: jest.fn(),
      });

      const { unmount } = render(
        <SubscriptionProvider>
          <TestComponent />
        </SubscriptionProvider>
      );

      unmount();

      expect(mockEventSource.close).toHaveBeenCalled();
    });
  });
});
