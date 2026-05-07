import 'server-only';
import { cookies, headers } from 'next/headers';
import { createHash } from 'node:crypto';
import { getServerPostHog } from '@/lib/analytics/posthog-server';
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
 * Distinct ID resolution order (best stable signal first):
 *   1. PostHog client cookie if present (`ph_<projectKey>_posthog`) — used by
 *      returning visitors whose browser SDK already wrote one.
 *   2. Hash of `forwarded-for` IP + `user-agent` header — stable for a single
 *      user-agent across a request burst, unstable across cleared cookies.
 *      Acceptable in step 4 (variant === control); revisit if step 5 conversion
 *      data shows bucketing instability.
 */
export const HERO_FLAG_KEY = 'landing-hero-copy-v2';

/**
 * Short, deterministic hash of (ip, ua) for an anonymous distinctId.
 * SHA-256 hex truncated — 16 chars is enough entropy for bucket assignment.
 */
function anonymousDistinctId(ip: string | null, ua: string | null): string {
  const seed = `${ip ?? 'unknown-ip'}|${ua ?? 'unknown-ua'}`;
  return `anon-${createHash('sha256').update(seed).digest('hex').slice(0, 16)}`;
}

/**
 * Read a stable distinctId for an unauthenticated landing visitor.
 *
 * Tries the PostHog browser cookie first (the `ph_<key>_posthog` payload is
 * a JSON object containing `distinct_id`). Falls back to a per-request anon
 * hash. NEVER throws; on any decode error returns the fallback.
 */
async function resolveDistinctId(): Promise<string> {
  try {
    const c = await cookies();
    const all = c.getAll();
    const phCookie = all.find((cookie) => cookie.name.startsWith('ph_') && cookie.name.endsWith('_posthog'));
    if (phCookie?.value) {
      try {
        const parsed = JSON.parse(decodeURIComponent(phCookie.value));
        if (typeof parsed?.distinct_id === 'string' && parsed.distinct_id.length > 0) {
          return parsed.distinct_id;
        }
      } catch {
        // Cookie malformed — fall through to anonymous.
      }
    }
  } catch {
    // cookies() unavailable in some render contexts — fall through.
  }

  try {
    const h = await headers();
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
    const ua = h.get('user-agent');
    return anonymousDistinctId(ip, ua);
  } catch {
    return anonymousDistinctId(null, null);
  }
}

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
