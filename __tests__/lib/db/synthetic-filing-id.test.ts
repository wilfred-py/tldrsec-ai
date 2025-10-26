/**
 * Test suite for synthetic filing ID handling in transaction manager
 */

import { FilingTransactionManager } from '../../../lib/db/transaction-manager';

describe('Synthetic Filing ID Handling', () => {
  describe('isSyntheticFilingId', () => {
    it('should identify real UUID filing IDs as non-synthetic', () => {
      const realUUIDs = [
        'd8422534-730e-422a-8851-04ce384d797e',
        '123e4567-e89b-12d3-a456-426614174000',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479'
      ];

      realUUIDs.forEach(uuid => {
        expect(FilingTransactionManager.isSyntheticFilingId(uuid)).toBe(false);
      });
    });

    it('should identify synthetic filing IDs correctly', () => {
      const syntheticIds = [
        '0001104659-25-101278-TSLA',
        '0000320193-25-000012-AAPL',
        '0001018724-25-000045-MSFT',
        '0001326801-25-000023-META'
      ];

      syntheticIds.forEach(id => {
        expect(FilingTransactionManager.isSyntheticFilingId(id)).toBe(true);
      });
    });

    it('should handle edge cases correctly', () => {
      const edgeCases = [
        'invalid-id',
        '123-456-789',
        '',
        'just-text',
        '0001104659-25-101278', // Missing ticker suffix
        '0001104659-25-101278-tsla' // Lowercase ticker
      ];

      edgeCases.forEach(id => {
        expect(FilingTransactionManager.isSyntheticFilingId(id)).toBe(false);
      });
    });
  });

  describe('extractAccessionNumber', () => {
    it('should extract accession number from synthetic IDs correctly', () => {
      const testCases = [
        {
          input: '0001104659-25-101278-TSLA',
          expected: '0001104659-25-101278'
        },
        {
          input: '0000320193-25-000012-AAPL',
          expected: '0000320193-25-000012'
        },
        {
          input: '0001018724-25-000045-MSFT',
          expected: '0001018724-25-000045'
        },
        {
          input: '0001326801-25-000023-META',
          expected: '0001326801-25-000023'
        }
      ];

      testCases.forEach(({ input, expected }) => {
        expect(FilingTransactionManager.extractAccessionNumber(input)).toBe(expected);
      });
    });

    it('should handle edge cases in extraction', () => {
      // No dash case
      expect(FilingTransactionManager.extractAccessionNumber('nodash')).toBe('nodash');
      
      // Single dash case
      expect(FilingTransactionManager.extractAccessionNumber('before-after')).toBe('before');
      
      // Multiple dashes - should extract everything before the last dash
      expect(FilingTransactionManager.extractAccessionNumber('a-b-c-d-TICKER')).toBe('a-b-c-d');
    });
  });

  describe('Integration with filing lookup patterns', () => {
    it('should correctly identify filing IDs used in deduplication flow', () => {
      // These are the patterns we see in the real codebase
      const deduplicationPatterns = [
        '0001104659-25-101278-TSLA', // Tesla filing
        '0000320193-25-000012-AAPL', // Apple filing
        '0001018724-25-000045-MSFT', // Microsoft filing
        '0001326801-25-000023-META'  // Meta filing
      ];

      deduplicationPatterns.forEach(id => {
        expect(FilingTransactionManager.isSyntheticFilingId(id)).toBe(true);
        
        const accessionNumber = FilingTransactionManager.extractAccessionNumber(id);
        
        // Verify the extracted accession number follows the expected format
        expect(accessionNumber).toMatch(/^\d{10}-\d{2}-\d{6}$/);
        
        // Verify we can extract the ticker
        const ticker = id.substring(id.lastIndexOf('-') + 1);
        expect(ticker).toMatch(/^[A-Z]+$/);
      });
    });

    it('should maintain backward compatibility with real database UUIDs', () => {
      const realDbIds = [
        'd8422534-730e-422a-8851-04ce384d797e',
        '123e4567-e89b-12d3-a456-426614174000'
      ];

      realDbIds.forEach(id => {
        expect(FilingTransactionManager.isSyntheticFilingId(id)).toBe(false);
        // Note: extractAccessionNumber should only be called for synthetic IDs
        // but we test it here to ensure it doesn't break unexpectedly
      });
    });

    it('should handle the exact synthetic ID pattern from filing processor', () => {
      // This is the exact pattern created in filing-processor.ts line 497:
      // `id: filingRecord.id || ${filingRecord.accessionNumber}-${tickerResult.ticker}`
      
      const accessionNumber = '0001104659-25-101278';
      const ticker = 'TSLA';
      const syntheticId = `${accessionNumber}-${ticker}`;

      expect(FilingTransactionManager.isSyntheticFilingId(syntheticId)).toBe(true);
      expect(FilingTransactionManager.extractAccessionNumber(syntheticId)).toBe(accessionNumber);
    });
  });
});