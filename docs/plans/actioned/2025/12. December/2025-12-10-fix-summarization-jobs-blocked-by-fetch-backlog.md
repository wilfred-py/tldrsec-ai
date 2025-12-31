# Fix Summarization Jobs Blocked by Fetch Backlog

**Date**: 2025-12-10 08:01:37 AEDT
**Git Commit**: 7f68452df31a57750146d6fd8cd0ae84b20a2b8b
**Branch**: main
**Repository**: tldrsec-ai

## Overview

The summarization pipeline is stalled because **126 ASYNC_SUMMARIZE_CACHED jobs have been pending since Nov 28 (12+ days)**. The root cause is that the job type priority loop uses a "first-match wins" strategy, and the massive backlog of **11,786 ASYNC_FETCH_FILING jobs** blocks summarize jobs from ever being processed.

## Current State Analysis

### The Problem

The 2025-12-09 race condition fix successfully added a job type filter to exclude discovery jobs from Step 2:

```
Cloudflare Worker Step 2 → ?jobTypes=ASYNC_FETCH_FILING,ASYNC_SUMMARIZE_CACHED
```

However, the `processBatch()` method's **first-match wins** loop (line 171) causes a new blocking scenario:

```typescript
// lib/cron/background-filing-worker.ts:170-171
for (const jobType of jobTypesToProcess) {
  if (jobs.length > 0) break; // ← BREAKS ON FIRST MATCH
  // ...
}
```

**Effect**: With 11,786 pending fetch jobs, the loop always finds fetch jobs first, breaks, and **never reaches summarize jobs**.

### Evidence

| Metric | Value | Significance |
|--------|-------|--------------|
| PENDING ASYNC_FETCH_FILING jobs | 11,786 | Always matches first in priority loop |
| PENDING ASYNC_SUMMARIZE_CACHED jobs | 126 | Never gets a turn to process |
| Last ASYNC_SUMMARIZE_CACHED completed | Nov 28, 2025 | 12 days stalled |
| Last summary in database | Dec 4, 2025 | Likely via different code path |

### Key Code Locations

| File | Line | Purpose |
|------|------|---------|
| `lib/cron/background-filing-worker.ts` | 170-171 | Priority loop with first-match break |
| `lib/cron/types.ts` | 205-206 | Batch sizes: FETCH=5, SUMMARIZE=1 |
| `cloudflare-cron/index.js` | 118 | Filter: `ASYNC_FETCH_FILING,ASYNC_SUMMARIZE_CACHED` |

## Desired End State

After implementation:

1. **Summarize jobs get processing time** even when fetch jobs are pending
2. **Fair scheduling** between fetch and summarize jobs
3. **Existing fetch processing** continues without regression
4. **Monitoring** confirms summarize jobs are completing

### Verification

```bash
# Check summarize job processing after several cron cycles
cd /Users/wilf/Software/Windsurf\ Projects/tldrsec-ai && npx tsx scripts/check-pending-jobs.ts

# Expected after fix:
# - PENDING ASYNC_SUMMARIZE_CACHED decreasing over time
# - COMPLETED ASYNC_SUMMARIZE_CACHED increasing
# - Summaries appearing in database with recent timestamps
```

## What We're NOT Doing

- **NOT changing batch sizes** - Current sizes are well-tuned
- **NOT creating new endpoints** - Reusing existing infrastructure
- **NOT changing cron frequency** - 10-minute interval is appropriate
- **NOT changing job queue schema** - Database structure is fine
- **NOT modifying tier-aware endpoint** - Discovery flow works correctly

## Analysis of Alternative Approaches

### Approach 1: Separate Step for Summarize Jobs

**Description**: Add Step 3 to Cloudflare Worker that only processes summarize jobs.

```javascript
// Step 3: /api/cron/process-filing-queue?jobTypes=ASYNC_SUMMARIZE_CACHED
```

| Pros | Cons |
|------|------|
| Simple to implement | Three sequential HTTP calls per cron |
| Guarantees summarize gets processing time | Increased Cloudflare Worker execution time |
| No changes to BackgroundFilingWorker | More endpoint calls to Vercel |
| Clear separation of concerns | |

**Verdict**: **SELECTED** - Simplest solution with minimal code changes and clear separation.

### Approach 2: Round-Robin Job Type Selection

**Description**: Alternate which job type gets priority on each cron cycle.

