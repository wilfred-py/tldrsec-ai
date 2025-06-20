export interface SecFiling {
  accessionNumber: string;
  filingDate: string;
  form: string;  // Used in getCompanyFilings and getLatestFilingByFormType
  formType?: string; // Keep for backward compatibility
  cik?: string;
  companyName?: string;
  documents?: SecFilingDocument[];
  content?: string;
  filingUrl?: string;
  primaryDocument?: string;
  primaryDocUrl?: string;
  reportDate?: string;
  description?: string;
}

export interface SecFilingDetails extends SecFiling {
  content: string;
  companyName: string;
  filingDate: string;
  accessionNumber: string;
  formType: string;
  cik: string;
}

export interface SecFilingDocument {
  type: string;
  filename: string;
  description: string;
  content?: string;
  documentUrl?: string;
  size?: number;
}

export interface FilingSummary {
  ticker: string;
  companyName: string;
  filingType: string;
  filingDate: string;
  summaryText: string;
  keyPoints: string[];
  filingUrl: string;
  url: string;
  rawData?: any;
  // Additional properties used in filingService.ts
  accessionNumber?: string;
  processingStatus?: string;
  inputTokens?: number;
  outputTokens?: number;
  tokensUsed?: number;
  model?: string;
  processingTimeMs?: number; // Added processingTimeMs property
  cost?: number;
  failureReason?: string;
}

export type FilingType = 'Form 144' | '144' | '10-K' | '10-Q' | '8-K' | 'DEF 14A' | 'Form4' | 'Form 4' | '4' | '25-NSE' | '25' | 'SC 13G' | 'SC 13G/A' | 'SC 13D' | 'SC 13D/A' | 'SD' | '6-K' | '20-F' | '40-F' | 'N-CSR' | 'N-Q' | 'N-PORT' | 'PX14A6G' | 'CORRESP' | 'UPLOAD';
