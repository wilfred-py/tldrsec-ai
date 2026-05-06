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
 *
 * Voice: locked Variant C Hybrid from `.claude/tasks/design-shotgun/email-1-hero-2026-04-29/`.
 * `heroHeadline` is dry, ticker-prefixed, observational (Levine-style).
 * `whyItMatters` carries the Hormozi value-equation framing — only the gloss
 * does conversion work.
 */
export interface CampaignFallbackHero {
  ticker: string;
  companyName: string;
  /** Dry, ticker-prefixed headline. Cap at 90 chars (EmailHeroBlock enforces). */
  heroHeadline: string;
  /** Brand-purple "why it matters" gloss. Optional, but always set in fallback. */
  whyItMatters: string;
  summaryBody: string;
  filingType: string;
  filingDate: Date;
  importance: 'critical' | 'high' | 'medium' | 'low';
  importanceLabel: string;
  filedDateLabel: string;
  /**
   * Real EDGAR archive URL for the "Source: SEC EDGAR" audit link in the
   * hero. Mirrors what production filing emails get from `Summary.filingUrl`
   * — the campaign code runs this through `getSecFilingViewerUrl()` so it
   * opens the actual filing index, not a search-results listing. Refresh
   * quarterly when the curated narrative is rotated to a new filing.
   */
  filingUrl: string;
  variantBSubject: string;
  variantASubject: string;
  variantBPreheader: string;
  variantAPreheader: string;
}

export const CAMPAIGN_FALLBACK_HERO: CampaignFallbackHero = {
  ticker: 'NVDA',
  companyName: 'NVIDIA Corp',
  heroHeadline: 'NVDA: 3 customers each booked over 13% last quarter',
  whyItMatters:
    'Each of those three is shipping its own AI silicon to replace H100s. ' +
    'The "customer concentration is temporary" footnote has widened for ' +
    'three straight quarters now.',
  summaryBody:
    'Customer concentration disclosure widened for the third straight quarter. ' +
    'Three customers each contributed more than 13% of total revenue, up from ' +
    'two a year ago. Data center segment revenue grew 94% year-over-year while ' +
    'China revenue fell to roughly 4% of total amid tightened export controls. ' +
    'Inventory and supply commitments now exceed $32B against a $35B revenue quarter.',
  filingType: '10-Q',
  filingDate: new Date('2026-03-12'),
  importance: 'high',
  importanceLabel: 'HIGH',
  filedDateLabel: 'March 2026',
  // Empty by design: the curated fallback narrative doesn't correspond to a
  // single real filing, and hardcoded accession numbers rotted to 404s in
  // QA. `getSecFilingViewerUrl('')` returns EDGAR's companysearch landing
  // page — a real, working entry point where users can audit the source by
  // searching the ticker themselves. DB-driven sends still get real URLs
  // through `toCampaignFiling` → `Summary.filingUrl`.
  filingUrl: '',
  variantASubject: 'NVDA: 3 customers each booked over 13% last quarter',
  variantBSubject: 'The 10-Q every NVDA holder needs to see',
  variantAPreheader:
    'Each of those three is also shipping AI silicon to replace H100s.',
  variantBPreheader:
    'Customer concentration footnote widened for the third straight quarter.',
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
    badge: '10-K',
    company: 'Tesla Inc (TSLA)',
    title: 'Going-concern language tied to Musk comp re-ratification',
    summary:
      'Annual report flags the shareholder re-ratification of the $56B 2018 ' +
      'compensation package as a material risk. Delaware court voided the ' +
      'original award; the 10-K discloses no documented plan B if the second ' +
      'vote also fails.',
  },
  {
    importance: 'HIGH',
    importanceColorKey: 'high',
    badge: '10-Q',
    company: 'Meta Platforms (META)',
    title: 'Reality Labs lost $4.5B this quarter, cumulative now over $60B',
    summary:
      'Reality Labs operating losses now exceed cumulative segment revenue ' +
      'by 11x. Management reiterated the multi-year investment posture and ' +
      'declined to project a breakeven year for the segment.',
  },
  {
    importance: 'MEDIUM',
    importanceColorKey: 'medium',
    badge: '10-K',
    company: 'Alphabet Inc (GOOGL)',
    title: 'Search antitrust ruling now disclosed as a material risk',
    summary:
      'First annual report after the DOJ search-monopoly verdict. The risk ' +
      'factor section names two structural remedies under DOJ consideration ' +
      'and concedes either would force restated economics for Search.',
  },
];
