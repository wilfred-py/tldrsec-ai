---
date: 2026-02-07T07:46:16Z
researcher: Claude Code
git_commit: 9c2275effa89a3769d31660d5d62e78a23c7f081
branch: feature/pipeline-resilience-zero-intervention
repository: tldrsec-ai
topic: "Free Plan to 7-Day Trial Migration - Complete Codebase Analysis"
tags: [research, codebase, subscription, free-plan, trial, pricing, billing, stripe]
status: complete
last_updated: 2026-02-10
last_updated_by: Wilfred Chen
last_updated_note: "Added detailed implementation requirements and follow-up research for refined 7-day trial migration"
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

---

## Follow-up Research [2026-02-10T08:52:37 AEDT]

**Updated Commit**: 4ed3d92acf50df55a652e7228509ea635adc601f
**Updated Branch**: investigation/pipeline-job-processing-2026-02-09
**Updated By**: Wilfred Chen

### Refined Requirements

Based on the reference image and clarified requirements:

1. **✅ Filing Types**: Free plan users can track ALL form types (not restricted to 10-K/10-Q)
2. **✅ Payment Method**: CTA banner should link to Stripe checkout and store card details during trial (verify only, no charge)
3. **✅ Trial Duration**: 7 days (not 14 days as currently shown in marketing copy)
4. **✅ Existing Users**: Grandfather existing FREE users as permanent free (no migration)
5. **✅ Payment Requirement**: Card required but don't charge (Stripe setup mode for verification)
6. **✅ Trial Expiration**: Soft block - show message that summaries won't be delivered unless they upgrade
7. **❌ Trial Extensions**: No extensions allowed
8. **✅ Abuse Prevention**: IP-based detection
9. **✅ Migration Timing**: All at once (flag day deployment)
10. **✅ Deprecation Notice**: No announcement needed (still in beta)

### Implementation Details from Codebase Analysis

#### 1. Stripe Checkout Configuration for Trial with Payment Method Verification

**Current Implementation** (`lib/stripe/index.ts:153-188`):

The checkout session creation does NOT include trial configuration. Need to add:

```typescript
// lib/stripe/index.ts - createCheckoutSession function
export async function createCheckoutSession({
  customerId,
  priceId,
  successUrl,
  cancelUrl,
  metadata,
}: {
  customerId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}) {
  // NEED TO ADD for trial with card verification:
  subscription_data: {
    trial_period_days: 7,
    trial_settings: {
      end_behavior: {
        missing_payment_method: 'cancel' // Cancel if no payment method
      }
    }
  },
  payment_method_collection: 'always', // Require card even for $0 trial
  // ...existing code
}
```

**Key Change**: Add `subscription_data.trial_period_days: 7` and `payment_method_collection: 'always'` to force card collection during trial signup.

**Reference**: Stripe documentation for setup mode: https://stripe.com/docs/billing/subscriptions/trials

#### 2. Filing Type Restriction Removal

**Current Restriction** (`lib/stripe/plans.ts:19`):

```typescript
FREE: {
  filingTypes: ['10-K', '10-Q'] as const,  // ← REMOVE THIS RESTRICTION
}
```

**Change to**:

```typescript
FREE: {
  filingTypes: ['ALL'] as const,  // Allow all form types for trial users
}
```

**Enforcement Points to Update**:

1. **Default User Preferences** (`lib/user/preference-types.ts:218-284`):
   - Currently enables only `form10K: true`, `form10Q: true`, `form8K: true`
   - **Change**: Enable all filing types by default for new trial users:
     ```typescript
     annualReports: {
       form10K: true,
       form10KA: true,    // ← Enable all
       form20F: true,     // ← Enable all
       form40F: true,     // ← Enable all
       formNCSR: true,    // ← Enable all
       formNCSRS: true,   // ← Enable all
       formNT10K: true    // ← Enable all
     },
     quarterlyReports: {
       form10Q: true,
       form10QA: true,    // ← Enable all
       form6K: true,      // ← Enable all
       formNT10Q: true    // ← Enable all
     },
     currentEvents: {
       form8K: true,
       form8KA: true      // ← Enable all
     },
     insiderTrading: {
       form3: true,       // ← Enable all
       form4: true,       // ← Enable all
       form5: true,       // ← Enable all
       form144: true      // ← Enable all
     },
     // ... enable all other categories
     ```

