---
date: 2026-01-02T12:45:00+11:00
researcher: Claude
git_commit: 0c78e435f929b942af436089ca125fc56693df72
branch: feature/inline-ticker-search-keyboard-nav
repository: tldrsec-ai
topic: "OpenRouter API Usage vs Database Budget Discrepancy Investigation"
tags: [research, openrouter, budget, cost-tracking, pipeline]
status: complete
last_updated: 2026-01-02
last_updated_by: Claude
---

# Research: OpenRouter API Usage vs Database Budget Discrepancy

**Date**: 2026-01-02T12:45:00 AEDT
**Researcher**: Claude
**Git Commit**: 0c78e435f929b942af436089ca125fc56693df72
**Branch**: feature/inline-ticker-search-keyboard-nav
**Repository**: tldrsec-ai

## Research Question

The database shows a budget usage of $988,316 against a $60 budget (1,647,193.3% usage), but the user suspects this is incorrect. Verify actual OpenRouter API usage and cross-reference with database entries.

## Summary

**The $988,316 budget figure is INCORRECT.** The actual OpenRouter API usage is only **$35.69**. There's a massive discrepancy of 27,700x between what the database tracks and actual API usage.

## Detailed Findings

### OpenRouter API Actual Usage

Called OpenRouter `/api/v1/auth/key` endpoint:

```json
{
  "usage": 35.69147862,
  "usage_daily": 0,
  "usage_weekly": 0,
  "usage_monthly": 0,
  "is_free_tier": false,
  "limit": null
}
```

**Actual OpenRouter spending: $35.69**

### Database Summary Cost Tracking

Queried `app."Summary"` table:

| Metric | Value |
|--------|-------|
| Total Input Tokens | 7,064,876 |
| Total Output Tokens | 500,584 |
| Total Cost Recorded | $2.37 |
| Total Summaries | 436 |
| First Summary | 2025-11-20 |
| Last Summary | 2026-01-01 09:29 UTC |

**Cost by Model:**
- `unknown`: $2.31 (416 summaries)
- `x-ai/grok-4.1-fast`: $0.06 (19 summaries)
- `x-ai/grok-4-fast`: $0.002 (1 summary)

### User Budget Tracking (Problem Area)

| User | budgetUsed | processingBudget |
|------|------------|------------------|
| wilfredchen1@gmail.com | 988,316 | 60 |
| wilfred.chen.python@gmail.com | 130,067 | 0 |

**The `budgetUsed` field contains grossly inflated values that don't correspond to actual costs.**

### Filing Pipeline Status

- **Unprocessed filings**: 397
- **Processed filings**: 0 (all marked unprocessed in database)
- **Recent summaries (24h)**: 4

## Root Cause Analysis

The `budgetUsed` field in the `User` table is being incremented incorrectly. Based on the data:

1. **Actual API spend**: $35.69 (OpenRouter confirms)
2. **Database recorded cost**: $2.37 (Summary table)
3. **User budgetUsed field**: $988,316 (incorrect)

The `budgetUsed` value appears to be tracking something other than actual dollar costs - possibly:
- Raw token counts mistakenly stored as dollars
- Accumulated without resets
- Multiplied by incorrect factors

## Code References

- `lib/ai/openrouter-client.ts` - OpenRouter API client with cost tracking
- Budget check logic needs investigation

## Recommendations

1. **Immediate**: Reset the `budgetUsed` field to match actual costs (~$35)
2. **Investigation**: Find where `budgetUsed` is being updated incorrectly
3. **Pipeline**: The 397 unprocessed filings can resume once budget is corrected

## Actual vs Reported

| Source | Amount |
|--------|--------|
| OpenRouter API (actual) | $35.69 |
| Summary table totalCost | $2.37 |
| User.budgetUsed (WRONG) | $988,316 |
| User.processingBudget | $60 |

## Open Questions

1. Where in the codebase is `budgetUsed` being incremented?
2. Is it tracking tokens instead of dollars?
3. When was this bug introduced?
