# Pricing Counting Animation Implementation Plan

**Date**: 2026-01-01 16:46:59 AEDT
**Git Commit**: f6eb7efab09668721f980591cee60e5f864474b8
**Branch**: feature/passwordless-onboarding
**Repository**: tldrsec-ai

## Overview

Enhance the AnimatedPrice component to show a counting animation with intermediate values when toggling between monthly and annual billing, rather than instantly displaying the final price. The animation will smoothly count from the current price to the target price, giving users a visual sense of the price difference.

## Current State Analysis

### Current Implementation
- **Component**: [animated-price.tsx](components/landing/sections-v2/animated-price.tsx)
- **Behavior**: When price changes, `setDisplayValue(value)` immediately jumps to the final value
- **Animation**: Only the digit slide transition is animated (300ms per digit with stagger)
- **No intermediate values** are shown during the transition

### Key Code (lines 30-37):
```tsx
useEffect(() => {
  if (value !== prevValueRef.current) {
    setDirection(value > prevValueRef.current ? 'up' : 'down');
    setDisplayValue(value);  // <-- Immediately sets to final value
    prevValueRef.current = value;
  }
}, [value]);
```

### Price Values (from lib/stripe.ts):
| Plan | Monthly | Annual |
|------|---------|--------|
| FREE | $0 | $0 |
| PRO | $99 | $990 |
| MAX | $139 | $1,390 |

### Current Animation Timeline:
- Duration: 300ms per digit
- Stagger: 20ms per digit
- Total for 4-digit price: ~380ms

## Desired End State

After implementing this plan:

1. **Counting Animation**: When toggling billing interval, the price smoothly counts from start to end value
   - Example: $99 → $150 → $350 → $600 → $800 → $920 → $970 → $990 (with easing)

2. **Duration**: 800ms total animation time (~2.7x current duration for deliberate, satisfying feel)

3. **Easing**: easeOutQuad - starts fast, decelerates smoothly
   - Formula: `1 - (1 - progress) * (1 - progress)`

4. **Digit Animations**: Each intermediate value triggers the existing digit slide animation with reduced duration (150ms) to accommodate multiple updates - keeps the polished feel

5. **Savings Badge Timing**: Fades in at the middle of the animation (~400ms) for visual interest
   - Creates a "reveal" moment as the price is counting up to the annual value

6. **Reduced Motion Support**: When `prefers-reduced-motion` is enabled, instant transition with simple fade

7. **Cancellation**: If user toggles again mid-animation, the new animation starts from current displayed value

### Verification:
```bash
# Run the tests
npm run test -- --testPathPattern="animated-price"

# Visual verification
npm run dev
# Navigate to pricing section, toggle between monthly/annual
# Observe counting animation with smooth easing
```

## What We're NOT Doing

Based on Elon's 5-Step Engineering Algorithm - ruthlessly deleting unnecessary complexity:

1. ❌ **Random intermediate values** - Confusing, feels like slot machine
2. ❌ **Random step intervals** - Adds complexity without benefit
3. ❌ **60-second duration** - Way too long for UI toggle
4. ❌ **Random offset logic** - Unnecessary for price transition
5. ❌ **Complex waitlist counter pattern** - Designed for different use case
6. ❌ **Multiple animation strategies** - Keep it simple with one approach
7. ❌ **Custom animation duration prop** - Use a sensible default

## Implementation Approach

### Key Insight
The counting animation requires **interpolating the numeric value** over time, not just animating the digit transitions. This means:
1. Generate intermediate price values using `requestAnimationFrame`
2. Apply easing function to create natural deceleration
3. Update `displayValue` state at each frame
4. Let existing digit slide animation handle visual transitions

### Architecture Decision
Rather than a complex frame-by-frame animation, we'll use a simpler approach:
- Calculate ~20 intermediate "milestone" values between start and end
- Use `setInterval` with 40ms intervals (~20 updates over 800ms)
- Apply easeOutQuad to make early jumps larger, later jumps smaller
- Trigger savings badge fade-in at 50% progress (~400ms)
- This prevents excessive re-renders while maintaining smooth visual

---

## Phase 1: Write Counting Animation Logic

### Overview
Add the counting animation logic to AnimatedPrice with proper cleanup, cancellation, and easing.