2. **Filing Processor** (`lib/cron/filing-processor.ts:180-199`):
   - Current logic calls `shouldProcessFiling()` which checks ticker preferences
   - No changes needed - will respect updated default preferences

3. **Preference Sync** (`lib/user/preference-sync.ts:118-165`):
   - Syncs user preferences to all tickers
   - No changes needed - will sync new all-enabled defaults

#### 3. Dashboard Banner Update for Trial Countdown

**Current Implementation** (`components/dashboard/plan-status-banner.tsx:1-36`):

```typescript
export function PlanStatusBanner({ planType }: PlanStatusBannerProps) {
  if (planType !== 'FREE') return null;

  return (
    <div className="...">
      <span>You&apos;re on the Free Plan</span>
      <Button asChild>
        <Link href="/dashboard/billing">Add Payment Method</Link>
      </Button>
    </div>
  );
}
```

**Change to**:

```typescript
export function PlanStatusBanner({
  planType,
  trialEndsAt
}: {
  planType: string;
  trialEndsAt?: Date;
}) {
  // Show for trial users only
  if (planType !== 'FREE' || !trialEndsAt) return null;

  const now = new Date();
  const daysRemaining = Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  // Don't show if trial expired
  if (daysRemaining <= 0) return null;

  // Urgent styling as trial approaches end
  const isUrgent = daysRemaining <= 2;

  return (
    <div className={cn(
      "w-full border-b",
      isUrgent
        ? "bg-red-100 dark:bg-red-950/30 border-red-200 dark:border-red-900"
        : "bg-emerald-100 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900"
    )}>
      <div className="container max-w-7xl mx-auto px-6 md:px-8 py-3">
        <div className="flex items-center justify-center gap-4">
          <span className={cn(
            "text-sm font-medium",
            isUrgent
              ? "text-red-900 dark:text-red-100"
              : "text-emerald-900 dark:text-emerald-100"
          )}>
            You&apos;ve got {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} left in your free trial
          </span>
          <Button
            size="sm"
            asChild
            className={cn(
              "font-medium shadow-sm",
              isUrgent
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "bg-emerald-600 hover:bg-emerald-700 text-white"
            )}
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

**Key Changes**:
- Calculate days remaining from `trialEndsAt` date
- Change message to "You've got X days left in your free trial"
- Add urgent styling (red) when ≤ 2 days remain
- Link to `/dashboard/billing` (Stripe checkout) remains unchanged

#### 4. Soft Block Implementation for Expired Trials

**Current Access Control** (`lib/auth/access-control.ts:35-104`):

Currently checks if user tracks ticker via `checkSummaryAccess()`. Need to add trial expiration check.

**Add New Function**:

```typescript
// lib/auth/access-control.ts
export async function checkTrialStatus(userId: string): Promise<{
  isActive: boolean;
  daysRemaining: number;
  trialEndsAt: Date | null;
}> {
  const prisma = getPrismaClient();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      subscriptionTier: true,
      trialEndsAt: true,
      trialStartedAt: true,
      isTrialing: true,
    }
  });

  if (!user) {
    throw new ResourceNotFoundError('User not found');
  }

  // Grandfathered free users (no trial dates) - always active
  if (user.subscriptionTier === 'FREE' && !user.trialStartedAt) {
    return { isActive: true, daysRemaining: Infinity, trialEndsAt: null };
  }

  // Trial users
  if (user.isTrialing && user.trialEndsAt) {
    const now = new Date();
    const daysRemaining = Math.ceil((user.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const isActive = daysRemaining > 0;

    return { isActive, daysRemaining, trialEndsAt: user.trialEndsAt };
  }

  // Paid users (PRO/MAX)
  return { isActive: true, daysRemaining: Infinity, trialEndsAt: null };
}
```

**Email Delivery Blocking** (`lib/email/notification-service.ts`):

Add trial check before sending emails:

```typescript
// lib/email/notification-service.ts
async function sendEmailNotification(userId: string, summary: Summary) {
  const trialStatus = await checkTrialStatus(userId);

  // Block email delivery for expired trials
  if (!trialStatus.isActive) {
    logger.info('Email blocked - trial expired', { userId });
    return;
  }

  // ... existing email sending logic
}
```

**Dashboard Soft Block UI** (`app/dashboard/page.tsx`):

Show message for expired trial users:

```typescript
// Add to dashboard page
if (trialStatus && !trialStatus.isActive) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <AlertCircle className="h-16 w-16 text-orange-500" />
      <h2 className="text-2xl font-semibold">Your Trial Has Ended</h2>
      <p className="text-muted-foreground text-center max-w-md">
        You won't receive new filing summaries delivered to your inbox unless you upgrade to a Pro or Max plan.
      </p>
      <Button asChild size="lg">
        <Link href="/dashboard/billing">
          <CreditCard className="mr-2 h-5 w-5" />
          Upgrade Now
        </Link>
      </Button>
    </div>
  );
}
```

#### 5. Database Migration for Trial Fields

**Migration File**: Create `prisma/migrations/YYYYMMDDHHMMSS_add_trial_fields/migration.sql`

```sql
-- Add trial tracking fields to User table
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "trialStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "isTrialing" BOOLEAN NOT NULL DEFAULT false;

