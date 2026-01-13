---
date: 2026-01-01T16:41:36+11:00
researcher: Claude
git_commit: f6eb7efab09668721f980591cee60e5f864474b8
branch: feature/passwordless-onboarding
repository: tldrsec-ai
topic: "Pricing animation behavior when toggling between monthly and annual billing"
tags: [research, codebase, pricing, animation, framer-motion, billing-toggle]
status: complete
last_updated: 2026-01-01
last_updated_by: Claude
---

# Research: Pricing Animation Behavior

**Date**: 2026-01-01T16:41:36+11:00
**Researcher**: Claude
**Git Commit**: f6eb7efab09668721f980591cee60e5f864474b8
**Branch**: feature/passwordless-onboarding
**Repository**: tldrsec-ai

## Research Question

The pricing animation when opting into "Save with yearly billing" only shows a change between the monthly and annual prices. The user wants to understand the current implementation to potentially add intermediate random numbers between the monthly and annual prices to give the illusion of counting upwards/downwards, with a slightly longer animation duration.

## Summary

The current pricing animation is implemented in [animated-price.tsx](components/landing/sections-v2/animated-price.tsx) using Framer Motion. It performs a **direct digit transition** from the starting value to the ending value with no intermediate counting animation. Each digit slides vertically (up or down depending on direction) with a 300ms duration and staggered timing. The animation is designed for clean, Grok-inspired digit replacement rather than a counting/rolling number effect.

## Detailed Findings

### Component: AnimatedPrice

