import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SummaryPage from '@/app/summary/[id]/page';
import { checkSummaryAccess } from '@/lib/auth/access-control';
import { prisma } from '@/lib/db';
import { currentUser } from '@clerk/nextjs/server';

// Mock the modules
jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn(),
}));

// Mock prisma client properly
jest.mock('@/lib/db', () => ({
  prisma: {
    summary: {
      findUnique: jest.fn()
    },
  },
}));

jest.mock('@/lib/auth/access-control', () => ({
  checkSummaryAccess: jest.fn(),
  AccessDeniedError: class AccessDeniedError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'AccessDeniedError';
    }
  },
  ResourceNotFoundError: class ResourceNotFoundError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'ResourceNotFoundError';
    }
  },
}));

// Mock the components used by the page
jest.mock('@/components/layout/sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar">Sidebar</div>,
}));

jest.mock('@/components/summary/summary-content', () => ({
  SummaryContent: ({ summary }: { summary: any }) => (
    <div data-testid="summary-content">
      Summary Content for {summary.ticker.symbol}
    </div>
  ),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
  notFound: jest.fn(),
}));

// Mock next/link
jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => {
    return <a href={href}>{children}</a>;
  };
});

describe('SummaryPage', () => {
  const mockUser = { id: 'user123', name: 'Test User' };
  const mockSummary = {
    id: 'summary123',
    filingType: '10-K',
    filingDate: new Date('2023-01-15').toISOString(),
    filingUrl: 'https://www.sec.gov/test',
    summaryText: 'Test summary content',
    ticker: {
      id: 'ticker123',
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      userId: 'user123',
      addedAt: new Date().toISOString()
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mocks
    (currentUser as jest.Mock).mockResolvedValue(mockUser);
    (checkSummaryAccess as jest.Mock).mockResolvedValue(true);
    
    // Fix: use .mockResolvedValue() on the jest.fn()
    (prisma.summary.findUnique as jest.Mock).mockResolvedValue(mockSummary);
  });

  it('renders breadcrumb navigation with correct links', async () => {
    const page = await SummaryPage({ params: { id: 'summary123' } });
    render(page);
    
    // Check that breadcrumb links are rendered correctly
    const breadcrumbLinks = screen.getAllByRole('link', { name: /dashboard|summaries/i });
    
    // Dashboard link should point to /dashboard
    expect(breadcrumbLinks[0]).toHaveAttribute('href', '/dashboard');
    expect(breadcrumbLinks[0]).toHaveTextContent('Dashboard');
    
    // Summaries link should point to /dashboard/summaries
    expect(breadcrumbLinks[1]).toHaveAttribute('href', '/dashboard/summaries');
    expect(breadcrumbLinks[1]).toHaveTextContent('Summaries');
    
    // Check that current page is displayed in breadcrumb
    expect(screen.getByText('AAPL: 10-K')).toBeInTheDocument();
  });

  it('shows "Access Denied" breadcrumb when access is denied', async () => {
    // Mock access denied
    (checkSummaryAccess as jest.Mock).mockRejectedValue(
      new (require('@/lib/auth/access-control').AccessDeniedError)('Access denied')
    );
    
    const page = await SummaryPage({ params: { id: 'summary123' } });
    render(page);
    
    // Check for access denied breadcrumb
    const breadcrumbLinks = screen.getAllByRole('link');
    expect(breadcrumbLinks[0]).toHaveAttribute('href', '/dashboard');
    expect(breadcrumbLinks[0]).toHaveTextContent('Dashboard');
    
    // Check that "Access Denied" is displayed in breadcrumb
    expect(screen.getByText('Access Denied')).toBeInTheDocument();
    
    // Check that the access denied message is displayed
    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
    expect(screen.getByText(/you don't have permission/i)).toBeInTheDocument();
  });

  it('displays "Back to dashboard" link and proper heading', async () => {
    const page = await SummaryPage({ params: { id: 'summary123' } });
    render(page);
    
    // Check for back button
    const backLink = screen.getByRole('link', { name: /back to dashboard/i });
    expect(backLink).toHaveAttribute('href', '/dashboard');
    
    // Check for proper heading
    expect(screen.getByRole('heading', { name: /AAPL: 10-K Summary/i })).toBeInTheDocument();
  });

  it('displays original filing link', async () => {
    const page = await SummaryPage({ params: { id: 'summary123' } });
    render(page);
    
    // Check for original filing link
    const filingLink = screen.getByRole('link', { name: /view original filing/i });
    expect(filingLink).toHaveAttribute('href', mockSummary.filingUrl);
    expect(filingLink).toHaveAttribute('target', '_blank');
    expect(filingLink).toHaveAttribute('rel', 'noopener noreferrer');
  });
}); 