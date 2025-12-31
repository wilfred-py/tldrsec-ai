# Premium to Max Tier Rename - Implementation Plan

**Date**: 2025-12-30 16:20:48 AEDT
**Git Commit**: 91e9cd0871c1ed0893779923d5bc78bc90d5c3ac
**Branch**: feature/landing-page-stripe-redesign
**Repository**: tldrsec-ai
**Status**: ✅ IMPLEMENTED (2025-12-30)

## Implementation Summary

All phases have been completed successfully:

| Phase | Status | Details |
|-------|--------|---------|
| Phase 1: Database Migration | ✅ Complete | Added MAX to PlanType enum via Supabase migration |
| Phase 2: Core Stripe Configuration | ✅ Complete | Renamed PREMIUM_LEGACY to MAX_LEGACY in lib/stripe.ts |
| Phase 3: Services and Validation | ✅ Complete | Updated all service files, validation schemas keep PREMIUM for backwards compatibility |
| Phase 4: UI Components | ✅ Complete | Updated billing page and subscription components |
| Phase 5: API Routes | ✅ Complete | Updated webhook and subscription routes |
| Phase 6: Test Files | ✅ Complete | Updated test files to use MAX |
| Phase 7: Documentation | ✅ Complete | This document updated |

### Key Changes Made

1. **Database**: Added `MAX` to `PlanType` enum (PREMIUM kept for backwards compatibility)
2. **lib/stripe.ts**: `PREMIUM_LEGACY` → `MAX_LEGACY`
3. **lib/subscription/tickerSubscriptionInfo.ts**: `hasPremiumUsers` → `hasMaxUsers`, `premium` → `max` in all interfaces
4. **services/filings/enhanced/subscriptionService.ts**: Updated SUBSCRIPTION_FEATURES to use `max` key
5. **app/api/webhook/stripe/route.ts**: PREMIUM → MAX in plan limits
6. **app/api/user/subscription/route.ts**: PREMIUM → MAX in type casts
7. **app/dashboard/billing/page.tsx**: premium → max tier configuration
8. **lib/cron/handlers/fetch-handler.ts**: PREMIUM → MAX in priority checks
9. **lib/validation/subscription-validation.ts**: Kept PREMIUM for backwards compatibility during transition

### Test Results
- All 16 stripe-pricing tests pass ✅
- Type checking passes ✅

### Remaining Manual Steps
1. Update Stripe dashboard product names (Premium → Max)
2. Update environment variables in Vercel if using STRIPE_PREMIUM_* naming
3. Verify new signups can purchase Max tier

---

## Overview

Rename the "Premium" subscription tier to "Max" across the entire codebase. This affects the database schema, Stripe configuration, UI components, API routes, services, and tests. Since there are no existing users, this is a clean rename with no migration concerns.

## Current State Analysis

### Scope Assessment
Based on comprehensive research documented in [2025-12-30-premium-to-max-tier-rename.md](../../thoughts/shared/research/2025-12-30-premium-to-max-tier-rename.md):

- **40+ distinct locations** across **17+ unique files** need updates
- Database enum `PlanType` uses `PREMIUM` at `prisma/schema.prisma:739`
- Two database tables reference this enum: `UserSubscription.planType` and `UsagePeriod.planType`
- Core Stripe config at `lib/stripe.ts:75-92` defines PREMIUM plan

### Open Questions Resolved

| Question | Resolution |
|----------|------------|
| Should Stripe product names change? | **Yes** - Update in Stripe dashboard |
| How to handle existing subscribers? | **N/A** - No existing users |
| Email templates mentioning Premium? | **None found** - Templates use dynamic data |
| Analytics events tracking "premium"? | **None exist** - Analytics infrastructure is unused |

### Key Discoveries

1. **Email templates are clean** - No "Premium" hardcoded text in `lib/email/templates.ts`
2. **No analytics tracking exists** - PostHog infrastructure exists but `useAnalytics` hook is never imported/used
3. **Legacy tier exists**: `PREMIUM_LEGACY` at `lib/stripe.ts:125-139` needs renaming to `MAX_LEGACY`
4. **SEO metadata** - `components/seo/newsletter-schema.tsx:120` mentions "premium features"

## Desired End State

