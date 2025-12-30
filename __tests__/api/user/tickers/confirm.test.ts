/**
 * Ticker Confirmation API Tests
 *
 * Tests the ticker confirmation flow where users confirm their portfolio
 * and receive quarterly earnings emails.
 */

import { NextRequest } from 'next/server';

// Mock Clerk auth
const mockAuth = jest.fn();
jest.mock('@clerk/nextjs/server', () => ({
  auth: () => mockAuth(),
}));

// Mock Prisma
const mockPrismaUser = {
  findFirst: jest.fn(),
  update: jest.fn(),
};
const mockPrismaTicker = {
  findMany: jest.fn(),
};
const mockPrismaSummary = {
  findMany: jest.fn(),
};
jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: mockPrismaUser,
    ticker: mockPrismaTicker,
    summary: mockPrismaSummary,
  },
}));

// Mock email service
const mockSendQuarterlyEarningsEmail = jest.fn();
jest.mock('@/lib/email/quarterly-earnings-service', () => ({
  sendQuarterlyEarningsEmail: () => mockSendQuarterlyEarningsEmail(),
}));

describe('Ticker Confirmation API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/user/tickers/confirm', () => {
    it('should confirm tickers and trigger email for new user', async () => {
      // Mock authenticated user
      mockAuth.mockReturnValue({ userId: 'clerk_user_123' });

      // Mock user with tickers, never confirmed before
      mockPrismaUser.findFirst.mockResolvedValue({
        id: 'user-uuid-123',
        email: 'test@example.com',
        authProviderId: 'clerk_user_123',
        tickersConfirmedAt: null,
        lastConfirmationEmailSentAt: null,
        tickersAtLastConfirmation: [],
        tickers: [
          { id: 't1', symbol: 'AAPL', companyName: 'Apple Inc.' },
          { id: 't2', symbol: 'MSFT', companyName: 'Microsoft Corporation' },
          { id: 't3', symbol: 'GOOGL', companyName: 'Alphabet Inc.' },
        ],
      });

      mockPrismaUser.update.mockResolvedValue({});
      mockSendQuarterlyEarningsEmail.mockResolvedValue({
        success: true,
        summariesIncluded: 3,
      });

      // Import after mocks are set up
      const { POST } = await import('@/app/api/user/tickers/confirm/route');

      const request = new NextRequest('http://localhost/api/user/tickers/confirm', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.tickersConfirmed).toBe(true);
      expect(data.emailSent).toBe(true);
      expect(data.tickerCount).toBe(3);
    });

    it('should skip email for tickers confirmed within 1 minute with same tickers', async () => {
      // Mock authenticated user
      mockAuth.mockReturnValue({ userId: 'clerk_user_123' });

      // User confirmed 30 seconds ago, same tickers
      const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
      mockPrismaUser.findFirst.mockResolvedValue({
        id: 'user-uuid-123',
        email: 'test@example.com',
        authProviderId: 'clerk_user_123',
        tickersConfirmedAt: thirtySecondsAgo,
        lastConfirmationEmailSentAt: thirtySecondsAgo,
        tickersAtLastConfirmation: ['AAPL', 'MSFT'],
        tickers: [
          { id: 't1', symbol: 'AAPL', companyName: 'Apple Inc.' },
          { id: 't2', symbol: 'MSFT', companyName: 'Microsoft Corporation' },
        ],
      });

      mockPrismaUser.update.mockResolvedValue({});

      const { POST } = await import('@/app/api/user/tickers/confirm/route');

      const request = new NextRequest('http://localhost/api/user/tickers/confirm', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.tickersConfirmed).toBe(true);
      expect(data.emailSent).toBe(false);
      expect(data.reason).toBe('within_grace_period');
    });

    it('should only email new tickers when re-confirmed within grace period', async () => {
      // Mock authenticated user
      mockAuth.mockReturnValue({ userId: 'clerk_user_123' });

      // User confirmed 30 seconds ago, added 1 new ticker (NVDA)
      const thirtySecondsAgo = new Date(Date.now() - 30 * 1000);
      mockPrismaUser.findFirst.mockResolvedValue({
        id: 'user-uuid-123',
        email: 'test@example.com',
        authProviderId: 'clerk_user_123',
        tickersConfirmedAt: thirtySecondsAgo,
        lastConfirmationEmailSentAt: thirtySecondsAgo,
        tickersAtLastConfirmation: ['AAPL', 'MSFT'],
        tickers: [
          { id: 't1', symbol: 'AAPL', companyName: 'Apple Inc.' },
          { id: 't2', symbol: 'MSFT', companyName: 'Microsoft Corporation' },
          { id: 't3', symbol: 'NVDA', companyName: 'NVIDIA Corporation' },
        ],
      });

      mockPrismaUser.update.mockResolvedValue({});
      mockSendQuarterlyEarningsEmail.mockResolvedValue({
        success: true,
        summariesIncluded: 1,
      });

      const { POST } = await import('@/app/api/user/tickers/confirm/route');

      const request = new NextRequest('http://localhost/api/user/tickers/confirm', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.tickersConfirmed).toBe(true);
      expect(data.emailSent).toBe(true);
      expect(data.newTickersEmailed).toEqual(['NVDA']); // Only the new one
    });

    it('should require authentication', async () => {
      // No auth
      mockAuth.mockReturnValue({ userId: null });

      const { POST } = await import('@/app/api/user/tickers/confirm/route');

      const request = new NextRequest('http://localhost/api/user/tickers/confirm', {
        method: 'POST',
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
    });

    it('should return 404 if user not found in database', async () => {
      mockAuth.mockReturnValue({ userId: 'clerk_user_123' });
      mockPrismaUser.findFirst.mockResolvedValue(null);

      const { POST } = await import('@/app/api/user/tickers/confirm/route');

      const request = new NextRequest('http://localhost/api/user/tickers/confirm', {
        method: 'POST',
      });

      const response = await POST(request);
      expect(response.status).toBe(404);
    });

    it('should handle email service failures gracefully', async () => {
      mockAuth.mockReturnValue({ userId: 'clerk_user_123' });

      mockPrismaUser.findFirst.mockResolvedValue({
        id: 'user-uuid-123',
        email: 'test@example.com',
        authProviderId: 'clerk_user_123',
        tickersConfirmedAt: null,
        tickersAtLastConfirmation: [],
        tickers: [{ id: 't1', symbol: 'AAPL', companyName: 'Apple Inc.' }],
      });

      mockPrismaUser.update.mockResolvedValue({});
      mockSendQuarterlyEarningsEmail.mockResolvedValue({
        success: false,
        error: 'Email service unavailable',
      });

      const { POST } = await import('@/app/api/user/tickers/confirm/route');

      const request = new NextRequest('http://localhost/api/user/tickers/confirm', {
        method: 'POST',
      });

      const response = await POST(request);
      const data = await response.json();

      // Should still succeed with confirmation, but email failed
      expect(response.status).toBe(200);
      expect(data.tickersConfirmed).toBe(true);
      expect(data.emailSent).toBe(false);
      expect(data.emailError).toBeDefined();
    });
  });
});
