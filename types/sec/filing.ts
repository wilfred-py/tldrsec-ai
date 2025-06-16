export interface SecFiling {
  accessionNumber: string;
  filingDate: string;
  formType: string;
  cik: string;
  companyName: string;
  documents?: SecFilingDocument[];
  content?: string;
  filingUrl?: string;
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
}

export type FilingType = 'Form 144' | '144' | '10-K' | '10-Q' | '8-K' | 'DEF 14A' | 'Form4' | '4';
