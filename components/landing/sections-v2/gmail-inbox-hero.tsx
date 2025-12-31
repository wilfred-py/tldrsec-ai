'use client';

import { useState, useEffect, useRef, memo } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowRight,
  Sparkles,
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
} from 'lucide-react';
import Link from 'next/link';
import {
  staggerContainer,
  staggerItem,
  meshGradientStyle,
} from '@/lib/animations/landing-animations';

// TypeScript interfaces for component props and data structures
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
  insights: string[];
  impactScore: number;
  risk: string;
  priority: 'high' | 'medium' | 'low';
  isRead: boolean;
}

interface GmailInboxHeroProps {
  className?: string;
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
  { value: '2,500+', label: 'investors' },
  { value: '99.9%', label: 'uptime' },
  { value: '<5 min', label: 'delivery' },
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
  onSelect,
  isInView,
}: {
  email: typeof curatedSummaries[0];
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  isInView: boolean;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (isInView) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, index * 150);
      return () => clearTimeout(timer);
    }
  }, [isInView, index]);

  const isNew = index < 3;

  return (
    <motion.div
      initial={{ opacity: 0, x: -30, y: 10 }}
      animate={isVisible ? { opacity: 1, x: 0, y: 0 } : { opacity: 0, x: -30, y: 10 }}
      transition={{
        duration: 0.4,
        ease: 'easeOut',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onSelect}
      className={`flex items-center gap-3 px-4 py-3 border-b border-gray-100 cursor-pointer transition-all duration-150 ${
        isSelected
          ? 'bg-blue-50 border-l-4 border-l-blue-500'
          : isNew
          ? 'bg-blue-50/30'
          : 'bg-white hover:bg-gray-50'
      }`}
    >
      {/* Checkbox area */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <motion.div
          animate={{ scale: isHovered ? 1.1 : 1 }}
          className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
            isSelected ? 'bg-blue-500 border-blue-500' : 'border-gray-300'
          }`}
        >
          {isSelected && (
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

      {/* Unread indicator */}
      <div className="w-2 flex-shrink-0">
        {isNew && <div className="w-2 h-2 rounded-full bg-blue-500" />}
      </div>

      {/* Ticker */}
      <div className="w-16 flex-shrink-0">
        <span className={`font-semibold text-sm ${isNew ? 'text-gray-900' : 'text-gray-700'}`}>
          {email.ticker}
        </span>
      </div>

      {/* Filing Type Badge */}
      <Badge className={`text-[10px] px-1.5 py-0 flex-shrink-0 ${getFilingBadgeColor(email.filingType)}`}>
        {email.filingType}
      </Badge>

      {/* Subject & Preview */}
      <div className="flex-grow min-w-0 flex items-center gap-2">
        <span className={`text-sm truncate ${isNew ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
          {email.headline}
        </span>
        <span className="text-sm text-gray-400 truncate hidden sm:inline">
          — {email.preview}
        </span>
      </div>

      {/* Time */}
      <div className="flex-shrink-0 text-xs text-gray-400 w-20 text-right hidden md:block">
        {email.timeAgo}
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
}: {
  email: typeof curatedSummaries[0];
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
      className="bg-white rounded-r-2xl overflow-hidden flex flex-col h-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'var(--landing-primary-light, #e0edff)' }}
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
      <div className="flex-grow overflow-y-auto px-5 py-4">
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
      <div className="px-5 py-4 bg-gray-50 border-t border-gray-100">
        <p className="text-xs text-gray-500 mb-3 text-center">
          This is a real AI-generated summary. Sign up to receive summaries for your portfolio.
        </p>
        <Link href="/onboarding">
          <Button className="w-full landing-button-gradient">
            Get Summaries Like This
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </Link>
      </div>
    </motion.div>
  );
}

/**
 * Gmail Inbox Hero Section
 *
 * Combines hero messaging with an interactive Gmail-style inbox
 * showing real curated summaries that users can click to preview.
 */
export const GmailInboxHero = memo<GmailInboxHeroProps>(({ className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, amount: 0.2 });
  const [selectedEmail, setSelectedEmail] = useState<EmailSummary | null>(null);
  const [displayedEmails, setDisplayedEmails] = useState<EmailSummary[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Shuffle and pick random 6 emails on mount
  useEffect(() => {
    const shuffled = [...curatedSummaries].sort(() => Math.random() - 0.5);
    setDisplayedEmails(shuffled.slice(0, 6));
  }, []);

  // Simulate refresh with new random emails
  const handleRefresh = () => {
    setIsRefreshing(true);
    setSelectedEmail(null);
    setTimeout(() => {
      const shuffled = [...curatedSummaries].sort(() => Math.random() - 0.5);
      setDisplayedEmails(shuffled.slice(0, 6));
      setIsRefreshing(false);
    }, 800);
  };

  return (
    <section
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
            <motion.div variants={staggerItem}>
              <Badge className="landing-badge mb-6">
                <Sparkles className="w-4 h-4 mr-2" />
                AI-Powered SEC Intelligence
              </Badge>
            </motion.div>

            <motion.h1 variants={staggerItem} className="landing-display mb-6">
              Summaries That{' '}
              <span className="landing-gradient-text">Actually Matter</span>
            </motion.h1>

            <motion.p variants={staggerItem} className="landing-body-large mb-8 max-w-xl mx-auto lg:mx-0">
              Transform 300+ page SEC filings into clear, actionable summaries
              delivered to your inbox in minutes. Click any email to see the AI analysis.
            </motion.p>

            <motion.div
              variants={staggerItem}
              className="flex flex-wrap justify-center lg:justify-start gap-6 mb-8"
            >
              {trustMetrics.map((metric) => (
                <div key={metric.label} className="landing-metric">
                  <CheckCircle2 className="w-5 h-5 text-[var(--landing-success)]" />
                  <span className="landing-metric-value">{metric.value}</span>
                  <span className="landing-metric-label">{metric.label}</span>
                </div>
              ))}
            </motion.div>

            <motion.div
              variants={staggerItem}
              className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 mb-6"
            >
              <Link href="/onboarding">
                <Button className="landing-button-gradient">
                  Start Free Trial
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <Link href="#pricing">
                <Button className="landing-button-outline">View Pricing</Button>
              </Link>
            </motion.div>

            <motion.p variants={staggerItem} className="landing-caption">
              No credit card required. Cancel anytime.
            </motion.p>
          </motion.div>

          {/* Right Column - Gmail Inbox */}
          <motion.div
            ref={containerRef}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="relative"
          >
            <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
              {/* Gmail Header */}
              <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-200">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="flex-grow flex items-center justify-center gap-2">
                  <Mail className="w-4 h-4 text-red-500" />
                  <span className="text-sm font-medium text-gray-700">SEC Filing Summaries</span>
                </div>
                <Badge className="bg-red-500 text-white text-xs px-2">
                  {displayedEmails.filter((_, i) => i < 3).length} new
                </Badge>
              </div>

              {/* Toolbar */}
              <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
                <button className="p-1.5 rounded hover:bg-gray-200 transition-colors">
                  <input type="checkbox" className="w-4 h-4 rounded" />
                </button>
                <motion.button
                  onClick={handleRefresh}
                  animate={{ rotate: isRefreshing ? 360 : 0 }}
                  transition={{ duration: 0.8 }}
                  className="p-1.5 rounded hover:bg-gray-200 transition-colors"
                >
                  <RefreshCw className="w-4 h-4 text-gray-500" />
                </motion.button>
                <button className="p-1.5 rounded hover:bg-gray-200 transition-colors">
                  <Archive className="w-4 h-4 text-gray-500" />
                </button>
                <button className="p-1.5 rounded hover:bg-gray-200 transition-colors">
                  <Trash2 className="w-4 h-4 text-gray-500" />
                </button>
                <div className="h-5 w-px bg-gray-300 mx-1" />
                <button className="p-1.5 rounded hover:bg-gray-200 transition-colors">
                  <MoreVertical className="w-4 h-4 text-gray-500" />
                </button>
                <div className="flex-grow" />
                <span className="text-xs text-gray-400">1-{displayedEmails.length} of {curatedSummaries.length}</span>
              </div>

              {/* Email List & Detail Split View */}
              <div className="flex" style={{ height: '420px' }}>
                {/* Email List */}
                <div
                  className={`overflow-y-auto transition-all duration-300 ${
                    selectedEmail ? 'w-2/5 border-r border-gray-100' : 'w-full'
                  }`}
                >
                  <AnimatePresence mode="wait">
                    {isRefreshing ? (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center justify-center h-full"
                      >
                        <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
                      </motion.div>
                    ) : (
                      displayedEmails.map((email, index) => (
                        <EmailRow
                          key={email.id}
                          email={email}
                          index={index}
                          isSelected={selectedEmail?.id === email.id}
                          onSelect={() => setSelectedEmail(email)}
                          isInView={isInView}
                        />
                      ))
                    )}
                  </AnimatePresence>
                </div>

                {/* Detail Panel */}
                <AnimatePresence>
                  {selectedEmail && (
                    <motion.div
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: '60%', opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <EmailDetailPanel
                        email={selectedEmail}
                        onClose={() => setSelectedEmail(null)}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-500">
                  Click any email to preview the AI summary
                </span>
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Clock className="w-3 h-3" />
                  Updated in real-time
                </div>
              </div>
            </div>

            {/* Decorative elements */}
            <div
              className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-30 pointer-events-none"
              style={{
                background: 'radial-gradient(circle, rgba(0, 121, 242, 0.2) 0%, transparent 70%)',
              }}
            />
          </motion.div>
        </div>
      </div>
    </section>
  );
});

GmailInboxHero.displayName = 'GmailInboxHero';
