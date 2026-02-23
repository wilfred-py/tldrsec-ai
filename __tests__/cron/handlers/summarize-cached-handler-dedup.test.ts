/**
 * Tests for duplicate email prevention in summarize-cached-handler.ts (Phase 3)
 *
 * Verifies that when an existing summary is found on retry, the handler
 * checks sentToUser and SummaryEmailDelivery before re-sending.
 * Either condition alone is sufficient to skip (OR logic, not AND).
 */

// --- Mock setup ---
// jest.mock is hoisted before const declarations. Variables referenced in
// factory functions must either be defined inline or accessed at runtime.

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
import { sendFilingSummaryEmail } from '../../../lib/email/summary-service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { _testLoggerInstance: mockLoggerInstance } = require('../../../lib/logging');

const mockSendEmail = sendFilingSummaryEmail as jest.Mock;

// --- Test data ---

const basePayload: SummarizeJobPayload = {
  userId: 'test-user-id',
  userEmail: 'test@example.com',
  userTier: 'pro',
  ticker: {
    symbol: 'GOOGL',
    cik: '0001652044',
    companyName: 'Alphabet Inc',
  },
  filing: {
    formType: '4',
    filingDate: '2026-02-15',
    accessionNumber: '0001652044-26-000042',
    filingUrl: 'https://www.sec.gov/test-filing',
  },
  cacheId: 'test-cache-id',
  executionContext: {
    executionId: 'test-exec-dedup',
    cronTriggerTime: '2026-02-16T00:00:00Z',
    sourceContext: 'test',
    cacheHit: false,
  },
};

// --- Helpers ---

function setupExistingSummaryMocks(opts: {
  sentToUser: boolean;
  hasDeliveryRecord: boolean;
}) {
  jest.clearAllMocks();

  mockPrisma.filingContentCache.findUnique.mockResolvedValue({
    content: '<html><body>Test Form 4 filing</body></html>',
    contentLength: 100,
    status: 'CACHED',
    fetchError: null,
    primaryDocUrl: 'https://www.sec.gov/test-doc.htm',
  });

  mockPrisma.ticker.findFirst.mockResolvedValue({
    id: 'test-ticker-id',
    preferences: null,
  });

  // First findFirst call: existing summary for this user+filing
  mockPrisma.summary.findFirst.mockResolvedValueOnce({
    id: 'existing-summary-123',
    createdAt: new Date('2026-02-15T10:00:00Z'),
    sentToUser: opts.sentToUser,
  });

  // findUnique for fetching full summary text (used in re-send path)
  mockPrisma.summary.findUnique.mockResolvedValue({
    summaryText: 'Existing summary text for re-send',
  });

  // summaryEmailDelivery.findFirst: check for delivery record
  mockPrisma.summaryEmailDelivery.findFirst.mockResolvedValue(
    opts.hasDeliveryRecord ? { id: 'delivery-456' } : null
  );

  mockPrisma.summary.update.mockResolvedValue({});
  mockPrisma.summaryEmailDelivery.create.mockResolvedValue({});
}

// --- Tests ---

describe('Duplicate email prevention', () => {
  it('should NOT re-send email when existing summary has sentToUser=true', async () => {
    setupExistingSummaryMocks({ sentToUser: true, hasDeliveryRecord: false });

    const result = await handleSummarizeCached(basePayload);

    expect(result.success).toBe(true);
    expect(result.emailSent).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('should NOT re-send email when sentToUser=true AND delivery record exists', async () => {
    setupExistingSummaryMocks({ sentToUser: true, hasDeliveryRecord: true });

    const result = await handleSummarizeCached(basePayload);

    expect(result.success).toBe(true);
    expect(result.emailSent).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('should NOT re-send when sentToUser=true but NO delivery record (Review Issue 11A)', async () => {
    // Key edge case: sentToUser=true alone is sufficient to skip.
    // Missing delivery record (data inconsistency) should NOT trigger re-send.
    setupExistingSummaryMocks({ sentToUser: true, hasDeliveryRecord: false });

    const result = await handleSummarizeCached(basePayload);

    expect(result.success).toBe(true);
    expect(result.emailSent).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('should NOT re-send email when SummaryEmailDelivery record exists even if sentToUser=false', async () => {
    // Delivery record alone is sufficient to skip.
    // sentToUser=false could mean the update failed after email was sent.
    setupExistingSummaryMocks({ sentToUser: false, hasDeliveryRecord: true });

    const result = await handleSummarizeCached(basePayload);

    expect(result.success).toBe(true);
    expect(result.emailSent).toBe(false);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('should send email when existing summary has sentToUser=false and no delivery record', async () => {
    // This is the legitimate first-send case on retry:
    // summary was created but email was never sent.
    setupExistingSummaryMocks({ sentToUser: false, hasDeliveryRecord: false });

    const result = await handleSummarizeCached(basePayload);

    expect(result.success).toBe(true);
    expect(result.emailSent).toBe(true);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it('should return success with summaryId when skipping duplicate email', async () => {
    setupExistingSummaryMocks({ sentToUser: true, hasDeliveryRecord: true });

    const result = await handleSummarizeCached(basePayload);

    expect(result.success).toBe(true);
    expect(result.summaryId).toBe('existing-summary-123');
    expect(result.cost).toBe(0);
    expect(result.summarizeDuration).toBe(0);
    expect(result.emailSent).toBe(false);
  });

  it('should log why email was skipped when dedup guard fires', async () => {
    setupExistingSummaryMocks({ sentToUser: true, hasDeliveryRecord: true });

    await handleSummarizeCached(basePayload);

    const infoLogs = mockLoggerInstance.info.mock.calls;
    const skipLog = infoLogs.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        call[0].includes('Email already delivered')
    );

    expect(skipLog).toBeDefined();
    expect(skipLog![1]).toEqual(
      expect.objectContaining({
        summaryId: 'existing-summary-123',
        sentToUser: true,
        hasDeliveryRecord: true,
      })
    );
  });
});
