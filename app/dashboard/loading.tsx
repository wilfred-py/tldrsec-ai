import { StatsSkeleton } from "@/components/dashboard/sections/stats-skeleton";
import { ActivitySkeleton } from "@/components/dashboard/sections/activity-skeleton";
import { UserSectionSkeleton } from "@/components/dashboard/sections/user-section-skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

// Route-level loading boundary for /dashboard.
//
// Flashes briefly during route transitions BEFORE the page's first HTML chunk
// arrives. Mirrors the new streaming shell shape (UserSection + Stats + Tabs)
// so the transition from this fallback to the page's Suspense boundaries is
// seamless. Defaults to the same tab the page does (H3 fix from
// streaming-perf-v2 review — prevents tab-snap on hydration).
export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="sr-only">Dashboard</h1>

      <UserSectionSkeleton />

      <StatsSkeleton />

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

        <TabsContent value="activity">
          <ActivitySkeleton />
        </TabsContent>
      </Tabs>
    </div>
  );
}
