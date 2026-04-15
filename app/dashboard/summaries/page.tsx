import { Suspense } from "react";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DashboardHeader } from "@/components/dashboard";
import { SummariesClient } from "@/components/dashboard/summaries-client";
import { SectionErrorBoundary } from "@/components/dashboard/section-error-boundary";
import { getPrismaClient } from "@/lib/db/prisma";
import { Skeleton } from "@/components/ui/skeleton";

async function SummariesData() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const email = user.emailAddresses?.[0]?.emailAddress;
  if (!email) return <SummariesClient initialSummaries={[]} />;

  const prisma = getPrismaClient();
  const dbUser = await prisma.user.findUnique({
    where: { email },
    select: { tickers: { select: { id: true } } },
  });

  if (!dbUser || dbUser.tickers.length === 0) {
    return <SummariesClient initialSummaries={[]} />;
  }

  const tickerIds = dbUser.tickers.map((t) => t.id);
  const summaries = await prisma.summary.findMany({
    where: { tickerId: { in: tickerIds } },
    select: {
      id: true,
      filingType: true,
      filingDate: true,
      filingUrl: true,
      summaryText: true,
      importance: true,
      smartSubject: true,
      ticker: { select: { symbol: true, companyName: true } },
    },
    orderBy: { filingDate: "desc" },
    take: 100,
  });

  const mapped = summaries.map((s) => ({
    id: s.id,
    filingType: s.filingType,
    filingDate: s.filingDate.toISOString(),
    filingUrl: s.filingUrl,
    summaryText: s.summaryText?.substring(0, 200) ?? "",
    importance: s.importance,
    smartSubject: s.smartSubject,
    ticker: {
      symbol: s.ticker.symbol,
      companyName: s.ticker.companyName,
    },
  }));

  return <SummariesClient initialSummaries={mapped} />;
}

function SummariesSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-9 w-[180px]" />
      </div>
      <Skeleton className="h-9 w-80" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default function SummariesPage() {
  // Auth check happens inside SummariesData (no duplicate currentUser() call)
  return (
    <div className="space-y-6">
      <DashboardHeader
        heading="Summaries"
        description="Browse and search through all your SEC filing summaries."
      />
      <SectionErrorBoundary sectionName="summaries">
        <Suspense fallback={<SummariesSkeleton />}>
          <SummariesData />
        </Suspense>
      </SectionErrorBoundary>
    </div>
  );
}
