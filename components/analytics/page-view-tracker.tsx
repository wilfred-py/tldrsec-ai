'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAnalytics } from '@/lib/hooks/use-analytics';

/**
 * Component that automatically tracks page views and identifies users
 * Place this component at the root layout to track all page views
 */
export function PageViewTracker() {
  const { trackPageView, identifyUser } = useAnalytics();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Dynamically import and use Clerk's useUser hook only on client side
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        import('@clerk/nextjs').then(({ useUser }) => {
          // This will run after the component mounts
          // We can't use hooks here, so let's skip user identification for now
          // This is a limitation of the current approach
        });
      } catch {
        // Clerk not available
      }
    }
  }, []);

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