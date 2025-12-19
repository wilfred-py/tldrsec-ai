# Current Progress: tldrsec-ai Pipeline Operations

## Current Status
**Date**: 2025-12-19
**Branch**: feat/supabase-migration
**Status**: Pipeline Operational ✅ | Supabase Migration Phase 1 Complete

---

## Current Session: Supabase Database Migration

### Phase 1: Supabase Schema & Config ✅ COMPLETE (2025-12-19)
Migration from Neon → Supabase PostgreSQL with dual-schema architecture.

**Schema Changes** (prisma/schema.prisma):
- Added `multiSchema` preview feature to Prisma generator
- Configured dual-schema support: `app` (11 tables), `pipeline` (19 tables)
- Added `@@schema()` annotations to all 30 models
- Added `directUrl` for session-mode connections (migrations, advisory locks)

**New Config Module** (lib/db/supabase-config.ts):
- `SupabaseConfig` and `RetryConfig` typed interfaces
- `getSupabaseConfig()` - parses environment variables
- `validateSupabaseConfig()` - validates configuration
- `getSupabaseDatabaseUrl()` - returns pooled/direct URL
- `withRetry()` - exponential backoff retry logic (3 retries, 100ms→5s delay)
- `canConnectToSupabase()` - connection health check

**Tests**:
- `__tests__/lib/db/supabase-config.test.ts` - 15 unit tests (all passing)
- `__tests__/db/supabase-connection.test.ts` - Connection tests with graceful IPv4 skipping

**Supabase Schema Verified via MCP**:
- app: User, Ticker, SecFiling, Summary, CikMapping, TickerMonitoring, RssFilingCheck, UserSubscription, AuditLog, NotificationSent, SecCompanyCache
- pipeline: JobQueue, JobProgress, JobLock, SecFetchAttempt, FilingContentCache, FilingUsage, UsagePeriod, CronJobExecution, CronJobMetrics, CronJobAlert, TierProcessingExecution, CronExecutionContext, SummaryCacheAccess, SummaryEmailDelivery, CacheInvalidation, ErrorAlert, MonitoringThreshold, DailyWaitlistCache, DailyPipelineVerification
- public: newsletter_subscribers (121 records), newsletter_deliveries, page_analytics

**Note**: Local network is IPv4-only, so direct Prisma connections fail. Schema verified via Supabase MCP. Production will use Supavisor pooler.

**Commit**: `06b491f` on `feat/supabase-migration` branch

---

## Recently Completed (Last 30 Days)

### Discovery Scalability Optimization ✅ (2025-12-19)
4-phase optimization to scale from 2 users/8 tickers to 100K users/1500 tickers.

**Phase 1: Increase Concurrency**
- Increased `MAX_CONCURRENT_RSS_CHECKS` from 3→5 in `lib/cron/handlers/discovery-handler.ts`
- 66% throughput improvement at 50% SEC rate limit utilization
- Conservative approach leaves headroom for burst traffic

**Phase 2: Bulk CIK Enrichment**
- Created `enrichTickersWithCik()` in `lib/sec-edgar/ticker-monitoring.ts`
- Replaced N+1 queries (2N total) with 2 bulk queries using `prisma.cikMapping.findMany({ where: { ticker: { in: tickers } } })`
- Returns `Map<ticker, cik>` for O(1) lookup during job creation

**Phase 3: Bulk Job Creation**
- Created `createBulkFetchJobs()` in `lib/cron/handlers/discovery-handler.ts`
- Replaced sequential `jobQueue.addJob()` calls with `prisma.jobQueue.createMany({ skipDuplicates: true })`
- Idempotency key: `ASYNC_FETCH_FILING:${userId}:${accessionNumber}`
- Updated `CronJobResult` type in `lib/cron/types.ts` to include `jobsCreated` field

**Phase 4: RSS Response Caching**
- Created `withSecApiCache()` wrapper in `lib/sec-edgar/ticker-monitoring.ts`
- 1-minute TTL prevents duplicate SEC API calls within same discovery window
- Cache key: `sec-rss:${cik}` using existing `CacheService`

**Performance Impact**:
- Before: ~33 minutes for 1500 tickers (sequential processing)
- After: ~5 minutes for 1500 tickers (parallel + bulk operations)
- Tests: 26 passing (18 discovery + 8 RSS cache)

