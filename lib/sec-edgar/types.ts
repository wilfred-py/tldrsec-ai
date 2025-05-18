/**
 * Types for SEC EDGAR API integration
 */

// Filing types supported by the application
export type FilingType = 
  | '10-K' 
  | '10-Q' 
  | '8-K' 
  | 'Form4' 
  | '4'
  | 'DEFA14A'
  | 'SC 13D'
  | 'SC13D'
  | '144'
  | 'Form 144';

// Basic filing metadata interface
export interface FilingMetadata {
  companyName: string;
  ticker: string;
  cik: string;
  filingType: FilingType;
  filingDate: Date;
  filingUrl: string;
  description?: string;
}

// Interface for parsed filing data
export interface ParsedFiling extends FilingMetadata {
  id: string; // Unique identifier for the filing
  content?: string; // Optional full content of the filing
  formattedTitle?: string; // Formatted title for display
  url: string; // URL of the filing (may be same as filingUrl)
}

// Interface for SEC EDGAR API response
export interface SECApiResponse {
  entries: SECApiEntry[];
  nextPage?: string; // URL for pagination
  length?: number; // Optional length property for compatibility
}

// Single entry in the SEC EDGAR feed
export interface SECApiEntry {
  title: string;
  link: string;
  summary: string;
  updated: string; // ISO date string
  id: string;
  category?: string;
}

// Options for API requests
export interface SECRequestOptions {
  start?: number; // Start index for pagination
  count?: number; // Number of items to fetch
  formType?: FilingType | FilingType[]; // Filter by form type
  cik?: string; // Filter by CIK
  dateb?: string; // End date in YYYYMMDD format
  owner?: 'include' | 'exclude' | 'only'; // Owner filter
  retry?: boolean; // Whether to retry failed requests
  maxRetries?: number; // Maximum number of retries
}

/**
 * Search parameters for SEC EDGAR filings
 */
export interface SECFilingSearchParams {
  formType?: FilingType | FilingType[];
  startDate?: Date;
  endDate?: Date;
  count?: number;
  ticker?: string;
}

// Configuration for SEC Edgar client
export interface SECEdgarConfig {
  userAgent: string; // Required by SEC - should include contact email
  maxRequestsPerSecond: number; // Rate limit (default: 10)
  baseUrl: string; // Base URL for SEC EDGAR API
  maxRetries: number; // Maximum number of retries for failed requests
  retryDelay: number; // Delay between retries in ms
}

// Error codes for SEC Edgar API
export enum SECErrorCode {
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  NOT_FOUND = 'NOT_FOUND',
  PARSING_ERROR = 'PARSING_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

// Custom error class for SEC Edgar API
export class SECEdgarError extends Error {
  code: SECErrorCode;
  status?: number;
  
  constructor(message: string, code: SECErrorCode, status?: number) {
    super(message);
    this.name = 'SECEdgarError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Response from the processFilingEntries function
 */
export interface ProcessedFilingsResult {
  newFilings: ParsedFiling[];
  existingFilings: ParsedFiling[];
} 