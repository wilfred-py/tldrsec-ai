/**
 * Phase 4 review item 16A: tier gate ordering test.
 *
 * Verifies that summarizeFiling checks MAX-eligibility BEFORE invoking
 * PostHog feature-flag eval (`isWhyItMattersEnabled`) or the provider
 * eligibility check (`isProviderEnabled`). Order matters because:
 *
 *   1. PostHog evaluations cost money and rate-limit budget. Calling them
 *      for non-Max users wastes that budget and pollutes the cohort metrics.
 *   2. Provider calls (web-search, x-sentiment) hit external APIs with
 *      per-request costs. Even a 1% leak past the gate would be material.
 *   3. Defense-in-depth: the email template also gates "Why it matters" by
 *      tier, but if the producer leaks enrichment into summaryJSON the
 *      database row carries it forever — visible to any code path that
 *      reads summaryJSON without re-applying the tier gate.
 *
 * The 16A change reorders the existing `if (ENRICHMENT_FORM_TYPES.has(...))`
 * branch so the tier check is the FIRST predicate. This test would have
 * failed before the change.
 */

import { summarizeFiling } from '@/lib/ai/summarize';
import { openRouterClient } from '@/lib/ai/openrouter-client';
import { isWhyItMattersEnabled, isProviderEnabled } from '@/lib/ai/enrichment-flags';
import { getEnrichmentContext } from '@/lib/ai/web-search-context';
import { getXSentiment } from '@/lib/ai/x-sentiment-provider';

jest.mock('@/lib/db/prisma', () => {
  const mockClient = {
    summary: {
      findUnique: jest.fn(async () => null),
      update: jest.fn(async () => ({})),
    },
    secFiling: {
      findUnique: jest.fn(async () => null),
    },
  };
  return {
    prisma: mockClient,
    getPrismaClient: jest.fn(() => mockClient),
  };
});

jest.mock('@/lib/ai/openrouter-client', () => ({
  openRouterClient: { sendMessage: jest.fn() },
}));

jest.mock('@/lib/ai/enrichment-flags', () => ({
  isWhyItMattersEnabled: jest.fn(),
  isProviderEnabled: jest.fn(),
  isEarningsMiniDeepDiveEnabled: jest.fn(async () => false),
}));

jest.mock('@/lib/ai/web-search-context', () => ({
  getEnrichmentContext: jest.fn(),
}));

jest.mock('@/lib/ai/x-sentiment-provider', () => ({
  getXSentiment: jest.fn(),
}));

