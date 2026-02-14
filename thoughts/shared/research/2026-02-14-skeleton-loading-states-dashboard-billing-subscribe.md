---
date: 2026-02-14T05:43:15Z
researcher: Claude
git_commit: 946d87a
branch: main
repository: tldrsec-ai
topic: "Skeleton Loading States for /dashboard, /billing, and /subscribe Routes"
tags: [research, codebase, skeleton, loading, ui, dashboard, billing, subscribe, shadcn]
status: complete
last_updated: 2026-02-14
last_updated_by: Claude
---

# Research: Skeleton Loading States for /dashboard, /billing, and /subscribe Routes

**Date**: 2026-02-14T05:43:15Z
**Researcher**: Claude
**Git Commit**: 946d87a
**Branch**: main
**Repository**: tldrsec-ai

## Research Question

The user wants to use more skeleton loading components (shadcn/ui) to fill in white space while waiting for the `/dashboard`, `/billing`, and `/subscribe` routes. Additionally, `/billing` returns a 404 error.

## Summary

The codebase has a well-implemented base skeleton system with shimmer animations, but only `/dashboard` has a route-level `loading.tsx`. Both `/dashboard/billing` and `/subscribe` lack loading states, resulting in white screens during page loads. The `/billing` 404 is expected because no such route exists -- billing lives at `/dashboard/billing`. Playwright verification revealed the dashboard shows white space during client-side data fetching, and an unrelated hooks error occurs in unauthenticated browser contexts.

---

## Detailed Findings

### 1. Route Structure and `/billing` 404

**There is no `/billing` route.** The billing page exists at `/dashboard/billing/page.tsx`.

Route layout:
```
app/
  dashboard/
    layout.tsx          -- Server component, force-dynamic, wraps in DashboardShell
    page.tsx            -- Server component, auth check, renders DashboardClient
    loading.tsx         -- EXISTS: Full skeleton with table + cards
    billing/
      page.tsx          -- Client component, subscription management
      (NO loading.tsx)
  subscribe/
    page.tsx            -- Client component, pricing page with plan cards
    (NO loading.tsx)
```

All internal links correctly reference `/dashboard/billing`:
- `components/layout/minimal-header.tsx:25` -- "Manage Subscription" button
- `components/dashboard/expired-trial-banner.tsx:24-36` -- "Upgrade Now" CTA
- `components/dashboard/plan-status-banner.tsx:60-75` -- "Upgrade Now" button
- `lib/email/trial-emails.ts:100` -- Trial reminder email CTA

### 2. Existing Skeleton Components

#### Base Skeleton (`components/ui/skeleton.tsx`)

```tsx
function Skeleton({ className, ...props }) {
  return (
    <div className={cn("relative overflow-hidden rounded-md bg-muted/60", className)} {...props}>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-muted-foreground/10 to-transparent" />
    </div>
  )
}
```

- Gray background with `bg-muted/60`
- Shimmer animation overlay (gradient sweep left-to-right, 2s infinite)
- Uses `data-slot="skeleton"` for test identification

#### Data Table Skeleton (`components/ui/data-table/data-table-skeleton.tsx`)

Generic configurable table skeleton:
- Props: `columnCount`, `rowCount` (default 5), `columnWidths[]`, `headerWidths[]`, `showHeader` (default true)
- Generates dynamic rows and columns based on props

#### Tickers Table Skeletons (`components/dashboard/tickers-table/tickers-table-skeleton.tsx`)

Three exported components:
- `TickersTableSkeleton` -- Desktop table (8 rows, staggered 50ms animation delay)
- `TickersMobileSkeleton` -- Mobile cards (4 cards, staggered 75ms animation delay)
- `TickersLoadingSkeleton` -- Responsive wrapper (desktop/mobile toggle at `sm:` breakpoint)

### 3. CSS Animations (`app/globals.css:117-155`)

Defined in `@layer utilities`:

| Animation | Keyframes | Duration | Usage |
|-----------|-----------|----------|-------|
| `animate-shimmer` | `translateX(-100% -> 100%)` | 2s infinite | Individual skeleton elements |
| `animate-fadeIn` | `opacity: 0 -> 1` | 0.5s ease-out | Container wrappers |
| `animate-slideUp` | `opacity: 0, translateY(10px) -> 1, 0` | 0.4s ease-out forwards | List items with staggered delays |

### 4. Dashboard Loading State Analysis

#### Route-Level Loading (`app/dashboard/loading.tsx`)

