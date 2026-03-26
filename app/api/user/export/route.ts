import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db/prisma';

/**
 * GET /api/user/export
 * Exports all user data as JSON for GDPR/data portability compliance.
 */
export async function GET() {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const prisma = getPrismaClient();

  const dbUser = await prisma.user.findFirst({
    where: { OR: [{ id: clerkUserId }, { authProviderId: clerkUserId }] },
    include: {
      tickers: {
        include: {
          summaries: {
            select: {
              id: true,
              filingType: true,
              filingDate: true,
              filingUrl: true,
              summaryText: true,
              importance: true,
              createdAt: true,
            },
          },
        },
      },
      userSubscription: {
        select: {
          planType: true,
          isActive: true,
          currentPeriodStart: true,
          currentPeriodEnd: true,
          cancelAtPeriodEnd: true,
        },
      },
      emailFeedback: {
        select: {
          summaryId: true,
          vote: true,
          createdAt: true,
        },
      },
    },
  });

  if (!dbUser) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const exportData = {
    exportDate: new Date().toISOString(),
    account: {
      email: dbUser.email,
      name: dbUser.name,
      createdAt: dbUser.createdAt,
      subscriptionTier: dbUser.subscriptionTier,
      preferences: dbUser.preferences,
    },
    subscription: dbUser.userSubscription || null,
    tickers: dbUser.tickers.map(t => ({
      symbol: t.symbol,
      companyName: t.companyName,
      addedAt: t.addedAt,
      preferences: t.preferences,
      summaries: t.summaries,
    })),
    feedback: dbUser.emailFeedback,
    stats: {
      hoursSavedThisMonth: dbUser.hoursSavedThisMonth,
      hoursSavedTotal: dbUser.hoursSavedTotal,
      totalTickers: dbUser.tickers.length,
      totalSummaries: dbUser.tickers.reduce((sum, t) => sum + t.summaries.length, 0),
    },
  };

  return NextResponse.json(exportData);
}
