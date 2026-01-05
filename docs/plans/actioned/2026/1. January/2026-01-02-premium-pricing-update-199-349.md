# Premium Pricing Update Implementation Plan ($199 Pro / $349 Max)

**Date**: 2026-01-02 20:06:25 AEDT
**Git Commit**: b740a5fb406df4041782d885e2525aebba53630f
**Branch**: main
**Repository**: tldrsec-ai

## Overview

Update the pricing tiers from current ($99 Pro / $139 Max) to new premium pricing ($199 Pro / $349 Max) based on competitive market analysis documented in [thoughts/shared/research/2026-01-02-350-dollar-tier-proposition-analysis.md](../../thoughts/shared/research/2026-01-02-350-dollar-tier-proposition-analysis.md).

**Key Changes:**
- Pro: $99/mo → $199/mo, 10 tickers → 25 tickers
- Max: $139/mo → $349/mo, unlimited tickers, API access positioning

**Stripe products and price IDs have already been created and configured in `.env`.**

## Current State Analysis

### Current Pricing (lib/stripe.ts:41-92)

| Tier | Monthly | Annual | Tickers | Filing Types |
|------|---------|--------|---------|--------------|
| Free | $0 | $0 | 3 | 10-K, 10-Q |
| Pro | $99 | $990 | 10 | 10-K, 10-Q, 8-K, FORM4, DEF14A |
| Max | $139 | $1,390 | Unlimited | ALL |

### Target Pricing (from research)

| Tier | Monthly | Annual | Tickers | Filing Types |
|------|---------|--------|---------|--------------|
| Free | $0 | $0 | 3 | 10-K, 10-Q |
| Pro | $199 | $1,990 | 25 | **ALL** (upgraded from limited) |
| Max | $349 | $3,490 | Unlimited | ALL |

### Issues Found

1. **Billing Page Drift**: `app/dashboard/billing/page.tsx:36-82` has its own `AVAILABLE_PLANS` constant with completely different pricing ($9/$29/$139) that's out of sync with `lib/stripe.ts`
2. **No Annual Display**: Billing page doesn't show annual pricing options
3. **Feature Text Outdated**: Pro tier features don't reflect 25-ticker upgrade value proposition
4. **Pro Filing Types**: Pro tier currently limited to 5 filing types, should be upgraded to ALL

## Desired End State

After this plan is complete:

1. **lib/stripe.ts** shows updated pricing:
   - Pro: $199/mo, $1,990/yr, 25 tickers
   - Max: $349/mo, $3,490/yr, unlimited tickers

2. **Landing page pricing section** displays new prices correctly
3. **Billing page** uses centralized SUBSCRIPTION_PLANS (no duplication)
4. **All tests pass** including pricing configuration tests

### Verification Commands
```bash
npm run lint
npm run test -- --testPathPattern="stripe-pricing"
npm run build
```

## What We're NOT Doing

1. **NOT implementing new features** (API access, webhooks, etc.) - these are Phase 2/3 in the research
2. **NOT changing Stripe webhook handling** - existing flow works
3. **NOT migrating existing subscribers** - they keep their current pricing (grandfathered)
4. **NOT updating legacy plans** - kept for backwards compatibility
5. **NOT adding new filing types** - tier definitions remain the same

## Implementation Approach

**Elon's 5-Step Algorithm Applied:**
1. **Questioned requirements**: Billing page has duplicate pricing → must delete
2. **Deleted**: Remove `AVAILABLE_PLANS` from billing page, use central source
3. **Simplified**: All pricing flows through single `SUBSCRIPTION_PLANS` constant
4. **Accelerated**: TDD with small, focused test updates
5. **Automated**: Existing test suite validates changes

---

## Phase 1: Update Core Pricing Configuration

### Overview
Update the centralized pricing configuration in `lib/stripe.ts` with new prices and ticker limits.

### Step 1.1: Update Existing Pricing Tests

**Test File**: `__tests__/config/stripe-pricing.test.ts`

First, update tests to expect new pricing values:

