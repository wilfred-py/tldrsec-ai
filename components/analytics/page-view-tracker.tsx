'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAnalytics } from '@/lib/hooks/use-analytics';
import { useUser } from '@clerk/nextjs';

/**
 * Component that automatically tracks page views and identifies users
 * Place this component at the root layout to track all page views
 */
export function PageViewTracker() {
  const { trackPageView, identifyUser } = useAnalytics();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  // Guard against missing ClerkProvider during build time
  let isSignedIn = false;
  let isLoaded = false;
  
  try {
    const user = useUser();
    isSignedIn = user.isSignedIn;
    isLoaded = user.isLoaded;
  } catch {
    // ClerkProvider not available (e.g., during build time) - continue with default values
    console.warn('⚠️  PageViewTracker: ClerkProvider not available, skipping user identification');
  }

  // Track page views when the path or search params change
  useEffect(() => {
    if (pathname) {
      trackPageView();
    }
  }, [pathname, searchParams, trackPageView]);

  // Identify user when they're signed in
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      identifyUser();
    }
  }, [isLoaded, isSignedIn, identifyUser]);

  // This component doesn't render anything
  return null;
} 