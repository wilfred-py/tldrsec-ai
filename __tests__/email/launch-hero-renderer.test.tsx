/**
 * Launch hero renderer tests — v5 (post-fact-check pivot).
 *
 * Renders the VRT Q1 2026 10-Q via Form10QMinimalistTemplate with the new
 * founderNote + founderNoteSignoff + launchCta props. Asserts:
 *   - subject rewritten away from misleading $15B backlog claim
 *   - founder body (no signoff) renders, signoff renders separately
 *   - "Start your 7-day free trial" button present with per-subscriber URL
 *   - EmailFooter's "Want more filings like this?" suppressed
 *   - WIM section includes the bull/bear backlog opacity narrative
 *   - all scorecard values parse cleanly (no bps, no non-numeric tokens)
 *   - Vertiv ticker reference REMOVED from founder note multibagger section
 *   - no em dashes in user-facing prose
 *
 * `@react-email/render`'s renderAsync is browser-bundle in jsdom, so we
 * substitute @testing-library/react's render — same fundamental output,
 * works in Node test env.
 */

if (typeof (globalThis as { MessageChannel?: unknown }).MessageChannel === 'undefined') {
  (globalThis as { MessageChannel: unknown }).MessageChannel = class {
    port1 = { onmessage: null, postMessage: () => {} };
    port2 = { onmessage: null, postMessage: () => {} };
  };
}

jest.mock('@react-email/render', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { render } = require('@testing-library/react');
  return {
    renderAsync: jest.fn(async (element: unknown) => {
      const result = render(element as React.ReactElement);
      const html = result.container.innerHTML;
      result.unmount();
      return html;
    }),
  };
});

import { renderLaunchHero } from '@/lib/email/launch-hero-renderer';
import {
  LAUNCH_SUBJECT,
  LAUNCH_FOUNDER_NOTE,
  LAUNCH_FOUNDER_SIGNOFF,
  LAUNCH_CTA_TEXT,
  LAUNCH_VRT_FILING,
} from '@/lib/email/__fixtures__/launch-2026-05-vrt';

