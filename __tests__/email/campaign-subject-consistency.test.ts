/**
 * Campaign email subject-line consistency (AC2 + AC10).
 *
 * Locks the subject contract for the 3-email campaign:
 *   E1: dynamic — `<ticker>: <title>` (case preserved; locked from
 *       `.claude/tasks/design-shotgun/email-1-hero-2026-04-29/`); CRLF
 *       stripped (header injection)
 *   E1: fallback variants A/B — pre-defined ≤55 chars; ALL-CAPS allowed only
 *       for ticker tokens (NVDA, AAPL, …)
 *   E2: static — `<count> SEC filings you should know about`
 *   E3: static — `the multibaggers you didn't buy`
 *
 * The campaign templates are NOT routed through EmailSubjectService — they
 * use their own subject builder (template literal + stripCrlf). This suite
 * pins the contract because subjects flow into RFC 5322 headers and into
 * Resend tag attribution, so any drift breaks both deliverability and
 * PostHog `email.opened` filtering.
 *
 * Mirrors the spirit of __tests__/email/subject-line-consistency.test.ts +
 * 8k-subject-terseness.test.ts.
 */

jest.mock('@react-email/render', () => ({
  renderAsync: jest.fn(async () => '<table><tbody><tr><td>HEADER_STUB</td></tr></tbody></table>'),
}));

import {
  getCampaignEmailContent,
  type CampaignFiling,
} from '@/lib/email/campaign-templates';
import { CAMPAIGN_FALLBACK_HERO } from '@/lib/email/__fixtures__/campaign-fallback-filings';

