/**
 * Wire-up integration test for the post-parse grounding validators
 * (PR 1: ticker-grounding + why-it-matters).
 *
 * Asserts the order and effect of the validators when summarizeFiling
 * receives an AI response that contaminates whyItMatters with a foreign
 * ticker. The persisted summaryJSON must have whyItMatters absent and the
 * monitoring counter must have fired. Snapshots the wire-up so future
 * refactors don't silently drop these calls.
 */

import { summarizeFiling } from '@/lib/ai/summarize';
import { openRouterClient } from '@/lib/ai/openrouter-client';

jest.mock('@/lib/db/prisma', () => {
  const mockDb = new Map<string, any>();
  const mockClient = {
    summary: {
      create: jest.fn(async (args: any) => {
        const id = `summary-${Date.now()}-${Math.random()}`;
        const record = { id, ...args.data, createdAt: new Date(), updatedAt: new Date() };
        mockDb.set(id, record);
        return record;
      }),
      findUnique: jest.fn(async (args: any) => mockDb.get(args.where.id) || null),
      update: jest.fn(async (args: any) => {
        const existing = mockDb.get(args.where.id);
        if (!existing) throw new Error('Record not found');
        const updated = { ...existing, ...args.data, updatedAt: new Date() };
        mockDb.set(args.where.id, updated);
        return updated;
      }),
    },
    secFiling: { findUnique: jest.fn(async () => null) },
  };
  return {
    prisma: mockClient,
    getPrismaClient: jest.fn(() => mockClient),
    __mockDb: mockDb,
  };
});

jest.mock('@/lib/ai/openrouter-client', () => ({
  openRouterClient: { sendMessage: jest.fn() },
}));

jest.mock('@/lib/monitoring', () => ({
  monitoring: {
    incrementCounter: jest.fn(),
    recordTiming: jest.fn(),
    recordMetric: jest.fn(),
  },
}));

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

const { getPrismaClient, __mockDb } = require('@/lib/db/prisma');
const { monitoring } = require('@/lib/monitoring');
const prisma = getPrismaClient();

function mockOpenRouterResponse(data: Record<string, unknown>) {
  (openRouterClient.sendMessage as jest.Mock).mockResolvedValue({
    content: JSON.stringify(data),
    model: 'x-ai/grok-beta',
    usage: { inputTokens: 1000, outputTokens: 500 },
    cost: { totalCost: 0.01 },
  });
}