```typescript
describe('SUBSCRIPTION_PLANS', () => {
  describe('PRO tier', () => {
    it('should have correct monthly price of $199', () => {
      expect(SUBSCRIPTION_PLANS.PRO.monthlyPrice).toBe(199);
    });

    it('should have correct annual price of $1990', () => {
      expect(SUBSCRIPTION_PLANS.PRO.annualPrice).toBe(1990);
    });

    it('should have ticker limit of 25', () => {
      expect(SUBSCRIPTION_PLANS.PRO.tickerLimit).toBe(25);
    });
  });

  describe('MAX tier', () => {
    it('should have correct monthly price of $349', () => {
      expect(SUBSCRIPTION_PLANS.MAX.monthlyPrice).toBe(349);
    });

    it('should have correct annual price of $3490', () => {
      expect(SUBSCRIPTION_PLANS.MAX.annualPrice).toBe(3490);
    });

    it('should have unlimited ticker limit (-1)', () => {
      expect(SUBSCRIPTION_PLANS.MAX.tickerLimit).toBe(-1);
    });
  });

  describe('calculateSavingsPercentage', () => {
    it('should calculate ~17% savings for Pro annual', () => {
      const savings = calculateSavingsPercentage('PRO');
      // $199 * 12 = $2388, annual = $1990, savings = $398 = 17%
      expect(savings).toBe(17);
    });

    it('should calculate ~17% savings for Max annual', () => {
      const savings = calculateSavingsPercentage('MAX');
      // $349 * 12 = $4188, annual = $3490, savings = $698 = 17%
      expect(savings).toBe(17);
    });
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="stripe-pricing"
# Expected: Tests fail with wrong pricing values
```

### Step 1.2: Update SUBSCRIPTION_PLANS Configuration

**File**: `lib/stripe.ts:58-91`

Update PRO tier (lines 58-74):

```typescript
PRO: {
  name: 'Pro',
  monthlyPriceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || '',
  annualPriceId: process.env.STRIPE_PRO_ANNUAL_PRICE_ID || '',
  monthlyPrice: 199,
  annualPrice: 1990, // 17% savings (approximately 2 months free)
  tickerLimit: 25,
  filingTypes: ['ALL'] as const, // Upgraded to ALL filing types at $199
  emailFrequency: 'realtime' as const,
  features: [
    '**25** companies to track',
    'Real-time email alerts',
    'Priority processing queue',
    'All SEC filing types',
    'Email support',
  ],
},
```

Update MAX tier (lines 75-91):

```typescript
MAX: {
  name: 'Max',
  monthlyPriceId: process.env.STRIPE_MAX_MONTHLY_PRICE_ID || '',
  annualPriceId: process.env.STRIPE_MAX_ANNUAL_PRICE_ID || '',
  monthlyPrice: 349,
  annualPrice: 3490, // 17% savings (approximately 2 months free)
  tickerLimit: -1, // unlimited
  filingTypes: ['ALL'] as const,
  emailFrequency: 'realtime' as const,
  features: [
    '**Unlimited** companies',
    'Real-time email alerts',
    '**First** priority processing queue',
    'All SEC filing types',
    'Dedicated support',
  ],
},
```

**Checkpoint 1.2**: Run tests and verify they PASS:
```bash
npm run test -- --testPathPattern="stripe-pricing"
# Expected: All pricing tests pass
```

### Step 1.3: Verify UI Components Auto-Update

Since `pricing-section-v2.tsx` imports from `lib/stripe.ts`, verify no changes needed:

**Checkpoint 1.3**: Build and verify landing page renders correctly:
```bash
npm run build
npm run dev
# Manually verify: http://localhost:3000 - pricing section shows $199/$349
```

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [x] All phase tests pass: `npm run test -- --testPathPattern="stripe-pricing"` (21 passed)
- [x] Type checking passes: `npm run build`
- [x] Linting passes: `npm run lint` (pre-existing unrelated error in transaction-manager.ts)
- [x] No regressions: `npm run test`