Full skeleton implementation with 3 sections:
1. **Header skeleton**: Centered `h-10 w-48`
2. **Tracked Tickers card**: shadcn `Card` with header skeletons, 8-row desktop table (hidden on mobile), 4-card mobile view (hidden on desktop), pagination footer
3. **Additional cards**: 3 cards in responsive grid (`md:grid-cols-2 lg:grid-cols-3`)

Staggered animation delays:
- Desktop rows: `i * 50ms`
- Mobile cards: `i * 75ms`
- Additional cards: `(i + 2) * 100ms`

**Visibility issue**: PROGRESS.md notes "Dashboard loads so fast (<500ms) that loading states are barely visible." The route-level `loading.tsx` only shows during server component resolution. Once the page renders, client-side data fetching creates a separate loading phase.

#### Client-Side Loading (`components/dashboard/dashboard-client.tsx:345-348`)

```tsx
{isLoadingCompanies ? (
  <div className="overflow-hidden">
    <TickersLoadingSkeleton />
  </div>
) : showEmptyState ? (
  // empty state
) : (
  <TickersTable ... />
)}
```

The `TickersLoadingSkeleton` shows during the `/api/user/tickers` fetch. However, the area around it (header, card wrapper) is already rendered, so there's no skeleton for:
- The "Tracked Tickers" card header section (renders immediately)
- The subscription banners area (waits for `useSubscription()` to resolve)
- Any additional dashboard content sections

#### Loading Flow Timeline

```
0ms    -- Server: DashboardPage calls currentUser()
         loading.tsx skeleton shown during this phase
~500ms -- Server renders, DashboardClient mounts
         loading.tsx disappears, client-side loading begins
         ProtectedRoute checks auth (shows its own skeleton briefly)
~1s    -- useSubscription() fetch starts (subscription data)
         No skeleton for banner area
~1-4s  -- /api/user/tickers fetch in progress
         TickersLoadingSkeleton shown inside the card
~4s    -- All data loaded, full page rendered
```

**Gap**: Between ~500ms and ~4s, the page shows the card structure but large portions are empty white space while APIs respond.

### 5. `/dashboard/billing` Loading State (MISSING)

**Current behavior**: No `loading.tsx` exists. Falls back to `ProtectedRoute`'s default skeleton:

```tsx
<div className="p-6 space-y-4">
  <Skeleton className="h-8 w-[250px]" />
  <Skeleton className="h-[125px] w-full" />
  <Skeleton className="h-[125px] w-full" />
  <Skeleton className="h-[125px] w-full" />
</div>
```

This is a generic fallback -- 1 header bar + 3 tall rectangles. It doesn't match the actual billing page layout which includes:
- Dashboard header ("Billing")
- Current plan card with plan name, billing period, renewal date
- Cancel/reactivate switch
- "Manage Payment Methods" button (Stripe portal)
- Cancellation warning banner (conditional)

**Billing page data dependencies** (`app/dashboard/billing/page.tsx`):
- `useSubscription()` hook fetches `/api/user/subscription`
- `SUBSCRIPTION_PLANS` config (synchronous import)
- URL search params for `?success=true` / `?canceled=true` handling

### 6. `/subscribe` Loading State (MISSING)

**Current behavior**: No `loading.tsx`. The page component has a `<Suspense>` boundary but no route-level loading UI. Users see a blank white page during initial compilation/load (~3s on first visit per dev logs).

**Subscribe page layout** (`app/subscribe/page.tsx`):
- Back button (top-left)
- "Choose Your Plan" heading + subtitle
- Billing interval toggle (monthly/annual)
- 3 plan cards in responsive grid (Free, Pro with "Popular" badge, Max)
- Each card: tier label, plan name, price, CTA button, feature list
- "Press ESC to go back" footer hint

**Subscribe page data dependencies**:
- `useUser()` from Clerk (auth state check)
- `useSubscription()` (to detect current plan)
- `SUBSCRIPTION_PLANS` config (synchronous)
- Plan pricing calculations (synchronous)

### 7. Playwright Verification Results

**Tested routes** (Playwright MCP, fresh browser, no auth cookies):

| Route | Result | Screenshot |
|-------|--------|------------|
| `/dashboard` | Header renders, then crashes with "Rendered more hooks than during the previous render" | White page with error |
| `/subscribe` | Renders correctly, no loading skeleton visible | Full pricing page |
| `/dashboard/billing` | Redirects to Clerk sign-in (auth required) | Sign-in modal |
| `/billing` | Not tested (known 404) | N/A |

