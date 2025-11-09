'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { trackPageAnalytics } from '@/lib/analytics/page-tracking';

interface ErrorRecoveryConfig {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  enableCircuitBreaker?: boolean;
  circuitBreakerThreshold?: number;
  circuitBreakerTimeout?: number;
}

interface ErrorRecoveryState {
  isRetrying: boolean;
  retryCount: number;
  lastError: Error | null;
  isCircuitBreakerOpen: boolean;
  lastAttemptTime: number;
  consecutiveFailures: number;
}

interface ErrorRecoveryReturn {
  state: ErrorRecoveryState;
  executeWithRetry: <T>(operation: () => Promise<T>) => Promise<T>;
  reset: () => void;
  canRetry: boolean;
  timeUntilNextRetry: number;
}

const DEFAULT_CONFIG: Required<ErrorRecoveryConfig> = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
  backoffFactor: 2,
  enableCircuitBreaker: true,
  circuitBreakerThreshold: 5,
  circuitBreakerTimeout: 60000, // 1 minute
};

export function useErrorRecovery(config: ErrorRecoveryConfig = {}): ErrorRecoveryReturn {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  const [state, setState] = useState<ErrorRecoveryState>({
    isRetrying: false,
    retryCount: 0,
    lastError: null,
    isCircuitBreakerOpen: false,
    lastAttemptTime: 0,
    consecutiveFailures: 0,
  });

  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const circuitBreakerTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (circuitBreakerTimeoutRef.current) {
        clearTimeout(circuitBreakerTimeoutRef.current);
      }
    };
  }, []);

  const calculateDelay = useCallback((attempt: number): number => {
    const delay = fullConfig.initialDelay * Math.pow(fullConfig.backoffFactor, attempt);
    return Math.min(delay, fullConfig.maxDelay);
  }, [fullConfig]);

  const openCircuitBreaker = useCallback(() => {
    if (!fullConfig.enableCircuitBreaker) return;

    setState(prev => ({ ...prev, isCircuitBreakerOpen: true }));

    // Auto-close circuit breaker after timeout
    circuitBreakerTimeoutRef.current = setTimeout(() => {
      setState(prev => ({ 
        ...prev, 
        isCircuitBreakerOpen: false,
        consecutiveFailures: 0,
        retryCount: 0
      }));
      
      trackPageAnalytics('newsletter', 'circuit_breaker_closed', {
        timeout: fullConfig.circuitBreakerTimeout,
      }).catch(console.error);
    }, fullConfig.circuitBreakerTimeout);

    trackPageAnalytics('newsletter', 'circuit_breaker_opened', {
      consecutive_failures: state.consecutiveFailures,
      threshold: fullConfig.circuitBreakerThreshold,
    }).catch(console.error);
  }, [fullConfig, state.consecutiveFailures]);

  const executeWithRetry = useCallback(async <T>(
    operation: () => Promise<T>
  ): Promise<T> => {
    // Check if circuit breaker is open
    if (state.isCircuitBreakerOpen) {
      const error = new Error('Circuit breaker is open - service temporarily unavailable');
      error.name = 'CircuitBreakerError';
      throw error;
    }

    // Check if we've exceeded max retries
    if (state.retryCount >= fullConfig.maxRetries) {
      const error = new Error(`Max retries (${fullConfig.maxRetries}) exceeded`);
      error.name = 'MaxRetriesExceededError';
      throw error;
    }

    setState(prev => ({ 
      ...prev, 
      isRetrying: true, 
      lastAttemptTime: Date.now() 
    }));

    try {
      const result = await operation();
      
      // Success - reset failure counters
      setState(prev => ({
        ...prev,
        isRetrying: false,
        retryCount: 0,
        lastError: null,
        consecutiveFailures: 0,
      }));

      // Track successful recovery if this was a retry
      if (state.retryCount > 0) {
        trackPageAnalytics('newsletter', 'error_recovery_success', {
          retry_count: state.retryCount,
          time_to_recovery: Date.now() - state.lastAttemptTime,
        }).catch(console.error);
      }

      return result;
    } catch (error) {
      const errorInstance = error instanceof Error ? error : new Error(String(error));
      
      setState(prev => ({
        ...prev,
        isRetrying: false,
        lastError: errorInstance,
        consecutiveFailures: prev.consecutiveFailures + 1,
      }));

      // Track the error attempt
      trackPageAnalytics('newsletter', 'error_recovery_attempt', {
        error_name: errorInstance.name,
        error_message: errorInstance.message.slice(0, 100),
        retry_count: state.retryCount,
        consecutive_failures: state.consecutiveFailures + 1,
      }).catch(console.error);

      // Check if we should open circuit breaker
      if (
        fullConfig.enableCircuitBreaker && 
        state.consecutiveFailures + 1 >= fullConfig.circuitBreakerThreshold
      ) {
        openCircuitBreaker();
        throw errorInstance;
      }

      // Check if we should retry
      if (state.retryCount < fullConfig.maxRetries) {
        return new Promise((resolve, reject) => {
          const delay = calculateDelay(state.retryCount);
          
          setState(prev => ({ 
            ...prev, 
            retryCount: prev.retryCount + 1 
          }));

          retryTimeoutRef.current = setTimeout(async () => {
            try {
              const result = await executeWithRetry(operation);
              resolve(result);
            } catch (retryError) {
              reject(retryError);
            }
          }, delay);
        });
      }

      // No more retries available
      throw errorInstance;
    }
  }, [
    state, 
    fullConfig, 
    calculateDelay, 
    openCircuitBreaker
  ]);

  const reset = useCallback(() => {
    // Clear any pending timeouts
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    if (circuitBreakerTimeoutRef.current) {
      clearTimeout(circuitBreakerTimeoutRef.current);
      circuitBreakerTimeoutRef.current = null;
    }

    setState({
      isRetrying: false,
      retryCount: 0,
      lastError: null,
      isCircuitBreakerOpen: false,
      lastAttemptTime: 0,
      consecutiveFailures: 0,
    });

    trackPageAnalytics('newsletter', 'error_recovery_reset', {}).catch(console.error);
  }, []);

  const canRetry = !state.isCircuitBreakerOpen && state.retryCount < fullConfig.maxRetries;

  const timeUntilNextRetry = state.isRetrying && state.retryCount > 0 
    ? calculateDelay(state.retryCount - 1) - (Date.now() - state.lastAttemptTime)
    : 0;

  return {
    state,
    executeWithRetry,
    reset,
    canRetry,
    timeUntilNextRetry: Math.max(0, timeUntilNextRetry),
  };
}

// Utility hook for handling specific AI personalization errors
export function useAIPersonalizationRecovery() {
  const recovery = useErrorRecovery({
    maxRetries: 2, // Fewer retries for AI since it's not critical
    initialDelay: 2000, // Longer initial delay for AI services
    backoffFactor: 1.5, // Gentler backoff for AI
    enableCircuitBreaker: true,
    circuitBreakerThreshold: 3, // Open faster for AI failures
    circuitBreakerTimeout: 30000, // Shorter timeout for AI recovery
  });

  const executeAIOperation = useCallback(async <T>(
    operation: () => Promise<T>,
    fallbackValue: T
  ): Promise<T> => {
    try {
      return await recovery.executeWithRetry(operation);
    } catch (error) {
      // For AI operations, we always have a fallback
      console.warn('AI personalization failed, using fallback:', error);
      
      trackPageAnalytics('newsletter', 'ai_personalization_fallback_used', {
        error_name: error instanceof Error ? error.name : 'UnknownError',
        error_message: error instanceof Error ? error.message.slice(0, 100) : String(error),
      }).catch(console.error);

      return fallbackValue;
    }
  }, [recovery]);

  return {
    ...recovery,
    executeAIOperation,
  };
}