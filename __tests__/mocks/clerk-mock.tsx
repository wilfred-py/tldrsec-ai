import React, { ReactNode } from 'react';

// Mock data
export const mockUser = {
  id: 'user_123',
  fullName: 'Test User',
  username: 'testuser',
  primaryEmailAddress: {
    emailAddress: 'test@example.com',
    id: 'email_123',
    verification: { status: 'verified' }
  },
};

// Mock Clerk hooks
export const mockUseUser = jest.fn().mockReturnValue({
  isSignedIn: true,
  user: mockUser,
  isLoaded: true,
});

export const mockUseAuth = jest.fn().mockReturnValue({
  isSignedIn: true,
  isLoaded: true,
  signOut: jest.fn().mockResolvedValue(undefined),
});

export const mockUseSignIn = jest.fn().mockReturnValue({
  isLoaded: true,
  signIn: {
    create: jest.fn().mockResolvedValue({ status: 'complete', createdSessionId: 'session_123' }),
    attemptFirstFactor: jest.fn().mockResolvedValue({ status: 'complete' }),
    prepareFirstFactor: jest.fn().mockResolvedValue({}),
  },
  setActive: jest.fn().mockResolvedValue({}),
});

export const mockUseSignUp = jest.fn().mockReturnValue({
  isLoaded: true,
  signUp: {
    create: jest.fn().mockResolvedValue({ status: 'complete' }),
    prepareEmailAddressVerification: jest.fn().mockResolvedValue({}),
    attemptEmailAddressVerification: jest.fn().mockResolvedValue({ 
      status: 'complete',
      createdSessionId: 'session_123',
    }),
  },
  setActive: jest.fn().mockResolvedValue({}),
});

export const mockUseClerk = jest.fn().mockReturnValue({
  openSignIn: jest.fn(),
  openSignUp: jest.fn(),
});

// Unauthenticated versions
export const mockUseUserUnauthenticated = jest.fn().mockReturnValue({
  isSignedIn: false,
  user: null,
  isLoaded: true,
});

export const mockUseAuthUnauthenticated = jest.fn().mockReturnValue({
  isSignedIn: false,
  isLoaded: true,
  signOut: jest.fn().mockResolvedValue(undefined),
});

// Loading versions
export const mockUseUserLoading = jest.fn().mockReturnValue({
  isSignedIn: undefined,
  user: null,
  isLoaded: false,
});

// Mock Clerk Provider
export const MockClerkProvider = ({ children }: { children: ReactNode }) => {
  return <>{children}</>;
};

// Helper to setup authentication mocks
export const setupAuthMocks = (isAuthenticated = true, isLoading = false) => {
  if (isLoading) {
    jest.mock('@clerk/nextjs', () => ({
      useUser: mockUseUserLoading,
      useAuth: mockUseAuthUnauthenticated,
      useSignIn: mockUseSignIn,
      useSignUp: mockUseSignUp,
      useClerk: mockUseClerk,
      ClerkProvider: MockClerkProvider,
    }));
  } else if (isAuthenticated) {
    jest.mock('@clerk/nextjs', () => ({
      useUser: mockUseUser,
      useAuth: mockUseAuth,
      useSignIn: mockUseSignIn,
      useSignUp: mockUseSignUp,
      useClerk: mockUseClerk,
      ClerkProvider: MockClerkProvider,
    }));
  } else {
    jest.mock('@clerk/nextjs', () => ({
      useUser: mockUseUserUnauthenticated,
      useAuth: mockUseAuthUnauthenticated,
      useSignIn: mockUseSignIn,
      useSignUp: mockUseSignUp,
      useClerk: mockUseClerk,
      ClerkProvider: MockClerkProvider,
    }));
  }
}; 