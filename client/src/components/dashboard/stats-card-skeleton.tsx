import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function StatsCardSkeleton() {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex justify-between items-center">
          <div className="space-y-2">
            {/* Title skeleton */}
            <Skeleton className="h-4 w-24" />
            
            {/* Value skeleton */}
            <Skeleton className="h-8 w-16" />
          </div>
          
          {/* Icon skeleton */}
          <Skeleton className="h-12 w-12 rounded-full" />
        </div>
      </CardContent>
    </Card>
  );
}