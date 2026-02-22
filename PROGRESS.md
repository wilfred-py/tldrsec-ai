# Project Progress

**Date**: 2026-02-19
**Branch**: summary-quality-review (worktree)
**Status**: Summary Quality Fixes - Phase 2 complete, Phase 3 pending

---

## Current Session

### Summary Quality Fixes: Form 4 Classification, 10-K Blank Sections, Duplicate Emails (2026-02-18 → ongoing)

**Branch**: `summary-quality-review` | **Plan**: `docs/plans/2026-02-18-summary-quality-fixes.md` | **Research**: `thoughts/shared/research/2026-02-18-summary-quality-review.md`

**Problems**: (1) Form 4 "BOUGHT $0" for gifts/awards (GOOGL, JNJ) - 17 of 21 SEC codes defaulted to misleading "purchase". (2) 10-K blank Financial Highlights/Segments (COIN) - `summarizeFilingWithValidation()` existed but wasn't wired in. (3) Duplicate emails on job retry - race condition between summary save and `sentToUser` update.

**Phase 1: Expand Form 4 Classification to 7 Buckets** ✅ (2026-02-18)
- Added 3 new classification functions: `isAwardTransaction()` (codes A, I), `isExerciseTransaction()` (M, C, X, O, E, H), `isOtherTransaction()` (D, F, U, V, L)
- Updated `isGiftTransaction()` (+code W), `isTransferTransaction()` (+code Z)
- Added code-first guard to `isSaleTransaction()` - SEC code is authoritative over AI text
- Changed default fallback from "purchase" to "other" (neutral)
- Added 3 new display buckets: award (amber), exercise (teal), other (slate)
- `getAggregatedTransactionConfig()` now delegates to `getTransactionTypeConfig()` (DRY)
- Updated `SEC_TRANSACTION_CODES` (added V, fixed E/H/I/K descriptions), `TRANSACTION_CODE_MAP` (added 11 missing codes)
- **Files**: `form4-minimalist-template.tsx`, `design-system.ts`, `form4-data-extractor.ts`
- **Tests**: 78 new tests in `form4-transaction-classification.test.ts`, 112/112 Form 4 tests pass

**Phase 2: Wire `summarizeFilingWithValidation()` into Production Pipeline** ✅ (2026-02-19)
- Replaced `import { summarizeFiling }` with `import { summarizeFilingWithValidation }` in `summarize-cached-handler.ts`
- Updated call to pass `formType: filing.formType` for extractor lookup
- Added extractor validation metadata logging (`extractorValidated`, `fieldsFilledByExtractor`, `fieldsWithDiscrepancies`, `extractorFillRate`)
- Updated existing `summarize-cached-handler-fields.test.ts` mocks (logger, validation wrapper, trial service, preferences)
- **Files**: `lib/cron/handlers/summarize-cached-handler.ts`, `__tests__/cron/handlers/summarize-cached-handler-validation.test.ts` (new, 10 tests), `__tests__/cron/handlers/summarize-cached-handler-fields.test.ts` (updated)
- **Tests**: 14/14 handler tests pass, build passes, lint clean

**Phase 3: Fix Duplicate Email Race Condition** - PENDING
**Phase 4: Integration Testing and Regression Verification** - PENDING

---

### Fix Dashboard Slow Load After Sign-In (2026-02-19)

**Problem**: Dashboard took 4-6s to show meaningful content after sign-in due to sequential waterfall: server-side `currentUser()` → client-side Clerk `useUser()` (2-3s blocking via ProtectedRoute) → client-side API fetch for tickers → render.

**Fix** (4 changes):
1. **`components/dashboard/dashboard-shell.tsx`** - Removed `ProtectedRoute` wrapper (redundant — auth already enforced by Clerk middleware + server-side `currentUser()` in page.tsx). Eliminates 2-3s client-side Clerk blocking.
2. **`app/dashboard/page.tsx`** - Added server-side Prisma query to fetch user's tickers after `currentUser()`. Uses `_count` + `take: 1` for efficient query. Passes results as `initialCompanies` prop. Falls back gracefully on error.
3. **`components/dashboard/dashboard-client.tsx`** - Added `initialCompanies` prop (defaults to `[]`). Initializes `companies` state with server data. Skips initial `loadCompanies()` API call when data provided. `loadCompanies` still available for mutations.
4. **`app/api/user/tickers/route.ts`** - Optimized GET query: `_count: { select: { summaries: true } }` + `take: 1` instead of loading all summaries. Applied to both main query and auto-create path.

