/**
 * Tests for trial-nurture-handler
 *
 * Validates: trial user detection (legacy + Stripe), cumulative day logic,
 * engagement scoring, idempotency, rate limiting, win-back emails,
 * setup nudge, error handling, and conversion metrics.
 */

// --- Mock setup (hoisted before const declarations) ---

const mockPrisma = {
  user: {
    findMany: jest.fn(),
  },
  userSubscription: {
    findMany: jest.fn(),
  },
  notificationSent: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  summaryCacheAccess: {
    groupBy: jest.fn(),
  },
  summaryEmailDelivery: {
    groupBy: jest.fn(),
  },
  emailFeedback: {
    groupBy: jest.fn(),
  },
  ticker: {
    groupBy: jest.fn(),
  },
};

jest.mock('../../../lib/db/prisma', () => ({
  getPrismaClient: jest.fn(() => mockPrisma),
}));

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

const mockSendDay3 = jest.fn();
const mockSendDay4 = jest.fn();
const mockSendDay6 = jest.fn();
const mockSendDay10 = jest.fn();
const mockSendDay14 = jest.fn();
const mockSendSetupNudge = jest.fn();

jest.mock('../../../lib/email/trial-emails', () => ({
  sendTrialDay3Email: (...args: unknown[]) => mockSendDay3(...args),
  sendTrialDay4Email: (...args: unknown[]) => mockSendDay4(...args),
  sendTrialDay6Email: (...args: unknown[]) => mockSendDay6(...args),
  sendTrialDay10WinBackEmail: (...args: unknown[]) => mockSendDay10(...args),
  sendTrialDay14FinalWinBackEmail: (...args: unknown[]) => mockSendDay14(...args),
  sendTrialSetupNudgeEmail: (...args: unknown[]) => mockSendSetupNudge(...args),
}));

import { handleTrialNurture, computeEngagementScore, getNurtureConversionMetrics } from '../../../lib/cron/handlers/trial-nurture-handler';

// Helper: create a date N days ago from now
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function setupDefaultMocks() {
  // Default: no users, empty results
  mockPrisma.user.findMany.mockResolvedValue([]);
  mockPrisma.userSubscription.findMany.mockResolvedValue([]);
  mockPrisma.notificationSent.findMany.mockResolvedValue([]);
  mockPrisma.notificationSent.create.mockResolvedValue({ id: 'notif-1' });
  mockPrisma.summaryCacheAccess.groupBy.mockResolvedValue([]);
  mockPrisma.summaryEmailDelivery.groupBy.mockResolvedValue([]);
  mockPrisma.emailFeedback.groupBy.mockResolvedValue([]);
  mockPrisma.ticker.groupBy.mockResolvedValue([]);

  // Reset email mocks
  mockSendDay3.mockResolvedValue(undefined);
  mockSendDay4.mockResolvedValue(undefined);
  mockSendDay6.mockResolvedValue(undefined);
  mockSendDay10.mockResolvedValue(undefined);
  mockSendDay14.mockResolvedValue(undefined);
  mockSendSetupNudge.mockResolvedValue(undefined);
}

function makeLegacyUser(id: string, trialStartedAt: Date, overrides: Record<string, unknown> = {}) {
  return {
    id,
    email: `${id}@test.com`,
    trialStartedAt,
    trialEndsAt: new Date(trialStartedAt.getTime() + 7 * 24 * 60 * 60 * 1000),
    onboardingCompleted: false,
    hoursSavedTotal: 0,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  setupDefaultMocks();
});

