# Project Progress

**Date**: 2026-03-17
**Branch**: worktree-trial-tier
**Status**: Stripe Subscription Sync Fix - implementation complete, pending commit

---

## Current Session

### Stripe Subscription Sync Fix (2026-03-17)

**Branch**: `worktree-trial-tier` | **Plan**: `docs/plans/` (inline plan in conversation)

**Problem**: When test user (wilfred.python.test@gmail.com) is deleted and re-onboarded, their DB `User.subscriptionTier` resets to `FREE` (Trial). But their active Stripe subscription still exists — Stripe won't re-fire `checkout.session.completed`, so `syncUserSubscriptionTier()` never fires. Dashboard, billing, and subscribe pages all show "Trial" instead of the paid plan.

**Root Cause**: `reconcileStripeSubscription()` exists but was gated behind `if (!isNewUser)` in onboarding — re-created users are treated as "new" and skip reconciliation.

**Changes Made**:

1. **`app/(auth)/onboarding/actions.ts`** — Removed `!isNewUser` guard from both `completeOnboarding` (~line 262) and `completeOnboardingBatched` (~line 430). Always call `reconcileStripeSubscription()` after user creation/lookup. Also removed now-unused `isNewUser` variable and pre-transaction existence check in batched function.

2. **`app/api/user/subscription/route.ts`** — Added reconciliation safety net in GET handler. If user has no subscription or has FREE with a `stripeCustomerId`, calls `reconcileStripeSubscription()` and re-fetches. Resolves email from Clerk for Stripe lookup.

3. **`app/dashboard/page.tsx`** — Added reconciliation on page load for FREE users who have a `UserSubscription` record with `stripeCustomerId`. Avoids unnecessary Stripe API calls for genuinely free users.

**Performance guard**: Only reconcile if user has a `stripeCustomerId` (meaning they've interacted with Stripe before). `reconcileStripeSubscription()` already returns early if user has active paid subscription.

**Verification**: 7/7 reconciliation unit tests pass. Lint clean. No new type errors.

---

## Recently Completed Sessions

### Expired Trial Banner + Free→Trial Rename ✅ (2026-03-13)

**Commits**: `19fd628`, `8b8dd6f`

Added expired trial banner for users past trial period. Renamed "Free" tier to "Trial" across all user-facing surfaces with unlimited tickers during trial.

---

### Summary Quality: Form 144, Form 4 Schema, Email Templates ✅ (2026-03-10)

**PR**: [#361](https://github.com/wilfred-py/tldrsec-ai/pull/361)

Improved Form 144 ownership extraction, Form 4 schema refinements, and email template improvements.

---

### Document PR #356 Analysis + UI Celebration Dependencies ✅ (2026-03-08)

**PR**: [#360](https://github.com/wilfred-py/tldrsec-ai/pull/360)

Documented summary quality analysis from PR #356 and added UI celebration dependencies (confetti, etc.).

---

### Onboarding & Tutorial Flow Overhaul ✅ (2026-03-02 → 2026-03-05)

**PR**: [#358](https://github.com/wilfred-py/tldrsec-ai/pull/358) | **Plan**: `docs/plans/2026-03-02-onboarding-tutorial-flow-overhaul.md`

Overhauled onboarding → tutorial experience: unskippable flow, Clearbit company logos with letter-avatar fallback, SVG spotlight tutorial, cached summary delivery (composite ranking), confetti enhancement, animated transition screen. 7 tasks completed.

**Key files**: `components/onboarding/tutorial-guide.tsx`, `components/ui/company-logo.tsx`, `components/onboarding/onboarding-transition.tsx`, `lib/onboarding/cached-summary-delivery.ts`

---

### Pipeline Throughput & Worker Cleanup ✅ (2026-03-02)

**PR**: [#357](https://github.com/wilfred-py/tldrsec-ai/pull/357) | **Plan**: `docs/plans/2026-03-02-pipeline-throughput-and-worker-cleanup.md`

Maximized summaries per cron run: dead code removal, DEBUG_MODE logging gate, time-budgeted summarize loop (60s buffer, max 10 iterations). 21 new tests, deployed to Cloudflare (v2.5.0-stable).

---

### Update Free Tier Pricing Card CTA ✅ (2026-02-25)

**PR**: [#355](https://github.com/wilfred-py/tldrsec-ai/pull/355)

Updated free tier pricing card CTA text and removed redundant copy on landing page.

---

### Fix Stripe Duplicate Subscriptions & Upgrade/Downgrade Flow ✅ (2026-02-24)

**Root Causes**: (1) POST handler only checked `isActive` in DB, not Stripe source of truth. (2) `userId` mismatch. (3) Upgrades returned 400 instead of modifying existing sub. (4) Downgrade hardcoded `'monthly'`.

**Files**: `lib/stripe/index.ts`, `app/api/webhook/stripe/route.ts`, `app/api/user/subscription/route.ts`, `app/dashboard/page.tsx`, `app/subscribe/page.tsx`

---

### Hide Nav Links on Sign-In/Sign-Up Pages ✅ (2026-02-25)

**PR**: [#354](https://github.com/wilfred-py/tldrsec-ai/pull/354)

---

### Fix Subscription State Not Updating + Dashboard/Subscribe UI ✅ (2026-02-24)

**PR**: [#352](https://github.com/wilfred-py/tldrsec-ai/pull/352)

Added `syncUserSubscriptionTier()` to all Stripe webhook handlers, checkout session verification fallback in dashboard, trial banner prop passing, subscribe page UI polish.

---

### Fix Subscribe Page Bugs + Downgrade Support ✅ (2026-02-20)

Fixed: (1) Plan shows as Pro after aborting checkout. (2) Back button navigated to Stripe URL. (3) No downgrade path.

---

### Summary Quality Fixes: Form 4 + Validation Wrapper + Dedup Guard ✅ (2026-02-18 → 2026-02-19)

**Plan**: `docs/plans/2026-02-18-summary-quality-fixes.md`

Phase 1: Expanded Form 4 to 7 classification buckets (78 new tests). Phase 2: Wired `summarizeFilingWithValidation()` into production pipeline. Phase 3: Dedup guard to prevent duplicate emails on job retry.

---

## Archived Sessions (See TIMELINE.md for Full Details)

For complete technical details of projects older than 30 days, see the weekly archive files in `.claude/history/`:
- **February 2026**: Subscription UX redesign, skeleton enhancements, trial migration, preference sync, and more
- **January 2026**: BAC 424B2 investigation, Stripe integration fixes, Pipeline stall recovery, Unified subscription tiers
- **December 2025**: 5 weekly archives with 100+ completed projects
- **November 2025**: 4 weekly archives
- **October 2025**: 2 weekly archives

---

*Last Updated: 2026-03-17 (Stripe subscription sync fix - worktree-trial-tier)*
*Completed projects older than 30 days are archived to .claude/history/ - See TIMELINE.md for complete historical context*
