"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { CounterDisplay } from "@/components/landing/counter";

interface MinutesSavedCounterProps {
  /** Server-fetched anchor value (lifetime minutes saved). */
  anchorMinutes: number;
  /** Projected average growth rate per second (drives interval pacing). */
  ratePerSecond: number;
  className?: string;
}

// The displayed integer ticks up at intervals randomly chosen in
// [base * MIN_FACTOR, base * MAX_FACTOR] where base = 1 / ratePerSecond.
// Average pace tracks ratePerSecond, but the variance breaks the mechanical
// "every-N-seconds" cadence — counter sometimes pauses briefly, sometimes
// moves quickly. Closer to how Stripe's landing-page counter behaves.
const MIN_INTERVAL_FACTOR = 0.4; // shortest interval is 40% of base
const MAX_INTERVAL_FACTOR = 1.8; // longest interval is 180% of base
// Hard floor / ceiling so the math stays sane for extreme rates.
const ABS_MIN_INTERVAL_MS = 250;
const ABS_MAX_INTERVAL_MS = 6000;

function pickInterval(ratePerSecond: number): number {
  const base = 1000 / ratePerSecond;
  const min = Math.max(ABS_MIN_INTERVAL_MS, base * MIN_INTERVAL_FACTOR);
  const max = Math.min(ABS_MAX_INTERVAL_MS, base * MAX_INTERVAL_FACTOR);
  if (max <= min) return min;
  return min + Math.random() * (max - min);
}

/**
 * Continuously-incrementing minutes-saved display. Server-fetched anchor
 * value is the starting point; subsequent ticks happen at random intervals
 * picked from a range tied to `ratePerSecond` (Stripe-counter pattern).
 *
 * - SSR renders the rounded anchor; client transitions to ticking on mount.
 * - Pauses when the tab is hidden, resumes on visibility change.
 * - Respects `prefers-reduced-motion` (renders static integer).
 * - Marks itself `aria-hidden`; caller is expected to provide a stable
 *   `role="status"` parent with an aria-label that announces the rounded value.
 */
export function MinutesSavedCounter({
  anchorMinutes,
  ratePerSecond,
  className = "",
}: MinutesSavedCounterProps) {
  const prefersReducedMotion = useReducedMotion();
  const initialValue = Math.round(anchorMinutes);
  const [displayValue, setDisplayValue] = useState(initialValue);

  // Refs so the scheduler reads stable values across re-renders.
  const rateRef = useRef(ratePerSecond);
  useEffect(() => {
    rateRef.current = ratePerSecond;
  }, [ratePerSecond]);

  // Re-anchor when parent passes a new value (e.g., page revalidation).
  useEffect(() => {
    setDisplayValue(Math.round(anchorMinutes));
  }, [anchorMinutes]);

  useEffect(() => {
    if (prefersReducedMotion || ratePerSecond <= 0 || !Number.isFinite(ratePerSecond)) {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = () => {
      const interval = pickInterval(rateRef.current);
      timeoutId = setTimeout(() => {
        setDisplayValue((v) => v + 1);
        scheduleNext();
      }, interval);
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      } else if (timeoutId === null) {
        scheduleNext();
      }
    };

    scheduleNext();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (timeoutId !== null) clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [prefersReducedMotion, ratePerSecond]);

  return (
    <CounterDisplay
      count={displayValue}
      isAnimating={!prefersReducedMotion && ratePerSecond > 0 && Number.isFinite(ratePerSecond)}
      className={className}
      suppressLiveRegion
      srLabel=""
    />
  );
}
