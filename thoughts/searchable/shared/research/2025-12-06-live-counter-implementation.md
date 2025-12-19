---
date: 2025-12-06T22:08:44+11:00
researcher: Claude Code
git_commit: c76f5176066de1dd67566ebd7c351cbdedf96b2b
branch: main
repository: tldrsec-ai
topic: "Live Counter Not Working - Implementation Research"
tags: [research, codebase, live-counter, waitlist, framer-motion, ssr]
status: complete
last_updated: 2025-12-06
last_updated_by: Claude Code
---

# Research: Live Counter Not Working

**Date**: 2025-12-06T22:08:44 AEDT
**Researcher**: Claude Code
**Git Commit**: c76f5176066de1dd67566ebd7c351cbdedf96b2b
**Branch**: main
**Repository**: tldrsec-ai

## Research Question
The live counter is not working. Document the current implementation and identify what exists.

## Summary

The live counter system consists of a **WaitlistCounter** component that displays an animated subscriber count on the landing page. The system has been through multiple iterations to fix visibility issues, with the most recent fix addressing SSR hydration mismatches.

**Key Finding**: The codebase contains detailed analysis documents (`.claude/analysis/counter-invisibility-root-cause.md` and `.claude/tasks/fix-counter-visibility.md`) documenting a previous critical bug where the counter was invisible due to SSR hydration issues with the `useReducedMotion()` hook. The fix was implemented by changing `initial: { opacity: 0 }` to `initial: { opacity: 1 }` to ensure content is visible from server-side render.

## Detailed Findings

### Component Architecture

#### 1. WaitlistCounter Component
- **Location**: [components/landing/waitlist-counter.tsx](components/landing/waitlist-counter.tsx)
- **Purpose**: Fetches subscriber count from API, displays animated counter, implements polling

**State Management (lines 13-21):**
- `count`: Real count from API (default: 147)
- `isLoading`: API request status
- `animatedCount`: Displayed count during animation (default: 147)
- `isAnimating`: Controls rolling animation
- `minAnimationReached`: Ensures 3-second minimum animation
- `hasCompletedInitialTransition`: Tracks initial animation completion

**Configuration (lines 23-26):**
- `POLL_INTERVAL`: 30 seconds
- `MAX_POLL_DURATION`: 5 minutes
- `MIN_ANIMATION_DURATION`: 3 seconds

**Data Flow:**
1. Component mounts with default count of 147
2. Fetches real count from `/api/waitlist/count` with 8-second timeout
3. Animates from 147 to real count over 3+ seconds
4. Polls every 30 seconds for 5 minutes

#### 2. DigitRoller Component
- **Location**: [components/landing/counter/digit-roller.tsx](components/landing/counter/digit-roller.tsx)
- **Purpose**: Animates individual digits with Framer Motion

**Critical Implementation Details (lines 35-55):**
```tsx
// CRITICAL FIX: Start visible to avoid SSR hydration mismatch
const animationVariants = {
  initial: prefersReducedMotion
    ? { opacity: 1, y: 0 } // START VISIBLE for reduced motion
    : {
        y: -20,
        opacity: 1  // START VISIBLE to prevent SSR mismatch
      },
  animate: { y: 0, opacity: 1 },
  exit: prefersReducedMotion
    ? { opacity: 0, y: 0 }
    : { y: 20, opacity: 0 }
};
```

**The `useReducedMotion()` hook at line 23:**
```tsx
const prefersReducedMotion = useReducedMotion();
```

This hook is the source of the previously documented SSR hydration issue:
- **Server**: Returns `false` (no `window.matchMedia`)
- **Client**: Returns actual user preference
- **Result**: Potential hydration mismatch if variants differ

#### 3. CounterDisplay Component
- **Location**: [components/landing/counter/counter-display.tsx](components/landing/counter/counter-display.tsx)
- **Purpose**: Orchestrates multiple DigitRoller components

**Features:**
- Splits count into individual digits
- Calculates stagger delay (40ms per digit, right-to-left)
- Adds comma separators automatically
- Accessibility support with `aria-live="polite"`

#### 4. API Endpoint
- **Location**: [app/api/waitlist/count/route.ts](app/api/waitlist/count/route.ts)
- **Purpose**: Returns current subscriber count

**Data Sources:**
1. `DailyWaitlistCache` (Prisma) - Daily base count
2. `newsletter_subscribers` (Supabase) - Live subscriber count

**Calculation:** `baseCount + subscriberCount`

**Fallback:** Returns 147 on any error

### Previously Documented Issues

#### SSR Hydration Mismatch (Fixed)
- **Analysis Document**: [.claude/analysis/counter-invisibility-root-cause.md](.claude/analysis/counter-invisibility-root-cause.md)
- **Task Document**: [.claude/tasks/fix-counter-visibility.md](.claude/tasks/fix-counter-visibility.md)

**Original Problem:**
- Component started with `opacity: 0`
- `useReducedMotion()` returned different values on server vs client
- Hydration failed, animation never triggered
- Result: Blank/invisible counter

