import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import {
  authStates,
  subscriptionFixtures,
  makeSubscriptionContext,
} from '../fixtures/subscription-fixtures';

// Controllable mocks
const mockUseAuth = jest.fn();
const mockUseSubscriptionContext = jest.fn();

jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/contexts/subscription-context', () => ({
  useSubscriptionContext: () => mockUseSubscriptionContext(),
}));

// Comprehensive framer-motion mock
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
      nav: forwardRefNav,
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useInView: () => true,
  };
});

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

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

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { LandingNavbar } from '@/components/landing/landing-navbar';
import { PricingSectionV2 } from '@/components/landing/sections-v2/pricing-section-v2';

/**
 * E2E-style user journey tests
 *
 * These test the navbar + pricing section together per user state,
 * validating the full experience a user would see on the landing page.
 */
describe('Landing Page User Journeys', () => {
  let heroRef: React.RefObject<HTMLElement | null>;

  beforeEach(() => {
    jest.clearAllMocks();
    heroRef = { current: document.createElement('section') };
  });

  it('Journey 1: New visitor sees marketing experience', () => {
    mockUseAuth.mockReturnValue(authStates.unauthenticated);
    mockUseSubscriptionContext.mockReturnValue(
      makeSubscriptionContext(subscriptionFixtures.noSubscription)
    );

    render(
      <>
        <LandingNavbar heroRef={heroRef} />
        <PricingSectionV2 />
      </>
    );

    // Navbar hidden initially for unauthenticated (no scroll trigger)
    expect(screen.queryByText('tldrSEC')).not.toBeInTheDocument();

    // Pricing section renders with all tiers
    expect(screen.getByText(/Simple, Transparent Pricing/i)).toBeInTheDocument();

    // All CTAs say "Get Started"
    const getStartedBtns = screen.getAllByRole('button').filter(
      (btn) => btn.textContent?.includes('Get Started')
    );
    expect(getStartedBtns.length).toBe(3);

    // No "Current Plan" badges
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('Journey 2: Returning FREE user sees personalized experience', () => {
    mockUseAuth.mockReturnValue(authStates.authenticatedOnboarded);
    mockUseSubscriptionContext.mockReturnValue(
      makeSubscriptionContext(subscriptionFixtures.freeTrialActive)
    );

    render(
      <>
        <LandingNavbar heroRef={heroRef} />
        <PricingSectionV2 />
      </>
    );

    // Navbar visible immediately for authenticated users
    expect(screen.getByText('tldrSEC')).toBeInTheDocument();

    // Navbar CTA shows "Go to Dashboard" (desktop + mobile)
    const dashboardLinks = screen.getAllByText('Go to Dashboard');
    expect(dashboardLinks.length).toBeGreaterThanOrEqual(1);

    // FREE card shows "Current Plan" badge
    const statusBadge = screen.getByRole('status');
    expect(statusBadge).toHaveTextContent('Current Plan');

    // PRO and MAX have upgrade CTAs
    expect(screen.getByRole('button', { name: /Upgrade to Pro/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Upgrade to Max/i })).toBeEnabled();
  });

  it('Journey 3: PRO subscriber sees PRO as current plan', () => {
    mockUseAuth.mockReturnValue(authStates.authenticatedOnboarded);
    mockUseSubscriptionContext.mockReturnValue(
      makeSubscriptionContext(subscriptionFixtures.proActive)
    );

    render(
      <>
        <LandingNavbar heroRef={heroRef} />
        <PricingSectionV2 />
      </>
    );

    // Navbar shows dashboard link (desktop + mobile)
    const dashLinks = screen.getAllByText('Go to Dashboard');
    expect(dashLinks.length).toBeGreaterThanOrEqual(1);

    // PRO card is current plan (disabled)
    const currentPlanBtn = screen.getByRole('button', { name: /Current Plan/i });
    expect(currentPlanBtn).toBeDisabled();

    // MAX shows upgrade CTA
    expect(screen.getByRole('button', { name: /Upgrade to Max/i })).toBeEnabled();
  });

  it('Journey 4: Trial ending soon shows warning badge', () => {
    mockUseAuth.mockReturnValue(authStates.authenticatedOnboarded);
    mockUseSubscriptionContext.mockReturnValue(
      makeSubscriptionContext(subscriptionFixtures.freeTrialEndingSoon)
    );

    render(
      <>
        <LandingNavbar heroRef={heroRef} />
        <PricingSectionV2 />
      </>
    );

    // Trial Ending Soon badge should be visible
    const statusBadge = screen.getByRole('status');
    expect(statusBadge).toHaveTextContent('Trial Ending Soon');

    // Button should also say "Trial Ending Soon"
    const trialBtn = screen.getByRole('button', { name: /Trial Ending Soon/i });
    expect(trialBtn).toBeDisabled();
  });
});

/**
 * QA Manual Test Data Setup
 *
 * Documents how QA can configure their test environment for manual testing.
 * Each scenario describes the account state needed.
 */
describe.skip('QA Manual Test Data Setup', () => {
  it('documents test accounts for each scenario', () => {
    // Scenario 1: Unauthenticated
    // - Use incognito/private browser window
    // - Navigate to https://tldrsec.app
    // - Verify: no navbar, "No credit card required" caption, all "Get Started" CTAs

    // Scenario 2: Authenticated, not onboarded
    // - Create new account at /sign-up
    // - Do NOT complete onboarding flow
    // - Navigate back to landing page
    // - Verify: navbar visible, "Just one more step!" caption, "Complete Setup" CTAs

    // Scenario 3: FREE trial (active)
    // - Create account and complete onboarding
    // - Auto-enrolled in 7-day free trial
    // - Navigate to landing page
    // - Verify: navbar visible, no caption, FREE card shows "Current Plan"

    // Scenario 4: PRO subscriber
    // - From Scenario 3, go to /subscribe
    // - Use test Stripe card: 4242 4242 4242 4242 (any expiry, any CVC)
    // - Subscribe to PRO plan
    // - Navigate to landing page
    // - Verify: PRO card shows "Current Plan", FREE/MAX show upgrade CTAs

    // Scenario 5: MAX subscriber
    // - Same as Scenario 4 but select MAX plan
    // - Verify: MAX card shows "Current Plan"

    // Scenario 6: Grandfathered FREE
    // - Use pre-migration test account (ask admin for credentials)
    // - Verify: FREE card shows "Current Plan", no trial badge

    expect(true).toBe(true);
  });
});