**Files Modified**:
- `lib/cron/handlers/discovery-handler.ts` - Main handler with bulk operations
- `lib/sec-edgar/ticker-monitoring.ts` - CIK enrichment and RSS caching
- `lib/cron/types.ts` - Added `jobsCreated` to result type

---

## Recently Completed (Last 30 Days)

### Slack Hourly Batching for Quiet Runs ✅ (2025-12-18)
Reduced Slack notification noise from 6 messages/hour to 1 hourly summary when no meaningful activity.

**Implementation**:
- Added `HourlyBatchAccumulator` class to track metrics across cron runs
- `hasMeaningfulActivity()` checks: new filings discovered, summaries generated, emails sent, or errors
- `hasMeaningfulJobActivity()` checks job processing results
- `postHourlySummaryMessage()` posts batched summary at end of quiet hour
- Modified `postCronResults()` and `postJobProcessingResults()` to use batching logic

**Files**: `lib/slack/webhook-service.ts`
**Branch**: `feature/slack-hourly-batching`, PR #270

---

### Slack Pipeline Monitor Bot ✅ (2025-12-18)
Full Slack integration for real-time pipeline monitoring with hybrid architecture.

**Architecture**:
- Incoming Webhooks: Auto-post cron results after each 10-min run
- Slack Web API: Respond to @mention queries with intent detection

**Features**:
- 10 alert rules (critical/warning) for errors, backlog growth, consecutive failures
- @mention bot with intents: help, status, daily report, failures, costs
- Daily report integration with `verify:daily` script

**Files Created**:
- `lib/slack/types.ts` - Type definitions
- `lib/slack/message-formatter.ts` - Slack Block Kit formatting
- `lib/slack/webhook-service.ts` - Webhook posting with batching
- `lib/slack/alert-rules.ts` - 10 configurable alert thresholds
- `lib/slack/conversation-handler.ts` - Intent detection for @mentions
- `lib/slack/daily-report-handler.ts` - Daily report formatting
- `lib/slack/index.ts` - Module exports
- `app/api/slack/events/route.ts` - Event subscription endpoint

**Dependencies Added**: `@slack/bolt`, `@slack/web-api`
**Vercel Env Vars**: `SLACK_WEBHOOK_URL`, `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`

---

### Circuit Breaker Reset Fix ✅ (2025-12-17)
Discovery jobs causing HTTP 524 timeouts (>100s) triggered circuit breaker to OPEN state after 3 failures, blocking Steps 2-3.

**Root Cause**: Circuit breaker stayed OPEN after discovery timeout, preventing fetch/summarize from executing.

**Fix**:
1. Reset circuit breaker state after discovery timeout so Steps 2-3 can proceed
2. Reduced discovery timeout from 100s→90s for faster fail-fast behavior
3. Reduced max attempts to 1 (no retries for discovery - just move on)

**Files**: `cloudflare-cron/index.js`
**Worker Version**: `b3cc9c12-45b0-414e-9442-b2f46fd0c0c8`
**Deployed**: 2025-12-17 10:15:49 UTC

---

### Cloudflare Worker E2E Validation ✅ (2025-12-16)
Discovered Cloudflare Worker wasn't redeployed after code fix merged.

**Issue**: Last deployment 2025-12-12, fix merged 2025-12-16. 586 discovery jobs stuck PENDING.
**Resolution**: Deployed worker at 09:23:39Z, 31 discovery jobs completed within 15 minutes.
**Research**: `thoughts/shared/research/2025-12-16-pipeline-e2e-validation-cloudflare-deployment.md`

---

### Pipeline Discovery & Summary Sharing ✅ (2025-12-16)
4-phase fix for stalled pipeline with multi-user support and cost optimization.

**Phase 1: Step 1.5 for Discovery Jobs**
- Added new step to Cloudflare Worker for `ASYNC_DISCOVER_FILINGS` processing
- Unblocked 575 stuck discovery jobs

**Phase 2: Ticker-Centric Discovery**
- Modified `discovery-handler.ts` to create jobs for ALL users tracking a ticker
- Previously only created job for first user found

**Phase 3: Email Tracking**
- Updated `summarize-cached-handler.ts` to track email delivery
- Sets `Summary.sentToUser`, increments `totalEmailsSent`
- Creates `SummaryEmailDelivery` records for audit trail