-- Add index for efficient trial expiration queries
CREATE INDEX IF NOT EXISTS "User_trialEndsAt_isTrialing_idx"
  ON "User"("trialEndsAt", "isTrialing")
  WHERE "isTrialing" = true;

-- Mark existing FREE users as grandfathered (no trial dates)
-- They keep FREE tier permanently with NULL trial dates
-- New users will get trial dates populated on signup
```

**Update Prisma Schema** (`prisma/schema.prisma`):

```prisma
model User {
  // ... existing fields
  subscriptionTier      SubscriptionTier       @default(FREE)

  // NEW: Trial tracking fields
  trialStartedAt        DateTime?
  trialEndsAt           DateTime?
  isTrialing            Boolean                @default(false)

  // ... rest of model

  @@index([trialEndsAt, isTrialing])  // For efficient expired trial queries
}
```

#### 6. User Creation Flow Update

**Clerk Webhook** (`app/api/webhook/clerk/route.ts:71-81`):

**Change from**:
```typescript
const newUser = await prisma.user.create({
  data: {
    id: userData.id,
    email: primaryEmail,
    authProvider: 'clerk',
    authProviderId: userData.id,
    name: userData.first_name ? `${userData.first_name} ${userData.last_name || ''}`.trim() : undefined,
    subscriptionTier: 'FREE',           // Default FREE
    onboardingCompleted: false,
  }
});
```

**Change to**:
```typescript
const now = new Date();
const trialEndsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days from now

