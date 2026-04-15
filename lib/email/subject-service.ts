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
  /** Optional filer name for insider filings (Form 3, 4, 144) */
  filerName?: string;
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
   * For amended filings (form types ending with /A): "[AMENDED] New [FormType] Filing: [Company] ([Ticker])"
   *
   * @param params - The filing details for subject generation
   * @returns Formatted subject line string
   * @throws Error if required parameters are missing
   *
   * @example
   * generateSingleFilingSubject({ filingType: '10-K', companyName: 'Apple Inc.', ticker: 'AAPL' })
   * // Returns: "New 10-K Filing: Apple Inc. (AAPL)"
   *
   * @example
   * generateSingleFilingSubject({ filingType: 'Form 4/A', companyName: 'Tesla Inc.', ticker: 'TSLA' })
   * // Returns: "[AMENDED] New Form 4/A Filing: Tesla Inc. (TSLA)"
   *
   * @remarks
   * The [AMENDED] indicator is automatically added for any filing type ending with '/A',
   * which is the SEC's standard notation for amended filings (e.g., 10-K/A, 8-K/A, Form 4/A).
   * This helps users quickly identify filing amendments in their email inbox.
   */
  static generateSingleFilingSubject({
    filingType,
    companyName,
    ticker,
    filerName
  }: SingleFilingSubjectParams): string {
    // Validate required parameters
    if (!filingType || !companyName || !ticker) {
      throw new Error(
        `Missing required parameters for subject line: filingType=${filingType}, companyName=${companyName}, ticker=${ticker}`
      );
    }

    // Add [AMENDED] indicator for filing amendments (form types ending with /A)
    // SEC uses /A suffix to denote amended filings (e.g., "Form 4/A" is an amended Form 4)
    const isAmended = filingType.endsWith('/A');
    const amendedPrefix = isAmended ? '[AMENDED] ' : '';

    // For insider filings (Form 3, 4, 144), include the filer name if available
    // Format: "AAPL Form 4: Jennifer Newstead" instead of "New 4 Filing: Apple Inc. (AAPL)"
    const insiderFormTypes = ['3', '4', '144'];
    const baseType = filingType.replace('/A', '');
    if (insiderFormTypes.includes(baseType) && filerName && filerName !== 'Insider') {
      return `${amendedPrefix}${ticker} Form ${baseType}: ${filerName}`;
    }

    return `${amendedPrefix}${INDIVIDUAL_FILING_PREFIX} ${filingType} Filing: ${companyName} (${ticker})`;
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
  /**
   * Generate a smart subject line from AI-structured summary data.
   * Extracts the most material fact for compelling email subjects.
   * Falls back to generateSingleFilingSubject if extraction fails.
   *
   * @example
   * // Form 4: "AAPL: Tim Cook sold $14.8M in shares"
   * // 8-K: "NVDA: $3B supply deal with TSMC announced"
   * // 10-K: "MSFT: FY2026 revenue up 18% to $287B"
   */
  static generateSmartSubject(
    summaryJSON: Record<string, unknown> | null | undefined,
    params: SingleFilingSubjectParams
  ): string {
    try {
      if (!summaryJSON) {
        return this.generateSingleFilingSubject(params);
      }

      const { ticker, filingType } = params;

      // Priority 1: AI-generated emailSubject field (30-120 chars)
      const aiSubject = typeof summaryJSON.emailSubject === 'string' ? summaryJSON.emailSubject.trim() : '';
      if (aiSubject.length >= 30 && aiSubject.length <= 120) {
        return aiSubject;
      }

      // Priority 2: Extract from summary text
      const summary = typeof summaryJSON.summary === 'string' ? summaryJSON.summary : '';
      if (summary) {
        const firstSentence = summary.split(/\.\s/)[0];
        if (firstSentence && firstSentence.length > 20 && firstSentence.length < 120) {
          const hasTicker = firstSentence.toUpperCase().includes(ticker.toUpperCase());
          if (hasTicker) {
            return firstSentence.endsWith('.') ? firstSentence : `${firstSentence}.`;
          }
          return `${ticker}: ${firstSentence}${firstSentence.endsWith('.') ? '' : '.'}`;
        }

        // When first sentence is too long, truncate at last word boundary within 80 chars
        if (firstSentence && firstSentence.length >= 120) {
          const truncated = firstSentence.slice(0, 80);
          const lastSpace = truncated.lastIndexOf(' ');
          if (lastSpace > 30) {
            const short = truncated.slice(0, lastSpace);
            const hasTicker = short.toUpperCase().includes(ticker.toUpperCase());
            const prefix = hasTicker ? '' : `${ticker}: `;
            return `${prefix}${short}...`;
          }
        }
      }

      // Priority 3: Form-specific extraction
      const normalizedType = filingType.replace(/^Form\s*/i, '').replace(/\/A$/, '');

      if (normalizedType === '4' || normalizedType === '4/A') {
        return this.extractForm4Subject(summaryJSON, params);
      }

      if (normalizedType === '8-K') {
        return this.extractEightKSubject(summaryJSON, params);
      }

      // Default fallback
      return this.generateSingleFilingSubject(params);
    } catch {
      return this.generateSingleFilingSubject(params);
    }
  }

  private static extractForm4Subject(
    data: Record<string, unknown>,
    params: SingleFilingSubjectParams
  ): string {
    const transactions = data.transactions;
    if (Array.isArray(transactions) && transactions.length > 0) {
      const txn = transactions[0] as Record<string, unknown>;
      const filerName = typeof data.filerName === 'string' ? data.filerName : '';
      const action = typeof txn.transactionType === 'string' ? txn.transactionType.toLowerCase() : '';
      const value = typeof txn.totalValue === 'string' ? txn.totalValue : '';

      if (filerName && action) {
        const valueStr = value ? ` ${value}` : '';
        return `${params.ticker}: ${filerName} ${action}${valueStr} in shares`;
      }
    }
    return this.generateSingleFilingSubject(params);
  }

  private static extractEightKSubject(
    data: Record<string, unknown>,
    params: SingleFilingSubjectParams
  ): string {
    const eventType = typeof data.eventType === 'string' ? data.eventType : '';
    if (eventType) {
      return `${params.ticker} 8-K: ${eventType}`;
    }
    return this.generateSingleFilingSubject(params);
  }

  static formatDate(date: string): string {
    const parsedDate = new Date(date);

    // Validate date is valid
    if (isNaN(parsedDate.getTime())) {
      throw new Error(`Invalid date format: ${date}`);
    }

    return parsedDate.toLocaleDateString(DATE_LOCALE);
  }
}
