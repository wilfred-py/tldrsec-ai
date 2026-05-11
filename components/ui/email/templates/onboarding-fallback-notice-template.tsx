import * as React from 'react';
import {
  EmailColors,
  EMAIL_LOGO_URL,
  EMAIL_LOGO_WIDTH,
  EMAIL_LOGO_HEIGHT,
  EMAIL_PREFERENCES_URL,
} from '../design-system';

/**
 * Onboarding fallback notice — sent when no cached cross-user summaries
 * are available for any of the user's tracked tickers (the long-tail
 * unique-ticker case). Honors the "you'll receive an email shortly"
 * promise without misrepresenting reality.
 *
 * Decision: dedicated template (Section 2 Issue 7A). Reusing welcome
 * template would either misrepresent ("Welcome!" again) or require the
 * welcome flow to be content-mismatched.
 *
 * Layout: simple branded shell — logo, headline, body copy, dashboard CTA,
 * footer. No filing-specific badges/headers since this email is NOT a
 * filing notification.
 */
export interface OnboardingFallbackNoticeData {
  recipientName: string;
  trackedTickers: string[]; // e.g. ["AAPL", "PLTR", "BRK-B"]
  dashboardUrl: string;
  unsubscribeUrl?: string;
}

const containerStyle: React.CSSProperties = {
  maxWidth: '600px',
  margin: '0 auto',
  fontFamily: 'Helvetica, Arial, sans-serif',
  background: '#FFFFFF',
};

const headerStyle: React.CSSProperties = {
  padding: '24px 24px 12px 24px',
  borderBottom: `1px solid ${EmailColors.structure.border}`,
};

const bodyStyle: React.CSSProperties = {
  padding: '24px',
  color: EmailColors.text.body,
  fontSize: '15px',
  lineHeight: 1.6,
};

const headlineStyle: React.CSSProperties = {
  margin: '12px 0 0',
  fontSize: '22px',
  lineHeight: 1.3,
  color: EmailColors.text.headline,
  fontWeight: 600,
};

const subheadStyle: React.CSSProperties = {
  margin: '8px 0 0',
  fontSize: '14px',
  color: EmailColors.text.meta,
};

const ctaStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '10px 18px',
  background: EmailColors.brand.primary,
  color: '#FFFFFF',
  borderRadius: '4px',
  textDecoration: 'none',
  fontWeight: 500,
  fontSize: '14px',
};

const footerStyle: React.CSSProperties = {
  padding: '16px 24px',
  borderTop: `1px solid ${EmailColors.structure.border}`,
  fontSize: '12px',
  color: EmailColors.text.meta,
};

export function OnboardingFallbackNoticeTemplate({
  data,
}: {
  data: OnboardingFallbackNoticeData;
}) {
  const tickerListText =
    data.trackedTickers.length > 0
      ? data.trackedTickers.join(', ')
      : 'your tracked tickers';

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <img
          src={EMAIL_LOGO_URL}
          width={EMAIL_LOGO_WIDTH}
          height={EMAIL_LOGO_HEIGHT}
          alt="tldrSEC"
          style={{ display: 'block' }}
        />
        <h1 style={headlineStyle}>We&rsquo;re watching {tickerListText}</h1>
        <p style={subheadStyle}>
          Your first filing summary lands when EDGAR posts an update
        </p>
      </div>

      <div style={bodyStyle}>
        <p style={{ margin: '0 0 16px' }}>Hi {data.recipientName},</p>
        <p style={{ margin: '0 0 16px' }}>
          Thanks for adding <strong>{tickerListText}</strong> to your
          watchlist. We&rsquo;re monitoring the SEC EDGAR feed for these
          companies. The next time one of them files (10-K, 10-Q, 8-K, Form 4,
          or anything material), the summary lands in your inbox within
          minutes.
        </p>
        <p style={{ margin: '0 0 16px' }}>
          For active companies this happens daily; for less active ones, the
          first email may be a few days out. You don&rsquo;t need to do
          anything.
        </p>
        <div style={{ margin: '24px 0' }}>
          <a href={data.dashboardUrl} style={ctaStyle}>
            Open your dashboard
          </a>
        </div>
      </div>

      <div style={footerStyle}>
        Manage your tracked tickers and email preferences at{' '}
        <a
          href={data.unsubscribeUrl ?? EMAIL_PREFERENCES_URL}
          style={{ color: EmailColors.text.meta }}
        >
          your settings
        </a>
        .
      </div>
    </div>
  );
}

export default OnboardingFallbackNoticeTemplate;
