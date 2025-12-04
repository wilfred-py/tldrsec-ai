---
date: 2025-12-03T08:45:00+11:00
researcher: Claude
git_commit: d8038515866a168a8ab98ad1fd55874934dd6ff3
branch: main
repository: tldrsec-ai
topic: "Verify if Dec 3 morning summaries were from production pipeline or test"
tags: [research, codebase, cron, cloudflare, pipeline-verification]
status: complete
last_updated: 2025-12-03
last_updated_by: Claude
---

# Research: Pipeline Source Verification for Dec 3, 2025 Morning Summaries

**Date**: 2025-12-03T08:45:00+11:00
**Researcher**: Claude
**Git Commit**: d8038515866a168a8ab98ad1fd55874934dd6ff3
**Branch**: main
**Repository**: tldrsec-ai

## Research Question

Verify if the summaries generated between 4:00 AM - 5:30 AM AEST on December 3, 2025 were produced by the production e2e pipeline (Cloudflare Worker cron) or from a manual test run.

## Summary

**CONCLUSION: The summaries were generated from the PRODUCTION E2E PIPELINE**, triggered by the Cloudflare Worker cron job, NOT from a manual test.

Key evidence:
1. CronJobExecution table shows regular 10-minute cron runs with `environment: "production"`
2. Job payloads contain cron-prefixed execution IDs (`cron-{timestamp}-{hash}`)
3. The production AI model (`x-ai/grok-4.1-fast`) was used
4. All summaries have `processingStatus: "COMPLETED"` and `sentToUser: true`

## Time Conversion

| Local Time (AEST/AEDT) | UTC Time |
|------------------------|----------|
| Dec 3, 2025 4:00 AM    | Dec 2, 2025 17:00 |
| Dec 3, 2025 5:30 AM    | Dec 2, 2025 18:30 |

*Note: Australia is in Daylight Saving Time (AEDT = UTC+11) in December.*

## Detailed Findings

### Summaries Created in Time Range (4 total)

| Created At (UTC) | Ticker | Form Type | Model | Status |
|------------------|--------|-----------|-------|--------|
| 2025-12-02T18:28:41Z | NVDA | 144 | x-ai/grok-4.1-fast | COMPLETED |
| 2025-12-02T18:28:00Z | KO | 4 | x-ai/grok-4.1-fast | COMPLETED |
| 2025-12-02T18:27:06Z | COIN | 144 | x-ai/grok-4.1-fast | COMPLETED |
| (earlier) | VRT | 4 | x-ai/grok-4.1-fast | COMPLETED |

All summaries:
- `sentToUser: true`
- `isCacheHit: false`
- `extractionSuccess: true`
- Have valid token counts and cost tracking

### CronJobExecution Entries (9 in time range)

Regular 10-minute interval cron executions:

| Started At (UTC) | Execution ID | Status | Duration | Environment |
|------------------|--------------|--------|----------|-------------|
| 2025-12-02T17:00:22Z | c030dba3-fae1-4d5d-8b4e-9c3f9f3b319d | SUCCESS | 2864ms | production |
| 2025-12-02T17:10:22Z | b4a74ad2-bca6-4625-9517-90b725c3562a | SUCCESS | 2377ms | production |
| 2025-12-02T17:20:22Z | 0c34e3bf-de67-426f-bc90-7210d29dd8df | SUCCESS | 2853ms | production |
| 2025-12-02T17:30:22Z | 59098b6e-fff3-4a1d-8da2-c811889f8aa5 | SUCCESS | 2873ms | production |
| 2025-12-02T17:40:22Z | e2a04bf9-ea92-49d5-bf67-1cdf58fbf113 | SUCCESS | 2923ms | production |
| 2025-12-02T17:50:22Z | e11f9ade-6d35-4d2d-8afb-548a8f304150 | SUCCESS | 2927ms | production |
| 2025-12-02T18:00:22Z | d9a9e16a-317f-4e75-b0f9-d84746e1fccc | SUCCESS | 2834ms | production |
| 2025-12-02T18:10:22Z | 6c7c6aac-bd5c-4bc6-a58d-e05a8be9cc53 | SUCCESS | 2804ms | production |
| 2025-12-02T18:20:22Z | cfdc271b-1f94-4ed4-a8f6-0b13386579d4 | SUCCESS | 2832ms | production |

All cron executions have:
- `jobName: "tier-aware-sec-monitor"`
- `environment: "production"`
- `errorMessage: "3-phase pipeline: discovery job queued"` (this is informational, not an error)

### JobQueue Evidence

The JobQueue shows entries with execution IDs following the production cron pattern:

```
executionId: "cron-1764694818476-588ec0dd31980c03"  // 17:00 UTC
executionId: "cron-1764695418182-ee5cc2462db9444d"  // 17:10 UTC
executionId: "cron-1764696018179-6a1852c3303b6840"  // 17:20 UTC
```

The `cron-{timestamp}-{hash}` pattern confirms these jobs were triggered by the Cloudflare Worker cron scheduler, not manual test invocation.

Job types observed:
- `ASYNC_DISCOVER_FILINGS` - Discovery phase
- `ASYNC_FETCH_FILING` - Content fetching phase

### Email Delivery Status

- `SummaryEmailDelivery` table: 0 entries in time range
- However, summaries have `sentToUser: true`

This indicates emails were likely sent but not recorded in the SummaryEmailDelivery table during this run (possible gap in email delivery tracking).

### Cloudflare Worker Logs

**Note**: Historical Cloudflare Worker logs cannot be queried via `wrangler tail` (real-time only). The `--since` and `--until` flags are not supported.

To access historical logs, Cloudflare's Logpush or Workers Analytics would be needed (not currently configured).

However, the CronJobExecution table provides sufficient evidence of Cloudflare Worker activity since:
1. The cron endpoint (`/api/cron/tier-aware`) logs to this table
2. The regular 10-minute intervals match the configured cron schedule (`*/10 * * * *`)

## Architecture Context

The pipeline flow:
1. **Cloudflare Worker** triggers every 10 minutes (`wrangler.toml`: `*/10 * * * *`)
2. Calls `https://tldrsec.app/api/cron/tier-aware`
3. Creates `CronJobExecution` entry with `environment: "production"`
4. Queues `ASYNC_DISCOVER_FILINGS` job
5. Discovery finds new filings → queues `ASYNC_FETCH_FILING` jobs
6. Fetch jobs process content → create `Summary` entries
7. Summarization triggers email delivery

## Distinguishing Production from Test

| Indicator | Production Pipeline | Manual Test |
|-----------|---------------------|-------------|
| CronJobExecution.environment | `"production"` | Would show different env |
| Job executionId pattern | `cron-{timestamp}-{hash}` | Different pattern (e.g., `test-` prefix) |
| CronJobExecution timing | Regular 10-min intervals | Irregular timing |
| Model used | `x-ai/grok-4.1-fast` | Same (production model) |

## Code References

- Cloudflare Worker cron config: [cloudflare-cron/wrangler.toml](cloudflare-cron/wrangler.toml)
- Tier-aware cron endpoint: [app/api/cron/tier-aware/route.ts](app/api/cron/tier-aware/route.ts)
- CronJobExecution model: [prisma/schema.prisma:366](prisma/schema.prisma#L366)

## Open Questions

1. **Email delivery gap**: Why are there 0 `SummaryEmailDelivery` entries despite `sentToUser: true` on summaries?
2. **Cloudflare logging**: Consider setting up Cloudflare Logpush for historical log access

## Related Research

- None found in thoughts/shared/research/ for pipeline verification
