# Project Progress

**Date**: 2026-02-07
**Branch**: feature/pipeline-resilience-zero-intervention
**Status**: Agent Guidelines + Context Management

---

## Current Session: CLAUDE.md Agent Guidelines + Feedback Loop ✅ (2026-02-07)

**Goal**: Create a feedback loop so future agents don't repeat past mistakes.

**Problem Identified**: CLAUDE.md documented project architecture and commands but lacked agent-specific guidance. When agents made mistakes (wrong imports, guessed file paths, skipped tests), there was no mechanism to capture these learnings.

**Fixes Applied**:

1. **Added Agent Guidelines Section to CLAUDE.md** (lines 20-48):
   - `### Common Mistakes to Avoid` - 6 actionable rules with HTML comment noting updates come via `/intentional-compact`
   - `### Pattern References` - Table of exemplar files for API routes, services, database access, etc.
   - `### Pre-Implementation Checklist` - Quick checks before writing code

2. **Added Step 6 to intentional-compact.md** (lines 219-250):
   - "Capture Lessons Learned for CLAUDE.md" step
   - Reviews session for agent mistakes
   - Updates CLAUDE.md Agent Guidelines when patterns emerge
   - Reports what was captured

3. **Updated Common Failure Modes** (lines 322-323):
   - Added `6. Skipping Step 6` - Reminder to update CLAUDE.md
   - Added `7. Vague guideline entries` - Entries must be actionable

**Files Modified**:
- `CLAUDE.md` - Added Agent Guidelines section (~30 lines)
- `.claude/commands/intentional-compact.md` - Added Step 6 + failure modes (~35 lines)

**Verification**:
- ✅ CLAUDE.md now has Agent Guidelines section
- ✅ intentional-compact.md has Step 6 for lessons learned
- ✅ Feedback loop documented: mistake → /intentional-compact → CLAUDE.md update → future agents

**Impact**: Future agents will read Agent Guidelines before implementation and avoid documented mistakes.

---

## Previous Session: Unified Subscription Tiers + Billing Downgrade Fix ✅ (2026-01-28)

**Issue 1**: 405 PUT errors when trying to downgrade from MAX plan on billing page.

**Root Cause**: `/api/user/subscription` route only had GET and POST handlers - missing PUT handler for plan changes and cancellation toggles.

**Issue 2**: Prisma enum mismatch between `SubscriptionTier` (FREE/PROFESSIONAL/ENTERPRISE/INSTITUTION/HOBBY/PRO) and `PlanType` (FREE/PRO/MAX).

**Root Cause**: Two different enums required mapping function `mapPlanToSubscriptionTier()` to convert between them, causing type complexity.

**Fixes Applied**:

1. **Added PUT Handler** (`app/api/user/subscription/route.ts`):
   - Cancellation toggle: Updates `cancelAtPeriodEnd` in both Stripe and database
   - Downgrade to FREE: Cancels Stripe subscription at period end
   - Downgrade between paid plans (MAX→PRO): Updates Stripe subscription with proration
   - Upgrades: Returns 400 with `action: 'checkout'` to redirect to Stripe checkout

2. **Enhanced Billing Page** (`app/dashboard/billing/page.tsx`):
   - For upgrades: Direct POST to create checkout session
   - For downgrades: Use PUT to update subscription
   - Shows success toast messages on plan changes
   - Handles `action: 'checkout'` response from API

3. **Unified Subscription Enums** (`prisma/schema.prisma`):
   - Changed `SubscriptionTier` from `FREE/PROFESSIONAL/ENTERPRISE/INSTITUTION/HOBBY/PRO` to `FREE/PRO/MAX`
   - Now matches `PlanType` enum exactly - no mapping needed
   - Removed `mapPlanToSubscriptionTier()` function

4. **Data Migration** (`scripts/migrate-to-unified-tiers.ts`):
   - Migrated HOBBY→FREE (1 user)
   - Would migrate INSTITUTION/PROFESSIONAL/ENTERPRISE→PRO (none found)
   - Final distribution: 2 FREE users, 1 PRO user

5. **Updated Tier Normalization** (`lib/cron/tier-eligibility.ts`):
   - Maps PRO/MAX → PRO processing tier (5-minute frequency)
   - Maps FREE → HOBBY processing tier (120-minute frequency)
   - Maintains backwards compatibility with legacy tier names