**Phase 4: Summary Sharing**
- Checks for existing summary by `accessionNumber` before AI call
- Reuses summary content across users (significant API cost savings)

**Files**:
- `cloudflare-cron/index.js` - Added Step 1.5
- `lib/cron/handlers/discovery-handler.ts` - Multi-user job creation
- `lib/cron/handlers/summarize-cached-handler.ts` - Email tracking + sharing
- `lib/cron/sec-filing-service.ts` - Summary lookup

**Branch**: `fix/pipeline-discovery-and-summary-sharing`
**Commits**: `25e3ad7`, `248e38a`, `601d009`

---

### Pipeline Error Handling & Model Fix ✅ (2025-12-16)
Pipeline stalled 11+ days due to TWO hidden issues.

**Issue 1: Error Masking Bug**
- Location: `lib/cron/background-filing-worker.ts:375-410`
- Bug: Called `controller.abort()` BEFORE checking `controller.signal.aborted`
- Result: ALL errors reported as "Application timeout after 270000ms"
- Fix: Capture error message BEFORE calling abort()

**Issue 2: Corrupted Model Config**
- `DEFAULT_AI_MODEL="x-ai/grok-4-fast-reasoning\n"` had literal newline
- Model name was also invalid (should be `grok-4.1-fast`)
- Fix: Updated env var to `x-ai/grok-4.1-fast`

**Verification**: 3 jobs completed successfully (14-32 second execution times)
**Commits**: `0da4393`, `4b699e8`

---

### Proactive Lock Cleanup ✅ (2025-12-15)
Pipeline stalled 8+ days due to expired locks never cleaned up.

**Implementation**:
- Created `/api/cron/cleanup-locks` endpoint called as Step 0 by Cloudflare Worker
- Created `/api/health/pipeline` for comprehensive pipeline monitoring
- Added `cleanupExpiredLocksAtomic()` and `forceCleanupAllLocks()` to `LockService`
- Created PostgreSQL function via migration for atomic cleanup
- Updated Cloudflare Worker to 4-step pipeline: cleanup → discover → fetch → summarize

**Emergency Action**: Cleared 5 stale locks manually to unblock pipeline

**Files**:
- `app/api/cron/cleanup-locks/route.ts`
- `app/api/health/pipeline/route.ts`
- `lib/job-queue/lock-service.ts`
- `cloudflare-cron/index.js`
- `prisma/migrations/20251215_add_lock_cleanup_function.sql`
- `__tests__/lib/job-queue/lock-cleanup.test.ts` (23 tests)

**Branch**: `fix/proactive-lock-cleanup`, PR #263

---

### Cascade Delete Trigger ✅ (2025-12-14)
Prevents orphaned jobs when users are deleted.

**Implementation**:
- Added `userId` column to `JobQueue` with FK constraint to `User`
- Created BEFORE DELETE trigger on `User` table to mark jobs as `DEAD_LETTER`
- Created sync trigger to auto-populate `userId` from payload JSON on insert

**Impact**: Migration cleaned up 14,061 orphaned jobs
**Files**: `prisma/schema.prisma`, `prisma/migrations/20251212_cascade_delete_orphaned_jobs.sql`
**Branch**: `feature/cascade-delete-orphaned-jobs`

---

### Orphaned Jobs Cleanup ✅ (2025-12-12)
Root cause of stalled pipeline: 12,169 jobs (100% of backlog) referenced DELETED user `4b396924...`.

**Solution**: Created scripts to identify and mark orphaned jobs as `DEAD_LETTER`
**Result**: Pipeline unblocked with 90 valid jobs, 35 completed in first hour

**Scripts Created**:
- `scripts/check-orphaned-summarize-jobs.ts`
- `scripts/cleanup-orphaned-summarize-jobs.ts`
- `scripts/debug-summarize-job-flow.ts`
- `scripts/verify-pipeline-status.ts`

---

### Job Selection Prisma Bug Fix ✅ (2025-12-12)
Critical bug: `prisma.jobQueue.fields.maxRetries` field reference pattern blocked 756 PENDING jobs for 12+ days.

**Root Cause**: Prisma field references don't work for row-level column comparisons in WHERE clauses.

**Fix**: Replaced with raw SQL `$queryRaw` for `"retryCount" < "maxRetries"` comparison.

**Methods Fixed**:
- `getJobsToProcess()`
- `getJobsToProcessMultipleTypes()`
- `getNextJob()`

