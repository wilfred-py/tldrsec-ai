# Rename "Free" to "Trial" with Max-Level Features (UI-Only)

**Date**: 2026-03-13
**Branch**: worktree-trial-tier
**Status**: Reviewed — Ready for Implementation
**Reviewed**: 2026-03-13 (16 issues resolved)

## Overview

Rename all user-facing "Free" text to "Trial" and unlock max-level features (unlimited tickers) for trial users. This is a **UI-only rename** — no database migration, no Prisma enum changes. The DB value `FREE` stays as-is.

## Design Decision: UI-Only Rename (No DB Migration)

Keep `FREE` in Prisma enums and database. Display "Trial" in all user-facing surfaces. This avoids a risky PostgreSQL enum migration and keeps backward compatibility with Stripe webhooks, Clerk, and pipeline processing.

---

## Phase 1: Plan Configuration (Central Source of Truth)

### Task 1.1: `lib/stripe/plans.ts`
- [x] Change `FREE.name` from `'Free'` to `'Trial'`
- [x] Change `FREE.tickerLimit` from `3` to `-1` (unlimited, same as MAX)
- [x] Update features array:
  - `'3 companies to track'` → `'**Unlimited** companies'`
  - `'7-day free trial'` → `'7-day trial period'`
  - Add `'**First** priority processing queue'` and `'Dedicated support'` to match MAX

### Task 1.2: `lib/subscription/three-tier-limits.ts`
- [x] Change `FREE: 3` to `FREE: -1` (unlimited)

### Task 1.3: Create shared `UserSubscription` type — `lib/types/subscription.ts`
- [x] Create `lib/types/subscription.ts` with a single `UserSubscription` interface containing all fields:
  - `planType`, `isActive`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `stripeCustomerId?`, `stripeSubscriptionId?`
  - `isTrialing`, `daysRemaining`, `trialEndsAt`, `isGrandfathered` (already returned by `/api/user/subscription` GET)
- [x] Import this type in both `app/subscribe/page.tsx` and `app/dashboard/billing/page.tsx` (replacing local interfaces)

> **Review Note**: The subscription API already returns `isTrialing`, `daysRemaining`, `trialEndsAt`, `isGrandfathered` in all response paths (route.ts lines 66-69, 92-95, 126-129). No API changes needed — just update TypeScript interfaces to consume existing data.

---

## Phase 2: Subscribe Page (`app/subscribe/page.tsx`)

### Task 2.1: Remove FREE card, show only PRO and MAX
- [x] Change `PLAN_ORDER` from `['FREE', 'PRO', 'MAX']` to `['PRO', 'MAX']`
- [x] Change grid from `md:grid-cols-3` to `md:grid-cols-2`
- [x] Update skeleton loading to show 2 cards instead of 3

### Task 2.2: Add trial info banner above grid
- [x] Import shared `UserSubscription` type from `lib/types/subscription.ts`
- [x] Add banner above grid: "You're on a Trial (X days remaining)" for FREE users
- [x] For expired trial users: "Trial Expired — Upgrade to continue"

### Task 2.3: Clean up button types and footers
- [x] Remove `case 'free':` button type (no longer shown)
- [x] Remove "Everything in Free" footer from PRO card
- [x] Keep "Everything in Pro" on MAX card
- [x] Remove downgrade-to-FREE option (paid users cancel from billing page)

---

## Phase 3: Landing Page Pricing

### Task 3.1: `components/landing/sections-v2/pricing-section-v2.tsx`
- [x] Update FREE plan entry: `description` → `'Full access for 7 days'`, `cta` → `'Start Free Trial'`
- [x] Update subheader: `"Start free, upgrade when you're ready"` → `"Start with a free trial, upgrade when you're ready"`

### Task 3.2: `components/landing/pricing-card.tsx`
- [x] Change price display from `"Free" + "forever"` to `"Free"` + `"for 7 days"`
- [x] Change sub-header from `'Basic'` to `'Trial'` for FREE key
- [x] Remove "Everything in Free" footer for PRO card → change to "Everything in Trial"
- [x] Keep "Everything in Pro" on MAX card

### Task 3.3: `components/landing/sections-v2/cta-section-v2.tsx` (NEW)
- [x] Update `'Start with 3 free tickers'` → `'Start with unlimited tickers'` (reflects new unlimited limit)

