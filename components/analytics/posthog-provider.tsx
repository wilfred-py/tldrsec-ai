'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';
import { PostHogProvider as PHProvider } from 'posthog-js/react';

// Initialize PostHog in a client component
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Initialize PostHog
    posthog.init(
      // Your PostHog API key (use environment variable in production)
      process.env.NEXT_PUBLIC_POSTHOG_KEY || 'phc_your_key_here',
      {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://app.posthog.com',
        // Enable debug mode in development
        loaded: (posthog) => {
          if (process.env.NODE_ENV === 'development') posthog.debug();
        },
        // Disable capturing by default in development
        capture_pageview: process.env.NODE_ENV === 'production',
        // Disable in development mode by default
        autocapture: process.env.NODE_ENV === 'production',
      }
    );

    // No cleanup needed - PostHog handles cleanup on its own
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
} 