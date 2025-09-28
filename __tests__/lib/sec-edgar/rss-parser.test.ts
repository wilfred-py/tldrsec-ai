import { 
  parseSecCompanyRSS, 
  generateSecRssUrl, 
  fetchSecCompanyRSS 
} from '../../../lib/sec-edgar/rss-parser';
import { logger } from '../../../lib/logging';

// Mock dependencies
jest.mock('../../../lib/logging');
global.fetch = jest.fn();

describe('RSS Parser - CIK Validation', () => {
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockLogger = {
      child: jest.fn(() => ({
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      }))
    };

    (logger as any).child = mockLogger.child;
  });

  describe('generateSecRssUrl - CIK Validation', () => {
    it('should throw error for null CIK', () => {
      expect(() => generateSecRssUrl(null as any)).toThrow(
        'Invalid CIK provided: null. CIK must be a non-empty string.'
      );
    });

    it('should throw error for undefined CIK', () => {
      expect(() => generateSecRssUrl(undefined as any)).toThrow(
        'Invalid CIK provided: undefined. CIK must be a non-empty string.'
      );
    });

    it('should throw error for non-string CIK', () => {
      expect(() => generateSecRssUrl(123456789 as any)).toThrow(
        'Invalid CIK provided: 123456789. CIK must be a non-empty string.'
      );
    });

    it('should throw error for empty string CIK', () => {
      expect(() => generateSecRssUrl('')).toThrow(
        'Invalid CIK provided: . CIK must be a non-empty string.'
      );
    });

    it('should throw error for whitespace-only CIK', () => {
      expect(() => generateSecRssUrl('   ')).toThrow(
        'Invalid CIK provided:    . CIK must be a non-empty string.'
      );
    });

    it('should handle numeric CIK inputs when passed as string', () => {
      const result = generateSecRssUrl('1318605');
      expect(result).toBe('https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001318605&output=atom');
    });

    it('should format CIK properly with leading zeros for short CIKs', () => {
      const testCases = [
        { input: '1', expected: '0000000001' },
        { input: '12', expected: '0000000012' },
        { input: '123', expected: '0000000123' },
        { input: '1234', expected: '0000001234' },
        { input: '12345', expected: '0000012345' },
        { input: '123456', expected: '0000123456' },
        { input: '1234567', expected: '0001234567' },
        { input: '12345678', expected: '0012345678' },
        { input: '123456789', expected: '0123456789' },
        { input: '1234567890', expected: '1234567890' }
      ];

      testCases.forEach(({ input, expected }) => {
        const result = generateSecRssUrl(input);
        expect(result).toBe(`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${expected}&output=atom`);
      });
    });

    it('should handle CIKs that are already 10 digits', () => {
      const result = generateSecRssUrl('1318605000');
      expect(result).toBe('https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1318605000&output=atom');
    });

    it('should handle CIKs with leading zeros correctly', () => {
      const result = generateSecRssUrl('0001318605');
      expect(result).toBe('https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001318605&output=atom');
    });

    it('should handle CIKs longer than 10 digits', () => {
      // This is an edge case - CIKs shouldn't be longer than 10 digits in practice
      const result = generateSecRssUrl('12345678901');
      expect(result).toBe('https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=12345678901&output=atom');
    });

    it('should handle boolean CIK inputs', () => {
      expect(() => generateSecRssUrl(true as any)).toThrow(
        'Invalid CIK provided: true. CIK must be a non-empty string.'
      );
      expect(() => generateSecRssUrl(false as any)).toThrow(
        'Invalid CIK provided: false. CIK must be a non-empty string.'
      );
    });

    it('should handle object CIK inputs', () => {
      expect(() => generateSecRssUrl({} as any)).toThrow(
        'Invalid CIK provided: [object Object]. CIK must be a non-empty string.'
      );
    });

    it('should handle array CIK inputs', () => {
      expect(() => generateSecRssUrl(['1318605'] as any)).toThrow(
        'Invalid CIK provided: 1318605. CIK must be a non-empty string.'
      );
    });

    it('should handle function CIK inputs', () => {
      const func = () => '1318605';
      expect(() => generateSecRssUrl(func as any)).toThrow(
        'Invalid CIK provided: () => \'1318605\'. CIK must be a non-empty string.'
      );
    });

    it('should handle CIK with non-numeric characters', () => {
      // These should still work as the function only validates type and emptiness
      const result = generateSecRssUrl('ABC1318605');
      expect(result).toBe('https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=ABC1318605&output=atom');
    });

    it('should handle special characters in CIK', () => {
      const result = generateSecRssUrl('131-860-5');
      expect(result).toBe('https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0131-860-5&output=atom');
    });
  });

  describe('parseSecCompanyRSS - CIK Handling', () => {
    const validRssXml = `<?xml version="1.0" encoding="UTF-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Tesla Inc (0001318605) - SEC Filings</title>
        <id>tag:sec.gov,2008:CIK=0001318605</id>
        <updated>2024-01-15T10:00:00Z</updated>
        <entry>
          <id>tag:sec.gov,2008:accession-number=0001564590-24-000001</id>
          <title>8-K - Current report</title>
          <summary type="html">Filed: 2024-01-15</summary>
          <updated>2024-01-15T10:00:00Z</updated>
          <link href="https://www.sec.gov/Archives/edgar/data/1318605/000156459024000001/tsla-8k_20240115.htm"/>
        </entry>
      </feed>`;

    it('should parse RSS with valid CIK successfully', async () => {
      const result = await parseSecCompanyRSS(validRssXml, '1318605');
      
      expect(result.cik).toBe('1318605');
      expect(result.companyName).toBe('Tesla Inc');
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].accessionNumber).toBe('0001564590-24-000001');
    });

    it('should handle different CIK formats consistently', async () => {
      const cikFormats = ['1318605', '0001318605', '00001318605'];
      
      for (const cik of cikFormats) {
        const result = await parseSecCompanyRSS(validRssXml, cik);
        expect(result.cik).toBe(cik); // Should preserve the input format
        expect(result.companyName).toBe('Tesla Inc');
      }
    });

    it('should handle empty CIK gracefully', async () => {
      await expect(parseSecCompanyRSS(validRssXml, '')).rejects.toThrow(
        'RSS parsing failed for CIK'
      );
    });

    it('should handle null CIK gracefully', async () => {
      await expect(parseSecCompanyRSS(validRssXml, null as any)).rejects.toThrow(
        'RSS parsing failed for CIK null'
      );
    });

    it('should handle undefined CIK gracefully', async () => {
      await expect(parseSecCompanyRSS(validRssXml, undefined as any)).rejects.toThrow(
        'RSS parsing failed for CIK undefined'
      );
    });

    it('should extract company name from feed title with various CIK formats', async () => {
      const testCases = [
        {
          xml: validRssXml,
          cik: '1318605',
          expectedName: 'Tesla Inc'
        },
        {
          xml: validRssXml.replace('Tesla Inc (0001318605)', 'Apple Inc (0000320193)'),
          cik: '320193',
          expectedName: 'Apple Inc'
        },
        {
          xml: validRssXml.replace('Tesla Inc (0001318605)', 'Microsoft Corporation (0000789019)'),
          cik: '789019',
          expectedName: 'Microsoft Corporation'
        }
      ];

      for (const testCase of testCases) {
        const result = await parseSecCompanyRSS(testCase.xml, testCase.cik);
        expect(result.companyName).toBe(testCase.expectedName);
      }
    });

    it('should fallback to default company name when title parsing fails', async () => {
      const invalidTitleXml = validRssXml.replace(
        '<title>Tesla Inc (0001318605) - SEC Filings</title>',
        '<title>Invalid Title Format</title>'
      );

      const result = await parseSecCompanyRSS(invalidTitleXml, '1318605');
      expect(result.companyName).toBe('Company 1318605');
    });

    it('should handle missing feed title', async () => {
      const noTitleXml = validRssXml.replace(
        '<title>Tesla Inc (0001318605) - SEC Filings</title>',
        ''
      );

      const result = await parseSecCompanyRSS(noTitleXml, '1318605');
      expect(result.companyName).toBe('Company 1318605');
    });
  });

  describe('fetchSecCompanyRSS - Integration with CIK Validation', () => {
    beforeEach(() => {
      (fetch as jest.Mock).mockReset();
    });

    it('should validate CIK before making HTTP request', async () => {
      await expect(fetchSecCompanyRSS(null as any)).rejects.toThrow(
        'Invalid CIK provided: null. CIK must be a non-empty string.'
      );

      // Ensure no HTTP request was made
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should format CIK correctly in HTTP request', async () => {
      const mockResponse = {
        ok: true,
        text: jest.fn().mockResolvedValue(`<?xml version="1.0" encoding="UTF-8"?>
          <feed xmlns="http://www.w3.org/2005/Atom">
            <title>Tesla Inc (0001318605) - SEC Filings</title>
            <entry></entry>
          </feed>`)
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      await fetchSecCompanyRSS('1318605');

      expect(fetch).toHaveBeenCalledWith(
        'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001318605&output=atom',
        expect.objectContaining({
          headers: expect.objectContaining({
            'User-Agent': 'tldrSEC-AI RSS Monitor (contact@tldrsec.com)'
          })
        })
      );
    });

    it('should handle HTTP errors with CIK context', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found'
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      await expect(fetchSecCompanyRSS('1318605')).rejects.toThrow('HTTP 404: Not Found');
    });

    it('should handle network errors with CIK context', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      await expect(fetchSecCompanyRSS('1318605')).rejects.toThrow('Network error');
    });

    it('should handle malformed XML response with CIK context', async () => {
      const mockResponse = {
        ok: true,
        text: jest.fn().mockResolvedValue('Invalid XML content')
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      await expect(fetchSecCompanyRSS('1318605')).rejects.toThrow(
        'RSS parsing failed for CIK 1318605'
      );
    });

    it('should handle empty response with CIK context', async () => {
      const mockResponse = {
        ok: true,
        text: jest.fn().mockResolvedValue('')
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      await expect(fetchSecCompanyRSS('1318605')).rejects.toThrow(
        'RSS parsing failed for CIK 1318605'
      );
    });
  });

  describe('Edge Cases and Boundary Conditions', () => {
    it('should handle very long CIK strings', () => {
      const longCik = '1'.repeat(1000);
      const result = generateSecRssUrl(longCik);
      expect(result).toBe(`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${longCik}&output=atom`);
    });

    it('should handle CIK with Unicode characters', () => {
      const unicodeCik = '131860５'; // Contains full-width 5
      const result = generateSecRssUrl(unicodeCik);
      expect(result).toBe(`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=000131860５&output=atom`);
    });

    it('should handle CIK with newline characters', () => {
      const newlineCik = '1318605\n';
      const result = generateSecRssUrl(newlineCik);
      expect(result).toBe('https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001318605%0A&output=atom');
    });

    it('should handle CIK with URL-unsafe characters', () => {
      const unsafeCik = '1318605&test=value';
      const result = generateSecRssUrl(unsafeCik);
      expect(result).toBe('https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=1318605&test=value&output=atom');
    });

    it('should handle maximum JavaScript number precision', () => {
      const maxSafeInteger = Number.MAX_SAFE_INTEGER.toString();
      const result = generateSecRssUrl(maxSafeInteger);
      expect(result).toContain(maxSafeInteger);
    });
  });

  describe('CIK Validation Error Messages', () => {
    it('should provide specific error messages for different invalid types', () => {
      const testCases = [
        { input: null, expectedMessage: 'Invalid CIK provided: null. CIK must be a non-empty string.' },
        { input: undefined, expectedMessage: 'Invalid CIK provided: undefined. CIK must be a non-empty string.' },
        { input: 0, expectedMessage: 'Invalid CIK provided: 0. CIK must be a non-empty string.' },
        { input: NaN, expectedMessage: 'Invalid CIK provided: NaN. CIK must be a non-empty string.' },
        { input: Infinity, expectedMessage: 'Invalid CIK provided: Infinity. CIK must be a non-empty string.' },
        { input: -Infinity, expectedMessage: 'Invalid CIK provided: -Infinity. CIK must be a non-empty string.' },
        { input: '', expectedMessage: 'Invalid CIK provided: . CIK must be a non-empty string.' }
      ];

      testCases.forEach(({ input, expectedMessage }) => {
        expect(() => generateSecRssUrl(input as any)).toThrow(expectedMessage);
      });
    });

    it('should handle Symbol type inputs', () => {
      const symbolCik = Symbol('1318605');
      expect(() => generateSecRssUrl(symbolCik as any)).toThrow(
        'Cannot convert a Symbol value to a string'
      );
    });

    it('should handle BigInt type inputs', () => {
      const bigIntCik = BigInt(1318605);
      expect(() => generateSecRssUrl(bigIntCik as any)).toThrow(
        'Invalid CIK provided: CIK must be a non-empty string. Details: Received: bigint - 1318605'
      );
    });
  });

  describe('Performance and Memory Edge Cases', () => {
    it('should handle CIK validation efficiently for large inputs', () => {
      const start = performance.now();
      
      // Test with very large numeric string
      const largeCik = '1'.repeat(100000);
      expect(() => generateSecRssUrl(largeCik)).not.toThrow();
      
      const end = performance.now();
      expect(end - start).toBeLessThan(100); // Should complete in under 100ms
    });

    it('should not cause memory leaks with repeated validations', () => {
      // Test repeated validation calls
      for (let i = 0; i < 1000; i++) {
        generateSecRssUrl(i.toString());
      }
      
      // Should complete without throwing memory errors
      expect(true).toBe(true);
    });

    it('should handle concurrent validation calls', async () => {
      const promises = Array.from({ length: 100 }, (_, i) => 
        Promise.resolve(generateSecRssUrl(i.toString()))
      );
      
      const results = await Promise.all(promises);
      expect(results).toHaveLength(100);
      
      // Each should have properly formatted CIK
      results.forEach((url, index) => {
        const expectedCik = index.toString().padStart(10, '0');
        expect(url).toContain(`CIK=${expectedCik}`);
      });
    });
  });

  describe('Logging Integration', () => {
    it('should log parsing activities with CIK context', async () => {
      const validXml = `<?xml version="1.0" encoding="UTF-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Tesla Inc (0001318605) - SEC Filings</title>
          <entry></entry>
        </feed>`;

      await parseSecCompanyRSS(validXml, '1318605');

      expect(mockLogger.child).toHaveBeenCalledWith('sec-rss-parser');
    });

    it('should log fetch activities with CIK context', async () => {
      const mockResponse = {
        ok: true,
        text: jest.fn().mockResolvedValue(`<?xml version="1.0" encoding="UTF-8"?>
          <feed xmlns="http://www.w3.org/2005/Atom">
            <title>Tesla Inc (0001318605) - SEC Filings</title>
            <entry></entry>
          </feed>`)
      };

      (fetch as jest.Mock).mockResolvedValue(mockResponse);

      await fetchSecCompanyRSS('1318605');

      expect(mockLogger.child).toHaveBeenCalledWith('sec-rss-parser');
    });

    it('should log errors with proper CIK context', async () => {
      (fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      try {
        await fetchSecCompanyRSS('1318605');
      } catch (error) {
        // Error should be thrown with CIK context
        expect(error).toBeInstanceOf(Error);
      }

      expect(mockLogger.child).toHaveBeenCalledWith('sec-rss-parser');
    });
  });
});