**Files Modified**:
- `app/api/user/subscription/route.ts` - Added PUT handler, removed mapping function
- `app/dashboard/billing/page.tsx` - Enhanced plan change logic
- `prisma/schema.prisma` - Unified `SubscriptionTier` enum to FREE/PRO/MAX
- `lib/cron/tier-eligibility.ts` - Updated normalization with new tiers
- `scripts/migrate-to-unified-tiers.ts` - Created data migration script

**Verification**:
- ✅ Prisma client generated successfully
- ✅ No TypeScript errors on subscription routes
- ✅ Data migration completed (1 HOBBY→FREE user)
- ✅ Lint passes without tier-related errors

**Benefits**:
- **Type Safety**: No more mapping errors between enums
- **Simplicity**: Single source of truth for subscription tiers
- **Consistency**: Stripe plans and database tiers use identical values
- **Backwards Compatibility**: Legacy tier names still work through normalization

---

## Previous Session: Pipeline Stall Recovery + Throughput Optimization ✅ (2026-01-28)

**Issue**: Pipeline stalled for 12+ hours (731 minutes since last completion) with 799 pending jobs and 0 processing. After initial recovery, throughput was only 12 jobs/hour (73 hours to clear backlog).

**Root Causes Identified**:

1. **vercel.json Invalid JSON**: Trailing commas on lines 32 and 122 made the file invalid JSON
   - Line 32: After `email/welcome/route.ts` config block
   - Line 122: After last item in `rewrites` array
   - Impact: Could cause Vercel deployment/configuration failures

2. **Cloudflare Worker Crons Not Firing**: Worker crons had stopped executing
   - `cronExecution.lastExecution: null` in health endpoint
   - `cronExecution.gapsDetected: 1`
   - Resolution: Redeployed worker with `wrangler deploy`

3. **CRON_SECRET Sync**: Re-synced 80-character secret to ensure Cloudflare and Vercel match

4. **Low Summarize Throughput**: `ASYNC_SUMMARIZE_CACHED` batch size = 1 (intentional due to 30-270s AI processing time), but only triggered every 5 minutes = 12 jobs/hour max

**Fixes Applied**:

1. **Fixed vercel.json** - Removed trailing commas (lines 32, 122)
2. **Redeployed Cloudflare Worker** - Restored cron schedule execution
3. **Synced CRON_SECRET** - Used `wrangler secret put` to update Cloudflare Worker
4. **Added Dedicated Summarize Cron** - New */3 cron for summarize-only processing
   - Replaced */10 interval Slack summary (less critical) with */3 summarize-only
   - New cron schedule: `*/3, */5, */15, daily` (4 crons, under Cloudflare 5-limit)
   - Created `handleSummarizeOnly()` handler in index.js
5. **Manual Backlog Processing** - Triggered 50+ manual summarize batches

**Throughput Improvement**:
- Before: 12 summarize jobs/hour (only from */5 pipeline)
- After: ~32 summarize jobs/hour (*/3 summarize-only + */5 pipeline)
- Effective: 130+ completions/hour observed

**Recovery Results**:
- Status: CRITICAL → HEALTHY
- minutesSinceLastCompletion: 731 → 0
- completedLast1h: 0 → 130+
- Backlog: 880 → 719 (clearing at ~130/hour)
- cronExecution.gapsDetected: 1 → 0

**Files Modified**:
- `vercel.json` - Fixed invalid JSON (trailing commas)
- `cloudflare-cron/wrangler.toml` - Added */3 summarize cron, removed */10 Slack summary
- `cloudflare-cron/index.js` - Added `handleSummarizeOnly()` handler

**Verification**:
- ✅ HMAC authentication working (HTTP 202)
- ✅ Cloudflare Worker deployed with optimized cron schedules
- ✅ Jobs completing at 130+/hour (was 12/hour)
- ✅ Pipeline status HEALTHY

---

## Previous Session: Unsent Email Recovery ✅ (2026-01-27)

**Issue**: 47 completed summaries had `sentToUser: false` - emails never delivered.

**Investigation Findings**:
- 756 summaries with null `processingStatus` are LEGACY records (already sent before status tracking added)
- 47 COMPLETED summaries with `sentToUser: false` were the actual backlog
- All 47 had identical `processingCompletedAt` timestamp (2026-01-02T08:16:56.190Z) - indicating bulk status update
- Original creation dates: Nov 28 (23), Dec 15 (17), Dec 26 (5), Jan 1 (2)
- Root cause: Bulk migration to COMPLETED status didn't trigger email delivery

