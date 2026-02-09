---
date: 2026-02-07T07:46:16Z
researcher: Claude Code
git_commit: 9c2275effa89a3769d31660d5d62e78a23c7f081
branch: feature/pipeline-resilience-zero-intervention
repository: tldrsec-ai
topic: "Free Plan to 7-Day Trial Migration - Complete Codebase Analysis"
tags: [research, codebase, subscription, free-plan, trial, pricing, billing, stripe]
status: complete
last_updated: 2026-02-07
last_updated_by: Claude Code
---

# Research: Free Plan to 7-Day Trial Migration - Complete Codebase Analysis

**Date**: 2026-02-07T07:46:16Z
**Researcher**: Claude Code
**Git Commit**: 9c2275effa89a3769d31660d5d62e78a23c7f081
**Branch**: feature/pipeline-resilience-zero-intervention
**Repository**: tldrsec-ai

## Research Question

I want to remove the free plan entirely and switch to a trial mode for 7 days. The banner on the dashboard that we've just implemented can be changed to "You've only got 7 days left in your free trial," and the "Add payment method" button call action can stay there because that makes sense. Look through the entire codebase to find any references to the free plan, the free account. Look at the Supabase MCP to find out the schema of the users, models, and any other relevant models to the free plan. That includes pricing sections, features sections, and all those sorts of things and on the billing page too on the billing/subscribe page.

## Summary

The codebase currently implements a FREE tier as a permanent plan (not a trial). References to "free plan" exist across 78+ files including API routes, UI components, database schema, configuration, and tests. The FREE plan is defined through Prisma enums (`SubscriptionTier.FREE` and `PlanType.FREE`) with a ticker limit of 3 companies, weekly email digest, and 10-K/10-Q filing types only. **No trial functionality exists** - all "trial" references are marketing copy only with no backend implementation.

## Detailed Findings

### 1. Database Schema - Core FREE Plan Definition

**Location**: `prisma/schema.prisma`

#### User Model (lines 19-53)
```prisma
model User {
  id                    String                 @id @default(uuid())
  email                 String                 @unique
  subscriptionTier      SubscriptionTier       @default(FREE)  // ← Default FREE tier
  // ... other fields
}
```

#### UserSubscription Model (lines 229-246)
```prisma
model UserSubscription {
  id                   String   @id @default(uuid())
  userId               String   @unique
  planType             PlanType @default(FREE)  // ← Default FREE plan type
  isActive             Boolean  @default(true)
  currentPeriodStart   DateTime @default(now())
  currentPeriodEnd     DateTime
  cancelAtPeriodEnd    Boolean  @default(false)
  stripeCustomerId     String?  @unique
  stripeSubscriptionId String?  @unique
  // ... other fields
}
```

#### Enum Definitions
```prisma
enum SubscriptionTier {
  FREE
  PRO
  MAX
}

enum PlanType {
  FREE
  PRO
  MAX
}
```

**Key Observations**:
- No trial-specific fields exist (`trialEndsAt`, `trialStartedAt`, `isTrialing`)
- Uses `currentPeriodStart` and `currentPeriodEnd` for billing periods
- FREE is the database default for both `User.subscriptionTier` and `UserSubscription.planType`

### 2. FREE Plan Configuration

**Location**: `lib/stripe/plans.ts` (lines 12-27)

```typescript
export const SUBSCRIPTION_PLANS = {
  FREE: {
    name: 'Free',
    monthlyPriceId: null,
    annualPriceId: null,
    monthlyPrice: 0,
    annualPrice: 0,
    tickerLimit: 3,
    filingTypes: ['10-K', '10-Q'] as const,
    emailFrequency: 'weekly' as const,
    features: [
      '3 companies to track',
      'Weekly digest emails',
      '10-K and 10-Q summaries only',
      'Basic filing alerts',
    ],
  },
  // PRO and MAX definitions follow...
}
```

**FREE Plan Limits**:
| Attribute | Value |
|-----------|-------|
| Ticker Limit | 3 companies |
| Filing Types | 10-K, 10-Q only |
| Email Frequency | Weekly digest |
| Price | $0 (no Stripe price ID) |

### 3. Dashboard Banner Component

