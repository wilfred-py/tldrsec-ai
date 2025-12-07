'use client';

import { useState, useEffect, useCallback } from 'react';
import { Users } from 'lucide-react';
import { CounterDisplay } from './counter';

// Default fallback value
const DEFAULT_COUNT = 147;

interface WaitlistCounterProps {
  hideAfterSignup?: boolean;
  userHasSignedUp?: boolean;
  initialCount?: number; // SSR-provided initial count
}

export function WaitlistCounter({
  hideAfterSignup = false,
  userHasSignedUp = false,
  initialCount
}: WaitlistCounterProps) {
  // Use SSR-provided initialCount if available, otherwise use default
  const startingCount = initialCount ?? DEFAULT_COUNT;

  const [count, setCount] = useState<number>(startingCount);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Animation state - start from SSR count (no animation needed if we have real data)
  const [animatedCount, setAnimatedCount] = useState<number>(startingCount);
  // If we have an SSR-provided count, skip the initial animation
  const [isAnimating, setIsAnimating] = useState(!initialCount);
  const [minAnimationReached, setMinAnimationReached] = useState(!!initialCount);
  const [hasCompletedInitialTransition, setHasCompletedInitialTransition] = useState(!!initialCount);

  // Polling configuration
  const POLL_INTERVAL = 30000; // 30 seconds
  const MAX_POLL_DURATION = 5 * 60 * 1000; // 5 minutes
  const MIN_ANIMATION_DURATION = 3000; // Minimum 3 seconds of animation before showing real count

  const fetchCount = useCallback(async () => {
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
    }, []);

  // Initial fetch effect
  useEffect(() => {
    fetchCount();

    // Set minimum animation duration timer
    const minAnimTimer = setTimeout(() => {
      setMinAnimationReached(true);
    }, MIN_ANIMATION_DURATION);

    return () => clearTimeout(minAnimTimer);
  }, [fetchCount, MIN_ANIMATION_DURATION]);

  // Polling effect - starts after initial fetch completes
  useEffect(() => {
    if (isLoading) return; // Wait for initial fetch to complete

    const startTime = Date.now();

    const pollInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;

      // Stop polling after max duration
      if (elapsed >= MAX_POLL_DURATION) {
        console.log('[WaitlistCounter] Polling stopped after max duration');
        clearInterval(pollInterval);
        return;
      }

      console.log('[WaitlistCounter] Polling for updated count...');
      fetchCount();
    }, POLL_INTERVAL);

    // Cleanup on unmount
    return () => {
      console.log('[WaitlistCounter] Cleaning up polling interval');
      clearInterval(pollInterval);
    };
  }, [isLoading, fetchCount, POLL_INTERVAL, MAX_POLL_DURATION]);

  // Animation interval effect - animate from cached base to real count
  useEffect(() => {
    if (!isAnimating || !isLoading) return;

    let timeoutId: NodeJS.Timeout | null = null;
    let isCancelled = false;

    const scheduleNextIncrement = () => {
      if (isCancelled) return;

      // 4 second delay between changes
      const delay = 4000; // 4000ms (4 seconds)

      timeoutId = setTimeout(() => {
        if (isCancelled) return;

        setAnimatedCount(prev => {
          // Double-check we should still be animating
          if (!isCancelled) {
            return prev + Math.floor(Math.random() * 4) + 1; // 1-4 random increment
          }
          return prev;
        });

        // Only schedule next increment if still active
        if (!isCancelled) {
          scheduleNextIncrement();
        }
      }, delay);
    };

    scheduleNextIncrement();

    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isAnimating, isLoading]);

  // Smooth transition to real count effect with easing (initial load only)
  useEffect(() => {
    // Only start transition when:
    // 1. Loading is done AND minimum animation time has elapsed
    // 2. We haven't completed the initial transition yet
    // 3. Count is different from animated count
    if (!isLoading && minAnimationReached && !hasCompletedInitialTransition && count !== animatedCount) {
      setIsAnimating(false);

      const difference = count - animatedCount;

      // Calculate number of steps based on difference (1-4 per step to match increment behavior)
      // Each step increments by 1-4, so divide difference by average increment (2.5)
      const averageIncrement = 2.5;
      const steps = Math.max(Math.ceil(difference / averageIncrement), 1);

      // 4 seconds per step to match the rolling animation timing
      const stepDuration = 4000;

      let currentStep = 0;

      const animateTransition = () => {
        currentStep++;

        // Calculate increment for this step (1-4 random, but ensure we reach target)
        const remainingDifference = count - animatedCount;
        const remainingSteps = steps - currentStep + 1;

        // For the last step, use exact remaining difference
        // Otherwise use random 1-4, but cap at remaining difference
        let increment: number;
        if (currentStep >= steps) {
          increment = remainingDifference;
        } else {
          const maxIncrement = Math.min(4, Math.ceil(remainingDifference / remainingSteps));
          increment = Math.floor(Math.random() * maxIncrement) + 1;
        }

        setAnimatedCount(prev => Math.min(prev + increment, count));

        if (currentStep < steps && animatedCount + increment < count) {
          setTimeout(animateTransition, stepDuration);
        } else {
          // Ensure we end exactly at the target count
          setAnimatedCount(count);
          setHasCompletedInitialTransition(true);
        }
      };

      // Start the animation
      setTimeout(animateTransition, stepDuration);
    }
  }, [isLoading, minAnimationReached, hasCompletedInitialTransition, count, animatedCount]);

  // Handle polling updates (after initial transition is complete)
  useEffect(() => {
    if (hasCompletedInitialTransition && count !== animatedCount) {
      // Directly update to new count from polling (no animation)
      setAnimatedCount(count);
    }
  }, [hasCompletedInitialTransition, count, animatedCount]);

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
          className="font-medium"
          data-testid="waitlist-counter"
        >
          Join <CounterDisplay
            count={animatedCount}
            isAnimating={isAnimating || isLoading}
            className="transition-all duration-300 ease-out"
          /> investors already on the waitlist
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