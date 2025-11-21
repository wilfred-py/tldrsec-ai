# Complete Async Pipeline Integration - Implementation Plan

**Date**: 2025-11-21
**Branch**: main
**Commit**: 341aa7c
**Status**: Implementation Planning

## Executive Summary

This plan completes the async pipeline integration to fix the E2E summarization pipeline that is currently delivering zero summaries. The pipeline has been partially implemented with async infrastructure but user filing processing remains synchronous, causing timeouts and preventing summary delivery.

**Ultimate Success Metric**: Summaries per dollar > 0 (currently = 0)

**Root Cause**: User filing processing blocks on AI calls, Cloudflare Worker only triggers tier-aware endpoint (not background worker), endpoint returns 200 OK instead of 202 Accepted.

**Solution**: Complete async integration by making Cloudflare Worker call both endpoints, converting user filing processing to async queueing, implementing 202 Accepted response pattern, and tracking "summaries per dollar" metric in CronJobMetrics table.

## Research Foundation

This plan is based on comprehensive root cause analysis documented in:
- [Root Cause Analysis](../../thoughts/shared/research/2025-11-21-e2e-pipeline-root-cause-and-validation-metrics.md) (1,043 lines)
- [PROGRESS.md](../../PROGRESS.md) - Verified async implementation status

### Key Research Findings