**Location**: `components/dashboard/plan-status-banner.tsx`

```typescript
export function PlanStatusBanner({ planType }: PlanStatusBannerProps) {
  // Only show for free plan users
  if (planType !== 'FREE') return null;

  return (
    <div className="w-full bg-emerald-100 dark:bg-emerald-950/30 border-b border-emerald-200 dark:border-emerald-900">
      <div className="container max-w-7xl mx-auto px-6 md:px-8 py-3">
        <div className="flex items-center justify-center gap-4">
          <span className="text-sm font-medium text-emerald-900 dark:text-emerald-100">
            You&apos;re on the Free Plan
          </span>
          <Button
            size="sm"
            asChild
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm"
          >
            <Link href="/dashboard/billing" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Add Payment Method
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
```

**Current Behavior**:
- Shows "You're on the Free Plan" message
- "Add Payment Method" button links to `/dashboard/billing`
- Only displays for users with `planType === 'FREE'`

### 4. API Routes with FREE Plan Logic

#### Subscription Management API (`app/api/user/subscription/route.ts`)

**GET /api/user/subscription** (lines 29-118):
- Returns FREE tier data when no subscription exists (lines 65-79)
- Mock FREE subscription when Stripe disabled (lines 39-56)
- Uses `SUBSCRIPTION_PLANS.FREE.tickerLimit` for limits

**POST /api/user/subscription/create-checkout** (lines 126-346):
- Blocks checkout for FREE tier (lines 168-173):
```typescript
if (planType === 'FREE') {
  return NextResponse.json(
    { error: 'Free tier does not require checkout' },
    { status: 400 }
  );
}
```
- Auto-creates users with `subscriptionTier: 'FREE'` (line 234)

**PUT /api/user/subscription** (lines 352-531):
- Downgrades to FREE by canceling Stripe at period end (lines 416-440)
- Blocks upgrades from FREE via PUT, requires checkout (lines 444-455)

#### Ticker Management API (`app/api/user/tickers/route.ts`)

**POST /api/user/tickers** (lines 60-238):
- Enforces ticker limits based on subscription tier (lines 103-114)
- FREE tier limited to 3 companies via `SUBSCRIPTION_PLANS.FREE.tickerLimit`
- Auto-creates users with `subscriptionTier: 'FREE'` (line 80)

#### Clerk Webhook (`app/api/webhook/clerk/route.ts:61-88`)
- Creates new users with explicit `subscriptionTier: 'FREE'` (line 78)
- Sets `onboardingCompleted: false` for auth-first flow

### 5. Billing Page UI

**Location**: `app/dashboard/billing/page.tsx`

**Current Subscription Display** (lines 322-378):
- Shows "Free" plan name
- Displays "$0/month" price
- Shows billing period with renewal date
- Provides cancellation toggle for paid plans

**Plan Comparison Grid** (lines 382-468):
```typescript
function getBillingPlans(): BillingPlan[] {
  return [
    {
      name: SUBSCRIPTION_PLANS.FREE.name,
      price: '$0/month',
      tickerLimit: SUBSCRIPTION_PLANS.FREE.tickerLimit,
      tickerDisplay: `${SUBSCRIPTION_PLANS.FREE.tickerLimit} companies`,
      features: SUBSCRIPTION_PLANS.FREE.features,
      recommended: false,
      planKey: 'FREE',
    },
    // PRO and MAX plans...
  ];
}
```

**FREE Plan Card Features**:
- Shows "3 companies" ticker limit
- Lists FREE features from `SUBSCRIPTION_PLANS.FREE.features`
- "Start Free" button (not "Current Plan" when already on FREE)
- No upgrade/downgrade CTA when on FREE

### 6. Pricing Sections (Landing Page)

#### Main Pricing Section (`components/landing/sections/pricing-section.tsx`)

**FREE Plan Card** (lines 52-57, 122-124):
```typescript
const ctaText =
  planKey === 'FREE'
    ? 'Start Free'
    : planKey === 'PRO'
      ? 'Start Pro Trial'
      : 'Start Max';

// ...

{planKey === 'FREE' && (
  <p className="text-sm text-slate-500 mt-1">Free forever</p>
)}
```