### Step 1.1: 🔴 Write Failing Tests

**Test File**: `__tests__/components/landing/animated-price.test.tsx`

Write these tests FIRST (they should all fail initially):

```tsx
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AnimatedPrice } from '@/components/landing/sections-v2/animated-price';

// Mock framer-motion to simplify testing
jest.mock('framer-motion', () => ({
  motion: {
    span: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <span {...props}>{children}</span>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren<Record<string, unknown>>) => children,
  useReducedMotion: () => false,
}));

describe('AnimatedPrice', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initial render', () => {
    it('should display the initial price value', () => {
      render(<AnimatedPrice value={99} suffix="/month" />);
      expect(screen.getByText('$')).toBeInTheDocument();
      expect(screen.getByText('9')).toBeInTheDocument();
    });

    it('should display the suffix', () => {
      render(<AnimatedPrice value={99} suffix="/month" />);
      expect(screen.getByText('/month')).toBeInTheDocument();
    });
  });

  describe('counting animation', () => {
    it('should show intermediate values when price increases', () => {
      const { rerender } = render(<AnimatedPrice value={99} suffix="/month" />);

      // Change to annual price
      rerender(<AnimatedPrice value={990} suffix="/year" />);

      // After 200ms, should show an intermediate value (not 99, not 990)
      act(() => {
        jest.advanceTimersByTime(200);
      });

      // Should have progressed but not completed
      const container = screen.getByTestId('animated-price-digits');
      const text = container.textContent;
      const displayedValue = parseInt(text?.replace(/,/g, '') || '0');

      expect(displayedValue).toBeGreaterThan(99);
      expect(displayedValue).toBeLessThan(990);
    });

    it('should reach final value after animation duration', () => {
      const { rerender } = render(<AnimatedPrice value={99} suffix="/month" />);

      rerender(<AnimatedPrice value={990} suffix="/year" />);

      // After full animation (800ms + buffer)
      act(() => {
        jest.advanceTimersByTime(900);
      });

      // Should show final value
      const container = screen.getByTestId('animated-price-digits');
      const text = container.textContent;
      expect(text).toContain('990');
    });

    it('should count down when price decreases', () => {
      const { rerender } = render(<AnimatedPrice value={990} suffix="/year" />);

      // Change to monthly price
      rerender(<AnimatedPrice value={99} suffix="/month" />);

      // After 200ms, should show intermediate value
      act(() => {
        jest.advanceTimersByTime(200);
      });

      const container = screen.getByTestId('animated-price-digits');
      const text = container.textContent;
      const displayedValue = parseInt(text?.replace(/,/g, '') || '0');

      expect(displayedValue).toBeLessThan(990);
      expect(displayedValue).toBeGreaterThan(99);
    });

    it('should cancel previous animation when value changes mid-animation', () => {
      const { rerender } = render(<AnimatedPrice value={99} suffix="/month" />);

      // Start counting to 990
      rerender(<AnimatedPrice value={990} suffix="/year" />);

      act(() => {
        jest.advanceTimersByTime(200);
      });

      // Change again before animation completes - count back to 99
      rerender(<AnimatedPrice value={99} suffix="/month" />);

      act(() => {
        jest.advanceTimersByTime(900);
      });

      // Should end at 99, not 990
      const container = screen.getByTestId('animated-price-digits');
      const text = container.textContent;
      expect(text).toContain('99');
      expect(text).not.toContain('990');
    });
  });

  describe('easing behavior', () => {
    it('should apply easeOutQuad - early values should progress faster', () => {
      const { rerender } = render(<AnimatedPrice value={0} suffix="/month" />);

      rerender(<AnimatedPrice value={1000} suffix="/year" />);

      // After 50% of duration (400ms), should be at ~75% due to easeOutQuad
      act(() => {
        jest.advanceTimersByTime(400);
      });

      const container = screen.getByTestId('animated-price-digits');
      const text = container.textContent;
      const displayedValue = parseInt(text?.replace(/,/g, '') || '0');

      // easeOutQuad at 0.5 = 1 - (1-0.5)² = 0.75 = 750
      expect(displayedValue).toBeGreaterThanOrEqual(700);
      expect(displayedValue).toBeLessThanOrEqual(800);
    });
  });

  describe('edge cases', () => {
    it('should handle zero value', () => {
      render(<AnimatedPrice value={0} suffix="/month" />);
      expect(screen.getByText('$')).toBeInTheDocument();
      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('should not animate when value does not change', () => {
      const { rerender } = render(<AnimatedPrice value={99} suffix="/month" />);

      rerender(<AnimatedPrice value={99} suffix="/month" />);

      act(() => {
        jest.advanceTimersByTime(100);
      });

      // Should still show 99 immediately
      const container = screen.getByTestId('animated-price-digits');
      expect(container.textContent).toBe('99');
    });

    it('should format large numbers with commas during counting', () => {
      const { rerender } = render(<AnimatedPrice value={99} suffix="/month" />);

      rerender(<AnimatedPrice value={1390} suffix="/year" />);

      // Advance to a point where value > 1000
      act(() => {
        jest.advanceTimersByTime(500);
      });

      const container = screen.getByTestId('animated-price-digits');
      const text = container.textContent;

      // Should contain comma for values >= 1000
      expect(text).toContain(',');
    });
  });

  describe('savings badge', () => {
    it('should not show savings badge initially during animation', () => {
      const { rerender } = render(<AnimatedPrice value={99} suffix="/month" />);

      rerender(<AnimatedPrice value={990} suffix="/year" savings={17} />);

      // At 200ms (before 400ms threshold), should not show savings yet
      act(() => {
        jest.advanceTimersByTime(200);
      });

      expect(screen.queryByText(/Save 17%/)).not.toBeInTheDocument();
    });

    it('should show savings badge at 50% animation progress (400ms)', () => {
      const { rerender } = render(<AnimatedPrice value={99} suffix="/month" />);

      rerender(<AnimatedPrice value={990} suffix="/year" savings={17} />);

      // At 400ms (50% progress), savings badge should appear
      act(() => {
        jest.advanceTimersByTime(450); // 400ms + buffer for setTimeout
      });

      expect(screen.getByText(/Save 17%/)).toBeInTheDocument();
    });

    it('should not show savings badge when null', () => {
      render(<AnimatedPrice value={99} suffix="/month" savings={null} />);
      expect(screen.queryByText(/Save/)).not.toBeInTheDocument();
    });

    it('should hide savings badge when toggling back to monthly', () => {
      const { rerender } = render(<AnimatedPrice value={990} suffix="/year" savings={17} />);

      // Show savings badge (after initial render with annual)
      act(() => {
        jest.advanceTimersByTime(500);
      });

      // Toggle back to monthly
      rerender(<AnimatedPrice value={99} suffix="/month" savings={null} />);

      act(() => {
        jest.advanceTimersByTime(100);
      });

      // Savings badge should be hidden
      expect(screen.queryByText(/Save/)).not.toBeInTheDocument();
    });
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL as expected:
```bash
npm run test -- --testPathPattern="animated-price"
# Expected: Multiple failing tests (missing data-testid, no counting animation)
```

### Step 1.2: 🟢 Implement to Pass Tests

#### 1.2.1 Add data-testid to digit container
**File**: `components/landing/sections-v2/animated-price.tsx`
**Changes**: Add `data-testid` attribute to the digits container

```tsx
{/* Animated digits container - fixed width to prevent shift */}
<div
  className="flex items-baseline overflow-hidden"
  style={{ minWidth: '5.5ch' }}
  data-testid="animated-price-digits"  // ADD THIS
