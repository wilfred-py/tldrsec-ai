/**
 * Tests for cached-summary-delivery — the onboarding email ranking + send path.
 *
 * Mocks Prisma + sendFilingSummaryEmail. Covers:
 * - calculateCompositeScore (pure function — direct unit tests)
 * - pickBestSummaryForUser (two-stage select, ranking, tiebreaker)
 * - deliverFirstOnboardingEmail (idempotency, all DeliveryResult branches)
 * - deliverCachedSummaries (deprecated shim)
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

import {
  calculateCompositeScore,
  pickBestSummaryForUser,
  deliverFirstOnboardingEmail,
  deliverCachedSummaries,
  sendOnboardingFirstEmail,
} from '@/lib/onboarding/cached-summary-delivery';
import { EmailType } from '@/lib/email/types';

beforeEach(() => {
  jest.clearAllMocks();
});

// ============================================================================
// calculateCompositeScore
// ============================================================================

describe('calculateCompositeScore', () => {
  const baseInput = {
    filingType: '10-K',
    filingDate: new Date(), // today
    importance: 'high' as string | null,
    smartSubject: null,
    summaryText: null,
    summaryJSON: null,
  };

  it('importance=null contributes 0 to importance term', () => {
    const withImp = calculateCompositeScore({ ...baseInput, importance: 'high' });
    const withoutImp = calculateCompositeScore({ ...baseInput, importance: null });
    // high = 70 * 0.25 = 17.5
    expect(withImp - withoutImp).toBeCloseTo(70 * 0.25, 1);
  });

  it('importance lookup is case-insensitive', () => {
    const lower = calculateCompositeScore({ ...baseInput, importance: 'high' });
    const upper = calculateCompositeScore({ ...baseInput, importance: 'HIGH' });
    const mixed = calculateCompositeScore({ ...baseInput, importance: 'High' });
    expect(lower).toBeCloseTo(upper, 5);
    expect(lower).toBeCloseTo(mixed, 5);
  });

  it('unknown importance string contributes 0 (same as null)', () => {
    const known = calculateCompositeScore({ ...baseInput, importance: null });
    const unknown = calculateCompositeScore({
      ...baseInput,
      importance: 'totally-bogus',
    });
    // Both should yield identical scores — only importance differs and both
    // map to weight 0. Use toBeCloseTo to absorb Date.now() drift between
    // the two calls in the recency term.
    expect(known).toBeCloseTo(unknown, 5);
  });

  it('unknown filingType uses DEFAULT_MATERIALITY=20', () => {
    const known = calculateCompositeScore({ ...baseInput, filingType: '10-K' });
    const unknown = calculateCompositeScore({
      ...baseInput,
      filingType: 'BOGUS-FORM',
    });
    // 10-K=100, default=20 → diff is (100 - 20) * 0.40 = 32
    expect(known - unknown).toBeCloseTo(80 * 0.40, 1);
  });

  it('filingDate >365d ago has recency=0', () => {
    const recent = calculateCompositeScore({
      ...baseInput,
      filingDate: new Date(),
    });
    const old = calculateCompositeScore({
      ...baseInput,
      filingDate: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
    });
    // recency contributes 100 * 0.15 = 15 when fresh, 0 when old
    expect(recent - old).toBeCloseTo(15, 0);
  });

  it('future filingDate clamps to recency=100', () => {
    const today = calculateCompositeScore({
      ...baseInput,
      filingDate: new Date(),
    });
    const future = calculateCompositeScore({
      ...baseInput,
      filingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    expect(future).toBeCloseTo(today, 1);
  });

  it('analysisDepth signal contributes when summaryJSON has xSentiment', () => {
    const without = calculateCompositeScore({
      ...baseInput,
      summaryJSON: null,
    });
    const withDepth = calculateCompositeScore({
      ...baseInput,
      summaryJSON: { xSentiment: { direction: 'bullish' } },
    });
    // xSentiment bonus = 25, weighted 0.20 → +5
    expect(withDepth - without).toBeCloseTo(25 * 0.20, 1);
  });

  it('weights sum to 1.0 (sanity check via max-score scenario)', () => {
    // critical + 10-K + all depth signals + today
    const max = calculateCompositeScore({
      filingType: '10-K',
      filingDate: new Date(),
      importance: 'critical',
      smartSubject: 'subject',
      summaryText: 'x'.repeat(1000),
      summaryJSON: {
        xSentiment: { direction: 'bullish' },
        financialHighlights: [{ x: 1 }],
        dealTerms: { counterparty: 'x' },
        transactions: [{ x: 1 }],
      },
    });
    // 100*0.25 + 100*0.40 + 100*0.20 + 100*0.15 = 100
    expect(max).toBeCloseTo(100, 0);
  });
});

// ============================================================================
// pickBestSummaryForUser
// ============================================================================

describe('pickBestSummaryForUser', () => {
  const mkCandidate = (overrides: Record<string, unknown> = {}) => ({
    id: 'sum_a',
    filingType: '10-K',
    filingDate: new Date('2026-04-01'),
    importance: null as string | null,
    smartSubject: null as string | null,
    summaryText: 'A normal summary',
    summaryJSON: null,
    ...overrides,
  });

  it('returns null when user has no tickers', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([]);
    const result = await pickBestSummaryForUser('user_1');
    expect(result).toBeNull();
    expect(mockPrisma.summary.findMany).not.toHaveBeenCalled();
  });

  it('returns null when user has tickers but no candidates', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
    mockPrisma.summary.findMany.mockResolvedValue([]);
    const result = await pickBestSummaryForUser('user_1');
    expect(result).toBeNull();
    expect(mockPrisma.summary.findUnique).not.toHaveBeenCalled();
  });

  it('passes user ticker symbols to the candidate query', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([
      { symbol: 'AAPL' },
      { symbol: 'MSFT' },
    ]);
    mockPrisma.summary.findMany.mockResolvedValue([]);
    await pickBestSummaryForUser('user_1');
    const findManyArg = mockPrisma.summary.findMany.mock.calls[0][0];
    expect(findManyArg.where.ticker.symbol.in).toEqual(['AAPL', 'MSFT']);
  });

  it('respects STAGE_1_CANDIDATE_LIMIT=50', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
    mockPrisma.summary.findMany.mockResolvedValue([]);
    await pickBestSummaryForUser('user_1');
    expect(mockPrisma.summary.findMany.mock.calls[0][0].take).toBe(50);
  });

  it('only includes SUCCESS_STATUSES in candidate query', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
    mockPrisma.summary.findMany.mockResolvedValue([]);
    await pickBestSummaryForUser('user_1');
    const where = mockPrisma.summary.findMany.mock.calls[0][0].where;
    expect(where.processingStatus.in).toEqual(
      expect.arrayContaining(['COMPLETED', 'SUCCESS', 'CACHE_HIT'])
    );
  });

  it('filters out empty summaryText via WHERE clause', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
    mockPrisma.summary.findMany.mockResolvedValue([]);
    await pickBestSummaryForUser('user_1');
    const where = mockPrisma.summary.findMany.mock.calls[0][0].where;
    expect(where.summaryText).toEqual({ not: '' });
  });

  it('picks highest-scoring candidate across mixed filing types', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
    const tenK = mkCandidate({
      id: 'sum_10k',
      filingType: '10-K',
      filingDate: new Date('2025-12-01'),
    });
    const form4 = mkCandidate({
      id: 'sum_form4',
      filingType: 'Form 4',
      filingDate: new Date('2026-04-30'), // much fresher
    });
    mockPrisma.summary.findMany.mockResolvedValue([form4, tenK]);
    mockPrisma.summary.findUnique.mockResolvedValue({
      id: 'sum_10k',
      filingType: '10-K',
      filingDate: new Date('2025-12-01'),
      filingUrl: 'http://e.x/10k',
      url: null,
      summaryText: 'A normal summary',
      summaryJSON: null,
      importance: null,
      smartSubject: null,
      ticker: { symbol: 'AAPL', companyName: 'Apple' },
    });
    const result = await pickBestSummaryForUser('user_1');
    // 10-K (materiality=100) wins over Form 4 (materiality=15) despite lower recency
    expect(result?.id).toBe('sum_10k');
  });

  it('tiebreaker: importance DESC NULLS LAST when scores are equal', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
    const filingDate = new Date('2026-04-01');
    const a = mkCandidate({ id: 'sum_a', importance: null, filingDate });
    const b = mkCandidate({ id: 'sum_b', importance: 'critical', filingDate });
    // Same filingType, filingDate → only importance differs.
    mockPrisma.summary.findMany.mockResolvedValue([a, b]);
    mockPrisma.summary.findUnique.mockResolvedValue({
      id: 'sum_b',
      filingType: '10-K',
      filingDate,
      filingUrl: 'u',
      url: null,
      summaryText: 's',
      summaryJSON: null,
      importance: 'critical',
      smartSubject: null,
      ticker: { symbol: 'AAPL', companyName: 'Apple' },
    });
    const result = await pickBestSummaryForUser('user_1');
    expect(result?.id).toBe('sum_b');
  });

  it('returns null when stage-2 winner fetch returns null (race)', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
    mockPrisma.summary.findMany.mockResolvedValue([mkCandidate()]);
    mockPrisma.summary.findUnique.mockResolvedValue(null); // disappeared
    const result = await pickBestSummaryForUser('user_1');
    expect(result).toBeNull();
  });

  it('returns the winner score on the result', async () => {
    mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
    mockPrisma.summary.findMany.mockResolvedValue([
      mkCandidate({ filingType: '10-K', filingDate: new Date() }),
    ]);
    mockPrisma.summary.findUnique.mockResolvedValue({
      id: 'sum_a',
      filingType: '10-K',
      filingDate: new Date(),
      filingUrl: 'u',
      url: null,
      summaryText: 's',
      summaryJSON: null,
      importance: null,
      smartSubject: null,
      ticker: { symbol: 'AAPL', companyName: 'Apple' },
    });
    const result = await pickBestSummaryForUser('user_1');
    expect(result?.score).toBeGreaterThan(0);
  });
});

// ============================================================================
// deliverFirstOnboardingEmail
// ============================================================================

describe('deliverFirstOnboardingEmail', () => {
  const mkWinner = () => ({
    id: 'sum_winner',
    filingType: '10-K',
    filingDate: new Date(),
    importance: null,
    smartSubject: null,
    summaryText: 'A summary',
    summaryJSON: null,
  });

  const mkUnique = () => ({
    id: 'sum_winner',
    filingType: '10-K',
    filingDate: new Date(),
    filingUrl: 'http://e.x/10k',
    url: null,
    summaryText: 'A summary',
    summaryJSON: null,
    importance: null,
    smartSubject: null,
    ticker: { symbol: 'AAPL', companyName: 'Apple' },
  });

  it('returns already_sent when onboardingFirstEmailSentAt is set', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      onboardingFirstEmailSentAt: new Date('2026-01-01'),
    });
    const result = await deliverFirstOnboardingEmail('user_1', 'a@b.com');
    expect(result).toEqual({ delivered: false, reason: 'already_sent' });
    expect(mockSendFilingSummaryEmail).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('returns no_tickers when user has zero tickers', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      onboardingFirstEmailSentAt: null,
    });
    mockPrisma.ticker.findMany.mockResolvedValue([]);
    mockPrisma.ticker.count.mockResolvedValue(0);
    const result = await deliverFirstOnboardingEmail('user_1', 'a@b.com');
    expect(result.delivered).toBe(false);
    expect(result.reason).toBe('no_tickers');
  });

  it('returns no_cached_summaries when tickers exist but no candidates', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      onboardingFirstEmailSentAt: null,
    });
    mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'OBSCURE' }]);
    mockPrisma.summary.findMany.mockResolvedValue([]);
    mockPrisma.ticker.count.mockResolvedValue(1);
    const result = await deliverFirstOnboardingEmail('user_1', 'a@b.com');
    expect(result.delivered).toBe(false);
    expect(result.reason).toBe('no_cached_summaries');
  });

  it('on success: sends email + persists onboardingFirstEmailSentAt + onboardingFirstSummaryId', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      onboardingFirstEmailSentAt: null,
    });
    mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
    mockPrisma.summary.findMany.mockResolvedValue([mkWinner()]);
    mockPrisma.summary.findUnique.mockResolvedValue(mkUnique());
    mockSendFilingSummaryEmail.mockResolvedValue({ success: true });

    const result = await deliverFirstOnboardingEmail('user_1', 'a@b.com');
    expect(result.delivered).toBe(true);
    expect(result.summaryId).toBe('sum_winner');
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user_1' },
        data: expect.objectContaining({
          onboardingFirstSummaryId: 'sum_winner',
          onboardingFirstEmailSentAt: expect.any(Date),
        }),
      })
    );
  });

  it('on success: writes SummaryEmailDelivery row with onboarding-best-pick source', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      onboardingFirstEmailSentAt: null,
    });
    mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
    mockPrisma.summary.findMany.mockResolvedValue([mkWinner()]);
    mockPrisma.summary.findUnique.mockResolvedValue(mkUnique());
    mockSendFilingSummaryEmail.mockResolvedValue({ success: true });

    await deliverFirstOnboardingEmail('user_1', 'a@b.com');
    expect(mockPrisma.summaryEmailDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          summaryId: 'sum_winner',
          userId: 'user_1',
          metadata: { source: 'onboarding-best-pick' },
        }),
      })
    );
  });

  it('returns email_failed when sendFilingSummaryEmail returns success:false', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      onboardingFirstEmailSentAt: null,
    });
    mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
    mockPrisma.summary.findMany.mockResolvedValue([mkWinner()]);
    mockPrisma.summary.findUnique.mockResolvedValue(mkUnique());
    mockSendFilingSummaryEmail.mockResolvedValue({
      success: false,
      error: 'rate limited',
    });

    const result = await deliverFirstOnboardingEmail('user_1', 'a@b.com');
    expect(result).toEqual({
      delivered: false,
      reason: 'email_failed',
      summaryId: 'sum_winner',
      error: 'rate limited',
    });
    // Critical: User row NOT updated when send fails
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });

  it('swallows SummaryEmailDelivery.create unique-constraint failure', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      onboardingFirstEmailSentAt: null,
    });
    mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
    mockPrisma.summary.findMany.mockResolvedValue([mkWinner()]);
    mockPrisma.summary.findUnique.mockResolvedValue(mkUnique());
    mockSendFilingSummaryEmail.mockResolvedValue({ success: true });
    mockPrisma.summaryEmailDelivery.create.mockRejectedValue(
      new Error('unique constraint violation')
    );

    const result = await deliverFirstOnboardingEmail('user_1', 'a@b.com');
    // Should still report delivered:true — the email was sent
    expect(result.delivered).toBe(true);
  });

  it('returns internal_error on thrown exception', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      onboardingFirstEmailSentAt: null,
    });
    mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
    mockPrisma.summary.findMany.mockResolvedValue([mkWinner()]);
    mockPrisma.summary.findUnique.mockResolvedValue(mkUnique());
    mockSendFilingSummaryEmail.mockRejectedValue(new Error('network blew up'));

    const result = await deliverFirstOnboardingEmail('user_1', 'a@b.com');
    expect(result.delivered).toBe(false);
    expect(result.reason).toBe('internal_error');
    expect(result.error).toContain('network blew up');
  });
});

// ============================================================================
// deliverCachedSummaries (deprecated shim)
// ============================================================================

describe('deliverCachedSummaries (deprecated shim)', () => {
  it('translates {delivered: true} → {delivered: 1}', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      onboardingFirstEmailSentAt: null,
    });
    mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
    mockPrisma.summary.findMany.mockResolvedValue([
      {
        id: 'sum_a',
        filingType: '10-K',
        filingDate: new Date(),
        importance: null,
        smartSubject: null,
        summaryText: 's',
        summaryJSON: null,
      },
    ]);
    mockPrisma.summary.findUnique.mockResolvedValue({
      id: 'sum_a',
      filingType: '10-K',
      filingDate: new Date(),
      filingUrl: 'u',
      url: null,
      summaryText: 's',
      summaryJSON: null,
      importance: null,
      smartSubject: null,
      ticker: { symbol: 'AAPL', companyName: 'Apple' },
    });
    mockSendFilingSummaryEmail.mockResolvedValue({ success: true });

    const result = await deliverCachedSummaries('user_1', 'a@b.com', 'Wilfred');
    expect(result).toEqual({ delivered: 1 });
  });

  it('translates {delivered: false, reason: X} → {delivered: 0, reason: X}', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      onboardingFirstEmailSentAt: new Date(),
    });
    const result = await deliverCachedSummaries('user_1', 'a@b.com', 'Wilfred');
    expect(result).toEqual({ delivered: 0, reason: 'already_sent' });
  });
});

// ============================================================================
// sendOnboardingFirstEmail (orchestrator: cached path + long-tail fallback)
// ============================================================================

describe('sendOnboardingFirstEmail', () => {
  const baseArgs = {
    userId: 'user_1',
    email: 'a@b.com',
    recipientName: 'Wilfred',
    trackedTickers: ['AAPL', 'MSFT', 'GOOGL'],
  };

  beforeEach(() => {
    mockGetEmailTemplate.mockResolvedValue({
      html: '<p>fallback</p>',
      text: 'fallback',
    });
  });

  describe('cached-summary happy path', () => {
    it('returns the cached delivery result when a winner is found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        onboardingFirstEmailSentAt: null,
      });
      mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
      mockPrisma.summary.findMany.mockResolvedValue([
        {
          id: 'sum_a',
          filingType: '10-K',
          filingDate: new Date(),
          importance: 'high',
          smartSubject: null,
          summaryText: 's',
          summaryJSON: null,
        },
      ]);
      mockPrisma.summary.findUnique.mockResolvedValue({
        id: 'sum_a',
        filingType: '10-K',
        filingDate: new Date(),
        filingUrl: 'u',
        url: null,
        summaryText: 's',
        summaryJSON: null,
        importance: 'high',
        smartSubject: null,
        ticker: { symbol: 'AAPL', companyName: 'Apple' },
      });
      mockSendFilingSummaryEmail.mockResolvedValue({ success: true });

      const result = await sendOnboardingFirstEmail(baseArgs);
      expect(result.delivered).toBe(true);
      expect(result.summaryId).toBe('sum_a');
      // Fallback path never invoked when cached path delivered.
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(mockGetEmailTemplate).not.toHaveBeenCalled();
    });
  });

  describe('fallback branch', () => {
    beforeEach(() => {
      mockPrisma.user.findUnique.mockResolvedValue({
        onboardingFirstEmailSentAt: null,
      });
      mockSendEmail.mockResolvedValue({ success: true });
    });

    it('falls back when no cached summaries exist across the user tickers', async () => {
      // User has tickers but no Summary rows match.
      mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
      mockPrisma.summary.findMany.mockResolvedValue([]);
      mockPrisma.ticker.count.mockResolvedValue(1);

      const result = await sendOnboardingFirstEmail(baseArgs);
      expect(result.delivered).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      expect(mockGetEmailTemplate).toHaveBeenCalledWith(
        EmailType.ONBOARDING_FALLBACK_NOTICE,
        expect.objectContaining({
          recipientName: 'Wilfred',
          trackedTickers: ['AAPL', 'MSFT', 'GOOGL'],
        })
      );
      // Cached-summary email sender never called for fallback.
      expect(mockSendFilingSummaryEmail).not.toHaveBeenCalled();
    });

    it('falls back when the user has no tickers at all', async () => {
      mockPrisma.ticker.findMany.mockResolvedValue([]);
      mockPrisma.ticker.count.mockResolvedValue(0);

      const result = await sendOnboardingFirstEmail({
        ...baseArgs,
        trackedTickers: [],
      });
      expect(result.delivered).toBe(true);
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
      // No-ticker case still falls back; subject uses the generic copy.
      const sentSubject = (mockSendEmail.mock.calls[0][0] as { subject: string })
        .subject;
      expect(sentSubject).toBe("We're watching your tickers");
    });

    it('truncates fallback subject to first 3 tickers + overflow when >3', async () => {
      mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
      mockPrisma.summary.findMany.mockResolvedValue([]);
      mockPrisma.ticker.count.mockResolvedValue(1);

      await sendOnboardingFirstEmail({
        ...baseArgs,
        trackedTickers: ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'COIN'],
      });
      const sentSubject = (mockSendEmail.mock.calls[0][0] as { subject: string })
        .subject;
      expect(sentSubject).toBe("We're watching AAPL, MSFT, GOOGL +2");
    });

    it('tags the fallback email type:onboarding-fallback-notice', async () => {
      mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
      mockPrisma.summary.findMany.mockResolvedValue([]);
      mockPrisma.ticker.count.mockResolvedValue(1);

      await sendOnboardingFirstEmail(baseArgs);
      const tags = (
        mockSendEmail.mock.calls[0][0] as { tags?: string[] }
      ).tags;
      expect(tags).toContain('type:onboarding-fallback-notice');
    });

    it('marks onboardingFirstEmailSentAt after successful fallback send', async () => {
      mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
      mockPrisma.summary.findMany.mockResolvedValue([]);
      mockPrisma.ticker.count.mockResolvedValue(1);

      await sendOnboardingFirstEmail(baseArgs);
      // Cached path's update is never called; fallback path's update is.
      const updateCalls = mockPrisma.user.update.mock.calls;
      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0][0]).toEqual(
        expect.objectContaining({
          where: { id: 'user_1' },
          data: { onboardingFirstEmailSentAt: expect.any(Date) },
        })
      );
    });

    it('does NOT set onboardingFirstSummaryId on the fallback path', async () => {
      mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
      mockPrisma.summary.findMany.mockResolvedValue([]);
      mockPrisma.ticker.count.mockResolvedValue(1);

      await sendOnboardingFirstEmail(baseArgs);
      const updateData = mockPrisma.user.update.mock.calls[0][0].data;
      expect(updateData.onboardingFirstSummaryId).toBeUndefined();
    });

    it('returns email_failed when the fallback send returns success:false', async () => {
      mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
      mockPrisma.summary.findMany.mockResolvedValue([]);
      mockPrisma.ticker.count.mockResolvedValue(1);
      mockSendEmail.mockResolvedValue({
        success: false,
        error: { message: 'rate limited', code: '429' },
      });

      const result = await sendOnboardingFirstEmail(baseArgs);
      expect(result.delivered).toBe(false);
      expect(result.reason).toBe('email_failed');
      expect(result.error).toBe('rate limited');
      // User row not updated when send fails.
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('returns internal_error when the fallback template throws', async () => {
      mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
      mockPrisma.summary.findMany.mockResolvedValue([]);
      mockPrisma.ticker.count.mockResolvedValue(1);
      mockGetEmailTemplate.mockRejectedValue(new Error('template explosion'));

      const result = await sendOnboardingFirstEmail(baseArgs);
      expect(result.delivered).toBe(false);
      expect(result.reason).toBe('internal_error');
      expect(result.error).toContain('template explosion');
    });
  });

  describe('idempotency', () => {
    it('returns already_sent from the cached path without invoking fallback', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        onboardingFirstEmailSentAt: new Date('2026-01-01'),
      });
      const result = await sendOnboardingFirstEmail(baseArgs);
      expect(result.delivered).toBe(false);
      expect(result.reason).toBe('already_sent');
      expect(mockSendEmail).not.toHaveBeenCalled();
      expect(mockSendFilingSummaryEmail).not.toHaveBeenCalled();
    });
  });

  describe('passthrough of non-fallback failures', () => {
    it('propagates email_failed from the cached path without falling back', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        onboardingFirstEmailSentAt: null,
      });
      mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
      mockPrisma.summary.findMany.mockResolvedValue([
        {
          id: 'sum_a',
          filingType: '10-K',
          filingDate: new Date(),
          importance: null,
          smartSubject: null,
          summaryText: 's',
          summaryJSON: null,
        },
      ]);
      mockPrisma.summary.findUnique.mockResolvedValue({
        id: 'sum_a',
        filingType: '10-K',
        filingDate: new Date(),
        filingUrl: 'u',
        url: null,
        summaryText: 's',
        summaryJSON: null,
        importance: null,
        smartSubject: null,
        ticker: { symbol: 'AAPL', companyName: 'Apple' },
      });
      mockSendFilingSummaryEmail.mockResolvedValue({
        success: false,
        error: 'resend down',
      });

      const result = await sendOnboardingFirstEmail(baseArgs);
      expect(result.delivered).toBe(false);
      expect(result.reason).toBe('email_failed');
      // Fallback NOT triggered — email_failed is not in the fallback-eligible set.
      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('propagates internal_error from the cached path without falling back', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        onboardingFirstEmailSentAt: null,
      });
      mockPrisma.ticker.findMany.mockResolvedValue([{ symbol: 'AAPL' }]);
      mockPrisma.summary.findMany.mockResolvedValue([
        {
          id: 'sum_a',
          filingType: '10-K',
          filingDate: new Date(),
          importance: null,
          smartSubject: null,
          summaryText: 's',
          summaryJSON: null,
        },
      ]);
      mockPrisma.summary.findUnique.mockResolvedValue({
        id: 'sum_a',
        filingType: '10-K',
        filingDate: new Date(),
        filingUrl: 'u',
        url: null,
        summaryText: 's',
        summaryJSON: null,
        importance: null,
        smartSubject: null,
        ticker: { symbol: 'AAPL', companyName: 'Apple' },
      });
      mockSendFilingSummaryEmail.mockRejectedValue(new Error('boom'));

      const result = await sendOnboardingFirstEmail(baseArgs);
      expect(result.delivered).toBe(false);
      expect(result.reason).toBe('internal_error');
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });
});
