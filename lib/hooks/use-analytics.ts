'use client';

import { useCallback } from 'react';
import posthog from 'posthog-js';
import { usePathname, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import type { EventName, EventProps } from '@/lib/analytics/events';

export type EventProperties = Record<string, unknown>;

/**
 * Custom hook for tracking events and page views with PostHog.
 *
 * `trackEvent<E>(event, props)` is generic over the event name and enforces
 * correct property shape per event via `EventProps[E]`.
 *
 * `trackRaw(name, props)` is the untyped escape hatch for ad-hoc events
 * that aren't in the registry yet. Prefer `trackEvent`.
 */
export const useAnalytics = () => {
  const { user } = useUser();
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

  const identifyUser = useCallback(() => {
    if (typeof window !== 'undefined' && posthog && user) {
      posthog.identify(user.id, {
        email: user.primaryEmailAddress?.emailAddress,
        name: user.fullName || user.username,
        username: user.username,
        clerk_id: user.id,
      });
    }
  }, [user]);

  return {
    trackEvent,
    trackRaw,
    trackPageView,
    identifyUser,
  };
};
