import React, { ReactNode } from 'react';
import { mockUser } from './clerk-mock';

// Define a proper type for the auth context
type AuthContextType = {
  isAuthenticated: boolean;
  isLoading: boolean;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  signOut: () => Promise<void>;
  redirectToSignIn: () => void;
  redirectToSignUp: () => void;
};

// Mock auth context values
export const mockAuthContext: AuthContextType = {
  isAuthenticated: true,
  isLoading: false,
  userId: mockUser.id,
  userEmail: mockUser.primaryEmailAddress.emailAddress,
  userName: mockUser.fullName,
  signOut: jest.fn().mockResolvedValue(undefined),
  redirectToSignIn: jest.fn(),
  redirectToSignUp: jest.fn(),
};

export const mockAuthContextUnauthenticated: AuthContextType = {
  isAuthenticated: false,
  isLoading: false,
  userId: null,
  userEmail: null,
  userName: null,
  signOut: jest.fn().mockResolvedValue(undefined),
  redirectToSignIn: jest.fn(),
  redirectToSignUp: jest.fn(),
};

export const mockAuthContextLoading: AuthContextType = {
  isAuthenticated: false,
  isLoading: true,
  userId: null,
  userEmail: null,
  userName: null,
  signOut: jest.fn().mockResolvedValue(undefined),
  redirectToSignIn: jest.fn(),
  redirectToSignUp: jest.fn(),
};

// Create the mock auth context
export const AuthContext = React.createContext<AuthContextType>(mockAuthContext);

// Mock AuthProvider component
export const MockAuthProvider = ({ 
  children,
  isAuthenticated = true,
  isLoading = false,
}: { 
  children: ReactNode;
  isAuthenticated?: boolean;
  isLoading?: boolean;
}) => {
  const value = isLoading 
    ? mockAuthContextLoading 
    : isAuthenticated 
      ? mockAuthContext 
      : mockAuthContextUnauthenticated;
  
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Mock for the useAuthContext hook
export const useAuthContext = jest.fn().mockImplementation(() => {
  return mockAuthContext;
});

// Setup auth context mocks
export const setupAuthContextMocks = (isAuthenticated = true, isLoading = false) => {
  if (isLoading) {
    jest.mock('@/lib/context/auth-context', () => ({
      useAuthContext: jest.fn().mockReturnValue(mockAuthContextLoading),
      AuthProvider: MockAuthProvider,
    }));
  } else if (isAuthenticated) {
    jest.mock('@/lib/context/auth-context', () => ({
      useAuthContext: jest.fn().mockReturnValue(mockAuthContext),
      AuthProvider: MockAuthProvider,
    }));
  } else {
    jest.mock('@/lib/context/auth-context', () => ({
      useAuthContext: jest.fn().mockReturnValue(mockAuthContextUnauthenticated),
      AuthProvider: MockAuthProvider,
    }));
  }
}; 