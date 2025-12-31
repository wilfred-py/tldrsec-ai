# Newsletter-Style Pricing Implementation Plan

**Date**: 2025-12-06 22:26:51 AEDT
**Git Commit**: c76f5176066de1dd67566ebd7c351cbdedf96b2b
**Branch**: fix/development-api-routes
**Repository**: tldrsec-ai

## Overview

Transform the current monthly subscription model ($9/$29/$99 per month) into a newsletter-style annual pricing model with a free tier. This positions tldrsec as a professional investment research tool rather than a casual subscription.

**New Pricing Structure:**
| Tier | Price | Ticker Limit | Delivery | Key Feature |
|------|-------|--------------|----------|-------------|
| Free | $0 | 1 | 24-48hr delay | Weekly digest |
| Individual | $249/year | 5 | Same-day | Professional analysis |
| Professional | $499/year | 15 | Priority (hours) | Enhanced AI |
| Advisor | $1,499/year | Unlimited | Real-time | API access |

## Current State Analysis

### Key Discoveries

1. **Dual Enum System Conflict** (High Priority Fix):
   - `SubscriptionTier` (6 values): FREE, PROFESSIONAL, ENTERPRISE, INSTITUTION, HOBBY, PRO
   - `PlanType` (3 values): BASIC, PROFESSIONAL, PREMIUM
   - These are used inconsistently - `User.subscriptionTier` vs `UserSubscription.planType`
   - Mapping functions exist but map to optimization levels, not tiers

2. **No Ticker Limit Enforcement**:
   - Users can currently add unlimited tickers regardless of tier
   - Only filing processing is limited via `UsagePeriod.filingLimit`
   - Ticker limits mentioned in docs but not implemented

3. **Hardcoded Pricing in Multiple Files**:
   - [components/landing/pricing-section.tsx](components/landing/pricing-section.tsx): 2-tier ($9, $29)
   - [app/dashboard/billing/page.tsx](app/dashboard/billing/page.tsx): 3-tier ($9, $29, $99)
   - [components/billing/subscription-plans.tsx](components/billing/subscription-plans.tsx): 3-tier
   - [components/dashboard/subscription-status.tsx](components/dashboard/subscription-status.tsx): 3-tier
   - [services/filings/enhanced/subscriptionService.ts](services/filings/enhanced/subscriptionService.ts): SUBSCRIPTION_FEATURES

4. **Existing Users**:
   - 64 newsletter signups (Supabase)
   - Unknown count of registered users (Neon PostgreSQL - requires direct DB access)
   - All users default to `FREE` tier on creation

## Desired End State

After implementation:
1. **Single Tier System**: `PlanType` enum with values: `FREE`, `INDIVIDUAL`, `PROFESSIONAL`, `ADVISOR`
2. **Ticker Limit Enforcement**: Users cannot exceed their tier's ticker limit
3. **Centralized Pricing Config**: All UI components import from `lib/stripe.ts`
4. **Annual-Only Billing**: No monthly option (reduces churn 30-40%)
5. **Free Tier Support**: Users can use service without Stripe payment

### Verification Criteria
- [ ] Free tier users can track 1 ticker only
- [ ] Individual tier users can track up to 5 tickers
- [ ] Professional tier users can track up to 15 tickers
- [ ] Advisor tier users have no ticker limit
- [ ] Checkout flow creates correct subscription in Stripe
- [ ] Webhook correctly updates database on subscription events
- [ ] Billing page shows correct plans with annual pricing
- [ ] Landing page displays new pricing tiers

## What We're NOT Doing

1. **Monthly billing option** - Annual only for lower churn
2. **SubscriptionTier enum migration** - Will deprecate entirely, not migrate values
3. **Delivery timing differentiation in code** - This is marketing copy; all tiers get same pipeline
4. **API access for Advisor tier** - Future feature, not in this phase
5. **White-label reports** - Future feature
6. **Quarterly trend reports** - Future feature

## Implementation Approach

**Strategy**: Phase-by-phase migration with careful database migration and Stripe configuration before code changes. Each phase is independently deployable.

**Estimated Effort**: 3-4 days of focused work

---

## Phase 1: Database Schema Migration

### Overview
Update the Prisma schema to consolidate tier systems and add ticker limit support.

### Changes Required

