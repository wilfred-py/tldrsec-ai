/**
 * Tests for filingDatabase.ts test data markers functionality
 *
 * Phase 1: Test Data Integrity Improvements
 * These tests verify that test-generated summaries can be distinguished from production data
 * through metadata markers.
 */

// Variables referenced inside jest.mock factories must be `mock`-prefixed
// (Jest enforces this) because mock factories are hoisted above `const`
// declarations but capture outer-scope vars at call time.
// See CLAUDE.md item 14 / __tests__/cron/handlers/summarize-cached-handler-validation.test.ts.
//
// $transaction(cb) invokes cb(mockPrisma) so the callback's `tx.summary.upsert`
// lands on the same mock instance the test inspects.
type MockPrisma = {
  ticker: { findMany: jest.Mock; findFirst: jest.Mock };
  summary: { upsert: jest.Mock; findFirst: jest.Mock };
  summaryCacheAccess: { create: jest.Mock };
  $transaction: jest.Mock;
};

const mockPrisma: MockPrisma = {
  ticker: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  summary: {
    upsert: jest.fn(),
    findFirst: jest.fn(),
  },
  summaryCacheAccess: {
    create: jest.fn(),
  },
  $transaction: jest.fn((cb: (tx: unknown) => unknown) => Promise.resolve(cb(mockPrisma))),
};

// filingDatabase.ts imports `getPrismaClient` from '../../../lib/db/prisma'.
// Mock that path. References to mockPrisma must be lazy because jest.mock
// is hoisted above the const declaration (TDZ).
jest.mock('../../../../lib/db/prisma', () => ({
  get prisma() { return mockPrisma; },
  getPrismaClient: jest.fn(() => mockPrisma),
}));

// Import after mocks are registered
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
      mockPrisma.summary.upsert.mockResolvedValue({
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
      expect(mockPrisma.summary.upsert).toHaveBeenCalledTimes(1);

      // Verify the test marker landed in the create branch of the upsert
      const upsertArgs = mockPrisma.summary.upsert.mock.calls[0][0];
      expect(upsertArgs.create.metadata).toEqual({
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
      mockPrisma.summary.upsert.mockResolvedValue({
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
      expect(mockPrisma.summary.upsert).toHaveBeenCalledTimes(1);

      // Verify metadata is undefined in the create branch (no test marker for production data)
      const upsertArgs = mockPrisma.summary.upsert.mock.calls[0][0];
      expect(upsertArgs.create.metadata).toBeUndefined();
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
      mockPrisma.summary.upsert.mockResolvedValue({
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
      const upsertArgs = mockPrisma.summary.upsert.mock.calls[0][0];
      expect(upsertArgs.create.metadata).toEqual({
        source: 'test',
        isTestData: true,
        createdAt: expect.any(String),
      });
    });
  });
});
