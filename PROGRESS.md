# Project Progress

**Date**: 2026-01-27
**Branch**: feature/pipeline-resilience-zero-intervention
**Status**: GitHub Actions Optimization Complete

---

## Current Session: GitHub Actions Minutes Optimization ✅ (2026-01-27)

**Goal**: Reduce GitHub Actions usage to fit within GitHub Pro 3,000 minute limit.

**Analysis**: 7 workflows consuming ~1,990 minutes/month (at 2,000 limit capacity)

**Optimizations Applied**:
1. **Watchdog frequency reduced**: `*/10` → `*/30` (saves ~480 min/month)
   - Safe because Cloudflare Worker (Layer 1) and Auto-Recovery (Layer 2) are primary triggers
   - GitHub watchdog is "last line of defense" for external alerting only
2. **Path filters added to quality-gates.yml**: Skip docs/config-only changes (saves ~150 min/month)
3. **Path filters added to pr-validation.yml**: Skip docs/config-only changes (saves ~120 min/month)

**Files Modified**:
- `.github/workflows/pipeline-heartbeat-watchdog.yml` - Changed cron from `*/10` to `*/30`
- `.github/workflows/quality-gates.yml` - Added path filters for code-only triggers
- `.github/workflows/pr-validation.yml` - Added path filters for code-only triggers

**Estimated Savings**: ~750 minutes/month → ~1,240 min/month usage (well within 3,000 Pro limit)

---

## Recently Completed Sessions

### Pipeline Resilience Zero-Intervention ✅ (2026-01-26)

