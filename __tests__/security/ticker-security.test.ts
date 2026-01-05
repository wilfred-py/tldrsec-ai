import { NextRequest } from 'next/server';
import { GET } from '@/app/api/tickers/search/route';

// Mock Clerk auth
jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn(),
}));

// Mock Prisma
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    ticker: {
      findMany: jest.fn(),
    },
  })),
}));

// Mock TickerResolver
jest.mock('@/lib/sec-edgar/ticker-service', () => ({
  TickerResolver: jest.fn().mockImplementation(() => ({
    resolveTicker: jest.fn(),
  })),
}));

// Mock logger
jest.mock('@/lib/logging', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Ticker Security Tests', () => {
  const { currentUser } = require('@clerk/nextjs/server');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Input Validation', () => {
    it('should reject SQL injection attempts', async () => {
      currentUser.mockResolvedValue({ id: 'user1' });

      const maliciousQueries = [
        "'; DROP TABLE tickers; --",
        "1' OR '1'='1",
        "UNION SELECT * FROM users",
        "<script>alert('xss')</script>",
        "../../etc/passwd"
      ];

      for (const query of maliciousQueries) {
        const request = new NextRequest(`http://localhost/api/tickers/search?q=${encodeURIComponent(query)}`);
        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.message).toContain('Invalid search parameters');
      }
    });

    it('should enforce query length limits', async () => {
      currentUser.mockResolvedValue({ id: 'user1' });

      const longQuery = 'A'.repeat(101);
      const request = new NextRequest(`http://localhost/api/tickers/search?q=${longQuery}`);
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
    });

    it('should reject special characters in ticker symbols', async () => {
      currentUser.mockResolvedValue({ id: 'user1' });

      const invalidSymbols = [
        "AAPL'; DROP TABLE",
        "MSFT<script>",
        "GOOGL%00",
        "TSLA\x00",
        "AMZN\n\r"
      ];

      for (const symbol of invalidSymbols) {
        const request = new NextRequest(`http://localhost/api/tickers/search?q=${encodeURIComponent(symbol)}`);
        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
      }
    });

    it('should enforce limit boundaries', async () => {
      currentUser.mockResolvedValue({ id: 'user1' });

      // Test limit too large
      const request1 = new NextRequest('http://localhost/api/tickers/search?q=AAPL&limit=1000');
      const response1 = await GET(request1);
      const data1 = await response1.json();

      expect(response1.status).toBe(400);
      expect(data1.success).toBe(false);

      // Test negative limit
      const request2 = new NextRequest('http://localhost/api/tickers/search?q=AAPL&limit=-1');
      const response2 = await GET(request2);
      const data2 = await response2.json();

      expect(response2.status).toBe(400);
      expect(data2.success).toBe(false);
    });
  });

  describe('Authentication Security', () => {
    it('should require authentication for searches', async () => {
      currentUser.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/tickers/search?q=AAPL');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.message).toBe('Unauthorized');
    });

    it('should handle auth errors gracefully', async () => {
      currentUser.mockRejectedValue(new Error('Auth service unavailable'));

      const request = new NextRequest('http://localhost/api/tickers/search?q=AAPL');
      const response = await GET(request);

      expect(response.status).toBe(500);
    });
  });

  describe('Rate Limiting Protection', () => {
    it('should respect limit parameter caps', async () => {
      currentUser.mockResolvedValue({ id: 'user1' });

      const { PrismaClient } = require('@prisma/client');
      const mockPrisma = new PrismaClient();
      
      // Mock a successful query
      mockPrisma.ticker.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/tickers/search?q=AAPL&limit=50');
      await GET(request);

      expect(mockPrisma.ticker.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50, // Should be capped at 50
        })
      );
    });
  });

  describe('Data Sanitization', () => {
    it('should sanitize special characters from queries', async () => {
      currentUser.mockResolvedValue({ id: 'user1' });
      
      const { PrismaClient } = require('@prisma/client');
      const mockPrisma = new PrismaClient();
      mockPrisma.ticker.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/tickers/search?q=AAPL%20Inc');
      await GET(request);

      // Should have sanitized the query
      expect(mockPrisma.ticker.findMany).toHaveBeenCalled();
      const callArgs = mockPrisma.ticker.findMany.mock.calls[0][0];
      
      // Verify sanitization occurred
      expect(callArgs.where.OR).toBeDefined();
      expect(callArgs.where.OR.some((condition: any) => 
        condition.symbol?.contains?.includes('%') || 
        condition.companyName?.contains?.includes('%')
      )).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should not leak sensitive information in error messages', async () => {
      currentUser.mockResolvedValue({ id: 'user1' });

      const { PrismaClient } = require('@prisma/client');
      const mockPrisma = new PrismaClient();
      mockPrisma.ticker.findMany.mockRejectedValue(new Error('Database connection failed with credentials: user=admin, password=secret123'));

      const request = new NextRequest('http://localhost/api/tickers/search?q=AAPL');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.message).not.toContain('password');
      expect(data.message).not.toContain('secret123');
      expect(data.message).not.toContain('admin');
    });
  });
});