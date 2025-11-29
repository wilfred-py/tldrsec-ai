/**
 * Known Filing Test Fixtures
 *
 * These are known SEC filings with expected metadata that can be used for:
 * 1. Regression testing URL construction
 * 2. Content fetching verification
 * 3. Metadata extraction validation
 *
 * Each fixture includes:
 * - ticker: Company ticker symbol
 * - accessionNumber: SEC accession number
 * - formType: Type of SEC form
 * - filingDate: Date the filing was submitted
 * - cik: Company CIK number
 * - companyName: Company name as it appears in SEC filings
 * - expectedContentMarkers: Strings that must appear in valid content
 * - minContentLength: Minimum expected content size in bytes
 */

export interface KnownFiling {
  ticker: string;
  accessionNumber: string;
  formType: string;
  filingDate: string;
  cik: string;
  companyName: string;
  expectedContentMarkers: string[];
  minContentLength: number;
  description: string;
}

/**
 * Known filings for regression testing
 * Updated: 2025-11-28
 *
 * Selection criteria:
 * - Mix of form types (10-K, 10-Q, 8-K, Form 4)
 * - User-tracked tickers from tldrsec-ai database
 * - Variety of filing sizes
 * - Recent filings (within last year)
 */
export const KNOWN_FILINGS: KnownFiling[] = [
  // 10-K Annual Reports
  {
    ticker: 'VRT',
    accessionNumber: '0001628280-25-005905',
    formType: '10-K',
    filingDate: '2025-02-18',
    cik: '0001674101',
    companyName: 'Vertiv Holdings Co',
    expectedContentMarkers: [
      'VERTIV',
      'Form 10-K',
      'Annual Report'
    ],
    minContentLength: 1000000,
    description: 'Vertiv 2024 Annual Report'
  },
  {
    ticker: 'TSLA',
    accessionNumber: '0001628280-25-003063',
    formType: '10-K',
    filingDate: '2025-01-30',
    cik: '0001318605',
    companyName: 'Tesla, Inc.',
    expectedContentMarkers: [
      'TESLA',
      'Form 10-K',
      'Annual Report'
    ],
    minContentLength: 2000000,
    description: 'Tesla 2024 Annual Report'
  },
  {
    ticker: 'AAPL',
    accessionNumber: '0000320193-25-000079',
    formType: '10-K',
    filingDate: '2025-10-31',
    cik: '0000320193',
    companyName: 'Apple Inc.',
    expectedContentMarkers: [
      'APPLE',
      'Form 10-K'
    ],
    minContentLength: 1000000,
    description: 'Apple FY2025 Annual Report'
  },

  // 10-Q Quarterly Reports
  {
    ticker: 'NVDA',
    accessionNumber: '0001045810-25-000230',
    formType: '10-Q',
    filingDate: '2025-11-19',
    cik: '0001045810',
    companyName: 'NVIDIA CORP',
    expectedContentMarkers: [
      'NVIDIA',
      'Form 10-Q',
      'Quarterly Report'
    ],
    minContentLength: 500000,
    description: 'NVIDIA Q3 FY2026 Quarterly Report'
  },
  {
    ticker: 'AMZN',
    accessionNumber: '0001018724-25-000123',
    formType: '10-Q',
    filingDate: '2025-10-31',
    cik: '0001018724',
    companyName: 'AMAZON COM INC',
    expectedContentMarkers: [
      'AMAZON',
      'Form 10-Q'
    ],
    minContentLength: 500000,
    description: 'Amazon Q3 2025 Quarterly Report'
  },

  // 8-K Current Reports
  {
    ticker: 'KO',
    accessionNumber: '0001628280-25-045577',
    formType: '8-K',
    filingDate: '2025-10-21',
    cik: '0000021344',
    companyName: 'COCA COLA CO',
    expectedContentMarkers: [
      'COCA-COLA',
      'Form 8-K'
    ],
    minContentLength: 10000,
    description: 'Coca-Cola Current Report October 2025'
  },
  {
    ticker: 'COIN',
    accessionNumber: '0001679788-25-000207',
    formType: '8-K',
    filingDate: '2025-10-30',
    cik: '0001679788',
    companyName: 'Coinbase Global, Inc.',
    expectedContentMarkers: [
      'COINBASE',
      'Form 8-K'
    ],
    minContentLength: 10000,
    description: 'Coinbase Current Report October 2025'
  },

  // Form 4 Insider Trading
  {
    ticker: 'GOOGL',
    accessionNumber: '0001193125-25-300961',
    formType: '4',
    filingDate: '2025-11-26',
    cik: '0001652044',
    companyName: 'Alphabet Inc.',
    expectedContentMarkers: [
      'ownershipDocument',
      'issuerName'
    ],
    minContentLength: 3000,
    description: 'Alphabet Inc Form 4 - Insider Trading November 2025'
  },
  {
    ticker: 'V',
    accessionNumber: '0001403161-25-000113',
    formType: '4',
    filingDate: '2025-11-21',
    cik: '0001403161',
    companyName: 'VISA INC.',
    expectedContentMarkers: [
      'ownershipDocument'
    ],
    minContentLength: 2000,
    description: 'Visa Inc Form 4 - Insider Trading November 2025'
  },

  // Netflix quarterly report
  {
    ticker: 'NFLX',
    accessionNumber: '0001065280-25-000406',
    formType: '10-Q',
    filingDate: '2025-10-22',
    cik: '0001065280',
    companyName: 'NETFLIX INC',
    expectedContentMarkers: [
      'NETFLIX',
      'Form 10-Q'
    ],
    minContentLength: 500000,
    description: 'Netflix Q3 2025 Quarterly Report'
  }
];

/**
 * Get a subset of known filings for quick testing
 */
export function getQuickTestFilings(): KnownFiling[] {
  // Return one filing of each type for fast testing
  const formTypes = new Set<string>();
  return KNOWN_FILINGS.filter(f => {
    if (formTypes.has(f.formType)) return false;
    formTypes.add(f.formType);
    return true;
  });
}

/**
 * Get filings by form type
 */
export function getFilingsByType(formType: string): KnownFiling[] {
  return KNOWN_FILINGS.filter(f => f.formType === formType);
}

/**
 * Get filings by ticker
 */
export function getFilingsByTicker(ticker: string): KnownFiling[] {
  return KNOWN_FILINGS.filter(f => f.ticker.toUpperCase() === ticker.toUpperCase());
}
