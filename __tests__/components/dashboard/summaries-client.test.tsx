import React from 'react';
import { render, screen, fireEvent } from '@/__tests__/test-utils';
import { SummariesClient } from '@/components/dashboard/summaries-client';
import '@testing-library/jest-dom';

// Mock next/link
jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => {
    return <a href={href}>{children}</a>;
  };
});

// Create a mock refresh function we can spy on
const mockRefresh = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: mockRefresh,
  }),
}));

const mockSummaries = [
  {
    id: "1",
    filingType: "10-K",
    filingDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    filingUrl: "https://www.sec.gov/example",
    summaryText: "Annual report with strong revenue growth.",
    importance: null,
    smartSubject: null,
    ticker: {
      symbol: "AAPL",
      companyName: "Apple Inc.",
    },
  },
  {
    id: "2",
    filingType: "8-K",
    filingDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    filingUrl: "https://www.sec.gov/example2",
    summaryText: "Current report announcing new CFO.",
    importance: null,
    smartSubject: null,
    ticker: {
      symbol: "MSFT",
      companyName: "Microsoft Corporation",
    },
  },
];

describe('SummariesClient Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<SummariesClient initialSummaries={mockSummaries} />);

    expect(screen.getByPlaceholderText(/Search summaries/i)).toBeInTheDocument();
    expect(screen.getByText('All Filings')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '10-K' })).toBeInTheDocument();
  });

  it('renders empty state when no summaries', () => {
    render(<SummariesClient initialSummaries={[]} />);

    expect(screen.getByText('No summaries found')).toBeInTheDocument();
  });

  it('refreshes when the refresh button is clicked', () => {
    render(<SummariesClient initialSummaries={mockSummaries} />);

    const refreshButton = screen.getByTitle('Refresh summaries');
    mockRefresh.mockClear();
    fireEvent.click(refreshButton);

    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });
});
