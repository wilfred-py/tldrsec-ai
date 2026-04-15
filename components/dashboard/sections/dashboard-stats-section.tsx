import { fetchDashboardStats } from "@/lib/db/dashboard-queries";
import { EmailStatsWidget } from "@/components/dashboard/email-stats-widget";

interface DashboardStatsSectionProps {
  tickerIds: string[];
}

/**
 * Async server component that fetches summary stats independently.
 * Wrapped in Suspense by the dashboard page so the shell renders
 * before these queries resolve.
 */
export async function DashboardStatsSection({ tickerIds }: DashboardStatsSectionProps) {
  const stats = await fetchDashboardStats(tickerIds);

  return (
    <EmailStatsWidget
      summaryCountThisMonth={stats.summaryCountThisMonth}
      summaryCountTotal={stats.summaryCountTotal}
      totalTimeSavedMinutes={stats.totalTimeSavedMinutes}
    />
  );
}
