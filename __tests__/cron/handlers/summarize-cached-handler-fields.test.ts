/**
 * Tests for Summary field population in summarize-cached-handler.ts
 * Verifies that processingTimeMs is properly set for both new AI summaries
 * and shared/cached summaries.
 */

// Mock the prisma client - define outside to allow per-test manipulation
const mockPrisma = {
  summary: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  filingContentCache: {
    findUnique: jest.fn()
  },
  ticker: {
    findFirst: jest.fn()
  },
  user: {
    findUnique: jest.fn(),
    update: jest.fn()
  },
  summaryEmailDelivery: {
    findFirst: jest.fn(),
    create: jest.fn()
  }
};

jest.mock('../../../lib/db/prisma', () => ({
  getPrismaClient: jest.fn(() => mockPrisma)
}));

jest.mock('../../../lib/logging', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: () => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    })
  }
}));

jest.mock('../../../lib/ai/summarize-with-validation', () => ({
  summarizeFilingWithValidation: jest.fn().mockImplementation(async () => {
    await new Promise(resolve => setTimeout(resolve, 15));
    return {
      summary: 'Test summary',
      summaryText: 'Test summary',
      summaryJSON: { test: 'data' },
      duration: 15,
      modelUsed: 'test-model',
      inputTokens: 100,
      outputTokens: 50,
      tokensUsed: 150,
      cost: 0.001,
      extractorValidated: false,
    };
  })
}));

jest.mock('../../../lib/email/summary-service', () => ({
  sendFilingSummaryEmail: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../../lib/auth/trial-service', () => ({
  TrialService: {
    checkTrialStatus: jest.fn().mockResolvedValue({
      isActive: true,
      isGrandfathered: false,
      daysRemaining: 30,
    }),
  },
}));

jest.mock('../../../lib/ai/parsers/response-parser', () => ({
  parseResponse: jest.fn(),
}));

jest.mock('../../../lib/email/form4-field-normalizer', () => ({
  CURRENT_FORM4_SCHEMA_VERSION: 1,
}));

jest.mock('../../../lib/validation/filing-content-verifier', () => ({
  verifyFilingContent: jest.fn().mockReturnValue({
    isVerified: true,
    confidence: 100,
    accessionNumber: { matches: true },
    cik: { matches: true },
    formType: { matches: true },
    companyName: { similarity: 100 },
    warnings: [],
    errors: [],
    extractedMetadata: {}
  })
}));

import { handleSummarizeCached, SummarizeJobPayload } from '../../../lib/cron/handlers/summarize-cached-handler';

// Permissive FilingPreferences fixture so the handler's inlined
// shouldProcessFiling does not skip whatever form type a test exercises.
const ALL_FILING_TYPES_ENABLED = {
  tenK: true, tenQ: true, eightK: true,
  form4: true, form3: true, form5: true, form144: true,
  twentyF: true, fortyF: true, sixK: true,
  sc13D: true, sc13G: true, thirteenF: true,
  def14A: true, pre14A: true,
  sOne: true, sThree: true,
  fourTwoFourB2: true, fourTwoFourB3: true,
  fwp: true, schedule: true,
  other: true,
};

