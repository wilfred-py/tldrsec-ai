# Fix Stripe Duplicate Subscription Prevention

**Date**: 2026-03-02
**Branch**: worktree-stripe
**Status**: Complete — all phases implemented, dry-run verified, ready for live cleanup
**Reviewed**: 2026-03-03 (1st), 2026-03-04 (2nd)

## Problem

Two users have duplicate Stripe subscriptions. Root cause: `/api/checkout/direct` (homepage pre-auth checkout) has zero duplicate prevention — it creates a new Stripe customer on every call, omits `userId` from metadata, and the webhook silently drops the event. Users pay but see FREE tier, then retry and get another subscription.

Three broken points:
1. **`app/api/checkout/direct/route.ts:62-70`** — No Stripe customer lookup, no active-sub check, no userId in metadata
2. **`app/api/webhook/stripe/route.ts:110`** — `if (!metadataUserId || !planType) return;` drops direct checkout sessions
3. **Post-checkout redirect** — Onboarding page ignores `session_id`; dashboard fallback requires `subscription_success=true` (not in direct checkout URL)

## Approach: Cleanup Script + Three Targeted Fixes

---

## Review Notes

### Architecture Decisions
- **Issue 1**: Use `client_reference_id=email` on checkout sessions + check for open sessions before creating new ones to prevent race conditions
- **Issue 2**: Add email fallback to `handleSubscriptionCreated` webhook handler (mirrors Phase 2 pattern for `handleCheckoutCompleted`)
- **Issue 3**: Extract shared `lib/stripe/sync-subscription.ts` helper for DRY subscription upsert + tier sync logic (used by webhook, reconcile, and authenticated checkout)
- **Issue 4**: Output JSON audit log (`cleanup-audit-YYYY-MM-DD.json`) from cleanup script for billing evidence

### Code Quality Decisions
- **Issue 5**: Add `PaymentLogger.checkoutFailed()` to direct checkout error paths (409 and catch block)
- **Issue 6**: Only reconcile pre-existing users in onboarding (skip freshly-created users to avoid wasted Stripe API calls)
- **Issue 7**: `reconcileStripeSubscription(userId)` requires DB `User.id` — add JSDoc clarifying this, callers pass `dbUser.id`
- **Issue 8**: Forward `subscription_success=true` param through onboarding flow to dashboard redirect

### Test Decisions
- **Issue 9**: Add `handleSubscriptionCreated` email fallback tests to Phase 2 test file (not a separate file)
- **Issue 10**: Add unit tests with mocked Stripe API for cleanup script (consolidation logic, audit log output)
- **Issue 11**: Add error path tests to each test file — rate-limit errors, DB failures, null stripe, pagination edge cases (~4-5 extra tests total)
- **Issue 12**: Add shared Stripe mock factories (`makeStripeCustomer()`, `makeStripeSubscription()`, `makeCheckoutSession()`) to `__tests__/fixtures/subscription-fixtures.ts`

