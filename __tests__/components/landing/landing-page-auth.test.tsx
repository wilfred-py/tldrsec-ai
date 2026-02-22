import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import {
  authStates,
  subscriptionFixtures,
  makeSubscriptionContext,
} from '../../fixtures/subscription-fixtures';

// Controllable mocks
const mockUseAuth = jest.fn();
const mockUseSubscriptionContext = jest.fn();

jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/contexts/subscription-context', () => ({
  useSubscriptionContext: () => mockUseSubscriptionContext(),
}));

// Mock framer-motion
jest.mock('framer-motion', () => {
  const forwardRefDiv = React.forwardRef(
    (
      { children, variants, initial, animate, whileInView, viewport, transition, whileHover, exit, custom, ...props }: React.PropsWithChildren<Record<string, unknown>>,
      ref
    ) => (
      <div ref={ref as React.Ref<HTMLDivElement>} {...props}>
        {children}
      </div>
    )
  );
  forwardRefDiv.displayName = 'MotionDiv';

  const forwardRefH2 = React.forwardRef(
    (
      { children, variants, initial, animate, whileInView, viewport, transition, ...props }: React.PropsWithChildren<Record<string, unknown>>,
      ref
    ) => (
      <h2 ref={ref as React.Ref<HTMLHeadingElement>} {...props}>
        {children}
      </h2>
    )
  );
  forwardRefH2.displayName = 'MotionH2';

  const forwardRefP = React.forwardRef(
    (
      { children, variants, initial, animate, whileInView, viewport, transition, ...props }: React.PropsWithChildren<Record<string, unknown>>,
      ref
    ) => (
      <p ref={ref as React.Ref<HTMLParagraphElement>} {...props}>
        {children}
      </p>
    )
  );
  forwardRefP.displayName = 'MotionP';

  const forwardRefNav = React.forwardRef(
    (
      { children, initial, animate, exit, transition, ...props }: React.PropsWithChildren<Record<string, unknown>>,
      ref
    ) => (
      <nav ref={ref as React.Ref<HTMLElement>} {...props}>
        {children}
      </nav>
    )
  );
  forwardRefNav.displayName = 'MotionNav';

  return {
    motion: {
      div: forwardRefDiv,
      h2: forwardRefH2,
      p: forwardRefP,
      nav: forwardRefNav,
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useInView: () => true,
  };
});

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

// Mock next/link
jest.mock('next/link', () => {
  function MockLink({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  }
  MockLink.displayName = 'MockLink';
  return MockLink;
});

// Mock sonner
jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

// Mock Sheet components
jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { PricingSectionV2 } from '@/components/landing/sections-v2/pricing-section-v2';

describe('Landing Page Auth-Aware Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================================
  // Pricing Section with subscription context
  // ===========================================================
  describe('PricingSectionV2 personalized behavior', () => {
    it('Scenario 1: unauthenticated - all CTAs show "Get Started"', () => {
      mockUseAuth.mockReturnValue(authStates.unauthenticated);
      mockUseSubscriptionContext.mockReturnValue(
        makeSubscriptionContext(subscriptionFixtures.noSubscription)
      );

      render(<PricingSectionV2 />);

      const buttons = screen.getAllByRole('button');
      const getStartedButtons = buttons.filter(
        (btn) => btn.textContent?.includes('Get Started')
      );
      // All 3 plans should show "Get Started" for unauthenticated
      expect(getStartedButtons.length).toBe(3);
    });

    it('Scenario 2: authenticated not onboarded - CTAs show "Complete Setup"', () => {
      mockUseAuth.mockReturnValue(authStates.authenticatedNotOnboarded);
      mockUseSubscriptionContext.mockReturnValue(
        makeSubscriptionContext(subscriptionFixtures.noSubscription)
      );

      render(<PricingSectionV2 />);

      const buttons = screen.getAllByRole('button');
      const setupButtons = buttons.filter(
        (btn) => btn.textContent?.includes('Complete Setup')
      );
      expect(setupButtons.length).toBe(3);
    });

    it('Scenario 3: FREE trial active - FREE shows "Current Plan" badge', () => {
      mockUseAuth.mockReturnValue(authStates.authenticatedOnboarded);
      mockUseSubscriptionContext.mockReturnValue(
        makeSubscriptionContext(subscriptionFixtures.freeTrialActive)
      );

      render(<PricingSectionV2 />);

      // FREE plan should have Current Plan badge
      const statusBadge = screen.getByRole('status');
      expect(statusBadge).toHaveTextContent('Current Plan');

      // FREE plan button should be disabled
      const currentPlanBtn = screen.getByRole('button', { name: /Current Plan/i });
      expect(currentPlanBtn).toBeDisabled();

      // PRO and MAX should have active upgrade CTAs
      expect(screen.getByRole('button', { name: /Upgrade to Pro/i })).toBeEnabled();
      expect(screen.getByRole('button', { name: /Upgrade to Max/i })).toBeEnabled();
    });

    it('Scenario 4: PRO active - PRO shows "Current Plan" badge', () => {
      mockUseAuth.mockReturnValue(authStates.authenticatedOnboarded);
      mockUseSubscriptionContext.mockReturnValue(
        makeSubscriptionContext(subscriptionFixtures.proActive)
      );

      render(<PricingSectionV2 />);

      const statusBadge = screen.getByRole('status');
      expect(statusBadge).toHaveTextContent('Current Plan');

      // PRO button should be disabled
      const currentPlanBtn = screen.getByRole('button', { name: /Current Plan/i });
      expect(currentPlanBtn).toBeDisabled();

      // MAX should still have upgrade CTA
      expect(screen.getByRole('button', { name: /Upgrade to Max/i })).toBeEnabled();
    });

    it('Scenario 5: MAX active - MAX shows "Current Plan" badge', () => {
      mockUseAuth.mockReturnValue(authStates.authenticatedOnboarded);
      mockUseSubscriptionContext.mockReturnValue(
        makeSubscriptionContext(subscriptionFixtures.maxActive)
      );

      render(<PricingSectionV2 />);

      const statusBadge = screen.getByRole('status');
      expect(statusBadge).toHaveTextContent('Current Plan');

      // MAX button should be disabled
      const currentPlanBtn = screen.getByRole('button', { name: /Current Plan/i });
      expect(currentPlanBtn).toBeDisabled();
    });

    it('Scenario 6: grandfathered FREE - FREE shows "Current Plan" badge', () => {
      mockUseAuth.mockReturnValue(authStates.authenticatedOnboarded);
      mockUseSubscriptionContext.mockReturnValue(
        makeSubscriptionContext(subscriptionFixtures.freeGrandfathered)
      );

      render(<PricingSectionV2 />);

      const statusBadge = screen.getByRole('status');
      expect(statusBadge).toHaveTextContent('Current Plan');
    });

    it('shows error banner when subscription fetch fails', () => {
      mockUseAuth.mockReturnValue(authStates.authenticatedOnboarded);
      mockUseSubscriptionContext.mockReturnValue(
        makeSubscriptionContext(null, { error: 'Network error' })
      );

      render(<PricingSectionV2 />);

      expect(
        screen.getByText(/Unable to load subscription status/i)
      ).toBeInTheDocument();
    });

    it('does not show error banner for unauthenticated users', () => {
      mockUseAuth.mockReturnValue(authStates.unauthenticated);
      mockUseSubscriptionContext.mockReturnValue(
        makeSubscriptionContext(null, { error: 'Network error' })
      );

      render(<PricingSectionV2 />);

      expect(
        screen.queryByText(/Unable to load subscription status/i)
      ).not.toBeInTheDocument();
    });

    it('shows loading skeletons while subscription is loading', () => {
      mockUseAuth.mockReturnValue(authStates.authenticatedOnboarded);
      mockUseSubscriptionContext.mockReturnValue(
        makeSubscriptionContext(null, { loading: true })
      );

      render(<PricingSectionV2 />);

      // No CTA buttons should be visible during loading (replaced by skeletons)
      expect(
        screen.queryByRole('button', { name: /Current Plan/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Get Started/i })
      ).not.toBeInTheDocument();
    });
  });
});
