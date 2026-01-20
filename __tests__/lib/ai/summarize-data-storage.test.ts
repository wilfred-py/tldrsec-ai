import { summarizeFiling } from '@/lib/ai/summarize';
import { openRouterClient } from '@/lib/ai/openrouter-client';

// Mock the Prisma client - both prisma and getPrismaClient
jest.mock('@/lib/db/prisma', () => {
  // Create a mock database inside the factory
  const mockDb = new Map<string, any>();

  const mockClient = {
    summary: {
      create: jest.fn(async (args: any) => {
        const id = `summary-${Date.now()}-${Math.random()}`;
        const record = { id, ...args.data, createdAt: new Date(), updatedAt: new Date() };
        mockDb.set(id, record);
        return record;
      }),
      findUnique: jest.fn(async (args: any) => {
        return mockDb.get(args.where.id) || null;
      }),
      update: jest.fn(async (args: any) => {
        const existing = mockDb.get(args.where.id);
        if (!existing) throw new Error('Record not found');
        const updated = { ...existing, ...args.data, updatedAt: new Date() };
        mockDb.set(args.where.id, updated);
        return updated;
      }),
      deleteMany: jest.fn(async (args: any) => {
        let deleted = 0;
        for (const [id, record] of mockDb.entries()) {
          if (args.where?.summaryText?.contains &&
              record.summaryText?.includes(args.where.summaryText.contains)) {
            mockDb.delete(id);
            deleted++;
          }
        }
        return { count: deleted };
      }),
    },
    secFiling: {
      findUnique: jest.fn(async () => null),
    },
  };

  return {
    prisma: mockClient,
    getPrismaClient: jest.fn(() => mockClient),
    __mockDb: mockDb, // Export for test access
  };
});

// Mock the OpenRouter client
jest.mock('@/lib/ai/openrouter-client', () => ({
  openRouterClient: {
    sendMessage: jest.fn(),
  },
}));

// Mock the monitoring system
jest.mock('@/lib/monitoring', () => ({
  monitoring: {
    incrementCounter: jest.fn(),
    recordTiming: jest.fn(),
    recordMetric: jest.fn(),
  },
}));

