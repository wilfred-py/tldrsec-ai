import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { HeroSectionV2 } from '@/components/landing/sections-v2/hero-section-v2';

// Mock auth context (component now uses useAuth)
jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSignedIn: false, isLoaded: true, user: null }),
}));

// Mock analytics (uses Clerk useUser + Next navigation hooks under the hood)
jest.mock('@/lib/hooks/use-analytics', () => ({
  useAnalytics: () => ({
    trackEvent: jest.fn(),
    trackRaw: jest.fn(),
    trackPageView: jest.fn(),
    identifyUser: jest.fn(),
  }),
}));

// Mock framer-motion to avoid animation issues in tests
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
    h1: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <h1 {...props}>{children}</h1>,
    p: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <p {...props}>{children}</p>,
    span: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => children,
}));

describe('HeroSectionV2', () => {
  // Test 1: Renders headline with gradient text
  it('should render headline with "SEC Filings, Simplified" text', () => {
    render(<HeroSectionV2 />);
    const headings = screen.getAllByText(/SEC Filings/i);
    expect(headings.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Simplified/i)).toBeInTheDocument();
  });

  // Test 2: Primary CTA is visible and links to sign-up
  it('should render primary CTA linking to sign-up', () => {
    render(<HeroSectionV2 />);
    const primaryCTA = screen.getByRole('link', { name: /Start Free Trial/i });
    expect(primaryCTA).toBeInTheDocument();
    expect(primaryCTA).toHaveAttribute('href', '/sign-up');
  });

  // Test 4: Secondary CTA links to pricing
  it('should render secondary CTA linking to pricing', () => {
    render(<HeroSectionV2 />);
    const secondaryCTA = screen.getByRole('link', { name: /View Pricing/i });
    expect(secondaryCTA).toBeInTheDocument();
    expect(secondaryCTA).toHaveAttribute('href', '#pricing');
  });

  // Test 5: Trust metrics are displayed
  it('should display trust metrics with specific values', () => {
    render(<HeroSectionV2 />);
    expect(screen.getByText(/10 min/i)).toBeInTheDocument();
    expect(screen.getByText(/filing-to-inbox/i)).toBeInTheDocument();
    expect(screen.getByText(/99\.9%/i)).toBeInTheDocument();
    expect(screen.getByText(/All types/i)).toBeInTheDocument();
  });

  // Test 6: Filing preview card is rendered
  it('should render filing preview card with company info', () => {
    render(<HeroSectionV2 />);
    // Should show a sample filing (Apple 10-K)
    expect(screen.getByText(/Apple/i)).toBeInTheDocument();
    expect(screen.getByText(/10-K/i)).toBeInTheDocument();
  });

  // Test 7: Free trial message is visible
  it('should display trust signal about free trial', () => {
    render(<HeroSectionV2 />);
    expect(screen.getByText(/7-day free trial/i)).toBeInTheDocument();
  });

  // Test 8: Uses light background (not dark)
  it('should have light background styling', () => {
    const { container } = render(<HeroSectionV2 />);
    const section = container.querySelector('section');
    expect(section).not.toHaveClass('bg-slate-900');
    expect(section).not.toHaveClass('from-slate-900');
  });

  // Test 9: Two-column layout on desktop
  it('should have two-column grid layout', () => {
    const { container } = render(<HeroSectionV2 />);
    const grid = container.querySelector('.lg\\:grid-cols-2');
    expect(grid).toBeInTheDocument();
  });

  // Test 10: Subheadline explains value proposition
  it('should have subheadline explaining the value', () => {
    render(<HeroSectionV2 />);
    expect(screen.getByText(/Transform.*page.*documents/i)).toBeInTheDocument();
  });
});
