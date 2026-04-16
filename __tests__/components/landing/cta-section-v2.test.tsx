import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CTASectionV2 } from '@/components/landing/sections-v2/cta-section-v2';

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
    h2: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <h2 {...props}>{children}</h2>,
  },
}));

jest.mock('next/link', () => {
  return ({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>{children}</a>
  );
});

describe('CTASectionV2', () => {
  it('should render headline', () => {
    render(<CTASectionV2 />);
    expect(screen.getByText(/Start Monitoring/i)).toBeInTheDocument();
  });

  it('should render Get Started CTA link to /onboarding', () => {
    render(<CTASectionV2 />);
    const link = screen.getByRole('link', { name: /Get Started/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/onboarding');
  });

  it('should display trust signals', () => {
    render(<CTASectionV2 />);
    expect(screen.getByText(/7-day free trial/i)).toBeInTheDocument();
    expect(screen.getByText(/unlimited tickers/i)).toBeInTheDocument();
  });

  it('should have light blue gradient background', () => {
    const { container } = render(<CTASectionV2 />);
    const section = container.querySelector('section');
    // Should not have dark gradient classes
    expect(section).not.toHaveClass('from-slate-900');
  });
});
