import { currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logging';
import { 
  checkSummaryAccess, 
  createRedactedSummary, 
  AccessLevel, 
  AccessDeniedError, 
  ResourceNotFoundError 
} from '@/lib/auth/access-control';
import { logSummaryAccess } from '@/lib/auth/audit-logger';

// Mock the external dependencies
jest.mock('@clerk/nextjs/server', () => ({
  currentUser: jest.fn()
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    summary: {
      findUnique: jest.fn()
    },
    ticker: {
      findFirst: jest.fn()
    }
  }
}));

jest.mock('@/lib/logging', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn()
  }
}));

jest.mock('@/lib/auth/audit-logger', () => ({
  logSummaryAccess: jest.fn()
}));

// Cast the mocks to any type to avoid TypeScript errors
const mockedCurrentUser = currentUser as any;
const mockedSummaryFindUnique = prisma.summary.findUnique as any;
const mockedTickerFindFirst = prisma.ticker.findFirst as any;
const mockedLogSummaryAccess = logSummaryAccess as any;
const mockedLogger = logger as any;

describe('Access Control', () => {
  // Mock data
  const mockUser = {
    id: 'user123',
    firstName: 'Test',
    lastName: 'User',
    emailAddresses: [{ emailAddress: 'test@example.com' }]
  };

  const mockSummaryId = 'summary123';
  const mockTicker = {
    id: 'ticker123',
    symbol: 'AAPL',
    companyName: 'Apple Inc.',
    userId: 'user123'
  };

  const mockSummary = {
    id: mockSummaryId,
    tickerId: 'ticker123',
    filingType: '10-K',
    filingDate: new Date(),
    filingUrl: 'https://example.com/filing',
    summaryText: 'This is a summary',
    summaryJSON: JSON.stringify({ key: 'value' }),
    createdAt: new Date(),
    sentToUser: true,
    ticker: mockTicker
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkSummaryAccess', () => {
    it('should throw AccessDeniedError if user is not authenticated', async () => {
      // Setup: Mock currentUser to return null (unauthenticated)
      mockedCurrentUser.mockResolvedValue(null);

      // Execute & Assert: Expect the function to throw AccessDeniedError
      await expect(checkSummaryAccess(mockSummaryId))
        .rejects.toThrow(AccessDeniedError);
      
      // Verify logs were called
      expect(mockedLogger.warn).toHaveBeenCalledWith(
        'Unauthenticated access attempt to summary', 
        { summaryId: mockSummaryId }
      );
      
      // Verify audit logging
      expect(mockedLogSummaryAccess).toHaveBeenCalledWith(
        null, 
        mockSummaryId, 
        false, 
        { reason: 'unauthenticated' }
      );
    });

    it('should throw ResourceNotFoundError if summary does not exist', async () => {
      // Setup: Mock currentUser to return a user but no summary found
      mockedCurrentUser.mockResolvedValue(mockUser);
      mockedSummaryFindUnique.mockResolvedValue(null);

      // Execute & Assert: Expect the function to throw ResourceNotFoundError
      await expect(checkSummaryAccess(mockSummaryId))
        .rejects.toThrow(ResourceNotFoundError);
      
      // Verify logs were called
      expect(mockedLogger.warn).toHaveBeenCalledWith(
        'Summary not found', 
        { summaryId: mockSummaryId }
      );
      
      // Verify audit logging
      expect(mockedLogSummaryAccess).toHaveBeenCalledWith(
        mockUser.id, 
        mockSummaryId, 
        false, 
        { reason: 'not_found' }
      );
    });

    it('should throw AccessDeniedError if user does not track the ticker', async () => {
      // Setup: Mock user, summary found, but no ticker relationship
      mockedCurrentUser.mockResolvedValue(mockUser);
      mockedSummaryFindUnique.mockResolvedValue(mockSummary);
      mockedTickerFindFirst.mockResolvedValue(null);

      // Execute & Assert: Expect the function to throw AccessDeniedError
      await expect(checkSummaryAccess(mockSummaryId))
        .rejects.toThrow(AccessDeniedError);
      
      // Verify logs were called
      expect(mockedLogger.warn).toHaveBeenCalledWith(
        'User accessing summary for untracked ticker', 
        { 
          userId: mockUser.id, 
          summaryId: mockSummaryId, 
          tickerSymbol: mockSummary.ticker.symbol 
        }
      );
      
      // Verify audit logging
      expect(mockedLogSummaryAccess).toHaveBeenCalledWith(
        mockUser.id, 
        mockSummaryId, 
        false, 
        {
          reason: 'untracked_ticker',
          tickerSymbol: mockSummary.ticker.symbol,
          filingType: mockSummary.filingType
        }
      );
    });

    it('should return true if user has access to the summary', async () => {
      // Setup: Mock user, summary, and ticker relationship all valid
      mockedCurrentUser.mockResolvedValue(mockUser);
      mockedSummaryFindUnique.mockResolvedValue(mockSummary);
      mockedTickerFindFirst.mockResolvedValue(mockTicker);

      // Execute: Call the function
      const result = await checkSummaryAccess(mockSummaryId);

      // Assert: Expect the function to return true
      expect(result).toBe(true);
      
      // Verify audit logging
      expect(mockedLogSummaryAccess).toHaveBeenCalledWith(
        mockUser.id, 
        mockSummaryId, 
        true, 
        {
          tickerSymbol: mockSummary.ticker.symbol,
          filingType: mockSummary.filingType,
          accessLevel: AccessLevel.VIEW
        }
      );
    });

    it('should handle unexpected errors gracefully', async () => {
      // Setup: Mock currentUser to throw an error
      mockedCurrentUser.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      // Execute & Assert: Expect the function to throw AccessDeniedError
      await expect(checkSummaryAccess(mockSummaryId))
        .rejects.toThrow(AccessDeniedError);
      
      // Verify logs were called
      expect(mockedLogger.error).toHaveBeenCalledWith(
        'Error checking summary access', 
        expect.objectContaining({ error: expect.any(Error) })
      );
    });
  });

  describe('createRedactedSummary', () => {
    it('should create a redacted version of a summary', () => {
      // Execute: Call the function
      const redactedSummary = createRedactedSummary(mockSummary);

      // Assert: Verify the redacted summary has the expected properties
      expect(redactedSummary).toEqual({
        id: mockSummary.id,
        filingType: mockSummary.filingType,
        filingDate: mockSummary.filingDate,
        ticker: {
          symbol: mockSummary.ticker.symbol,
          companyName: mockSummary.ticker.companyName
        },
        summaryText: 'You do not have permission to view this summary.',
        summaryJSON: null,
        accessDeniedReason: 'To view this summary, add this ticker to your watchlist.',
        isRedacted: true
      });
    });
  });
}); 