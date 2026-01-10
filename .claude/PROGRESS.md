# Project Progress

**Date**: 2026-01-10
**Branch**: onboarding
**Status**: Auth-First Onboarding Flow Implementation - ALL PHASES COMPLETE ✅

---

## Current Session: Auth-First Onboarding Flow (2026-01-10)

Implementing authentication-first onboarding per plan at `docs/plans/2026-01-10-auth-first-onboarding.md`. Transforming from "passwordless-first" to "auth-first" approach.

### Phase 6: Onboarding Performance Optimization ✅ (2026-01-10)

**Problem Identified**: User reported onboarding taking too long with "Setting up your account..." spinner showing many Clerk API requests in Network tab. User never reached /dashboard.

**Root Cause Analysis**:
- `handleCompleteOnboarding()` made sequential server action calls:
  - `saveUserPreferences()` - 2 Clerk + 2 DB calls
  - `addTickerSubscription()` x N - 2 Clerk + 3 DB calls EACH
  - `completeOnboarding()` - 2 Clerk + 2 DB + Clerk Admin API
  - `sendWelcomeEmail()` - DUPLICATE: 2 Clerk + 2 DB + Clerk Admin API
- Total for 5 tickers: ~15 Clerk API calls, ~15 DB queries, 2x Clerk Admin API

**Solution Implemented**:
1. Created `completeOnboardingBatched()` server action in `app/(auth)/onboarding/actions.ts`:
   - Single `auth()` call
   - Single `currentUser()` call
   - Prisma `$transaction` for all DB operations
   - `createMany` for batched ticker creation
   - Fire-and-forget Clerk metadata update (non-blocking)
   - Async welcome email via `queueWelcomeEmail()` (non-blocking)

2. Created `queueWelcomeEmail()` in `lib/email/welcome-service.ts`:
   - Takes pre-fetched user data (no redundant auth/DB calls)
   - Uses `setImmediate()` for true async execution
   - Doesn't block the user from reaching dashboard

3. Updated `app/(auth)/onboarding/page.tsx`:
   - Replaced 3+ sequential server action calls with single `completeOnboardingBatched()`
   - Reduced from ~15 Clerk + ~15 DB calls to 2 Clerk + 1 DB transaction

**Performance Improvement**:
- Before: ~30+ sequential API calls (blocking)
- After: 2 Clerk + 1 DB transaction (blocking), rest async

**Files Modified**:
- `app/(auth)/onboarding/actions.ts` - Added `completeOnboardingBatched()`
- `lib/email/welcome-service.ts` - Added `queueWelcomeEmail()`
- `app/(auth)/onboarding/page.tsx` - Use batched function

**Verification**: ✅ Build passes, lint passes

### Phase 1: Remove Skip Setup Buttons and Step 3 ✅ (2026-01-10)

**Changes Made**:
1. Removed all 3 "Skip Setup" buttons from onboarding steps
2. Removed Step 3 (EmailStep) - Clerk handles email collection at sign-up
3. Updated to 2-step flow (sectors → companies → complete)
4. Updated `completeOnboarding()` to set `onboardingCompleted: true` in DB and Clerk metadata
5. Changed button text on Step 2 from "Continue" to "Complete Setup"

**Files Modified**:
- `app/(auth)/onboarding/page.tsx` - Removed skip buttons, EmailStep, updated to 2-step flow
- `app/(auth)/onboarding/actions.ts` - Added onboardingCompleted flag setting and Clerk metadata sync

**Verification**: ✅ Build passes, lint passes

### Phase 2: Update Landing Page CTAs ✅ (2026-01-10)

**Changes Made**:
1. Implemented 3-state CTA logic across all landing page components:
   - State 1: Unauthenticated → `/sign-up`
   - State 2: Authenticated but not onboarded → `/onboarding`
   - State 3: Authenticated and onboarded → `/dashboard`

2. Updated hero section CTAs with dynamic text:
   - Unauthenticated: "Get Summaries Like This"
   - Authenticated not onboarded: "Complete Setup"
   - Onboarded: "Go to Dashboard"

