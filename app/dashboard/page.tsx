import { Suspense } from "react";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { getPrismaClient } from "@/lib/db/prisma";
import { mapTickersToCompanies } from "@/lib/db/dashboard-queries";
import { THREE_TIER_LIMITS } from "@/lib/subscription/three-tier-limits";
import { DashboardOnboarding } from "@/components/dashboard/dashboard-onboarding";
import { PostOnboardingHeroCard } from "@/components/dashboard/post-onboarding-hero-card";
import { TickersPanel } from "@/components/dashboard/tickers-panel";
import { DashboardActivitySection } from "@/components/dashboard/sections/dashboard-activity-section";
import { ActivitySkeleton } from "@/components/dashboard/sections/activity-skeleton";
import { SectionErrorBoundary } from "@/components/dashboard/section-error-boundary";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface DashboardPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  const params = await searchParams;
  const subscriptionSuccess = params.subscription_success === "true";
  const sessionId = typeof params.session_id === "string" ? params.session_id : undefined;

  // Minimal server-side fetch: auth + user with tickers only.
  // Stats and activity sections stream independently via Suspense.
  let tickerIds: string[] = [];
  let initialCompanies: ReturnType<typeof mapTickersToCompanies> = [];
  let tutorialCompleted = false;
  let subscriptionTier: "FREE" | "PRO" | "MAX" = "FREE";
  let isFirstVisit = false;
  let firstSummary: import('@/components/dashboard/post-onboarding-hero-card').FirstSummaryHeroSummary | null = null;
  let dbUserId: string | null = null;
  let onboardingFirstSummaryId: string | null = null;

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
                orderBy: { filingDate: "desc" },
              },
            },
          },
        },
      });

      if (dbUser) {
        tutorialCompleted = dbUser.tutorialCompletedAt != null;
        subscriptionTier = (dbUser.subscriptionTier as "FREE" | "PRO" | "MAX") || "FREE";
        tickerIds = dbUser.tickers.map((t) => t.id);
        initialCompanies = mapTickersToCompanies(dbUser.tickers);
        isFirstVisit = !tutorialCompleted;
        dbUserId = dbUser.id;
        onboardingFirstSummaryId = dbUser.onboardingFirstSummaryId;
      }
    } catch (error) {
      console.error("Failed to prefetch user:", error);
      // Page still renders — Suspense sections will show skeletons,
      // TickersPanel falls back to client-side fetch
    }
  }

  const tickerLimit = THREE_TIER_LIMITS[subscriptionTier];

  // Load the chosen first-summary pick for hero card render. Two cases:
  //   1. onboardingFirstSummaryId already set (email send already chose) →
  //      load that exact summary so card + email show the same pick.
  //   2. Not set yet (action's after() may still be running) → render the
  //      original inbox-CTA variant; the next dashboard load picks up the
  //      summary once the after() write lands.
  if (isFirstVisit && dbUserId && onboardingFirstSummaryId) {
    try {
      const prisma = getPrismaClient();
      const chosen = await prisma.summary.findUnique({
        where: { id: onboardingFirstSummaryId },
        select: {
          id: true,
          filingType: true,
          filingDate: true,
          summaryText: true,
          importance: true,
          ticker: { select: { symbol: true, companyName: true } },
        },
      });
      if (chosen) {
        const { extractHeadline } = await import('@/lib/onboarding/extract-headline');
        const headline = extractHeadline(chosen.summaryText);
        firstSummary = {
          id: chosen.id,
          ticker: chosen.ticker.symbol,
          companyName: chosen.ticker.companyName,
          filingType: chosen.filingType,
          filingDate: chosen.filingDate.toISOString(),
          headline,
          importance: chosen.importance,
        };
      }
    } catch (err) {
      console.error('Failed to load first-summary pick:', err);
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="sr-only">Dashboard</h1>

      <DashboardOnboarding
        tutorialCompleted={tutorialCompleted}
        subscriptionSuccess={subscriptionSuccess}
        sessionId={sessionId}
        subscriptionTier={subscriptionTier}
      />

      {isFirstVisit && initialCompanies.length > 0 && email && (
        <PostOnboardingHeroCard
          tickers={initialCompanies.map((c) => ({ symbol: c.symbol, name: c.name }))}
          userEmail={email}
          firstName={user.firstName ?? undefined}
          summary={firstSummary}
        />
      )}

      {/* Tabs: Activity feed (streamed) / Tickers (immediate) */}
      <Tabs defaultValue={isFirstVisit ? "tickers" : "activity"} className="w-full">
        <TabsList className="mb-4 bg-[var(--brand-bg)] border border-[var(--brand-border)] rounded-lg p-1">
          <TabsTrigger
            value="activity"
            className="data-[state=active]:bg-[var(--brand-bg-subtle)] data-[state=active]:shadow-sm data-[state=inactive]:text-[var(--brand-text-muted)] px-4 py-1.5 text-sm font-medium rounded-md"
          >
            Emails
          </TabsTrigger>
          <TabsTrigger
            value="tickers"
            className="data-[state=active]:bg-[var(--brand-bg-subtle)] data-[state=active]:shadow-sm data-[state=inactive]:text-[var(--brand-text-muted)] px-4 py-1.5 text-sm font-medium rounded-md"
          >
            Tickers
          </TabsTrigger>
        </TabsList>

        {/* forceMount keeps both tabs in the DOM so the streamed Suspense
            content hydrates correctly regardless of which tab is active.
            data-[state=inactive]:hidden hides the inactive tab via CSS. */}
        <TabsContent value="activity" forceMount className="data-[state=inactive]:hidden">
          <SectionErrorBoundary sectionName="activity feed">
            <Suspense fallback={<ActivitySkeleton />}>
              <DashboardActivitySection
                tickerIds={tickerIds}
                hasCompanies={tickerIds.length > 0}
              />
            </Suspense>
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="tickers" forceMount className="data-[state=inactive]:hidden">
          <TickersPanel
            initialCompanies={initialCompanies}
            subscriptionTier={subscriptionTier}
            tickerLimit={tickerLimit}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