**Applied Fix:**
- Changed `initial: { opacity: 0 }` to `initial: { opacity: 1 }`
- Content now visible from SSR before JavaScript hydrates

### Test Files

- **Unit Tests**: [components/landing/counter/__tests__/utils.test.ts](components/landing/counter/__tests__/utils.test.ts)
- **Manual Test Files**:
  - `test-counter.html`
  - `test-counter-visibility.html`
- **Screenshots**:
  - `.playwright-mcp/waitlist-counter-test.png`
  - `.playwright-mcp/waitlist-counter-fixed.png`

### Related Documentation

- **Implementation Plan**: [docs/plans/actioned/2025-11-13-dynamic-waitlist-counter.md](docs/plans/actioned/2025-11-13-dynamic-waitlist-counter.md)
- **Production Error Fixes**: [docs/plans/actioned/2025-11-14-fix-waitlist-production-errors.md](docs/plans/actioned/2025-11-14-fix-waitlist-production-errors.md)

## Code References

### Core Components
- [components/landing/waitlist-counter.tsx](components/landing/waitlist-counter.tsx) - Main counter component with data fetching
- [components/landing/counter/digit-roller.tsx](components/landing/counter/digit-roller.tsx) - Individual digit animation
- [components/landing/counter/counter-display.tsx](components/landing/counter/counter-display.tsx) - Digit orchestration
- [components/landing/counter/utils.ts](components/landing/counter/utils.ts) - Utility functions
- [components/landing/counter/types.ts](components/landing/counter/types.ts) - TypeScript interfaces
- [components/landing/counter/index.ts](components/landing/counter/index.ts) - Barrel exports

### API Routes
- [app/api/waitlist/count/route.ts](app/api/waitlist/count/route.ts) - GET endpoint for count
- [app/api/cron/update-daily-count/route.ts](app/api/cron/update-daily-count/route.ts) - Daily cache update

### Integration Points
- [components/landing/focused-investor-hero.tsx](components/landing/focused-investor-hero.tsx) - Hero section that renders WaitlistCounter
- [app/page.tsx](app/page.tsx) - Landing page entry point

### Database
- `DailyWaitlistCache` model in Prisma schema (lines 765-773)
- `newsletter_subscribers` table in Supabase

### Analysis Documents
- [.claude/analysis/counter-invisibility-root-cause.md](.claude/analysis/counter-invisibility-root-cause.md) - Detailed root cause analysis
- [.claude/tasks/fix-counter-visibility.md](.claude/tasks/fix-counter-visibility.md) - Fix implementation plan

## Architecture Documentation

### Data Flow
```
1. User visits landing page
2. FocusedInvestorHero renders WaitlistCounter
3. WaitlistCounter shows default 147, starts animation
4. fetchCount() calls /api/waitlist/count
5. API queries DailyWaitlistCache + newsletter_subscribers
6. API returns baseCount + subscriberCount
7. Counter transitions from animated value to real count
8. Polling starts (30s intervals, 5 min max)
```

### Animation Strategy
- **Progressive Enhancement**: Digits visible by default, animation enhances
- **Framer Motion**: AnimatePresence with `mode="wait"`
- **Accessibility**: `useReducedMotion()` for reduced motion preference
- **Stagger**: 40ms delay per digit from right-to-left

### Error Handling
- 8-second fetch timeout with AbortController
- Fallback to default count (147) on any error
- Development-only error display with retry button

## Historical Context (from thoughts/)

No additional documents found in thoughts/ directory specifically about the live counter beyond what was already discovered in the codebase analysis.

## Related Research

- [docs/plans/actioned/2025-11-13-dynamic-waitlist-counter.md](docs/plans/actioned/2025-11-13-dynamic-waitlist-counter.md) - Original implementation plan
- [docs/plans/actioned/2025-11-14-fix-waitlist-production-errors.md](docs/plans/actioned/2025-11-14-fix-waitlist-production-errors.md) - Production fixes including RLS policies

## Open Questions

1. **What specific behavior is observed as "not working"?**
   - Is the counter invisible/blank?
   - Is it showing wrong numbers?
   - Is it not animating?
   - Is it not updating from polling?

2. **Environment Context:**
   - Is this in development or production?
   - Are there any console errors visible?
   - What browser is being used?
   - Is reduced motion enabled in accessibility settings?

3. **API Health:**
   - Is `/api/waitlist/count` returning valid data?
   - Are the Supabase environment variables configured?
   - Is the `DailyWaitlistCache` populated?

## Diagnostic Steps

Based on the codebase analysis, here are investigation paths:

1. **Check API Response:**
   ```bash
   curl http://localhost:3000/api/waitlist/count
   ```

2. **Check SSR Output:**
   ```bash
   curl http://localhost:3000 | grep -A5 "digit-roller"
   ```

3. **Check Browser Console:**
   - Look for `[WaitlistCounter]` log messages
   - Check for hydration warnings
   - Look for network errors

4. **Check Visibility:**
   - Inspect element styles for `opacity` values
   - Check if parent container has `display: none`
   - Verify `hideAfterSignup` logic
