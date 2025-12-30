/**
 * Quarterly Earnings Email Service Tests
 *
 * Tests the email service that sends quarterly earnings summaries
 * when users confirm their ticker portfolio.
 */

// Mock Prisma
const mockPrismaSummary = {
  findMany: jest.fn(),
};
const mockPrismaTicker = {
  findMany: jest.fn(),
};
jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    summary: mockPrismaSummary,
    ticker: mockPrismaTicker,
  },
}));

// Mock email sending
const mockSendEmail = jest.fn();
jest.mock('@/lib/email', () => ({
  sendEmail: () => mockSendEmail(),
}));

// Mock email template
jest.mock('@/lib/email/templates', () => ({
  getEmailTemplate: jest.fn().mockReturnValue({
    html: '<html>Mock email</html>',
    text: 'Mock email text',
  }),
  EmailType: {
    QUARTERLY_EARNINGS: 'QUARTERLY_EARNINGS',
  },
}));

describe('Quarterly Earnings Email Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendQuarterlyEarningsEmail', () => {
    it('should send email with latest summaries for user tickers', async () => {
      // Mock summaries for tickers
      mockPrismaSummary.findMany.mockResolvedValue([
        {
          id: 'summary-1',
          filingType: '10-K',
          filingDate: new Date('2024-10-31'),
          summaryText: 'Apple annual report summary...',
          summaryJSON: { keyMetrics: { revenue: '394.3B' } },
          ticker: { symbol: 'AAPL', companyName: 'Apple Inc.' },
        },
        {
          id: 'summary-2',
          filingType: '10-Q',
          filingDate: new Date('2024-10-23'),
          summaryText: 'Microsoft quarterly report summary...',
          summaryJSON: { keyMetrics: { revenue: '65.6B' } },
          ticker: { symbol: 'MSFT', companyName: 'Microsoft Corporation' },
        },
        {
          id: 'summary-3',
          filingType: '10-Q',
          filingDate: new Date('2024-10-29'),
          summaryText: 'Google quarterly report summary...',
          summaryJSON: { keyMetrics: { revenue: '88.3B' } },
          ticker: { symbol: 'GOOGL', companyName: 'Alphabet Inc.' },
        },
      ]);

      mockSendEmail.mockResolvedValue({
        success: true,
        id: 'email-123',
      });

      const { sendQuarterlyEarningsEmail } = await import(
        '@/lib/email/quarterly-earnings-service'
      );

      const result = await sendQuarterlyEarningsEmail({
        userId: 'test-user-id',
        tickerSymbols: ['AAPL', 'MSFT', 'GOOGL'],
        email: 'test@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.summariesIncluded).toBe(3);
      expect(mockSendEmail).toHaveBeenCalled();
    });

    it('should handle case where no summaries exist for tickers', async () => {
      // No summaries found
      mockPrismaSummary.findMany.mockResolvedValue([]);

      const { sendQuarterlyEarningsEmail } = await import(
        '@/lib/email/quarterly-earnings-service'
      );

      const result = await sendQuarterlyEarningsEmail({
        userId: 'test-user-id',
        tickerSymbols: ['UNKNOWNTICKER'],
        email: 'test@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.summariesIncluded).toBe(0);
      // Message should indicate no summaries are available (case-insensitive check)
      expect(result.message?.toLowerCase()).toContain('no');
      expect(result.message?.toLowerCase()).toContain('summaries');
      // Should NOT have called sendEmail since there's nothing to send
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('should handle empty ticker array gracefully', async () => {
      const { sendQuarterlyEarningsEmail } = await import(
        '@/lib/email/quarterly-earnings-service'
      );

      const result = await sendQuarterlyEarningsEmail({
        userId: 'test-user-id',
        tickerSymbols: [],
        email: 'test@example.com',
      });

      expect(result.success).toBe(true);
      expect(result.summariesIncluded).toBe(0);
      expect(mockPrismaSummary.findMany).not.toHaveBeenCalled();
    });

    it('should only include 10-K and 10-Q filings', async () => {
      // Verify the query filters to quarterly filings only
      mockPrismaSummary.findMany.mockResolvedValue([
        {
          id: 'summary-1',
          filingType: '10-K',
          filingDate: new Date('2024-10-31'),
          summaryText: 'Annual report...',
          ticker: { symbol: 'AAPL', companyName: 'Apple Inc.' },
        },
      ]);

      mockSendEmail.mockResolvedValue({ success: true, id: 'email-123' });

      const { sendQuarterlyEarningsEmail } = await import(
        '@/lib/email/quarterly-earnings-service'
      );

      await sendQuarterlyEarningsEmail({
        userId: 'test-user-id',
        tickerSymbols: ['AAPL'],
        email: 'test@example.com',
      });

      // Check that findMany was called with correct filing type filter
      expect(mockPrismaSummary.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            filingType: { in: ['10-K', '10-Q'] },
          }),
        })
      );
    });

    it('should get one latest summary per ticker (deduplicated)', async () => {
      // Should use distinct to get one summary per company
      mockPrismaSummary.findMany.mockResolvedValue([
        {
          id: 'summary-latest',
          filingType: '10-Q',
          filingDate: new Date('2024-10-31'),
          summaryText: 'Latest quarterly...',
          ticker: { symbol: 'AAPL', companyName: 'Apple Inc.' },
        },
      ]);

      mockSendEmail.mockResolvedValue({ success: true, id: 'email-123' });

      const { sendQuarterlyEarningsEmail } = await import(
        '@/lib/email/quarterly-earnings-service'
      );

      await sendQuarterlyEarningsEmail({
        userId: 'test-user-id',
        tickerSymbols: ['AAPL'],
        email: 'test@example.com',
      });

      // Should order by date desc and use distinct on tickerId
      expect(mockPrismaSummary.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { filingDate: 'desc' },
          distinct: ['tickerId'],
        })
      );
    });

    it('should handle email service errors', async () => {
      mockPrismaSummary.findMany.mockResolvedValue([
        {
          id: 'summary-1',
          filingType: '10-K',
          filingDate: new Date('2024-10-31'),
          summaryText: 'Report...',
          ticker: { symbol: 'AAPL', companyName: 'Apple Inc.' },
        },
      ]);

      mockSendEmail.mockRejectedValue(new Error('Resend API error'));

      const { sendQuarterlyEarningsEmail } = await import(
        '@/lib/email/quarterly-earnings-service'
      );

      const result = await sendQuarterlyEarningsEmail({
        userId: 'test-user-id',
        tickerSymbols: ['AAPL'],
        email: 'test@example.com',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Resend API error');
    });
  });
});
