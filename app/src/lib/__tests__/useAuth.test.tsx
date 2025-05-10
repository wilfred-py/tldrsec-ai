import { renderHook, act, waitFor } from '@testing-library/react';
import { useAuth, useCsrfToken, AuthProvider } from '@/hooks/useAuth';
import { useUser, useAuth as useClerkAuth } from '@clerk/nextjs';
import { ReactNode } from 'react';

// Mock clerk hooks
jest.mock('@clerk/nextjs', () => ({
  useUser: jest.fn(),
  useAuth: jest.fn(),
}));

// Mock fetch API
global.fetch = jest.fn();

// Increase timeout for slower tests
jest.setTimeout(15000);

describe('Auth Hooks', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <AuthProvider>{children}</AuthProvider>
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useAuth hook', () => {
    it('should return null user when not authenticated', () => {
      // Mock useUser to return loading state
      (useUser as unknown as jest.Mock).mockReturnValue({
        isLoaded: true, // explicitly set to true for this test
        isSignedIn: false,
        user: null,
      });
      
      (useClerkAuth as unknown as jest.Mock).mockReturnValue({
        getToken: jest.fn(),
      });

      const { result } = renderHook(() => useAuth(), { wrapper });
      
      // When isLoaded is true but no user is signed in, isLoading should be false
      // and user should be null
      expect(result.current.user).toBe(null);
      expect(result.current.isLoading).toBe(false);
    });

    it('should fetch and return user data when authenticated', async () => {
      // Mock useUser to return authenticated state
      (useUser as unknown as jest.Mock).mockReturnValue({
        isLoaded: true,
        isSignedIn: true,
        user: {
          id: 'user_123',
          primaryEmailAddress: {
            emailAddress: 'test@example.com',
          },
        },
      });
      
      (useClerkAuth as unknown as jest.Mock).mockReturnValue({
        getToken: jest.fn(),
      });

      // Mock fetch to return user data
      (global.fetch as unknown as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          id: 'db_123',
          email: 'test@example.com',
          role: 'admin',
        }),
      });

      const { result } = renderHook(() => useAuth(), { wrapper });
      
      // Wait for the async operation to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });
      
      // Check the final state
      expect(result.current.user).toEqual({
        userId: 'user_123',
        userEmail: 'test@example.com',
        dbUserId: 'db_123',
        hasDbAccount: true,
        role: 'admin',
      });
      expect(result.current.hasDbAccount).toBe(true);
      expect(result.current.isAdmin).toBe(true);
    }, 10000); // Add timeout for this test

    it('should handle fetch errors', async () => {
      // Mock useUser to return authenticated state
      (useUser as unknown as jest.Mock).mockReturnValue({
        isLoaded: true,
        isSignedIn: true,
        user: {
          id: 'user_123',
          primaryEmailAddress: {
            emailAddress: 'test@example.com',
          },
        },
      });
      
      (useClerkAuth as unknown as jest.Mock).mockReturnValue({
        getToken: jest.fn(),
      });

      // Mock fetch to return error
      (global.fetch as unknown as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: jest.fn().mockRejectedValue(new Error('Failed to parse JSON')),
      });

      const { result } = renderHook(() => useAuth(), { wrapper });
      
      // Wait for the async operation to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 10000 });
      
      // Check the error handling
      expect(result.current.error).not.toBeNull();
      expect(result.current.user?.hasDbAccount).toBe(false);
    }, 10000); // Add timeout for this test

    it('should provide a refetch method', async () => {
      // Mock useUser to return authenticated state
      (useUser as unknown as jest.Mock).mockReturnValue({
        isLoaded: true,
        isSignedIn: true,
        user: {
          id: 'user_123',
          primaryEmailAddress: {
            emailAddress: 'test@example.com',
          },
        },
      });
      
      (useClerkAuth as unknown as jest.Mock).mockReturnValue({
        getToken: jest.fn(),
      });

      // Mock fetch to return user data
      (global.fetch as unknown as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          id: 'db_123',
          email: 'test@example.com',
          role: 'user',
        }),
      });

      const { result } = renderHook(() => useAuth(), { wrapper });
      
      // Wait for initial load
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 10000 });
      
      // Clear the mock and set up for refetch
      (global.fetch as unknown as jest.Mock).mockClear();
      (global.fetch as unknown as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          id: 'db_123',
          email: 'test@example.com',
          role: 'admin', // Changed role
        }),
      });
      
      // Call refetch
      await act(async () => {
        await result.current.refetch();
      });
      
      // Check that fetch was called again
      expect(global.fetch).toHaveBeenCalledTimes(1);
      
      // Wait for the refetch to complete
      await waitFor(() => {
        expect(result.current.user?.role).toBe('admin');
      }, { timeout: 10000 });
    }, 15000); // Add longer timeout for this test
  });

  describe('useCsrfToken hook', () => {
    it('should fetch CSRF token on mount', async () => {
      // Mock fetch to return CSRF token
      (global.fetch as unknown as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          csrfToken: 'csrf-token-123',
        }),
      });

      const { result } = renderHook(() => useCsrfToken());
      
      // Wait for the async operation to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 10000 });
      
      // Check the final state
      expect(result.current.csrfToken).toBe('csrf-token-123');
      expect(result.current.error).toBeNull();
    }, 10000); // Add timeout for this test

    it('should handle fetch errors', async () => {
      // Mock fetch to return error
      (global.fetch as unknown as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: jest.fn().mockRejectedValue(new Error('Failed to parse JSON')),
      });

      const { result } = renderHook(() => useCsrfToken());
      
      // Wait for the async operation to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 10000 });
      
      // Check the error handling
      expect(result.current.error).not.toBeNull();
      expect(result.current.csrfToken).toBeNull();
    }, 10000); // Add timeout for this test

    it('should provide a refreshToken method', async () => {
      // Mock fetch to return CSRF token
      (global.fetch as unknown as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          csrfToken: 'csrf-token-123',
        }),
      });

      const { result } = renderHook(() => useCsrfToken());
      
      // Wait for initial load
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 10000 });
      
      // Clear the mock and set up for refresh
      (global.fetch as unknown as jest.Mock).mockClear();
      (global.fetch as unknown as jest.Mock).mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          csrfToken: 'new-csrf-token-456',
        }),
      });
      
      // Call refreshToken
      await act(async () => {
        await result.current.refreshToken();
      });
      
      // Check that fetch was called again
      expect(global.fetch).toHaveBeenCalledTimes(1);
      
      // Wait for the refresh to complete
      await waitFor(() => {
        expect(result.current.csrfToken).toBe('new-csrf-token-456');
      }, { timeout: 10000 });
    }, 15000); // Add longer timeout for this test
  });
});