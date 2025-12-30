---
date: 2025-12-30T14:30:45+11:00
researcher: Claude
git_commit: c1fc3bf994c98bd6cd2c79c9b3440f9b0e2cfc7f
branch: main
repository: tldrsec-ai
topic: "Stripe Button Integration and Landing Page Redesign Research"
tags: [research, codebase, stripe, landing-page, pricing, waitlist]
status: complete
last_updated: 2025-12-30
last_updated_by: Claude
---

# Research: Stripe Button Integration and Landing Page Redesign

**Date**: 2025-12-30T14:30:45+11:00
**Researcher**: Claude
**Git Commit**: c1fc3bf994c98bd6cd2c79c9b3440f9b0e2cfc7f
**Branch**: main
**Repository**: tldrsec-ai

## Research Question

User wants to:
1. Integrate a Stripe button for payments
2. Replace the current waitlist landing page with a design similar to their Replit mockup
3. The mockup shows a full marketing page with hero, features, pricing, and CTA sections

## Summary

The codebase has a comprehensive Stripe integration already implemented with checkout sessions, webhooks, and billing portal. The current landing page is a minimal waitlist registration page. All components needed to build the new landing page exist in the codebase - they just need to be composed differently to match the Replit mockup design.

## Replit Mockup Analysis

The mockup at `https://e18d0e66-5db7-4d7c-8a41-e918cda39187-00-7m4erlv06bi1.janeway.replit.dev/` displays:

### Hero Section
- Badge: "AI-Powered SEC Intelligence"
- Headline: "SEC Filings, Simplified"
- Subheadline describing the value proposition
- Two CTAs: "Start Free Trial" and "View Pricing" buttons
- Social proof: "2,500+ investors", "99.9% uptime", "<5 min delivery"
- Mock filing card showing Apple Inc. 10-K with key highlights

### Features Section ("Built for Modern Investors")
- 6-column grid of feature cards:
  - "300+ Pages -> 2 Minutes"
  - "Real-Time Monitoring"
  - "Smart Notifications"
  - "Filing-Type Analysis"
  - "Investment-Grade Quality"
  - "Save 10+ Hours Weekly"

### Pricing Section ("Simple, Transparent Pricing")
- 3 tiers:
  - **Free**: $0/forever, 3 tickers, weekly digest, basic features
  - **Pro** (Most Popular): $15/month, 10 tickers, real-time alerts, all filing types
  - **Premium**: $40/month, unlimited, API access, team collaboration

### Final CTA Section
- "Start Monitoring SEC Filings Today"
- Email input with "Join Waitlist" button
- "No credit card required - Start with 3 free tickers"

### Footer
- Simple footer with copyright

## Current Landing Page Implementation

### Main Entry Point
- **File**: [app/page.tsx](app/page.tsx)
- **Current behavior**: Renders only `FocusedInvestorHero` component with waitlist counter data
- **Counter logic**: Fetches subscriber count from `newsletter_subscribers` table, adds seed value (147), calculates animation gap (20)

### Current Hero Component
- **File**: [components/landing/focused-investor-hero.tsx](components/landing/focused-investor-hero.tsx)
- **Content**:
  - Headline: "Stop spending 10+ hours a week reading SEC filings"
  - Subheadline about portfolio summaries
  - WaitlistForm component
  - WaitlistCounter component

### Waitlist Form
- **File**: [components/waitlist/waitlist-form.tsx](components/waitlist/waitlist-form.tsx)
- **Features**: Email input, loading states, success/already-subscribed states, analytics tracking
- **API endpoint**: `/api/newsletter/subscribe`

## Existing Stripe Integration

### Core Configuration
- **File**: [lib/stripe.ts](lib/stripe.ts)
- **Stripe SDK**: Version 18.4.0
- **API Version**: 2024-12-18.acacia
- **Plan tiers defined**: BASIC, PROFESSIONAL, PREMIUM

