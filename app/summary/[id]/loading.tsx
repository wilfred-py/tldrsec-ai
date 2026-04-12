import { Skeleton } from "@/components/ui/skeleton";

export default function SummaryLoading() {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--landing-bg)' }}>
      <main className="flex-1" style={{ backgroundColor: 'var(--landing-bg)' }}>
        <div className="container max-w-7xl mx-auto py-8 md:py-10 px-6 md:px-8 space-y-6">
          {/* Breadcrumb skeleton */}
          <div className="mb-4 flex items-center gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-32" />
          </div>

          {/* Title area */}
          <div className="flex flex-col space-y-2">
            <div className="flex items-center space-x-2">
              <Skeleton className="h-8 w-8 rounded-md" />
              <Skeleton className="h-8 w-64" />
            </div>
            <div className="pl-10">
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="pl-10">
              <Skeleton className="h-4 w-28" />
            </div>
          </div>

          {/* Summary content area */}
          <div className="rounded-lg p-6 space-y-4">
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
          </div>
        </div>
      </main>
    </div>
  );
}
