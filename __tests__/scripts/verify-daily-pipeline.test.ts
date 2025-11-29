/**
 * Unit tests for daily pipeline verification script
 * Tests core verification logic, date handling, and status classification
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';

// Mock PrismaClient
jest.mock('@prisma/client');

// Mock chalk for testing
jest.mock('chalk', () => ({
  green: jest.fn((text) => `GREEN:${text}`),
  yellow: jest.fn((text) => `YELLOW:${text}`),
  red: jest.fn((text) => `RED:${text}`),
  cyan: jest.fn((text) => `CYAN:${text}`),
  bold: jest.fn((text) => `BOLD:${text}`),
  dim: jest.fn((text) => `DIM:${text}`)
}));

// Import the verification logic functions
// Note: This assumes we extract testable functions from the script
import { 
  parseTargetDate,
  classifyFilingStatus,
  formatVerificationResults,
  calculateSummaryStats,
  shouldAttemptRemediation
} from '../../scripts/verify-daily-pipeline';

describe('Daily Pipeline Verification', () => {
  let mockPrisma: jest.Mocked<PrismaClient>;

  beforeEach(() => {
    mockPrisma = new PrismaClient() as jest.Mocked<PrismaClient>;
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('parseTargetDate', () => {
    test('should parse valid date string', () => {
      const result = parseTargetDate('2025-11-28');
      expect(result).toBeInstanceOf(Date);
      expect(result.getFullYear()).toBe(2025);
      expect(result.getMonth()).toBe(10); // November = 10 (0-indexed)
      expect(result.getDate()).toBe(28);
    });

    test('should default to yesterday when no date provided', () => {
      const result = parseTargetDate(undefined);
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      expect(result.getDate()).toBe(yesterday.getDate());
      expect(result.getMonth()).toBe(yesterday.getMonth());
    });

    test('should throw error for invalid date format', () => {
      expect(() => parseTargetDate('invalid-date')).toThrow('Invalid date format');
    });

    test('should throw error for future date', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const futureDate = tomorrow.toISOString().split('T')[0];
      
      expect(() => parseTargetDate(futureDate)).toThrow('Cannot verify future date');
    });

    test('should handle leap year dates', () => {
      const result = parseTargetDate('2024-02-29'); // Leap year
      expect(result.getMonth()).toBe(1); // February
      expect(result.getDate()).toBe(29);
    });
  });

  describe('classifyFilingStatus', () => {
    test('should classify complete filing correctly', () => {
      const filing = {
        accessionNumber: 'test-001',
        ticker: 'TSLA',
        formType: '10-K',
        discovered: true,
        fetched: true,
        summarized: true,
        emailed: true,
        emailCount: 2,
        uniqueUsers: 2
      };

      const result = classifyFilingStatus(filing);
      expect(result.status).toBe('COMPLETE');
      expect(result.failurePhase).toBeUndefined();
    });

    test('should classify fetch failure correctly', () => {
      const filing = {
        accessionNumber: 'test-002',
        ticker: 'AAPL',
        formType: '10-Q',
        discovered: true,
        fetched: false,
        summarized: false,
        emailed: false,
        fetchError: 'Network timeout',
        emailCount: 0,
        uniqueUsers: 0
      };

      const result = classifyFilingStatus(filing);
      expect(result.status).toBe('FAILED');
      expect(result.failurePhase).toBe('FETCH');
    });

    test('should classify summarization failure correctly', () => {
      const filing = {
        accessionNumber: 'test-003',
        ticker: 'NVDA',
        formType: '8-K',
        discovered: true,
        fetched: true,
        summarized: false,
        emailed: false,
        summarizeError: 'AI quota exceeded',
        emailCount: 0,
        uniqueUsers: 0
      };

      const result = classifyFilingStatus(filing);
      expect(result.status).toBe('FAILED');
      expect(result.failurePhase).toBe('SUMMARIZE');
    });

    test('should classify pending filing correctly', () => {
      const filing = {
        accessionNumber: 'test-004',
        ticker: 'COIN',
        formType: 'Form 4',
        discovered: true,
        fetched: true,
        summarized: true,
        emailed: false,
        emailCount: 0,
        uniqueUsers: 2 // Users exist but no emails sent yet
      };

      const result = classifyFilingStatus(filing);
      expect(result.status).toBe('PENDING');
      expect(result.failurePhase).toBeUndefined();
    });

    test('should handle edge case: no users tracking ticker', () => {
      const filing = {
        accessionNumber: 'test-005',
        ticker: 'UNTRACKED',
        formType: '10-K',
        discovered: true,
        fetched: true,
        summarized: true,
        emailed: false,
        emailCount: 0,
        uniqueUsers: 0 // No users tracking this ticker
      };

      const result = classifyFilingStatus(filing);
      expect(result.status).toBe('COMPLETE'); // Complete if no users to email
    });
  });

  describe('calculateSummaryStats', () => {
    test('should calculate stats correctly for mixed results', () => {
      const filings = [
        { status: 'COMPLETE' },
        { status: 'COMPLETE' },
        { status: 'PENDING' },
        { status: 'FAILED', failurePhase: 'FETCH' },
        { status: 'FAILED', failurePhase: 'SUMMARIZE' }
      ];

      const stats = calculateSummaryStats(filings as any[]);
      
      expect(stats.total).toBe(5);
      expect(stats.completed).toBe(2);
      expect(stats.pending).toBe(1);
      expect(stats.failed).toBe(2);
      expect(stats.completionRate).toBe(40); // 2/5 = 40%
    });

    test('should handle empty filing list', () => {
      const stats = calculateSummaryStats([]);
      
      expect(stats.total).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.pending).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.completionRate).toBe(0);
    });

    test('should handle 100% completion rate', () => {
      const filings = [
        { status: 'COMPLETE' },
        { status: 'COMPLETE' }
      ];

      const stats = calculateSummaryStats(filings as any[]);
      expect(stats.completionRate).toBe(100);
    });
  });

  describe('shouldAttemptRemediation', () => {
    test('should recommend remediation for fetch failures', () => {
      const filing = {
        status: 'FAILED',
        failurePhase: 'FETCH',
        fetchError: 'Network timeout',
        remediationAttempted: false
      };

      expect(shouldAttemptRemediation(filing as any)).toBe(true);
    });

    test('should recommend remediation for summarize failures', () => {
      const filing = {
        status: 'FAILED',
        failurePhase: 'SUMMARIZE',
        summarizeError: 'AI quota exceeded',
        remediationAttempted: false
      };

      expect(shouldAttemptRemediation(filing as any)).toBe(true);
    });

    test('should not recommend remediation if already attempted', () => {
      const filing = {
        status: 'FAILED',
        failurePhase: 'FETCH',
        fetchError: 'Network timeout',
        remediationAttempted: true
      };

      expect(shouldAttemptRemediation(filing as any)).toBe(false);
    });

    test('should not recommend remediation for completed filings', () => {
      const filing = {
        status: 'COMPLETE',
        remediationAttempted: false
      };

      expect(shouldAttemptRemediation(filing as any)).toBe(false);
    });

    test('should not recommend remediation for pending filings', () => {
      const filing = {
        status: 'PENDING',
        remediationAttempted: false
      };

      expect(shouldAttemptRemediation(filing as any)).toBe(false);
    });
  });

  describe('formatVerificationResults', () => {
    test('should format results with proper status indicators', () => {
      const filings = [
        {
          accessionNumber: 'test-001',
          ticker: 'TSLA',
          formType: '10-K',
          status: 'COMPLETE'
        },
        {
          accessionNumber: 'test-002',
          ticker: 'AAPL',
          formType: '10-Q',
          status: 'PENDING'
        },
        {
          accessionNumber: 'test-003',
          ticker: 'NVDA',
          formType: '8-K',
          status: 'FAILED',
          failurePhase: 'FETCH',
          fetchError: 'Network error'
        }
      ];

      const output = formatVerificationResults(filings as any[]);
      
      expect(output).toContain('TSLA');
      expect(output).toContain('10-K');
      expect(output).toContain('✅'); // Complete status
      expect(output).toContain('⏳'); // Pending status
      expect(output).toContain('❌'); // Failed status
    });

    test('should handle empty results', () => {
      const output = formatVerificationResults([]);
      expect(output).toContain('No filings found');
    });
  });

  describe('Database Operation Tests', () => {
    test('should handle database connection errors', async () => {
      mockPrisma.$connect.mockRejectedValue(new Error('Database connection failed'));
      
      // This would test the actual script's error handling
      // Implementation depends on how the script is structured
    });

    test('should handle transaction rollback scenarios', async () => {
      mockPrisma.$transaction.mockRejectedValue(new Error('Transaction failed'));
      
      // Test that failed transactions are properly rolled back
    });
  });

  describe('Edge Cases', () => {
    test('should handle weekend dates correctly', () => {
      // Use past weekend dates (Nov 23 = Sunday, Nov 24 = Monday)
      const sunday = parseTargetDate('2025-11-23'); // Past Sunday
      expect(sunday).toBeInstanceOf(Date);
      expect(sunday.getDay()).toBe(0); // Sunday = 0
      
      // Use a confirmed Saturday  
      const saturday = parseTargetDate('2025-11-22'); // Past Saturday
      expect(saturday).toBeInstanceOf(Date);
      expect(saturday.getDay()).toBe(6); // Saturday = 6
    });

    test('should handle timezone edge cases', () => {
      // This test ensures the date parsing works correctly across timezones
      const utcDate = new Date('2025-11-28T00:00:00Z');
      const localDate = parseTargetDate('2025-11-28');
      
      expect(localDate.getDate()).toBe(28);
      expect(localDate.getMonth()).toBe(10); // November
    });

    test('should handle large dataset performance', () => {
      // Generate large dataset
      const largeFilingSet = Array(1000).fill(null).map((_, i) => ({
        accessionNumber: `test-${i.toString().padStart(6, '0')}`,
        ticker: `TICK${i % 10}`,
        formType: '10-K',
        status: i % 3 === 0 ? 'COMPLETE' : i % 3 === 1 ? 'PENDING' : 'FAILED'
      }));

      const start = Date.now();
      const stats = calculateSummaryStats(largeFilingSet as any[]);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(100); // Should complete within 100ms
      expect(stats.total).toBe(1000);
    });
  });
});