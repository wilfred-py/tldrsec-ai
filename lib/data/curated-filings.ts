/**
 * Curated Filings for Landing Page
 *
 * Manually curated impressive SEC filing summaries to showcase on the landing page.
 * These are hand-picked examples that demonstrate the value of the service.
 */

export interface CuratedFiling {
  id: string;
  ticker: string;
  companyName: string;
  filingType: string;
  filedAt: string;
  keyHighlights: string[];
  fullSummary: string;
}

/**
 * Curated filings showcasing different filing types and companies
 */
export const CURATED_FILINGS: CuratedFiling[] = [
  {
    id: 'curated-aapl-10k',
    ticker: 'AAPL',
    companyName: 'Apple Inc.',
    filingType: '10-K',
    filedAt: '2024-10-31',
    keyHighlights: [
      'Revenue increased 8% YoY to $394.3 billion',
      'Services segment grew 16% to record $85.2 billion',
      'Operating margin improved to 30.1% from 28.5%',
      'Repurchased $90 billion in stock during fiscal year',
    ],
    fullSummary: `Apple Inc. reported strong fiscal 2024 results with total revenue of $394.3 billion, an 8% increase year-over-year. The company's Services segment was a standout performer, growing 16% to reach a record $85.2 billion in revenue.

Key Financial Highlights:
• Total Revenue: $394.3B (+8% YoY)
• Services Revenue: $85.2B (+16% YoY)
• Operating Margin: 30.1% (up from 28.5%)
• Stock Repurchases: $90B during fiscal year
• Cash Position: $162.1B

Product Performance:
The iPhone remained the largest revenue contributor at $201.2 billion, growing 6% year-over-year. Mac revenue increased 11% to $29.7 billion, driven by strong demand for M3-powered devices. iPad revenue stabilized at $26.7 billion after previous declines.

Strategic Initiatives:
Apple continues to invest heavily in AI capabilities, with Apple Intelligence being integrated across its ecosystem. The company announced expanded manufacturing partnerships in India and Vietnam to diversify supply chain.

Risk Factors:
The 10-K highlights ongoing antitrust scrutiny, particularly in the EU regarding App Store policies. Supply chain concentration and geopolitical tensions remain key operational risks.

Investor Implications:
Strong free cash flow generation of $105.6 billion supports continued shareholder returns through dividends ($15.1B) and buybacks. The company's transition to services-led growth provides more predictable recurring revenue.`,
  },
  {
    id: 'curated-msft-10q',
    ticker: 'MSFT',
    companyName: 'Microsoft Corporation',
    filingType: '10-Q',
    filedAt: '2024-10-23',
    keyHighlights: [
      'Revenue up 16% YoY to $65.6 billion',
      'Azure and cloud services grew 29%',
      'AI services revenue doubled from prior year',
      'Operating income increased 14% to $30.6 billion',
    ],
    fullSummary: `Microsoft delivered exceptional Q1 FY2025 results with revenue of $65.6 billion, up 16% year-over-year. Azure and cloud services remained the growth engine, expanding 29% driven by AI workload demand.

Segment Performance:

Intelligent Cloud ($24.1B, +20%):
Azure and other cloud services grew 29%, with AI services contributing approximately 12 percentage points to this growth. Enterprise customers continue migrating to Azure for AI capabilities.

Productivity and Business Processes ($28.3B, +12%):
Microsoft 365 Commercial products and cloud services revenue increased 13%. LinkedIn revenue grew 10%, while Dynamics 365 revenue increased 14%.

More Personal Computing ($13.2B, +17%):
Xbox content and services revenue increased 61% due to the Activision Blizzard acquisition. Windows OEM revenue grew 2%, and Search and news advertising revenue grew 18%.

AI Integration:
Microsoft Copilot is now embedded across Office 365, GitHub, Azure, and Windows. The company reported 60% quarter-over-quarter growth in Copilot customers. GitHub Copilot now has over 1.8 million paid subscribers.

Capital Expenditures:
CapEx of $14.9 billion reflects significant investment in AI infrastructure, including new data center capacity and GPU clusters for training and inference.

Guidance:
For Q2 FY2025, Microsoft expects revenue between $68.1B and $69.1B, implying 11-13% growth. Azure growth is expected to remain in the high 20s percentage range.`,
  },
  {
    id: 'curated-nvda-8k',
    ticker: 'NVDA',
    companyName: 'NVIDIA Corporation',
    filingType: '8-K',
    filedAt: '2024-11-20',
    keyHighlights: [
      'Record quarterly revenue of $35.1 billion (+94% YoY)',
      'Data Center revenue reached $30.8 billion (+112% YoY)',
      'Gross margin of 75% reflects pricing power',
      'Blackwell production ramping faster than expected',
    ],
    fullSummary: `NVIDIA announced record Q3 FY2025 results via 8-K filing, reporting quarterly revenue of $35.1 billion, up 94% year-over-year and exceeding consensus expectations by $2.1 billion.

Data Center Dominance:
Data Center revenue reached $30.8 billion, up 112% year-over-year. Demand continues to outstrip supply for H100 and H200 GPUs. Major cloud providers (AWS, Azure, Google Cloud) accounted for approximately 50% of Data Center revenue.

Blackwell Architecture:
Production of the next-generation Blackwell GPU architecture is ramping faster than anticipated. CEO Jensen Huang stated "Blackwell production is in full steam" with demand exceeding supply well into 2025. Initial Blackwell revenue contribution expected in Q4.

Gross Margin Strength:
Non-GAAP gross margin of 75% demonstrates exceptional pricing power and product differentiation. Management expects gross margins to normalize in the low 70s as Blackwell ramps.

Geographic Mix:
China-related revenue was approximately 15% of Data Center revenue, down from historical levels due to export restrictions. Datacenter revenue from sovereign AI initiatives is growing rapidly across Europe, Middle East, and Asia Pacific.

Forward Guidance:
Q4 FY2025 revenue expected to be approximately $37.5 billion (+/-2%), implying 70% year-over-year growth. The company sees no signs of demand slowing, with enterprise AI adoption accelerating.

Balance Sheet:
Ended quarter with $18.2 billion in cash and investments. Authorized $25 billion additional share repurchases. The company remains debt-free with industry-leading returns on invested capital.`,
  },
  {
    id: 'curated-googl-10q',
    ticker: 'GOOGL',
    companyName: 'Alphabet Inc.',
    filingType: '10-Q',
    filedAt: '2024-10-29',
    keyHighlights: [
      'Total revenue up 15% to $88.3 billion',
      'Google Cloud crossed $11B quarterly milestone',
      'YouTube ads revenue grew 12% to $8.9 billion',
      'Operating margin expanded to 32%',
    ],
    fullSummary: `Alphabet reported Q3 2024 revenue of $88.3 billion, up 15% year-over-year, with improved profitability across all major segments. Google Cloud achieved a significant milestone, surpassing $11 billion in quarterly revenue.

Segment Analysis:

Google Services ($76.5B, +13%):
• Search and other: $49.4B (+12%)
• YouTube ads: $8.9B (+12%)
• Network: $7.5B (-3%)
• Subscriptions, platforms, and devices: $10.7B (+28%)

Google Cloud ($11.4B, +35%):
Cloud operating margin reached 17.1%, up from 11.3% year-over-year. Enterprise AI demand is driving multi-year cloud commitments. Google Cloud Platform (GCP) growth outpaced overall Cloud growth.

Other Bets ($388M, +38%):
Waymo completed over 100,000 paid rides per week. Other Bets operating loss narrowed to $1.1 billion from $1.2 billion in prior year.

AI Integration:
Gemini AI models are now integrated across Search, YouTube, Cloud, and Android. AI Overviews in Search now reach over 1 billion users monthly. Google Workspace now has 10 million paying Gemini users.

Capital Allocation:
CapEx of $13.1 billion reflects AI infrastructure investment. Repurchased $15.8 billion in Class A and C shares. Cash and marketable securities: $93.2 billion.

Regulatory Environment:
The 10-Q details ongoing DOJ antitrust case regarding Search distribution agreements. Management maintains confidence in the legal position while preparing for potential remedies.

Q4 Outlook:
Management expects continued momentum in Cloud and Search. YouTube is benefiting from shift of TV advertising to streaming platforms.`,
  },
  {
    id: 'curated-tsla-form4',
    ticker: 'TSLA',
    companyName: 'Tesla, Inc.',
    filingType: 'Form 4',
    filedAt: '2024-11-15',
    keyHighlights: [
      'CEO Elon Musk exercised 5.5M stock options',
      'Options exercise price: $23.34 per share',
      'Current market value: ~$1.4 billion',
      'Holding period: Long-term retention indicated',
    ],
    fullSummary: `This Form 4 filing discloses insider transactions by Tesla CEO Elon Musk involving the exercise of stock options and related securities.

Transaction Details:
• Type: Exercise of stock options
• Shares: 5,500,000 common shares
• Exercise Price: $23.34 per share
• Total Exercise Cost: ~$128.4 million
• Market Value at Exercise: ~$1.4 billion (at ~$254/share)
• Gross Gain: ~$1.27 billion

Ownership Context:
Following this transaction, Elon Musk beneficially owns approximately 411 million Tesla shares (excluding options), representing roughly 13% of outstanding shares. This includes shares held through trusts and other entities.

Options Background:
These options were granted as part of the 2018 compensation package that tied vesting to ambitious market cap and operational milestones. Tesla achieved all 12 tranches of the performance targets.

No Planned Sales:
The filing indicates the shares will be retained long-term. No associated sale transactions were filed. This is consistent with Musk's pattern of exercising options for retention rather than monetization.

Investor Implications:
• Demonstrates CEO alignment with long-term shareholder value
• Options exercised well below current market price
• No indication of near-term selling pressure from this transaction
• Musk's ownership stake remains substantial

Note: This follows previous options exercises throughout 2022-2024 as various tranches vested and approached expiration dates.`,
  },
  {
    id: 'curated-brk-def14a',
    ticker: 'BRK.A',
    companyName: 'Berkshire Hathaway Inc.',
    filingType: 'DEF 14A',
    filedAt: '2024-03-15',
    keyHighlights: [
      'Warren Buffett compensation: $100,000 salary only',
      'Board proposes Greg Abel as successor CEO',
      'Shareholders to vote on 4 proposals',
      'Annual meeting in Omaha: May 4, 2024',
    ],
    fullSummary: `Berkshire Hathaway's proxy statement (DEF 14A) outlines key governance matters for the 2024 annual meeting, including executive compensation, board elections, and shareholder proposals.

Executive Compensation:
Warren Buffett's total compensation remains at $100,000 annual salary with no equity grants, bonuses, or perks. Vice Chairman Charlie Munger received the same before his passing. This approach reflects the company's shareholder-oriented culture.

CEO Succession:
The filing provides clear succession planning, with Greg Abel (Vice Chairman - Non-Insurance Operations) designated as successor CEO. Ajit Jain continues to oversee all insurance operations as Vice Chairman.

Board Composition:
• Board Size: 14 directors
• Independence: 12 independent directors (86%)
• Average Tenure: 15 years
• Gender Diversity: 3 female directors (21%)

Shareholder Proposals:
1. Report on climate lobbying expenditures (Board recommends AGAINST)
2. Report on median gender and racial pay gap (Board recommends AGAINST)
3. Adopt simple majority voting (Board recommends AGAINST)
4. Report on workforce diversity (Board recommends AGAINST)

Meeting Details:
• Date: May 4, 2024
• Location: CHI Health Center, Omaha, NE
• Record Date: March 6, 2024
• Webcast available for remote attendance

Investment Implications:
The proxy reinforces Berkshire's unusual corporate governance approach: minimal executive compensation, long-term oriented board, and resistance to prescriptive ESG mandates. Succession planning clarity is a positive for long-term shareholders.`,
  },
];

/**
 * Get curated filings for the landing page
 * In production, this could be expanded to mix curated with recent database filings
 */
export async function getCuratedFilings(): Promise<CuratedFiling[]> {
  return CURATED_FILINGS;
}

/**
 * Get a single curated filing by ID
 */
export async function getCuratedFilingById(
  id: string
): Promise<CuratedFiling | undefined> {
  return CURATED_FILINGS.find((filing) => filing.id === id);
}
