/**
 * Edge Cases and Error Scenario Tests for Filing Content Verifier
 * Addresses Quality Engineer review concerns
 */

import {
  verifyFilingContent,
  verifyFilingContentAsync,
  batchVerifyFilingContent,
  type FilingMetadata,
  extractMetadataFromContent
} from '../../lib/validation/filing-content-verifier';

describe('Filing Content Verifier - Edge Cases', () => {
  const validMetadata: FilingMetadata = {
    accessionNumber: '0000320193-24-000006',
    cik: '0000320193',
    formType: '10-Q',
    companyName: 'Apple Inc.',
    filingDate: '2024-02-01'
  };

  describe('Input Validation', () => {
    test('should handle null content gracefully', () => {
      const result = verifyFilingContent(null as any, validMetadata);
      
      expect(result.isVerified).toBe(false);
      expect(result.errors).toContain('Content is empty or too short (< 100 characters)');
      expect(result.confidence).toBe(0);
    });

    test('should handle undefined content gracefully', () => {
      const result = verifyFilingContent(undefined as any, validMetadata);
      
      expect(result.isVerified).toBe(false);
      expect(result.errors).toContain('Content is empty or too short (< 100 characters)');
      expect(result.confidence).toBe(0);
    });

    test('should handle empty string content', () => {
      const result = verifyFilingContent('', validMetadata);
      
      expect(result.isVerified).toBe(false);
      expect(result.errors).toContain('Content is empty or too short (< 100 characters)');
      expect(result.confidence).toBe(0);
    });

    test('should handle very short content', () => {
      const shortContent = 'Short content';
      const result = verifyFilingContent(shortContent, validMetadata);
      
      expect(result.isVerified).toBe(false);
      expect(result.errors).toContain('Content is empty or too short (< 100 characters)');
      expect(result.contentLength).toBe(shortContent.length);
    });

    test('should handle missing metadata fields', async () => {
      const invalidMetadata = {
        accessionNumber: '',
        cik: '',
        formType: '',
        companyName: ''
      } as FilingMetadata;

      await expect(verifyFilingContentAsync('valid content here that is long enough to pass basic checks', invalidMetadata))
        .rejects.toThrow('ExpectedMetadata must include accessionNumber, cik, formType, and companyName');
    });

    test('should handle null metadata', async () => {
      await expect(verifyFilingContentAsync('valid content', null as any))
        .rejects.toThrow('ExpectedMetadata parameter is required');
    });
  });

  describe('SEC Search Page Detection', () => {
    test('should detect SEC search page redirect with canonical href', () => {
      const searchPageContent = `
        <html>
          <head>
            <link rel="canonical" href="https://www.sec.gov/search-filings">
            <title>SEC Search</title>
          </head>
          <body>
            <p>Please use our search functionality.</p>
          </body>
        </html>
      `;

      const result = verifyFilingContent(searchPageContent, validMetadata);
      
      expect(result.isVerified).toBe(false);
      expect(result.errors).toContain('Content is SEC search page redirect, not actual filing');
      expect(result.confidence).toBe(0);
    });

    test('should detect SEC search page redirect with href link', () => {
      const searchPageContent = `
        <html>
          <body>
            <a href="https://www.sec.gov/search-filings">Search SEC Filings</a>
            <p>This page has been moved. Please use our search functionality.</p>
          </body>
        </html>
      `;

      const result = verifyFilingContent(searchPageContent, validMetadata);
      
      expect(result.isVerified).toBe(false);
      expect(result.errors).toContain('Content is SEC search page redirect, not actual filing');
    });

    test('should detect SEC search page with smartSearch.js', () => {
      const searchPageContent = `
        <html>
          <head>
            <script src="/js/smartSearch.js"></script>
          </head>
          <body>
            <p>SEC Filing Search Interface</p>
          </body>
        </html>
      `;

      const result = verifyFilingContent(searchPageContent, validMetadata);
      
      expect(result.isVerified).toBe(false);
      expect(result.errors).toContain('Content is SEC search page redirect, not actual filing');
    });
  });

  describe('Large Content Handling', () => {
    test('should handle extremely large filing content (>10MB)', () => {
      // Create 10MB+ content
      const largeContent = 'A'.repeat(10 * 1024 * 1024) + `
        ACCESSION NUMBER: ${validMetadata.accessionNumber}
        CENTRAL INDEX KEY: ${validMetadata.cik}
        FORM TYPE: ${validMetadata.formType}
        COMPANY CONFORMED NAME: ${validMetadata.companyName}
      `;

      const startTime = Date.now();
      const result = verifyFilingContent(largeContent, validMetadata);
      const processingTime = Date.now() - startTime;

      expect(result.contentLength).toBeGreaterThan(10 * 1024 * 1024);
      expect(processingTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(result.accessionNumber.matches).toBe(true);
      expect(result.cik.matches).toBe(true);
    }, 10000); // 10 second timeout for this test

    test('should handle content with excessive whitespace', () => {
      const whitespaceContent = `
        ${'    '.repeat(1000)}
        ACCESSION NUMBER: ${validMetadata.accessionNumber}
        ${'    '.repeat(1000)}
        CENTRAL INDEX KEY: ${validMetadata.cik}
        ${'    '.repeat(1000)}
        FORM TYPE: ${validMetadata.formType}
        ${'    '.repeat(1000)}
        COMPANY CONFORMED NAME: ${validMetadata.companyName}
        ${'    '.repeat(1000)}
      `;

      const result = verifyFilingContent(whitespaceContent, validMetadata);
      
      expect(result.accessionNumber.matches).toBe(true);
      expect(result.cik.matches).toBe(true);
      expect(result.formType.matches).toBe(true);
    });
  });

  describe('Malformed Content Scenarios', () => {
    test('should handle content with partial metadata', () => {
      const partialContent = `
        ACCESSION NUMBER: ${validMetadata.accessionNumber}
        CENTRAL INDEX KEY: ${validMetadata.cik}
        <!-- FORM TYPE and COMPANY NAME missing -->
        <html><body>Filing content here but incomplete metadata</body></html>
      `;

      const result = verifyFilingContent(partialContent, validMetadata);
      
      expect(result.accessionNumber.matches).toBe(true);
      expect(result.cik.matches).toBe(true);
      expect(result.formType.matches).toBe(false);
      expect(result.companyName.matches).toBe(false);
      
      // Should still verify if accession and CIK match (relaxed criteria)
      expect(result.isVerified).toBe(true);
    });

    test('should handle corrupted XML/HTML structure', () => {
      const corruptedContent = `
        <html><head><title>Filing</title>
        ACCESSION NUMBER: ${validMetadata.accessionNumber}
        <body><p>CENTRAL INDEX KEY: ${validMetadata.cik}
        FORM TYPE: ${validMetadata.formType}</p>
        <div>COMPANY CONFORMED NAME: ${validMetadata.companyName}</div>
        <!-- Unclosed tags and malformed structure -->
        <table><tr><td>Data
        <p>More content without proper closing
      `;

      const result = verifyFilingContent(corruptedContent, validMetadata);
      
      // Should still extract metadata despite malformed structure
      expect(result.extractedMetadata.accessionNumber).toBeTruthy();
      expect(result.extractedMetadata.cik).toBeTruthy();
      expect(result.extractedMetadata.formType).toBeTruthy();
      expect(result.extractedMetadata.companyName).toBeTruthy();
    });

    test('should handle content with special characters and encoding issues', () => {
      const specialCharContent = `
        ACCESSION NUMBER: ${validMetadata.accessionNumber}
        CENTRAL INDEX KEY: ${validMetadata.cik}
        FORM TYPE: ${validMetadata.formType}
        COMPANY CONFORMED NAME: Åpple Inc. ñ Special Çhars & Émojis 🏢
      `;

      const result = verifyFilingContent(specialCharContent, validMetadata);
      
      expect(result.accessionNumber.matches).toBe(true);
      expect(result.cik.matches).toBe(true);
      expect(result.formType.matches).toBe(true);
      
      // Company name might not match exactly due to special chars, but should have some similarity
      expect(result.companyName.similarity).toBeGreaterThan(50);
    });
  });

  describe('Async Function Error Handling', () => {
    test('should handle null content in async function', async () => {
      await expect(verifyFilingContentAsync(null as any, validMetadata))
        .rejects.toThrow('Content parameter is required');
    });

    test('should handle processing errors gracefully in async function', async () => {
      // Mock a scenario that would cause internal error
      const mockContent = 'valid content that is long enough';
      const invalidMetadata = {
        ...validMetadata,
        accessionNumber: null as any // This will cause issues internally
      };

      const result = await verifyFilingContentAsync(mockContent, invalidMetadata);
      
      expect(result.isVerified).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Verification failed:');
    });
  });

  describe('Batch Processing Edge Cases', () => {
    test('should handle empty batch array', async () => {
      await expect(batchVerifyFilingContent([]))
        .resolves.toEqual([]);
    });

    test('should handle null batch input', async () => {
      await expect(batchVerifyFilingContent(null as any))
        .rejects.toThrow('Filings must be a non-empty array');
    });

    test('should handle mixed valid and invalid filings in batch', async () => {
      const mixedFilings = [
        {
          content: `
            ACCESSION NUMBER: ${validMetadata.accessionNumber}
            CENTRAL INDEX KEY: ${validMetadata.cik}
            FORM TYPE: ${validMetadata.formType}
            COMPANY CONFORMED NAME: ${validMetadata.companyName}
          `,
          metadata: validMetadata
        },
        {
          content: '', // Invalid - too short
          metadata: validMetadata
        },
        {
          content: 'valid content that is long enough',
          metadata: { ...validMetadata, accessionNumber: null as any } // Invalid metadata
        }
      ];

      const results = await batchVerifyFilingContent(mixedFilings);
      
      expect(results).toHaveLength(3);
      expect(results[0].isVerified).toBe(true);  // Valid filing
      expect(results[1].isVerified).toBe(false); // Invalid content
      expect(results[2].isVerified).toBe(false); // Invalid metadata causes error
      
      // Check that error handling worked for problematic filing
      expect(results[2].errors).toHaveLength(1);
      expect(results[2].errors[0]).toContain('Batch verification failed:');
    });

    test('should handle concurrent batch processing without race conditions', async () => {
      const filings = Array(10).fill(null).map((_, i) => ({
        content: `
          ACCESSION NUMBER: 0000320193-24-00000${i}
          CENTRAL INDEX KEY: ${validMetadata.cik}
          FORM TYPE: ${validMetadata.formType}
          COMPANY CONFORMED NAME: ${validMetadata.companyName}
          Filing #${i} content here with sufficient length
        `,
        metadata: {
          ...validMetadata,
          accessionNumber: `0000320193-24-00000${i}`
        }
      }));

      const results = await batchVerifyFilingContent(filings);
      
      expect(results).toHaveLength(10);
      results.forEach((result, i) => {
        expect(result.extractedMetadata.accessionNumber).toBe(`0000320193-24-00000${i}`);
      });
    });
  });

  describe('Performance Edge Cases', () => {
    test('should handle regex backtracking scenarios', () => {
      // Create content that could cause catastrophic backtracking
      const backtrackContent = `
        ACCESSION NUMBER: ${validMetadata.accessionNumber}
        ${'a'.repeat(1000)}${'b'.repeat(1000)}${'c'.repeat(1000)}
        CENTRAL INDEX KEY: ${validMetadata.cik}
        FORM TYPE: ${validMetadata.formType}
        COMPANY CONFORMED NAME: ${validMetadata.companyName}
      `;

      const startTime = Date.now();
      const result = verifyFilingContent(backtrackContent, validMetadata);
      const processingTime = Date.now() - startTime;

      expect(processingTime).toBeLessThan(2000); // Should complete within 2 seconds
      expect(result.accessionNumber.matches).toBe(true);
    });

    test('should handle deeply nested regex patterns', () => {
      const nestedContent = `
        ${'<div>'.repeat(100)}
        ACCESSION NUMBER: ${validMetadata.accessionNumber}
        CENTRAL INDEX KEY: ${validMetadata.cik}
        FORM TYPE: ${validMetadata.formType}
        COMPANY CONFORMED NAME: ${validMetadata.companyName}
        ${'</div>'.repeat(100)}
      `;

      const result = verifyFilingContent(nestedContent, validMetadata);
      
      expect(result.extractedMetadata.accessionNumber).toBeTruthy();
      expect(result.extractedMetadata.cik).toBeTruthy();
    });
  });

  describe('Metadata Extraction Edge Cases', () => {
    test('should extract metadata from content with multiple potential matches', () => {
      const multipleMatchContent = `
        <!-- First occurrence -->
        ACCESSION NUMBER: 1111111111-11-111111
        CENTRAL INDEX KEY: 1111111111
        
        <!-- Actual occurrence -->
        ACCESSION NUMBER: ${validMetadata.accessionNumber}
        CENTRAL INDEX KEY: ${validMetadata.cik}
        FORM TYPE: ${validMetadata.formType}
        COMPANY CONFORMED NAME: ${validMetadata.companyName}
        
        <!-- Later occurrence -->
        ACCESSION NUMBER: 2222222222-22-222222
        CENTRAL INDEX KEY: 2222222222
      `;

      const extracted = extractMetadataFromContent(multipleMatchContent);
      
      // Should extract first valid occurrence
      expect(extracted.accessionNumber).toBe('1111111111-11-111111');
      expect(extracted.cik).toBe('1111111111');
    });

    test('should handle various date formats', () => {
      const dateFormatContent = `
        FILED AS OF DATE: 20240201
        FILING DATE: 2024-02-01
        Date: 2024/02/01
        ACCESSION NUMBER: ${validMetadata.accessionNumber}
      `;

      const extracted = extractMetadataFromContent(dateFormatContent);
      
      expect(extracted.filingDate).toBeTruthy();
      // Should normalize YYYYMMDD to YYYY-MM-DD
      expect(extracted.filingDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    test('should handle CIK padding correctly', () => {
      const cikContent = `
        CENTRAL INDEX KEY: 320193
        ACCESSION NUMBER: ${validMetadata.accessionNumber}
      `;

      const extracted = extractMetadataFromContent(cikContent);
      
      expect(extracted.cik).toBe('0000320193'); // Should pad to 10 digits
    });
  });
});