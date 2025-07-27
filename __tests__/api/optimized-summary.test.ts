/**
 * Tests for Optimized Summary API Endpoint
 * 
 * Tests the /api/filings/optimized-summary endpoint for:
 * - Input validation
 * - Error handling
 * - Response format
 * - Performance metadata
 * - Security measures
 */

import { GET, OPTIONS } from '../../app/api/filings/optimized-summary/route';
import { NextRequest } from 'next/server';

// Mock the optimized filing service
jest.mock('../../services/filings/optimizedFilingService', () => ({
  optimizedFilingService: {
    getFilingSummary: jest.fn()
  }
}));

// Mock logger
jest.mock('../../lib/logging', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
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

describe('/api/filings/optimized-summary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default form metadata mock
    mockGetFormMetadata.mockReturnValue({ displayName: '10-K', description: 'Annual Report' });
  });

  describe('GET endpoint', () => {
    it('should return 400 if ticker is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/filings/optimized-summary?formType=10-K');
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe('Ticker parameter is required');
    });

    it('should return 400 if formType is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/filings/optimized-summary?ticker=TSLA');
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe('Form type parameter is required');
    });

    it('should return 400 if formType is invalid', async () => {
      mockGetFormMetadata.mockReturnValue(null);
      const request = new NextRequest('http://localhost:3000/api/filings/optimized-summary?ticker=TSLA&formType=INVALID');
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid form type: INVALID');
    });

    it('should return 404 if filing summary not found', async () => {
      mockOptimizedFilingService.getFilingSummary.mockResolvedValue({
        data: null,
        error: 'Filing not found'
      });

      const request = new NextRequest('http://localhost:3000/api/filings/optimized-summary?ticker=TSLA&formType=10-K');
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(404);
      expect(data.error).toBe('Filing not found');
    });

    it('should return successful response with valid parameters', async () => {
      const mockSummary = {
        ticker: 'TSLA',
        companyName: 'Tesla, Inc.',
        filingType: '10-K',
        summaryText: 'Test summary',
        keyPoints: ['Point 1', 'Point 2'],
        filingDate: '2023-01-01',
        accessionNumber: '0001628280-23-000000',
        url: 'https://example.com/filing',
        filingUrl: 'https://example.com/filing',
        tokensUsed: 1000,
        model: 'claude-3-5-sonnet-20241022'
      };

      mockOptimizedFilingService.getFilingSummary.mockResolvedValue({
        data: mockSummary,
        metadata: { cacheHit: false, processingTimeMs: 5000 }
      });

      const request = new NextRequest('http://localhost:3000/api/filings/optimized-summary?ticker=TSLA&formType=10-K&returnMetadata=true');
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toEqual(mockSummary);
      expect(data.metadata).toBeDefined();
      expect(data.performance).toEqual({
        duration: expect.any(Number),
        optimized: true,
        version: 'tranche-4'
      });
      expect(data.requestId).toBeDefined();
    });

    it('should handle bypassCache parameter', async () => {
      mockOptimizedFilingService.getFilingSummary.mockResolvedValue({
        data: null,
        error: 'Test error'
      });

      const request = new NextRequest('http://localhost:3000/api/filings/optimized-summary?ticker=TSLA&formType=10-K&bypassCache=true');
      
      await GET(request);
      
      expect(mockOptimizedFilingService.getFilingSummary).toHaveBeenCalledWith(
        'TSLA',
        '10-K',
        {
          bypassCache: true,
          saveToDatabase: true,
          returnMetadata: true
        }
      );
    });

    it('should return 500 on unexpected errors', async () => {
      mockOptimizedFilingService.getFilingSummary.mockRejectedValue(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost:3000/api/filings/optimized-summary?ticker=TSLA&formType=10-K');
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(response.status).toBe(500);
      expect(data.error).toBe('Database connection failed');
      expect(data.requestId).toBeDefined();
      expect(data.performance).toEqual({
        duration: expect.any(Number),
        optimized: true,
        version: 'tranche-4'
      });
    });

    it('should convert ticker to uppercase', async () => {
      mockOptimizedFilingService.getFilingSummary.mockResolvedValue({
        data: null,
        error: 'Test error'
      });

      const request = new NextRequest('http://localhost:3000/api/filings/optimized-summary?ticker=tsla&formType=10-K');
      
      await GET(request);
      
      expect(mockOptimizedFilingService.getFilingSummary).toHaveBeenCalledWith(
        'TSLA',
        '10-K',
        expect.any(Object)
      );
    });
  });

  describe('OPTIONS endpoint', () => {
    it('should return proper CORS headers', async () => {
      const response = await OPTIONS();
      
      expect(response.status).toBe(200);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, Authorization');
    });
  });

  describe('Performance and monitoring', () => {
    it('should record performance metrics', async () => {
      mockOptimizedFilingService.getFilingSummary.mockResolvedValue({
        data: { ticker: 'TSLA' } as any,
        metadata: { cacheHit: true, cacheSource: 'memory' }
      });

      const request = new NextRequest('http://localhost:3000/api/filings/optimized-summary?ticker=TSLA&formType=10-K');
      
      await GET(request);
      
      // Performance metrics should be recorded via safeMonitoring
      // This would need access to the actual monitoring mock to verify calls
    });

    it('should include request timing in response', async () => {
      mockOptimizedFilingService.getFilingSummary.mockImplementation(
        () => new Promise(resolve => {
          setTimeout(() => resolve({ data: { ticker: 'TSLA' } as any }), 100);
        })
      );

      const request = new NextRequest('http://localhost:3000/api/filings/optimized-summary?ticker=TSLA&formType=10-K');
      
      const response = await GET(request);
      const data = await response.json();
      
      expect(data.performance.duration).toBeGreaterThan(90);
    });
  });

  describe('Security validation', () => {
    it('should validate ticker format', async () => {
      // The actual validation is done in the optimized service, but API should pass through
      const request = new NextRequest('http://localhost:3000/api/filings/optimized-summary?ticker=INVALID_TICKER_TOO_LONG&formType=10-K');
      
      // Should still call the service and let it handle validation
      mockOptimizedFilingService.getFilingSummary.mockResolvedValue({
        data: null,
        error: 'Invalid ticker'
      });

      const response = await GET(request);
      expect(response.status).toBe(404);
    });

    it('should handle malicious input gracefully', async () => {
      mockOptimizedFilingService.getFilingSummary.mockResolvedValue({
        data: null,
        error: 'Invalid input'
      });

      const request = new NextRequest('http://localhost:3000/api/filings/optimized-summary?ticker=<script>&formType=10-K');
      
      const response = await GET(request);
      expect(response.status).toBe(404);
    });
  });
});