const newUser = await prisma.user.create({
  data: {
    id: userData.id,
    email: primaryEmail,
    authProvider: 'clerk',
    authProviderId: userData.id,
    name: userData.first_name ? `${userData.first_name} ${userData.last_name || ''}`.trim() : undefined,
    subscriptionTier: 'FREE',           // Still FREE but with trial dates
    trialStartedAt: now,                // NEW: Trial start
    trialEndsAt: trialEndsAt,          // NEW: Trial end (7 days)
    isTrialing: true,                   // NEW: Mark as trialing
    onboardingCompleted: false,
  }
});
```

#### 7. Trial Expiration Cron Job

**Create New Cron Endpoint** (`app/api/cron/trial-expiration/route.ts`):

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db/prisma';
import { validateCronRequest } from '@/lib/cron/validate';

export async function POST(req: NextRequest) {
  // Validate HMAC signature
  const validation = await validateCronRequest(req);
  if (!validation.authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const prisma = getPrismaClient();
  const now = new Date();

  try {
    // Find all expired trials that haven't been processed
    const expiredTrials = await prisma.user.findMany({
      where: {
        isTrialing: true,
        trialEndsAt: {
          lt: now
        }
      },
      select: {
        id: true,
        email: true,
        name: true,
        trialEndsAt: true,
      }
    });

    // Mark as no longer trialing
    await prisma.user.updateMany({
      where: {
        id: { in: expiredTrials.map(u => u.id) }
      },
      data: {
        isTrialing: false
      }
    });

    // Send "trial expired" notification emails
    for (const user of expiredTrials) {
      await queueTrialExpiredEmail(user.id, user.email, user.name || '');
    }

    return NextResponse.json({
      success: true,
      expiredCount: expiredTrials.length,
      processedAt: now.toISOString()
    });
  } catch (error) {
    console.error('[TrialExpiration] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

**Cloudflare Worker Configuration** (`cloudflare-cron/wrangler.toml`):

Add new cron trigger for trial expiration (runs daily at midnight):

```toml
# Existing tier-aware cron (every 10 minutes)
[triggers]
crons = [
  "*/10 * * * *"  # Every 10 minutes
]

# NEW: Add trial expiration check (daily at midnight UTC)
[[triggers]]
crons = [
  "0 0 * * *"  # Daily at midnight
]
```

**Cloudflare Worker Script** (`cloudflare-cron/index.js`):

```javascript
// Add new handler for trial expiration
async function handleTrialExpiration(env) {
  const response = await fetch(`${env.PUBLIC_URL}/api/cron/trial-expiration`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hmac-signature': generateHMAC(env.CRON_SECRET, payload),
      'x-hmac-timestamp': timestamp.toString(),
    },
  });

  return response;
}

export default {
  async scheduled(event, env, ctx) {
    // Existing tier-aware trigger (every 10 min)
    if (event.cron === '*/10 * * * *') {
      return handleTierAware(env);
    }

    // NEW: Trial expiration trigger (daily at midnight)
    if (event.cron === '0 0 * * *') {
      return handleTrialExpiration(env);
    }
  }
};
```

#### 8. IP-Based Abuse Prevention

**Create IP Tracking Service** (`lib/security/trial-abuse-prevention.ts`):

```typescript
import { getPrismaClient } from '@/lib/db/prisma';

export async function checkIPTrialAbuse(ipAddress: string): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const prisma = getPrismaClient();

  // Count users created from this IP in last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const userCount = await prisma.user.count({
    where: {
      signupIpAddress: ipAddress,
      createdAt: {
        gte: thirtyDaysAgo
      }
    }
  });

  // Allow max 3 signups per IP in 30 days
  if (userCount >= 3) {
    return {
      allowed: false,
      reason: 'Maximum trial signups reached for this IP address'
    };
  }

  return { allowed: true };
}
```

**Add IP Tracking to User Model**:

```sql
-- Migration file: prisma/migrations/YYYYMMDDHHMMSS_add_ip_tracking/migration.sql
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "signupIpAddress" TEXT;

-- Index for efficient IP lookup
CREATE INDEX IF NOT EXISTS "User_signupIpAddress_createdAt_idx"
  ON "User"("signupIpAddress", "createdAt");
```

**Update Clerk Webhook** (`app/api/webhook/clerk/route.ts`):

```typescript
// Extract IP from webhook request
const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0] ||
                  req.headers.get('x-real-ip') ||
                  'unknown';

