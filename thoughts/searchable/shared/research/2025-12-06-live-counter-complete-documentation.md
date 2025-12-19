---
date: 2025-12-06T22:23:18+11:00
researcher: Claude Code
git_commit: c76f5176066de1dd67566ebd7c351cbdedf96b2b
branch: main
repository: tldrsec-ai
topic: "Live Counter Implementation - Complete Documentation"
tags: [research, codebase, live-counter, waitlist, framer-motion, ssr, animation]
status: complete
last_updated: 2025-12-06
last_updated_by: Claude Code
---

# Research: Live Counter Implementation - Complete Documentation

**Date**: 2025-12-06T22:23:18 AEDT
**Researcher**: Claude Code
**Git Commit**: c76f5176066de1dd67566ebd7c351cbdedf96b2b
**Branch**: main
**Repository**: tldrsec-ai

## Research Question
Document the complete implementation of the live counter system, including all components, data flow, animation system, and integration points.

## Summary

The live counter system displays an animated subscriber count on the landing page. It consists of four main components:

1. **WaitlistCounter** - Main component managing data fetching, polling, and animation state
2. **CounterDisplay** - Orchestrates multiple digit animations with comma separators
3. **DigitRoller** - Animates individual digits with Framer Motion
4. **API Endpoint** - Returns count from PostgreSQL cache + Supabase subscribers

The system implements a three-phase animation: initial rolling animation (random increments), smooth transition to real count, and instant polling updates.

## Detailed Findings

### Component Architecture

#### 1. WaitlistCounter Component

**Location**: [components/landing/waitlist-counter.tsx](components/landing/waitlist-counter.tsx)

**Purpose**: Main container component that manages data fetching, state, and animation lifecycle.

**Props Interface (lines 7-10)**:
```typescript
interface WaitlistCounterProps {
  hideAfterSignup?: boolean;    // Hide counter after user signs up
  userHasSignedUp?: boolean;    // Whether user has signed up
}
```

**State Variables (lines 13-21)**:
- `count` (default: 147) - Real count from API
- `isLoading` (default: true) - API request status
- `error` (default: null) - Error message from failed requests
- `animatedCount` (default: 147) - Currently displayed count during animation
- `isAnimating` (default: true) - Controls rolling animation
- `minAnimationReached` (default: false) - Tracks 3-second minimum animation
- `hasCompletedInitialTransition` (default: false) - Tracks initial animation completion

**Configuration Constants (lines 23-26)**:
- `POLL_INTERVAL`: 30,000ms (30 seconds)
- `MAX_POLL_DURATION`: 300,000ms (5 minutes)
- `MIN_ANIMATION_DURATION`: 3,000ms (3 seconds)

**fetchCount Function (lines 28-90)**:
- Creates AbortController with 8-second timeout (lines 34-38)
- Fetches from `/api/waitlist/count` (line 41)
- Validates response is valid number (line 61)
- Preserves default count (147) on any error (line 85)

**useEffect Hooks**:
1. **Initial Fetch Effect (lines 92-102)**: Triggers initial fetch and starts 3-second minimum timer
2. **Polling Effect (lines 104-129)**: Polls every 30 seconds for 5 minutes max
3. **Animation Interval Effect (lines 131-170)**: Random increments of 1-4 every 4 seconds during loading
4. **Smooth Transition Effect (lines 172-224)**: Eased transition from animated count to real count
5. **Polling Update Effect (lines 226-232)**: Instant updates from polling (no animation)

**Conditional Rendering (lines 235-237)**:
```typescript
if (hideAfterSignup && userHasSignedUp) {
  return null;  // Hide counter after successful signup
}
```

---

#### 2. CounterDisplay Component

**Location**: [components/landing/counter/counter-display.tsx](components/landing/counter/counter-display.tsx)

**Purpose**: Orchestrates multiple DigitRoller components with comma separators.

**Props Interface (from types.ts:5-16)**:
- `count` (number) - The count to display
- `isAnimating` (boolean) - Whether animations are running
- `onAnimationComplete` (function) - Callback when all digits complete
- `className` (string) - Additional CSS classes
- `data-testid` (string) - Test identifier

