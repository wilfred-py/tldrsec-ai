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
 * `<EmailHeader>` and `<EmailHeroBlock>` are mocked out at the renderAsync
 * boundary — their own JSX-level tests live in
 * components/ui/email/templates/sections/__tests__/. Here we use a
 * component-aware stub that surfaces props as `data-*` attributes so the
 * outer template can assert which component was composed in and with which
 * key props (ticker, headline, whyItMatters, etc.).
 */

jest.mock('@react-email/render', () => ({
  // Component-aware stub: serializes string props as data-* attributes with
  // full HTML escape (matches how React-DOM renderToString would escape JSX
  // text content). Lets the outer template assert which component was
  // composed AND that user content flowed through with proper escaping.
  renderAsync: jest.fn(async (element: unknown) => {
    const el = element as {
      type?: { name?: string; displayName?: string };
      props?: Record<string, unknown>;
    };
    const name = el?.type?.name || el?.type?.displayName || 'Unknown';
    const props = el?.props || {};
    const escAttr = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const attrs = Object.entries(props)
      .filter(([, v]) => typeof v === 'string' && v.length > 0)
      .map(([k, v]) => `data-${k}="${escAttr(v as string)}"`)
      .join(' ');
    return `<div data-component="${name}" ${attrs}>STUB:${name}</div>`;
  }),
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
    ])('renders dynamic filing for $ticker with header + hero block + body + footer', async ({ ticker, companyName }) => {
      const filing = makeFiling({ ticker, companyName, title: 'Quarterly results' });
      const { html, text } = await getCampaignEmailContent(1, { ...baseOptions, filings: [filing] });

      // EmailHeader composed in with this filing's ticker
      expect(html).toMatch(new RegExp(`data-component="EmailHeader"[^>]*data-ticker="${ticker}"`));
      // EmailHeroBlock composed in — falls back to filing.title when no curated headline
      expect(html).toMatch(new RegExp(`data-component="EmailHeroBlock"[^>]*data-headline="Quarterly results"`));
      expect(html).toMatch(new RegExp(`data-component="EmailHeroBlock"[^>]*data-ticker="${ticker}"`));
      // Body still carries the summary text
      expect(html).toContain('Material agreement signed.');
      // Plaintext alternative carries ticker · companyName line + headline
      expect(text).toContain(`${ticker} · ${companyName}`);
      expect(text).toContain('Quarterly results');
      // Unsubscribe URL composed into footer
      expect(html).toContain(baseOptions.unsubscribeUrl);
    });

    it('curated headline + whyItMatters flow through to the hero block', async () => {
      const filing = makeFiling({
        ticker: 'AAPL',
        headline: 'AAPL: prepaid $4.5B for TSMC capacity through 2028',
        whyItMatters: 'Locks supply, signals chip-cycle bet two years out.',
      });
      const { html, text } = await getCampaignEmailContent(1, { ...baseOptions, filings: [filing] });
      expect(html).toMatch(/data-component="EmailHeroBlock"[^>]*data-headline="AAPL: prepaid \$4\.5B for TSMC capacity through 2028"/);
      expect(html).toMatch(/data-component="EmailHeroBlock"[^>]*data-whyItMatters="Locks supply, signals chip-cycle bet two years out\."/);
      expect(text).toContain('AAPL: prepaid $4.5B for TSMC capacity through 2028');
      expect(text).toContain('Locks supply, signals chip-cycle bet two years out.');
    });

    it('falls back to fixture copy when no filings provided (variant A)', async () => {
      const { subject, html, text } = await getCampaignEmailContent(1, { ...baseOptions, variant: 'A' });
      expect(subject).toBe(CAMPAIGN_FALLBACK_HERO.variantASubject);
      // Hero block receives fixture headline + whyItMatters
      expect(html).toContain(`data-headline="${CAMPAIGN_FALLBACK_HERO.heroHeadline}"`);
      expect(html).toContain(CAMPAIGN_FALLBACK_HERO.summaryBody);
      // Plaintext carries the headline + whyItMatters
      expect(text).toContain(CAMPAIGN_FALLBACK_HERO.heroHeadline);
      expect(text).toContain(CAMPAIGN_FALLBACK_HERO.whyItMatters);
    });

    it('falls back to fixture copy when no filings provided (variant B)', async () => {
      const { subject, html } = await getCampaignEmailContent(1, { ...baseOptions, variant: 'B' });
      expect(subject).toBe(CAMPAIGN_FALLBACK_HERO.variantBSubject);
      expect(html).toContain(`data-headline="${CAMPAIGN_FALLBACK_HERO.heroHeadline}"`);
    });

    it('preheader is escaped + present (uses whyItMatters when available)', async () => {
      const filing = makeFiling({
        summary: 'plain summary',
        whyItMatters: 'Hostile <script>alert(1)</script> in gloss',
      });
      const { html } = await getCampaignEmailContent(1, { ...baseOptions, filings: [filing] });
      // Preheader prefers whyItMatters over summary; <script> is escaped.
      expect(html).toMatch(/display:none[\s\S]*?Hostile &lt;script&gt;/);
    });

    it('preheader falls back to summary when whyItMatters absent', async () => {
      const filing = makeFiling({ summary: 'Hostile <script>alert(1)</script> in summary', whyItMatters: undefined });
      const { html } = await getCampaignEmailContent(1, { ...baseOptions, filings: [filing] });
      expect(html).toMatch(/display:none[\s\S]*?Hostile &lt;script&gt;/);
    });

    it('critical-importance filing renders without a separate signal band (E1 dropped importance band)', async () => {
      // Per locked Levine voice (PR 2): E1 hero has no importance band — reader
      // infers importance from the dry headline + gloss. E2 keeps colored bands
      // for digest scannability. So neither 'CRITICAL' nor SignalColors.HIGH.bgColor
      // should appear in E1's HTML.
      const filing = makeFiling({ importance: 'critical' });
      const { html } = await getCampaignEmailContent(1, { ...baseOptions, filings: [filing] });
      expect(html).not.toContain('CRITICAL');
      expect(html).not.toContain('#FEF3C7');
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
      expect(subject).toBe('Filings we caught for you this week');
      expect(html).toContain('Apple Inc. (TSLA)');
    });

    it('renders fallback 3-row fixture when filings array is empty (curated PR 2 stories)', async () => {
      const { html, subject } = await getCampaignEmailContent(2, { ...baseOptions, filings: [] });
      expect(subject).toBe('Filings we caught for you this week');
      // Curated tier-1 narratives: TSLA Musk-comp, META Reality Labs, GOOGL antitrust.
      expect(html).toContain('Tesla Inc (TSLA)');
      expect(html).toContain('Meta Platforms (META)');
      expect(html).toContain('Alphabet Inc (GOOGL)');
    });

    it('truncates to top 3 even when more filings provided', async () => {
      const filings = Array.from({ length: 10 }, (_, i) =>
        makeFiling({ ticker: `TIC${i}`, title: `Filing ${i}` }),
      );
      const { html, subject } = await getCampaignEmailContent(2, { ...baseOptions, filings });
      expect(subject).toBe('Filings we caught for you this week');
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

  describe('Email 3 — FOMO + information-asymmetry pitch', () => {
    it('opens with the regret-trade pain (CAT/SPOT/VRT multibaggers)', async () => {
      const { html, text } = await getCampaignEmailContent(3, baseOptions);
      // PR 2 reshape: the abstract "stock you watch is moving" opener was
      // replaced with concrete missed-multibagger regret. Names three
      // recognizable tickers + their pre-rip prices, then the why (you had
      // the thesis, not the bandwidth).
      expect(html).toContain('Caterpillar');
      expect(html).toContain('Spotify');
      expect(html).toContain('Vertiv');
      expect(text).toContain('Five years later, all three multibagged.');
      // Pin the diagnostic — pain isn't capital, it's information bandwidth.
      expect(html).toMatch(/didn't have the\s+<em>information<\/em>|didn't have the .{0,20}information/);
    });

    it('builds to a punchy "what every hedge fund desk knows" subhead', async () => {
      const { html } = await getCampaignEmailContent(3, baseOptions);
      // PR 2 nudge: the original "Three things that are true on EDGAR" felt
      // textbook-like — replaced with an antagonist-framed subhead that
      // names the institutional adversary and promises an inside view.
      expect(html).toContain("What every hedge fund desk knows that you don't");
      expect(html).not.toContain('Three things that are true on EDGAR');
      // Each truth, after the post-chart concise rewrite (5-15 word
      // sentences, blog cadence). "Lede" jargon was replaced with
      // "market-moving line" earlier; the long "50-100 pages of legal
      // language" sentence was tightened to "Page one is decoration."
      expect(html).toContain('market-moving line is on page 47');
      expect(html).not.toContain('lede');
      expect(html).toContain('Page one is decoration');
      expect(html).toContain('CNBC writes the headline');
      expect(html).toMatch(/Institutional desks/);
    });

    it('has no FAQ block (the FAQ-led pitch was killed in PR 2)', async () => {
      const { html } = await getCampaignEmailContent(3, baseOptions);
      expect(html).not.toContain('Common Questions');
      expect(html).not.toContain("What if I don't like it?");
      expect(html).not.toContain('What does it cost after the trial?');
    });

    it('variant A sub-CTA is "Cancel anytime in one click" only', async () => {
      // PR 2 cleanup: the redundant "Your card won't be charged for 7 days"
      // line was dropped — same risk-reversal beat already lives in the
      // FAQ-killing pitch above.
      const { html } = await getCampaignEmailContent(3, { ...baseOptions, variant: 'A' });
      expect(html).toContain('Cancel anytime in one click.');
      expect(html).not.toContain("Your card won't be charged");
    });

    it('variant B sub-CTA leads on breadth', async () => {
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
