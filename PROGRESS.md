# Project Progress

**Date**: 2026-01-19
**Branch**: main
**Status**: Active - Onboarding Redirect Race Condition Fix Complete

---

## Current Session: Onboarding Redirect Race Condition Fix (2026-01-19)

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

## Recently Completed Sessions

### Pipeline Recovery - Zombie Connection Pool Exhaustion (2026-01-19)

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

## Recently Completed Sessions

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

## Recently Completed

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

## Recently Completed: Eliminate Manual Pipeline Intervention - Phases 5-8 (2026-01-11)

Completed final phases of the "Eliminate Manual Pipeline Intervention" plan implementing three-layer pipeline redundancy.

### Phase 5: Health Endpoint Enhancement ✅
Enhanced `/api/health/pipeline` with cron execution gap and orphaned filing detection.

**Changes**:
- Added `cronExecution` field: `lastExecution`, `minutesSinceLastCron`, `gapsDetected`
- Added `filings` field: `orphanedCount`, `unprocessedTotal`
- Status thresholds: DEGRADED at 15+ min gap, CRITICAL at 20+ min gap
- Orphaned filings (processed=false, no jobs, >10 min old) trigger DEGRADED

**Files Modified**: `app/api/health/pipeline/route.ts`
**Tests**: 14 passing in `__tests__/api/health/enhanced-pipeline-health.test.ts`

### Phase 6: Auto-Recovery Integration ✅
Enhanced `/api/cron/auto-recover` with orphaned filing recovery.

**Changes**:
- Added `OrphanedFilingDetector.checkAndRecover()` call in cleanup flow
- Recovers filings with `processed=false` and no associated jobs
- Creates ASYNC_SUMMARIZE_CACHED jobs for orphaned filings
- Fixed test mock to avoid triggering cleanup path before DEGRADED branch

**Files Modified**: `app/api/cron/auto-recover/route.ts`
**Tests**: 12 passing in `__tests__/cron/comprehensive-auto-recover.test.ts`

### Phase 7: Vercel Cron Final Backup ✅
Created `/api/cron/final-backup` as last-resort emergency trigger.

**Implementation**:
- Runs every 30 minutes via Vercel cron
- Checks for any pipeline execution in last 25 minutes
- If none found: sends emergency Slack alert + triggers tier-aware pipeline
- Logs execution with source `"final-backup"`

**Files Created**:
- `app/api/cron/final-backup/route.ts`
- `__tests__/cron/final-backup.test.ts` (16 tests)

**Files Modified**: `vercel.json` (added cron + function config)

### Phase 8: Documentation & Runbooks ✅
Created comprehensive operations documentation.

**Files Created**:
- `docs/runbooks/pipeline-stall-recovery.md` - Full operations runbook

**Files Modified**:
- `CLAUDE.md` - Added redundancy architecture, health/recovery commands
- `.claude/history/TIMELINE.md` - Added Phases 5-8 entries

**Total Tests**: 42 passing across all phases

---

## Recently Completed: clerkMiddleware API Fix (2026-01-11)

Fixed TypeScript error in `middleware.ts` using deprecated API pattern. Updated to v6 API pattern using `createRouteMatcher()`.

**Files Modified**: `middleware.ts`
**Verification**: ✅ TypeScript errors resolved

---

## Recently Completed: Critical Job Queue Database Bug Fix (2026-01-10)

Identified and resolved critical bug causing 394+ pending jobs to remain stuck despite multiple redeployments.

**Root Cause**: Job queue system was importing `prisma` directly instead of using `getPrismaClient()` function, resulting in undefined Prisma client during runtime. This caused all job creation and processing operations to fail silently.

**Error Evidence**:
```
Error adding job to queue: TypeError: Cannot read properties of undefined (reading 'create')
at Function.create (/lib/job-queue/index.ts:220:36)
```

**Solution**: 
- ✅ Updated `lib/job-queue/index.ts` to use `getPrismaClient()` instead of direct `prisma` import
- ✅ Replaced all 10+ `prisma.` calls with `getPrismaClient().` calls
- ✅ Vercel production deployment with fix completed
- ✅ E2E pipeline test successful - job creation now working

**Impact**: 
- 394 pending jobs (323 ASYNC_SUMMARIZE_CACHED + 71 ASYNC_DISCOVER_FILINGS)
- Jobs stuck for 44+ hours (oldest from 2026-01-09T01:16:47.107Z)
- Pipeline was accepting cron triggers but unable to create/process jobs

**Current Status**: Fix deployed to production, job creation restored, pending backlog ready for processing.

---

## Recently Completed: Summary Generation Quality Improvement

### Phase 5: Missing Extractors (SC 13G, SC 13D, 424B2) ✅ (2026-01-09)

**Goal**: Add data extractors for SC 13G (passive ownership), SC 13D (activist ownership), and 424B2 (prospectus supplement).

**Changes Made**:
1. Created 3 new data extractors:
   - `lib/email/sc13g-data-extractor.ts` - Passive beneficial ownership (>5%) extraction
   - `lib/email/sc13d-data-extractor.ts` - Activist beneficial ownership extraction with activist intent detection
   - `lib/email/424b2-data-extractor.ts` - Prospectus supplement (debt/equity/structured notes)

2. Key extraction features:
   - **SC 13G**: filerName, ownershipPercentage, sharesOwned, filingPurpose, isAmendment
   - **SC 13D**: filerName, ownershipPercentage, purpose, intentions[], isActivist, isGroupFiling
   - **424B2**: offeringType, offeringAmount, interestRate, maturityDate, linkedTo, underwriters[]

3. Updated `lib/email/extractor-registry.ts` (now supports 16 form types with aliases)

**Files Added**:
- `lib/email/sc13g-data-extractor.ts` (~240 lines)
- `lib/email/sc13d-data-extractor.ts` (~360 lines)
- `lib/email/424b2-data-extractor.ts` (~425 lines)
- `__tests__/email/extractors/sc13g-data-extractor.test.ts` (15 tests)
- `__tests__/email/extractors/sc13d-data-extractor.test.ts` (17 tests)
- `__tests__/email/extractors/424b2-data-extractor.test.ts` (16 tests)

**Verification**: ✅ 48 Phase 5 tests passing, 149 total extractor tests

**Next Step**: Plan complete - all phases implemented

### Fix Orphaned Filings Pipeline ✅ VERIFIED AND WORKING (2026-01-09)

**Plan**: [2026-01-08-fix-orphaned-filings-pipeline.md](docs/plans/2026-01-08-fix-orphaned-filings-pipeline.md)

**Root Cause**: Discovery handler only checked RSS feeds, not `processed=false` entries in RssFilingCheck table. When 3-phase pipeline is enabled, legacy backlog processing code is never reached.

**Fix**: Added STEP 3.5 to discovery-handler.ts - calls `getUnprocessedFilings(50)` after RSS check, merges with RSS results (deduplicating by accessionNumber), and marks filings as processed after job creation.

**Schema Fixes Applied During Verification**:
- Added `scheduledFor: new Date()` - Required field in JobQueue schema
- Changed `maxAttempts` → `maxRetries` - Correct field name per schema

**Files Modified**:
- `lib/cron/handlers/discovery-handler.ts` - Unprocessed filing recovery + schema field fixes

---

*Last Updated: 2026-01-16 (Email Template Type Errors Fix + SEC Summary Quality Phase 2 Complete)*
*Older completed projects archived to .claude/history/ - See TIMELINE.md for full history*