**Result**: Dashboard renders with data in ~1s (loading.tsx skeleton visible during server fetch). No new test regressions.

**Status**: Implemented, not yet committed.

---

### Auth Redirect for Logged-In Users (2026-02-18)

**Goal**: Redirect authenticated users visiting `/sign-up` or `/sign-in` to `/dashboard` instead of `/onboarding`.

**Changes**:
- **`middleware.ts`** - Added `auth()` check inside Clerk middleware callback. If `userId` exists and pathname starts with `/sign-up` or `/sign-in`, redirects to `/dashboard`.

**Status**: Implemented, not yet committed.

---

### Worktree Manager Create-and-Open Option ✅ (2026-02-18)

**Goal**: Add ability to create and open a worktree from the `npm run worktrees` interactive menu.

**Changes**:
- **`hack/create_worktree.sh`** - Added `--open` flag that opens the new worktree in Windsurf after creation (detects `windsurf` CLI or macOS app path)
- **`scripts/open-worktrees.sh`** - Added "Create new worktree" as option 4 in interactive menu (prompts for name and base branch, calls `create_worktree.sh --open`)
- **`package.json`** - Added `worktrees:create:open` convenience npm script
---

### Landing Page Auth-Aware Test Coverage ✅ (2026-02-18)

**Goal**: Add comprehensive test coverage for personalized landing page behaviors (hero caption, navbar visibility, pricing badges) across all auth/subscription states.

**Files Created**:
- `__tests__/fixtures/subscription-fixtures.ts` - Shared mock data factory for all subscription states (FREE trial, PRO, MAX, grandfathered, not onboarded, loading)
- `__tests__/components/landing/landing-navbar.test.tsx` - 8 tests: 3-state CTA (Get Started/Complete Setup/Go to Dashboard), scroll visibility, auth bypass
- `__tests__/components/landing/pricing-card.test.tsx` - 13 tests: Current Plan badge, Trial Ending Soon, loading skeleton, Popular badge, checkout spinner, bold markdown
- `__tests__/components/landing/landing-page-auth.test.tsx` - 9 integration tests: all 6 verification scenarios + error banner + loading skeletons
- `__tests__/e2e/landing-page-journeys.test.tsx` - 4 user journey tests + QA manual test data docs (skipped)

**Files Modified**:
- `__tests__/components/landing/pricing-section-v2.test.tsx` - Added auth/subscription context mocks, updated price assertions ($199/$349), fixed CTA selectors
- `jest.config.mjs` - Added `@/contexts/*` and `@/hooks/*` module name mappings

**Verification**: 5 suites, 42 tests passing, 1 skipped (QA docs), 0 lint errors

---

### Email Summary Quality Improvements ✅ (2026-02-14)

