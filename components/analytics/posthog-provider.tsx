'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';
import { classifyTrafficSource } from '@/lib/analytics/classify-traffic-source';

/**
 * PostHog client initialization.
 *
 * Key settings:
 * - `autocapture: production-only` — clicks/forms captured automatically in prod
 * - `capture_pageview: production-only` — automatic $pageview events
 * - `person_profiles: 'identified_only'` — don't create profiles for anonymous
 *    visitors (reduces quota spend massively)
 * - `session_recording`: globally enabled with aggressive masking. Inputs are
 *    masked by default. Any element rendering user-specific or filing content
 *    should have `data-sensitive` on it or be inside `.summary-content`,
 *    `.filing-chat`, or `.portfolio-data`.
 *
 * `traffic_source` is registered as a super-property on first load so every
 * subsequent event is tagged (organic, social, direct, email, internal).
 */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    posthog.init(
      process.env.NEXT_PUBLIC_POSTHOG_KEY || 'phc_your_key_here',
      {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
        loaded: (ph) => {
          if (process.env.NODE_ENV === 'development') ph.debug();

          // Register traffic_source super-property from the current load's
          // referrer. Subsequent events in this session carry the tag.
          if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const utmMedium = params.get('utm_medium');
            const utmSource = params.get('utm_source');
            const trafficSource = classifyTrafficSource(
              document.referrer,
              window.location.href,
              utmMedium,
              utmSource,
            );
            ph.register({ traffic_source: trafficSource });
          }
        },
        capture_pageview: process.env.NODE_ENV === 'production',
        autocapture: process.env.NODE_ENV === 'production',
        // Don't create person profiles for anonymous visitors — saves quota.
        person_profiles: 'identified_only',
        session_recording: {
          maskAllInputs: true,
          // Any DOM matching these selectors has its text content masked in replays.
          // Add `data-sensitive` to any new component that renders user-specific
          // data (summaries, portfolios, filing chats, etc.).
          maskTextSelector:
            '[data-sensitive], .summary-content, .filing-chat, .portfolio-data',
        },
      }
    );
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
