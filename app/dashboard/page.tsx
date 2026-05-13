import { Suspense } from "react";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { DashboardUserSection } from "@/components/dashboard/sections/dashboard-user-section";
import { UserSectionSkeleton } from "@/components/dashboard/sections/user-section-skeleton";
import { DashboardActivitySection } from "@/components/dashboard/sections/dashboard-activity-section";
import { DashboardTickersTab } from "@/components/dashboard/sections/dashboard-tickers-tab";
import { ActivitySkeleton } from "@/components/dashboard/sections/activity-skeleton";
import { TickersTabSkeleton } from "@/components/dashboard/sections/tickers-tab-skeleton";
import { SectionErrorBoundary } from "@/components/dashboard/section-error-boundary";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// Calls currentUser() (Clerk server) at render time — incompatible with
// static prerender at build. See streaming-perf-v2 Subtask 2.
export const dynamic = "force-dynamic";

interface DashboardPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

// Streaming dashboard. Shell renders after only the cheap currentUser() +
// searchParams awaits; all 3 data-bearing sections (user/onboarding,
// activity feed, tickers tab) stream in parallel via Suspense. They share
// a single cache()-deduped getUserAndTickers(authProviderId) call so the
// heavy user+tickers join runs ONCE per render despite 3 consumers.
//
// Tabs default to "activity" unconditionally so the initial render matches
// loading.tsx (no tab-snap on hydration — H3 fix from the streaming-perf-v2
// adversarial review).
export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  const params = await searchParams;
  const subscriptionSuccess = params.subscription_success === "true";
  const sessionId = typeof params.session_id === "string" ? params.session_id : undefined;
  const email = user.emailAddresses?.[0]?.emailAddress;
  const authProviderId = user.id;

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="sr-only">Dashboard</h1>

      {/* Onboarding banner + first-visit hero card — streams independently */}
      <SectionErrorBoundary sectionName="account">
        <Suspense fallback={<UserSectionSkeleton />}>
          <DashboardUserSection
            authProviderId={authProviderId}
            email={email}
            firstName={user.firstName}
            subscriptionSuccess={subscriptionSuccess}
            sessionId={sessionId}
          />
        </Suspense>
      </SectionErrorBoundary>

      {/* Tabs: Emails (activity feed) / Tickers — both stream */}
      <Tabs defaultValue="activity" className="w-full">
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
            content hydrates correctly regardless of which tab is active. */}
        <TabsContent value="activity" forceMount className="data-[state=inactive]:hidden">
          <SectionErrorBoundary sectionName="activity feed">
            <Suspense fallback={<ActivitySkeleton />}>
              <DashboardActivitySection authProviderId={authProviderId} />
            </Suspense>
          </SectionErrorBoundary>
        </TabsContent>

        <TabsContent value="tickers" forceMount className="data-[state=inactive]:hidden">
          <SectionErrorBoundary sectionName="tickers">
            <Suspense fallback={<TickersTabSkeleton />}>
              <DashboardTickersTab authProviderId={authProviderId} />
            </Suspense>
          </SectionErrorBoundary>
        </TabsContent>
      </Tabs>
    </div>
  );
}