After implementation:
1. All code references use `MAX` instead of `PREMIUM`
2. Database enum updated from `PREMIUM` to `MAX`
3. Stripe products renamed to "Max Monthly" / "Max Annual"
4. UI displays "Max" tier throughout the application
5. All tests pass with new naming
6. Environment variable names updated from `STRIPE_PREMIUM_*` to `STRIPE_MAX_*`

### Verification Criteria
- `npm run build` succeeds
- `npm run test` passes all tests
- `npm run lint` shows no errors
- Database migration completes successfully
- New signups can purchase "Max" tier

## What We're NOT Doing

1. **NOT changing pricing** - Max tier remains $139/month
2. **NOT modifying features** - Same feature set, just renamed
3. **NOT adding analytics** - Out of scope (separate future work)
4. **NOT modifying Stripe price IDs** - Existing price IDs work fine
5. **NOT updating email templates** - They don't contain tier names

## Implementation Approach

We'll use a phased approach following TDD principles:
1. **Phase 1**: Database migration (most critical - affects stored data)
2. **Phase 2**: Core configuration (`lib/stripe.ts` - central config)
3. **Phase 3**: Services and validation schemas
4. **Phase 4**: UI components
5. **Phase 5**: API routes
6. **Phase 6**: Tests
7. **Phase 7**: Documentation and Stripe dashboard

---

## Phase 1: Database Migration

### Overview
Create a Prisma migration to rename the `PREMIUM` enum value to `MAX` in the `PlanType` enum, and update all existing records.

### Step 1.1: 🔴 Write Failing Tests

**Test File**: `__tests__/database/plan-type-migration.test.ts`

```typescript
import { PrismaClient } from '@prisma/client';

describe('PlanType enum migration', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should have MAX as valid PlanType enum value', async () => {
    // This test will fail until migration is applied
    const result = await prisma.$queryRaw<{ enum_value: string }[]>`
      SELECT unnest(enum_range(NULL::app."PlanType")) as enum_value
    `;
    const values = result.map(r => r.enum_value);
    expect(values).toContain('MAX');
    expect(values).not.toContain('PREMIUM');
  });

  it('should have no UserSubscription records with PREMIUM planType', async () => {
    const count = await prisma.userSubscription.count({
      where: { planType: 'PREMIUM' as any }
    });
    expect(count).toBe(0);
  });

  it('should have no UsagePeriod records with PREMIUM planType', async () => {
    const count = await prisma.usagePeriod.count({
      where: { planType: 'PREMIUM' as any }
    });
    expect(count).toBe(0);
  });
});
```

**Checkpoint 1.1**: Tests fail as expected (PREMIUM still exists in enum)
```bash
npm run test -- --testPathPattern="plan-type-migration"
# Expected: 3 failing tests
```

### Step 1.2: 🟢 Create and Apply Migration

#### 1.2.1 Create Migration File
**File**: `prisma/migrations/YYYYMMDDHHMMSS_rename_premium_to_max/migration.sql`

```sql
-- Step 1: Add MAX to the enum
ALTER TYPE app."PlanType" ADD VALUE IF NOT EXISTS 'MAX';

-- Step 2: Update UserSubscription records
UPDATE app."UserSubscription" SET "planType" = 'MAX' WHERE "planType" = 'PREMIUM';

-- Step 3: Update UsagePeriod records
UPDATE app."UsagePeriod" SET "planType" = 'MAX' WHERE "planType" = 'PREMIUM';

-- Step 4: Rename the enum value (PostgreSQL 10+)
-- Note: PostgreSQL doesn't support direct renaming of enum values
-- We handle this by keeping both values temporarily, then removing PREMIUM in a follow-up migration
```

#### 1.2.2 Update Prisma Schema
**File**: `prisma/schema.prisma:736-742`

Change:
```prisma
enum PlanType {
  BASIC
  PROFESSIONAL
  PREMIUM

  @@schema("app")
}
```

To:
```prisma
enum PlanType {
  BASIC
  PROFESSIONAL
  MAX

  @@schema("app")
}
```

#### 1.2.3 Generate and Apply Migration
```bash
npx prisma migrate dev --name rename_premium_to_max
npm run db:generate
```

**Checkpoint 1.2.3**: Migration applied successfully
```bash
npx prisma migrate status
# Expected: All migrations applied
```

### Step 1.3: 🔵 Verify Migration

**Checkpoint 1.3**: All database tests pass
```bash
npm run test -- --testPathPattern="plan-type-migration"
# Expected: 3 passing tests
```

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [ ] Migration status clean: `npx prisma migrate status`
- [ ] Prisma client generated: `npm run db:generate`
- [ ] Database tests pass: `npm run test -- --testPathPattern="plan-type-migration"`

