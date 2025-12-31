---
date: 2025-12-31T22:46:44+11:00
researcher: Claude
git_commit: 935435fc98f14b51ae841b8574b1146761fee6e5
branch: feature/gmail-inbox-hero-improvements
repository: tldrsec-ai
topic: "Stripe Subscriptions and Landing Page Pricing Integration"
tags: [research, stripe, subscriptions, pricing, landing-page, payments]
status: complete
last_updated: 2025-12-31
last_updated_by: Claude
---

# Research: Stripe Subscriptions and Landing Page Pricing Integration

**Date**: 2025-12-31T22:46:44 AEDT
**Researcher**: Claude
**Git Commit**: 935435fc98f14b51ae841b8574b1146761fee6e5
**Branch**: feature/gmail-inbox-hero-improvements
**Repository**: tldrsec-ai

## Research Question
Is creating Stripe subscriptions required, and would it integrate well with the pricing section on the landing page?

## Summary

**Yes, creating Stripe subscriptions is necessary for monetization, and your codebase already has comprehensive Stripe integration infrastructure in place.** The existing implementation includes:

1. **Full Stripe SDK integration** with checkout sessions, webhooks, and billing portal
2. **Three-tier pricing model** (Free, Pro $99/mo, Max $139/mo) defined in code
3. **Landing page pricing section** with monthly/annual billing toggle
4. **Database schema** for subscription tracking
5. **Webhook handlers** for subscription lifecycle events

However, there's a **price discrepancy** between the pricing section UI ($15/$40) and the Stripe configuration ($99/$139) that needs attention.

## Detailed Findings

### Current Stripe Infrastructure Status

The codebase has a mature Stripe integration that is **ready for production use** once environment variables are configured:

| Component | Status | Location |
|-----------|--------|----------|
| Stripe SDK | Configured | [lib/stripe.ts](lib/stripe.ts) |
| Webhook Handler | Implemented | [app/api/webhook/stripe/route.ts](app/api/webhook/stripe/route.ts) |
| Checkout API | Implemented | [app/api/user/subscription/route.ts](app/api/user/subscription/route.ts) |
| Billing Portal | Implemented | [app/api/billing/portal/route.ts](app/api/billing/portal/route.ts) |
| Database Schema | Ready | [prisma/schema.prisma](prisma/schema.prisma) |
| React Hook | Available | [hooks/use-subscription.ts](hooks/use-subscription.ts) |

### Pricing Tiers Configuration

