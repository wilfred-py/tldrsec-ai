'use client';

/**
 * DigitRoller Component
 *
 * Renders a single animated digit with smooth vertical sliding transitions.
 * Uses Framer Motion for orchestration and CSS transforms for GPU acceleration.
 * Respects prefers-reduced-motion for accessibility.
 */

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useMemo } from 'react';
import type { DigitRollerProps } from './types';

export function DigitRoller({
  value,
  animationDuration = 400,
  delay = 0,
  onAnimationComplete,
  className = ''
}: DigitRollerProps) {
  // Check if user prefers reduced motion
  const prefersReducedMotion = useReducedMotion();

  // Validate digit is in valid range (0-9)
  const safeDigit = useMemo(() => {
    if (!Number.isFinite(value) || value < 0 || value > 9) {
      console.warn('[DigitRoller] Invalid digit value:', value);
      return 0;
    }
    return Math.floor(value);
  }, [value]);

  // Animation configuration
  // CRITICAL FIX: Start visible to avoid SSR hydration mismatch
  // Content-first approach: digits are always visible, animation enhances the transition
  // Easing: cubic-bezier(0.34, 1.56, 0.64, 1) creates elastic ease-out with 10% overshoot
  const animationVariants = {
    initial: prefersReducedMotion
      ? { opacity: 1, y: 0 } // ✅ START VISIBLE for reduced motion
      : {
          y: -20, // Subtle slide from above (reduced from -100 to prevent clipping)
          opacity: 1  // ✅ START VISIBLE to prevent SSR mismatch
        },
    animate: {
      y: 0,
      opacity: 1
    },
    exit: prefersReducedMotion
      ? { opacity: 0, y: 0 } // Simple fade for reduced motion
      : {
          y: 20, // Subtle slide down (reduced from 100)
          opacity: 0
        }
  };

  const transitionConfig = {
    duration: prefersReducedMotion ? 0.15 : animationDuration / 1000, // Faster fade for reduced motion
    delay: prefersReducedMotion ? 0 : delay / 1000, // No stagger delay for reduced motion
    ease: prefersReducedMotion ? 'easeInOut' : [0.34, 1.56, 0.64, 1], // Simple easing for reduced motion
    onComplete: onAnimationComplete
  };

  return (
    <span
      className={`inline-block relative overflow-hidden ${className}`}
      style={{
        // 1ch = width of the "0" glyph in the current font, exact fit for tabular-nums
        width: '1ch',
        minHeight: '1.2em', // ✅ FIX: Prevent container collapse during animations
        lineHeight: '1.2', // ✅ FIX: Consistent vertical rhythm
        textAlign: 'center',
        // Enable tabular nums for monospace digits
        fontVariantNumeric: 'tabular-nums',
        display: 'inline-flex', // ✅ FIX: Better vertical centering
        alignItems: 'center',
        justifyContent: 'center'
      }}
      data-testid="digit-roller"
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={`digit-${safeDigit}`}
          className="inline-block"
          variants={animationVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={transitionConfig}
          style={{
            // GPU acceleration hints (removed conflicting transform)
            backfaceVisibility: 'hidden',
            willChange: 'transform, opacity'
          }}
        >
          {safeDigit}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
