/**
 * Mock SEC filing summaries for the landing hero Gmail demo widget.
 * Extracted from gmail-inbox-hero.tsx per /review_plan §1 Issue 2.
 * Pure data — no side effects, no JSX, no state.
 *
 * Note: `icon` references Lucide React components, imported here
 * so the data file is self-contained.
 *
 * Refresh cadence: weekly. Source candidates from
 *   `npx tsx scripts/refresh-landing-fixtures.ts`
 * Last refresh: 2026-04-26.
 */

import {
  AlertTriangle,
  TrendingUp,
  DollarSign,
  Users,
  FileText,
  Zap,
} from 'lucide-react';

export interface FinancialHighlight {
  metric: string;
  value: string;
  change: string;
}

export interface EmailSummary {
  id: number;
  ticker: string;
  companyName: string;
  filingType: string;
  filedAt: string;
  timeAgo: string;
  headline: string;
  preview: string;
  summaryText: string;
  keyTakeaway: string;
  investorImpact: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  importance: 'critical' | 'high' | 'medium' | 'low';
  icon: React.ComponentType<{ className?: string }>;
  isStarred: boolean;
  financialHighlights: FinancialHighlight[];
}

/**
 * Curated real summaries from the database
 * Ranked by significance and impact to investor sentiment
 * Verified against news sources for quality
 */
