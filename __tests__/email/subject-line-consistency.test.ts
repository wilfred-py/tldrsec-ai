/**
 * Email Subject Line Consistency Tests
 *
 * Tests for Phase 3 of Summary Generation Accuracy Improvements
 * Ensures consistent email subject line patterns across individual and digest emails
 */

import { EmailSubjectService } from '@/lib/email/subject-service';

describe('Email Subject Line Consistency', () => {
  describe('Individual Filing Subject Lines', () => {
    it('should use standard format for individual 10-K filing emails', () => {
      const subject = EmailSubjectService.generateSingleFilingSubject({
        filingType: '10-K',
        companyName: 'Apple Inc.',
        ticker: 'AAPL'
      });

      expect(subject).toBe('New 10-K Filing: Apple Inc. (AAPL)');
    });

    it('should use standard format for Form 4 filing emails', () => {
      const subject = EmailSubjectService.generateSingleFilingSubject({
        filingType: 'Form 4',
        companyName: 'Tesla Inc.',
        ticker: 'TSLA'
      });

      expect(subject).toBe('New Form 4 Filing: Tesla Inc. (TSLA)');
    });

    it('should use standard format for 8-K filing emails', () => {
      const subject = EmailSubjectService.generateSingleFilingSubject({
        filingType: '8-K',
        companyName: 'Microsoft Corporation',
        ticker: 'MSFT'
      });

      expect(subject).toBe('New 8-K Filing: Microsoft Corporation (MSFT)');
    });

    it('should handle Form 144 filing emails', () => {
      const subject = EmailSubjectService.generateSingleFilingSubject({
        filingType: 'Form 144',
        companyName: 'NVIDIA Corporation',
        ticker: 'NVDA'
      });

      expect(subject).toBe('New Form 144 Filing: NVIDIA Corporation (NVDA)');
    });
  });

  describe('Digest Subject Lines', () => {
    it('should use digest format for batch emails', () => {
      const subject = EmailSubjectService.generateDigestSubject({
        date: '2026-01-06'
      });

      expect(subject).toBe('SEC Filing Summaries - 1/6/2026');
    });

    it('should handle different date formats consistently', () => {
      const subject = EmailSubjectService.generateDigestSubject({
        date: '2026-12-25'
      });

      expect(subject).toBe('SEC Filing Summaries - 12/25/2026');
    });

    it('should optionally include filing count in digest subject', () => {
      const subject = EmailSubjectService.generateDigestSubject({
        date: '2026-01-06',
        filingCount: 5
      });

      // Filing count is informational, subject format remains consistent
      expect(subject).toBe('SEC Filing Summaries - 1/6/2026');
    });
  });

  describe('Date Formatting Consistency', () => {
    it('should use consistent US date format (M/D/YYYY) across all subject lines', () => {
      const digestSubject = EmailSubjectService.generateDigestSubject({ date: '2026-01-06' });

      // US format: 1/6/2026 (not 01/06/2026 or 06/01/2026)
      expect(digestSubject).toContain('1/6/2026');
    });

    it('should format dates correctly from ISO string', () => {
      const formattedDate = EmailSubjectService.formatDate('2026-01-06');
      expect(formattedDate).toBe('1/6/2026');
    });

    it('should format December dates correctly', () => {
      const formattedDate = EmailSubjectService.formatDate('2026-12-31');
      expect(formattedDate).toBe('12/31/2026');
    });
  });

  describe('Edge Cases', () => {
    it('should handle company names with special characters', () => {
      const subject = EmailSubjectService.generateSingleFilingSubject({
        filingType: '10-K',
        companyName: 'AT&T Inc.',
        ticker: 'T'
      });

      expect(subject).toBe('New 10-K Filing: AT&T Inc. (T)');
    });

    it('should handle long company names', () => {
      const subject = EmailSubjectService.generateSingleFilingSubject({
        filingType: '10-Q',
        companyName: 'Berkshire Hathaway Inc.',
        ticker: 'BRK.A'
      });

      expect(subject).toBe('New 10-Q Filing: Berkshire Hathaway Inc. (BRK.A)');
    });

    it('should handle filings with amendment suffixes', () => {
      const subject = EmailSubjectService.generateSingleFilingSubject({
        filingType: '10-K/A',
        companyName: 'Google LLC',
        ticker: 'GOOGL'
      });

      expect(subject).toBe('[AMENDED] New 10-K/A Filing: Google LLC (GOOGL)');
    });
  });
});
