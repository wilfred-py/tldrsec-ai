'use client';

import { useCallback } from 'react';
import posthog from 'posthog-js';
import { usePathname, useSearchParams } from 'next/navigation';
import { useUser } from '@clerk/nextjs';

export type EventProperties = Record<string, any>;

/**
 * Custom hook for tracking events and page views with PostHog
 */
export const useAnalytics = () => {
  const { user } = useUser();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /**
   * Track a custom event
   * @param eventName Name of the event to track
   * @param properties Optional properties to include with the event
   */
  const trackEvent = useCallback(
    (eventName: string, properties?: EventProperties) => {
      if (typeof window !== 'undefined' && posthog) {
        // Add user information to event properties if available
        const userProperties = user
          ? {
              user_id: user.id,
              email: user.primaryEmailAddress?.emailAddress,
              name: user.fullName || user.username,
            }
          : {};

        posthog.capture(eventName, {
          ...userProperties,
          ...properties,
          path: pathname,
        });
      }
    },
    [pathname, user]
  );

  /**
   * Track a page view event
   * @param properties Optional properties to include with the page view event
   */
  const trackPageView = useCallback(
    (properties?: EventProperties) => {
      if (typeof window !== 'undefined' && posthog) {
        // Get current URL params
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
   * Identify the current user
   */
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
    trackPageView,
    identifyUser,
  };
}; 