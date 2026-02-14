import { Skeleton } from "@/components/ui/skeleton";

export default function SubscribeLoading() {
  return (
    <div
      className="min-h-screen py-8 px-4 animate-fadeIn"
      style={{ backgroundColor: "var(--landing-bg)" }}
    >
      <div className="max-w-5xl mx-auto">
        {/* Back Button */}
        <div data-testid="back-button-skeleton" className="mb-8">
          <Skeleton className="h-9 w-20 rounded-md" />
        </div>

        {/* Header */}
        <div className="text-center mb-8 space-y-4">
          <Skeleton className="h-9 w-64 mx-auto" />
          <Skeleton className="h-4 w-96 mx-auto" />
        </div>

        {/* Billing Toggle */}
        <div
          data-testid="toggle-skeleton"
          className="flex items-center justify-center gap-3 mb-12"
        >
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-6 w-12 rounded-full" />
        </div>

        {/* Plan Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              data-testid="plan-card-skeleton"
              className="rounded-xl border p-6 space-y-4 animate-slideUp"
              style={{
                animationDelay: `${i * 100}ms`,
                backgroundColor: "var(--landing-card-bg, white)",
              }}
            >
              {/* Tier label + icon */}
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-7 w-24" />
                </div>
                <Skeleton className="h-6 w-6 rounded" />
              </div>

              {/* Price */}
              <div className="space-y-1">
                <Skeleton className="h-10 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>

              {/* CTA Button */}
              <Skeleton className="h-10 w-full rounded-md" />

              {/* Feature lines */}
              <div className="space-y-3 pt-2">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="flex items-center gap-3">
                    <Skeleton className="h-4 w-4 rounded-full flex-shrink-0" />
                    <Skeleton
                      className="h-4 flex-1"
                      style={{ maxWidth: `${70 + j * 8}%` }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ESC hint */}
        <div className="text-center mt-8">
          <Skeleton className="h-4 w-40 mx-auto" />
        </div>
      </div>
    </div>
  );
}