// Check IP abuse before creating user
const abuseCheck = await checkIPTrialAbuse(ipAddress);
if (!abuseCheck.allowed) {
  logger.warn('[ClerkWebhook] IP blocked', { ipAddress, reason: abuseCheck.reason });
  // Still return 200 to acknowledge webhook, but don't create user
  return NextResponse.json({ received: true });
}

const newUser = await prisma.user.create({
  data: {
    // ... existing fields
    signupIpAddress: ipAddress,  // NEW: Track signup IP
    // ... rest of data
  }
});
```

#### 9. Stripe Webhook Updates for Trial Events

**Add Trial Event Handlers** (`app/api/webhook/stripe/route.ts`):

```typescript
// Add new event handlers after existing ones (line 90+)

case 'customer.subscription.trial_will_end':
  await handleTrialWillEnd(event.data.object as Stripe.Subscription);
  break;

// NEW: Handler for trial_will_end event (3 days before trial ends)
async function handleTrialWillEnd(subscription: Stripe.Subscription) {
  const userSubscription = await prisma.userSubscription.findUnique({
    where: { stripeSubscriptionId: subscription.id },
    include: { user: true }
  });

  if (!userSubscription) return;

  // Send "trial ending soon" email
  await queueTrialEndingEmail(
    userSubscription.user.id,
    userSubscription.user.email,
    userSubscription.user.name || '',
    3 // days remaining
  );

  logger.info('[Stripe] Trial will end soon', {
    userId: userSubscription.userId,
    trialEnd: new Date(subscription.trial_end * 1000)
  });
}
```

#### 10. Checkout Flow Update for Trial Users

**Banner Button Action** (`components/dashboard/plan-status-banner.tsx`):

Button already links to `/dashboard/billing` - no change needed. But need to update billing page to show Stripe checkout.

**Billing Page** (`app/dashboard/billing/page.tsx`):

Update to show trial status and Stripe checkout for trial users:

```typescript
// Add trial status section
{isTrialing && (
  <Card>
    <CardHeader>
      <CardTitle>Your Trial</CardTitle>
      <CardDescription>
        {daysRemaining} days remaining in your free trial
      </CardDescription>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground mb-4">
        Add a payment method now to continue accessing all features after your trial ends.
        You won't be charged until your trial expires.
      </p>
      <Button onClick={() => createCheckoutSession('PRO', 'monthly')}>
        <CreditCard className="mr-2 h-4 w-4" />
        Add Payment Method
      </Button>
    </CardContent>
  </Card>
)}
```

**Remove FREE Checkout Block** (`app/api/user/subscription/route.ts:168-173`):

**Delete this code**:
```typescript
if (planType === 'FREE') {
  return NextResponse.json(
    { error: 'Free tier does not require checkout' },
    { status: 400 }
  );
}
```

**Reason**: Trial users with `subscriptionTier === 'FREE'` need to be able to checkout to add payment method.

#### 11. Pricing Page Updates

**Landing Page Pricing** (`components/landing/sections/pricing-section.tsx:52-57, 122-124, 254-257`):

**Change from**:
```typescript
const ctaText =
  planKey === 'FREE'
    ? 'Start Free'
    : planKey === 'PRO'
      ? 'Start Pro Trial'
      : 'Start Max';

{planKey === 'FREE' && (
  <p className="text-sm text-slate-500 mt-1">Free forever</p>
)}

<p className="text-sm text-slate-500">
  All plans include 14-day free trial. No credit card required for
  Free plan.
</p>
```

**Change to**:
```typescript
// Remove FREE tier from pricing grid entirely
const plans = [
  SUBSCRIPTION_PLANS.PRO,
  SUBSCRIPTION_PLANS.MAX
];

const ctaText = 'Start 7-Day Trial';  // Same for all plans

<p className="text-sm text-slate-500 text-center mt-8">
  All plans include a 7-day free trial. Credit card required for verification,
  but you won't be charged until your trial ends.
