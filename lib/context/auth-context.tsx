"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { useUser, useAuth, useClerk } from '@clerk/nextjs';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

// Define the auth context type
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

// Create the context with default values
const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true,
  userId: null,
  userEmail: null,
  userName: null,
  signOut: async () => {},
  redirectToSignIn: () => {},
  redirectToSignUp: () => {},
});

// Provider component that wraps your app and makes auth object available
export function AuthProvider({ children }: { children: ReactNode }) {
  const { isSignedIn, user, isLoaded } = useUser();
  const { signOut } = useAuth();
  const { openSignIn, openSignUp } = useClerk();
  const router = useRouter();
  
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isLoaded) {
      setIsLoading(false);
    }
  }, [isLoaded]);

  // Handle sign out with feedback
  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Successfully signed out');
      router.push('/');
    } catch (error) {
      toast.error('Failed to sign out');
      console.error('Sign out error:', error);
    }
  };

  // Redirect functions
  const redirectToSignIn = () => {
    openSignIn();
  };

  const redirectToSignUp = () => {
    openSignUp();
  };

  const value = {
    isAuthenticated: !!isSignedIn,
    isLoading,
    userId: user?.id || null,
    userEmail: user?.primaryEmailAddress?.emailAddress || null,
    userName: user?.fullName || user?.username || null,
    signOut: handleSignOut,
    redirectToSignIn,
    redirectToSignUp,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// Custom hook to use the auth context
export const useAuthContext = () => useContext(AuthContext); 