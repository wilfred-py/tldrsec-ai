/**
 * Campaign voice + tone (AC10 — locked from /design-shotgun "Variant C Hybrid").
 *
 * Mirrors the spirit of __tests__/email/8k-prompt-eval.test.ts and
 * form4-prompt-eval.test.ts but adapted for static template copy: instead of
 * grading Grok output, this suite pins the *fixed* voice of the campaign
 * shell + body so any future copy change is intentional and shows up in a diff.
 *
 * Voice rules (Hybrid = Hormozi-calibrated structure + Levine-dry tone):
 *   1. No filler verbs ("Announced", "Issued", "Prices", "Completes", "Signs",
 *      "Enters") — these are press-release boilerplate that obscure the lede.
 *   2. No marketing scream ("ACT NOW", "LIMITED TIME", "DON'T MISS OUT",
 *      excessive exclamation marks, all-caps shouting).
 *   3. Hormozi Grand Slam Offer framework markers in E3 (Dream Outcome,
 *      Perceived Likelihood, Time, Effort/Sacrifice).
 *   4. Levine-dry tone: contractions allowed, sentences ≤25 words on average,
 *      no breathless adjectives.
 *
 * The full creative brief lives in the design-shotgun output; this suite is
 * a regression net, not a complete style audit.
 */

jest.mock('@react-email/render', () => ({
  renderAsync: jest.fn(async () => '<table><tbody><tr><td>HEADER_STUB</td></tr></tbody></table>'),
}));

import { getCampaignEmailContent } from '@/lib/email/campaign-templates';

const baseOptions = { unsubscribeUrl: 'https://tldrsec.app/unsubscribe?token=t' };

const FILLER_VERB_RE = /\b(Announced|Issued|Prices|Completes|Signs|Enters)\s/g;
const MARKETING_SCREAM_RE = /\b(ACT NOW|LIMITED TIME|DON'T MISS OUT|HURRY|CLICK HERE NOW|BUY NOW)\b/i;

/** Strip HTML tags for prose-level analysis (sentence count, exclamation count). */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&middot;/g, '·')
    .replace(/&copy;/g, '(c)')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

