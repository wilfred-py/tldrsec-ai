import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

// Mock auth and subscription contexts (unauthenticated defaults)
jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({
    isSignedIn: false,
    isLoaded: true,
    isOnboarded: false,
    user: null,
  }),
}));

jest.mock('@/contexts/subscription-context', () => ({
  useSubscriptionContext: () => ({
    subscription: null,
    loading: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
    h2: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <h2 {...props}>{children}</h2>,
    span: React.forwardRef(({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>, ref: unknown) => <span {...(props as object)}>{children}</span>),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

import { PricingSectionV2 } from '@/components/landing/sections-v2/pricing-section-v2';

describe('PricingSectionV2', () => {
  it('should render section heading', () => {
    render(<PricingSectionV2 />);
    expect(screen.getByText(/Simple, Transparent Pricing/i)).toBeInTheDocument();
  });

  it('should render 2 pricing tiers (Pro and Max)', () => {
    render(<PricingSectionV2 />);
    const tierHeadings = screen.getAllByRole('heading', { level: 3 });
    const tierNames = tierHeadings.map((h) => h.textContent);
    expect(tierNames).toContain('Pro');
    expect(tierNames).toContain('Max');
    expect(tierNames).not.toContain('Trial');
  });

  it('should display prices for all tiers', () => {
    render(<PricingSectionV2 />);
    // PRO tier shows $199
    expect(screen.getByText('$199')).toBeInTheDocument();
    // MAX tier shows $349
    expect(screen.getByText('$349')).toBeInTheDocument();
  });

  it('should show "Popular" badge on Pro plan', () => {
    render(<PricingSectionV2 />);
    expect(screen.getByText('Popular')).toBeInTheDocument();
  });

  it('should have billing toggle', () => {
    render(<PricingSectionV2 />);
    // Toggle is a switch with aria-label
    expect(
      screen.getByRole('switch', { name: /switch to annual billing/i })
    ).toBeInTheDocument();
  });

  it('should update prices when toggling to annual', () => {
    render(<PricingSectionV2 />);
    const toggle = screen.getByRole('switch', { name: /switch to annual billing/i });
    fireEvent.click(toggle);
    // Annual prices shown via NumberFlow mock (Intl.NumberFormat)
    expect(screen.getByText('$1,990')).toBeInTheDocument();
    expect(screen.getByText('$3,490')).toBeInTheDocument();
  });

  it('should display feature lists for each tier', () => {
    render(<PricingSectionV2 />);
    // Only MAX has unlimited companies now
    expect(screen.getAllByText(/Unlimited/i).length).toBeGreaterThanOrEqual(1);
    // PRO: "25" in bold (rendered within <strong>)
    expect(screen.getByText('25')).toBeInTheDocument();
  });

  it('should have CTA buttons for each tier (unauthenticated shows "Start Free Trial")', () => {
    render(<PricingSectionV2 />);
    const buttons = screen.getAllByRole('button').filter(
      (btn) => btn.textContent?.includes('Start Free Trial')
    );
    expect(buttons.length).toBe(2);
  });

  describe('hover toggle between cards', () => {
    it('highlights Max and un-highlights Pro when hovering Max', () => {
      render(<PricingSectionV2 />);
      const cards = screen.getAllByRole('article');
      const proCard = cards[0];
      const maxCard = cards[1];

      // Pro is highlighted by default (popular)
      expect(proCard.getAttribute('data-highlighted')).toBe('true');
      expect(maxCard.getAttribute('data-highlighted')).toBe('false');

      // Hover Max
      fireEvent.mouseEnter(maxCard);
      expect(maxCard.getAttribute('data-highlighted')).toBe('true');
      expect(proCard.getAttribute('data-highlighted')).toBe('false');
    });

    it('reverts to clicked state when hover ends', () => {
      render(<PricingSectionV2 />);
      const cards = screen.getAllByRole('article');
      const proCard = cards[0];
      const maxCard = cards[1];

      // Hover Max, then leave
      fireEvent.mouseEnter(maxCard);
      fireEvent.mouseLeave(maxCard);

      // Pro should be highlighted again (default click selection)
      expect(proCard.getAttribute('data-highlighted')).toBe('true');
      expect(maxCard.getAttribute('data-highlighted')).toBe('false');
    });

    it('click and hover are independent — hover temporarily overrides, click persists', () => {
      render(<PricingSectionV2 />);
      const cards = screen.getAllByRole('article');
      const proCard = cards[0];
      const maxCard = cards[1];

      // Click Max to select it
      fireEvent.click(maxCard);
      expect(maxCard.getAttribute('data-highlighted')).toBe('true');
      expect(proCard.getAttribute('data-highlighted')).toBe('false');

      // Hover Pro — temporarily overrides
      fireEvent.mouseEnter(proCard);
      expect(proCard.getAttribute('data-highlighted')).toBe('true');
      expect(maxCard.getAttribute('data-highlighted')).toBe('false');

      // Leave hover — Max is still the clicked selection
      fireEvent.mouseLeave(proCard);
      expect(maxCard.getAttribute('data-highlighted')).toBe('true');
      expect(proCard.getAttribute('data-highlighted')).toBe('false');
    });
  });
});