### Performance Decisions
- **Issue 13**: Use `limit: 3` for customer list in Phase 1 (>3 customers per email is extremely rare) + explicit early break on first active sub
- **Issue 14**: Add 200ms delay between user iterations in cleanup script to prevent Stripe rate limiting
- **Issue 15**: Fire-and-forget reconciliation in onboarding (use `.catch()` pattern like `queueWelcomeEmail`, don't `await`)

### Resolved Questions
- **Q1**: Consolidate duplicate Stripe customers — delete extras after migrating subscriptions to the kept customer
- **Q2**: Include sign-in link in 409 response
- **Q3**: Send reminder email to users who pay via direct checkout but never complete onboarding

---

### Second Review (2026-03-04) — Codebase-Verified Decisions

All decisions below verified against actual codebase state.

#### Architecture (R1-R4)
- **R1 (→1A)**: Extract existing private `syncUserSubscriptionTier` (webhook route.ts:18-27) to `lib/stripe/sync-subscription.ts` alongside `syncSubscriptionFromStripeData`. Migrate all 4 webhook call sites (lines 180, 223, 262, 294). Eliminates DRY violation.
- **R2 (→2A)**: Fix `PaymentLogger.checkoutFailed` signature mismatch. Actual: `{ email, error, amount?, ipAddress? }`. Plan had wrong params (`reason`, `planType`, `userAgent`). Use `error` field, drop others.
- **R3 (→3A)**: Onboarding param forwarding needs `useSearchParams()` + `<Suspense>` in `onboarding-client.tsx`. Currently ignores ALL URL params. Hard redirect `window.location.href = '/dashboard'` at line 320 must append `?subscription_success=true`.
- **R4 (→4A)**: Archive customer metadata (invoices, subscriptions, payment methods) in JSON audit log before `stripe.customers.del()`. Prevents permanent data loss for billing disputes.

#### Code Quality (R5-R8)
- **R5 (→5A)**: Remove `OR: [{ id: userId }, { authProviderId: userId }]` in `syncSubscriptionFromStripeData`. JSDoc says "DB User.id (NOT Clerk authProviderId)" — code should match. Use `where: { id: userId }` only.
- **R6 (→6A)**: Wrap DB calls in direct checkout in try-catch (fail-open). If DB is down, proceed without duplicate check. Other layers (webhook Phase 2, reconciliation Phase 3) catch duplicates.
- **R7 (→7A)**: Add pre-transaction `findFirst` for `isNewUser` detection in onboarding. Don't restructure the `$transaction` block. TOCTOU race is harmless (reconciliation is idempotent).
- **R8 (→8A)**: Reuse `dbUser` from email fallback in `handleCheckoutCompleted`. Skip the redundant second `findFirst` by `id`/`authProviderId`. One DB query instead of two.

#### Tests (R9-R12)
- **R9 (→9A)**: Add `__tests__/lib/stripe/sync-subscription.test.ts` — 4-5 unit tests for the shared helper (happy path, user not found, missing price, tier sync, idempotent).
- **R10 (→10A)**: Add 3 targeted tests for review decisions: fail-open checkout (R6), param forwarding (R3), tier sync extraction migration (R1).
- **R11 (→11A)**: Add single integration test: direct-checkout → webhook → reconciliation → tier sync. Exercises handoff points where original bugs lived.
- **R12 (→12A)**: Add `autoPaginate` (or `autoPagingToArray`) to cleanup script's `stripe.customers.list`. Add test for `has_more` pagination.

#### Performance (R13-R16)
- **R13 (→13A)**: Parallelize Phase 1 independent calls with `Promise.all([sessionsCheck, customersCheck, dbCheck])`. Reduces worst-case latency from ~1.2s to ~600ms.
- **R14 (→14A)**: Dashboard shows "Verifying subscription..." indicator when `subscription_success=true` is present. Auto-refreshes after 2-3s. Prevents user seeing FREE tier after paying.
- **R15 (→15A)**: Accept ~600ms cost for new users with no Stripe customer. Defense in depth is worth the one-time cost.
- **R16 (→16A)**: Batch archive data collection in cleanup script with `Promise.all([invoices, subscriptions])` per customer before deletion.

---

## Pre-Phase: Shared Infrastructure

### New File: `lib/stripe/sync-subscription.ts` (Issue 3)

Extract shared subscription upsert + tier sync logic used by webhook handlers, reconciliation, and authenticated checkout Layer 2 recovery.

```typescript
// lib/stripe/sync-subscription.ts
import type Stripe from 'stripe';
import { getPrismaClient } from '@/lib/db/prisma';
import { getPlanTypeFromPriceId } from '@/lib/stripe';

/**
 * Upsert a UserSubscription record from Stripe subscription data and sync User.subscriptionTier.
 * Single source of truth for subscription DB writes — used by webhook, reconcile, and checkout recovery.
 */
export async function syncSubscriptionFromStripeData(
  userId: string,  // DB User.id (NOT Clerk authProviderId)
  subscription: Stripe.Subscription,
  customerId: string
): Promise<{ planType: 'FREE' | 'PRO' | 'MAX' }> {
  const prisma = getPrismaClient();
  const priceId = subscription.items.data[0]?.price.id;
  const planType = getPlanTypeFromPriceId(priceId);

  await prisma.userSubscription.upsert({
    where: { userId },
    update: {
      planType,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
      stripePriceId: priceId,
      isActive: subscription.status === 'active',
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      updatedAt: new Date(),
    },
    create: {
      userId,
      planType,
      stripeSubscriptionId: subscription.id,
      stripeCustomerId: customerId,
      stripePriceId: priceId,
      isActive: subscription.status === 'active',
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });

  // Sync denormalized User.subscriptionTier (R5: userId is always DB User.id, no OR needed)
  await prisma.user.update({
    where: { id: userId },
    data: { subscriptionTier: planType },
  });

  return { planType };
}
```

### Subtasks
- [x] P.1: Create `lib/stripe/sync-subscription.ts` with `syncSubscriptionFromStripeData` (R5: use `where: { id: userId }` only, no OR clause)
- [x] P.2: Extract `syncUserSubscriptionTier` from webhook route.ts:18-27 to same file as exported function (R1)
- [x] P.3: Migrate 4 webhook call sites (lines 180, 223, 262, 294) to import from shared module (R1)
- [x] P.4: Add Stripe mock factories to `__tests__/fixtures/subscription-fixtures.ts` (Issue 12)
- [x] P.5: Add `__tests__/lib/stripe/sync-subscription.test.ts` — unit tests for shared helper (R9)

### Stripe Mock Factories (Issue 12)

Add to `__tests__/fixtures/subscription-fixtures.ts`:

```typescript
// Stripe API response mock factories
export function makeStripeCustomer(overrides?: Partial<{ id: string; email: string }>): any {
  return {
    id: overrides?.id ?? 'cus_test_mock',
    email: overrides?.email ?? 'test@example.com',
    object: 'customer',
    ...overrides,
  };
}

export function makeStripeSubscription(overrides?: Partial<{
  id: string; status: string; customer: string; priceId: string;
}>): any {
  return {
    id: overrides?.id ?? 'sub_test_mock',
    status: overrides?.status ?? 'active',
    customer: overrides?.customer ?? 'cus_test_mock',
    current_period_start: Math.floor(Date.now() / 1000),
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
    cancel_at_period_end: false,
    items: {
      data: [{
        price: { id: overrides?.priceId ?? 'price_pro_monthly_test' },
      }],
    },
    ...overrides,
  };
}

export function makeCheckoutSession(overrides?: Partial<{
  id: string; metadata: Record<string, string>; customer: string;
  customer_details: { email: string }; customer_email: string;
  subscription: string; mode: string;
}>): any {
  return {
    id: overrides?.id ?? 'cs_test_mock',
    mode: overrides?.mode ?? 'subscription',
    metadata: overrides?.metadata ?? { planType: 'PRO', source: 'homepage' },
    customer: overrides?.customer ?? 'cus_test_mock',
    customer_details: overrides?.customer_details ?? { email: 'test@example.com' },
    customer_email: overrides?.customer_email ?? 'test@example.com',
    subscription: overrides?.subscription ?? 'sub_test_mock',
    ...overrides,
  };
}
```

---

## Phase 0: Cleanup Existing Duplicate Subscriptions

**New File**: `scripts/cleanup-duplicate-subscriptions.ts`

A one-time script (run manually via `npx tsx`) that:
1. Queries all users from DB who have email addresses
2. For each user (with 200ms delay between iterations — Issue 14), searches Stripe by email for ALL customers
3. Collects all active subscriptions across all Stripe customers for that email
4. If >1 active subscription found:
   - Keeps the **most recent** subscription (latest `created` timestamp)
   - Cancels the others immediately via `stripe.subscriptions.cancel()`
   - **Consolidates Stripe customers** (Q1): migrates kept subscription to the primary customer if needed, deletes extra customers
   - Updates `UserSubscription` in DB to point to the kept subscription (use `syncSubscriptionFromStripeData`)
5. Outputs a JSON audit log file `cleanup-audit-YYYY-MM-DD.json` (Issue 4) with every action taken
6. Outputs a summary report table to stdout

Supports `--dry-run` flag to preview actions without making changes.

### Implementation Details

```typescript
// scripts/cleanup-duplicate-subscriptions.ts
// 1. Import stripe from '@/lib/stripe', getPrismaClient from '@/lib/db/prisma',
//    syncSubscriptionFromStripeData from '@/lib/stripe/sync-subscription'
// 2. Parse --dry-run from process.argv
// 3. Get all users with emails from DB
// 4. For each user (with 200ms delay between iterations):
//    a. stripe.customers.list({ email }).autoPagingToArray({ limit: 100 }) (R12: handle pagination)
//    b. For each customer: stripe.subscriptions.list({ customer, status: 'active' })
//    c. If total active subs > 1:
//       - Sort by created desc, keep first
//       - Cancel rest via stripe.subscriptions.cancel()
//       - If kept sub is on a different customer than the primary, migrate it
//       - R4: Archive customer metadata before deletion:
//         Promise.all([stripe.invoices.list({ customer }), stripe.subscriptions.list({ customer })]) (R16)
//         Record all data in audit log
//       - Delete extra Stripe customers via stripe.customers.del()
//       - Sync DB via syncSubscriptionFromStripeData()
//    d. Record every action in audit log array
// 5. Write audit log to cleanup-audit-YYYY-MM-DD.json
// 6. Print summary table to stdout
```

### Run Commands
```bash
npx tsx scripts/cleanup-duplicate-subscriptions.ts --dry-run  # Preview
npx tsx scripts/cleanup-duplicate-subscriptions.ts             # Execute
```

### Subtasks
- [x] 0.1: Create script file with Stripe + Prisma imports
- [x] 0.2: Implement user iteration + Stripe customer search by email with `autoPagingToArray` (R12) (with 200ms delay)
- [x] 0.3: Implement duplicate detection + cancellation logic
- [x] 0.4: Archive customer metadata (invoices, subscriptions) before deletion using `Promise.all` (R4, R16)
- [x] 0.5: Implement customer consolidation — migrate subs, delete extra customers (Q1)
- [x] 0.6: Implement DB sync via `syncSubscriptionFromStripeData()` (Issue 3)
- [x] 0.7: Add --dry-run support + JSON audit log output (Issue 4) + summary report
- [x] 0.8: Test with --dry-run against production data — 2 users with duplicates found, 0 errors (2026-03-06)

### Test File: `__tests__/scripts/cleanup-duplicate-subscriptions.test.ts` (Issue 10)
- [x] 0.9: Test: detects and cancels duplicate subscriptions (keeps newest)
- [x] 0.10: Test: consolidates Stripe customers (deletes extras)
- [x] 0.11: Test: --dry-run mode makes no changes
- [x] 0.12: Test: outputs JSON audit log with correct structure (includes archived customer data)
- [x] 0.13: Test: handles Stripe rate-limit errors gracefully
- [x] 0.14: Test: handles `has_more` pagination in customer list (R12)

---

## Phase 1: Fix `/api/checkout/direct` — Duplicate Prevention

**File**: `app/api/checkout/direct/route.ts`

Before creating checkout session (lines 52-76), add:
1. `stripe.customers.list({ email, limit: 3 })` — find existing Stripe customers (Issue 13: limit 3, not 10)
2. For each customer found, check `stripe.subscriptions.list({ customer, status: 'active' })` with early break on first active sub (Issue 13)
3. If any active subscription found -> return 409 with "sign in to manage" message + sign-in link (Q2)
4. If customer exists (no active sub) -> use `customer: customerId` instead of `customer_email` to reuse existing Stripe customer
5. Look up user in DB by email -> include `userId` in metadata if found
6. Set `client_reference_id: email` on checkout session (Issue 1: race condition prevention)
7. Before creating, check `stripe.checkout.sessions.list({ client_reference_id: email, status: 'open' })` — return existing session URL if found (Issue 1)
8. Add `&subscription_success=true` to success URL so dashboard fallback works
9. Add `PaymentLogger.checkoutFailed()` in error paths (Issue 5)

### Implementation Details

```typescript
// In the PRO/MAX block (line 52+), before creating session:

// R13: Parallelize independent checks with Promise.all
// R6: Wrap DB call in try-catch (fail-open — if DB is down, proceed without duplicate check)
const [openSessions, existingCustomers, dbUser] = await Promise.all([
  // 1. Check for existing open checkout session (Issue 1: race condition)
  stripe.checkout.sessions.list({
    client_reference_id: email,
    status: 'open',
    limit: 1,
  }),
  // 2. Look up existing Stripe customers by email (Issue 13: limit 3)
  stripe.customers.list({ email, limit: 3 }),
  // 3. Look up user in DB by email for metadata (R6: fail-open)
  getPrismaClient().user.findFirst({
    where: { email },
    select: { id: true, authProviderId: true },
  }).catch((dbError) => {
    console.error('[checkout/direct] DB lookup failed, proceeding without:', dbError);
    return null; // R6: fail-open — proceed without user lookup
  }),
]);

// Return existing open session if found
if (openSessions.data.length > 0 && openSessions.data[0].url) {
  return NextResponse.json({
    sessionId: openSessions.data[0].id,
    sessionUrl: openSessions.data[0].url,
  });
}

// 4. Check for active subscriptions across all customers (early break)
let existingCustomerId: string | null = null;
for (const customer of existingCustomers.data) {
  const activeSubs = await stripe.subscriptions.list({
    customer: customer.id,
    status: 'active',
    limit: 1,
  });
  if (activeSubs.data.length > 0) {
    // R2: Use correct PaymentLogger.checkoutFailed signature
    await PaymentLogger.checkoutFailed({
      email,
      error: 'active_subscription_exists',
      ipAddress,
    });
    return NextResponse.json(
      {
        error: 'An active subscription already exists for this email. Please sign in to manage your subscription.',
        signInUrl: '/sign-in',  // Q2: Include sign-in link
      },
      { status: 409 }
    );
  }
  // Reuse most recent customer if no active sub
  if (!existingCustomerId) {
    existingCustomerId = customer.id;
  }
}

// 5. Build metadata with userId if known
const metadata: Record<string, string> = { planType, source: 'homepage' };
if (dbUser?.authProviderId) {
  metadata.userId = dbUser.authProviderId;
} else if (dbUser?.id) {
  metadata.userId = dbUser.id;
}

// 6. Create session with customer ID (if exists) or customer_email
const sessionParams: Stripe.Checkout.SessionCreateParams = {
  payment_method_types: ['card'],
  line_items: [{ price: priceId, quantity: 1 }],
  mode: 'subscription',
  success_url: `${origin}/onboarding?session_id={CHECKOUT_SESSION_ID}&subscription_success=true`,
  cancel_url: `${origin}/?cancelled=true`,
  metadata,
  client_reference_id: email,  // Issue 1: idempotency key
};

if (existingCustomerId) {
  sessionParams.customer = existingCustomerId;
} else {
  sessionParams.customer_email = email;
}

const session = await stripe.checkout.sessions.create(sessionParams);
```

### Import Addition
```typescript
import { getPrismaClient } from '@/lib/db/prisma';
```

### Error Handling (Issue 5)
Add `PaymentLogger.checkoutFailed()` in the catch block:
```typescript
} catch (error) {
  // R2: Use correct PaymentLogger.checkoutFailed signature (email, error, amount?, ipAddress?)
  await PaymentLogger.checkoutFailed({
    email: body?.email,
    error: error instanceof Error ? error.message : 'Unknown error',
    ipAddress,
  }).catch(() => {}); // Don't let logger failure mask the real error

  console.error('Checkout API error:', error);
  // ... existing error response logic
}
```

### Subtasks
- [x] 1.1: Add `getPrismaClient` import
- [x] 1.2: Parallelize open session check + customer lookup + DB user lookup with `Promise.all` (R13)
- [x] 1.3: Add active subscription check -> 409 response with sign-in link (Q2)
- [x] 1.4: Reuse existing customer ID instead of `customer_email`
- [x] 1.5: Add DB user lookup -> userId in metadata (R6: wrap in try-catch, fail-open)
- [x] 1.6: Set `client_reference_id: email` on checkout session (Issue 1)
- [x] 1.7: Add `subscription_success=true` to success URL
- [x] 1.8: Add `PaymentLogger.checkoutFailed()` with correct signature in error paths (R2: `{ email, error, ipAddress }`)

### Test File: `__tests__/api/checkout/direct-duplicate-prevention.test.ts`
- [x] 1.9: Test: rejects checkout when email has active Stripe subscription (409 with sign-in link)
- [x] 1.10: Test: reuses existing Stripe customer when no active sub
- [x] 1.11: Test: includes userId in metadata when user exists in DB
- [x] 1.12: Test: works normally for brand-new emails (existing behavior preserved)
- [x] 1.13: Test: success URL includes `subscription_success=true`
- [x] 1.14: Test: returns existing open session instead of creating duplicate (Issue 1)
- [x] 1.15: Test: sets `client_reference_id` on created session (Issue 1)
- [x] 1.16: Test: handles Stripe API rate-limit error gracefully (Issue 11)
- [x] 1.17: Test: handles stripe.customers.list returning empty array
- [x] 1.18: Test: PaymentLogger.checkoutFailed called on 409 and on error (R2)
- [x] 1.19: Test: checkout proceeds when DB is unavailable (R6 fail-open) (R10)

---

## Phase 2: Fix Webhook — Handle Sessions Without userId

**File**: `app/api/webhook/stripe/route.ts`

### Change 2A: Fix `handleCheckoutCompleted` (lines 99-186)

Replace lines 107-113:

#### Current (broken)
```typescript
const metadataUserId = session.metadata?.userId;
const planType = session.metadata?.planType as 'FREE' | 'PRO' | 'MAX' | undefined;

if (!metadataUserId || !planType) {
  console.error('Missing metadata in checkout session');
  return;
}
```

#### New (with email fallback)
```typescript
let metadataUserId = session.metadata?.userId;
const planType = session.metadata?.planType as 'FREE' | 'PRO' | 'MAX' | undefined;

if (!planType) {
  console.error('[webhook] Missing planType in checkout session metadata:', session.id);
  return;
}

// If userId not in metadata, try to resolve by email
// R8: Store dbUser from fallback to reuse later (avoid double lookup)
let resolvedDbUser: { id: string; authProviderId: string | null } | null = null;
if (!metadataUserId) {
  const customerEmail = session.customer_details?.email || session.customer_email;
  if (customerEmail) {
    resolvedDbUser = await prisma.user.findFirst({
      where: { email: customerEmail },
      select: { id: true, authProviderId: true },
    });
    if (resolvedDbUser) {
      metadataUserId = resolvedDbUser.authProviderId || resolvedDbUser.id;
      console.log(`[webhook] Resolved user by email ${customerEmail} -> ${metadataUserId}`);
    } else {
      console.warn(`[webhook] No DB user found for email ${customerEmail}, session ${session.id}. Will be reconciled at onboarding.`);
      return;
    }
  } else {
    console.error('[webhook] No userId or email available in session:', session.id);
    return;
  }
}
// R8: Skip second findFirst if we already resolved via email fallback
// Use resolvedDbUser directly instead of re-querying by metadataUserId
```

### Change 2B: Fix `handleSubscriptionCreated` (lines 188-229) (Issue 2)

Add email fallback when `stripeCustomerId` lookup fails:

```typescript
async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  console.log('Processing subscription creation:', subscription.id);

  const customerId = subscription.customer as string;
  const priceId = subscription.items.data[0]?.price.id;

  // Find user by Stripe customer ID
  let userSubscription = await prisma.userSubscription.findUnique({
    where: { stripeCustomerId: customerId },
  });

  // Issue 2: If not found by customer ID, try email fallback
  if (!userSubscription) {
    try {
      // Retrieve customer from Stripe to get email
      const customer = await stripe.customers.retrieve(customerId);
      if (customer && !customer.deleted && customer.email) {
        const dbUser = await prisma.user.findFirst({
          where: { email: customer.email },
          select: { id: true },
        });
        if (dbUser) {
          // Use syncSubscriptionFromStripeData for consistency (Issue 3)
          const { planType } = await syncSubscriptionFromStripeData(
            dbUser.id, subscription, customerId
          );
          console.log(`[webhook] Subscription created via email fallback for ${customer.email}: ${planType}`);
          return;
        }
      }
    } catch (error) {
      console.error('[webhook] Email fallback failed for customer:', customerId, error);
    }

    console.error('User not found for customer:', customerId);
    return;
  }

  // ... existing logic using syncSubscriptionFromStripeData (Issue 3)
}
```

### Subtasks
- [x] 2.1: Replace early return with planType-only check
- [x] 2.2: Add email-based user lookup fallback when userId missing (R8: store resolvedDbUser, skip second lookup)
- [x] 2.3: Add appropriate logging for each code path
- [x] 2.4: Add email fallback to `handleSubscriptionCreated` (Issue 2)
- [x] 2.5: Refactor `handleCheckoutCompleted` and `handleSubscriptionCreated` to use `syncSubscriptionFromStripeData` (Issue 3)
- [x] 2.6: Verify remaining webhook handlers (`handleSubscriptionUpdated`, `handleSubscriptionDeleted`, etc.) import `syncUserSubscriptionTier` from shared module (R1)

### Test File: `__tests__/api/webhook/stripe-checkout-completed.test.ts`
- [x] 2.7: Test: existing behavior preserved (userId in metadata works as before)
- [x] 2.8: Test: resolves user by email when userId missing from metadata
- [x] 2.9: Test: logs warning and returns when no user found by email
- [x] 2.10: Test: returns early when planType missing (regardless of userId)
- [x] 2.11: Test: handleSubscriptionCreated resolves user by email when customer ID not found (Issue 9)
- [x] 2.12: Test: handleSubscriptionCreated works normally when customer ID found (Issue 9)
- [x] 2.13: Test: handleSubscriptionCreated logs error when email fallback also fails (Issue 9)
- [x] 2.14: Test: handles DB lookup failure gracefully (Issue 11)
- [x] 2.15: Test: existing webhook handlers still work after tier sync extraction (R1, R10)

---

## Phase 3: Post-Onboarding Subscription Reconciliation

### New File: `lib/stripe/reconcile.ts`

```typescript
/**
 * Reconcile Stripe subscription for a user during onboarding.
 * Handles the case where a user paid via homepage checkout before creating an account.
 *
 * @param userId - DB User.id (NOT Clerk authProviderId) (Issue 7)
 * @param email - User's email address for Stripe customer lookup
 */
```

`reconcileStripeSubscription(userId: string, email: string)`:
1. Check if user already has active `UserSubscription` -> return early if so
2. `stripe.customers.list({ email })` -> find Stripe customers
3. For each customer, check `stripe.subscriptions.list({ customer, status: 'active' })`
4. If active subscription found:
   - Use `syncSubscriptionFromStripeData()` (Issue 3) for DB writes
5. Log outcome

### Implementation Details

```typescript
// lib/stripe/reconcile.ts
import { stripe, getPlanTypeFromPriceId } from '@/lib/stripe';
import { getPrismaClient } from '@/lib/db/prisma';
import { syncSubscriptionFromStripeData } from '@/lib/stripe/sync-subscription';

/**
 * Reconcile Stripe subscription for a user during onboarding.
 * @param userId - DB User.id (NOT Clerk authProviderId)
 * @param email - User's email for Stripe customer lookup
 */
export async function reconcileStripeSubscription(
  userId: string,
  email: string
): Promise<{ reconciled: boolean; planType?: string }> {
  if (!stripe) return { reconciled: false };

  const prisma = getPrismaClient();

  // 1. Check if user already has active subscription in DB
  const existing = await prisma.userSubscription.findUnique({
    where: { userId },
  });
  if (existing && existing.isActive && existing.planType !== 'FREE') {
    return { reconciled: false }; // Already has paid sub
  }

  // 2. Search Stripe by email
  const customers = await stripe.customers.list({ email, limit: 3 });

  for (const customer of customers.data) {
    const activeSubs = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'active',
      limit: 1,
    });

    if (activeSubs.data.length > 0) {
      const sub = activeSubs.data[0];
      const priceId = sub.items.data[0]?.price.id;
      const derivedPlanType = getPlanTypeFromPriceId(priceId);

      if (derivedPlanType === 'FREE') continue; // Skip free-tier subs

      // 3. Use shared helper for DB writes (Issue 3)
      const { planType } = await syncSubscriptionFromStripeData(userId, sub, customer.id);

      console.log(`[reconcile] Reconciled subscription for user ${userId}: ${planType} (sub ${sub.id})`);
      return { reconciled: true, planType };
    }
  }

  return { reconciled: false };
}
```

### Modified File: `app/(auth)/onboarding/actions.ts`

#### In `completeOnboardingBatched` — after Clerk metadata sync (line 395), before welcome email (line 398):

**Fire-and-forget** (Issue 15 — don't await, use `.catch()` pattern):

```typescript
// R7: Pre-transaction check for user existence (don't restructure $transaction)
const existingUser = await prisma.user.findFirst({
  where: { OR: [{ authProviderId: userId }, { email: primaryEmail }] },
  select: { id: true },
});
const isNewUser = !existingUser;

// ... existing $transaction block ...

// Reconcile Stripe subscription (handles pre-auth checkout -> onboarding flow)
// Fire-and-forget (Issue 15): don't block user, dashboard will update after async completion
// Only reconcile pre-existing users (Issue 6): skip if user was just created
if (!isNewUser) {
  import('@/lib/stripe/reconcile')
    .then(({ reconcileStripeSubscription }) =>
      reconcileStripeSubscription(result.id, primaryEmail)
    )
    .then((reconcileResult) => {
      if (reconcileResult.reconciled) {
        console.log(`[Onboarding] Reconciled Stripe subscription: ${reconcileResult.planType}`);
      }
    })
    .catch((reconcileError) => {
      console.error('[Onboarding] Stripe reconciliation failed:', reconcileError);
    });
}
```

#### In `completeOnboarding` — after Clerk metadata sync (line 241), before welcome email (line 244):

Same fire-and-forget pattern, with `isNewUser` check (Issue 6).

### Onboarding Page: Forward `subscription_success` Param (Issue 8, R3)

**File**: `app/(auth)/onboarding/onboarding-client.tsx`

The onboarding client component currently ignores ALL URL params and does a hard redirect via `window.location.href = '/dashboard'` (line 320). Changes needed:

1. Add `useSearchParams()` hook (requires `<Suspense>` boundary in parent — check if `page.tsx` already wraps in Suspense)
2. Read `subscription_success` param at component mount
3. Append `?subscription_success=true` to the dashboard redirect URL when present

```typescript
// In onboarding-client.tsx
import { useSearchParams } from 'next/navigation';

// Inside component:
const searchParams = useSearchParams();
const subscriptionSuccess = searchParams.get('subscription_success');

// In handleCompleteOnboarding redirect (line ~320):
const dashboardUrl = subscriptionSuccess
  ? '/dashboard?subscription_success=true'
  : '/dashboard';
window.location.href = dashboardUrl;
```

### Dashboard: Subscription Sync Indicator (R14)

**File**: `app/dashboard/page.tsx` or relevant dashboard component

When `subscription_success=true` is in the URL but `User.subscriptionTier` is still `FREE`, show a "Verifying subscription..." indicator instead of the FREE tier. Auto-refresh after 2-3 seconds to pick up the reconciled tier.

```typescript
// Detect mismatch: URL says success but tier is still FREE
const isSubscriptionSyncing = searchParams.get('subscription_success') === 'true'
  && user.subscriptionTier === 'FREE';

// Show sync indicator instead of tier badge
{isSubscriptionSyncing ? (
  <div>Verifying subscription...</div>
) : (
  <TierBadge tier={user.subscriptionTier} />
)}

// Auto-refresh after 2-3s
useEffect(() => {
  if (isSubscriptionSyncing) {
    const timer = setTimeout(() => window.location.reload(), 3000);
    return () => clearTimeout(timer);
  }
}, [isSubscriptionSyncing]);
```

### Reminder Email for Unpaid Onboarding (Q3)

If a user pays via direct checkout but never completes onboarding, send a reminder email. Implementation: add a check in the webhook's email fallback path — when `handleCheckoutCompleted` finds no DB user for an email, queue a reminder email prompting them to complete signup.

### Subtasks
- [x] 3.1: Create `lib/stripe/reconcile.ts` with `reconcileStripeSubscription()` using `syncSubscriptionFromStripeData` (Issue 3)
- [x] 3.2: Add pre-transaction `findFirst` for `isNewUser` in `completeOnboardingBatched` (R7)
- [x] 3.3: Add fire-and-forget reconciliation call to `completeOnboardingBatched` with `isNewUser` guard (Issues 6, 15)
- [x] 3.4: Add pre-transaction `findFirst` for `isNewUser` in `completeOnboarding` (R7)
- [x] 3.5: Add fire-and-forget reconciliation call to `completeOnboarding` with `isNewUser` guard (Issues 6, 15)
- [x] 3.6: Add `useSearchParams` to onboarding-client.tsx + forward `subscription_success` to dashboard redirect (R3)
- [x] 3.7: Add dashboard subscription sync indicator when `subscription_success=true` but tier is FREE (R14)
- [x] 3.8: Add reminder email in webhook when no DB user found for email (Q3) — `sendCheckoutReminderEmail` added to `lib/email/trial-emails.ts`, integrated as fire-and-forget in webhook `handleCheckoutCompleted`

### Test File: `__tests__/api/checkout/stripe-reconciliation.test.ts`
- [x] 3.9: Test: creates UserSubscription when Stripe has active sub but DB does not
- [x] 3.10: Test: skips when user already has active UserSubscription
- [x] 3.11: Test: skips when no Stripe customer found for email
- [x] 3.12: Test: syncs User.subscriptionTier after reconciliation (via shared helper)
- [x] 3.13: Test: handles Stripe not configured (returns gracefully)
- [x] 3.14: Test: skips reconciliation for freshly-created users (via isNewUser guard in onboarding)
- [x] 3.15: Test: handles DB failure in findUnique gracefully (Issue 11)
- [x] 3.16: Test: onboarding forwards subscription_success to dashboard redirect (R3, R10)

---

## Key Files Summary

### Files to Modify

| File | Change |
|------|--------|
| `app/api/checkout/direct/route.ts` | Add duplicate prevention + `client_reference_id` + userId metadata + success URL fix + PaymentLogger failure logging + fail-open DB (R6) + Promise.all (R13) |
| `app/api/webhook/stripe/route.ts` | Email-based user lookup fallback (R8: reuse dbUser) + `handleSubscriptionCreated` email fallback; extract `syncUserSubscriptionTier` to shared module (R1); refactor to use `syncSubscriptionFromStripeData` |
| `app/(auth)/onboarding/actions.ts` | Pre-transaction `isNewUser` check (R7) + fire-and-forget reconciliation |
| `app/(auth)/onboarding/onboarding-client.tsx` | Add `useSearchParams` + forward `subscription_success` to dashboard (R3) |
| Dashboard component (TBD) | Add "Verifying subscription..." sync indicator (R14) |
| `__tests__/fixtures/subscription-fixtures.ts` | Add Stripe mock factories (`makeStripeCustomer`, `makeStripeSubscription`, `makeCheckoutSession`) |

### Files to Create

| File | Purpose |
|------|---------|
| `lib/stripe/sync-subscription.ts` | Shared `syncSubscriptionFromStripeData` + extracted `syncUserSubscriptionTier` (R1, R5) |
| `lib/stripe/reconcile.ts` | Reconciliation helper for onboarding |
| `scripts/cleanup-duplicate-subscriptions.ts` | One-time cleanup + customer consolidation + archived audit log (R4, R12, R16) |
| `__tests__/lib/stripe/sync-subscription.test.ts` | Shared helper unit tests (R9) |
| `__tests__/api/checkout/direct-duplicate-prevention.test.ts` | Phase 1 tests (includes R6 fail-open test) |
| `__tests__/api/webhook/stripe-checkout-completed.test.ts` | Phase 2 tests (includes handleSubscriptionCreated + R1 migration) |
| `__tests__/api/checkout/stripe-reconciliation.test.ts` | Phase 3 tests (includes R3 param forwarding) |
| `__tests__/scripts/cleanup-duplicate-subscriptions.test.ts` | Phase 0 cleanup script tests (includes R12 pagination) |
| `__tests__/integration/direct-checkout-flow.test.ts` | Full flow integration test: checkout → webhook → reconciliation → tier sync (R11) |

### Existing Code Reused

| What | Where |
|------|-------|
| `getPrismaClient()` | `lib/db/prisma.ts` |
| `getPlanTypeFromPriceId()` | `lib/stripe/index.ts:347` |
| `listActiveSubscriptions()` | `lib/stripe/index.ts:328` (customer ID known) |
| `stripe.customers.list()` | Direct Stripe API (email lookup) |
| `PaymentLogger` | `lib/audit/payment-logger.ts` |
| Subscription fixtures | `__tests__/fixtures/subscription-fixtures.ts` |

## What We're NOT Doing

- Not creating Clerk users before checkout (orphaned users on abandoned checkouts)
- Not adding new DB tables (existing schema suffices)
- Not modifying the authenticated checkout flow (`/api/user/subscription`) — already has proper duplicate prevention

## Integration Test (R11)

### Test File: `__tests__/integration/direct-checkout-flow.test.ts`

Single integration test exercising the full user flow with mocked Stripe API:

1. Create a Stripe checkout session via `/api/checkout/direct` (mock Stripe responses)
2. Simulate `checkout.session.completed` webhook event (with email, no userId in metadata)
3. Verify webhook resolves user by email fallback and calls `syncSubscriptionFromStripeData`
4. Simulate onboarding completion with `reconcileStripeSubscription`
5. Verify `User.subscriptionTier` is updated to the correct tier

- [x] R11.1: Test: full direct-checkout → webhook → reconciliation → correct User.subscriptionTier

---

## Verification

```bash
# Phase 0: Cleanup existing duplicates
npx tsx scripts/cleanup-duplicate-subscriptions.ts --dry-run
npx tsx scripts/cleanup-duplicate-subscriptions.ts

# Phase 0 tests
npm run test -- --testPathPattern="cleanup-duplicate"

# Pre-Phase: Shared helper tests (R9)
npm run test -- --testPathPattern="sync-subscription"

# Phase 1-3 tests
npm run test -- --testPathPattern="direct-duplicate|stripe-checkout-completed|stripe-reconciliation"

# Integration test (R11)
npm run test -- --testPathPattern="direct-checkout-flow"

# Existing tests still pass
npm run test -- --testPathPattern="direct|webhook|stripe|checkout|subscription"

# Full test suite + build
npm run test
npm run lint
npm run build
```

Manual verification:
- Phase 0: Verify in Stripe dashboard that duplicate subscriptions are cancelled and extra customers are deleted
- Phase 1-3: Complete homepage checkout flow -> onboarding -> verify dashboard shows correct tier
- Phase 1: Verify 409 response includes sign-in link
- Phase 1: Verify duplicate checkout attempts return existing session (not create new one)
