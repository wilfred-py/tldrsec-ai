# Pricing Implementation Research
**Date**: 2025-12-06
**Purpose**: Document existing Stripe integration, pricing UI, and subscription schemas for newsletter-style pricing implementation

---

## Executive Summary

The tldrsec codebase has a functional Stripe integration with 3-tier pricing, but requires significant updates to support the proposed newsletter-style annual pricing model. Key findings:

1. **Stripe SDK**: v18.4.0 with modern API version (2024-12-18.acacia)
2. **Current Pricing**: Basic $9/mo, Professional $29/mo, Premium $99/mo
3. **Dual Tier System**: Conflicting `SubscriptionTier` enum vs `PlanType` enum needs reconciliation
4. **Hardcoded UI**: Pricing section uses hardcoded arrays, not centralized config
5. **Annual Billing**: Not currently implemented - requires Stripe price creation and UI updates

---

## 1. Stripe Configuration Analysis

### File: [lib/stripe.ts](lib/stripe.ts)

**Current Implementation:**
```typescript
export const SUBSCRIPTION_PLANS = {
  BASIC: {
    name: 'Basic',
    priceId: process.env.STRIPE_BASIC_PRICE_ID || '',
    monthlyFilings: 50,
    optimizationLevel: 'balanced',
    features: [
      'Basic filing summaries',
      'Standard AI analysis',
      'Email notifications',
      'Balanced token optimization (85% reduction)',
    ],
  },
  PROFESSIONAL: {
    name: 'Professional',
    priceId: process.env.STRIPE_PROFESSIONAL_PRICE_ID || '',
    monthlyFilings: 200,
    optimizationLevel: 'conservative',
    // ... features
  },
  PREMIUM: {
    name: 'Premium',
    priceId: process.env.STRIPE_PREMIUM_PRICE_ID || '',
    monthlyFilings: 1000,
    optimizationLevel: 'minimal',
    // ... features
  },
} as const;
```

**Observations:**
- Uses environment variables for Stripe price IDs (good practice)
- Pricing structure based on "monthly filings" - needs reconceptualization for newsletter model
- Token optimization levels suggest tiered AI quality - keep this concept

**Required Changes for Newsletter Model:**
- Replace BASIC/PROFESSIONAL/PREMIUM with FREE/INDIVIDUAL/PROFESSIONAL/ADVISOR
- Add `yearlyPriceId` alongside `priceId` for annual billing
- Remove "monthly filings" concept, replace with "ticker limits"
- Add delivery timing differentiation

---

## 2. Database Schema Analysis

### File: [prisma/schema.prisma](prisma/schema.prisma)

**Current Enums (CONFLICT):**
```prisma
enum SubscriptionTier {
  FREE
  PROFESSIONAL
  ENTERPRISE
  INSTITUTION
  HOBBY
  PRO
}

enum PlanType {
  BASIC
  PROFESSIONAL
  PREMIUM
}
```

**Conflict Analysis:**
- `SubscriptionTier` has 6 values including unused ones (HOBBY, PRO from earlier iterations)
- `PlanType` has 3 values matching lib/stripe.ts
- Both are used inconsistently across the codebase

