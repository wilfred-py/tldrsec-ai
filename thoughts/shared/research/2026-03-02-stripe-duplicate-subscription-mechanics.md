---
date: 2026-03-02 11:58:24 AEDT
researcher: Claude Code
git_commit: 3628c6124ab7d3194541254824b398cf8b1bdc97
branch: worktree-stripe
repository: tldrsec-ai
topic: "Stripe duplicate subscription mechanics - how subscriptions are captured, webhook handling, and duplicate prevention"
tags: [research, codebase, stripe, subscriptions, webhooks, duplicate-prevention, billing]
status: complete
last_updated: 2026-03-02
last_updated_by: Claude Code
---

# Research: Stripe Duplicate Subscription Mechanics

**Date**: 2026-03-02 11:58:24 AEDT
**Researcher**: Claude Code
**Git Commit**: 3628c6124ab7d3194541254824b398cf8b1bdc97
**Branch**: worktree-stripe
**Repository**: tldrsec-ai

## Research Question

On Stripe, there are currently two users with duplicate subscriptions. Review the codebase for:
- Mechanics on how we capture user subscriptions
- Stripe webhooks
- Checks when doing POST, GET, PATCH, PUT requests to Stripe for checkout and integrations
- Whether there are guards preventing a user from having more than one product subscription (excluding upgrade/downgrade proration)

## Summary

Subscription state is managed across two models: `User.subscriptionTier` (denormalized read field) and `UserSubscription` (full Stripe-linked record). The database enforces a one-to-one relationship via `@unique` on `userId`, `stripeCustomerId`, and `stripeSubscriptionId`. Upgrades/downgrades modify the existing Stripe subscription in-place with proration.

There are **two checkout entry points** with different levels of duplicate prevention:
1. **`POST /api/user/subscription`** (authenticated) — has two-layer duplicate check (DB + Stripe API)
2. **`POST /api/checkout/direct`** (pre-auth, homepage) — has **no** duplicate checks, uses `customer_email` instead of `customer` ID, and omits `userId` from metadata

The webhook handler (`handleCheckoutCompleted`) requires `session.metadata.userId` to match a checkout to a database user. Sessions from `/api/checkout/direct` do not include `userId` in metadata.

## Detailed Findings

### 1. Database Schema — Subscription Models

**File**: `prisma/schema.prisma`

#### User model (lines 19-61)
```
subscriptionTier  SubscriptionTier  @default(FREE)   // denormalized, dashboard reads this
userSubscription  UserSubscription?                   // one-to-one relation
```
- `SubscriptionTier` enum: `FREE`, `PRO`, `MAX`
- Trial fields: `trialStartedAt`, `trialEndsAt`, `isTrialing`

#### UserSubscription model (lines 237-254)
```
userId                String   @unique                 // one record per user
stripeCustomerId      String?  @unique                 // one record per Stripe customer
stripeSubscriptionId  String?  @unique                 // one record per Stripe subscription
planType              PlanType @default(FREE)           // FREE, PRO, MAX
isActive              Boolean  @default(true)
currentPeriodStart    DateTime
currentPeriodEnd      DateTime
cancelAtPeriodEnd     Boolean  @default(false)
stripePriceId         String?
```

**Key constraint**: `userId @unique` prevents multiple `UserSubscription` rows for the same user at the database level. However, this does NOT prevent a user from having multiple Stripe subscriptions under different Stripe customer IDs — those would exist only in Stripe, not in the database.

---

### 2. Checkout Entry Point A: `/api/checkout/direct` (Pre-Auth)

**File**: `app/api/checkout/direct/route.ts`

This is the homepage checkout for users who are not yet authenticated.

```typescript
// Lines 62-70
const session = await stripe.checkout.sessions.create({
  payment_method_types: ['card'],
  line_items: [{ price: priceId, quantity: 1 }],
  mode: 'subscription',
  success_url: `${origin}/onboarding?session_id={CHECKOUT_SESSION_ID}`,
  cancel_url: `${origin}/?cancelled=true`,
  customer_email: email,           // NOT customer ID
  metadata: { planType, source: 'homepage' }  // NO userId
});
```

What this route does:
- Validates email + planType via Zod schema
- For FREE: creates a Clerk user and returns redirect
- For PRO/MAX: creates a Stripe checkout session with `customer_email`
- Rate-limited at 10 req/min