| Pros | Cons |
|------|------|
| Fair distribution over time | Requires persistent state |
| Single HTTP call | Non-deterministic behavior |
| Works with existing infrastructure | Complex debugging |

**Verdict**: Too complex for the problem at hand.

### Approach 3: Interleaved Batch Processing

**Description**: Process a mix of job types in each batch (e.g., 3 fetch + 1 summarize).

| Pros | Cons |
|------|------|
| Single call processes multiple types | Complex timeout budget calculation |
| Better utilization of 270s timeout | Harder to reason about batch composition |
| More fair distribution | Significant refactor |

**Verdict**: Too risky - timeout handling becomes unpredictable.

### Approach 4: Priority Boost for Stale Jobs

**Description**: Increase priority of jobs pending > 24 hours.

| Pros | Cons |
|------|------|
| Self-correcting | Requires schema change (priority field updates) |
| Addresses root cause | More complex query logic |
| | Still subject to first-match blocking |

**Verdict**: Doesn't solve immediate blocking issue.

## Implementation Approach

Add a **dedicated Step 3** to the Cloudflare Worker that only processes summarize jobs. This guarantees summarize jobs get processing time regardless of the fetch job backlog.

**New Flow**:
```
Step 1: tier-aware        → Creates ASYNC_DISCOVER_FILINGS jobs
Step 2: process-filing-queue?jobTypes=ASYNC_FETCH_FILING         → Processes fetch jobs
Step 3: process-filing-queue?jobTypes=ASYNC_SUMMARIZE_CACHED     → Processes summarize jobs
```

---

## TDD Applicability Note

This plan modifies **Cloudflare Worker configuration** (JavaScript), not Next.js application code. The Cloudflare Worker is a separate runtime not covered by the Jest test suite.

**TDD Strategy for Infrastructure Changes:**
1. **Verify existing tests pass** before making changes (regression baseline)
2. **Leverage existing endpoint tests** - The `process-filing-queue` endpoint already has filter tests
3. **Run integration tests** after deployment to verify behavior
4. **Monitor production** as the ultimate verification

The endpoint being called (`/api/cron/process-filing-queue?jobTypes=ASYNC_SUMMARIZE_CACHED`) is already tested in `__tests__/cron/process-filing-queue-filter.test.ts`.

---

## Phase 1: Verify Baseline and Update Cloudflare Worker

### Overview

First verify existing tests pass (TDD baseline), then split the current Step 2 into two separate steps - one for fetch jobs, one for summarize jobs.

### Step 1.1: 🔴 Verify Existing Tests Pass (Baseline) ✅ COMPLETED

Before making any changes, establish that the current test suite passes:

```bash
# Run the job type filter tests to establish baseline
npm run test -- --testPathPattern="process-filing-queue-filter"
# Expected: 10 passing tests (all green) ✅ PASSED

# Run full cron test suite
npm run test -- --testPathPattern="cron"
# Note: Some pre-existing failures in error-handling-recovery tests, but process-filing-queue-filter tests all pass

# Run linting
npm run lint
# Expected: No errors ✅ PASSED
```

**Checkpoint 1.1**: Filter tests pass. Pre-existing failures in other test files are unrelated to this change.

### Step 1.2: Update Cloudflare Worker ✅ COMPLETED

**File**: `cloudflare-cron/index.js`

**Changes made:**
- Split `workerUrl` into `fetchUrl` and `summarizeUrl` (lines 116-118)
- Updated logging to show three-step pipeline (lines 121-126)
- Added Step 3 execution block for summarize jobs (lines 266-308)
- Updated Step 2 to use `fetchUrl` and `fetchResult` (lines 226-264)
- Updated result combination to include all three endpoints (lines 310-345)
- Updated circuit breaker handling for three-step pipeline (lines 371-408)

#### 1.2.1 Update URL Configuration

**Location**: Around line 118

**Current Code**:
```javascript
const workerUrl = `${env.PUBLIC_URL}/api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING,ASYNC_SUMMARIZE_CACHED`;
```

**New Code**:
```javascript
// Step 2: Process fetch jobs (content retrieval from SEC)
const fetchUrl = `${env.PUBLIC_URL}/api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING`;
// Step 3: Process summarize jobs (AI summarization)
const summarizeUrl = `${env.PUBLIC_URL}/api/cron/process-filing-queue?jobTypes=ASYNC_SUMMARIZE_CACHED`;
```

