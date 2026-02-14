import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function BillingLoading() {
  return (
    <div className="container mx-auto py-8 space-y-8 animate-fadeIn">
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-96" />
      </div>

      {/* Subscription Card */}
      <Card
        className="border-0 shadow-sm animate-slideUp"
        style={{ animationDelay: "100ms" }}
      >
        <CardHeader>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" />
            <Skeleton className="h-5 w-40" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Plan name + price */}
          <div className="space-y-1">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>

          {/* Billing period */}
          <div className="space-y-1">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-48" />
          </div>

          {/* Separator */}
          <Skeleton className="h-px w-full" />

          {/* Action buttons */}
          <div
            className="flex gap-2 animate-slideUp"
            style={{ animationDelay: "200ms" }}
          >
            <Skeleton className="h-10 w-52 rounded-md" />
            <Skeleton className="h-6 w-10 rounded-full" />
            <Skeleton className="h-4 w-36" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
