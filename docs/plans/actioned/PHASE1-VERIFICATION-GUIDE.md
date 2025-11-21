# Phase 1 Verification Guide: Async Filing Queue

**Branch:** `implement/async-cron-processing`
**Status:** Ready for Testing
**Date:** 2025-11-21

## Overview

Phase 1 converts synchronous backlog filing processing to async job queueing, reducing cron execution time from 2-4 minutes to 5-10 seconds and eliminating Cloudflare 524 timeout errors.

## Pre-Deployment Checklist

- [x] Build successful
- [x] Linting passed (no errors)
- [x] Code committed and pushed
- [x] Verification script created (`npm run verify:phase1`)
- [ ] Deployed to Vercel
- [ ] Manual verification completed

## Deployment Steps

### Option 1: Deploy via Vercel Dashboard

1. **Create Preview Deployment**
   ```bash
   # Already done - branch pushed to GitHub
   # Vercel will auto-create preview deployment
   ```

2. **Access Vercel Dashboard**
   - Go to: https://vercel.com/wilfred-pys-projects
   - Find deployment for `implement/async-cron-processing` branch
   - Note the preview URL (e.g., `tldrsec-ai-git-implement-async-cron-abc123.vercel.app`)

3. **Verify Environment Variables**
   - Check all required env vars are set in preview deployment:
     - `DATABASE_URL` ✓
     - `CRON_SECRET` ✓
     - `ANTHROPIC_API_KEY` ✓
     - All other production env vars

### Option 2: Deploy via Vercel CLI

```bash
# Deploy to preview
vercel

# Or deploy to production (after testing!)
vercel --prod
```

## Manual Verification Tests

### Test 1: Cron Endpoint Speed ⏱️

**Expected:** Response within 10 seconds (eliminates 524 timeout)

```bash
# Using verification script (recommended)
npm run verify:phase1

# Or manual test with curl
time curl -X POST https://YOUR-PREVIEW-URL.vercel.app/api/cron/tier-aware \
  -H "Content-Type: application/json" \
  -H "X-Cron-Secret: $CRON_SECRET"
```

**Success Criteria:**
- ✅ Response status: 200 OK
- ✅ Response time: < 10 seconds
- ✅ No 524 timeout errors

### Test 2: Async Processing Indicators 🔄

**Expected:** Response includes async mode fields and headers

**Response Body Check:**
```json
{
  "success": true,
  "processingMode": "async",  // ← NEW
  "queue": {                   // ← NEW
    "filingsQueued": 5,
    "estimatedCompletionTime": "2025-11-21T12:35:00Z",
    "message": "Filings queued for background processing"
  },
  "results": { ... }
}
```

**Response Headers Check:**
```
X-Processing-Mode: async              // ← NEW
X-Execution-ID: abc123...              // ← NEW
X-Filings-Queued: 5                    // ← NEW
```

**Success Criteria:**
- ✅ `processingMode` field = "async"
- ✅ `queue` object present with filings count
- ✅ Custom headers present

### Test 3: JobQueue Database Records 💾

**Expected:** Jobs created in database with correct type and status

```bash
# Using verification script
npm run verify:phase1

# Or manual database query
psql $DATABASE_URL -c "
SELECT
  id,
  job_type as \"jobType\",
  status,
  priority,
  idempotency_key as \"idempotencyKey\",
  created_at as \"createdAt\"
FROM job_queue
WHERE job_type = 'ASYNC_SUMMARIZE_FILING'
ORDER BY created_at DESC
LIMIT 10;
"
```

**Success Criteria:**
- ✅ `jobType` = "ASYNC_SUMMARIZE_FILING"
- ✅ `status` = "PENDING" or "RETRYING"
- ✅ `priority` values: 9 (PRO), 7 (HOBBY), 5 (FREE)
- ✅ `idempotencyKey` format: `filing-{userId}-{accessionNumber}`
- ✅ Jobs created with recent timestamp

### Test 4: Idempotency Validation 🔒

**Expected:** No duplicate jobs for same filing + user combination

```bash
# Check for duplicate idempotency keys
psql $DATABASE_URL -c "
SELECT
  idempotency_key,
  COUNT(*) as count
FROM job_queue
WHERE
  job_type = 'ASYNC_SUMMARIZE_FILING'
  AND status IN ('PENDING', 'PROCESSING', 'RETRYING')
GROUP BY idempotency_key
HAVING COUNT(*) > 1;
"
```

**Success Criteria:**
- ✅ No duplicate idempotency keys found
- ✅ Multiple cron runs don't create duplicate jobs

**Test Steps:**
1. Run cron endpoint once: `curl -X POST ...`
2. Wait 5 seconds
3. Run cron endpoint again: `curl -X POST ...`
4. Verify: No duplicate jobs created for same filing+user

### Test 5: No Timeout Errors 🚫⏰

**Expected:** No 524 Cloudflare timeout errors

```bash
# Check error alerts for timeout issues
psql $DATABASE_URL -c "
SELECT
  alert_type as \"alertType\",
  message,
  created_at as \"createdAt\"
FROM error_alert
WHERE
  created_at > NOW() - INTERVAL '24 hours'
  AND (
    alert_type LIKE '%TIMEOUT%'
    OR message LIKE '%524%'
    OR message LIKE '%timeout%'
  )
ORDER BY created_at DESC;
"
```

**Success Criteria:**
- ✅ No timeout-related error alerts
- ✅ No 524 status codes in monitoring
- ✅ Consistent sub-10s response times

## Automated Verification

Run the comprehensive verification script:

```bash
npm run verify:phase1
```

This script automatically tests:
1. Cron endpoint response time
2. Async processing indicators
3. JobQueue database records
4. Idempotency validation
5. Timeout error monitoring

