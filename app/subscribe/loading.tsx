import { Skeleton } from "@/components/ui/skeleton";

export default function SubscribeLoading() {
  return (
    <div
      className="min-h-screen py-8 px-4 animate-fadeIn"
      style={{ backgroundColor: "var(--landing-bg)" }}
      role="status"
      aria-live="polite"
      aria-label="Loading subscription plans"
    >
      <div className="max-w-5xl mx-auto">
        {/* Back Button */}
        <div data-testid="back-button-skeleton" className="mb-8">
          <Skeleton className="h-9 w-20 rounded-md" aria-label="Loading back button" />
        </div>

        {/* Header */}
        <div className="text-center mb-8 space-y-4">
          <Skeleton className="h-9 w-64 mx-auto" aria-label="Loading page title" />
          <Skeleton className="h-4 w-96 mx-auto" aria-label="Loading page description" />
        </div>

        {/* Billing Toggle */}
        <div
          data-testid="toggle-skeleton"
          className="flex items-center justify-center gap-3 mb-12"
        >
          <Skeleton className="h-4 w-36" aria-label="Loading billing toggle label" />
          <Skeleton className="h-6 w-12 rounded-full" aria-label="Loading billing toggle" />
        </div>

        {/* Plan Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              data-testid="plan-card-skeleton"
              className="rounded-xl border p-6 space-y-4 animate-slideUp focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
              style={{
                animationDelay: `${i * 100}ms`,
                backgroundColor: "var(--landing-card-bg, white)",
              }}
              role="article"
              aria-label={`Loading pricing plan ${i + 1}`}
            >
              {/* Tier label + icon */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Skeleton className="h-3 w-12" aria-label="Loading tier label" />
                  <Skeleton className="h-7 w-24" aria-label="Loading plan name" />
                </div>
                <Skeleton className="h-6 w-6 rounded" aria-label="Loading plan icon" />
              </div>

              {/* Price */}
              <div className="space-y-1">
                <Skeleton className="h-10 w-28" aria-label="Loading plan price" />
                <Skeleton className="h-3 w-20" aria-label="Loading billing period" />
              </div>

              {/* CTA Button */}
              <Skeleton className="h-10 w-full rounded-md" aria-label="Loading action button" />

              {/* Feature lines */}
              <div className="space-y-3 pt-2">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="flex items-center gap-3">
                    <Skeleton
                      className="h-4 w-4 rounded-full flex-shrink-0"
                      aria-hidden="true"
                    />
                    <Skeleton
                      className="h-4 flex-1"
                      style={{ maxWidth: `${70 + j * 8}%` }}
                      aria-label={`Loading feature ${j + 1}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ESC hint */}
        <div className="text-center mt-8">
          <Skeleton className="h-4 w-40 mx-auto" aria-label="Loading keyboard hint" />
        </div>
      </div>
    </div>
  );
}
