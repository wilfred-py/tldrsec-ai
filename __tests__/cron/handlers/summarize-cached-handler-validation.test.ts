/**
 * Tests for summarize-cached-handler with validation wrapper integration (Phase 2)
 *
 * Verifies that the handler calls summarizeFilingWithValidation instead of
 * summarizeFiling, passes formType for extractor lookup, and handles
 * enriched data and validation metadata correctly.
 */

// --- Mock setup ---
// jest.mock is hoisted before const declarations. Variables referenced in
// factory functions must either be defined inline or accessed at runtime.
// For logger, we define the mock instance inside the factory and export it
// via a test-accessible property, because logger.child() is called at
// module load time (top-level const in handler).

const mockPrisma = {
  summary: {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  filingContentCache: {
    findUnique: jest.fn(),
  },
  ticker: {
    findFirst: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  summaryEmailDelivery: {
    findFirst: jest.fn(),
    create: jest.fn(),
  },
};

jest.mock('../../../lib/db/prisma', () => ({
  getPrismaClient: jest.fn(() => mockPrisma),
}));

// Logger instance created inside factory because logger.child() runs at module load
jest.mock('../../../lib/logging', () => {
  const instance = {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
  return {
    logger: {
      child: () => instance,
    },
    _testLoggerInstance: instance,
  };
});

jest.mock('../../../lib/ai/summarize-with-validation', () => ({
  summarizeFilingWithValidation: jest.fn(),
}));

jest.mock('../../../lib/ai/summarize', () => ({
  summarizeFiling: jest.fn(),
}));

jest.mock('../../../lib/email/summary-service', () => ({
  sendFilingSummaryEmail: jest.fn().mockResolvedValue(undefined),
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
    extractedMetadata: {},
  }),
}));

jest.mock('../../../lib/filing/filing-type-preferences-mapper', () => ({
  shouldProcessFiling: jest.fn().mockReturnValue(true),
}));

jest.mock('../../../lib/ai/parsers/response-parser', () => ({
  parseResponse: jest.fn(),
}));

jest.mock('../../../lib/email/form4-field-normalizer', () => ({
  CURRENT_FORM4_SCHEMA_VERSION: 1,
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

// --- Imports (after all jest.mock calls) ---

import { handleSummarizeCached, SummarizeJobPayload } from '../../../lib/cron/handlers/summarize-cached-handler';
import { summarizeFilingWithValidation } from '../../../lib/ai/summarize-with-validation';
import { summarizeFiling } from '../../../lib/ai/summarize';
import { sendFilingSummaryEmail } from '../../../lib/email/summary-service';

// Retrieve the logger instance created inside the mock factory
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { _testLoggerInstance: mockLoggerInstance } = require('../../../lib/logging');

// Cast imported mocks for per-test control
const mockSummarizeWithValidation = summarizeFilingWithValidation as jest.Mock;
const mockSummarizeFiling = summarizeFiling as jest.Mock;
const mockSendEmail = sendFilingSummaryEmail as jest.Mock;

// --- Test data ---

const basePayload: SummarizeJobPayload = {
  userId: 'test-user-id',
  userEmail: 'test@example.com',
  userTier: 'pro',
  ticker: {
    symbol: 'COIN',
    cik: '0001679788',
    companyName: 'Coinbase Global Inc',
  },
  filing: {
    formType: '10-K',
    filingDate: '2026-01-15',
    accessionNumber: '0001679788-26-000001',
    filingUrl: 'https://www.sec.gov/test-filing',
  },
  cacheId: 'test-cache-id',
  executionContext: {
    executionId: 'test-exec-id',
    cronTriggerTime: '2026-01-16T00:00:00Z',
    sourceContext: 'test',
    cacheHit: false,
  },
};

const mockEnrichedResult = {
  summaryId: undefined,
  summary: 'Test summary for Coinbase 10-K filing...',
  summaryText: 'Test summary for Coinbase 10-K filing...',
  summaryJSON: {
    financialHighlights: [
      { metric: 'Revenue', value: '$3.1B', change: '+15%' },
      { metric: 'Net Income', value: '$95M', change: 'improved' },
    ],
    segments: [
      { name: 'Transaction Revenue', value: '$1.5B' },
      { name: 'Subscription & Services', value: '$1.4B' },
    ],
  },
  keyPoints: ['Revenue grew 15%', 'Subscription services expanded'],
  duration: 25000,
  modelUsed: 'x-ai/grok-4-fast:free',
  inputTokens: 5000,
  outputTokens: 2000,
  tokensUsed: 7000,
  cost: 0,
  extractorValidated: true,
  fieldsFilledByExtractor: ['financialHighlights', 'segments'],
  fieldsWithDiscrepancies: [],
  extractorFillRate: 15,
};

const mockBaseResultNoValidation = {
  summaryId: undefined,
  summary: 'Test summary...',
  summaryText: 'Test summary...',
  summaryJSON: { overview: 'Basic summary' },
  duration: 20000,
  modelUsed: 'x-ai/grok-4-fast:free',
  inputTokens: 3000,
  outputTokens: 1000,
  cost: 0,
  extractorValidated: false,
};

// --- Helpers ---

function setupBaseMocks() {
  jest.clearAllMocks();

  // User exists and is not soft-deleted
  mockPrisma.user.findUnique.mockResolvedValue({ deletedAt: null });

  mockPrisma.filingContentCache.findUnique.mockResolvedValue({
    content: '<html><body>Test 10-K filing content for Coinbase</body></html>',
    contentLength: 200,
    status: 'CACHED',
    fetchError: null,
    primaryDocUrl: 'https://www.sec.gov/test-doc.htm',
  });

  mockPrisma.ticker.findFirst.mockResolvedValue({
    id: 'test-ticker-id',
    preferences: null,
  });

  // No existing summary, no shared summary
  mockPrisma.summary.findFirst
    .mockResolvedValueOnce(null)
    .mockResolvedValueOnce(null);

  mockPrisma.summary.create.mockResolvedValue({ id: 'new-summary-id' });
  mockPrisma.summary.update.mockResolvedValue({});
  mockPrisma.user.update.mockResolvedValue({});
  mockPrisma.summaryEmailDelivery.findFirst.mockResolvedValue(null);
  mockPrisma.summaryEmailDelivery.create.mockResolvedValue({});

  mockSummarizeWithValidation.mockResolvedValue(mockEnrichedResult);
}

// --- Tests ---

describe('summarize-cached-handler with validation wrapper', () => {
  beforeEach(() => {
    setupBaseMocks();
  });

  it('should call summarizeFilingWithValidation instead of summarizeFiling', async () => {
    const result = await handleSummarizeCached(basePayload);

    expect(result.success).toBe(true);
    expect(mockSummarizeWithValidation).toHaveBeenCalledTimes(1);
    expect(mockSummarizeFiling).not.toHaveBeenCalled();
  });

  it('should pass formType in options for extractor lookup', async () => {
    await handleSummarizeCached(basePayload);

    expect(mockSummarizeWithValidation).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        formType: '10-K',
      })
    );
  });

  it('should pass metadata in options', async () => {
    await handleSummarizeCached(basePayload);

    expect(mockSummarizeWithValidation).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        metadata: expect.objectContaining({
          ticker: 'COIN',
          companyName: 'Coinbase Global Inc',
          formType: '10-K',
          accessionNumber: '0001679788-26-000001',
        }),
      })
    );
  });

  it('should store enriched summaryJSON from validation wrapper in database', async () => {
    await handleSummarizeCached(basePayload);

    expect(mockPrisma.summary.create).toHaveBeenCalledTimes(1);
    const createCall = mockPrisma.summary.create.mock.calls[0][0];

    expect(createCall.data.summaryJSON).toEqual(mockEnrichedResult.summaryJSON);
    expect(createCall.data.summaryJSON.financialHighlights).toBeDefined();
    expect(createCall.data.summaryJSON.segments).toBeDefined();
  });

  it('should pass enriched summaryJSON as summaryData to email template', async () => {
    await handleSummarizeCached(basePayload);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const emailCall = mockSendEmail.mock.calls[0];

    expect(emailCall[1].summaryData).toEqual(mockEnrichedResult.summaryJSON);
  });

  it('should handle validation wrapper returning extractorValidated=false gracefully', async () => {
    mockSummarizeWithValidation.mockResolvedValue(mockBaseResultNoValidation);

    const result = await handleSummarizeCached(basePayload);

    expect(result.success).toBe(true);
    expect(result.emailSent).toBe(true);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    const emailCall = mockSendEmail.mock.calls[0];
    expect(emailCall[1].summaryData).toEqual(mockBaseResultNoValidation.summaryJSON);
  });

  it('should log extractor validation metadata when available', async () => {
    await handleSummarizeCached(basePayload);

    const infoLogs = mockLoggerInstance.info.mock.calls;
    const validationLog = infoLogs.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        call[0].includes('Extractor validation')
    );

    expect(validationLog).toBeDefined();
    expect(validationLog![1]).toEqual(
      expect.objectContaining({
        extractorValidated: true,
        fieldsFilledByExtractor: ['financialHighlights', 'segments'],
        fieldsWithDiscrepancies: [],
        extractorFillRate: 15,
      })
    );
  });

  it('should not log extractor validation when extractorValidated is not in result', async () => {
    const plainResult = { ...mockBaseResultNoValidation };
    delete (plainResult as Record<string, unknown>).extractorValidated;
    mockSummarizeWithValidation.mockResolvedValue(plainResult);

    await handleSummarizeCached(basePayload);

    const infoLogs = mockLoggerInstance.info.mock.calls;
    const validationLog = infoLogs.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        call[0].includes('Extractor validation')
    );

    expect(validationLog).toBeUndefined();
  });

  it('should pass Form 4 formType for extractor lookup', async () => {
    const form4Payload: SummarizeJobPayload = {
      ...basePayload,
      ticker: { symbol: 'GOOGL', cik: '0001652044', companyName: 'Alphabet Inc' },
      filing: {
        ...basePayload.filing,
        formType: '4',
        accessionNumber: '0001652044-26-000001',
      },
    };

    await handleSummarizeCached(form4Payload);

    expect(mockSummarizeWithValidation).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        formType: '4',
      })
    );
  });

  it('should pass cik from ticker when available', async () => {
    await handleSummarizeCached(basePayload);

    expect(mockSummarizeWithValidation).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        metadata: expect.objectContaining({
          cik: '0001679788',
        }),
      })
    );
  });
});