What this route does NOT do:
- Does not look up the user in the database
- Does not check for existing subscriptions (DB or Stripe)
- Does not check for existing Stripe customers with the same email
- Does not pass a `customer` ID (uses `customer_email` instead — Stripe creates a new customer each time)
- Does not include `userId` in checkout session metadata

---

### 3. Checkout Entry Point B: `/api/user/subscription` POST (Authenticated)

**File**: `app/api/user/subscription/route.ts:147-424`

This is the authenticated checkout for logged-in users.

**Duplicate Prevention Layer 1 — DB check** (lines 273-283):
```typescript
const existingSubscription = await prisma.userSubscription.findUnique({
  where: { userId: dbUserId },
});
if (existingSubscription && existingSubscription.isActive) {
  return NextResponse.json(
    { error: 'User already has an active subscription' },
    { status: 409 }
  );
}
```

**Duplicate Prevention Layer 2 — Stripe check** (lines 317-361):
```typescript
if (stripeCustomerId) {
  const activeSubs = await listActiveSubscriptions(stripeCustomerId);
  if (activeSubs.length > 0) {
    // Syncs DB state from Stripe, returns 409
    const latestSub = activeSubs[0];
    const activePlanType = getPlanTypeFromPriceId(latestSub.items.data[0]?.price.id);
    await prisma.userSubscription.upsert({ ... }); // reconcile DB
    return NextResponse.json({
      error: 'User already has an active subscription in Stripe',
      action: 'use_put',
      currentPlan: activePlanType,
    }, { status: 409 });
  }
}
```

**Note**: The Stripe check only queries the `stripeCustomerId` already known to the database. If a user has a second Stripe customer ID (created via `/api/checkout/direct`), this check would not find it.

**Checkout session creation** (lines 382-393):
```typescript
const session = await createCheckoutSession({
  priceId,
  customerId: stripeCustomerId,    // passes customer ID — reuses existing Stripe customer
  successUrl: `${appUrl}/dashboard?subscription_success=true&session_id={CHECKOUT_SESSION_ID}`,
  cancelUrl,
  metadata: {
    userId: clerkId,               // includes userId for webhook resolution
    planType,
    billingInterval,
  },
});
```

**Pre-checkout record** (lines 396-409):
```typescript
await prisma.userSubscription.upsert({
  where: { userId: dbUserId },
  update: { stripeCustomerId, updatedAt: new Date() },
  create: {
    userId: dbUserId,
    planType: 'FREE',       // stays FREE until webhook confirms
    isActive: false,        // activated by webhook
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    stripeCustomerId,
  },
});
```

---

### 4. Stripe Webhook Handler

**File**: `app/api/webhook/stripe/route.ts`

#### Event routing (lines 59-86)
Six events handled:
- `checkout.session.completed` → `handleCheckoutCompleted`
- `customer.subscription.created` → `handleSubscriptionCreated`
- `customer.subscription.updated` → `handleSubscriptionUpdated`
- `customer.subscription.deleted` → `handleSubscriptionDeleted`
- `invoice.payment_succeeded` → `handlePaymentSucceeded`
- `invoice.payment_failed` → `handlePaymentFailed`

#### `handleCheckoutCompleted` (lines 99-186)
```typescript
if (session.mode !== 'subscription') return;

const metadataUserId = session.metadata?.userId;
const planType = session.metadata?.planType;

if (!metadataUserId || !planType) return;  // EXITS EARLY if no userId in metadata
```
- Resolves Clerk ID to DB user ID via `OR: [{ id }, { authProviderId }]`
- Uses `prisma.userSubscription.upsert({ where: { userId } })` — idempotent
- Also upserts `UsagePeriod` with plan-specific filing limits
- Calls `syncUserSubscriptionTier(userId, planType)`

**Key**: Sessions from `/api/checkout/direct` have `metadata: { planType, source: 'homepage' }` but NO `userId`. This handler returns early at line 110.

#### `handleSubscriptionCreated` (lines 188-229)
- Looks up by `stripeCustomerId`
- If no `UserSubscription` record found → returns early (line 201)
- Updates `planType`, `stripeSubscriptionId`, period dates
- Calls `syncUserSubscriptionTier`

