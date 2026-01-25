# Research: Track Tickers Component, Tier Limits, and Checkout Flow

**Date**: 2026-01-22T09:05:01Z
**Researcher**: Claude
**Git Commit**: 755e6a9f0076a226ef6d14589b13533b54d978d8
**Branch**: stripe-integration
**Repository**: stripe-integration

---

## Research Question

The track tickers component on the dashboard route is showing/allowing users to add more than three tickers on the free tier (screenshot shows 6 tickers instead of max 3). The upgrade CTA at the bottom is possibly too aggressive. Additionally, clicking the upgrade buttons shows a toast notification "Checkout not available, please try again later" indicating broken checkout.

---

## Summary

The research documents the current implementation of:
1. **Track Tickers Component** - How tickers are displayed and managed
2. **Tier Limits** - How FREE/PRO/MAX limits are defined and enforced
3. **Upgrade CTA** - How the upgrade section is displayed
4. **Checkout Flow** - How Stripe checkout is created from the dashboard

---

## Detailed Findings

### 1. Tier Limit Definitions

**File**: `lib/subscription/three-tier-limits.ts`

```typescript
export const THREE_TIER_LIMITS = {
  FREE: 3,
  PRO: 25,
  MAX: -1  // -1 = unlimited (no validation needed)
} as const;

export function checkTierLimit(currentCount: number, tier: 'FREE' | 'PRO' | 'MAX'): boolean {
  const limit = THREE_TIER_LIMITS[tier];
  if (limit === -1) return false;  // MAX tier unlimited
  return currentCount >= limit;
}
```

**Key Point**: The tier limit of 3 for FREE users is defined here.

---

### 2. API Ticker Limit Enforcement

**File**: `app/api/user/tickers/route.ts:270-284`

```typescript
// 3-tier limit check with MAX unlimited
const currentCount = dbUser.tickers.length;
const tier = dbUser.subscriptionTier as 'FREE' | 'PRO' | 'MAX';

if (checkTierLimit(currentCount, tier)) {
  const limitInfo = getTierLimitInfo(tier);
  return NextResponse.json({
    error: `You've reached your ${currentCount} ticker limit for the ${tier} tier`,
    limitReached: true,
    currentTier: tier,
    maxTickers: limitInfo.limit,
    currentCount,
    upgradeRequired: tier !== 'MAX'
  }, { status: 403 });
}
```

**Key Point**: Limit enforcement happens server-side when **adding** a ticker. It checks `dbUser.subscriptionTier` from the database.

---

### 3. Dashboard Client - Tickers Display and Upgrade CTA

**File**: `components/dashboard/dashboard-client.tsx:457-468`

```typescript
{/* Upgrade CTA for non-MAX users */}
{subscription && subscription.planType !== "MAX" && (
  <UpgradeCTASection
    currentPlan={subscription.planType as "FREE" | "PRO" | "MAX"}
    tickerCount={companies.length}
    tickerLimit={
      SUBSCRIPTION_PLANS[subscription.planType as PlanType]?.tickerLimit || 3
    }
    onUpgradeClick={handleUpgradeClick}
    isCheckoutLoading={isCheckoutLoading}
  />
)}
```

**Key Points**:
- The upgrade CTA is shown to all non-MAX users
- `tickerLimit` comes from `SUBSCRIPTION_PLANS` based on `subscription.planType`
- There is **no frontend enforcement** preventing users from adding tickers - only the API enforces limits

---

### 4. Upgrade CTA Section Component

**File**: `components/dashboard/upgrade-cta-section.tsx`

The component displays:
- A gradient banner (blue for FREE→PRO, amber for PRO→MAX)
- Two pricing buttons: `$199/mo` and `$1,990/yr` with "Save 17%"
- Feature comparison grid

**Display Logic** (lines 25-27):
```typescript
const isNearLimit = tickerLimit > 0 && tickerCount >= tickerLimit * 0.8;
const isAtLimit = tickerLimit > 0 && tickerCount >= tickerLimit;
```

**Messaging** (lines 41-45):
```typescript
{isAtLimit
  ? `You've reached your ${tickerLimit} company limit. Upgrade to track up to ${proPlan.tickerLimit} companies.`
  : isNearLimit
    ? `You're using ${tickerCount} of ${tickerLimit} companies. Get more with Pro.`
    : `Get real-time alerts, all filing types (8-K, Form 4), and track up to ${proPlan.tickerLimit} companies.`}