export const curatedSummaries: EmailSummary[] = [
  {
    id: 1,
    ticker: 'AAPL',
    companyName: 'Apple Inc.',
    filingType: '8-K',
    filedAt: 'Apr 20, 2026',
    timeAgo: '6 days ago',
    headline: 'Tim Cook to step aside — John Ternus tapped as next CEO',
    preview: "Hardware engineering chief Ternus, 50, succeeds Cook on Sept 1. Cook moves to Executive Chair; Levinson named Lead Independent Director.",
    summaryText: "Apple announced Tim Cook's transition from CEO to Executive Chair effective September 1, 2026. Senior Vice President of Hardware Engineering John Ternus, 50, will succeed as CEO and join the Board on that date. Art Levinson steps into Lead Independent Director role amid a planned leadership handover.",
    keyTakeaway: "First CEO change since 2011 telegraphed five months early — orderly succession to a Cook-trained hardware lifer, not an outside hire.",
    investorImpact: "Continuity messaging dampens transition risk; product strategy expected to stay on rails. Watch for Ternus's first capital-allocation tone-setting.",
    sentiment: 'neutral',
    importance: 'critical',
    icon: AlertTriangle,
    isStarred: true,
    financialHighlights: [
      { metric: 'New CEO', value: 'John Ternus', change: 'SVP Hardware' },
      { metric: 'Effective', value: 'Sept 1, 2026', change: '15 yrs Cook' },
      { metric: 'Lead Director', value: 'Art Levinson', change: 'New role' },
    ],
  },
  {
    id: 2,
    ticker: 'AMZN',
    companyName: 'Amazon.com, Inc.',
    filingType: '8-K',
    filedAt: 'Apr 14, 2026',
    timeAgo: '12 days ago',
    headline: 'Amazon strikes deal to acquire Globalstar — satellite play tightens',
    preview: "Definitive merger agreement signed Apr 14. Joint press release issued; transaction subject to regulatory approval and closing conditions.",
    summaryText: "Amazon entered a definitive merger agreement to acquire Globalstar, Inc. The companies issued a joint press release on April 14, 2026, outlining the deal terms. The transaction awaits regulatory approvals and standard closing conditions.",
    keyTakeaway: "Brings Globalstar's satellite spectrum and ground assets in-house — direct vertical for Project Kuiper backhaul and AWS edge connectivity.",
    investorImpact: "Defensive M&A move against SpaceX/Starlink. Watch DOJ posture and the deal price disclosure for capex impact on AWS margins.",
    sentiment: 'bullish',
    importance: 'critical',
    icon: Zap,
    isStarred: true,
    financialHighlights: [
      { metric: 'Target', value: 'Globalstar', change: 'Sat infra' },
      { metric: 'Status', value: 'Definitive', change: 'Pending close' },
      { metric: 'Strategy', value: 'Kuiper boost', change: 'Vs Starlink' },
    ],
  },
  {
    id: 3,
    ticker: 'TSLA',
    companyName: 'Tesla, Inc.',
    filingType: 'Form 4',
    filedAt: 'Apr 23, 2026',
    timeAgo: '3 days ago',
    headline: 'Musk forfeits 96M Tesla shares in Tornetta unwind',
    preview: "Non-cash forfeiture at $0/share tied to 2025 RSU award under 2019 plan. Direct stake drops 18.5% to 423.7M shares.",
    summaryText: "Tesla CEO Elon Musk forfeited 96,000,000 common shares on 2026-04-21 at $0.00 per share due to a Tornetta Decision Event tied to a 2025 restricted stock award under the 2019 Equity Incentive Plan. Direct holdings fell to 423,743,904 shares post-transaction, including performance-based restricted stock vesting in 2033 or 2035. This non-cash disposition cuts his direct stake by 18.5%, carrying a neutral signal.",
    keyTakeaway: "Mechanical reversal of disputed 2018 award under the Tornetta ruling — not a sale, not a vote of no confidence. Performance-based grants vesting through 2035 stay intact.",
    investorImpact: "Headline share-count drop is cosmetic; long-term alignment unchanged. Resolves a multi-year overhang from the Delaware comp litigation.",
    sentiment: 'neutral',
    importance: 'critical',
    icon: AlertTriangle,
    isStarred: true,
    financialHighlights: [
      { metric: 'Shares Forfeited', value: '96M', change: '-18.5%' },
      { metric: 'Direct Holdings', value: '423.7M', change: 'Post-event' },
      { metric: 'Trigger', value: 'Tornetta', change: 'Non-cash' },
    ],
  },
  {
    id: 4,
    ticker: 'AMZN',
    companyName: 'Amazon.com, Inc.',
    filingType: 'Form 4',
    filedAt: 'Apr 21, 2026',
    timeAgo: '5 days ago',
    headline: 'CEO Andy Jassy cashes $7.9M at $255/share',
    preview: "31,000 shares sold under Nov 2025 10b5-1 plan. Direct holdings now 2.21M; trust and 401(k) positions intact.",
    summaryText: "Amazon President and CEO Andrew R. Jassy sold 31,000 common shares at $255 each on April 17, 2026, generating $7.9M. The open-market divestiture executed under a Rule 10b5-1 plan adopted November 14, 2025, reduced his direct holdings to 2,207,118 shares. He maintains indirect positions of 65,500 shares in trust and 9,923 shares in his Amazon.com 401(k) plan account.",
    keyTakeaway: "Pre-planned 10b5-1 sale near recent highs — routine diversification by a CEO who still holds 2.2M direct + indirect positions.",
    investorImpact: "Negligible signal value: 10b5-1 sales are scheduled months in advance. Don't read it as a top call.",
    sentiment: 'neutral',
    importance: 'critical',
    icon: DollarSign,
    isStarred: false,
    financialHighlights: [
      { metric: 'Sale Proceeds', value: '$7.9M', change: '31k shares' },
      { metric: 'Sale Price', value: '$255', change: '10b5-1' },
      { metric: 'Direct Holdings', value: '2.21M', change: 'Post-sale' },
    ],
  },
  {
    id: 5,
    ticker: 'AAPL',
    companyName: 'Apple Inc.',
    filingType: 'Form 4',
    filedAt: 'Apr 3, 2026',
    timeAgo: '23 days ago',
    headline: 'Tim Cook sells $16.5M post-RSU vest — net stake unchanged',
    preview: "131,576 RSUs settled; Apple withheld 66,627 for taxes. Cook sold 64,949 shares across 7 tranches under May 2024 10b5-1 plan.",
    summaryText: "Apple CEO Timothy D. Cook settled 131,576 RSUs into common stock on 2026-04-01. Apple withheld 66,627 shares for tax withholding at $255.63 per share, and Cook sold 64,949 shares across seven tranches for $16.5M on 2026-04-02 under a Rule 10b5-1 plan adopted May 24, 2024. Direct holdings totaled 3,280,418 shares post-transaction, matching pre-vesting levels for a routine compensation event with net zero change.",
    keyTakeaway: "Net-zero RSU vest event — Cook's direct stake actually unchanged. Annual ritual that media will misread as 'CEO sells stock'.",
    investorImpact: "Zero signal. The headline number is a vesting-and-cover transaction, not a directional bet.",
    sentiment: 'neutral',
    importance: 'high',
    icon: DollarSign,
    isStarred: false,
    financialHighlights: [
      { metric: 'Sale Proceeds', value: '$16.5M', change: '64,949 sh' },
      { metric: 'Direct Holdings', value: '3.28M', change: 'Net zero' },
      { metric: 'Plan Date', value: 'May 2024', change: '10b5-1' },
    ],
  },
  {
    id: 6,
    ticker: 'JNJ',
    companyName: 'Johnson & Johnson',
    filingType: '8-K',
    filedAt: 'Apr 14, 2026',
    timeAgo: '12 days ago',
    headline: 'JNJ Q1 revenue $21.4B; dividend hiked to $1.34 — 64th straight year',
    preview: "Revenue +2.3% YoY, +5% QoQ on pharma growth. EPS $2.71 (-1% YoY). Quarterly dividend up 3.1%.",
    summaryText: "JNJ reported Q1 2026 revenue of $21.4B, up 2.3% year-over-year and 5% quarter-over-quarter, fueled by pharmaceutical growth. Net income slipped 1.5% to $6.7B with diluted EPS at $2.71, down 1% YoY, while gross margin held at 69%. The board also hiked the quarterly dividend 3.1% to $1.34 per share, marking the 64th straight year of increases.",
    keyTakeaway: "Modest top-line growth but the dividend-aristocrat streak holds. Pharma carries the quarter; medtech and consumer remain in the noise.",
    investorImpact: "Bond-proxy thesis intact: 64-year hike streak, stable margins, defensive cash flow. Total-return profile unchanged for income holders.",
    sentiment: 'bullish',
    importance: 'high',
    icon: TrendingUp,
    isStarred: false,
    financialHighlights: [
      { metric: 'Revenue Q1', value: '$21.4B', change: '+2.3% YoY' },
      { metric: 'EPS Diluted', value: '$2.71', change: '-1% YoY' },
      { metric: 'Dividend', value: '$1.34', change: '+3.1% (64yr)' },
    ],
  },
  {
    id: 7,
    ticker: 'BRK-B',
    companyName: 'Berkshire Hathaway Inc.',
    filingType: '8-K',
    filedAt: 'Apr 16, 2026',
    timeAgo: '10 days ago',
    headline: 'Berkshire taps debt markets — ¥265B yen + $7B USD across 6 tranches',
    preview: "Yen tranches 2.077%-3.084% (2029-2036); USD $2B 3.452% 2041s and $5B 4.037% 2056s. Mizuho and Merrill underwriting.",
    summaryText: "Berkshire Hathaway issued six tranches of senior notes totaling ¥265.3B and $7B on April 16, 2026. The offering includes ¥128.9B of 2.077% notes due 2029, ¥86.8B of 2.465% notes due 2031, ¥22.3B of 2.739% notes due 2033, ¥27.3B of 3.084% notes due 2036, $2B of 3.452% notes due 2041, and $5B of 4.037% notes due 2056. Underwriters Mizuho Securities USA LLC and Merrill Lynch International handled the sale under a January 2025 indenture.",
    keyTakeaway: "Yen tranche locks in cheap funding for the Japanese trading-house equity stack; USD long bonds price tightly versus Treasurys.",
    investorImpact: "Confirms ongoing Japan strategy and signals Buffett-team comfort financing equity holdings with structural local-currency debt. Capital allocation continues to favor opportunistic deployment over buybacks at current price levels.",
    sentiment: 'bullish',
    importance: 'high',
    icon: TrendingUp,
    isStarred: false,
    financialHighlights: [
      { metric: 'Yen Notes', value: '¥265.3B', change: '4 tranches' },
      { metric: 'USD Notes', value: '$7B', change: '2041s + 2056s' },
      { metric: 'Long Yield', value: '4.037%', change: '$5B 2056s' },
    ],
  },
  {
    id: 8,
    ticker: 'META',
    companyName: 'Meta Platforms, Inc.',
    filingType: '8-K',
    filedAt: 'Apr 14, 2026',
    timeAgo: '12 days ago',
    headline: 'Two Meta directors — Hock Tan and Tracey Travis — exit at 2026 AGM',
    preview: "Both will serve until annual meeting; not standing for re-election. Follows recent routine exec equity grants reported Mar 25.",
    summaryText: "Meta Platforms directors Hock E. Tan and Tracey T. Travis notified the board they will not stand for re-election at the 2026 Annual Meeting of Shareholders. Both will continue serving until the meeting occurs. This governance update follows recent routine executive equity grants reported on March 25, 2026.",
    keyTakeaway: "Two seasoned independents — Tan (Broadcom CEO) and Travis (former Estée Lauder CFO) — leaving simultaneously. Watch the proxy for replacement nominees.",
    investorImpact: "Refresh of board oversight on capital allocation and AI capex governance. Replacement nominees will signal what kind of scrutiny Zuckerberg's spending will face.",
    sentiment: 'neutral',
    importance: 'high',
    icon: Users,
    isStarred: false,
    financialHighlights: [
      { metric: 'Departures', value: '2 directors', change: 'Tan, Travis' },
      { metric: 'Meeting', value: '2026 AGM', change: 'Term ends' },
      { metric: 'Effective', value: 'AGM date', change: 'Independent' },
    ],
  },
  {
    id: 9,
    ticker: 'VRT',
    companyName: 'Vertiv Holdings Co',
    filingType: '10-Q',
    filedAt: 'Apr 22, 2026',
    timeAgo: '4 days ago',
    headline: 'Vertiv Q1 revenue +25% to $2.8B on AI infrastructure demand',
    preview: "Gross margin expands to 37%, net income +30% YoY to $200M, EPS $0.45. BMarko acquisition adds modular capacity.",
    summaryText: "Vertiv delivered Q1 2026 revenue of $2.8B, surging 25% YoY and 10% QoQ on robust data center infrastructure demand. Gross margin improved to 37%, supporting net income growth of 30% YoY to $200M and diluted EPS of $0.45. The recent BMarko acquisition positions the company for expanded modular solutions.",
    keyTakeaway: "Pure-play AI infrastructure beneficiary keeps printing — 25% growth on already-elevated comp, with margin expansion not just volume.",
    investorImpact: "Demand setup intact and BMarko adds modular data-center capacity. The setup that has driven the multi-year re-rate continues to deliver.",
    sentiment: 'bullish',
    importance: 'high',
    icon: Zap,
    isStarred: true,
    financialHighlights: [
      { metric: 'Revenue Q1', value: '$2.8B', change: '+25% YoY' },
      { metric: 'Gross Margin', value: '37%', change: '+expansion' },
      { metric: 'Net Income', value: '$200M', change: '+30% YoY' },
    ],
  },
  {
    id: 10,
    ticker: 'COIN',
    companyName: 'Coinbase Global, Inc.',
    filingType: 'Form 4',
    filedAt: 'Apr 20, 2026',
    timeAgo: '6 days ago',
    headline: 'Coinbase CFO Alesia Haas sells $2M under 10b5-1',
    preview: "10,020 Class A shares at $200 on Apr 16. Direct holdings dip 2.6% to 377,201; plan adopted Sept 2025.",
    summaryText: "Coinbase CFO Alesia J. Haas sold 10,020 Class A shares at $200 each for $2,004,000 on 2026-04-16. The open-market transaction pursuant to a Rule 10b5-1 trading plan adopted September 3, 2025, reduced her direct holdings to 377,201 shares from 387,221—a 2.6% decline. This routine planned sale aligns with her recent quarterly divestitures.",
    keyTakeaway: "Programmatic CFO sale on schedule. The plan was adopted seven months before execution, so this reads as cadence rather than conviction.",
    investorImpact: "Standard insider-sale noise; meaningful signal would require off-plan selling. The $200 print is a useful psychological mark for the stock.",
    sentiment: 'neutral',
    importance: 'high',
    icon: DollarSign,
    isStarred: false,
    financialHighlights: [
      { metric: 'Sale Proceeds', value: '$2.0M', change: '10,020 sh' },
      { metric: 'Sale Price', value: '$200', change: '10b5-1' },
      { metric: 'Direct Holdings', value: '377,201', change: '-2.6%' },
    ],
  },
  {
    id: 11,
    ticker: 'GOOGL',
    companyName: 'Alphabet Inc.',
    filingType: '8-K',
    filedAt: 'Apr 2, 2026',
    timeAgo: '24 days ago',
    headline: 'Alphabet principal accounting officer resigns — controller out Apr 9',
    preview: "VP & Corporate Controller Amie Thuener O'Toole departs for another opportunity. No disagreement disclosed.",
    summaryText: "Alphabet VP, Corporate Controller, and Principal Accounting Officer Amie Thuener O'Toole notified the company of her resignation effective April 9, 2026, to pursue another opportunity. The departure involves no disagreement with operations, policies, or practices. This follows her recent sale of 617 Class C shares for $178,702.",
    keyTakeaway: "Senior accounting departure with the standard no-disagreement boilerplate. Material because the principal accounting officer signs off on financial reporting.",
    investorImpact: "Watch for the named successor and any near-term restatement risk. Absent that, treat as benign personnel turnover.",
    sentiment: 'neutral',
    importance: 'high',
    icon: Users,
    isStarred: false,
    financialHighlights: [
      { metric: 'Role', value: 'PAO/Controller', change: 'Resigned' },
      { metric: 'Effective', value: 'Apr 9, 2026', change: 'Voluntary' },
      { metric: 'Disagreement', value: 'None disclosed', change: 'Standard' },
    ],
  },
  {
    id: 12,
    ticker: 'META',
    companyName: 'Meta Platforms, Inc.',
    filingType: 'Form 4',
    filedAt: 'Apr 15, 2026',
    timeAgo: '11 days ago',
    headline: 'Meta COO Javier Olivan unloads $2.94M across direct + indirect',
    preview: "4,665 Class A shares at $626-$634 on Apr 13 under Nov 2025 10b5-1. Total holdings down 3.9% to 115,632.",
    summaryText: "Meta COO Javier Olivan sold 4,665 Class A shares through direct and indirect accounts for $2,936,540 on 2026-04-13. Transactions spanned multiple price levels from $626.24 to $634.68 per share under a Rule 10b5-1 plan adopted November 17, 2025. The divestiture cut his total holdings 3.9% to 115,632 shares.",
    keyTakeaway: "Pre-planned sale at $626+ — Olivan trimming a post-RSU position. The price band tells you where he was scheduled to sell, nothing more.",
    investorImpact: "10b5-1 noise. The signal would be COO selling outside the plan; a scheduled trim at an elevated price is a non-event.",
    sentiment: 'neutral',
    importance: 'high',
    icon: DollarSign,
    isStarred: false,
    financialHighlights: [
      { metric: 'Sale Proceeds', value: '$2.94M', change: '4,665 sh' },
      { metric: 'Price Range', value: '$626-$634', change: 'Multi-level' },
      { metric: 'Total Holdings', value: '115,632', change: '-3.9%' },
    ],
  },
  {
    id: 13,
    ticker: 'TSLA',
    companyName: 'Tesla, Inc.',
    filingType: 'Form 4',
    filedAt: 'Apr 1, 2026',
    timeAgo: '25 days ago',
    headline: 'Tesla director cashes $9.3M from option exercise at strike $14.99',
    preview: "Wilson-Thompson exercised 40k options, sold 25,809 across 15 lots at $352-$367. Profit on cost basis ~$15M.",
    summaryText: "Tesla Director Kathleen Wilson-Thompson exercised 40,000 non-qualified stock options at $14.99 per share to acquire 40,000 common shares on 2026-03-30. She sold 25,809 common shares in 15 separate transactions at weighted average prices from $352.833 to $366.855, generating $9,275,096 in proceeds under a 10b5-1 plan.",
    keyTakeaway: "Massive intrinsic-value harvest — strike price $14.99, sale prices $352-367. This is what a 23x return on long-vested directors' options looks like.",
    investorImpact: "Director realization, not a directional bet. The size is striking but the strike-vs-market spread reflects multi-year vesting, not new selling pressure.",
    sentiment: 'neutral',
    importance: 'high',
    icon: DollarSign,
    isStarred: false,
    financialHighlights: [
      { metric: 'Options Exercised', value: '40,000', change: 'Strike $14.99' },
      { metric: 'Shares Sold', value: '25,809', change: '$352-$367' },
      { metric: 'Net Proceeds', value: '$9.3M', change: '15 lots' },
    ],
  },
  {
    id: 14,
    ticker: 'JNJ',
    companyName: 'Johnson & Johnson',
    filingType: '10-Q',
    filedAt: 'Apr 22, 2026',
    timeAgo: '4 days ago',
    headline: 'JNJ 10-Q backs up the print: $21.4B revenue, EPS down 1%',
    preview: "Q1 revenue +2.3% YoY, +5% QoQ on pharma. Gross margin steady at 69%. Net income $6.7B (-1.5% YoY).",
    summaryText: "JNJ posted Q1 2026 revenue of $21.4B, up 2.3% YoY and 5% QoQ, driven by pharmaceutical growth. Net income dipped 1.5% YoY to $6.7B while gross margin stayed steady at 69%. Diluted EPS came in at $2.71, down 1% YoY.",
    keyTakeaway: "10-Q confirms the 8-K headline numbers — pharma carries growth, net income mildly negative. Steady-state quarter for the dividend aristocrat.",
    investorImpact: "Operating profile unchanged. The quarterly print supports the income thesis without re-rating the multiple.",
    sentiment: 'neutral',
    importance: 'medium',
    icon: FileText,
    isStarred: false,
    financialHighlights: [
      { metric: 'Revenue Q1', value: '$21.4B', change: '+2.3% YoY' },
      { metric: 'Net Income', value: '$6.7B', change: '-1.5% YoY' },
      { metric: 'Gross Margin', value: '69%', change: 'Steady' },
    ],
  },
  {
    id: 15,
    ticker: 'GOOGL',
    companyName: 'Alphabet Inc.',
    filingType: '8-K',
    filedAt: 'Apr 10, 2026',
    timeAgo: '16 days ago',
    headline: 'Alphabet awards $150M+ in equity to four execs — TSR-tied PSUs',
    preview: "CFO Ashkenazi, CLO Walker among recipients. PSUs vs S&P 100 over 2026-2028, plus $22M transitional GSUs.",
    summaryText: "Alphabet granted equity awards with target values exceeding $150M to four executives, including CFO Anat Ashkenazi and CLO Kent Walker. The Leadership Development, Inclusion and Compensation Committee approved PSUs tied to relative TSR versus S&P 100 companies over 2026-2028 and GSUs vesting over three years, plus transitional GSUs totaling $22M after ending the SVP bonus program.",
    keyTakeaway: "Concentrated comp realignment — TSR-tied PSUs against S&P 100 raise the bar versus a flat-vest scheme, but $150M+ to four people is sizable.",
    investorImpact: "Watch for shareholder scrutiny at the AGM. The TSR-vs-S&P-100 hurdle is shareholder-friendly; the absolute dollar amount is what proxy advisors will fight about.",
    sentiment: 'neutral',
    importance: 'medium',
    icon: Users,
    isStarred: false,
    financialHighlights: [
      { metric: 'Total Awards', value: '$150M+', change: '4 execs' },
      { metric: 'PSU Hurdle', value: 'TSR vs S&P 100', change: '2026-2028' },
      { metric: 'Transitional', value: '$22M GSUs', change: 'No SVP bonus' },
    ],
  },
];
