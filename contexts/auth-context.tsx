'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useUser } from '@clerk/nextjs';
import type { UserResource } from '@clerk/types';

interface AuthContextValue {
  isSignedIn: boolean;
  isLoaded: boolean;
  user: UserResource | null | undefined;
  isOnboarded: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // During build time without ClerkProvider, useUser throws.
  // Provide safe defaults so static generation succeeds.
  let isSignedIn = false;
  let isLoaded = false;
  let user: UserResource | null | undefined = null;

  try {
    const clerkUser = useUser();
    isSignedIn = clerkUser.isSignedIn ?? false;
    isLoaded = clerkUser.isLoaded;
    user = clerkUser.user;
  } catch {
    // ClerkProvider not available (build time / missing keys)
  }

  const isOnboarded = Boolean(user?.publicMetadata?.onboardingCompleted);

  const value = {
    isSignedIn,
    isLoaded,
    user,
    isOnboarded,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
