import { jest } from '@jest/globals';
import { getFilingContent } from '../../../../services/filings/filingRetrieval';

// Mock all external dependencies
jest.mock('../../../../lib/logging', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../../../config/sec', () => ({
  SEC_CONFIG: {
    userAgent: 'test-agent',
    rateLimit: { requests: 10, interval: 1000 }
  }
}));

jest.mock('../../../../lib/sec-edgar/client');
jest.mock('../../../../services/filings/companyInfo', () => ({
  getSecApiHeaders: jest.fn().mockReturnValue({ 'User-Agent': 'test-agent' })
}));

describe('Filing Content Retrieval with Fallbacks', () => {
  let mockSecClient: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    const { SECEdgarClient } = require('../../../../lib/sec-edgar/client');
    mockSecClient = {
      getFilingDocument: jest.fn(),
    };
    SECEdgarClient.mockImplementation(() => mockSecClient);
  });

  describe('Sequence number to filename mapping', () => {
    it('should handle sequence number to filename mapping successfully', async () => {
      const accessionNumber = '0000320193-23-000064';
      const sequenceNumber = '1';
      const cik = '0000320193';

      // Mock successful index retrieval with document mapping
      const mockIndexContent = `
        <html>
          <body>
            <table>
              <tr><td><a href="aapl-20230930.htm">1</a></td><td>10-K</td></tr>
            </table>
          </body>
        </html>
      `;

      const mockDocumentContent = '<html><body>Apple 10-K filing content</body></html>';

      mockSecClient.getFilingDocument
        .mockResolvedValueOnce(mockIndexContent) // Index page
        .mockResolvedValueOnce(mockDocumentContent); // Actual document

      const result = await getFilingContent(accessionNumber, sequenceNumber, cik);

      expect(result).toBe(mockDocumentContent);
      expect(mockSecClient.getFilingDocument).toHaveBeenCalledTimes(2);
      
      // Check index URL was called
      expect(mockSecClient.getFilingDocument).toHaveBeenNthCalledWith(1,
        'https://www.sec.gov/Archives/edgar/data/0000320193/000032019323000064/0000320193-23-000064-index.html',
        { handleNotFound: true }
      );
      
      // Check document URL was called
      expect(mockSecClient.getFilingDocument).toHaveBeenNthCalledWith(2,
        'https://www.sec.gov/Archives/edgar/data/320193/000032019323000064/aapl-20230930.htm',
        { handleNotFound: true }
      );
    });

    it('should fallback to common extensions when index parsing fails', async () => {
      const accessionNumber = '0000320193-23-000064';
      const sequenceNumber = '1';
      const cik = '0000320193';

      // Mock index retrieval that doesn't contain the sequence number
      const mockIndexContent = '<html><body>No matching sequence</body></html>';
      const mockDocumentContent = '<html><body>Apple 10-K filing content</body></html>';

      mockSecClient.getFilingDocument
        .mockResolvedValueOnce(mockIndexContent) // Index page - no match found
        .mockRejectedValueOnce(new Error('Not found')) // First fallback attempt fails
        .mockResolvedValueOnce(mockDocumentContent); // Second fallback succeeds

      const result = await getFilingContent(accessionNumber, sequenceNumber, cik);

      expect(result).toBe(mockDocumentContent);
      expect(mockSecClient.getFilingDocument).toHaveBeenCalledTimes(3);
      
      // Should try common extensions: htm, html, txt
      expect(mockSecClient.getFilingDocument).toHaveBeenNthCalledWith(2,
        'https://www.sec.gov/Archives/edgar/data/320193/000032019323000064/0000320193-23-000064.htm',
        { handleNotFound: true }
      );
      expect(mockSecClient.getFilingDocument).toHaveBeenNthCalledWith(3,
        'https://www.sec.gov/Archives/edgar/data/320193/000032019323000064/0000320193-23-000064.html',
        { handleNotFound: true }
      );
    });

    it('should extract CIK from accession number when not provided', async () => {
      const accessionNumber = '0000320193-23-000064';
      const sequenceNumber = '1';
      // No CIK provided

      const mockDocumentContent = '<html><body>Apple 10-K filing content</body></html>';

      // Mock index fails, fallback succeeds
      mockSecClient.getFilingDocument
        .mockRejectedValueOnce(new Error('Index not found'))
        .mockResolvedValueOnce(mockDocumentContent);

      const result = await getFilingContent(accessionNumber, sequenceNumber);

      expect(result).toBe(mockDocumentContent);
      
      // Should extract CIK from accession number (first 10 digits)
      expect(mockSecClient.getFilingDocument).toHaveBeenNthCalledWith(2,
        'https://www.sec.gov/Archives/edgar/data/320193/000032019323000064/0000320193-23-000064.htm',
        { handleNotFound: true }
      );
    });

    it('should handle index fetch failure with complete fallback', async () => {
      const accessionNumber = '0000320193-23-000064';
      const sequenceNumber = '1';
      const cik = '0000320193';

      const mockDocumentContent = '<html><body>Apple 10-K filing content</body></html>';

      // Mock index fetch failure, but fallback succeeds
      mockSecClient.getFilingDocument
        .mockRejectedValueOnce(new Error('Index fetch failed'))
        .mockResolvedValueOnce(mockDocumentContent);

      const result = await getFilingContent(accessionNumber, sequenceNumber, cik);

      expect(result).toBe(mockDocumentContent);
      expect(mockSecClient.getFilingDocument).toHaveBeenCalledTimes(2);
    });

    it('should throw error when all fallback attempts fail', async () => {
      const accessionNumber = '0000320193-23-000064';
      const sequenceNumber = '1';
      const cik = '0000320193';

      // Mock all attempts failing
      mockSecClient.getFilingDocument.mockRejectedValue(new Error('Not found'));

      await expect(getFilingContent(accessionNumber, sequenceNumber, cik))
        .rejects.toThrow('Failed to get filing content for 0000320193-23-000064');
    });

    it('should validate content length during fallback attempts', async () => {
      const accessionNumber = '0000320193-23-000064';
      const sequenceNumber = '1';
      const cik = '0000320193';

      const shortContent = 'x'.repeat(50); // At boundary
      const validContent = 'x'.repeat(200); // Above boundary

      // Mock index fails, first fallback returns short content, second returns valid
      mockSecClient.getFilingDocument
        .mockRejectedValueOnce(new Error('Index not found'))
        .mockResolvedValueOnce(shortContent)   // Should be rejected (≤ 100 chars)
        .mockResolvedValueOnce(validContent);  // Should be accepted

      const result = await getFilingContent(accessionNumber, sequenceNumber, cik);

      expect(result).toBe(validContent);
      expect(mockSecClient.getFilingDocument).toHaveBeenCalledTimes(3);
    });

    it('should try all common extensions in order', async () => {
      const accessionNumber = '0000320193-23-000064';
      const sequenceNumber = '1';
      const cik = '0000320193';

      const mockContent = '<html><body>Valid content</body></html>';

      // Mock index fails, first two extensions fail, third succeeds
      mockSecClient.getFilingDocument
        .mockRejectedValueOnce(new Error('Index not found'))
        .mockRejectedValueOnce(new Error('htm not found'))
        .mockRejectedValueOnce(new Error('html not found'))
        .mockResolvedValueOnce(mockContent); // txt succeeds

      const result = await getFilingContent(accessionNumber, sequenceNumber, cik);

      expect(result).toBe(mockContent);
      
      // Should try htm, html, txt in that order
      const calls = mockSecClient.getFilingDocument.mock.calls;
      expect(calls[1][0]).toContain('.htm');
      expect(calls[2][0]).toContain('.html');
      expect(calls[3][0]).toContain('.txt');
    });
  });

  describe('Direct filename handling', () => {
    it('should handle direct filename without sequence number mapping', async () => {
      const accessionNumber = '0000320193-23-000064';
      const filename = 'aapl-20230930.htm';
      const cik = '0000320193';

      const mockDocumentContent = '<html><body>Apple 10-K filing content</body></html>';
      mockSecClient.getFilingDocument.mockResolvedValue(mockDocumentContent);

      const result = await getFilingContent(accessionNumber, filename, cik);

      expect(result).toBe(mockDocumentContent);
      expect(mockSecClient.getFilingDocument).toHaveBeenCalledWith(
        'https://www.sec.gov/Archives/edgar/data/320193/000032019323000064/aapl-20230930.htm',
        { handleNotFound: true }
      );
    });

    it('should handle filename with CIK extraction', async () => {
      const accessionNumber = '0000320193-23-000064';
      const filename = 'aapl-20230930.htm';
      // No CIK provided

      const mockDocumentContent = '<html><body>Apple 10-K filing content</body></html>';
      mockSecClient.getFilingDocument.mockResolvedValue(mockDocumentContent);

      const result = await getFilingContent(accessionNumber, filename);

      expect(result).toBe(mockDocumentContent);
      // Should extract CIK from accession number
      expect(mockSecClient.getFilingDocument).toHaveBeenCalledWith(
        'https://www.sec.gov/Archives/edgar/data/320193/000032019323000064/aapl-20230930.htm',
        { handleNotFound: true }
      );
    });

    it('should throw error when direct filename fetch fails', async () => {
      const accessionNumber = '0000320193-23-000064';
      const filename = 'aapl-20230930.htm';
      const cik = '0000320193';

      mockSecClient.getFilingDocument.mockRejectedValue(new Error('File not found'));

      await expect(getFilingContent(accessionNumber, filename, cik))
        .rejects.toThrow('Failed to get filing content for 0000320193-23-000064');
    });

    it('should handle empty content response', async () => {
      const accessionNumber = '0000320193-23-000064';
      const filename = 'aapl-20230930.htm';
      const cik = '0000320193';

      mockSecClient.getFilingDocument.mockResolvedValue('');

      await expect(getFilingContent(accessionNumber, filename, cik))
        .rejects.toThrow('No content found for filing 0000320193-23-000064');
    });

    it('should handle null content response', async () => {
      const accessionNumber = '0000320193-23-000064';
      const filename = 'aapl-20230930.htm';
      const cik = '0000320193';

      mockSecClient.getFilingDocument.mockResolvedValue(null);

      await expect(getFilingContent(accessionNumber, filename, cik))
        .rejects.toThrow('No content found for filing 0000320193-23-000064');
    });
  });

  describe('URL construction and CIK handling', () => {
    it('should properly format accession numbers by removing dashes', async () => {
      const accessionNumber = '0000320193-23-000064';
      const filename = 'test.htm';
      const cik = '0000320193';

      mockSecClient.getFilingDocument.mockResolvedValue('content');

      await getFilingContent(accessionNumber, filename, cik);

      // URL should use accession number without dashes
      expect(mockSecClient.getFilingDocument).toHaveBeenCalledWith(
        'https://www.sec.gov/Archives/edgar/data/320193/000032019323000064/test.htm',
        { handleNotFound: true }
      );
    });

    it('should remove leading zeros from CIK in URL', async () => {
      const accessionNumber = '0000000001-23-000001';
      const filename = 'test.htm';
      const cik = '0000000001';

      mockSecClient.getFilingDocument.mockResolvedValue('content');

      await getFilingContent(accessionNumber, filename, cik);

      // URL should use CIK without leading zeros
      expect(mockSecClient.getFilingDocument).toHaveBeenCalledWith(
        'https://www.sec.gov/Archives/edgar/data/1/000000000123000001/test.htm',
        { handleNotFound: true }
      );
    });

    it('should extract CIK correctly from accession number', async () => {
      const accessionNumber = '0000123456-22-000123';
      const filename = 'test.htm';

      mockSecClient.getFilingDocument.mockResolvedValue('content');

      await getFilingContent(accessionNumber, filename);

      // Should extract first 10 digits as CIK and remove leading zeros
      expect(mockSecClient.getFilingDocument).toHaveBeenCalledWith(
        'https://www.sec.gov/Archives/edgar/data/123456/000012345622000123/test.htm',
        { handleNotFound: true }
      );
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle malformed accession numbers', async () => {
      const malformedAccessionNumber = '123-45-67890'; // Too short
      const filename = 'test.htm';

      mockSecClient.getFilingDocument.mockRejectedValue(new Error('Invalid format'));

      await expect(getFilingContent(malformedAccessionNumber, filename))
        .rejects.toThrow(`Failed to get filing content for ${malformedAccessionNumber}`);
    });

    it('should handle very long accession numbers', async () => {
      const longAccessionNumber = '1234567890123456-23-000064';
      const filename = 'test.htm';

      mockSecClient.getFilingDocument.mockRejectedValue(new Error('Invalid format'));

      await expect(getFilingContent(longAccessionNumber, filename))
        .rejects.toThrow(`Failed to get filing content for ${longAccessionNumber}`);
    });

    it('should handle special characters in filenames', async () => {
      const accessionNumber = '0000320193-23-000064';
      const specialFilename = 'test%20file-name.htm';
      const cik = '0000320193';

      const mockContent = 'Valid content';
      mockSecClient.getFilingDocument.mockResolvedValue(mockContent);

      const result = await getFilingContent(accessionNumber, specialFilename, cik);

      expect(result).toBe(mockContent);
      expect(mockSecClient.getFilingDocument).toHaveBeenCalledWith(
        `https://www.sec.gov/Archives/edgar/data/320193/000032019323000064/${specialFilename}`,
        { handleNotFound: true }
      );
    });

    it('should propagate original error messages', async () => {
      const accessionNumber = '0000320193-23-000064';
      const filename = 'test.htm';
      const cik = '0000320193';

      const originalError = new Error('Network timeout occurred');
      mockSecClient.getFilingDocument.mockRejectedValue(originalError);

      await expect(getFilingContent(accessionNumber, filename, cik))
        .rejects.toThrow('Failed to get filing content for 0000320193-23-000064: Network timeout occurred');
    });

    it('should handle non-Error exceptions', async () => {
      const accessionNumber = '0000320193-23-000064';
      const filename = 'test.htm';
      const cik = '0000320193';

      mockSecClient.getFilingDocument.mockRejectedValue('String error');

      await expect(getFilingContent(accessionNumber, filename, cik))
        .rejects.toThrow('Failed to get filing content for 0000320193-23-000064: String error');
    });
  });

  describe('Backwards compatibility', () => {
    it('should maintain existing API contract for getFilingContent', async () => {
      const mockContent = '<html>Valid content</html>';
      mockSecClient.getFilingDocument.mockResolvedValue(mockContent);

      const result = await getFilingContent('0000320193-23-000064', 'test.htm', '0000320193');

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
      expect(result).toBe(mockContent);
    });

    it('should handle legacy calling patterns', async () => {
      const mockContent = '<html>Valid content</html>';
      mockSecClient.getFilingDocument.mockResolvedValue(mockContent);

      // Test without CIK parameter
      const result1 = await getFilingContent('0000320193-23-000064', 'test.htm');
      expect(result1).toBe(mockContent);

      // Test with sequence number
      const result2 = await getFilingContent('0000320193-23-000064', '1', '0000320193');
      expect(result2).toBeDefined();
    });
  });
});