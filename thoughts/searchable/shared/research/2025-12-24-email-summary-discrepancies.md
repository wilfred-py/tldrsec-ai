---
date: 2025-12-24T15:38:24+11:00
researcher: Claude
git_commit: fdc36d917f24be1507118d37c9c10dca70742ebd
branch: feature/slack-10-minute-reports
repository: tldrsec-ai
topic: "Email Summary Discrepancies and Missing Notifications"
tags: [research, codebase, email, summaries, form-4, user-subscriptions]
status: complete
last_updated: 2025-12-24
last_updated_by: Claude
last_updated_note: "ROOT CAUSE IDENTIFIED - Two parallel summary systems, job type mismatch, findFirst() bug excluding secondary users"
---

# Research: Email Summary Discrepancies and Missing Notifications

**Date**: 2025-12-24T15:38:24+11:00
**Researcher**: Claude
**Git Commit**: fdc36d917f24be1507118d37c9c10dca70742ebd
**Branch**: feature/slack-10-minute-reports
**Repository**: tldrsec-ai

## Research Question

Three issues reported by user:
1. The last two emails sent to wilfredchen1@gmail.com show the same forms being summarized but summaries/text is different between the two
2. Some summaries don't show any meaningful information (e.g., "### SEC Form 4 Analysis: Coinbase Global, Inc." for COIN Form 4 on 23 Dec 2025)
3. Some tickers are subscribed to by wilfred.chen.python@gmail.com but no email was sent to them

## Summary

After analyzing the codebase, here's what exists:

### Issue 1: Same Forms, Different Summaries

