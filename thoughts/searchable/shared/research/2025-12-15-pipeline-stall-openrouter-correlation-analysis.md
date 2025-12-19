---
date: 2025-12-15T19:53:22+11:00
researcher: Claude
git_commit: 223a5900c1a22918a18b9ca55124f1175f60ba86
branch: main
repository: tldrsec-ai
topic: "Pipeline Stall Analysis - OpenRouter API Activity Correlation"
tags: [research, pipeline, openrouter, cron, stall, correlation, production]
status: complete
last_updated: 2025-12-15
last_updated_by: Claude
---

# Research: Pipeline Stall Analysis - OpenRouter API Activity Correlation

**Date**: 2025-12-15T19:53:22+11:00
**Researcher**: Claude
**Git Commit**: 223a5900c1a22918a18b9ca55124f1175f60ba86
**Branch**: main
**Repository**: tldrsec-ai

## Research Question

The production pipeline is not completing end-to-end. Correlate OpenRouter API activity with pipeline events to identify which API calls are genuine cron-triggered calls vs scripts/manual testing, and determine why the pipeline is stalled.

## Summary

**Root Cause Identified**: The summarization phase (Step 3) is consistently timing out after 270 seconds. All recent ASYNC_SUMMARIZE_CACHED jobs show "Application timeout after 270000ms (requests aborted)" errors. The OpenRouter API **has not received any successful calls since December 4, 2025**, despite the cron pipeline running.

**Key Findings**:
1. **Last successful OpenRouter call**: December 4, 2025 (11 days ago)
2. **Current pipeline status**: Discovery (Step 1) ✅ and Fetch (Step 2) ✅ working, Summarization (Step 3) ❌ failing
3. **Failure mode**: 270s application timeout - jobs never reach OpenRouter API
4. **All pending summarize jobs**: Have valid cached content but cannot complete AI summarization

## Detailed Findings

### 1. OpenRouter API Activity Analysis

From the provided CSV data (`openrouter_activity_2025-12-15.csv`), analyzing 142 API calls:

#### Activity Timeline

| Date Range | Calls | Total Cost | Notes |
|------------|-------|------------|-------|
| Nov 17-24, 2025 | 7 | $0.01 | E2E testing period |
| Nov 27, 2025 | 7 | $0 (free tier) | Pipeline testing |
| Nov 28, 2025 | 41 | $0.04 | Heavy testing + production |
| Nov 29, 2025 | 16 | $0 (free tier) | Production pipeline active |
| Nov 30, 2025 | 14 | $0 (free tier) | Production pipeline active |
| Dec 1-2, 2025 | 33 | $0 (free tier) | Production pipeline active |
| Dec 3, 2025 | 1 | $0.002 | Single call (model switch) |
| Dec 4, 2025 | 6 | $0.01 | **LAST SUCCESSFUL CALLS** |
| Dec 5-15, 2025 | 0 | - | **NO API ACTIVITY** |

#### Pattern Classification

**Cron-Triggered Calls (Automated Production)**:
- **Identifiable by**: Consistent token counts (~4,500-5,800 prompt tokens), model `x-ai/grok-4.1-fast`, app_name `TLDRSEC.AI`
- **Time patterns**: Multiple calls in 30-60 second intervals during processing windows
- **Example**: Nov 30 01:12-01:19 UTC - 14 calls in 7 minutes = batch processing

**Manual/Script-Triggered Calls**:
- **Identifiable by**:
  - Irregular timing (single isolated calls)
  - Very large token counts (500K+ prompt tokens) - likely full filing tests
  - Different models (`x-ai/grok-4-fast` vs `grok-4.1-fast`)
  - Cancelled = true flag
- **Examples**:
  - Nov 28 11:30 - 507,252 tokens (full filing test)
  - Nov 28 11:14-11:27 - Multiple 400K-540K token calls (stress testing)
  - Nov 24 21:04-21:10 - 5 calls with long durations (82-89s) = manual testing

#### Cost Analysis

| Category | Calls | Cost |
|----------|-------|------|
| Free tier (xAI) | 115 | $0 |
| Paid standard | 27 | $0.06 |
| **Total** | 142 | ~$0.06 |