#### 1.2.2 Update Logging

**Location**: Around line 121-125

**New Code**:
```javascript
console.log(`[${executionId}] Three-step pipeline configuration:`, {
  step1: tierAwareUrl,
  step2: fetchUrl,
  step3: summarizeUrl,
  pattern: 'Sequential execution: discover → fetch → summarize'
});
```

#### 1.2.3 Add Step 3 Execution

**Location**: After Step 2 execution (around line 200-250)

Add new Step 3 with same pattern as Step 2:

```javascript
// ========================================
// STEP 3: Process Summarize Jobs (AI Processing)
// ========================================
console.log(`[${executionId}] ====== STEP 3: SUMMARIZE JOBS ======`);

const step3Signature = await generateSignature(summarizeUrl);
console.log(`[${executionId}] Step 3 URL: ${summarizeUrl}`);
console.log(`[${executionId}] Step 3 signature generated, timestamp: ${step3Signature.timestamp}`);

try {
  const step3Response = await fetch(summarizeUrl, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${env.CRON_SECRET}`,
      'Content-Type': 'application/json',
      'x-cron-timestamp': step3Signature.timestamp.toString(),
      'x-cron-signature': step3Signature.signature,
    },
  });

  console.log(`[${executionId}] Step 3 response status: ${step3Response.status}`);

  if (!step3Response.ok) {
    const errorText = await step3Response.text();
    console.error(`[${executionId}] Step 3 failed: ${errorText}`);
  } else {
    const step3Result = await step3Response.json();
    console.log(`[${executionId}] Step 3 completed:`, step3Result);
  }
} catch (step3Error) {
  console.error(`[${executionId}] Step 3 error:`, step3Error.message);
}
```

#### 1.2.4 Update Step 2 Variable Name

Change `workerUrl` to `fetchUrl` throughout the Step 2 section (around lines 170-200).

### Step 1.3: 🟢 Verify No Regression ✅ COMPLETED

After making changes, verify the existing test suite still passes:

```bash
# Run the job type filter tests - should still pass
npm run test -- --testPathPattern="process-filing-queue-filter"
# Expected: 10 passing tests (unchanged from baseline) ✅ PASSED

# Run linting
npm run lint
# Expected: No errors ✅ PASSED

# Build verification
npm run build
# Expected: Build succeeds ✅ PASSED

# Cloudflare Worker dry-run deployment
npm run cloudflare:deploy:dry-run
# Expected: Configuration valid ✅ PASSED
```

**Checkpoint 1.3**: All tests pass. No regression introduced.

### Step 1.4: 🔵 Deploy and Verify

#### Automated Verification:
- [x] All existing tests pass: `npm run test -- --testPathPattern="process-filing-queue-filter"` (10/10 passing)
- [x] Cloudflare Worker builds without errors: `cd cloudflare-cron && npm run build`
- [x] Worker passes dry-run: `npm run cloudflare:deploy:dry-run`

#### Deployment:
- [ ] Deploy to Cloudflare: `npm run cloudflare:deploy`

#### Manual Verification:
- [ ] Monitor next cron execution: `npm run cloudflare:logs`
- [ ] Verify Step 3 URL shows `?jobTypes=ASYNC_SUMMARIZE_CACHED`
- [ ] Verify Step 3 returns 200 status
- [ ] Verify summarize jobs start completing after deployment

**STOP**: After deployment, monitor Cloudflare logs for 30 minutes to confirm:
1. Step 3 is being called
2. Step 3 is returning successfully
3. Summarize jobs are being processed

---

## Phase 2: Verify and Monitor

### Overview

Verify the fix is working by monitoring job queue state and database summaries.

### Step 2.1: Check Job Queue State

Run the pending jobs check script:

```bash
cd /Users/wilf/Software/Windsurf\ Projects/tldrsec-ai && npx tsx scripts/check-pending-jobs.ts
```

Expected changes after 30-60 minutes:
- PENDING ASYNC_SUMMARIZE_CACHED count should decrease
- COMPLETED ASYNC_SUMMARIZE_CACHED count should increase

### Step 2.2: Check Database for New Summaries

```sql
-- Check for summaries created after the fix
SELECT
  created_at,
  ticker_id,
  filing_type,
  filing_date