#### 1. Update PlanType Enum
**File**: `prisma/schema.prisma`

```prisma
// Replace existing PlanType enum (lines 724-728)
enum PlanType {
  FREE
  INDIVIDUAL
  PROFESSIONAL
  ADVISOR
}
```

#### 2. Add Ticker Limit to UserSubscription
**File**: `prisma/schema.prisma`

```prisma
// Update UserSubscription model (around line 305)
model UserSubscription {
  id                   String    @id @default(uuid())
  userId               String    @unique
  user                 User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  planType             PlanType  @default(FREE)  // Changed from BASIC
  tickerLimit          Int       @default(1)     // NEW: Enforced ticker limit
  isActive             Boolean   @default(true)
  stripeCustomerId     String?   @unique
  stripeSubscriptionId String?   @unique
  stripePriceId        String?
  currentPeriodStart   DateTime?
  currentPeriodEnd     DateTime?
  cancelAtPeriodEnd    Boolean   @default(false)
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt
}
```

#### 3. Create Migration Script
**File**: `prisma/migrations/YYYYMMDDHHMMSS_newsletter_pricing/migration.sql`

```sql
-- Step 1: Add new enum values first (PostgreSQL requires this order)
ALTER TYPE "PlanType" ADD VALUE IF NOT EXISTS 'FREE';
ALTER TYPE "PlanType" ADD VALUE IF NOT EXISTS 'INDIVIDUAL';
ALTER TYPE "PlanType" ADD VALUE IF NOT EXISTS 'ADVISOR';

-- Step 2: Add tickerLimit column with default
ALTER TABLE "UserSubscription" ADD COLUMN IF NOT EXISTS "tickerLimit" INTEGER NOT NULL DEFAULT 1;

-- Step 3: Migrate existing data
-- BASIC -> FREE (free tier)
UPDATE "UserSubscription" SET "planType" = 'FREE', "tickerLimit" = 1 WHERE "planType" = 'BASIC';

-- PROFESSIONAL stays PROFESSIONAL
UPDATE "UserSubscription" SET "tickerLimit" = 15 WHERE "planType" = 'PROFESSIONAL';

-- PREMIUM -> ADVISOR
UPDATE "UserSubscription" SET "planType" = 'ADVISOR', "tickerLimit" = 999999 WHERE "planType" = 'PREMIUM';

-- Step 4: Update User.subscriptionTier to match (for legacy compatibility)
-- This is informational only; we'll deprecate this field in a later phase
```

### Success Criteria

#### Automated Verification:
- [ ] Migration applies cleanly: `npm run db:migrate`
- [ ] Prisma client generates without errors: `npm run db:generate`
- [ ] Type checking passes: `npm run build`
- [ ] No linting errors: `npm run lint`

#### Manual Verification:
- [ ] Prisma Studio shows updated enum values: `npm run db:studio`
- [ ] Existing UserSubscription records have correct tickerLimit values
- [ ] No data loss occurred during migration

**Implementation Note**: After completing this phase, pause for manual database verification before proceeding.

---

## Phase 2: Stripe Configuration

### Overview
Create new products and prices in Stripe Dashboard. This is a manual step with verification.

### Changes Required

#### 1. Stripe Dashboard Setup (Manual)

**Create Products:**

| Product Name | Price | Billing | Price ID Env Var |
|-------------|-------|---------|------------------|
| Individual | $249.00 | Yearly | `STRIPE_INDIVIDUAL_PRICE_ID` |
| Professional | $499.00 | Yearly | `STRIPE_PROFESSIONAL_PRICE_ID` |
| Advisor | $1,499.00 | Yearly | `STRIPE_ADVISOR_PRICE_ID` |

**Steps:**
1. Log in to Stripe Dashboard (Test Mode first, then Live)
2. Go to Products > Create Product
3. For each product:
   - Name: `tldrsec [Tier Name]`
   - Description: Professional SEC filing intelligence
   - Pricing: One-time, Recurring > Yearly
   - Set price amount
4. Copy Price ID (starts with `price_`)

#### 2. Update Environment Variables

**File**: `.env.local` (development) and Vercel Dashboard (production)

