import 'server-only';
import { getServerPostHog } from '@/lib/analytics/posthog-server';
import { resolveDistinctId } from '@/lib/analytics/distinct-id';
import type { HeroVariant } from '@/lib/landing/copy';

/**
 * Server-side resolver for the landing hero copy experiment.
 *
 * Flag: `landing-hero-copy-v2`
 *   - control = existing copy
 *   - variant = (step 4: identical to control; step 5: Form-4 wedge framing)
 *
 * Resolved at request time in `app/page.tsx` and passed as a prop to
 * `<GmailInboxHero variant={...} />`. This pattern (server-bootstrap → prop)
 * gives us:
 *   - Zero LCP regression (no client-side flag fetch before first paint).
 *   - No flicker on hydration (server and client render the same arm).
 *   - Graceful fallback to control on every error path.
 *
 * The distinct id used for bucket assignment comes from `resolveDistinctId`
 * in `lib/analytics/distinct-id.ts`. That same id is also used by the
 * sign-up server component for the arrival event, so PostHog can join
 * landing-page exposure and sign-up arrival for the same anonymous visitor.
 */
export const HERO_FLAG_KEY = 'landing-hero-copy-v2';

/**
 * Resolve the hero variant for the current request. Returns 'control' on any
 * error, missing PostHog config, or unrecognized flag value.
 */
export async function resolveHeroVariant(): Promise<HeroVariant> {
  const posthog = getServerPostHog();
  if (!posthog) return 'control';

  try {
    const distinctId = await resolveDistinctId();
    const flag = await posthog.getFeatureFlag(HERO_FLAG_KEY, distinctId);
    return flag === 'variant' ? 'variant' : 'control';
  } catch {
    // Network failure, malformed flag config, etc. — never surface as an error
    // on the public landing page.
    return 'control';
  }
}