**Dashboard hooks error**: Occurs consistently in unauthenticated Playwright context. Error originates in Next.js Router internals (`app-router.js:170`), not user code. User's authenticated browser sessions load successfully per dev server logs (200 responses).

### 8. `ProtectedRoute` Auth Loading (`components/auth/protected-route.tsx:33-43`)

Shows a minimal skeleton during Clerk auth check:
- 1 header skeleton `h-8 w-[250px]`
- 3 content blocks `h-[125px] w-full`

This is the only loading state visible for `/dashboard/billing` since it has no dedicated `loading.tsx`.

---

## Code References

- `components/ui/skeleton.tsx` -- Base skeleton component with shimmer
- `components/ui/data-table/data-table-skeleton.tsx` -- Generic table skeleton
- `components/dashboard/tickers-table/tickers-table-skeleton.tsx` -- Tickers-specific skeletons
- `app/dashboard/loading.tsx` -- Dashboard route-level loading (exists, works)
- `app/dashboard/billing/page.tsx` -- Billing page (NO loading.tsx)
- `app/subscribe/page.tsx` -- Subscribe/pricing page (NO loading.tsx)
- `app/globals.css:117-155` -- Animation keyframes and utility classes
- `components/auth/protected-route.tsx:33-43` -- Generic auth loading fallback
- `components/dashboard/dashboard-shell.tsx:15-49` -- Dashboard shell with subscription banners
- `hooks/use-subscription.ts` -- Subscription data hook (used by billing + shell)
- `components/dashboard/dashboard-client.tsx:345-348` -- Client-side loading skeleton usage
- `components/layout/minimal-header.tsx:25` -- Links to `/dashboard/billing`
- `__tests__/components/dashboard-skeleton-loading.test.tsx` -- Existing skeleton tests

---

## Architecture Documentation

### Skeleton Design Patterns in Use

1. **Responsive dual-view**: All skeleton implementations have separate desktop (table) and mobile (card) versions, toggled with Tailwind's `sm:` breakpoint
2. **Staggered animations**: List items use incremental `animationDelay` via inline styles (50ms for desktop rows, 75ms for mobile cards)
3. **Three animation layers**: Container fadeIn (0.5s) -> Item slideUp (0.4s staggered) -> Element shimmer (2s infinite)
4. **Size matching**: Skeleton dimensions approximate actual content (ticker badge: `h-6 w-16`, company name: `h-5 w-40`, action button: `h-9 w-9`)
5. **Reusability hierarchy**: Base `Skeleton` -> Generic `DataTableSkeleton` -> Domain-specific `TickersTableSkeleton`
6. **Test support**: `data-slot="skeleton"` attribute for reliable test querying

### Loading State Architecture

Next.js App Router provides two loading mechanisms:
1. **Route-level `loading.tsx`**: Shows during server component rendering (SSR phase)
2. **Client-side conditional**: Shows during async data fetching after hydration

The dashboard uses both, but `/dashboard/billing` and `/subscribe` use neither route-level loading.

---

## Playwright Screenshots

Captured during verification:
- `.playwright-mcp/dashboard-initial-load.png` -- Dashboard white space before crash
- `.playwright-mcp/dashboard-error.png` -- Dashboard hooks error
- `.playwright-mcp/subscribe-page.png` -- Subscribe page fully rendered
- `.playwright-mcp/billing-initial.png` -- Billing redirect to sign-in

---

## Related Research

- `thoughts/shared/research/2026-01-05-dashboard-redesign-inspiration.md` -- Dashboard design research
- `thoughts/shared/research/2025-12-31-dashboard-redesign-to-landing-v2.md` -- Dashboard-to-landing redesign

---

## Open Questions

1. **Dashboard hooks error**: The "Rendered more hooks than during the previous render" error in unauthenticated Playwright sessions -- is this reproducible in user's browser? Does it affect production?
2. **Should `/billing` redirect?**: Should there be a redirect from `/billing` to `/dashboard/billing` for convenience, or is the 404 acceptable?
3. **Subscribe auth loading**: The subscribe page fetches subscription data to detect current plan. Should the skeleton show a loading state for the CTA buttons while this resolves?
4. **Dashboard client-side gap**: The ~500ms-4s gap between route loading.tsx disappearing and data arriving -- should the entire dashboard card structure skeleton persist through this phase?