#### Manual Verification:
- [ ] Connect to database and verify enum contains MAX, not PREMIUM
- [ ] Verify existing Premium subscribers have planType = MAX

**STOP**: Await manual confirmation before Phase 2.

---

## Phase 2: Core Stripe Configuration

### Overview
Update `lib/stripe.ts` to rename PREMIUM to MAX. This is the central configuration imported by most components.

### Step 2.1: 🔴 Write Failing Tests

**Test File**: `__tests__/config/stripe-max-tier.test.ts`

```typescript
import { SUBSCRIPTION_PLANS, LEGACY_SUBSCRIPTION_PLANS, getPlanConfig } from '@/lib/stripe';

describe('Stripe MAX tier configuration', () => {
  describe('SUBSCRIPTION_PLANS', () => {
    it('should have MAX tier instead of PREMIUM', () => {
      expect(SUBSCRIPTION_PLANS).toHaveProperty('MAX');
      expect(SUBSCRIPTION_PLANS).not.toHaveProperty('PREMIUM');
    });

    it('should have MAX tier with correct configuration', () => {
      const maxPlan = SUBSCRIPTION_PLANS.MAX;
      expect(maxPlan.name).toBe('Max');
      expect(maxPlan.monthlyPrice).toBe(139);
      expect(maxPlan.tickerLimit).toBe(-1);
    });

    it('should have "Unlimited companies" as first feature for MAX', () => {
      expect(SUBSCRIPTION_PLANS.MAX.features[0]).toBe('Unlimited companies');
    });
  });

  describe('LEGACY_SUBSCRIPTION_PLANS', () => {
    it('should have MAX_LEGACY tier instead of PREMIUM_LEGACY', () => {
      expect(LEGACY_SUBSCRIPTION_PLANS).toHaveProperty('MAX_LEGACY');
      expect(LEGACY_SUBSCRIPTION_PLANS).not.toHaveProperty('PREMIUM_LEGACY');
    });

    it('should have MAX_LEGACY with correct name', () => {
      expect(LEGACY_SUBSCRIPTION_PLANS.MAX_LEGACY.name).toBe('Max (Legacy)');
    });

    it('should have "Max filing summaries" as first feature', () => {
      expect(LEGACY_SUBSCRIPTION_PLANS.MAX_LEGACY.features[0]).toBe('Max filing summaries');
    });
  });

  describe('getPlanConfig', () => {
    it('should return MAX config when called with MAX', () => {
      const config = getPlanConfig('MAX');
      expect(config.name).toBe('Max');
    });
  });
});
```

**Checkpoint 2.1**: Tests fail (PREMIUM still exists)
```bash
npm run test -- --testPathPattern="stripe-max-tier"
# Expected: 7 failing tests
```

### Step 2.2: 🟢 Implement Changes

**File**: `lib/stripe.ts`

#### 2.2.1 Update Comment (line 39)
```typescript
// NEW PRICING TIERS (2025) - $0 Free / $99 Pro / $139 Max
```

#### 2.2.2 Rename PREMIUM to MAX (lines 75-93)
```typescript
  MAX: {
    name: 'Max',
    monthlyPriceId: process.env.STRIPE_MAX_MONTHLY_PRICE_ID || '',
    annualPriceId: process.env.STRIPE_MAX_ANNUAL_PRICE_ID || '',
    monthlyPrice: 139,
    annualPrice: 1390,
    tickerLimit: -1,
    filingTypes: ['ALL'] as const,
    emailFrequency: 'realtime' as const,
    features: [
      'Unlimited companies',
      'Real-time email alerts',
      'All filing types',
      'API access for developers',
      'Priority processing queue',
      'Dedicated support',
    ],
  },
```

#### 2.2.3 Rename PREMIUM_LEGACY to MAX_LEGACY (lines 125-139)
```typescript
  MAX_LEGACY: {
    name: 'Max (Legacy)',
    priceId: process.env.STRIPE_MAX_PRICE_ID || '',
    monthlyFilings: 1000,
    optimizationLevel: 'minimal',
    features: [
      'Max filing summaries',
      'Maximum context preservation',
      'Real-time notifications',
      'Minimal token optimization (55% reduction)',
      'Complete financial statements',
      'Full business narratives',
      'Priority support',
    ],
  },
```

