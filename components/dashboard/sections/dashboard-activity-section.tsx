import { fetchRecentSummaries, fetchFeaturedSummaries } from "@/lib/db/dashboard-queries";
import { getUserAndTickers } from "@/lib/db/get-user-and-tickers";
import { ActivityFeed } from "@/components/dashboard/activity-feed";

interface DashboardActivitySectionProps {
  authProviderId: string;
}

/**
 * Async server component that fetches recent summaries (and featured
 * summaries for empty-state users) independently. Wrapped in Suspense
 * so the dashboard shell renders before these queries resolve.
 *
 * Calls the cache()-deduped getUserAndTickers helper to derive tickerIds —
 * the same call from <DashboardUserSection> / <DashboardStatsSection> /
 * <DashboardTickersTab> dedupes into one DB query per render.
 */
export async function DashboardActivitySection({
  authProviderId,
}: DashboardActivitySectionProps) {
  const data = await getUserAndTickers(authProviderId);
  const tickerIds = data?.tickerIds ?? [];
  const hasCompanies = tickerIds.length > 0;

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
