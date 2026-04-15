import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { getPrismaClient } from "@/lib/db/prisma";
import { Company } from "@/lib/api/types";
import { THREE_TIER_LIMITS } from "@/lib/subscription/three-tier-limits";

interface DashboardPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  const params = await searchParams;
  const showWelcome = params.welcome === 'true';
  const shouldMergePending = params.merge === 'pending' || showWelcome;
  const subscriptionSuccess = params.subscription_success === 'true';
  const sessionId = typeof params.session_id === 'string' ? params.session_id : undefined; // Passed to client for background verification

  // Fetch tickers server-side to eliminate client-side waterfall
  let initialCompanies: Company[] = [];
  let tutorialCompleted = false;
  let subscriptionTier: 'FREE' | 'PRO' | 'MAX' = 'FREE';
  let summaryCountTotal = 0;
  let totalTimeSavedMinutes = 0;
  let recentSummaries: Array<{
    id: string;
    filingType: string;
    filingDate: string;
    importance: string | null;
    smartSubject: string | null;
    summaryText: string | null;
    companyName: string;
    ticker: string;
    filingUrl: string;
  }> = [];
  let featuredSummaries: typeof recentSummaries = [];
  const email = user.emailAddresses?.[0]?.emailAddress;
  if (email) {
    try {
      const prisma = getPrismaClient();
      const dbUser = await prisma.user.findUnique({
        where: { email },
        include: {
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
      if (dbUser) {
        tutorialCompleted = dbUser.tutorialCompletedAt != null;
        subscriptionTier = (dbUser.subscriptionTier as 'FREE' | 'PRO' | 'MAX') || 'FREE';

        // Fetch recent summaries + counts in parallel (all depend on tickerIds)
        const tickerIds = dbUser.tickers.map(t => t.id);
        if (tickerIds.length > 0) {
          const [summaries, countTotal, tokenAgg] = await Promise.all([
            prisma.summary.findMany({
              where: { tickerId: { in: tickerIds } },
              select: {
                id: true,
                filingType: true,
                filingDate: true,
                importance: true,
                smartSubject: true,
                filingUrl: true,
                ticker: { select: { symbol: true, companyName: true } },
              },
              orderBy: { filingDate: 'desc' },
              take: 15,
            }),
            prisma.summary.count({
              where: { tickerId: { in: tickerIds } },
            }),
            prisma.summary.aggregate({
              where: { tickerId: { in: tickerIds } },
              _sum: { inputTokens: true, outputTokens: true },
            }),
          ]);

          recentSummaries = summaries.map(s => ({
            id: s.id,
            filingType: s.filingType,
            filingDate: s.filingDate.toISOString(),
            importance: s.importance,
            smartSubject: s.smartSubject,
            summaryText: null,
            companyName: s.ticker.companyName,
            ticker: s.ticker.symbol,
            filingUrl: s.filingUrl,
          }));
          summaryCountTotal = countTotal;
          const totalInput = tokenAgg._sum.inputTokens ?? 0;
          const totalOutput = tokenAgg._sum.outputTokens ?? 0;
          totalTimeSavedMinutes = Math.round(Math.max(0, ((totalInput - totalOutput) * 0.75) / 250) * 10) / 10;
        }

        // If user has tickers but zero summaries, fetch featured summaries
        // from across the platform so the dashboard isn't empty on day 1
        if (recentSummaries.length === 0 && tickerIds.length > 0) {
          const featured = await prisma.summary.findMany({
            where: {
              importance: { in: ['critical', 'high'] },
            },
            select: {
              id: true,
              filingType: true,
              filingDate: true,
              importance: true,
              smartSubject: true,
              filingUrl: true,
              ticker: { select: { symbol: true, companyName: true } },
            },
            orderBy: { filingDate: 'desc' },
            take: 10,
          });
          featuredSummaries = featured.map(s => ({
            id: s.id,
            filingType: s.filingType,
            filingDate: s.filingDate.toISOString(),
            importance: s.importance,
            smartSubject: s.smartSubject,
            summaryText: null,
            companyName: s.ticker.companyName,
            ticker: s.ticker.symbol,
            filingUrl: s.filingUrl,
          }));
        }

        initialCompanies = dbUser.tickers.map(ticker => ({
          id: ticker.id,
          symbol: ticker.symbol,
          name: ticker.companyName,
          lastFiling: "—",
          lastFilingDate: ticker.summaries[0]?.filingDate?.toISOString() ?? undefined,
          summaryCount: ticker._count.summaries,
          preferences: (ticker.preferences as Company['preferences']) || { tenK: true, tenQ: true, eightK: true, form4: true, other: false },
        }));

      }
    } catch (error) {
      console.error('Failed to prefetch tickers:', error);
      // DashboardClient will fall back to client-side fetch
    }
  }

  const tickerLimit = THREE_TIER_LIMITS[subscriptionTier];

  return (
    <DashboardClient
      showWelcome={showWelcome}
      shouldMergePending={shouldMergePending}
      subscriptionSuccess={subscriptionSuccess}
      sessionId={sessionId}
      initialCompanies={initialCompanies}
      tutorialCompleted={tutorialCompleted}
      subscriptionTier={subscriptionTier}
      tickerLimit={tickerLimit}
      summaryCountTotal={summaryCountTotal}
      totalTimeSavedMinutes={totalTimeSavedMinutes}
      recentSummaries={recentSummaries}
      featuredSummaries={featuredSummaries}
    />
  );
}