FROM "Summary"
WHERE created_at > '2025-12-10'
ORDER BY created_at DESC
LIMIT 10;
```

Expected: New summaries appearing with timestamps after deployment.

### Step 2.3: Monitor OpenRouter API Calls

Check for API activity in Vercel logs:
- Look for `🚀 OPENROUTER API CALL INITIATED` log entries
- Verify `✅ OPENROUTER API CALL SUCCEEDED` completions

### Step 2.4: Verify Email Notifications

After summarize jobs complete:
- Check that email notifications are being sent
- Verify users receive summary emails

### Step 2.5: Final Verification

#### Automated Verification:
- [ ] Job queue shows summarize jobs completing: `scripts/check-pending-jobs.ts`
- [ ] Cloudflare Worker logs show Step 3 processing: `npm run cloudflare:logs`
- [ ] No error alerts in monitoring: `/api/monitoring/error-alerts`

#### Manual Verification:
- [ ] New summaries appear in database
- [ ] Email notifications working
- [ ] Fetch jobs still processing (no regression)
- [ ] User dashboard shows new summaries

---

## Testing Strategy

### TDD Approach for Infrastructure Changes

Since this is a Cloudflare Worker configuration change (not Next.js code), we adapt TDD principles:

| TDD Phase | Application to This Change |
|-----------|---------------------------|
| 🔴 Red (Failing Test) | Verify existing tests pass BEFORE changes (establish baseline) |
| 🟢 Green (Pass Test) | After changes, same tests still pass (no regression) |
| 🔵 Refactor | Deploy and verify in production via integration tests |

### Pre-Change Verification (Baseline)

```bash
# Establish that all relevant tests pass BEFORE making changes
npm run test -- --testPathPattern="process-filing-queue-filter"
npm run test -- --testPathPattern="cron"
npm run lint
```

### Post-Change Verification (No Regression)

```bash
# Same tests must still pass AFTER changes
npm run test -- --testPathPattern="process-filing-queue-filter"
npm run test -- --testPathPattern="cron"
npm run build
```

### Integration Tests

After deployment, run:

```bash
npm run test:cloudflare-integration
```

### Existing Test Coverage

The endpoint `?jobTypes=ASYNC_SUMMARIZE_CACHED` is already tested:

**File**: `__tests__/cron/process-filing-queue-filter.test.ts`

| Test | What It Verifies |
|------|------------------|
| `should accept valid job type filter` | Single job type filter works |
| `should accept multiple job types` | Comma-separated filter works |
| `should reject invalid job type filter` | Invalid types return 400 |
| `should process all types when no filter provided` | Default behavior preserved |

These tests ensure the endpoint correctly handles `ASYNC_SUMMARIZE_CACHED` as a filter value.

### Manual Testing Steps

1. Run baseline tests (Step 1.1)
2. Make Cloudflare Worker changes (Step 1.2)
3. Verify tests still pass (Step 1.3)
4. Deploy Cloudflare Worker (Step 1.4)
5. Monitor logs for 30 minutes
6. Verify Step 3 is called on each cron cycle
7. Check database for new summaries
8. Verify no regression in fetch job processing
9. Confirm email delivery

## Performance Considerations

- **Additional HTTP call**: One extra call per 10-minute cron cycle (negligible)
- **Cloudflare Worker execution time**: Increases by ~30-60s per cycle (within limits)
- **Vercel function cold starts**: May add ~1s latency (acceptable)
- **Total cron cycle time**: ~60-90s (well within Cloudflare Worker limits)

## Migration Notes

- No database changes required
- No environment variable changes required
- Backward compatible - can rollback by reverting Cloudflare Worker
- Existing pending jobs will be processed naturally

## Rollback Plan

If issues arise:

1. Restore original Cloudflare Worker code:
```javascript
const workerUrl = `${env.PUBLIC_URL}/api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING,ASYNC_SUMMARIZE_CACHED`;
```

2. Redeploy: `npm run cloudflare:deploy`

3. Monitor for stability

## References

- Research document: `thoughts/shared/research/2025-12-10-pipeline-summarization-stall.md`
- Previous fix plan: `docs/plans/2025-12-09-fix-fetch-job-processing-race-condition.md`
- BackgroundFilingWorker: `lib/cron/background-filing-worker.ts`
- Cloudflare Worker: `cloudflare-cron/index.js`
- Job batch sizes: `lib/cron/types.ts:203-209`
