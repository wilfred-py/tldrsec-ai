import React from 'react';
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

jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSignedIn: false, isLoaded: true, user: null }),
  AuthProvider: ({ children }: React.PropsWithChildren) => children,
}));

jest.mock('@/contexts/subscription-context', () => ({
  SubscriptionProvider: ({ children }: React.PropsWithChildren) => children,
  useSubscriptionContext: () => ({ tier: 'FREE', isLoading: false, isSubscribed: false }),
}));

jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <div {...props}>{children}</div>,
    h1: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <h1 {...props}>{children}</h1>,
    h2: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <h2 {...props}>{children}</h2>,
    p: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <p {...props}>{children}</p>,
    span: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <span {...props}>{children}</span>,
    article: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <article {...props}>{children}</article>,
    section: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <section {...props}>{children}</section>,
    nav: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <nav {...props}>{children}</nav>,
    button: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <button {...props}>{children}</button>,
    a: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <a {...props}>{children}</a>,
    footer: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <footer {...props}>{children}</footer>,
    ul: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <ul {...props}>{children}</ul>,
    li: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <li {...props}>{children}</li>,
    img: (props: Record<string, unknown>) => <img {...props} />,
    header: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => <header {...props}>{children}</header>,
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => children,
  useInView: () => true,
  useReducedMotion: () => false,
  useAnimation: () => ({ start: jest.fn(), stop: jest.fn() }),
  useMotionValue: () => ({ get: () => 0, set: jest.fn() }),
  useTransform: () => ({ get: () => 0 }),
}));

// Mock animations module
jest.mock('@/lib/animations/landing-animations', () => ({
  staggerContainer: {},
  staggerItem: {},
  meshGradientStyle: {},
  fadeInUp: {},
  fadeIn: {},
}));

// Mock Sheet components from shadcn/ui
jest.mock('@/components/ui/sheet', () => ({
  Sheet: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  SheetTrigger: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  SheetContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  SheetClose: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

describe('LandingPageV2', () => {
  it('should render all sections', () => {
    render(<LandingPageV2 />);

    // Hero - verify key marketing copy renders
    expect(screen.getByText(/SEC filings, read/i)).toBeInTheDocument();
    expect(screen.getByText(/in 10 minutes instead of 10 hours/i)).toBeInTheDocument();

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