</p>
```

**Remove FREE Plan Card**: Don't show FREE tier in pricing comparison - only PRO and MAX.

### Implementation Checklist

#### Phase 1: Database & Schema Changes
- [ ] Create migration to add `trialStartedAt`, `trialEndsAt`, `isTrialing` to User model
- [ ] Create migration to add `signupIpAddress` to User model for abuse prevention
- [ ] Add indexes for efficient trial expiration and IP lookup queries
- [ ] Run migrations: `npm run db:migrate`
- [ ] Generate Prisma client: `npm run db:generate`

#### Phase 2: Core Configuration Updates
- [ ] Update `lib/stripe/plans.ts:19` - Change FREE filingTypes from `['10-K', '10-Q']` to `['ALL']`
- [ ] Update `lib/user/preference-types.ts:218-284` - Enable all filing types in DEFAULT_NOTIFICATION_PREFERENCES
- [ ] Remove FREE tier from landing page pricing grid (`components/landing/sections/pricing-section.tsx`)
- [ ] Update trial copy from "14-day" to "7-day" in all pricing sections

#### Phase 3: Stripe Integration
- [ ] Update `lib/stripe/index.ts:170-185` - Add `subscription_data.trial_period_days: 7` to checkout
- [ ] Add `payment_method_collection: 'always'` to force card collection
- [ ] Add `trial_settings.end_behavior.missing_payment_method: 'cancel'`
- [ ] Add trial webhook handlers to `app/api/webhook/stripe/route.ts`:
  - [ ] `customer.subscription.trial_will_end` handler (3 days before)
  - [ ] Send "trial ending soon" email notification

#### Phase 4: User Creation Flow
- [ ] Update Clerk webhook (`app/api/webhook/clerk/route.ts:71-81`):
  - [ ] Set `trialStartedAt: now()`
  - [ ] Set `trialEndsAt: now() + 7 days`
  - [ ] Set `isTrialing: true`
  - [ ] Add `signupIpAddress` tracking
  - [ ] Add IP abuse check before user creation
- [ ] Update subscription checkout auto-create pattern with same trial fields

#### Phase 5: Access Control & Soft Block
- [ ] Create `checkTrialStatus()` function in `lib/auth/access-control.ts`
- [ ] Update email notification service to block delivery for expired trials
- [ ] Add trial expiration check to summary access control
- [ ] Create expired trial UI for dashboard (`app/dashboard/page.tsx`)
- [ ] Update dashboard banner (`components/dashboard/plan-status-banner.tsx`):
  - [ ] Calculate days remaining from `trialEndsAt`
  - [ ] Change message to "You've got X days left in your free trial"
  - [ ] Add urgent styling (red) when ≤ 2 days remain
  - [ ] Keep button linking to `/dashboard/billing`

#### Phase 6: Trial Expiration Handling
- [ ] Create `/api/cron/trial-expiration/route.ts` endpoint
- [ ] Update Cloudflare Worker cron configuration (`cloudflare-cron/wrangler.toml`):
  - [ ] Add daily cron trigger: `0 0 * * *`
- [ ] Update Cloudflare Worker script (`cloudflare-cron/index.js`):
  - [ ] Add `handleTrialExpiration()` function
  - [ ] Add cron schedule routing
- [ ] Create "trial expired" email template
- [ ] Queue trial expiration emails for expired users

#### Phase 7: Billing Page Updates
- [ ] Remove FREE checkout block from `app/api/user/subscription/route.ts:168-173`
- [ ] Update billing page to show trial status card
- [ ] Add "Add Payment Method" button for trial users that links to Stripe checkout
- [ ] Remove FREE plan from plan comparison grid

#### Phase 8: IP Abuse Prevention
- [ ] Create `lib/security/trial-abuse-prevention.ts`
- [ ] Implement `checkIPTrialAbuse()` with 3 signups per IP per 30 days limit
- [ ] Add IP tracking to Clerk webhook
- [ ] Create migration for `signupIpAddress` field and index

#### Phase 9: Email Templates
- [ ] Create "Trial Starting" email (sent at signup)
- [ ] Create "Trial Ending Soon" email (sent 3 days before expiration via Stripe webhook)
- [ ] Create "Trial Expired" email (sent on expiration via cron)
- [ ] Update welcome email to mention 7-day trial

#### Phase 10: Testing & Validation
- [ ] Test trial user creation flow end-to-end
- [ ] Test Stripe checkout with `subscription_data.trial_period_days: 7`
- [ ] Test dashboard banner countdown display
- [ ] Test soft block UI for expired trials
- [ ] Test email blocking for expired trial users
- [ ] Test trial expiration cron job
- [ ] Test IP abuse prevention (create 3+ accounts from same IP)
- [ ] Test grandfathered free user experience (no trial dates, permanent access)
- [ ] Test all filing types are enabled for trial users
- [ ] Test Stripe webhook handlers for trial events

#### Phase 11: Deployment
- [ ] Run database migrations in production
- [ ] Deploy updated Next.js application to Vercel
- [ ] Deploy updated Cloudflare Worker with new cron schedule
- [ ] Sync `CRON_SECRET` between Vercel and Cloudflare: `npm run cloudflare:sync-secret`
- [ ] Verify trial expiration cron is running: check Cloudflare Worker logs
- [ ] Monitor error rates and user signups
- [ ] Monitor trial conversion rates (trial → paid)

### Grandfathering Existing FREE Users

**Strategy**: Existing FREE users will be automatically grandfathered because they have `NULL` values for `trialStartedAt` and `trialEndsAt`.

**Access Control Logic**:

```typescript
// lib/auth/access-control.ts
export async function checkTrialStatus(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      subscriptionTier: true,
      trialEndsAt: true,
      trialStartedAt: true,
      isTrialing: true,
    }
  });

  // Grandfathered free users (no trial dates) - always active
  if (user.subscriptionTier === 'FREE' && !user.trialStartedAt) {
    return {
      isActive: true,
      daysRemaining: Infinity,
      trialEndsAt: null,
      isGrandfathered: true  // Flag for UI display
    };
  }

  // Trial users - check expiration
  // ... rest of logic
}
```

**Database Query**:

```sql
-- Grandfathered users (existing FREE users)
SELECT * FROM "User"
WHERE "subscriptionTier" = 'FREE'
  AND "trialStartedAt" IS NULL;

