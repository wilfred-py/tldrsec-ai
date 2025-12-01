---
date: 2025-12-01T12:00:00+11:00
researcher: Claude
git_commit: df6aaa3fe8851742107b514a712d06c1fc61669f
branch: feature/email-summarization-improvements
repository: tldrsec-ai
topic: "Stripe Checkout, Subscription Plans, and Subscription Management Implementation"
tags: [research, codebase, stripe, billing, subscriptions, checkout, payments]
status: complete
last_updated: 2025-12-01
last_updated_by: Claude
---

# Research: Stripe Checkout, Subscription Plans, and Subscription Management

**Date**: 2025-12-01T12:00:00+11:00
**Researcher**: Claude
**Git Commit**: df6aaa3fe8851742107b514a712d06c1fc61669f
**Branch**: feature/email-summarization-improvements
**Repository**: tldrsec-ai

## Research Question
Implementation of Stripe checkout, subscription plans, and subscription management in the tldrsec-ai codebase.

## Summary

The codebase implements a complete Stripe-based subscription system with three tiers (BASIC, PROFESSIONAL, PREMIUM) using Stripe Checkout Sessions for payment collection, Webhooks for event processing, and a Customer Portal for self-service management. The system integrates with Clerk authentication, Prisma/PostgreSQL for data persistence, and includes tier-based feature gating with filing usage limits.

## Detailed Findings

### 1. Core Stripe Configuration

**File**: [lib/stripe.ts](lib/stripe.ts)

The Stripe integration is centralized in a single configuration file that provides:

- **Stripe SDK Initialization** (lines 24-33): Uses Stripe v18.4.0 with API version `2024-12-18.acacia`, 3 max network retries, and 10-second timeout
- **Environment Variables Required**:
  - `STRIPE_SECRET_KEY` - API secret key
  - `STRIPE_WEBHOOK_SECRET` - Webhook signature validation
  - `STRIPE_BASIC_PRICE_ID` - Price ID for Basic plan
  - `STRIPE_PROFESSIONAL_PRICE_ID` - Price ID for Professional plan
  - `STRIPE_PREMIUM_PRICE_ID` - Price ID for Premium plan

**Subscription Plans Configuration** (lines 39-81):
```
BASIC:      $9/month,  50 filings,  balanced optimization (85% token reduction)
PROFESSIONAL: $29/month, 200 filings, conservative optimization (67% token reduction)
PREMIUM:    $99/month, 1000 filings, minimal optimization (55% token reduction)
```

**Exported Functions**:
- `createCheckoutSession()` - Creates Stripe checkout session for new subscriptions
- `createBillingPortalSession()` - Creates customer self-service portal session
- `createCustomer()` / `getCustomer()` - Customer CRUD operations
- `getSubscription()` / `updateSubscription()` / `cancelSubscription()` - Subscription management
- `validateWebhookSignature()` - Webhook signature verification
- `handleStripeError()` - Standardized error handling
- `isStripeEnabled()` - Feature flag for Stripe availability

### 2. Database Models

**File**: [prisma/schema.prisma](prisma/schema.prisma)

**UserSubscription Model** (lines 310-326):
```prisma
model UserSubscription {
  id                   String   @id @default(uuid())
  userId               String   @unique
  planType             PlanType @default(BASIC)
  isActive             Boolean  @default(true)
  currentPeriodStart   DateTime @default(now())
  currentPeriodEnd     DateTime
  cancelAtPeriodEnd    Boolean  @default(false)
  stripeCustomerId     String?  @unique
  stripeSubscriptionId String?  @unique
  stripePriceId        String?
  user                 User     @relation(...)
}
```

**PlanType Enum** (lines 724-728):
```prisma
enum PlanType {
  BASIC
  PROFESSIONAL
  PREMIUM
}
```

**SubscriptionTier Enum** (lines 715-722):
```prisma
enum SubscriptionTier {
  FREE
  PROFESSIONAL
  ENTERPRISE
  INSTITUTION
  HOBBY
  PRO
}
```

**Supporting Models**:
- `UsagePeriod` (lines 349-364): Tracks billing period filing limits and usage
- `FilingUsage` (lines 328-347): Records individual filing processing with tier and cost tracking
- `TierProcessingMetrics` (lines 510-533): Aggregated tier-level processing metrics
- `TierProcessingExecution` (lines 535-562): Individual tier processing execution records

### 3. Checkout Flow

**API Route**: [app/api/user/subscription/route.ts](app/api/user/subscription/route.ts)

**GET /api/user/subscription** (lines 17-100):
- Authenticates user via Clerk
- Retrieves `UserSubscription` record from database
- Fetches current `UsagePeriod` for filing limits
- Returns subscription status, plan type, period dates, and usage limits

