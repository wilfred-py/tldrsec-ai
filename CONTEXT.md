# Context

Domain glossary for tldrsec-ai. The architecture review process ([process/improve-codebase-architecture.md](process/improve-codebase-architecture.md)) reads this file to name modules in the project's own vocabulary rather than generic abstractions.

This file is **lazily populated**. The autonomous review routine adds terms here as it names deepened modules. Hand-edit freely — the routine respects existing entries.

## Format

Each term is a short heading + one paragraph. Cross-link with `[term]` references. Keep entries tight: a term earns a place here when it shows up in module names, function names, or test descriptions.

## Terms

<!-- Seed entries — replace as the routine populates real domain terms. -->

### Filing
A document filed with the SEC by a public company or insider (10-K, 10-Q, 8-K, Form 4, etc.). The atomic unit of everything tldrsec-ai ingests, summarizes, and emails about.

### Summary
A short, AI-generated digest of one Filing, tuned for retail-investor scanning. The user-facing artifact.

### Subscription
A user's saved interest in a [Filing] type or ticker. Drives which [Summary] payloads they receive in their email.

### Onboarding
The first-run flow that turns a new signup into an engaged subscriber: ticker selection, preview email, account creation, first cached [Summary] delivery.

### X Sentiment
An enrichment of a [Summary] that captures public discussion on X (Twitter) about the ticker over a 7-day window. Direction (bullish/bearish/mixed/neutral/no_signal), shift, confidence, and citation-backed claims. Gated by form importance + a large-cap allowlist (S&P 500) to keep cost and pump-and-dump risk bounded. Runs only for paid-tier callers via the enrichment gate.

### Lifetime Seat
A user who claimed one of the first 25 lifetime seats via a one-time $499 payment. Entitled to all MAX-tier features (see `lib/stripe/plans.ts`) forever, with no recurring subscription. Modeled as a `User.foundingMember: Boolean` flag rather than a new `SubscriptionTier` value, since the entitlement set is identical to MAX. Purchased via a one-time Stripe `Price` (env: `STRIPE_FOUNDING_LIFETIME_PRICE_ID`) under the existing MAX `Product`, not a recurring subscription. Not to be confused with [Subscription] (watchlist interest) or `UserSubscription` (Stripe-side recurring plan record, which Lifetime Seat holders do not have).