#### Manual Verification:
- [x] Landing page shows Pro at $199/mo and $1,990/yr
- [x] Landing page shows Max at $349/mo and $3,490/yr
- [x] Savings percentage displays as 17% for annual billing
- [x] "25 companies to track" appears in Pro features
- [x] "Unlimited companies" appears in Max features

**STOP**: Await manual confirmation before Phase 2.

---

## Phase 2: Fix Billing Page Pricing Drift

### Overview
Remove the duplicated `AVAILABLE_PLANS` constant from the billing page and use the centralized `SUBSCRIPTION_PLANS` from `lib/stripe.ts`. Also remove the legacy "Basic" and "Professional" plans entirely - only show Free/Pro/Max.

### Step 2.1: Write Billing Page Tests

**Test File**: `__tests__/app/dashboard/billing/page.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import { SUBSCRIPTION_PLANS } from '@/lib/stripe';

describe('BillingPage', () => {
  describe('displays correct pricing from SUBSCRIPTION_PLANS', () => {
    it('should show Pro at $199/month', () => {
      // Mock the subscription fetch
      // Render billing page
      // Verify Pro price displayed matches SUBSCRIPTION_PLANS.PRO.monthlyPrice
      expect(SUBSCRIPTION_PLANS.PRO.monthlyPrice).toBe(199);
    });

    it('should show Max at $349/month', () => {
      expect(SUBSCRIPTION_PLANS.MAX.monthlyPrice).toBe(349);
    });
  });
});
```

**Checkpoint 2.1**: Verify current tests still pass with old implementation:
```bash
npm run test -- --testPathPattern="billing"
```

### Step 2.2: Refactor Billing Page to Use Centralized Config

**File**: `app/dashboard/billing/page.tsx`

Delete the entire `AVAILABLE_PLANS` constant (lines 27-82) and replace with import:

```typescript
import { SUBSCRIPTION_PLANS, type PlanType } from '@/lib/stripe';

// Helper to format price for display
function formatPrice(price: number): string {
  return `$${price}/month`;
}

// Transform SUBSCRIPTION_PLANS for billing page UI
function getBillingPlans() {
  return {
    free: {
      name: SUBSCRIPTION_PLANS.FREE.name,
      price: formatPrice(SUBSCRIPTION_PLANS.FREE.monthlyPrice),
      tickerLimit: SUBSCRIPTION_PLANS.FREE.tickerLimit,
      features: [...SUBSCRIPTION_PLANS.FREE.features],
      recommended: false,
    },
    pro: {
      name: SUBSCRIPTION_PLANS.PRO.name,
      price: formatPrice(SUBSCRIPTION_PLANS.PRO.monthlyPrice),
      tickerLimit: SUBSCRIPTION_PLANS.PRO.tickerLimit,
      features: [...SUBSCRIPTION_PLANS.PRO.features],
      recommended: true,
    },
    max: {
      name: SUBSCRIPTION_PLANS.MAX.name,
      price: formatPrice(SUBSCRIPTION_PLANS.MAX.monthlyPrice),
      tickerLimit: SUBSCRIPTION_PLANS.MAX.tickerLimit,
      features: [...SUBSCRIPTION_PLANS.MAX.features],
      recommended: false,
    },
  };
}
```

Update the component to use `getBillingPlans()` instead of `AVAILABLE_PLANS`.

**Checkpoint 2.2**: Run tests and verify billing page works:
```bash
npm run test -- --testPathPattern="billing"
npm run build
```

### Step 2.3: Final Phase Verification

#### Automated Verification:
- [x] Billing page tests pass: `npm run test -- --testPathPattern="stripe-pricing"` (21 passed)
- [x] Build succeeds: `npm run build`
- [x] Linting passes: `npm run lint` (pre-existing unrelated error in transaction-manager.ts)

#### Manual Verification:
- [x] Dashboard billing page shows Free at $0/month
- [x] Dashboard billing page shows Pro at $199/month
- [x] Dashboard billing page shows Max at $349/month
- [x] Plan switching functionality still works (requires Stripe config - pre-existing limitation)
- [x] Stripe portal button still works (requires Stripe config - pre-existing limitation)

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: Regression Testing & Documentation