```bash
# Remove old price IDs
# STRIPE_BASIC_PRICE_ID=...
# STRIPE_PROFESSIONAL_PRICE_ID=...  # Keep if reusing for new Professional
# STRIPE_PREMIUM_PRICE_ID=...

# Add new price IDs
STRIPE_INDIVIDUAL_PRICE_ID=price_xxxxxxxxxxxxx
STRIPE_PROFESSIONAL_PRICE_ID=price_xxxxxxxxxxxxx
STRIPE_ADVISOR_PRICE_ID=price_xxxxxxxxxxxxx
```

### Success Criteria

#### Automated Verification:
- [ ] Environment variables are set: Check `.env.local` has all 3 price IDs
- [ ] Stripe CLI can list products: `stripe products list --limit 5`

#### Manual Verification:
- [ ] Each product visible in Stripe Dashboard
- [ ] Prices are yearly (not monthly)
- [ ] Test mode prices created first
- [ ] Price IDs copied correctly to environment

**Implementation Note**: Do NOT proceed to code changes until Stripe products are verified in test mode.

---

## Phase 3: Core Stripe Configuration Update

### Overview
Rewrite `lib/stripe.ts` with new tier structure and centralized pricing config.

### Changes Required

#### 1. Rewrite SUBSCRIPTION_PLANS
**File**: `lib/stripe.ts`

```typescript
/**
 * Stripe Configuration and Client
 * Newsletter-style annual pricing model
 */

import Stripe from 'stripe';

// Environment validation
const requiredEnvVars = {
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
} as const;

// Check for missing environment variables
const missingVars = Object.entries(requiredEnvVars)
  .filter(([_, value]) => !value)
  .map(([key]) => key);

if (missingVars.length > 0) {
  console.warn(`Missing Stripe environment variables: ${missingVars.join(', ')}`);
  console.warn('Stripe features will be disabled');
}

// Initialize Stripe client
export const stripe = requiredEnvVars.STRIPE_SECRET_KEY
  ? new Stripe(requiredEnvVars.STRIPE_SECRET_KEY, {
      apiVersion: '2024-12-18.acacia',
      typescript: true,
      telemetry: false,
      maxNetworkRetries: 3,
      timeout: 10000,
    })
  : null;

// Webhook configuration
export const webhookSecret = requiredEnvVars.STRIPE_WEBHOOK_SECRET || '';

// Subscription plan configuration - Newsletter model
export const SUBSCRIPTION_PLANS = {
  FREE: {
    name: 'Free',
    priceId: null, // No Stripe price for free tier
    price: 0,
    tickerLimit: 1,
    deliveryTiming: 'delayed' as const,
    features: [
      '1 ticker subscription',
      'Weekly digest format',
      '24-48 hour delivery delay',
      'Basic SEC filing coverage (10-K, 10-Q, 8-K)',
    ],
  },
  INDIVIDUAL: {
    name: 'Individual',
    priceId: process.env.STRIPE_INDIVIDUAL_PRICE_ID || '',
    price: 249,
    tickerLimit: 5,
    deliveryTiming: 'same-day' as const,
    features: [
      'Up to 5 ticker subscriptions',
      'Same-day email delivery',
      'All SEC filing types',
      'Professional analysis format',
      'Form 4 insider trading alerts',
    ],
  },
  PROFESSIONAL: {
    name: 'Professional',
    priceId: process.env.STRIPE_PROFESSIONAL_PRICE_ID || '',
    price: 499,
    tickerLimit: 15,
    deliveryTiming: 'priority' as const,
    features: [
      'Up to 15 ticker subscriptions',
      'Priority delivery (within hours)',
      'Enhanced AI analysis',
      'Comparative filing insights',
      'All Individual features',
    ],
  },
  ADVISOR: {
    name: 'Advisor',
    priceId: process.env.STRIPE_ADVISOR_PRICE_ID || '',
    price: 1499,
    tickerLimit: 999999, // Effectively unlimited
    deliveryTiming: 'real-time' as const,
    features: [
      'Unlimited ticker subscriptions',
      'Real-time delivery',
      'API access (coming soon)',
      'White-label reports (coming soon)',
      'Priority support',
      'All Professional features',
    ],
  },
} as const;

// Type definitions
export type PlanType = keyof typeof SUBSCRIPTION_PLANS;
export type DeliveryTiming = 'delayed' | 'same-day' | 'priority' | 'real-time';

export interface SubscriptionPlan {
  name: string;
  priceId: string | null;
  price: number;
  tickerLimit: number;
  deliveryTiming: DeliveryTiming;
  features: readonly string[];
}

// Utility functions
export function isStripeEnabled(): boolean {
  return stripe !== null && webhookSecret !== '';
}

export function getPlanConfig(planType: PlanType): SubscriptionPlan {
  return SUBSCRIPTION_PLANS[planType];
}

export function getAllPlans(): typeof SUBSCRIPTION_PLANS {
  return SUBSCRIPTION_PLANS;
}

export function getPaidPlans(): Omit<typeof SUBSCRIPTION_PLANS, 'FREE'> {
  const { FREE, ...paidPlans } = SUBSCRIPTION_PLANS;
  return paidPlans;
}

export function getTickerLimit(planType: PlanType): number {
  return SUBSCRIPTION_PLANS[planType].tickerLimit;
}

export function canUpgrade(currentPlan: PlanType, targetPlan: PlanType): boolean {
  const planOrder: PlanType[] = ['FREE', 'INDIVIDUAL', 'PROFESSIONAL', 'ADVISOR'];
  return planOrder.indexOf(targetPlan) > planOrder.indexOf(currentPlan);
}

// Stripe error handling
export function handleStripeError(error: unknown): {
  message: string;
  code?: string;
  statusCode: number;
} {
  if (error instanceof Stripe.errors.StripeError) {
    return {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode || 500,
    };
  }

  return {
    message: 'An unexpected error occurred',
    statusCode: 500,
  };
}

// Keep existing webhook and checkout functions...
// (validateWebhookSignature, createCheckoutSession, etc.)
```