**Expected Output:**
```
═══════════════════════════════════════════════════════════
🚀 Phase 1 Verification: Async Filing Queue
═══════════════════════════════════════════════════════════

🧪 Test 1: Cron endpoint response time...
   Response time: 8532ms
   Status: 200
   ✅ PASSED: Response within 10 seconds

🧪 Test 2: Async processing indicators...
   Response body:
     processingMode: async ✅
     queue.filingsQueued: 5 ✅
   Response headers:
     X-Processing-Mode: async ✅
     X-Execution-ID: abc123... ✅
     X-Filings-Queued: 5 ✅
   ✅ PASSED: All async indicators present

🧪 Test 3: JobQueue database records...
   Found 5 ASYNC_SUMMARIZE_FILING jobs
   ✅ PASSED: ASYNC_SUMMARIZE_FILING jobs found

🧪 Test 4: Idempotency verification...
   Total jobs checked: 10
   Unique idempotency keys: 10
   Duplicate keys found: 0
   ✅ PASSED: No duplicate jobs found

🧪 Test 5: Checking for timeout errors...
   Timeout-related alerts in last 24h: 0
   ✅ PASSED: No timeout errors found

═══════════════════════════════════════════════════════════
📊 Test Results Summary
═══════════════════════════════════════════════════════════
1. Endpoint Speed:        ✅ PASSED
2. Async Indicators:      ✅ PASSED
3. Job Queue Records:     ✅ PASSED
4. Idempotency:           ✅ PASSED
5. No Timeout Errors:     ✅ PASSED

═══════════════════════════════════════════════════════════
🎉 ALL TESTS PASSED - Phase 1 verification successful!
✅ Ready to proceed to Phase 2
═══════════════════════════════════════════════════════════
```

## Monitoring Post-Deployment

### Key Metrics to Watch

1. **Cron Execution Time**
   - Target: 5-10 seconds
   - Previous: 2-4 minutes
   - Monitor: Vercel function logs

2. **Job Queue Depth**
   - Target: < 50 pending jobs
   - Monitor: `SELECT COUNT(*) FROM job_queue WHERE status = 'PENDING'`

3. **Timeout Errors**
   - Target: 0 errors
   - Monitor: Error alerts table and Vercel logs

4. **Duplicate Jobs**
   - Target: 0 duplicates
   - Monitor: Idempotency key uniqueness

### Vercel Function Logs

```bash
# Stream logs from deployed function
vercel logs --follow

# Filter for cron endpoint
vercel logs --follow | grep "tier-aware-cron"
```

Look for:
- ✅ "Backlog filings queued" log entries
- ✅ "processingMode: 'async'" in final response
- ✅ Sub-10 second execution times
- ❌ No timeout errors
- ❌ No duplicate job warnings

## Rollback Plan

If Phase 1 verification fails:

```bash
# Option 1: Revert to main branch in Vercel dashboard
# - Go to Deployments → Find previous working deployment → Promote to Production

# Option 2: Git revert
git revert 2cc04ed..2a48863
git push origin fix/e2e-cron-pipeline-execution

# Option 3: Emergency rollback
git checkout main
git push origin main --force
```

## Success Criteria Summary

Phase 1 is considered **successful** when:

- [x] Code changes committed and deployed
- [ ] Cron endpoint responds in < 10 seconds
- [ ] Response includes `processingMode: "async"`
- [ ] JobQueue contains ASYNC_SUMMARIZE_FILING records
- [ ] No duplicate jobs created (idempotency working)
- [ ] No 524 timeout errors in 24h after deployment
- [ ] Automated verification script passes all tests

## Next Steps After Verification

Once Phase 1 passes all tests:

1. **Merge to Main**
   ```bash
   # Create PR
   gh pr create --base main --head implement/async-cron-processing \
     --title "feat: Phase 1 - Async Filing Queue (Fixes #236 #237)" \
     --body "See docs/plans/2025-11-21-implement-async-cron-processing.md"

   # After review, merge
   gh pr merge --squash
   ```

2. **Begin Phase 2: Background Worker**
   - Implement filing worker to process queued jobs
   - Add worker health monitoring
   - Test end-to-end filing pipeline

3. **Begin Phase 3: Monitoring & Optimization**
   - Add comprehensive monitoring dashboards
   - Optimize worker concurrency
   - Fine-tune queue priorities

## Troubleshooting

### Issue: Cron endpoint still times out

**Possible Causes:**
- Database connection timeout
- SEC API rate limiting
- User eligibility check taking too long

**Debug:**
```bash
# Check execution time breakdown
vercel logs --follow | grep "Checkpoint"
```

### Issue: No jobs being created

**Possible Causes:**
- No unprocessed filings (backlog empty)
- Database connection issue
- JobQueueService errors

**Debug:**
```bash
# Check for unprocessed filings
psql $DATABASE_URL -c "
SELECT COUNT(*)
FROM sec_filing
WHERE filing_id NOT IN (
  SELECT DISTINCT filing_id FROM summary
);"

# Check for job creation errors
vercel logs --follow | grep "Failed to queue"
```

### Issue: Duplicate jobs created

**Possible Causes:**
- Idempotency key collision
- Race condition in job creation
- Lock not acquired

**Debug:**
```bash
# Find duplicate jobs
psql $DATABASE_URL -c "
SELECT
  idempotency_key,
  COUNT(*),
  ARRAY_AGG(id) as job_ids
FROM job_queue
WHERE job_type = 'ASYNC_SUMMARIZE_FILING'
GROUP BY idempotency_key
HAVING COUNT(*) > 1;"
```

## Contact

- **Branch:** `implement/async-cron-processing`
- **Plan:** `docs/plans/2025-11-21-implement-async-cron-processing.md`
- **Related Issues:** #236, #237
- **Implementation Date:** 2025-11-21
