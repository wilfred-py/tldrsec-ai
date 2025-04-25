import { apiRequest } from "./queryClient";
import { useState, useEffect } from "react";
import { queryClient } from "./queryClient";

export type AuthUser = {
  id: number;
  username: string;
  email: string;
  darkMode: boolean;
  lastLoginAt?: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  subscriptionStatus?: string | null;
};

export type AuthState = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
};

export async function registerUser(username: string, email: string, password: string): Promise<AuthUser> {
  const response = await apiRequest("POST", "/api/auth/register", { username, email, password });
  return response.json();
}

export async function loginUser(email: string, password: string): Promise<AuthUser> {
  const response = await apiRequest("POST", "/api/auth/login", { email, password });
  return response.json();
}

export async function oauthLogin(provider: string, providerId: string, email: string, username?: string): Promise<AuthUser> {
  const response = await apiRequest("POST", "/api/auth/oauth", { provider, providerId, email, username });
  return response.json();
}

export async function logoutUser(): Promise<void> {
  await apiRequest("POST", "/api/auth/logout", {});
  // Clear all query data and redirect to home page
  queryClient.clear();
  // Redirect to home page after logout - ensure this runs on the client side
  if (typeof window !== 'undefined') {
    window.location.href = '/';
  }
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const response = await apiRequest("GET", "/api/auth/me", undefined);
    return response.json();
  } catch (error) {
    return null;
  }
}

export function useAuth(): AuthState & {
  login: (email: string, password: string) => Promise<void>;
  register: (username: string, email: string, password: string) => Promise<void>;
  loginWithOAuth: (provider: string, providerId: string, email: string, username?: string) => Promise<void>;
  logout: () => Promise<void>;
} {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    async function fetchUser() {
      try {
        const user = await getCurrentUser();
        setState({
          user,
          isAuthenticated: !!user,
          isLoading: false,
          error: null,
        });
      } catch (error) {
        setState({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          error: "Failed to get current user",
        });
      }
    }

    fetchUser();
  }, []);

  async function login(email: string, password: string) {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const user = await loginUser(email, password);
      setState({
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: "Invalid credentials",
      }));
      throw error;
    }
  }

  async function register(username: string, email: string, password: string) {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const user = await registerUser(username, email, password);
      setState({
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: "Registration failed",
      }));
      throw error;
    }
  }

  async function loginWithOAuth(provider: string, providerId: string, email: string, username?: string) {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const user = await oauthLogin(provider, providerId, email, username);
      setState({
        user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: "OAuth login failed",
      }));
      throw error;
    }
  }

  async function logout() {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      await logoutUser();
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: "Logout failed",
      }));
      throw error;
    }
  }

  return {
    ...state,
    login,
    register,
    loginWithOAuth,
    logout,
  };
}