**Key Implementation**:

**Digit Separation (line 26)**:
```typescript
const digits = useMemo(() => separateDigits(safeCount), [safeCount]);
```
Converts count to array: `147` → `[1, 4, 7]`

**Stagger Delay Calculation (lines 60-66)**:
```typescript
const getStaggerDelay = useCallback((index: number): number => {
  const positionFromRight = digits.length - 1 - index;
  return positionFromRight * 40;  // 40ms per digit, right-to-left
}, [digits.length]);
```
Example for 3 digits: Index 0 = 80ms, Index 1 = 40ms, Index 2 = 0ms

**Comma Separator Logic (lines 69-75)**:
Uses `calculateSeparatorPositions()` to determine comma placement every 3 digits from right.

**Accessibility Features (lines 78-92)**:
- `role="status"` - Identifies as status region
- `aria-live="polite"` - Announces updates without interrupting
- `aria-atomic="true"` - Announces entire content on change
- Screen reader text: "Current waitlist count: {number} investors"

---

#### 3. DigitRoller Component

**Location**: [components/landing/counter/digit-roller.tsx](components/landing/counter/digit-roller.tsx)

**Purpose**: Animates individual digits (0-9) with vertical sliding transitions.

**Props Interface (from types.ts:18-29)**:
- `value` (number) - Single digit 0-9
- `animationDuration` (default: 400ms) - Animation duration
- `delay` (default: 0) - Stagger delay
- `onAnimationComplete` (function) - Completion callback
- `className` (string) - Additional CSS classes

**useReducedMotion Hook (line 22-23)**:
```typescript
const prefersReducedMotion = useReducedMotion();
```
Respects user accessibility preferences for reduced motion.

**Animation Variants (lines 38-55)**:
```typescript
const animationVariants = {
  initial: prefersReducedMotion
    ? { opacity: 1, y: 0 }           // Reduced motion: static
    : { y: -20, opacity: 1 },        // Full: slide from above (SSR fix)
  animate: { y: 0, opacity: 1 },     // Resting state
  exit: prefersReducedMotion
    ? { opacity: 0, y: 0 }           // Reduced motion: fade only
    : { y: 20, opacity: 0 }          // Full: slide down and fade
};
```

**SSR Hydration Fix (line 43)**:
`opacity: 1` in initial state prevents hydration mismatch. Previously, `opacity: 0` caused content to remain invisible when `useReducedMotion()` returned different values on server vs client.

**Transition Configuration (lines 57-62)**:
```typescript
const transitionConfig = {
  duration: prefersReducedMotion ? 0.15 : animationDuration / 1000,
  delay: prefersReducedMotion ? 0 : delay / 1000,
  ease: prefersReducedMotion ? 'easeInOut' : [0.34, 1.56, 0.64, 1],  // Elastic overshoot
  onComplete: onAnimationComplete
};
```

**AnimatePresence (lines 81-98)**:
- `mode="wait"` ensures exit completes before enter
- Key changes trigger exit → enter sequence
- GPU acceleration hints via `willChange` and `backfaceVisibility`

---

#### 4. API Endpoint

**Location**: [app/api/waitlist/count/route.ts](app/api/waitlist/count/route.ts)

**Purpose**: Returns current subscriber count from database sources.

**Data Sources**:
1. **DailyWaitlistCache** (PostgreSQL via Prisma) - Daily cached base count
2. **newsletter_subscribers** (Supabase) - Live subscriber count

**Count Calculation (line 100)**:
```typescript
const totalCount = baseCount + (subscriberCount || 0);
```

**Cache Lookup Strategy (lines 12-42)**:
1. Query today's cache entry
2. If not found, use yesterday's cache
3. If neither exists, default to 147

**Response Format**:
```json
{
  "count": 247,
  "debug": {
    "baseCount": 147,
    "subscriberCount": 100,
    "totalCount": 247,
    "processingTime": 45
  }
}
```