>
```

**Checkpoint 1.2.1**: Verify initial render tests pass:
```bash
npm run test -- --testPathPattern="animated-price" --testNamePattern="initial render"
# Expected: 2 passing
```

#### 1.2.2 Add reduced motion hook and counting animation logic
**File**: `components/landing/sections-v2/animated-price.tsx`
**Changes**: Import useReducedMotion, add counting animation with useEffect

Replace the entire component with:

```tsx
'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

interface AnimatedPriceProps {
  value: number;
  suffix: string;
  savings?: number | null;
  className?: string;
}

// Animation configuration
const ANIMATION_DURATION = 800; // 800ms total animation
const ANIMATION_INTERVAL = 40; // Update every 40ms (~20 steps)
const SAVINGS_BADGE_DELAY = 400; // Show savings badge at 50% progress

// easeOutQuad: fast start, smooth deceleration
function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/**
 * AnimatedPrice Component
 *
 * Grok-inspired price display with counting animation and individual digit transitions.
 * When the price changes, it counts through intermediate values with easeOutQuad easing.
 *
 * Features:
 * - Counting animation between price values
 * - Individual digit animation (vertical slide)
 * - Fixed-width container to prevent layout shift
 * - Savings badge on separate line
 * - Reduced motion support
 */
export function AnimatedPrice({ value, suffix, savings, className = '' }: AnimatedPriceProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [direction, setDirection] = useState<'up' | 'down'>('up');
  const [showSavings, setShowSavings] = useState(false); // Delayed savings badge
  const prevValueRef = useRef(value);
  const animationRef = useRef<NodeJS.Timeout | null>(null);
  const savingsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const startValueRef = useRef<number>(value);

  // Check for reduced motion preference
  const prefersReducedMotion = useReducedMotion();

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        clearInterval(animationRef.current);
      }
      if (savingsTimeoutRef.current) {
        clearTimeout(savingsTimeoutRef.current);
      }
    };
  }, []);

  // Handle value changes with counting animation
  useEffect(() => {
    if (value !== prevValueRef.current) {
      // Determine animation direction
      const newDirection = value > prevValueRef.current ? 'up' : 'down';
      setDirection(newDirection);

      // Cancel any existing animation
      if (animationRef.current) {
        clearInterval(animationRef.current);
        animationRef.current = null;
      }
      if (savingsTimeoutRef.current) {
        clearTimeout(savingsTimeoutRef.current);
        savingsTimeoutRef.current = null;
      }

      // Hide savings badge when starting new animation (will show mid-animation)
      setShowSavings(false);

      // If reduced motion, just set the value immediately
      if (prefersReducedMotion) {
        setDisplayValue(value);
        setShowSavings(!!savings && savings > 0);
        prevValueRef.current = value;
        return;
      }

      // Start counting animation
      const startValue = displayValue; // Start from current displayed value
      const endValue = value;
      const startTime = Date.now();

      startTimeRef.current = startTime;
      startValueRef.current = startValue;

      // Schedule savings badge to appear at 50% progress (400ms)
      if (savings && savings > 0) {
        savingsTimeoutRef.current = setTimeout(() => {
          setShowSavings(true);
        }, SAVINGS_BADGE_DELAY);
      }

      animationRef.current = setInterval(() => {
        const elapsed = Date.now() - startTimeRef.current;
        const progress = Math.min(elapsed / ANIMATION_DURATION, 1);
        const easedProgress = easeOutQuad(progress);

        const currentValue = Math.round(
          startValueRef.current + (endValue - startValueRef.current) * easedProgress
        );

        setDisplayValue(currentValue);

        // Animation complete
        if (progress >= 1) {
          if (animationRef.current) {
            clearInterval(animationRef.current);
            animationRef.current = null;
          }
          setDisplayValue(endValue); // Ensure exact final value
        }
      }, ANIMATION_INTERVAL);

      prevValueRef.current = value;
    }
  }, [value, displayValue, prefersReducedMotion]);

  // Format price - no decimals for cleaner display (like Grok)
  const formatPrice = (price: number): string => {
    if (price === 0) return '0';
    // For prices >= 1000, use comma formatting
    if (price >= 1000) {
      return price.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
    }
    return price.toString();
  };

  const priceString = formatPrice(displayValue);
  const digits = priceString.split('');

  // Animation variants for digits - faster for counting animation
  const digitVariants = {
    initial: (dir: 'up' | 'down') => ({
      y: dir === 'up' ? 20 : -20,
      opacity: 0,
    }),
    animate: {
      y: 0,
      opacity: 1,
    },
    exit: (dir: 'up' | 'down') => ({
      y: dir === 'up' ? -20 : 20,
      opacity: 0,
    }),
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Price row - fixed layout */}
      <div className="flex items-baseline">
        {/* Dollar sign - static */}
        <span
          className="text-4xl font-bold tracking-tight"
          style={{ color: 'var(--landing-secondary)' }}
        >
          $
        </span>

        {/* Animated digits container - fixed width to prevent shift */}
        <div
          className="flex items-baseline overflow-hidden"
          style={{ minWidth: '5.5ch' }}
          data-testid="animated-price-digits"
        >
          <AnimatePresence mode="popLayout" custom={direction}>
            {digits.map((digit, index) => (
              <motion.span
                key={`${displayValue}-${index}-${digit}`}
                custom={direction}
                variants={digitVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{
                  duration: 0.15, // Faster for counting animation (was 0.3)
                  ease: [0.25, 0.46, 0.45, 0.94], // easeOutQuad
                  delay: index * 0.01, // Reduced stagger (was 0.02)
                }}
                className="text-4xl font-bold tracking-tight inline-block"
                style={{
                  color: 'var(--landing-secondary)',
                  width: digit === ',' ? '0.35em' : '0.6em',
                  textAlign: 'center',
                }}
              >
                {digit}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>

        {/* Suffix with fixed width to prevent shift */}
        <span
          className="text-sm text-[var(--landing-text-muted)] ml-1"
          style={{ minWidth: '4.5rem' }}
        >
          {suffix}
        </span>
      </div>

      {/* Savings badge - on separate line, fades in mid-animation */}
      <div className="h-5 mt-1">
        <AnimatePresence>
          {showSavings && savings && savings > 0 && (
            <motion.span
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.25 }}
              className="text-sm font-medium text-orange-500"
            >
              Save {savings}%
            </motion.span>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * Simple non-animated price for Free tier
 */
export function StaticPrice({ label }: { label: string }) {
  return (
    <div className="flex flex-col">
      <span
        className="text-4xl font-bold tracking-tight"
        style={{ color: 'var(--landing-secondary)' }}
      >
        {label}
      </span>
      {/* Placeholder for savings badge height consistency */}
      <div className="h-5 mt-1" />
    </div>
  );
}
```

**Checkpoint 1.2.2**: Verify counting animation tests pass:
```bash
npm run test -- --testPathPattern="animated-price" --testNamePattern="counting animation"
# Expected: 4 passing
```

**Checkpoint 1.2.3**: Verify easing tests pass:
```bash
npm run test -- --testPathPattern="animated-price" --testNamePattern="easing"
# Expected: 1 passing
```

**Checkpoint 1.2.4**: Verify edge case tests pass:
```bash
npm run test -- --testPathPattern="animated-price" --testNamePattern="edge cases"
# Expected: 4 passing
```

**Checkpoint 1.2.5**: Verify savings badge tests pass:
```bash
npm run test -- --testPathPattern="animated-price" --testNamePattern="savings"
# Expected: 2 passing
```

### Step 1.3: 🔵 Refactor

- [ ] Extract animation constants to top of file
- [ ] Extract easeOutQuad to shared animation utilities if needed elsewhere
- [ ] Ensure variable names are descriptive
- [ ] Add JSDoc for easeOutQuad function

**Checkpoint 1.3**: All tests still pass after refactoring:
```bash
npm run test -- --testPathPattern="animated-price"
# Expected: All tests passing
```

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="animated-price"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] No regressions: `npm run test`

#### Manual Verification:
- [ ] Navigate to pricing section on landing page
- [ ] Toggle billing switch between monthly and annual
- [ ] Observe counting animation for PRO plan ($99 → $990)
- [ ] Observe counting animation for MAX plan ($139 → $1,390)
- [ ] Verify animation duration feels deliberate (~800ms)
- [ ] Verify easing (starts fast, slows down toward end)
- [ ] Verify savings badge appears mid-animation (~400ms) with "reveal" effect
- [ ] Test toggle mid-animation (should smoothly transition to new target)
- [ ] Test with reduced motion enabled in OS settings (instant transition)

**STOP**: After completing this phase and all automated verification passes, pause here for manual confirmation that the animation looks and feels correct before proceeding.

---

## Phase 2: Add Reduced Motion Support and Accessibility

### Overview
Ensure the component properly supports reduced motion preferences and is accessible to all users.

### Step 2.1: 🔴 Write Failing Tests

**Test File**: `__tests__/components/landing/animated-price.test.tsx`

Add these tests to the existing test file:

```tsx
describe('reduced motion', () => {
  beforeEach(() => {
    // Mock reduced motion preference
    jest.mock('framer-motion', () => ({
      ...jest.requireActual('framer-motion'),
      useReducedMotion: () => true,
    }));
  });

  it('should instantly show final value when reduced motion is preferred', () => {
    // Re-import with mocked reduced motion
    jest.resetModules();
    const { AnimatedPrice } = require('@/components/landing/sections-v2/animated-price');

    const { rerender } = render(<AnimatedPrice value={99} suffix="/month" />);

    rerender(<AnimatedPrice value={990} suffix="/year" />);

    // Should immediately show 990, no intermediate values
    const container = screen.getByTestId('animated-price-digits');
    expect(container.textContent).toContain('990');
  });
});

describe('accessibility', () => {
  it('should have appropriate aria attributes for screen readers', () => {
    render(<AnimatedPrice value={99} suffix="/month" />);

    const container = screen.getByTestId('animated-price-container');
    expect(container).toHaveAttribute('aria-live', 'polite');
    expect(container).toHaveAttribute('aria-atomic', 'true');
  });

  it('should have accessible price announcement', () => {
    render(<AnimatedPrice value={99} suffix="/month" />);

    // Check for visually hidden text for screen readers
    const srText = screen.getByText(/\$99 per month/i, { selector: '.sr-only' });
    expect(srText).toBeInTheDocument();
  });
});
```

**Checkpoint 2.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="animated-price" --testNamePattern="reduced motion|accessibility"
# Expected: Failing tests (missing aria attributes, missing sr-only text)
```

### Step 2.2: 🟢 Implement to Pass Tests

#### 2.2.1 Add aria attributes and screen reader text
**File**: `components/landing/sections-v2/animated-price.tsx`
**Changes**: Add accessibility attributes to container

```tsx
return (
  <div
    className={`flex flex-col ${className}`}
    data-testid="animated-price-container"
    aria-live="polite"
    aria-atomic="true"
  >
    {/* Screen reader announcement */}
    <span className="sr-only">
      ${displayValue} {suffix.replace('/', 'per ')}
      {savings && savings > 0 ? `, save ${savings} percent` : ''}
    </span>

    {/* ... rest of component */}
  </div>
);
```

**Checkpoint 2.2.1**: Verify accessibility tests pass:
```bash
npm run test -- --testPathPattern="animated-price" --testNamePattern="accessibility"
# Expected: 2 passing
```

### Step 2.3: 🔵 Refactor

- [ ] Ensure aria-live announcement doesn't fire too frequently during counting
- [ ] Consider using `aria-describedby` for savings badge
- [ ] Review reduced motion behavior for any edge cases

**Checkpoint 2.3**: All tests still pass:
```bash
npm run test -- --testPathPattern="animated-price"
# Expected: All tests passing
```

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [ ] All tests pass: `npm run test -- --testPathPattern="animated-price"`
- [ ] Build succeeds: `npm run build`
- [ ] Lint passes: `npm run lint`

#### Manual Verification:
- [ ] Test with VoiceOver (macOS) or NVDA (Windows)
- [ ] Verify price is announced correctly
- [ ] Verify savings is announced when present
- [ ] Test with system reduced motion enabled
- [ ] Confirm instant transition with reduced motion

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: Performance Optimization

### Overview
Ensure the counting animation is performant and doesn't cause excessive re-renders.

### Step 3.1: 🔴 Write Failing Tests

**Test File**: `__tests__/components/landing/animated-price.test.tsx`

```tsx
describe('performance', () => {
  it('should not re-render parent when counting', () => {
    const parentRenderCount = { current: 0 };

    function Parent() {
      parentRenderCount.current++;
      return <AnimatedPrice value={99} suffix="/month" />;
    }

    const { rerender } = render(<Parent />);
    const initialRenders = parentRenderCount.current;

    // Trigger animation
    rerender(<Parent />); // This won't change value, just re-render

    act(() => {
      jest.advanceTimersByTime(600);
    });

    // Parent should not re-render due to internal animation state
    expect(parentRenderCount.current).toBe(initialRenders + 1);
  });

  it('should cleanup interval on unmount during animation', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

    const { rerender, unmount } = render(<AnimatedPrice value={99} suffix="/month" />);

    rerender(<AnimatedPrice value={990} suffix="/year" />);

    act(() => {
      jest.advanceTimersByTime(200);
    });

    // Unmount during animation
    unmount();

    // Should have cleaned up the interval
    expect(clearIntervalSpy).toHaveBeenCalled();

    clearIntervalSpy.mockRestore();
  });
});
```

**Checkpoint 3.1**: Run performance tests:
```bash
npm run test -- --testPathPattern="animated-price" --testNamePattern="performance"
# Expected: Tests verify cleanup behavior
```

### Step 3.2: 🟢 Verify Existing Implementation

The implementation from Phase 1 already includes:
- Cleanup on unmount
- Cancellation of previous animation
- useRef to avoid closure issues

**Checkpoint 3.2**: Verify all tests pass:
```bash
npm run test -- --testPathPattern="animated-price"
# Expected: All tests passing
```

### Step 3.3: 🔵 Refactor (if needed)

- [ ] Profile component with React DevTools
- [ ] Verify no unnecessary re-renders
- [ ] Check memory usage during extended animation toggling

### Step 3.4: Final Phase Verification

#### Automated Verification:
- [ ] All tests pass: `npm run test -- --testPathPattern="animated-price"`
- [ ] Build succeeds: `npm run build`
- [ ] Lint passes: `npm run lint`

#### Manual Verification:
- [ ] Open React DevTools Profiler
- [ ] Toggle billing interval multiple times rapidly
- [ ] Verify no memory leaks (check for increasing interval count)
- [ ] Verify smooth 60fps animation
- [ ] No layout shifts during animation

**STOP**: Await manual confirmation before final verification.

---

## Testing Strategy

### TDD Test Design Principles Applied

1. **One Assertion Per Test**: Each test focuses on one specific behavior
2. **Descriptive Test Names**: "should [verb] when [condition]" pattern
3. **Arrange-Act-Assert**: Clear structure in every test
4. **Test Behavior, Not Implementation**: Focus on displayed values, not internal state
5. **Edge Cases First**: Zero values, same value, mid-animation changes tested

### Test Categories:

#### 1. Contract Tests (Written First)
- Initial render with value and suffix
- Value changes trigger counting animation
- Savings badge displays when provided

#### 2. Edge Case Tests (Written Second)
- Zero value handling
- No animation when value unchanged
- Mid-animation cancellation
- Large numbers with comma formatting

#### 3. Integration Tests (Written Third)
- Full animation cycle completion
- Direction detection accuracy
- Reduced motion preference respected

#### 4. Regression Tests
- Added as bugs are discovered

### Manual Testing Steps:
1. Navigate to `http://localhost:3000` (landing page)
2. Scroll to pricing section
3. Click billing toggle
4. Observe counting animation on PRO and MAX plans
5. Rapidly toggle to test cancellation
6. Enable system reduced motion and verify instant transition
7. Test with screen reader

---

## Performance Considerations

### Animation Performance
- **Interval-based approach**: ~20 updates over 800ms (40ms interval)
- **Reduced re-renders**: Only displayValue and showSavings state changes during counting
- **No layout thrashing**: Fixed-width containers prevent layout recalculation
- **GPU-accelerated**: Framer Motion uses transform/opacity for digit transitions
- **Delayed savings badge**: Uses setTimeout (400ms) to create mid-animation reveal

### Memory Considerations
- **Cleanup on unmount**: clearInterval and clearTimeout called in useEffect cleanup
- **Ref-based storage**: Animation refs don't trigger re-renders
- **No closure leaks**: startValueRef and startTimeRef updated on each animation start
- **Savings timeout cleanup**: savingsTimeoutRef properly cleared on unmount or re-animation

### Bundle Size
- No new dependencies added
- Reuses existing Framer Motion hooks (useReducedMotion already available)

---

## Migration Notes

This is a non-breaking enhancement to an existing component:
- Props interface unchanged
- Default behavior improved (counting animation)
- Reduced motion automatically detected
- No database or API changes required

---

## References

- Original research: [thoughts/shared/research/2026-01-01-pricing-animation-research.md](thoughts/shared/research/2026-01-01-pricing-animation-research.md)
- Current implementation: [components/landing/sections-v2/animated-price.tsx](components/landing/sections-v2/animated-price.tsx)
- Waitlist counter reference: [components/landing/waitlist-counter.tsx](components/landing/waitlist-counter.tsx)
- DigitRoller component: [components/landing/counter/digit-roller.tsx](components/landing/counter/digit-roller.tsx)
- Stripe pricing config: [lib/stripe.ts](lib/stripe.ts)