-- New trial users
SELECT * FROM "User"
WHERE "subscriptionTier" = 'FREE'
  AND "trialStartedAt" IS NOT NULL
  AND "isTrialing" = true;
```

**No Migration Needed**: Existing users automatically grandfathered because:
1. Database migration adds trial fields as nullable (`DateTime?`)
2. Existing users will have `NULL` for `trialStartedAt` and `trialEndsAt`
3. Access control checks for `NULL` trial dates and allows permanent access
4. Only NEW users (created after deployment) will have trial dates populated

### Key Architectural Decisions

1. **Keep FREE Enum**: Don't remove FREE from enums - use it for both grandfathered and trial users. Differentiate via presence/absence of `trialStartedAt` field.

2. **Soft Block Not Hard Block**: Trial-expired users can still access dashboard, but won't receive email summaries. This allows them to see what they're missing and encourages upgrade.

3. **7-Day Trial with Card Verification**: Stripe's setup mode collects payment method during trial but doesn't charge until trial ends. This reduces friction while preventing abuse.

4. **IP-Based Abuse Prevention**: Limit to 3 signups per IP per 30 days. Simple but effective for preventing trial abuse without complex payment method fingerprinting.

5. **Grandfathering via NULL Dates**: Existing users keep permanent FREE access because they lack trial dates. New pattern: FREE + trial dates = trial user, FREE + no trial dates = grandfathered user.

6. **All Filing Types for Trial**: Trial users get full feature access (all form types, 3 tickers) to showcase product value and encourage conversion to paid plans.

7. **Daily Expiration Cron**: Run at midnight UTC to mark expired trials and send notifications. Separate from main pipeline cron (every 10 min) for clean separation of concerns.

8. **Stripe Trial Webhooks**: Use `customer.subscription.trial_will_end` (3 days before) to send reminder emails. Gives users warning to add payment method.

9. **No Trial Extensions**: Policy decision to maintain urgency. No backend support for extending trials - users must upgrade to continue access.

10. **Flag Day Deployment**: Deploy all changes at once. Existing users grandfathered immediately, new users get trial flow. No gradual rollout complexity.

### Related Documentation

- **Stripe Trial Setup**: https://stripe.com/docs/billing/subscriptions/trials
- **Stripe Checkout Sessions**: https://stripe.com/docs/api/checkout/sessions/create
- **Clerk Webhooks**: https://clerk.com/docs/integrations/webhooks
- **Cloudflare Workers Cron**: https://developers.cloudflare.com/workers/configuration/cron-triggers/

### Success Metrics

Track these metrics post-deployment to measure trial effectiveness:

1. **Trial Signup Rate**: % of new signups that complete onboarding
2. **Trial Activation Rate**: % of trial users that add at least 1 ticker
3. **Trial Conversion Rate**: % of trial users that convert to paid (PRO/MAX)
4. **Trial Abandonment Rate**: % of trial users that let trial expire without converting
5. **Card Attachment Rate**: % of trial signups that successfully attach payment method during trial
6. **Trial Abuse Rate**: % of signups blocked due to IP abuse prevention
7. **Email Delivery Block Rate**: % of emails blocked due to expired trial status
8. **Average Days to Conversion**: How long trial users take to upgrade (should be < 7 days)

### Open Questions Resolved

Based on user input:

1. ✅ **Filing Types**: All form types allowed for trial users (not just 10-K/10-Q)
2. ✅ **Card Requirement**: Required but don't charge (Stripe setup mode)
3. ✅ **Existing Users**: Grandfathered as permanent FREE (NULL trial dates)
4. ✅ **Trial Expiration**: Soft block - dashboard access but no email delivery
5. ✅ **Trial Extensions**: No extensions allowed
6. ✅ **Abuse Prevention**: IP-based detection (3 signups per IP per 30 days)
7. ✅ **Migration Timing**: All at once (flag day)
8. ✅ **Deprecation Notice**: No announcement needed (still in beta)
9. ✅ **Trial Duration**: 7 days (not 14 days)
10. ✅ **Banner Action**: Links to Stripe checkout at `/dashboard/billing`

### Reference Image Implementation

Based on the Stripe payment method dialog shown in the reference image:

**Payment Method Collection UI**:
- Stripe's hosted checkout page handles card collection
- Supports Card, Bank, Google Pay, Bancontact payment methods
- Collects card number, expiration date, security code, country
- Shows "Secure, fast checkout with Link" branding
- Displays message: "By providing your card information, you allow COMPANY to charge your card for future payments in accordance with their terms"
- "SAVE PAYMENT METHOD" button at bottom

**Implementation**:
- Use Stripe Checkout Sessions (not Elements) for simplicity
- Configure `payment_method_types: ['card']` minimum
- Add `subscription_data.trial_period_days: 7`
- Stripe handles all UI, validation, and PCI compliance
- Webhook receives payment method after checkout completion
- No custom payment UI needed - Stripe's hosted page matches reference image

**Trial Behavior**:
- User adds card during trial signup
- Card verified but not charged
- At day 7, Stripe automatically charges card based on selected plan (PRO $199 or MAX $349)
- If card fails, subscription canceled per `trial_settings.end_behavior.missing_payment_method: 'cancel'`