### Success Criteria

#### Automated Verification:
- [ ] Type checking passes: `npm run build`
- [ ] Unit tests for stripe.ts pass: `npm run test -- lib/stripe`
- [ ] No linting errors: `npm run lint`

#### Manual Verification:
- [ ] Import SUBSCRIPTION_PLANS works in other files
- [ ] getPlanConfig returns correct structure for each tier
- [ ] getTickerLimit returns correct values

**Implementation Note**: This phase updates the core config. UI components updated in Phase 5.

---

## Phase 4: Ticker Limit Enforcement

### Overview
Implement actual ticker limit checking when users add tickers.

### Changes Required

#### 1. Add Ticker Limit Check to API
**File**: `app/api/user/tickers/route.ts`

```typescript
// Add import at top
import { getTickerLimit, PlanType } from '@/lib/stripe';

// Inside POST handler, after user lookup (around line 175)
// Add ticker limit enforcement:

// Check ticker limit BEFORE creating new ticker
const currentTickerCount = await prisma.ticker.count({
  where: { userId: dbUser.id }
});

// Get user's plan type from UserSubscription
const userSubscription = await prisma.userSubscription.findUnique({
  where: { userId: dbUser.id }
});

const planType = (userSubscription?.planType || 'FREE') as PlanType;
const tickerLimit = getTickerLimit(planType);

if (currentTickerCount >= tickerLimit) {
  return NextResponse.json(
    {
      success: false,
      error: 'TICKER_LIMIT_REACHED',
      message: `You've reached your ${tickerLimit} ticker limit. Upgrade your plan to track more companies.`,
      currentCount: currentTickerCount,
      limit: tickerLimit,
      planType,
    },
    { status: 403 }
  );
}

// Continue with existing ticker creation logic...
```

#### 2. Add UI Feedback for Limit
**File**: `components/dashboard/dashboard-client.tsx`

```typescript
// Update handleAddTicker to show upgrade prompt on limit error