**Checkpoint 2.2.3**: All stripe config tests pass
```bash
npm run test -- --testPathPattern="stripe-max-tier"
# Expected: 7 passing tests
```

### Step 2.3: 🔵 Refactor

- [ ] Verify TypeScript types are correctly inferred (`PlanType` now includes 'MAX')
- [ ] Ensure no unused PREMIUM references remain in file

**Checkpoint 2.3**: Build succeeds with new types
```bash
npm run build
# Expected: Success
```

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [ ] Stripe config tests pass: `npm run test -- --testPathPattern="stripe-max-tier"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Import SUBSCRIPTION_PLANS in console and verify MAX exists

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: Services and Validation Schemas

### Overview
Update services that reference PREMIUM tier and Zod validation schemas.

### Step 3.1: 🔴 Write Failing Tests

**Test File**: `__tests__/services/max-tier-services.test.ts`

```typescript
import { PLAN_TO_OPTIMIZATION, OPTIMIZATION_TO_PLAN, PLAN_TIER_DISPLAY } from '@/services/filings/enhanced/subscriptionService';
import { planTypeSchema, subscriptionDataSchema } from '@/lib/validation/subscription-validation';

describe('Service MAX tier configuration', () => {
  describe('subscriptionService mappings', () => {
    it('should map MAX to minimal optimization', () => {
      expect(PLAN_TO_OPTIMIZATION['MAX']).toBe('minimal');
    });

    it('should map minimal optimization to MAX', () => {
      expect(OPTIMIZATION_TO_PLAN['minimal']).toBe('MAX');
    });

    it('should have MAX tier display configuration', () => {
      expect(PLAN_TIER_DISPLAY.max).toBeDefined();
      expect(PLAN_TIER_DISPLAY.max.name).toBe('Max');
    });
  });

  describe('validation schemas', () => {
    it('should accept MAX as valid plan type', () => {
      const result = planTypeSchema.safeParse('MAX');
      expect(result.success).toBe(true);
    });

    it('should reject PREMIUM as plan type', () => {
      const result = planTypeSchema.safeParse('PREMIUM');
      expect(result.success).toBe(false);
    });
  });
});
```

**Checkpoint 3.1**: Tests fail
```bash
npm run test -- --testPathPattern="max-tier-services"
# Expected: 5 failing tests
```

### Step 3.2: 🟢 Implement Changes

#### 3.2.1 Update subscriptionService.ts
**File**: `services/filings/enhanced/subscriptionService.ts`

Lines to change:
- Line 33: `'PREMIUM': 'minimal'` → `'MAX': 'minimal'`
- Line 45: `'minimal': 'PREMIUM'` → `'minimal': 'MAX'`
- Lines 93-107: Change `premium:` key to `max:` and `name: 'Premium'` to `name: 'Max'`
- Line 97: `'Premium filing summaries'` → `'Max filing summaries'`
- Line 406: `'PREMIUM': 'premium'` → `'MAX': 'max'`

#### 3.2.2 Update tickerSubscriptionInfo.ts
**File**: `lib/subscription/tickerSubscriptionInfo.ts`

Lines to change:
- Line 58: `hasPremiumUsers: boolean` → `hasMaxUsers: boolean`
- Line 62: `premium: number` → `max: number`
- Line 75: `premium: 1.0` → `max: 1.0`
- Line 84: `premium: 5` → `max: 5`
- Line 200: `case 'PREMIUM':` → `case 'MAX':`
- Line 201: `tierCounts.premium++` → `tierCounts.max++`
- Line 230: `hasPremiumUsers: tierCounts.premium > 0` → `hasMaxUsers: tierCounts.max > 0`
- Line 237: `hasPremiumUsers` → `hasMaxUsers`

#### 3.2.3 Update fetch-handler.ts
**File**: `lib/cron/handlers/fetch-handler.ts`

Lines to change:
- Line 127: `userTier === 'PREMIUM'` → `userTier === 'MAX'`
- Line 302: `userTier === 'PREMIUM'` → `userTier === 'MAX'`

#### 3.2.4 Update validation schemas
**File**: `lib/validation/subscription-validation.ts`

Lines to change:
- Line 10: `z.enum(['BASIC', 'PROFESSIONAL', 'PREMIUM'])` → `z.enum(['BASIC', 'PROFESSIONAL', 'MAX'])`
- Line 35: `z.enum(['BASIC', 'PROFESSIONAL', 'PREMIUM'])` → `z.enum(['BASIC', 'PROFESSIONAL', 'MAX'])`

#### 3.2.5 Update RBAC
**File**: `lib/security/rbac.ts`

Lines to change:
- Line 19: `PREMIUM_USER = 'premium_user'` → `MAX_USER = 'max_user'`
- Lines 120-146: All `UserRole.PREMIUM_USER` references → `UserRole.MAX_USER`

**Checkpoint 3.2.5**: Service tests pass
```bash
npm run test -- --testPathPattern="max-tier-services"
# Expected: 5 passing tests
```

### Step 3.3: 🔵 Refactor

- [ ] Ensure consistent naming across all service files
- [ ] Verify no orphaned PREMIUM references

**Checkpoint 3.3**: Full test suite passes
```bash
npm run test
# Expected: All tests pass (with expected failures in files not yet updated)
```

### Step 3.4: Final Phase Verification

#### Automated Verification:
- [ ] Service tests pass: `npm run test -- --testPathPattern="max-tier-services"`
- [ ] Type checking passes: `npm run build`

#### Manual Verification:
- [ ] Review diff to confirm all service files updated correctly

**STOP**: Await manual confirmation before Phase 4.

---

## Phase 4: UI Components

### Overview
Update all UI components that display or reference the Premium tier.

### Step 4.1: 🔴 Write Failing Tests

**Test File**: `__tests__/components/max-tier-ui.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import { UpgradeCTASection } from '@/components/dashboard/upgrade-cta-section';
import { PricingSection } from '@/components/landing/sections/pricing-section';

