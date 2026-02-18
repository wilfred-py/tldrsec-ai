import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export default function BillingLoading() {
  return (
    <div
      className="container mx-auto py-8 space-y-8 animate-fadeIn"
      role="status"
      aria-live="polite"
      aria-label="Loading billing information"
    >
      {/* Header */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-72" aria-label="Loading page title" />
        <Skeleton className="h-4 w-96" aria-label="Loading page description" />
      </div>

      {/* Subscription Card */}
      <Card
        className="border-0 shadow-sm animate-slideUp focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
        style={{ animationDelay: "100ms" }}
      >
        <CardHeader>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5 rounded" aria-label="Loading subscription icon" />
            <Skeleton className="h-5 w-40" aria-label="Loading subscription header" />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Plan name + price */}
          <div className="space-y-1">
            <Skeleton className="h-6 w-32" aria-label="Loading plan name" />
            <Skeleton className="h-4 w-24" aria-label="Loading plan price" />
          </div>

          {/* Billing period */}
          <div className="space-y-1">
            <Skeleton className="h-4 w-20" aria-label="Loading billing period label" />
            <Skeleton className="h-4 w-48" aria-label="Loading billing period details" />
          </div>

          {/* Separator */}
          <Skeleton className="h-px w-full" aria-hidden="true" />

          {/* Action buttons */}
          <div
            className="flex gap-2 animate-slideUp"
            style={{ animationDelay: "200ms" }}
          >
            <Skeleton className="h-10 w-52 rounded-md" aria-label="Loading primary action button" />
            <Skeleton className="h-6 w-10 rounded-full" aria-label="Loading toggle" />
            <Skeleton className="h-4 w-36" aria-label="Loading action description" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