**PR**: [#340](https://github.com/wilfred-py/tldrsec-ai/pull/340) - Merged to main

**Goal**: Eliminate human intervention requirements for pipeline recovery by addressing three root causes of manual intervention.

**Implementation**:

1. **Defensive CRON_SECRET Sanitization**:
   - Created `lib/cron/secret-sanitization.ts` with automatic `.trim()` to prevent HMAC auth failures
   - Updated `cloudflare-cron/index.js` (v2.7.0) to sanitize all CRON_SECRET usages
   - Prevents recurring 13+ hour pipeline stalls from trailing `\n` characters

2. **Faster Orphan Detection**:
   - Removed 5% sampling limit from `app/api/health/pipeline/route.ts`
   - Orphan detection now runs on every request (<15 second detection time)
   - Enables immediate recovery of orphaned filings

3. **External Heartbeat Watchdog**:
   - Created `.github/workflows/pipeline-heartbeat-watchdog.yml` - runs every 10 minutes
   - Monitors `/api/health/pipeline` endpoint independently
   - Sends email alerts via Resend API if pipeline stalls (15+ min without completion)
   - Last line of defense when all internal layers fail

**Verification**:
- ✅ 30/30 tests passing (18 unit + 12 integration)
- ✅ Multi-perspective review: 6/6 approved (Product, Developer, QE, Security, DevOps, UX)
- ✅ Cloudflare Worker secret sync completed
- ✅ HMAC authentication verified (HTTP 202)
- ✅ External watchdog test alert sent successfully

**Files**:
- Created: `lib/cron/secret-sanitization.ts`, `lib/monitoring/heartbeat-alert.ts`, `.github/workflows/pipeline-heartbeat-watchdog.yml`
- Modified: `cloudflare-cron/index.js`, `app/api/health/pipeline/route.ts`
- Tests: `__tests__/unit/cron-secret-sanitization.test.ts`, `__tests__/integration/heartbeat-watchdog.test.ts`

**Impact**: Zero manual intervention required for pipeline recovery, MTTR reduced from hours to minutes

### Phase 4: Pipeline Stall Recovery & Bug Fixes (2026-01-26) ✅
**Issue**: Pipeline stalled for 5.5+ hours with 290 pending jobs, 0 processing, no completions.

**Root Causes Discovered**:
1. **Auto-recover cascade failure**: Health endpoint returns HTTP 503 for CRITICAL status, but auto-recover checked `response.ok` which is false for 503, causing it to throw an error instead of proceeding with recovery - exactly when recovery is needed most!
2. **OrphanedFilingDetector using wrong table**: Code queried `SecFiling.processed` field which doesn't exist (the `processed` field is on `RssFilingCheck` table), causing Prisma errors.
3. **Cloudflare Worker stopped executing**: Unknown reason caused all cron triggers to stop for 38+ minutes.

**Fixes Applied**:
1. **Auto-recover HTTP 503 handling**: Updated `getPipelineHealth()` in `app/api/cron/auto-recover/route.ts` to parse JSON body even for 503 responses (CRITICAL status), only failing on 500 (ERROR).
2. **OrphanedFilingDetector table fix**: Updated `lib/cron/orphaned-filing-detector.ts` to query `rssFilingCheck` table instead of `secFiling`, and changed job type to `ASYNC_SUMMARIZE_CACHED`.
3. **Cloudflare Worker redeploy**: Redeployed worker to restart cron triggers.

**Files Modified**:
- `app/api/cron/auto-recover/route.ts` - Handle HTTP 503 from health endpoint
- `lib/cron/orphaned-filing-detector.ts` - Use correct table (RssFilingCheck)

**Recovery Results**:
- Status: CRITICAL → DEGRADED
- completedLast1h: 0 → 25+
- minutesSinceLastCompletion: 335 → 2
- Cron execution restored (every 5 minutes)
- Backlog being processed (276 remaining)

---

## Previous Session: BAC 424B2 Filtering Breach Investigation & Documentation (2026-01-25)

**Issue**: User received BAC 424B2 email at 4:01 PM AEST despite prospectus filtering being deployed.

**Root Cause Discovered**:
1. **Immediate**: BAC ticker had NULL preferences (no defaults set)
2. **Systemic**: Async pipeline handlers (`summarize-cached-handler.ts`) bypass filtering - don't re-check preferences at summarize stage
3. **Timing**: Jobs queued before deployment (Jan 21) processed after deployment (Jan 25) without preference validation

**Critical Discovery**: **27 out of 31 tickers had NULL preferences** (87% of all tickers!)

**Documentation Created**:
- `docs/investigation/2026-01-25-bac-424b2-filtering-breach.md` (351 lines) - Full technical investigation
- `docs/investigation/2026-01-25-filtering-breach-SUMMARY.md` (325 lines) - Executive summary
- `DEPLOYMENT_NEXT_STEPS.md` (299 lines) - PR #335 deployment procedures

**Impact**: 15 BAC 424B2 emails sent (13 after filtering deployed), affected 3 users, widespread vulnerability across 87% of tickers

**Immediate Fixes Applied** (not in this PR - already in production):
1. ✅ Set BAC ticker preferences to disable 424B2
2. ✅ Updated all 27 vulnerable tickers with default preferences
3. ✅ Result: All 31 tickers now have explicit preferences

**Systemic Fix Needed** (documented for next deployment):
- Add preference filtering to `lib/cron/handlers/summarize-cached-handler.ts`
- Add defense-in-depth validation at ALL async pipeline stages

---

## Previous Session: Stripe Dashboard Integration Fixes ✅ (2026-01-25)

**Goal**: Fix Stripe checkout flow from dashboard upgrade CTA buttons.

### Summary
Fixed multiple issues preventing Stripe checkout from dashboard: client/server module split, Price ID lookup, database enum migration, and Clerk user sync.

### Stripe Client/Server Module Split ✅
**Issue**: Browser console showing "Missing Stripe environment variables" warnings on every page load.

**Root Cause**: `lib/stripe.ts` was imported by client components (`dashboard-client.tsx`, `upgrade-cta-section.tsx`, etc.) but environment variables without `NEXT_PUBLIC_` prefix are only available server-side.

**Fix**: Split `lib/stripe.ts` into separate modules:
- `lib/stripe/plans.ts` - Client-safe constants (SUBSCRIPTION_PLANS, types, utility functions)
- `lib/stripe/index.ts` - Server-only Stripe client (env var checks only run server-side)

**Files Created**:
- `lib/stripe/plans.ts` (~170 lines)
- `lib/stripe/index.ts` (~270 lines)

**Files Modified** (updated imports to use `@/lib/stripe/plans`):
- `components/dashboard/upgrade-cta-section.tsx`
- `components/dashboard/dashboard-client.tsx`
- `components/landing/sections/pricing-section.tsx`
- `components/landing/sections-v2/pricing-section-v2.tsx`
- `components/billing/subscription-plans.tsx`
- `app/dashboard/billing/page.tsx`

**Files Renamed**: `lib/stripe.ts` → `lib/stripe.ts.bak`

### Subscription API Price ID Lookup Fix ✅
**Issue**: POST `/api/user/subscription` returning 503 "Stripe price ID not configured for PRO monthly"

**Root Cause**: API route was reading `plan.monthlyPriceId` from `SUBSCRIPTION_PLANS` which now returns `null` (client-safe version doesn't include env vars).

**Fix**: Updated routes to use `getPriceIdForPlan()` function that reads directly from environment variables.

**Files Modified**:
- `app/api/user/subscription/route.ts` - Added `getPriceIdForPlan` import and usage
- `app/api/checkout/direct/route.ts` - Same fix plus null check for stripe client

### Database PlanType Enum Migration ✅
**Issue**: Prisma upsert failing with `invalid input value for enum app."PlanType": "PRO"`

**Root Cause**: Database had old enum values (BASIC, PROFESSIONAL, PREMIUM) but code uses new values (FREE, PRO, MAX).

**Fix**:
1. Added new enum values: `ALTER TYPE app."PlanType" ADD VALUE IF NOT EXISTS 'FREE/PRO/MAX'`
2. Migrated existing records: `UPDATE app."UserSubscription" SET "planType" = 'FREE' WHERE "planType" = 'BASIC'` (etc.)
3. Updated type cast in route.ts from `'BASIC' | 'PROFESSIONAL' | 'MAX'` to `'FREE' | 'PRO' | 'MAX'`

### Clerk User Sync Script ✅
**Issue**: "User not found in database" warnings for Clerk-authenticated users.

**Root Cause**: User logged into Clerk but no corresponding record in local Prisma database.

**Fix**: Created `scripts/sync-clerk-user.ts` to fetch user from Clerk API and create/update local database record.

**Files Created**: `scripts/sync-clerk-user.ts` (~130 lines)

**Usage**: `npx tsx scripts/sync-clerk-user.ts <clerk_user_id>` or `--email <email>`

### Stripe Product Description Copy Update
Updated Pro Monthly product description in Stripe Dashboard from feature list to benefit-focused copy:
> "Real-time SEC filing intelligence. Stop finding out about material events after the market moves."

---

## Previous Session: Cloudflare Worker Secret Sync Automation Documentation ✅ (2026-01-23)

**Issue**: CRON_SECRET desynchronization between Vercel and Cloudflare Worker after PR merges causes HMAC authentication failures and pipeline stalls.

**Solution Documented**:
1. Added comprehensive troubleshooting documentation to CLAUDE.md for CRON_SECRET trailing `\n` issue
2. Updated push-pr-review-merge workflow with mandatory Step 7 for Cloudflare Worker secret sync
3. Added npm scripts: `cloudflare:sync-secret` and `cloudflare:sync-secret:verify`

**Documentation Added**:
- **CLAUDE.md**: 103-line section covering problem description, detection methods, fix procedures, prevention strategies
- **push-pr-review-merge.md**: New Step 7 with sync process, verification, expected output, error handling
- **package.json**: Two new npm scripts for automated secret synchronization

**Prevention Mechanism**: Mandatory post-merge secret sync ensures Cloudflare Worker and Vercel always have matching CRON_SECRET values, preventing future HMAC auth failures and pipeline stalls.

---

## SEC Filing Summary & Email Quality Enhancement - All 4 Phases Complete ✅ (2026-01-22)

**Plan**: `docs/plans/2026-01-20-fix-filing-summary-email-quality.md`

**Overview**: Comprehensive enhancement resolving 8 quality gaps in SEC filing summarization and email delivery.

### Phase 1: Data Storage Foundation ✅
**Issue**: AI extracted perfect structured data (filerName, transactions, holdings) but `summaryJSON` was never stored in database.

**Root Cause**: `lib/ai/summarize.ts:852` had `summaryText: parsedResult.data.summary` but missing `summaryJSON: parsedResult.data`.

**Fix**: Added ONE critical line storing `summaryJSON: parsedResult.data` alongside `summaryText`.

**Files**: `lib/ai/summarize.ts` (+1 line)
**Tests**: 4/4 passing in `__tests__/lib/ai/summarize-data-storage.test.ts`

### Phase 2: Language Quality Enhancement ✅
**Issue**: "dumped" appeared in 100% of Form 4/144 summaries (NVDA, GOOGL, KO emails Jan 7-16).

**Root Cause**: Production prompt in `summaryGenerationService.ts` instructed `"Active voice: 'Bezos dumped $3B'"`.

**Fix**:
- Added verb variety guidance to `unified-prompts.ts`: "sold", "divested", "offloaded", "shed", "liquidated"
- Added acronym expansion: "TSR (Total Shareholder Return)", "PSU (Performance Stock Units)"
- Removed repetitive "dumped" language

**Files**: `lib/ai/prompts/unified-prompts.ts` (~30 lines)
**Tests**: 5/5 passing in `__tests__/lib/ai/prompt-language-quality.test.ts`
**Verification**: 5 test summaries confirmed varied vocabulary

### Phase 3: Email Formatting & Amendment Indicators ✅
**Issue**: Email summaries were long paragraphs with no structure. Amended filings had no [AMENDED] indicator.

**Fix**:
- Enhanced AI prompts to generate markdown (## headers, bullet lists, paragraph breaks)
- Created `EmailSubjectService` with [AMENDED] detection for /A filings
- Updated templates to use `markdownToHtml()` for proper rendering

**Files**:
- `lib/ai/prompts/unified-prompts.ts` (markdown guidance)
- `lib/email/subject-service.ts` (new service)
- `components/ui/email/templates/form4-minimalist-template.tsx` (rendering)

**Tests**: 7/7 passing in `__tests__/components/email/email-formatting.test.ts`
**Manual Verification**: 4 test emails sent (TSLA, AAPL Form 4/A, NVDA 10-K/A, MSFT 8-K) - all rendered correctly

### Phase 4: Duplicate Email Prevention ✅
**Issue**: Same summary sent twice to same user during concurrent cron job execution.

**Root Cause**: Cron overlap (Cloudflare every 10 min + Vercel backup every 30 min) caused race conditions.

**Fix**: Implemented PostgreSQL advisory lock mechanism:
- Added `pg_try_advisory_lock` at start of `sendEmailSummary()`
- Lock key: `email:${userId}:${tickers}`
- Automatic release in `finally` block
- Three-layer prevention: Advisory locks + DB unique constraints + transaction atomicity

**Files**: `services/filing/sendEmailSummary.ts` (+50 lines: lock helpers + integration)
**Verification**: Advisory lock script confirmed 2/3 concurrent requests blocked successfully

### Quality Metrics
- **Test Coverage**: 16/16 tests passing (100%)
- **Build Status**: ✅ TypeScript compilation SUCCESS
- **8 Quality Gaps**: All resolved
- **Backward Compatible**: Old summaries still work

### Three-Layer Duplicate Prevention
1. **Database Layer**: `SummaryEmailDelivery` unique constraint on `[userId, summaryId]`
2. **Transaction Layer**: `createMany` with `skipDuplicates: true` + atomic email send
3. **Advisory Lock Layer**: `pg_try_advisory_lock` prevents cron overlap

**Production Ready**: ✅ Deploy and monitor for 24-48 hours

---

### Cloudflare Build Fix - Onboarding Dynamic Rendering ✅ (2026-01-21)

**Issue**: Cloudflare Pages build failing with error: "useSession can only be used within the <ClerkProvider /> component" during static page generation of `/onboarding`.

**Root Cause**: Next.js was attempting to statically prerender the `/onboarding` page during build. The page uses Clerk's `useSession` hook which requires `ClerkProvider`, but during Cloudflare Pages build, environment variables like `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` are not available, so ClerkProvider skips initialization.

**Fix Applied**:
1. Renamed `page.tsx` to `onboarding-client.tsx` (client component with all UI logic)
2. Created new server component `page.tsx` that exports `dynamic = "force-dynamic"`
3. Server component simply renders the client component

This pattern separates server-side configuration (`dynamic` export) from client-side React hooks, which is the proper way to handle this in Next.js 15 App Router.

**Files Modified**:
- `app/(auth)/onboarding/page.tsx` - New server component with `export const dynamic = "force-dynamic"`
- `app/(auth)/onboarding/onboarding-client.tsx` - Renamed from page.tsx, contains all client UI logic

**Verification**: ✅ Local build passes, `/onboarding` now marked as `ƒ` (Dynamic) instead of `○` (Static). Pushed to main to trigger new Cloudflare build.

---

### Onboarding Redirect Race Condition Fix ✅ (2026-01-19)

**Issue**: Two problems in onboarding flow:
1. Welcome emails failing with "Missing `html` or `text` field" error
2. After completing onboarding, users stuck on "Setting up your account" spinner instead of redirecting to /dashboard

**Root Cause 1 - Email Failure**: `getEmailTemplate()` in `lib/email/templates.ts` is an async function (line 926), but was being called without `await` in `welcome-service.ts`, causing `html` and `text` to be Promise objects instead of strings.

**Root Cause 2 - Redirect Loop**: Clerk's `publicMetadata.onboardingCompleted` doesn't immediately sync to JWT session claims. The middleware checks `sessionClaims.publicMetadata.onboardingCompleted`, but the JWT hasn't refreshed yet after the backend updates Clerk metadata, causing redirect back to /onboarding.

**Fix Applied**:
1. **Email Fix**: Added `await` to `getEmailTemplate()` calls in `welcome-service.ts` at lines 45 and 134
2. **Redirect Fix**: Implemented cookie-based bypass pattern:
   - Client sets `onboarding_completed=true` cookie (60s TTL) before navigation
   - Added `session.reload()` call to attempt Clerk session refresh
   - Changed to hard navigation (`window.location.href`) instead of client-side `router.push()`
   - Middleware checks BOTH Clerk session claims AND the cookie
   - Cookie is cleared after first successful dashboard access

**Files Modified**:
- `lib/email/welcome-service.ts` - Added `await` to async `getEmailTemplate()` calls
- `app/(auth)/onboarding/page.tsx` - Added session reload, cookie bypass, hard navigation
- `middleware.ts` - Added cookie bypass check for onboarding redirect protection

**Verification**: ✅ User confirmed "working now" - onboarding completes and redirects to dashboard successfully

---

### Pipeline Recovery - Zombie Connection Pool Exhaustion ✅ (2026-01-19)

**Issue**: Pipeline stalled for 25+ hours due to 16 zombie database connections stuck in "idle in transaction" state, exhausting the Supabase connection pool.

**Root Cause**: Prisma connections entered "idle in transaction" state and never closed, accumulating over time until all 5 pool connections were consumed (oldest: 1h41m).

**Additional Bug Found**: `/api/health/pipeline` endpoint was querying `SecFiling.processed` field which doesn't exist (the `processed` field is on `RssFilingCheck` table).

**Fix Applied**:
1. Terminated 16 zombie connections via `pg_terminate_backend()`
2. Fixed health endpoint to query `RssFilingCheck` instead of `SecFiling`
3. Moved 18 invalid `ASYNC_SUMMARIZE_FILING` jobs to DEAD_LETTER
4. Reset 1 stuck processing job (25+ hours old) to PENDING

**Files Modified**:
- `app/api/health/pipeline/route.ts` - Fixed `processed` field query to use `rssFilingCheck`

**Verification**: ✅ Pipeline HEALTHY, jobs completing, 88-job backlog processing

---

### Email Template Type Errors Fix (2026-01-16)

**Issue**: Property type errors in `lib/email/templates.ts` - summaryData interface missing properties used in template rendering.

**Root Cause**: `FilingTemplateData.summaryData` in `lib/email/types.ts` was missing common fields used for 10-K/10-Q, 8-K, and Form 4 templates.

**Fix Applied**:
1. Added missing properties to `FilingTemplateData` interface in `types.ts`:
   - `summaryUrl` - URL to view summary
   - `summaryData` common fields: `period`, `financials`, `insights` (10-K/10-Q)
   - 8-K fields: `eventType`, `summary`, `sentiment`, `keyHighlights`, `financialImpact`, `managementCommentary`, `forwardGuidance`, `positiveHighlights`, `negativeHighlights`, `itemNumbers`
   - Form 4 fields: `filerName`, `relationship`, `percentageChange`, `newStake`
2. Fixed `generatePlainTextEmail()` function signature to use `FilingTemplateData[]`
3. Fixed type casts in `getEmailTemplate()` to use `as unknown as` for proper conversion

**Files Modified**:
- `lib/email/types.ts` - Added missing properties to FilingTemplateData interface
- `lib/email/templates.ts` - Fixed function signature and type casts

**Verification**: ✅ Build passes (no TypeScript errors in templates.ts)

---

### SEC Summary Quality Phase 2 - Phase 4: Grokipedia Research ✅ (2026-01-15)

Completed comprehensive research on all 9 SEC form types and updated extraction guidance.

**Approach**: Spawned 9 parallel research agents to investigate form-specific requirements using authoritative sources (SEC.gov, Deloitte DART, PWC Viewpoint, CFI, DilutionTracker).

**Gap Analysis Results**: Identified significant extraction guidance gaps across all form types.

**Updates Made to `lib/ai/prompts/unified-prompts.ts`**:

| Form | Before | After | Key Additions |
|------|--------|-------|---------------|
| 10-K | 14 rules | 22 rules | 16-item/4-part structure, MD&A metrics, human capital disclosure, footnote-first approach |
| 10-Q | 12 rules | 20 rules | Part I/II structure, DSO/DPO liquidity metrics, non-GAAP reconciliation, red flags |
| Form 4 | 6 rules | 18 rules | Complete transaction code mapping (P,S,A,D,G,M,F,J,K,X,C,W), 10b5-1 checkbox (Apr 2023) |
| 8-K | 6 rules | 22 rules | Complete 9-section item mapping, Item 1.05 cybersecurity (Dec 2023), high-impact items |
| Form 144 | 10 rules | 18 rules | 90-day validity, Rule 144 volume limits, holding periods, broker requirement |
| S-1 | 13 rules | 20 rules | JOBS Act confidential filing, human capital metrics, lock-up period, pre-revenue handling |
| S-3 | 8 rules | 22 rules | $75M float requirement, WKSI status, MEF filings, ATM vs bought deal, 3-year shelf |
| DEF 14A | 9 rules | 20 rules | CD&A section, Summary Compensation Table, say-on-pay thresholds (<70% ISS concern) |
| 11-K | 10 rules | 20 rules | ERISA vs non-ERISA requirements, PCAOB audit, 90/180 day filing deadlines |

**Files Modified**:
- `lib/ai/prompts/unified-prompts.ts` - All 9 form type extraction rules enhanced
- `docs/plans/2026-01-12-sec-summary-quality-phase-2.md` - Phase 4 marked complete

**Verification**: Linter passes (no new errors)

---

### 8-K Email Template Registry Fix ✅ (2026-01-15)

**Issue**: 8-K emails rendered with GenericMinimalistTemplate instead of Form8KMinimalistTemplate.

**Root Cause**: `lib/email/templates.ts` registry was missing 8-K and Form 144 mappings (emailGenerator.ts had them, but individual filing notifications use templates.ts).

**Fix**: Added imports and registry entries for 8-K (4 variants) and Form 144 (3 variants) in `lib/email/templates.ts`.

**Files**: `lib/email/templates.ts`
**Verification**: ✅ Build passes, test emails verified
### Pipeline Recovery - Database Migration Fix ✅ (2026-01-13)

Restored stalled pipeline after Supabase database server migration.

**Root Cause**: Supabase migrated database from `aws-1-ap-southeast-2` to `aws-0-ap-southeast-1` with password change on Dec 23, 2025. Connection remained alive until Jan 12 6:30 PM AEST when it finally expired, causing complete pipeline stall.

**Fix**: 
- Identified new database credentials in Vercel environment
- Redeployed Vercel application with `vercel --prod`
- Updated Cloudflare Worker CRON_SECRET
- Manually triggered pipeline to clear 126-job backlog

**Files**: `.env.local` (updated DATABASE_URL and DIRECT_URL)

**Verification**: Pipeline restored, processing 73 discovery + 53 summarize jobs

---

### Pipeline Stall Investigation - Database Connection Pool Fix ✅ (2026-01-12)

Fixed pipeline stall caused by zombie database connections exhausting Supabase connection pool.

**Root Cause**: 16 database connections stuck in "idle in transaction" state (oldest: 1:42:43 idle) exhausting the connection pool, causing tier-aware cron endpoints to timeout.

**Fix**: Terminated all idle-in-transaction connections >5 minutes old using `pg_terminate_backend()`. Also previously applied fixes: BackgroundFilingWorker instantiation, async 202 pattern, and proper HMAC auth bypass.

**Files**: `app/api/cron/tier-aware/route.ts`

**Verification**: Connection pool restored (6 idle, 1 active), endpoints responding normally.

---

### GitHub Actions Workflow Updates ✅ (2026-01-12)

Updated GitHub Actions workflows to reflect the Phase 5-8 pipeline redundancy enhancements.

**Changes Made**:
- `cloudflare-worker-deploy.yml`: Added Three-Layer Redundancy Architecture section, new endpoints
- `monitoring-validation.yml`: Extended path triggers, enhanced pipeline health test

**Files Modified**: `.github/workflows/cloudflare-worker-deploy.yml`, `.github/workflows/monitoring-validation.yml`

---

### Pipeline Intervention Elimination Phases 5-8 ✅ (2026-01-11)
Three-layer pipeline redundancy implementation:
- **Phase 5**: Enhanced `/api/health/pipeline` with cron gap + orphan detection (14 tests)
- **Phase 6**: Auto-recovery integration with orphaned filing recovery (12 tests)
- **Phase 7**: Vercel cron final backup at `/api/cron/final-backup` (16 tests)
- **Phase 8**: Operations runbook at `docs/runbooks/pipeline-stall-recovery.md`
**Total Tests**: 42 passing

### clerkMiddleware API Fix ✅ (2026-01-11)
Updated `middleware.ts` to v6 API pattern with `createRouteMatcher()`.

### Critical Job Queue Database Bug Fix ✅ (2026-01-10)
**Root Cause**: Job queue importing `prisma` directly instead of `getPrismaClient()`.
**Fix**: Updated `lib/job-queue/index.ts` with `getPrismaClient()` calls.
**Impact**: Restored 394+ stuck jobs (44+ hours backlog).

---

## Archived Sessions (See TIMELINE.md for Full Details)

For complete technical details of projects older than 30 days, see the weekly archive files in `.claude/history/`:
- **December 2025**: 5 weekly archives with 100+ completed projects
- **November 2025**: 4 weekly archives
- **October 2025**: 2 weekly archives

Recent highlights include SEC filing quality enhancements, pipeline resilience improvements, dashboard redesigns, and comprehensive auth/onboarding flows. All archived projects maintain full technical documentation including root causes, implementation details, files modified, and verification results

---

*Last Updated: 2026-01-27 (GitHub Actions optimization session)*
*Completed projects older than 30 days are archived to .claude/history/ - See TIMELINE.md for complete historical context*