import { getUserAndTickers } from '@/lib/db/get-user-and-tickers';
import { getFirstSummary } from '@/lib/db/get-first-summary';
import { DashboardOnboarding } from '@/components/dashboard/dashboard-onboarding';
import { PostOnboardingHeroCard } from '@/components/dashboard/post-onboarding-hero-card';

type DashboardUserSectionProps = {
  authProviderId: string;
  email: string | undefined;
  firstName: string | null | undefined;
  subscriptionSuccess: boolean;
  sessionId: string | undefined;
};

// Async server component that renders the onboarding banner + first-visit
// hero card. Fetches via the cache()-wrapped helper so it dedupes with the
// parallel stats/activity/tickers sections in the same render pass.
//
// Wrapped in Suspense by app/dashboard/page.tsx; renders <UserSectionSkeleton>
// while the user/tickers query resolves.
export async function DashboardUserSection({
  authProviderId,
  email,
  firstName,
  subscriptionSuccess,
  sessionId,
}: DashboardUserSectionProps) {
  const data = await getUserAndTickers(authProviderId);

  // No DB user yet (new sign-up race) → show the onboarding banner with safe
  // defaults; the hero card requires user data so we hide it.
  if (!data) {
    return (
      <div className="space-y-6 animate-fade-in">
        <DashboardOnboarding
          tutorialCompleted={false}
          subscriptionSuccess={subscriptionSuccess}
          sessionId={sessionId}
          subscriptionTier="FREE"
        />
      </div>
    );
  }

  const { dbUser, initialCompanies, isFirstVisit } = data;
  const tutorialCompleted = dbUser.tutorialCompletedAt != null;

  // First-visit hero card: load the chosen summary (cached) so card + email
  // show the same pick. Falls back to inbox-CTA variant if not yet set
  // (the action's after() may still be writing onboardingFirstSummaryId).
  const firstSummary =
    isFirstVisit && dbUser.onboardingFirstSummaryId
      ? await getFirstSummary(dbUser.onboardingFirstSummaryId)
      : null;

  return (
    <div className="space-y-6 animate-fade-in">
      <DashboardOnboarding
        tutorialCompleted={tutorialCompleted}
        subscriptionSuccess={subscriptionSuccess}
        sessionId={sessionId}
        subscriptionTier={dbUser.subscriptionTier}
      />

      {isFirstVisit && initialCompanies.length > 0 && email && (
        <PostOnboardingHeroCard
          tickers={initialCompanies.map((c) => ({ symbol: c.symbol, name: c.name }))}
          userEmail={email}
          firstName={firstName ?? undefined}
          summary={firstSummary}
        />
      )}
    </div>
  );
}
