/**
 * Interface tests for the First Onboarding Email module.
 *
 * Exercises the single exported `sendFirstOnboardingEmail(...)` function
 * across the cached and fallback paths, plus the shared idempotency guard.
 * The module is a deep [Onboarding]-domain module; internal scoring,
 * candidate selection, and template lookup are not tested independently —
 * only observable outcomes at the interface.
 */

const mockPrisma = {
  ticker: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
  summary: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  summaryEmailDelivery: {
    create: jest.fn(),
  },
};

jest.mock('@/lib/db/prisma', () => ({
  getPrismaClient: jest.fn(() => mockPrisma),
}));

const mockSendFilingSummaryEmail = jest.fn();
jest.mock('@/lib/email/summary-service', () => ({
  sendFilingSummaryEmail: (...args: unknown[]) =>
    mockSendFilingSummaryEmail(...args),
}));

const mockSendEmail = jest.fn();
jest.mock('@/lib/email', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

const mockGetEmailTemplate = jest.fn();
jest.mock('@/lib/email/templates', () => ({
  getEmailTemplate: (...args: unknown[]) => mockGetEmailTemplate(...args),
}));

import { sendFirstOnboardingEmail } from '@/lib/onboarding/first-email-delivery';
import { EmailType } from '@/lib/email/types';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetEmailTemplate.mockResolvedValue({
    html: '<p>fallback</p>',
    text: 'fallback',
  });
});

const mkCachedCandidate = (overrides: Record<string, unknown> = {}) => ({
  id: 'sum_a',
  filingType: '10-K',
  filingDate: new Date(),
  importance: null as string | null,
  smartSubject: null as string | null,
  summaryText: 'A normal summary',
  summaryJSON: null,
  ...overrides,
});

const mkCachedWinner = (overrides: Record<string, unknown> = {}) => ({
  id: 'sum_a',
  filingType: '10-K',
  filingDate: new Date(),
  filingUrl: 'http://e.x/10k',
  url: null,
  summaryText: 'A normal summary',
  summaryJSON: null,
  importance: null,
  smartSubject: null,
  ticker: { symbol: 'AAPL', companyName: 'Apple' },
  ...overrides,
});

const baseArgs = {
  userId: 'user_1',
  userEmail: 'a@b.com',
  recipientName: 'Wilfred',
  trackedTickers: ['AAPL', 'MSFT', 'GOOGL'],
};

// ============================================================================
// Idempotency (shared across both paths)
// ============================================================================

describe('sendFirstOnboardingEmail — idempotency', () => {
  it('returns already_sent when onboardingFirstEmailSentAt is set', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      onboardingFirstEmailSentAt: new Date('2026-01-01'),
    });
    const result = await sendFirstOnboardingEmail(baseArgs);
    expect(result).toEqual({ delivered: false, reason: 'already_sent' });
    expect(mockSendFilingSummaryEmail).not.toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});

// ============================================================================
// Cached path
// ============================================================================

