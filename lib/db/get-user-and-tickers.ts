import { cache } from 'react';
import { getPrismaClient } from '@/lib/db/prisma';
import { mapTickersToCompanies } from '@/lib/db/dashboard-queries';

export type DashboardUserData = {
  dbUser: {
    id: string;
    tutorialCompletedAt: Date | null;
    subscriptionTier: 'FREE' | 'PRO' | 'MAX';
    onboardingFirstSummaryId: string | null;
  };
  tickerIds: string[];
  initialCompanies: ReturnType<typeof mapTickersToCompanies>;
  isFirstVisit: boolean;
};

// React cache()-wrapped helper. Multiple dashboard Suspense boundaries each
// call this; React de-dupes the call within a single render pass so only ONE
// query runs even though 4+ components depend on the result.
//
// Keyed by Clerk authProviderId (per CLAUDE.md item #11), with fallback to
// the DB User.id for legacy rows where authProviderId may be unset. Email is
// NOT used as the key because Clerk emails are mutable.
//
// Returns null if no DB user matches (new sign-up race; caller should treat
// as "empty dashboard" state, not a crash).
export const getUserAndTickers = cache(async (authProviderId: string): Promise<DashboardUserData | null> => {
  const prisma = getPrismaClient();
  const dbUser = await prisma.user.findFirst({
    where: { OR: [{ authProviderId }, { id: authProviderId }] },
    select: {
      id: true,
      tutorialCompletedAt: true,
      subscriptionTier: true,
      onboardingFirstSummaryId: true,
      tickers: {
        include: {
          _count: { select: { summaries: true } },
          summaries: {
            take: 1,
            select: { id: true, filingDate: true },
            orderBy: { filingDate: 'desc' },
          },
        },
      },
    },
  });

  if (!dbUser) {
    return null;
  }

  return {
    dbUser: {
      id: dbUser.id,
      tutorialCompletedAt: dbUser.tutorialCompletedAt,
      subscriptionTier: dbUser.subscriptionTier as 'FREE' | 'PRO' | 'MAX',
      onboardingFirstSummaryId: dbUser.onboardingFirstSummaryId,
    },
    tickerIds: dbUser.tickers.map((t) => t.id),
    initialCompanies: mapTickersToCompanies(dbUser.tickers),
    isFirstVisit: dbUser.tutorialCompletedAt == null,
  };
});