**Verification**: 6/6 tests pass via `scripts/verify-raw-sql-fix.ts`
**Files**: `lib/job-queue/index.ts`
**Branch**: `fix/job-selection-prisma-field-reference-bug`

---

### Summarization Jobs Blocked Fix ✅ (2025-12-10)
Split Cloudflare Worker into 3-step pipeline (discover → fetch → summarize).

**Root Cause**: Vercel hadn't redeployed since `jobTypes` filter merged.
**Fix**: Triggered Vercel redeploy via git push.
**Verification**: Endpoint now returns `jobTypesFilter` field.

**Files**: `cloudflare-cron/index.js`
**Deployment**: Worker ID `dff62c35-7bbb-489e-a253-86e974a251db`, Vercel commit `e15aed1`

---

### Fetch Job Race Condition Fix ✅ (2025-12-09)
Added `jobTypes` query parameter to `/api/cron/process-filing-queue` endpoint.

**Issue**: Discovery jobs blocking fetch jobs due to FIFO processing.
**Fix**: Cloudflare Worker now calls with `?jobTypes=ASYNC_FETCH_FILING,ASYNC_SUMMARIZE_CACHED`

**Production Verified**: Step 2 now processes for 30+ seconds (vs 1s before)
**Files**: `lib/cron/background-filing-worker.ts`, `cloudflare-cron/index.js`
**Tests**: `__tests__/cron/process-filing-queue-filter.test.ts` (10 tests)

---

### Earlier Completions (Dec 1-8)

- **Live Counter SSR Animation Fix** (2025-12-08) - Synthetic 20-count gap for animation
- **Development Environment API Fixes** (2025-12-06) - Fixed `dbRetry.transaction()` → `dbRetry.mutation()`
- **Remove Market Hours Functionality** (2025-12-05) - 24/7 processing, created `tier-eligibility.ts`
- **Digest Email Markdown Rendering** (2025-12-04) - Fixed `digestTemplate()` to use `markdownToHtml()`
- **Email Summarization Phase 3** (2025-12-02) - Journalist tone prompts (Matt Levine style)
- **Email Summarization Phase 2** (2025-12-02) - Morning Brew minimalist templates
- **Email Summarization Phase 1** (2025-12-01) - Populate `summaryJSON` field
- **Daily Pipeline Verification** (2025-11-30) - `npm run verify:daily` script

---

## User-Tracked Tickers (13 total)

COIN, KO, VRT, AAPL, AMZN, BRK-B, CMG, GOOG, GOOGL, NFLX, NVDA, TSLA, V

---

## Key Commands

```bash
# Daily Pipeline Verification
npm run verify:daily                      # Verify yesterday + remediate
npm run verify:daily:no-remediation       # Dry-run

# Comprehensive Pipeline Testing
npm run test:pipeline:comprehensive       # Full validation (~28s)
npm run test:e2e:all-tickers:skip-email   # E2E without email

# Log Monitoring
cd cloudflare-cron && npx wrangler tail --format=pretty

# Cloudflare Worker Deployment
npm run cloudflare:deploy                 # Deploy to production
npm run cloudflare:status                 # Check deployment status
```

---

## Pipeline Architecture

**5-Step Cron Pipeline** (every 10 minutes via Cloudflare Worker):
1. **Step 0**: Cleanup expired locks (`/api/cron/cleanup-locks`)
2. **Step 1**: Discover new filings (`/api/cron/tier-aware?step=discover`)
3. **Step 1.5**: Process discovery jobs (`/api/cron/tier-aware?step=discover-jobs`)
4. **Step 2**: Fetch filing content (`/api/cron/tier-aware?step=fetch`)
5. **Step 3**: Generate summaries (`/api/cron/tier-aware?step=summarize`)

**Key Files**:
- `cloudflare-cron/index.js` - Cron orchestrator
- `lib/cron/handlers/discovery-handler.ts` - Filing discovery
- `lib/cron/handlers/summarize-cached-handler.ts` - AI summarization
- `lib/job-queue/index.ts` - Job queue with raw SQL fixes
- `lib/job-queue/lock-service.ts` - Distributed locking

---

**Last Updated**: 2025-12-19
**Repository**: tldrsec-ai

*Older completed projects archived to .claude/history/ - See TIMELINE.md for master timeline*