### Task 3.4: V1 Landing Sections (still active when V2 flag is off)
- [x] `components/landing/sections/cta-section.tsx`:
  - `"Start your free trial today."` → `"Start your trial today."`
  - `"Start Free Trial"` → `"Start Trial"`
  - `"No credit card required. Free plan available."` → `"No credit card required."`
- [x] `components/landing/sections/hero-section.tsx`:
  - `"Start Free Trial"` → `"Start Trial"`
- [x] `components/landing/sections/pricing-section.tsx`:
  - `'Start Free Trial'` → `'Start Trial'`
  - `"Start free and upgrade when you need more."` → `"Start with a trial, upgrade when you need more."`
  - `"14-day free trial"` → `"7-day trial"` (FIX: was incorrect — actual trial is 7 days)
  - `"No credit card required for Free plan."` → `"No credit card required."`
- [x] `components/landing/sections/filing-preview-card.tsx`:
  - `"Start Free Trial"` → `"Start Trial"`

---

## Phase 4: Dashboard Billing Page (`app/dashboard/billing/page.tsx`)

### Task 4.1: Update subscription display
- [x] Import shared `UserSubscription` type from `lib/types/subscription.ts`
- [x] For trial users: show "Trial — X days remaining" instead of "$0/month"
- [x] For grandfathered users: show "Trial" (same display as regular trial users)
- [x] For expired trial users: show "Trial Expired — Upgrade to continue receiving summaries"
- [x] Keep "Upgrade Plan" button for all FREE-tier users

---

## Phase 5: Plan Status Banner (`components/dashboard/plan-status-banner.tsx`)

### Task 5.1: Update banner text
- [x] Change `"free trial"` to `"trial"` in banner text

---

## Phase 6: Additional User-Facing Surfaces (NEW)

### Task 6.1: Settings page — `components/settings/UserProfileSection.tsx`
- [x] Change `<h3>Free Plan</h3>` → `<h3>Trial</h3>` (line 168)

### Task 6.2: Subscription API toast message — `app/api/user/subscription/route.ts`
- [x] Change `'Subscription will be downgraded to Free at the end of the billing period'` → `'Subscription will be downgraded to Trial at the end of the billing period'` (line 525)
- [x] Change `'Free tier does not require checkout'` → `'Trial tier does not require checkout'` (line 194)

### Task 6.3: Email templates — `lib/email/trial-emails.ts`
- [x] `"Your 7-day free trial has started."` → `"Your 7-day trial has started."` (lines 43, 63)
- [x] `"Your free trial ends on..."` → `"Your trial ends on..."` (line 96)
- [x] `"Your 7-day free trial ended on..."` → `"Your 7-day trial ended on..."` (line 141)

---

## Phase 7: Onboarding Fix (CRITICAL — NEW)

### Task 7.1: Fix `app/(auth)/onboarding/onboarding-client.tsx`
- [x] `MAX_TICKERS = THREE_TIER_LIMITS.FREE` (line 26) — when this becomes `-1`, the guard `prev.length < MAX_TICKERS` is always `false`, preventing ANY ticker adds
- [x] Add `isUnlimited` guard (same pattern as `dashboard-client.tsx:358-359`)
- [x] Fix counter text: `"X of ${MAX_TICKERS} tickers selected"` → show `"X tickers selected"` when unlimited
- [x] Add soft cap of ~10-15 tickers in onboarding picker UI only (not server-enforced) to mitigate pipeline cost risk from trial users adding excessive tickers
- [x] Update equity button disable logic (line 559) to respect unlimited

> **Review Note**: Without this fix, no new user can add tickers during onboarding — product-breaking bug.

---

## Phase 8: Processing Queue (No Changes Needed)

- `tier-eligibility.ts`: FREE→HOBBY mapping stays (trial users get lower processing priority than paid)
- `async-filing-queue.ts`: Priority values stay as-is
- Email ordering remains: Max/Pro first (PRO tier), then Trial (HOBBY tier)
- Pipeline cost mitigated by: 7-day trial expiry, 120-min HOBBY frequency, shared summary deduplication, soft onboarding cap

---

## Phase 9: Test Updates

### Task 9.1: Update existing test assertions

