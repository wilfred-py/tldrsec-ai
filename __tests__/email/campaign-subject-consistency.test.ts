/**
 * Campaign email subject-line consistency (AC2 + AC10).
 *
 * Locks the subject contract for the 3-email campaign:
 *   E1: dynamic — `<ticker>: <title>` lowercased; CRLF stripped (header injection)
 *   E1: fallback variants A/B — pre-defined sentence-case ≤55 chars
 *   E2: static — `<count> SEC filings you should know about`
 *   E3: static — `your 7-day trial is ready`
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
    it('uses lowercased `<ticker>: <title>` schema', async () => {
      const filing = makeFiling({ ticker: 'NVDA', title: 'Insider Purchase' });
      const { subject } = await getCampaignEmailContent(1, { ...baseOptions, filings: [filing] });
      expect(subject).toBe('nvda: insider purchase');
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
      expect(subject.startsWith('aapl: ')).toBe(true);
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
      // We allow ALL-CAPS tickers (NVDA, AAPL) and short alphanumeric tokens
      // ($2.1M) but reject sentences like "EVERY FILING NOW IN YOUR INBOX".
      // Heuristic: no ALL-CAPS run of ≥3 alphabetic chars beyond a leading
      // ticker.
      const a = await getCampaignEmailContent(1, { ...baseOptions, variant: 'A' });
      const b = await getCampaignEmailContent(1, { ...baseOptions, variant: 'B' });
      const screamTokens = (s: string) =>
        s.split(/\s+/)
          .slice(1) // skip leading ticker
          .filter(t => /^[A-Z]{3,}$/.test(t));
      expect(screamTokens(a.subject).length).toBe(0);
      expect(screamTokens(b.subject).length).toBe(0);
    });
  });

  describe('Email 2 — digest', () => {
    it('uses count-aware schema regardless of variant', async () => {
      const filings = [
        makeFiling({ ticker: 'AAPL' }),
        makeFiling({ ticker: 'MSFT' }),
        makeFiling({ ticker: 'NVDA' }),
      ];
      const { subject } = await getCampaignEmailContent(2, { ...baseOptions, filings });
      expect(subject).toBe('3 SEC filings you should know about');
    });

    it('digest subject collapses to fallback count when no filings provided', async () => {
      const { subject } = await getCampaignEmailContent(2, baseOptions);
      // Fallback fixture has 3 rows.
      expect(subject).toBe('3 SEC filings you should know about');
    });

    it('digest subject is CRLF-clean even when filing.title has injection payload', async () => {
      const filings = [makeFiling({ title: 'X\r\nBcc: x@evil.com' })];
      const { subject } = await getCampaignEmailContent(2, { ...baseOptions, filings });
      // E2 subject doesn't interpolate filing fields, but the route still
      // applies stripCrlf. Pin that the schema is constant.
      expect(subject).not.toMatch(/[\r\n]/);
      expect(subject).toBe('1 SEC filings you should know about');
    });
  });

  describe('Email 3 — invite', () => {
    it('subject is the locked static string', async () => {
      const { subject } = await getCampaignEmailContent(3, baseOptions);
      expect(subject).toBe('your 7-day trial is ready');
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
