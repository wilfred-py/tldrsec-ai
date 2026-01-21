---
date: 2025-12-26T18:07:39+11:00
researcher: Claude
git_commit: d4cc8c41202fe99d59174c61cec4fd284fb0a0f8
branch: feature/fix-email-summary-discrepancies
repository: tldrsec-ai
topic: "Verification of Dec 24-26 Summary Email Authenticity"
tags: [research, cron, pipeline, verification, summaries, email]
status: complete
last_updated: 2025-12-26
last_updated_by: Claude
---

# Research: Verification of Dec 24-26 Summary Email Authenticity

**Date**: 2025-12-26T18:07:39 AEDT
**Researcher**: Claude
**Git Commit**: d4cc8c41202fe99d59174c61cec4fd284fb0a0f8
**Branch**: feature/fix-email-summary-discrepancies
**Repository**: tldrsec-ai

## Research Question

Were the summaries sent out from Dec 24-26 genuine runs from the cron worker, verified using Cloudflare Worker logs, Supabase data, and cross-referencing with email delivery records?

## Summary

**FINDING: The Dec 24 summaries were created by manual E2E test script execution, NOT by genuine cron worker pipeline runs.**

Key evidence:
1. **No SecFiling Records**: All 5 summaries have `secFilingId=NULL` - genuine pipeline runs always link to SecFiling records
2. **No Email Delivery Records**: `SummaryEmailDelivery` table shows no emails sent Dec 24-26 (last emails were Dec 18)
3. **Cron Jobs Report Zero Activity**: All cron executions show `filingsDiscovered=0`, `eligibleUsers=0`, `emailsSent=0`
4. **Test Ticker Pattern**: The 5 tickers (TSLA, VRT, COIN, KO, NVDA) exactly match the `DEFAULT_TEST_TICKERS` in `test-e2e-email.ts`
5. **Timing**: Summaries created within 1 minute (01:03:11 - 01:04:08 UTC) - consistent with batch test execution

## Detailed Findings

### Summaries Created Dec 24, 2025 (01:03-01:04 UTC)

| Symbol | Filing Type | Model | Tokens (In/Out) | Cost | SecFilingId |
|--------|-------------|-------|-----------------|------|-------------|
| TSLA | 4 | x-ai/grok-4.1-fast | 4889/1458 | $0.0022 | NULL |
| VRT | 4 | x-ai/grok-4.1-fast | 6040/1884 | $0.0028 | NULL |
| COIN | 4 | x-ai/grok-4.1-fast | 6640/1957 | $0.0030 | NULL |
| KO | 8-K | x-ai/grok-4.1-fast | 24787/1022 | $0.0079 | NULL |
| NVDA | 4 | x-ai/grok-4.1-fast | 5346/2055 | $0.0026 | NULL |

**Total Cost**: ~$0.0185 for 5 summaries

### Cron Execution Evidence (Dec 24-26)

```
CronJobExecution records show:
- triggeredBy: "VERCEL_CRON"
- tickersChecked: 0
- newFilingsFound: 0
- filingsProcessed: 0
- emailsSent: 0
- errorsCount: 0
- durationMs: ~2200-3400ms (typical idle cron duration)
```

The cron worker was running correctly every 10 minutes but found no new filings to process.

### Email Delivery Evidence

Last recorded email deliveries were on **Dec 18, 2025**:
- Most recent: `wilfred.chen.python@gmail.com` at 2025-12-18 03:01:50 UTC
- No email delivery records exist for Dec 24-26

### JobQueue Analysis

Dec 24 JobQueue records show:
- `jobType: "ASYNC_DISCOVER_FILINGS"`
- `result: {"filingsDiscovered": 0, "fetchJobsQueued": 0, "eligibleUsers": 0}`

No FETCH or SUMMARIZE jobs were queued by the cron pipeline on Dec 24.

### Cloudflare Worker Deployment History

Last deployment: 2025-12-23T22:30:26Z
- Worker has been stable and operational
- Cron schedule: `*/10 * * * *` (every 10 minutes)
- Target: `https://tldrsec.app/api/cron/tier-aware`

## Code References

- Test script with matching tickers: [scripts/test-e2e-email.ts:60](scripts/test-e2e-email.ts#L60)
  - `const DEFAULT_TEST_TICKERS = ['TSLA', 'VRT', 'COIN', 'KO', 'NVDA'];`
- AI model configuration: [lib/ai/config.ts:70](lib/ai/config.ts#L70)
  - `defaultModel: 'x-ai/grok-4.1-fast'`

## Architecture Documentation

### Pipeline Flow (Normal Operation)
1. Cloudflare Worker triggers `/api/cron/tier-aware` every 10 minutes
2. Cron endpoint discovers new SEC filings via SEC EDGAR API
3. Creates `SecFiling` records in database
4. Queues FETCH jobs for content retrieval
5. FETCH jobs queue SUMMARIZE jobs
6. SUMMARIZE jobs create `Summary` records (linked to `SecFiling`)
7. Email delivery creates `SummaryEmailDelivery` records

### E2E Test Flow (What Happened Dec 24)
1. Manual execution of `test-e2e-email.ts` or similar script
2. Directly fetches SEC filings for hardcoded tickers
3. Creates `Summary` records WITHOUT SecFiling linkage
4. Sets `sentToUser=true` but may skip actual email delivery
5. No `SummaryEmailDelivery` records created

## Conclusions

1. **Dec 24 summaries are from manual testing** - not production cron runs
2. **Cron worker is functioning correctly** - running every 10 mins, just no new filings found
3. **Email pipeline has gap** - `sentToUser=true` but no delivery records suggests email step skipped in test
4. **Dec 25-26 had no summaries** - expected as SEC is closed for holidays
5. **Last genuine pipeline execution was Dec 18** - evidenced by email delivery records

## Recommendations

1. **Add test data markers**: Include `metadata.source='e2e-test'` for test-generated summaries
2. **Enforce SecFiling linkage**: Validate that production summaries always have `secFilingId`
3. **Audit trail improvement**: Log when `sentToUser` is set without actual delivery

## Open Questions

1. Was the Dec 24 test intentional or accidental?
2. Should test data be automatically cleaned up?
3. Is there a mechanism to distinguish test vs production summaries in dashboards?

---

*Research conducted using: Supabase MCP (database queries), Cloudflare Wrangler CLI (deployment history), codebase analysis*