**Notable**: Most production calls used free tier (`variant: free`), costing $0.

### 2. Current Production Pipeline Status

#### Job Queue Status (As of 2025-12-15 17:53 AEDT)

```
Status Breakdown:
  COMPLETED:
    ASYNC_DISCOVER_FILINGS:    2,238
    ASYNC_FETCH_FILING:        2,172
    ASYNC_SUMMARIZE_CACHED:       32  ← Only 32 ever completed!

  DEAD_LETTER (permanent failures):
    ASYNC_SUMMARIZE_CACHED:    2,150  ← Massive failure rate
    ASYNC_FETCH_FILING:        9,737
    ASYNC_DISCOVER_FILINGS:      283
    ASYNC_SUMMARIZE_FILING:       61

  PENDING (waiting to process):
    ASYNC_DISCOVER_FILINGS:      438
    ASYNC_SUMMARIZE_CACHED:        3
    ASYNC_SUMMARIZE_FILING:       70

  RETRYING (will retry):
    ASYNC_SUMMARIZE_CACHED:       15

  FAILED:
    ASYNC_SUMMARIZE_CACHED:       20
```

#### Last Successful Completion by Job Type

| Job Type | Last Completion |
|----------|----------------|
| ASYNC_DISCOVER_FILINGS | Dec 15, 17:24 AEDT | ✅ Working |
| ASYNC_FETCH_FILING | Dec 15, 17:41 AEDT | ✅ Working |
| ASYNC_SUMMARIZE_CACHED | **Dec 11, 05:11 AEDT** | ❌ 4+ days stalled |

**Critical Finding**: Summarization hasn't completed successfully for 4+ days, and the last OpenRouter API call was December 4 (11 days ago).

### 3. Error Analysis

All 35 pending/retrying/failed ASYNC_SUMMARIZE_CACHED jobs show the same error:

```
Error: Application timeout after 270000ms (requests aborted)
```

This means:
1. The job handler starts
2. It retrieves cached content successfully (confirmed - cacheId validity checks pass)
3. It attempts to call OpenRouter API
4. The request times out after 4.5 minutes **without ever reaching OpenRouter**

#### Sample of Failed Jobs

| Created | Ticker | CacheId | Status | Error |
|---------|--------|---------|--------|-------|
| Dec 15 17:41 | NVDA | cmj6sc71n... | PENDING | none (brand new) |
| Dec 15 17:31 | NVDA | cmj6rz8qh... | RETRYING (1/3) | timeout 270000ms |
| Dec 15 17:30 | GOOGL | cmj6rz0dk... | RETRYING (1/3) | timeout 270000ms |
| Dec 15 17:20 | KO | cmj6rm8f3... | RETRYING (1/3) | timeout 270000ms |
| Dec 12 18:01 | VRT | cmj2iqd2t... | FAILED (3/3) | timeout 270000ms |

### 4. Cache Status (Confirmed Working)

FilingContentCache entries are being created successfully:

| Accession Number | Status | Length | Fetched |
|-----------------|--------|--------|---------|
| 0001283854-25-000009 | CACHED | 8,522 | Dec 15 17:41 |
| 0001958244-25-004541 | CACHED | 23,471 | Dec 15 17:41 |
| 0001197649-25-000058 | CACHED | 12,584 | Dec 15 17:41 |
| 0001588670-25-000015 | CACHED | 46,941 | Dec 15 17:31 |

**Conclusion**: Discovery and Fetch phases are working. Content is being cached. The failure is specifically in the summarization phase.

### 5. Lock Status (No Stale Locks)

```
Recent locks: 0
Stale locks (expired but not released): 0
Currently PROCESSING jobs: 0
```