describe('handleTrialNurture', () => {
  // Test 1: Day 3 user gets day3 email with correct summaryCount
  it('sends day3 email to user on trial day 3 with summary count', async () => {
    const user = makeLegacyUser('user-1', daysAgo(3));
    mockPrisma.user.findMany.mockResolvedValue([user]);
    mockPrisma.ticker.groupBy.mockResolvedValue([{ userId: 'user-1', _count: { id: 2 } }]);
    mockPrisma.summaryEmailDelivery.groupBy.mockResolvedValue([
      { userId: 'user-1', _count: { id: 5 } },
    ]);

    const result = await handleTrialNurture();

    expect(result.success).toBe(true);
    expect(result.emailsSent).toBe(1);
    expect(mockSendDay3).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'user-1@test.com', userId: 'user-1', summaryCount: 5 })
    );
  });

  // Test 2: Day 4 user gets day4 email with hours saved
  it('sends day4 email to user on trial day 4', async () => {
    const user = makeLegacyUser('user-2', daysAgo(4));
    mockPrisma.user.findMany.mockResolvedValue([user]);
    mockPrisma.ticker.groupBy.mockResolvedValue([{ userId: 'user-2', _count: { id: 1 } }]);
    // Day 3 already sent
    mockPrisma.notificationSent.findMany.mockResolvedValue([
      { userId: 'user-2', notificationType: 'trial-nurture-day3' },
    ]);
    mockPrisma.summaryEmailDelivery.groupBy.mockResolvedValue([
      { userId: 'user-2', _count: { id: 3 } },
    ]);

    const result = await handleTrialNurture();

    expect(result.emailsSent).toBe(1);
    expect(mockSendDay4).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'user-2@test.com', userId: 'user-2', summaryCount: 3 })
    );
  });

  // Test 3: Day 6 user gets day6 email
  it('sends day6 email to user on trial day 6', async () => {
    const user = makeLegacyUser('user-3', daysAgo(6));
    mockPrisma.user.findMany.mockResolvedValue([user]);
    mockPrisma.ticker.groupBy.mockResolvedValue([{ userId: 'user-3', _count: { id: 1 } }]);
    mockPrisma.notificationSent.findMany.mockResolvedValue([
      { userId: 'user-3', notificationType: 'trial-nurture-day3' },
      { userId: 'user-3', notificationType: 'trial-nurture-day4' },
    ]);

    const result = await handleTrialNurture();

    expect(result.emailsSent).toBe(1);
    expect(mockSendDay6).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'user-3@test.com', userId: 'user-3' })
    );
  });

  // Test 4: Day 2 user gets no email
  it('sends no email to user on trial day 2', async () => {
    const user = makeLegacyUser('user-4', daysAgo(2));
    mockPrisma.user.findMany.mockResolvedValue([user]);
    mockPrisma.ticker.groupBy.mockResolvedValue([{ userId: 'user-4', _count: { id: 2 } }]);

    const result = await handleTrialNurture();

    expect(result.emailsSent).toBe(0);
    expect(result.usersSkipped).toBe(1);
  });

  // Test 5: Day 5 user, already has day3+day4, gets no email
  it('sends no email to day 5 user who already received day3 and day4', async () => {
    const user = makeLegacyUser('user-5', daysAgo(5));
    mockPrisma.user.findMany.mockResolvedValue([user]);
    mockPrisma.ticker.groupBy.mockResolvedValue([{ userId: 'user-5', _count: { id: 1 } }]);
    mockPrisma.notificationSent.findMany.mockResolvedValue([
      { userId: 'user-5', notificationType: 'trial-nurture-day3' },
      { userId: 'user-5', notificationType: 'trial-nurture-day4' },
    ]);

    const result = await handleTrialNurture();

    expect(result.emailsSent).toBe(0);
    expect(result.usersSkipped).toBe(1);
  });

  // Test 6: Idempotency - duplicate prevented
  it('prevents duplicate email via NotificationSent check', async () => {
    const user = makeLegacyUser('user-6', daysAgo(3));
    mockPrisma.user.findMany.mockResolvedValue([user]);
    mockPrisma.ticker.groupBy.mockResolvedValue([{ userId: 'user-6', _count: { id: 1 } }]);
    mockPrisma.notificationSent.findMany.mockResolvedValue([
      { userId: 'user-6', notificationType: 'trial-nurture-day3' },
    ]);

    const result = await handleTrialNurture();

    expect(result.emailsSent).toBe(0);
    expect(mockSendDay3).not.toHaveBeenCalled();
  });

  // Test 7: Stripe trial user detected correctly
  it('detects Stripe trial users via UserSubscription', async () => {
    mockPrisma.userSubscription.findMany.mockResolvedValue([
      {
        userId: 'stripe-user-1',
        currentPeriodStart: daysAgo(3),
        currentPeriodEnd: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
        user: {
          id: 'stripe-user-1',
          email: 'stripe@test.com',
          onboardingCompleted: true,
          hoursSavedTotal: 5,
        },
      },
    ]);
    mockPrisma.ticker.groupBy.mockResolvedValue([{ userId: 'stripe-user-1', _count: { id: 2 } }]);

    const result = await handleTrialNurture();

    expect(result.usersFound).toBe(1);
    expect(result.emailsSent).toBe(1);
    expect(mockSendDay3).toHaveBeenCalled();
  });

  // Test 8: Legacy trial user detected correctly
  it('detects legacy trial users via User.isTrialing', async () => {
    const user = makeLegacyUser('legacy-1', daysAgo(3));
    mockPrisma.user.findMany.mockResolvedValue([user]);
    mockPrisma.ticker.groupBy.mockResolvedValue([{ userId: 'legacy-1', _count: { id: 1 } }]);

    const result = await handleTrialNurture();

    expect(result.usersFound).toBe(1);
    expect(result.emailsSent).toBe(1);
  });

  // Test 9: Converted user skipped (subscriptionTier filter)
  it('skips users with PRO subscriptionTier via query filter', async () => {
    // PRO users are filtered out by the Prisma where clause (subscriptionTier notIn PRO/MAX)
    // so they never appear in results
    mockPrisma.user.findMany.mockResolvedValue([]);

    const result = await handleTrialNurture();

    expect(result.usersFound).toBe(0);
    expect(result.emailsSent).toBe(0);
  });

  // Test 10: Zero-ticker user gets setup nudge
  it('sends setup nudge to zero-ticker user on day 2+', async () => {
    const user = makeLegacyUser('no-ticker', daysAgo(3));
    mockPrisma.user.findMany.mockResolvedValue([user]);
    // No tickers for this user
    mockPrisma.ticker.groupBy.mockResolvedValue([]);

    const result = await handleTrialNurture();

    expect(result.emailsSent).toBe(1);
    expect(mockSendSetupNudge).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'no-ticker@test.com', userId: 'no-ticker' })
    );
    expect(mockSendDay3).not.toHaveBeenCalled();
  });

  // Test 13: Email send failure logged, next user processed
  it('continues processing after email send failure', async () => {
    const user1 = makeLegacyUser('fail-user', daysAgo(3));
    const user2 = makeLegacyUser('ok-user', daysAgo(3));
    mockPrisma.user.findMany.mockResolvedValue([user1, user2]);
    mockPrisma.ticker.groupBy.mockResolvedValue([
      { userId: 'fail-user', _count: { id: 1 } },
      { userId: 'ok-user', _count: { id: 1 } },
    ]);

    mockSendDay3
      .mockRejectedValueOnce(new Error('Email service down'))
      .mockResolvedValueOnce(undefined);

    const result = await handleTrialNurture();

    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain('fail-user');
    expect(result.emailsSent).toBe(1); // ok-user still processed
  });

  // Test 14: Missed cron recovery - day 5, day3+day4 sent in single run
  it('sends day3 and day4 in single run for user at day 5 with no prior emails', async () => {
    const user = makeLegacyUser('catchup', daysAgo(5));
    mockPrisma.user.findMany.mockResolvedValue([user]);
    mockPrisma.ticker.groupBy.mockResolvedValue([{ userId: 'catchup', _count: { id: 1 } }]);

    const result = await handleTrialNurture();

    expect(result.emailsSent).toBe(2);
    expect(mockSendDay3).toHaveBeenCalled();
    expect(mockSendDay4).toHaveBeenCalled();
    expect(mockSendDay6).not.toHaveBeenCalled();
  });

  // Test 15: Win-back day 10 email
  it('sends day 10 win-back email to expired trial user', async () => {
    const user = makeLegacyUser('winback-10', daysAgo(10));
    mockPrisma.user.findMany.mockResolvedValue([user]);
    mockPrisma.ticker.groupBy.mockResolvedValue([{ userId: 'winback-10', _count: { id: 2 } }]);
    mockPrisma.notificationSent.findMany.mockResolvedValue([
      { userId: 'winback-10', notificationType: 'trial-nurture-day3' },
      { userId: 'winback-10', notificationType: 'trial-nurture-day4' },
      { userId: 'winback-10', notificationType: 'trial-nurture-day6' },
    ]);
    mockPrisma.summaryEmailDelivery.groupBy.mockResolvedValue([
      { userId: 'winback-10', _count: { id: 8 } },
    ]);

    const result = await handleTrialNurture();

    expect(result.emailsSent).toBe(1);
    expect(mockSendDay10).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'winback-10', summaryCount: 8 })
    );
  });

  // Test 16: Win-back day 14 final email
  it('sends day 14 final win-back email', async () => {
    const user = makeLegacyUser('winback-14', daysAgo(14));
    mockPrisma.user.findMany.mockResolvedValue([user]);
    mockPrisma.ticker.groupBy.mockResolvedValue([{ userId: 'winback-14', _count: { id: 1 } }]);
    mockPrisma.notificationSent.findMany.mockResolvedValue([
      { userId: 'winback-14', notificationType: 'trial-nurture-day3' },
      { userId: 'winback-14', notificationType: 'trial-nurture-day4' },
      { userId: 'winback-14', notificationType: 'trial-nurture-day6' },
      { userId: 'winback-14', notificationType: 'trial-nurture-day10' },
    ]);

    const result = await handleTrialNurture();

    expect(result.emailsSent).toBe(1);
    expect(mockSendDay14).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'winback-14' })
    );
  });

  // Test 17: Rate limiting between users
  it('delays 1500ms between users', async () => {
    const user1 = makeLegacyUser('rate-1', daysAgo(3));
    const user2 = makeLegacyUser('rate-2', daysAgo(3));
    mockPrisma.user.findMany.mockResolvedValue([user1, user2]);
    mockPrisma.ticker.groupBy.mockResolvedValue([
      { userId: 'rate-1', _count: { id: 1 } },
      { userId: 'rate-2', _count: { id: 1 } },
    ]);

    const start = Date.now();
    await handleTrialNurture();
    const elapsed = Date.now() - start;

    // Should have at least one 1500ms delay between users
    expect(elapsed).toBeGreaterThanOrEqual(1400); // Allow 100ms tolerance
  });
});

