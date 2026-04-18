import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GmailInboxHero } from '@/components/landing/sections-v2/gmail-inbox-hero';

// Mock Clerk
jest.mock('@clerk/nextjs', () => ({
  useUser: () => ({ isSignedIn: false, isLoaded: true, user: null }),
  useAuth: () => ({ isSignedIn: false, isLoaded: true }),
}));

// Mock auth context (component uses useAuth from @/contexts/auth-context)
jest.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ isSignedIn: false, isLoaded: true, user: null }),
}));

// Mock framer-motion to avoid animation complexity in tests
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    section: ({ children, ...props }: any) => <section {...props}>{children}</section>,
    h1: ({ children, ...props }: any) => <h1 {...props}>{children}</h1>,
    h2: ({ children, ...props }: any) => <h2 {...props}>{children}</h2>,
    p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    button: ({ children, ...props }: any) => {
      const { initial, animate, transition, whileHover, whileTap, onMouseEnter, onMouseLeave, variants, ...rest } = props;
      return <button {...rest}>{children}</button>;
    },
  },
  AnimatePresence: ({ children }: any) => children,
  useInView: () => true,
  useReducedMotion: () => false,
}));

// Mock next/link
jest.mock('next/link', () => {
  return ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  );
});

describe('GmailInboxHero', () => {
  it('renders without crashing', () => {
    render(<GmailInboxHero />);
    expect(screen.getByText(/SEC filings, read/i)).toBeInTheDocument();
    expect(screen.getByText(/in minutes instead of hours/i)).toBeInTheDocument();
  });

  it('displays the main heading', () => {
    render(<GmailInboxHero />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('shows metrics section', () => {
    render(<GmailInboxHero />);
    expect(screen.getByText('filing-to-inbox')).toBeInTheDocument();
    expect(screen.getByText(/of SEC filings/i)).toBeInTheDocument();
  });

  it('shows descriptive text', () => {
    render(<GmailInboxHero />);
    expect(screen.getByText(/AI summaries of every 10-K/i)).toBeInTheDocument();
  });

  it('handles empty state gracefully', () => {
    render(<GmailInboxHero />);

    // Component should render even with no emails initially
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('accepts custom className prop', () => {
    const customClass = 'test-class';
    const { container } = render(<GmailInboxHero className={customClass} />);

    expect(container.firstChild).toHaveClass(customClass);
  });
});