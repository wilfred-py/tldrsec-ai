/**
 * 2026-05 waitlist launch — VRT Q1 2026 10-Q hero payload (v6).
 *
 * v6 changes after Wilf's 2026-05-21 visual critique:
 *   - Scorecard: replaced "Full-Year EPS Guide" (only said "raised") with
 *     "Adj Op Profit" — direct dollar measure of earnings power, derived
 *     from net sales x op margin (verifiable from press release).
 *   - WIM + summary: Bloomberg-style 2-4 word lead bolding (markdown **),
 *     more paragraphing for skim-ability, explicit +/- signs on every
 *     percentage so wrapPercentsInPills colors them green/red instead of
 *     neutral gray.
 *   - xSentiment: restructured to match XSentimentSectionProps shape
 *     (direction, confidence, discussionSynthesis, factClaims, citationUrls).
 *     Will now actually render via XSentimentBlock instead of being filtered
 *     out by shouldRenderXSentiment.
 *   - filingUrl: use the press-release exhibit URL (real SEC.gov archive
 *     path) instead of the cgi-bin search URL that redirected to results.
 *   - Founder note: trimmed (no multibagger paragraph), more paragraphing.
 *
 * Numbers web-verified 2026-05-20.
 */

import type { FilingTemplateData } from '@/lib/email/types';

/** Locked subject (rewritten 2026-05-20 after backlog fact-check). */
export const LAUNCH_SUBJECT =
  "Vertiv Q1: $653M cash, EPS +83%. The AI 10-Q most investors missed.";

const MATERIALITY = {
  score: 'high' as const,
  rationale:
    'Net sales up 30% YoY to $2.65B and adjusted free cash flow of $653M confirm Vertiv is converting AI-infrastructure demand into earnings. The Q1 backlog disclosure was withheld, a notable change worth tracking.',
};

/**
 * Earnings Scorecard. Five rows. Per Wilf's v7 critique: don't strip or pad
 * zeros — compute the actual values from real source data, then express to
 * 1 decimal place where precision changes the read. Sources:
 *   Q1 2026 / Q1 2025 / Q4 2025 actuals from Vertiv press releases.
 *
 * Computed deltas (verified):
 *   Net Sales:   2,649.5/2,038 - 1 = +30.0% YoY;  2,649.5/2,880 - 1 = -8.0% QoQ
 *   Adj EPS:     1.17/0.64 - 1     = +82.8% YoY;  1.17/1.36 - 1     = -14.0% QoQ
 *   Op Margin:   20.8/17.0 - 1     = +22.4% YoY;  20.8/23.2 - 1     = -10.3% QoQ
 *   Op Profit:   551.5/346.5 - 1   = +59.2% YoY;  551.5/668.2 - 1   = -17.5% QoQ
 *   Adj FCF:     653/307 - 1       = +112.7% YoY; 653/910 - 1       = -28.2% QoQ
 */
const FINANCIAL_HIGHLIGHTS = [
  {
    label: 'Net Sales',
    value: '$2.65B',
    priorValue: '$2.04B',
    change: '+30.0%',
    qoqChange: '-8.0%',
  },
  {
    label: 'Adjusted EPS',
    value: '$1.17',
    priorValue: '$0.64',
    change: '+82.8%',
    qoqChange: '-14.0%',
  },
  {
    label: 'Adj Op Margin',
    value: '20.8%',
    priorValue: '17.0%',
    change: '+22.4%',
    qoqChange: '-10.3%',
  },
  {
    label: 'Adj Op Profit',
    value: '$551M',
    priorValue: '$347M',
    change: '+59.2%',
    qoqChange: '-17.5%',
  },
  {
    label: 'Adj Free Cash Flow',
    value: '$653M',
    priorValue: '$307M',
    change: '+112.7%',
    qoqChange: '-28.2%',
  },
];

/**
 * X sentiment payload (Twitter is now X; the platform reference reflects
 * the rebrand). Restructured to match `XSentimentSectionProps` exactly.
 * Synthesis uses Bloomberg-style **bold leads** per Wilf's v7 critique.
 */
const X_SENTIMENT = {
  direction: 'mixed' as const,
  shift: 'stable' as const,
  confidence: 'medium' as const,
  windowHours: 168,
  discussionSynthesis:
    "**Bulls** anchor to the Q4 2025 backlog of $15B and the 2.9x book-to-bill ratio [1]. **Bears** flag the missing Q1 backlog disclosure at a forward PE of ~53x as a risk asymmetry [2]. **Sell-side** moved earnings estimates upward post-Q1, but consensus price target now sits below current price [3].",
  factClaims: [
    'Bull case: Q4 2025 ending backlog $15B, book-to-bill ~2.9x (about three dollars of new orders for every dollar shipped)',
    'Bear case: no Q1 backlog figure disclosed, forward PE ~53x leaves no margin of safety for execution misses',
    'Sell-side: seven analysts revised earnings upward; consensus price target $271 sits below the recent trading level',
  ],
  citationUrls: [
    'https://247wallst.com/investing/2026/04/10/think-its-too-late-to-buy-vertiv-heres-why-the-15-billion-backlog-says-otherwise/',
    'https://seekingalpha.com/article/4894167-vertiv-backlog-silence-isnt-busting-the-bull-case-yet',
    'https://www.investing.com/analysis/vertiv-the-backlog-is-massive-the-margin-of-safety-is-not-200679861',
  ],
};

