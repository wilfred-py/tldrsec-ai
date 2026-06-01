import 'server-only';
import { cookies, headers } from 'next/headers';
import { createHash } from 'node:crypto';

/**
 * Stable anonymous distinct ID resolver for unauthenticated visitors.
 *
 * Two callers today: the landing hero flag resolver (lib/analytics/landing-flags.ts)
 * and the sign-up page arrival event (app/(auth)/sign-up). They both need the
 * *same* id scheme so PostHog can join "viewed landing" and "arrived at /sign-up"
 * for the same visitor before Clerk identify runs.
 *
 * Resolution order:
 *   1. PostHog client cookie (`ph_<projectKey>_posthog`) — returning visitors.
 *   2. SHA-256(ip + ua) — deterministic per request burst from same browser.
 *      Drift across cookie clears / NAT changes is acceptable for an anon id.
 */

export function anonymousDistinctId(ip: string | null, ua: string | null): string {
  const seed = `${ip ?? 'unknown-ip'}|${ua ?? 'unknown-ua'}`;
  return `anon-${createHash('sha256').update(seed).digest('hex').slice(0, 16)}`;
}

export async function resolveDistinctId(): Promise<string> {
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