async function createTestSummary(): Promise<string> {
  const id = `summary-${Date.now()}-${Math.random()}`;
  __mockDb.set(id, {
    id,
    tickerId: 'jpm-ticker',
    filingType: '8-K',
    processingStatus: 'PENDING',
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return id;
}

describe('summarizeFiling — post-parse grounding wire-up', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __mockDb.clear();
    delete process.env.DISABLE_TICKER_GROUNDING;
    delete process.env.DISABLE_WHY_IT_MATTERS_GROUNDING;
  });

  const filingContent = `
    Form 8-K Current Report
    Item 7.01 Regulation FD Disclosure
    JPMorgan Chase & Co. issued a press release on capital allocation.
    The release reaffirms 2026 outlook and discusses the firm's competitive position.
  `;

  it('redacts whyItMatters when AI emits a foreign ticker (TSLA in JPM filing)', async () => {
    const summaryId = await createTestSummary();
    mockOpenRouterResponse({
      company: 'JPMorgan Chase & Co.',
      summary: 'JPMorgan reaffirmed 2026 capital outlook in an Item 7.01 disclosure.',
      eventType: 'Regulation FD Disclosure',
      keyHighlights: ['Reaffirmed 2026 outlook', 'Discussed competitive position'],
      sentiment: 'neutral',
      itemNumbers: ['7.01'],
      whyItMatters: 'This release positions TSLA management to defend market share against rivals.',
      headline: 'JPM reaffirms 2026 capital allocation outlook',
    });

    await summarizeFiling(filingContent, {
      summaryId,
      metadata: { ticker: 'JPM', companyName: 'JPMorgan Chase & Co.', formType: '8-K' },
      // MAX tier prevents the producer-gate (Phase 4 of x-search-max-only)
      // from stripping whyItMatters before the grounding assertions run.
      userTier: 'MAX',
      isTrialing: false,
    });

    const stored = await prisma.summary.findUnique({ where: { id: summaryId } });
    const json = stored?.summaryJSON as Record<string, unknown> | undefined;
    expect(json).toBeDefined();
    expect(json).not.toHaveProperty('whyItMatters');
    // headline is grounded (mentions JPM, no foreign ticker), should be preserved.
    expect(json?.headline).toBe('JPM reaffirms 2026 capital allocation outlook');
    expect(monitoring.incrementCounter).toHaveBeenCalledWith(
      'ai.ticker_grounding_violation',
      1,
      expect.objectContaining({ field: 'whyItMatters' }),
    );
  });

  it('drops whyItMatters when it restates the headline (why-it-matters validator runs)', async () => {
    const summaryId = await createTestSummary();
    mockOpenRouterResponse({
      company: 'JPMorgan Chase & Co.',
      summary: 'JPMorgan reaffirmed 2026 capital outlook in an Item 7.01 disclosure.',
      eventType: 'Regulation FD Disclosure',
      keyHighlights: ['Reaffirmed 2026 outlook'],
      sentiment: 'neutral',
      itemNumbers: ['7.01'],
      // Verbatim restatement of the headline (>10 consecutive words).
      headline: 'JPM reaffirms its 2026 capital allocation outlook in a Regulation FD disclosure today.',
      whyItMatters: 'JPM reaffirms its 2026 capital allocation outlook in a Regulation FD disclosure today, signaling confidence.',
    });

    await summarizeFiling(filingContent, {
      summaryId,
      metadata: { ticker: 'JPM', companyName: 'JPMorgan Chase & Co.', formType: '8-K' },
      // MAX tier prevents the producer-gate (Phase 4 of x-search-max-only)
      // from stripping whyItMatters before the grounding assertions run.
      userTier: 'MAX',
      isTrialing: false,
    });

    const stored = await prisma.summary.findUnique({ where: { id: summaryId } });
    const json = stored?.summaryJSON as Record<string, unknown> | undefined;
    expect(json).not.toHaveProperty('whyItMatters');
    expect(monitoring.incrementCounter).toHaveBeenCalledWith('ai.why_it_matters_violation', 1);
  });

  it('preserves grounded whyItMatters when no contamination or restatement', async () => {
    const summaryId = await createTestSummary();
    const groundedWhy = 'Capital ratios held above regulatory minimums for the third straight quarter, expanding buyback flexibility.';
    mockOpenRouterResponse({
      company: 'JPMorgan Chase & Co.',
      summary: 'JPMorgan reaffirmed 2026 capital outlook in an Item 7.01 disclosure.',
      eventType: 'Regulation FD Disclosure',
      keyHighlights: ['Reaffirmed 2026 outlook'],
      sentiment: 'neutral',
      itemNumbers: ['7.01'],
      headline: 'JPM reaffirms 2026 capital allocation outlook',
      whyItMatters: groundedWhy,
    });

    await summarizeFiling(filingContent, {
      summaryId,
      metadata: { ticker: 'JPM', companyName: 'JPMorgan Chase & Co.', formType: '8-K' },
      // MAX tier prevents the producer-gate (Phase 4 of x-search-max-only)
      // from stripping whyItMatters before the grounding assertions run.
      userTier: 'MAX',
      isTrialing: false,
    });

    const stored = await prisma.summary.findUnique({ where: { id: summaryId } });
    const json = stored?.summaryJSON as Record<string, unknown> | undefined;
    expect(json?.whyItMatters).toBe(groundedWhy);
    expect(monitoring.incrementCounter).not.toHaveBeenCalledWith(
      'ai.ticker_grounding_violation',
      expect.anything(),
      expect.anything(),
    );
    expect(monitoring.incrementCounter).not.toHaveBeenCalledWith('ai.why_it_matters_violation', expect.anything());
  });

  it('honors DISABLE_TICKER_GROUNDING=1 kill switch', async () => {
    process.env.DISABLE_TICKER_GROUNDING = '1';
    const summaryId = await createTestSummary();
    const contaminated = 'This release positions TSLA management to defend market share against rivals.';
    mockOpenRouterResponse({
      company: 'JPMorgan Chase & Co.',
      summary: 'JPMorgan reaffirmed 2026 capital outlook in an Item 7.01 disclosure.',
      eventType: 'Regulation FD Disclosure',
      keyHighlights: ['Reaffirmed 2026 outlook'],
      sentiment: 'neutral',
      itemNumbers: ['7.01'],
      headline: 'JPM reaffirms 2026 capital allocation outlook',
      whyItMatters: contaminated,
    });

    await summarizeFiling(filingContent, {
      summaryId,
      metadata: { ticker: 'JPM', companyName: 'JPMorgan Chase & Co.', formType: '8-K' },
      // MAX tier prevents the producer-gate (Phase 4 of x-search-max-only)
      // from stripping whyItMatters before the grounding assertions run.
      userTier: 'MAX',
      isTrialing: false,
    });

    const stored = await prisma.summary.findUnique({ where: { id: summaryId } });
    const json = stored?.summaryJSON as Record<string, unknown> | undefined;
    // Ticker grounding bypassed; whyItMatters survives the ticker check (the
    // why-it-matters check is independent and may still pass since this string
    // doesn't restate the headline).
    expect(json?.whyItMatters).toBe(contaminated);
    expect(monitoring.incrementCounter).not.toHaveBeenCalledWith(
      'ai.ticker_grounding_violation',
      expect.anything(),
      expect.anything(),
    );
  });

  it('honors DISABLE_WHY_IT_MATTERS_GROUNDING=1 kill switch', async () => {
    process.env.DISABLE_WHY_IT_MATTERS_GROUNDING = '1';
    const summaryId = await createTestSummary();
    // Restatement that would normally be dropped by the why-it-matters check
    // (10+ consecutive overlapping words) but contains no foreign ticker
    // tokens — so the independent ticker validator will not redact.
    const restatement = 'jpmorgan reaffirmed its 2026 capital allocation outlook with confidence in this filing';
    mockOpenRouterResponse({
      company: 'JPMorgan Chase & Co.',
      summary: 'jpmorgan reaffirmed its 2026 capital allocation outlook in a regulation filing.',
      eventType: 'Regulation FD Disclosure',
      keyHighlights: ['Reaffirmed 2026 outlook'],
      sentiment: 'neutral',
      itemNumbers: ['7.01'],
      headline: 'jpmorgan reaffirmed its 2026 capital allocation outlook with confidence in this filing today.',
      whyItMatters: `${restatement}, signaling continued shareholder return discipline.`,
    });

    await summarizeFiling(filingContent, {
      summaryId,
      metadata: { ticker: 'JPM', companyName: 'JPMorgan Chase & Co.', formType: '8-K' },
      // MAX tier prevents the producer-gate (Phase 4 of x-search-max-only)
      // from stripping whyItMatters before the grounding assertions run.
      userTier: 'MAX',
      isTrialing: false,
    });

    const stored = await prisma.summary.findUnique({ where: { id: summaryId } });
    const json = stored?.summaryJSON as Record<string, unknown> | undefined;
    // why-it-matters check is disabled, so the restatement survives.
    expect(json?.whyItMatters).toContain('signaling continued shareholder return discipline');
    expect(monitoring.incrementCounter).not.toHaveBeenCalledWith('ai.why_it_matters_violation', expect.anything());
  });
});