#### `handleSubscriptionUpdated` (lines 231-268)
- Looks up by `stripeSubscriptionId`
- Derives `planType` from price ID via `getPlanTypeFromPriceId()`
- Updates `planType`, period dates, `cancelAtPeriodEnd`
- Calls `syncUserSubscriptionTier`

#### `handleSubscriptionDeleted` (lines 270-300)
- Looks up by `stripeSubscriptionId`
- Sets `planType: 'FREE'`, `isActive: false`
- Calls `syncUserSubscriptionTier(userId, 'FREE')`

#### `handlePaymentSucceeded` (lines 302-334)
- Looks up by `stripeSubscriptionId`
- Sets `isActive: true`

#### `handlePaymentFailed` (lines 336-358)
- Looks up by `stripeSubscriptionId`
- Logs only — no deactivation logic

#### `syncUserSubscriptionTier` helper (lines 18-30)
```typescript
async function syncUserSubscriptionTier(userId: string, planType: 'FREE' | 'PRO' | 'MAX') {
  await prisma.user.updateMany({
    where: { OR: [{ id: userId }, { authProviderId: userId }] },
    data: { subscriptionTier: planType },
  });
}
```
Called by all four subscription event handlers.

---

### 5. Upgrade/Downgrade Handling (PUT Route)

**File**: `app/api/user/subscription/route.ts:430-679`

Plan ordering: `{ FREE: 0, PRO: 1, MAX: 2 }`

| Direction | Lines | Proration | Stripe API Call |
|---|---|---|---|
| PRO → MAX (upgrade) | 530-597 | `proration_behavior: 'always_invoice'` | Immediate prorated charge |
| MAX → PRO (downgrade) | 601-662 | `proration_behavior: 'create_prorations'` | Credit applied |
| Any → FREE (cancel) | 502-527 | `cancelSubscription(id, true)` | Cancel at period end |

All upgrade/downgrade operations modify the **existing Stripe subscription in-place** by swapping the price item. The Stripe subscription ID remains the same. Both paths also update `User.subscriptionTier` directly via `prisma.user.update`.

---

### 6. Dashboard Checkout Session Fallback

**File**: `app/dashboard/page.tsx:64-103`

Handles the race condition where a user returns from Stripe checkout before the webhook fires:
```typescript
if (subscriptionSuccess && sessionId && subscriptionTier === 'FREE') {
  const session = await retrieveCheckoutSession(sessionId);
  if (session?.payment_status === 'paid' && session.metadata?.planType) {
    await prisma.user.update({ ... });              // update subscriptionTier
    await prisma.userSubscription.upsert({ ... });  // upsert by userId
  }
}
```
Uses `upsert` by `userId` — safe against unique constraint.

---

### 7. Additional Subscription Creation Path

**File**: `services/filings/enhanced/subscriptionService.ts:415-448`

The filing pipeline auto-creates a default `UserSubscription` with `planType: 'BASIC'` if none exists. Uses `prisma.userSubscription.create()` (not upsert) which would throw on duplicate `userId`.

---

### 8. Stripe Library Functions

**File**: `lib/stripe/index.ts`

| Function | Lines | Purpose |
|---|---|---|
| `isStripeEnabled()` | 77-79 | Checks stripe client + webhook secret configured |
| `getPriceIdForPlan(planType, interval)` | 84-102 | Maps plan + interval to env var price ID |
| `getPlanTypeFromPriceId(priceId)` | 347-363 | Reverse maps price ID to plan type |
| `validateWebhookSignature(payload, sig)` | 133-148 | Wraps `stripe.webhooks.constructEvent()` |
| `createCheckoutSession(...)` | 153-188 | `stripe.checkout.sessions.create()` with `mode: 'subscription'` |
| `createCustomer(...)` | 215-235 | `stripe.customers.create()` |
| `getCustomer(id)` | 240-254 | `stripe.customers.retrieve()` |
| `getSubscription(id)` | 259-273 | `stripe.subscriptions.retrieve()` |
| `cancelSubscription(id, atPeriodEnd)` | 278-290 | `stripe.subscriptions.update/cancel()` |
| `updateSubscription(id, updates)` | 313-322 | `stripe.subscriptions.update()` |
| `listActiveSubscriptions(customerId)` | 328-341 | `stripe.subscriptions.list({ status: 'active' })` |
| `retrieveCheckoutSession(id)` | 295-308 | `stripe.checkout.sessions.retrieve()` |

