import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import type { ActivitySummary } from '@/components/dashboard/activity-feed';

// Mock date-fns to return predictable relative dates
jest.mock('date-fns', () => ({
  formatDistanceToNow: () => '2 hours ago',
}));

function makeSummary(overrides: Partial<ActivitySummary> = {}): ActivitySummary {
  return {
    id: 'test-id-1',
    filingType: '10-K',
    filingDate: new Date().toISOString(),
    importance: null,
    smartSubject: null,
    summaryText: null,
    companyName: 'Apple Inc.',
    ticker: 'AAPL',
    filingUrl: 'https://sec.gov/test',
    ...overrides,
  };
}

describe('ActivityFeed', () => {
  it('renders preview text from summaryText', () => {
    const summary = makeSummary({
      summaryText: 'Revenue increased 12% driven by strong iPhone sales and services growth.',
    });
    render(<ActivityFeed summaries={[summary]} />);
    expect(screen.getByText(/Revenue increased 12%/)).toBeInTheDocument();
  });

  it('truncates long summaryText to 150 chars', () => {
    const longText = 'A'.repeat(200);
    const summary = makeSummary({ summaryText: longText });
    render(<ActivityFeed summaries={[summary]} />);
    expect(screen.getByText('A'.repeat(150) + '...')).toBeInTheDocument();
  });

  it('shows smartSubject as headline when summaryText is null', () => {
    const summary = makeSummary({
      summaryText: null,
      smartSubject: 'Apple posts record quarterly earnings',
    });
    render(<ActivityFeed summaries={[summary]} />);
    expect(screen.getByText('Apple posts record quarterly earnings')).toBeInTheDocument();
  });

  it('falls back to company + filing type when both summaryText and smartSubject are null', () => {
    const summary = makeSummary({
      summaryText: null,
      smartSubject: null,
    });
    render(<ActivityFeed summaries={[summary]} />);
    expect(screen.getByText('Apple Inc. 10-K Filing')).toBeInTheDocument();
  });

  it('renders filing type badge with correct text', () => {
    const summary10K = makeSummary({ filingType: '10-K' });
    const { unmount } = render(<ActivityFeed summaries={[summary10K]} />);
    expect(screen.getByText('10-K')).toBeInTheDocument();
    unmount();

    const summaryForm4 = makeSummary({ filingType: '4', id: 'form4-1' });
    render(<ActivityFeed summaries={[summaryForm4]} />);
    expect(screen.getByText('Form 4')).toBeInTheDocument();
  });

  it('renders relative date', () => {
    const summary = makeSummary();
    render(<ActivityFeed summaries={[summary]} />);
    expect(screen.getByText('2 hours ago')).toBeInTheDocument();
  });

  it('renders importance badge for critical/high importance', () => {
    const summary = makeSummary({ importance: 'critical' });
    render(<ActivityFeed summaries={[summary]} />);
    expect(screen.getByText('critical')).toBeInTheDocument();
  });

  it('does not render importance text badge for medium/low/null', () => {
    const summaryMed = makeSummary({ importance: 'medium', id: 'med' });
    const summaryNull = makeSummary({ importance: null, id: 'null' });
    render(<ActivityFeed summaries={[summaryMed, summaryNull]} />);
    expect(screen.queryByText('medium')).not.toBeInTheDocument();
    expect(screen.queryByText('critical')).not.toBeInTheDocument();
  });

  it('groups 3+ Form 4s from same company', () => {
    const form4s = Array.from({ length: 4 }, (_, i) =>
      makeSummary({
        id: `form4-${i}`,
        filingType: '4',
        ticker: 'META',
        companyName: 'Meta Platforms Inc.',
        smartSubject: `Insider transaction ${i}`,
      })
    );
    render(<ActivityFeed summaries={form4s} />);
    expect(screen.getByText(/Show 3 more/)).toBeInTheDocument();
  });

  it('does not group fewer than 3 Form 4s from same company', () => {
    const form4s = Array.from({ length: 2 }, (_, i) =>
      makeSummary({
        id: `form4-${i}`,
        filingType: '4',
        ticker: 'META',
        companyName: 'Meta Platforms Inc.',
        smartSubject: `Insider transaction ${i}`,
      })
    );
    render(<ActivityFeed summaries={form4s} />);
    expect(screen.queryByText(/Show.*more/)).not.toBeInTheDocument();
  });

  it('expands Form 4 group on button click', () => {
    const form4s = Array.from({ length: 4 }, (_, i) =>
      makeSummary({
        id: `form4-${i}`,
        filingType: '4',
        ticker: 'META',
        companyName: 'Meta Platforms Inc.',
        smartSubject: `Insider transaction ${i}`,
      })
    );
    render(<ActivityFeed summaries={form4s} />);

    const expandButton = screen.getByText(/Show 3 more/);
    fireEvent.click(expandButton);
    expect(screen.getByText(/Hide/)).toBeInTheDocument();
  });

  it('renders empty state when no summaries', () => {
    render(<ActivityFeed summaries={[]} />);
    expect(
      screen.getByText(/Your first summaries are on the way/)
    ).toBeInTheDocument();
  });
});
