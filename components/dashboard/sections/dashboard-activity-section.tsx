import { fetchRecentSummaries, fetchFeaturedSummaries } from "@/lib/db/dashboard-queries";
import { ActivityFeed } from "@/components/dashboard/activity-feed";

interface DashboardActivitySectionProps {
  tickerIds: string[];
  hasCompanies: boolean;
}

/**
 * Async server component that fetches recent summaries (and featured
 * summaries for empty-state users) independently. Wrapped in Suspense
 * so the dashboard shell renders before these queries resolve.
 */
export async function DashboardActivitySection({
  tickerIds,
  hasCompanies,
}: DashboardActivitySectionProps) {
  const recentSummaries = await fetchRecentSummaries(tickerIds);

  let featuredSummaries: typeof recentSummaries = [];
  if (recentSummaries.length === 0 && hasCompanies) {
    featuredSummaries = await fetchFeaturedSummaries();
  }

  return (
    <ActivityFeed
      summaries={recentSummaries}
      featuredSummaries={featuredSummaries}
    />
  );
}