| Test File | Changes Needed |
|---|---|
| `__tests__/config/stripe-pricing.test.ts` | `tickerLimit: 3` → `-1`; FIX stale: `filingTypes: ['10-K','10-Q']` → `['ALL']`; FIX stale: `emailFrequency: 'weekly'` → `'realtime'` |
| `__tests__/components/landing/pricing-card.test.tsx` | Update fixture `name: 'Free'` → `'Trial'`; `features: '3 companies to track'` → unlimited; `'Everything in Free'` → `'Everything in Trial'` |
| `__tests__/components/landing/pricing-section-v2.test.tsx` | `toContain('Free')` → `'Trial'`; `getByText('Free')` → price display; `3 companies` → unlimited |
| `__tests__/api/three-tier-limits.test.ts` | **Rewrite** FREE tests: assert unlimited behavior (`limitReached: false` for any count, `unlimited: true`) |
| `__tests__/app/subscribe/page.test.tsx` | **Rewrite** for 2-card + banner layout: remove Free heading assertions, add trial banner assertions, update card count |
| `__tests__/app/dashboard/billing/page.test.tsx` | Update `'3 companies'` → unlimited display; update plan name assertions |
| `__tests__/components/landing/hero-section-v2.test.tsx` | Update `'Start Free Trial'` CTA if changed |
| `__tests__/components/pricing-section-3-tier.test.tsx` | Update `'FREE'` text, `'3 companies'`, `'Start FREE Trial'` |
| `__tests__/integration/direct-checkout-flow.test.ts` | Update mock `tickerLimit: 3` → `-1` |
| `__tests__/e2e/pricing-max-tier.test.ts` | Update `text=Free` locator |

### Task 9.2: Create new test files
- [x] `__tests__/components/dashboard/plan-status-banner.test.tsx` — test banner renders with trial/expired/grandfathered states (9 tests)
- [x] `__tests__/components/settings/user-profile-section.test.tsx` — test "Trial" display in settings (3 tests)

---

## Files to Modify

| File | Change |
|------|--------|
| `lib/stripe/plans.ts` | Rename FREE, unlock features |
| `lib/subscription/three-tier-limits.ts` | FREE limit → -1 |
| `lib/types/subscription.ts` | **NEW** — shared UserSubscription type |
| `app/subscribe/page.tsx` | Remove FREE card, 2-col grid, trial banner, use shared type |
| `components/landing/sections-v2/pricing-section-v2.tsx` | Update FREE plan display |
| `components/landing/pricing-card.tsx` | "Trial" display, "Everything in Trial" |
| `components/landing/sections-v2/cta-section-v2.tsx` | **NEW** — "unlimited tickers" |
| `components/landing/sections/cta-section.tsx` | **NEW** — V1 "trial" text |
| `components/landing/sections/hero-section.tsx` | **NEW** — V1 "trial" CTA |
| `components/landing/sections/pricing-section.tsx` | **NEW** — V1 "trial" + fix 14→7 day |
| `components/landing/sections/filing-preview-card.tsx` | **NEW** — V1 "trial" CTA |
| `app/dashboard/billing/page.tsx` | Show trial days remaining, use shared type |
| `components/dashboard/plan-status-banner.tsx` | "trial" text |
| `components/settings/UserProfileSection.tsx` | **NEW** — "Trial" heading |
| `app/api/user/subscription/route.ts` | **NEW** — toast message text |
| `lib/email/trial-emails.ts` | **NEW** — "trial" in email templates |
| `app/(auth)/onboarding/onboarding-client.tsx` | **CRITICAL NEW** — fix unlimited ticker handling + soft cap |
| Test files (10 existing + 2 new) | Update assertions, rewrite FREE tests |

## What We Do NOT Change

- Prisma schema enums (FREE/PRO/MAX stay)
- Database data (no migration)
- Stripe webhook handlers
- Clerk webhook (still creates users as FREE)
- Trial service logic
- Processing queue ordering
- Validation schemas (FREE stays valid in Zod)
- Subscription API response shape (already returns trial fields)

## Verification