**Stripe Configuration** ([lib/stripe.ts:41-93](lib/stripe.ts#L41-L93)):
```
FREE:  $0/month,    $0/year     - 3 tickers, 10-K/10-Q only
PRO:   $99/month,   $990/year   - 10 tickers, all filing types
MAX:   $139/month,  $1390/year  - Unlimited tickers, all filing types
```

**Landing Page UI** ([components/landing/sections-v2/pricing-section-v2.tsx:22-72](components/landing/sections-v2/pricing-section-v2.tsx#L22-L72)):
```
Free: $0/month,   $0/year
Pro:  $15/month,  $150/year
Max:  $40/month,  $400/year
```

### Price Discrepancy Analysis

The V2 pricing section component uses **hardcoded values** that differ significantly from the Stripe configuration:

| Plan | UI Price | Stripe Price | Difference |
|------|----------|--------------|------------|
| Pro | $15/mo | $99/mo | 6.6x lower |
| Max | $40/mo | $139/mo | 3.5x lower |

This suggests either:
- The UI needs updating to match Stripe pricing
- The lower UI prices are intentional for testing/marketing
- The V1 pricing section (which imports from `lib/stripe.ts`) should be used instead

### Landing Page Integration Architecture

**Current Flow**:
1. User visits landing page → Pricing section displayed
2. User clicks CTA → Redirected to `/onboarding?plan=pro&interval=monthly`
3. Onboarding flow creates Stripe checkout session via `/api/user/subscription`
4. User completes checkout → Webhook updates database
5. User gains access to paid features

**CTA Destinations**:
- Free: `/onboarding`
- Pro: `/onboarding?plan=pro`
- Max: `/onboarding?plan=max`

### Environment Variables Required

To enable Stripe subscriptions, you need to create these in your Stripe dashboard and add to environment:

```bash
STRIPE_SECRET_KEY=sk_live_...              # From Stripe Dashboard > API Keys
STRIPE_WEBHOOK_SECRET=whsec_...            # From Stripe Dashboard > Webhooks
STRIPE_PRO_MONTHLY_PRICE_ID=price_...      # Create in Stripe Products
STRIPE_PRO_ANNUAL_PRICE_ID=price_...       # Create in Stripe Products
STRIPE_MAX_MONTHLY_PRICE_ID=price_...      # Create in Stripe Products
STRIPE_MAX_ANNUAL_PRICE_ID=price_...       # Create in Stripe Products
```

### What You Need to Create in Stripe Dashboard

Based on your screenshot showing the "Create a subscription" page, here's what to configure:

1. **Products** (Stripe Dashboard > Products):
   - Create "Pro" product with two prices: Monthly ($99) and Annual ($990)
   - Create "Max" product with two prices: Monthly ($139) and Annual ($1390)

2. **Webhook Endpoint** (Stripe Dashboard > Developers > Webhooks):
   - URL: `https://tldrsec.app/api/webhook/stripe`
   - Events to listen for:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`

3. **Customer Portal** (Stripe Dashboard > Settings > Billing > Customer Portal):
   - Enable for self-service subscription management
   - Configure allowed actions (cancel, update payment method, etc.)

### Database Integration

The Prisma schema already includes subscription tracking ([prisma/schema.prisma](prisma/schema.prisma)):

```prisma
model UserSubscription {
  id                   String   @id @default(uuid())
  userId               String   @unique
  planType             PlanType @default(BASIC)
  isActive             Boolean  @default(true)
  currentPeriodStart   DateTime
  currentPeriodEnd     DateTime
  cancelAtPeriodEnd    Boolean  @default(false)
  stripeCustomerId     String?  @unique
  stripeSubscriptionId String?  @unique
  stripePriceId        String?
  // ...
}
```

## Code References

**Core Stripe Integration:**
- [lib/stripe.ts](lib/stripe.ts) - Stripe client, pricing config, helper functions
- [app/api/webhook/stripe/route.ts](app/api/webhook/stripe/route.ts) - Webhook event handler
- [app/api/user/subscription/route.ts](app/api/user/subscription/route.ts) - Checkout session creation
- [app/api/billing/portal/route.ts](app/api/billing/portal/route.ts) - Billing portal access

**UI Components:**
- [components/landing/sections-v2/pricing-section-v2.tsx](components/landing/sections-v2/pricing-section-v2.tsx) - Current pricing display (hardcoded prices)
- [components/landing/sections/pricing-section.tsx](components/landing/sections/pricing-section.tsx) - Alternative pricing (uses Stripe config)
- [components/billing/subscription-plans.tsx](components/billing/subscription-plans.tsx) - Subscription plans component
- [app/dashboard/billing/page.tsx](app/dashboard/billing/page.tsx) - Billing dashboard

**Hooks & State:**
- [hooks/use-subscription.ts](hooks/use-subscription.ts) - React hook for subscription management

**Documentation:**
- [docs/stripe-setup-guide.md](docs/stripe-setup-guide.md) - Comprehensive setup guide

## Architecture Documentation

### Payment Flow

```
Landing Page → Pricing Section → CTA Click
                                    ↓
                              /onboarding
                                    ↓
                         Select Plan → Checkout Button
                                    ↓
                    POST /api/user/subscription
                                    ↓
                    createCheckoutSession() in lib/stripe.ts
                                    ↓
                         Redirect to Stripe Checkout
                                    ↓
                         User Completes Payment
                                    ↓
                    Stripe sends webhook to /api/webhook/stripe
                                    ↓
                         Database Updated
                                    ↓
                         User Gains Access
```

### Feature Flag Control

Landing page version controlled by environment variable:
- `NEXT_PUBLIC_LANDING_V2_ENABLED=true` → Uses `PricingSectionV2` (hardcoded $15/$40)
- `NEXT_PUBLIC_LANDING_V2_ENABLED=false` → Uses V1 pricing (from Stripe config $99/$139)

## Open Questions

1. **Price Alignment**: Should the V2 pricing section use the prices from `lib/stripe.ts` instead of hardcoded values?
2. **Free Trial**: The CTAs say "Start Free Trial" but free trial configuration isn't visible in the current setup - should trial days be added to Stripe products?
3. **Legacy Plans**: The schema supports legacy plans (BASIC, PROFESSIONAL, MAX_LEGACY) - are there existing subscribers on these plans that need migration consideration?
