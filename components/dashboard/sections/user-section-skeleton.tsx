import { Skeleton } from '@/components/ui/skeleton';

// Suspense fallback for <DashboardUserSection>. The real section may render
// nothing (returning users with tutorialCompletedAt set, no hero), the
// onboarding banner alone, or banner + hero card. Skeleton renders a single
// banner-sized block to bias the layout toward the common case without
// flashing tall content for users who'll see nothing.
//
// min-h prevents CLS during the brief shell-then-section transition;
// aria-live="polite" announces arrival to screen readers (M3 a11y fix).
export function UserSectionSkeleton() {
  return (
    <div
      className="min-h-[64px]"
      role="status"
      aria-live="polite"
      aria-label="Loading account status"
    >
      <Skeleton className="h-16 w-full rounded-lg" />
      <span className="sr-only">Loading account status</span>
    </div>
  );
}
