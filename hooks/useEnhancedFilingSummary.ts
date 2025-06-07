/**
 * Enhanced Filing Summary Hook
 * 
 * React hook for fetching SEC filing summaries with advanced features:
 * - Streaming support for real-time partial results
 * - Caching to prevent redundant API calls
 * - Progress tracking and status updates
 * - Error handling with retry support
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { FilingSummaryResult } from '../services/filingService';
import { FilingType } from '../lib/sec-edgar/types';

// Status of the filing summary request
export type FilingSummaryStatus = 
  | 'idle'
  | 'loading'
  | 'streaming'
  | 'success'
  | 'error';

// Options for the filing summary request
export interface FilingSummaryOptions {
  useStreaming?: boolean;
  useCache?: boolean;
  processAllChunks?: boolean;
  onProgress?: (data: any) => void;
}

// Result of the filing summary hook
export interface EnhancedFilingSummaryResult {
  data: FilingSummaryResult | null;
  partialData: FilingSummaryResult | null;
  status: FilingSummaryStatus;
  progress: number;
  error: string | null;
  isPartial: boolean;
  isLoading: boolean;
  isSuccess: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Hook for fetching SEC filing summaries with streaming support
 * @param ticker Company ticker symbol
 * @param formType SEC form type
 * @param options Additional options
 * @returns Filing summary result with status and controls
 */
export function useEnhancedFilingSummary(
  ticker: string | null,
  formType: FilingType | null,
  options: FilingSummaryOptions = {}
): EnhancedFilingSummaryResult {
  // State for the filing summary
  const [data, setData] = useState<FilingSummaryResult | null>(null);
  const [partialData, setPartialData] = useState<FilingSummaryResult | null>(null);
  const [status, setStatus] = useState<FilingSummaryStatus>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isPartial, setIsPartial] = useState<boolean>(false);
  
  // Refs for event source and abort controller
  const eventSourceRef = useRef<EventSource | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Cleanup function for event source
  const cleanupEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);
  
  // Fetch the filing summary
  const fetchSummary = useCallback(async () => {
    // Reset state
    setData(null);
    setPartialData(null);
    setError(null);
    setProgress(0);
    setIsPartial(false);
    
    // Validate inputs
    if (!ticker || !formType) {
      setStatus('idle');
      return;
    }
    
    try {
      // Determine if we should use streaming
      const useStreaming = options.useStreaming !== false;
      
      if (useStreaming) {
        // Clean up any existing event source
        cleanupEventSource();
        
        // Set status to streaming
        setStatus('streaming');
        
        // Create URL for streaming endpoint
        const url = new URL('/api/filings/stream-summary', window.location.origin);
        url.searchParams.append('ticker', ticker);
        url.searchParams.append('formType', formType);
        
        if (options.useCache === false) {
          url.searchParams.append('useCache', 'false');
        }
        
        if (options.processAllChunks === true) {
          url.searchParams.append('processAllChunks', 'true');
        }
        
        // Create event source for SSE
        const eventSource = new EventSource(url.toString());
        eventSourceRef.current = eventSource;
        
        // Handle start event
        eventSource.addEventListener('start', (event) => {
          const data = JSON.parse(event.data);
          setProgress(0);
          setIsPartial(true);
          
          // Call onProgress callback if provided
          if (options.onProgress) {
            options.onProgress({
              type: 'start',
              data
            });
          }
        });
        
        // Handle progress event
        eventSource.addEventListener('progress', (event) => {
          const eventData = JSON.parse(event.data);
          
          // Update progress
          if (eventData.progress) {
            setProgress(eventData.progress);
          }
          
          // Update partial data if available
          if (eventData.result) {
            setPartialData(eventData.result);
            setIsPartial(true);
          }
          
          // Call onProgress callback if provided
          if (options.onProgress) {
            options.onProgress({
              type: 'progress',
              data: eventData
            });
          }
        });
        
        // Handle complete event
        eventSource.addEventListener('complete', (event) => {
          const eventData = JSON.parse(event.data);
          
          // Update data and status
          if (eventData.result) {
            setData(eventData.result);
            setPartialData(null);
            setIsPartial(false);
            setProgress(100);
            setStatus('success');
          }
          
          // Call onProgress callback if provided
          if (options.onProgress) {
            options.onProgress({
              type: 'complete',
              data: eventData
            });
          }
          
          // Clean up event source
          cleanupEventSource();
        });
        
        // Handle error event
        eventSource.addEventListener('error', (event) => {
          // Parse error data if available
          let errorMessage = 'Failed to stream filing summary';
          try {
            const eventData = JSON.parse(event.data);
            if (eventData.error) {
              errorMessage = eventData.error;
            }
          } catch (e) {
            // If parsing fails, use generic error message
          }
          
          // Update state
          setError(errorMessage);
          setStatus('error');
          
          // Call onProgress callback if provided
          if (options.onProgress) {
            options.onProgress({
              type: 'error',
              error: errorMessage
            });
          }
          
          // Clean up event source
          cleanupEventSource();
        });
        
        // Handle connection error
        eventSource.onerror = () => {
          setError('Connection error while streaming filing summary');
          setStatus('error');
          
          // Call onProgress callback if provided
          if (options.onProgress) {
            options.onProgress({
              type: 'error',
              error: 'Connection error'
            });
          }
          
          // Clean up event source
          cleanupEventSource();
        };
      } else {
        // Use regular API endpoint for non-streaming requests
        setStatus('loading');
        
        // Create abort controller
        const abortController = new AbortController();
        abortControllerRef.current = abortController;
        
        // Create URL for regular endpoint
        const url = new URL('/api/filings/enhanced-summary', window.location.origin);
        url.searchParams.append('ticker', ticker);
        url.searchParams.append('formType', formType);
        
        if (options.useCache === false) {
          url.searchParams.append('useCache', 'false');
        }
        
        if (options.processAllChunks === true) {
          url.searchParams.append('processAllChunks', 'true');
        }
        
        // Fetch the filing summary
        const response = await fetch(url.toString(), {
          signal: abortController.signal
        });
        
        // Handle response
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP error ${response.status}`);
        }
        
        // Parse response data
        const responseData = await response.json();
        
        // Update state
        setData(responseData.data);
        setStatus('success');
        setProgress(100);
        setIsPartial(false);
        
        // Clean up abort controller
        abortControllerRef.current = null;
      }
    } catch (err) {
      // Handle fetch errors
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      
      // Only set error if not aborted
      if (errorMessage !== 'AbortError') {
        setError(errorMessage);
        setStatus('error');
      }
    }
  }, [ticker, formType, options, cleanupEventSource]);
  
  // Fetch on mount and when inputs change
  useEffect(() => {
    fetchSummary();
    
    // Cleanup on unmount
    return () => {
      cleanupEventSource();
      
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [ticker, formType, fetchSummary, cleanupEventSource]);
  
  // Return the result
  return {
    data,
    partialData,
    status,
    progress,
    error,
    isPartial,
    isLoading: status === 'loading' || status === 'streaming',
    isSuccess: status === 'success',
    isError: status === 'error',
    refetch: fetchSummary
  };
}