1. `npm run lint` — no errors
2. `npm run test` — all unit tests pass (including rewritten tests)
3. Visual check: landing page shows "Trial" card with "Start Free Trial" CTA
4. Visual check: subscribe page shows only PRO and MAX with trial banner
5. Visual check: billing page shows "Trial — X days remaining" for trial users
6. Visual check: settings page shows "Trial" not "Free Plan"
7. Visual check: onboarding allows adding tickers (soft capped at ~10-15)
8. Verify trial users can track unlimited companies (tickerLimit = -1)
9. Verify onboarding counter shows "X tickers selected" (no "-1")

## Resolved Decisions

1. **Landing page layout**: Keep 3 cards (Trial + Pro + Max) so visitors see the trial option prominently.
2. **Grandfathered users**: Show as "Trial" (same as regular trial users).
3. **Expired trial**: Show "Trial Expired — Upgrade to continue receiving summaries".

## Review Notes

Reviewed 2026-03-13. 16 issues identified and resolved:

- **Issues 1, 7, 8**: Added 9 missed files (V1 sections, V2 CTA, settings, API route, email templates) to plan scope
- **Issue 2**: Extract shared `UserSubscription` type to `lib/types/subscription.ts` (DRY)
- **Issues 3, 5**: Subscription API already returns trial fields — no API changes needed, just interface updates
- **Issue 4, 11**: Fix 2 pre-existing stale assertions in `stripe-pricing.test.ts` (`filingTypes`, `emailFrequency`)
- **Issue 6**: Fix V1 pricing "14-day" → "7-day" (factual error)
- **Issues 9, 10, 12**: Add 2 new test files (banner, settings); rewrite subscribe tests for 2-card layout; rewrite three-tier-limits tests for unlimited
- **Issues 13, 15**: CRITICAL — fix onboarding `MAX_TICKERS = -1` breaking bug (no tickers can be added)
- **Issue 14**: Add soft cap (~10-15) in onboarding picker to mitigate pipeline cost from unlimited trial tickers

---

## Implementation Log

### Phase 1 — Complete
- `lib/stripe/plans.ts`: Changed FREE.name to 'Trial', tickerLimit to -1, updated features array with unlimited + priority + support
- `lib/subscription/three-tier-limits.ts`: Changed FREE limit from 3 to -1
- `lib/types/subscription.ts`: Created shared UserSubscription interface with all fields including trial state

### Phase 2 — Complete
- `app/subscribe/page.tsx`: Removed FREE from PLAN_ORDER (now PRO/MAX only), 2-col grid, trial banner for FREE users, removed 'free' button type case, MAX-only "Everything in Pro" footer, imported shared UserSubscription type

### Phase 3 — Complete
- `pricing-section-v2.tsx`: Updated FREE plan description/cta, subheader text
- `pricing-card.tsx`: "Free" → "for 7 days", "Basic" → "Trial", "Everything in Free" → "Everything in Trial"
- `cta-section-v2.tsx`: "3 free tickers" → "unlimited tickers"
- V1 sections: cta-section (trial text, no "Free plan available"), hero-section (Start Trial), pricing-section (Start Trial, 7-day trial, no credit card), filing-preview-card (Start Trial)

### Phase 4 — Complete
- `app/dashboard/billing/page.tsx`: Shared UserSubscription type, trial status text ("Trial — X days remaining" or "Trial Expired"), plan name "Trial" for FREE users

### Phase 5 — Complete
- `plan-status-banner.tsx`: "free trial" → "trial"

### Phase 6 — Complete
- `UserProfileSection.tsx`: "Free Plan" → "Trial"
- `subscription/route.ts`: "Free tier" → "Trial tier", "downgraded to Free" → "downgraded to Trial"
- `trial-emails.ts`: "free trial" → "trial" in welcome, reminder, expiration emails

### Phase 7 — Complete (CRITICAL)
- `onboarding-client.tsx`: Added isUnlimited guard, soft cap of 15 tickers for onboarding, dynamic counter text ("X tickers selected" when unlimited), dynamic description text

### Phase 9 — Complete (Tests)
- Updated 8 existing test files: stripe-pricing, pricing-card, pricing-section-v2, three-tier-limits, subscribe/page, billing/page, pricing-section-3-tier, direct-checkout-flow
- Also updated pricing-max-tier e2e test (Free → Trial locator)
- Also updated pricing-section-3-tier component source (was hardcoded, not using SUBSCRIPTION_PLANS)
