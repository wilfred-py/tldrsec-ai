import { prisma } from '@/lib/db/prisma';
import { summarizeFiling } from '@/lib/ai/summarize';
import { parseSECFilingFromUrl } from '@/lib/parsers/sec-filing-parser';
import { ClaudeApiClient } from '@/lib/ai/claude-api-client';
import { logger } from '@/lib/logging';

// Mock the API calls and database operations for testing
jest.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    ticker: {
      findMany: jest.fn(),
    },
    secFiling: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    summary: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('@/lib/parsers/sec-filing-parser', () => ({
  parseSECFilingFromUrl: jest.fn(),
}));

jest.mock('@/lib/ai/summarize', () => ({
  summarizeFiling: jest.fn(),
}));

describe('Ticker Filing Workflow Test', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should process new SEC filing for tracked ticker', async () => {
    // Mock user with tracked tickers
    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      tickers: [
        {
          id: 'ticker-1',
          symbol: 'AAPL',
          companyName: 'Apple Inc.',
          userId: 'user-123',
        },
      ],
    };

    // Mock SEC filing data
    const mockFiling = {
      id: 'filing-123',
      cik: '0000320193', // Apple's CIK
      companyName: 'Apple Inc.',
      filingType: '10-K',
      filingDate: new Date(),
      url: 'https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/aapl-20230930.htm',
      formType: '10-K',
      sections: [
        { title: 'Risk Factors', content: 'Risk factors content...' },
        { title: 'Management Discussion', content: 'MD&A content...' },
      ],
      importantSections: {
        'Risk Factors': 'Risk factors content...',
        'Management Discussion': 'MD&A content...',
      },
    };

    // Mock summary result
    const mockSummary = {
      id: 'summary-123',
      summaryText: 'This is a summary of Apple\'s 10-K filing...',
      summaryJSON: {
        highlights: ['Record revenue', 'New product launches'],
        risks: ['Supply chain disruptions', 'Regulatory challenges'],
        outlook: 'Positive growth expected',
      },
      duration: 5000,
      modelUsed: 'claude-3-sonnet-20240229',
      inputTokens: 15000,
      outputTokens: 2000,
      cost: 0.15,
    };

    // Set up the mocks
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (prisma.ticker.findMany as jest.Mock).mockResolvedValue(mockUser.tickers);
    (prisma.secFiling.findFirst as jest.Mock).mockResolvedValue(null); // No existing filing
    (parseSECFilingFromUrl as jest.Mock).mockResolvedValue(mockFiling);
    (prisma.secFiling.create as jest.Mock).mockResolvedValue({ ...mockFiling, id: 'filing-123' });
    (prisma.summary.create as jest.Mock).mockResolvedValue({ id: 'summary-123', filingId: 'filing-123' });
    (summarizeFiling as jest.Mock).mockResolvedValue(mockSummary);

    // Function to test the workflow
    async function testTickerFilingWorkflow(userId: string, tickerSymbol: string) {
      try {
        // 1. Get user and their tracked tickers
        const user = await prisma.user.findUnique({
          where: { id: userId },
          include: { tickers: true },
        });

        if (!user) {
          throw new Error('User not found');
        }

        // 2. Find the specific ticker
        const ticker = user.tickers.find(t => t.symbol === tickerSymbol);
        
        if (!ticker) {
          throw new Error(`Ticker ${tickerSymbol} not tracked by user`);
        }

        logger.info(`Testing workflow for ticker ${ticker.symbol} (${ticker.companyName})`);

        // 3. Check if we already have the latest filing
        const existingFiling = await prisma.secFiling.findFirst({
          where: {
            ticker: { symbol: ticker.symbol },
            formType: '10-K', // Looking for the latest 10-K
          },
          orderBy: { filingDate: 'desc' },
        });

        // 4. If no filing exists, fetch and parse it
        if (!existingFiling) {
          logger.info(`No existing filing found for ${ticker.symbol}, fetching from SEC EDGAR`);
          
          // In a real implementation, we would fetch the URL from SEC EDGAR API
          const secUrl = `https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/aapl-20230930.htm`;
          
          // Parse the SEC filing
          const parsedFiling = await parseSECFilingFromUrl(secUrl, '10-K');
          
          // 5. Store the filing in the database
          const filing = await prisma.secFiling.create({
            data: {
              ticker: { connect: { id: ticker.id } },
              cik: parsedFiling.cik || '0000000000',
              companyName: parsedFiling.companyName || ticker.companyName,
              formType: parsedFiling.filingType,
              filingDate: parsedFiling.filingDate || new Date(),
              url: secUrl,
              rawContent: JSON.stringify(parsedFiling.importantSections),
              processingStatus: 'COMPLETED',
            },
          });
          
          // 6. Create a summary record
          const summary = await prisma.summary.create({
            data: {
              filing: { connect: { id: filing.id } },
              processingStatus: 'PENDING',
            },
          });
          
          // 7. Generate the summary using Claude
          const summaryResult = await summarizeFiling({
            filingId: filing.id,
            summaryId: summary.id,
            claudeClient: claudeClient,
            claudeOptions: {
              model: 'claude-3-sonnet-20240229',
              temperature: 0.3,
              maxTokens: 4000,
            },
          });
          
          logger.info(`Summary generated successfully for ${ticker.symbol} filing`, {
            summaryId: summaryResult.summaryId,
            modelUsed: summaryResult.modelUsed,
            duration: summaryResult.duration,
          });
          
          return {
            success: true,
            filing,
            summary: summaryResult,
          };
        } else {
          logger.info(`Existing filing found for ${ticker.symbol}`, {
            filingId: existingFiling.id,
            filingDate: existingFiling.filingDate,
          });
          
          return {
            success: true,
            filing: existingFiling,
            existingFiling: true,
          };
        }
      } catch (error) {
        logger.error('Error in ticker filing workflow test', {
          error: error instanceof Error ? error.message : String(error),
          userId,
          tickerSymbol,
        });
        
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    // Run the test
    const result = await testTickerFilingWorkflow('user-123', 'AAPL');
    
    // Assertions
    expect(result.success).toBe(true);
    expect(result.filing).toBeDefined();
    expect(result.existingFiling).toBeUndefined();
    expect(result.summary).toBeDefined();
    
    // Verify the mocks were called correctly
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-123' },
      include: { tickers: true },
    });
    
    expect(prisma.secFiling.findFirst).toHaveBeenCalledWith({
      where: {
        ticker: { symbol: 'AAPL' },
        formType: '10-K',
      },
      orderBy: { filingDate: 'desc' },
    });
    
    expect(parseSECFilingFromUrl).toHaveBeenCalledWith(
      'https://www.sec.gov/Archives/edgar/data/320193/000032019323000106/aapl-20230930.htm',
      '10-K'
    );
    
    expect(prisma.secFiling.create).toHaveBeenCalled();
    expect(prisma.summary.create).toHaveBeenCalled();
    expect(summarizeFiling).toHaveBeenCalled();
  });
});
