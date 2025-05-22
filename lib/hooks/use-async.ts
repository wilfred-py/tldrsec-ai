import { useState, useCallback } from 'react';
import { ApiResponse } from '@/lib/api/types';
import { toast } from 'sonner';

interface AsyncState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Custom hook for handling async operations with loading, error, and success states
 */
export function useAsync<T>(initialData: T | null = null) {
  const [state, setState] = useState<AsyncState<T>>({
    data: initialData,
    isLoading: false,
    error: null,
  });

  /**
   * Execute an async function with automatic loading state management
   */
  const execute = useCallback(
    async <R>(
      asyncFn: () => Promise<ApiResponse<R>>,
      options?: {
        onSuccess?: (data: R) => void;
        onError?: (error: string) => void;
        successMessage?: string;
        errorMessage?: string;
      }
    ) => {
      const {
        onSuccess,
        onError,
        successMessage,
        errorMessage = 'An error occurred. Please try again.',
      } = options || {};

      setState(prev => ({ ...prev, isLoading: true, error: null }));

      try {
        const response = await asyncFn();

        if (response.error && response.error.message) {
          setState(prev => ({
            ...prev,
            isLoading: false,
            error: response.error?.message || 'Unknown error',
          }));

          // Show error toast
          toast.error(errorMessage || response.error.message);
          
          // Call custom error handler if provided
          if (onError) {
            onError(response.error.message);
          }
          
          return { success: false, data: null };
        }

        if (response.data) {
          setState(prev => ({
            ...prev,
            isLoading: false,
            data: response.data as unknown as T,
          }));

          // Show success toast if provided
          if (successMessage) {
            toast.success(successMessage);
          }

          // Call custom success handler if provided
          if (onSuccess) {
            onSuccess(response.data);
          }

          return { success: true, data: response.data };
        }

        setState(prev => ({ ...prev, isLoading: false }));
        return { success: false, data: null };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error occurred';
        
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: errorMsg,
        }));

        // Show error toast
        toast.error(errorMessage);
        
        // Call custom error handler if provided
        if (onError) {
          onError(errorMsg);
        }
        
        return { success: false, data: null };
      }
    },
    []
  );

  return {
    ...state,
    execute,
    // Reset the state
    reset: useCallback(() => {
      setState({
        data: initialData,
        isLoading: false,
        error: null,
      });
    }, [initialData]),
    // Set data directly (useful for optimistic updates)
    setData: useCallback((data: T | null) => {
      setState(prev => ({ ...prev, data }));
    }, []),
  };
} 