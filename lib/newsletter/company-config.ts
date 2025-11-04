export const FORTUNE_500_FOCUS = [
  { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', sector: 'Technology' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', sector: 'Technology' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', sector: 'Consumer Discretionary' },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', sector: 'Technology' },
  { symbol: 'META', name: 'Meta Platforms Inc.', sector: 'Technology' },
  { symbol: 'TSLA', name: 'Tesla Inc.', sector: 'Consumer Discretionary' },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', sector: 'Financials' },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare' },
  { symbol: 'V', name: 'Visa Inc.', sector: 'Financials' },
  { symbol: 'WMT', name: 'Walmart Inc.', sector: 'Consumer Staples' },
  { symbol: 'PG', name: 'Procter & Gamble Co.', sector: 'Consumer Staples' },
  { symbol: 'HD', name: 'Home Depot Inc.', sector: 'Consumer Discretionary' },
  { symbol: 'CVX', name: 'Chevron Corporation', sector: 'Energy' },
  { symbol: 'XOM', name: 'Exxon Mobil Corporation', sector: 'Energy' },
  { symbol: 'BAC', name: 'Bank of America Corp.', sector: 'Financials' },
  { symbol: 'ABBV', name: 'AbbVie Inc.', sector: 'Healthcare' },
  { symbol: 'KO', name: 'Coca-Cola Company', sector: 'Consumer Staples' },
  { symbol: 'PFE', name: 'Pfizer Inc.', sector: 'Healthcare' },
  { symbol: 'TMO', name: 'Thermo Fisher Scientific Inc.', sector: 'Healthcare' }
];

export const NEWSLETTER_CONFIG = {
  deliveryDay: 'sunday', // Sunday delivery
  maxFilingsPerCompany: 2, // Limit filings per company per week
  maxTotalFilings: 15, // Total filings in newsletter
  priorityForms: ['10-K', '10-Q', '8-K'], // Prioritize these form types
  minQualityScore: 0.7, // Minimum quality score for inclusion
  lookbackDays: 7, // How many days to look back for filings
};

export type CompanyInfo = {
  symbol: string;
  name: string;
  sector: string;
};

export type NewsletterDigest = {
  week: string;
  sections: NewsletterSection[];
  totalFilings: number;
  companiesCovered: number;
  generatedAt: string;
};

export type NewsletterSection = {
  title: string;
  items: NewsletterItem[];
};

export type NewsletterItem = {
  // Highlight items
  company?: string;
  symbol?: string;
  sector?: string;
  filingType?: string;
  headline?: string;
  summary?: string;
  url?: string;
  priority?: number;
  qualityScore?: number;
  filedAt?: string;
  
  // Company items
  filings?: FilingItem[];
  
  // Upgrade items
  description?: string;
  features?: string[];
  cta?: string;
};

export type FilingItem = {
  type: string;
  summary: string;
  url: string;
  filedAt: string;
  qualityScore?: number;
};