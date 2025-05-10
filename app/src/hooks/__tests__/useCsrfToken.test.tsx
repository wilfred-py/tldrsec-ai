import { renderHook, act, waitFor } from '@testing-library/react';
import { useCsrfToken } from '@/hooks/useAuth';

// Mock fetch
global.fetch = jest.fn();

// Increase timeout for slower tests
jest.setTimeout(15000);

describe('useCsrfToken Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch CSRF token on mount', async () => {
    // Mock successful fetch response
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        csrfToken: 'test-csrf-token',
      }),
    });

    const { result } = renderHook(() => useCsrfToken());

    // Initially loading with no token
    expect(result.current.isLoading).toBe(true);
    expect(result.current.csrfToken).toBe(null);
    expect(result.current.error).toBe(null);

    // Wait for fetch to complete
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    }, { timeout: 10000 });

    // Token should be available
    expect(result.current.csrfToken).toBe('test-csrf-token');
    expect(result.current.error).toBe(null);

    // Check that fetch was called
    expect(global.fetch).toHaveBeenCalledWith('/api/auth/csrf-token');
  }, 10000);

  it('should handle fetch errors', async () => {
    // Mock fetch error
    (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useCsrfToken());

    // Wait for fetch to complete
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    }, { timeout: 10000 });

    // Should have error state
    expect(result.current.csrfToken).toBe(null);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Network error');
  }, 10000);

  it('should handle API errors', async () => {
    // Mock failed API response
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });

    const { result } = renderHook(() => useCsrfToken());

    // Wait for fetch to complete
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    }, { timeout: 10000 });

    // Should have error state
    expect(result.current.csrfToken).toBe(null);
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Failed to fetch CSRF token');
  }, 10000);

  it('should refresh token when requested', async () => {
    // Mock successful fetch responses
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        csrfToken: 'initial-token',
      }),
    });

    const { result } = renderHook(() => useCsrfToken());

    // Wait for initial fetch to complete
    await waitFor(() => {
      expect(result.current.csrfToken).toBe('initial-token');
    }, { timeout: 10000 });

    // Mock second fetch with new token
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        csrfToken: 'refreshed-token',
      }),
    });

    // Call refresh token function
    await act(async () => {
      await result.current.refreshToken();
    });

    // Token should be updated
    expect(result.current.csrfToken).toBe('refreshed-token');
    expect(result.current.error).toBe(null);

    // Fetch should have been called twice
    expect(global.fetch).toHaveBeenCalledTimes(2);
  }, 10000);
});