### Environment Variables Required
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_BASIC_PRICE_ID`
- `STRIPE_PROFESSIONAL_PRICE_ID`
- `STRIPE_PREMIUM_PRICE_ID`

### Key Functions Available
- `createCheckoutSession()` - Creates Stripe checkout session
- `createBillingPortalSession()` - Opens billing management portal
- `createCustomer()` - Creates Stripe customer
- `getSubscription()` - Retrieves subscription details
- `cancelSubscription()` - Cancels subscription
- `validateWebhookSignature()` - Verifies webhook signatures

### API Routes
- **Webhook**: [app/api/webhook/stripe/route.ts](app/api/webhook/stripe/route.ts)
  - Handles: `checkout.session.completed`, `customer.subscription.*`, `invoice.*`
- **Subscription management**: [app/api/user/subscription/route.ts](app/api/user/subscription/route.ts)
  - GET, POST, PUT, DELETE for subscription operations
- **Billing portal**: [app/api/billing/portal/route.ts](app/api/billing/portal/route.ts)

### React Hook
- **File**: [hooks/use-subscription.ts](hooks/use-subscription.ts)
- **Functions**: `useSubscription()`, `createCheckout()`, `openBillingPortal()`

## Existing Landing Page Components Available

### Section Components (in `components/landing/`)
| Component | File | Description |
|-----------|------|-------------|
| Hero | `hero-section.tsx` | General hero with gradient text |
| Features | `features-section.tsx` | 4-column feature grid |
| Pricing | `pricing-section.tsx` | 2-tier pricing cards |
| CTA | `cta-section.tsx` | Call-to-action section |
| How It Works | `how-it-works.tsx` | Process explanation |
| Testimonials | `testimonials.tsx` | User testimonials |
| Footer | `professional-footer.tsx` | Site footer |

### Current Pricing Section
- **File**: [components/landing/pricing-section.tsx](components/landing/pricing-section.tsx)
- **Tiers**: Basic ($9/mo) and Premium ($29/mo)
- **Features**: Different from mockup pricing structure
- **CTAs**: Links to `/sign-up` for unauthenticated, `/dashboard` for authenticated

## UI Component Library

### Configuration
- **shadcn/ui config**: [components.json](components.json)
- **Style**: "new-york"
- **Icon library**: lucide-react

### Available Components
- Button with variants (default, destructive, outline, secondary, ghost, link)
- Card (Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter)
- Input, Badge, Alert
- All located in `components/ui/`

### Styling
- **Tailwind config**: [tailwind.config.ts](tailwind.config.ts)
- **Global styles**: [app/globals.css](app/globals.css)
- **Brand colors**: Custom `fintech-*` color palette defined
- **Animations**: framer-motion (v12.23.24) used extensively

## Database Schema (Relevant)

### UserSubscription (Prisma)
```prisma
model UserSubscription {
  stripeCustomerId     String
  stripeSubscriptionId String
  stripePriceId        String
  planType             PlanType  // BASIC, PROFESSIONAL, PREMIUM
  isActive             Boolean
}
```

### Newsletter Subscribers (Supabase)
- Table: `newsletter_subscribers`
- Used for waitlist counter

## Code References

- Main page: `app/page.tsx:76-80`
- Hero component: `components/landing/focused-investor-hero.tsx:14-53`
- Waitlist form: `components/waitlist/waitlist-form.tsx:17-193`
- Pricing section: `components/landing/pricing-section.tsx:9-42`
- Stripe config: `lib/stripe.ts:39-81`
- Checkout function: `lib/stripe.ts:146-181`
- Subscription hook: `hooks/use-subscription.ts`

## Architecture Documentation

### Current Flow
1. User visits `/` -> `app/page.tsx` renders
2. Server-side: Fetches counter data from Supabase
3. Renders `FocusedInvestorHero` with only waitlist form

### Payment Flow (Existing)
1. User clicks pricing CTA -> redirects to `/sign-up`
2. After signup, user can subscribe from dashboard
3. Subscription API creates Stripe checkout session
4. Stripe webhook handles subscription lifecycle

## Key Findings

1. **Stripe is fully integrated** - All payment infrastructure exists
2. **Landing page components exist** - Hero, features, pricing, CTA sections are built
3. **Current page only shows waitlist** - Other sections are commented out or not imported
4. **Pricing tiers differ from mockup** - Current: Basic/Premium, Mockup: Free/Pro/Premium
5. **Animation library ready** - framer-motion for transitions
6. **Color system established** - `fintech-*` custom colors defined

## Open Questions

1. Should the new pricing match mockup ($0/$15/$40) or current ($9/$29)?
2. Are there existing Stripe price IDs for Free/Pro/Premium tiers?
3. Should waitlist signup be removed entirely or kept in a section?
4. Does the filing card preview need real data or is static OK?