describe('Campaign voice + tone (AC10)', () => {
  describe('No press-release filler verbs', () => {
    it.each([1, 2, 3] as const)('email %s body has no filler verbs', async (emailNumber) => {
      const { html } = await getCampaignEmailContent(emailNumber, baseOptions);
      const text = htmlToText(html);
      // Filler verbs appear at sentence start with capital initial — `\b(Announced|...)\s`
      // catches them without flagging "this announces" or "as it enters".
      const matches = text.match(FILLER_VERB_RE) || [];
      expect(matches).toEqual([]);
    });
  });

  describe('No marketing scream', () => {
    it.each([1, 2, 3] as const)('email %s body has no all-caps marketing phrases', async (emailNumber) => {
      const { html } = await getCampaignEmailContent(emailNumber, baseOptions);
      const text = htmlToText(html);
      expect(text).not.toMatch(MARKETING_SCREAM_RE);
    });

    it.each([1, 2, 3] as const)('email %s body uses ≤2 exclamation marks total', async (emailNumber) => {
      const { html } = await getCampaignEmailContent(emailNumber, baseOptions);
      const text = htmlToText(html);
      const exclamations = (text.match(/!/g) || []).length;
      // Levine-dry tone: occasional emphasis is fine, breathless ! spam is not.
      expect(exclamations).toBeLessThanOrEqual(2);
    });
  });

  describe('Email 3 — Hormozi Grand Slam Offer markers', () => {
    it('surfaces Dream Outcome (every filing, every company)', async () => {
      const { html } = await getCampaignEmailContent(3, baseOptions);
      const text = htmlToText(html).toLowerCase();
      // Either phrasing — what matters is that the breadth promise lands.
      expect(
        text.includes('every filing') ||
          text.includes('every company') ||
          text.includes('every public company'),
      ).toBe(true);
    });

    it('surfaces Time Delay (within 10 minutes)', async () => {
      const { html } = await getCampaignEmailContent(3, baseOptions);
      const text = htmlToText(html).toLowerCase();
      expect(text).toMatch(/within \d+ minutes|every \d+ minutes/);
    });

    it('surfaces Effort/Sacrifice reversal (cancel-anytime line below CTA)', async () => {
      const { html } = await getCampaignEmailContent(3, baseOptions);
      const text = htmlToText(html).toLowerCase();
      // PR 2 cleanup: the "card won't be charged" reassurance was dropped
      // as redundant. The cancel beat alone carries the risk-reversal.
      expect(text).toMatch(/cancel/);
    });

    it('variant A sub-CTA is the punchy single-line cancel reassurance', async () => {
      const { html } = await getCampaignEmailContent(3, { ...baseOptions, variant: 'A' });
      const text = htmlToText(html);
      expect(text).toMatch(/Cancel anytime in one click\./);
      // The redundant "card won't be charged" line was dropped in PR 2.
      expect(text).not.toMatch(/card won't be charged/i);
    });

    it('variant B sub-CTA leads with breadth (full access)', async () => {
      const { html } = await getCampaignEmailContent(3, { ...baseOptions, variant: 'B' });
      const text = htmlToText(html);
      expect(text).toMatch(/Full access for 7 days/i);
    });
  });

  describe('Email 1 — product-as-demo framing', () => {
    it('does NOT carry the old preamble or "what our AI does" framing', async () => {
      // PR 2 reshape: E1 is now a sample of the product, not a pitch about
      // it. The "You signed up for tldrSEC a few weeks ago. Here's what our
      // AI does with SEC filings" preamble + the "On EDGAR, reading this
      // 10-Q takes 15-20 minutes" closing were both stripped. The whole
      // email body = the filing summary the recipient would receive as a
      // paying user.
      const { html } = await getCampaignEmailContent(1, baseOptions);
      const text = htmlToText(html);
      expect(text).not.toMatch(/Here's what our AI does/);
      expect(text).not.toMatch(/15-20 minutes/);
      expect(text).not.toMatch(/^We are |^We're a /);
      expect(text).not.toMatch(/This is a sample of what tldrSEC delivers/);
    });

    it('renders the filing summary body (the actual product output)', async () => {
      const { html } = await getCampaignEmailContent(1, baseOptions);
      const text = htmlToText(html);
      // The fallback `summaryBody` must reach the body text — that's the
      // entire purpose of E1 now.
      expect(text).toContain('Customer concentration disclosure widened');
    });

    it('routes the bottom CTA to the landing page (not EDGAR) for unregistered recipients', async () => {
      const { html } = await getCampaignEmailContent(1, baseOptions);
      // The button-positioned-where-View-on-SEC-Website-lives points to
      // tldrsec.app, not edgar.sec.gov, since campaign recipients are
      // unregistered waitlist members.
      expect(html).toContain('See more filings like this');
      expect(html).toMatch(/href="https:\/\/tldrsec\.app"[^>]*style="display:inline-block;background-color:#2563eb/);
    });

    it('keeps an EDGAR audit hyperlink in the body so users can verify the source', async () => {
      const { html } = await getCampaignEmailContent(1, baseOptions);
      // "Source: SEC EDGAR" anchor goes through `getSecFilingViewerUrl()`
      // — same path production filing emails use, so a real `filing.filingUrl`
      // resolves to an `/Archives/edgar/data/...-index.htm` page (the actual
      // filing index) and an empty/missing URL falls back to EDGAR company
      // search. Either way, the anchor is to sec.gov, brand-purple, and
      // labeled "Source: SEC EDGAR".
      expect(html).toMatch(/<a href="https:\/\/www\.sec\.gov\/[^"]*"[^>]*>\s*Source: SEC EDGAR\s*<\/a>/);
      // Brand-purple EmailColors.semantic.accent (#7C3AED) for the link.
      expect(html).toMatch(/<a href="https:\/\/www\.sec\.gov\/[^"]*" style="color:#7C3AED/);
    });
  });

  describe('Email 2 — count-led subject + "see how it works" CTA', () => {
    it('CTA copy is action-oriented and concrete (not "Learn More")', async () => {
      const { html } = await getCampaignEmailContent(2, baseOptions);
      expect(html).toContain('See How It Works');
      // Generic CTAs we explicitly avoid:
      expect(html).not.toContain('>Learn More<');
      expect(html).not.toContain('>Click Here<');
    });
  });
});
