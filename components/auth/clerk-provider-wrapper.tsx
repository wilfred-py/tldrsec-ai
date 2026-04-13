'use client';

import { ClerkProvider } from '@clerk/nextjs';
import { ReactNode } from 'react';

interface ClerkProviderWrapperProps {
  children: ReactNode;
  signInFallbackRedirectUrl?: string;
  signUpFallbackRedirectUrl?: string;
  signUpUrl?: string;
  signInUrl?: string;
}

/**
 * Wrapper around ClerkProvider that handles missing publishable key during build time.
 * Session lifetime is configured in Clerk Dashboard > Settings > Sessions, not in code.
 */
export function ClerkProviderWrapper({
  children,
  signInFallbackRedirectUrl,
  signUpFallbackRedirectUrl,
  signUpUrl,
  signInUrl
}: ClerkProviderWrapperProps) {
  // During build time, if Clerk publishable key is missing, render children without ClerkProvider
  // This allows static generation to succeed while maintaining functionality at runtime
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  
  // Check if we're in build/static generation context
  const isBuildTime = (
    typeof window === 'undefined' && 
    (!publishableKey || publishableKey.length === 0)
  );
  
  if (isBuildTime) {
    console.warn('⚠️  ClerkProvider: Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY during build - skipping Clerk initialization');
    return <>{children}</>;
  }
  
  return (
    <ClerkProvider
      signUpFallbackRedirectUrl={signUpFallbackRedirectUrl}
      signInFallbackRedirectUrl={signInFallbackRedirectUrl}
      signUpUrl={signUpUrl}
      signInUrl={signInUrl}
    >
      {children}
    </ClerkProvider>
  );
}