// Mock the logger
jest.mock('@/lib/logging', () => ({
  logger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

// Get mocked prisma instance and database
const { getPrismaClient, __mockDb } = require('@/lib/db/prisma');
const prisma = getPrismaClient();

describe('AI Summarization Data Storage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __mockDb.clear();
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.summary.deleteMany({
      where: {
        summaryText: {
          contains: 'TEST_SUMMARY',
        },
      },
    });
  });

  /**
   * Helper function to create a test summary record
   */
  async function createTestSummary(options: { formType?: string } = {}) {
    const id = `summary-${Date.now()}-${Math.random()}`;
    const summary = {
      id,
      tickerId: 'test-ticker-id',
      filingType: options.formType || 'Form 4',
      processingStatus: 'PENDING',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    __mockDb.set(id, summary);
    return id;
  }

  /**
   * Helper function to create valid Form 4 content mock
   */
  function createValidForm4Content() {
    return `
      Form 4 - Statement of Changes in Beneficial Ownership
      Company: Tesla Inc.
      Ticker: TSLA
      Reporting Person: Elon Musk
      CEO

      Transaction:
      - Sale of 10,000 shares at $250.00 per share
      - Total value: $2,500,000

      New holdings: 411,000,000 shares
    `;
  }

  /**
   * Helper function to create Form 4 content with filer name
   */
  function createForm4WithFilerName(filerName: string) {
    return `
      Form 4 - Statement of Changes in Beneficial Ownership
      Company: Tesla Inc.
      Ticker: TSLA
      Reporting Person: ${filerName}
      CEO

      Transaction:
      - Sale of 10,000 shares at $250.00 per share

      New holdings: 411,000,000 shares
    `;
  }

  /**
   * Helper function to create Form 4 content with transactions
   */
  function createForm4WithTransactions() {
    return `
      Form 4 - Statement of Changes in Beneficial Ownership
      Company: Tesla Inc.
      Ticker: TSLA
      Reporting Person: Elon Musk

      Transactions:
      - Sale of 10,000 shares at $250.00 per share on 2026-01-20
      - Sale of 5,000 shares at $252.00 per share on 2026-01-21

      New holdings: 410,985,000 shares
    `;
  }

  /**
   * Helper function to create Form 4 content with holdings
   */
  function createForm4WithHoldings() {
    return `
      Form 4 - Statement of Changes in Beneficial Ownership
      Company: Tesla Inc.
      Ticker: TSLA
      Reporting Person: Elon Musk

      Transaction:
      - Sale of 10,000 shares at $250.00 per share

      Previous holdings: 411,010,000 shares
      New holdings: 411,000,000 shares
      Change: -0.0024%
    `;
  }

  /**
   * Mock OpenRouter response with valid JSON
   */
  function mockOpenRouterResponse(data: Record<string, unknown>) {
    (openRouterClient.sendMessage as jest.Mock).mockResolvedValue({
      content: JSON.stringify(data),
      model: 'x-ai/grok-beta',
      usage: {
        inputTokens: 1000,
        outputTokens: 500,
      },
      cost: {
        totalCost: 0.01,
      },
    });
  }

  describe('summaryJSON storage', () => {
    it('should store summaryJSON when AI returns valid JSON', async () => {
      // Arrange
      const mockContent = createValidForm4Content();
      const summaryId = await createTestSummary();

      const mockAIResponse = {
        company: 'Tesla Inc.',
        filerName: 'Elon Musk',
        summary: 'TEST_SUMMARY: Elon Musk sold 10,000 Tesla shares.',
        transactions: [
          {
            type: 'Sale',
            shares: 10000,
            pricePerShare: 250.0,
            totalValue: 2500000,
          },
        ],
        newStake: '411,000,000 shares',
        signalStrength: 'moderate',
      };

      mockOpenRouterResponse(mockAIResponse);

      // Act
      await summarizeFiling(mockContent, { summaryId });

      // Assert
      const summary = await prisma.summary.findUnique({
        where: { id: summaryId },
      });

      expect(summary?.summaryJSON).not.toBeNull();
      expect(summary?.summaryJSON).toHaveProperty('filerName');
      expect(summary?.summaryJSON).toHaveProperty('transactions');
    });

    it('should include filerName in summaryJSON for Form 4', async () => {
      // Arrange
      const mockContent = createForm4WithFilerName('Elon Musk');
      const summaryId = await createTestSummary({ formType: 'Form 4' });

      const mockAIResponse = {
        company: 'Tesla Inc.',
        filerName: 'Elon Musk',
        summary: 'TEST_SUMMARY: Elon Musk sold shares.',
        transactions: [],
        signalStrength: 'low',
      };

      mockOpenRouterResponse(mockAIResponse);

      // Act
      await summarizeFiling(mockContent, { summaryId });

      // Assert
      const summary = await prisma.summary.findUnique({
        where: { id: summaryId },
      });

      expect(summary?.summaryJSON).toHaveProperty('filerName', 'Elon Musk');
    });

    it('should include transactions array in summaryJSON', async () => {
      // Arrange
      const mockContent = createForm4WithTransactions();
      const summaryId = await createTestSummary();

      const mockAIResponse = {
        company: 'Tesla Inc.',
        filerName: 'Elon Musk',
        summary: 'TEST_SUMMARY: Elon Musk sold 15,000 shares across two transactions.',
        transactions: [
          {
            type: 'Sale',
            shares: 10000,
            pricePerShare: 250.0,
            date: '2026-01-20',
          },
          {
            type: 'Sale',
            shares: 5000,
            pricePerShare: 252.0,
            date: '2026-01-21',
          },
        ],
        signalStrength: 'moderate',
      };

      mockOpenRouterResponse(mockAIResponse);

      // Act
      await summarizeFiling(mockContent, { summaryId });

      // Assert
      const summary = await prisma.summary.findUnique({
        where: { id: summaryId },
      });

      expect(summary?.summaryJSON).toHaveProperty('transactions');
      expect(Array.isArray((summary?.summaryJSON as any)?.transactions)).toBe(true);
      expect((summary?.summaryJSON as any)?.transactions.length).toBeGreaterThan(0);
    });

    it('should include holdings data in summaryJSON', async () => {
      // Arrange
      const mockContent = createForm4WithHoldings();
      const summaryId = await createTestSummary();

      const mockAIResponse = {
        company: 'Tesla Inc.',
        filerName: 'Elon Musk',
        summary: 'TEST_SUMMARY: Elon Musk sold 10,000 shares.',
        transactions: [
          {
            type: 'Sale',
            shares: 10000,
            pricePerShare: 250.0,
          },
        ],
        newStake: '411,000,000 shares',
        previousStake: '411,010,000 shares',
        percentageChange: '-0.0024%',
        signalStrength: 'low',
      };

      mockOpenRouterResponse(mockAIResponse);

      // Act
      await summarizeFiling(mockContent, { summaryId });

      // Assert
      const summary = await prisma.summary.findUnique({
        where: { id: summaryId },
      });

      expect(summary?.summaryJSON).toHaveProperty('newStake');
      expect(summary?.summaryJSON).toHaveProperty('percentageChange');
    });
  });
});
