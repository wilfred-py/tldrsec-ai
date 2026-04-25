import React from 'react';
import { render, screen } from '@testing-library/react';
import { InlineEmailNotice } from '@/components/onboarding/inline-email-notice';

describe('InlineEmailNotice (Variant B)', () => {
  it('renders the singular promise when exactly one ticker is selected', () => {
    render(<InlineEmailNotice tickers={['AAPL']} />);
    expect(
      screen.getByText("We'll email you when new filings are posted for 1 company.")
    ).toBeInTheDocument();
    expect(screen.getByText('AAPL')).toBeInTheDocument();
  });

  it('renders the plural promise when multiple tickers are selected', () => {
    render(<InlineEmailNotice tickers={['AAPL', 'MSFT', 'GOOGL']} />);
    expect(
      screen.getByText("We'll email you when new filings are posted for 3 companies.")
    ).toBeInTheDocument();
    expect(screen.getByText('AAPL, MSFT, GOOGL')).toBeInTheDocument();
  });

  it('truncates to first 3 tickers + "+N more" when count > 3', () => {
    render(<InlineEmailNotice tickers={['AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN']} />);
    expect(screen.getByText('AAPL, MSFT, GOOGL +2 more')).toBeInTheDocument();
  });

  it('shows the full ticker list as a tooltip (title attribute)', () => {
    const tickers = ['AAPL', 'MSFT', 'GOOGL', 'META', 'AMZN'];
    render(<InlineEmailNotice tickers={tickers} />);
    const tickerLine = screen.getByText('AAPL, MSFT, GOOGL +2 more');
    expect(tickerLine).toHaveAttribute('title', tickers.join(', '));
  });

  it('omits the ticker line entirely when zero tickers selected', () => {
    const { container } = render(<InlineEmailNotice tickers={[]} />);
    expect(
      screen.getByText("We'll email you when new filings are posted for 0 companies.")
    ).toBeInTheDocument();
    // No font-mono ticker line should be rendered.
    expect(container.querySelector('.font-mono')).toBeNull();
  });

  it('always renders the Settings helper', () => {
    render(<InlineEmailNotice tickers={['AAPL']} />);
    expect(screen.getByText('Change anytime in Settings.')).toBeInTheDocument();
  });

  it('exposes an accessible region with a labelled heading', () => {
    render(<InlineEmailNotice tickers={['AAPL']} />);
    const region = screen.getByRole('region', { name: /email notice/i });
    expect(region).toBeInTheDocument();
  });
});
