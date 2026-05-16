import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

// Suspense fallback for <DashboardTickersTab>. Matches the rough shape of
// TickersPanel — a header row + several ticker rows. min-h locks layout
// height to prevent CLS when the real panel hydrates.
export function TickersTabSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading tickers">
      <Card className="overflow-hidden py-0 min-h-[320px]">
        <div className="px-4 py-3 border-b border-[var(--brand-border)] flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="px-4 py-3 border-b border-[var(--brand-border)] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-12 rounded" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </Card>
      <span className="sr-only">Loading tickers</span>
    </div>
  );
}
