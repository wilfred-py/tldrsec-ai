# ADR-0004: Lifetime Seat entitlement and one-time-payment pricing

Date: 2026-05-19
Status: accepted
Supersedes: prior draft of this ADR dated 2026-05-18 (recurring-subscription model)

## Context

tldrsec-ai needed a mechanism to convert a 124-person Supabase `newsletter_subscribers` waitlist (zero paying users) into a paid cohort, while preserving the public pricing page at PRO $199/mo and MAX $349/mo. Multiple alternatives were considered and rejected. See `~/.gstack/projects/wilfred-py-tldrsec-ai/wilf-wilfred-py-beta-pricing-discount-design-20260517-194027.md` for the full design history.

The accepted approach is a **Lifetime Seat** offer: 25 lifetime seats at $499 one-time payment, marketed privately to the existing waitlist. See `CONTEXT.md` for the term definition.

Five design choices in this offer are non-obvious and would be re-litigated by future engineers or the autonomous architecture review routine without this record:

1. How to represent Lifetime Seat status in the data model
2. How to structure the Stripe Price object (recurring vs one-time)
3. How `User.foundingMember` interacts with refunds (revocable vs permanent)
4. Whether to write a `UserSubscription` row for users without a recurring subscription
5. How `Lifetime Seat` relates to the existing `SUBSCRIPTION_PLANS` constant in `lib/stripe/plans.ts`

## Decision

### 1. Entitlement is a boolean flag, not a new tier

`User.foundingMember: Boolean @default(false)` is the canonical identity marker. Lifetime Seat holders are `subscriptionTier: MAX` for all entitlement purposes; the feature set is identical to MAX, only the identity and one-time-payment shape differ.

We explicitly rejected:
- Adding `FOUNDING` or `LIFETIME` to the `SubscriptionTier` and `PlanType` enums. This would force every `if (tier === 'MAX')` callsite to branch on the new value, with no functional benefit.
- A separate `LifetimeMembership` model joined 1:1 to User. Over-modelled for what is functionally a single boolean.

### 2. Stripe `Price` is one-time, not recurring

The Lifetime Seat is purchased via a Stripe Checkout Session with `mode: 'payment'` and a Price object with `recurring: null`. Env var: `STRIPE_FOUNDING_LIFETIME_PRICE_ID`. A dedicated Stripe `Product` named "tldrSEC Lifetime" (id `prod_UYDWpMfEx7LNJF` in live mode) holds the Price; receipts show "tldrSEC Lifetime" as the product name. An earlier draft of this ADR proposed nesting the Price under the existing MAX `Product`, but tldrsec-ai's Stripe layout uses one Product per billing variant (separate Products for "Pro Monthly", "Pro Annual", "Max Monthly", "Max Annual"), so a separate "tldrSEC Lifetime" Product matched that pattern better and produces clearer customer-facing receipt labels.

We deliberately do not add a Lifetime entry to `SUBSCRIPTION_PLANS` in `lib/stripe/plans.ts`. That constant exists to describe publicly-marketable recurring plans; Lifetime Seat is a one-off cohort that doesn't appear on the public pricing page.

### 3. `User.foundingMember` is revocable on refund (not write-once-true)

The 30-day unconditional refund guarantee requires that refund reverses entitlement. A prior version of this ADR locked `foundingMember` as write-once-true; that was correct for recurring subscriptions but incorrect for one-time payments where the refund must atomically revoke MAX access.

When Stripe fires `charge.refunded` for a Lifetime Seat payment, a single `prisma.$transaction` writes:
- `User.foundingMember = false`
- `User.subscriptionTier = FREE`
- `UserSubscription.isActive = false`
- `AuditLog` entry

We deliberately rejected adding a `User.wasFoundingMember Boolean` historical flag. Premature, no consumer for it yet.

### 4. Lifetime Seat writes a sentinel `UserSubscription` row

On lifetime payment, the webhook writes a `UserSubscription` row with:
- `planType: MAX`
- `isActive: true`
- `currentPeriodEnd: LIFETIME_NEVER_EXPIRES` (constant `new Date('9999-12-31T00:00:00.000Z')` in `lib/stripe/constants.ts`)
- `stripeSubscriptionId: null` (the field is already nullable; there is no Stripe subscription for a one-time payment)
- `stripePriceId: STRIPE_FOUNDING_LIFETIME_PRICE_ID`
- `cancelAtPeriodEnd: false`

We chose this over "skip the UserSubscription row" because every existing entitlement reader (billing page, cron handlers, `lib/billing/`) queries `UserSubscription`. Writing the row preserves "all paid users have a UserSubscription" as an invariant. The 9999-12-31 sentinel is greppable and named.

