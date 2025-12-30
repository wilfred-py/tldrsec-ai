# Cloudflare Worker Monitoring Runbook

This document provides monitoring queries, alerts, and troubleshooting procedures for the TLDRSEC Cloudflare Worker cron pipeline.

## Overview

The Cloudflare Worker handles scheduled SEC filing monitoring:
- `*/5 * * * *` - Pipeline processing (every 5 minutes)
- `*/10 * * * *` - Slack interval summary
- `0 22 * * *` - Daily report (9 AM AEST)

## Health Endpoints

### Worker Health Check

```bash
curl https://cloudflare-cron.wilfred-chen-python.workers.dev/health
```

Expected healthy response:
```json
{
  "worker": "healthy",
  "version": "2.6.0",
  "status": "OK",
  "lastHeartbeat": "2025-12-30T09:15:00.000Z",
  "heartbeatAgeMinutes": 2,
  "stale": false,
  "circuitBreaker": {
    "source": "kv",
    "state": "CLOSED",
    "failureCount": 0
  }
}
```

### Status Indicators

| Status | HTTP Code | Meaning |
|--------|-----------|---------|
| `OK` | 200 | Healthy - heartbeat within 15 minutes |
| `STALE` | 503 | No heartbeat in >15 minutes - investigate! |
| `NO_HEARTBEAT` | 503 | Worker has never recorded a heartbeat |
| `CIRCUIT_BREAKER_OPEN` | 503 | Pipeline blocked due to repeated failures |
| `RECOVERING` | 200 | Circuit breaker testing recovery |

### Vercel Deployment Health

```bash
curl https://tldrsec.app/api/health/deployment
```

## Cloudflare Analytics Queries

### Observable Events per 5-Minute Window

Use in Cloudflare Analytics SQL:

```sql
SELECT
  toStartOfFiveMinute(timestamp) as bucket,
  count(*) as event_count,
  countIf(status = 'success') as success_count,
  countIf(status = 'circuit_breaker_blocked') as blocked_count,
  countIf(status = 'rate_limited') as rate_limited_count
FROM worker_events
WHERE timestamp >= now() - interval '24 hours'
GROUP BY bucket
ORDER BY bucket DESC
```

### Expected Events per Cycle

| Event Type | Source | Count per 5-min Cycle |
|------------|--------|----------------------|
| Scheduled trigger | Cloudflare | 1 |
| Heartbeat log | Worker | 1 |
| Step completion logs | Worker | 4-5 |
| HTTP request logs | Worker | 4-5 |
| Vercel function logs | Vercel | 4-5 |

**Total expected**: 14-17 observable events per 5-minute cycle

### Event Gap Detection Query

```sql
SELECT
  toStartOfFiveMinute(timestamp) as bucket,
  count(*) as events
FROM worker_events
WHERE timestamp >= now() - interval '1 hour'
GROUP BY bucket
HAVING events < 10  -- Alert threshold
ORDER BY bucket DESC
```

## Alerting Thresholds

### Recommended Alert Rules

| Condition | Threshold | Action |
|-----------|-----------|--------|
| No heartbeat | > 15 minutes | Page on-call |
| Events per 5-min window | < 10 | Investigate |
| Circuit breaker OPEN | Any | Investigate |
| HTTP 5xx responses | > 3 in 15 min | Investigate |
| Deployment health | 503 | Check Vercel |

### External Monitoring Setup

Configure an external uptime monitor (e.g., Uptime Robot, Pingdom) to:

1. **Health Check Ping**
   - URL: `https://cloudflare-cron.wilfred-chen-python.workers.dev/health`
   - Frequency: Every 5 minutes
   - Alert if: HTTP 503 or timeout
   - Alert if: `"stale": true` in response body

2. **Deployment Health Ping**
   - URL: `https://tldrsec.app/api/health/deployment`
   - Frequency: Every 5 minutes
   - Alert if: HTTP 503 or `"ready": false`

## Troubleshooting

### Symptom: Health shows "STALE" or "NO_HEARTBEAT"

**Cause**: The `*/5` cron is not firing.

**Resolution**:
```bash
cd cloudflare-cron && npx wrangler deploy
```

**Verification**:
```bash
curl https://cloudflare-cron.wilfred-chen-python.workers.dev/health
# Wait 5 minutes
cd cloudflare-cron && npx wrangler tail --format=pretty
# Look for [HEARTBEAT] and pipeline step logs
```

### Symptom: Circuit breaker OPEN

**Cause**: 3+ consecutive failures calling Vercel endpoints.

**Resolution**:
1. Check Vercel function logs for errors
2. Check database connectivity
3. Wait 3 minutes for automatic recovery (HALF_OPEN state)
4. If persists, manually reset by redeploying worker

### Symptom: Event drop in dashboard

**Investigation Steps**:
1. Check health endpoint status
2. Review Cloudflare Worker logs:
   ```bash
   cd cloudflare-cron && npx wrangler tail --format=pretty --since 2h
   ```
3. Check database for job queue gaps:
   ```sql
   SELECT
     date_trunc('hour', "createdAt") as hour,
     count(*) as jobs
   FROM pipeline."JobQueue"
   WHERE "createdAt" >= now() - interval '24 hours'
   GROUP BY hour
   ORDER BY hour DESC
   ```
4. Review Vercel deployment history:
   ```bash
   vercel ls --limit 10
   ```

### Symptom: Timeouts on pipeline steps

**Investigation**:
1. Check which step is timing out in logs
2. Review Vercel function duration limits (10s for hobby, 60s for pro)
3. Check database query performance
4. Consider splitting long-running jobs

## Deployment Procedures

### Deploying Worker Updates

```bash
# 1. Make changes to cloudflare-cron/index.js

# 2. Test locally (limited - cron doesn't fire locally)
cd cloudflare-cron && npx wrangler dev

# 3. Deploy to production
cd cloudflare-cron && npx wrangler deploy

# 4. Verify deployment
cd cloudflare-cron && npx wrangler tail --format=pretty

# 5. Monitor health
curl https://cloudflare-cron.wilfred-chen-python.workers.dev/health
```

### Emergency Rollback

If a deployment causes issues:

```bash
# List recent deployments
cd cloudflare-cron && npx wrangler deployments list

# Rollback to previous version
cd cloudflare-cron && npx wrangler rollback
```

## Incident Response

### Incident: Cron Schedule Failure (Reference: 2025-12-30)

**Timeline**:
- 15:10 AEST: Last successful pipeline execution
- 19:15 AEST: Worker redeployed, pipeline restored
- Downtime: ~4 hours

**Root Cause**: Cloudflare `*/5` cron schedule stopped firing while `*/10` continued.

**Resolution**: Redeploy Cloudflare Worker with `npx wrangler deploy`.

**Prevention**:
1. External health monitoring with alerting
2. Slack deployment notifications (correlate with issues)
3. Circuit breaker state visibility in health endpoint

## Related Documents

- [Incident Report: 2025-12-30](../incidents/2025-12-30-cloudflare-cron-schedule-failure.md)
- [Investigation Plan](../plans/2025-12-30-investigate-cloudflare-event-drop.md)
- [Cloudflare Worker Source](../../cloudflare-cron/index.js)
