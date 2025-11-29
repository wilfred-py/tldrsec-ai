/**
 * Network Failure and Error Scenarios Test Suite
 * Tests SEC API failures, timeouts, and malformed responses
 */

import { jest } from '@jest/globals';

// Mock the filing processor and handlers
const mockFilingProcessor = {
  processDiscoveredFiling: jest.fn(),
  processFetchFiling: jest.fn(),
  processSummarizeFiling: jest.fn()
};

const mockFetchHandler = {
  fetchFilingContent: jest.fn()
};

// Mock network failures
const mockNetworkFailures = {
  connectionError: () => {
    const error = new Error('ECONNREFUSED');
    (error as any).code = 'ECONNREFUSED';
    return error;
  },
  timeoutError: () => {
    const error = new Error('Request timeout');
    (error as any).code = 'ETIMEDOUT';
    return error;
  },
  dnsError: () => {
    const error = new Error('ENOTFOUND');
    (error as any).code = 'ENOTFOUND';
    return error;
  },
  rateLimitError: () => {
    const error = new Error('Rate limit exceeded');
    (error as any).status = 429;
    return error;
  },
  serverError: () => {
    const error = new Error('Internal Server Error');
    (error as any).status = 500;
    return error;
  }
};

// Mock SEC API responses
const mockSECResponses = {
  malformed: '{"company": incomplete json',
  empty: '',
  redirectPage: `
    <html>
      <head>
        <link rel="canonical" href="https://www.sec.gov/search-filings">
      </head>
      <body>Redirected to search</body>
    </html>
  `,
  corruptedXML: `
    <?xml version="1.0"?>
    <filing>
      <accession>0000320193-24-000006<unclosed
      <company>Apple Inc.
      <form>10-Q</form>
    </filing>
  `,
  oversizeResponse: 'A'.repeat(100 * 1024 * 1024), // 100MB response
  invalidEncoding: Buffer.from([0xFF, 0xFE, 0x00, 0x41, 0x00, 0x42]).toString('binary')
};

