# Landing Page Authenticated User Experience Improvements

**Date:** 2026-02-14
**Status:** Planning
**Related:** Trial System Implementation (2026-02-11)

## Context

The landing page currently provides the same experience for all visitors, regardless of authentication or subscription status. This creates several UX issues:

1. **Generic messaging:** Authenticated users see "Welcome back!" which is redundant
2. **Hidden navigation:** Navbar only appears on scroll for all users, forcing authenticated users to scroll to access dashboard
3. **No subscription context:** Pricing section doesn't indicate which plan the user currently has
4. **Missed personalization:** Landing page doesn't leverage available subscription data to personalize the experience

With the recent 7-day trial implementation (PROGRESS.md, 2026-02-11), we now have rich subscription data including:
- Trial status (isTrialing, trialEndsAt, daysRemaining)
- Plan type (FREE, PRO, MAX)
- Grandfathered user status
- Active subscription state

**Goal:** Create a personalized landing page experience for authenticated users that:
- Provides immediate navigation access (always-visible navbar)
- Shows their current subscription status in pricing section
- Removes redundant messaging
- Maintains the high-converting design for unauthenticated visitors

## Implementation Plan

### 1. Remove Redundant "Welcome Back!" Text

**File:** `components/landing/sections-v2/gmail-inbox-hero.tsx`

**Current code (line 1068):**
```typescript
<motion.p variants={staggerItem} className="landing-caption">
  {isOnboarded ? 'Welcome back!' : isSignedIn ? 'Just one more step!' : 'No credit card required. Cancel anytime.'}
</motion.p>
```

**Updated code:**
```typescript
<motion.p variants={staggerItem} className="landing-caption">
  {isSignedIn && !isOnboarded ? 'Just one more step!' : !isSignedIn ? 'No credit card required. Cancel anytime.' : ''}
</motion.p>
```

**Rationale:**
- Onboarded users see no caption (their CTA already says "Go to Dashboard")
- Not-yet-onboarded users see "Just one more step!" to encourage completion
- Unauthenticated users see the trust-building message

---

### 2. Always Show Navbar for Authenticated Users

**File:** `components/landing/landing-navbar.tsx`

**Current behavior:**
- Navbar hidden until user scrolls past hero (IntersectionObserver)
- Same behavior for all visitors

**New behavior:**
- **Authenticated users:** Navbar always visible (sticky at top)
- **Unauthenticated users:** Navbar appears on scroll (current behavior)

**Implementation:**

Modify the `useEffect` hook (lines 30-47):

```typescript
// Track hero section visibility with Intersection Observer
useEffect(() => {
  // If user is authenticated, always show navbar
  if (isSignedIn) {
    setIsVisible(true);
    return; // Don't set up observer for authenticated users
  }

  // For unauthenticated users, use scroll-based visibility
  if (!heroRef.current) return;

  const observer = new IntersectionObserver(
    ([entry]) => {
      // Show navbar when hero is NOT intersecting (user scrolled past)
      setIsVisible(!entry.isIntersecting);
    },
    {
      threshold: 0,
      rootMargin: '-80px 0px 0px 0px', // Account for navbar height
    }
  );

  observer.observe(heroRef.current);

  return () => observer.disconnect();
}, [heroRef, isSignedIn]); // Add isSignedIn to dependency array
```

**Rationale:**
- Authenticated users prioritize function (quick dashboard access) over marketing aesthetics
- Unauthenticated users get the full landing page experience with scroll-reveal navbar
- Follows progressive enhancement: better UX for known users

---

### 3. Display User's Current Plan in Pricing Section

**File:** `components/landing/sections-v2/pricing-section-v2.tsx`

**Current state:**
- Shows all 3 tiers (FREE, PRO, MAX) equally
- No indication of user's current subscription
- No subscription data fetched

**Changes required:**

#### A. Import useSubscription hook (top of file, ~line 6)

```typescript
import { useSubscription } from '@/hooks/use-subscription';
```

#### B. Fetch subscription data (inside component, after existing state, ~line 90)

```typescript
export function PricingSectionV2() {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const router = useRouter();

  // User authentication state from Clerk
  const { isSignedIn, isLoaded, user } = useUser();
  const isOnboarded = Boolean(user?.publicMetadata?.onboardingCompleted);

  // ADD: Fetch subscription data
  const { subscription, loading: subscriptionLoading } = useSubscription();
```

#### C. Add helper function (after getCtaText, ~line 178)

```typescript
// Check if this plan is the user's current active plan
const isCurrentPlan = (planKey: string) => {
  return subscription?.planType === planKey && subscription?.isActive;
};
```

