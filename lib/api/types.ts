// SEC filing preference types
export interface FilingPreferences {
  tenK: boolean;
  tenQ: boolean;
  eightK: boolean;
  form4: boolean;
  other: boolean;
}

// Company data with filing preferences
export interface Company {
  id: string;
  symbol: string;
  name: string;
  lastFiling: string;
  preferences: FilingPreferences;
}

// Filing details data
export interface FilingDetails {
  revenue?: string;
  netIncome?: string;
  eps?: string;
  cashFlow?: string;
  assets?: string;
  operatingMargin?: string;
  yoy?: {
    revenue: string;
    margin: string;
    eps: string;
  };
  keyInsights?: string[];
  riskFactors?: string[];
}

// Filing log entry
export interface FilingLog {
  id: string;
  ticker: string;
  company: string;
  filingCode: string;
  filingName: string;
  filingDate: string;
  jobStart: string;
  jobCompleted: string;
  emailSent: string;
  status: string;
  details?: FilingDetails;
}

// Search result for adding new tickers
export interface TickerSearchResult {
  symbol: string;
  name: string;
}

// API Error response
export interface ApiError {
  status: number;
  message: string;
}

// API Response wrapper
export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
} 