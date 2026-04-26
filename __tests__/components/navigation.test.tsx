import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

// Navigation renders the NavLink helper row on non-auth pages. We render in the
// authenticated-on-homepage state so the full nav (Features + Pricing) shows.
// The regression we're guarding against: a future change re-adds /changelog
// or /contact links to dead routes, which caused a 404 GSC error category.

const mockUseAuthContext = jest.fn();
jest.mock('@/lib/context/auth-context', () => ({
  useAuthContext: () => mockUseAuthContext(),
}));

const mockUsePathname = jest.fn();
jest.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

jest.mock('next/link', () => {
  function MockLink({ children, href, ...props }: React.PropsWithChildren<{ href: string }>) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  }
  MockLink.displayName = 'MockLink';
  return MockLink;
});

import { Navigation } from '@/components/navigation';

describe('Navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuthContext.mockReturnValue({ isAuthenticated: false, isLoading: false });
    mockUsePathname.mockReturnValue('/');
  });

  it('does not render a link to /changelog', () => {
    render(<Navigation />);
    const hrefs = screen
      .getAllByRole('link')
      .map((el) => el.getAttribute('href'));
    expect(hrefs).not.toContain('/changelog');
  });

  it('does not render a link to /contact', () => {
    render(<Navigation />);
    const hrefs = screen
      .getAllByRole('link')
      .map((el) => el.getAttribute('href'));
    expect(hrefs).not.toContain('/contact');
  });

  it('does not include the text "Changelog" or "Contact" anywhere', () => {
    render(<Navigation />);
    expect(screen.queryByText(/changelog/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^contact$/i)).not.toBeInTheDocument();
  });

  it('renders only known nav links on non-auth pages', () => {
    render(<Navigation />);
    const hrefs = screen
      .getAllByRole('link')
      .map((el) => el.getAttribute('href'))
      .filter((h): h is string => typeof h === 'string');

    // Expect only the known set: home (logo), #features, #pricing, /sign-up
    const allowed = new Set(['/', '#features', '#pricing', '/sign-up', '/dashboard']);
    for (const href of hrefs) {
      expect(allowed.has(href)).toBe(true);
    }
  });

  it('hides the Features/Pricing row on /sign-in', () => {
    mockUsePathname.mockReturnValue('/sign-in');
    render(<Navigation />);
    expect(screen.queryByText('Features')).not.toBeInTheDocument();
    expect(screen.queryByText('Pricing')).not.toBeInTheDocument();
  });
});
