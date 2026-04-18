/**
 * Hardcoded company metadata for the 15 tracked tickers.
 *
 * Sourced from the Obsidian vault at wiki/companies/*.md frontmatter.
 * The vault is the editorial source; this file is the version-controlled
 * build-time snapshot. Update when adding/removing tracked companies.
 *
 * Why not put this in the DB? The `Ticker` model is per-user, so there's no
 * clean global "company" entity. Hardcoding works because (a) there are only
 * 15 companies and (b) changes are rare and editorial.
 */

export type SectorName =
  | 'Technology'
  | 'Financial Services'
  | 'Healthcare'
  | 'Consumer Discretionary'
  | 'Consumer Staples'
  | 'Industrials';

export interface CompanyMeta {
  ticker: string;
  name: string;
  sector: SectorName;
  industry: string;
  // SEC EDGAR CIK for `sameAs` structured-data links (lookup: https://www.sec.gov/cgi-bin/browse-edgar?CIK={cik})
  cik?: string;
}

export const COMPANIES: Record<string, CompanyMeta> = {
  AAPL: { ticker: 'AAPL', name: 'Apple Inc.', sector: 'Technology', industry: 'Consumer Electronics / Software', cik: '320193' },
  AMZN: { ticker: 'AMZN', name: 'Amazon.com Inc.', sector: 'Technology', industry: 'E-Commerce / Cloud Computing', cik: '1018724' },
  BAC: { ticker: 'BAC', name: 'Bank of America Corp', sector: 'Financial Services', industry: 'Diversified Banking', cik: '70858' },
  'BRK-B': { ticker: 'BRK-B', name: 'Berkshire Hathaway Inc', sector: 'Financial Services', industry: 'Conglomerate / Insurance', cik: '1067983' },
  CMG: { ticker: 'CMG', name: 'Chipotle Mexican Grill Inc', sector: 'Consumer Discretionary', industry: 'Restaurants', cik: '1058090' },
  COIN: { ticker: 'COIN', name: 'Coinbase Global, Inc.', sector: 'Financial Services', industry: 'Cryptocurrency Exchange', cik: '1679788' },
  GOOGL: { ticker: 'GOOGL', name: 'Alphabet Inc.', sector: 'Technology', industry: 'Internet / Advertising / Cloud', cik: '1652044' },
  JNJ: { ticker: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare', industry: 'Pharmaceuticals / MedTech', cik: '200406' },
  JPM: { ticker: 'JPM', name: 'JPMorgan Chase & Co.', sector: 'Financial Services', industry: 'Diversified Banking', cik: '19617' },
  KO: { ticker: 'KO', name: 'The Coca-Cola Company', sector: 'Consumer Staples', industry: 'Beverages', cik: '21344' },
  META: { ticker: 'META', name: 'Meta Platforms Inc.', sector: 'Technology', industry: 'Social Media / Digital Advertising', cik: '1326801' },
  MSFT: { ticker: 'MSFT', name: 'Microsoft Corporation', sector: 'Technology', industry: 'Software / Cloud Computing', cik: '789019' },
  NVDA: { ticker: 'NVDA', name: 'NVIDIA Corporation', sector: 'Technology', industry: 'Semiconductors / AI', cik: '1045810' },
  TSLA: { ticker: 'TSLA', name: 'Tesla, Inc.', sector: 'Consumer Discretionary', industry: 'Electric Vehicles / Energy / AI', cik: '1318605' },
  VRT: { ticker: 'VRT', name: 'Vertiv Holdings Co', sector: 'Technology', industry: 'Data Center Infrastructure', cik: '1674101' },
};

export function getCompanyMeta(ticker: string): CompanyMeta | null {
  return COMPANIES[ticker.toUpperCase()] ?? null;
}

export function getAllCompanyMeta(): CompanyMeta[] {
  return Object.values(COMPANIES);
}

export function getCompaniesBySector(sector: SectorName): CompanyMeta[] {
  return Object.values(COMPANIES).filter((c) => c.sector === sector);
}
