/**
 * Email Subject Line Service
 *
 * Centralized service for generating consistent email subject lines
 * across all SEC filing notification types.
 *
 * Subject line patterns:
 * - Individual filings: "New [FormType] Filing: [Company] ([Ticker])"
 * - Digest emails: "SEC Filing Summaries - [M/D/YYYY]"
 *
 * Part of Phase 3: Template and Email Consistency improvements
 */

/**
 * Date formatting locale constant - ensures consistent US format
 */
const DATE_LOCALE = 'en-US' as const;

/**
 * Subject line prefix for individual filing notifications
 */
const INDIVIDUAL_FILING_PREFIX = 'New' as const;

/**
 * Subject line prefix for digest emails
 */
const DIGEST_PREFIX = 'SEC Filing Summaries' as const;

/**
 * Parameters for generating a single filing subject line
 * All fields are required for proper subject line generation
 */
export interface SingleFilingSubjectParams {
  /** The SEC form type (e.g., "10-K", "Form 4", "8-K") */
  filingType: string;
  /** The full company name (e.g., "Apple Inc.") */
  companyName: string;
  /** The stock ticker symbol (e.g., "AAPL") */
  ticker: string;
}

/**
 * Parameters for generating a digest subject line
 */
export interface DigestSubjectParams {
  /** ISO date string (YYYY-MM-DD format) */
  date: string;
  /** Optional count of filings in the digest */
  filingCount?: number;
}

/**
 * Centralized Email Subject Service
 *
 * Provides consistent subject line generation across all email types
 * to ensure users have a predictable experience.
 */
export class EmailSubjectService {
  /**
   * Generate subject line for a single filing notification
   *
   * Format: "New [FormType] Filing: [Company] ([Ticker])"
   *
   * @param params - The filing details for subject generation
   * @returns Formatted subject line string
   * @throws Error if required parameters are missing
   *
   * @example
   * generateSingleFilingSubject({ filingType: '10-K', companyName: 'Apple Inc.', ticker: 'AAPL' })
   * // Returns: "New 10-K Filing: Apple Inc. (AAPL)"
   */
  static generateSingleFilingSubject({
    filingType,
    companyName,
    ticker
  }: SingleFilingSubjectParams): string {
    // Validate required parameters
    if (!filingType || !companyName || !ticker) {
      throw new Error(
        `Missing required parameters for subject line: filingType=${filingType}, companyName=${companyName}, ticker=${ticker}`
      );
    }

    return `${INDIVIDUAL_FILING_PREFIX} ${filingType} Filing: ${companyName} (${ticker})`;
  }

  /**
   * Generate subject line for a digest/batch email
   *
   * Format: "SEC Filing Summaries - [M/D/YYYY]"
   *
   * @param params - The digest details including date
   * @returns Formatted subject line string
   * @throws Error if date is invalid
   *
   * @example
   * generateDigestSubject({ date: '2026-01-06' })
   * // Returns: "SEC Filing Summaries - 1/6/2026"
   */
  static generateDigestSubject({ date }: DigestSubjectParams): string {
    // Validate date parameter
    if (!date) {
      throw new Error('Missing required date parameter for digest subject');
    }

    const formattedDate = this.formatDate(date);
    return `${DIGEST_PREFIX} - ${formattedDate}`;
  }

  /**
   * Format a date string to US format (M/D/YYYY)
   *
   * Uses toLocaleDateString with en-US locale for consistent
   * formatting without leading zeros.
   *
   * @param date - ISO date string (YYYY-MM-DD format)
   * @returns Formatted date string (M/D/YYYY)
   *
   * @example
   * formatDate('2026-01-06') // Returns: "1/6/2026"
   * formatDate('2026-12-25') // Returns: "12/25/2026"
   */
  static formatDate(date: string): string {
    const parsedDate = new Date(date);

    // Validate date is valid
    if (isNaN(parsedDate.getTime())) {
      throw new Error(`Invalid date format: ${date}`);
    }

    return parsedDate.toLocaleDateString(DATE_LOCALE);
  }
}
