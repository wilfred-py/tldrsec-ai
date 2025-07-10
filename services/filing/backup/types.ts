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

/**
 * SEC Filing interface with optional properties
 */
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

/**
 * Company information interface
 */
export interface Company {
  name?: string;
  ticker?: string;
  cik?: string;
  description?: string;
}

/**
 * Extended Error type for HTTP errors
 */
export type HttpError = Error & {
  response?: {
    status?: number;
    statusText?: string;
    data?: any;
  };
  code?: string;
  isAxiosError?: boolean;
};

/**
 * Email message interface for sending emails
 */
export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  tags?: Array<{ name: string; value: string }>;
  replyTo?: string;
}

/**
 * Summary generation result
 */
export interface SummaryGenerationResult {
  summary: string;
  keyPoints: string[];
  tokensUsed?: number;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  cost?: number;
  error?: string;
}
