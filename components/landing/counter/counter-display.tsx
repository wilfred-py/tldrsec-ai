'use client';

/**
 * CounterDisplay Component
 *
 * Orchestrates multiple DigitRoller components to display an animated counter.
 * Handles digit separation, comma placement, and stagger timing.
 */

import { useMemo, useCallback, useState, useEffect } from 'react';
import { DigitRoller } from './digit-roller';
import { separateDigits, calculateSeparatorPositions, sanitizeCount } from './utils';
import type { CounterDisplayProps } from './types';

export function CounterDisplay({
  count,
  isAnimating = false,
  onAnimationComplete,
  className = '',
  'data-testid': testId = 'counter-display'
}: CounterDisplayProps) {
  // Sanitize and memoize count
  const safeCount = useMemo(() => sanitizeCount(count), [count]);

  // Separate into individual digits
  const digits = useMemo(() => separateDigits(safeCount), [safeCount]);

  // Calculate comma positions (every 3 digits from right)
  const separatorPositions = useMemo(
    () => calculateSeparatorPositions(digits.length),
    [digits.length]
  );

  // Track animation completion
  const [_completedDigits, setCompletedDigits] = useState(0);
  const totalDigits = digits.length;

  // Reset completion tracking when digits change
  useEffect(() => {
    setCompletedDigits(0);
  }, [digits]);

  // Handle individual digit completion
  const handleDigitComplete = useCallback(() => {
    setCompletedDigits((prev) => {
      const newCount = prev + 1;

      // If all digits completed, fire parent callback
      if (newCount >= totalDigits) {
        onAnimationComplete?.();
      }

      return newCount;
    });
  }, [totalDigits, onAnimationComplete]);

  // Calculate stagger delay for each digit (right-to-left)
  // Rightmost digit (ones place) = 0ms delay
  // Each digit to the left adds 40ms delay
  const getStaggerDelay = useCallback(
    (index: number) => {
      const position = digits.length - 1 - index; // Right-to-left
      return position * 40; // 40ms stagger
    },
    [digits.length]
  );

  // Check if comma should appear after this digit
  const shouldShowSeparator = useCallback(
    (index: number) => {
      const positionFromRight = digits.length - 1 - index;
      return separatorPositions.includes(positionFromRight);
    },
    [digits.length, separatorPositions]
  );

  return (
    <span
      className={`inline-flex items-center ${className}`}
      data-testid={testId}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        // Fixed font properties for consistent digit width
        fontVariantNumeric: 'tabular-nums',
        fontWeight: 600,
        letterSpacing: '0.02em'
      }}
    >
      {/* Screen reader only text */}
      <span className="sr-only">Current waitlist count: {safeCount.toLocaleString()} investors</span>

      {/* Visual digit animation */}
      <span aria-hidden="true" className="inline-flex items-center">
        {digits.map((digit, index) => (
          <span key={`digit-group-${index}`} className="inline-flex items-center">
            <DigitRoller
              value={digit}
              delay={isAnimating ? getStaggerDelay(index) : 0}
              onAnimationComplete={handleDigitComplete}
            />
            {shouldShowSeparator(index) && (
              <span className="opacity-70 mx-0.5">,</span>
            )}
          </span>
        ))}
      </span>
    </span>
  );
}
