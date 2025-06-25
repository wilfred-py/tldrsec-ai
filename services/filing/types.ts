import { FilingType, FilingSummary } from '../../types/sec/filing';
import { ParsedContent } from '../../lib/parsers/form-parser';

// Filing processing status types
export type FilingProcessStatus = 'queued' | 'processing' | 'completed' | 'failed';

// Filing summary result interface
export interface FilingSummaryResult {
  ticker: string;
  companyName: string;
  filingType: FilingType;
  filingDate: string;
  accessionNumber: string;
  summaryText: string;
  keyPoints: string[];
  url: string; // SEC HTML viewer URL
  filingUrl?: string; // Kept for backward compatibility
  parsedContent?: ParsedContent;
  rawData?: any;
  // AI metrics fields
  tokensUsed?: number; // total tokens (legacy)
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  cost?: number;
  processingStatus?: string;
  processingTimeMs?: number;
  /**
   * If summarization failed or fallback was used, provides the error reason.
   */
  failureReason?: string;
}

// Error type for email summaries
export interface FilingError {
  ticker: string;
  error: string;
}