#### D. Update plan card header to show "Current Plan" badge (modify rendering, ~line 254-272)

```typescript
{/* Plan Header with Popular Badge inline */}
<div className="flex items-center justify-between mb-4">
  <div>
    <p className="text-xs text-[var(--landing-text-muted)] uppercase tracking-wide mb-1">
      {plan.key === 'FREE' ? 'Basic' : plan.name}
    </p>
    <h3
      className="text-2xl font-bold"
      style={{ color: 'var(--landing-secondary)' }}
    >
      {plan.name}
    </h3>
  </div>
  <div className="flex flex-col gap-1 items-end">
    {plan.popular && (
      <Badge className="bg-[var(--landing-primary)] text-white text-xs px-2 py-0.5">
        Popular
      </Badge>
    )}
    {/* ADD: Current plan badge */}
    {isCurrentPlan(plan.key) && (
      <Badge className="bg-green-50 text-green-700 border-green-200 text-xs px-2 py-0.5">
        Current Plan
      </Badge>
    )}
  </div>
</div>
```

#### E. Update CTA button to disable for current plan (modify button section, ~line 308-339)

```typescript
{/* CTA Button - Positioned after price like Grok */}
<div className="mb-6">
  {!isLoaded || subscriptionLoading ? (
    // Loading state - show skeleton button
    <Skeleton className="h-10 w-full rounded-lg" />
  ) : isCurrentPlan(plan.key) ? (
    // Current plan - show disabled button with "Current Plan" text
    <Button
      className="w-full bg-gray-100 text-gray-500 border border-gray-200 cursor-default hover:bg-gray-100"
      disabled
    >
      Current Plan
    </Button>
  ) : plan.disabled ? (
    <Button
      className="w-full bg-gray-100 text-gray-500 border border-gray-200 cursor-default hover:bg-gray-100"
      disabled
    >
      {plan.cta}
    </Button>
  ) : (
    <Button
      onClick={() => handleCheckout(plan.key)}
      disabled={loadingPlan === plan.key}
      className={`w-full ${
        plan.popular
          ? 'landing-button-primary'
          : 'landing-button-secondary'
      }`}
    >
      {loadingPlan === plan.key ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Loading...
        </>
      ) : (
        getCtaText(plan)
      )}
    </Button>
  )}
</div>
```

