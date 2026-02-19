import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/dashboard/dashboard-client";
import { getPrismaClient } from "@/lib/db/prisma";
import { Company } from "@/lib/api/types";

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

  // Fetch tickers server-side to eliminate client-side waterfall
  let initialCompanies: Company[] = [];
  let tutorialCompleted = false;
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

  return (
    <DashboardClient
      showWelcome={showWelcome}
      shouldMergePending={shouldMergePending}
      subscriptionSuccess={subscriptionSuccess}
      initialCompanies={initialCompanies}
      tutorialCompleted={tutorialCompleted}
    />
  );
}