**Trial Marketing Copy** (lines 254-257):
```typescript
<p className="text-sm text-slate-500">
  All plans include 14-day free trial. No credit card required for
  Free plan.
</p>
```

**Key Observations**:
- PRO plan button says "Start Pro Trial" (marketing copy only)
- Footer claims "14-day free trial" but **no backend implementation exists**
- FREE plan described as "Free forever"

#### Alternative Pricing Section (`components/landing/pricing-section-3-tier.tsx:64`)
```typescript
{
  name: 'FREE',
  buttonText: 'Start FREE Trial',
  // ...
}
```

### 7. Onboarding Flow

**Location**: `app/(auth)/onboarding/onboarding-client.tsx`

**Default Plan Assignment**:
- Onboarding does NOT explicitly set subscription tier
- Relies on database default: `User.subscriptionTier @default(FREE)`
- Clerk webhook sets `subscriptionTier: 'FREE'` at user creation (line 78 of `app/api/webhook/clerk/route.ts`)
- Onboarding completion only updates `preferences` and `onboardingCompleted` flag

**Data Flow for New Users**:
1. User signs up via Clerk → `user.created` webhook fires
2. User record created with `subscriptionTier: 'FREE'` and `onboardingCompleted: false`
3. User completes onboarding → Updates preferences, sets `onboardingCompleted: true`
4. `subscriptionTier` remains `FREE` (not modified during onboarding)

### 8. Trial Implementation Status

**Current State**: Trial references are **marketing copy only** with **no backend implementation**.

#### Trial References Found (Marketing Only):
1. Pricing footer: "All plans include 14-day free trial"
2. PRO plan CTA: "Start Pro Trial"
3. FREE plan button: "Start FREE Trial" (in alternative pricing component)

#### What's Missing for Trial Implementation:
- ❌ Database schema fields (`trialEndsAt`, `trialStartedAt`, `isTrialing`)
- ❌ Stripe checkout session trial configuration
- ❌ Webhook handlers for trial events (`customer.subscription.trial_will_end`)
- ❌ UI components for trial countdown/status
- ❌ API endpoints to check trial state
- ❌ Trial expiration handling logic
- ❌ Trial-to-paid conversion flow

**Webhook Pattern** (`app/api/webhook/stripe/route.ts:181-219`):
- `handleSubscriptionCreated()` doesn't check `subscription.status === 'trialing'`
- Treats all active subscriptions uniformly
- No special trial period handling

### 9. Tier-Aware Cron Processing

**Location**: `lib/cron/tier-eligibility.ts`

**FREE Tier Processing**:
- FREE tier users processed in cron jobs
- Lower priority than PRO/MAX tiers
- Batch size and frequency configured per tier
- FREE users get weekly digest (not real-time alerts)

**Processing Configuration**:
```typescript
// From lib/cron/types.ts and tier-eligibility logic
FREE: {
  batchSize: smaller batches,
  priority: lower priority,
  frequency: less frequent checks
}
```

### 10. Complete File Inventory

#### API Routes (16 files)
- `app/api/user/subscription/route.ts` - Subscription management
- `app/api/user/tickers/route.ts` - Ticker tracking with tier limits
- `app/api/webhook/stripe/route.ts` - Stripe webhooks
- `app/api/webhook/clerk/route.ts` - Clerk user creation
- `app/api/checkout/direct/route.ts` - Direct checkout
- `app/api/cron/tier-aware/route.ts` - Tier-aware cron
- `app/api/billing/portal/route.ts` - Billing portal
- Plus 9 more cron/waitlist/integration endpoints

#### Core Configuration (11 files)
- `lib/stripe/plans.ts` - **PRIMARY: Plan definitions and limits**
- `lib/subscription/three-tier-limits.ts` - Tier limit constants
- `lib/subscription/tickerSubscriptionInfo.ts` - Subscription utilities
- `lib/cron/tier-eligibility.ts` - Tier processing logic
- Plus 7 more config/validation files