**POST /api/user/subscription** (lines 106-235):
1. Validates authenticated user
2. Retrieves user info from database
3. Checks for existing active subscription (returns 409 if exists)
4. Creates or retrieves Stripe customer
5. Creates Stripe checkout session with:
   - Subscription mode
   - Price ID from request
   - Success/cancel URLs pointing to `/dashboard/billing`
   - User metadata (userId, planType)
   - Promotion codes enabled
   - Billing address collection required
6. Upserts `UserSubscription` record with `isActive: false` (activated by webhook)
7. Returns checkout URL and session ID

**Checkout Session Configuration** (lines 163-178):
- Mode: `subscription`
- Promotion codes: enabled
- Billing address: required
- Customer update: auto-updates address if existing customer

### 4. Webhook Event Processing

**API Route**: [app/api/webhook/stripe/route.ts](app/api/webhook/stripe/route.ts)

**POST /api/webhook/stripe** (lines 14-77):
- Validates webhook signature using `stripe-signature` header
- Routes events to specific handlers

**Handled Events**:

1. **checkout.session.completed** (lines 80-147):
   - Extracts userId and planType from session metadata
   - Updates `UserSubscription.stripeSubscriptionId` and sets `isActive: true`
   - Creates initial `UsagePeriod` with plan-specific filing limit

2. **customer.subscription.created** (lines 149-184):
   - Finds user by `stripeCustomerId`
   - Updates subscription with Stripe data (period dates, cancel status)

3. **customer.subscription.updated** (lines 186-218):
   - Finds user by `stripeSubscriptionId`
   - Updates period dates, active status, cancel flags

4. **customer.subscription.deleted** (lines 220-247):
   - Sets `isActive: false` and clears cancel flag

5. **invoice.payment_succeeded** (lines 249-281):
   - Ensures subscription remains active after successful payment

6. **invoice.payment_failed** (lines 283-305):
   - Logs payment failure (no automatic deactivation implemented)

### 5. Billing Portal

**API Route**: [app/api/billing/portal/route.ts](app/api/billing/portal/route.ts)

**POST /api/billing/portal** (lines 17-67):
1. Authenticates user via Clerk
2. Retrieves `stripeCustomerId` from `UserSubscription`
3. Creates Stripe billing portal session
4. Returns portal URL for redirect

Portal returns users to `/dashboard/billing` after management.

### 6. Client-Side Hook

**Hook**: [hooks/use-subscription.ts](hooks/use-subscription.ts)

The `useSubscription()` hook provides React components with:

**State**:
- `subscription: SubscriptionData | null` - Current subscription info
- `loading: boolean` - Loading state
- `error: string | null` - Error messages

**Methods**:
- `refetch()` - Refresh subscription data
- `createCheckout(planType, priceId)` - Initiates checkout flow, returns checkout URL
- `openBillingPortal()` - Redirects to Stripe customer portal

**SubscriptionData Interface** (lines 11-24):
```typescript
interface SubscriptionData {
  planType: string;
  isActive: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  limits: {
    monthlyFilings: number;
    usedFilings: number;
    remainingFilings: number;
  };
}
```

### 7. UI Components

**Plan Selection**: [components/billing/subscription-plans.tsx](components/billing/subscription-plans.tsx)
- Displays three plan cards in a grid
- Shows pricing ($9/$29/$99), features, and filing limits
- Highlights "PROFESSIONAL" as recommended
- Marks current plan with green badge
- Handles loading states during checkout

**Subscription Status Widget**: [components/dashboard/subscription-status.tsx](components/dashboard/subscription-status.tsx)
- Displays current tier, usage metrics, and limits
- Shows progress bars for usage tracking
- Displays subscription period and renewal information

**Billing Dashboard**: [app/dashboard/billing/page.tsx](app/dashboard/billing/page.tsx)
- Main billing management page at `/dashboard/billing`
- Integrates subscription plans, status, and portal access

### 8. Subscription Service Layer

**Service**: [services/filings/enhanced/subscriptionService.ts](services/filings/enhanced/subscriptionService.ts)

**Core Functions**:

- `getUserSubscription(userId)` (lines 112-172): Retrieves or creates user subscription with usage period
- `canProcessFiling(userId)` (lines 177-211): Checks if user can process a filing based on limits
- `getOptimizationLevelForUser(userId)` (lines 216-237): Returns token optimization level based on tier
- `recordFilingUsage()` (lines 242-367): Records filing processing with transaction safety
- `hasFeatureAccess(userId, feature)` (lines 384-397): Checks feature access by tier
- `getSubscriptionAnalytics()` (lines 521-639): Returns usage analytics with optional daily breakdown
- `updateUserSubscription()` (lines 644-691): Updates subscription plan