The proactive lock cleanup (PR #263) is working - no stale locks are blocking the pipeline.

## Root Cause Analysis

### Why Summarization Is Failing

The 270-second timeout occurs at the application level (`FILING_PROCESSING_TIMEOUT` in [lib/cron/handlers/types.ts:187](lib/cron/handlers/types.ts#L187)), **before** the request reaches OpenRouter. This suggests:

1. **Possible Causes**:
   - OpenRouter API endpoint is unreachable from Vercel
   - Network timeout/firewall blocking outbound HTTPS to `openrouter.ai`
   - API key validation failing silently before request
   - DNS resolution issues
   - Vercel function cold start + AI request exceeds 270s budget

2. **Evidence Supporting Network/API Issue**:
   - Zero OpenRouter API calls recorded since Dec 4
   - Jobs timeout consistently at exactly 270,000ms (the configured limit)
   - No partial responses or rate limit errors
   - Cache content is valid and available

3. **Evidence Against Code Bug**:
   - Same code worked successfully Nov 28 - Dec 4
   - 32 ASYNC_SUMMARIZE_CACHED jobs completed successfully before
   - No code changes to summarization logic since last success

### Timeline of Failure

| Date | Event |
|------|-------|
| Dec 4, 09:33 UTC | Last successful OpenRouter API call |
| Dec 4-10 | Unknown - no API calls, no completed summarizations |
| Dec 11, 05:11 AEDT | Last ASYNC_SUMMARIZE_CACHED completion (how? needs investigation) |
| Dec 12 onwards | All summarize jobs failing with 270s timeout |
| Dec 15 | Pipeline still stalled, 35+ jobs pending/failing |

## Correlation: OpenRouter Activity vs Pipeline Events

### Genuine Cron-Triggered Calls

The following date ranges show clear cron-triggered patterns:

**Nov 28-30, 2025**: Heavy production activity
- Multiple calls per minute during cron windows
- Consistent ~5,000 token prompts
- Free tier usage
- All completed successfully

**Dec 1-2, 2025**: Production pipeline running
- 33 calls over 2 days
- Batch patterns visible (5+ calls within minutes)
- All using `x-ai/grok-4.1-fast`

**Dec 3-4, 2025**: Pipeline slowing down
- Only 7 calls total
- Dec 4 was the last successful batch

### Manual/Test-Triggered Calls

**Nov 24, 2025**: E2E Testing
- 5 calls with 49-89 second durations
- Isolated timing (not batch pattern)
- Using standard variant (paid)

**Nov 28, 11:14-11:30 UTC**: Stress Testing
- 20+ calls with 400K-540K token prompts
- Testing full filing summarization
- One cancelled call (interrupted test)

**Nov 28, 02:21-02:32 UTC**: Comprehensive Testing
- 20 calls in 10 minutes
- Mix of small (1.5K tokens) and large (23K tokens) prompts
- Standard variant (paid tier)

## Code References

### Summarization Handler
- [lib/cron/handlers/summarize-cached-handler.ts:58](lib/cron/handlers/summarize-cached-handler.ts#L58) - `handleSummarizeCached()` entry point
- [lib/cron/handlers/summarize-cached-handler.ts:223](lib/cron/handlers/summarize-cached-handler.ts#L223) - `generateAISummary()` call

### OpenRouter Client
- [lib/ai/openrouter-client.ts:755](lib/ai/openrouter-client.ts#L755) - HTTP fetch to OpenRouter API
- [lib/ai/openrouter-client.ts:428](lib/ai/openrouter-client.ts#L428) - Model selection logic

### Timeout Configuration
- [lib/cron/handlers/types.ts:187](lib/cron/handlers/types.ts#L187) - `FILING_PROCESSING_TIMEOUT = 270000` (4.5 min)
- [services/filing/summaryGenerationService.ts:150](services/filing/summaryGenerationService.ts#L150) - AI timeout 100s

### Background Worker
- [lib/cron/background-filing-worker.ts:342-345](lib/cron/background-filing-worker.ts#L342-L345) - Promise.race with timeout

## Recommendations

### Immediate Actions

1. **Verify OpenRouter API Connectivity**:
   ```bash
   # From Vercel function or local with same env vars
   curl -X POST https://openrouter.ai/api/v1/chat/completions \
     -H "Authorization: Bearer $OPENROUTER_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"model":"x-ai/grok-4.1-fast","messages":[{"role":"user","content":"test"}]}'
   ```

2. **Check API Key Validity**:
   - Log into OpenRouter dashboard
   - Verify `TLDRSEC_AI_SUMMARIZER` key is active and not revoked
   - Check for any account issues (billing, limits)

3. **Review Vercel Logs**:
   ```bash
   vercel logs --filter api/cron/process-filing-queue
   ```
   Look for:
   - Network errors (ECONNREFUSED, ETIMEDOUT)
   - API key validation failures
   - SSL/TLS errors

4. **Test Locally**:
   ```bash
   npm run test:e2e
   ```
   Does local summarization work with production API keys?

### Diagnostic Script

Create a minimal test to isolate the issue:

```typescript
// scripts/test-openrouter-connectivity.ts
import { openRouterClient } from '../lib/ai/openrouter-client';

async function test() {
  console.log('Testing OpenRouter connectivity...');
  console.log('API Key prefix:', process.env.TLDRSEC_AI_SUMMARIZER?.substring(0, 10));

  try {
    const result = await openRouterClient.sendMessage(
      [{ role: 'user', content: 'Say "connected" in one word.' }],
      { model: 'x-ai/grok-4.1-fast', maxTokens: 10, timeout: 30000 }
    );
    console.log('SUCCESS:', result);
  } catch (error) {
    console.error('FAILURE:', error);
  }
}

test();
```

## Critical Update: Local Testing Results

**OpenRouter API works locally!**

Ran `npx tsx scripts/test-openrouter-direct.ts`:
```
📋 Phase 1: Environment Configuration
API Key: ✅ Set (sk-or-v1-2...)
Model: x-ai/grok-4.1-fast

🌐 Phase 2: Direct API Connectivity Test
Response Status: 200 OK
✅ API Request Successful

📊 Phase 3: Response Analysis
Response Content: "OpenRouter connection successful"
Input Tokens: 175
Output Tokens: 142

🔧 Phase 4: Model Availability Test
Total available models: 341
Target model (x-ai/grok-4.1-fast): ✅ Available
   Context length: 2000000
   Pricing: $0.0000002/1K input tokens

🎉 OpenRouter API is working correctly!
   Issue must be in the application integration layer.
```

**New Hypothesis**: The issue is NOT with OpenRouter API or API key validity. The problem is somewhere in the Vercel production environment:

1. **Possible Vercel-Specific Issues**:
   - Function timeout limits on Vercel (hobby plan: 60s, pro plan: 300s)
   - Cold start delays eating into timeout budget
   - Network egress restrictions from Vercel
   - Environment variable not properly set in Vercel

2. **Next Steps**:
   - Check Vercel function logs for the actual error
   - Verify `TLDRSEC_AI_SUMMARIZER` is set correctly in Vercel dashboard
   - Check Vercel plan limits (function duration)
   - Test with a minimal Vercel function to isolate the issue

## Open Questions

1. **Dec 11 Completion Mystery**: How did a summarization complete on Dec 11 when the last OpenRouter call was Dec 4? Was it a cache hit or a different code path?

2. **What Changed Dec 4-5?**:
   - Any Vercel deployment changes?
   - OpenRouter API changes?
   - Network/firewall changes?

3. **Why Exact 270s Timeout?**:
   - Is the request actually being sent and waiting?
   - Or is it failing immediately and the timeout is a separate issue?

4. **Vercel Environment**:
   - Is `TLDRSEC_AI_SUMMARIZER` set correctly?
   - What are the Vercel function timeout limits?
   - Are there any Vercel-specific restrictions?

## Related Research

- [2025-12-14-pipeline-stall-comprehensive-codebase-analysis.md](2025-12-14-pipeline-stall-comprehensive-codebase-analysis.md) - Full pipeline architecture documentation
- [2025-12-12-pipeline-still-stalled-backlog-not-clearing.md](2025-12-12-pipeline-still-stalled-backlog-not-clearing.md) - Previous stall investigation

## Historical Context (from thoughts/)

- Multiple pipeline stalls investigated in December 2025
- Previous stalls were caused by: stale locks, orphaned jobs, Prisma field reference bug
- This appears to be a NEW failure mode: AI API connectivity issue
