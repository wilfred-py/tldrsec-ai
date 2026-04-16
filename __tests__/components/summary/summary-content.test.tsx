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

  // Summary with no JSON (plain text fallback)
  const mockPlainTextSummary = {
    id: 'summary456',
    tickerId: 'ticker456',
    filingType: '10-K',
    filingDate: new Date('2023-06-01'),
    filingUrl: 'https://example.com/filing2',
    summaryText: 'This is a plain text summary without any JSON data available for structured rendering.',
    summaryJSON: null,
    createdAt: new Date(),
    sentToUser: true,
    ticker: {
      symbol: 'MSFT',
      companyName: 'Microsoft Corporation'
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render the formatted summary directly without tabs', () => {
    const { getByText, queryByRole } = render(<SummaryContent summary={mockSummary as any} />);

    // Tabs should NOT be rendered
    expect(queryByRole('tablist')).not.toBeInTheDocument();
    expect(queryByRole('tab', { name: /raw text/i })).not.toBeInTheDocument();
    expect(queryByRole('tab', { name: /json/i })).not.toBeInTheDocument();

    // Formatted content should be displayed directly
    expect(getByText(/apple inc/i)).toBeInTheDocument();
    expect(getByText(/10-k report/i, { exact: false })).toBeInTheDocument();
  });

  it('should render a restricted access view when summary is redacted', () => {
    // Render the component with redacted access
    const { getByText, queryByRole } = render(<SummaryContent summary={mockRedactedSummary as any} />);

    // Check that the access denied message is displayed
    expect(getByText(/access restricted/i)).toBeInTheDocument();
    expect(getByText('You do not have permission to view this summary.')).toBeInTheDocument();
    expect(getByText('To view this summary, add this ticker to your watchlist.')).toBeInTheDocument();

    // Check that tabs are not rendered
    expect(queryByRole('tablist')).not.toBeInTheDocument();

    // Check that the "Add to Watchlist" button is displayed
    expect(getByText(/add to watchlist/i)).toBeInTheDocument();
  });

  it('should render plain text fallback when summaryJSON is null', () => {
    const { getByText, queryByRole } = render(<SummaryContent summary={mockPlainTextSummary as any} />);

    // No tabs
    expect(queryByRole('tablist')).not.toBeInTheDocument();

    // Plain text content should be rendered
    expect(getByText(/plain text summary without any JSON data/i)).toBeInTheDocument();
  });

  it('should sanitize HTML/script tags in the plain text fallback path', () => {
    const xssSummary = {
      ...mockPlainTextSummary,
      id: 'summary789',
      summaryText: 'Safe text <script>alert(1)</script> and an <img src=x onerror=alert(2)> tag here.',
    };

    const { container, queryByText } = render(<SummaryContent summary={xssSummary as any} />);

    // Raw script/img tags must NOT appear in the rendered DOM
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(queryByText(/<script>/)).not.toBeInTheDocument();
    expect(queryByText(/onerror/)).not.toBeInTheDocument();
  });

  it('should fall back to plain text when summaryJSON is invalid', () => {
    const invalidJsonSummary = {
      ...mockPlainTextSummary,
      id: 'summary999',
      summaryJSON: '{not valid json',
      summaryText: 'Fallback rendered after JSON parse failure.',
    };

    const { getByText } = render(<SummaryContent summary={invalidJsonSummary as any} />);

    expect(getByText(/Fallback rendered after JSON parse failure/i)).toBeInTheDocument();
  });
});
