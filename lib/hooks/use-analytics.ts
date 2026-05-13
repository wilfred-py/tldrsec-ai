'use client';

import { useCallback } from 'react';
import posthog from 'posthog-js';
import { usePathname, useSearchParams } from 'next/navigation';
import type { EventName, EventProps } from '@/lib/analytics/events';

export type EventProperties = Record<string, unknown>;

/**
 * PostHog event tracking hook.
 *
 * Does NOT call Clerk's useUser() at the hook level — that breaks SSG prerender
 * of the landing page (which has no ClerkProvider at build time). Callers that
 * want to associate a PostHog distinct ID with a Clerk user call
 * `identifyUser(user)` and pass their own user context in.
 */
export const useAnalytics = () => {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const trackEvent = useCallback(
    <E extends EventName>(event: E, properties: EventProps[E]) => {
      if (typeof window !== 'undefined' && posthog) {
        posthog.capture(event, {
          ...(properties as EventProperties),
          path: pathname,
        });
      }
    },
    [pathname]
  );

  /** Untyped escape hatch for ad-hoc events not yet in the registry. */
  const trackRaw = useCallback(
    (eventName: string, properties?: EventProperties) => {
      if (typeof window !== 'undefined' && posthog) {
        posthog.capture(eventName, {
          ...properties,
          path: pathname,
        });
      }
    },
    [pathname]
  );

  const trackPageView = useCallback(
    (properties?: EventProperties) => {
      if (typeof window !== 'undefined' && posthog) {
        const urlParams = Object.fromEntries(searchParams.entries());

        posthog.capture('$pageview', {
          path: pathname,
          url: window.location.href,
          params: urlParams,
          referrer: document.referrer,
          ...properties,
        });
      }
    },
    [pathname, searchParams]
  );

  /**
   * Associate the current anonymous PostHog session with a known user.
   * Pass the user from your own Clerk context (useUser) — the hook does not
   * call useUser itself so it stays safe to use on SSG pages.
   *
   * Newsletter campaign identity stitch (email-funnel-tracking design,
   * Review Notes 2/3): if the visitor arrived via a campaign link, the
   * SubscriberIdentifier component already identified them as `sub_<uuid>`
   * and stashed the id in localStorage + cookie. Here we alias that pseudo
   * identity to the canonical `user.id` BEFORE switching distinct_id, so
   * PostHog merges the subscriber timeline (email_clicked, landing_cta_click)
   * into the user timeline (trial_started, trial_converted).
   *
   * Order matters:
   *   1. Read subscriberId from localStorage (fall back to cookie for OAuth flows)
   *   2. Call posthog.alias(user.id) ONLY if current distinct_id is `sub_<uuid>`.
   *      The single-arg form aliases the CURRENT distinct_id to user.id —
   *      so we must alias before identify, not after (identify swaps the id).
   *   3. Call posthog.identify(user.id, { ..., subscriber_id }) — sets the
   *      canonical distinct_id and attaches subscriber_id as a person property
   *      so HogQL can join even if the alias step silently no-ops.
   *   4. Cleanup the storage so subsequent identifies don't re-alias.
   */
  const identifyUser = useCallback(
    (user: {
      id: string;
      email?: string | null;
      name?: string | null;
      username?: string | null;
    }) => {
      if (typeof window === 'undefined' || !posthog) return;

      let subscriberId: string | null = null;
      try {
        subscriberId = localStorage.getItem('tldrsec_sub_id');
      } catch {}
      if (!subscriberId) {
        const m = document.cookie.match(/(?:^|;\s*)tldrsec_sub_id=([^;]+)/);
        subscriberId = m?.[1] ?? null;
      }

      if (subscriberId) {
        // Only alias if PostHog still has the subscriber distinct_id active.
        // Prevents corrupting an already-identified user's timeline if a stale
        // tldrsec_sub_id is sitting in storage from a return visitor.
        const currentId = typeof posthog.get_distinct_id === 'function'
          ? posthog.get_distinct_id()
          : null;
        if (currentId === `sub_${subscriberId}`) {
          posthog.alias(user.id);
        }
      }

      posthog.identify(user.id, {
        email: user.email ?? undefined,
        name: user.name ?? undefined,
        username: user.username ?? undefined,
        clerk_id: user.id,
        subscriber_id: subscriberId ?? undefined,
      });

      if (subscriberId) {
        try { localStorage.removeItem('tldrsec_sub_id'); } catch {}
        try { document.cookie = 'tldrsec_sub_id=; path=/; max-age=0'; } catch {}
      }
    },
    []
  );

  return {
    trackEvent,
    trackRaw,
    trackPageView,
    identifyUser,
  };
};