**Scripts Created**:
- `scripts/investigate-unsent.ts` - Analyze unsent summaries metadata, model versions, date distribution
- `scripts/resend-unsent-emails.ts` - Resend emails with tracking updates and delivery records

**Results**:
- ✅ 46 emails sent successfully
- ⚠️ 1 skipped (orphaned ticker - user deleted the ticker)
- ✅ Database updated: `sentToUser: true`, `totalEmailsSent` incremented
- ✅ SummaryEmailDelivery records created for audit trail

**Usage**: `npx tsx scripts/resend-unsent-emails.ts [--dry-run] [--limit=N]`

---

## Previous Session: TickerMonitoring Root Cause Fix ✅ (2026-01-27)

**Issue**: SEC filing discovery silently skipping all tickers because TickerMonitoring table was empty.

**Root Cause Discovered**:
The 3-phase async pipeline (default since 2025-12-24) bypassed the code path that creates TickerMonitoring records:
1. **Legacy pipeline** (`runSecFilingMonitoring()`) calls `getActiveTickersForMonitoring()` which **UPSERTS** TickerMonitoring records
2. **3-phase pipeline** (`handleDiscovery()`) only called `checkForNewFilings()` which **READS** from TickerMonitoring
3. `checkForNewFilings()` silently skips any ticker without a TickerMonitoring record (line 90-97 in sec-filing-service.ts)
4. Result: Discovery phase found 0 filings because there were no TickerMonitoring records to check

**Critical Code Path Analysis**:
- `sec-filing-service.ts:90-97` - Silent skip: `if (!tickerMonitoring) { continue; }`
- `sec-filing-service.ts:156-221` - `runSecFilingMonitoring()` calls `getActiveTickersForMonitoring()` (UPSERTS)
- `ticker-monitoring.ts:31-168` - `getActiveTickersForMonitoring()` upserts via `upsertTickerMonitoringWithLock()`
- `tier-aware/route.ts:155-157` - 3-phase became default on 2025-12-24

**Fixes Applied**:

1. **Discovery Handler Fix** (`lib/cron/handlers/discovery-handler.ts`):
   - Added call to `getActiveTickersForMonitoring()` at start of discovery phase
   - Ensures TickerMonitoring records are created BEFORE RSS checking
   - Lines 244-254: New STEP 1 with logging

2. **Health Endpoint Enhancement** (`app/api/health/pipeline/route.ts`):
   - Added `tickerMonitoring` section to health response
   - Detects empty TickerMonitoring table as CRITICAL status
   - Reports: totalRecords, activeRecords, userTickersWithoutMonitoring, missingTickers

3. **Database Cleanup** - Removed duplicate GOOG ticker (user already had GOOGL tracked)

**Verification**:
- ✅ 15/15 user tickers now have TickerMonitoring records
- ✅ 15/15 user tickers have CikMapping records
- ✅ Health endpoint reports HEALTHY status with tickerMonitoring metrics
- ✅ TypeScript compilation passes for modified files

**Files Modified**:
- `lib/cron/handlers/discovery-handler.ts` - Added `getActiveTickersForMonitoring()` call at discovery start
- `app/api/health/pipeline/route.ts` - Added TickerMonitoring health check section

**Impact**: Pipeline will now correctly discover filings for all tracked tickers instead of silently skipping them all

---

## Recently Completed Sessions

### GitHub Actions Minutes Optimization ✅ (2026-01-27)

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

## Archived Sessions (See TIMELINE.md for Full Details)

For complete technical details of projects older than 30 days, see the weekly archive files in `.claude/history/`:
- **December 2025**: 5 weekly archives with 100+ completed projects
- **November 2025**: 4 weekly archives
- **October 2025**: 2 weekly archives

Recent highlights include SEC filing quality enhancements, pipeline resilience improvements, dashboard redesigns, and comprehensive auth/onboarding flows. All archived projects maintain full technical documentation including root causes, implementation details, files modified, and verification results.

---

*Last Updated: 2026-02-07 (Agent Guidelines + intentional-compact feedback loop)*
*Completed projects older than 30 days are archived to .claude/history/ - See TIMELINE.md for complete historical context*
