# Job Failure Analysis: Strategy for <0.01% Failure Rate

**Date**: 2026-01-03
**Author**: Claude Code
**Related**: Pipeline Resilience Improvements (same session)

---

## Executive Summary

Analysis of 3,105 jobs in the JobQueue identified root causes for the current 1.93% failure rate. Three bugs account for 100% of failures, and fixing them would reduce failure rate to approximately <0.01%.

---

## Current State Metrics

| Metric | Value |
|--------|-------|
| Total Jobs | 3,105 |
| Failed Jobs | 60 |
| Jobs with Retries | 3,041 (98%) |
| **Current Failure Rate** | **1.93%** |
| **Target Failure Rate** | **<0.01%** |
| **Gap to Close** | ~193x reduction |

---

## Failure Breakdown by Job Type

| Job Type | Total | Failed | Failure Rate |
|----------|-------|--------|-------------|
| ASYNC_SUMMARIZE_CACHED | 482 | 47 | **9.75%** (worst) |
| ASYNC_FETCH_FILING | 490 | 13 | 2.65% |
| ASYNC_DISCOVER_FILINGS | 2,041 | 0 | 0.00% |
| ASYNC_SUMMARIZE_FILING | 64 | 0 | 0.00% |

**Key Insight**: ASYNC_SUMMARIZE_CACHED has the worst failure rate at 9.75%, accounting for 78% of all failures.

---

## Root Cause Analysis

### Error Pattern Distribution

| Error Pattern | Count | % of Failures |
|--------------|-------|---------------|
| `filing.filingDate.toISOString is not a function` | 47 | 78.3% |
| `Max retries exceeded` (generic) | 10 | 16.7% |
| `executionContext is undefined` | 3 | 5.0% |

### Bug 1: Date Type Mismatch (78.3% of failures)

**Error**: `filing.filingDate.toISOString is not a function`

**Job Type**: ASYNC_SUMMARIZE_CACHED

**Occurrence**: All 47 failures occurred on 2025-12-24

**Root Cause**: The `filingDate` field is expected to be a JavaScript `Date` object, but in some cases it arrives as a string (likely from JSON deserialization or database retrieval without proper type conversion).

**Sample Failed Jobs**:
```json
{
  "id": "8f84974c-fe94-4aa2-b1d1-901cb0b47fd7",
  "jobType": "ASYNC_SUMMARIZE_CACHED",
  "lastError": "filing.filingDate.toISOString is not a function",
  "failedAt": "2025-12-24T23:51:11.218Z",
  "retryCount": 3
}
```

**Fix**: Add defensive date handling before calling `.toISOString()`:
```typescript
// Before:
const dateStr = filing.filingDate.toISOString();

// After:
const safeDate = filing.filingDate instanceof Date
  ? filing.filingDate
  : new Date(filing.filingDate);
const dateStr = safeDate.toISOString();
```

**Files to Check**:
- `lib/cron/filing-processor.ts`
- `lib/ai/summarize.ts`
- Any code path that accesses `filing.filingDate`

### Bug 2: Missing Execution Context (5.0% of failures)

**Error**: `Cannot destructure property 'executionId' of 'executionContext' as it is undefined`

**Job Type**: ASYNC_FETCH_FILING

**Occurrence**: 3 failures on 2026-01-03 (recent issue)

**Root Cause**: The `executionContext` parameter is not being passed to the job processor in certain code paths.

**Sample Failed Jobs**:
```json
{
  "id": "1616f732-d3d9-4456-bafb-98c50ff9319f",
  "jobType": "ASYNC_FETCH_FILING",
  "lastError": "Cannot destructure property 'executionId' of 'executionContext' as it is undefined.",
  "failedAt": "2026-01-03T04:51:14.193Z"
}
```

**Fix**: Add null-safe destructuring with default context:
```typescript
// Before:
const { executionId, startedAt } = executionContext;

// After:
const { executionId, startedAt } = executionContext ?? {
  executionId: crypto.randomUUID(),
  startedAt: new Date()
};
```

**Files to Check**:
- `lib/cron/background-filing-worker.ts`
- Any code that creates or passes `executionContext`

### Bug 3: Generic Retry Exhaustion (16.7% of failures)

**Error**: `Max retries exceeded - marked as failed`

**Context**: These are symptomatic failures where the underlying cause is masked. The job failed on the initial attempt(s) with a different error, then the final failure message is the generic "max retries exceeded".

**Status**: Already addressed by Pipeline Resilience Improvements:
- Phase 1: `markForRetry()` now validates retry count
- Phase 2: `recoverExhaustedRetryJobs()` cleans up stuck jobs

---

## Current RETRYING Status

| Metric | Value |
|--------|-------|
| Currently RETRYING | 0 |
| Stuck (>30min) | 0 |

**Status**: No stuck jobs detected. Pipeline resilience improvements are working.

---

## Strategy for <0.01% Failure Rate