**Error Handling Hierarchy**:
1. Missing environment variables → returns baseCount only
2. Supabase query failure → returns baseCount only
3. Critical exception → returns hard-coded 147

---

### Utility Files

**Location**: [components/landing/counter/](components/landing/counter/)

#### utils.ts

**separateDigits(count: number): number[]** (lines 22-34)
- Converts number to digit array: `147` → `[1, 4, 7]`
- Returns `[1, 4, 7]` for invalid inputs

**calculateSeparatorPositions(digitCount: number): number[]** (lines 83-92)
- Returns positions where commas should appear
- Example: 7 digits → `[3, 6]` for `1,234,567`

**sanitizeCount(value: unknown): number** (lines 101-125)
- Type validates input
- Caps maximum at 1,000,000
- Defaults invalid values to 147

#### types.ts

Exports interfaces:
- `CounterDisplayProps`
- `DigitRollerProps`
- `DigitColumnProps`
- `AnimationState`
- `DigitSeparationResult`

---

### Integration Points

#### Landing Page Entry

**File**: [app/page.tsx](app/page.tsx)
- Line 33: Renders `<FocusedInvestorHero />` as page content

#### Hero Section

**File**: [components/landing/focused-investor-hero.tsx](components/landing/focused-investor-hero.tsx)
- Line 10: Manages `hasSignedUp` state with `useState(false)`
- Line 37: Renders `WaitlistForm` with `onSuccess` callback
- Line 40: Renders `WaitlistCounter` with props:
  ```typescript
  <WaitlistCounter hideAfterSignup={true} userHasSignedUp={hasSignedUp} />
  ```

#### User Signup Flow

1. User submits `WaitlistForm`
2. Form calls `onSuccess` callback
3. `hasSignedUp` state set to `true`
4. `WaitlistCounter` receives `userHasSignedUp={true}`
5. Counter returns `null` (hides)

---

### Database Schema

**DailyWaitlistCache** (prisma/schema.prisma:765-773):
```prisma
model DailyWaitlistCache {
  id        String   @id @default(uuid())
  date      DateTime @unique @db.Date
  baseCount Int
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([date])
}
```

**newsletter_subscribers** (Supabase):
- Table in Supabase storing newsletter subscriptions
- Queried via count-only query with `head: true`

---

### Animation Phases

#### Phase 1: Initial Rolling Animation (lines 131-170)
- **Trigger**: Component mount while loading
- **Behavior**: Random increments of 1-4 every 4 seconds
- **Duration**: Until fetch completes AND 3 seconds elapse

#### Phase 2: Smooth Transition (lines 172-224)
- **Trigger**: Fetch complete + 3 seconds minimum reached
- **Behavior**: Eased increments toward real count, 4 seconds per step
- **Duration**: Variable based on difference between animated and real count

#### Phase 3: Polling Updates (lines 226-232)
- **Trigger**: After initial transition completes
- **Behavior**: Instant update (no animation)
- **Frequency**: Every 30 seconds for 5 minutes

---

## Code References

### Core Components
- [components/landing/waitlist-counter.tsx](components/landing/waitlist-counter.tsx) - Main counter (271 lines)
- [components/landing/counter/digit-roller.tsx](components/landing/counter/digit-roller.tsx) - Digit animation (98 lines)
- [components/landing/counter/counter-display.tsx](components/landing/counter/counter-display.tsx) - Orchestration (108 lines)
- [components/landing/counter/utils.ts](components/landing/counter/utils.ts) - Utilities (125 lines)
- [components/landing/counter/types.ts](components/landing/counter/types.ts) - TypeScript interfaces (56 lines)
- [components/landing/counter/index.ts](components/landing/counter/index.ts) - Barrel exports (8 lines)

### API Routes
- [app/api/waitlist/count/route.ts](app/api/waitlist/count/route.ts) - GET endpoint (137 lines)
- [app/api/cron/update-daily-count/route.ts](app/api/cron/update-daily-count/route.ts) - Cache update cron

