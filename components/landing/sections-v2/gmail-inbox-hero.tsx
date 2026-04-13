'use client';

import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/auth-context';
import {
  ArrowRight,
  CheckCircle2,
  Mail,
  Star,
  Archive,
  Trash2,
  MoreVertical,
  RefreshCw,
  X,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  DollarSign,
  Users,
  FileText,
  BarChart3,
  Zap,
  Clock,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import Link from 'next/link';
import {
  staggerContainer,
  staggerItem,
  meshGradientStyle,
} from '@/lib/animations/landing-animations';

// Constants for animation and layout
const INITIAL_EMAIL_COUNT = 6;
const MAX_EMAIL_COUNT = 12;
const DELIVERY_INTERVAL = 5000; // Fixed 5 second delivery when not interacting
const EMAIL_ROW_HEIGHT = 52; // Fixed height for email rows in pixels

// TypeScript interfaces for component props and data structures
interface FinancialHighlight {
  metric: string;
  value: string;
  change: string;
}

interface EmailSummary {
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

interface GmailInboxHeroProps {
  className?: string;
  heroRef?: React.RefObject<HTMLElement>;
}

/**
 * Curated real summaries from the database
 * Ranked by significance and impact to investor sentiment
 * Verified against news sources for quality
 */
const curatedSummaries: EmailSummary[] = [
  {
    id: 1,
    ticker: 'TSLA',
    companyName: 'Tesla, Inc.',
    filingType: 'DEFA14A',
    filedAt: 'Oct 28, 2025',
    timeAgo: '2 hours ago',
    headline: "Tesla urges $1tn Musk pay vote—'high odds' he quits without it",
    preview: "Board Chair Robyn Denholm tours NYC institutions, counters ISS/Glass Lewis 'no' recs. Nov 6 vote locks Musk's 25% control for AI safety.",
    summaryText: "Tesla blasts letters, interviews, and X posts urging yes vote on Musk's $1tn pay package by Nov 6—Denholm admits high odds Musk quits without it, eyeing internal successors like Tom Zhu. Board Chair Robyn Denholm tours NYC institutions, counters ISS/Glass Lewis 'no' recs, stresses package delivers Musk 25% voting control first (economic rights lag 7.5-10 years) to safeguard AI/robot armies—not cash grab.",
    keyTakeaway: "Nov 6 vote locks Musk's 25% control for AI safety, or Tesla risks CEO walkout—no named Plan B beyond internals.",
    investorImpact: "Pass secures Musk's focus on $8.5tn vision; fail sparks leadership chaos, stock plunge.",
    sentiment: 'bullish',
    importance: 'critical',
    icon: AlertTriangle,
    isStarred: true,
    financialHighlights: [
      { metric: 'Pay Package', value: '$1tn', change: '+12 tranches' },
      { metric: 'Market Cap Target', value: '$8.5tn', change: '6x current' },
      { metric: 'EBITDA Milestone', value: '$50B-$400B', change: '3x highest' },
    ],
  },
  {
    id: 2,
    ticker: 'GOOGL',
    companyName: 'Alphabet Inc.',
    filingType: 'FWP',
    filedAt: 'Nov 4, 2025',
    timeAgo: '4 hours ago',
    headline: 'Alphabet raises $17.5B in bonds for AI expansion',
    preview: "Seven tranches spanning 2028-2075 at sub-6% yields. Biggest $4B 2055s at 5.450% coupon—tight spreads signal strong demand.",
    summaryText: "Alphabet priced $17.5B in senior notes across seven tranches plus floaters, biggest $4B 2055s at 5.450% coupon yielding 5.495% (T+82bps). Company locks in cheap debt now—yields climb from 3.905% on 2028s to 5.745% on 2075s—net proceeds top $17.4B before expenses, funding AI capex or buybacks without dilution.",
    keyTakeaway: "Alphabet grabs $17.5B at peak-tight spreads (T+30-107bps), fueling balance sheet for capex without share dilution.",
    investorImpact: "Cheap long-dated debt (up to 2075s under 6% YTM) enhances flexibility, pure bull signal for equity holders.",
    sentiment: 'bullish',
    importance: 'high',
    icon: TrendingUp,
    isStarred: true,
    financialHighlights: [
      { metric: 'Total Raised', value: '$17.5B', change: '+7 tranches' },
      { metric: 'Longest Maturity', value: '2075', change: '50 years' },
      { metric: 'Spread Range', value: 'T+30-107bps', change: 'Tight' },
    ],
  },
  {
    id: 3,
    ticker: 'NVDA',
    companyName: 'NVIDIA Corporation',
    filingType: 'Form 4',
    filedAt: 'Oct 29, 2025',
    timeAgo: '6 hours ago',
    headline: "Jensen Huang sells $23.56M—routine 10b5-1, not a bailout",
    preview: "CEO sold 125,000 shares via pre-planned sale. Direct holdings at 69.7M shares, pocket change against 782M indirect in trusts.",
    summaryText: "NVIDIA CEO Jen-Hsun Huang sold 125,000 shares for $23.56M at $184.24-$202.64/share Oct 24-28 via March 2025 10b5-1 plan. Direct holdings dropped to 69,758,203 from 69,883,203—a 0.18% trim, pocket change against 782M indirect shares in trusts/LLCs. Routine auto-sell into strength, not a bailout—insiders diversify mechanically.",
    keyTakeaway: "Programmed 10b5-1 sale cashed $23.56M without signaling doubt—standard for execs sitting on billions.",
    investorImpact: "Negligible direct stake dip via autopilot plan; bullish context intact, no reason to flinch.",
    sentiment: 'neutral',
    importance: 'medium',
    icon: DollarSign,
    isStarred: false,
    financialHighlights: [
      { metric: 'Shares Sold', value: '125,000', change: '-0.18%' },
      { metric: 'Sale Proceeds', value: '$23.56M', change: '10b5-1' },
      { metric: 'Indirect Holdings', value: '782M', change: 'Unchanged' },
    ],
  },
  {
    id: 4,
    ticker: 'CMG',
    companyName: 'Chipotle Mexican Grill',
    filingType: '10-Q',
    filedAt: 'Oct 29, 2025',
    timeAgo: '8 hours ago',
    headline: 'Q3 revenue +7.5% to $3B but traffic woes persist',
    preview: "Comp sales eked out 0.3% on 1.1% higher checks offset by 0.8% transaction drop. Buybacks slashed shares 2.5% YTD.",
    summaryText: "Chipotle's Q3 revenue surged 7.5% to $3.00B, but comp sales eked out just 0.3% on 1.1% higher checks offset by 0.8% transaction drop—traffic woes persist. Restaurant-level margins held firm at 25.2% despite wage hikes, thanks to prior menu pricing, while G&A jumped 15.9% to $147M on retention bonuses post-CEO exit.",
    keyTakeaway: "Buybacks slashed shares 2.5% YTD to 1.325B outstanding, juicing EPS despite traffic slump—$652M auth remains for more.",
    investorImpact: "Unit growth and buybacks bolster EPS growth thesis, but persistent traffic weakness signals pricing power erosion amid macro pressures.",
    sentiment: 'bearish',
    importance: 'high',
    icon: TrendingDown,
    isStarred: false,
    financialHighlights: [
      { metric: 'Revenue Q3', value: '$3.00B', change: '+7.5% YoY' },
      { metric: 'Comp Sales', value: '+0.3%', change: 'Traffic -0.8%' },
      { metric: 'EPS Q3', value: '$0.29', change: '+3.6%' },
    ],
  },
  {
    id: 5,
    ticker: 'GOOGL',
    companyName: 'Alphabet Inc.',
    filingType: 'FWP',
    filedAt: 'Nov 3, 2025',
    timeAgo: '12 hours ago',
    headline: 'Alphabet locks in €6.5B in Euro notes at tight spreads',
    preview: "Six tranches spanning 2028-2064, yields from 2.476% to 4.474%. Net proceeds €6.417B for AI capex and debt paydown.",
    summaryText: "Alphabet priced €6.5B in Euro-denominated senior notes spanning 2028-2064, locking in yields from 2.476% (2028s) to 4.474% (2064s)—tight spreads like +25bps to mid-swaps on short end signal strong demand. Net proceeds hit €6.417B after skimpy underwriting cuts (0.15%-0.60%), earmarked for general corporate uses including debt paydown.",
    keyTakeaway: "€6.5B raised at sub-4.5% yields to 2064 locks ultra-cheap debt for capex/buybacks—no dilution red flag.",
    investorImpact: "Bullish signal: pristine pricing reflects GOOGL's funding edge, fuels growth without share pressure.",
    sentiment: 'bullish',
    importance: 'high',
    icon: TrendingUp,
    isStarred: false,
    financialHighlights: [
      { metric: 'Total Raised', value: '€6.5B', change: '6 tranches' },
      { metric: 'Yield Range', value: '2.5%-4.5%', change: 'Sub-market' },
      { metric: 'Net Proceeds', value: '€6.417B', change: 'AI capex' },
    ],
  },
  {
    id: 6,
    ticker: 'VRT',
    companyName: 'Vertiv Holdings Co',
    filingType: '10-Q',
    filedAt: 'Nov 3, 2025',
    timeAgo: '1 day ago',
    headline: 'Organic orders surge 60% on AI data center demand',
    preview: "Q3 revenue up 29% to $2.68B, backlog swells to $9.5B. Caterpillar partnership expands power and cooling offerings.",
    summaryText: "Vertiv reported Q3 net sales of $2,676M, up 29% YoY driven by 43% Americas growth. Organic orders surged 60% YoY, with book-to-bill ratio of 1.4x and backlog at $9.5B. New OCP-compliant rack solutions support 142kW loads for AI infrastructure.",
    keyTakeaway: "AI infrastructure pure-play sees 60% order growth, 29% revenue jump—backlog at $9.5B signals sustained demand.",
    investorImpact: "Clear winner from AI data center buildout. Caterpillar partnership and liquid cooling demand accelerate.",
    sentiment: 'bullish',
    importance: 'high',
    icon: Zap,
    isStarred: true,
    financialHighlights: [
      { metric: 'Revenue Q3', value: '$2.68B', change: '+29% YoY' },
      { metric: 'Organic Orders', value: '+60%', change: 'YoY' },
      { metric: 'Backlog', value: '$9.5B', change: '1.4x B2B' },
    ],
  },
  {
    id: 7,
    ticker: 'TSLA',
    companyName: 'Tesla, Inc.',
    filingType: 'DEFA14A',
    filedAt: 'Nov 4, 2025',
    timeAgo: '1 day ago',
    headline: 'Counterpoint Global votes FOR Musk comp plan',
    preview: "Morgan Stanley's active investor endorses skin-in-game leadership. Cites Musk's irreplaceable role in mobility, energy, robotics.",
    summaryText: "Tesla unleashes Musk, Gebbia, and Taneja on X November 3-4 to rally votes for Musk's performance-based comp plan at 2025 AGM. Counterpoint Global (Morgan Stanley) piles on, voting FOR the plan because Musk delivers culture, returns, and upside in mobility, energy, robotics; wants his 'skin in the game.'",
    keyTakeaway: "Counterpoint Global's public FOR vote bolsters Musk comp approval odds, signaling institutional buy-in on skin-in-game leadership.",
    investorImpact: "Ramps proxy win probability, locking Musk to Tesla milestones—bullish for alignment if passed.",
    sentiment: 'bullish',
    importance: 'medium',
    icon: Users,
    isStarred: false,
    financialHighlights: [
      { metric: 'Endorsement', value: 'FOR', change: 'Counterpoint' },
      { metric: 'Rationale', value: 'Skin-in-game', change: 'Leadership' },
      { metric: 'Vote Date', value: 'Nov 6', change: '2 days' },
    ],
  },
  {
    id: 8,
    ticker: 'KO',
    companyName: 'Coca-Cola Co',
    filingType: 'Form 4',
    filedAt: 'Oct 31, 2025',
    timeAgo: '2 days ago',
    headline: 'CFO gifts 33k shares to kids—trust dissolved',
    preview: "Murphy shifted 74,400 more to direct holdings now at 279,911 shares. Estate planning, not a sale—price $0, code G.",
    summaryText: "KO CFO John Murphy gifted 33,000 shares to his kids on 10/29/2025 via trust termination, shifting 74,400 more to his direct holdings now at 279,911 shares. Trust dissolved completely—no indirect shares left there—while wife holds 2,407 and his 401(k) has 1,027. Not a sale (price $0, code G), just estate planning.",
    keyTakeaway: "Murphy gifted 33k shares to kids, not sold—neutral estate move, no cash exit.",
    investorImpact: "Bearish if pattern emerges, but single gift signals routine planning over panic.",
    sentiment: 'neutral',
    importance: 'low',
    icon: Users,
    isStarred: false,
    financialHighlights: [
      { metric: 'Shares Gifted', value: '33,000', change: 'To children' },
      { metric: 'Direct Holdings', value: '279,911', change: '+74,400' },
      { metric: 'Transaction Type', value: 'Gift', change: 'No proceeds' },
    ],
  },
  {
    id: 9,
    ticker: 'NVDA',
    companyName: 'NVIDIA Corporation',
    filingType: '144',
    filedAt: 'Oct 29, 2025',
    timeAgo: '2 days ago',
    headline: "Huang's 4.1M-share 3-month sell-off continues",
    preview: "CEO plans to sell 25,000 more shares ($5.2M). 56 transactions since July under pre-planned 10b5-1—routine diversification.",
    summaryText: "NVIDIA CEO Jensen Huang plans to sell 25,000 shares ($5.2M at $207.91/share) on 10/29/2025 via Charles Schwab. This caps a 3-month sell-off where he dumped 4.1M shares across 56 transactions—54 lots of 75,000 shares plus two 25,000-share trades from 7/29 to 10/28.",
    keyTakeaway: "Huang's 4.1M-share 3-month sell-off plus $5.2M more is standard 10b5-1 housekeeping for a billionaire CEO, not a red flag.",
    investorImpact: "Negligible supply hit from planned insider sales; ignore unless volume spikes off-plan.",
    sentiment: 'neutral',
    importance: 'low',
    icon: DollarSign,
    isStarred: false,
    financialHighlights: [
      { metric: 'Planned Sale', value: '25,000', change: '$5.2M' },
      { metric: '3-Month Total', value: '4.1M', change: '56 trades' },
      { metric: 'Outstanding %', value: '0.017%', change: 'Negligible' },
    ],
  },
  {
    id: 10,
    ticker: 'GOOGL',
    companyName: 'Alphabet Inc.',
    filingType: 'Form 4',
    filedAt: 'Nov 4, 2025',
    timeAgo: '3 days ago',
    headline: 'CEO Sundar Pichai sells $8.1M in stock',
    preview: "Sales executed at $247-$252 near 52-week high. Rule 10b5-1 plan from Dec 2024—now holds 2.37M Class C shares.",
    summaryText: "Alphabet CEO Sundar Pichai sold $8.13M worth of Class C stock on October 15 in multiple transactions at $247-$252, near the 52-week high of $256.96. Sales under Rule 10b5-1 plan adopted December 2024. Directly owns 2,369,619 Class C shares post-sale.",
    keyTakeaway: "Pre-planned 10b5-1 sale by CEO near highs—standard diversification, not a warning sign.",
    investorImpact: "Routine insider sale under preset plan; GOOGL's AI momentum and bond raise overshadow noise.",
    sentiment: 'neutral',
    importance: 'low',
    icon: DollarSign,
    isStarred: false,
    financialHighlights: [
      { metric: 'Sale Amount', value: '$8.1M', change: '10b5-1' },
      { metric: 'Sale Price', value: '$247-$252', change: 'Near ATH' },
      { metric: 'Holdings Post', value: '2.37M', change: 'Class C' },
    ],
  },
  {
    id: 11,
    ticker: 'CMG',
    companyName: 'Chipotle Mexican Grill',
    filingType: '8-K',
    filedAt: 'Oct 29, 2025',
    timeAgo: '3 days ago',
    headline: 'Q3 earnings announced—check Exhibit 99.1',
    preview: "Pure announcement play. Conference call at 4:30pm ET. Actual numbers in press release attachment.",
    summaryText: "Chipotle announced Q3 earnings (ended Sep 30, 2025) via press release on Oct 29—no numbers in the 8-K, check Exhibit 99.1. Management hosts conference call at 4:30pm ET today to dissect results. Boilerplate filing signals fresh data dump, but devil's in the unattached press release.",
    keyTakeaway: "Pure announcement play—grab the press release for actual Q3 numbers, this 8-K is just the wrapper.",
    investorImpact: "Neutral filing until press release digest; sets stage for call but reveals zero meat.",
    sentiment: 'neutral',
    importance: 'low',
    icon: FileText,
    isStarred: false,
    financialHighlights: [
      { metric: 'Period', value: 'Q3 FY25', change: 'Sep 30' },
      { metric: 'Details', value: 'Exhibit 99.1', change: 'Press release' },
      { metric: 'Call Time', value: '4:30pm ET', change: 'Today' },
    ],
  },
  {
    id: 12,
    ticker: 'TSLA',
    companyName: 'Tesla, Inc.',
    filingType: 'DEFA14A',
    filedAt: 'Oct 31, 2025',
    timeAgo: '4 days ago',
    headline: 'Musk deploys X megaphone and employee blast',
    preview: "Employee memo, three Musk X posts, and VoteTesla.com refresh. 9 directors + 2 execs listed as solicitation participants.",
    summaryText: "Tesla unleashed employee memo, three Musk X posts, and VoteTesla.com refresh all on 10/31/2025 to corral votes for 2025 AGM. This DEFA14A flags 9 directors (Elon Musk to Kathleen Wilson-Thompson) and 2 execs (Taneja, Zhu) as solicitation participants.",
    keyTakeaway: "Tesla deploys Musk's X megaphone and employee blast 10/31/2025 to secure AGM votes—watch for opposition signals.",
    investorImpact: "Governance tussle risk if solicitation intensity hints at activist pushback on board or comp.",
    sentiment: 'neutral',
    importance: 'medium',
    icon: Users,
    isStarred: false,
    financialHighlights: [
      { metric: 'Participants', value: '11', change: '9 directors + 2' },
      { metric: 'Channels', value: 'X, Email', change: 'VoteTesla.com' },
      { metric: 'Target', value: 'AGM votes', change: 'Nov 6' },
    ],
  },
  {
    id: 13,
    ticker: 'NVDA',
    companyName: 'NVIDIA Corporation',
    filingType: 'Form 4',
    filedAt: 'Oct 31, 2025',
    timeAgo: '4 days ago',
    headline: "Huang sells 25k shares for $5.2M—0.003% of holdings",
    preview: "7 tranches at $205-$211. Direct stake now 69.7M shares (~$14.5B), indirect trusts hold 782M more.",
    summaryText: "NVIDIA CEO Jen-Hsun Huang sold 25,000 shares for $5.20M at $207.87/share weighted average on Oct 29—per his Rule 10b5-1 plan from March 20. Direct holdings dipped to 69,733,203 shares (~$14.5B), while indirect trusts hold 782,250,400 more for 852M total (~$177B at sale prices).",
    keyTakeaway: "Huang's 25,000-share trim equals 0.003% of his 852M-share fortress—zero signal on NVDA's trajectory.",
    investorImpact: "Bull thesis untouched: planned micro-sale from CEO with $177B skin in the game screams conviction.",
    sentiment: 'neutral',
    importance: 'low',
    icon: DollarSign,
    isStarred: false,
    financialHighlights: [
      { metric: 'Shares Sold', value: '25,000', change: '0.003%' },
      { metric: 'Proceeds', value: '$5.2M', change: '$207.87 avg' },
      { metric: 'Total Holdings', value: '852M', change: '~$177B' },
    ],
  },
  {
    id: 14,
    ticker: 'TSLA',
    companyName: 'Tesla, Inc.',
    filingType: 'DEFA14A',
    filedAt: 'Nov 3, 2025',
    timeAgo: '5 days ago',
    headline: "Musk demands 25% control for Optimus safety",
    preview: "Ties comp vote to halting robot army if activists boot him. ISS/GL nixed two directors—called 'terrorists'.",
    summaryText: "Tesla's proxy solicitation materials show Musk demanding 25% voting power for Optimus safety, tying comp vote to halting robot army if activists boot him. ISS/Glass Lewis recommended against directors Ira Ehrenpreis and Kathleen Wilson-Thompson, which Musk called 'terrorists' due to inconsistent diversity rules.",
    keyTakeaway: "Nov 6 vote locks in Musk's 25% control or kills Optimus—Elon's red line.",
    investorImpact: "Yes vote secures irreplaceable CEO for AI pivot; no vote torches robot thesis.",
    sentiment: 'bullish',
    importance: 'high',
    icon: AlertTriangle,
    isStarred: false,
    financialHighlights: [
      { metric: 'Voting Target', value: '25%', change: 'From 15%' },
      { metric: 'Stakes', value: 'Optimus', change: 'Robot army' },
      { metric: 'Opposition', value: 'ISS/GL', change: 'No recs' },
    ],
  },
  {
    id: 15,
    ticker: 'TSLA',
    companyName: 'Tesla, Inc.',
    filingType: 'DEFA14A',
    filedAt: 'Oct 29, 2025',
    timeAgo: '5 days ago',
    headline: 'Ad blitz and X posts rally votes for AGM',
    preview: "13 Google ad screenshots, Elon/Kimbal posts attached. Signals contested meeting—likely comp or board fight.",
    summaryText: "Tesla unleashes shareholder letter, 13 Google ad screenshots, and X posts from Elon/Kimbal Musk on Oct 28-29 to rally votes for 2025 annual meeting—no financials, pure proxy push. Nine directors plus Elon, CFO Taneja, SVP Zhu all 'participants' in solicitation.",
    keyTakeaway: "Tesla's ad/social blitz screams contested proxy fight—review DEF14A now or risk missing vote impact.",
    investorImpact: "Hot proxy battle could sway stock on comp ratification or board changes; side with management unless dissidents surface.",
    sentiment: 'neutral',
    importance: 'medium',
    icon: FileText,
    isStarred: false,
    financialHighlights: [
      { metric: 'Materials', value: '13 ads', change: 'Google' },
      { metric: 'Social', value: 'X posts', change: 'Elon/Kimbal' },
      { metric: 'Meeting', value: '2025 AGM', change: 'Contested' },
    ],
  },
];

/**
 * Trust metrics displayed in the hero section
 */
const trustMetrics = [
  { value: '10 min', label: 'filing-to-inbox' },
  { value: '99.9%', label: 'uptime' },
  { value: 'All types', label: 'of SEC filings' },
];

/**
 * Get badge color based on filing type
 */
function getFilingBadgeColor(filingType: string) {
  switch (filingType) {
    case '10-K':
      return 'bg-purple-100 text-purple-700 border-purple-200';
    case '10-Q':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case '8-K':
      return 'bg-orange-100 text-orange-700 border-orange-200';
    case 'Form 4':
    case '144':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'DEFA14A':
      return 'bg-red-100 text-red-700 border-red-200';
    case 'FWP':
      return 'bg-cyan-100 text-cyan-700 border-cyan-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

/**
 * Get sentiment color
 */
function getSentimentColor(sentiment: string) {
  switch (sentiment) {
    case 'bullish':
      return 'text-green-600';
    case 'bearish':
      return 'text-red-600';
    default:
      return 'text-gray-600';
  }
}

/**
 * Individual email row component
 */
function EmailRow({
  email,
  index,
  isSelected,
  isChecked,
  isRead,
  isNewlyDelivered,
  onSelect,
  onToggleCheck,
  isInView,
  deliveryTimestamp,
  currentTime,
}: {
  email: typeof curatedSummaries[0];
  index: number;
  isSelected: boolean;
  isChecked: boolean;
  isRead: boolean;
  isNewlyDelivered: boolean;
  onSelect: () => void;
  onToggleCheck: (e: React.MouseEvent) => void;
  isInView: boolean;
  deliveryTimestamp: number | undefined;
  currentTime: number;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (isInView) {
      // For newly delivered emails, show immediately with drop animation
      // For initial emails, use staggered reveal
      const delay = isNewlyDelivered ? 0 : index * 200;
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [isInView, index, isNewlyDelivered]);

  const isUnread = !isRead;

  // Determine animation based on whether this is a newly delivered email
  const initialAnimation = isNewlyDelivered
    ? { opacity: 0, y: -100, scale: 0.95 } // Drop from above for new emails
    : { opacity: 0, x: -120, y: 80 }; // Slide in from distance for initial emails

  const visibleAnimation = { opacity: 1, x: 0, y: 0, scale: 1 };

  return (
    <motion.div
      initial={initialAnimation}
      animate={isVisible ? visibleAnimation : initialAnimation}
      transition={{
        duration: 0.8,
        type: 'spring',
        stiffness: 100,
        damping: 15,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onSelect}
      style={{ height: `${EMAIL_ROW_HEIGHT}px`, minHeight: `${EMAIL_ROW_HEIGHT}px` }}
      className={`flex items-center gap-2 sm:gap-3 px-2 sm:px-4 border-b border-gray-100 cursor-pointer transition-colors duration-150 flex-shrink-0 overflow-hidden ${
        isSelected
          ? 'bg-blue-100 border-l-4 border-l-blue-500'
          : isUnread
          ? 'bg-blue-50/40'
          : 'bg-white hover:bg-gray-50'
      }`}
    >
      {/* Checkbox area - responsive width */}
      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 w-10 sm:w-14">
        <motion.div
          animate={{ scale: isHovered ? 1.1 : 1 }}
          onClick={onToggleCheck}
          className={`w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer ${
            isChecked ? 'bg-blue-500 border-blue-500' : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          {isChecked && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </motion.div>
        <motion.button
          animate={{ opacity: isHovered || email.isStarred ? 1 : 0.3 }}
          className="p-0.5"
        >
          <Star
            className={`w-4 h-4 ${email.isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-gray-400'}`}
          />
        </motion.button>
      </div>

      {/* Unread indicator - hidden on mobile to save space */}
      <div className="hidden sm:flex w-3 flex-shrink-0 items-center justify-center">
        {isUnread && <div className="w-2 h-2 rounded-full bg-blue-500" />}
      </div>

      {/* Ticker - responsive width */}
      <div className="w-12 sm:w-14 flex-shrink-0">
        <span className={`font-semibold text-xs sm:text-sm ${isUnread ? 'text-gray-900' : 'text-gray-600'}`}>
          {email.ticker}
        </span>
      </div>

      {/* Filing Type Badge - responsive, hidden on very small screens */}
      <div className="hidden xs:block w-14 sm:w-16 flex-shrink-0">
        <Badge className={`text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0 ${getFilingBadgeColor(email.filingType)}`}>
          {email.filingType}
        </Badge>
      </div>

      {/* Subject & Preview - flex grow takes remaining space */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <span className={`text-xs sm:text-sm truncate block ${isUnread ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
          {email.headline}
        </span>
      </div>

      {/* Time - hidden on mobile */}
      <div className="flex-shrink-0 text-[10px] sm:text-xs text-gray-400 w-16 sm:w-20 text-right hidden sm:block">
        {deliveryTimestamp
          ? formatSecondsAgo(Math.floor((currentTime - deliveryTimestamp) / 1000))
          : email.timeAgo}
      </div>
    </motion.div>
  );
}

/**
 * Email detail panel component
 */
function EmailDetailPanel({
  email,
  onClose,
  isOnboarded,
}: {
  email: typeof curatedSummaries[0];
  onClose: () => void;
  isOnboarded: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
      className="bg-white rounded-r-2xl flex flex-col h-full max-h-full overflow-hidden"
    >
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'var(--brand-primary-light, #e0edff)' }}
          >
            <email.icon className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-gray-900">{email.ticker}</span>
              <Badge className={`text-xs ${getFilingBadgeColor(email.filingType)}`}>
                {email.filingType}
              </Badge>
              <span className={`text-xs font-medium ${getSentimentColor(email.sentiment)}`}>
                {email.sentiment.charAt(0).toUpperCase() + email.sentiment.slice(1)}
              </span>
            </div>
            <p className="text-sm text-gray-500">{email.companyName}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <X className="w-5 h-5 text-gray-400" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
        {/* Headline */}
        <h3 className="text-lg font-semibold text-gray-900 mb-3">{email.headline}</h3>

        {/* Key Takeaway */}
        <div className="bg-blue-50 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-semibold text-blue-900">Key Takeaway</span>
          </div>
          <p className="text-sm text-blue-800">{email.keyTakeaway}</p>
        </div>

        {/* Summary */}
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Summary</h4>
          <p className="text-sm text-gray-600 leading-relaxed">{email.summaryText}</p>
        </div>

        {/* Financial Highlights */}
        <div className="mb-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Financial Highlights</h4>
          <div className="grid grid-cols-3 gap-2">
            {email.financialHighlights.map((highlight, idx) => (
              <div
                key={idx}
                className="bg-gray-50 rounded-lg p-3 text-center"
              >
                <p className="text-xs text-gray-500 mb-1">{highlight.metric}</p>
                <p className="text-sm font-bold text-gray-900">{highlight.value}</p>
                <p className="text-xs text-gray-400">{highlight.change}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Investor Impact */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-gray-600" />
            <span className="text-sm font-semibold text-gray-700">Investor Impact</span>
          </div>
          <p className="text-sm text-gray-600">{email.investorImpact}</p>
        </div>
      </div>

      {/* Footer CTA */}
      <div className="flex-shrink-0 px-5 py-4 bg-gray-50 border-t border-gray-100">
        <p className="text-xs text-gray-500 mb-3 text-center">
          {isOnboarded
            ? 'This is a real AI-generated summary from your dashboard.'
            : 'This is a real AI-generated summary. Sign up to receive summaries for your portfolio.'}
        </p>
        <Link href={isOnboarded ? '/dashboard' : '/sign-up'}>
          <Button className="w-full brand-button-gradient">
            {isOnboarded ? 'Go to Dashboard' : 'Get Summaries Like This'}
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </div>
    </motion.div>
  );
}

/**
 * Parse date string like "Oct 28, 2025" or "Nov 4, 2025" to Date object
 */
function parseFiledAt(dateStr: string): Date {
  return new Date(dateStr);
}

/**
 * Sort emails by date descending (newest first)
 */
function sortByDateDescending(emails: EmailSummary[]): EmailSummary[] {
  return [...emails].sort((a, b) => {
    const dateA = parseFiledAt(a.filedAt);
    const dateB = parseFiledAt(b.filedAt);
    return dateB.getTime() - dateA.getTime();
  });
}

/**
 * Get fixed delivery interval (5 seconds)
 */
function getDeliveryInterval(): number {
  return DELIVERY_INTERVAL;
}

/**
 * Format seconds ago into human-readable string
 * Only updates every minute, so shows "just now" for <1 min
 */
function formatSecondsAgo(seconds: number): string {
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return '1 min ago';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return '1 hour ago';
  return `${hours} hours ago`;
}

/**
 * Gmail Inbox Hero Section
 *
 * Combines hero messaging with an interactive Gmail-style inbox
 * showing real curated summaries that users can click to preview.
 */
export const GmailInboxHero = memo<GmailInboxHeroProps>(({ className = '', heroRef }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.2 });
  const [selectedEmail, setSelectedEmail] = useState<EmailSummary | null>(null);
  const [displayedEmails, setDisplayedEmails] = useState<EmailSummary[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // User authentication state from Auth context
  const { isSignedIn, isLoaded, isOnboarded } = useAuth();

  // Expanded state for fullscreen-like view
  const [isExpanded, setIsExpanded] = useState(false);

  // Track read and checked (selected) emails
  const [readEmails, setReadEmails] = useState<Set<number>>(new Set());
  const [checkedEmails, setCheckedEmails] = useState<Set<number>>(new Set());

  // Track which emails were delivered dynamically (for animation)
  const [deliveredEmailIds, setDeliveredEmailIds] = useState<Set<number>>(new Set());

  // Track delivery timestamps for dynamic "x seconds ago" display
  const [deliveryTimestamps, setDeliveryTimestamps] = useState<Map<number, number>>(new Map());

  // Current time for dynamic time calculations (updates every second)
  const [currentTime, setCurrentTime] = useState(Date.now());

  // Pool of remaining emails to deliver
  const [emailPool, setEmailPool] = useState<EmailSummary[]>([]);

  // Delivery timer ref
  const deliveryTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Toggle expanded state
  const handleToggleExpand = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  // Calculate unread count for badge
  const unreadCount = displayedEmails.filter(e => !readEmails.has(e.id)).length;

  // Initialize with sorted emails, start with INITIAL_EMAIL_COUNT
  useEffect(() => {
    const sorted = sortByDateDescending(curatedSummaries);
    const initial = sorted.slice(0, INITIAL_EMAIL_COUNT);
    const remaining = sorted.slice(INITIAL_EMAIL_COUNT);

    setDisplayedEmails(initial);
    setEmailPool(remaining);
  }, []);

  // Update current time every minute for dynamic "x minutes ago" display
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000); // Update every 60 seconds

    return () => clearInterval(timer);
  }, []);

  // Track delivered email IDs to prevent duplicates (ref for synchronous access)
  const deliveredIdsRef = useRef<Set<number>>(new Set());

  // Deliver next email from pool
  const deliverNextEmail = useCallback(() => {
    setEmailPool(prevPool => {
      if (prevPool.length === 0) return prevPool;

      const nextEmail = prevPool[0];

      // Check if already delivered (prevents duplicates from React Strict Mode)
      if (deliveredIdsRef.current.has(nextEmail.id)) {
        return prevPool;
      }

      // Mark as delivered synchronously
      deliveredIdsRef.current.add(nextEmail.id);

      // Update displayed emails - add new email to top, pushing others down
      setDisplayedEmails(prevDisplayed => {
        if (prevDisplayed.length >= MAX_EMAIL_COUNT) {
          return prevDisplayed;
        }
        // Double-check for duplicates in displayed list
        if (prevDisplayed.some(e => e.id === nextEmail.id)) {
          return prevDisplayed;
        }
        // Add to top of list (newest first)
        return [nextEmail, ...prevDisplayed];
      });

      // Mark for animation and record delivery timestamp
      setDeliveredEmailIds(prev => new Set([...prev, nextEmail.id]));
      setDeliveryTimestamps(prev => new Map(prev).set(nextEmail.id, Date.now()));

      return prevPool.slice(1);
    });
  }, []);

  // Schedule next email delivery - only delivers when summary panel is closed
  const scheduleNextDelivery = useCallback(() => {
    if (deliveryTimerRef.current) {
      clearTimeout(deliveryTimerRef.current);
    }

    const interval = getDeliveryInterval();

    deliveryTimerRef.current = setTimeout(() => {
      deliverNextEmail();
      // Schedule next delivery
      scheduleNextDelivery();
    }, interval);
  }, [deliverNextEmail]);

  // Stop delivery timer
  const stopDelivery = useCallback(() => {
    if (deliveryTimerRef.current) {
      clearTimeout(deliveryTimerRef.current);
      deliveryTimerRef.current = null;
    }
  }, []);

  // Control delivery based on view state
  // Continue delivery even when summary pane is open for dynamic feel
  useEffect(() => {
    if (isInView && emailPool.length > 0 && displayedEmails.length < MAX_EMAIL_COUNT) {
      // In view, emails remaining - start/continue delivery
      scheduleNextDelivery();
    }

    return () => {
      stopDelivery();
    };
  }, [isInView, emailPool.length, displayedEmails.length, scheduleNextDelivery, stopDelivery]);

  // Handle email click - mark as read and select
  const handleEmailClick = useCallback((email: EmailSummary) => {
    setSelectedEmail(email);
    setReadEmails(prev => new Set([...prev, email.id]));
  }, []);

  // Handle individual email checkbox toggle
  const handleToggleCheck = useCallback((emailId: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent email selection
    setCheckedEmails(prev => {
      const newSet = new Set(prev);
      if (newSet.has(emailId)) {
        newSet.delete(emailId);
      } else {
        newSet.add(emailId);
      }
      return newSet;
    });
  }, []);

  // Handle select all checkbox
  const handleSelectAll = useCallback(() => {
    if (checkedEmails.size === displayedEmails.length) {
      // All selected, deselect all
      setCheckedEmails(new Set());
    } else {
      // Select all
      setCheckedEmails(new Set(displayedEmails.map(e => e.id)));
    }
  }, [checkedEmails.size, displayedEmails]);

  // Check if all emails are selected
  const allChecked = displayedEmails.length > 0 && checkedEmails.size === displayedEmails.length;
  const someChecked = checkedEmails.size > 0 && checkedEmails.size < displayedEmails.length;

  // Simulate refresh with new random emails
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    setSelectedEmail(null);
    setReadEmails(new Set());
    setCheckedEmails(new Set());
    setDeliveredEmailIds(new Set());
    setDeliveryTimestamps(new Map());

    // Reset the delivered IDs ref to allow re-delivery
    deliveredIdsRef.current = new Set();

    // Clear delivery timer
    if (deliveryTimerRef.current) {
      clearTimeout(deliveryTimerRef.current);
    }

    setTimeout(() => {
      const sorted = sortByDateDescending(curatedSummaries);
      const initial = sorted.slice(0, INITIAL_EMAIL_COUNT);
      const remaining = sorted.slice(INITIAL_EMAIL_COUNT);

      setDisplayedEmails(initial);
      setEmailPool(remaining);
      setIsRefreshing(false);

      // Restart delivery
      scheduleNextDelivery();
    }, 800);
  }, [scheduleNextDelivery]);

  // Combine the heroRef with our local sectionRef
  const combinedRef = useCallback((node: HTMLElement | null) => {
    // Set our local ref
    (sectionRef as React.MutableRefObject<HTMLElement | null>).current = node;
    // Also set the parent's heroRef if provided
    if (heroRef && 'current' in heroRef) {
      (heroRef as React.MutableRefObject<HTMLElement | null>).current = node;
    }
  }, [heroRef]);

  // Extract caption logic for clarity
  const getCaptionText = () => {
    if (isSignedIn && !isOnboarded) return 'Just one more step!';
    if (!isSignedIn) return '7-day free trial. Cancel anytime.';
    return ''; // Authenticated and onboarded users see no caption
  };

  return (
    <section
      ref={combinedRef}
      id="hero"
      className={`relative min-h-[100vh] flex items-center overflow-hidden py-12 lg:py-0 ${className}`}
      style={meshGradientStyle}
    >
      {/* Background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-40 -right-40 w-80 h-80 rounded-full opacity-60"
          style={{
            background: 'radial-gradient(circle, rgba(0, 121, 242, 0.15) 0%, transparent 70%)',
          }}
          animate={{ x: [0, 30, 0], y: [0, -20, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full opacity-40"
          style={{
            background: 'radial-gradient(circle, rgba(139, 92, 246, 0.12) 0%, transparent 70%)',
          }}
          animate={{ x: [0, -20, 0], y: [0, 30, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          {/* Left Column - Content */}
          <motion.div
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            className="text-center lg:text-left"
          >
            <motion.h1 variants={staggerItem} className="brand-display mb-6">
              Summaries That{' '}
              <span className="brand-gradient-text">Actually Matter</span>
            </motion.h1>

            <motion.p variants={staggerItem} className="brand-body-large mb-8 max-w-xl mx-auto lg:mx-0">
              Transform 300+ page SEC filings into clear, actionable summaries
              delivered to your inbox in minutes. Click any email to see the AI analysis.
            </motion.p>

            <motion.div
              variants={staggerItem}
              className="flex flex-wrap justify-center lg:justify-start gap-6 mb-8"
            >
              {trustMetrics.map((metric) => (
                <div key={metric.label} className="brand-metric">
                  <CheckCircle2 className="w-5 h-5 text-[var(--brand-success)]" />
                  <span className="brand-metric-value">{metric.value}</span>
                  <span className="brand-metric-label">{metric.label}</span>
                </div>
              ))}
            </motion.div>

            <motion.div
              variants={staggerItem}
              className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 mb-6"
            >
              {!isLoaded ? (
                // Loading state - show skeleton button
                <Skeleton className="h-11 w-48 rounded-lg" />
              ) : isOnboarded ? (
                // State 3: Authenticated AND onboarded → Dashboard
                <Link href="/dashboard">
                  <Button className="brand-button-gradient">
                    Go to Dashboard
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
              ) : isSignedIn ? (
                // State 2: Authenticated but NOT onboarded → Onboarding
                <Link href="/onboarding">
                  <Button className="brand-button-gradient">
                    Complete Setup
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
              ) : (
                // State 1: Unauthenticated → Sign Up
                <Link href="/sign-up">
                  <Button className="brand-button-gradient">
                    Get Summaries Like This
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
              )}
            </motion.div>

            <motion.p variants={staggerItem} className="brand-caption">
              {getCaptionText()}
            </motion.p>
          </motion.div>

          {/* Right Column - Gmail Inbox */}
          <motion.div
            ref={containerRef}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className={`relative ${isExpanded ? 'fixed inset-4 z-50' : ''}`}
            layout
          >
            {/* Backdrop for expanded view */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed inset-0 bg-black/50 z-40"
                  onClick={handleToggleExpand}
                />
              )}
            </AnimatePresence>

            <motion.div
              layout
              className={`bg-white rounded-xl shadow-2xl overflow-hidden border border-gray-200 relative ${
                isExpanded ? 'z-50 h-full' : ''
              }`}
              style={!isExpanded ? {
                // Mobile-first: full width on small screens, 2.25x wider (1.5 x 1.5)
                width: '100%',
                maxWidth: 'min(98vw, 2000px)',
              } : undefined}
            >
              {/* Gmail Header - compact on mobile */}
              <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4 py-2 sm:py-3 bg-gray-50 border-b border-gray-200">
                <div className="flex gap-1 sm:gap-1.5">
                  <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-red-400" />
                  <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-yellow-400" />
                  <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-green-400" />
                </div>
                <div className="flex-grow flex items-center justify-center gap-1 sm:gap-2 min-w-0">
                  <Mail className="w-3 h-3 sm:w-4 sm:h-4 text-red-500 flex-shrink-0" />
                  <span className="text-xs sm:text-sm font-medium text-gray-700 truncate">SEC Filing Summaries</span>
                </div>
                {unreadCount > 0 && (
                  <Badge className="bg-red-500 text-white text-[10px] sm:text-xs px-1.5 sm:px-2 flex-shrink-0">
                    {unreadCount} new
                  </Badge>
                )}
                {/* Expand/Collapse Button */}
                <button
                  onClick={handleToggleExpand}
                  className="p-1 sm:p-1.5 rounded hover:bg-gray-200 transition-colors flex-shrink-0"
                  title={isExpanded ? 'Minimize' : 'Expand'}
                >
                  {isExpanded ? (
                    <Minimize2 className="w-3 h-3 sm:w-4 sm:h-4 text-gray-500" />
                  ) : (
                    <Maximize2 className="w-3 h-3 sm:w-4 sm:h-4 text-gray-500" />
                  )}
                </button>
              </div>

              {/* Toolbar - compact on mobile */}
              <div className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 bg-gray-50 border-b border-gray-100">
                {/* Master checkbox for select all/deselect all */}
                <button
                  onClick={handleSelectAll}
                  className="p-1 sm:p-1.5 rounded hover:bg-gray-200 transition-colors flex items-center justify-center"
                  title={allChecked ? 'Deselect all' : 'Select all'}
                >
                  <div
                    className={`w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer ${
                      allChecked
                        ? 'bg-blue-500 border-blue-500'
                        : someChecked
                        ? 'bg-blue-200 border-blue-500'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {allChecked && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    {someChecked && !allChecked && (
                      <div className="w-2 h-0.5 bg-blue-500 rounded" />
                    )}
                  </div>
                </button>

                <motion.button
                  onClick={handleRefresh}
                  animate={{ rotate: isRefreshing ? 360 : 0 }}
                  transition={{ duration: 0.8 }}
                  className="p-1 sm:p-1.5 rounded hover:bg-gray-200 transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className="w-4 h-4 text-gray-500" />
                </motion.button>
                <button className="hidden sm:block p-1.5 rounded hover:bg-gray-200 transition-colors" title="Archive">
                  <Archive className="w-4 h-4 text-gray-500" />
                </button>
                <button className="hidden sm:block p-1.5 rounded hover:bg-gray-200 transition-colors" title="Delete">
                  <Trash2 className="w-4 h-4 text-gray-500" />
                </button>
                <div className="hidden sm:block h-5 w-px bg-gray-300 mx-1" />
                <button className="p-1 sm:p-1.5 rounded hover:bg-gray-200 transition-colors" title="More options">
                  <MoreVertical className="w-4 h-4 text-gray-500" />
                </button>
                <div className="flex-grow" />
                <span className="text-[10px] sm:text-xs text-gray-400">1-{displayedEmails.length} of {curatedSummaries.length}</span>
              </div>

              {/* Email List & Detail Overlay */}
              <div
                className="relative flex overflow-hidden"
                style={{
                  // Wide landscape ratio: 1.5x taller for larger display
                  // Mobile: 300px min, Desktop: max 450px
                  height: isExpanded ? 'calc(100% - 110px)' : 'clamp(300px, 42vh, 450px)',
                }}
              >
                {/* Email List - Always full width, never shrinks */}
                <div
                  className="w-full overflow-y-auto"
                  onClick={(e) => {
                    // Close summary pane if clicking on empty area (not on an email row)
                    if (e.target === e.currentTarget) {
                      setSelectedEmail(null);
                    }
                  }}
                >
                  <AnimatePresence mode="wait">
                    {isRefreshing ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="w-full"
                      >
                        {/* Skeleton loading rows - responsive */}
                        {Array.from({ length: INITIAL_EMAIL_COUNT }).map((_, index) => (
                          <div
                            key={index}
                            style={{ height: `${EMAIL_ROW_HEIGHT}px` }}
                            className="flex items-center gap-2 sm:gap-3 px-2 sm:px-4 border-b border-gray-100 animate-pulse"
                          >
                            {/* Checkbox skeleton */}
                            <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0 w-10 sm:w-14">
                              <div className="w-4 h-4 rounded bg-gray-200" />
                              <div className="w-4 h-4 rounded bg-gray-200" />
                            </div>
                            {/* Unread dot skeleton - hidden on mobile */}
                            <div className="hidden sm:block w-3 flex-shrink-0" />
                            {/* Ticker skeleton */}
                            <div className="w-12 sm:w-14 flex-shrink-0">
                              <div className="w-10 h-4 rounded bg-gray-200" />
                            </div>
                            {/* Badge skeleton - hidden on very small screens */}
                            <div className="hidden xs:block w-14 sm:w-16 flex-shrink-0">
                              <div className="w-12 h-5 rounded-full bg-gray-200" />
                            </div>
                            {/* Subject skeleton */}
                            <div className="flex-1 min-w-0">
                              <div className="h-4 rounded bg-gray-200" style={{ width: `${60 + index * 10}%` }} />
                            </div>
                            {/* Time skeleton - hidden on mobile */}
                            <div className="flex-shrink-0 w-16 sm:w-20 hidden sm:block">
                              <div className="w-14 sm:w-16 h-3 rounded bg-gray-200 ml-auto" />
                            </div>
                          </div>
                        ))}
                      </motion.div>
                    ) : (
                      displayedEmails.map((email, index) => (
                        <EmailRow
                          key={email.id}
                          email={email}
                          index={index}
                          isSelected={selectedEmail?.id === email.id}
                          isChecked={checkedEmails.has(email.id)}
                          isRead={readEmails.has(email.id)}
                          isNewlyDelivered={deliveredEmailIds.has(email.id)}
                          onSelect={() => handleEmailClick(email)}
                          onToggleCheck={(e) => handleToggleCheck(email.id, e)}
                          isInView={isInView}
                          deliveryTimestamp={deliveryTimestamps.get(email.id)}
                          currentTime={currentTime}
                        />
                      ))
                    )}
                  </AnimatePresence>
                </div>

                {/* Detail Panel - Overlays from right, doesn't push inbox */}
                <AnimatePresence>
                  {selectedEmail && (
                    <motion.div
                      initial={{ x: '100%', opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: '100%', opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      className="absolute inset-0 bg-white z-10 md:left-auto md:w-[65%] lg:w-[60%] shadow-xl border-l border-gray-200 overflow-hidden"
                    >
                      <EmailDetailPanel
                        email={selectedEmail}
                        onClose={() => setSelectedEmail(null)}
                        isOnboarded={isOnboarded}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Footer - compact on mobile */}
              <div className="px-2 sm:px-4 py-2 sm:py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between gap-2">
                <span className="text-[10px] sm:text-xs text-gray-500 truncate">
                  Click any email to preview
                </span>
                <div className="flex items-center gap-1 text-[10px] sm:text-xs text-gray-400 flex-shrink-0">
                  <Clock className="w-3 h-3" />
                  <span className="hidden sm:inline">Updated in real-time</span>
                  <span className="sm:hidden">Live</span>
                </div>
              </div>
            </motion.div>

            {/* Decorative elements - hidden when expanded */}
            {!isExpanded && (
              <div
                className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-30 pointer-events-none"
                style={{
                  background: 'radial-gradient(circle, rgba(0, 121, 242, 0.2) 0%, transparent 70%)',
                }}
              />
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
});

GmailInboxHero.displayName = 'GmailInboxHero';
