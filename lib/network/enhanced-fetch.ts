/**
 * Enhanced fetch wrapper with robust error handling, logging, and recovery
 * Provides consistent error handling for network requests with detailed feedback
 */

import { logger } from '../logging';
import { monitoring } from '../monitoring';
import { generateSecureRequestId } from '../security/secure-random';

// Create a safe wrapper for monitoring functions
const safeMonitoring = {
  recordDuration: function(metric: string, value: number, tags: Record<string, string | boolean> = {}) {
    try {
      if (typeof monitoring.recordTiming === 'function') {
        monitoring.recordTiming(metric, value, tags);
      }
    } catch (error) {
      console.warn('Failed to record timing', { error });
    }
  }
};
import { ApiError, ErrorCode } from '../error-handling';
import { executeWithAdaptiveRetry, AdaptiveRetryConfig, DefaultAdaptiveRetryConfig } from '../error-handling/adaptive-retry';

// Enhanced fetch options extending standard fetch options
export interface EnhancedFetchOptions extends RequestInit {
  // Timeout in milliseconds (default: 30000ms)
  timeoutMs?: number;
  
  // Whether to retry on failure (default: true)
  retry?: boolean;
  
  // Custom retry configuration
  retryConfig?: Partial<AdaptiveRetryConfig>;
  
  // Expected response type
  responseType?: 'json' | 'text' | 'blob' | 'arrayBuffer';
  
  // Tags for monitoring and logging
  tags?: Record<string, string>;
  
  // Operation name for logging and monitoring
  operationName?: string;
}

// Default enhanced fetch options
const defaultOptions: EnhancedFetchOptions = {
  timeoutMs: 30000,
  retry: true,
  responseType: 'json',
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  }
};

/**
 * Enhanced fetch with timeout, retries, and error handling
 * @param url URL to fetch
 * @param options Enhanced fetch options
 * @returns Response data based on responseType
 */
