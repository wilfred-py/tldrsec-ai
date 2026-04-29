/**
 * Campaign email fallback fixtures
 *
 * Hardcoded sample filings used when `fetchCampaignFilings` returns empty
 * (e.g. fresh database, summary backlog, demo route). Picked for brand
 * recognition (top-30 S&P 500) so the example reads as plausibly current.
 *
 * NOT for production filing data — use `fetchCampaignFilings()` for the
 * real path. These fixtures are placeholder copy only.
 *
 * PR 2 (Voice) will replace these with curated top-30 S&P 500 examples
 * matching the locked Hybrid voice (see `.claude/tasks/email-campaign-revamp.md
 * § Phase 2.5`). For now the original copy is preserved verbatim so
 * extraction is a pure refactor.
 */

import type { CampaignFiling } from '../campaign-templates';

/**
 * Email 1 hero fallback — single illustrative filing.
 * Original copy preserved from `campaign-templates.ts` pre-extraction.
 */
export interface CampaignFallbackHero {
  ticker: string;
  companyName: string;
  heading: string;
  summaryBody: string;
  filingType: string;
  filingDate: Date;
  importance: 'critical' | 'high' | 'medium' | 'low';
  importanceLabel: string;
  filedDateLabel: string;
  variantBSubject: string;
  variantASubject: string;
  variantBPreheader: string;
  variantAPreheader: string;
}

export const CAMPAIGN_FALLBACK_HERO: CampaignFallbackHero = {
  ticker: 'NVDA',
  companyName: 'NVIDIA Corp',
  heading: 'NVIDIA Corp (NVDA) - Insider Purchase',
  summaryBody:
    'A senior executive acquired 15,000 shares at $142.50/share ($2.14M total). ' +
    'This is notable because insider buying at this scale, during a period of ' +
    'elevated valuation, signals strong internal confidence in near-term performance. ' +
    'The executive now holds 185,000 shares directly.',
  filingType: 'Form 4',
  filingDate: new Date('2026-03-15'),
  importance: 'high',
  importanceLabel: 'HIGH',
  filedDateLabel: 'March 2026',
  variantBSubject: 'NVDA insider bought $2.1M last week',
  variantASubject: 'the form 4 filing most investors missed',
  variantBPreheader:
    'A senior executive acquired 15,000 NVDA shares at $142.50/share ($2.14M total).',
  variantAPreheader:
    'This is what our AI does with SEC filings, minutes after they hit EDGAR.',
};

/**
 * Email 2 digest fallback — three illustrative filings.
 * Shape matches the rendered-row type used in `email2()` (post-escape, raw).
 */
export interface CampaignFallbackDigestRow {
  importance: string;
  importanceColorKey: 'high' | 'medium' | 'low';
  badge: CampaignFiling['filingType'];
  company: string;
  title: string;
  summary: string;
}

export const CAMPAIGN_FALLBACK_DIGEST: CampaignFallbackDigestRow[] = [
  {
    importance: 'HIGH',
    importanceColorKey: 'high',
    badge: 'Form 4',
    company: 'Tesla Inc (TSLA)',
    title: 'Director Stock Sale',
    summary:
      'Board member sold 50,000 shares at $248.30 ($12.4M). Scheduled sale ' +
      'under 10b5-1 plan filed in January. Director retains 420,000 shares.',
  },
  {
    importance: 'MEDIUM',
    importanceColorKey: 'medium',
    badge: '8-K',
    company: 'Apple Inc (AAPL)',
    title: 'Material Definitive Agreement',
    summary:
      'Entered into a $5B revolving credit facility with a consortium of banks. ' +
      'Replaces existing $3B facility expiring Q2 2026. Signals preparation for ' +
      'potential large acquisition or capital deployment.',
  },
  {
    importance: 'MEDIUM',
    importanceColorKey: 'medium',
    badge: '10-Q',
    company: 'Microsoft Corp (MSFT)',
    title: 'Quarterly Report',
    summary:
      'Revenue $65.2B (+14% YoY). Cloud segment grew 22%. Operating margin ' +
      'expanded 180bps to 44.2%. Raised full-year guidance by $2B on AI demand strength.',
  },
];