3. Updated pricing section with 3-state checkout logic:
   - Passes plan & interval params to sign-up/onboarding
   - Only triggers Stripe checkout for onboarded users

4. Updated navbar CTA button with consistent 3-state logic

**Files Modified**:
- `components/landing/sections-v2/gmail-inbox-hero.tsx` - Hero CTA, EmailDetailPanel footer
- `components/landing/sections-v2/pricing-section-v2.tsx` - handleCheckout, getCtaText functions
- `components/landing/landing-navbar.tsx` - ctaButton logic

**Verification**: ✅ Build passes, lint passes, Playwright E2E tests pass

### Phase 3: Implement Middleware Redirects ✅ (2026-01-10)

**Changes Made**:
1. Removed `/onboarding`, `/api/onboarding/check-email`, `/api/onboarding/save-pending` from public routes
2. Added middleware logic in Clerk callback to handle 3 redirect scenarios:
   - Unauthenticated user at `/onboarding` → `/sign-up`
   - Authenticated non-onboarded user at `/dashboard` → `/onboarding`
   - Authenticated onboarded user at `/onboarding` → `/dashboard`
3. Uses `sessionClaims.publicMetadata.onboardingCompleted` for status check

**Files Modified**:
- `middleware.ts` - Removed public routes, added onboarding redirect logic in Clerk callback

**Verification**: ✅ Build passes, lint passes

### Phase 4: Simplify Clerk Webhook ✅ (2026-01-10)

**Changes Made**:
1. Simplified `user.created` handler to always set `onboardingCompleted: false`
2. Removed all PendingOnboarding lookup and merge logic
3. Removed clerkClient import (no longer needed for metadata sync in webhook)
4. Deprecated 3 pending onboarding API routes with 410 Gone responses:
   - `/api/onboarding/save-pending`
   - `/api/onboarding/check-email`
   - `/api/onboarding/merge-pending`

**Files Modified**:
- `app/api/webhook/clerk/route.ts` - Simplified user.created handler
- `app/api/onboarding/save-pending/route.ts` - Deprecated
- `app/api/onboarding/check-email/route.ts` - Deprecated
- `app/api/onboarding/merge-pending/route.ts` - Deprecated

**Verification**: ✅ Build passes, lint passes

### Phase 5: End-to-End Testing ✅ (2026-01-10)

**Changes Made**:
1. Created comprehensive E2E test file `__tests__/e2e/auth-first-onboarding.test.ts`
2. Tests cover 21 scenarios across:
   - Unauthenticated user protection (redirects from /onboarding → /sign-up)
   - Dashboard protection (Clerk middleware)
   - Landing page CTA states (3-state logic verification)
   - Onboarding page structure (2-step flow, no skip buttons)
   - Navigation and public page access
   - Deprecated API endpoints returning 410 Gone
   - Mobile responsiveness
   - Edge cases (trailing slashes, nested routes)

**Files Added**:
- `__tests__/e2e/auth-first-onboarding.test.ts` - 21 E2E tests using Playwright

**Verification**: ✅ All 21 tests passing, build passes, lint passes

### Implementation Summary

**All 6 phases complete.** The auth-first onboarding flow is now fully implemented:
- Users must authenticate before accessing onboarding
- Onboarding is a 2-step flow (sectors → companies)
- No "Skip Setup" buttons - users must complete onboarding
- CTAs on landing page use 3-state logic based on auth + onboarding status
- Middleware enforces proper redirects for all user states
- Deprecated passwordless flow endpoints return 410 Gone
- **Performance optimized**: ~30 sequential API calls → 2 blocking + async (Phase 6)

---

## Previous Session: Pipeline Redeployment & Backlog Recovery ✅ (2026-01-10)

Successfully resolved critical pipeline stall affecting 400+ pending jobs. Both Vercel and Cloudflare Worker redeployed to restore processing.

**Root Cause**: Pipeline processing endpoints weren't picking up pending jobs, causing 12:30 PM AEST event drop with 231+ stuck jobs.

