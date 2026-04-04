import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { HeroSectionV2 } from '@/components/landing/sections-v2/hero-section-v2';

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
    expect(screen.getByText(/SEC Filings/i)).toBeInTheDocument();
    expect(screen.getByText(/Simplified/i)).toBeInTheDocument();
  });

  // Test 2: Has badge above headline
  it('should render AI-Powered badge above headline', () => {
    render(<HeroSectionV2 />);
    expect(screen.getByText(/AI-Powered/i)).toBeInTheDocument();
  });

  // Test 3: Primary CTA is visible and links to sign-up
  it('should render primary CTA linking to sign-up', () => {
    render(<HeroSectionV2 />);
    const primaryCTA = screen.getByRole('link', { name: /Start Free Trial/i });
    expect(primaryCTA).toBeInTheDocument();
    expect(primaryCTA).toHaveAttribute('href', '/onboarding');
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
    expect(screen.getByText(/2,500\+/i)).toBeInTheDocument();
    expect(screen.getByText(/investors/i)).toBeInTheDocument();
    expect(screen.getByText(/99\.9%/i)).toBeInTheDocument();
    expect(screen.getByText(/<5 min/i)).toBeInTheDocument();
  });

  // Test 6: Filing preview card is rendered
  it('should render filing preview card with company info', () => {
    render(<HeroSectionV2 />);
    // Should show a sample filing (Apple 10-K)
    expect(screen.getByText(/Apple/i)).toBeInTheDocument();
    expect(screen.getByText(/10-K/i)).toBeInTheDocument();
  });

  // Test 7: No credit card message is visible
  it('should display trust signal about no credit card', () => {
    render(<HeroSectionV2 />);
    expect(screen.getByText(/No credit card required/i)).toBeInTheDocument();
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
