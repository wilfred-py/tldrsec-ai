import { NextResponse } from 'next/server';
import { currentUser } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { getMockSummaries } from '@/lib/api/summary-service';
import { logger } from '@/lib/logging';
import { GET } from '@/app/api/summaries/route';

// Mock dependencies
jest.mock('@clerk/nextjs/server');
jest.mock('@/lib/db');
jest.mock('@/lib/logging');
jest.mock('@/lib/api/summary-service');

describe('Summaries API Route', () => {
  // Mock data
  const mockUser = {
    id: 'user123',
    firstName: 'Test',
    lastName: 'User',
    emailAddresses: [{ emailAddress: 'test@example.com' }]
  };

  const mockTickers = [
    { symbol: 'AAPL', userId: 'user123' },
    { symbol: 'MSFT', userId: 'user123' }
  ];

  const mockSummaries = [
    {
      id: 'summary1',
      tickerId: 'ticker1',
      filingType: '10-K',
      filingDate: new Date('2023-01-01'),
      filingUrl: 'https://example.com/filing1',
      summaryText: 'Summary 1',
      summaryJSON: JSON.stringify({ key: 'value1' }),
      createdAt: new Date(),
      sentToUser: true,
      ticker: { symbol: 'AAPL', companyName: 'Apple Inc.', userId: 'user123' }
    },
    {
      id: 'summary2',
      tickerId: 'ticker2',
      filingType: '10-Q',
      filingDate: new Date('2023-02-01'),
      filingUrl: 'https://example.com/filing2',
      summaryText: 'Summary 2',
      summaryJSON: JSON.stringify({ key: 'value2' }),
      createdAt: new Date(),
      sentToUser: true,
      ticker: { symbol: 'MSFT', companyName: 'Microsoft Corporation', userId: 'user123' }
    },
    {
      id: 'summary3',
      tickerId: 'ticker3',
      filingType: '8-K',
      filingDate: new Date('2023-03-01'),
      filingUrl: 'https://example.com/filing3',
      summaryText: 'Summary 3',
      summaryJSON: JSON.stringify({ key: 'value3' }),
      createdAt: new Date(),
      sentToUser: true,
      ticker: { symbol: 'GOOG', companyName: 'Alphabet Inc.', userId: 'other_user' }
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mocks
    (currentUser as jest.Mock).mockReset();
    (getMockSummaries as jest.Mock).mockReset();
    (prisma.ticker.findMany as jest.Mock).mockReset();
  });

  it('should return 401 if user is not authenticated', async () => {
    // Setup: User is not authenticated
    (currentUser as jest.Mock).mockResolvedValue(null);

    // Execute
    const request = new Request('https://example.com/api/summaries');
    const response = await GET(request);
    const responseBody = await response.json();

    // Assert
    expect(response.status).toBe(401);
    expect(responseBody).toEqual({ error: 'Authentication required' });
  });

  it('should filter summaries by user permissions (tracked tickers)', async () => {
    // Setup: User is authenticated and has access to some tickers
    (currentUser as jest.Mock).mockResolvedValue(mockUser);
    (getMockSummaries as jest.Mock).mockReturnValue(mockSummaries);
    (prisma.ticker.findMany as jest.Mock).mockResolvedValue(mockTickers);

    // Execute
    const request = new Request('https://example.com/api/summaries');
    const response = await GET(request);
    const responseBody = await response.json();

    // Assert
    expect(response.status).toBe(200);
    // Should only include summaries for AAPL and MSFT (first two mock summaries)
    expect(responseBody.summaries).toHaveLength(2);
    expect(responseBody.summaries[0].id).toBe('summary1');
    expect(responseBody.summaries[1].id).toBe('summary2');
    // Should not include GOOG summary (not in user's tickers)
    expect(responseBody.summaries.find((s: any) => s.ticker.symbol === 'GOOG')).toBeUndefined();
    
    // Verify tickers were fetched
    expect(prisma.ticker.findMany).toHaveBeenCalledWith({
      where: { userId: mockUser.id },
      select: { symbol: true }
    });
  });

  it('should apply filtering by ticker symbol', async () => {
    // Setup: User is authenticated and requesting specific ticker
    (currentUser as jest.Mock).mockResolvedValue(mockUser);
    (getMockSummaries as jest.Mock).mockReturnValue(mockSummaries);
    (prisma.ticker.findMany as jest.Mock).mockResolvedValue(mockTickers);

    // Execute: Request with ticker filter
    const request = new Request('https://example.com/api/summaries?ticker=aapl');
    const response = await GET(request);
    const responseBody = await response.json();

    // Assert
    expect(response.status).toBe(200);
    // Should only include AAPL summaries that the user has access to
    expect(responseBody.summaries).toHaveLength(1);
    expect(responseBody.summaries[0].ticker.symbol).toBe('AAPL');
  });

  it('should apply filtering by filing type', async () => {
    // Setup: User is authenticated and requesting specific filing type
    (currentUser as jest.Mock).mockResolvedValue(mockUser);
    (getMockSummaries as jest.Mock).mockReturnValue(mockSummaries);
    (prisma.ticker.findMany as jest.Mock).mockResolvedValue(mockTickers);

    // Execute: Request with filing type filter
    const request = new Request('https://example.com/api/summaries?filingType=10-k');
    const response = await GET(request);
    const responseBody = await response.json();

    // Assert
    expect(response.status).toBe(200);
    // Should only include 10-K summaries that the user has access to
    expect(responseBody.summaries).toHaveLength(1);
    expect(responseBody.summaries[0].filingType).toBe('10-K');
  });

  it('should apply limit parameter', async () => {
    // Setup: User is authenticated and requesting limited results
    (currentUser as jest.Mock).mockResolvedValue(mockUser);
    (getMockSummaries as jest.Mock).mockReturnValue(mockSummaries);
    (prisma.ticker.findMany as jest.Mock).mockResolvedValue(mockTickers);

    // Execute: Request with limit
    const request = new Request('https://example.com/api/summaries?limit=1');
    const response = await GET(request);
    const responseBody = await response.json();

    // Assert
    expect(response.status).toBe(200);
    // Should only include the most recent summary the user has access to
    expect(responseBody.summaries).toHaveLength(1);
  });

  it('should sort summaries by filing date descending', async () => {
    // Setup: User is authenticated
    (currentUser as jest.Mock).mockResolvedValue(mockUser);
    (getMockSummaries as jest.Mock).mockReturnValue(mockSummaries);
    (prisma.ticker.findMany as jest.Mock).mockResolvedValue(mockTickers);

    // Execute
    const request = new Request('https://example.com/api/summaries');
    const response = await GET(request);
    const responseBody = await response.json();

    // Assert
    expect(response.status).toBe(200);
    // Should be sorted by filing date (newest first)
    expect(new Date(responseBody.summaries[0].filingDate).getTime()).toBeGreaterThan(
      new Date(responseBody.summaries[1].filingDate).getTime()
    );
  });

  it('should handle errors gracefully', async () => {
    // Setup: currentUser throws an error
    (currentUser as jest.Mock).mockRejectedValue(new Error('Server error'));

    // Execute
    const request = new Request('https://example.com/api/summaries');
    const response = await GET(request);
    const responseBody = await response.json();

    // Assert
    expect(response.status).toBe(500);
    expect(responseBody).toEqual({ error: 'Failed to fetch summaries' });
    expect(logger.error).toHaveBeenCalledWith('Error fetching summaries list', expect.objectContaining({
      error: expect.any(Error)
    }));
  });
}); 