**Location**: [components/landing/sections-v2/animated-price.tsx:25-143](components/landing/sections-v2/animated-price.tsx#L25-L143)

**Current Behavior**:
1. When `value` prop changes, the component detects direction (up/down) by comparing with previous value
2. The `displayValue` state is immediately set to the new value
3. Each digit in the formatted price string animates independently
4. Animation: vertical slide (20px) with fade in/out
5. Duration: 300ms per digit
6. Stagger: 20ms delay per digit (index * 0.02)
7. Easing: `[0.25, 0.46, 0.45, 0.94]` (easeOutQuad)

**Key Code (lines 30-37)**:
```tsx
useEffect(() => {
  if (value !== prevValueRef.current) {
    // Determine animation direction based on value change
    setDirection(value > prevValueRef.current ? 'up' : 'down');
    setDisplayValue(value);  // <-- Immediately sets to final value
    prevValueRef.current = value;
  }
}, [value]);
```

**Animation Variants (lines 57-70)**:
```tsx
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
```

**Transition Config (lines 98-102)**:
```tsx
transition={{
  duration: 0.3,
  ease: [0.25, 0.46, 0.45, 0.94], // easeOutQuad
  delay: index * 0.02, // Stagger effect
}}
```

### Component: PricingSectionV2

**Location**: [components/landing/sections-v2/pricing-section-v2.tsx:77-296](components/landing/sections-v2/pricing-section-v2.tsx#L77-L296)

**Billing Toggle (lines 129-143)**:
```tsx
<button
  onClick={() => setBillingInterval(billingInterval === 'monthly' ? 'annual' : 'monthly')}
  className={`relative w-12 h-6 rounded-full transition-colors duration-200 ...`}
>
```

**Price Calculation (lines 80-85)**:
```tsx
const getPrice = (plan: typeof plans[0]) => {
  if (billingInterval === 'annual') {
    return plan.annualPrice;
  }
  return plan.monthlyPrice;
};
```

**AnimatedPrice Usage (lines 200-204)**:
```tsx
<AnimatedPrice
  value={getPrice(plan)}
  suffix={billingInterval === 'annual' ? '/year' : '/month'}
  savings={billingInterval === 'annual' ? savings : null}
/>
```

### Existing Pattern: Counting Animation (Reference)

The codebase has a counting animation pattern in the waitlist counter that could serve as reference:

**Location**: [components/landing/waitlist-counter.tsx:111-136](components/landing/waitlist-counter.tsx#L111-L136)

This component animates through intermediate values with:
- EaseOutQuad progression: `1 - (1 - progress) * (1 - progress)`
- Random step intervals (2.5s - 4s between steps)
- Random offset (±1) for organic feel
- 60 second total duration (configurable)

**Key Code**:
```tsx
const runStep = () => {
  currentStep++;
  const progress = Math.min(currentStep / totalSteps, 1);
  const easedProgress = 1 - (1 - progress) * (1 - progress);

  const baseValue = startValue + Math.floor(difference * easedProgress);
  const randomOffset = progress >= 0.95 ? 0 : Math.floor(Math.random() * 3) - 1;
  const newValue = Math.min(Math.max(baseValue + randomOffset, startValue), targetValue);

  setDisplayedCount(newValue);

  if (progress >= 1) {
    // Complete
  } else {
    timeoutId = setTimeout(runStep, getRandomStepInterval());
  }
};
```

### Digit Roller Component (Alternative Pattern)

**Location**: [components/landing/counter/digit-roller.tsx](components/landing/counter/digit-roller.tsx)

This component handles individual digit animations with:
- Vertical slide animation (20px)
- Elastic easing: `[0.34, 1.56, 0.64, 1]` (10% overshoot)
- Configurable animation duration
- Reduced motion support
- GPU acceleration hints

## Code References

| File | Lines | Description |
|------|-------|-------------|
| [animated-price.tsx](components/landing/sections-v2/animated-price.tsx) | 25-143 | Main AnimatedPrice component |
| [animated-price.tsx](components/landing/sections-v2/animated-price.tsx) | 30-37 | Value change detection and immediate update |
| [animated-price.tsx](components/landing/sections-v2/animated-price.tsx) | 57-70 | Digit animation variants |
| [animated-price.tsx](components/landing/sections-v2/animated-price.tsx) | 98-102 | Transition configuration (300ms, easeOutQuad) |
| [pricing-section-v2.tsx](components/landing/sections-v2/pricing-section-v2.tsx) | 78 | billingInterval state |
| [pricing-section-v2.tsx](components/landing/sections-v2/pricing-section-v2.tsx) | 129-143 | Toggle button that triggers animation |
| [pricing-section-v2.tsx](components/landing/sections-v2/pricing-section-v2.tsx) | 200-204 | AnimatedPrice usage |
| [waitlist-counter.tsx](components/landing/waitlist-counter.tsx) | 111-136 | Reference counting animation with intermediate values |
| [digit-roller.tsx](components/landing/counter/digit-roller.tsx) | 35-101 | Alternative digit animation pattern |

## Architecture Documentation

### Current Animation Flow

```
User clicks toggle
    ↓
setBillingInterval() called (pricing-section-v2.tsx:130)
    ↓
getPrice(plan) returns new price (either monthlyPrice or annualPrice)
    ↓
AnimatedPrice receives new `value` prop
    ↓
useEffect detects value change (animated-price.tsx:30-37)
    ↓
setDisplayValue(value) - IMMEDIATELY sets to final value
    ↓
Digits re-render with AnimatePresence
    ↓
Each digit slides out (exit variant) and new digit slides in (initial → animate)
    ↓
Total animation time: ~300ms + (numDigits * 20ms stagger)
```

### Animation Parameters

| Parameter | Current Value | Location |
|-----------|--------------|----------|
| Duration | 300ms | animated-price.tsx:99 |
| Stagger delay | 20ms per digit | animated-price.tsx:101 |
| Easing | easeOutQuad `[0.25, 0.46, 0.45, 0.94]` | animated-price.tsx:100 |
| Vertical offset | 20px | animated-price.tsx:59, 67 |
| AnimatePresence mode | "popLayout" | animated-price.tsx:89 |

### Price Values (from lib/stripe.ts)

| Plan | Monthly | Annual |
|------|---------|--------|
| FREE | $0 | $0 |
| PRO | $19 | $190 |
| MAX | $139 | $1,390 |

### Total Animation Duration Calculation

For PRO plan switching monthly → annual ($19 → $190):
- Exit animation: 300ms
- 3 digits with stagger: 0ms, 20ms, 40ms
- Total perceived: ~340ms

For MAX plan switching monthly → annual ($139 → $1,390):
- Exit animation: 300ms
- 5 digits (including comma) with stagger: 0ms, 20ms, 40ms, 60ms, 80ms
- Total perceived: ~380ms

## Historical Context (from thoughts/)

No existing research documents specifically about pricing animation were found. Related research includes:
- [2025-12-30-landing-page-stripe-redesign.md](thoughts/shared/research/2025-12-30-landing-page-stripe-redesign.md) - Stripe integration redesign
- [2025-12-06-pricing-implementation-research.md](thoughts/shared/research/2025-12-06-pricing-implementation-research.md) - Pricing implementation

## Related Research

- Landing page V2 redesign plan: [docs/plans/actioned/2025/12. December/2025-12-31-landing-page-high-converting-redesign.md](docs/plans/actioned/2025/12.%20December/2025-12-31-landing-page-high-converting-redesign.md)

## Open Questions

1. The waitlist counter pattern (intermediate values with random intervals) runs for 60 seconds which is much longer than the ~300ms pricing animation. What duration would be appropriate for a counting effect on price changes?

2. Should the counting animation show realistic intermediate prices, or random numbers that give a "slot machine" effect?

3. The current implementation uses Framer Motion's AnimatePresence with digit replacement. A counting animation would require a different approach - either:
   - Interpolating the numeric value and re-rendering digits at each step
   - Using a different animation library/pattern

4. How should the animation behave when switching from annual back to monthly (counting down)?
