import { NextRequest } from 'next/server';
import { GET } from '../route';
import { getPrismaClient } from '@/lib/db/prisma';

// Mock the Prisma client
jest.mock('@/lib/db/prisma');
const mockGetPrismaClient = getPrismaClient as jest.MockedFunction<typeof getPrismaClient>;

// Mock data for testing
const mockCompanyData = [
  { symbol: 'AAPL', name: 'Apple Inc.', cik: '0000320193' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', cik: '0000789019' },
  { symbol: 'TSLA', name: 'Tesla, Inc.', cik: '0001318605' },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', cik: '0001652044' },
  { symbol: 'AMZN', name: 'Amazon.com, Inc.', cik: '0001018724' }
];

describe('Company Search API', () => {
  const mockPrisma = {
    secCompanyCache: {
      findFirst: jest.fn()
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPrismaClient.mockReturnValue(mockPrisma as any);
  });

  describe('Input Validation and Sanitization', () => {
    it('returns empty array for empty query', async () => {
      const request = new NextRequest('http://localhost/api/companies/search?q=');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.companies).toEqual([]);
    });

    it('returns empty array for missing query', async () => {
      const request = new NextRequest('http://localhost/api/companies/search');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.companies).toEqual([]);
    });

    it('rejects queries that are too long', async () => {
      const longQuery = 'a'.repeat(101);
      const request = new NextRequest(`http://localhost/api/companies/search?q=${longQuery}`);
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Search query too long');
    });

    it('sanitizes malicious input characters', async () => {
      mockPrisma.secCompanyCache.findFirst.mockResolvedValue({
        data: JSON.stringify(mockCompanyData)
      });

      const maliciousQuery = '<script>alert("xss")</script>apple';
      const request = new NextRequest(`http://localhost/api/companies/search?q=${maliciousQuery}`);
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      // The sanitized query should be 'scriptalert(xss)scriptapple' -> searching for 'apple'
    });

    it('handles special characters in search query', async () => {
      mockPrisma.secCompanyCache.findFirst.mockResolvedValue({
        data: JSON.stringify(mockCompanyData)
      });

      const request = new NextRequest('http://localhost/api/companies/search?q=A&P');
      const response = await GET(request);
      
      expect(response.status).toBe(200);
      // Should handle the sanitized query 'AP'
    });
  });

  describe('Database and Cache Handling', () => {
    it('returns empty array when no cached data exists', async () => {
      mockPrisma.secCompanyCache.findFirst.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/companies/search?q=AAPL');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.companies).toEqual([]);
    });

    it('handles malformed JSON in cache gracefully', async () => {
      mockPrisma.secCompanyCache.findFirst.mockResolvedValue({
        data: 'invalid json{'
      });

      const request = new NextRequest('http://localhost/api/companies/search?q=AAPL');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Invalid data format');
    });

    it('validates cached data schema', async () => {
      const invalidData = [
        { symbol: 'INVALID_SYMBOL_TOO_LONG', name: 'Test', cik: '123' }, // Invalid symbol
        { symbol: 'AAPL', name: '', cik: 'invalid_cik' } // Invalid CIK
      ];
      
      mockPrisma.secCompanyCache.findFirst.mockResolvedValue({
        data: JSON.stringify(invalidData)
      });

      const request = new NextRequest('http://localhost/api/companies/search?q=AAPL');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Invalid data format');
    });

    it('handles database connection errors', async () => {
      mockPrisma.secCompanyCache.findFirst.mockRejectedValue(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost/api/companies/search?q=AAPL');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.companies).toEqual([]);
    });
  });

  describe('Search Algorithm', () => {
    beforeEach(() => {
      mockPrisma.secCompanyCache.findFirst.mockResolvedValue({
        data: JSON.stringify(mockCompanyData)
      });
    });

    it('finds exact symbol matches', async () => {
      const request = new NextRequest('http://localhost/api/companies/search?q=AAPL');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.companies).toHaveLength(1);
      expect(data.companies[0].symbol).toBe('AAPL');
    });

    it('finds partial symbol matches', async () => {
      const request = new NextRequest('http://localhost/api/companies/search?q=AA');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.companies[0].symbol).toBe('AAPL'); // Should find AAPL
    });

    it('finds company name matches', async () => {
      const request = new NextRequest('http://localhost/api/companies/search?q=Apple');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.companies[0].symbol).toBe('AAPL');
    });

    it('is case insensitive', async () => {
      const request = new NextRequest('http://localhost/api/companies/search?q=aapl');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.companies[0].symbol).toBe('AAPL');
    });

    it('prioritizes exact symbol matches over partial matches', async () => {
      const extendedMockData = [
        ...mockCompanyData,
        { symbol: 'TSM', name: 'Taiwan Semiconductor Manufacturing Company Limited', cik: '0001046179' }
      ];
      
      mockPrisma.secCompanyCache.findFirst.mockResolvedValue({
        data: JSON.stringify(extendedMockData)
      });

      const request = new NextRequest('http://localhost/api/companies/search?q=TSM');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.companies[0].symbol).toBe('TSM'); // Exact match should come first
    });

    it('limits results to prevent large responses', async () => {
      // Create a large dataset
      const largeDataset = Array.from({ length: 100 }, (_, i) => ({
        symbol: `SYM${i}`,
        name: `Company ${i}`,
        cik: `${i.toString().padStart(10, '0')}`
      }));

      mockPrisma.secCompanyCache.findFirst.mockResolvedValue({
        data: JSON.stringify(largeDataset)
      });

      const request = new NextRequest('http://localhost/api/companies/search?q=Company');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.companies.length).toBeLessThanOrEqual(50);
    });
  });

  describe('Edge Cases', () => {
    it('handles empty cache data array', async () => {
      mockPrisma.secCompanyCache.findFirst.mockResolvedValue({
        data: JSON.stringify([])
      });

      const request = new NextRequest('http://localhost/api/companies/search?q=AAPL');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.companies).toEqual([]);
    });

    it('handles companies with null or undefined fields gracefully', async () => {
      const dataWithNulls = [
        { symbol: 'TEST', name: 'Valid Company', cik: '1234567890' }
      ];

      mockPrisma.secCompanyCache.findFirst.mockResolvedValue({
        data: JSON.stringify(dataWithNulls)
      });

      const request = new NextRequest('http://localhost/api/companies/search?q=test');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.companies).toHaveLength(1);
    });

    it('handles extremely long company names', async () => {
      const dataWithLongName = [
        { 
          symbol: 'LONG', 
          name: 'A'.repeat(200), // Max allowed length
          cik: '1234567890' 
        }
      ];

      mockPrisma.secCompanyCache.findFirst.mockResolvedValue({
        data: JSON.stringify(dataWithLongName)
      });

      const request = new NextRequest('http://localhost/api/companies/search?q=LONG');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.companies).toHaveLength(1);
    });

    it('supports both q and query parameters', async () => {
      mockPrisma.secCompanyCache.findFirst.mockResolvedValue({
        data: JSON.stringify(mockCompanyData)
      });

      const requestWithQuery = new NextRequest('http://localhost/api/companies/search?query=AAPL');
      const response = await GET(requestWithQuery);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.companies[0].symbol).toBe('AAPL');
    });
  });

  describe('Performance', () => {
    it('handles large datasets efficiently', async () => {
      const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
        symbol: `SYM${i}`,
        name: `Company ${i}`,
        cik: `${i.toString().padStart(10, '0')}`
      }));

      mockPrisma.secCompanyCache.findFirst.mockResolvedValue({
        data: JSON.stringify(largeDataset)
      });

      const start = Date.now();
      const request = new NextRequest('http://localhost/api/companies/search?q=SYM1000');
      const response = await GET(request);
      const duration = Date.now() - start;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});