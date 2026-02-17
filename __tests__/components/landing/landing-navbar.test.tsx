import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { authStates } from '../../fixtures/subscription-fixtures';

// Track the mock return value so we can change it per test
const mockUseAuth = jest.fn();

jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

// Mock framer-motion - filter animation-specific props
jest.mock('framer-motion', () => ({
  motion: {
    nav: React.forwardRef(
      (
        { children, initial, animate, exit, transition, ...props }: React.PropsWithChildren<Record<string, unknown>>,
        ref
      ) => (
        <nav ref={ref as React.Ref<HTMLElement>} {...props}>
          {children}
        </nav>
      )
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Mock next/link
jest.mock('next/link', () => {
  return ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  );
});

// Mock Sheet components (shadcn/ui)
jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { LandingNavbar } from '@/components/landing/landing-navbar';

describe('LandingNavbar', () => {
  let heroRef: React.RefObject<HTMLElement | null>;

  beforeEach(() => {
    jest.clearAllMocks();
    heroRef = { current: document.createElement('section') };
  });

  describe('loading state', () => {
    it('returns null when auth is not loaded', () => {
      mockUseAuth.mockReturnValue(authStates.loading);

      const { container } = render(<LandingNavbar heroRef={heroRef} />);
      expect(container.innerHTML).toBe('');
    });
  });

  describe('unauthenticated user', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue(authStates.unauthenticated);
    });

    it('navbar is hidden initially (before scroll)', () => {
      render(<LandingNavbar heroRef={heroRef} />);
      // Navbar uses isVisible state which starts false for unauthenticated
      // Since IntersectionObserver mock doesn't trigger callback by default,
      // navbar should not render navigation content
      expect(screen.queryByText('tldrSEC')).not.toBeInTheDocument();
    });

    it('shows "Get Started" CTA linking to /sign-up after scroll', () => {
      // Make the observer trigger with isIntersecting: false (scrolled past hero)
      const observerCallback = jest.fn();
      const mockObserver = jest.fn().mockImplementation((cb) => {
        observerCallback.mockImplementation(cb);
        return {
          observe: () => {
            // Simulate scrolling past hero immediately
            cb([{ isIntersecting: false }]);
          },
          disconnect: jest.fn(),
          unobserve: jest.fn(),
        };
      });
      global.IntersectionObserver = mockObserver as unknown as typeof IntersectionObserver;

      render(<LandingNavbar heroRef={heroRef} />);

      expect(screen.getByText('Get Started')).toBeInTheDocument();
      expect(screen.getByText('Get Started').closest('a')).toHaveAttribute(
        'href',
        '/sign-up'
      );
    });
  });

  describe('authenticated, not onboarded', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue(authStates.authenticatedNotOnboarded);
    });

    it('navbar is always visible (bypasses observer)', () => {
      render(<LandingNavbar heroRef={heroRef} />);
      expect(screen.getByText('tldrSEC')).toBeInTheDocument();
    });

    it('shows "Complete Setup" CTA linking to /onboarding', () => {
      render(<LandingNavbar heroRef={heroRef} />);
      expect(screen.getByText('Complete Setup')).toBeInTheDocument();
      expect(screen.getByText('Complete Setup').closest('a')).toHaveAttribute(
        'href',
        '/onboarding'
      );
    });
  });

  describe('authenticated and onboarded', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue(authStates.authenticatedOnboarded);
    });

    it('navbar is always visible (bypasses observer)', () => {
      render(<LandingNavbar heroRef={heroRef} />);
      expect(screen.getByText('tldrSEC')).toBeInTheDocument();
    });

    it('shows "Go to Dashboard" CTA linking to /dashboard', () => {
      render(<LandingNavbar heroRef={heroRef} />);
      expect(screen.getByText('Go to Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Go to Dashboard').closest('a')).toHaveAttribute(
        'href',
        '/dashboard'
      );
    });

    it('renders navigation links (Features, Pricing)', () => {
      render(<LandingNavbar heroRef={heroRef} />);
      expect(screen.getAllByText('Features').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Pricing').length).toBeGreaterThan(0);
    });
  });
});
