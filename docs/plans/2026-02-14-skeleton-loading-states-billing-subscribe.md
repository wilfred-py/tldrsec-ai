# Skeleton Loading States for /dashboard/billing and /subscribe

**Date**: 2026-02-14T05:57:05Z
**Git Commit**: 946d87a
**Branch**: main

## Context

Users see white screens or generic loading fallbacks when navigating to `/dashboard/billing` and `/subscribe`. The dashboard already has a comprehensive `loading.tsx` with shimmer animations and responsive dual-view, but these two routes have no route-level loading states. The billing page's inline loading uses non-standard `animate-pulse` divs instead of the `Skeleton` component, and the subscribe page's inline skeleton doesn't match the actual page layout.

## What We're NOT Doing

- No `/billing` redirect (all links correctly use `/dashboard/billing`)
- No dashboard client-side loading gap fix (already handled by `TickersLoadingSkeleton`)
- No changes to existing dashboard `loading.tsx` (already comprehensive)
- No `prefers-reduced-motion` support (not in scope, not in existing patterns)

## Phase 1: Billing Route Skeleton Loading

### Overview
Create `app/dashboard/billing/loading.tsx` and update the inline loading state in `app/dashboard/billing/page.tsx` to use proper `Skeleton` components matching the actual billing page layout.

### Step 1.1: Write Failing Tests

**Test File**: `app/dashboard/billing/__tests__/loading.test.tsx`

Tests for the route-level `BillingLoading` component:

```typescript
import { render, screen } from '@testing-library/react';
import BillingLoading from '../loading';

describe('BillingLoading', () => {
  it('should render skeleton elements', () => {
    render(<BillingLoading />);
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should render header skeleton matching h1 + subtitle', () => {
    render(<BillingLoading />);
    // h1 "Billing & Subscription" = text-3xl -> h-8
    // subtitle paragraph -> h-4
    const container = document.querySelector('.container');
    expect(container).toBeInTheDocument();
  });

  it('should render subscription card skeleton', () => {
    render(<BillingLoading />);
    // Card with CardHeader + CardContent structure
    const card = document.querySelector('[class*="shadow"]');
    expect(card).toBeInTheDocument();
  });

  it('should use animate-fadeIn for container', () => {
    render(<BillingLoading />);
    const animated = document.querySelector('.animate-fadeIn');
    expect(animated).toBeInTheDocument();
  });

  it('should render action button skeletons', () => {
    render(<BillingLoading />);
    // "Manage Payment Methods" button + cancel toggle area
    const buttonSkeletons = document.querySelectorAll('[data-slot="skeleton"]');
    // At minimum: h1, subtitle, card title, plan name, price, billing period, separator area, 2 action items
    expect(buttonSkeletons.length).toBeGreaterThanOrEqual(8);
  });
});
```

**Checkpoint 1.1**: `npm run test -- --testPathPattern="billing.*loading"`
Expected: All tests fail (module not found)

### Step 1.2: Implement Route-Level Loading

**File**: `app/dashboard/billing/loading.tsx` (NEW)

Skeleton structure matching the actual billing page layout:
- Container: `container mx-auto py-8 space-y-8 animate-fadeIn`
- Header section: title skeleton `h-8 w-72` + subtitle skeleton `h-4 w-96`
- Subscription card: `Card` with `CardHeader` (icon + title skeletons) and `CardContent` (plan name, price, billing period, separator, action buttons)
- Uses staggered `animate-slideUp` delays on card sections

Components to import: `Skeleton`, `Card`, `CardContent`, `CardHeader`, `Separator`

**Checkpoint 1.2**: `npm run test -- --testPathPattern="billing.*loading"`
Expected: All tests pass

### Step 1.3: Update Inline Loading

**File**: `app/dashboard/billing/page.tsx` (EDIT lines 133-143)

Replace the `animate-pulse` divs:
```tsx
// OLD:
<div className="animate-pulse space-y-4">
  <div className="h-8 bg-[var(--landing-border)] rounded w-64"></div>
  ...
</div>

// NEW: Import Skeleton, reuse same structure as loading.tsx
```

Import `Skeleton` from `@/components/ui/skeleton` and replace the inline loading with the same layout-matching skeleton used in `loading.tsx`. Extract a shared `BillingLoadingSkeleton` component or inline it.

**Checkpoint 1.3**:
- `npm run test -- --testPathPattern="billing"`
- `npm run lint`

### Step 1.4: Final Phase Verification

#### Automated:
- [ ] `npm run test -- --testPathPattern="billing.*loading"` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds

#### Manual:
- [ ] Navigate to `/dashboard/billing` - see layout-matching skeleton during load
- [ ] Skeleton matches card structure of actual billing page
- [ ] Shimmer animation runs smoothly

**STOP**: Await manual confirmation before Phase 2.

---

## Phase 2: Subscribe Route Skeleton Loading

### Overview
Create `app/subscribe/loading.tsx` and improve the inline `SubscribePageLoading` component to better match the actual page layout with responsive support.

### Step 2.1: Write Failing Tests

**Test File**: `app/subscribe/__tests__/loading.test.tsx`

