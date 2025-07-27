/**
 * Tests for Optimized Batch API Endpoint
 * 
 * Tests the /api/filings/optimized-batch endpoint for:
 * - Input validation
 * - Batch processing
 * - Concurrency control
 * - Error handling
 * - Performance metrics
 */

import { POST, OPTIONS } from '../../app/api/filings/optimized-batch/route';
import { NextRequest } from 'next/server';

// Mock the optimized filing service
jest.mock('../../services/filings/optimizedFilingService', () => ({
  optimizedFilingService: {
    batchGetFilingSummaries: jest.fn()
  }
}));

// Mock logger
jest.mock('../../lib/logging', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

// Mock monitoring
jest.mock('../../lib/monitoring', () => ({
  monitoring: {
    recordTiming: jest.fn()
  }
}));

// Mock form registry
jest.mock('../../lib/sec-edgar/form-registry', () => ({
  getFormMetadata: jest.fn()
}));

import { optimizedFilingService } from '../../services/filings/optimizedFilingService';
import { getFormMetadata } from '../../lib/sec-edgar/form-registry';

const mockOptimizedFilingService = optimizedFilingService as jest.Mocked<typeof optimizedFilingService>;
const mockGetFormMetadata = getFormMetadata as jest.MockedFunction<typeof getFormMetadata>;

describe('/api/filings/optimized-batch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default form metadata mock
    mockGetFormMetadata.mockReturnValue({ displayName: '10-K', description: 'Annual Report' });
  });

  describe('POST endpoint', () => {
    it('should return 400 if requests array is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/filings/optimized-batch', {
        method: 'POST',
        body: JSON.stringify({})
      });
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe('Requests array is required and must not be empty');
    });

    it('should return 400 if requests array is empty', async () => {
      const request = new NextRequest('http://localhost:3000/api/filings/optimized-batch', {
        method: 'POST',
        body: JSON.stringify({ requests: [] })
      });
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe('Requests array is required and must not be empty');
    });

    it('should return 400 if batch size exceeds maximum', async () => {
      const largeRequestArray = Array(26).fill({ ticker: 'TSLA', formType: '10-K' });
      
      const request = new NextRequest('http://localhost:3000/api/filings/optimized-batch', {
        method: 'POST',
        body: JSON.stringify({ requests: largeRequestArray })
      });
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe('Batch size cannot exceed 25 requests');
    });

    it('should return 400 for invalid request validation', async () => {
      const request = new NextRequest('http://localhost:3000/api/filings/optimized-batch', {
        method: 'POST',
        body: JSON.stringify({
          requests: [
            { ticker: '', formType: '10-K' }, // Invalid ticker
            { ticker: 'TSLA', formType: '' } // Invalid form type
          ]
        })
      });
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toContain('Validation errors:');
    });

    it('should return 400 for invalid form types', async () => {
      mockGetFormMetadata.mockReturnValue(null);
      
      const request = new NextRequest('http://localhost:3000/api/filings/optimized-batch', {
        method: 'POST',
        body: JSON.stringify({
          requests: [
            { ticker: 'TSLA', formType: 'INVALID' }
          ]
        })
      });
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toContain('invalid form type INVALID');
    });

    it('should process valid batch request successfully', async () => {
      const mockResults = [
        {
          data: {
            ticker: 'TSLA',
            companyName: 'Tesla, Inc.',
            filingType: '10-K',
            summaryText: 'Tesla summary',
            keyPoints: ['Growth', 'Innovation'],
            filingDate: '2023-01-01',
            accessionNumber: '0001628280-23-000000',
            url: 'https://example.com/tesla',
            filingUrl: 'https://example.com/tesla',
            tokensUsed: 1000,
            model: 'claude-3-5-sonnet-20241022'
          },
          metadata: { cacheHit: false, processingTimeMs: 3000 }
        },
        {
          data: {
            ticker: 'AAPL',
            companyName: 'Apple Inc.',
            filingType: '10-Q',
            summaryText: 'Apple summary',
            keyPoints: ['Revenue', 'Products'],
            filingDate: '2023-01-01',
            accessionNumber: '0000320193-23-000000',
            url: 'https://example.com/apple',
            filingUrl: 'https://example.com/apple',
            tokensUsed: 800,
            model: 'claude-3-5-sonnet-20241022'
          },
          metadata: { cacheHit: true, cacheSource: 'memory' }
        }
      ];

      mockOptimizedFilingService.batchGetFilingSummaries.mockResolvedValue(mockResults);

      const request = new NextRequest('http://localhost:3000/api/filings/optimized-batch', {
        method: 'POST',
        body: JSON.stringify({
          requests: [
            { ticker: 'TSLA', formType: '10-K', id: 'req1' },
            { ticker: 'AAPL', formType: '10-Q', id: 'req2' }
          ],
          concurrency: 3,
          returnMetadata: true
        })
      });
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.total).toBe(2);
      expect(data.completed).toBe(2);
      expect(data.failed).toBe(0);
      expect(data.results).toHaveLength(2);
      expect(data.results[0]).toEqual({
        ticker: 'TSLA',
        formType: '10-K',
        id: 'req1',
        success: true,
        data: mockResults[0].data,
        metadata: mockResults[0].metadata
      });
      expect(data.performance).toEqual({
        totalDuration: expect.any(Number),
        avgDuration: expect.any(Number),
        cacheHitRate: 50, // 1 out of 2 cache hits
        concurrency: 3,
        optimized: true,
        version: 'tranche-4'
      });
      expect(data.requestId).toBeDefined();
    });

    it('should handle partial failures correctly', async () => {
      const mockResults = [
        {
          data: {
            ticker: 'TSLA',
            companyName: 'Tesla, Inc.',
            filingType: '10-K',
            summaryText: 'Tesla summary',
            keyPoints: ['Growth'],
            filingDate: '2023-01-01',
            accessionNumber: '0001628280-23-000000',
            url: 'https://example.com/tesla',
            filingUrl: 'https://example.com/tesla',
            tokensUsed: 1000,
            model: 'claude-3-5-sonnet-20241022'
          }
        },
        {
          data: null,
          error: 'Filing not found for INVALID'
        }
      ];

      mockOptimizedFilingService.batchGetFilingSummaries.mockResolvedValue(mockResults);

      const request = new NextRequest('http://localhost:3000/api/filings/optimized-batch', {
        method: 'POST',
        body: JSON.stringify({
          requests: [
            { ticker: 'TSLA', formType: '10-K' },
            { ticker: 'INVALID', formType: '10-K' }
          ]
        })
      });
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.completed).toBe(1);
      expect(data.failed).toBe(1);
      expect(data.results[0].success).toBe(true);
      expect(data.results[1].success).toBe(false);
      expect(data.results[1].error).toBe('Filing not found for INVALID');
    });

    it('should respect concurrency limits', async () => {
      mockOptimizedFilingService.batchGetFilingSummaries.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/filings/optimized-batch', {
        method: 'POST',
        body: JSON.stringify({
          requests: Array(20).fill({ ticker: 'TSLA', formType: '10-K' }),
          concurrency: 15 // Higher than max allowed
        })
      });
      
      await POST(request);
      
      // Should call with optimal concurrency (max 10, and limited by request count)
      expect(mockOptimizedFilingService.batchGetFilingSummaries).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          concurrency: 10, // Max concurrency
          failFast: false,
          progressCallback: expect.any(Function)
        })
      );
    });

    it('should handle service errors gracefully', async () => {
      mockOptimizedFilingService.batchGetFilingSummaries.mockRejectedValue(
        new Error('Database connection failed')
      );

      const request = new NextRequest('http://localhost:3000/api/filings/optimized-batch', {
        method: 'POST',
        body: JSON.stringify({
          requests: [{ ticker: 'TSLA', formType: '10-K' }]
        })
      });
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(500);
      expect(data.error).toBe('Database connection failed');
      expect(data.requestId).toBeDefined();
      expect(data.performance).toEqual({
        totalDuration: expect.any(Number),
        optimized: true,
        version: 'tranche-4'
      });
    });

    it('should convert tickers to uppercase', async () => {
      mockOptimizedFilingService.batchGetFilingSummaries.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/filings/optimized-batch', {
        method: 'POST',
        body: JSON.stringify({
          requests: [
            { ticker: 'tsla', formType: '10-K' },
            { ticker: 'aapl', formType: '10-Q' }
          ]
        })
      });
      
      await POST(request);
      
      expect(mockOptimizedFilingService.batchGetFilingSummaries).toHaveBeenCalledWith(
        [
          { ticker: 'TSLA', formType: '10-K', options: expect.any(Object) },
          { ticker: 'AAPL', formType: '10-Q', options: expect.any(Object) }
        ],
        expect.any(Object)
      );
    });

    it('should calculate performance metrics correctly', async () => {
      const mockResults = [
        { data: { ticker: 'TSLA' } as any, metadata: { cacheHit: true } },
        { data: { ticker: 'AAPL' } as any, metadata: { cacheHit: false } },
        { data: null, error: 'Failed' }
      ];

      mockOptimizedFilingService.batchGetFilingSummaries.mockResolvedValue(mockResults);

      const request = new NextRequest('http://localhost:3000/api/filings/optimized-batch', {
        method: 'POST',
        body: JSON.stringify({
          requests: [
            { ticker: 'TSLA', formType: '10-K' },
            { ticker: 'AAPL', formType: '10-Q' },
            { ticker: 'MSFT', formType: '8-K' }
          ]
        })
      });
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(data.completed).toBe(2);
      expect(data.failed).toBe(1);
      expect(data.performance.cacheHitRate).toBe(33); // 1 out of 3 cache hits, rounded
    });
  });

  describe('OPTIONS endpoint', () => {
    it('should return proper CORS headers', async () => {
      const response = await OPTIONS();
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS');
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization');
    });
  });

  describe('Edge cases and limits', () => {
    it('should handle empty request objects gracefully', async () => {
      const request = new NextRequest('http://localhost:3000/api/filings/optimized-batch', {
        method: 'POST',
        body: JSON.stringify({
          requests: [{}] // Empty request object
        })
      });
      
      const response = await POST(request);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toContain('Validation errors:');
    });

    it('should optimize concurrency for small batches', async () => {
      mockOptimizedFilingService.batchGetFilingSummaries.mockResolvedValue([]);

      const request = new NextRequest('http://localhost:3000/api/filings/optimized-batch', {
        method: 'POST',
        body: JSON.stringify({
          requests: [
            { ticker: 'TSLA', formType: '10-K' },
            { ticker: 'AAPL', formType: '10-Q' }
          ],
          concurrency: 10 // Higher than needed
        })
      });
      
      await POST(request);
      
      // Should optimize concurrency to 1 (Math.ceil(2/2))
      expect(mockOptimizedFilingService.batchGetFilingSummaries).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          concurrency: 1
        })
      );
    });
  });
});