```

---

### 5. Checkout Flow from Dashboard

**File**: `components/dashboard/dashboard-client.tsx:297-319`

```typescript
const handleUpgradeClick = useCallback(
  async (planType: "PRO" | "MAX", billingCycle: "monthly" | "annual") => {
    setIsCheckoutLoading(true);
    try {
      const plan = SUBSCRIPTION_PLANS[planType];
      const priceId =
        billingCycle === "annual" ? plan.annualPriceId : plan.monthlyPriceId;
      if (!priceId) {
        toast.error("Checkout not available. Please try again later.");
        return;
      }
      const checkoutUrl = await createCheckout(planType, priceId);
      window.location.href = checkoutUrl;
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error("Failed to start checkout. Please try again.");
    } finally {
      setIsCheckoutLoading(false);
    }
  },
  [createCheckout]
);
```

**The toast "Checkout not available" occurs when `priceId` is falsy** (line 305-308).

---

### 6. Stripe Price ID Configuration

**File**: `lib/stripe.ts:43-94`

```typescript
export const SUBSCRIPTION_PLANS = {
  FREE: {
    monthlyPriceId: null,
    annualPriceId: null,
    // ...
  },
  PRO: {
    monthlyPriceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || '',
    annualPriceId: process.env.STRIPE_PRO_ANNUAL_PRICE_ID || '',
    monthlyPrice: 199,
    annualPrice: 1990,
    tickerLimit: 25,
    // ...
  },
  MAX: {
    monthlyPriceId: process.env.STRIPE_MAX_MONTHLY_PRICE_ID || '',
    annualPriceId: process.env.STRIPE_MAX_ANNUAL_PRICE_ID || '',
    monthlyPrice: 349,
    annualPrice: 3490,
    tickerLimit: -1,  // unlimited
    // ...
  },
} as const;
```

**Key Point**: If `STRIPE_PRO_MONTHLY_PRICE_ID` or other Stripe price ID environment variables are not set (or empty), the `priceId` will be an empty string `''`, which is falsy in JavaScript.

---

### 7. useSubscription Hook - createCheckout Function

**File**: `hooks/use-subscription.ts:74-106`

```typescript
const createCheckout = useCallback(async (planType: string, priceId: string): Promise<string> => {
  try {
    setError(null);

    const response = await fetch('/api/user/subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planType, priceId }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create checkout');
    }

    const data = await response.json();

    if (!data.checkoutUrl) {
      throw new Error('No checkout URL received');
    }

    return data.checkoutUrl;
  } catch (err) {
    // ...
  }
}, []);
```

The hook posts to `/api/user/subscription` with `planType` and `priceId`.

---

### 8. Subscription API - Checkout Session Creation

**File**: `app/api/user/subscription/route.ts:131-303`

**Price ID Resolution** (lines 159-191):
```typescript
// Determine price ID - support both legacy and new modes
let priceId: string | null = legacyPriceId || null;

