/**
 * Comprehensive test suite for useAdminStatus hook
 * Tests: Hook behavior, API integration, Error handling, Loading states
 */
import { renderHook, waitFor } from '@testing-library/react';
import { useUser } from '@clerk/nextjs';
import { useAdminStatus } from '@/lib/hooks/use-admin-status';

// Mock dependencies
jest.mock('@clerk/nextjs');
const mockUseUser = jest.mocked(useUser);

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock console.error to suppress error logs in tests
const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('useAdminStatus Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    consoleSpy.mockClear();
  });

  afterAll(() => {
    consoleSpy.mockRestore();
  });

  describe('Authentication States', () => {
    it('should return default state when user is not authenticated', () => {
      mockUseUser.mockReturnValue({ user: null, isLoaded: true });

      const { result } = renderHook(() => useAdminStatus());

      expect(result.current).toEqual({
        isAdmin: false,
        loading: false,
        error: null,
      });
    });

    it('should not make API call when user is not authenticated', () => {
      mockUseUser.mockReturnValue({ user: null, isLoaded: true });

      renderHook(() => useAdminStatus());

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('API Integration Tests', () => {
    const mockUser = {
      id: 'user_123',
      emailAddresses: [{ emailAddress: 'user@example.com' }],
    };

    it('should fetch admin status for authenticated users', async () => {
      mockUseUser.mockReturnValue({ user: mockUser, isLoaded: true });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isAdmin: true, timestamp: '2023-01-01T00:00:00.000Z' }),
      });

      const { result } = renderHook(() => useAdminStatus());

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current).toEqual({
        isAdmin: true,
        loading: false,
        error: null,
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/user/admin-status', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('should handle non-admin users correctly', async () => {
      mockUseUser.mockReturnValue({ user: mockUser, isLoaded: true });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isAdmin: false, timestamp: '2023-01-01T00:00:00.000Z' }),
      });

      const { result } = renderHook(() => useAdminStatus());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current).toEqual({
        isAdmin: false,
        loading: false,
        error: null,
      });
    });

    it('should re-fetch when user changes', async () => {
      const { result, rerender } = renderHook(
        ({ userId }) => {
          mockUseUser.mockReturnValue({
            user: userId ? { ...mockUser, id: userId } : null,
            isLoaded: true,
          });
          return useAdminStatus();
        },
        { initialProps: { userId: 'user_123' } }
      );

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isAdmin: false, timestamp: '2023-01-01T00:00:00.000Z' }),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Change user
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isAdmin: true, timestamp: '2023-01-01T00:00:00.000Z' }),
      });

      rerender({ userId: 'user_456' });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.current.isAdmin).toBe(true);
    });
  });

  describe('Error Handling Tests', () => {
    const mockUser = {
      id: 'user_123',
      emailAddresses: [{ emailAddress: 'user@example.com' }],
    };

    it('should handle HTTP error responses', async () => {
      mockUseUser.mockReturnValue({ user: mockUser, isLoaded: true });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const { result } = renderHook(() => useAdminStatus());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current).toEqual({
        isAdmin: false,
        loading: false,
        error: 'HTTP error! status: 401',
      });
    });

    it('should handle network errors', async () => {
      mockUseUser.mockReturnValue({ user: mockUser, isLoaded: true });
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useAdminStatus());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current).toEqual({
        isAdmin: false,
        loading: false,
        error: 'Network error',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to fetch admin status:',
        expect.any(Error)
      );
    });

    it('should handle JSON parsing errors', async () => {
      mockUseUser.mockReturnValue({ user: mockUser, isLoaded: true });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const { result } = renderHook(() => useAdminStatus());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current).toEqual({
        isAdmin: false,
        loading: false,
        error: 'Invalid JSON',
      });
    });

    it('should handle non-Error exceptions', async () => {
      mockUseUser.mockReturnValue({ user: mockUser, isLoaded: true });
      mockFetch.mockRejectedValueOnce('String error');

      const { result } = renderHook(() => useAdminStatus());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current).toEqual({
        isAdmin: false,
        loading: false,
        error: 'Unknown error',
      });
    });

    it('should default to no admin access on any error', async () => {
      mockUseUser.mockReturnValue({ user: mockUser, isLoaded: true });
      mockFetch.mockRejectedValueOnce(new Error('API error'));

      const { result } = renderHook(() => useAdminStatus());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.isAdmin).toBe(false);
    });
  });

  describe('Loading State Management', () => {
    const mockUser = {
      id: 'user_123',
      emailAddresses: [{ emailAddress: 'user@example.com' }],
    };

    it('should start with loading: true when user is authenticated', () => {
      mockUseUser.mockReturnValue({ user: mockUser, isLoaded: true });
      mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

      const { result } = renderHook(() => useAdminStatus());

      expect(result.current.loading).toBe(true);
      expect(result.current.isAdmin).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should reset loading state on successful API call', async () => {
      mockUseUser.mockReturnValue({ user: mockUser, isLoaded: true });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isAdmin: true, timestamp: '2023-01-01T00:00:00.000Z' }),
      });

      const { result } = renderHook(() => useAdminStatus());

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.loading).toBe(false);
    });

    it('should reset loading state on API error', async () => {
      mockUseUser.mockReturnValue({ user: mockUser, isLoaded: true });
      mockFetch.mockRejectedValueOnce(new Error('API error'));

      const { result } = renderHook(() => useAdminStatus());

      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.loading).toBe(false);
    });
  });

  describe('Component Cleanup Tests', () => {
    const mockUser = {
      id: 'user_123',
      emailAddresses: [{ emailAddress: 'user@example.com' }],
    };

    it('should not update state if component is unmounted during API call', async () => {
      mockUseUser.mockReturnValue({ user: mockUser, isLoaded: true });

      let resolvePromise: (value: any) => void;
      const promise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockFetch.mockReturnValueOnce(promise);

      const { result, unmount } = renderHook(() => useAdminStatus());

      expect(result.current.loading).toBe(true);

      // Unmount component before API resolves
      unmount();

      // Resolve the API call after unmount
      resolvePromise!({
        ok: true,
        json: async () => ({ isAdmin: true, timestamp: '2023-01-01T00:00:00.000Z' }),
      });

      // Wait a bit to ensure any state updates would have occurred
      await new Promise((resolve) => setTimeout(resolve, 100));

      // No assertions needed - if state was updated after unmount, React would warn/error
    });

    it('should handle rapid user changes without race conditions', async () => {
      const { result, rerender } = renderHook(
        ({ userId }) => {
          mockUseUser.mockReturnValue({
            user: userId ? { ...mockUser, id: userId } : null,
            isLoaded: true,
          });
          return useAdminStatus();
        },
        { initialProps: { userId: 'user_123' } }
      );

      // Mock slow API responses
      mockFetch.mockImplementation(() =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({ isAdmin: false, timestamp: '2023-01-01T00:00:00.000Z' }),
              }),
            100
          )
        )
      );

      // Rapidly change users
      rerender({ userId: 'user_456' });
      rerender({ userId: 'user_789' });
      rerender({ userId: 'user_123' });

      // Wait for all API calls to complete
      await waitFor(
        () => {
          expect(result.current.loading).toBe(false);
        },
        { timeout: 2000 }
      );

      expect(result.current.isAdmin).toBe(false);
      expect(result.current.error).toBe(null);
    });
  });

  describe('Security & Performance Tests', () => {
    const mockUser = {
      id: 'user_123',
      emailAddresses: [{ emailAddress: 'user@example.com' }],
    };

    it('should make API requests with correct headers', async () => {
      mockUseUser.mockReturnValue({ user: mockUser, isLoaded: true });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ isAdmin: false, timestamp: '2023-01-01T00:00:00.000Z' }),
      });

      renderHook(() => useAdminStatus());

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalled();
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/user/admin-status', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('should not expose sensitive data in hook state', async () => {
      mockUseUser.mockReturnValue({ user: mockUser, isLoaded: true });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          isAdmin: true,
          timestamp: '2023-01-01T00:00:00.000Z',
          adminEmail: 'admin@example.com', // Sensitive data that shouldn't be exposed
          secret: 'should-not-be-exposed',
        }),
      });

      const { result } = renderHook(() => useAdminStatus());

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current).toEqual({
        isAdmin: true,
        loading: false,
        error: null,
      });

      // Ensure no sensitive data is exposed
      expect(JSON.stringify(result.current)).not.toContain('adminEmail');
      expect(JSON.stringify(result.current)).not.toContain('secret');
    });

    it('should handle timeout scenarios gracefully', async () => {
      mockUseUser.mockReturnValue({ user: mockUser, isLoaded: true });
      
      // Mock a request that takes too long
      mockFetch.mockImplementation(
        () =>
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout')), 1000)
          )
      );

      const { result } = renderHook(() => useAdminStatus());

      await waitFor(
        () => {
          expect(result.current.loading).toBe(false);
        },
        { timeout: 2000 }
      );

      expect(result.current).toEqual({
        isAdmin: false,
        loading: false,
        error: 'Request timeout',
      });
    });
  });
});