describe('sendFirstOnboardingEmail — cached path', () => {
  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue({
      onboardingFirstEmailSentAt: null,
    });
  });

  it('picks a cached candidate and reports path=cached on success', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
    mockPrisma.summary.findMany.mockResolvedValue([mkCachedCandidate()]);
    mockPrisma.summary.findUnique.mockResolvedValue(mkCachedWinner());
    mockSendFilingSummaryEmail.mockResolvedValue({ success: true });

    const result = await sendFirstOnboardingEmail(baseArgs);
    expect(result.delivered).toBe(true);
    expect(result.path).toBe('cached');
    expect(result.summaryId).toBe('sum_a');
    expect(result.score).toBeGreaterThan(0);
  });

  it('persists both onboardingFirstEmailSentAt AND onboardingFirstSummaryId on cached success', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
    mockPrisma.summary.findMany.mockResolvedValue([mkCachedCandidate()]);
    mockPrisma.summary.findUnique.mockResolvedValue(mkCachedWinner());
    mockSendFilingSummaryEmail.mockResolvedValue({ success: true });

    await sendFirstOnboardingEmail(baseArgs);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user_1' },
        data: expect.objectContaining({
          onboardingFirstSummaryId: 'sum_a',
          onboardingFirstEmailSentAt: expect.any(Date),
        }),
      })
    );
  });

  it('writes SummaryEmailDelivery row tagged onboarding-best-pick', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
    mockPrisma.summary.findMany.mockResolvedValue([mkCachedCandidate()]);
    mockPrisma.summary.findUnique.mockResolvedValue(mkCachedWinner());
    mockSendFilingSummaryEmail.mockResolvedValue({ success: true });

    await sendFirstOnboardingEmail(baseArgs);
    expect(mockPrisma.summaryEmailDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          summaryId: 'sum_a',
          userId: 'user_1',
          metadata: { source: 'onboarding-best-pick' },
        }),
      })
    );
  });

  it('reports email_failed and does NOT persist idempotency marker when cached send fails', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
    mockPrisma.summary.findMany.mockResolvedValue([mkCachedCandidate()]);
    mockPrisma.summary.findUnique.mockResolvedValue(mkCachedWinner());
    mockSendFilingSummaryEmail.mockResolvedValue({
      success: false,
      error: 'rate limited',
    });

    const result = await sendFirstOnboardingEmail(baseArgs);
    expect(result.delivered).toBe(false);
    expect(result.path).toBe('cached');
    expect(result.reason).toBe('email_failed');
    expect(result.summaryId).toBe('sum_a');
    expect(result.error).toBe('rate limited');
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('swallows SummaryEmailDelivery unique-constraint failure but still reports delivered:true', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
    mockPrisma.summary.findMany.mockResolvedValue([mkCachedCandidate()]);
    mockPrisma.summary.findUnique.mockResolvedValue(mkCachedWinner());
    mockSendFilingSummaryEmail.mockResolvedValue({ success: true });
    mockPrisma.summaryEmailDelivery.create.mockRejectedValue(
      new Error('unique constraint violation')
    );

    const result = await sendFirstOnboardingEmail(baseArgs);
    expect(result.delivered).toBe(true);
    expect(result.path).toBe('cached');
  });

  it('reports internal_error on unexpected cached-path throw', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
    mockPrisma.summary.findMany.mockResolvedValue([mkCachedCandidate()]);
    mockPrisma.summary.findUnique.mockResolvedValue(mkCachedWinner());
    mockSendFilingSummaryEmail.mockRejectedValue(new Error('network blew up'));

    const result = await sendFirstOnboardingEmail(baseArgs);
    expect(result.delivered).toBe(false);
    expect(result.path).toBe('cached');
    expect(result.reason).toBe('internal_error');
    expect(result.error).toContain('network blew up');
  });

  it('picks the higher-materiality candidate when scores diverge', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
    const tenK = mkCachedCandidate({
      id: 'sum_10k',
      filingType: '10-K',
      filingDate: new Date('2025-12-01'),
    });
    const form4 = mkCachedCandidate({
      id: 'sum_form4',
      filingType: 'Form 4',
      filingDate: new Date('2026-04-30'),
    });
    mockPrisma.summary.findMany.mockResolvedValue([form4, tenK]);
    mockPrisma.summary.findUnique.mockResolvedValue(
      mkCachedWinner({
        id: 'sum_10k',
        filingType: '10-K',
        filingDate: new Date('2025-12-01'),
      })
    );
    mockSendFilingSummaryEmail.mockResolvedValue({ success: true });

    const result = await sendFirstOnboardingEmail(baseArgs);
    // 10-K materiality (100) beats Form 4 (15) even at lower recency.
    expect(result.summaryId).toBe('sum_10k');
  });

  it('breaks score ties by importance DESC NULLS LAST', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
    const filingDate = new Date('2026-04-01');
    mockPrisma.summary.findMany.mockResolvedValue([
      mkCachedCandidate({ id: 'sum_a', importance: null, filingDate }),
      mkCachedCandidate({ id: 'sum_b', importance: 'critical', filingDate }),
    ]);
    mockPrisma.summary.findUnique.mockResolvedValue(
      mkCachedWinner({ id: 'sum_b', importance: 'critical', filingDate })
    );
    mockSendFilingSummaryEmail.mockResolvedValue({ success: true });

    const result = await sendFirstOnboardingEmail(baseArgs);
    expect(result.summaryId).toBe('sum_b');
  });

  it('caps candidate query at 50 and filters to SUCCESS statuses + non-empty summary', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
    mockPrisma.summary.findMany.mockResolvedValue([]);
    await sendFirstOnboardingEmail(baseArgs);
    const call = mockPrisma.summary.findMany.mock.calls[0][0];
    expect(call.take).toBe(50);
    expect(call.where.summaryText).toEqual({ not: '' });
    expect(call.where.processingStatus.in).toEqual(
      expect.arrayContaining(['COMPLETED', 'SUCCESS', 'CACHE_HIT'])
    );
  });
});

// ============================================================================
// Fallback path
// ============================================================================