describe('summarize-cached-handler field population', () => {
  const basePayload: SummarizeJobPayload = {
    userId: 'test-user-id',
    userEmail: 'test@example.com',
    userTier: 'pro',
    ticker: {
      symbol: 'TEST',
      cik: '0001234567',
      companyName: 'Test Company Inc'
    },
    filing: {
      formType: '10-K',
      filingDate: '2026-01-15',
      accessionNumber: '0001234567-26-000001',
      filingUrl: 'https://www.sec.gov/test-filing'
    },
    cacheId: 'test-cache-id',
    executionContext: {
      executionId: 'test-exec-id',
      cronTriggerTime: '2026-01-16T00:00:00Z',
      sourceContext: 'test',
      cacheHit: false
    }
  };

  // Helper to setup common mocks for each test
  const setupBaseMocks = () => {
    // Reset mocks but keep implementations
    mockPrisma.filingContentCache.findUnique.mockReset();
    mockPrisma.ticker.findFirst.mockReset();
    mockPrisma.summary.findFirst.mockReset();
    mockPrisma.summary.findUnique.mockReset();
    mockPrisma.summary.create.mockReset();
    mockPrisma.summary.update.mockReset();
    mockPrisma.user.update.mockReset();
    mockPrisma.summaryEmailDelivery.create.mockReset();

    // Setup default mock implementations
    mockPrisma.user.findUnique.mockResolvedValue({ deletedAt: null });
    mockPrisma.summaryEmailDelivery.findFirst.mockResolvedValue(null);

    mockPrisma.filingContentCache.findUnique.mockResolvedValue({
      content: '<html><body>Test filing content</body></html>',
      contentLength: 100,
      status: 'CACHED',
      fetchError: null,
      primaryDocUrl: 'https://www.sec.gov/test-doc.htm'
    });

    mockPrisma.ticker.findFirst.mockResolvedValue({
      id: 'test-ticker-id',
      preferences: ALL_FILING_TYPES_ENABLED,
    });

    mockPrisma.user.update.mockResolvedValue({});
    mockPrisma.summaryEmailDelivery.create.mockResolvedValue({});
  };

  beforeEach(() => {
    setupBaseMocks();
  });

  describe('processingTimeMs', () => {
    it('should populate processingTimeMs for new AI summaries', async () => {
      // Setup for new AI summary (no existing summary, no shared summary)
      mockPrisma.summary.findFirst
        .mockResolvedValueOnce(null)  // No existing summary for this user
        .mockResolvedValueOnce(null); // No shared summary available

      mockPrisma.summary.create.mockResolvedValue({
        id: 'new-summary-id'
      });
      mockPrisma.summary.update.mockResolvedValue({});

      const result = await handleSummarizeCached(basePayload);

      expect(result.success).toBe(true);
      expect(result.summaryId).toBe('new-summary-id');

      // Verify processingTimeMs was set in the create call
      const createCall = mockPrisma.summary.create.mock.calls[0][0];
      expect(createCall.data.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof createCall.data.processingTimeMs).toBe('number');
      // Since we added a 15ms delay, it should be at least 10
      expect(createCall.data.processingTimeMs).toBeGreaterThanOrEqual(10);
    }, 10000);

    it('should set processingTimeMs to 0 for shared/cached summaries', async () => {
      // Setup for shared summary path
      mockPrisma.summary.findFirst
        .mockResolvedValueOnce(null)  // No existing summary for this user
        .mockResolvedValueOnce({      // Found shared summary from another user
          id: 'shared-summary-id',
          summaryText: 'Shared summary text',
          summaryJSON: { test: 'shared data' },
          modelVersion: 'test-model',
          inputTokens: 100,
          outputTokens: 50,
          totalCost: 0.001,
          createdAt: new Date('2026-01-15T00:00:00Z')
        });

      mockPrisma.summary.create.mockResolvedValue({
        id: 'new-summary-for-user-id'
      });
      mockPrisma.summary.update.mockResolvedValue({});

      const result = await handleSummarizeCached(basePayload);

      expect(result.success).toBe(true);

      // Verify processingTimeMs was set to 0 for cached/shared summary
      expect(mockPrisma.summary.create).toHaveBeenCalled();
      const createCall = mockPrisma.summary.create.mock.calls[0][0];
      expect(createCall.data.processingTimeMs).toBe(0);
    });

    it('should include processingTimeMs as a number (not null or undefined) for new AI summaries', async () => {
      // Setup for new AI summary
      mockPrisma.summary.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      mockPrisma.summary.create.mockResolvedValue({
        id: 'test-summary-id'
      });
      mockPrisma.summary.update.mockResolvedValue({});

      const result = await handleSummarizeCached(basePayload);

      expect(result.success).toBe(true);
      expect(mockPrisma.summary.create).toHaveBeenCalled();
      const createCall = mockPrisma.summary.create.mock.calls[0][0];
      expect(createCall.data.processingTimeMs).not.toBeNull();
      expect(createCall.data.processingTimeMs).not.toBeUndefined();
      expect(typeof createCall.data.processingTimeMs).toBe('number');
    }, 10000);

    it('should include processingTimeMs as a number for shared summaries', async () => {
      // Setup for shared summary
      mockPrisma.summary.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'shared-summary-id',
          summaryText: 'Shared summary text',
          summaryJSON: { test: 'shared data' },
          modelVersion: 'test-model',
          inputTokens: 100,
          outputTokens: 50,
          totalCost: 0.001,
          createdAt: new Date('2026-01-15T00:00:00Z')
        });
      mockPrisma.summary.create.mockResolvedValue({
        id: 'test-summary-id'
      });
      mockPrisma.summary.update.mockResolvedValue({});

      const result = await handleSummarizeCached(basePayload);

      expect(result.success).toBe(true);
      expect(mockPrisma.summary.create).toHaveBeenCalled();
      const createCall = mockPrisma.summary.create.mock.calls[0][0];
      expect(createCall.data.processingTimeMs).not.toBeNull();
      expect(createCall.data.processingTimeMs).not.toBeUndefined();
      expect(typeof createCall.data.processingTimeMs).toBe('number');
      expect(createCall.data.processingTimeMs).toBe(0);
    });
  });
});
