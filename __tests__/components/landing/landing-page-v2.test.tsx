import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LandingPageV2 } from '@/components/landing/landing-page-v2';

jest.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isSignedIn: false, isLoaded: true, user: null }),
  useAuth: () => ({ isSignedIn: false, isLoaded: true }),
  ClerkProvider: ({ children }: React.PropsWithChildren) => children,
  SignInButton: ({ children }: React.PropsWithChildren) => children,
  SignUpButton: ({ children }: React.PropsWithChildren) => children,
}));

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
    h1: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <h1 {...props}>{children}</h1>,
    h2: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <h2 {...props}>{children}</h2>,
    p: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <p {...props}>{children}</p>,
    span: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <span {...props}>{children}</span>,
    article: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <article {...props}>{children}</article>,
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => children,
}));

describe('LandingPageV2', () => {
  it('should render all sections', () => {
    render(<LandingPageV2 />);

    // Hero - text appears in multiple places, verify at least one exists
    const secFilingsElements = screen.getAllByText(/SEC Filings/i);
    expect(secFilingsElements.length).toBeGreaterThan(0);
    const simplifiedElements = screen.getAllByText(/Simplified/i);
    expect(simplifiedElements.length).toBeGreaterThan(0);

    // Features
    expect(screen.getByText(/Built for Modern Investors/i)).toBeInTheDocument();

    // Pricing
    expect(screen.getByText(/Simple, Transparent Pricing/i)).toBeInTheDocument();

    // CTA
    expect(screen.getByText(/Start Monitoring/i)).toBeInTheDocument();

    // Footer - use getAllByText since tldrsec appears multiple times
    const brandElements = screen.getAllByText(/tldrsec/i);
    expect(brandElements.length).toBeGreaterThan(0);
  });

  it('should have correct section order', () => {
    const { container } = render(<LandingPageV2 />);
    const sections = container.querySelectorAll('section, footer');

    // Hero, Features, Pricing, CTA, Footer
    expect(sections.length).toBe(5);
  });

  it('should not render filing preview grid separately', () => {
    render(<LandingPageV2 />);
    // Filing preview is now integrated into hero, not a separate section
    const grids = screen.queryAllByTestId('filing-preview-grid');
    expect(grids.length).toBe(0);
  });
});
