import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { PostOnboardingHeroCard } from '@/components/dashboard/post-onboarding-hero-card';

const DISMISS_KEY = 'postOnboardingHeroDismissed';

const sampleTickers = [
  { symbol: 'AAPL', name: 'Apple Inc.' },
  { symbol: 'MSFT', name: 'Microsoft Corporation' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.' },
];

describe('PostOnboardingHeroCard', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders headline, ticker chips, and target email', () => {
    render(
      <PostOnboardingHeroCard
        tickers={sampleTickers}
        userEmail="wilfred@gmail.com"
      />
    );

    expect(screen.getByText(/Your first summaries are on the way/)).toBeInTheDocument();
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    expect(screen.getByText('MSFT')).toBeInTheDocument();
    expect(screen.getByText('GOOGL')).toBeInTheDocument();
    expect(screen.getByText('wilfred@gmail.com')).toBeInTheDocument();
  });

  it('personalizes headline when firstName is provided', () => {
    render(
      <PostOnboardingHeroCard
        tickers={sampleTickers}
        userEmail="wilfred@gmail.com"
        firstName="Wilfred"
      />
    );

    expect(
      screen.getByText('Your first summaries are on the way, Wilfred')
    ).toBeInTheDocument();
  });

  it('omits greeting fallback when firstName is missing', () => {
    render(
      <PostOnboardingHeroCard
        tickers={sampleTickers}
        userEmail="wilfred@gmail.com"
      />
    );

    expect(screen.queryByText(/there/)).not.toBeInTheDocument();
  });

  it('renders nothing when localStorage dismiss flag is set', () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));

    const { container } = render(
      <PostOnboardingHeroCard
        tickers={sampleTickers}
        userEmail="wilfred@gmail.com"
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when tickers array is empty', () => {
    const { container } = render(
      <PostOnboardingHeroCard tickers={[]} userEmail="wilfred@gmail.com" />
    );

    expect(container.firstChild).toBeNull();
  });

  it('dismisses card and persists flag when X is clicked', () => {
    render(
      <PostOnboardingHeroCard
        tickers={sampleTickers}
        userEmail="wilfred@gmail.com"
      />
    );

    expect(screen.getByText(/Your first summaries/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Dismiss'));

    expect(screen.queryByText(/Your first summaries/)).not.toBeInTheDocument();
    expect(localStorage.getItem(DISMISS_KEY)).not.toBeNull();
  });

  it('shows overflow chip when more than 6 tickers are passed', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({
      symbol: `T${i}`,
      name: `Ticker ${i}`,
    }));

    render(<PostOnboardingHeroCard tickers={many} userEmail="x@gmail.com" />);

    expect(screen.getByText('T0')).toBeInTheDocument();
    expect(screen.getByText('T5')).toBeInTheDocument();
    expect(screen.queryByText('T6')).not.toBeInTheDocument();
    expect(screen.getByText('+3 more')).toBeInTheDocument();
  });

  it('resolves Gmail deep-link for @gmail.com', () => {
    render(
      <PostOnboardingHeroCard
        tickers={sampleTickers}
        userEmail="user@gmail.com"
      />
    );

    const link = screen.getByRole('link', { name: /Open Inbox/ });
    expect(link).toHaveAttribute('href', 'https://mail.google.com/mail/u/0/#inbox');
  });

  it('resolves Outlook deep-link for @outlook.com', () => {
    render(
      <PostOnboardingHeroCard
        tickers={sampleTickers}
        userEmail="user@outlook.com"
      />
    );

    const link = screen.getByRole('link', { name: /Open Inbox/ });
    expect(link).toHaveAttribute('href', 'https://outlook.live.com/mail/inbox');
  });

  it('resolves Yahoo deep-link for @yahoo.com', () => {
    render(
      <PostOnboardingHeroCard
        tickers={sampleTickers}
        userEmail="user@yahoo.com"
      />
    );

    const link = screen.getByRole('link', { name: /Open Inbox/ });
    expect(link).toHaveAttribute('href', 'https://mail.yahoo.com/');
  });

  it('resolves iCloud deep-link for @icloud.com, @me.com, @mac.com', () => {
    for (const domain of ['icloud.com', 'me.com', 'mac.com']) {
      const { unmount } = render(
        <PostOnboardingHeroCard
          tickers={sampleTickers}
          userEmail={`user@${domain}`}
        />
      );

      const link = screen.getByRole('link', { name: /Open Inbox/ });
      expect(link).toHaveAttribute('href', 'https://www.icloud.com/mail');
      unmount();
      localStorage.clear();
    }
  });

  it('falls back to mailto for unknown domains', () => {
    render(
      <PostOnboardingHeroCard
        tickers={sampleTickers}
        userEmail="user@fastmail.com"
      />
    );

    const link = screen.getByRole('link', { name: /Open Inbox/ });
    expect(link).toHaveAttribute('href', 'mailto:user@fastmail.com');
  });

  describe('summary-content variant (Section 1 Issue 1A)', () => {
    const sampleSummary = {
      id: 'sum_abc123',
      ticker: 'COIN',
      companyName: 'Coinbase Global, Inc.',
      filingType: '8-K',
      filingDate: '2025-12-15T00:00:00.000Z',
      headline:
        'Coinbase reports Q4 trading volume +42% YoY and announces partnership with major bank.',
      importance: 'high' as const,
    };

    it('renders summary headline + ticker + company when summary is present', () => {
      render(
        <PostOnboardingHeroCard
          tickers={sampleTickers}
          userEmail="wilfred@gmail.com"
          summary={sampleSummary}
        />
      );

      expect(
        screen.getByText(/Coinbase reports Q4 trading volume/)
      ).toBeInTheDocument();
      expect(screen.getByText('COIN')).toBeInTheDocument();
      expect(screen.getByText('Coinbase Global, Inc.')).toBeInTheDocument();
      expect(screen.getByText('8-K')).toBeInTheDocument();
      expect(screen.getByText(/high/i)).toBeInTheDocument();
    });

    it('falls back to inbox-CTA layout when summary is null (regression)', () => {
      render(
        <PostOnboardingHeroCard
          tickers={sampleTickers}
          userEmail="wilfred@gmail.com"
          summary={null}
        />
      );

      expect(
        screen.getByText(/Your first summaries are on the way/)
      ).toBeInTheDocument();
      // No /summary/ link in fallback layout — only inbox CTA
      expect(
        screen.queryByRole('link', { name: /Read summary/ })
      ).not.toBeInTheDocument();
    });

    it('summary variant routes "Read summary" CTA to /summary/{id}', () => {
      render(
        <PostOnboardingHeroCard
          tickers={sampleTickers}
          userEmail="wilfred@gmail.com"
          summary={sampleSummary}
        />
      );

      const cta = screen.getByRole('link', { name: /Read summary/ });
      expect(cta).toHaveAttribute('href', '/summary/sum_abc123');
    });

    it('summary variant retains inbox CTA as secondary action', () => {
      render(
        <PostOnboardingHeroCard
          tickers={sampleTickers}
          userEmail="wilfred@gmail.com"
          summary={sampleSummary}
        />
      );

      const inboxLink = screen.getByRole('link', { name: /Open Inbox/ });
      expect(inboxLink).toHaveAttribute(
        'href',
        'https://mail.google.com/mail/u/0/#inbox'
      );
    });

    it('summary variant personalizes headline with firstName', () => {
      render(
        <PostOnboardingHeroCard
          tickers={sampleTickers}
          userEmail="wilfred@gmail.com"
          firstName="Wilfred"
          summary={sampleSummary}
        />
      );

      expect(
        screen.getByText("Hi Wilfred, here's your first summary")
      ).toBeInTheDocument();
    });

    it('summary variant respects dismissal — clicking X hides the card', () => {
      const { container } = render(
        <PostOnboardingHeroCard
          tickers={sampleTickers}
          userEmail="wilfred@gmail.com"
          summary={sampleSummary}
        />
      );

      const dismissBtn = screen.getByRole('button', { name: /Dismiss/i });
      fireEvent.click(dismissBtn);
      expect(localStorage.getItem(DISMISS_KEY)).not.toBeNull();
      expect(container.firstChild).toBeNull();
    });

    it('summary variant omits importance badge when importance is null', () => {
      const summaryNoImportance = { ...sampleSummary, importance: null };
      render(
        <PostOnboardingHeroCard
          tickers={sampleTickers}
          userEmail="wilfred@gmail.com"
          summary={summaryNoImportance}
        />
      );

      // The variant still renders; just no "high"/"critical" label
      expect(
        screen.getByText(/Coinbase reports Q4 trading volume/)
      ).toBeInTheDocument();
      // Importance label should NOT be present (case-insensitive search for any of the 4 levels)
      expect(screen.queryByText(/^critical$/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/^high$/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/^medium$/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/^low$/i)).not.toBeInTheDocument();
    });
  });
});
