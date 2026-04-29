/**
 * Campaign email rendering coverage (AC3 + AC7).
 *
 * Render-and-assert tests for the inline-HTML campaign templates. Mirrors
 * the assertion style of __tests__/email/8k-formatting.test.ts (string
 * inspection of rendered output) since the campaign pipeline returns an
 * HTML string, not a React tree.
 *
 * Coverage targets:
 *   - E1 hero — top-30 ticker (AAPL, MSFT, NVDA) renders all required panels
 *   - E1 hero — fallback path (no filings) renders fixture copy
 *   - E1 hero — variants A and B subjects/preheaders flow through
 *   - E2 digest — 3 / 1 filings renders importance + filing-type badges
 *   - E2 digest — empty filings array → falls back to 3-row fixture
 *   - E3 invite — static copy + FAQ + CTA all render
 *   - All emails — campaignShell wraps with unsubscribe footer
 *
 * `<EmailHeader>` is mocked out (renderAsync stub) — its own JSX-level tests
 * live in components/ui/email/templates/sections/__tests__/. Here we only
 * verify that *some* header HTML is composed in.
 */

jest.mock('@react-email/render', () => ({
  renderAsync: jest.fn(async () => '<table><tbody><tr><td data-testid="header-stub">HEADER_STUB</td></tr></tbody></table>'),
}));

import {
  getCampaignEmailContent,
  type CampaignFiling,
} from '@/lib/email/campaign-templates';
import { CAMPAIGN_FALLBACK_HERO } from '@/lib/email/__fixtures__/campaign-fallback-filings';

const baseOptions = {
  unsubscribeUrl: 'https://tldrsec.app/unsubscribe?token=abc',
};

function makeFiling(overrides: Partial<CampaignFiling> = {}): CampaignFiling {
  return {
    ticker: 'AAPL',
    companyName: 'Apple Inc.',
    filingType: '8-K',
    filingDate: new Date('2026-04-28'),
    importance: 'high',
    summary: 'Material agreement signed.',
    title: 'AI infrastructure deal',
    ...overrides,
  };
}