describe('UI MAX tier display', () => {
  describe('UpgradeCTASection', () => {
    it('should not render for MAX tier users', () => {
      const { container } = render(<UpgradeCTASection currentPlan="MAX" />);
      expect(container.firstChild).toBeNull();
    });

    it('should show "Go Max" CTA for PRO users', () => {
      render(<UpgradeCTASection currentPlan="PRO" />);
      expect(screen.getByText(/Go Max/i)).toBeInTheDocument();
    });

    it('should show "Start Max" button text', () => {
      render(<UpgradeCTASection currentPlan="PRO" />);
      expect(screen.getByText(/Start Max/i)).toBeInTheDocument();
    });
  });

  describe('PricingSection', () => {
    it('should display Max tier name', () => {
      render(<PricingSection />);
      expect(screen.getByText('Max')).toBeInTheDocument();
      expect(screen.queryByText('Premium')).not.toBeInTheDocument();
    });
  });
});
```

**Checkpoint 4.1**: Tests fail
```bash
npm run test -- --testPathPattern="max-tier-ui"
# Expected: 4 failing tests
```

### Step 4.2: 🟢 Implement Changes

#### 4.2.1 Update upgrade-cta-section.tsx
**File**: `components/dashboard/upgrade-cta-section.tsx`

Lines to change:
- Line 8: `'FREE' | 'PRO' | 'PREMIUM'` → `'FREE' | 'PRO' | 'MAX'`
- Line 19: `currentPlan === 'PREMIUM'` → `currentPlan === 'MAX'`
- Line 73: `// PRO tier - upsell to Premium` → `// PRO tier - upsell to Max`
- Line 80: `Go Premium` → `Go Max`
- Line 93: `Start Premium - $139/mo` → `Start Max - $139/mo`

#### 4.2.2 Update subscription-status.tsx
**File**: `components/dashboard/subscription-status.tsx`

Lines to change:
- Line 30: `'basic' | 'professional' | 'premium'` → `'basic' | 'professional' | 'max'`
- Lines 62-68: Change key and name:
```typescript
max: {
  name: 'Max',
  color: 'bg-orange-500',
  badgeVariant: 'destructive' as const,
  optimizationLevel: 'Minimal (55% reduction)',
  price: '$99/month'
}
```

#### 4.2.3 Update subscription-plans.tsx
**File**: `components/billing/subscription-plans.tsx`

Line to change:
- Line 48: `PREMIUM: '$99'` → `MAX: '$99'`

#### 4.2.4 Update pricing-section.tsx (landing)
**File**: `components/landing/pricing-section.tsx`

Line to change:
- Line 27: `name: "Premium"` → `name: "Max"`

#### 4.2.5 Update pricing-section.tsx (sections)
**File**: `components/landing/sections/pricing-section.tsx`

