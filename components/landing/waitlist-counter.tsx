'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Users } from 'lucide-react';
import { CounterDisplay } from './counter';

// Default fallback value
const DEFAULT_BASE = 147;

// Animation configuration
const ANIMATION_DURATION = 12000; // 12 seconds total animation
const ANIMATION_STEP_INTERVAL = 800; // Update every 800ms for smooth animation

interface WaitlistCounterProps {
  hideAfterSignup?: boolean;
  userHasSignedUp?: boolean;
  baseCount?: number;  // SSR-provided starting point (yesterday's end-of-day)
  realCount?: number;  // SSR-provided target (current real count)
}

export function WaitlistCounter({
  hideAfterSignup = false,
  userHasSignedUp = false,
  baseCount,
  realCount
}: WaitlistCounterProps) {
  // Use SSR-provided values if available
  const startingBase = baseCount ?? DEFAULT_BASE;
  const startingReal = realCount ?? DEFAULT_BASE;

  // Current displayed count (animated)
  const [displayedCount, setDisplayedCount] = useState<number>(startingBase);
  // Target count from API (for live updates after animation)
  const [targetCount, setTargetCount] = useState<number>(startingReal);
  // Animation state
  const [isAnimating, setIsAnimating] = useState(true);
  const [animationComplete, setAnimationComplete] = useState(false);
  // Loading/error state
  const [error, setError] = useState<string | null>(null);

  // Refs to track animation progress
  const _animationStartTime = useRef<number>(Date.now());
  const animationStartValue = useRef<number>(startingBase);
  const animationTargetValue = useRef<number>(startingReal);

  // Polling configuration
  const POLL_INTERVAL = 30000; // 30 seconds
  const MAX_POLL_DURATION = 5 * 60 * 1000; // 5 minutes

  // Fetch latest count from API
  const fetchCount = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch('/api/waitlist/count', {
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (typeof data.count === 'number') {
        setTargetCount(data.count);
        console.log('[WaitlistCounter] Live update - count:', data.count);
      }

      if (data.error) {
        console.warn('[WaitlistCounter] API returned error:', data.error);
        setError(data.error);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('[WaitlistCounter] Fetch error:', errorMessage);
      setError(errorMessage);
    }
  }, []);

  // Animation effect - animate from baseCount to realCount over ~12 seconds
  useEffect(() => {
    if (!isAnimating) return;

    const startValue = animationStartValue.current;
    const targetValue = animationTargetValue.current;
    const difference = targetValue - startValue;

    // If no difference, complete immediately
    if (difference <= 0) {
      setDisplayedCount(targetValue);
      setIsAnimating(false);
      setAnimationComplete(true);
      return;
    }

    // Calculate total steps
    const totalSteps = Math.ceil(ANIMATION_DURATION / ANIMATION_STEP_INTERVAL);
    let currentStep = 0;

    const animationInterval = setInterval(() => {
      currentStep++;

      // Use easeOutQuad for natural deceleration
      const progress = Math.min(currentStep / totalSteps, 1);
      const easedProgress = 1 - (1 - progress) * (1 - progress);

      // Calculate new value with some randomness for organic feel
      const baseValue = startValue + Math.floor(difference * easedProgress);
      // Add slight randomness (±1) except at the end
      const randomOffset = progress >= 0.95 ? 0 : Math.floor(Math.random() * 3) - 1;
      const newValue = Math.min(Math.max(baseValue + randomOffset, startValue), targetValue);

      setDisplayedCount(newValue);

      // Complete animation
      if (progress >= 1) {
        clearInterval(animationInterval);
        setDisplayedCount(targetValue);
        setIsAnimating(false);
        setAnimationComplete(true);
        console.log('[WaitlistCounter] Animation complete at:', targetValue);
      }
    }, ANIMATION_STEP_INTERVAL);

    return () => clearInterval(animationInterval);
  }, [isAnimating]);

  // Polling effect - starts after animation completes
  useEffect(() => {
    if (!animationComplete) return;

    const startTime = Date.now();

    // Initial fetch to get latest count
    fetchCount();

    const pollInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;

      if (elapsed >= MAX_POLL_DURATION) {
        console.log('[WaitlistCounter] Polling stopped after max duration');
        clearInterval(pollInterval);
        return;
      }

      console.log('[WaitlistCounter] Polling for updated count...');
      fetchCount();
    }, POLL_INTERVAL);

    return () => clearInterval(pollInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- MAX_POLL_DURATION and POLL_INTERVAL are constants
  }, [animationComplete, fetchCount]);

  // Handle live updates (after animation is complete)
  useEffect(() => {
    if (animationComplete && targetCount !== displayedCount) {
      // Animate smoothly to new count
      const difference = targetCount - displayedCount;
      if (difference > 0) {
        // Quick animation for live updates (1-2 seconds)
        const steps = Math.min(difference, 5);
        const stepDuration = 300;
        let step = 0;

        const updateInterval = setInterval(() => {
          step++;
          const increment = Math.ceil(difference / steps);
          setDisplayedCount(prev => Math.min(prev + increment, targetCount));

          if (step >= steps) {
            clearInterval(updateInterval);
            setDisplayedCount(targetCount);
          }
        }, stepDuration);

        return () => clearInterval(updateInterval);
      } else {
        // Instant update if count decreased (shouldn't happen normally)
        setDisplayedCount(targetCount);
      }
    }
  }, [animationComplete, targetCount, displayedCount]);

  // Only render if not signed up or hideAfterSignup is false
  if (hideAfterSignup && userHasSignedUp) {
    return null;
  }

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
            count={displayedCount}
            isAnimating={isAnimating}
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