**Tier-to-Optimization Mapping** (lines 29-36):
```
BASIC → 'balanced' (85% token reduction)
PROFESSIONAL → 'conservative' (67% token reduction)
PREMIUM → 'minimal' (55% token reduction)
```

**SUBSCRIPTION_FEATURES Configuration** (lines 68-107):
Defines per-tier configuration including optimization level, monthly limits, features list, and description.

### 9. Authorization & Validation

**Authorization**: [lib/auth/subscription-auth.ts](lib/auth/subscription-auth.ts)
- `verifySubscriptionOwnership()` - Ensures user owns subscription
- `verifyUsageRecordingPermission()` - Validates usage recording rights
- `verifyUserExists()` - Confirms user exists
- `checkSubscriptionRateLimit()` - Rate limits subscription operations

**Validation**: [lib/validation/subscription-validation.ts](lib/validation/subscription-validation.ts)
- Zod schemas for subscription updates, filing usage, usage periods
- `validateSubscriptionUpdate()`, `validateFilingUsage()`, `validateUsagePeriod()`

## Code References

### Core Implementation
- [lib/stripe.ts:1-285](lib/stripe.ts#L1-L285) - Complete Stripe configuration and utility functions
- [app/api/user/subscription/route.ts:1-235](app/api/user/subscription/route.ts#L1-L235) - Subscription API endpoints
- [app/api/webhook/stripe/route.ts:1-305](app/api/webhook/stripe/route.ts#L1-L305) - Webhook event handlers
- [app/api/billing/portal/route.ts:1-68](app/api/billing/portal/route.ts#L1-L68) - Billing portal endpoint

### Database Layer
- [prisma/schema.prisma:310-326](prisma/schema.prisma#L310-L326) - UserSubscription model
- [prisma/schema.prisma:349-364](prisma/schema.prisma#L349-L364) - UsagePeriod model
- [prisma/schema.prisma:328-347](prisma/schema.prisma#L328-L347) - FilingUsage model
- [prisma/schema.prisma:724-728](prisma/schema.prisma#L724-L728) - PlanType enum

### Client Layer
- [hooks/use-subscription.ts:1-154](hooks/use-subscription.ts#L1-L154) - React subscription hook
- [components/billing/subscription-plans.tsx:1-144](components/billing/subscription-plans.tsx#L1-L144) - Plan selection UI

### Business Logic
- [services/filings/enhanced/subscriptionService.ts:1-691](services/filings/enhanced/subscriptionService.ts#L1-L691) - Full subscription service

## Architecture Documentation

### Data Flow

```
User → UI → useSubscription hook → API Routes → Stripe SDK → Stripe API
                                       ↓
                                  Prisma/DB
                                       ↑
Stripe Webhooks → API Route → Event Handlers → Prisma/DB
```

### Checkout Flow Sequence
1. User clicks "Get Started" on plan card
2. `useSubscription.createCheckout()` calls `POST /api/user/subscription`
3. API creates/retrieves Stripe customer
4. API creates checkout session with metadata
5. API upserts `UserSubscription` (inactive)
6. User redirects to Stripe checkout
7. User completes payment
8. Stripe sends `checkout.session.completed` webhook
9. Webhook handler activates subscription and creates usage period
10. User redirects to `/dashboard/billing?success=true`

### Subscription States
- **No subscription**: Default free tier, `UserSubscription` may not exist
- **Inactive**: `isActive: false`, checkout started but not completed
- **Active**: `isActive: true`, `currentPeriodEnd > now`
- **Canceled**: `cancelAtPeriodEnd: true`, active until period end
- **Expired**: `isActive: false` after period end or immediate cancellation

### Feature Gating
Subscription tier determines:
1. Monthly filing limit (50/200/1000)
2. Token optimization level (balanced/conservative/minimal)
3. Feature access (checked via `hasFeatureAccess()`)

## Historical Context (from thoughts/)

No existing research documents found specifically about Stripe implementation.

## Related Research

- None found in thoughts/shared/research/

## Open Questions

1. **Payment failure handling**: The `invoice.payment_failed` handler logs but doesn't deactivate subscriptions. Is grace period handling implemented elsewhere?
2. **Plan switching**: How is proration handled when users switch between plans mid-cycle?
3. **Free tier**: The codebase references `FREE` tier in `SubscriptionTier` enum but checkout only offers BASIC/PROFESSIONAL/PREMIUM. What's the relationship?
4. **Backup files**: The `backup/stripe-implementation/` directory contains older versions - are these superseded?
