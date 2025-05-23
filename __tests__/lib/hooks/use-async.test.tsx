import { renderHook, act } from '@testing-library/react';
import { useAsync } from '@/lib/hooks/use-async';
import { toast } from 'sonner';
import { ApiResponse } from '@/lib/api/types';

// Mock the toast module
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

describe('useAsync Hook', () => {
  // Reset mocks between tests
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with default values', () => {
    const { result } = renderHook(() => useAsync<string[]>());
    
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should initialize with provided initial data', () => {
    const initialData = ['item1', 'item2'];
    const { result } = renderHook(() => useAsync<string[]>(initialData));
    
    expect(result.current.data).toEqual(initialData);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should update loading state during execution', async () => {
    const { result } = renderHook(() => useAsync<string[]>());
    
    // Define an async function that will resolve after a small delay
    const asyncFn = (): Promise<ApiResponse<string[]>> => new Promise(resolve => {
      setTimeout(() => {
        resolve({ data: ['item1', 'item2'] });
      }, 10);
    });
    
    // Call the execute function
    let promise: any;
    act(() => {
      promise = result.current.execute(asyncFn);
    });
    
    // Check that loading is true immediately after execution starts
    expect(result.current.isLoading).toBe(true);
    
    // Wait for the promise to resolve
    await act(async () => {
      await promise;
    });
    
    // Check that loading is false after execution completes
    expect(result.current.isLoading).toBe(false);
  });

  it('should set data on successful API response', async () => {
    const { result } = renderHook(() => useAsync<string[]>());
    
    const mockData = ['item1', 'item2'];
    const asyncFn = jest.fn().mockResolvedValue({ data: mockData });
    
    await act(async () => {
      await result.current.execute(asyncFn);
    });
    
    expect(result.current.data).toEqual(mockData);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should handle API errors correctly', async () => {
    const { result } = renderHook(() => useAsync<string[]>());
    
    const errorMessage = 'API error occurred';
    const asyncFn = jest.fn().mockResolvedValue({ 
      error: { status: 500, message: errorMessage } 
    });
    
    await act(async () => {
      await result.current.execute(asyncFn);
    });
    
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(errorMessage);
    
    // Should show error toast
    expect(toast.error).toHaveBeenCalled();
  });

  it('should handle network errors correctly', async () => {
    const { result } = renderHook(() => useAsync<string[]>());
    
    const networkError = new Error('Network failure');
    const asyncFn = jest.fn().mockRejectedValue(networkError);
    
    await act(async () => {
      await result.current.execute(asyncFn);
    });
    
    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe('Network failure');
    
    // Should show error toast
    expect(toast.error).toHaveBeenCalled();
  });

  it('should call onSuccess callback when API call succeeds', async () => {
    const { result } = renderHook(() => useAsync<string[]>());
    
    const mockData = ['item1', 'item2'];
    const asyncFn = jest.fn().mockResolvedValue({ data: mockData });
    const onSuccess = jest.fn();
    
    await act(async () => {
      await result.current.execute(asyncFn, { onSuccess });
    });
    
    expect(onSuccess).toHaveBeenCalledWith(mockData);
  });

  it('should call onError callback when API call fails', async () => {
    const { result } = renderHook(() => useAsync<string[]>());
    
    const errorMessage = 'API error occurred';
    const asyncFn = jest.fn().mockResolvedValue({ 
      error: { status: 500, message: errorMessage } 
    });
    const onError = jest.fn();
    
    await act(async () => {
      await result.current.execute(asyncFn, { onError });
    });
    
    expect(onError).toHaveBeenCalledWith(errorMessage);
  });

  it('should show success toast when provided', async () => {
    const { result } = renderHook(() => useAsync<string[]>());
    
    const mockData = ['item1', 'item2'];
    const asyncFn = jest.fn().mockResolvedValue({ data: mockData });
    const successMessage = 'Operation successful';
    
    await act(async () => {
      await result.current.execute(asyncFn, { successMessage });
    });
    
    expect(toast.success).toHaveBeenCalledWith(successMessage);
  });

  it('should support optimistic updates with setData', () => {
    const initialData = ['item1', 'item2'];
    const { result } = renderHook(() => useAsync<string[]>(initialData));
    
    const updatedData = ['item1', 'item2', 'item3'];
    
    act(() => {
      result.current.setData(updatedData);
    });
    
    expect(result.current.data).toEqual(updatedData);
  });

  it('should reset state correctly', () => {
    const initialData = ['initial'];
    const { result } = renderHook(() => useAsync<string[]>(initialData));
    
    // First, modify the state
    act(() => {
      result.current.setData(['modified']);
    });
    
    expect(result.current.data).toEqual(['modified']);
    
    // Then reset it
    act(() => {
      result.current.reset();
    });
    
    // Should go back to initial data
    expect(result.current.data).toEqual(initialData);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });
}); 