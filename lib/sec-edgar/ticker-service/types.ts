/**
 * Types for SEC Edgar Ticker Service
 */

// Ticker resolution options
export interface TickerResolutionOptions {
  createIfNotExists?: boolean; // Whether to create a CIK mapping entry if none exists
  forceRefresh?: boolean; // Force refresh from SEC API even if cached
  maxRetries?: number; // Maximum number of retry attempts
  fuzzyMatch?: boolean; // Whether to use fuzzy matching for company names
  fuzzyThreshold?: number; // Threshold for fuzzy matching (0.0-1.0)
  includeHistorical?: boolean; // Whether to include historical ticker data
}

// SEC Company data response format (from submissions API)
export interface SECCompanyData {
  cik: string; // CIK number (without leading zeros)
  entityType: string; // Type of entity
  sic: string; // Standard Industrial Classification code
  sicDescription: string; // Description of SIC code
  insiderTransactionForOwnerExists: boolean;
  insiderTransactionForIssuerExists: boolean;
  name: string; // Company name
  tickers: string[]; // Array of ticker symbols
  exchanges: string[]; // Array of exchange codes
  ein: string | null; // Employer Identification Number
  description?: string; // Company description if available
  website?: string; // Company website if available
  investorWebsite?: string; // Investor relations website if available
  category?: string; // Company category if available
  fiscalYearEnd?: string; // Fiscal year end date (MM-DD)
  stateOfIncorporation?: string; // State of incorporation
  addresses?: {
    mailing?: SECCompanyAddress;
    business?: SECCompanyAddress;
  };
  phone?: string; // Company phone number
  flags?: string[]; // Any flags on the company
  formerNames?: SECFormerName[]; // Array of former names
  filings?: SECFilings; // Company filings data
}

// SEC Company address format
interface SECCompanyAddress {
  street1?: string;
  street2?: string;
  city?: string;
  stateOrCountry?: string;
  zipCode?: string;
  stateOrCountryDescription?: string;
}

// Former name of a company
interface SECFormerName {
  name: string;
  from: string; // Date (YYYY-MM-DD)
  to: string; // Date (YYYY-MM-DD)
}

// SEC Filings data
interface SECFilings {
  recent: {
    accessionNumber: string[];
    filingDate: string[];
    reportDate: string[];
    acceptanceDateTime: string[];
    act: string[];
    form: string[];
    fileNumber: string[];
    filmNumber: string[];
    items: string[];
    size: number[];
    isXBRL: number[];
    isInlineXBRL: number[];
    primaryDocument: string[];
    primaryDocDescription: string[];
  };
  files: Array<{
    name: string;
    filingCount: number;
    filingFrom: string;
    filingTo: string;
  }>;
}

// Ticker resolution result
export interface TickerResolutionResult {
  success: boolean;
  ticker: string; // Original ticker requested
  normalizedTicker: string; // Normalized ticker
  cik?: string; // CIK with leading zeros if found
  companyName?: string; // Company name if found
  error?: string; // Error message if unsuccessful
  source?: 'cache' | 'database' | 'sec-api' | 'fuzzy-match'; // Where the result came from
  confidence?: number; // Confidence score (0.0-1.0) for fuzzy matches
  alternatives?: Array<{ ticker: string; cik: string; companyName: string; confidence: number }>; // Alternative matches
  historical?: boolean; // Whether this ticker is historical
  currentTicker?: string; // Current ticker if historical
  metadata?: Partial<SECCompanyData>; // Additional metadata if available
}

// Ticker change type
export type TickerChangeType = 'Merger' | 'Acquisition' | 'NameChange' | 'Spinoff' | 'Delisted' | 'Unknown';

// Ticker change event
export interface TickerChangeEvent {
  oldTicker: string;
  newTicker: string;
  oldCik?: string;
  newCik?: string;
  effectiveDate: Date;
  changeType: TickerChangeType;
  description?: string;
}

// Database model interfaces
export interface CikMappingData {
  id: string;
  cik: string;
  ticker: string;
  companyName: string;
  aliases: string[];
  exchangeCodes: string[];
  sic?: string;
  ein?: string;
  entityType?: string;
  formerNames?: Record<string, { from: string; to: string; }>;
  formerTickers?: Record<string, { from: string; to: string; }>;
  lastUpdated: Date;
  fetchAttempts: number;
  lastFetchStatus?: string;
  isActive: boolean;
}

export interface TickerChangeData {
  id: string;
  oldTicker: string;
  newTicker: string;
  oldCik?: string;
  newCik?: string;
  effectiveDate: Date;
  changeType: string;
  description?: string;
  createdAt: Date;
} 