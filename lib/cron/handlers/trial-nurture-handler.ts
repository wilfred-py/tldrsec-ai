/**
 * Trial Nurture Handler
 *
 * Orchestrates trial nurture emails (day 3, 4, 6, 10, 14) with engagement scoring.
 * Uses cumulative day logic so missed cron runs catch up automatically.
 * Computes engagement scores from existing data (views, deliveries, feedback, tickers)
 * and stores them in NotificationSent.metadata for conversion analysis.
 *
 * Rate-limits user processing with 1500ms delay between users (matches weekly-digest pattern).
 */

import { logger } from '../../logging';
import { getPrismaClient } from '../../db/prisma';

const nurtureLogger = logger.child('trial-nurture-handler');

const USER_PROCESSING_DELAY_MS = 1500;

export interface TrialNurtureResult {
  success: boolean;
  usersFound: number;
  emailsSent: number;
  usersSkipped: number;
  errors: string[];
  durationMs: number;
}

interface TrialUser {
  id: string;
  email: string;
  trialStartedAt: Date;
  trialEndsAt: Date | null;
  onboardingCompleted: boolean;
  hoursSavedTotal: number;
  source: 'legacy' | 'stripe';
}

interface EngagementData {
  views: number;
  deliveries: number;
  feedbackVotes: number;
  tickerCount: number;
  onboardingCompleted: boolean;
  hoursSavedTotal: number;
}

type NurtureDay = 'trial-nurture-day3' | 'trial-nurture-day4' | 'trial-nurture-day6' | 'trial-nurture-day10' | 'trial-nurture-day14' | 'trial-setup-nudge';

const NURTURE_SEQUENCE: Array<{ day: number; type: NurtureDay }> = [
  { day: 3, type: 'trial-nurture-day3' },
  { day: 4, type: 'trial-nurture-day4' },
  { day: 6, type: 'trial-nurture-day6' },
  { day: 10, type: 'trial-nurture-day10' },
  { day: 14, type: 'trial-nurture-day14' },
];

