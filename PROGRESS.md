# Current Progress: Async Pipeline Job Timeout Fix

## Current Status
**Date**: 2025-11-24 (21:30 AEDT)
**Branch**: main
**Deployment**: Production (Vercel - commit b70b49e)
**Implementation Plan**: [docs/plans/2025-11-24-async-pipeline-timeout-fix.md](docs/plans/2025-11-24-async-pipeline-timeout-fix.md)

### Implementation Plan Created ✅

Comprehensive 5-phase implementation plan ready for review at `docs/plans/2025-11-24-async-pipeline-timeout-fix.md`

**Problem**: All async pipeline jobs timing out at 150s with "Application timeout after 150000ms"
- Queue: 0 COMPLETED, 269 FAILED, 43 RETRYING, 5 PENDING
- Ultimate Goal: summaries generated / $ spent > 0

### Root Causes (Verified Through Research)

| # | Root Cause | Severity | Verification |
|---|-----------|----------|--------------|
| 1 | `AI_SUMMARY_TIMEOUT_MS` and `OPENROUTER_TIMEOUT_MS` NOT SET in Vercel | CRITICAL | `vercel env ls` confirmed |
| 2 | OpenRouter default timeout = 270s (exceeds 150s job limit) | CRITICAL | Code inspection |
| 3 | Promise.race does NOT cancel in-flight requests | HIGH | Web research |
| 4 | SEC fetch can consume 93s (2 retries × 30s + backoff) | HIGH | Bottleneck test |
| 5 | Cloudflare Worker ~90-100s undocumented fetch timeout | MEDIUM | Web research |

### Key Correction from Original Analysis

**async-filing-processor.ts:176 is NOT a factor** - The cron job path uses `CronFilingProcessor.processSingleFiling()` (with maxRetries=0), NOT `AsyncFilingProcessor` (which has maxRetries=2). The original research document's "Root Cause #3" does not apply to current code flow.

## Approach (5 Phases)

| Phase | Action | Time | Risk | Status |
|-------|--------|------|------|--------|
| 1 | Set env vars (`AI_SUMMARY_TIMEOUT_MS=60000`) | 5 min | Low | Ready |
| 2 | Reduce SEC client maxRetries 2→1 | 15 min | Low | Ready |
| 3 | Implement AbortController | 30 min | Medium | Planned |
| 4 | Propagate abort signal through stack | 45 min | Medium | Planned |
| 5 | Time budget tracking (optional) | 30 min | Low | Optional |

**Phases 1 and 2 alone should resolve most timeout issues.**

## Steps Done
- ✅ Read and verified critical files from root cause analysis
- ✅ Verified code path: CronFilingProcessor (maxRetries=0), NOT AsyncFilingProcessor
- ✅ Analyzed job queue status: 269 FAILED, 43 RETRYING, 5 PENDING, 1 PROCESSING, 0 COMPLETED
- ✅ Tested Bottleneck retry behavior: With failed handler, `retries: 2` = 3 total attempts
- ✅ Checked Vercel env vars: AI_SUMMARY_TIMEOUT_MS and OPENROUTER_TIMEOUT_MS NOT SET
- ✅ Researched AbortController: Promise.race does NOT cancel requests, need AbortSignal
- ✅ Analyzed Cloudflare Worker options: 30s CPU, ~90-100s fetch timeout
- ✅ Created comprehensive implementation plan

## Next Steps (Pending User Approval)
1. **IMMEDIATE**: `vercel env add AI_SUMMARY_TIMEOUT_MS production` → 60000
2. **IMMEDIATE**: `vercel env add OPENROUTER_TIMEOUT_MS production` → 60000
3. **SHORT-TERM**: Reduce SEC client maxRetries from 2 to 1
4. **SHORT-TERM**: Implement AbortController for proper request cancellation

## Key Files
- [docs/plans/2025-11-24-async-pipeline-timeout-fix.md](docs/plans/2025-11-24-async-pipeline-timeout-fix.md) - **NEW** Implementation plan
- [lib/cron/background-filing-worker.ts](lib/cron/background-filing-worker.ts) - Job processing with Promise.race timeout
- [lib/sec-edgar/client.ts:25](lib/sec-edgar/client.ts) - maxRetries=2, 30s timeout (needs reduction)
- [lib/ai/openrouter-client.ts:38](lib/ai/openrouter-client.ts) - 270s default timeout (critical)
- [lib/cron/types.ts:185](lib/cron/types.ts) - FILING_PROCESSING_TIMEOUT=150000

## Research Documents
- Analysis: [thoughts/shared/research/2025-11-24-async-pipeline-failure-root-cause-analysis.md](thoughts/shared/research/2025-11-24-async-pipeline-failure-root-cause-analysis.md)

---

## Recently Completed (Last 30 Days)

### Implementation Plan Created (2025-11-24 21:30 AEDT)
Created comprehensive 5-phase implementation plan based on verified research:
- Confirmed missing env vars via `vercel env ls`
- Tested Bottleneck retry behavior (retries:2 + failed handler = 3 attempts)
- Researched AbortController behavior (Promise.race doesn't cancel)
- Analyzed Cloudflare Worker timeout constraints (~90-100s)

### Root Cause Analysis (2025-11-24)
Comprehensive analysis identifying 5 root causes for pipeline timeout failures. Key finding: missing environment variables causing OpenRouter to use 270s default timeout.

### Async Pipeline Job Timeout Investigation (2025-11-22)
Identified root cause of all jobs failing with 150s timeout. Problem was AI retry configuration allowing 3 attempts x 100s = 300s, exceeding 150s job timeout. Fixed by setting maxRetries=0 in filing-processor.ts. Also reduced SEC API retry delays to fit within budget.

### Empty Filing ID Bugs (2025-11-22)
Fixed two bugs causing jobs to have empty filingId:
1. STEP 4 placeholder creation (commit 1e68ccb) - Disabled
2. STEP 3 field name mismatch (commit f0ab415) - Changed `filing.filingId` to `filing.id`

### Async Pipeline Production Deployment (2025-11-21)
Deployed Cloudflare Worker with dual endpoint pattern. Worker executes every 10 minutes, calls tier-aware (queues work) and process-filing-queue (processes jobs) endpoints. HMAC authentication working.

### Circuit Breaker Authentication Fix (2025-11-21)
Fixed 401 errors on process-filing-queue endpoint. Updated to use CronAuthService.validateCronRequest() which handles Vercel internal auth, HMAC, and Bearer token.

---

**Last Updated**: 2025-11-24 21:30 AEDT
**Repository**: tldrsec-ai
**Branch**: main
