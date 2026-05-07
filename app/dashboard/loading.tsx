import { StatsSkeleton } from "@/components/dashboard/sections/stats-skeleton";
import { ActivitySkeleton } from "@/components/dashboard/sections/activity-skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

// Route-level loading boundary for /dashboard.
// Mirrors the shell shape of app/dashboard/page.tsx and reuses the same
// per-section skeletons the page's Suspense boundaries fall back to. Without
// this, the previous loading.tsx rendered a fake-table mock that didn't match
// the card-based UI — producing the visible "skeleton then MORE skeleton" wave.
export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="sr-only">Dashboard</h1>

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
