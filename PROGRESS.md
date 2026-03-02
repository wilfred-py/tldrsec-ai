# Project Progress

**Date**: 2026-03-02
**Branch**: worktree-summary_enhancements
**Status**: Pipeline Throughput & Worker Cleanup - All 3 phases implemented, pending deploy

---

## Current Session

### Pipeline Throughput & Worker Cleanup (2026-03-02)

**Plan**: `docs/plans/2026-03-02-pipeline-throughput-and-worker-cleanup.md`
**Research**: `thoughts/shared/research/2026-02-26-pipeline-throughput-cloudflare-dead-code.md`

**Goal**: Maximize summaries generated and sent per cron run by looping Step 3 (summarize), removing dead code from Cloudflare Worker, and gating verbose logging behind DEBUG_MODE.

**Phase 1: Dead Code Removal** ✅
- Removed `handleIntervalSummary` (~62 lines) and `handleSummarizeOnly` (~58 lines) from `cloudflare-cron/index.js`
- Removed `intervalSummary` from `handlerHealth`
- Removed `USE_ASYNC_PROCESSING` and `RATE_LIMIT_STRATEGY` from `cloudflare-cron/wrangler.toml`
- Fixed stale DLQ comment
- **Tests**: 6 new tests in `__tests__/cloudflare/worker-dead-code-removal.test.ts`
- **Fixed**: `cron-routing.test.ts` and `config-synchronization.test.ts` updated for removed code

**Phase 2: DEBUG_MODE Logging Gate** ✅
- Added `debugLog(env, ...args)` helper gated on `env?.DEBUG_MODE === 'true'`
- Threaded `env` parameter into `executeWithAdvancedRateLimiting` and `executeRequestWithTimeout`
- Converted 8 verbose `console.log` calls to `debugLog` (53 unconditional logs preserved)
- Synced root `wrangler.toml` with `cloudflare-cron/wrangler.toml` (cron schedules, version)
- **Tests**: 7 new tests in `__tests__/cloudflare/worker-debug-logging-gate.test.ts`

**Phase 3: Step 3 Summarize Loop** ✅
- Added `SUMMARIZE_TIME_BUFFER_MS = 60000` and `MAX_SUMMARIZE_ITERATIONS = 10`
- Replaced single Step 3 call with `while` loop: checks time budget, generates fresh HMAC per iteration, breaks on 0 jobs or time exhaustion
- Updated `result.metrics.summarize` with `iterations` and `totalJobsProcessed`
- Updated `combinedSuccess` logic for multi-iteration results
- **Tests**: 8 new tests in `__tests__/cloudflare/worker-summarize-loop.test.ts`

**Files Modified**:
- `cloudflare-cron/index.js` - All 3 phases (dead code removal, debugLog, summarize loop)
- `cloudflare-cron/wrangler.toml` - Removed dead vars
- `wrangler.toml` (root) - Synced with cloudflare-cron version
- `__tests__/cloudflare-cron/cron-routing.test.ts` - Rewritten for current architecture
- `__tests__/cloudflare/config-synchronization.test.ts` - Updated for removed vars

**Verification**: 21 new tests all passing, 183 total cloudflare tests pass, wrangler dry-run succeeds.
**Pending**: Deploy to Cloudflare and verify production log output.

---

## Recently Completed Sessions

### Fix Stripe Duplicate Subscriptions & Upgrade/Downgrade Flow ✅ (2026-02-24)

**Goal**: Fix 4 duplicate Stripe subscriptions across 2 customers, orphaned DB records from userId mismatch, and upgrades creating new subs instead of modifying existing ones.

**Root Causes**: (1) POST handler only checked `isActive` in DB, not Stripe source of truth. (2) `userId` mismatch. (3) Upgrades returned 400 instead of modifying existing sub. (4) Downgrade hardcoded `'monthly'`.

**Files**: `lib/stripe/index.ts`, `app/api/webhook/stripe/route.ts`, `app/api/user/subscription/route.ts`, `app/dashboard/page.tsx`, `app/subscribe/page.tsx`, `scripts/cleanup-duplicate-subscriptions.ts`

---

### Hide Nav Links on Sign-In/Sign-Up Pages ✅ (2026-02-25)