describe('renderLaunchHero (v5 — Q1 2026 fact-checked, opacity narrative)', () => {
  const SUB_ID = '550e8400-e29b-41d4-a716-446655440000';
  const UNSUB = 'https://tldrsec.app/unsubscribe?token=stub';

  it('returns the rewritten subject (no $15B backlog claim)', async () => {
    const out = await renderLaunchHero({ subscriberId: SUB_ID, unsubscribeUrl: UNSUB });
    expect(out.subject).toBe(LAUNCH_SUBJECT);
    // Subject must mention Q1 actuals, not Q4 backlog claim
    expect(out.subject).toContain('$653M');
    expect(out.subject).toContain('+83%');
    expect(out.subject).not.toContain('backlog doubled to $15B');
  });

  it('renders via Form10QMinimalistTemplate (PR1 design markers present)', async () => {
    const out = await renderLaunchHero({ subscriberId: SUB_ID, unsubscribeUrl: UNSUB });
    expect(out.html).toMatch(/HIGH/i);
    expect(out.html).toContain('Earnings Scorecard');
    expect(out.html).toContain('Why It Matters');
    expect(out.html).toContain('VRT');
  });

  it('embeds the v6 founder note body (no multibagger paragraph)', async () => {
    const out = await renderLaunchHero({ subscriberId: SUB_ID, unsubscribeUrl: UNSUB });
    expect(out.html).toContain('I built tldrSEC because I care about my portfolio');
    expect(out.html).toContain('10+ hours every week scouring through Management Discussion');
    expect(out.html).toContain('equity analyst who never gets tired');
    expect(out.html).toContain('Cut through the noise');
  });

  it('founder note v6 dropped ticker references AND the multibagger paragraph', () => {
    expect(LAUNCH_FOUNDER_NOTE).not.toMatch(/\bVertiv\b/);
    expect(LAUNCH_FOUNDER_NOTE).not.toMatch(/\bCaterpillar\b/);
    expect(LAUNCH_FOUNDER_NOTE).not.toMatch(/\bSpotify\b/);
    // v6: the multibagger paragraph itself is gone
    expect(LAUNCH_FOUNDER_NOTE).not.toMatch(/Industrial names that ran 4x/);
    expect(LAUNCH_FOUNDER_NOTE).not.toMatch(/opportunities I noticed too late/);
  });

  it('renders the launchCta button with per-subscriber URL + correct copy', async () => {
    const out = await renderLaunchHero({ subscriberId: SUB_ID, unsubscribeUrl: UNSUB });
    // Button text
    expect(out.html).toContain(LAUNCH_CTA_TEXT);
    expect(out.html).toContain('Start your 7-day free trial');
    // Per-subscriber URL params
    expect(out.html).toContain(`sub=${SUB_ID}`);
    expect(out.html).toContain('utm_source=email');
    expect(out.html).toContain('utm_campaign=launch-2026-05');
    expect(out.html).toContain('utm_content=e1');
    expect(out.html).toContain('/sign-up');
  });

  it('suppresses the generic "Want more filings like this?" CTA when launchCta is set', async () => {
    const out = await renderLaunchHero({ subscriberId: SUB_ID, unsubscribeUrl: UNSUB });
    // EmailFooter renders "Want more filings like this?" via marketingCta prop.
    // We pass marketingCta={!launchCta}, so it should be absent.
    expect(out.html).not.toContain('Want more filings like this?');
  });

  it('renders the founder signoff AFTER the CTA button (Founder, tldrSEC / Wilf)', async () => {
    const out = await renderLaunchHero({ subscriberId: SUB_ID, unsubscribeUrl: UNSUB });
    expect(out.html).toContain('Founder, tldrSEC');
    expect(out.html).toContain('Wilf');
    // Body and signoff are separate — signoff is NOT part of founderNote text
    expect(LAUNCH_FOUNDER_NOTE).not.toContain('Founder, tldrSEC');
    expect(LAUNCH_FOUNDER_NOTE).not.toContain('\nWilf');
    expect(LAUNCH_FOUNDER_SIGNOFF).toBe('Founder, tldrSEC\nWilf');
    // Verify order: button appears in the HTML before the signoff text
    const buttonIdx = out.html.indexOf(LAUNCH_CTA_TEXT);
    const signoffIdx = out.html.indexOf('Founder, tldrSEC');
    expect(buttonIdx).toBeGreaterThan(0);
    expect(signoffIdx).toBeGreaterThan(buttonIdx);
  });

  it('founder section appears AFTER the SEC link block (not before)', async () => {
    const out = await renderLaunchHero({ subscriberId: SUB_ID, unsubscribeUrl: UNSUB });
    const secLinkIdx = out.html.indexOf('View original filing on SEC.gov');
    const founderHeaderIdx = out.html.indexOf('A Note From the Founder');
    expect(secLinkIdx).toBeGreaterThan(0);
    expect(founderHeaderIdx).toBeGreaterThan(0);
    expect(founderHeaderIdx).toBeGreaterThan(secLinkIdx);
  });

  it('WIM section includes the bull/bear backlog opacity narrative', async () => {
    const out = await renderLaunchHero({ subscriberId: SUB_ID, unsubscribeUrl: UNSUB });
    expect(out.html).toMatch(/did not disclose a backlog figure/i);
    expect(out.html).toMatch(/Bulls point to/i);
    expect(out.html).toMatch(/Bears read the silence/i);
    expect(out.html).toMatch(/book-to-bill/i);
  });

  it('contains no em-dashes in the founder note, summary, or WIM prose', async () => {
    const founderText = LAUNCH_FOUNDER_NOTE + '\n' + LAUNCH_FOUNDER_SIGNOFF;
    expect(founderText).not.toContain('—');
    const summary = (LAUNCH_VRT_FILING.summaryData as { summary?: string })?.summary ?? '';
    expect(summary).not.toContain('—');
    const wim = (LAUNCH_VRT_FILING.summaryData as { whyItMatters?: string })?.whyItMatters ?? '';
    expect(wim).not.toContain('—');
  });

  it('embeds VRT financial highlights with web-verified Q1 2026 numbers', async () => {
    const out = await renderLaunchHero({ subscriberId: SUB_ID, unsubscribeUrl: UNSUB });
    // MetricPill formatValue() adds .00 to integers (matches signed-off PR1
    // NVIDIA/CMG render style — $130.40B, $215.94B etc.). Match the rendered
    // format on the digit prefix only.
    expect(out.html).toMatch(/\$2\.65B/);
    expect(out.html).toContain('$1.17');
    expect(out.html).toMatch(/\$653(\.00)?M/);
    expect(out.html).toContain('Adj Free Cash Flow');
    // v6: Full-Year EPS Guide row replaced with Adj Op Profit
    expect(out.html).toContain('Adj Op Profit');
    expect(out.html).toMatch(/\$551(\.00)?M/);
    expect(out.html).toMatch(/\$347(\.00)?M/);
    expect(out.html).not.toContain('Full-Year EPS Guide');
  });

  it('renders pills without trailing .00 (rounded integers stay clean)', async () => {
    const out = await renderLaunchHero({ subscriberId: SUB_ID, unsubscribeUrl: UNSUB });
    // Per Wilf 2026-05-21: integer % values should NOT show ".00" suffix.
    // Net sales +30% YoY -> "+30%", not "+30.00%".
    expect(out.html).toContain('+30%');
    expect(out.html).toContain('+83%');
    expect(out.html).toContain('+113%');
    expect(out.html).not.toContain('+30.00%');
    expect(out.html).not.toContain('+83.00%');
    expect(out.html).not.toContain('+113.00%');
    // Fractional precision IS preserved where real (e.g. +3.8pp -> "+3.8%")
    // but we don't have a 3.8 in the scorecard; that's in the WIM prose.
  });

  it('SEC link uses getSecFilingViewerUrl to avoid redirect to search results', async () => {
    const out = await renderLaunchHero({ subscriberId: SUB_ID, unsubscribeUrl: UNSUB });
    // Should NOT use the cgi-bin/browse-edgar search URL (which redirects
    // to the search results page rather than the actual filing).
    expect(out.html).not.toContain('cgi-bin/browse-edgar');
    // Should link to a real /Archives/edgar/data/ path.
    expect(out.html).toMatch(/Archives\/edgar\/data\//);
  });

  it('X Sentiment section renders AFTER the SEC link block (new v6 position)', async () => {
    const out = await renderLaunchHero({ subscriberId: SUB_ID, unsubscribeUrl: UNSUB });
    // x-sentiment-section is the data-testid on XSentimentBlock
    const secLinkIdx = out.html.indexOf('View original filing on SEC.gov');
    const sentimentIdx = out.html.indexOf('x-sentiment-section');
    const founderIdx = out.html.indexOf('A Note From the Founder');
    expect(secLinkIdx).toBeGreaterThan(0);
    expect(sentimentIdx).toBeGreaterThan(secLinkIdx);
    expect(founderIdx).toBeGreaterThan(sentimentIdx);
  });

  it('CTA button is left-aligned (per Wilf v6 critique)', async () => {
    const out = await renderLaunchHero({ subscriberId: SUB_ID, unsubscribeUrl: UNSUB });
    // The td containing the CTA anchor should have text-align: left
    expect(out.html).toMatch(/text-align: left[^"]*"[^<]*<a[^>]+>Start your 7-day free trial/);
  });

  it('founder note v6 dropped the multibagger paragraph (no "opportunities I noticed")', async () => {
    const out = await renderLaunchHero({ subscriberId: SUB_ID, unsubscribeUrl: UNSUB });
    expect(out.html).not.toContain('opportunities I noticed too late');
    expect(out.html).not.toContain('Industrial names that ran 4x');
    expect(out.html).not.toContain('Heavy machinery that compounded 6x');
  });

  it('does not render a competing "View Full Filing on SEC.gov" button in the footer', async () => {
    const out = await renderLaunchHero({ subscriberId: SUB_ID, unsubscribeUrl: UNSUB });
    // When launchCta is set, we suppress EmailFooter's filing-URL button so
    // the launch broadcast has exactly one button (the founder-note CTA).
    // The SEC hyperlink above the founder note still covers filing access.
    expect(out.html).not.toContain('View Full Filing on SEC.gov');
  });

  it('scorecard values are all in clean % notation (no bps, no >+100%)', async () => {
    const fixtureHighlights = (LAUNCH_VRT_FILING.summaryData as {
      financialHighlights?: Array<{ change?: string; qoqChange?: string }>;
    }).financialHighlights ?? [];
    for (const row of fixtureHighlights) {
      if (row.change && /^[+-]?[\d.]/.test(row.change)) {
        expect(row.change).not.toMatch(/bps/);
        expect(row.change).not.toMatch(/^>/);
      }
      if (row.qoqChange && /^[+-]?[\d.]/.test(row.qoqChange)) {
        expect(row.qoqChange).not.toMatch(/bps/);
        expect(row.qoqChange).not.toMatch(/^>/);
      }
    }
  });

  it('renders text fallback with scorecard + founder note + filing URL', async () => {
    const out = await renderLaunchHero({ subscriberId: SUB_ID, unsubscribeUrl: UNSUB });
    expect(out.text).toContain('VRT 10-Q');
    expect(out.text).toContain('HIGH MATERIALITY');
    expect(out.text).toContain('EARNINGS SCORECARD');
    expect(out.text).toContain('Adj Free Cash Flow');
    expect(out.text).toContain('$653M');
    expect(out.text).toContain('WHY IT MATTERS');
    expect(out.text).toContain('A NOTE FROM THE FOUNDER');
    expect(out.text).toContain('Cut through the noise');
    expect(out.text).toContain(LAUNCH_CTA_TEXT);
    expect(out.text).toContain('Founder, tldrSEC');
    expect(out.text).toContain('Wilf');
    expect(out.text).toContain(LAUNCH_VRT_FILING.filingUrl);
    expect(out.text).toContain(UNSUB);
  });

  it('suppresses StalenessBanner for the 28-day-old Vertiv filing', async () => {
    const out = await renderLaunchHero({ subscriberId: SUB_ID, unsubscribeUrl: UNSUB });
    expect(out.html).not.toMatch(/This summary was delayed/i);
  });
});
