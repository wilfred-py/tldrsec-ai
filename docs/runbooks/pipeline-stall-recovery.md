# Pipeline Stall Recovery Runbook

This runbook provides procedures for monitoring, diagnosing, and recovering from pipeline stalls in the SEC filing processing system.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Health Check Procedures](#health-check-procedures)
3. [Alert Response Procedures](#alert-response-procedures)
4. [Manual Recovery Procedures](#manual-recovery-procedures)
5. [Emergency Procedures](#emergency-procedures)
6. [Preventive Maintenance](#preventive-maintenance)

---

## Architecture Overview

The pipeline has a three-layer redundancy system:

```
┌─────────────────────────────────────────────────────────────────────┐
│                      REDUNDANCY ARCHITECTURE                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Layer 1: Primary Cloudflare Worker (Every 10 minutes)              │
│  ├── Triggers: /api/cron/tier-aware                                │
│  ├── Logs execution to CronJobExecution table                      │
│  └── Source: "cloudflare-cron"                                     │
│                                                                     │
│  Layer 2: Auto-Recovery Endpoint (Every 5 minutes via CF Worker)   │
│  ├── Checks: Health status, stale locks, orphaned filings          │
│  ├── Actions: Cleanup, orphan recovery, redeploy trigger           │
│  └── Source: "auto-recover"                                        │
│                                                                     │
│  Layer 3: Vercel Final Backup (Every 30 minutes)                   │
│  ├── Checks: Any execution in last 25 minutes                      │
│  ├── Actions: Emergency alert + pipeline trigger                    │
│  └── Source: "final-backup"                                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Endpoints

| Endpoint | Purpose | Schedule |
|----------|---------|----------|
| `/api/cron/tier-aware` | Main SEC filing processing pipeline | Every 10 min (CF) |
| `/api/cron/auto-recover` | Self-healing recovery system | Every 5 min (CF) |
| `/api/cron/final-backup` | Last-resort emergency backup | Every 30 min (Vercel) |
| `/api/health/pipeline` | Health status and diagnostics | On-demand |

---

## Health Check Procedures

### Quick Health Check

```bash
# Check pipeline health status
curl -s https://tldrsec.app/api/health/pipeline | jq

# Expected healthy response:
# {
#   "status": "HEALTHY",
#   "cronExecution": { "gapsDetected": 0, "minutesSinceLastCron": 5 },
#   "filings": { "orphanedCount": 0 },
#   "issues": []
# }
```

### Detailed Health Analysis

```bash
# Full health check with all metrics
curl -s https://tldrsec.app/api/health/pipeline | jq '{
  status,
  cronExecution,
  filings,
  staleProcessing,
  issues,
  recommendations
}'
```

### Health Status Meanings

| Status | Meaning | Action Required |
|--------|---------|-----------------|
| `HEALTHY` | All systems normal | None |
| `DEGRADED` | Minor issues detected | Monitor, may self-heal |
| `CRITICAL` | Major issues detected | Immediate attention required |

---

## Alert Response Procedures

### Slack Alert: Cron Execution Gap

**Alert Message**: "CRITICAL: Cron execution gap detected (>20 minutes)"

**Response Steps**:

1. **Check Cloudflare Worker Status**:
   ```bash
   cd cloudflare-cron && npx wrangler deployments list
   ```

2. **Check recent logs**:
   ```bash
   cd cloudflare-cron && npx wrangler tail --format=pretty
   ```

3. **If worker is down, redeploy**:
   ```bash
   cd cloudflare-cron && npx wrangler deploy
   ```

4. **Verify recovery**:
   ```bash
   curl -s https://tldrsec.app/api/health/pipeline | jq '.cronExecution'
   ```

### Slack Alert: Orphaned Filings

**Alert Message**: "DEGRADED: X orphaned filings detected"

**Response Steps**:

1. **Check auto-recovery is handling it**:
   ```bash
   curl -s https://tldrsec.app/api/health/pipeline | jq '.filings'
   ```

2. **If count not decreasing after 10 minutes, trigger manual recovery**:
   ```bash
   curl -X GET "https://tldrsec.app/api/cron/auto-recover" \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

3. **Verify jobs created**:
   ```bash
   # Check JobQueue for new jobs via Prisma Studio or database
   ```

### Slack Alert: Emergency Final Backup Triggered

**Alert Message**: "EMERGENCY: Final Backup Triggered - No pipeline executions in 25 minutes"

**This is critical - both primary and watchdog workers have failed.**

**Response Steps**:

1. **Immediately check Cloudflare dashboard** for worker errors

2. **Check Vercel deployment status**:
   ```bash
   vercel ls
   ```

3. **Redeploy Cloudflare Worker**:
   ```bash
   cd cloudflare-cron && npx wrangler deploy
   ```

4. **Verify all systems restored**:
   ```bash
   curl -s https://tldrsec.app/api/health/pipeline | jq
   ```

5. **Post-incident**: Document cause and update this runbook

---

## Manual Recovery Procedures

### Trigger Pipeline Manually

```bash
# Trigger the tier-aware pipeline directly
curl -X GET "https://tldrsec.app/api/cron/tier-aware?source=manual" \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Force Cleanup of Stale Locks

```bash
# Trigger auto-recover which includes cleanup
curl -X GET "https://tldrsec.app/api/cron/auto-recover" \
  -H "Authorization: Bearer $CRON_SECRET"
```

### Process Orphaned Filings Manually

The auto-recover endpoint handles this automatically, but if needed:

1. **Identify orphaned filings** (processed=false, no jobs, >10 minutes old)
2. **Create jobs via API or direct database insert**
3. **Trigger pipeline to process**

### Redeploy Cloudflare Workers

```bash
# Primary cron worker
cd cloudflare-cron && npx wrangler deploy

# Verify deployment
cd cloudflare-cron && npx wrangler deployments list
```

---

## Emergency Procedures

### Complete Pipeline Failure

If all three redundancy layers fail:

1. **Check Vercel status**: https://www.vercel-status.com/
2. **Check Cloudflare status**: https://www.cloudflarestatus.com/
3. **Check database connectivity**:
   ```bash
   curl -s https://tldrsec.app/api/health/database | jq
   ```

4. **If infrastructure is down**:
   - Wait for provider recovery
   - Document outage duration
   - Plan backfill of missed filings

5. **If infrastructure is up but pipeline broken**:
   - Check Vercel function logs
   - Check for code deployment issues
   - Roll back if recent deployment caused issue

### Database Recovery State Issues

If RecoveryState table has incorrect data:

```sql
-- Reset recovery state (use with caution)
UPDATE "RecoveryState"
SET
  "consecutiveDegraded" = 0,
  "consecutiveCleanups" = 0,
  "consecutiveRedeploys" = 0,
  "lastHealthyTime" = NOW()
WHERE id = 'singleton';
```

---

## Preventive Maintenance

### Daily Checks

- [ ] Verify pipeline health endpoint returns HEALTHY
- [ ] Check Slack for any alerts in last 24 hours
- [ ] Verify cron execution count in database

### Weekly Checks

- [ ] Review Cloudflare Worker analytics
- [ ] Check for any error patterns in Vercel logs
- [ ] Verify orphaned filing count is consistently low

### Monthly Checks

- [ ] Review and update this runbook
- [ ] Test manual recovery procedures
- [ ] Review alert thresholds for appropriateness

---

## Key Metrics to Monitor

| Metric | Normal Range | Alert Threshold |
|--------|--------------|-----------------|
| Minutes since last cron | 0-10 | >15 (DEGRADED), >20 (CRITICAL) |
| Orphaned filings | 0-2 | >5 (DEGRADED), >10 (CRITICAL) |
| Stale processing jobs | 0 | >0 (triggers cleanup) |
| Consecutive degraded checks | 0 | >3 (triggers alert) |

---

## Contacts

- **On-call Engineer**: Check PagerDuty/Slack
- **Cloudflare Issues**: Cloudflare support or status page
- **Vercel Issues**: Vercel support or status page
- **Database Issues**: Neon/Supabase support

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2026-01-11 | Initial runbook created | Claude |