**PR**: [#349](https://github.com/wilfred-py/tldrsec-ai/pull/349)

**Goal**: Improve email summary quality with quality gates, staleness detection, and prompt enhancements.

**Key Changes**:
- **`lib/ai/summarize.ts`** - Store complete AI-generated JSON output in `summaryJSON` field instead of discarding it (fixes missing filer names/transaction details in emails)
- **Quality gates** for summary generation to catch degraded output
- **Staleness detection** to identify outdated cached summaries
- **Prompt enhancements** across filing types for better extraction

**Root Cause**: summaryJSON field was being discarded, forcing email templates to rely on regex fallbacks that fail with natural language variations.

---
### Skeleton Loading States for Billing & Subscribe ✅ (2026-02-14)

**Goal**: Replace white-screen/generic loading fallbacks on `/dashboard/billing` and `/subscribe` with layout-matching skeleton loading states using the existing `Skeleton` component.

**Changes**:
- **Created** `app/dashboard/billing/loading.tsx` - Route-level skeleton with Card layout matching billing page (header, icon+title, plan name, price, billing period, separator, action buttons)
- **Created** `app/subscribe/loading.tsx` - Route-level skeleton with back button, centered header, billing toggle, 3-card responsive grid with staggered animations, ESC hint
- **Created** `app/dashboard/billing/__tests__/loading.test.tsx` - 5 tests (skeletons, container, shadow, fadeIn, separator)
- **Created** `app/subscribe/__tests__/loading.test.tsx` - 7 tests (skeletons, back button, header, toggle, 3 cards, responsive grid, fadeIn)
- **Updated** `app/dashboard/billing/page.tsx` - Replaced `animate-pulse` divs with `Skeleton` components + added import
- **Updated** `app/subscribe/page.tsx` - Updated both `if (loading)` block and `SubscribePageLoading` Suspense fallback with layout-matching skeletons

**Patterns used**: `animate-fadeIn`, `animate-slideUp` with staggered delays, `data-slot="skeleton"`, `data-testid` for test targeting

**Verification**: 12/12 tests pass, build succeeds, no new lint errors

---

### Personalized Pricing Experience for Authenticated Users ✅ (2026-02-14)

**Goal**: Show authenticated users their current plan status on the landing page pricing section, with personalized CTAs and subscription-aware UI.

**Implementation**:
- **Auth/Subscription Context Providers** (`components/providers/auth-provider.tsx`, `components/providers/subscription-provider.tsx`) - React context for user auth state and subscription data with SWR caching
- **Subscription Status API** (`app/api/user/subscription/status/route.ts`) - Lightweight endpoint returning plan type and status
- **PricingCard extraction** (`components/landing/sections-v2/pricing-card.tsx`) - Extracted from monolithic pricing section for better organization
- **Landing page integration** - Pricing section shows "Current Plan" badges, disabled buttons for current plan, upgrade/downgrade CTAs based on subscription status
- **Security & accessibility fixes** - ARIA labels, role attributes, keyboard navigation, focus states on loading skeletons
- **Test coverage** - SSE and SubscriptionContext tests, comprehensive test coverage for new providers

**Files**: `components/providers/`, `app/api/user/subscription/status/`, `components/landing/sections-v2/pricing-card.tsx`, `components/landing/sections-v2/pricing-section-v2.tsx`

---

## Recently Completed Sessions

### TrialService User Lookup Fix ✅ (2026-02-12)

**Problem**: `/api/user/subscription` returning 500 — `TrialService.checkTrialStatus()` looked up users by `where: { id: userId }` but Clerk `userId` is stored in `authProviderId`, not `id`.

**Fix**: Changed `findUnique({ where: { id } })` to `findFirst({ where: { OR: [{ id }, { authProviderId }] } })` in `lib/auth/trial-service.ts`. Also made it return a default active/grandfathered status instead of throwing when user isn't in DB yet.

**Files**: `lib/auth/trial-service.ts`

---

### Cloudflare Cron Schedule Consolidation ✅ (2026-02-12)

**Goal**: Consolidate Cloudflare Worker cron schedules to fit within the free tier limit.

**Files**: `cloudflare-cron/wrangler.toml`, `cloudflare-cron/index.js`

---

### FREE Plan to 7-Day Trial Migration ✅ (2026-02-11)

**Goal**: Replace the permanent FREE plan with a 7-day database-managed trial system. Grandfathered FREE users (signed up before migration) keep permanent free access.

**Architecture Decisions**:
- **Database-managed trial** (no Stripe `trial_period_days`) - trial tracked entirely in DB
- **Grandfathered pattern**: `FREE + NULL trialStartedAt` = permanent free, `FREE + trialStartedAt` = 7-day trial
- **Soft block**: Expired trials can view dashboard but don't receive new emails
- **Email delivery gate**: Fails open (sends email if trial check fails)
- **IP abuse prevention**: 3 signups per IP per 30 days, fails open

**Implementation (8 Phases)**:

1. **Database Schema** - Added 4 trial fields to User model + 2 indexes:
   - `trialStartedAt`, `trialEndsAt`, `isTrialing`, `signupIpAddress`
   - Migration: `prisma/migrations/20260211_add_trial_fields/migration.sql`

2. **Core Services**:
   - `lib/auth/trial-config.ts` - TRIAL_CONFIG constants (single source of truth)
   - `lib/auth/trial-service.ts` - TrialService class (checkTrialStatus, calculateTrialEnd)
   - `lib/security/trial-abuse-prevention.ts` - IP-based abuse prevention

3. **Webhook Integration** (`app/api/webhook/clerk/route.ts`):
   - Trial creation with IP abuse check during user signup
   - Extracts IP from `x-forwarded-for`/`x-real-ip` headers

4. **API & UI**:
   - `app/api/user/subscription/route.ts` - Added trial data to GET responses
   - `hooks/use-subscription.ts` - Added trial fields to SubscriptionData interface
   - `components/dashboard/plan-status-banner.tsx` - Trial countdown with urgency colors (green/orange/red)
   - `components/dashboard/expired-trial-banner.tsx` - Post-expiration upgrade CTA
   - `components/dashboard/dashboard-shell.tsx` - Integrated trial banners

5. **Trial Expiration Handling**:
   - `lib/cron/handlers/trial-expiration-handler.ts` - Marks expired users, sends notification email
   - `app/api/cron/check-trial-expiration/route.ts` - Daily cron endpoint
   - `lib/job-queue/index.ts` - Added CHECK_TRIAL_EXPIRATION job type
   - `lib/cron/background-filing-worker.ts` - Registered handler

6. **Email Templates** (`lib/email/trial-emails.ts`):
   - `sendTrialWelcomeEmail` - Sent at signup
   - `sendTrialReminderEmail` - Sent before expiration (urgency-based subject)
   - `sendTrialExpirationEmail` - Sent when trial ends

7. **Email Delivery Gate** (`lib/cron/handlers/summarize-cached-handler.ts`):
   - Added `TrialService.checkTrialStatus()` check before all 3 email sending locations
   - Expired trial users don't receive new filing emails

8. **Configuration Changes**:
   - `lib/stripe/plans.ts` - FREE plan: `filingTypes: ['ALL']`, `emailFrequency: 'realtime'`
   - `lib/user/preference-types.ts` - All filing types enabled by default
   - `cloudflare-cron/wrangler.toml` - Added daily midnight UTC cron for trial expiration
   - `cloudflare-cron/index.js` - Added trial expiration handler routing

**Pre-existing TS Errors** (not from this migration):
- `hooks/use-subscription.ts` - `unknown` type errors from `response.json()` (7 errors)
- `components/billing/subscription-plans.tsx` - Missing `priceId`/`monthlyFilings` properties (6 errors)

**Verification**: Build passes, all trial-related functionality implemented across 8 phases.

---

### Engineering Process Improvements + Dashboard Refactoring ✅ (2026-02-11)

**PR**: [#346](https://github.com/wilfred-py/tldrsec-ai/pull/346)

**Changes**:
- **`app/dashboard/layout.tsx`** - Split server layout from client `DashboardShell` to fix `'use client'` layout issue
- **`components/dashboard/dashboard-shell.tsx`** - Extracted client-side dashboard shell component
- **`.claude/commands/review_plan.md`** - Added 6-perspective review command for plan validation

---

### Pipeline Job Processing Improvements ✅ (2026-02-10)

**Goal**: Implement operational excellence improvements from pipeline investigation - DLQ cleanup automation, retry pattern documentation, and test suite fixes.

**Phase 1: Retry Pattern Documentation** - 100% of jobs having retryCount=1 is EXPECTED (serverless cold starts). Created:
- `docs/architecture/job-retry-patterns.md` - Comprehensive cold start analysis
- `lib/monitoring/retry-rate-monitor.ts` - Anomaly detection (alerts if >10% retryCount>1)
- `app/api/monitoring/retry-rates/route.ts` - Public health metrics endpoint

**Phase 2: Test Suite Fixes** - Fixed 3 test expectations in `__tests__/lib/email/async-email-queue.test.ts`:
- Email masking for 2-char emails, database transaction test expectations
- Result: 57 passing (was 55 failing)

**Phase 3: DLQ Automated Cleanup** - Created daily cleanup at 2 AM UTC:
- `app/api/cron/cleanup-dlq/route.ts` - Removes old DLQ entries (30d reprocessed, 14d failed)
- `app/api/monitoring/dlq-status/route.ts` - Health dashboard (HEALTHY/WARNING/CRITICAL thresholds)
- `cloudflare-cron/index.js` - Added DLQ cleanup handler routing

**Total**: ~1,200 lines new code, 21 tests (all passing)

---

### Dashboard Loading Skeleton Enhancement ✅ (2026-02-07)

**Problem**: Loading skeleton cards showing purple borders, no animations, content "snapping in".

**Fixes**:
- `components/ui/skeleton.tsx` - Shimmer animation gradient overlay
- `app/globals.css` + `tailwind.config.ts` - fadeIn, slideUp, shimmer keyframes
- `app/dashboard/loading.tsx` - Replaced `landing-card` with shadcn `Card`, staggered animations
- `components/dashboard/tickers-table/tickers-table-skeleton.tsx` - slideUp animations

**Note**: Dashboard loads so fast (<500ms) that loading states are barely visible.

---

### Subscription Management UX Redesign ✅ (2026-02-07)

**PR**: [#343](https://github.com/wilfred-py/tldrsec-ai/pull/343)

**Goal**: Redesign subscription management with Grok-inspired interface for clearer plan comparison and upgrade flows.

---

### Dashboard UI Polish ✅ (2026-02-07)

**Fix**: Changed "Manage Subscription" button from `outline` to `ghost` variant in `components/layout/minimal-header.tsx:25`.

---

### Orphaned UserSubscription Database Cleanup ✅ (2026-02-07)

**Problem**: Dashboard failing with "Field user is required to return data, got `null` instead" due to 2 orphaned UserSubscription records.

**Fix**: Removed unnecessary `include: { user: ... }` from GET handler in `app/api/user/subscription/route.ts`. Created `scripts/fix-orphaned-subscriptions.ts` for cleanup. Deleted 2 orphaned records.

---

### Form 4 Preference Sync Fix ✅ (2026-02-07)

**Problem**: 60 Form 4 filings completed but emails NOT sent. Two separate preference systems (User.preferences vs Ticker.preferences) with no sync. Tickers created with `form4: false` default, ignoring user's `form4: true` preference.

**Fix**: Created `lib/user/preference-sync.ts` with centralized conversion utilities. Updated ticker creation (`app/api/user/tickers/route.ts`) to inherit user preferences. Auto-sync on preference updates via `lib/user/preference-service.ts`. Fixed all 30 tickers to `form4: true`.

---

### CLAUDE.md Agent Guidelines + Feedback Loop ✅ (2026-02-07)

Added Agent Guidelines section to CLAUDE.md (Common Mistakes, Pattern References, Pre-Implementation Checklist) and Step 6 to `/intentional-compact` for lessons learned capture.

---

### Unified Subscription Tiers + Billing Downgrade Fix ✅ (2026-01-28)

**Issues**: 405 PUT errors on billing downgrade; Prisma enum mismatch between `SubscriptionTier` and `PlanType`.

**Fixes**:
- Added PUT handler to `app/api/user/subscription/route.ts` (cancellation, downgrade, upgrade redirect)
- Unified `SubscriptionTier` enum to `FREE/PRO/MAX` in `prisma/schema.prisma`
- Created `scripts/migrate-to-unified-tiers.ts` - migrated HOBBY->FREE
- Updated `lib/cron/tier-eligibility.ts` normalization

---

### Pipeline Stall Recovery + Throughput Optimization ✅ (2026-01-28)

**Issue**: Pipeline stalled 12+ hours, 799 pending jobs, throughput only 12 jobs/hour.

**Root Causes**: `vercel.json` invalid JSON (trailing commas), Cloudflare Worker crons stopped, CRON_SECRET sync issue, low summarize batch frequency.

**Fixes**: Fixed vercel.json, redeployed CF Worker, synced secrets, added dedicated */3 summarize-only cron. Throughput improved from 12 to 130+ jobs/hour.

---

### Unsent Email Recovery ✅ (2026-01-27)

47 completed summaries with `sentToUser: false` from bulk migration. Created `scripts/resend-unsent-emails.ts`. Sent 46 emails (1 skipped - orphaned ticker).

---

### TickerMonitoring Root Cause Fix ✅ (2026-01-27)

**Problem**: SEC filing discovery silently skipping all tickers - TickerMonitoring table empty.

**Root Cause**: 3-phase async pipeline bypassed code path that creates TickerMonitoring records. `checkForNewFilings()` silently skips tickers without TickerMonitoring records.

**Fix**: Added `getActiveTickersForMonitoring()` call to `lib/cron/handlers/discovery-handler.ts` at start of discovery phase. Added TickerMonitoring health check to `app/api/health/pipeline/route.ts`.

---

### GitHub Actions Minutes Optimization ✅ (2026-01-27)

Reduced GitHub Actions usage: Watchdog frequency `*/10` -> `*/30`, added path filters to quality-gates.yml and pr-validation.yml. Savings: ~750 min/month.

---

### Pipeline Resilience Zero-Intervention ✅ (2026-01-26)

**PR**: [#340](https://github.com/wilfred-py/tldrsec-ai/pull/340)

Created: `lib/cron/secret-sanitization.ts` (CRON_SECRET auto-trim), removed 5% sampling limit from orphan detection, `.github/workflows/pipeline-heartbeat-watchdog.yml` (external monitoring). 30/30 tests passing.

---

### Stripe Webhook planType Sync Fix ✅ (2026-01-26)

**PR**: [#339](https://github.com/wilfred-py/tldrsec-ai/pull/339)

**Fix**: Stripe webhook was not syncing `planType` to User.subscriptionTier. Also improved checkout UX flow.

---

### Pipeline Stall Recovery & Bug Fixes ✅ (2026-01-26)

**Root Causes**: Auto-recover threw error on HTTP 503 (CRITICAL status) instead of proceeding with recovery; OrphanedFilingDetector queried wrong table.

**Fixes**: `app/api/cron/auto-recover/route.ts` handles 503 now; `lib/cron/orphaned-filing-detector.ts` queries correct table.

---

### BAC 424B2 Filtering Breach Investigation ✅ (2026-01-25)

User received BAC 424B2 email despite filtering. Root cause: BAC ticker had NULL preferences, 27/31 tickers had NULL preferences (87%). Fixed all 31 tickers with explicit preferences. Documented in `docs/investigation/`.

---

### Prospectus Filing Type Preferences ✅ (2026-01-23)

**PR**: [#335](https://github.com/wilfred-py/tldrsec-ai/pull/335)

**Goal**: Add prospectus filing type preferences to reduce email volume. Users can now filter out 424B2 and similar filings.

---

### Stripe Dashboard Integration Fixes ✅ (2026-01-25)

Split `lib/stripe.ts` into `lib/stripe/plans.ts` (client-safe) + `lib/stripe/index.ts` (server-only). Fixed Price ID lookup with `getPriceIdForPlan()`. Migrated PlanType enum (BASIC/PROFESSIONAL/PREMIUM -> FREE/PRO/MAX). Created `scripts/sync-clerk-user.ts`.

---

## Archived Sessions (See TIMELINE.md for Full Details)

For complete technical details of projects older than 30 days, see the weekly archive files in `.claude/history/`:
- **December 2025**: 5 weekly archives with 100+ completed projects
- **November 2025**: 4 weekly archives
- **October 2025**: 2 weekly archives

---

*Last Updated: 2026-02-19 (Summary Quality Fixes Phase 2 complete)*
*Completed projects older than 30 days are archived to .claude/history/ - See TIMELINE.md for complete historical context*
