import { Skeleton } from "@/components/ui/skeleton";

/**
 * Suspense fallback matching the inline stats row dimensions
 * (icon + time-saved counter + filings-summarized text).
 * Fixed height prevents CLS when the real content streams in.
 */
export function StatsSkeleton() {
  return (
    <div className="flex items-center gap-3">
      <Skeleton className="h-4 w-4 rounded-full" />
      <Skeleton className="h-5 w-48" />
    </div>
  );
}