**Solution**: 
- ✅ Vercel redeployment with latest code
- ✅ Cloudflare Worker redeployment (version c177792f)
- ✅ Pipeline restoration - jobs actively processing

## Previous Session: Eliminate Manual Pipeline Intervention ✅ (2026-01-09 - 2026-01-10)

### Phase 1: Persistent Recovery State - COMPLETE

**Goal**: Store auto-recovery state in database to survive Vercel deployments.

**Problem Solved**: Previously, in-memory recovery state would reset on every Vercel deployment, causing:
- False healthy signals after deploys during ongoing incidents
- Reset of consecutiveDegraded counters before action thresholds reached
- Loss of cleanup/redeploy history

**Implementation**:

1. **Database Schema** (`prisma/schema.prisma`):
   - Added `RecoveryState` model in `pipeline` schema
   - Singleton pattern with `id='singleton'` default
   - Fields: `consecutiveDegraded`, `consecutiveCleanups`, `consecutiveRedeploys`
   - Timestamps: `lastCleanupTime`, `lastRedeployTime`, `lastHealthyTime`, `lastDegradedTime`

2. **RecoveryStateService** (`lib/cron/recovery-state-service.ts`):
   - Singleton pattern in database with in-memory caching
   - Methods: `getState()`, `incrementConsecutiveDegraded()`, `recordCleanup()`, `recordRedeploy()`, `resetOnHealthy()`, `reset()`, `clearCache()`
   - Uses upsert for all operations to handle missing row gracefully

3. **Auto-Recover Route** (`app/api/cron/auto-recover/route.ts`):
   - Replaced in-memory `recoveryState` object with `RecoveryStateService`
   - Changed `_resetRecoveryStateForTesting` from sync to async
   - All state operations now persist to database

4. **Test Updates**:
   - `__tests__/cron/persistent-recovery-state.test.ts` - 8 unit tests for RecoveryStateService
   - `__tests__/api/cron/auto-recover-proactive.test.ts` - Dynamic mock simulating DB state changes
   - `__tests__/api/cron/auto-recover.test.ts` - Added recoveryState mock
   - `__tests__/setup.js` - Shared mock Prisma client with recoveryState model

**Verification**:
- 32 auto-recover tests passing
- 8 RecoveryStateService tests passing
- Build compiles successfully
- Lint passes with no warnings
- Database migration applied (RecoveryState table created in pipeline schema)

**Commit**: `7db077d` on `feature/eliminate-manual-pipeline-intervention`

**Plan Reference**: `docs/plans/2026-01-09-eliminate-manual-pipeline-intervention.md`

### Phase 2: Cron Execution Gap Detection - COMPLETE

**Goal**: Detect and alert when cron executions have unexpected gaps (>15 minutes).

**Problem Solved**: Previously, Cloudflare Worker failures went unnoticed for hours:
- No monitoring of cron execution history
- Silent failures of the primary worker
- Manual discovery of pipeline stalls

**Implementation**:

1. **CronExecutionGapDetector** (`lib/cron/execution-gap-detector.ts`):
   - Detects gaps between cron executions
   - Detects when no recent executions exist
   - Rate-limited alerting (30-minute cooldown)
   - Configurable thresholds via environment variables

2. **Gap Types**:
   - `gap-between-executions`: Gap detected between two recorded executions
   - `no-recent-executions`: Gap from last execution to now

3. **Environment Variables**:
   - `GAP_LOOKBACK_MINUTES`: How far back to look (default: 60)
   - `GAP_THRESHOLD_MINUTES`: Minimum gap to detect (default: 15)
   - `GAP_ALERT_COOLDOWN_MINUTES`: Cooldown between alerts (default: 30)

**Files Added**:
- `lib/cron/execution-gap-detector.ts` - CronExecutionGapDetector class
- `__tests__/cron/execution-gap-detector.test.ts` - 14 tests

**Verification**: ✅ 14 tests passing, build passes, lint passes

### Phase 3: Orphaned Filing Detection - COMPLETE