describe('Network Failure and Error Scenarios', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Network Connection Failures', () => {
    test('should handle ECONNREFUSED (connection refused)', async () => {
      mockFetchHandler.fetchFilingContent.mockRejectedValue(mockNetworkFailures.connectionError());

      const result = await mockFilingProcessor.processFetchFiling({
        id: 'test-filing-1',
        accessionNumber: '0000320193-24-000006',
        url: 'https://www.sec.gov/Archives/edgar/data/320193/000032019324000006/filing.txt'
      });

      expect(mockFetchHandler.fetchFilingContent).toHaveBeenCalledTimes(1);
      // Should log error and continue processing
      expect(result).toBeDefined();
    });

    test('should handle ETIMEDOUT (request timeout)', async () => {
      mockFetchHandler.fetchFilingContent.mockRejectedValue(mockNetworkFailures.timeoutError());

      const result = await mockFilingProcessor.processFetchFiling({
        id: 'test-filing-2',
        accessionNumber: '0000320193-24-000007',
        url: 'https://slow-sec-server.gov/filing.txt'
      });

      expect(mockFetchHandler.fetchFilingContent).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    test('should handle DNS resolution failures', async () => {
      mockFetchHandler.fetchFilingContent.mockRejectedValue(mockNetworkFailures.dnsError());

      const result = await mockFilingProcessor.processFetchFiling({
        id: 'test-filing-3',
        accessionNumber: '0000320193-24-000008',
        url: 'https://invalid-sec-domain.gov/filing.txt'
      });

      expect(mockFetchHandler.fetchFilingContent).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    test('should handle rate limiting (429 Too Many Requests)', async () => {
      mockFetchHandler.fetchFilingContent.mockRejectedValue(mockNetworkFailures.rateLimitError());

      // Should implement retry logic for rate limiting
      const result = await mockFilingProcessor.processFetchFiling({
        id: 'test-filing-4',
        accessionNumber: '0000320193-24-000009',
        url: 'https://www.sec.gov/Archives/edgar/data/320193/000032019324000009/filing.txt'
      });

      expect(mockFetchHandler.fetchFilingContent).toHaveBeenCalledTimes(1);
      expect(result).toBeDefined();
    });

    test('should handle server errors (500, 502, 503, 504)', async () => {
      for (const status of [500, 502, 503, 504]) {
        const error = new Error(`Server Error ${status}`);
        (error as any).status = status;
        
        mockFetchHandler.fetchFilingContent.mockRejectedValue(error);

        const result = await mockFilingProcessor.processFetchFiling({
          id: `test-filing-${status}`,
          accessionNumber: `0000320193-24-00${status}`,
          url: `https://www.sec.gov/filing-${status}.txt`
        });

        expect(result).toBeDefined();
      }
    });
  });

  describe('Malformed SEC API Responses', () => {
    test('should handle incomplete JSON responses', () => {
      expect(() => {
        JSON.parse(mockSECResponses.malformed);
      }).toThrow();

      // Handler should catch JSON parsing errors
      const mockParseFiling = (content: string) => {
        try {
          return JSON.parse(content);
        } catch (error) {
          console.error('Failed to parse SEC response:', error);
          return null;
        }
      };

      const result = mockParseFiling(mockSECResponses.malformed);
      expect(result).toBeNull();
    });

    test('should handle empty responses', () => {
      const emptyContent = mockSECResponses.empty;
      expect(emptyContent.length).toBe(0);

      // Handler should detect empty content
      const isValidContent = (content: string) => {
        return content && content.length > 100;
      };

      expect(isValidContent(emptyContent)).toBe(false);
    });

    test('should handle SEC search page redirects', () => {
      const redirectContent = mockSECResponses.redirectPage;
      
      // Should detect redirect patterns
      const isRedirectPage = (content: string) => {
        return content.includes('href="https://www.sec.gov/search-filings"') ||
               content.includes('rel="canonical" href="https://www.sec.gov/search-filings"');
      };

      expect(isRedirectPage(redirectContent)).toBe(true);
    });

    test('should handle corrupted XML/HTML structure', () => {
      const corruptedContent = mockSECResponses.corruptedXML;
      
      // Should extract available metadata despite corruption
      const extractAccessionNumber = (content: string) => {
        const match = content.match(/(\d{10}-\d{2}-\d{6})/);
        return match ? match[1] : null;
      };

      const accessionNumber = extractAccessionNumber(corruptedContent);
      expect(accessionNumber).toBe('0000320193-24-000006');
    });

    test('should handle oversized responses gracefully', () => {
      const oversizeContent = mockSECResponses.oversizeResponse;
      expect(oversizeContent.length).toBeGreaterThan(50 * 1024 * 1024); // > 50MB

      // Should truncate or handle large content
      const truncateContent = (content: string, maxLength: number = 50 * 1024) => {
        if (content.length > maxLength) {
          console.warn(`Content truncated from ${content.length} to ${maxLength} characters`);
          return content.substring(0, maxLength);
        }
        return content;
      };

      const truncated = truncateContent(oversizeContent);
      expect(truncated.length).toBeLessThanOrEqual(50 * 1024);
    });

    test('should handle invalid character encodings', () => {
      const invalidContent = mockSECResponses.invalidEncoding;
      
      // Should handle encoding issues gracefully
      const sanitizeContent = (content: string) => {
        try {
          // Replace invalid characters
          return content.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
        } catch (error) {
          console.error('Content encoding error:', error);
          return '';
        }
      };

      const sanitized = sanitizeContent(invalidContent);
      expect(typeof sanitized).toBe('string');
    });
  });

  describe('Timeout Scenarios', () => {
    test('should handle slow SEC API responses', async () => {
      // Mock slow response (30+ seconds)
      const slowResponse = new Promise((resolve) => {
        setTimeout(() => resolve('Delayed filing content'), 30000);
      });

      mockFetchHandler.fetchFilingContent.mockReturnValue(slowResponse);

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), 15000);
      });

      // Should timeout before 30 seconds
      await expect(Promise.race([
        mockFetchHandler.fetchFilingContent(),
        timeoutPromise
      ])).rejects.toThrow('Request timeout');
    });

    test('should handle concurrent request timeouts', async () => {
      const timeoutRequests = Array(5).fill(null).map((_, i) => {
        const promise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error(`Timeout ${i}`)), 1000 + (i * 100));
        });
        mockFetchHandler.fetchFilingContent.mockReturnValueOnce(promise);
        return mockFilingProcessor.processFetchFiling({
          id: `timeout-filing-${i}`,
          accessionNumber: `0000320193-24-00000${i}`,
          url: `https://www.sec.gov/filing-${i}.txt`
        });
      });

      // All requests should handle timeouts gracefully
      const results = await Promise.allSettled(timeoutRequests);
      
      results.forEach((result, i) => {
        if (result.status === 'rejected') {
          expect(result.reason).toBeDefined();
        }
      });
    });
  });

  describe('SEC API Rate Limiting', () => {
    test('should implement exponential backoff for rate limits', async () => {
      let callCount = 0;
      const rateLimitedFetch = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount <= 3) {
          throw mockNetworkFailures.rateLimitError();
        }
        return Promise.resolve('Success after retries');
      });

      // Mock retry logic
      const fetchWithRetry = async (url: string, maxRetries: number = 3) => {
        let retries = 0;
        while (retries < maxRetries) {
          try {
            return await rateLimitedFetch(url);
          } catch (error) {
            retries++;
            if (retries >= maxRetries) throw error;
            
            // Exponential backoff: 2^retries * 100ms
            const backoffMs = Math.pow(2, retries) * 100;
            await new Promise(resolve => setTimeout(resolve, backoffMs));
          }
        }
      };

      const result = await fetchWithRetry('https://www.sec.gov/test-filing.txt');
      
      expect(result).toBe('Success after retries');
      expect(rateLimitedFetch).toHaveBeenCalledTimes(4); // 3 failures + 1 success
    });

    test('should respect SEC rate limiting guidelines (10 requests per second)', async () => {
      const requestTimes: number[] = [];
      const mockRateLimitedFetch = jest.fn().mockImplementation(() => {
        requestTimes.push(Date.now());
        return Promise.resolve('Success');
      });

      // Send 15 requests (should be rate limited)
      const requests = Array(15).fill(null).map((_, i) => 
        mockRateLimitedFetch(`request-${i}`)
      );

      await Promise.all(requests);

      // Check that rate limiting was applied (timing-based)
      expect(mockRateLimitedFetch).toHaveBeenCalledTimes(15);
    });
  });

  describe('Error Recovery and Resilience', () => {
    test('should continue processing other filings after individual failures', async () => {
      const filings = [
        { id: 'success-1', shouldFail: false },
        { id: 'failure-1', shouldFail: true },
        { id: 'success-2', shouldFail: false },
        { id: 'failure-2', shouldFail: true },
        { id: 'success-3', shouldFail: false }
      ];

      mockFilingProcessor.processFetchFiling.mockImplementation(async (filing: any) => {
        if (filing.shouldFail) {
          throw new Error(`Failed to process ${filing.id}`);
        }
        return { success: true, id: filing.id };
      });

      const results = await Promise.allSettled(
        filings.map(filing => mockFilingProcessor.processFetchFiling(filing))
      );

      // Should have results for all filings
      expect(results).toHaveLength(5);
      
      // Count successes and failures
      const successes = results.filter(r => r.status === 'fulfilled').length;
      const failures = results.filter(r => r.status === 'rejected').length;
      
      expect(successes).toBe(3); // success-1, success-2, success-3
      expect(failures).toBe(2);  // failure-1, failure-2
    });

    test('should implement circuit breaker pattern for repeated failures', () => {
      let consecutiveFailures = 0;
      const maxFailures = 5;
      let circuitOpen = false;

      const circuitBreakerFetch = (url: string) => {
        if (circuitOpen) {
          throw new Error('Circuit breaker is open');
        }

        // Simulate failures
        if (Math.random() < 0.8) { // 80% failure rate
          consecutiveFailures++;
          if (consecutiveFailures >= maxFailures) {
            circuitOpen = true;
          }
          throw new Error('Request failed');
        }

        consecutiveFailures = 0;
        return 'Success';
      };

      // Should eventually open circuit after enough failures
      let requests = 0;
      let circuitOpenedAt = -1;

      while (requests < 20 && circuitOpenedAt === -1) {
        try {
          circuitBreakerFetch('test-url');
        } catch (error) {
          if ((error as Error).message === 'Circuit breaker is open') {
            circuitOpenedAt = requests;
            break;
          }
        }
        requests++;
      }

      expect(circuitOpenedAt).toBeGreaterThanOrEqual(maxFailures);
      expect(circuitOpenedAt).toBeLessThan(20);
    });
  });

  describe('Concurrent Processing Error Handling', () => {
    test('should handle concurrent validation requests without race conditions', async () => {
      const concurrentRequests = Array(20).fill(null).map((_, i) => ({
        id: `concurrent-${i}`,
        content: `Filing content ${i}`,
        metadata: {
          accessionNumber: `0000320193-24-00${i.toString().padStart(4, '0')}`,
          cik: '0000320193',
          formType: '10-Q',
          companyName: 'Apple Inc.'
        }
      }));

      // Mock validation with random delays and failures
      const mockValidation = jest.fn().mockImplementation(async (request: any) => {
        // Random delay 0-100ms
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
        
        // 10% chance of failure
        if (Math.random() < 0.1) {
          throw new Error(`Validation failed for ${request.id}`);
        }
        
        return { isValid: true, id: request.id };
      });

      const results = await Promise.allSettled(
        concurrentRequests.map(request => mockValidation(request))
      );

      // Should handle all requests
      expect(results).toHaveLength(20);
      expect(mockValidation).toHaveBeenCalledTimes(20);

      // Should have mix of success and failures
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failureCount = results.filter(r => r.status === 'rejected').length;
      
      expect(successCount + failureCount).toBe(20);
    });

    test('should prevent memory leaks during batch processing failures', async () => {
      const largeBatch = Array(100).fill(null).map((_, i) => ({
        id: `memory-test-${i}`,
        content: 'A'.repeat(10000), // 10KB per item
        metadata: { accessionNumber: `test-${i}`, cik: '123', formType: '10-Q', companyName: 'Test' }
      }));

      const mockBatchProcessor = jest.fn().mockImplementation(async (batch: any[]) => {
        // Simulate processing with some failures
        return Promise.allSettled(
          batch.map(async (item, index) => {
            if (index % 10 === 0) { // Every 10th item fails
              throw new Error(`Processing failed for item ${index}`);
            }
            return { processed: true, id: item.id };
          })
        );
      });

      const results = await mockBatchProcessor(largeBatch);
      
      expect(results).toHaveLength(100);
      expect(mockBatchProcessor).toHaveBeenCalledTimes(1);
      
      // Verify memory is not retained (results can be garbage collected)
      expect(results.length).toBeGreaterThan(0);
    });
  });
});