1. **Async Infrastructure Status**: PARTIALLY IMPLEMENTED
   - ✅ Email sending: Using `AsyncEmailQueue`
   - ✅ Backlog filing queueing: Using `AsyncFilingQueue.queueMultipleFilings()`
   - ❌ User filing processing: STILL SYNCHRONOUS ([filing-processor.ts:800](../../lib/cron/filing-processor.ts#L800))
   - ❌ Endpoint response: Returns 200 OK, NOT 202 Accepted
   - ❌ Background worker: Exists but NO cron schedule to trigger it

2. **Cloudflare Worker Limitation**: Only calls `/api/cron/tier-aware`, NOT `/api/cron/process-filing-queue` ([index.js:113](../../cloudflare-cron/index.js#L113))

3. **Dead Code Issue**: `aiCostTracking` references non-existent database table (should be removed)

4. **N+1 Query Problem**: 50 separate DB queries add 1.5-4s overhead

5. **Timeout Issue**: 21-second Cloudflare Worker timeout due to synchronous AI processing

## User Decisions (Confirmed)

1. **Current State**: Monitoring Worker logs for 2 hours without resolution
2. **Cron Management**: Using Cloudflare Workers (not Vercel)
3. **Background Worker Trigger**: Make Cloudflare Worker call BOTH endpoints (Solution 1)
4. **Implementation Priority**: Fix pipeline first, then track metrics (Option A)
5. **Metric Storage**: Add to existing `CronJobMetrics` table (Option 3)
6. **Validation Method**: Use wrangler CLI

## Architecture Overview

### Current Flow (BROKEN)

```
Cloudflare Worker (every 10 min)
  ↓
  └─→ /api/cron/tier-aware (ONLY endpoint called)
        ↓
        ├─→ Backlog processing: ASYNC ✅ (uses AsyncFilingQueue)
        │     └─→ Jobs queued to JobQueue table
        │
        └─→ User filing processing: SYNCHRONOUS ❌
              └─→ Blocks on AI summarization (30-90s)
                    └─→ 21s timeout → FAILURE

/api/cron/process-filing-queue (EXISTS but NEVER TRIGGERED)
  └─→ Background worker idle
        └─→ Queued jobs accumulate (never processed)
```

### Target Flow (FIXED)

```
Cloudflare Worker (every 10 min)
  ↓
  ├─→ /api/cron/tier-aware (returns 202 Accepted)
  │     ↓
  │     ├─→ Backlog processing: ASYNC ✅
  │     │     └─→ Jobs queued to JobQueue table
  │     │
  │     └─→ User filing processing: ASYNC ✅ (NEW)
  │           └─→ Queue filings (no AI blocking)
  │                 └─→ Jobs queued to JobQueue table
  │
  └─→ /api/cron/process-filing-queue (CALLED after tier-aware)
        ↓
        └─→ Background worker processes queued jobs
              ↓
              └─→ AI summarization (async)
                    ↓
                    └─→ Email delivery (AsyncEmailQueue)
                          ↓
                          └─→ SUCCESS: summaries per dollar > 0 ✅
```

## Implementation Phases

### Phase 1: Update Cloudflare Worker to Call Both Endpoints

**Objective**: Make Cloudflare Worker trigger both `/api/cron/tier-aware` AND `/api/cron/process-filing-queue` endpoints.

**Why First**: Unblocks background worker so queued jobs can be processed.

#### Changes Required

**File**: `cloudflare-cron/index.js`

**Current Code** (Line 113):
```javascript
const optimizedUrl = `${env.PUBLIC_URL}/api/cron/tier-aware`;
const fallbackUrl = `${env.PUBLIC_URL}/api/cron/tier-aware`;
```

**New Implementation**:
```javascript
// Primary endpoint: tier-aware (queues jobs)
const tierAwareUrl = `${env.PUBLIC_URL}/api/cron/tier-aware`;

// Secondary endpoint: process-filing-queue (processes jobs)
const workerUrl = `${env.PUBLIC_URL}/api/cron/process-filing-queue`;
```

#### Implementation Steps

1. **Add Sequential Endpoint Calls** (after line 113):
   ```javascript
   // Step 1: Call tier-aware to queue new filings
   logger.log('Calling tier-aware endpoint to queue filings...');
   const tierAwareResponse = await makeAuthenticatedRequest(
     tierAwareUrl,
     env,
     requestId,
     logger
   );

   // Step 2: Call process-filing-queue to process queued jobs
   logger.log('Calling process-filing-queue endpoint to process jobs...');
   const workerResponse = await makeAuthenticatedRequest(
     workerUrl,
     env,
     requestId,
     logger
   );

   // Combine responses for circuit breaker evaluation
   const combinedSuccess = tierAwareResponse.success && workerResponse.success;
   ```

2. **Update Circuit Breaker Logic** (line 150-165):
   - Evaluate both responses for circuit breaker state
   - Only mark success if BOTH endpoints succeed
   - Track separate failure counts if needed

3. **Update Response Handling** (line 170-190):
   - Return combined status to Cloudflare
   - Include metrics from both endpoints
   - Log both response times

#### Validation Steps

1. **Test Worker Locally**:
   ```bash
   cd cloudflare-cron
   npx wrangler dev
   ```

2. **Validate Configuration**:
   ```bash
   cd cloudflare-cron
   npx wrangler deploy --dry-run
   ```

3. **Deploy to Production**:
   ```bash
   cd cloudflare-cron
   npx wrangler deploy
   ```

4. **Monitor Logs**:
   ```bash
   cd cloudflare-cron
   npx wrangler tail --format=pretty
   ```

#### Success Criteria

- ✅ Worker calls tier-aware endpoint successfully
- ✅ Worker calls process-filing-queue endpoint after tier-aware
- ✅ Both endpoints return within timeout (21s total)
- ✅ Circuit breaker evaluates both responses
- ✅ Logs show both endpoints being called
- ✅ No authentication errors (HMAC works for both)

#### Rollback Procedure

If issues occur:
1. Revert Worker to single endpoint call
2. Deploy rollback: `npx wrangler rollback`
3. Verify logs show single endpoint pattern
4. Investigate failures before retry

---

### Phase 2: Convert User Filing Processing to Async

**Objective**: Make user filing processing fully async by queueing jobs instead of processing synchronously.

**Why Second**: Allows tier-aware endpoint to return 202 Accepted quickly without blocking on AI.

#### Changes Required

**File**: `app/api/cron/tier-aware/route.ts`

**Current Code** (Lines 602-625):
```typescript
// Process user filings (SYNCHRONOUS - BLOCKS ON AI)
for (const user of sortedUsers) {
  await CronFilingProcessor.processUserWithDeduplicatedFilings(
    user,
    companyFilings,
    cronJobMetrics,
    emailBatchManager,
    globalContext
  );
}
```

**New Implementation**:
```typescript
// Queue user filings for async processing (NON-BLOCKING)
for (const user of sortedUsers) {
  const userFilings = companyFilings.filter(filing =>
    user.tickers.some(ticker => ticker.symbol === filing.ticker.symbol)
  );

  for (const filing of userFilings) {
    await AsyncFilingQueue.queueFilingForProcessing({
      userId: user.id,
      filingId: filing.id,
      tickerId: filing.ticker.id,
      priority: getPriorityForUser(user), // Use existing priority logic
      metadata: {
        formType: filing.formType,
        companyName: filing.ticker.companyName,
        filedAt: filing.filedAt
      }
    });
  }

  cronJobMetrics.queuedUserFilings += userFilings.length;
}
```

#### Implementation Steps

1. **Import AsyncFilingQueue** (top of file):
   ```typescript
   import { AsyncFilingQueue } from '@/lib/cron/async-filing-queue';
   ```

2. **Replace Synchronous Processing Loop** (lines 602-625):
   - Remove direct `CronFilingProcessor.processUserWithDeduplicatedFilings()` call
   - Add queueing logic using `AsyncFilingQueue.queueFilingForProcessing()`
   - Deduplicate filings before queueing (use existing logic)

3. **Update Response Status Code** (line 850):
   ```typescript
   // OLD: Return 200 OK
   return NextResponse.json(response, { status: 200 });

   // NEW: Return 202 Accepted (async processing)
   return NextResponse.json({
     ...response,
     async: true,
     message: 'Filings queued for async processing',
     queuedJobs: cronJobMetrics.queuedUserFilings
   }, { status: 202 });
   ```

4. **Update CronJobMetrics Tracking** (line 830-840):
   ```typescript
   // Add new metric field
   queuedUserFilings: cronJobMetrics.queuedUserFilings || 0,
   queuedBacklogFilings: cronJobMetrics.queuedBacklogFilings || 0,
   totalQueuedFilings: (cronJobMetrics.queuedUserFilings || 0) + (cronJobMetrics.queuedBacklogFilings || 0)
   ```

5. **Remove Direct AI Processing** (filing-processor.ts:800):
   - Keep for background worker use
   - NOT called from tier-aware anymore

#### Validation Steps

1. **Unit Test Queueing**:
   ```bash
   npm run test -- async-filing-queue.test.ts
   ```

2. **Integration Test Endpoint**:
   ```bash
   npm run test:cron-comprehensive
   ```

3. **Manual Test**:
   ```bash
   curl -X POST https://tldrsec.app/api/cron/tier-aware \
     -H "Authorization: Bearer $CRON_SECRET" \
     -H "Content-Type: application/json"
   ```
   - Verify 202 Accepted response
   - Check JobQueue table for queued jobs

4. **Database Verification**:
   ```sql
   SELECT status, COUNT(*)
   FROM "JobQueue"
   WHERE "jobType" = 'ASYNC_SUMMARIZE_FILING'
   GROUP BY status;
   ```
   - Should show PENDING jobs increasing

#### Success Criteria

- ✅ Endpoint returns 202 Accepted (not 200 OK)
- ✅ Response time < 5 seconds (no AI blocking)
- ✅ User filings queued to JobQueue table
- ✅ Jobs have correct priority and metadata
- ✅ No synchronous AI processing in tier-aware
- ✅ Cloudflare Worker no longer times out (21s)
- ✅ Circuit breaker stays closed

#### Rollback Procedure

If issues occur:
1. Revert to synchronous processing
2. Change response back to 200 OK
3. Deploy rollback commit
4. Verify endpoint works without queueing
5. Investigate queue issues before retry

---

### Phase 3: Add "Summaries Per Dollar" Metric to CronJobMetrics

**Objective**: Track ultimate success metric in existing `CronJobMetrics` table.

**Why Third**: Establishes baseline tracking after pipeline fix to measure improvement from 0 to >0.

#### Changes Required

**File**: `prisma/schema.prisma`

**Model**: `CronJobMetrics` (lines 380-450)

**New Fields**:
```prisma
model CronJobMetrics {
  // ... existing fields ...

  // New: Summaries per dollar tracking
  summariesGenerated     Int      @default(0)  // Count of AI summaries generated
  totalAiCostUsd         Float    @default(0)  // Total AI cost in USD
  summariesPerDollar     Float    @default(0)  // Calculated: summariesGenerated / totalAiCostUsd
  costPerSummary         Float    @default(0)  // Calculated: totalAiCostUsd / summariesGenerated

  // Existing fields...
}
```

#### Implementation Steps

1. **Update Prisma Schema** (prisma/schema.prisma):
   - Add 4 new fields to `CronJobMetrics` model
   - Run migration: `npm run db:migrate`
   - Generate Prisma client: `npm run db:generate`

2. **Update BackgroundFilingWorker** (lib/cron/background-filing-worker.ts):
   ```typescript
   // After successful summary generation
   const aiCost = summary.inputTokenCost + summary.outputTokenCost;

   await prisma.cronJobMetrics.update({
     where: { id: metricsId },
     data: {
       summariesGenerated: { increment: 1 },
       totalAiCostUsd: { increment: aiCost },
       summariesPerDollar: {
         set: calculateSummariesPerDollar(
           currentMetrics.summariesGenerated + 1,
           currentMetrics.totalAiCostUsd + aiCost
         )
       },
       costPerSummary: {
         set: calculateCostPerSummary(
           currentMetrics.summariesGenerated + 1,
           currentMetrics.totalAiCostUsd + aiCost
         )
       }
     }
   });
   ```

3. **Add Calculation Helpers** (lib/cron/metrics-calculator.ts - NEW FILE):
   ```typescript
   export function calculateSummariesPerDollar(
     summariesGenerated: number,
     totalAiCostUsd: number
   ): number {
     if (totalAiCostUsd === 0) return 0;
     return summariesGenerated / totalAiCostUsd;
   }

   export function calculateCostPerSummary(
     summariesGenerated: number,
     totalAiCostUsd: number
   ): number {
     if (summariesGenerated === 0) return 0;
     return totalAiCostUsd / summariesGenerated;
   }
   ```

4. **Update Dashboard Display** (components/dashboard/metrics-display.tsx):
   ```typescript
   // Add to metrics dashboard
   <MetricCard
     title="Summaries Per Dollar"
     value={metrics.summariesPerDollar.toFixed(2)}
     description="Ultimate success metric"
     trend={metrics.summariesPerDollar > 0 ? 'up' : 'neutral'}
     status={metrics.summariesPerDollar > 0 ? 'success' : 'warning'}
   />

   <MetricCard
     title="Cost Per Summary"
     value={`$${metrics.costPerSummary.toFixed(4)}`}
     description="Efficiency metric"
   />
   ```

5. **Add Monitoring Query** (scripts/check-metrics.ts - NEW FILE):
   ```typescript
   // Query latest metrics
   const latestMetrics = await prisma.cronJobMetrics.findFirst({
     orderBy: { createdAt: 'desc' },
     select: {
       summariesGenerated: true,
       totalAiCostUsd: true,
       summariesPerDollar: true,
       costPerSummary: true,
       createdAt: true
     }
   });

   console.log('Latest Metrics:', {
     summariesGenerated: latestMetrics.summariesGenerated,
     totalAiCostUsd: `$${latestMetrics.totalAiCostUsd.toFixed(4)}`,
     summariesPerDollar: latestMetrics.summariesPerDollar.toFixed(2),
     costPerSummary: `$${latestMetrics.costPerSummary.toFixed(4)}`,
     status: latestMetrics.summariesPerDollar > 0 ? 'SUCCESS ✅' : 'FAILING ❌'
   });
   ```

#### Validation Steps

1. **Database Migration**:
   ```bash
   npm run db:migrate
   npm run db:generate
   npm run build
   ```

2. **Test Calculation Logic**:
   ```bash
   npm run test -- metrics-calculator.test.ts
   ```

3. **Verify Metric Updates**:
   ```sql
   SELECT
     "summariesGenerated",
     "totalAiCostUsd",
     "summariesPerDollar",
     "costPerSummary",
     "createdAt"
   FROM "CronJobMetrics"
   ORDER BY "createdAt" DESC
   LIMIT 10;
   ```

4. **Run Monitoring Script**:
   ```bash
   npm run metrics:check
   ```

#### Success Criteria

- ✅ Schema migration completes successfully
- ✅ New fields exist in CronJobMetrics table
- ✅ Metrics update after each summary generation
- ✅ Calculations are accurate (summaries/cost and cost/summaries)
- ✅ Dashboard displays new metrics
- ✅ Monitoring script shows current state
- ✅ **Ultimate metric > 0 after pipeline fix**

#### Rollback Procedure

If issues occur:
1. Revert database migration
2. Remove new fields from schema
3. Regenerate Prisma client
4. Deploy rollback
5. Investigate calculation errors before retry

---

### Phase 4: Cleanup and Optimization

**Objective**: Remove dead code and optimize N+1 query pattern.

**Why Last**: Non-critical improvements after pipeline is working.

#### 4.1: Remove aiCostTracking Dead Code

**Problem**: Code references `prisma.aiCostTracking` but table doesn't exist in schema.

**Files to Update**:
1. `lib/ai/cost-tracker.ts` (lines 293, 349, 376, 431, 436, 444, 564)

**Changes**:
```typescript
// REMOVE: All prisma.aiCostTracking calls
await prisma.aiCostTracking.create({ ... });  // ❌ DELETE

// KEEP: Summary model already tracks costs
await prisma.summary.update({
  where: { id: summaryId },
  data: {
    inputTokens,
    outputTokens,
    inputTokenCost,
    outputTokenCost,
    totalCost: inputTokenCost + outputTokenCost
  }
});  // ✅ KEEP
```

**Validation**:
```bash
# Search for remaining references
grep -r "aiCostTracking" lib/ app/ services/

# Should return empty (no matches)
```

#### 4.2: Optimize N+1 Query Pattern

**Problem**: 50 separate DB queries for user tickers add 1.5-4s overhead.

**File**: `app/api/cron/tier-aware/route.ts` (lines 520-580)

**Current Code**:
```typescript
// N+1: Fetches users, then tickers for each user separately
const users = await prisma.user.findMany({
  where: { emailVerified: true }
});

for (const user of users) {
  const tickers = await prisma.ticker.findMany({  // ❌ Separate query per user
    where: { userId: user.id }
  });
}
```

**Optimized Code**:
```typescript
// Single query with includes
const users = await prisma.user.findMany({
  where: { emailVerified: true },
  include: {
    tickers: {  // ✅ Single join query
      include: {
        companyName: true,
        symbol: true,
        cikNumber: true
      }
    }
  }
});
```

**Expected Improvement**: 1.5-4s reduction in query time

**Validation**:
1. **Measure Query Time Before**:
   ```typescript
   const startTime = performance.now();
   // ... query code ...
   const endTime = performance.now();
   console.log(`Query time: ${endTime - startTime}ms`);
   ```

2. **Apply Optimization**

3. **Measure Query Time After**:
   - Should see 1.5-4s reduction

4. **Test Endpoint**:
   ```bash
   npm run test:cron-comprehensive
   ```

#### Success Criteria

- ✅ No `aiCostTracking` references in codebase
- ✅ Build passes without errors
- ✅ Tests pass without mock failures
- ✅ N+1 query eliminated
- ✅ Query time reduced by 1.5-4s
- ✅ Endpoint response time < 5s total

#### Rollback Procedure

If issues occur:
1. Revert query optimization
2. Restore original N+1 pattern (slower but works)
3. Investigate join query issues
4. Consider alternative optimization strategies

---

## Testing Strategy

### Pre-Deployment Testing

1. **Unit Tests**:
   ```bash
   npm run test
   ```

2. **Integration Tests**:
   ```bash
   npm run test:cron-comprehensive
   ```

3. **E2E Pipeline Test**:
   ```bash
   npm run test:e2e
   ```

4. **Cloudflare Worker Test**:
   ```bash
   cd cloudflare-cron
   npx wrangler dev
   # Trigger manually, verify both endpoints called
   ```

### Post-Deployment Monitoring

1. **Cloudflare Worker Logs**:
   ```bash
   cd cloudflare-cron
   npx wrangler tail --format=pretty
   ```
   - Verify both endpoints called
   - Verify no authentication errors
   - Verify response times < 21s

2. **Database Queue Status**:
   ```sql
   -- Check job accumulation
   SELECT status, COUNT(*)
   FROM "JobQueue"
   WHERE "jobType" = 'ASYNC_SUMMARIZE_FILING'
   GROUP BY status;

   -- Should see:
   -- PENDING: Jobs queuing (increasing)
   -- PROCESSING: Jobs being processed (1-3)
   -- COMPLETED: Jobs finishing (increasing)
   -- FAILED: Minimal failures
   ```

3. **Metrics Dashboard**:
   ```bash
   npm run metrics:check
   ```
   - Verify `summariesPerDollar > 0` (SUCCESS)
   - Monitor cost efficiency
   - Track queue depth

4. **Email Delivery**:
   - Check user inboxes for summaries
   - Verify email rate limiting compliance
   - Confirm AsyncEmailQueue working

### Success Validation Checklist

After all phases deployed:

- [ ] Cloudflare Worker calls both endpoints every 10 minutes
- [ ] Tier-aware returns 202 Accepted in < 5 seconds
- [ ] User filings queued (not processed synchronously)
- [ ] Background worker processes queued jobs
- [ ] AI summaries generated successfully
- [ ] Emails delivered to users
- [ ] **Summaries per dollar > 0 (ULTIMATE SUCCESS METRIC)**
- [ ] No timeouts in Cloudflare Worker logs
- [ ] Circuit breaker stays closed
- [ ] Queue depth stable (not accumulating)
- [ ] aiCostTracking references removed
- [ ] N+1 query optimized

---

## Risk Assessment

### High Risk

1. **Cloudflare Worker Dual Endpoints**
   - Risk: Breaking circuit breaker logic
   - Mitigation: Test thoroughly with wrangler dev
   - Rollback: Revert to single endpoint call

2. **Async Conversion**
   - Risk: Jobs queue but never process
   - Mitigation: Verify background worker triggered
   - Rollback: Revert to synchronous processing

### Medium Risk

3. **Database Migration**
   - Risk: Schema changes affect existing queries
   - Mitigation: Test migration in staging
   - Rollback: Revert migration

4. **N+1 Query Optimization**
   - Risk: Join query slower than expected
   - Mitigation: Measure before/after
   - Rollback: Revert to N+1 (slower but works)

### Low Risk

5. **Dead Code Removal**
   - Risk: Missed reference causes runtime error
   - Mitigation: Comprehensive grep search
   - Rollback: Restore removed code

---

## Timeline Estimate

### Phase 1: Cloudflare Worker (2-3 hours)
- Update index.js: 1 hour
- Test with wrangler: 30 minutes
- Deploy and monitor: 30 minutes
- Validate both endpoints called: 1 hour

### Phase 2: Async Conversion (3-4 hours)
- Update tier-aware route: 2 hours
- Test queueing logic: 1 hour
- Deploy and monitor: 30 minutes
- Verify 202 Accepted: 30 minutes

### Phase 3: Metrics Tracking (2-3 hours)
- Schema migration: 30 minutes
- Update worker metrics: 1 hour
- Dashboard integration: 1 hour
- Verification: 30 minutes

### Phase 4: Cleanup (1-2 hours)
- Remove aiCostTracking: 30 minutes
- Optimize N+1 query: 1 hour
- Testing: 30 minutes

**Total Estimated Time**: 8-12 hours

---

## Dependencies

### External Services
- Cloudflare Workers (wrangler CLI)
- Neon PostgreSQL (via Prisma)
- Claude AI (Anthropic API)
- Resend (email delivery)

### Environment Variables Required
- `CRON_SECRET` (Cloudflare Worker + Vercel)
- `DATABASE_URL` (Neon PostgreSQL)
- `ANTHROPIC_API_KEY` (Claude AI)
- `RESEND_API_KEY` (email delivery)
- `PUBLIC_URL` (https://tldrsec.app)

### Tooling Required
- Node.js 18+
- npm
- wrangler CLI
- Prisma CLI
- PostgreSQL client (psql)

---

## Monitoring Plan

### First 24 Hours After Deployment

**Every Hour**:
1. Check Cloudflare Worker logs
2. Verify queue status (pending/processing/completed)
3. Check `summariesPerDollar` metric
4. Monitor circuit breaker state
5. Verify email delivery

**Key Metrics to Watch**:
- Summaries generated: Should be > 0
- Queue depth: Should stay stable (not growing)
- Processing time: Should be < 5s for tier-aware
- Circuit breaker: Should stay CLOSED
- Error rate: Should be < 5%

### Long-Term Monitoring (Week 1)

**Daily**:
1. Review `summariesPerDollar` trend
2. Monitor cost efficiency
3. Check queue accumulation
4. Verify email delivery rate
5. Review error logs

**Weekly**:
1. Calculate average summaries per dollar
2. Analyze cost per summary trend
3. Review failed job patterns
4. Optimize based on metrics

---

## Success Criteria Summary

### Must Have (MVP)
1. ✅ Cloudflare Worker calls both endpoints
2. ✅ Tier-aware returns 202 Accepted
3. ✅ User filings queued asynchronously
4. ✅ Background worker processes jobs
5. ✅ **Summaries per dollar > 0**

### Should Have
6. ✅ Response time < 5s for tier-aware
7. ✅ Circuit breaker stays closed
8. ✅ Queue depth stable
9. ✅ Metrics dashboard updated
10. ✅ Dead code removed

### Nice to Have
11. ✅ N+1 query optimized
12. ✅ Email delivery rate > 95%
13. ✅ Cost per summary < $0.10
14. ✅ Error rate < 5%

---

## Approval Required

Please review this implementation plan and confirm:

1. **Phase Order**: Fix pipeline first (Phase 1-2), then track metrics (Phase 3), then optimize (Phase 4)
2. **Cloudflare Worker Changes**: Make Worker call both endpoints sequentially
3. **Async Conversion**: Convert user filing processing to queueing (no AI blocking)
4. **Metric Storage**: Add to existing `CronJobMetrics` table
5. **Validation Method**: Use wrangler CLI throughout
6. **Timeline**: 8-12 hours of implementation time

Once approved, I will begin Phase 1 implementation.

---

**Plan Status**: Awaiting Approval
**Next Action**: Review plan, provide feedback, approve to proceed
**Created**: 2025-11-21
**Last Updated**: 2025-11-21
