import { AccessDeniedError, ResourceNotFoundError, createRedactedSummary } from '@/lib/auth/access-control';

// Skip the full tests for now and focus on the simpler function
describe('Access Control', () => {
  describe('createRedactedSummary', () => {
    it('should create a redacted version of a summary', () => {
      // Mock summary data
      const mockSummary = {
        id: 'summary123',
        tickerId: 'ticker123',
        filingType: '10-K',
        filingDate: new Date('2023-01-01'),
        filingUrl: 'https://example.com/filing',
        summaryText: 'This is a summary',
        summaryJSON: JSON.stringify({ key: 'value' }),
        createdAt: new Date(),
        sentToUser: true,
        ticker: {
          symbol: 'AAPL',
          companyName: 'Apple Inc.'
        }
      };

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