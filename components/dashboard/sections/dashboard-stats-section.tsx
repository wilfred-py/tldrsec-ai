import { Clock } from "lucide-react";
import { fetchDashboardStats } from "@/lib/db/dashboard-queries";
import { CounterDisplay } from "@/components/landing/counter";

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
  const { summaryCountTotal, totalTimeSavedMinutes } = stats;

  if (totalTimeSavedMinutes < 1 && summaryCountTotal === 0) {
    return null;
  }

  const minutesLabel = totalTimeSavedMinutes >= 1 ? `${Math.round(totalTimeSavedMinutes)} minutes saved` : "";
  const filingsLabel = summaryCountTotal > 0 ? `${summaryCountTotal} filings summarized` : "";
  const ariaLabel = [minutesLabel, filingsLabel].filter(Boolean).join(", ");

  return (
    <div
      className="flex items-center gap-3 text-sm text-[var(--brand-text-muted)]"
      role="status"
      aria-label={ariaLabel}
    >
      <Clock className="h-4 w-4 text-[var(--brand-primary)]" aria-hidden="true" />
      {totalTimeSavedMinutes >= 1 && (
        <span className="flex items-center gap-1" aria-hidden="true">
          <CounterDisplay
            count={Math.round(totalTimeSavedMinutes)}
            className="text-lg font-bold text-[var(--brand-secondary)]"
          />
          <span>minutes saved</span>
        </span>
      )}
      {summaryCountTotal > 0 && (
        <span aria-hidden="true">
          &middot; {summaryCountTotal} filing{summaryCountTotal !== 1 ? "s" : ""} summarized
        </span>
      )}
    </div>
  );
}