### Integration Points
- [components/landing/focused-investor-hero.tsx](components/landing/focused-investor-hero.tsx) - Hero section
- [app/page.tsx](app/page.tsx) - Landing page entry

### Database
- [prisma/schema.prisma](prisma/schema.prisma):765-773 - DailyWaitlistCache model

### Tests
- [components/landing/counter/__tests__/utils.test.ts](components/landing/counter/__tests__/utils.test.ts) - Utility tests

---

## Architecture Documentation

### Data Flow

```
1. User visits landing page
   └── app/page.tsx renders FocusedInvestorHero

2. FocusedInvestorHero mounts
   ├── Initializes hasSignedUp = false
   ├── Renders WaitlistForm (with onSuccess callback)
   └── Renders WaitlistCounter (with hideAfterSignup=true)

3. WaitlistCounter mounts
   ├── Shows default 147, starts rolling animation
   ├── Calls fetchCount() → /api/waitlist/count
   ├── Starts 3-second minimum timer
   └── Starts polling timer (30s interval, 5min max)

4. API endpoint processes request
   ├── Queries DailyWaitlistCache (today or yesterday)
   ├── Queries Supabase newsletter_subscribers count
   └── Returns baseCount + subscriberCount

5. WaitlistCounter receives count
   ├── Updates count state
   ├── Waits for 3-second minimum
   └── Transitions from animatedCount to real count

6. CounterDisplay renders digits
   ├── Separates count into digit array
   ├── Calculates stagger delays (40ms, right-to-left)
   ├── Calculates comma positions
   └── Renders DigitRoller for each digit

7. DigitRoller animates
   ├── Checks useReducedMotion preference
   ├── Applies enter animation (y: -20 → 0)
   ├── Renders digit with opacity: 1 (SSR-safe)
   └── Calls onAnimationComplete when done

8. User submits WaitlistForm
   ├── Form calls onSuccess callback
   ├── hasSignedUp set to true
   └── WaitlistCounter receives userHasSignedUp=true → returns null
```

### Error Handling Strategy

```
Level 1: API Timeout (8 seconds)
└── AbortController cancels request
    └── Preserves default count (147)

Level 2: Missing Environment Variables
└── Returns baseCount only
    └── Error: "Missing configuration"

Level 3: Database Query Failure
└── Returns baseCount only
    └── Error: "Database query failed"

Level 4: Critical Exception
└── Returns hard-coded 147
    └── Error: "Critical error"
```

---

## Historical Context (from thoughts/)

### Previous SSR Hydration Bug

**Analysis Document**: [.claude/analysis/counter-invisibility-root-cause.md](.claude/analysis/counter-invisibility-root-cause.md)
**Task Document**: [.claude/tasks/fix-counter-visibility.md](.claude/tasks/fix-counter-visibility.md)

**Problem**: Counter was invisible because:
1. Initial animation started with `opacity: 0`
2. `useReducedMotion()` returned different values on server vs client
3. Hydration failed, animation never triggered

**Fix Applied**: Changed `initial: { opacity: 0 }` to `initial: { opacity: 1 }` so content is visible from SSR.

---

## Related Research

- [docs/plans/actioned/2025-11-13-dynamic-waitlist-counter.md](docs/plans/actioned/2025-11-13-dynamic-waitlist-counter.md) - Original implementation plan
- [docs/plans/actioned/2025-11-14-fix-waitlist-production-errors.md](docs/plans/actioned/2025-11-14-fix-waitlist-production-errors.md) - Production fixes including RLS policies
- [thoughts/shared/research/2025-12-06-live-counter-implementation.md](thoughts/shared/research/2025-12-06-live-counter-implementation.md) - Initial research document

---

## Open Questions

1. **Cache Update Mechanism**: How/when is `DailyWaitlistCache` populated?
   - Likely via `/api/cron/update-daily-count/route.ts` but not analyzed in this research

2. **Test Coverage**: Some integration tests reference outdated static text ("247+") instead of dynamic counter

3. **Environment Variables**: Which specific Supabase keys are required?
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`
