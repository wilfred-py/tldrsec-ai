/**
 * Static educational content for SEC filing type guide pages.
 *
 * Keys are URL slugs (lowercase, hyphenated). The SEC formType stored in the
 * database may differ in casing — `dbFormType` holds the canonical form type
 * used in `SecFiling.formType` queries.
 */

export interface FilingTypeGuide {
  slug: string;
  dbFormType: string; // Matches SecFiling.formType values
  name: string;
  shortDescription: string;
  // Long-form content rendered as markdown-ish sections
  whatItIs: string;
  whoFilesIt: string;
  whyItMatters: string;
  keyThings: string[];
  deadline: string;
  frequency: string;
}

export const FILING_TYPE_GUIDES: Record<string, FilingTypeGuide> = {
  '10-k': {
    slug: '10-k',
    dbFormType: '10-K',
    name: 'Form 10-K',
    shortDescription:
      'The annual report every public company files with the SEC. It contains audited financials, management discussion, and risk factors.',
    whatItIs:
      'Form 10-K is the comprehensive annual report that publicly traded US companies must file with the Securities and Exchange Commission. It covers the fiscal year and includes audited financial statements, a management discussion and analysis (MD&A), detailed risk factors, a business description, and executive compensation disclosures.',
    whoFilesIt:
      'Every company whose securities are registered under Section 12 of the Exchange Act, or that has filed a registration statement that became effective under the Securities Act. Foreign private issuers file Form 20-F instead.',
    whyItMatters:
      'It is the single most important filing for understanding a company. The audited financials are the ground truth for revenue, earnings, cash flow, and balance sheet health. The risk factors section reveals what management is worried about. The MD&A explains what drove results in the company\'s own words.',
    keyThings: [
      'Audited financial statements (income statement, balance sheet, cash flow)',
      "Management's Discussion and Analysis (MD&A) of financial condition and results",
      'Risk factors the company believes could materially affect its business',
      'Business description, segments, properties, and legal proceedings',
      'Executive compensation and related-party transactions',
      'Auditor\'s report and internal controls assessment',
    ],
    deadline:
      '60 days after fiscal year end for large accelerated filers, 75 days for accelerated filers, 90 days for others.',
    frequency: 'Once per fiscal year',
  },
  '10-q': {
    slug: '10-q',
    dbFormType: '10-Q',
    name: 'Form 10-Q',
    shortDescription:
      'Quarterly report filed three times a year with unaudited interim financials and updates on material changes.',
    whatItIs:
      'Form 10-Q is the quarterly report filed for each of the first three fiscal quarters (no 10-Q is filed for Q4 because it\'s covered by the annual 10-K). It contains condensed unaudited financial statements and an updated MD&A covering the quarter.',
    whoFilesIt:
      'The same domestic public issuers that file 10-Ks. Filings are due for Q1, Q2, and Q3 fiscal quarters.',
    whyItMatters:
      'Quarterly filings reveal how the story is unfolding. YoY revenue comparisons, segment-level trends, and any new risk factors appear here long before the 10-K does. Earnings call transcripts reference the 10-Q numbers.',
    keyThings: [
      'Unaudited condensed balance sheet, income statement, and cash flow statement',
      'Management\'s Discussion and Analysis for the quarter',
      'Updates to risk factors since the last annual report',
      'Legal proceedings and material events during the quarter',
      'Quantitative and qualitative disclosures about market risk',
    ],
    deadline:
      '40 days after fiscal quarter end for large accelerated and accelerated filers, 45 days for others.',
    frequency: 'Three times per fiscal year (Q1, Q2, Q3)',
  },
  '8-k': {
    slug: '8-k',
    dbFormType: '8-K',
    name: 'Form 8-K',
    shortDescription:
      'Current report filed on demand when material events occur: mergers, leadership changes, earnings releases, material contracts, etc.',
    whatItIs:
      'Form 8-K is the "current report" — filed promptly when a material event happens between periodic reports. There are dozens of triggering items, each numbered (e.g., 1.01 Entry into Material Definitive Agreement, 5.02 Departure of Directors or Officers).',
    whoFilesIt:
      'Any public company, whenever a reportable event occurs. Usually filed within 4 business days of the event.',
    whyItMatters:
      '8-Ks are the first place news breaks. CEO resignations, M&A announcements, earnings results (via Item 2.02), material impairments, cybersecurity incidents — all show up here before the press reports them.',
    keyThings: [
      'Item 1.01/1.02: entry into or termination of material definitive agreements',
      'Item 2.02: results of operations (earnings releases attached as exhibits)',
      'Item 5.02: departure or appointment of directors, officers',
      'Item 8.01: other events the company deems important',
      'Item 1.05: material cybersecurity incidents',
    ],
    deadline: '4 business days after the triggering event',
    frequency: 'Event-driven — whenever something material happens',
  },
  'form-4': {
    slug: 'form-4',
    dbFormType: '4',
    name: 'Form 4',
    shortDescription:
      'Insider transaction report. Filed by officers, directors, and 10%+ owners after they buy, sell, or exercise securities.',
    whatItIs:
      'Form 4 is filed by corporate insiders (officers, directors, and beneficial owners of 10% or more) to report changes in ownership of their company\'s securities. It covers open-market purchases and sales, option exercises, and grants.',
    whoFilesIt:
      'Section 16 insiders of any public company. The insider files it, though most corporate legal teams handle the logistics.',
    whyItMatters:
      'Insider buying and selling is one of the most-followed signals in markets. Large unplanned sales can precede bad news; clusters of buying often precede good news. Form 4s are the primary data source for "insider activity" trackers.',
    keyThings: [
      'Transaction type (P=open-market purchase, S=open-market sale, M=option exercise, A=grant/award, etc.)',
      'Transaction date, number of shares, and price per share',
      'Securities held after the transaction (direct and indirect)',
      'Whether the transaction was pursuant to a 10b5-1 trading plan',
      'Reporting person\'s relationship to the issuer (officer, director, 10% owner)',
    ],
    deadline:
      '2 business days after the transaction date (one of the tightest deadlines in SEC filings).',
    frequency: 'Per transaction',
  },
  'form-144': {
    slug: 'form-144',
    dbFormType: '144',
    name: 'Form 144',
    shortDescription:
      'Notice of proposed insider sale of restricted or control securities. Earlier signal than Form 4 for large planned sales.',
    whatItIs:
      'Form 144 is the notice an insider files with the SEC before selling restricted or control securities under Rule 144. It must be filed when the sale exceeds 5,000 shares or $50,000 in value in any three-month period.',
    whoFilesIt:
      'Affiliates of the issuer (officers, directors, 10% shareholders) who hold restricted stock and plan to sell it.',
    whyItMatters:
      'Form 144 is filed *before* the sale, while Form 4 is filed *after*. For watchers of insider activity, 144 is an earlier signal that a large sale may be coming. Not all 144s result in sales — some are filed as placeholders.',
    keyThings: [
      'Number of shares proposed to be sold and the approximate sale date',
      'Name of the broker handling the sale',
      'Aggregate sale volume in the past three months',
      'Whether the securities were acquired on the open market or directly from the issuer',
    ],
    deadline: 'At the time of placing the sale order with a broker',
    frequency: 'Per planned sale exceeding the 5,000 share / $50k threshold',
  },
  'def-14a': {
    slug: 'def-14a',
    dbFormType: 'DEF 14A',
    name: 'Form DEF 14A',
    shortDescription:
      'Definitive proxy statement filed ahead of annual shareholder meetings. Covers votes on directors, auditors, executive compensation, and shareholder proposals.',
    whatItIs:
      'DEF 14A is the definitive proxy statement. It describes what shareholders will vote on at the annual meeting: director elections, executive compensation (say-on-pay), auditor ratification, and any shareholder proposals.',
    whoFilesIt:
      'Every public company before its annual meeting. Preliminary proxy materials are filed on PRE 14A first; DEF 14A is the version mailed to shareholders.',
    whyItMatters:
      'The proxy is where executive pay, director independence, shareholder activism, and corporate governance live. Want to know the CEO\'s total comp? It\'s in the Summary Compensation Table in the proxy.',
    keyThings: [
      'Director nominees and their biographies',
      'Executive compensation tables (Summary Compensation, Grants of Plan-Based Awards, Pay-Versus-Performance)',
      'Say-on-pay advisory vote',
      'Auditor ratification',
      'Shareholder proposals and the board\'s recommendation',
      'Related-party transactions and beneficial ownership',
    ],
    deadline: 'Mailed to shareholders at least 40 days before the annual meeting',
    frequency: 'Annually before the shareholder meeting',
  },
  's-1': {
    slug: 's-1',
    dbFormType: 'S-1',
    name: 'Form S-1',
    shortDescription:
      'The IPO registration statement. First comprehensive disclosure a company makes when going public.',
    whatItIs:
      'Form S-1 is the initial registration statement filed when a private company intends to issue securities publicly (typically an IPO). It includes a full business description, financial statements, use of proceeds, risk factors, and the offering terms.',
    whoFilesIt: 'Private companies preparing to go public; also used for certain follow-on offerings.',
    whyItMatters:
      'The S-1 is the first detailed look outsiders get at a private company\'s financials and business. It sets the narrative for the IPO and drives initial valuation debates.',
    keyThings: [
      'Business overview, market opportunity, competitive positioning',
      'Three years of audited financial statements',
      'Use of proceeds from the offering',
      'Risk factors (often the longest section)',
      'Executive compensation and principal shareholders',
      'Offering structure: share count, price range, underwriters',
    ],
    deadline: 'Filed with the SEC; must be declared effective before the IPO prices',
    frequency: 'Once per IPO (subsequent offerings use S-3 or similar)',
  },
  's-3': {
    slug: 's-3',
    dbFormType: 'S-3',
    name: 'Form S-3',
    shortDescription:
      'Shelf registration statement for seasoned issuers. Lets companies register securities to sell later with less paperwork.',
    whatItIs:
      'Form S-3 is a shorter-form registration statement available to "seasoned issuers" that already have public disclosure on file. It enables shelf registrations, where a company registers a large amount of securities and sells portions later via prospectus supplements.',
    whoFilesIt:
      'Public companies meeting S-3 eligibility requirements (minimum public float, timely filings for 12 months, etc.).',
    whyItMatters:
      'Shelf registrations are the mechanism for at-the-market (ATM) offerings and opportunistic capital raises. A big S-3 filing often precedes a dilutive share issuance.',
    keyThings: [
      'Types and aggregate amount of securities registered',
      'Use of proceeds (usually generic)',
      'Incorporation by reference to the 10-K and 10-Qs (why it\'s shorter)',
      'Selling security holders, if any',
    ],
    deadline: 'Filed whenever the company wants to raise capital; remains effective for up to 3 years',
    frequency: 'Renewed periodically by seasoned issuers',
  },
};

export function getFilingTypeGuide(slug: string): FilingTypeGuide | null {
  return FILING_TYPE_GUIDES[slug.toLowerCase()] ?? null;
}

export function getAllFilingTypeGuides(): FilingTypeGuide[] {
  return Object.values(FILING_TYPE_GUIDES);
}