**PR**: [#354](https://github.com/wilfred-py/tldrsec-ai/pull/354)

---

### Dashboard Layout Build Fix ✅ (2026-02-11)

**Goal**: Fix Vercel build failure on `/dashboard/billing` page caused by Clerk `useUser()` called during static prerendering.

**Root Cause**: `app/dashboard/layout.tsx` was a `'use client'` component calling `useSubscription()` → `useUser()`. During Next.js static generation, `ClerkProvider` isn't available (no `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` at build time). Most dashboard pages avoided this because they're server components using `currentUser()` (auto-forces dynamic rendering), but `/dashboard/billing` is purely client-side — so Next.js attempted prerendering and the layout's hook blew up.

**Fix (Next.js best practice)**: Split layout into server + client components:
1. `app/dashboard/layout.tsx` — Server component with `export const dynamic = "force-dynamic"` that delegates to `DashboardShell`
2. `components/dashboard/dashboard-shell.tsx` — New `'use client'` component with original layout logic (hooks, `ProtectedRoute`, subscription banner)

**Files Created**: `components/dashboard/dashboard-shell.tsx`
**Files Modified**: `app/dashboard/layout.tsx`
**Verification**: `npm run build` passes, all `/dashboard/*` routes render as `ƒ` (dynamic)

---

### Pipeline Job Processing Improvements ✅ (2026-02-10)

**Goal**: DLQ cleanup automation, retry pattern documentation, test suite fixes following pipeline investigation.

**Phase 1 - Retry Pattern Documentation**: 100% retryCount=1 is EXPECTED (serverless cold starts). Created `docs/architecture/job-retry-patterns.md`, `lib/monitoring/retry-rate-monitor.ts` (12 tests), `app/api/monitoring/retry-rates/route.ts`.

**Phase 2 - Test Suite Fixes**: Fixed 3 expectations in `__tests__/lib/email/async-email-queue.test.ts` (email masking + resilient design behavior). All 57 tests passing.

**Phase 3 - DLQ Automated Cleanup**: Created `app/api/cron/cleanup-dlq/route.ts` (14/30 day cutoffs, alert thresholds), `app/api/monitoring/dlq-status/route.ts`, updated `cloudflare-cron/index.js` with `0 2 * * *` daily schedule. 9 tests passing.

**Total**: ~1,200 lines new code, 21 tests, complete documentation.

---

### E2E Pipeline Script Alignment with Production Architecture ✅ (2026-02-24)

**Goal**: Rewrite `scripts/test-e2e-email.ts` to use production 3-phase pipeline code paths.

**Problem**: E2E test used legacy monolithic approach, producing wrong results (Form 4 "BOUGHT $0", blank 10-K sections) because it bypassed extractor enrichment, content verification, and per-filing email templates.

**Changes**: Exported `fetchFilingContentOptimized()` from `fetch-handler.ts`. Complete rewrite of `test-e2e-email.ts` with Discovery → Fetch → Verify → Summarize → Email using production functions.

**Files**: `lib/cron/handlers/fetch-handler.ts`, `scripts/test-e2e-email.ts`

### Fix Subscription State Not Updating + Dashboard/Subscribe UI Issues ✅ (2026-02-24)

**PR**: [#352](https://github.com/wilfred-py/tldrsec-ai/pull/352)

**Root Causes**: (1) Webhook handlers update `UserSubscription.planType` but never sync `User.subscriptionTier`. (2) No fallback when webhook hasn't fired. (3) Trial banner not receiving props. (4) Subscribe page UI issues.

**Fixes**: Added `syncUserSubscriptionTier()` to all Stripe webhook handlers, checkout session verification fallback in dashboard, trial banner prop passing, subscribe page UI polish ($0 instead of "Free", no lightning icon for FREE).

**Files**: `app/api/webhook/stripe/route.ts`, `lib/stripe/index.ts`, `app/dashboard/page.tsx`, `components/dashboard/dashboard-shell.tsx`, `app/subscribe/page.tsx`

---

### Fix Subscribe Page Bugs + Downgrade Support ✅ (2026-02-20)

**Problems**: (1) Plan shows as Pro after aborting checkout — upsert created subscription with requested planType before payment confirmed. (2) Back button navigated to Stripe checkout URL (browser history pollution from `window.location.href`). (3) No way to downgrade from Pro/Max.

**Fixes**:
- **`app/api/user/subscription/route.ts:349`** — Changed planType to `'FREE'` in upsert create clause. Webhook sets real planType on success.
- **`app/subscribe/page.tsx`** — `isCurrentPlan()` checks `isActive` flag. Replaced `router.back()` with `router.push('/dashboard')`. Added `PLAN_RANK`, `getEffectivePlan()`, `getButtonType()` helpers. New downgrade button + confirmation Dialog.
- **`app/subscribe/page.tsx`** — `handleDowngrade()` calls PUT `/api/user/subscription`.

### Redirect Upgrade Links to /subscribe ✅ (2026-02-20)

**Change**: Dashboard "Upgrade to add more" button and toast action now navigate to `/subscribe` instead of `/dashboard/billing`.

**Files**: `components/dashboard/dashboard-client.tsx` — lines 219, 367.

---

### Summary Quality Fixes: Form 4 Classification, 10-K Blank Sections, Duplicate Emails (2026-02-18 → 2026-02-19)

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

**Phase 3: Dedup Guard** ✅ (2026-02-19) - Included in PR #351. Added `sentToUser` + `SummaryEmailDelivery` dedup checks in `summarize-cached-handler.ts` to prevent duplicate emails on job retry.

**Phase 4: Integration Testing and Regression Verification** - PENDING

---

### Back to Dashboard Button on Billing Page ✅ (2026-02-19)

Added "Back to Dashboard" navigation button to `app/dashboard/billing/page.tsx`.

---

### Tutorial Overlay Bug Fixes ✅ (2026-02-19)

**Problems**: (1) Tutorial showed for existing users who already completed it or had tickers. (2) No spotlight/cut-out effect on highlighted element — just a flat overlay. (3) Tooltip appeared grayed out behind overlay.

**Fixes**:
- **`app/dashboard/page.tsx`** - Read `tutorialCompletedAt` from DB user, pass `tutorialCompleted` prop to client
- **`components/dashboard/dashboard-client.tsx`** - Skip tutorial if `tutorialCompleted || initialCompanies.length > 0`
- **`app/globals.css`** - Replaced z-index overlay approach with `box-shadow: 0 0 0 9999px rgba(0,0,0,0.5)` spotlight technique. Removed forced `background-color: white !important` overrides
- **`components/onboarding/tutorial-guide.tsx`** - Removed always-present overlay div, added conditional overlay only for non-highlighted steps. Tooltip: `z-[10000] bg-white dark:bg-zinc-900` with explicit borders

---

### Dashboard Skeleton Refinement ✅ (2026-02-19)

**Goal**: Make loading skeleton match actual dashboard DOM structure for seamless transition.

**Changes**:
- **`app/dashboard/loading.tsx`** - Rewrote to mirror `DashboardClient` layout (landing-card container, header spacing, table structure)
- **Tests** - Updated to mock `/api/user/tickers` instead of `/api/companies`, test `initialCompanies` prop instead of async fetch

---

### Sign-Up Page Skeleton + Auth Nav Cleanup ✅ (2026-02-19)

**Changes**:
- **`app/(auth)/sign-up/[[...sign-up]]/page.tsx`** - Added shimmer skeleton matching Clerk form layout, visible during Clerk JS hydration. Uses MutationObserver to detect `.cl-card` render
- **`components/navigation.tsx`** - Hide sign-in/get-started nav buttons on `/sign-in` and `/sign-up` paths

---

### Fix Dashboard Slow Load After Sign-In ✅ (2026-02-19)

**Problem**: Dashboard took 4-6s to show meaningful content after sign-in due to sequential waterfall: server-side `currentUser()` → client-side Clerk `useUser()` (2-3s blocking via ProtectedRoute) → client-side API fetch for tickers → render.

**Fix** (4 changes):
1. **`components/dashboard/dashboard-shell.tsx`** - Removed `ProtectedRoute` wrapper (redundant — auth already enforced by Clerk middleware + server-side `currentUser()` in page.tsx)
2. **`app/dashboard/page.tsx`** - Added server-side Prisma query to fetch user's tickers. Uses `_count` + `take: 1` for efficient query. Passes `initialCompanies` prop
3. **`components/dashboard/dashboard-client.tsx`** - Added `initialCompanies` prop. Skips initial API call when data provided
4. **`app/api/user/tickers/route.ts`** - Optimized GET query with `_count` + `take: 1`

**Result**: Dashboard renders with data in ~1s.

---

### Auth Redirect for Logged-In Users ✅ (2026-02-18)

**Change**: `middleware.ts` - Redirect authenticated users visiting `/sign-up` or `/sign-in` to `/dashboard`.

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

## Archived Sessions (See TIMELINE.md for Full Details)

For complete technical details of projects older than 30 days, see the weekly archive files in `.claude/history/`:
- **January 2026**: BAC 424B2 investigation, Prospectus preferences, Stripe integration fixes, Pipeline stall recovery, Unified subscription tiers, and 30+ more
- **December 2025**: 5 weekly archives with 100+ completed projects
- **November 2025**: 4 weekly archives
- **October 2025**: 2 weekly archives

---

*Last Updated: 2026-03-02 (Pipeline Throughput & Worker Cleanup - 3 phases complete)*
*Completed projects older than 30 days are archived to .claude/history/ - See TIMELINE.md for complete historical context*