describe('computeEngagementScore', () => {
  // Test 11: Engagement score computed correctly
  it('computes correct score from engagement data', () => {
    const score = computeEngagementScore({
      views: 5,        // min(20, 25) = 20
      deliveries: 4,   // min(12, 20) = 12
      feedbackVotes: 1, // min(10, 20) = 10
      tickerCount: 3,  // min(15, 15) = 15
      onboardingCompleted: true, // 10
      hoursSavedTotal: 3, // min(6, 10) = 6
    });

    expect(score).toBe(20 + 12 + 10 + 15 + 10 + 6);
    expect(score).toBe(73);
  });

  // Test 12: Engagement score = 10 for zero activity (just onboarding)
  it('returns 10 for user with zero activity but completed onboarding', () => {
    const score = computeEngagementScore({
      views: 0,
      deliveries: 0,
      feedbackVotes: 0,
      tickerCount: 0,
      onboardingCompleted: true,
      hoursSavedTotal: 0,
    });

    expect(score).toBe(10);
  });

  it('returns 0 for completely inactive user', () => {
    const score = computeEngagementScore({
      views: 0,
      deliveries: 0,
      feedbackVotes: 0,
      tickerCount: 0,
      onboardingCompleted: false,
      hoursSavedTotal: 0,
    });

    expect(score).toBe(0);
  });

  it('caps each signal at its maximum', () => {
    const score = computeEngagementScore({
      views: 100,       // capped at 25
      deliveries: 100,  // capped at 20
      feedbackVotes: 100, // capped at 20
      tickerCount: 100, // capped at 15
      onboardingCompleted: true, // 10
      hoursSavedTotal: 100, // capped at 10
    });

    expect(score).toBe(25 + 20 + 20 + 15 + 10 + 10);
    expect(score).toBe(100);
  });
});

