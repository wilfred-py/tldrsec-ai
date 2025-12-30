# Incident Report: Cloudflare Cron Schedule Failure

**Date**: 2025-12-30
**Severity**: P1 (Pipeline Outage)
**Duration**: 4 hours 5 minutes
**Status**: Resolved

---

## Executive Summary

The SEC filing processing pipeline experienced a complete outage from 15:10 AEST to 19:15 AEST on December 30, 2025. The root cause was the Cloudflare Worker's `*/5 * * * *` cron schedule silently stopping while the `*/10 * * * *` schedule continued to function. The issue was resolved by redeploying the Cloudflare Worker.

---

## Timeline (All times AEST)

| Time | Event |
|------|-------|
| 12:11:06 | Vercel deployment `dpl_7EfSpT5vCrACziwWAx1oJWaLD86w` completed |
| 15:07:27 | Vercel deployment `dpl_EknfGyKiRh7XkgaypZs7YU68Hi92` completed |
| **15:10:25** | **Last successful pipeline execution** |
| 15:33:00 | Vercel deployment `dpl_DtdF2LuSyszTcKsNhgSUJaZJEo3x` completed |
| ~18:45 | Event drop noticed in Cloudflare dashboard |
| 18:41:57 | Investigation began |
| 19:09-19:12 | Live log analysis confirmed `*/5` cron not firing |
| **19:15:14** | **Cloudflare Worker redeployed, pipeline restored** |
| 19:20 | Second `*/5` execution confirmed sustained recovery |

---

## Impact

### Direct Impact
- **No SEC filings processed** for 4 hours 5 minutes
- **Users did not receive email notifications** for filings published during this window
- **Slack interval summaries continued** (unrelated `*/10` cron was working)

### Scope
- All users affected equally (single-tenant pipeline)
- No data loss (filings discovered and processed once pipeline resumed)
- No user-facing errors (silent failure)

---

## Root Cause Analysis

### What Happened

The Cloudflare Worker has two scheduled cron triggers:
- `*/5 * * * *` - Main pipeline processing (FAILED)
- `*/10 * * * *` - Slack interval summaries (WORKING)

After the Vercel deployment at 15:07 AEST, the `*/5 * * * *` cron schedule stopped triggering entirely. The Cloudflare Worker script itself was healthy - when the `*/10` cron triggered, it executed successfully. But the `*/5` cron simply never fired.

### Evidence

1. **Database JobQueue**: Last `ASYNC_DISCOVER_FILINGS` job created at 04:10:24 UTC (15:10:24 AEST)
2. **CronJobExecution table**: Last execution recorded at 04:10:24 UTC
3. **Live logs (19:09-19:12)**:
   - `*/10 * * * *` fired at 19:10:13 with successful interval summary
   - No `*/5 * * * *` execution observed
   - No heartbeat messages since 15:10 AEST
4. **Post-redeploy**: `*/5 * * * *` immediately started firing again

### Why It Happened

**Root Cause**: Cloudflare cron schedule registration became corrupted or lost.

**Contributing Factors**:
1. Multiple Vercel deployments in a 30-minute window (15:07 and 15:33)
2. Possible Cloudflare platform transient issue
3. No monitoring to detect cron schedule failure

### What Did NOT Cause This

- **Circuit breaker**: Worker was never called, so circuit breaker never engaged
- **HMAC authentication**: No requests were made to fail authentication
- **Vercel endpoint issues**: Endpoint responded correctly when called manually
- **Rate limiting**: No rate limit logs appeared

---

## Resolution

### Immediate Fix

```bash
cd cloudflare-cron && npx wrangler deploy
```

**Output**:
```
Deployed cloudflare-cron triggers (2.12 sec)
  https://cloudflare-cron.wilfred-chen-python.workers.dev
  schedule: */5 * * * *
  schedule: */10 * * * *
  schedule: 0 22 * * *
Current Version ID: 166080d5-6a5c-432f-aa66-1d6475fd5dc7
```

### Verification

First `*/5` cron executed at 19:15:14 AEST:
- Step 0: Lock cleanup - 6.5s
- Step 1: Tier-aware endpoint - 3.5s (202 Accepted)
- Step 1.5: Discovery jobs - 36s (1 job processed)
- Step 2: Fetch jobs - 39s (5 jobs processed)
- Step 3: Summarize jobs - 14s (1 job processed)
- **Total pipeline: 110s**

---

## Action Items

### Immediate (P0)

| Action | Owner | Status |
|--------|-------|--------|
| Redeploy Cloudflare Worker | Wilf | DONE |
| Verify pipeline resumed | Wilf | DONE |
| Document incident | Wilf | DONE |

### Short-term (P1) - Preventive Measures

| Action | Owner | Status |
|--------|-------|--------|
| Add `/health` endpoint to Cloudflare Worker with cron status | TBD | TODO |
| Add circuit breaker state visibility to health endpoint | TBD | TODO |
| Create external cron monitoring (ping if no heartbeat in 10 min) | TBD | TODO |

### Medium-term (P2) - Detection Improvements

| Action | Owner | Status |
|--------|-------|--------|
| Add Slack deployment notifications when Vercel deploys | TBD | TODO |
| Create observable events dashboard for Cloudflare Analytics | TBD | TODO |
| Define alert thresholds for event drop detection | TBD | TODO |
| Evaluate HMAC timestamp tolerance adjustment | TBD | TODO |

---

## Lessons Learned

### What Went Well
1. Investigation process was systematic and thorough
2. Root cause was identified within 30 minutes of active investigation
3. Fix was simple and immediately effective
4. Documentation was created throughout the process

### What Could Be Improved
1. **No alerting for cron failures** - 4 hours before anyone noticed
2. **Silent failure mode** - No error logs when cron doesn't fire
3. **Single point of failure** - No redundant cron triggering mechanism
4. **No heartbeat monitoring** - Could have detected missing heartbeats earlier

### Process Improvements
1. Add external health check that alerts if no pipeline activity in 15 minutes
2. Add Slack notification for Vercel deployments to correlate with issues
3. Consider redundant cron triggering (e.g., AWS EventBridge as backup)

---

## Related Documents

- [Investigation Plan](../plans/2025-12-30-investigate-cloudflare-event-drop.md)
- [E2E Pipeline Research](../../thoughts/shared/research/2025-12-30-e2e-pipeline-cloudflare-event-drop.md)
- [Cloudflare Worker Source](../../cloudflare-cron/index.js)

---

## Appendix: Key Metrics

### Before Incident
- Pipeline execution frequency: Every 5 minutes
- Average execution time: ~110 seconds
- Jobs processed per cycle: 5-10

### During Incident
- Pipeline executions: 0
- Jobs created: 0
- User notifications sent: 0

### After Resolution
- First execution: 19:15:14 AEST
- Jobs processed: 7 (1 discovery, 5 fetch, 1 summarize)
- Pipeline fully recovered

---

*Incident Report Created: 2025-12-30 20:00 AEST*
*Last Updated: 2025-12-30 20:00 AEST*
