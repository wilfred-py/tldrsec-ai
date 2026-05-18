/**
 * 2026-05 waitlist launch — VRT Q1 2026 10-Q hero payload.
 *
 * Single hand-curated filing summary used as the E1 hero for the Wed 2026-05-20
 * waitlist broadcast. Numbers verified via web search 2026-05-17 against
 * Vertiv's Q1 2026 press release (filed 2026-04-22) and Yahoo Finance.
 *
 * This is intentionally hard-coded for one launch cohort. The general
 * `fetchCampaignFilings()` path continues to serve the cohort-mode admin sends.
 * Region-mode sends (the cron-fired Wed launch) substitute this fixture so the
 * subject line, signal verdict, transaction table, and founder note all line
 * up with the locked subject:
 *
 *   "The AI 10-Q most investors missed: Vertiv's backlog doubled to $15B"
 *
 * Sources (2026-05-17):
 *   - investors.vertiv.com Q1 2026 press release
 *   - finance.yahoo.com VRT quote + earnings
 *   - calculations: ~$100 (May 2025) → $371 (May 2026) ≈ 3.7x
 *     CAT $150 anchor → $888 ≈ 5.9x; SPOT $120 anchor → $437 ≈ 3.6x
 */

export const LAUNCH_VRT_PAYLOAD = {
  ticker: 'VRT',
  companyName: 'Vertiv Holdings Co',
  filingType: '10-Q',
  filingDate: '2026-04-22',
  filerName: undefined as string | undefined,
  filerRole: undefined as string | undefined,
  signalLevel: 'HIGH' as const,
  signalVerdict: "Backlog more than doubled YoY to over $15B",
  signalDescription:
    'Adjusted diluted EPS up 83% YoY to $1.17, beating consensus ~16%. Full-year guidance raised. AI-infrastructure demand showing up directly in project backlog.',
  /**
   * Body summary rendered via markdownToHtml() in CampaignDemoTemplate.
   * Paragraph breaks via blank lines. Keep it observational (Levine-style),
   * not promotional.
   */
  summaryText: [
    "Vertiv reported Q1 2026 results on April 22, 2026. Net sales rose to roughly $2.04B, adjusted operating profit margin expanded ~520bps year over year, and adjusted diluted EPS came in at $1.17 against consensus near $1.01.",
    "The bigger story sits in the project backlog. Management disclosed backlog over **$15B**, more than double the prior year's level. This is the line that quantifies the AI-infrastructure tailwind for data-center power and thermal vendors. The backlog is a forward-looking commitment from hyperscalers, not the recognized revenue.",
    "Full-year guidance was raised across revenue, organic growth, adjusted operating profit, and adjusted EPS.",
  ].join('\n\n'),
  transactions: [
    { label: 'Net sales', value: '$2.04B', isBold: true, isMonospace: true },
    { label: 'Adjusted EPS', value: '$1.17', isBold: true, isMonospace: true },
    { label: 'YoY EPS growth', value: '+83%', isMonospace: true },
    { label: 'Consensus beat', value: '~16%', isMonospace: true },
    { label: 'Project backlog', value: '$15B+', isBold: true, isMonospace: true },
    { label: 'Backlog YoY', value: 'more than doubled', isMonospace: true },
  ],
  /** EDGAR filing URL — populated for the SEC.gov CTA in EmailFooter. */
  filingUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001674101&type=10-Q&dateb=&owner=include&count=40',
};

/**
 * Locked subject line (D2 + E1 in plan-v4).
 */
export const LAUNCH_SUBJECT = "The AI 10-Q most investors missed: Vertiv's backlog doubled to $15B";

/**
 * Founder note v4 — web-verified copy approved 2026-05-17.
 * Em-dash audit: zero. tldrSEC spelling preserved (lowercase tldr / uppercase SEC).
 * The CampaignDemoTemplate 'letter' variant splits on blank lines into paragraphs
 * and on single \n within a paragraph into <br/>, so the signoff renders on
 * two lines.
 */
export const LAUNCH_FOUNDER_NOTE = `I built tldrSEC because I care about my portfolio and there is no way I can read every SEC filing the companies in it produce. I was spending 10+ hours every week scouring through Management Discussion and Analysis, financial tables, key risks in annual and quarterly earnings reports, earnings call transcripts, and insider buying forms, in hopes of finding beaten down names to buy at a deep discount to their intrinsic value.

What I wanted was an equity analyst in my pocket. Someone who reads each filing within minutes of it dropping, flags what actually matters, and recognizes the patterns. Insider buying when a stock is down. A quietly accelerating segment. The kind of signal that only shows up when you stack filings across quarters.

The opportunities I noticed too late in the last few years were the ones I would have caught with this. Vertiv ran nearly 4x in twelve months. Caterpillar 6x from the $150s I wanted to buy. Spotify more than 3x from the $120s I sat on. Second and third order effects of the AI buildout, confirmed by strong evidence in the filings.

That is what tldrSEC is. An equity analyst who never gets tired, never misses anything, with a 360 degree birds-eye view of a company's industry, peers, and market sentiment.

See what tldrSEC delivers and start your 7-day free trial at tldrsec.app.

Founder, tldrSEC
Wilf`;