### 5. Founding `Price` lives under a dedicated "tldrSEC Lifetime" Stripe `Product`

A new Stripe `Product` (`prod_UYDWpMfEx7LNJF`) holds the $499 one-time Price. `getPlanTypeFromPriceId` in `lib/stripe/index.ts` is extended to map the Lifetime priceId to `'MAX'` so entitlement code paths treat lifetime holders as MAX. `syncSubscriptionFromStripeData` (and the new `handleCheckoutCompleted` `mode === 'payment'` branch) sets `User.foundingMember = true` in the same write that sets `subscriptionTier`. The dedicated Product matches tldrsec-ai's existing pattern of one Stripe Product per billing variant.

## Consequences

**This locks in:**

- `User.foundingMember = true` implies the user paid at the Lifetime Price AND has not been refunded. If refunded, the flag flips back to false. The flag is active-entitlement, not permanent-identity.
- The Lifetime `Price` cannot be deleted from Stripe without orphaning the price-id mapping in `getPlanTypeFromPriceId`. Treat it as permanent infrastructure.
- `getPlanTypeFromPriceId` becomes an enumerated lookup of five priceIds: PRO monthly, PRO annual, MAX monthly, MAX annual, and Lifetime (maps to MAX).
- Reporting that wants to distinguish Lifetime revenue from MAX recurring revenue must query by `stripePriceId` on `UserSubscription` AND/OR by `foundingMember`, not by `planType` alone.
- `customer.subscription.created` webhook event does NOT fire for Lifetime Seat purchases. Lifetime state changes are driven entirely by `checkout.session.completed` (with `mode === 'payment'`) and `charge.refunded`.
- Sentinel `UserSubscription.currentPeriodEnd = 9999-12-31` will appear in any timeseries report ordered by expiration date. Sort logic that assumes "expiration is in the next decade" needs to filter or alias these rows.

**This precludes:**

- Building a public-facing pricing-tier UI that lists "Lifetime" as an option. The offer is private by design.
- Using `SUBSCRIPTION_PLANS` as a single source of truth for "all paid plans". Lifetime lives outside it.
- Auto-renewing Lifetime Seats (there is no subscription to renew). California auto-renewal disclosure law does not apply to Lifetime; it still applies to PRO annual and MAX annual subscriptions if those are ever offered to consumers.
- A "downgrade to monthly" flow for Lifetime Seat holders. They own the lifetime tier permanently unless refunded within 30 days.

**Why this is load-bearing for future reviewers:**

A future review pass would look at the `checkout.session.completed` handler with two branches (`mode === 'subscription'` and `mode === 'payment'`) and naturally want to refactor them into one path. This ADR exists to record that the two paths handle structurally different Stripe events with different field availability. `mode: 'payment'` sessions have NO `session.subscription` field, line items must be fetched separately via `stripe.checkout.sessions.listLineItems()`, and the entitlement write differs in shape (sentinel-end row vs rolling-end row). The split is intentional.

A future review would also see the `9999-12-31` sentinel and want to model it differently (separate enum, nullable column, etc.). The boring approach of "named constant + sentinel value" was chosen explicitly over more elaborate alternatives because every existing entitlement reader already works against `UserSubscription.currentPeriodEnd > now()`, and changing that invariant for one cohort would force changes across many readers.

## Cross-reference: enrichment coverage for the Lifetime Seat cohort

The Lifetime Seat offer copy claims "Enriched summaries with live X search" as one of four features. The implementation that backs this claim is the **x_sentiment** branch in `lib/ai/summarize.ts` (around line 877), not the why-it-matters branch above it. Coverage:

- x_sentiment fires for 10-K, 10-K/A, 10-Q, 10-Q/A, 8-K, 20-F, 40-F, Form 4, 144, SC 13D, DEF 14A, S-1/3/4, F-1/3/4 (see `HIGH_IMPORTANCE_FORMS` in `lib/ai/x-sentiment-eligibility.ts:28`)
- Constrained by the S&P 100 ticker allowlist (`ALLOWLIST_BASE`), extensible via `X_SENTIMENT_ALLOWLIST_EXTRA` env var
- Returns sentiment + label + 500-char context, validated through `validateXSentiment`, sanitized for F3 prompt injection risks

The why-it-matters branch above it (`ENRICHMENT_FORM_TYPES`) was deliberately NOT expanded to cover 10-K/10-Q/Form 4 in PR1.5 because all five existing providers are item-pattern-gated to 8-K and 424B-family forms. Adding form types to the outer Set without first building matching item-pattern providers would be a no-op. Building 10-K/10-Q/Form 4 why-it-matters providers is captured as a separate follow-up if the S&P 100 allowlist coverage proves insufficient for the Founding cohort.