/**
 * Summary prose — Bloomberg-style 2-4 word lead bolding (markdown **),
 * explicit-sign deltas so wrapPercentsInPills colors them green. Two
 * tight paragraphs.
 */
const SUMMARY_PROSE = [
  "**Q1 was strong.** Net sales **+30%** YoY to $2.65B, adjusted operating margin expanded **+3.8pp** to 20.8%, adjusted diluted EPS **+83%** to $1.17 against consensus near $1.01.",
  "**The headline number is the cash.** Adjusted free cash flow of $653M (**+113%** YoY) funds capacity expansion without share dilution. It is the cleanest read-through to second-order AI demand.",
].join('\n\n');

/**
 * Why It Matters. Three short paragraphs with Bloomberg-style lead bolding.
 * Every numeric delta has an explicit +/- sign so pills color correctly.
 * Em-dash audit: zero.
 */
const WHY_IT_MATTERS = [
  "**The standout for AI investors is the cash.** Vertiv is converting orders into cash at a rate that funds aggressive capacity expansion without diluting shareholders. The **+3.8pp** YoY margin expansion (17.0% to 20.8%) says supply is keeping up with demand without pricing erosion.",
  "**But this 10-Q carries a tell.** For the first time in recent quarters, Vertiv did not disclose a backlog figure. CEO Albertazzi said the pipeline is 'not dramatically different, if anything a little more elongated' but gave no dollar number. Bulls point to the Q4 2025 backlog of $15B and the **2.9x** book-to-bill, an extraordinary forward-coverage ratio. Bears read the silence as a yellow flag at a forward PE of **53x**, where any execution miss has no margin of safety.",
  "**What to watch.** Whether the next 10-Q restores the backlog disclosure, and whether free cash flow holds above $500M per quarter through the seasonal Q2 to Q3 trough.",
].join('\n\n');

/**
 * Full FilingTemplateData payload. filingUrl now points at the press-release
 * exhibit (real SEC archive path) instead of the cgi-bin search URL that
 * redirected to results — see ce087d2e fix history.
 */
export const LAUNCH_VRT_FILING: FilingTemplateData = {
  companyName: 'Vertiv Holdings Co',
  symbol: 'VRT',
  filingType: '10-Q',
  filingDate: '2026-04-22',
  filingUrl:
    'https://www.sec.gov/Archives/edgar/data/0001674101/000162828026026379/q12026exhibit991vrt04222026.htm',
  summaryText: '',
  summaryData: {
    headline:
      "VRT Q1 2026: $2.65B net sales (+30%), $1.17 adj EPS (+83%), $653M adj free cash flow",
    summary: SUMMARY_PROSE,
    whyItMatters: WHY_IT_MATTERS,
    financialHighlights: FINANCIAL_HIGHLIGHTS,
    materialitySignal: MATERIALITY,
    xSentiment: X_SENTIMENT,
  } as never,
};

/**
 * Founder note v6 — trimmed per Wilf's 2026-05-21 critique:
 *   - Removed the multibagger paragraph entirely ("The opportunities I
 *     noticed too late..."). Too verbose, dropped the specific tickers
 *     anyway, the section wasn't pulling weight.
 *   - More paragraphing for skim-ability.
 *   - Em-dash audit clean.
 */
export const LAUNCH_FOUNDER_NOTE = `I built tldrSEC because I care about my portfolio and there is no way I can read every SEC filing the companies in it produce.

I was spending 10+ hours every week scouring through Management Discussion and Analysis, financial tables, key risks, earnings call transcripts, and insider buying forms, in hopes of finding beaten down names to buy at a deep discount to their intrinsic value.

What I wanted was an equity analyst in my pocket. Someone who reads each filing within minutes of it dropping, flags what actually matters, and recognizes the patterns. Insider buying when a stock is down. A quietly accelerating segment. The kind of signal that only shows up when you stack filings across quarters.

That is what tldrSEC is. An equity analyst who never gets tired, never misses anything, with a 360 degree birds-eye view of a company's industry, peers, and market sentiment.

Cut through the noise.`;

/** Signoff lines, rendered separately so the CTA button can slot above. */
export const LAUNCH_FOUNDER_SIGNOFF = `Founder, tldrSEC
Wilf`;

/** CTA button text. Per-subscriber URL built at render time. */
export const LAUNCH_CTA_TEXT = 'Start your 7-day free trial';
