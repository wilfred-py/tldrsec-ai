'use client';

import { useState, useEffect } from 'react';
import { Users } from 'lucide-react';

interface WaitlistCounterProps {
  hideAfterSignup?: boolean;
  userHasSignedUp?: boolean;
}

export function WaitlistCounter({ hideAfterSignup = false, userHasSignedUp = false }: WaitlistCounterProps) {
  const [count, setCount] = useState<number>(147); // Default base count
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Animation state
  const [animatedCount, setAnimatedCount] = useState<number>(147);
  const [isAnimating, setIsAnimating] = useState(true);

  useEffect(() => {
    const fetchCount = async () => {
      console.log('[WaitlistCounter] Starting fetch request');
      const startTime = Date.now();
      
      try {
        // Add timeout to prevent indefinite loading
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.log('[WaitlistCounter] Request timeout - aborting');
          controller.abort();
        }, 8000); // 8 second timeout

        console.log('[WaitlistCounter] Making fetch request to /api/waitlist/count');
        const response = await fetch('/api/waitlist/count', {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        
        console.log('[WaitlistCounter] Response received:', {
          status: response.status,
          statusText: response.statusText,
          ok: response.ok,
          responseTime: Date.now() - startTime
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('[WaitlistCounter] Response data:', data);

        if (typeof data.count === 'number') {
          setCount(data.count);
          console.log('[WaitlistCounter] Count updated to:', data.count);
        } else {
          throw new Error('Invalid response format - count is not a number');
        }

        // Check for any error messages in the response
        if (data.error) {
          console.warn('[WaitlistCounter] API returned error:', data.error);
          setError(data.error);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[WaitlistCounter] Fetch error:', {
          error: errorMessage,
          responseTime: Date.now() - startTime,
          errorType: error instanceof Error ? error.constructor.name : typeof error
        });
        
        setError(errorMessage);
        
        // Keep default count on error - don't change it
        console.log('[WaitlistCounter] Keeping default count due to error');
      } finally {
        setIsLoading(false);
        console.log('[WaitlistCounter] Loading completed');
      }
    };

    fetchCount();
  }, []);

  // Animation interval effect - animate from cached base to real count
  useEffect(() => {
    if (!isAnimating || !isLoading) return;
    
    const scheduleNextIncrement = () => {
      const delay = Math.random() * 2000 + 1000; // 1-3 seconds
      return setTimeout(() => {
        if (isAnimating && isLoading) {
          const increment = Math.floor(Math.random() * 3) + 1; // 1-3 random increment
          setAnimatedCount(prev => prev + increment);
          scheduleNextIncrement();
        }
      }, delay);
    };

    const timeoutId = scheduleNextIncrement();
    
    return () => clearTimeout(timeoutId);
  }, [isAnimating, isLoading]);

  // Smooth transition to real count effect
  useEffect(() => {
    if (!isLoading && count !== animatedCount) {
      setIsAnimating(false);
      
      // Always animate to the real count from API (which includes cached base)
      if (count > animatedCount) {
        // For Phase 1, we'll do a simple transition - smooth transition will be enhanced in Phase 2
        setAnimatedCount(count);
      } else {
        // Use real count even if animated count went higher
        setAnimatedCount(count);
      }
    }
  }, [isLoading, count, animatedCount]);

  // Only render if not signed up or hideAfterSignup is false
  if (hideAfterSignup && userHasSignedUp) {
    return null;
  }

  // Add a retry button for debugging in development
  const isDev = process.env.NODE_ENV === 'development';

  return (
    <div className="flex flex-col items-center justify-center gap-2 text-base text-fintech-text-secondary mt-8">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-fintech-accent" />
        <span 
          className="font-medium transition-all duration-300 ease-out"
          data-testid="waitlist-counter"
        >
          Join {isLoading ? (
            <span className="transition-all duration-300 ease-out">
              {animatedCount.toLocaleString()}
            </span>
          ) : (
            animatedCount.toLocaleString()
          )} investors already on the waitlist
        </span>
      </div>
      
      {/* Debug information in development */}
      {isDev && error && (
        <div className="text-xs text-red-500 mt-1 max-w-sm text-center">
          Debug: {error}
          <button 
            onClick={() => window.location.reload()} 
            className="ml-2 underline"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}