#### UI Components (18 files)
- `components/dashboard/plan-status-banner.tsx` - **Dashboard banner (needs update)**
- `components/dashboard/subscription-status.tsx` - Subscription status
- `components/landing/sections/pricing-section.tsx` - **PRIMARY: Landing pricing**
- `components/landing/pricing-section-3-tier.tsx` - Alternative pricing
- Plus 14 more landing/dashboard components

#### Dashboard Pages (3 files)
- `app/dashboard/billing/page.tsx` - **Billing management page**
- `app/dashboard/usage/page.tsx` - Usage statistics
- `app/dashboard/layout.tsx` - Dashboard layout

#### Test Files (15 files)
- `__tests__/api/user/subscriptions.test.ts`
- `__tests__/components/pricing-section-3-tier.test.tsx`
- `__tests__/app/dashboard/billing/page.test.tsx`
- Plus 12 more tier/subscription/checkout tests

#### Services (5 files)
- `services/filings/enhanced/subscriptionService.ts`
- `lib/cron/handlers/discovery-handler.ts`
- Plus 3 more enhanced services

## Code References

### Critical Files for FREE → Trial Migration

1. **Database Schema**: `prisma/schema.prisma:31,232,761-775`
   - Add trial fields: `trialStartedAt`, `trialEndsAt`, `isTrialing`
   - Remove FREE from enums or repurpose as trial state

2. **Plan Configuration**: `lib/stripe/plans.ts:12-27`
   - Remove FREE plan definition or convert to trial config
   - Update PRO/MAX to be selectable after trial

3. **Dashboard Banner**: `components/dashboard/plan-status-banner.tsx:13-34`
   - Change message to "You've only got 7 days left in your free trial"
   - Calculate days remaining from trial start date

4. **Subscription API**: `app/api/user/subscription/route.ts`
   - Lines 39-56: Remove Stripe-disabled FREE fallback
   - Lines 65-79: Remove no-subscription FREE fallback
   - Lines 168-173: Remove FREE checkout block (allow trial → paid conversion)
   - Lines 416-440: Update downgrade logic (cancel at period end → disable trial)

5. **Pricing Sections**: `components/landing/sections/pricing-section.tsx`
   - Lines 52-57: Update CTA text (remove "Start Free")
   - Lines 122-124: Remove "Free forever" copy
   - Lines 254-257: Update trial copy to match actual implementation

6. **Billing Page**: `app/dashboard/billing/page.tsx:42-72`
   - Remove FREE plan from `getBillingPlans()` array
   - Update plan comparison grid to show trial status

7. **User Creation Webhooks**:
   - `app/api/webhook/clerk/route.ts:78` - Set trial start date instead of FREE
   - `app/api/user/subscription/route.ts:234` - Auto-create trial instead of FREE

## Architecture Documentation

### Two-Tier Subscription System

1. **User.subscriptionTier** (Primary field)
   - Enum: FREE, PRO, MAX
   - Database default: FREE
   - Used for feature gating and tier limits

2. **UserSubscription** (Stripe integration layer)
   - Separate table for billing management
   - Created lazily (only when needed)
   - Contains Stripe IDs and billing periods

### FREE Plan Characteristics

| Attribute | Current Value | Notes |
|-----------|---------------|-------|
| Ticker Limit | 3 companies | Enforced in `app/api/user/tickers/route.ts` |
| Filing Types | 10-K, 10-Q only | Other types blocked |
| Email Frequency | Weekly | Digest, not real-time |
| Stripe Integration | None | No customer/subscription IDs |
| Checkout | Blocked | Returns 400 error |
| Upgrade Path | POST /api/user/subscription | Creates checkout session |
| Downgrade Path | Cancel Stripe at period end | Via PUT endpoint |

### Plan Ordering Hierarchy
```typescript
const planOrder = { FREE: 0, PRO: 1, MAX: 2 };
```
- FREE = tier 0 (lowest)
- PRO = tier 1 (middle)
- MAX = tier 2 (highest)

## Related Research

- `thoughts/shared/research/2026-01-06-stripe-integration-pricing-analysis.md` - Stripe integration
- `thoughts/shared/research/2025-12-30-landing-page-stripe-redesign.md` - Landing page pricing
- `docs/plans/2026-01-06-waitlist-payment-integration.md` - Payment integration plan

## Migration Strategy Considerations

### Database Changes Required