**Rationale:**
- Follows established pattern from `/app/subscribe/page.tsx` (lines 150, 291-305)
- Prevents duplicate subscriptions (user can't re-subscribe to current plan)
- Provides clear visual feedback with green "Current Plan" badge
- Uses skeleton loading state to prevent layout shift
- Matches UX from billing dashboard (`/components/billing/subscription-plans.tsx`)

---

## Files to Modify

| File | Changes | Lines Affected |
|------|---------|---------------|
| `components/landing/sections-v2/gmail-inbox-hero.tsx` | Remove "Welcome back!" conditional | ~1068 |
| `components/landing/landing-navbar.tsx` | Always show navbar for authenticated users | ~30-47 |
| `components/landing/sections-v2/pricing-section-v2.tsx` | Add subscription fetching & current plan highlighting | Multiple sections |

## Data Flow

```
User visits landing page
         ↓
Is user authenticated? (Clerk)
         ↓
    ┌────┴────┐
   YES       NO
    ↓         ↓
Navbar    Navbar on
always    scroll only
visible
    ↓         ↓
Fetch subscription    No subscription
via useSubscription   data needed
    ↓                     ↓
pricing-section-v2    pricing-section-v2
shows current         shows all plans
plan badge           equally
```

## Trial System Integration

The 7-day trial system (implemented 2026-02-11) provides these fields via `useSubscription()`:

```typescript
interface SubscriptionData {
  planType: 'FREE' | 'PRO' | 'MAX'
  isActive: boolean
  isTrialing: boolean
  daysRemaining: number
  trialEndsAt: string | null
  isGrandfathered: boolean
  // ... other fields
}
```

**How we use it:**
- `planType` determines which pricing card gets the "Current Plan" badge
- `isActive` ensures we only highlight active subscriptions
- Trial users on FREE plan will see green badge on FREE tier
- Grandfathered FREE users also see the badge (permanent free access)
- PRO/MAX subscribers see their respective tier highlighted

## Verification Steps

### Manual Testing Scenarios

#### 1. Unauthenticated User
- [ ] Visit `/` (landing page)
- [ ] Verify navbar appears only after scrolling past hero
- [ ] Verify pricing shows all 3 tiers (FREE, PRO, MAX)
- [ ] Verify no "Current Plan" badges appear
- [ ] Verify caption shows "No credit card required. Cancel anytime."
- [ ] Verify all CTAs say "Get Started"

#### 2. Authenticated, Not Onboarded
- [ ] Sign in but don't complete onboarding
- [ ] Visit `/`
- [ ] Verify navbar is **always visible** at top
- [ ] Verify pricing shows all 3 tiers
- [ ] Verify no "Current Plan" badges (no subscription yet)
- [ ] Verify caption shows "Just one more step!"
- [ ] Verify CTAs say "Complete Setup"

#### 3. Authenticated, FREE Tier (Trial Active)
- [ ] Sign in with account on 7-day trial
- [ ] Visit `/`
- [ ] Verify navbar always visible
- [ ] Verify **FREE tier** has green "Current Plan" badge
- [ ] Verify FREE tier button is disabled showing "Current Plan"
- [ ] Verify PRO/MAX tiers show "Get Started" or "Upgrade" CTAs
- [ ] Verify no caption text appears

#### 4. Authenticated, PRO Tier
- [ ] Sign in with PRO subscription
- [ ] Visit `/`
- [ ] Verify navbar always visible
- [ ] Verify **PRO tier** has green "Current Plan" badge
- [ ] Verify PRO tier button is disabled showing "Current Plan"
- [ ] Verify MAX tier shows upgrade CTA
- [ ] Verify no caption text appears

#### 5. Authenticated, MAX Tier
- [ ] Sign in with MAX subscription
- [ ] Visit `/`
- [ ] Verify navbar always visible
- [ ] Verify **MAX tier** has green "Current Plan" badge
- [ ] Verify MAX tier button is disabled showing "Current Plan"
- [ ] Verify no caption text appears

#### 6. Authenticated, Grandfathered User
- [ ] Sign in with grandfathered FREE account (pre-trial migration)
- [ ] Visit `/`
- [ ] Verify FREE tier has "Current Plan" badge
- [ ] Verify permanent free access is maintained

### Automated Testing

```bash
# Run TypeScript compilation check
npm run build

# Run existing test suites
npm run test

# Check for any linting issues
npm run lint
```

### Edge Cases to Test

- [ ] Subscription data loading (skeleton states)
- [ ] Subscription API failure (graceful degradation)
- [ ] Rapid auth state changes (sign in/out quickly)
- [ ] Trial expiration boundary (last day of trial)
- [ ] Multiple browser tabs (concurrent landing page views)

## Existing Patterns Referenced

| Pattern | File | Lines | Usage |
|---------|------|-------|-------|
| Current plan detection | `/app/subscribe/page.tsx` | 150, 291-305 | `isCurrentPlan()` helper |
| Current plan badge | `/components/billing/subscription-plans.tsx` | 87-93 | Green badge styling |
| Subscription fetching | `/app/dashboard/billing/page.tsx` | 63-81 | `useSubscription()` pattern |
| Trial data structure | `/hooks/use-subscription.ts` | 11-28 | SubscriptionData interface |
| Plan config | `/lib/stripe/plans.ts` | 8-62 | SUBSCRIPTION_PLANS |

## Security Considerations

- All subscription data is fetched client-side via `/api/user/subscription`
- API endpoint validates user session (Clerk auth)
- No sensitive data exposed (Stripe IDs are safe to display client-side)
- Badge display is purely visual - backend controls actual subscription access

## Performance Impact

- Adds one API call: `GET /api/user/subscription` (only for authenticated users)
- Response time: ~100-200ms (database query)
- Cached by useSubscription hook (no re-fetching on re-renders)
- Loading state prevents layout shift during data fetch

## Rollback Plan

If issues arise:
1. Revert navbar changes → all users get scroll-based navbar
2. Revert pricing changes → remove subscription fetching, show all tiers equally
3. Revert caption changes → restore "Welcome back!" text

All changes are non-breaking and can be rolled back independently.

## Future Enhancements

Potential follow-up improvements:
- Show trial countdown in pricing section for trial users
- Add "Upgrade" vs "Get Started" text based on current tier
- Personalize hero section messaging based on subscription status
- Add trial expiration warnings in navbar for users <2 days remaining

## Related Issues

- Trial System Implementation: PROGRESS.md (2026-02-11)
- Dashboard Trial Banners: `components/dashboard/plan-status-banner.tsx`
- Billing Page Current Plan Display: `/app/dashboard/billing/page.tsx`