export async function enhancedFetch<T = unknown>(
  url: string,
  options: EnhancedFetchOptions = {}
): Promise<T> {
  // Merge options with defaults
  const mergedOptions: EnhancedFetchOptions = {
    ...defaultOptions,
    ...options,
    headers: {
      ...defaultOptions.headers,
      ...options.headers
    }
  };
  
  const {
    timeoutMs,
    retry,
    retryConfig,
    responseType,
    tags,
    operationName,
    ...fetchOptions
  } = mergedOptions;
  
  // Generate a unique request ID for tracking
  const requestId = generateSecureRequestId('req');
  
  // Create context for logging and monitoring
  const context = {
    url,
    method: fetchOptions.method || 'GET',
    operationName: operationName || 'fetch',
    requestId,
    ...tags
  };
  
  // Log request start
  logger.debug(`Starting ${context.method} request to ${url}`, context);
  
  // Track request start
  const startTime = Date.now();
  monitoring.incrementCounter('network.requests', 1, context);
  
  try {
    // Define the fetch operation with timeout
    const fetchOperation = async () => {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeoutMs);
      
      try {
        // Execute fetch with timeout
        const response = await fetch(url, {
          ...fetchOptions,
          signal: controller.signal
        });
        
        // Check if response is ok
        if (!response.ok) {
          // Extract error details from response
          let errorData: unknown;
          try {
            errorData = await response.json();
          } catch {
            try {
              errorData = await response.text();
            } catch {
              errorData = 'Unable to parse error response';
            }
          }
          
          // Map HTTP status codes to error codes
          let errorCode: ErrorCode;
          let isRetriable = false;
          
          switch (response.status) {
            case 400:
              errorCode = ErrorCode.BAD_REQUEST;
              isRetriable = false;
              break;
            case 401:
            case 403:
              errorCode = ErrorCode.UNAUTHORIZED;
              isRetriable = false;
              break;
            case 404:
              errorCode = ErrorCode.NOT_FOUND;
              isRetriable = false;
              break;
            case 408:
              errorCode = ErrorCode.TIMEOUT_ERROR;
              isRetriable = true;
              break;
            case 429:
              errorCode = ErrorCode.RATE_LIMITED;
              isRetriable = true;
              break;
            case 500:
            case 502:
            case 503:
            case 504:
              errorCode = ErrorCode.NETWORK_UNAVAILABLE;
              isRetriable = true;
              break;
            default:
              errorCode = ErrorCode.EXTERNAL_API_ERROR;
              isRetriable = response.status >= 500;
          }
          
          // Extract retry-after header if present
          let retryAfter: number | undefined;
          const retryAfterHeader = response.headers.get('retry-after');
          if (retryAfterHeader) {
            // Check if retry-after is in seconds or a date
            if (/^\d+$/.test(retryAfterHeader)) {
              retryAfter = parseInt(retryAfterHeader, 10) * 1000;
            } else {
              const retryDate = new Date(retryAfterHeader);
              if (!isNaN(retryDate.getTime())) {
                retryAfter = retryDate.getTime() - Date.now();
              }
            }
          }
          
          // Create and throw API error
          const apiError = new ApiError(
            errorCode,
            `HTTP error ${response.status}: ${response.statusText}`,
            {
              statusCode: response.status,
              url,
              method: context.method,
              errorData,
              requestId
            },
            isRetriable,
            requestId
          );
          
          // Set retryAfter if available
          if (retryAfter !== undefined) {
            apiError.retryAfter = retryAfter;
          }
          
          throw apiError;
        }
        
        // Parse response based on responseType
        let data: unknown;
        switch (responseType) {
          case 'json':
            data = await response.json();
            break;
          case 'text':
            data = await response.text();
            break;
          case 'blob':
            data = await response.blob();
            break;
          case 'arrayBuffer':
            data = await response.arrayBuffer();
            break;
          default:
            data = await response.json();
        }
        
        return data as T;
      } finally {
        // Clean up timeout
        clearTimeout(timeoutId);
      }
    };
    
    // Execute with or without retry
    let result: T;
    if (retry) {
      // Merge custom retry config with defaults
      const adaptiveRetryConfig: AdaptiveRetryConfig = {
        ...DefaultAdaptiveRetryConfig,
        ...retryConfig,
        onRetry: (error, attempt, delay, remaining) => {
          logger.warn(`Retrying ${context.method} request to ${url} (attempt ${attempt}, ${remaining} remaining) after ${delay}ms`, {
            ...context,
            error: error.message,
            attempt,
            delay
          });
          
          if (retryConfig?.onRetry) {
            retryConfig.onRetry(error, attempt, delay, remaining);
          }
        }
      };
      
      // Execute with retry
      result = await executeWithAdaptiveRetry(fetchOperation, adaptiveRetryConfig, context);
    } else {
      // Execute without retry
      result = await fetchOperation();
    }
    
    // Calculate duration
    const duration = Date.now() - startTime;
    
    // Log success
    logger.debug(`Completed ${context.method} request to ${url} in ${duration}ms`, {
      ...context,
      duration
    });
    
    // Track success
    safeMonitoring.recordDuration('network.request.duration', duration, {
      ...context,
      success: 'true'
    });
    
    return result;
  } catch (error: unknown) {
    // Calculate duration
    const duration = Date.now() - startTime;
    
    // Normalize error
    const normalizedError = error instanceof ApiError
      ? error
      : new ApiError(
          error.name === 'AbortError' ? ErrorCode.TIMEOUT_ERROR : ErrorCode.NETWORK_UNAVAILABLE,
          error.message || 'Network request failed',
          {
            url,
            method: context.method,
            originalError: error.toString(),
            requestId
          },
          true,
          requestId
        );
    
    // Log error
    logger.error(`Failed ${context.method} request to ${url} after ${duration}ms: ${normalizedError.message}`, {
      ...context,
      duration,
      error: normalizedError
    });
    
    // Track failure
    safeMonitoring.recordDuration('network.request.duration', duration, {
      ...context,
      success: 'false',
      errorCode: normalizedError.code
    });
    
    throw normalizedError;
  }
}