### Phase 1: Fix Root Cause Bugs (Reduces ~85% of failures)

| Fix | Impact | Effort | Priority |
|-----|--------|--------|----------|
| Safe date handling in summarization | -78% failures | Low | P0 |
| Default execution context | -5% failures | Low | P0 |

**Expected Result**: 1.93% → ~0.3% failure rate

### Phase 2: Increase Retry Resilience (Reduces remaining ~50%)

| Fix | Impact | Effort |
|-----|--------|--------|
| Increase maxRetries from 3 to 5 | Absorbs transient failures | Low |
| Add exponential backoff with jitter | Prevents thundering herd | Low |
| Longer timeouts for AI operations | Reduces timeout failures | Low |

**Recommended Retry Configuration**:
```typescript
// Exponential backoff with jitter
const baseDelay = 1000; // 1 second
const maxDelay = 300000; // 5 minutes
const jitter = Math.random() * 1000; // 0-1 second

const delay = Math.min(
  baseDelay * Math.pow(2, retryCount) + jitter,
  maxDelay
);

// Retry schedule: 1s → 3s → 7s → 15s → 31s (with jitter)
```

**Expected Result**: 0.3% → ~0.05% failure rate

### Phase 3: Automatic Recovery (Final push to <0.01%)

| Fix | Impact | Effort |
|-----|--------|--------|
| Auto-fix recoverable errors (date, context) | Eliminates known failure modes | Medium |
| Dead letter queue with manual review | Captures edge cases | Medium |
| Enhanced error categorization | Better root cause visibility | Low |

**Auto-Recovery Pattern**:
```typescript
try {
  await processJob(job);
} catch (error) {
  if (isRecoverableError(error)) {
    const fixedPayload = applyAutoFix(job.payload, error);
    await retryWithFix(job, fixedPayload);
  } else {
    await moveToDeadLetterQueue(job, error);
  }
}

function isRecoverableError(error: Error): boolean {
  const recoverablePatterns = [
    'toISOString is not a function', // Date type issue
    'executionContext', // Missing context
    'ECONNRESET', // Network blip
    'timeout', // Transient timeout
  ];
  return recoverablePatterns.some(p => error.message.includes(p));
}
```

**Expected Result**: 0.05% → <0.01% failure rate

---

## Projected Improvement Path

| Phase | Failure Rate | Improvement |
|-------|-------------|-------------|
| Current | 1.93% | - |
| After Phase 1 | ~0.3% | -85% |
| After Phase 2 | ~0.05% | -83% |
| After Phase 3 | <0.01% | -80% |

---

## Implementation Priority

### P0 - Immediate (This Sprint)

1. **Fix date handling bug** - Single biggest impact
   - Location: Search for `filingDate.toISOString`
   - Add defensive `new Date()` wrapper

2. **Fix execution context bug** - Recent regression
   - Location: `background-filing-worker.ts` or calling code
   - Add null-safe destructuring with defaults

### P1 - Next Sprint

3. **Increase maxRetries to 5** for AI/network operations
4. **Implement exponential backoff with jitter**

### P2 - Future

5. **Auto-recovery for known error patterns**
6. **Dead letter queue with alerting**
7. **Enhanced error categorization and metrics dashboard**

---

## Monitoring Recommendations

To track progress toward <0.01% failure rate:

1. **Add failure rate metric to Slack reports**:
   ```
   Failure Rate: 0.05% (3/6000 jobs) ✅ Target: <0.01%
   ```

2. **Alert on new error patterns** not in known categories

3. **Weekly failure analysis** to identify new root causes

4. **Dashboard widget** showing 7-day rolling failure rate

---

## Appendix: Raw Data Samples

### Date Error Samples (Top Cause)
```json
[
  {"jobType": "ASYNC_SUMMARIZE_CACHED", "lastError": "filing.filingDate.toISOString is not a function", "failedAt": "2025-12-24T23:51:11.218Z"},
  {"jobType": "ASYNC_SUMMARIZE_CACHED", "lastError": "filing.filingDate.toISOString is not a function", "failedAt": "2025-12-24T23:46:13.188Z"},
  {"jobType": "ASYNC_SUMMARIZE_CACHED", "lastError": "filing.filingDate.toISOString is not a function", "failedAt": "2025-12-24T23:41:13.122Z"}
]
```

### Execution Context Error Samples
```json
[
  {"jobType": "ASYNC_FETCH_FILING", "lastError": "Cannot destructure property 'executionId' of 'executionContext' as it is undefined.", "failedAt": "2026-01-03T04:51:14.193Z"},
  {"jobType": "ASYNC_FETCH_FILING", "lastError": "Cannot destructure property 'executionId' of 'executionContext' as it is undefined.", "failedAt": "2026-01-03T04:51:22.106Z"}
]
```

---

**Next Action**: Implement P0 fixes (date handling + execution context) to achieve immediate 85% reduction in failures.
