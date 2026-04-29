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

    it('surfaces Effort/Sacrifice reversal (cancel + no charge)', async () => {
      const { html } = await getCampaignEmailContent(3, baseOptions);
      const text = htmlToText(html).toLowerCase();
      expect(text).toMatch(/cancel/);
      expect(text).toMatch(/(won't be charged|no charge|no questions asked)/);
    });

    it('variant A sub-CTA leads with risk-reversal (card not charged)', async () => {
      const { html } = await getCampaignEmailContent(3, { ...baseOptions, variant: 'A' });
      const text = htmlToText(html);
      // Variant A copy: "Your card won't be charged for 7 days. Cancel anytime in one click."
      expect(text).toMatch(/card won't be charged/i);
    });

    it('variant B sub-CTA leads with breadth (full access)', async () => {
      const { html } = await getCampaignEmailContent(3, { ...baseOptions, variant: 'B' });
      const text = htmlToText(html);
      expect(text).toMatch(/Full access for 7 days/i);
    });
  });

  describe('Email 1 — value-first framing', () => {
    it('opens with what the AI does, not who tldrSEC is', async () => {
      const filing = {
        ticker: 'AAPL',
        companyName: 'Apple Inc.',
        filingType: '8-K',
        filingDate: new Date('2026-04-28'),
        importance: 'high' as const,
        summary: 'Material agreement signed.',
        title: 'Quarterly results',
      };
      const { html } = await getCampaignEmailContent(1, { ...baseOptions, filings: [filing] });
      const text = htmlToText(html);
      // First non-header sentence should anchor on the AI/product, not "We are…".
      // The locked intro sentence is: "You signed up for tldrSEC a few weeks ago.
      // Here's what our AI does with SEC filings."
      expect(text).toMatch(/Here's what our AI does/);
      expect(text).not.toMatch(/^We are |^We're a /);
    });

    it('explicitly contrasts AI speed vs manual reading time', async () => {
      const { html } = await getCampaignEmailContent(1, baseOptions);
      const text = htmlToText(html).toLowerCase();
      // The locked closing comparison: "On EDGAR, reading this … takes 15-20
      // minutes. Our AI extracted the key details in under 10 minutes…"
      expect(text).toMatch(/15-20 minutes/);
      expect(text).toMatch(/under 10 minutes|in 10 minutes/);
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