**Goal**: Detect and recover filings with `processed=false` but no corresponding JobQueue entries.

**Problem Solved**: Previously, orphaned filings were never recovered:
- Discovery creates filing but pipeline stalls before creating job
- Jobs deleted or failed without being recreated
- Database inconsistency between SecFiling and JobQueue tables

**Implementation**:

1. **OrphanedFilingDetector** (`lib/cron/orphaned-filing-detector.ts`):
   - Detects unprocessed filings older than threshold without jobs
   - Creates ASYNC_FETCH_FILING jobs for orphaned filings
   - Rate-limited alerting (30-minute cooldown)
   - Configurable thresholds via environment variables

2. **Key Features**:
   - Age threshold: Only considers filings older than 10 minutes (configurable)
   - Recovery limit: Max 50 filings per cycle (configurable)
   - Higher priority (5) for recovery jobs
   - Source tracking: `orphaned-filing-recovery`

3. **Environment Variables**:
   - `ORPHAN_AGE_THRESHOLD_MINUTES`: How old filing must be (default: 10)
   - `ORPHAN_RECOVERY_LIMIT`: Max filings per cycle (default: 50)
   - `ORPHAN_ALERT_COOLDOWN_MINUTES`: Cooldown between alerts (default: 30)

**Files Added**:
- `lib/cron/orphaned-filing-detector.ts` - OrphanedFilingDetector class
- `__tests__/cron/orphaned-filing-detector.test.ts` - 17 tests

**Verification**: ✅ 17 tests passing, 39 total Phase 1-3 tests passing, build passes, lint passes

### Phase 4: External Watchdog Worker - COMPLETE

**Goal**: Create independent external monitoring and backup triggering.

**Problem Solved**: Previously, when primary Cloudflare Worker failed, there was no automatic detection or backup:
- No external health monitoring
- No backup triggering mechanism
- Single point of failure in cron execution

**Implementation**:

1. **WatchdogLogic** (`lib/cloudflare-watchdog/watchdog-logic.ts`):
   - Health check against pipeline health endpoint
   - Consecutive failure tracking with configurable thresholds
   - Backup trigger decision logic (3 failures OR 20+ min without success)
   - Slack alert formatting for different scenarios

2. **Cloudflare Watchdog Worker** (`cloudflare-watchdog/`):
   - Independent worker for separate Cloudflare account
   - Runs every 10 minutes (offset from primary by 5 min)
   - KV storage for state persistence
   - HTTP endpoints: `/status`, `/trigger`, `/check`

3. **Backup Trigger Endpoint** (`app/api/cron/backup-trigger/route.ts`):
   - Authorization via `BACKUP_TRIGGER_SECRET`
   - Mutual exclusion: skips if primary ran within 10 minutes
   - Queues discovery job same as primary tier-aware route
   - Logs execution for monitoring

4. **Key Features**:
   - 3 consecutive failures triggers backup
   - 20+ minutes without success + 2 failures triggers backup
   - Mutual exclusion prevents duplicate pipeline runs
   - Slack alerts for warnings, failures, and recovery

**Files Added**:
- `lib/cloudflare-watchdog/watchdog-logic.ts` - Core watchdog logic
- `cloudflare-watchdog/index.js` - Cloudflare Worker
- `cloudflare-watchdog/wrangler.toml` - Worker configuration
- `app/api/cron/backup-trigger/route.ts` - Backup trigger endpoint
- `__tests__/cloudflare-watchdog/watchdog-logic.test.ts` - 27 tests

**Environment Variables Required**:
- `BACKUP_TRIGGER_SECRET`: Auth token for watchdog to trigger backup

**Verification**: ✅ 27 tests passing, 66 total Phase 1-4 tests passing, build passes, lint passes

---

## Recently Completed

### Fix Orphaned Filings Pipeline (2026-01-09)

**Issue**: Pipeline stalled after discovering filings but before creating jobs.

**Root Cause**: Discovery backlog recovery was re-queuing filings that had been processed in previous cycles.

