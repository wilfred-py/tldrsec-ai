import { Skeleton } from '@/components/ui/skeleton';

// Body-only skeleton for the Suspense fallback inside the summary detail page.
// Matches the visual rhythm of <SummaryContent> (heading + paragraph blocks)
// to minimize CLS when the real content swaps in.
//
// Dimensions chosen to match the prior route-level loading.tsx body section
// (lines 32-47), so users won't notice a shape shift between the brief
// route-level skeleton flash and this Suspense fallback.
export function SummaryContentSkeleton() {
  return (
    <div
      className="rounded-lg p-6 space-y-4 min-h-[480px]"
      role="status"
      aria-live="polite"
      aria-label="Loading summary content"
    >
      <Skeleton className="h-10 w-72 mb-6" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <div className="pt-4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <div className="pt-4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-2/3" />
      <span className="sr-only">Loading summary content</span>
    </div>
  );
}