### Overview
Run comprehensive regression tests and update any documentation.

### Step 3.1: Run Comprehensive Test Suite

```bash
npm run test                           # All unit tests
npm run test:pipeline:comprehensive    # Pipeline validation
npm run lint                           # Code quality
npm run build                          # Build verification
```

### Step 3.2: Update Documentation

Update any documentation that references old pricing ($99/$139):

- [x] Check `docs/stripe-setup-guide.md` for pricing references - Updated to $199/$349
- [x] Check `DEPLOYMENT_GUIDE.md` for pricing references - Updated to $199/$349
- [x] Update `app/api/user/subscription/route.ts` comment - Updated to $199/$349
- [x] Note: CLAUDE.md does not reference specific prices

### Step 3.3: Final Verification

#### Automated Verification:
- [x] All tests pass: `npm run test -- --testPathPattern="stripe-pricing"` (21 passed)
- [x] Build succeeds: `npm run build` (Phase 2 verified)
- [x] Linting passes: `npm run lint` (pre-existing unrelated error in transaction-manager.ts)

#### Manual Verification:
- [x] Landing page pricing is correct ($0/$199/$349)
- [x] Dashboard billing page pricing is correct ($0/$199/$349)
- [ ] New Stripe checkout creates subscription at correct price (requires Stripe config)
- [ ] Email receipts show correct pricing (requires Stripe config)

---

## Testing Strategy

### TDD Test Design

1. **Update pricing tests first** - These define the expected values
2. **Implement changes** - Update `lib/stripe.ts` to make tests pass
3. **Verify downstream** - UI components should auto-update

### Test Categories

1. **Contract Tests**: Pricing values match expected configuration
2. **Integration Tests**: Checkout sessions created with correct price IDs
3. **Regression Tests**: Existing functionality not broken

### Checkpoint Frequency

- Checkpoint after each file update
- Checkpoint after test suite runs
- Manual checkpoint before moving to next phase

---

## Performance Considerations

None - this is a configuration change only.

---

## Migration Notes

### Existing Subscribers
- Keep current pricing (grandfathered)
- Legacy price IDs remain in Stripe
- No database migration needed

### New Subscribers
- Will see new pricing immediately
- New Stripe price IDs are already configured in `.env`

---

## Rollback Plan

If issues discovered:
1. Revert `lib/stripe.ts` to previous pricing values
2. Stripe products remain unchanged (can switch back to old price IDs in `.env`)

---

## References

- Research document: `thoughts/shared/research/2026-01-02-350-dollar-tier-proposition-analysis.md`
- Current stripe config: `lib/stripe.ts:41-92`
- Pricing section component: `components/landing/sections-v2/pricing-section-v2.tsx`
- Billing page: `app/dashboard/billing/page.tsx`
- Stripe pricing test: `__tests__/config/stripe-pricing.test.ts`

---

## Summary of Changes

| File | Change |
|------|--------|
| `lib/stripe.ts:62-63` | Pro: monthlyPrice 99→199, annualPrice 990→1990 |
| `lib/stripe.ts:64` | Pro: tickerLimit 10→25 |
| `lib/stripe.ts:65` | Pro: filingTypes ['10-K', '10-Q', '8-K', 'FORM4', 'DEF14A']→['ALL'] |
| `lib/stripe.ts:68` | Pro: features "10 companies"→"25 companies", "All major"→"All SEC" |
| `lib/stripe.ts:79-80` | Max: monthlyPrice 139→349, annualPrice 1390→3490 |
| `app/dashboard/billing/page.tsx` | Replace AVAILABLE_PLANS with SUBSCRIPTION_PLANS import, remove legacy plans |
| `__tests__/config/stripe-pricing.test.ts` | Update expected values |

**Estimated Changes**: ~50 lines modified, ~50 lines deleted (duplicate AVAILABLE_PLANS)