if (!priceId && planType) {
  const plan = SUBSCRIPTION_PLANS[planType as keyof typeof SUBSCRIPTION_PLANS];
  // ...
  priceId = billingInterval === 'annual' ? plan.annualPriceId : plan.monthlyPriceId;

  if (!priceId) {
    return NextResponse.json(
      { error: `Stripe price ID not configured for ${planType} ${billingInterval}` },
      { status: 503 }
    );
  }
}
```

**Key Point**: The API also checks if `priceId` is falsy and returns a 503 error.

---

### 9. Tickers Table Component

**File**: `components/dashboard/tickers-table/tickers-table.tsx`

- A pure display component using TanStack Table
- Displays data passed to it via `data` prop
- Does **not** enforce any ticker limits - just renders what it receives
- Supports pagination (10 items per page)
- Has mobile view variant

---

### 10. Database Schema - User Subscription Tier

**File**: `prisma/schema.prisma:31`

```prisma
model User {
  // ...
  subscriptionTier      SubscriptionTier       @default(FREE)
  // ...
}
```

The `subscriptionTier` field on the User model defaults to FREE and is used for tier limit enforcement.

---

## Code References

| File | Line(s) | Description |
|------|---------|-------------|
| `lib/subscription/three-tier-limits.ts` | 1-22 | Tier limit constants (FREE=3, PRO=25, MAX=unlimited) |
| `app/api/user/tickers/route.ts` | 270-284 | Server-side ticker limit enforcement |
| `components/dashboard/dashboard-client.tsx` | 297-319 | `handleUpgradeClick` - shows toast if `priceId` is empty |
| `components/dashboard/dashboard-client.tsx` | 457-468 | Upgrade CTA section rendering |
| `components/dashboard/upgrade-cta-section.tsx` | 1-162 | Upgrade CTA UI with dual pricing buttons |
| `lib/stripe.ts` | 43-94 | `SUBSCRIPTION_PLANS` with price IDs from env vars |
| `hooks/use-subscription.ts` | 74-106 | `createCheckout` function calling API |
| `app/api/user/subscription/route.ts` | 131-303 | POST handler creating Stripe checkout session |
| `prisma/schema.prisma` | 31 | User model with `subscriptionTier` field |

---

## Architecture Documentation

### Flow: Adding a Ticker

```
User clicks "Add Ticker" → handleAddTicker() → POST /api/user/tickers
                                                     ↓
                                          checkTierLimit(currentCount, tier)
                                                     ↓
                                          If limit reached: Return 403 error
                                          If within limit: Create ticker in DB
```

### Flow: Upgrade Checkout

```
User clicks "$199/mo" → handleUpgradeClick('PRO', 'monthly')
                              ↓
                    Get priceId from SUBSCRIPTION_PLANS.PRO.monthlyPriceId
                              ↓
                    If priceId empty: toast.error("Checkout not available...")
                    If priceId exists: createCheckout(planType, priceId)
                              ↓
                    POST /api/user/subscription with {planType, priceId}
                              ↓
                    Create Stripe checkout session
                              ↓
                    Redirect to Stripe checkout URL
```

---

## Key Observations

1. **Tier limits are enforced server-side only** - The frontend does not prevent users from attempting to add tickers beyond their limit; the API returns a 403 error.

2. **"Checkout not available" toast** - This occurs when `SUBSCRIPTION_PLANS[planType].monthlyPriceId` or `annualPriceId` is an empty string, which happens when the corresponding `STRIPE_PRO_MONTHLY_PRICE_ID`, `STRIPE_PRO_ANNUAL_PRICE_ID`, etc. environment variables are not set.

3. **User has 6 tickers on FREE tier** - The database allows this because:
   - Either the user was added before tier limits were implemented
   - Or the user's `subscriptionTier` in the database is not 'FREE'
   - Or there's a mismatch between the Clerk user and database user lookup

4. **Upgrade CTA shows dual pricing buttons** - Currently displays both `$199/mo` and `$1,990/yr Save 17%` buttons side-by-side with full feature comparison grid.

---

## Environment Variables Required for Checkout

```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRO_MONTHLY_PRICE_ID
STRIPE_PRO_ANNUAL_PRICE_ID
STRIPE_MAX_MONTHLY_PRICE_ID
STRIPE_MAX_ANNUAL_PRICE_ID
```

---

## Open Questions

1. What is the user's actual `subscriptionTier` value in the database? (Could be checked via Prisma Studio or direct query)

2. Are the Stripe price ID environment variables properly set in the current environment?

3. Should there be frontend enforcement of ticker limits to prevent the API call entirely?

4. Is there migration data where existing users had more than 3 tickers before limits were implemented?