1. **Add Trial Fields to User Model**:
```prisma
model User {
  // ... existing fields
  trialStartedAt    DateTime?
  trialEndsAt       DateTime?
  isTrialing        Boolean   @default(false)
}
```

2. **Migrate Existing FREE Users**:
   - Option A: Convert to trial with `trialStartedAt = now()`, `trialEndsAt = now() + 7 days`
   - Option B: Grandfather existing FREE users (keep as-is)
   - Option C: Force migration with grace period notification

3. **Update Enums**:
   - Option A: Remove FREE entirely, only PRO/MAX exist
   - Option B: Keep FREE enum for legacy data, block new FREE assignments
   - Option C: Repurpose FREE as "TRIAL" state

### API Changes Required

1. **User Creation Flow**:
   - Set `isTrialing: true`, `trialStartedAt: now()`, `trialEndsAt: now() + 7 days`
   - Remove `subscriptionTier: 'FREE'` assignments

2. **Subscription Status Endpoint**:
   - Calculate `daysRemaining = (trialEndsAt - now()) / (1 day)`
   - Return `isTrialing` flag and trial expiration date
   - Block access when trial expired and no paid plan

3. **Trial Expiration Handling**:
   - New cron job to check expired trials
   - Disable access (set `isTrialing: false`, block dashboard)
   - Send expiration notification emails

4. **Trial → Paid Conversion**:
   - Allow checkout during trial period
   - Immediate upgrade (don't wait for trial end)
   - Cancel trial and activate paid subscription

### UI Changes Required

1. **Dashboard Banner**:
   - Show trial countdown: "7 days left", "3 days left", "1 day left"
   - Urgent styling as trial approaches end
   - "Add Payment Method" CTA remains

2. **Billing Page**:
   - Remove FREE plan card from comparison grid
   - Show trial status prominently
   - Display trial end date
   - Emphasize urgency for trial users

3. **Pricing Sections**:
   - Remove "Free forever" messaging
   - Update to "7-day free trial, then $X/month"
   - All CTAs become "Start 7-Day Trial"
   - Remove confusing trial references (currently inconsistent)

4. **Onboarding Flow**:
   - Show trial start confirmation
   - Display trial end date upfront
   - Set expectations about trial → paid conversion

### Stripe Configuration Changes

1. **Checkout Sessions**:
   - Configure trial period: `subscription_data: { trial_period_days: 7 }`
   - Require payment method upfront (capture at trial end)
   - Option: Free trial without payment method (manual conversion)

2. **Webhook Handling**:
   - Handle `customer.subscription.trial_will_end` event (3 days before)
   - Handle `customer.subscription.trial_end` event
   - Send notification emails at key trial milestones

3. **Subscription Updates**:
   - Allow trial → paid conversion via checkout
   - Prorate billing if converted mid-trial
   - Handle trial cancellation (delete subscription)

## Open Questions

1. **Existing FREE Users**: How to handle users currently on FREE plan?
   - Grandfather them in as permanent FREE?
   - Convert to 7-day trial starting now?
   - Give them extended trial (e.g., 30 days)?

2. **Trial Payment Requirement**: Require payment method upfront?
   - Option A: Require card at signup, charge after trial
   - Option B: No card required, manual upgrade after trial
   - Option C: Card required but don't charge (verify only)

3. **Trial Expiration Behavior**: What happens when trial expires?
   - Hard block (no dashboard access)?
   - Soft block (view-only mode)?
   - Grace period (3 extra days)?

4. **Trial Extensions**: Allow trial extensions?
   - One-time extension for engaged users?
   - Email-based extension requests?
   - Automatic extension if user added tickers but didn't receive summaries?

5. **Trial Abuse Prevention**: How to prevent trial abuse?
   - Email verification required?
   - One trial per email address?
   - One trial per payment method?
   - IP-based detection?

6. **Migration Timing**: When to migrate existing users?
   - All at once (flag day)?
   - Gradual rollout (new users first)?
   - Opt-in migration (let users choose)?

7. **Free Tier Deprecation**: Announce deprecation?
   - How much advance notice?
   - Email campaign to existing FREE users?
   - Landing page banner about upcoming changes?
