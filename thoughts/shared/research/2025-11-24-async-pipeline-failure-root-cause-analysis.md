---
date: 2025-11-24T20:51:50+11:00
researcher: Claude
git_commit: b70b49e196c46edb3c13eda282c449f8f5a6736d
branch: main
repository: tldrsec-ai
topic: "Async Pipeline Failure Root Cause Analysis"
tags: [research, codebase, async-pipeline, timeout, cron, job-queue, root-cause-analysis]
status: complete
last_updated: 2025-11-24
last_updated_by: Claude
---

# Research: Async Pipeline Failure Root Cause Analysis

**Date**: 2025-11-24T20:51:50+11:00
**Researcher**: Claude
**Git Commit**: b70b49e196c46edb3c13eda282c449f8f5a6736d
**Branch**: main
**Repository**: tldrsec-ai

## Research Question

The process-filing-queue endpoint called by the Cloudflare cron job continues to fail with zero successful runs observed. Identify root causes blocking the pipeline with high confidence. Ultimate goal: summaries generated / $ spent on API calls > 0.

## Summary

After comprehensive analysis of the codebase, I have identified **5 root causes** that individually or in combination are causing all async pipeline jobs to timeout at 150 seconds with zero completed summaries.

### Root Causes Identified

| # | Root Cause | Severity | Impact | Fix Complexity |
|---|-----------|----------|--------|----------------|
| 1 | **SEC Fetch Can Exceed 93s** | CRITICAL | SEC fetch with 2 retries × 30s timeout + delays = 93s worst case, leaving only 57s for AI | Medium |
| 2 | **AI Timeout Not Being Enforced** | CRITICAL | 100s AI timeout may not abort in-flight requests due to missing AbortController | High |
| 3 | **Async Processor Uses maxRetries=2** | HIGH | Alternative code path at `async-filing-processor.ts:176` uses maxRetries=2, causing 3 AI attempts | Low |
| 4 | **OpenRouter Default Timeout is 270s** | HIGH | OpenRouter client defaults to 270s, overriding the 100s budget if not explicitly passed | Medium |
| 5 | **No Per-Phase Time Budgeting** | MEDIUM | No enforcement that SEC fetch + AI + DB must sum to <150s; phases run independently | High |

## Detailed Findings

### 1. Process-Filing-Queue Endpoint

**Location**: [app/api/cron/process-filing-queue/route.ts](app/api/cron/process-filing-queue/route.ts)

