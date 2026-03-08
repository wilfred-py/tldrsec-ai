# Project Progress

**Date**: 2026-03-05
**Branch**: worktree-onboarding
**Status**: Onboarding & Tutorial Flow Overhaul - in progress (Tasks 1-7 complete, polishing tutorial conditions)

---

## Current Session

### Onboarding & Tutorial Flow Overhaul (2026-03-02 → in progress)

**Branch**: `worktree-onboarding` | **Plan**: `docs/plans/2026-03-02-onboarding-tutorial-flow-overhaul.md`

**Goal**: Polish the onboarding → tutorial experience with unskippable flow, company logos, animated transitions, confetti, and cached summary delivery.

**Completed Tasks**:

**Task 1: Update Onboarding Flow** ✅ - Changed ticker limit from 5 to 3 (FREE tier), added Clearbit company logos with letter-avatar fallback (`components/ui/company-logo.tsx`), enhanced search with dual sector + API-backed results, made onboarding unskippable.

**Task 2: Brand-Colored Progress Bar** ✅ - Added `variant="brand"` to `components/ui/progress.tsx` with gradient `from-[#0079F2] to-[#8B5CF6]`, defined in `app/globals.css`.

**Task 3: Animated Transition Screen** ✅ - Created `components/onboarding/onboarding-transition.tsx` with Framer Motion text cycling (completion-based, ~2s minimum), replaces toast on success.

**Task 4: Make Tutorial Unskippable** ✅ - Removed skip button and X close from `tutorial-guide.tsx`, removed `hasSeenTutorial` localStorage, kept `tutorialProgress` localStorage for step resume on refresh, tutorial only dismisses after completing all steps.

**Task 5: Cached Summary Delivery** ✅ - Created `lib/onboarding/cached-summary-delivery.ts` (composite ranking: type weight 40% + quality 30% + recency 30%), `app/api/onboarding/deliver-summaries/route.ts` (POST endpoint). Finds top 2 summaries per ticker across all users, sends as digest email. Edge cases handled: no email, zero summaries, email failure.

**Task 6: Confetti Enhancement** ✅ - Increased particles to 200, dismiss delay to 5s in `components/ui/confetti.tsx`.

**Task 7: Wire Everything Together** ✅ - End-to-end flow: onboarding → transition screen → dashboard → tutorial → confetti → cached summaries + welcome email.

**Current polish**:
- Tutorial show condition uses `tutorialCompletedAt` (not ticker count) - confirmed correct
- Made step 1 ticker limit dynamic via `tickerLimit` prop (FREE=3, PRO=25, MAX=unlimited)

**Files Modified**: `app/(auth)/onboarding/onboarding-client.tsx`, `components/onboarding/tutorial-guide.tsx`, `components/onboarding/actions.ts`, `components/dashboard/dashboard-client.tsx`, `components/dashboard/tickers-table/columns.tsx`, `components/ui/progress.tsx`, `components/ui/confetti.tsx`, `app/globals.css`, `__tests__/components/dashboard/dashboard-inline-integration.test.tsx`

**Files Created**: `components/ui/company-logo.tsx`, `components/onboarding/onboarding-transition.tsx`, `lib/onboarding/cached-summary-delivery.ts`, `app/api/onboarding/deliver-summaries/route.ts`, `docs/plans/2026-03-02-onboarding-tutorial-flow-overhaul.md`

---

## Recently Completed Sessions

### Pipeline Throughput & Worker Cleanup ✅ (2026-03-02)

**PR**: [#357](https://github.com/wilfred-py/tldrsec-ai/pull/357) | **Plan**: `docs/plans/2026-03-02-pipeline-throughput-and-worker-cleanup.md`

**Goal**: Maximize summaries per cron run by looping Step 3 (summarize), removing dead code, and gating verbose logging.

**Phase 1: Dead Code Removal** - Removed `handleIntervalSummary`, `handleSummarizeOnly`, `intervalSummary` health tracking, `USE_ASYNC_PROCESSING` and `RATE_LIMIT_STRATEGY` config vars.

**Phase 2: DEBUG_MODE Logging Gate** - Added `debugLog(env, ...args)` helper, threaded `env` through rate limiting functions, converted 8 verbose logs to debug-only.

**Phase 3: Summarize Loop** - Replaced single Step 3 call with time-budgeted `while` loop (60s buffer, max 10 iterations, fresh HMAC per iteration, breaks on 0 jobs).

**Files**: `cloudflare-cron/index.js`, `cloudflare-cron/wrangler.toml`, `wrangler.toml`, tests updated/created.
**Verification**: 21 new tests, deployed to Cloudflare (v2.5.0-stable), HMAC verified (HTTP 202).

---

### Update Free Tier Pricing Card CTA ✅ (2026-02-25)

**PR**: [#355](https://github.com/wilfred-py/tldrsec-ai/pull/355)

Updated free tier pricing card CTA text and removed redundant copy on landing page.

---

### Fix Stripe Duplicate Subscriptions & Upgrade/Downgrade Flow ✅ (2026-02-24)

**Root Causes**: (1) POST handler only checked `isActive` in DB, not Stripe source of truth. (2) `userId` mismatch. (3) Upgrades returned 400 instead of modifying existing sub. (4) Downgrade hardcoded `'monthly'`.

**Files**: `lib/stripe/index.ts`, `app/api/webhook/stripe/route.ts`, `app/api/user/subscription/route.ts`, `app/dashboard/page.tsx`, `app/subscribe/page.tsx`, `scripts/cleanup-duplicate-subscriptions.ts`

---

### Hide Nav Links on Sign-In/Sign-Up Pages ✅ (2026-02-25)

**PR**: [#354](https://github.com/wilfred-py/tldrsec-ai/pull/354)

---

### E2E Pipeline Script Alignment with Production Architecture ✅ (2026-02-24)

Rewrote `scripts/test-e2e-email.ts` to use production 3-phase pipeline code paths. Exported `fetchFilingContentOptimized()` from `fetch-handler.ts`.

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

### Tutorial Overlay Bug Fixes ✅ (2026-02-19)

Read `tutorialCompletedAt` from DB, SVG spotlight cutout replacing box-shadow approach, tooltip z-index fix.

---

### Dashboard & Auth UX Polish ✅ (2026-02-19)

Dashboard skeleton refinement, sign-up page skeleton with MutationObserver, auth nav cleanup, server-side ticker prefetch (1s load), auth redirect for logged-in users.

---

### Worktree Manager + Landing Page Tests ✅ (2026-02-18)

Create-and-open worktree option, 42 auth-aware landing page tests across 5 suites.

---

## Archived Sessions (See TIMELINE.md for Full Details)

For complete technical details of projects older than 30 days, see the weekly archive files in `.claude/history/`:
- **February 2026**: Subscription UX redesign, skeleton enhancements, trial migration, preference sync, and more
- **January 2026**: BAC 424B2 investigation, Stripe integration fixes, Pipeline stall recovery, Unified subscription tiers
- **December 2025**: 5 weekly archives with 100+ completed projects
- **November 2025**: 4 weekly archives
- **October 2025**: 2 weekly archives

---

*Last Updated: 2026-03-05 (Onboarding tutorial flow overhaul - worktree in progress)*
*Completed projects older than 30 days are archived to .claude/history/ - See TIMELINE.md for complete historical context*