describe('Campaign rendering', () => {
  describe('Email 1 — hero', () => {
    it.each([
      { ticker: 'AAPL', companyName: 'Apple Inc.' },
      { ticker: 'MSFT', companyName: 'Microsoft Corp' },
      { ticker: 'NVDA', companyName: 'NVIDIA Corporation' },
    ])('renders dynamic filing for $ticker with header + body + footer', async ({ ticker, companyName }) => {
      const filing = makeFiling({ ticker, companyName, title: 'Quarterly results' });
      const { html, text } = await getCampaignEmailContent(1, { ...baseOptions, filings: [filing] });

      // EmailHeader composed in (stub renders HEADER_STUB)
      expect(html).toContain('HEADER_STUB');
      // Body heading: companyName (ticker) - title
      expect(html).toContain(`${companyName} (${ticker}) - Quarterly results`);
      // Importance badge label
      expect(html).toContain('HIGH');
      // Filing type badge
      expect(html).toContain('8-K');
      // Plaintext alternative carries the same heading
      expect(text).toContain(`${companyName} (${ticker}) - Quarterly results`);
      // Unsubscribe URL composed into footer
      expect(html).toContain(baseOptions.unsubscribeUrl);
    });

    it('falls back to fixture copy when no filings provided (variant A)', async () => {
      const { subject, html } = await getCampaignEmailContent(1, { ...baseOptions, variant: 'A' });
      expect(subject).toBe(CAMPAIGN_FALLBACK_HERO.variantASubject);
      expect(html).toContain(CAMPAIGN_FALLBACK_HERO.heading);
      expect(html).toContain(CAMPAIGN_FALLBACK_HERO.summaryBody);
    });

    it('falls back to fixture copy when no filings provided (variant B)', async () => {
      const { subject, html } = await getCampaignEmailContent(1, { ...baseOptions, variant: 'B' });
      expect(subject).toBe(CAMPAIGN_FALLBACK_HERO.variantBSubject);
      expect(html).toContain(CAMPAIGN_FALLBACK_HERO.heading);
    });

    it('preheader is escaped + present', async () => {
      const filing = makeFiling({ summary: 'Hostile <script>alert(1)</script> in summary' });
      const { html } = await getCampaignEmailContent(1, { ...baseOptions, filings: [filing] });
      // Preheader div is `<div style="display:none...">${escaped}</div>`.
      expect(html).toMatch(/display:none[\s\S]*?Hostile &lt;script&gt;/);
    });

    it('renders critical-importance filing with the HIGH-band signal palette (no separate critical band)', async () => {
      // Per design-system.ts, "critical" collapses into HIGH (no fourth band).
      const filing = makeFiling({ importance: 'critical' });
      const { html } = await getCampaignEmailContent(1, { ...baseOptions, filings: [filing] });
      // CRITICAL is the impLabel surfaced in the hero, signal palette comes
      // from importanceToSignalLevel('critical') → 'HIGH' (amber).
      expect(html).toContain('CRITICAL');
      expect(html).toContain('#FEF3C7'); // SignalColors.HIGH.bgColor
    });
  });

  describe('Email 2 — digest', () => {
    it('renders 3 filings with importance + filing-type badges + summaries', async () => {
      const filings = [
        makeFiling({ ticker: 'AAPL', companyName: 'Apple Inc.', filingType: '8-K', importance: 'high', title: 'Material agreement' }),
        makeFiling({ ticker: 'MSFT', companyName: 'Microsoft Corp', filingType: '10-Q', importance: 'medium', title: 'Quarterly report' }),
        makeFiling({ ticker: 'NVDA', companyName: 'NVIDIA Corporation', filingType: 'Form 4', importance: 'low', title: 'Insider sale' }),
      ];
      const { html } = await getCampaignEmailContent(2, { ...baseOptions, filings });

      expect(html).toContain('Apple Inc. (AAPL)');
      expect(html).toContain('Microsoft Corp (MSFT)');
      expect(html).toContain('NVIDIA Corporation (NVDA)');
      // Importance + filing-type badges
      expect(html).toContain('HIGH');
      expect(html).toContain('MEDIUM');
      expect(html).toContain('LOW');
      expect(html).toContain('8-K');
      expect(html).toContain('10-Q');
      expect(html).toContain('Form 4');
    });

    it('renders only 1 filing when filings.length === 1', async () => {
      const filings = [makeFiling({ ticker: 'TSLA' })];
      const { html, subject } = await getCampaignEmailContent(2, { ...baseOptions, filings });
      expect(subject).toBe('1 SEC filings you should know about');
      expect(html).toContain('Apple Inc. (TSLA)');
    });

    it('renders fallback 3-row fixture when filings array is empty', async () => {
      const { html, subject } = await getCampaignEmailContent(2, { ...baseOptions, filings: [] });
      expect(subject).toBe('3 SEC filings you should know about');
      expect(html).toContain('Tesla Inc (TSLA)');
      expect(html).toContain('Apple Inc (AAPL)');
      expect(html).toContain('Microsoft Corp (MSFT)');
    });

    it('truncates to top 3 even when more filings provided', async () => {
      const filings = Array.from({ length: 10 }, (_, i) =>
        makeFiling({ ticker: `TIC${i}`, title: `Filing ${i}` }),
      );
      const { html, subject } = await getCampaignEmailContent(2, { ...baseOptions, filings });
      expect(subject).toBe('3 SEC filings you should know about');
      expect(html).toContain('Filing 0');
      expect(html).toContain('Filing 1');
      expect(html).toContain('Filing 2');
      expect(html).not.toContain('Filing 3');
    });

    it('CTA "See How It Works" links to homepage', async () => {
      const { html } = await getCampaignEmailContent(2, baseOptions);
      expect(html).toContain('See How It Works');
      expect(html).toContain('href="https://tldrsec.app"');
    });
  });

  describe('Email 3 — invite', () => {
    it('renders static pain-first intro + CTA + FAQ', async () => {
      const { html, text } = await getCampaignEmailContent(3, baseOptions);
      expect(html).toContain('Start Your 7-Day Trial');
      expect(html).toContain('Common Questions');
      expect(html).toContain("What if I don't like it?");
      expect(html).toContain('What does it cost after the trial?');
      expect(text).toContain('your 7-day trial is ready');
    });

    it('variant A sub-CTA copy', async () => {
      const { html } = await getCampaignEmailContent(3, { ...baseOptions, variant: 'A' });
      expect(html).toContain('Cancel anytime in one click.');
    });

    it('variant B sub-CTA copy', async () => {
      const { html } = await getCampaignEmailContent(3, { ...baseOptions, variant: 'B' });
      expect(html).toContain('Full access for 7 days');
    });

    it('CTA href is the locked sign-up URL', async () => {
      const { html } = await getCampaignEmailContent(3, baseOptions);
      expect(html).toContain('href="https://tldrsec.app/sign-up?plan=pro&ref=campaign"');
    });
  });

  describe('campaignShell — common envelope', () => {
    it.each([1, 2, 3] as const)('email %s renders a doctype + body + manage-preferences + unsubscribe', async (emailNumber) => {
      const { html } = await getCampaignEmailContent(emailNumber, baseOptions);
      expect(html).toMatch(/^<!DOCTYPE html>/i);
      expect(html).toContain(baseOptions.unsubscribeUrl);
      expect(html).toContain('https://tldrsec.app/dashboard/settings');
      expect(html).toContain('&copy; ' + new Date().getFullYear() + ' tldrSEC');
    });
  });
});