**UserSubscription Model:**
```prisma
model UserSubscription {
  id                   String    @id @default(uuid())
  userId               String    @unique
  user                 User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  planType             PlanType  @default(BASIC)
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

**UsagePeriod Model:**
```prisma
model UsagePeriod {
  id                String    @id @default(uuid())
  userId            String
  periodStart       DateTime
  periodEnd         DateTime
  filingCount       Int       @default(0)
  filingLimit       Int
  planType          PlanType
  resetAt           DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  @@unique([userId, periodStart])
}
```

**Required Schema Changes:**
1. Update `PlanType` enum to: `FREE`, `INDIVIDUAL`, `PROFESSIONAL`, `ADVISOR`
2. Deprecate `SubscriptionTier` or consolidate with `PlanType`
3. Add `billingInterval` field to UserSubscription (`MONTHLY` | `ANNUAL`)
4. Update `UsagePeriod.filingLimit` to `tickerLimit` for clarity

---

## 3. Pricing UI Analysis

### File: [components/landing/pricing-section.tsx](components/landing/pricing-section.tsx)

**Current Implementation (Hardcoded):**
```typescript
const pricingPlans = [
  {
    name: "Basic",
    price: "$9",
    period: "per month",
    features: [
      "Up to 5 ticker subscriptions",
      "Email summaries of SEC filings",
      "10-K, 10-Q, and 8-K coverage",
      "Basic summary format",
      "24-hour delivery window"
    ],
  },e=
  {
    name: "Premium",
    price: "$29",
    period: "per month",
    features: [
      "Unlimited ticker subscriptions",
      "Delivery within minutes of SEC filing",
      "All SEC filing types covered",
      "Enhanced summary format with insights",
      "Real-time delivery (within minutes)"
    ],
    highlighted: true
  }
];
```

**Problems:**
- Hardcoded, doesn't use `SUBSCRIPTION_PLANS` from lib/stripe.ts
- Only shows 2 tiers, billing page shows 3
- Inconsistent with database `PlanType` enum

### File: [app/dashboard/billing/page.tsx](app/dashboard/billing/page.tsx)

**Current Implementation:**
- Shows 3 plans: basic ($9), professional ($29), premium ($99)
- Separate `AVAILABLE_PLANS` object from lib/stripe.ts
- Handles checkout session creation and billing portal access

**Required UI Changes:**
1. Centralize pricing config in lib/stripe.ts
2. Import and use from both landing page and billing page
3. Add toggle for Monthly/Annual pricing display
4. Update feature lists to match newsletter positioning

---

## 4. Stripe Webhook Analysis

### File: [app/api/webhook/stripe/route.ts](app/api/webhook/stripe/route.ts)

**Handled Events:**
- `checkout.session.completed` - Creates UsagePeriod, activates subscription
- `customer.subscription.created` - Links Stripe subscription to user
- `customer.subscription.updated` - Updates subscription details
- `customer.subscription.deleted` - Deactivates subscription
- `invoice.payment_succeeded` - Confirms payment success
- `invoice.payment_failed` - Logs payment failure

**Key Logic in handleCheckoutCompleted:**
```typescript
const planLimits = {
  BASIC: 50,
  PROFESSIONAL: 200,
  PREMIUM: 1000,
};
const filingLimit = planLimits[planType as keyof typeof planLimits] || 50;
```

**Required Webhook Changes:**
1. Update `planLimits` object to match new tier names
2. Change from "filing limits" to "ticker limits"
3. No structural changes needed - Stripe SDK handles annual billing automatically

---

## 5. Implementation Roadmap

### Phase 1: Database Migration
```sql
-- Add new PlanType values
ALTER TYPE "PlanType" RENAME VALUE 'BASIC' TO 'FREE';
ALTER TYPE "PlanType" ADD VALUE 'INDIVIDUAL' AFTER 'FREE';
-- Keep 'PROFESSIONAL'
ALTER TYPE "PlanType" RENAME VALUE 'PREMIUM' TO 'ADVISOR';

