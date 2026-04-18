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
   */
  const identifyUser = useCallback(
    (user: {
      id: string;
      email?: string | null;
      name?: string | null;
      username?: string | null;
    }) => {
      if (typeof window !== 'undefined' && posthog) {
        posthog.identify(user.id, {
          email: user.email ?? undefined,
          name: user.name ?? undefined,
          username: user.username ?? undefined,
          clerk_id: user.id,
        });
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