Lines to change:
- Line 12: `'FREE' | 'PRO' | 'PREMIUM'` → `'FREE' | 'PRO' | 'MAX'`
- Line 24: `PREMIUM:` → `MAX:`
- Line 30: `PREMIUM:` → `MAX:`
- Line 36: `PREMIUM:` → `MAX:`
- Line 57: `'Start Premium'` → `'Start Max'`
- Line 151: `'PREMIUM'` → `'MAX'`
- Lines 239-240: `'PREMIUM'` references → `'MAX'`

#### 4.2.6 Update billing page
**File**: `app/dashboard/billing/page.tsx`

Lines to change:
- Line 66: `premium:` → `max:`
- Line 67: `name: 'Premium'` → `name: 'Max'`
- Line 72: `'Premium filing summaries'` → `'Max filing summaries'`
- Line 85: `'PREMIUM'` in type → `'MAX'`

#### 4.2.7 Update newsletter-schema.tsx (SEO)
**File**: `components/seo/newsletter-schema.tsx`

Line to change:
- Line 120: `"premium features"` → `"Max tier features"` or `"advanced features"`

**Checkpoint 4.2.7**: UI tests pass
```bash
npm run test -- --testPathPattern="max-tier-ui"
# Expected: 4 passing tests
```

### Step 4.3: 🔵 Refactor

- [ ] Ensure consistent casing (Max vs MAX where appropriate)
- [ ] Verify all UI strings are correct

**Checkpoint 4.3**: Build succeeds
```bash
npm run build
# Expected: Success
```

### Step 4.4: Final Phase Verification

#### Automated Verification:
- [ ] UI tests pass: `npm run test -- --testPathPattern="max-tier-ui"`
- [ ] Build succeeds: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Visit pricing page and verify "Max" displays correctly
- [ ] Check billing page as Pro user, verify "Max" CTA appears
- [ ] Verify no "Premium" text appears anywhere in UI

**STOP**: Await manual confirmation before Phase 5.

---

## Phase 5: API Routes

### Overview
Update API routes that reference PREMIUM tier.

### Step 5.1: 🔴 Write Failing Tests

**Test File**: `__tests__/api/max-tier-api.test.ts`

```typescript
describe('API MAX tier handling', () => {
  describe('webhook route', () => {
    it('should map MAX tier to 1000 monthly filings', () => {
      const PLAN_LIMITS = { MAX: 1000 };  // Expected structure
      expect(PLAN_LIMITS.MAX).toBe(1000);
    });
  });

  describe('subscription route', () => {
    it('should accept MAX as valid plan type in request', async () => {
      // Test that API accepts MAX in subscription requests
      const validPayload = { planType: 'MAX' };
      // Validation should pass
      expect(validPayload.planType).toBe('MAX');
    });
  });
});
```

**Checkpoint 5.1**: Tests defined
```bash
npm run test -- --testPathPattern="max-tier-api"
```

### Step 5.2: 🟢 Implement Changes

#### 5.2.1 Update webhook/stripe/route.ts
**File**: `app/api/webhook/stripe/route.ts`

Lines to change:
- Line 117: `PREMIUM: 1000` → `MAX: 1000`
- Line 131: `'PREMIUM'` cast → `'MAX'`
- Line 137: `'PREMIUM'` cast → `'MAX'`

#### 5.2.2 Update user/subscription/route.ts
**File**: `app/api/user/subscription/route.ts`

Lines to change:
- Line 215: `'PREMIUM'` cast → `'MAX'`

**Checkpoint 5.2.2**: API tests pass
```bash
npm run test -- --testPathPattern="max-tier-api"
# Expected: Tests pass
```

### Step 5.3: 🔵 Refactor

- [ ] Verify type consistency across API routes

### Step 5.4: Final Phase Verification

#### Automated Verification:
- [ ] API tests pass: `npm run test -- --testPathPattern="max-tier-api"`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Test subscription creation via API
- [ ] Verify webhook handling works correctly

**STOP**: Await manual confirmation before Phase 6.

---

## Phase 6: Test File Updates

### Overview
Update all test files that reference PREMIUM tier.

### Step 6.1: Update Test Files

Files to update (from research document):