const handleAddTicker = async (company: Company) => {
  try {
    const result = await addTrackedCompany(company.symbol, company.name);

    if (!result.success) {
      if (result.error === 'TICKER_LIMIT_REACHED') {
        toast.error(
          `You've reached your ticker limit. Upgrade to track more companies.`,
          {
            action: {
              label: 'Upgrade',
              onClick: () => router.push('/dashboard/billing'),
            },
          }
        );
        return;
      }
      throw new Error(result.message);
    }

    // Success handling...
  } catch (error) {
    // Error handling...
  }
};
```

### Success Criteria

#### Automated Verification:
- [ ] API returns 403 when limit exceeded: Write integration test
- [ ] Type checking passes: `npm run build`
- [ ] Existing tests still pass: `npm run test`

#### Manual Verification:
- [ ] Free user (1 ticker limit) cannot add second ticker
- [ ] Error message displays correctly in UI
- [ ] Upgrade button navigates to billing page
- [ ] Paid users can add tickers up to their limit

**Implementation Note**: Test with a free tier user before proceeding.

---

## Phase 5: UI Component Updates

### Overview
Update all pricing-related UI to use centralized config.

### Changes Required

#### 1. Landing Page Pricing Section
**File**: `components/landing/pricing-section.tsx`

```typescript
'use client';

import { SUBSCRIPTION_PLANS, PlanType, getPaidPlans } from '@/lib/stripe';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';

