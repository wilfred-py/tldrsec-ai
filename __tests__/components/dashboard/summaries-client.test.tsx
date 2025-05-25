import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@/__tests__/test-utils';
import { SummariesClient } from '@/components/dashboard/summaries-client';
import '@testing-library/jest-dom';
import { ApiResponse } from '@/lib/api/types';

// Mock the getRecentSummaries function
jest.mock('@/lib/api/summary-service', () => ({
  getRecentSummaries: jest.fn(() => Promise.resolve([
    {
      id: "1",
      filingType: "10-K",
      filingDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      filingUrl: "https://www.sec.gov/example",
      summaryText: "Annual report with strong revenue growth.",
      createdAt: new Date().toISOString(),
      tickerId: "t1",
      ticker: {
        id: "t1",
        symbol: "AAPL",
        companyName: "Apple Inc.",
        userId: "user1",
        addedAt: new Date().toISOString()
      }
    },
    {
      id: "2",
      filingType: "8-K",
      filingDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
      filingUrl: "https://www.sec.gov/example2",
      summaryText: "Current report announcing new CFO.",
      createdAt: new Date().toISOString(),
      tickerId: "t2",
      ticker: {
        id: "t2",
        symbol: "MSFT",
        companyName: "Microsoft Corporation",
        userId: "user1",
        addedAt: new Date().toISOString()
      }
    }
  ])),
  SummaryWithTicker: {} // Just to satisfy the import
}));

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

// Mock useAsync hook
const mockExecute = jest.fn((asyncFn) => asyncFn().then((response: ApiResponse<any>) => ({
  success: true,
  data: response.data
})));

jest.mock('@/lib/hooks/use-async', () => ({
  useAsync: () => ({
    data: null,
    isLoading: false,
    error: null,
    execute: mockExecute,
    reset: jest.fn(),
    setData: jest.fn()
  })
}));

describe('SummariesClient Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without crashing', async () => {
    render(<SummariesClient />);
    
    // Check for basic elements like the search input and tabs
    expect(screen.getByPlaceholderText(/Search summaries/i)).toBeInTheDocument();
    expect(screen.getByText('All Filings')).toBeInTheDocument();
    expect(screen.getByText('10-K')).toBeInTheDocument();
  });

  it('refreshes summaries when the refresh button is clicked', async () => {
    render(<SummariesClient />);
    
    // Find and click the refresh button
    const refreshButton = screen.getByTitle('Refresh summaries');
    
    // Clear mockRefresh before click
    mockRefresh.mockClear();
    
    // Clear previous calls
    mockExecute.mockClear();
    
    fireEvent.click(refreshButton);
    
    // Verify router.refresh was called
    expect(mockRefresh).toHaveBeenCalledTimes(1);
    
    // Verify execute was called
    expect(mockExecute).toHaveBeenCalledTimes(1);
  }, 10000); // Increase timeout to 10 seconds
}); 