function computeTrialDay(trialStartedAt: Date, now: Date): number {
  const diffMs = now.getTime() - trialStartedAt.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function computeEngagementScore(data: EngagementData): number {
  const viewPoints = Math.min(data.views * 4, 25);
  const deliveryPoints = Math.min(data.deliveries * 3, 20);
  const feedbackPoints = Math.min(data.feedbackVotes * 10, 20);
  const tickerPoints = Math.min(data.tickerCount * 5, 15);
  const onboardingPoints = data.onboardingCompleted ? 10 : 0;
  const hoursPoints = Math.min(data.hoursSavedTotal * 2, 10);

  return viewPoints + deliveryPoints + feedbackPoints + tickerPoints + onboardingPoints + hoursPoints;
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function handleTrialNurture(): Promise<TrialNurtureResult> {
  const startTime = Date.now();
  const prisma = getPrismaClient();

  const result: TrialNurtureResult = {
    success: true,
    usersFound: 0,
    emailsSent: 0,
    usersSkipped: 0,
    errors: [],
    durationMs: 0,
  };

  try {
    const now = new Date();
    const trialUsers = await findTrialUsers(prisma, now);
    result.usersFound = trialUsers.length;

    nurtureLogger.info(`Found ${trialUsers.length} trial users to process`);

    if (trialUsers.length === 0) {
      result.durationMs = Date.now() - startTime;
      return result;
    }

    const userIds = trialUsers.map(u => u.id);

    // Batch-query all engagement data (4 queries, not N+1)
    const [viewCounts, deliveryCounts, feedbackCounts, tickerCounts] = await Promise.all([
      batchQueryViews(prisma, userIds),
      batchQueryDeliveries(prisma, userIds),
      batchQueryFeedback(prisma, userIds),
      batchQueryTickers(prisma, userIds),
    ]);

    // Batch-query existing notifications to check idempotency
    const sentNotifications = await prisma.notificationSent.findMany({
      where: {
        userId: { in: userIds },
        notificationType: { in: NURTURE_SEQUENCE.map(s => s.type).concat('trial-setup-nudge') },
      },
      select: { userId: true, notificationType: true },
    });

    const sentSet = new Set(sentNotifications.map(n => `${n.userId}:${n.notificationType}`));

    // Batch-query summary counts for email content
    const summaryCounts = await batchQuerySummaryCounts(prisma, userIds);

    for (let i = 0; i < trialUsers.length; i++) {
      const user = trialUsers[i];

      try {
        const trialDay = computeTrialDay(user.trialStartedAt, now);
        const tickerCount = tickerCounts.get(user.id) || 0;

        const engagementData: EngagementData = {
          views: viewCounts.get(user.id) || 0,
          deliveries: deliveryCounts.get(user.id) || 0,
          feedbackVotes: feedbackCounts.get(user.id) || 0,
          tickerCount,
          onboardingCompleted: user.onboardingCompleted,
          hoursSavedTotal: user.hoursSavedTotal,
        };
        const engagementScore = computeEngagementScore(engagementData);
        const summaryCount = summaryCounts.get(user.id) || 0;

        // Zero-ticker users get setup nudge on day 2+
        if (tickerCount === 0 && trialDay >= 2) {
          const nudgeKey = `${user.id}:trial-setup-nudge`;
          if (!sentSet.has(nudgeKey)) {
            await sendNurtureEmail(prisma, user, 'trial-setup-nudge', trialDay, engagementScore, summaryCount);
            sentSet.add(nudgeKey);
            result.emailsSent++;
          }
          // Skip nurture sequence for zero-ticker users
          if (i < trialUsers.length - 1) await delay(USER_PROCESSING_DELAY_MS);
          continue;
        }

        // Cumulative day logic: send each email if day >= N AND not already sent
        let sentAny = false;
        for (const step of NURTURE_SEQUENCE) {
          if (trialDay >= step.day) {
            const key = `${user.id}:${step.type}`;
            if (!sentSet.has(key)) {
              await sendNurtureEmail(prisma, user, step.type, trialDay, engagementScore, summaryCount);
              sentSet.add(key);
              result.emailsSent++;
              sentAny = true;
            }
          }
        }

        if (!sentAny) {
          result.usersSkipped++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        result.errors.push(`${user.id}: ${msg}`);
        nurtureLogger.error(`Failed to process nurture for user ${user.id}`, { error: msg });
      }

      if (i < trialUsers.length - 1) {
        await delay(USER_PROCESSING_DELAY_MS);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    result.success = false;
    result.errors.push(msg);
    nurtureLogger.error('Trial nurture handler failed', { error: msg });
  }

  result.durationMs = Date.now() - startTime;
  nurtureLogger.info('Trial nurture handler completed', {
    usersFound: result.usersFound,
    emailsSent: result.emailsSent,
    usersSkipped: result.usersSkipped,
    errors: result.errors.length,
    durationMs: result.durationMs,
  });

  return result;
}

async function findTrialUsers(prisma: ReturnType<typeof getPrismaClient>, now: Date): Promise<TrialUser[]> {
  // Legacy trial users: actively trialing
  const legacyUsers = await prisma.user.findMany({
    where: {
      isTrialing: true,
      trialStartedAt: { not: null },
      deletedAt: null,
      subscriptionTier: { notIn: ['PRO', 'MAX'] },
    },
    select: {
      id: true,
      email: true,
      trialStartedAt: true,
      trialEndsAt: true,
      onboardingCompleted: true,
      hoursSavedTotal: true,
    },
  });

  // Stripe trial users: active subscription created within last 14 days, still on FREE tier
  // We use 14 days (not 7) to catch win-back emails for recently expired trials
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const stripeTrialUsers = await prisma.userSubscription.findMany({
    where: {
      isActive: true,
      currentPeriodStart: { gte: fourteenDaysAgo },
      currentPeriodEnd: { gt: now },
      user: {
        subscriptionTier: 'FREE',
        deletedAt: null,
      },
    },
    select: {
      userId: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      user: {
        select: {
          id: true,
          email: true,
          onboardingCompleted: true,
          hoursSavedTotal: true,
        },
      },
    },
  });

  // Build unified list, deduplicating by userId (prefer Stripe source)
  const userMap = new Map<string, TrialUser>();

  for (const u of legacyUsers) {
    if (!u.trialStartedAt) continue;
    userMap.set(u.id, {
      id: u.id,
      email: u.email,
      trialStartedAt: u.trialStartedAt,
      trialEndsAt: u.trialEndsAt,
      onboardingCompleted: u.onboardingCompleted,
      hoursSavedTotal: u.hoursSavedTotal,
      source: 'legacy',
    });
  }

  for (const sub of stripeTrialUsers) {
    // Stripe source overrides legacy
    userMap.set(sub.userId, {
      id: sub.user.id,
      email: sub.user.email,
      trialStartedAt: sub.currentPeriodStart,
      trialEndsAt: sub.currentPeriodEnd,
      onboardingCompleted: sub.user.onboardingCompleted,
      hoursSavedTotal: sub.user.hoursSavedTotal,
      source: 'stripe',
    });
  }

  return Array.from(userMap.values());
}

async function batchQueryViews(prisma: ReturnType<typeof getPrismaClient>, userIds: string[]): Promise<Map<string, number>> {
  const results = await prisma.summaryCacheAccess.groupBy({
    by: ['userId'],
    where: { userId: { in: userIds } },
    _count: { id: true },
  });
  return new Map(results.map(r => [r.userId, r._count.id]));
}

async function batchQueryDeliveries(prisma: ReturnType<typeof getPrismaClient>, userIds: string[]): Promise<Map<string, number>> {
  const results = await prisma.summaryEmailDelivery.groupBy({
    by: ['userId'],
    where: { userId: { in: userIds } },
    _count: { id: true },
  });
  return new Map(results.map(r => [r.userId, r._count.id]));
}

async function batchQueryFeedback(prisma: ReturnType<typeof getPrismaClient>, userIds: string[]): Promise<Map<string, number>> {
  const results = await prisma.emailFeedback.groupBy({
    by: ['userId'],
    where: { userId: { in: userIds } },
    _count: { id: true },
  });
  return new Map(results.map(r => [r.userId, r._count.id]));
}

async function batchQueryTickers(prisma: ReturnType<typeof getPrismaClient>, userIds: string[]): Promise<Map<string, number>> {
  const results = await prisma.ticker.groupBy({
    by: ['userId'],
    where: { userId: { in: userIds } },
    _count: { id: true },
  });
  return new Map(results.map(r => [r.userId, r._count.id]));
}

async function batchQuerySummaryCounts(prisma: ReturnType<typeof getPrismaClient>, userIds: string[]): Promise<Map<string, number>> {
  // Count summaries delivered per user via SummaryEmailDelivery (more accurate than Summary table)
  const results = await prisma.summaryEmailDelivery.groupBy({
    by: ['userId'],
    where: { userId: { in: userIds }, deliveryStatus: 'sent' },
    _count: { id: true },
  });
  return new Map(results.map(r => [r.userId, r._count.id]));
}

async function sendNurtureEmail(
  prisma: ReturnType<typeof getPrismaClient>,
  user: TrialUser,
  type: NurtureDay,
  trialDay: number,
  engagementScore: number,
  summaryCount: number,
): Promise<void> {
  const {
    sendTrialDay3Email,
    sendTrialDay4Email,
    sendTrialDay6Email,
    sendTrialDay10WinBackEmail,
    sendTrialDay14FinalWinBackEmail,
    sendTrialSetupNudgeEmail,
  } = await import('../../email/trial-emails');

  nurtureLogger.info(`Sending ${type} to user ${user.id}`, { trialDay, engagementScore, summaryCount });

  switch (type) {
    case 'trial-nurture-day3':
      await sendTrialDay3Email({ email: user.email, userId: user.id, summaryCount });
      break;
    case 'trial-nurture-day4':
      await sendTrialDay4Email({
        email: user.email,
        userId: user.id,
        summaryCount,
        trialEndsAt: user.trialEndsAt || new Date(user.trialStartedAt.getTime() + 7 * 24 * 60 * 60 * 1000),
      });
      break;
    case 'trial-nurture-day6':
      await sendTrialDay6Email({ email: user.email, userId: user.id });
      break;
    case 'trial-nurture-day10':
      await sendTrialDay10WinBackEmail({
        email: user.email,
        userId: user.id,
        summaryCount,
        hoursSaved: Math.round(summaryCount * 1.5 * 10) / 10,
      });
      break;
    case 'trial-nurture-day14':
      await sendTrialDay14FinalWinBackEmail({ email: user.email, userId: user.id });
      break;
    case 'trial-setup-nudge':
      await sendTrialSetupNudgeEmail({ email: user.email, userId: user.id });
      break;
  }

  // Record in NotificationSent for idempotency + engagement tracking
  await prisma.notificationSent.create({
    data: {
      userId: user.id,
      emailAddress: user.email,
      notificationType: type,
      deliveryStatus: 'sent',
      metadata: {
        engagementScore,
        trialDay,
        summaryCount,
        source: user.source,
      },
    },
  });
}

/**
 * Conversion metrics: query users who received nurture emails and check conversion rates.
 */
export async function getNurtureConversionMetrics(): Promise<{
  totalNurtured: number;
  totalConverted: number;
  conversionRate: number;
  byStage: Record<string, { sent: number; converted: number; rate: number }>;
  byEngagementBand: Record<string, { sent: number; converted: number; rate: number }>;
}> {
  const prisma = getPrismaClient();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Get all nurture notifications from last 30 days
  const nurtureNotifications = await prisma.notificationSent.findMany({
    where: {
      notificationType: { in: NURTURE_SEQUENCE.map(s => s.type) },
      sentAt: { gte: thirtyDaysAgo },
    },
    select: { userId: true, notificationType: true, metadata: true },
  });

  // Get unique user IDs
  const userIds = [...new Set(nurtureNotifications.map(n => n.userId))];

  // Check which users converted (have active paid subscription)
  const convertedSubs = await prisma.userSubscription.findMany({
    where: {
      userId: { in: userIds },
      isActive: true,
      planType: { not: 'FREE' },
    },
    select: { userId: true },
  });
  const convertedSet = new Set(convertedSubs.map(s => s.userId));

  // Build metrics by stage
  const byStage: Record<string, { sent: number; converted: number; rate: number }> = {};
  for (const step of NURTURE_SEQUENCE) {
    const stageUsers = new Set(
      nurtureNotifications.filter(n => n.notificationType === step.type).map(n => n.userId)
    );
    const stageConverted = [...stageUsers].filter(id => convertedSet.has(id)).length;
    byStage[step.type] = {
      sent: stageUsers.size,
      converted: stageConverted,
      rate: stageUsers.size > 0 ? Math.round((stageConverted / stageUsers.size) * 100) / 100 : 0,
    };
  }

  // Build metrics by engagement band
  const bands = ['0-25', '25-50', '50-75', '75-100'] as const;
  const byEngagementBand: Record<string, { sent: number; converted: number; rate: number }> = {};

  for (const band of bands) {
    const [min, max] = band.split('-').map(Number);
    const bandUsers = new Set(
      nurtureNotifications
        .filter(n => {
          const meta = n.metadata as Record<string, unknown> | null;
          const score = (meta?.engagementScore as number) ?? 0;
          return score >= min && score < max;
        })
        .map(n => n.userId)
    );
    const bandConverted = [...bandUsers].filter(id => convertedSet.has(id)).length;
    byEngagementBand[band] = {
      sent: bandUsers.size,
      converted: bandConverted,
      rate: bandUsers.size > 0 ? Math.round((bandConverted / bandUsers.size) * 100) / 100 : 0,
    };
  }

  const totalNurtured = userIds.length;
  const totalConverted = [...new Set(userIds)].filter(id => convertedSet.has(id)).length;

  return {
    totalNurtured,
    totalConverted,
    conversionRate: totalNurtured > 0 ? Math.round((totalConverted / totalNurtured) * 100) / 100 : 0,
    byStage,
    byEngagementBand,
  };
}