jest.mock('@/lib/ai/historical-context', () => ({
  getHistoricalSummaries: jest.fn(async () => []),
  buildContextEnrichedPrompt: jest.fn((content) => content),
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

const mockedSendMessage = openRouterClient.sendMessage as jest.Mock;
const mockedIsWhyItMattersEnabled = isWhyItMattersEnabled as jest.Mock;
const mockedIsProviderEnabled = isProviderEnabled as jest.Mock;
const mockedGetEnrichmentContext = getEnrichmentContext as jest.Mock;
const mockedGetXSentiment = getXSentiment as jest.Mock;

// Generic AI response for an 8-K (an enrichment-eligible form type) — the AI
// path doesn't care about content, only the gate ordering does.
const VALID_8K_RESPONSE = {
  summary: 'Test 8-K summary body.',
  importanceScore: 'medium',
  keyPoints: ['Point one'],
  whatHappened: 'A material event occurred.',
  signalStrength: 'medium',
};

const ENRICHABLE_8K_CONTENT = 'Form 8-K Material Event\n'.repeat(80);

const baseMetadata = {
  ticker: 'TSLA',
  companyName: 'Tesla Inc.',
  formType: '8-K',
  accessionNumber: 'acc-gate-test',
};

describe('summarizeFiling enrichment gate (review 16A)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSendMessage.mockResolvedValue({
      content: JSON.stringify(VALID_8K_RESPONSE),
      model: 'x-ai/grok-4-fast',
      usage: { inputTokens: 100, outputTokens: 50 },
      cost: { totalCost: 0.001 },
    });
    // If anything escapes the gate, these would resolve and would be
    // observable via the call-count assertion. Default to permissive so
    // a missing gate would fail loudly.
    mockedIsWhyItMattersEnabled.mockResolvedValue(true);
    mockedIsProviderEnabled.mockResolvedValue(true);
    mockedGetEnrichmentContext.mockResolvedValue([]);
    mockedGetXSentiment.mockResolvedValue({ enrichment: null, skipReason: 'mock' });
  });

  it('skips PostHog flag + provider calls entirely for non-Max users', async () => {
    await summarizeFiling(ENRICHABLE_8K_CONTENT, {
      metadata: baseMetadata,
      userTier: 'PRO',
      isTrialing: false,
      trialEndsAt: null,
    });

    // Both enrichment branches (why-it-matters + x-sentiment) gate on tier
    // FIRST, so neither flag eval should fire for a PRO user without a
    // trial. If the gate is reordered or removed, this assertion catches it.
    expect(mockedIsWhyItMattersEnabled).not.toHaveBeenCalled();
    expect(mockedIsProviderEnabled).not.toHaveBeenCalled();
    expect(mockedGetEnrichmentContext).not.toHaveBeenCalled();
    expect(mockedGetXSentiment).not.toHaveBeenCalled();
  });

  it('skips enrichment for FREE non-trial users', async () => {
    await summarizeFiling(ENRICHABLE_8K_CONTENT, {
      metadata: baseMetadata,
      userTier: 'FREE',
      isTrialing: false,
      trialEndsAt: null,
    });
    expect(mockedIsWhyItMattersEnabled).not.toHaveBeenCalled();
    expect(mockedGetEnrichmentContext).not.toHaveBeenCalled();
    expect(mockedGetXSentiment).not.toHaveBeenCalled();
  });

  it('skips enrichment for users with no tier context (legacy callers)', async () => {
    // Admin scripts or direct service-level callers may not pass tier fields.
    // Default behavior must be safe (non-Max), not silently enriching.
    await summarizeFiling(ENRICHABLE_8K_CONTENT, {
      metadata: baseMetadata,
    });
    expect(mockedIsWhyItMattersEnabled).not.toHaveBeenCalled();
    expect(mockedGetEnrichmentContext).not.toHaveBeenCalled();
    expect(mockedGetXSentiment).not.toHaveBeenCalled();
  });

  it('runs enrichment branches for paid MAX users', async () => {
    await summarizeFiling(ENRICHABLE_8K_CONTENT, {
      metadata: baseMetadata,
      userTier: 'MAX',
      isTrialing: false,
      trialEndsAt: null,
    });
    // Why-it-matters branch fires its flag eval; x-sentiment branch fires
    // both top-level flag and provider flag (composed inside the same `if`).
    expect(mockedIsWhyItMattersEnabled).toHaveBeenCalled();
  });

  it('runs enrichment for active-trial users (Max-eligible via trial)', async () => {
    const futureTrialEnd = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await summarizeFiling(ENRICHABLE_8K_CONTENT, {
      metadata: baseMetadata,
      userTier: 'FREE',
      isTrialing: true,
      trialEndsAt: futureTrialEnd,
    });
    expect(mockedIsWhyItMattersEnabled).toHaveBeenCalled();
  });

  it('skips enrichment for users with EXPIRED trial', async () => {
    const pastTrialEnd = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await summarizeFiling(ENRICHABLE_8K_CONTENT, {
      metadata: baseMetadata,
      userTier: 'FREE',
      isTrialing: true,
      trialEndsAt: pastTrialEnd,
    });
    expect(mockedIsWhyItMattersEnabled).not.toHaveBeenCalled();
  });
});

describe('summarizeFiling defense-in-depth scrub of whyItMatters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedIsWhyItMattersEnabled.mockResolvedValue(true);
    mockedIsProviderEnabled.mockResolvedValue(true);
    mockedGetEnrichmentContext.mockResolvedValue([]);
    mockedGetXSentiment.mockResolvedValue({ enrichment: null, skipReason: 'mock' });
  });

  it('strips whyItMatters from summaryJSON when user is not Max-eligible', async () => {
    // Simulate a model hallucinating whyItMatters into the JSON. The producer
    // ran without enrichment context (gate blocked it), but the model still
    // emitted the field. Defense-in-depth must scrub it before persisting.
    mockedSendMessage.mockResolvedValue({
      content: JSON.stringify({
        ...VALID_8K_RESPONSE,
        whyItMatters: 'this should never reach a non-Max user',
      }),
      model: 'x-ai/grok-4-fast',
      usage: { inputTokens: 100, outputTokens: 50 },
      cost: { totalCost: 0.001 },
    });

    const result = await summarizeFiling(ENRICHABLE_8K_CONTENT, {
      metadata: baseMetadata,
      userTier: 'PRO',
      isTrialing: false,
      trialEndsAt: null,
    });

    expect(result.summaryJSON).toBeTruthy();
    expect(result.summaryJSON).not.toHaveProperty('whyItMatters');
  });

  // Note: a symmetric "keeps whyItMatters for Max users" test would be brittle
  // here — it depends on the mock AI response passing 8-K schema validation,
  // which is governed by `validateRequiredFields` and would silently break
  // when 8-K's required fields evolve. The gate-ordering test above already
  // proves the producer reaches the enrichment branch for Max users; the
  // scrub does not run when enrichmentApplied is true (pure boolean
  // condition). That coverage is sufficient.
});