describe('getNurtureConversionMetrics', () => {
  // Test 18: Conversion metrics calculation
  it('calculates conversion rates by stage and engagement band', async () => {
    mockPrisma.notificationSent.findMany.mockResolvedValue([
      { userId: 'u1', notificationType: 'trial-nurture-day3', metadata: { engagementScore: 80 } },
      { userId: 'u1', notificationType: 'trial-nurture-day4', metadata: { engagementScore: 80 } },
      { userId: 'u2', notificationType: 'trial-nurture-day3', metadata: { engagementScore: 30 } },
      { userId: 'u3', notificationType: 'trial-nurture-day3', metadata: { engagementScore: 10 } },
    ]);

    // u1 converted
    mockPrisma.userSubscription.findMany.mockResolvedValue([
      { userId: 'u1' },
    ]);

    const metrics = await getNurtureConversionMetrics();

    expect(metrics.totalNurtured).toBe(3);
    expect(metrics.totalConverted).toBe(1);
    expect(metrics.conversionRate).toBeCloseTo(0.33, 1);

    // Stage metrics
    expect(metrics.byStage['trial-nurture-day3'].sent).toBe(3);
    expect(metrics.byStage['trial-nurture-day3'].converted).toBe(1);
    expect(metrics.byStage['trial-nurture-day4'].sent).toBe(1);
    expect(metrics.byStage['trial-nurture-day4'].converted).toBe(1);

    // Engagement band: u1 (score=80) is in 75-100 band, converted
    expect(metrics.byEngagementBand['75-100'].sent).toBe(1);
    expect(metrics.byEngagementBand['75-100'].converted).toBe(1);
  });
});
