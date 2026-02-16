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
  const { isSignedIn, isLoaded, user } = useUser();
  const isOnboarded = Boolean(user?.publicMetadata?.onboardingCompleted);

  const value = {
    isSignedIn: isSignedIn ?? false,
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
