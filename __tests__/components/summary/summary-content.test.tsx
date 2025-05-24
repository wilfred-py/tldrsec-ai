import React from 'react';
import { render } from '@testing-library/react';
import { SummaryContent } from '@/components/summary/summary-content';
import '@testing-library/jest-dom';

describe('SummaryContent Component', () => {
  // Regular summary data
  const mockSummary = {
    id: 'summary123',
    tickerId: 'ticker123',
    filingType: '10-K',
    filingDate: new Date('2023-01-01'),
    filingUrl: 'https://example.com/filing',
    summaryText: 'This is a summary of the filing',
    summaryJSON: JSON.stringify({ 
      company: 'Apple Inc',
      insights: ['Good performance', 'New products'],
      financials: [
        { label: 'Revenue', value: '$100B', growth: '+15%' },
        { label: 'Profit', value: '$25B', growth: '+10%' }
      ]
    }),
    createdAt: new Date(),
    sentToUser: true,
    ticker: {
      symbol: 'AAPL',
      companyName: 'Apple Inc.'
    }
  };

  // Redacted summary data
  const mockRedactedSummary = {
    id: 'summary123',
    filingType: '10-K',
    filingDate: new Date('2023-01-01'),
    summaryText: 'You do not have permission to view this summary.',
    summaryJSON: null,
    accessDeniedReason: 'To view this summary, add this ticker to your watchlist.',
    isRedacted: true,
    ticker: {
      symbol: 'AAPL',
      companyName: 'Apple Inc.'
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render the full summary content when not redacted', () => {
    // Render the component with full access
    const { getByRole, getByText } = render(<SummaryContent summary={mockSummary as any} />);
    
    // Check that the tab navigation is displayed
    expect(getByRole('tablist')).toBeInTheDocument();
    expect(getByRole('tab', { name: /formatted/i })).toBeInTheDocument();
    expect(getByRole('tab', { name: /raw text/i })).toBeInTheDocument();
    expect(getByRole('tab', { name: /json/i })).toBeInTheDocument();
    
    // Check that the summary content is displayed
    expect(getByText(/apple inc/i)).toBeInTheDocument();
    expect(getByText(/10-k report/i, { exact: false })).toBeInTheDocument();
  });

  it('should render a restricted access view when summary is redacted', () => {
    // Render the component with redacted access
    const { getByText, queryByRole, getByRole } = render(<SummaryContent summary={mockRedactedSummary as any} />);
    
    // Check that the access denied message is displayed
    expect(getByText(/access restricted/i)).toBeInTheDocument();
    expect(getByText('You do not have permission to view this summary.')).toBeInTheDocument();
    expect(getByText('To view this summary, add this ticker to your watchlist.')).toBeInTheDocument();
    
    // Check that the tabs are not rendered
    expect(queryByRole('tablist')).not.toBeInTheDocument();
    expect(queryByRole('tab', { name: /formatted/i })).not.toBeInTheDocument();
    
    // Check that the "Add to Watchlist" button is displayed
    expect(getByRole('button', { name: /add to watchlist/i })).toBeInTheDocument();
  });
}); 