/**
 * Unit tests for the B3 sectionizer path in summarizeFiling.
 *
 * B3 wires extractSections + buildSectionedPrompt into summarizeFiling's
 * processDocumentContent block for 10-Q / 10-K and their /A amendments.
 * These tests verify:
 *   - Throw: 10-Q / 10-K without a usable Financial Statements section throws
 *     SummarizationError with code INSUFFICIENT_FINANCIAL_SECTION.
 *   - Success: sectioned prompt is assembled and AI is called with the
 *     ## Financial Statements header present.
 *   - Non-strict form (8-K): B3 is bypassed entirely.
 *   - Minimal content (10-Q, < 500 chars): C2 throws INSUFFICIENT_CONTENT
 *     before B3 can fire.
 *
 * Mocking strategy: jest.mock factories MUST NOT reference outer `const`
 * declarations (jest.mock is hoisted — see CLAUDE.md mistake #14). All mock
 * instances are defined inline inside factories and accessed via
 * jest.requireMock() or module-level casts after the mock declarations.
 */

// ---------------------------------------------------------------------------
// Mock declarations — must come before any imports
// ---------------------------------------------------------------------------

jest.mock('@/lib/db/prisma', () => {
  const mockClient = {
    summary: {
      findUnique: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
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

// PostHog flag evaluation is private to summarize.ts (formerly
// `lib/ai/enrichment-flags.ts`, inlined into the Summarize module — see
// CONTEXT.md "Enrichment Flags"). Force every flag off via the dynamic-import
// seam so the B3 sectionizer is exercised without enrichment side effects.
jest.mock('@/lib/analytics/posthog-server', () => ({
  getServerPostHog: () => ({ getFeatureFlag: jest.fn(async () => false) }),
}));

jest.mock('@/lib/ai/web-search-context', () => ({
  getEnrichmentContext: jest.fn(async () => []),
}));

jest.mock('@/lib/ai/x-sentiment-provider', () => ({
  getXSentiment: jest.fn(async () => ({ enrichment: null, skipReason: 'test' })),
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

// Keep requiresFinancialContent real (it drives C2 + B3 routing), but stub
// the LLM-facing gate checks so tests don't need to craft elaborate
// financial-statement boilerplate content.
jest.mock('@/lib/ai/parsers/financial-content-gate', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const real = jest.requireActual('@/lib/ai/parsers/financial-content-gate');
  return {
    ...real,
    hasFinancialStatementSignal: jest.fn(() => ({ ok: true, reasons: [], signals: {} })),
    hasUsableFinancialHighlights: jest.fn(() => ({ ok: true, reasons: [], signals: {} })),
  };
});

// ---------------------------------------------------------------------------
// Imports (after mock declarations)
// ---------------------------------------------------------------------------

import { summarizeFiling, SummarizationError } from '@/lib/ai/summarize';
import { openRouterClient } from '@/lib/ai/openrouter-client';
import { monitoring } from '@/lib/monitoring';

const mockedSendMessage = openRouterClient.sendMessage as jest.Mock;
const mockedIncrementCounter = monitoring.incrementCounter as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const VALID_10Q_RESPONSE = {
  company: 'NVIDIA Corporation',
  summary: 'Strong Q1 2026 results driven by data center demand.',
  fiscalQuarter: 'Q1 2026',
  financialHighlights: [{ label: 'Revenue', value: '$44.1B', change: '+69%' }],
};

const VALID_10K_RESPONSE = {
  company: 'NVIDIA Corporation',
  summary: 'Record FY2025 results across all segments.',
  financialHighlights: [{ label: 'Revenue', value: '$130.5B', change: '+114%' }],
};

const VALID_8K_RESPONSE = {
  summary: 'Material event occurred.',
  importanceScore: 'medium',
  keyPoints: ['Event reported'],
  whatHappened: 'Company disclosed material information.',
  signalStrength: 'medium',
};

const BASE_10Q_METADATA = {
  ticker: 'NVDA',
  companyName: 'NVIDIA Corporation',
  formType: '10-Q',
};

// 10-Q content with a usable Financial Statements section (>= 100 chars body).
// Total must be > 500 chars so processDocumentContent does NOT set isMinimalContent.
const TEN_Q_WITH_FS = [
  '## Item 1. Financial Statements',
  '',
  'Revenue $44,062 million. Net income $18,775 million. Gross profit $36,957 million.',
  'X'.repeat(400), // padding to push content over 500-char minimal threshold
  '',
  "## Item 2. Management's Discussion and Analysis",
  '',
  'Strong demand across data center, gaming, and professional visualisation.',
].join('\n');

// 10-Q content WITHOUT any Financial Statements section heading
const TEN_Q_WITHOUT_FS = [
  "## Item 2. Management's Discussion and Analysis",
  '',
  'X'.repeat(600),
  '',
  'Business performed well this quarter.',
].join('\n');

// 10-K content with both Business Overview (Item 1) and Financial Statements (Item 8)
const TEN_K_WITH_SECTIONS = [
  '## Item 1. Business',
  '',
  'We design and manufacture GPUs used in data center, gaming, and automotive markets.',
  'X'.repeat(150),
  '',
  '## Item 8. Financial Statements',
  '',
  'Revenue $130.5 billion. Net income $72.9 billion. Gross margin 74.9%.',
  'Y'.repeat(150),
  '',
  "## Item 7. Management's Discussion and Analysis",
  '',
  'Annual performance was exceptionally strong.',
].join('\n');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('summarizeFiling — B3 sectionizer path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSendMessage.mockResolvedValue({
      content: JSON.stringify(VALID_10Q_RESPONSE),
      model: 'x-ai/grok-4-fast',
      usage: { inputTokens: 100, outputTokens: 50 },
      cost: { totalCost: 0.001 },
    });
  });

  // --- Throw path -----------------------------------------------------------

  it('throws SummarizationError(INSUFFICIENT_FINANCIAL_SECTION) for 10-Q without Financial Statements', async () => {
    await expect(
      summarizeFiling(TEN_Q_WITHOUT_FS, { metadata: BASE_10Q_METADATA })
    ).rejects.toMatchObject({
      name: 'SummarizationError',
      code: 'INSUFFICIENT_FINANCIAL_SECTION',
    });
  });

  it('increments no_financial_section counter on B3 failure', async () => {
    await expect(
      summarizeFiling(TEN_Q_WITHOUT_FS, { metadata: BASE_10Q_METADATA })
    ).rejects.toThrow(SummarizationError);
    expect(mockedIncrementCounter).toHaveBeenCalledWith(
      'ai.sectioned_extraction.no_financial_section',
      1
    );
  });

  // --- Success path ---------------------------------------------------------

  it('uses sectioned prompt for 10-Q with usable Financial Statements section', async () => {
    await summarizeFiling(TEN_Q_WITH_FS, { metadata: BASE_10Q_METADATA });

    expect(mockedIncrementCounter).toHaveBeenCalledWith(
      'ai.sectioned_extraction.success',
      1
    );
    // AI must have been called with the sectioned prompt body
    const [[messages]] = mockedSendMessage.mock.calls;
    expect(messages[0].content).toContain('## Financial Statements');
  });

  it('uses sectioned prompt for 10-K with Business Overview + Financial Statements', async () => {
    mockedSendMessage.mockResolvedValueOnce({
      content: JSON.stringify(VALID_10K_RESPONSE),
      model: 'x-ai/grok-4-fast',
      usage: { inputTokens: 100, outputTokens: 50 },
      cost: { totalCost: 0.001 },
    });

    await summarizeFiling(TEN_K_WITH_SECTIONS, {
      metadata: { ...BASE_10Q_METADATA, formType: '10-K' },
    });

    expect(mockedIncrementCounter).toHaveBeenCalledWith(
      'ai.sectioned_extraction.success',
      1
    );
    const [[messages]] = mockedSendMessage.mock.calls;
    expect(messages[0].content).toContain('## Financial Statements');
    expect(messages[0].content).toContain('## Business Overview');
  });

  // --- Non-strict form (8-K) -----------------------------------------------

  it('skips B3 entirely for 8-K (non-strict form)', async () => {
    mockedSendMessage.mockResolvedValueOnce({
      content: JSON.stringify(VALID_8K_RESPONSE),
      model: 'x-ai/grok-4-fast',
      usage: { inputTokens: 100, outputTokens: 50 },
      cost: { totalCost: 0.001 },
    });

    const content = 'Form 8-K Material Event notice.\n'.repeat(30); // > 500 chars, no FS headings
    await summarizeFiling(content, {
      metadata: { ticker: 'TSLA', companyName: 'Tesla Inc.', formType: '8-K' },
    });

    expect(mockedIncrementCounter).not.toHaveBeenCalledWith(
      'ai.sectioned_extraction.success',
      1
    );
    expect(mockedIncrementCounter).not.toHaveBeenCalledWith(
      'ai.sectioned_extraction.no_financial_section',
      1
    );
  });

  // --- Minimal content (C2 fires before B3) ---------------------------------

  it('throws INSUFFICIENT_CONTENT (not INSUFFICIENT_FINANCIAL_SECTION) for minimal-content 10-Q', async () => {
    const minimalContent = 'A'.repeat(100); // < 500 chars → isMinimalContent = true → C2 fires
    await expect(
      summarizeFiling(minimalContent, { metadata: BASE_10Q_METADATA })
    ).rejects.toMatchObject({
      code: 'INSUFFICIENT_CONTENT',
    });

    // B3 must not have fired
    expect(mockedIncrementCounter).not.toHaveBeenCalledWith(
      'ai.sectioned_extraction.success',
      1
    );
    expect(mockedIncrementCounter).not.toHaveBeenCalledWith(
      'ai.sectioned_extraction.no_financial_section',
      1
    );
  });
});
