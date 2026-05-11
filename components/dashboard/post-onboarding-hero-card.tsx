'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Mail, X, ExternalLink, FileText } from 'lucide-react';

/**
 * Optional summary chosen by `pickBestSummaryForUser`. When present, the card
 * renders the summary-content variant; the inbox-CTA is demoted to a secondary
 * link. When absent, the card falls back to the original inbox-CTA layout.
 */
export interface FirstSummaryHeroSummary {
  id: string;
  ticker: string;
  companyName: string;
  filingType: string;
  filingDate: string; // ISO
  headline: string;
  importance: string | null;
}

interface PostOnboardingHeroCardProps {
  tickers: Array<{ symbol: string; name: string }>;
  userEmail: string;
  firstName?: string;
  /** When provided, renders the summary-content variant. */
  summary?: FirstSummaryHeroSummary | null;
}

const DISMISS_KEY = 'postOnboardingHeroDismissed';
const MAX_VISIBLE_CHIPS = 6;

function resolveInboxUrl(email: string): string {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';

  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    return 'https://mail.google.com/mail/u/0/#inbox';
  }
  if (domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'live.com' || domain === 'msn.com') {
    return 'https://outlook.live.com/mail/inbox';
  }
  if (domain === 'yahoo.com' || domain === 'ymail.com') {
    return 'https://mail.yahoo.com/';
  }
  if (domain === 'icloud.com' || domain === 'me.com' || domain === 'mac.com') {
    return 'https://www.icloud.com/mail';
  }
  return `mailto:${email}`;
}

export function PostOnboardingHeroCard({
  tickers,
  userEmail,
  firstName,
  summary,
}: PostOnboardingHeroCardProps) {
  const [visible, setVisible] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISS_KEY);
    setVisible(!dismissed);
    setHydrated(true);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  if (!hydrated || !visible || tickers.length === 0) {
    return null;
  }

  // Variant A: summary-content card (chosen pick available)
  if (summary) {
    return (
      <SummaryVariantCard
        summary={summary}
        userEmail={userEmail}
        firstName={firstName}
        onDismiss={handleDismiss}
      />
    );
  }

  // Variant B: original inbox-CTA card (no chosen pick — fallback notice path
  // or first dashboard visit before pickBestSummaryForUser has run)
  const headline = firstName
    ? `Your first summaries are on the way, ${firstName}`
    : 'Your first summaries are on the way';

  const visibleChips = tickers.slice(0, MAX_VISIBLE_CHIPS);
  const overflowCount = tickers.length - visibleChips.length;
  const inboxUrl = resolveInboxUrl(userEmail);
  const tickerCountLabel = tickers.length === 1 ? 'company' : 'companies';

  return (
    <div
      role="status"
      aria-live="polite"
      className="relative bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6 animate-fade-in"
    >
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="absolute top-3 right-3 text-blue-400 hover:text-blue-700 transition-colors p-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-4 pr-8">
        <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
          <Mail className="w-5 h-5 text-blue-600" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-blue-900 text-lg mb-1">{headline}</h3>
          <p className="text-blue-700 text-sm mb-3">
            We&apos;re emailing AI-powered SEC filing summaries for {tickers.length}{' '}
            {tickerCountLabel} to <span className="font-medium">{userEmail}</span>. Expect
            them in the next few minutes — the first batch shows you our most detailed
            analysis (10-Ks, 10-Qs) before routine filings.
          </p>

          <div className="flex flex-wrap gap-1.5 mb-4">
            {visibleChips.map((ticker) => (
              <span
                key={ticker.symbol}
                title={ticker.name}
                className="inline-flex items-center px-2 py-0.5 rounded-md bg-white/70 border border-blue-200 text-blue-900 text-xs font-medium"
              >
                {ticker.symbol}
              </span>
            ))}
            {overflowCount > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-white/70 border border-blue-200 text-blue-700 text-xs font-medium">
                +{overflowCount} more
              </span>
            )}
          </div>

          <Button
            asChild
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <a href={inboxUrl} target="_blank" rel="noopener noreferrer">
              <Mail className="w-4 h-4 mr-2" />
              Open Inbox
              <ExternalLink className="w-3.5 h-3.5 ml-2 opacity-80" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Summary-content variant of the post-onboarding hero card.
 *
 * Renders the chosen pick from `pickBestSummaryForUser` as the first wow
 * moment. The dashboard render is <500ms so the user sees real summary
 * content immediately; the email arrives shortly after as a confirmation
 * + persistence layer.
 *
 * The deep-link CTA routes to `/summary/{id}` (in-app, not external inbox).
 */
function SummaryVariantCard({
  summary,
  userEmail,
  firstName,
  onDismiss,
}: {
  summary: FirstSummaryHeroSummary;
  userEmail: string;
  firstName?: string;
  onDismiss: () => void;
}) {
  const filingDateText = (() => {
    try {
      return new Date(summary.filingDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return summary.filingDate;
    }
  })();

  const headline = firstName
    ? `Hi ${firstName}, here's your first summary`
    : "Here's your first summary";

  const inboxUrl = resolveInboxUrl(userEmail);

  return (
    <div
      role="status"
      aria-live="polite"
      className="relative bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6 animate-fade-in"
    >
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="absolute top-3 right-3 text-blue-400 hover:text-blue-700 transition-colors p-1 rounded focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-4 pr-8">
        <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
          <FileText className="w-5 h-5 text-blue-600" />
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-blue-900 text-lg mb-1">
            {headline}
          </h3>
          <div className="flex items-center gap-2 mb-2 text-xs text-blue-700">
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-white/70 border border-blue-200 font-medium">
              {summary.ticker}
            </span>
            <span>{summary.companyName}</span>
            <span>·</span>
            <span>{summary.filingType}</span>
            <span>·</span>
            <span>{filingDateText}</span>
            {summary.importance && (
              <>
                <span>·</span>
                <span className="capitalize font-medium">
                  {summary.importance}
                </span>
              </>
            )}
          </div>
          <p className="text-blue-900 text-sm mb-4 leading-relaxed">
            {summary.headline}
          </p>

          <div className="flex flex-wrap gap-2 items-center">
            <Button
              asChild
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <a href={`/summary/${summary.id}`}>
                <FileText className="w-4 h-4 mr-2" />
                Read summary
              </a>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-blue-200 text-blue-700 hover:bg-blue-50"
            >
              <a href={inboxUrl} target="_blank" rel="noopener noreferrer">
                <Mail className="w-4 h-4 mr-2" />
                Open Inbox
                <ExternalLink className="w-3.5 h-3.5 ml-2 opacity-80" />
              </a>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