**Fix**: Added `unprocessedOnly` flag to discovery handler that filters out filings with existing summaries.

**Files**: `lib/cron/handlers/discovery-handler.ts`, schema updates for backlog tracking

### Pipeline Incident - Cloudflare Worker Cron Gap (2026-01-09)

**Issue**: Pipeline job processing dropped for ~3 hours (01:45 UTC to 04:57 UTC).

**Root Cause**: Cloudflare Worker stopped triggering cron executions.

**Resolution**: Redeployed Cloudflare Worker (`cd cloudflare-cron && npx wrangler deploy`)

### Summary Generation Accuracy Improvements (2026-01-07)

Implemented improvements to summary generation workflow accuracy and consistency per plan at `docs/plans/2026-01-06-improve-summary-generation-accuracy.md`. **All 4 phases complete with 101 tests passing.**

### Phase 1: Form 4 Trust Transfer Fix ✅ (2026-01-07)

**Issue**: Trust transfers incorrectly categorized as purchases due to missing J/K transaction code handling.

**Changes Made**:
1. Added transfer pattern detection in `lib/email/form4-data-extractor.ts`
2. Updated transaction code mapping (J→Trust Transfer, K→Family Transfer)
3. Added blue color coding (#3B82F6) for transfers in `form4-minimalist-template.tsx`
4. Fixed temperature inconsistency in `lib/ai/summarize.ts` (0.3→0.2)

**Files Modified**:
- `lib/email/form4-data-extractor.ts` - Transfer patterns, code mapping, signal assessment
- `components/ui/email/templates/form4-minimalist-template.tsx` - Transfer color coding
- `lib/ai/summarize.ts` - Temperature standardization
- `__tests__/email/form4-transfer-detection.test.ts` - NEW: 12 tests
- `__tests__/email/form4-template-rendering.test.ts` - NEW: 8 tests

**Verification**: ✅ 20 tests passing

### Phase 2: Code Cleanup and Consolidation ✅ (2026-01-07)

**Issue**: Deprecated code and temperature inconsistencies affecting summary quality.

**Changes Made**:
1. Removed deprecated `lib/ai/sec-prompts.js`
2. Removed `services/filing/backup/` directory
3. Removed legacy test files (test-claude-summarization.*, tests/test-sec-filings.*)
4. Removed backup configs (wrangler.toml.backup, backup/stripe-implementation/)
5. Standardized temperature to 0.2 in `enhanced-claude-client.ts` and `aiSummarizer.ts`
6. Added @deprecated JSDoc to `getClaudeModel()` in `lib/ai/config.ts`

**Files Modified/Removed**:
- REMOVED: `lib/ai/sec-prompts.js`, `services/filing/backup/`, legacy test files
- `lib/ai/enhanced-claude-client.ts` - Temperature 0.3→0.2
- `services/filings/enhanced/aiSummarizer.ts` - Temperature 0.3→0.2
- `lib/ai/config.ts` - @deprecated comment on getClaudeModel()
- `__tests__/ai/configuration-consistency.test.ts` - NEW: 11 tests

**Verification**: ✅ 11 tests passing, build passes, lint passes

### Phase 3: Template and Email Consistency ✅ (2026-01-07)

**Issue**: Email subject lines inconsistent between individual and digest emails; template registry missing 8-K mappings.

**Changes Made**:
1. Created `lib/email/subject-service.ts` - Centralized EmailSubjectService for consistent subject lines
2. Created `lib/email/template-registry.ts` - Centralized TemplateRegistry with O(1) Map-based lookup
3. Updated `services/filings/email/emailGenerator.ts` to use EmailSubjectService for digest emails
4. Updated `lib/email/notification-service.ts` to use EmailSubjectService for individual filing emails
5. Added 8-K template mappings to `components/email/templates/template-registry.ts`

**Subject Line Patterns**:
- Individual: `New [FormType] Filing: [Company] ([Ticker])`
- Digest: `SEC Filing Summaries - [M/D/YYYY]`

**Files Modified/Added**:
- NEW: `lib/email/subject-service.ts` - EmailSubjectService with validation
- NEW: `lib/email/template-registry.ts` - TemplateRegistry class with O(1) lookup
- NEW: `__tests__/email/subject-line-consistency.test.ts` - 16 tests
- NEW: `__tests__/email/template-selection.test.ts` - 33 tests
- `services/filings/email/emailGenerator.ts` - Use EmailSubjectService
- `lib/email/notification-service.ts` - Use EmailSubjectService
- `components/email/templates/template-registry.ts` - Added 8-K mappings

**Verification**: ✅ 49 tests passing, build passes, lint passes

### Phase 4: Quality Assurance and Testing ✅ (2026-01-07)

**Goal**: Comprehensive integration tests to ensure workflow accuracy and prevent regressions.

**Changes Made**:
1. Created `__tests__/integration/summary-generation-workflow.test.ts` - E2E workflow tests
2. Created `__tests__/regression/summary-quality-regression.test.ts` - Regression prevention tests
3. Added test helpers and sample data fixtures for Form 4 transaction types
4. Validated all previous phases with comprehensive test coverage

**Files Added**:
- NEW: `__tests__/integration/summary-generation-workflow.test.ts` - 12 integration tests
- NEW: `__tests__/regression/summary-quality-regression.test.ts` - 9 regression tests

**Verification**: ✅ 101 total tests passing across all phases, build passes, lint passes

### Phase 1: Schema Alignment Foundation ✅ (2026-01-07)

**Goal**: Fix field name mismatches between AI prompts and email templates.

**Changes Made**:
1. Updated 10-K schema: `keyHighlights` → `financialHighlights` (object array with label/value/change), renamed `risks` → `riskFactors`, added `segments` and `keyPoints` arrays
2. Updated 10-Q schema: Added `financialHighlights` with `qoqChange`, `quarterlyTrends`, `guidanceUpdates`, `riskFactors`
3. Updated Form 4 schema: `relationship` → `filerRole` (consistency with Form 144)
4. Extracted common sub-schemas: `FINANCIAL_HIGHLIGHT_ITEM`, `SEGMENT_ITEM`, `RISK_FACTOR_ITEM`, `KEY_POINT_ITEM`
5. Updated existing tests in `bulletproof-prompts.test.ts` for new field names

**Files Modified/Added**:
- `lib/ai/prompts/unified-prompts.ts` - Schema updates and common sub-schema extraction
- `__tests__/ai/prompts/schema-alignment.test.ts` - NEW: 28 schema alignment tests
- `__tests__/ai/prompts/bulletproof-prompts.test.ts` - Updated for new field names

**Verification**: ✅ 28 schema tests passing, 89 total prompt tests passing, build passes, lint passes

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

### Phase 4: Reddit Filing Types Coverage ✅ (2026-01-08)

**Goal**: Add dedicated prompt schemas, templates, and extractors for S-1, S-3, DEF 14A, and Form 11-K.

---

## Previous Session: Summary Generation Accuracy Improvements ✅ (2026-01-07)

Implemented improvements to summary generation workflow accuracy and consistency per plan at `docs/plans/2026-01-06-improve-summary-generation-accuracy.md`. **All 4 phases complete with 101 tests passing.**

**Phases**:
- Phase 1: Form 4 Trust Transfer Fix (J/K transaction codes, blue color coding)
- Phase 2: Code Cleanup and Consolidation (removed deprecated files, temperature 0.2)
- Phase 3: Template and Email Consistency (EmailSubjectService, TemplateRegistry)
- Phase 4: Quality Assurance and Testing (integration + regression tests)

---

## Previous Session: Dashboard UI Improvements ✅ (2026-01-05)

Implemented UI improvements to dashboard: dialog backgrounds, pagination styling, filing preferences modal, loading skeleton.
**Files**: `dashboard-client.tsx`, `ticker-settings-dropdown.tsx`, `inline-add-row.tsx`

---

*Last Updated: 2026-01-10*
*Older completed projects archived to .claude/history/ - See TIMELINE.md for full history*
