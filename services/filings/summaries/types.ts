/**
 * Types for filing summaries
 */

import { FilingType } from '../../../types/sec/filing';
import { ParsedContent } from '../../../lib/parsers/form-parser';

// Re-export the FilingError type for backward compatibility
export interface FilingError {
  ticker: string;
  error: string;
}

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

export interface SummaryGenerationOptions {
  useFallback?: boolean;
  useCache?: boolean;
  debug?: boolean;
}

export interface SummaryGenerationResult {
  data: FilingSummaryResult | null;
  error?: string;
  fromCache?: boolean;
}

export interface EmailSendingResult {
  success: boolean;
  id?: string;
  error?: string;
}