```typescript
import { render } from '@testing-library/react';
import SubscribeLoading from '../loading';

describe('SubscribeLoading', () => {
  it('should render skeleton elements', () => {
    render(<SubscribeLoading />);
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('should render back button skeleton', () => {
    render(<SubscribeLoading />);
    // Back button area
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it('should render header skeletons (title + subtitle)', () => {
    render(<SubscribeLoading />);
    // "Choose Your Plan" heading + subtitle
    const centeredSection = document.querySelector('.text-center');
    expect(centeredSection).toBeInTheDocument();
  });

  it('should render billing toggle skeleton', () => {
    render(<SubscribeLoading />);
    // Toggle area skeleton
    const toggleArea = document.querySelector('.justify-center');
    expect(toggleArea).toBeInTheDocument();
  });

  it('should render 3 plan card skeletons', () => {
    render(<SubscribeLoading />);
    // Grid with 3 plan cards
    const grid = document.querySelector('.grid');
    expect(grid).toBeInTheDocument();
    // Each card should have multiple skeletons
    const skeletons = document.querySelectorAll('[data-slot="skeleton"]');
    // At minimum: back btn + title + subtitle + toggle + (3 cards * ~5 skeletons each) = ~20
    expect(skeletons.length).toBeGreaterThanOrEqual(15);
  });

  it('should use responsive grid for plan cards', () => {
    render(<SubscribeLoading />);
    const grid = document.querySelector('.grid');
    expect(grid?.className).toContain('md:grid-cols-3');
  });

  it('should use animate-fadeIn', () => {
    render(<SubscribeLoading />);
    const animated = document.querySelector('.animate-fadeIn');
    expect(animated).toBeInTheDocument();
  });
});
```

**Checkpoint 2.1**: `npm run test -- --testPathPattern="subscribe.*loading"`
Expected: All tests fail (module not found)

### Step 2.2: Implement Route-Level Loading

**File**: `app/subscribe/loading.tsx` (NEW)

Skeleton structure matching the actual subscribe page:
- Full page: `min-h-screen py-8 px-4` with landing background
- Back button: skeleton `h-10 w-20` top-left
- Header (centered): title skeleton `h-10 w-64` + subtitle skeleton `h-5 w-96 max-w-2xl mx-auto`
- Billing toggle (centered): skeleton `h-6 w-48`
- Plan cards grid: `grid grid-cols-1 md:grid-cols-3 gap-6` with 3 card skeletons
  - Each card: `landing-card` style with staggered delays
  - Card contents: tier label `h-3 w-16`, plan name `h-7 w-24`, price area `h-[88px]`, CTA button `h-10 w-full`, 4-5 feature lines `h-4 w-3/4`
- Footer: ESC hint skeleton `h-4 w-48 mx-auto`

**Checkpoint 2.2**: `npm run test -- --testPathPattern="subscribe.*loading"`
Expected: All tests pass

### Step 2.3: Update Inline Loading

**File**: `app/subscribe/page.tsx` (EDIT `SubscribePageLoading` at lines 370-384 and inline loading at lines 152-165)

Replace the minimal skeleton (title + subtitle + 3 rectangles) with the improved layout-matching skeleton. Both the inline `if (loading)` block and the `SubscribePageLoading` component should use the same improved skeleton.

Option: Extract a `SubscribeLoadingSkeleton` function component that both `loading.tsx` and the inline loading reference. Since `loading.tsx` is a server component, it would need its own copy, but the inline component in page.tsx can share with `SubscribePageLoading`.

**Checkpoint 2.3**:
- `npm run test -- --testPathPattern="subscribe"`
- `npm run lint`

### Step 2.4: Final Phase Verification

#### Automated:
- [ ] `npm run test -- --testPathPattern="subscribe.*loading"` passes
- [ ] `npm run test -- --testPathPattern="subscribe"` passes (existing subscribe tests still pass)
- [ ] `npm run lint` passes
- [ ] `npm run build` succeeds

#### Manual:
- [ ] Navigate to `/subscribe` - see layout-matching skeleton during load
- [ ] Plan card grid responds correctly on mobile (single column) vs desktop (3 columns)
- [ ] Shimmer animation and staggered delays look smooth
- [ ] Back button area visible in skeleton

**STOP**: Await manual confirmation.

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `app/dashboard/billing/loading.tsx` | CREATE | Route-level billing skeleton |
| `app/dashboard/billing/__tests__/loading.test.tsx` | CREATE | Billing skeleton tests |
| `app/dashboard/billing/page.tsx` | EDIT | Replace inline `animate-pulse` loading with `Skeleton` components |
| `app/subscribe/loading.tsx` | CREATE | Route-level subscribe skeleton |
| `app/subscribe/__tests__/loading.test.tsx` | CREATE | Subscribe skeleton tests |
| `app/subscribe/page.tsx` | EDIT | Improve `SubscribePageLoading` and inline loading skeleton |

## Existing Patterns to Reuse

| Pattern | Source |
|---------|--------|
| Base `Skeleton` component | `components/ui/skeleton.tsx` |
| `Card`/`CardHeader`/`CardContent` | `components/ui/card.tsx` |
| `Separator` | `components/ui/separator.tsx` |
| `animate-fadeIn`, `animate-slideUp`, `animate-shimmer` | `app/globals.css:117-155` |
| Staggered animation delays | `app/dashboard/loading.tsx` pattern: `style={{ animationDelay: \`${i * N}ms\` }}` |
| `data-slot="skeleton"` for test queries | Built into `Skeleton` component |
| Responsive breakpoints | `hidden sm:block` / `sm:hidden` pattern |
| Container sizing | `container mx-auto` / `max-w-5xl mx-auto` |

## Testing Strategy

Tests use `data-slot="skeleton"` queries (most reliable per existing patterns), structural assertions (grid classes, responsive classes), and animation class presence checks. No mock APIs needed since `loading.tsx` files are pure presentational components with no data dependencies.

## Verification

```bash
# All new tests pass
npm run test -- --testPathPattern="(billing|subscribe).*loading"

# No regressions
npm run test
npm run lint
npm run build
```