---

### 9. GET Route — Read Subscription

**File**: `app/api/user/subscription/route.ts:30-139`

- Authenticates via Clerk
- Resolves Clerk ID to DB user ID
- Returns mock FREE response when Stripe not configured
- Returns FREE defaults if no `UserSubscription` record exists
- Otherwise returns full subscription data + usage period + trial status
- No mutation — purely reads from DB

---

### 10. Billing Portal

**File**: `app/api/billing/portal/route.ts`

- POST only
- Looks up `stripeCustomerId` from `UserSubscription`
- Creates `stripe.billingPortal.sessions.create()` with return URL to `/dashboard/billing`
- Users can self-manage subscriptions (cancel, update payment method) through Stripe's hosted portal

---

## Code References

- `prisma/schema.prisma:237-254` — UserSubscription model with unique constraints
- `prisma/schema.prisma:31` — User.subscriptionTier denormalized field
- `app/api/checkout/direct/route.ts:62-70` — Pre-auth checkout (no duplicate checks)
- `app/api/user/subscription/route.ts:273-283` — DB-level duplicate check
- `app/api/user/subscription/route.ts:317-361` — Stripe-level duplicate check
- `app/api/user/subscription/route.ts:382-393` — Checkout session with userId metadata
- `app/api/user/subscription/route.ts:530-597` — Upgrade with `always_invoice` proration
- `app/api/user/subscription/route.ts:601-662` — Downgrade with `create_prorations`
- `app/api/webhook/stripe/route.ts:59-86` — Event routing switch
- `app/api/webhook/stripe/route.ts:99-186` — `handleCheckoutCompleted` (requires metadata.userId)
- `app/api/webhook/stripe/route.ts:188-229` — `handleSubscriptionCreated`
- `app/api/webhook/stripe/route.ts:231-268` — `handleSubscriptionUpdated`
- `app/api/webhook/stripe/route.ts:270-300` — `handleSubscriptionDeleted`
- `app/api/webhook/stripe/route.ts:18-30` — `syncUserSubscriptionTier`
- `lib/stripe/index.ts:328-341` — `listActiveSubscriptions`
- `lib/stripe/index.ts:153-188` — `createCheckoutSession`
- `app/dashboard/page.tsx:64-103` — Dashboard checkout session fallback
- `services/filings/enhanced/subscriptionService.ts:415-448` — Pipeline default subscription auto-create

## Architecture Documentation

### Subscription State Flow
```
User action → Checkout session created → Stripe processes payment
  → Stripe fires webhooks → App processes events → DB updated
  → User.subscriptionTier synced
```

### Two Models, Dual Sync Pattern
- `UserSubscription.planType` — authoritative billing record with Stripe IDs
- `User.subscriptionTier` — denormalized field read by dashboard
- Both must stay in sync via `syncUserSubscriptionTier()` on every mutation

### Upgrade/Downgrade — In-Place Modification
Subscriptions are never deleted and recreated for plan changes. The existing Stripe subscription has its price item swapped, preserving the subscription ID and billing cycle.

### Lookup Key Patterns in Webhooks
- `checkout.session.completed` → metadata `userId`
- `customer.subscription.created` → `stripeCustomerId`
- `customer.subscription.updated/deleted` → `stripeSubscriptionId`
- `invoice.*` → `stripeSubscriptionId`

## Related Research

- `thoughts/shared/research/2026-01-06-stripe-integration-pricing-analysis.md`
- `thoughts/shared/research/2026-01-23-checkout-user-not-found-error.md`
- `thoughts/shared/research/2025-12-31-stripe-subscriptions-landing-page-integration.md`
- `thoughts/shared/research/2025-12-30-landing-page-stripe-redesign.md`

## Open Questions

1. For the two users with duplicate Stripe subscriptions — did they go through `/api/checkout/direct` multiple times, or through another path?
2. Should `/api/checkout/direct` be updated to look up existing Stripe customers by email before creating a checkout session?
3. Should the webhook `handleCheckoutCompleted` have a fallback to look up users by `customer_email` when `metadata.userId` is missing?
4. Are there any Stripe-side settings (e.g., Checkout session `subscription_data.trial_settings` or customer portal restrictions) that could help prevent duplicate subscriptions?
