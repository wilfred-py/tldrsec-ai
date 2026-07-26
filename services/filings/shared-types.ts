import { FilingType } from '../../types/sec/filing';
import { ParsedContent } from '../../lib/parsers/form-parser';

export interface FilingSummaryResult {
  ticker: string;
  companyName: string;
  filingType: FilingType;
  filingDate: string;
  accessionNumber: string;
  summaryText: string;
  keyPoints: string[];
  url: string;
  filingUrl?: string;
  parsedContent?: ParsedContent;
  rawData?: any;
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  cost?: number;
  processingStatus?: string;
  processingTimeMs?: number;
  failureReason?: string;
  databaseId?: string;
  isCacheHit?: boolean;
  cacheUsageCount?: number;
  qualityScore?: number;
}

export interface FilingError {
  ticker: string;
  error: string;
}

export interface SECFiling {
  filingDate?: string;
  formType?: string;
  accessionNumber?: string;
  cik?: string;
  fileNumber?: string;
  description?: string;
  filingHtmlUrl?: string;
  id?: string;
  periodOfReport?: string;
  filingUrl?: string;
}

export interface Company {
  name?: string;
  ticker?: string;
  cik?: string;
  description?: string;
}
