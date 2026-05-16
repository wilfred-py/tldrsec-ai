import { getUserAndTickers } from '@/lib/db/get-user-and-tickers';
import { TickersPanel } from '@/components/dashboard/tickers-panel';
import { THREE_TIER_LIMITS } from '@/lib/subscription/three-tier-limits';

// Async server component for the Tickers tab content. Calls the cached
// getUserAndTickers helper so it dedupes with the parallel stats/activity/
// user sections — only one DB query runs per render even though all four
// sections depend on the data.
export async function DashboardTickersTab({ authProviderId }: { authProviderId: string }) {
  const data = await getUserAndTickers(authProviderId);

  if (!data) {
    return (
      <TickersPanel
        initialCompanies={[]}
        subscriptionTier="FREE"
        tickerLimit={THREE_TIER_LIMITS.FREE}
      />
    );
  }

  return (
    <TickersPanel
      initialCompanies={data.initialCompanies}
      subscriptionTier={data.dbUser.subscriptionTier}
      tickerLimit={THREE_TIER_LIMITS[data.dbUser.subscriptionTier]}
    />
  );
}