export function PricingSection() {
  const router = useRouter();
  const paidPlans = getPaidPlans();

  const handleGetStarted = (planType: PlanType) => {
    if (planType === 'FREE') {
      router.push('/sign-up');
    } else {
      router.push(`/sign-up?plan=${planType.toLowerCase()}`);
    }
  };

  return (
    <section id="pricing" className="py-24 bg-gray-50">
      <div className="container mx-auto px-4">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-4">
            Professional SEC Filing Intelligence
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Annual subscription. Cancel anytime. No credit card required for free tier.
          </p>
        </div>

        <div className="grid md:grid-cols-4 gap-8 max-w-6xl mx-auto">
          {/* Free Tier */}
          <div className="bg-white rounded-lg border p-8">
            <h3 className="text-xl font-semibold mb-2">
              {SUBSCRIPTION_PLANS.FREE.name}
            </h3>
            <div className="mb-6">
              <span className="text-4xl font-bold">$0</span>
              <span className="text-gray-500">/forever</span>
            </div>
            <Button
              variant="outline"
              className="w-full mb-6"
              onClick={() => handleGetStarted('FREE')}
            >
              Get Started
            </Button>
            <ul className="space-y-3">
              {SUBSCRIPTION_PLANS.FREE.features.map((feature, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-600">{feature}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Paid Tiers */}
          {(Object.entries(paidPlans) as [PlanType, typeof paidPlans[keyof typeof paidPlans]][]).map(
            ([key, plan]) => (
              <div
                key={key}
                className={`bg-white rounded-lg border p-8 ${
                  key === 'PROFESSIONAL' ? 'ring-2 ring-blue-500 relative' : ''
                }`}
              >
                {key === 'PROFESSIONAL' && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs px-3 py-1 rounded-full">
                    Most Popular
                  </span>
                )}
                <h3 className="text-xl font-semibold mb-2">{plan.name}</h3>
                <div className="mb-6">
                  <span className="text-4xl font-bold">${plan.price}</span>
                  <span className="text-gray-500">/year</span>
                </div>
                <Button
                  className="w-full mb-6"
                  variant={key === 'PROFESSIONAL' ? 'default' : 'outline'}
                  onClick={() => handleGetStarted(key)}
                >
                  Subscribe
                </Button>
                <ul className="space-y-3">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-600">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          )}
        </div>
      </div>
    </section>
  );
}
```

#### 2. Dashboard Billing Page
**File**: `app/dashboard/billing/page.tsx`

Update to import from `lib/stripe.ts` and use `SUBSCRIPTION_PLANS` for plan display.

#### 3. Subscription Status Component
**File**: `components/dashboard/subscription-status.tsx`

Update to display correct tier name and ticker limit.

#### 4. Subscription Service
**File**: `services/filings/enhanced/subscriptionService.ts`

Update `SUBSCRIPTION_FEATURES` to match new tier names and limits.

### Success Criteria

#### Automated Verification:
- [ ] Build succeeds: `npm run build`
- [ ] Component tests pass: `npm run test -- components/`
- [ ] No linting errors: `npm run lint`

#### Manual Verification:
- [ ] Landing page shows 4 tiers with correct prices
- [ ] "Most Popular" badge on Professional tier
- [ ] Free tier CTA says "Get Started" not "Subscribe"
- [ ] Billing page shows user's current plan correctly
- [ ] Upgrade flow works end-to-end in test mode

**Implementation Note**: Verify visual appearance on desktop and mobile.

---

## Phase 6: Webhook Handler Updates

### Overview
Update Stripe webhook handler for new tier names and ticker limits.

### Changes Required

#### 1. Update Plan Limits Mapping
**File**: `app/api/webhook/stripe/route.ts`

```typescript
// Replace existing planLimits (around line 114)
import { getTickerLimit, PlanType } from '@/lib/stripe';

// In handleCheckoutCompleted:
const planType = session.metadata?.planType as PlanType;

if (!userId || !planType) {
  console.error('Missing metadata in checkout session');
  return;
}

const tickerLimit = getTickerLimit(planType);

// Update UserSubscription with correct values
await prisma.userSubscription.update({
  where: { userId },
  data: {
    stripeSubscriptionId: session.subscription as string,
    planType: planType,
    tickerLimit: tickerLimit,
    isActive: true,
    updatedAt: new Date(),
  },
});
```

### Success Criteria

#### Automated Verification:
- [ ] Build succeeds: `npm run build`
- [ ] Webhook tests pass: `npm run test -- webhook`

#### Manual Verification:
- [ ] Stripe CLI webhook test: `stripe trigger checkout.session.completed`
- [ ] Database updates with correct planType and tickerLimit
- [ ] User can immediately add tickers up to new limit

**Implementation Note**: Test with Stripe CLI before deploying.

---

## Phase 7: Cleanup and Documentation

### Overview
Remove deprecated code and update documentation.

### Changes Required

#### 1. Deprecate SubscriptionTier Enum
**File**: `prisma/schema.prisma`

Add comment noting deprecation (do not remove yet to avoid breaking changes):

```prisma
// DEPRECATED: Use PlanType instead. Will be removed in future migration.
enum SubscriptionTier {
  FREE
  PROFESSIONAL
  ENTERPRISE
  INSTITUTION
  HOBBY
  PRO
}
```

#### 2. Update Documentation
**Files**:
- `docs/stripe-setup-guide.md`
- `DEPLOYMENT_GUIDE.md`
- `.env.stripe.example`

Update with new price IDs and tier names.

#### 3. Remove Hardcoded Prices
Search and replace any remaining hardcoded `$9`, `$29`, `$99` references.

### Success Criteria

#### Automated Verification:
- [ ] Build succeeds: `npm run build`
- [ ] All tests pass: `npm run test`
- [ ] E2E tests pass: `npm run test:e2e`
- [ ] No grep results for old prices: `grep -r '\$9\|"\$29"\|"\$99"' --include="*.tsx" --include="*.ts"`

#### Manual Verification:
- [ ] Complete signup-to-checkout flow works
- [ ] Existing users unaffected
- [ ] Documentation is accurate

---

## Testing Strategy

### Unit Tests
- `lib/stripe.ts` - getPlanConfig, getTickerLimit, canUpgrade
- Ticker limit enforcement in API route
- Webhook handler plan type parsing

### Integration Tests
- End-to-end checkout flow with Stripe test mode
- Ticker limit enforcement across plan types
- Upgrade/downgrade paths

### Manual Testing Steps
1. Create new account (should be FREE tier)
2. Verify can only add 1 ticker
3. Attempt to add 2nd ticker - verify error message
4. Go through checkout for Individual plan (test mode)
5. Verify can now add up to 5 tickers
6. Verify billing page shows correct plan
7. Test Stripe billing portal access

## Performance Considerations

- Ticker limit check adds one additional DB query per ticker add
- Consider caching user's tickerLimit in session/JWT for performance
- Monitor API latency after deployment

## Migration Notes

### Existing Users
- All existing users on BASIC become FREE (1 ticker limit)
- Users with > 1 ticker grandfathered in (no enforcement on existing tickers)
- Future adds blocked until within limit or upgrade

### Rollback Plan
If issues arise:
1. Revert code changes (git revert)
2. Keep new Stripe products (non-breaking)
3. Database migration is additive (tickerLimit column), no data loss

## References

- Research: [thoughts/shared/research/2025-12-06-pricing-implementation-research.md](thoughts/shared/research/2025-12-06-pricing-implementation-research.md)
- Stripe setup: [docs/stripe-setup-guide.md](docs/stripe-setup-guide.md)
- Timeline: [.claude/history/TIMELINE.md](.claude/history/TIMELINE.md)
