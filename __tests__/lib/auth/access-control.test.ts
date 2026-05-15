import { currentUser } from '@clerk/nextjs/server';
import { logger } from '@/lib/logging';

jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn()
}));

// Use globalThis to share mock between factory and tests (avoids hoisting issues)
const _g = globalThis as any;
_g.__mockFindUnique = jest.fn();

jest.mock('@/lib/db/prisma', () => ({
  prisma: undefined,
  getPrismaClient: () => ({
    summary: {
      findUnique: (globalThis as any).__mockFindUnique,
    },
  }),
}));

jest.mock('@/lib/logging', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn()
  }
}));

// Import after mocks
import {
  checkSummaryAccess,
  AccessLevel,
  AccessDeniedError,
  ResourceNotFoundError
} from '@/lib/auth/access-control';

const mockedCurrentUser = currentUser as jest.Mock;
const mockedFindUnique = _g.__mockFindUnique as jest.Mock;
const mockedLogger = logger as { warn: jest.Mock; error: jest.Mock; info: jest.Mock };

describe('Access Control', () => {
  const mockUser = {
    id: 'user_2NxBlah',
    firstName: 'Test',
    lastName: 'User',
    emailAddresses: [{ emailAddress: 'test@example.com' }]
  };

  const mockSummaryId = 'summary-uuid-123';
  const mockTicker = {
    id: 'ticker-uuid-123',
    symbol: 'AAPL',
    companyName: 'Apple Inc.',
    userId: 'db-user-uuid-456'
  };

  const mockSummary = {
    id: mockSummaryId,
    tickerId: 'ticker-uuid-123',
    filingType: '10-K',
    filingDate: new Date(),
    filingUrl: 'https://example.com/filing',
    summaryText: 'This is a summary',
    ticker: mockTicker
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkSummaryAccess', () => {
    it('should throw AccessDeniedError if user is not authenticated', async () => {
      mockedCurrentUser.mockResolvedValue(null);

      await expect(checkSummaryAccess(mockSummaryId))
        .rejects.toThrow(AccessDeniedError);

      expect(mockedLogger.warn).toHaveBeenCalledWith(
        'Unauthenticated access attempt to summary',
        { summaryId: mockSummaryId }
      );

      // Audit trail emits a security audit event at warn level for the
      // unauthenticated denial — assert through the deepened module's
      // observable interface (the logger), not a deleted internal helper.
      expect(mockedLogger.warn).toHaveBeenCalledWith(
        'Security audit event',
        expect.objectContaining({
          eventType: 'summary_access_denied',
          userId: 'anonymous',
          resourceId: mockSummaryId,
          reason: 'unauthenticated',
        })
      );
    });

    it('should throw ResourceNotFoundError if summary does not exist', async () => {
      mockedCurrentUser.mockResolvedValue(mockUser);
      mockedFindUnique.mockResolvedValue(null);

      await expect(checkSummaryAccess(mockSummaryId))
        .rejects.toThrow(ResourceNotFoundError);

      expect(mockedLogger.warn).toHaveBeenCalledWith(
        'Summary not found',
        { summaryId: mockSummaryId }
      );

      expect(mockedLogger.warn).toHaveBeenCalledWith(
        'Security audit event',
        expect.objectContaining({
          eventType: 'summary_access_denied',
          userId: mockUser.id,
          resourceId: mockSummaryId,
          reason: 'not_found',
        })
      );
    });

    it('should return summary with ticker for any authenticated user', async () => {
      mockedCurrentUser.mockResolvedValue(mockUser);
      mockedFindUnique.mockResolvedValue(mockSummary);

      const result = await checkSummaryAccess(mockSummaryId);

      expect(result).toHaveProperty('id', mockSummaryId);
      expect(result).toHaveProperty('ticker');
      expect(result.ticker).toHaveProperty('symbol', 'AAPL');
      expect(result).toHaveProperty('filingType', '10-K');
      expect(mockedLogger.info).toHaveBeenCalledWith(
        'Audit event',
        expect.objectContaining({
          eventType: 'summary_view',
          userId: mockUser.id,
          resourceId: mockSummaryId,
          tickerSymbol: mockSummary.ticker.symbol,
          filingType: mockSummary.filingType,
          accessLevel: AccessLevel.VIEW,
        })
      );
    });

    it('should work regardless of whether user tracks the ticker', async () => {
      const differentUser = { ...mockUser, id: 'user_completely_different' };
      mockedCurrentUser.mockResolvedValue(differentUser);
      mockedFindUnique.mockResolvedValue(mockSummary);

      const result = await checkSummaryAccess(mockSummaryId);
      expect(result).toHaveProperty('id', mockSummaryId);
      expect(result).toHaveProperty('ticker');
    });

    it('should throw ResourceNotFoundError for orphaned ticker reference', async () => {
      mockedCurrentUser.mockResolvedValue(mockUser);
      mockedFindUnique.mockResolvedValue({ ...mockSummary, ticker: null });

      await expect(checkSummaryAccess(mockSummaryId))
        .rejects.toThrow(ResourceNotFoundError);

      expect(mockedLogger.warn).toHaveBeenCalledWith(
        'Security audit event',
        expect.objectContaining({
          eventType: 'summary_access_denied',
          userId: mockUser.id,
          resourceId: mockSummaryId,
          reason: 'orphaned_ticker',
        })
      );
    });

    it('should handle unexpected errors gracefully', async () => {
      mockedCurrentUser.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      await expect(checkSummaryAccess(mockSummaryId))
        .rejects.toThrow(AccessDeniedError);

      expect(mockedLogger.error).toHaveBeenCalledWith(
        'Error checking summary access',
        expect.objectContaining({ error: expect.any(Error) })
      );
    });
  });
});
