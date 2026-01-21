---
date: 2025-12-29T11:08:45+11:00
researcher: Claude
git_commit: 15f3c12b6272de924c94a4c066c5782e4b591ece
branch: feature/json-parsing-phase5-monitoring
repository: tldrsec-ai
topic: "Cloudflare Cron Job Execution Investigation"
tags: [research, codebase, cloudflare, cron, pipeline, observability]
status: complete
last_updated: 2025-12-29
last_updated_by: Claude
---

# Research: Cloudflare Cron Job Execution Investigation

**Date**: 2025-12-29T11:08:45+11:00 (AEDT)
**Researcher**: Claude
**Git Commit**: 15f3c12b6272de924c94a4c066c5782e4b591ece
**Branch**: feature/json-parsing-phase5-monitoring
**Repository**: tldrsec-ai

## Research Question

Investigation into why the observable logs have dramatically decreased after December 27, 2025. User suspects the Cron job is no longer running the E2E pipeline and checking for new SEC filings since December 20, 2025 around 5pm Australian Eastern Standard Time.

## Summary

The investigation reveals a **critical pipeline failure** starting on **December 27, 2025 at 06:35:17 UTC**. The Cloudflare Worker cron triggers appear to be configured correctly, but the pipeline has stopped creating new jobs in the database.

### Key Findings

1. **Last Job Created**: December 27, 2025 at 06:35:17 UTC
2. **Jobs on Dec 27**: 80 (all before 06:35 UTC)
3. **Jobs on Dec 28**: 0
4. **Jobs on Dec 29**: 0

The last deployment on December 27 occurred at **06:37:01 UTC**, which is approximately 2 minutes after the last job was created. This timing correlation is significant.

## Detailed Findings

### Database Analysis

#### Job Queue Status
- **Total Jobs in Queue**: 1,138
- **Last Job Created**: 2025-12-27T06:35:17.361Z
- **Last Job Type**: `ASYNC_DISCOVER_FILINGS`
- **Last Job Status**: `COMPLETED`

#### Jobs by Date (Last 7 Days)
| Date | Job Count |
|------|-----------|
| Dec 27, 2025 | 80 |
| Dec 28, 2025 | 0 |
| Dec 29, 2025 | 0 |

#### Summaries by Date (Last 7 Days)
- **Dec 26, 2025**: 5 summaries created (NOT sent)
- **Dec 27, 2025**: 0 summaries
- **Dec 28, 2025**: 0 summaries
- **Dec 29, 2025**: 0 summaries

### Cloudflare Worker Deployment History

Recent deployments from the deployment list:
- **2025-12-27T06:37:01.442588Z** - Version `75e9946f-da06-4b33-9ea9-ac078f86e506` (CRITICAL - this deployment occurred 2 minutes after last job)
- **2025-12-28T04:38:18.165647Z** - Version `87f357e2-eb8b-4b1f-a0e5-d3a3157495fb`
- **2025-12-28T05:14:16.470534Z** - Version `497cc28d-4608-4719-bbbd-fcb996780896`
- **2025-12-28T22:15:12.252764Z** - Version `14b87f7a-14ef-4b67-b410-4f0e8df1ba1a` (current)

### Cloudflare Worker Configuration

From `cloudflare-cron/wrangler.toml`:
- **Worker Name**: cloudflare-cron
- **Main Entry**: index.js
- **Compatibility Date**: 2024-10-01
- **Worker Version**: 2.4.0-stable

**Cron Schedules Configured**:
- `*/5 * * * *` - Pipeline processing (every 5 minutes)
- `*/10 * * * *` - Interval Slack summary (every 10 minutes)
- `0 22 * * *` - Daily Slack report (9 AM AEST)

**Secrets Configured**:
- ANTHROPIC_API_KEY
- CRON_SECRET
- OPEN_ROUTER_API_KEY
- RESEND_API_KEY
- TLDRSEC_AI_SUMMARIZER
- VERCEL_AUTOMATION_BYPASS_SECRET

### Observability Status

- **Observability Logs**: Enabled in wrangler.toml (`[observability.logs] enabled = true`)
- **HTTP Endpoint**: Responding correctly at `https://cloudflare-cron.wilfred-chen-python.workers.dev`
- **Cron Triggers**: Deployed and configured via `wrangler triggers deploy`

### Live Log Analysis

During the investigation:
1. `wrangler tail --format=json` was run for over 2 minutes
2. HTTP requests to the Worker endpoint were captured in logs
3. **No cron trigger executions were observed in the logs during this period**

This is anomalous because with the `*/5 * * * *` schedule, at least one cron execution should have been observed during a 2-minute observation window (if the minute aligned) or soon after.

## Code References

- [cloudflare-cron/wrangler.toml](cloudflare-cron/wrangler.toml) - Worker configuration and cron schedules
- [cloudflare-cron/index.js:15-36](cloudflare-cron/index.js#L15-L36) - Scheduled event handler routing
- [cloudflare-cron/index.js:151-200](cloudflare-cron/index.js#L151-L200) - Pipeline processing handler

## Architecture Documentation

### Current Cron Execution Flow

1. Cloudflare Worker cron trigger fires every 5 minutes (`*/5 * * * *`)
2. `scheduled(event, env, ctx)` handler routes based on cron expression
3. `handlePipelineProcessing()` calls Vercel endpoint at `https://tldrsec.app/api/cron/tier-aware`
4. HMAC signature is generated using `CRON_SECRET` for authentication
5. Vercel endpoint processes the request and creates jobs in the database

### Environment Variables Flow

- `PUBLIC_URL` = "https://tldrsec.app" (configured in wrangler.toml)
- `CRON_SECRET` = [secret] (used for HMAC authentication)
- `USE_ASYNC_PROCESSING` = "false"
- `DEBUG_MODE` = "true"
- `WORKER_VERSION` = "2.4.0-stable"

## Open Questions

1. **Why did the cron triggers stop executing after the Dec 27 deployment?**
   - The timing correlation (deployment 2 minutes after last job) is suspicious
   - No cron logs observed during live monitoring

2. **Is the Cloudflare cron scheduler actually triggering the worker?**
   - HTTP endpoint works, but cron triggers may not be
   - Need to verify Cloudflare dashboard cron settings

3. **Was there a configuration change in the Dec 27 deployment that broke cron triggers?**
   - Need to compare worker versions before and after

4. **Is there a Cloudflare platform issue affecting cron triggers?**
   - External factors should be considered

## Investigation Recommendations

1. **Verify cron trigger configuration in Cloudflare Dashboard**
   - Log into Cloudflare Dashboard → Workers → cloudflare-cron → Triggers
   - Verify cron schedules are listed and enabled

2. **Check Cloudflare Analytics**
   - Look at worker invocation metrics to see if scheduled events are being recorded

3. **Manual trigger test**
   - Use `wrangler dev` locally to simulate cron execution
   - Or temporarily add HTTP endpoint to trigger scheduled handler for testing

4. **Review Dec 27 deployment changes**
   - Compare the deployment that occurred at 06:37:01 UTC with previous version

5. **Re-deploy with fresh triggers**
   - Run `wrangler deploy` to redeploy the worker
   - Run `wrangler triggers deploy` to refresh triggers