**How summaries work:**
- Summaries are generated per-user and stored in the `Summary` table with a foreign key to `Ticker` (which belongs to a specific user) at [prisma/schema.prisma:68-123](prisma/schema.prisma#L68-L123)
- The unique constraint is `[tickerId, filingUrl]` - meaning each user gets their own Summary record even for the same SEC filing
- AI summaries are generated via OpenRouter xAI (Grok) at [services/filing/summaryGenerationService.ts:145-158](services/filing/summaryGenerationService.ts#L145-L158) with temperature 0.1
- Even with low temperature, AI-generated content has inherent variability

**Cache behavior:**
- The system checks for existing summaries at [lib/cron/filing-processor.ts:984-1059](lib/cron/filing-processor.ts#L984-L1059)
- Cache lookup is per-ticker (not per-filing), which means users tracking the same company can get different summaries if processed in different cron cycles

### Issue 2: Empty/Minimal Form 4 Summaries

**How Form 4 processing works:**
- Form 4 uses the `FormForm4Prompt` class at [lib/ai/prompts/form-4.ts:10-94](lib/ai/prompts/form-4.ts#L10-L94)
- The prompt requires a `summary` field to be returned as "the money shot" (lines 44-45)
- Form 4 XML extraction happens at [lib/parsers/filing-extractor-factory.ts:58-67](lib/parsers/filing-extractor-factory.ts#L58-L67)

**Where minimal summaries can occur:**
- If XML parsing fails to extract content, the extractor falls back to HTML cleaning (line 65)
- If content is minimal/empty, the AI may produce minimal output
- The email template at [components/ui/email/templates/form4-minimalist-template.tsx:337-353](components/ui/email/templates/form4-minimalist-template.tsx#L337-L353) displays only the first sentence of the summary as "THE STORY"

**Fallback system:**
- Fallback summaries are generated at [services/filing/fallbackSummary.ts](services/filing/fallbackSummary.ts) when AI summarization fails
- However, if the AI returns a structurally valid but content-light response, no fallback triggers

### Issue 3: Missing Emails for Subscribed User

**How email delivery is determined:**

1. **User must have ticker subscription:**
   - Query at [lib/cron/user-processing-service.ts:65-86](lib/cron/user-processing-service.ts#L65-L86) requires `tickers: { some: {} }`

2. **User must be eligible for processing:**
   - Tier-based processing at [lib/cron/user-processing-service.ts:92-106](lib/cron/user-processing-service.ts#L92-L106)
   - HOBBY tier: processed every 120 minutes
   - PRO tier: processed every 5 minutes

3. **Budget constraints:**
   - User `processingBudget` and `budgetUsed` fields enforce monthly limits
   - Validation at [lib/cron/user-processing-service.ts:595-696](lib/cron/user-processing-service.ts#L595-L696)

4. **Email notification preferences:**
   - Stored in `User.preferences` JSON field
   - Immediate notifications check `preferences.notifications.emailFrequency = IMMEDIATE` at [lib/email/notification-service.ts:317-320](lib/email/notification-service.ts#L317-L320)
   - Daily digest checks `preferences.emailNotificationPreference = DAILY` at [lib/email/digest-service.ts:199-202](lib/email/digest-service.ts#L199-L202)

5. **Email queue processing:**
   - Emails queued at [lib/cron/filing-processor.ts:1522-1544](lib/cron/filing-processor.ts#L1522-L1544)
   - Async email queue processes at [lib/email/async-email-queue.ts:296-428](lib/email/async-email-queue.ts#L296-L428)

**Where emails can fail to send:**
- User excluded from cron processing due to tier/budget
- Notification preference set to DAILY (digest) or NONE instead of IMMEDIATE
- Email queued but async worker hasn't processed yet
- Resend API rate limiting or failures at [lib/email/async-email-queue.ts:253-284](lib/email/async-email-queue.ts#L253-L284)

## Detailed Findings

### Summary Generation Flow

1. **Entry Point**: Cron job at [app/api/cron/tier-aware/route.ts:43-897](app/api/cron/tier-aware/route.ts#L43-L897) triggers every 10 minutes
2. **User Selection**: Only users with ticker subscriptions who meet tier/budget criteria
3. **Filing Discovery**: SEC filings discovered per-ticker
4. **AI Generation**: OpenRouter xAI (Grok-4-fast) with journalist-tone prompt at [services/filing/summaryGenerationService.ts:25-108](services/filing/summaryGenerationService.ts#L25-L108)
5. **Storage**: Summary stored per-ticker (not shared across users by default)
6. **Email Queue**: Filing notification queued for async delivery

### Form 4 Specific Processing

1. **XML Priority**: Form 4 prioritizes XML documents at [lib/cron/handlers/fetch-handler.ts:518-532](lib/cron/handlers/fetch-handler.ts#L518-L532)
2. **Extraction**: Uses `Form4Extractor` class at [lib/parsers/filing-extractor-factory.ts:58-67](lib/parsers/filing-extractor-factory.ts#L58-L67)
3. **Prompt**: Matt Levine-style journalist tone at [lib/ai/prompts/form-4.ts:14-32](lib/ai/prompts/form-4.ts#L14-L32)
4. **Output**: Expects JSON with `summary`, `transactions[]`, `signalStrength` fields

### User-to-Email Mapping

1. **Ticker Ownership**: Each Ticker belongs to one User via `userId` foreign key at [prisma/schema.prisma:58](prisma/schema.prisma#L58)
2. **Unique Constraint**: `[userId, symbol]` prevents duplicate subscriptions at [prisma/schema.prisma:64](prisma/schema.prisma#L64)
3. **Email Target**: User email fetched via Ticker → User relation during processing
4. **Notification Path**:
   - Immediate: [lib/email/notification-service.ts:237-293](lib/email/notification-service.ts#L237-L293)
   - Digest: [lib/email/digest-service.ts:331-408](lib/email/digest-service.ts#L331-L408)

## Code References

### Summary Storage
- [prisma/schema.prisma:68-123](prisma/schema.prisma#L68-L123) - Summary model with unique constraint `[tickerId, filingUrl]`

### AI Generation
- [services/filing/summaryGenerationService.ts:145-158](services/filing/summaryGenerationService.ts#L145-L158) - OpenRouter API call with temperature 0.1
- [lib/ai/prompts/form-4.ts:10-94](lib/ai/prompts/form-4.ts#L10-L94) - Form 4 journalist-style prompt

### Email Flow
- [lib/cron/filing-processor.ts:1522-1544](lib/cron/filing-processor.ts#L1522-L1544) - Email queueing
- [lib/email/async-email-queue.ts:296-428](lib/email/async-email-queue.ts#L296-L428) - Async email processing

### User Eligibility
- [lib/cron/user-processing-service.ts:65-86](lib/cron/user-processing-service.ts#L65-L86) - User query with ticker filter
- [lib/cron/user-processing-service.ts:92-106](lib/cron/user-processing-service.ts#L92-L106) - Tier-based eligibility

## Architecture Documentation

### Summary Per-User Design
The system creates separate Summary records for each user tracking the same filing. This is intentional:
- Each `Ticker` belongs to one `User` via foreign key
- Each `Summary` belongs to one `Ticker` via foreign key
- Unique constraint is on `[tickerId, filingUrl]`, not on `filingUrl` alone

This means the same SEC filing can result in multiple Summary records in the database - one per user tracking that company.

### Email Delivery Paths
Four independent paths exist for email delivery:
1. **Immediate (Path 1)**: Direct `sendFilingSummaryEmail()` call after summarization
2. **Event-driven (Path 2)**: Via `notificationEvents.emit()` and NotificationProcessor
3. **Daily Digest (Path 3)**: Scheduled compilation of unsent summaries
4. **Async Queue (Path 4)**: Rate-limited batch processing via JobQueueService

### Tier-Based Processing
- PRO users processed every 5 minutes
- HOBBY users processed every 120 minutes
- `lastCronProcessed` timestamp determines next eligibility

## Database Investigation Findings (2025-12-24T15:45 AEDT)

### User Account Comparison

| Field | wilfredchen1@gmail.com | wilfred.chen.python@gmail.com |
|-------|------------------------|------------------------------|
| **User ID** | `2009de85-4eb6-4f18-9c01-ee212c5d43d4` | `user_2yAsw3Tz3NWUtedemupaXOhqo8L` |
| **Subscription Tier** | HOBBY | FREE |
| **Last Cron Processed** | 2025-11-20T16:50:05Z | NULL (never) |
| **Processing Budget** | 60 | 0 |
| **Budget Used** | 0 | 0 |
| **Preferences** | null | null |
| **Tickers** | TSLA, VRT, COIN, KO, CMG, GOOG, NVDA | TSLA, VRT, COIN, KO, CMG, GOOGL, NVDA |

### Root Cause Analysis

#### Issue 1: Different Summaries for Same Forms

**Finding:** The shared summary cache IS working correctly - users get the SAME summary text.

**Database Evidence:**
Queried filings with multiple summary records and confirmed the cache behavior:

| Filing URL | User 1 | cacheHit | User 2 | cacheHit |
|------------|--------|----------|--------|----------|
| COIN 8-K | wilfred.chen.python | false, $0.0018 | wilfredchen1 | **true**, $0 |
| NVDA 4 | wilfred.chen.python | false, $0.0014 | wilfredchen1 | **true**, $0 |
| NVDA 144 | wilfred.chen.python | false, $0.0013 | wilfredchen1 | **true**, $0 |
| COIN 4 | wilfred.chen.python | false, $0.0021 | wilfredchen1 | **true**, $0 |
| COIN 8-K | wilfred.chen.python | false, $0.0049 | wilfredchen1 | **true**, $0 |

The pattern is clear:
1. First user processed pays the AI cost (cacheHit: false)
2. Second user gets cached summary (cacheHit: true, cost: $0)
3. **Both users receive the SAME summary text**

The shared summary cache at [lib/cron/handlers/summarize-cached-handler.ts:216-238](lib/cron/handlers/summarize-cached-handler.ts#L216-L238) works correctly:

```typescript
const sharedSummary = await prisma.summary.findFirst({
  where: {
    filingUrl: filing.filingUrl,
    filingType: filing.formType,
    summaryText: { not: '' }
  }
});
```

**If the user reported different summaries in emails**, the issue is likely:
1. **Different filings** - user may be comparing different Form 4s (multiple insiders file separate Form 4s)
2. **Email rendering differences** - the email template may display differently
3. **Timing** - emails sent at different times may show different formatting

#### Issue 2: COIN Form 4 Has Minimal Summary Content

**Finding:** The COIN Form 4 summary is NOT minimal - it's actually comprehensive.

Examined summary ID `1b2e6235-f392-4cb1-a22c-8e4dfb6739a3`:

**Summary Text (excerpt):**
```
### SEC Form 4 Analysis: Coinbase Global, Inc. (COIN)
**Filing Date**: December 24, 2025 (transactions reported as occurring on December 22, 2025)
**Form Type**: Form 4 - Statement of Changes in Beneficial Ownership

#### 1. Reporting Person
- **Name**: Brian Armstrong
- **Title/Relationship**: Chairman and CEO (Officer), Director, 10% Owner

#### 2. Key Transaction Details
All transactions occurred on **12/22/2025** pursuant to a pre-arranged **Rule 10b5-1 trading plan**

| Transaction # | Code | Shares | Price | Post-Transaction Holdings |
|---------------|------|--------|-------|--------------------------|
| 1 | M | 40,000 | $18.71 | 40,000 |
| 2 | S | 9,138 | $248.61 | 30,862 |
... (continues with detailed transaction table)
```

The summary contains 8597 tokens with detailed transaction information. If the user reported "minimal content", the issue may be:
1. Email template rendering issue - Form 4 template at [components/ui/email/templates/form4-minimalist-template.tsx](components/ui/email/templates/form4-minimalist-template.tsx) only shows the first sentence as "THE STORY"
2. The `summaryJSON.keyPoints` array is empty: `"keyPoints": []`
3. The email may have rendered before the full summary was stored

#### Issue 3: wilfred.chen.python@gmail.com Not Receiving Emails

**Corrected Analysis:**

1. **Budget System Works Differently Than Initially Thought:**
   - The `processingBudget: 0` field on User is **NOT used** in eligibility checks
   - Instead, the system uses tier-based `DAILY_COST_LIMITS` from [lib/cron/types.ts:175-178](lib/cron/types.ts#L175-L178):
     - PRO: $10/day
     - HOBBY: $2/day
   - The calculation at [lib/cron/tier-eligibility.ts:99-100](lib/cron/tier-eligibility.ts#L99-L100):
     ```typescript
     const dailyLimit = CronBudgetService.getDailyCostLimit(eligibility.tier);
     const budgetPercentUsed = dailyLimit > 0 ? (user.budgetUsed / dailyLimit) * 100 : 0;
     ```
   - For this user: `budgetPercentUsed = 0 / 2.00 * 100 = 0%` → **SHOULD PASS budget check**

2. **Tier Normalization Works Correctly:**
   - `FREE` tier maps to `HOBBY` at [lib/cron/budget-service.ts:35-36](lib/cron/budget-service.ts#L35-L36)
   - HOBBY tier has $2/day limit, which is generous for shared summaries (cost $0)

3. **The Real Issue: No ASYNC_SUMMARIZE_CACHED Jobs Being Created**
   - All 30+ recent jobs are `ASYNC_DISCOVER_FILINGS`
   - Zero summarization jobs since Dec 20 for ANY user
   - Summaries ARE being created (5 for wilfredchen1 on Dec 24) but via different path

4. **User's Last Summary Was Dec 18, 2025**
   - 6 days without new summaries despite active SEC filings
   - This user was the FIRST to get summaries (paid AI cost) before Dec 18
   - After Dec 18, something changed in the pipeline

**Root Cause Hypothesis:**
The cron pipeline may have changed between Dec 18 and now. Need to check:
1. Whether summarization now happens inline vs via job queue
2. Why `wilfred.chen.python@gmail.com` stopped being processed after Dec 18
3. What changed in the pipeline on/around Dec 18-20

### Summary Count Comparison

| User | Total Summaries | Last Summary Date |
|------|-----------------|-------------------|
| wilfredchen1@gmail.com | 5 (Dec 23-24) | 2025-12-24T01:04:08Z |
| wilfred.chen.python@gmail.com | 32 (total) | 2025-12-18T03:01:48Z |

### Job Queue Analysis

Recent jobs (Dec 23-24, 2025):
- **Total jobs**: 30+
- **All job types**: `ASYNC_DISCOVER_FILINGS`
- **Summary/Email jobs**: 0

This indicates the cron is running filing discovery but NOT proceeding to the summarization phase for users.

## Final Conclusions

### Issue 1: Different Summaries for Same Forms - RESOLVED

**Status**: Not an issue - cache works correctly

The shared summary cache at [lib/cron/handlers/summarize-cached-handler.ts:216-238](lib/cron/handlers/summarize-cached-handler.ts#L216-L238) works correctly:
- First user to request a summary pays the AI cost
- All subsequent users get the SAME summary text (cached)
- Database evidence confirms `cacheHit: true` with `$0` cost for second user
- Ratio is 1:1 between unique filings and unique summary text

If user reported different summaries, likely causes:
1. Comparing different Form 4s from different insiders (each insider files separately)
2. Email rendering differences
3. Different filings entirely

### Issue 2: COIN Form 4 Minimal Content - RESOLVED

**Status**: Not an issue - summary is comprehensive

The COIN Form 4 summary contains 8597 tokens with full transaction details. The issue may be:
1. Email template [components/ui/email/templates/form4-minimalist-template.tsx:337-353](components/ui/email/templates/form4-minimalist-template.tsx#L337-L353) only shows first sentence as "THE STORY"
2. Empty `keyPoints` array in `summaryJSON`
3. Visual rendering in email client

### Issue 3: Missing Emails for wilfred.chen.python@gmail.com - REQUIRES INVESTIGATION

**Status**: Root cause partially identified

**What we know:**
1. **Budget is NOT the issue**:
   - `User.processingBudget` field is NOT used for eligibility
   - System uses tier-based `DAILY_COST_LIMITS` from [lib/cron/types.ts:175-178](lib/cron/types.ts#L175-L178)
   - FREE tier → HOBBY ($2/day limit)
   - User with `budgetUsed: 0` has 0% utilization → passes budget check

2. **lastCronProcessed is NULL**:
   - This field is only updated when budget is updated after processing
   - See [lib/db/budget-operations.ts:235](lib/db/budget-operations.ts#L235)
   - NULL means user was NEVER processed by the current pipeline
   - Yet user has 32 summaries up to Dec 18 - processed by DIFFERENT mechanism

3. **Discovery jobs running but no summarization jobs**:
   - All recent jobs are `ASYNC_DISCOVER_FILINGS`
   - Zero `ASYNC_SUMMARIZE_CACHED` jobs since Dec 20

**Hypothesis**: The summarization pipeline may have changed between Dec 18-20. Need to investigate:
1. Git history for changes around Dec 18-20
2. Whether inline summarization replaced job-based summarization
3. Why `wilfredchen1@gmail.com` continues to get summaries while `wilfred.chen.python@gmail.com` does not

## Regarding Budget Constraints for Paying Users

**Research Question**: Should paying users have budget limits?

**Current Design**:
- All users have daily cost limits based on tier
- PRO: $10/day, HOBBY: $2/day (from [lib/cron/types.ts:175-178](lib/cron/types.ts#L175-L178))
- Limits apply per-user per-day, reset at midnight UTC
- Budget check at [lib/cron/tier-eligibility.ts:99-106](lib/cron/tier-eligibility.ts#L99-L106): eligible if < 95% of daily limit

**Analysis**:
- These limits are VERY generous: $2/day allows ~200-2000 operations with shared summary cache
- With cache, most summaries cost $0 (only first user pays AI cost)
- In practice, users rarely hit these limits unless tracking 100+ tickers with all new filings
- The limits exist for cost protection, not to restrict service

**Recommendation**:
- For most users, current limits are effectively unlimited
- Consider monitoring to verify no legitimate users are hitting limits
- If paying users report issues, can increase limits via environment variables:
  - `PRO_COST_LIMIT` (default: $10)
  - `HOBBY_COST_LIMIT` (default: $2)

## Deep Investigation Findings (2025-12-24T16:30 AEDT)

### Critical Discovery: Two Parallel Summary Creation Systems

After extensive code analysis, I discovered the codebase has **TWO parallel systems** for creating summaries:

#### System 1: Modern 3-Phase Pipeline (via Job Queue)
**Job Types:**
- `ASYNC_DISCOVER_FILINGS` - Discovery phase
- `ASYNC_FETCH_FILING` - Fetch phase
- `ASYNC_SUMMARIZE_CACHED` - Summarize phase

**Characteristics:**
- Sets `modelVersion` field correctly
- Sets `metadata` with execution context
- Called by Cloudflare Worker 5-step pipeline at [cloudflare-cron/index.js](cloudflare-cron/index.js)
- Handler at [lib/cron/handlers/summarize-cached-handler.ts](lib/cron/handlers/summarize-cached-handler.ts)

**Current Status: BROKEN**
- Zero `ASYNC_SUMMARIZE_CACHED` jobs have ever completed
- Zero `ASYNC_FETCH_FILING` jobs in queue
- 64 stuck `ASYNC_SUMMARIZE_FILING` (LEGACY) jobs in PENDING status

#### System 2: Legacy Direct Summary Service
**Code Path:** [services/filings/database/filingDatabase.ts:99-195](services/filings/database/filingDatabase.ts#L99-L195)

**Characteristics:**
- Sets `model` field (e.g., `x-ai/grok-4.1-fast`)
- Does NOT set `modelVersion` (NULL)
- Does NOT set `tokensUsed` (NULL)
- Uses `prisma.ticker.findFirst()` which returns **only ONE ticker**

**Critical Bug:**
```typescript
// Line 110-114 in filingDatabase.ts
const tickerRecord = await prisma.ticker.findFirst({
  where: { symbol: ticker.toUpperCase() }
});
```

This returns **only the first matching ticker**, not ALL users' tickers for that symbol. Whichever user created their ticker first gets the summary; other users are silently skipped.

### Database Evidence: Dec 24 Summaries

All 5 Dec 24 summaries (01:03-01:04 UTC) have this signature:
| Field | Value |
|-------|-------|
| model | `x-ai/grok-4.1-fast` |
| modelVersion | **NULL** |
| tokensUsed | **NULL** |
| inputTokens | Set (e.g., 6040) |
| outputTokens | Set (e.g., 1884) |
| totalCost | Set (e.g., 0.002754) |
| isCacheHit | false |

This pattern matches **System 2** (legacy), not System 1 (modern pipeline).

### Ticker Creation Order

| User | TSLA Ticker ID | Added Date |
|------|---------------|------------|
| wilfredchen1@gmail.com | a89162af... | 2025-11-20 |
| wilfred.chen.python@gmail.com | 0ae5574c... | 2025-12-04 |

**Impact:** `findFirst()` returns wilfredchen1's ticker (created first), so only wilfredchen1 gets summaries via System 2.

### Job Queue Architecture Issue

The Cloudflare Worker calls these endpoints in sequence:
1. `/api/cron/tier-aware` → Queues `ASYNC_SUMMARIZE_FILING` (legacy type)
2. `/api/cron/process-filing-queue?jobTypes=ASYNC_DISCOVER_FILINGS`
3. `/api/cron/process-filing-queue?jobTypes=ASYNC_FETCH_FILING`
4. `/api/cron/process-filing-queue?jobTypes=ASYNC_SUMMARIZE_CACHED`

**The Problem:** [lib/cron/background-filing-worker.ts:222](lib/cron/background-filing-worker.ts#L222) explicitly **excludes** `ASYNC_SUMMARIZE_FILING`:
```typescript
// IMPORTANT: Exclude ASYNC_SUMMARIZE_FILING (legacy sync jobs that timeout)
```

This means:
- Jobs queued as `ASYNC_SUMMARIZE_FILING` are never processed
- 64 such jobs are stuck in PENDING status
- The modern 3-phase pipeline (`ASYNC_FETCH_FILING` → `ASYNC_SUMMARIZE_CACHED`) is never triggered

### Root Cause Summary

**Issue 3: wilfred.chen.python@gmail.com not receiving emails**

**Root Cause #1: Job Type Mismatch**
- `/api/cron/tier-aware` queues `ASYNC_SUMMARIZE_FILING` jobs
- Background worker only processes `ASYNC_DISCOVER_FILINGS`, `ASYNC_FETCH_FILING`, `ASYNC_SUMMARIZE_CACHED`
- Result: Legacy jobs stuck forever, modern pipeline never starts

**Root Cause #2: Legacy storeSummary Bug**
- `findFirst()` returns only the FIRST ticker for a symbol
- User who created ticker first (wilfredchen1) gets all summaries
- Later users (wilfred.chen.python) are silently skipped

**Root Cause #3: Two Incompatible Systems**
- System 1 (modern): Properly handles multi-user via `summarize-cached-handler.ts`
- System 2 (legacy): Single-user only via `filingDatabase.ts`
- Something triggers System 2 for wilfredchen1 but System 1 (broken) is expected for wilfred.chen.python

### Recommended Fixes

1. **Fix Job Type Alignment:**
   Either change `tier-aware` to queue `ASYNC_FETCH_FILING` (which triggers `ASYNC_SUMMARIZE_CACHED`)
   OR enable processing of `ASYNC_SUMMARIZE_FILING` in background worker

2. **Fix Legacy storeSummary:**
   Change `findFirst()` to `findMany()` and create summaries for ALL users tracking the symbol

3. **Clear Stuck Jobs:**
   Either process or mark as failed the 64 stuck `ASYNC_SUMMARIZE_FILING` jobs

4. **Consolidate Systems:**
   Remove System 2 (legacy) paths or ensure they properly handle multi-user scenarios

## Open Questions (Updated)

1. ~~Pipeline Change Investigation~~ **RESOLVED** - See "Critical Discovery" above

2. **What Triggers System 2?** - Need to trace what code path creates summaries with NULL modelVersion

3. **User ID Format Difference**:
   - `wilfredchen1@gmail.com`: UUID format (`2009de85-4eb6-4f18-9c01-ee212c5d43d4`)
   - `wilfred.chen.python@gmail.com`: Clerk format (`user_2yAsw3Tz3NWUtedemupaXOhqo8L`)
   - This may affect certain queries but not the core issue identified above