-- Add billing interval to UserSubscription
ALTER TABLE "UserSubscription" ADD COLUMN "billingInterval" VARCHAR(10) DEFAULT 'ANNUAL';
```

### Phase 2: Stripe Dashboard Setup
1. Create new products in Stripe Dashboard:
   - Individual: $249/year (no monthly option)
   - Professional: $499/year (no monthly option)
   - Advisor: $1,499/year (no monthly option)
2. Update environment variables:
   - `STRIPE_INDIVIDUAL_PRICE_ID`
   - `STRIPE_PROFESSIONAL_PRICE_ID`
   - `STRIPE_ADVISOR_PRICE_ID`

### Phase 3: Code Updates

**lib/stripe.ts:**
```typescript
export const SUBSCRIPTION_PLANS = {
  FREE: {
    name: 'Free',
    priceId: null, // No Stripe price for free tier
    tickerLimit: 1,
    deliveryTiming: 'delayed', // 24-48 hours
    features: [
      '1 ticker subscription',
      'Weekly digest format',
      '24-48 hour delivery delay',
      'Basic SEC filing coverage',
    ],
  },
  INDIVIDUAL: {
    name: 'Individual',
    priceId: process.env.STRIPE_INDIVIDUAL_PRICE_ID || '',
    price: 249, // Annual only
    tickerLimit: 5,
    deliveryTiming: 'same-day',
    features: [
      'Up to 5 ticker subscriptions',
      'Same-day email delivery',
      'All SEC filing types',
      'Professional analysis format',
    ],
  },
  PROFESSIONAL: {
    name: 'Professional',
    priceId: process.env.STRIPE_PROFESSIONAL_PRICE_ID || '',
    price: 499, // Annual only
    tickerLimit: 15,
    deliveryTiming: 'priority',
    features: [
      'Up to 15 ticker subscriptions',
      'Priority delivery (within hours)',
      'Enhanced AI analysis',
      'Quarterly trend reports',
    ],
  },
  ADVISOR: {
    name: 'Advisor',
    priceId: process.env.STRIPE_ADVISOR_PRICE_ID || '',
    price: 1499, // Annual only
    tickerLimit: Infinity,
    deliveryTiming: 'real-time',
    features: [
      'Unlimited ticker subscriptions',
      'Real-time delivery',
      'API access',
      'White-label reports',
      'Priority support',
    ],
  },
} as const;
```

**components/landing/pricing-section.tsx:**
- Import from lib/stripe.ts
- Add Free tier card
- Show annual pricing with "Save 40% vs monthly" badge (for marketing even if no monthly option)

**app/api/webhook/stripe/route.ts:**
```typescript
const tickerLimits = {
  FREE: 1,
  INDIVIDUAL: 5,
  PROFESSIONAL: 15,
  ADVISOR: 999999, // Effectively unlimited
};
```

---

## 6. Testing Strategy

### Stripe Test Mode
1. Create test products/prices in Stripe Test Mode
2. Use test card numbers (4242 4242 4242 4242)
3. Test webhook events with Stripe CLI: `stripe listen --forward-to localhost:3000/api/webhook/stripe`

### Integration Tests
- `npm run test:e2e` - Verify subscription flow
- Test upgrade/downgrade paths
- Test cancellation and reactivation

### Manual Verification
1. Complete checkout in test mode
2. Verify database records created correctly
3. Verify ticker limit enforcement
4. Test billing portal access

---

## 7. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Data migration breaks existing users | Medium | High | Create migration script with rollback |
| Dual enum confusion | High | Medium | Fully deprecate SubscriptionTier |
| Hardcoded pricing in multiple places | High | Low | Grep codebase for all price references |
| Webhook handler breaks | Low | High | Test extensively in Stripe test mode |

---

## 8. Files Requiring Changes

| File | Change Type | Priority |
|------|-------------|----------|
| prisma/schema.prisma | Schema migration | P0 |
| lib/stripe.ts | Config rewrite | P0 |
| app/api/webhook/stripe/route.ts | Logic update | P0 |
| components/landing/pricing-section.tsx | UI rewrite | P1 |
| app/dashboard/billing/page.tsx | UI update | P1 |
| .env.local / Vercel env vars | New price IDs | P1 |

---

## Appendix: Current vs Proposed Pricing

| Tier | Current | Proposed | Change |
|------|---------|----------|--------|
| Entry | Basic $9/mo | Free $0 | New free tier |
| Starter | - | Individual $249/yr | New tier |
| Pro | Professional $29/mo | Professional $499/yr | Price increase |
| Max | Premium $99/mo | Advisor $1,499/yr | Premium positioning |

**Rationale**: Newsletter model with annual-only pricing reduces churn (typically 30-40% lower than monthly), simplifies billing operations, and positions the product as a serious professional tool rather than a casual subscription.