The endpoint:
- Uses `CronAuthService.validateCronRequest()` for multi-method auth (HMAC, Vercel internal, Bearer)
- Creates `BackgroundFilingWorker` with `batchSize: 1` (processes 1 filing per invocation)
- Has Vercel maxDuration of **180 seconds** configured in [vercel.json:19](vercel.json#L19)

**Key Code** (route.ts:56-63):
```typescript
const worker = new BackgroundFilingWorker({
  batchSize: 1,           // Process 1 filing per invocation (timeout constraint)
  processingInterval: 0,  // No wait between batches (single run)
});

await worker.processBatch();
```

### 2. Timeout Configuration Hierarchy

The timeout chain is designed as:

```
Vercel maxDuration (180s)
    └── FILING_PROCESSING_TIMEOUT (150s) - 30s buffer
            └── SEC Fetch Budget (~50s estimated)
            └── AI Summary Timeout (100s) - explicit
            └── DB Operations (~5s estimated)
```

**Problem**: The budgets are not enforced at boundaries. Each phase runs independently with its own retry logic.

**Actual Worst-Case Timing**:

| Phase | Best Case | Worst Case | Explanation |
|-------|-----------|------------|-------------|
| SEC Fetch | 2s | 93s | 2 retries × 30s timeout + 2s + 5s delays |
| AI Summarization | 10s | 270s | OpenRouter default timeout if not overridden |
| DB Operations | 0.5s | 5s | Network latency to Neon |
| **Total** | 12.5s | **368s** | Far exceeds 150s budget |

### 3. SEC EDGAR Client Timing Analysis

**Location**: [lib/sec-edgar/client.ts](lib/sec-edgar/client.ts)

**Configuration** (client.ts:22-28):
```typescript
const DEFAULT_CONFIG: SECEdgarConfig = {
  maxRetries: 2,      // 2 retries (3 total attempts)
  retryDelay: 1000    // 1s initial, capped at 5s max
};
```

**Per-Request Timeout** (client.ts:46):
```typescript
timeout: 30000, // 30 seconds per request
```

**Worst-Case Calculation**:
- Attempt 1: 30s (timeout)
- Delay: 1s
- Attempt 2: 30s (timeout)
- Delay: 2s
- Attempt 3: 30s (timeout)
- **Total: 93s**

### 4. AI Summarization Timing Analysis

**Location**: [services/filing/summaryGenerationService.ts](services/filing/summaryGenerationService.ts)

**Fix Already Applied** at filing-processor.ts:1148:
```typescript
summaryResult = await generateAISummaryWithRetry(
  filingContent,
  { /* filing */ },
  { /* company */ },
  0 // FIXED: Zero retries - single AI attempt
);
```

**However**, there's a conflicting code path:

**Location**: [lib/job-queue/async-filing-processor.ts:176](lib/job-queue/async-filing-processor.ts#L176)
```typescript
const summaryResult = await generateAISummaryWithRetry(
  filingContent,
  { /* filing */ },
  { /* company */ },
  2 // Max retries for async processing <-- STILL USES 2 RETRIES!
);
```

**Root Cause #3**: If this code path is used instead of the cron filing processor, it allows 3 AI attempts × 100s = 300s, exceeding the 150s budget.

### 5. OpenRouter Client Default Timeout

**Location**: [lib/ai/openrouter-client.ts:38](lib/ai/openrouter-client.ts#L38)
```typescript
timeout: parseInt(process.env.OPENROUTER_TIMEOUT_MS || '270000', 10), // 4.5 minutes default
```

**Root Cause #4**: If `AI_SUMMARY_TIMEOUT_MS` is not properly passed through to the OpenRouter client, the 270s default is used instead of the 100s budget.

**The timeout is passed at** summaryGenerationService.ts:142:
```typescript
timeout: parseInt(process.env.AI_SUMMARY_TIMEOUT_MS || '100000', 10),
```

But the OpenRouter client has its own timeout calculation at openrouter-client.ts:423-425:
```typescript
const dynamicTimeout = this.calculateDynamicTimeout(options.remainingExecutionTime);
const timeout = options.timeout || dynamicTimeout || OPENROUTER_CONFIG.timeout;
```

If `options.timeout` is undefined or falsy, it falls back to OPENROUTER_CONFIG.timeout (270s).

### 6. Cloudflare Worker Dual-Endpoint Pattern

**Location**: [cloudflare-cron/index.js](cloudflare-cron/index.js)

The Worker correctly calls both endpoints sequentially:

1. `/api/cron/tier-aware` - Queues new filings (works correctly)
2. `/api/cron/process-filing-queue` - Processes queued jobs (timing out)

**Worker Timeouts** (index.js:39-40):
```javascript
const WORKER_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const REQUEST_TIMEOUT_MS = 4.5 * 60 * 1000; // 4.5 minutes per request
```

These are generous enough. The problem is in the Vercel endpoint, not the Worker.

### 7. Job Status from PROGRESS.md

As of 2025-11-24 09:38 UTC:
- PROCESSING: 1
- RETRYING: 48
- FAILED: 264
- PENDING: 1
- **COMPLETED: 0** (Target: > 0)

All failures show: `"Application timeout after 150000ms"`

This confirms the 150s timeout wrapper is working correctly - jobs ARE being timed out. The problem is the work inside cannot complete within 150s.

## Code References

### Critical Files
- [app/api/cron/process-filing-queue/route.ts](app/api/cron/process-filing-queue/route.ts) - Background worker endpoint
- [lib/cron/background-filing-worker.ts](lib/cron/background-filing-worker.ts) - Job processing with 150s timeout
- [lib/cron/filing-processor.ts:1148](lib/cron/filing-processor.ts#L1148) - AI call with maxRetries=0 (FIXED)
- [lib/job-queue/async-filing-processor.ts:176](lib/job-queue/async-filing-processor.ts#L176) - AI call with maxRetries=2 (NOT FIXED)
- [lib/sec-edgar/client.ts](lib/sec-edgar/client.ts) - SEC fetch with 93s worst case
- [lib/ai/openrouter-client.ts](lib/ai/openrouter-client.ts) - 270s default timeout
- [services/filing/summaryGenerationService.ts](services/filing/summaryGenerationService.ts) - 100s AI timeout
- [lib/cron/types.ts:185](lib/cron/types.ts#L185) - FILING_PROCESSING_TIMEOUT = 150000

### Timeout Constants Summary

| Constant | Value | Location |
|----------|-------|----------|
| Vercel maxDuration | 180s | vercel.json:19 |
| FILING_PROCESSING_TIMEOUT | 150s | lib/cron/types.ts:185 |
| AI_SUMMARY_TIMEOUT_MS | 100s | env / summaryGenerationService.ts:142 |
| OPENROUTER_TIMEOUT_MS | 270s | env / openrouter-client.ts:38 |
| SEC Client Timeout | 30s | lib/sec-edgar/client.ts:46 |
| SEC Max Retry Delay | 5s | lib/sec-edgar/client.ts:87 |

## Architecture Documentation

### Current Pipeline Flow
```
Cloudflare Worker (every 10 min)
    │
    ├─→ /api/cron/tier-aware (queues filings) ✅ Working
    │
    └─→ /api/cron/process-filing-queue (processes jobs) ❌ Timing out
            │
            └─→ BackgroundFilingWorker.processBatch()
                    │
                    └─→ Promise.race([processJob(), 150s timeout])
                            │
                            └─→ CronFilingProcessor.processSingleFiling()
                                    │
                                    ├─→ SEC Fetch (up to 93s worst case)
                                    │
                                    ├─→ AI Summarization (100s budget, but...)
                                    │       │
                                    │       └─→ OpenRouter (270s default!)
                                    │
                                    └─→ DB Store
```

### Why Jobs Fail at Exactly 150s

The `createTimeoutPromise()` in background-filing-worker.ts:25-31 races against the actual processing:

```typescript
const result = await Promise.race([
  this.executeFilingProcessing(job, payload),  // Actual work
  createTimeoutPromise(FILING_PROCESSING_TIMEOUT, job.id),  // 150s timeout
]);
```

When 150s passes, the timeout wins and the job is marked FAILED. But the actual SEC fetch or AI call may still be running (they're not aborted, just orphaned).

## Recommended Fixes (Priority Order)

### Fix 1: Reduce SEC Fetch Budget (CRITICAL)

Reduce SEC client retries to fit within 30-40s total budget:

```typescript
// lib/sec-edgar/client.ts:22-28
const DEFAULT_CONFIG: SECEdgarConfig = {
  maxRetries: 1,      // Reduce to 1 retry (2 total attempts)
  retryDelay: 500     // 500ms initial
};
```

New worst case: 30s + 0.5s + 30s = 60.5s

### Fix 2: Ensure AI Timeout is Enforced (CRITICAL)

Add AbortController to AI calls so they actually abort at timeout:

```typescript
// services/filing/summaryGenerationService.ts
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 100000);

try {
  const response = await aiClient.sendMessage(messages, {
    ...options,
    signal: controller.signal
  });
} finally {
  clearTimeout(timeoutId);
}
```

### Fix 3: Fix Async Filing Processor (HIGH)

Change maxRetries from 2 to 0 at async-filing-processor.ts:176:

```typescript
const summaryResult = await generateAISummaryWithRetry(
  filingContent,
  { /* filing */ },
  { /* company */ },
  0 // Match the cron filing processor
);
```

### Fix 4: Set Environment Variable (HIGH)

Ensure `AI_SUMMARY_TIMEOUT_MS=60000` (60s) is set in Vercel environment, leaving ~90s for SEC fetch + overhead.

### Fix 5: Implement Phase Budgeting (MEDIUM)

Pass remaining time budget through the call stack:

```typescript
const startTime = Date.now();
const totalBudget = FILING_PROCESSING_TIMEOUT;

// Phase 1: SEC Fetch
const secBudget = Math.min(40000, totalBudget * 0.3);
const filingContent = await fetchWithTimeout(url, secBudget);

// Phase 2: AI Summary
const elapsed = Date.now() - startTime;
const aiBudget = Math.min(100000, totalBudget - elapsed - 10000);
const summary = await generateSummary(content, { timeout: aiBudget });
```

## Historical Context (from thoughts/)

- [thoughts/shared/research/2025-11-21-e2e-summarization-pipeline-deep-dive.md](thoughts/shared/research/2025-11-21-e2e-summarization-pipeline-deep-dive.md) - Original pipeline architecture documentation
- [docs/plans/2025-11-21-complete-async-pipeline-integration.md](docs/plans/2025-11-21-complete-async-pipeline-integration.md) - Implementation plan for async pipeline
- [PROGRESS.md](PROGRESS.md) - Current status showing 0 COMPLETED jobs

## Related Research

- Previous research identified authentication issues (now fixed)
- Previous research identified stale job recovery (now implemented)
- Previous research identified AI retry issue at filing-processor.ts:1148 (now fixed, but async-filing-processor.ts:176 was missed)

## Open Questions

1. **Which code path is actually being used?** - Need to verify if `CronFilingProcessor.processSingleFiling()` or `AsyncFilingProcessor.processAsyncFilingSummarization()` is called
2. **Is AI_SUMMARY_TIMEOUT_MS set in production?** - Need to verify Vercel environment variables
3. **Are SEC fetches taking the full 93s?** - Need Vercel function logs to see actual timing breakdown
4. **Is AbortController being used for AI requests?** - Current code may not actually abort in-flight requests

## Next Steps

1. **Immediate**: Fix async-filing-processor.ts:176 to use maxRetries=0
2. **Immediate**: Reduce SEC client maxRetries to 1
3. **Short-term**: Add logging to capture actual SEC fetch and AI timing
4. **Short-term**: Verify and set AI_SUMMARY_TIMEOUT_MS=60000 in Vercel
5. **Medium-term**: Implement phase budgeting with remaining time tracking

---

*This document represents a comprehensive root cause analysis of the async pipeline failure. All findings are based on codebase research as of 2025-11-24.*
