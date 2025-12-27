/**
 * Tests for filingDatabase.ts test data markers functionality
 *
 * Phase 1: Test Data Integrity Improvements
 * These tests verify that test-generated summaries can be distinguished from production data
 * through metadata markers.
 */

// Create a mock prisma client
const mockPrisma = {
  ticker: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  summary: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  summaryCacheAccess: {
    create: jest.fn(),
  },
};

// Mock the prisma module - the filingDatabase imports from '../../../lib/db'
// which re-exports from './prisma'. Use the @ alias which maps to project root.
jest.mock('@/lib/db/prisma', () => ({
  prisma: mockPrisma,
  getPrismaClient: () => mockPrisma,
}));

jest.mock('@/lib/db', () => ({
  prisma: mockPrisma,
  getPrismaClient: () => mockPrisma,
}));

// Import after mock is set up
import { storeSummary } from '../../../../services/filings/database/filingDatabase';

describe('storeSummary', () => {
  describe('test data markers', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should include source marker when isTestData option is true', async () => {
      // Arrange
      const ticker = 'TEST_MARKER';
      const mockTickerRecord = {
        id: 'test-ticker-marker',
        symbol: ticker,
        companyName: 'Test Company',
        userId: 'test-user-marker',
      };

      mockPrisma.ticker.findMany.mockResolvedValue([mockTickerRecord]);
      mockPrisma.summary.create.mockResolvedValue({
        id: 'test-summary-id',
        tickerId: mockTickerRecord.id,
      });

      // Act
      const result = await storeSummary(
        ticker,
        '10-K',
        '2025-01-01',
        'https://sec.gov/test-filing',
        'Test summary text',
        ['Key point 1'],
        { accessionNumber: '0001234567-25-000001' },
        { isTestData: true, testSource: 'e2e-test' }
      );

      // Assert
      expect(result.stored).toBe(1);
      expect(mockPrisma.summary.create).toHaveBeenCalledTimes(1);

      // Verify the metadata was passed correctly
      const createCall = mockPrisma.summary.create.mock.calls[0][0];
      expect(createCall.data.metadata).toEqual({
        source: 'e2e-test',
        isTestData: true,
        createdAt: expect.any(String), // ISO date string
      });
    });

    it('should NOT include test marker when isTestData option is false or omitted', async () => {
      // Arrange
      const ticker = 'TEST_NO_MARKER';
      const mockTickerRecord = {
        id: 'test-ticker-nomarker',
        symbol: ticker,
        companyName: 'Production Company',
        userId: 'test-user-nomarker',
      };

      mockPrisma.ticker.findMany.mockResolvedValue([mockTickerRecord]);
      mockPrisma.summary.create.mockResolvedValue({
        id: 'test-summary-id-2',
        tickerId: mockTickerRecord.id,
      });

      // Act
      const result = await storeSummary(
        ticker,
        '10-K',
        '2025-01-01',
        'https://sec.gov/test-filing-2',
        'Production summary text',
        ['Key point 1'],
        { accessionNumber: '0001234567-25-000002' }
        // No options parameter - should default to production (no test markers)
      );

      // Assert
      expect(result.stored).toBe(1);
      expect(mockPrisma.summary.create).toHaveBeenCalledTimes(1);

      // Verify metadata is undefined (not set for production data)
      const createCall = mockPrisma.summary.create.mock.calls[0][0];
      expect(createCall.data.metadata).toBeUndefined();
    });

    it('should use default testSource when isTestData is true but testSource is omitted', async () => {
      // Arrange
      const ticker = 'TEST_DEFAULT_SOURCE';
      const mockTickerRecord = {
        id: 'test-ticker-default',
        symbol: ticker,
        companyName: 'Default Source Company',
        userId: 'test-user-default',
      };

      mockPrisma.ticker.findMany.mockResolvedValue([mockTickerRecord]);
      mockPrisma.summary.create.mockResolvedValue({
        id: 'test-summary-id-3',
        tickerId: mockTickerRecord.id,
      });

      // Act
      const result = await storeSummary(
        ticker,
        '10-K',
        '2025-01-01',
        'https://sec.gov/test-filing-3',
        'Test summary text with default source',
        ['Key point 1'],
        { accessionNumber: '0001234567-25-000003' },
        { isTestData: true } // testSource omitted, should default to 'test'
      );

      // Assert
      expect(result.stored).toBe(1);

      // Verify metadata uses default source
      const createCall = mockPrisma.summary.create.mock.calls[0][0];
      expect(createCall.data.metadata).toEqual({
        source: 'test',
        isTestData: true,
        createdAt: expect.any(String),
      });
    });
  });
});
