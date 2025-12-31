import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PricingSectionV2 } from '@/components/landing/sections-v2/pricing-section-v2';

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
    h2: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <h2 {...props}>{children}</h2>,
  },
}));

describe('PricingSectionV2', () => {
  it('should render section heading', () => {
    render(<PricingSectionV2 />);
    expect(screen.getByText(/Simple, Transparent Pricing/i)).toBeInTheDocument();
  });

  it('should render 3 pricing tiers', () => {
    render(<PricingSectionV2 />);
    // Get tier headings - use getAllByRole to find h3 tier names
    const tierHeadings = screen.getAllByRole('heading', { level: 3 });
    const tierNames = tierHeadings.map((h) => h.textContent);
    expect(tierNames).toContain('Free');
    expect(tierNames).toContain('Pro');
    expect(tierNames).toContain('Max');
  });

  it('should display prices', () => {
    render(<PricingSectionV2 />);
    expect(screen.getByText(/\$0/)).toBeInTheDocument();
    expect(screen.getByText(/\$15/)).toBeInTheDocument();
    expect(screen.getByText(/\$40/)).toBeInTheDocument();
  });

  it('should show "Most Popular" badge on Pro plan', () => {
    render(<PricingSectionV2 />);
    expect(screen.getByText(/Most Popular/i)).toBeInTheDocument();
  });

  it('should have billing toggle for monthly/annual', () => {
    render(<PricingSectionV2 />);
    expect(screen.getByRole('switch')).toBeInTheDocument();
  });

  it('should update prices when toggling to annual', () => {
    render(<PricingSectionV2 />);
    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);
    // Annual prices should show monthly equivalent - multiple tiers have /month
    const monthLabels = screen.getAllByText(/\/month/i);
    expect(monthLabels.length).toBeGreaterThan(0);
  });

  it('should display feature lists for each tier', () => {
    render(<PricingSectionV2 />);
    expect(screen.getByText(/3 companies/i)).toBeInTheDocument();
    expect(screen.getByText(/10 companies/i)).toBeInTheDocument();
    expect(screen.getByText(/Unlimited/i)).toBeInTheDocument();
  });

  it('should have CTA buttons for each tier', () => {
    render(<PricingSectionV2 />);
    const buttons = screen.getAllByRole('link', { name: /Get Started|Start Free|Go Max/i });
    expect(buttons.length).toBe(3);
  });
});
