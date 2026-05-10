/**
 * Phase 4 of `tasks/x-search-max-only.md`: producer-gate wiring test.
 *
 * Verifies the cron handler passes MAX-eligibility context
 * (userTier + isTrialing + trialEndsAt) into summarizeFilingWithValidation,
 * so the writer can gate web-search enrichment without re-reading the user
 * row from a separate code path.
 *
 * Why this exists: until Phase 4, the handler destructured `userTier: _userTier`
 * (deliberately ignoring it). A regression that drops these fields would
 * silently re-enable enrichment for non-Max users — exactly the bug Phase 4
 * exists to prevent. This test would have caught that regression.
 *
 * Scope: handler boundary only. Gate-ordering (tier check before PostHog flag)
 * is covered separately in __tests__/ai/summarize-enrichment-gate.test.ts.
 */

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
      error: jest.fn(),
    }),
  },
}));

const summarizeFilingWithValidationMock = jest.fn();
jest.mock('../../../lib/ai/summarize-with-validation', () => ({
  summarizeFilingWithValidation: (...args: unknown[]) =>
    summarizeFilingWithValidationMock(...args),
}));

jest.mock('../../../lib/email/summary-service', () => ({
  sendFilingSummaryEmail: jest.fn().mockResolvedValue(undefined),
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

jest.mock('../../../lib/email/form4-field-normalizer', () => ({
  CURRENT_FORM4_SCHEMA_VERSION: 1,
}));

import {
  handleSummarizeCached,
  SummarizeJobPayload,
} from '../../../lib/cron/handlers/summarize-cached-handler';

const basePayload: SummarizeJobPayload = {
  userId: 'user-tier-ctx',
  userEmail: 'tier@example.test',
  userTier: 'PRO',
  ticker: {
    symbol: 'TEST',
    cik: '0001234567',
    companyName: 'Test Company Inc',
  },
  filing: {
    formType: '8-K',
    filingDate: '2026-04-29',
    accessionNumber: '0001234567-26-000099',
    filingUrl: 'https://www.sec.gov/test',
  },
  cacheId: 'cache-tier-ctx',
  executionContext: {
    executionId: 'exec-tier-ctx',
    cronTriggerTime: '2026-04-29T00:00:00Z',
    sourceContext: 'test',
    cacheHit: false,
  },
};

const setupCommonMocks = () => {
  jest.clearAllMocks();
  summarizeFilingWithValidationMock.mockResolvedValue({
    summary: 'ok',
    summaryText: 'ok',
    summaryJSON: { summary: 'ok' },
    duration: 5,
    modelUsed: 'test-model',
    model: 'test-model',
    modelVersion: 'test-model',
    promptVersion: 'v1.0',
    inputTokens: 10,
    outputTokens: 5,
    tokensUsed: 15,
    cost: 0,
    extractorValidated: false,
  });
  mockPrisma.summaryEmailDelivery.findFirst.mockResolvedValue(null);
  mockPrisma.summaryEmailDelivery.create.mockResolvedValue({});
  mockPrisma.filingContentCache.findUnique.mockResolvedValue({
    content: '<html><body>filing</body></html>',
    contentLength: 32,
    status: 'CACHED',
    fetchError: null,
    primaryDocUrl: 'https://www.sec.gov/test/doc.htm',
  });
  mockPrisma.ticker.findFirst.mockResolvedValue({
    id: 'ticker-id',
    preferences: null,
  });
  mockPrisma.summary.findFirst.mockResolvedValue(null);
  mockPrisma.summary.create.mockResolvedValue({ id: 'created-summary-id' });
  mockPrisma.summary.update.mockResolvedValue({});
  mockPrisma.user.update.mockResolvedValue({});
};

describe('handleSummarizeCached → tier context wiring (Phase 4)', () => {
  beforeEach(() => {
    setupCommonMocks();
  });

  it('passes userTier from payload + isTrialing/trialEndsAt from DB into the writer', async () => {
    const trialEnds = new Date('2026-05-15T00:00:00Z');
    mockPrisma.user.findUnique.mockResolvedValue({
      deletedAt: null,
      isTrialing: true,
      trialEndsAt: trialEnds,
    });

    await handleSummarizeCached({ ...basePayload, userTier: 'FREE' });

    expect(summarizeFilingWithValidationMock).toHaveBeenCalledTimes(1);
    const opts = summarizeFilingWithValidationMock.mock.calls[0][1];
    expect(opts.userTier).toBe('FREE');
    expect(opts.isTrialing).toBe(true);
    expect(opts.trialEndsAt).toEqual(trialEnds);
  });

  it('passes MAX tier with no trial when user is paid MAX', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      deletedAt: null,
      isTrialing: false,
      trialEndsAt: null,
    });

    await handleSummarizeCached({ ...basePayload, userTier: 'MAX' });

    const opts = summarizeFilingWithValidationMock.mock.calls[0][1];
    expect(opts.userTier).toBe('MAX');
    expect(opts.isTrialing).toBe(false);
    expect(opts.trialEndsAt).toBeNull();
  });

  it('defaults isTrialing/trialEndsAt to safe values when DB row lacks them', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      deletedAt: null,
      // isTrialing/trialEndsAt undefined — older user rows or partial selects
    });

    await handleSummarizeCached({ ...basePayload, userTier: 'PRO' });

    const opts = summarizeFilingWithValidationMock.mock.calls[0][1];
    expect(opts.userTier).toBe('PRO');
    expect(opts.isTrialing).toBe(false);
    expect(opts.trialEndsAt).toBeNull();
  });
});
