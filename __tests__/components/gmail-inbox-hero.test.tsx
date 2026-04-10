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
    p: ({ children, ...props }: any) => <p {...props}>{children}</p>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => children,
  useInView: () => true,
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
    expect(screen.getByText('Summaries That')).toBeInTheDocument();
    expect(screen.getByText('Actually Matter')).toBeInTheDocument();
  });

  it('displays the main heading', () => {
    render(<GmailInboxHero />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('shows metrics section', () => {
    render(<GmailInboxHero />);
    expect(screen.getByText('10 min')).toBeInTheDocument();
    expect(screen.getByText('filing-to-inbox')).toBeInTheDocument();
  });

  it('shows descriptive text', () => {
    render(<GmailInboxHero />);
    expect(screen.getByText(/Transform 300\+ page SEC filings/)).toBeInTheDocument();
  });

  it('handles empty state gracefully', () => {
    render(<GmailInboxHero />);
    
    // Component should render even with no emails initially
    expect(screen.getByText('Summaries That')).toBeInTheDocument();
  });

  it('accepts custom className prop', () => {
    const customClass = 'test-class';
    const { container } = render(<GmailInboxHero className={customClass} />);
    
    expect(container.firstChild).toHaveClass(customClass);
  });
});