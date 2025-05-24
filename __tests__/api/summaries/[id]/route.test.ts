import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { getMockSummaries } from '@/lib/api/summary-service';
import { 
  checkSummaryAccess, 
  AccessDeniedError, 
  ResourceNotFoundError, 
  createRedactedSummary 
} from '@/lib/auth/access-control';
import { logger } from '@/lib/logging';
import { GET } from '@/app/api/summaries/[id]/route';

// Mock dependencies
jest.mock('@clerk/nextjs/server');
jest.mock('@/lib/db');
jest.mock('@/lib/logging');
jest.mock('@/lib/api/summary-service');
jest.mock('@/lib/auth/access-control');

describe('Summary API Route', () => {
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

  const mockRedactedSummary = {
    id: mockSummaryId,
    filingType: '10-K',
    filingDate: mockSummary.filingDate,
    ticker: mockTicker,
    summaryText: 'You do not have permission to view this summary.',
    summaryJSON: null,
    accessDeniedReason: 'To view this summary, add this ticker to your watchlist.',
    isRedacted: true
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mocks
    (currentUser as jest.Mock).mockReset();
    (getMockSummaries as jest.Mock).mockReset();
    (checkSummaryAccess as jest.Mock).mockReset();
    (createRedactedSummary as jest.Mock).mockReset();
  });

  it('should return 401 if user is not authenticated', async () => {
    // Setup: User is not authenticated
    (currentUser as jest.Mock).mockResolvedValue(null);

    // Execute
    const request = new Request('https://example.com/api/summaries/summary123');
    const response = await GET(request, { params: { id: mockSummaryId } });
    const responseBody = await response.json();

    // Assert
    expect(response.status).toBe(401);
    expect(responseBody).toEqual({ error: 'Authentication required' });
  });

  it('should return 404 if summary is not found', async () => {
    // Setup: User is authenticated but summary not found
    (currentUser as jest.Mock).mockResolvedValue(mockUser);
    (getMockSummaries as jest.Mock).mockReturnValue([]);

    // Execute
    const request = new Request('https://example.com/api/summaries/summary123');
    const response = await GET(request, { params: { id: mockSummaryId } });
    const responseBody = await response.json();

    // Assert
    expect(response.status).toBe(404);
    expect(responseBody).toEqual({ error: 'Summary not found' });
    expect(logger.warn).toHaveBeenCalledWith('Summary not found', { summaryId: mockSummaryId });
  });

  it('should return full summary if user has access', async () => {
    // Setup: User is authenticated, summary exists, and user has access
    (currentUser as jest.Mock).mockResolvedValue(mockUser);
    (getMockSummaries as jest.Mock).mockReturnValue([mockSummary]);
    (checkSummaryAccess as jest.Mock).mockResolvedValue(true);

    // Execute
    const request = new Request('https://example.com/api/summaries/summary123');
    const response = await GET(request, { params: { id: mockSummaryId } });
    const responseBody = await response.json();

    // Assert
    expect(response.status).toBe(200);
    expect(responseBody).toEqual({ summary: mockSummary });
    expect(checkSummaryAccess).toHaveBeenCalledWith(mockSummaryId);
  });

  it('should return redacted summary if user does not have access', async () => {
    // Setup: User is authenticated, summary exists, but user does not have access
    (currentUser as jest.Mock).mockResolvedValue(mockUser);
    (getMockSummaries as jest.Mock).mockReturnValue([mockSummary]);
    (checkSummaryAccess as jest.Mock).mockRejectedValue(new AccessDeniedError('Access denied'));
    (createRedactedSummary as jest.Mock).mockReturnValue(mockRedactedSummary);

    // Execute
    const request = new Request('https://example.com/api/summaries/summary123');
    const response = await GET(request, { params: { id: mockSummaryId } });
    const responseBody = await response.json();

    // Assert
    expect(response.status).toBe(403);
    expect(responseBody).toEqual({
      summary: mockRedactedSummary,
      error: 'Access denied',
      message: 'To view this summary, add this ticker to your watchlist.'
    });
    expect(checkSummaryAccess).toHaveBeenCalledWith(mockSummaryId);
    expect(createRedactedSummary).toHaveBeenCalledWith(mockSummary);
  });

  it('should return 404 if access check throws ResourceNotFoundError', async () => {
    // Setup: User is authenticated, summary exists in mock data, but access check throws ResourceNotFoundError
    (currentUser as jest.Mock).mockResolvedValue(mockUser);
    (getMockSummaries as jest.Mock).mockReturnValue([mockSummary]);
    (checkSummaryAccess as jest.Mock).mockRejectedValue(new ResourceNotFoundError('Summary not found'));

    // Execute
    const request = new Request('https://example.com/api/summaries/summary123');
    const response = await GET(request, { params: { id: mockSummaryId } });
    const responseBody = await response.json();

    // Assert
    expect(response.status).toBe(404);
    expect(responseBody).toEqual({ error: 'Summary not found' });
  });

  it('should return 500 for other errors during access check', async () => {
    // Setup: User is authenticated, summary exists, but access check throws unexpected error
    (currentUser as jest.Mock).mockResolvedValue(mockUser);
    (getMockSummaries as jest.Mock).mockReturnValue([mockSummary]);
    (checkSummaryAccess as jest.Mock).mockRejectedValue(new Error('Unexpected error'));

    // Execute
    const request = new Request('https://example.com/api/summaries/summary123');
    const response = await GET(request, { params: { id: mockSummaryId } });
    const responseBody = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(responseBody).toEqual({ error: 'Failed to access summary' });
    expect(logger.error).toHaveBeenCalledWith('Error checking summary access', expect.objectContaining({
      error: expect.any(Error),
      summaryId: mockSummaryId
    }));
  });

  it('should return 500 for unexpected errors', async () => {
    // Setup: currentUser throws an error
    (currentUser as jest.Mock).mockRejectedValue(new Error('Server error'));

    // Execute
    const request = new Request('https://example.com/api/summaries/summary123');
    const response = await GET(request, { params: { id: mockSummaryId } });
    const responseBody = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(responseBody).toEqual({ error: 'Failed to fetch summary' });
    expect(logger.error).toHaveBeenCalledWith('Error in summary API', expect.objectContaining({
      error: expect.any(Error),
      params: { id: mockSummaryId }
    }));
  });
}); 