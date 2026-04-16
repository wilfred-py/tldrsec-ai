import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/**
 * Suspense fallback matching ActivityFeed dimensions.
 * Fixed min-height prevents CLS when the real content streams in.
 */
export function ActivitySkeleton() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Skeleton className="h-4 w-4" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Card className="overflow-hidden py-0 min-h-[320px]">
        {/* Date group header */}
        <div className="px-3 pt-3 pb-2">
          <Skeleton className="h-3 w-16" />
        </div>
        {/* Summary rows */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="px-3 py-3 border-b border-[var(--brand-border)]">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-12 rounded-full" />
                <Skeleton className="h-4 w-36" />
              </div>
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="mt-1.5 h-4 w-64" />
            <Skeleton className="mt-1 h-3 w-48" />
          </div>
        ))}
      </Card>
    </div>
  );
}