const baseOptions = {
  unsubscribeUrl: 'https://tldrsec.app/unsubscribe?token=t',
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

// Subject-voice rules from AC10. Filler verbs that smell of press-release boilerplate.
const FILLER_VERB_RE = /\b(announced|issued|prices|completes|signs|enters)\b/i;

describe('Campaign email subject consistency', () => {
  describe('Email 1 — dynamic filing', () => {
    it('uses case-preserved `<ticker>: <title>` schema (variant A default)', async () => {
      // PR 2 dropped the lowercased subject in favor of the locked
      // /design-shotgun voice — `AAPL: Apple prepaid $4.5B for TSMC capacity`.
      // Tickers stay caps; titles preserve their incoming case.
      const filing = makeFiling({ ticker: 'NVDA', title: 'Insider Purchase' });
      const { subject } = await getCampaignEmailContent(1, { ...baseOptions, filings: [filing] });
      expect(subject).toBe('NVDA: Insider Purchase');
    });

    it('variant B uses Hormozi pattern `The <type> every <ticker> holder needs to see`', async () => {
      const filing = makeFiling({ ticker: 'NVDA', filingType: 'Form 4' });
      const { subject } = await getCampaignEmailContent(1, { ...baseOptions, variant: 'B', filings: [filing] });
      expect(subject).toBe('The Form 4 every NVDA holder needs to see');
    });

    it('variant A dedupes a leading ticker prefix in `filing.title` (LLM smartSubject often double-prefixes)', async () => {
      // The Grok-built `smartSubject` field frequently ships as
      // `AMZN: Q1 earnings results` — i.e. the ticker is already present.
      // Naively prepending `${ticker}: ` would produce `AMZN: AMZN: Q1 ...`.
      // ensureTickerPrefix collapses the duplicate.
      const filing = makeFiling({ ticker: 'AMZN', title: 'AMZN: Q1 earnings results' });
      const { subject } = await getCampaignEmailContent(1, { ...baseOptions, filings: [filing] });
      expect(subject).toBe('AMZN: Q1 earnings results');
      expect(subject).not.toMatch(/AMZN:\s+AMZN:/);
    });

    it('variant A leaves the title untouched when the ticker appears anywhere in it (case-insensitive word boundary)', async () => {
      // ensureTickerPrefix's word-boundary check means a mid-string ticker
      // mention also suppresses the prefix — the title is already
      // self-identifying.
      const filing = makeFiling({ ticker: 'TSLA', title: 'Director sells $12M of TSLA stock' });
      const { subject } = await getCampaignEmailContent(1, { ...baseOptions, filings: [filing] });
      expect(subject).toBe('Director sells $12M of TSLA stock');
    });

    it('variant A prefers `filing.headline` over `filing.title` when both are set (PR 2 curated voice)', async () => {
      // The curated `headline` is the dry, fully-formed observation that also
      // drives the body hero — subject + hero must agree, otherwise the
      // inbox preview promises one story and the body delivers another.
      const filing = makeFiling({
        ticker: 'NVDA',
        title: 'Customer concentration footnote',
        headline: 'NVDA: 3 customers each booked over 13% last quarter',
      });
      const { subject } = await getCampaignEmailContent(1, { ...baseOptions, filings: [filing] });
      expect(subject).toBe('NVDA: 3 customers each booked over 13% last quarter');
    });

    it('strips CRLF from filing-derived subject (header injection guard)', async () => {
      const filing = makeFiling({ title: 'AI deal\r\nBcc: x@evil.com' });
      const { subject } = await getCampaignEmailContent(1, { ...baseOptions, filings: [filing] });
      expect(subject).not.toMatch(/[\r\n]/);
    });

    it('keeps subject within RFC 5322 single-line bounds (no embedded newlines)', async () => {
      // Long titles may exceed 55 chars when prepended with ticker+colon — the
      // template does NOT cap length on the dynamic path (capHeadline only
      // truncates summaryText). This test pins the current behavior so any
      // future length-cap addition is intentional.
      const filing = makeFiling({
        ticker: 'AAPL',
        title: 'A long title that exceeds the typical fifty-five character mobile preview window',
      });
      const { subject } = await getCampaignEmailContent(1, { ...baseOptions, filings: [filing] });
      expect(subject.startsWith('AAPL: ')).toBe(true);
      expect(subject).not.toMatch(/[\r\n]/);
    });
  });

  describe('Email 1 — fallback variants', () => {
    it('variant A subject matches locked fixture copy', async () => {
      const { subject } = await getCampaignEmailContent(1, { ...baseOptions, variant: 'A' });
      expect(subject).toBe(CAMPAIGN_FALLBACK_HERO.variantASubject);
      expect(subject.length).toBeLessThanOrEqual(55);
    });

    it('variant B subject matches locked fixture copy', async () => {
      const { subject } = await getCampaignEmailContent(1, { ...baseOptions, variant: 'B' });
      expect(subject).toBe(CAMPAIGN_FALLBACK_HERO.variantBSubject);
      expect(subject.length).toBeLessThanOrEqual(55);
    });

    it('fallback subjects avoid filler verbs (AC10 voice rule)', async () => {
      const a = await getCampaignEmailContent(1, { ...baseOptions, variant: 'A' });
      const b = await getCampaignEmailContent(1, { ...baseOptions, variant: 'B' });
      expect(a.subject).not.toMatch(FILLER_VERB_RE);
      expect(b.subject).not.toMatch(FILLER_VERB_RE);
    });

    it('fallback subjects are sentence-case (no all-caps marketing scream)', async () => {
      // We allow ALL-CAPS tickers anywhere in the subject (PR 2 variant B
      // puts the ticker mid-string: "The Form 4 every NVDA holder needs to
      // see") but reject sentences like "EVERY FILING NOW IN YOUR INBOX".
      // Heuristic: tickers are ≤5 chars; flag any 6+ char ALL-CAPS run as
      // marketing scream.
      const a = await getCampaignEmailContent(1, { ...baseOptions, variant: 'A' });
      const b = await getCampaignEmailContent(1, { ...baseOptions, variant: 'B' });
      const screamTokens = (s: string) =>
        s.split(/\s+/).filter(t => /^[A-Z]{6,}$/.test(t));
      expect(screamTokens(a.subject).length).toBe(0);
      expect(screamTokens(b.subject).length).toBe(0);
    });
  });

  describe('Email 2 — digest', () => {
    it('uses static "Filings we caught for you this week" subject regardless of count', async () => {
      // PR 2 dropped the count-led "N SEC filings you should know about"
      // subject. The new locked subject is static — same Likelihood-proof
      // framing per the campaign plan, but without the prescriptive "you
      // should know about" tone that read as spam in QA.
      const filings = [
        makeFiling({ ticker: 'AAPL' }),
        makeFiling({ ticker: 'MSFT' }),
        makeFiling({ ticker: 'NVDA' }),
      ];
      const { subject } = await getCampaignEmailContent(2, { ...baseOptions, filings });
      expect(subject).toBe('Filings we caught for you this week');
    });

    it('digest subject is identical on the fallback (no filings) path', async () => {
      const { subject } = await getCampaignEmailContent(2, baseOptions);
      expect(subject).toBe('Filings we caught for you this week');
    });

    it('digest subject is CRLF-clean even when filing.title has injection payload', async () => {
      const filings = [makeFiling({ title: 'X\r\nBcc: x@evil.com' })];
      const { subject } = await getCampaignEmailContent(2, { ...baseOptions, filings });
      // E2 subject doesn't interpolate filing fields, but the route still
      // applies stripCrlf. Pin that the schema is constant.
      expect(subject).not.toMatch(/[\r\n]/);
      expect(subject).toBe('Filings we caught for you this week');
    });
  });

  describe('Email 3 — FOMO pitch', () => {
    it('subject is the locked static string', async () => {
      // PR 2 reshape: the regret-trade pain (CAT/SPOT/VRT multibaggers you
      // missed because you didn't have the information to commit) anchors
      // the new pitch — the subject calls that out directly.
      const { subject } = await getCampaignEmailContent(3, baseOptions);
      expect(subject).toBe("the multibaggers you didn't buy");
    });

    it('static subject fits ≤55 chars (mobile preview)', async () => {
      const { subject } = await getCampaignEmailContent(3, baseOptions);
      expect(subject.length).toBeLessThanOrEqual(55);
    });

    it('static subject avoids filler verbs', async () => {
      const { subject } = await getCampaignEmailContent(3, baseOptions);
      expect(subject).not.toMatch(FILLER_VERB_RE);
    });
  });
});
