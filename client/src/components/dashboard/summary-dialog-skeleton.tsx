import { Skeleton } from "@/components/ui/skeleton";

export function SummaryDialogSkeleton() {
  return (
    <div className="space-y-4 p-2">
      {/* Title skeleton */}
      <Skeleton className="h-6 w-2/3 mb-2" />
      
      {/* Content skeleton */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-4/6" />
        </div>
      ))}
    </div>
  );
}