describe('sendFirstOnboardingEmail — fallback path', () => {
  beforeEach(() => {
    mockPrisma.user.findUnique.mockResolvedValue({
      onboardingFirstEmailSentAt: null,
    });
  });

  it('falls back when user has no tickers', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([]);
    mockSendEmail.mockResolvedValue({ success: true });

    const result = await sendFirstOnboardingEmail(baseArgs);
    expect(result.delivered).toBe(true);
    expect(result.path).toBe('fallback');
    expect(mockSendFilingSummaryEmail).not.toHaveBeenCalled();
    expect(mockSendEmail).toHaveBeenCalled();
  });

  it('falls back when tickers exist but no cached candidates', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'OBSCURE' }]);
    mockPrisma.summary.findMany.mockResolvedValue([]);
    mockSendEmail.mockResolvedValue({ success: true });

    const result = await sendFirstOnboardingEmail(baseArgs);
    expect(result.delivered).toBe(true);
    expect(result.path).toBe('fallback');
  });

  it('persists onboardingFirstEmailSentAt but NOT onboardingFirstSummaryId on fallback success', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([]);
    mockSendEmail.mockResolvedValue({ success: true });

    await sendFirstOnboardingEmail(baseArgs);
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user_1' },
        data: { onboardingFirstEmailSentAt: expect.any(Date) },
      })
    );
    const updateData = mockPrisma.user.update.mock.calls[0][0].data;
    expect(updateData.onboardingFirstSummaryId).toBeUndefined();
  });

  it('uses ONBOARDING_FALLBACK_NOTICE template with recipient + tickers', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([]);
    mockSendEmail.mockResolvedValue({ success: true });

    await sendFirstOnboardingEmail(baseArgs);
    expect(mockGetEmailTemplate).toHaveBeenCalledWith(
      EmailType.ONBOARDING_FALLBACK_NOTICE,
      expect.objectContaining({
        recipientName: 'Wilfred',
        trackedTickers: ['AAPL', 'MSFT', 'GOOGL'],
      })
    );
  });

  it('tags fallback email with type:onboarding-fallback-notice', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([]);
    mockSendEmail.mockResolvedValue({ success: true });

    await sendFirstOnboardingEmail(baseArgs);
    const tags = mockSendEmail.mock.calls[0][0].tags;
    expect(tags).toContain('type:onboarding-fallback-notice');
  });

  it('subject line uses first 3 tickers verbatim when ≤3', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([]);
    mockSendEmail.mockResolvedValue({ success: true });

    await sendFirstOnboardingEmail({
      ...baseArgs,
      trackedTickers: ['AAPL', 'MSFT'],
    });
    const subject = mockSendEmail.mock.calls[0][0].subject;
    expect(subject).toBe("We're watching AAPL, MSFT");
  });

  it('subject line truncates to first 3 + "+N" overflow when >3', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([]);
    mockSendEmail.mockResolvedValue({ success: true });

    await sendFirstOnboardingEmail({
      ...baseArgs,
      trackedTickers: ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'COIN'],
    });
    const subject = mockSendEmail.mock.calls[0][0].subject;
    expect(subject).toBe("We're watching AAPL, MSFT, GOOGL +2");
  });

  it('subject line falls back to generic copy when trackedTickers is empty', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([]);
    mockSendEmail.mockResolvedValue({ success: true });

    await sendFirstOnboardingEmail({
      ...baseArgs,
      trackedTickers: [],
    });
    const subject = mockSendEmail.mock.calls[0][0].subject;
    expect(subject).toBe("We're watching your tickers");
  });

  it('reports email_failed and does NOT persist idempotency marker when fallback send fails', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([]);
    mockSendEmail.mockResolvedValue({
      success: false,
      error: { message: 'rate limited', code: '429' },
    });

    const result = await sendFirstOnboardingEmail(baseArgs);
    expect(result).toEqual({
      delivered: false,
      path: 'fallback',
      reason: 'email_failed',
      error: 'rate limited',
    });
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('reports internal_error when fallback template lookup throws', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([]);
    mockGetEmailTemplate.mockRejectedValue(new Error('template explosion'));

    const result = await sendFirstOnboardingEmail(baseArgs);
    expect(result.delivered).toBe(false);
    expect(result.path).toBe('fallback');
    expect(result.reason).toBe('internal_error');
    expect(result.error).toContain('template explosion');
  });

  it('reports internal_error when fallback sendEmail throws', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([]);
    mockSendEmail.mockRejectedValue(new Error('network down'));

    const result = await sendFirstOnboardingEmail(baseArgs);
    expect(result.delivered).toBe(false);
    expect(result.path).toBe('fallback');
    expect(result.reason).toBe('internal_error');
    expect(result.error).toContain('network down');
  });
});