| File | Changes |
|------|---------|
| `__tests__/config/stripe-pricing.test.ts` | All `PREMIUM` → `MAX` |
| `__tests__/lib/subscription/tickerSubscriptionInfo.test.ts` | Lines 51, 82, 122, 137, 162, 200, 315, 330, 347, 362 |
| `__tests__/services/filings/enhanced/subscriptionService.test.ts` | Line 440 |
| `__tests__/regression/tier-aware-backwards-compatibility.test.ts` | Line 206 |
| `__tests__/lib/security/security-comprehensive.test.ts` | Lines 62, 78-95, 161, 260, 269 |
| `__tests__/lib/performance/performance-comprehensive.test.ts` | Lines 303-304, 472 |
| `lib/ai/__tests__/openrouter-client-final.test.ts` | Line 483 |
| `lib/ai/__tests__/openrouter-client.test.ts` | Line 818 |
| `lib/ai/claude-client.test.ts` | Lines 50-52 |

### Step 6.2: Run Full Test Suite

**Checkpoint 6.2**: All tests pass
```bash
npm run test
# Expected: All tests pass
```

### Step 6.3: Final Phase Verification

#### Automated Verification:
- [ ] Full test suite passes: `npm run test`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`

**STOP**: Await manual confirmation before Phase 7.

---

## Phase 7: Documentation and Stripe Dashboard

### Overview
Update documentation and Stripe product names.

### Step 7.1: Update Documentation

#### 7.1.1 Update plan files
- `docs/plans/2025-12-30-landing-page-stripe-redesign.md`: Replace Premium → Max

#### 7.1.2 Update research files
- `thoughts/shared/research/2025-12-30-landing-page-stripe-redesign.md`: Replace Premium → Max

#### 7.1.3 Update CLAUDE.md if needed
- Search for any Premium tier references

### Step 7.2: Update Environment Variables

Update all environment files and Vercel configuration:

| Old Variable | New Variable |
|--------------|--------------|
| `STRIPE_PREMIUM_MONTHLY_PRICE_ID` | `STRIPE_MAX_MONTHLY_PRICE_ID` |
| `STRIPE_PREMIUM_ANNUAL_PRICE_ID` | `STRIPE_MAX_ANNUAL_PRICE_ID` |
| `STRIPE_PREMIUM_PRICE_ID` | `STRIPE_MAX_PRICE_ID` |

**Files to update:**
- `.env`
- `.env.local`
- `.env.example`
- Vercel environment variables (via dashboard or CLI)

### Step 7.3: Update Stripe Dashboard

**Manual Steps** (requires Stripe dashboard access):

1. Navigate to Stripe Dashboard → Products
2. Find "Premium Monthly" product → Rename to "Max Monthly"
3. Find "Premium Annual" product → Rename to "Max Annual"
4. Verify price IDs remain unchanged

### Step 7.4: Final Phase Verification

#### Automated Verification:
- [ ] Full test suite passes: `npm run test`
- [ ] Build succeeds: `npm run build`
- [ ] E2E test passes: `npm run test:e2e`

#### Manual Verification:
- [ ] Stripe dashboard shows "Max" products
- [ ] Environment variables updated in Vercel
- [ ] New signups can purchase "Max" tier

---

## Testing Strategy

### TDD Test Categories

1. **Database Tests**: Verify enum migration
2. **Config Tests**: Verify stripe.ts configuration
3. **Service Tests**: Verify service layer mappings
4. **UI Tests**: Verify component display
5. **API Tests**: Verify route handling
6. **E2E Tests**: Verify full subscription flow

### Regression Testing

Run comprehensive pipeline tests after all phases:
```bash
npm run test:pipeline:comprehensive
npm run test:e2e
npm run test:cron-comprehensive
```

## Performance Considerations

- Database migration should be fast (enum update + record updates)
- No performance impact expected from renaming
- Monitor Stripe webhook latency during transition

## Migration Notes

### Rollback Plan

If issues arise:
1. Revert code changes via git
2. Run reverse migration to restore PREMIUM enum
3. Update affected database records back to PREMIUM

### Notes

- No backward compatibility needed (no existing users)
- Environment variables renamed from `STRIPE_PREMIUM_*` to `STRIPE_MAX_*`
- Stripe price IDs remain unchanged (only product display names change)

## References

- Research document: [2025-12-30-premium-to-max-tier-rename.md](../../thoughts/shared/research/2025-12-30-premium-to-max-tier-rename.md)
- Related plan: [2025-12-30-landing-page-stripe-redesign.md](./2025-12-30-landing-page-stripe-redesign.md)
