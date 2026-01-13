---
date: 2025-12-30T15:45:00+11:00
researcher: Claude
git_commit: 91e9cd0871c1ed0893779923d5bc78bc90d5c3ac
branch: feature/landing-page-stripe-redesign
repository: tldrsec-ai
topic: "VRT Summary Sharing: Both Users Received Same Summary at Different Times"
tags: [research, codebase, summary-caching, email-delivery, vrt]
status: complete
last_updated: 2025-12-30
last_updated_by: Claude
---

# Research: VRT Summary Sharing - Both Users Received Same Summary at Different Times

**Date**: 2025-12-30T15:45:00+11:00
**Researcher**: Claude
**Git Commit**: 91e9cd0871c1ed0893779923d5bc78bc90d5c3ac
**Branch**: feature/landing-page-stripe-redesign
**Repository**: tldrsec-ai

## Research Question

Both users tracking VRT received the same summary at different times. Investigate ID `61082160-f11c-4024-af4f-acbc738c1ece` (from Resend MCP logs) and understand the summary sharing mechanism.

## Summary

The system is working as designed. The codebase implements a **summary caching/sharing architecture** where when multiple users track the same ticker (VRT in this case), the AI summary is generated only once and then shared across all users. This results in:

1. **User 1 (wilfredchen1@gmail.com)** receives the original AI-generated summary
2. **User 2 (wilfred.chen.python@gmail.com)** receives a cache-hit copy of the same summary content ~5 minutes later

Each user gets their own `Summary` record in the database (with unique IDs), but the `summaryText` and `summaryJSON` content is identical. The second user's summary is marked with `isCacheHit: true` and has `totalCost: 0` since no new AI generation occurred.

### Clarification on ID `61082160-f11c-4024-af4f-acbc738c1ece`

This ID is a **Resend email service ID**, not a database Summary ID. The `emailServiceId` field in `SummaryEmailDelivery` records is currently `null` for all deliveries - the system does not capture the Resend email ID back into the database after sending.

## Detailed Findings

### Users Tracking VRT

Two users are tracking VRT (Vertiv Holdings Co):

| User ID | Email | Ticker ID | Added At |
|---------|-------|-----------|----------|
| `2009de85-4eb6-4f18-9c01-ee212c5d43d4` | wilfredchen1@gmail.com | `e552bdac-ff38-4e6c-98c2-42f527f2278b` | 2025-11-21 |
| `user_2yAsw3Tz3NWUtedemupaXOhqo8L` | wilfred.chen.python@gmail.com | `b1d407b8-e4e3-4fb5-9a30-0e0000dc6b17` | 2025-12-04 |

### All VRT Email Deliveries (2025-12-30)

The following table shows all 13 VRT email deliveries from the backfill run, demonstrating the consistent pattern of summary sharing:

| Filing (Accession) | User 1 Email Sent | User 2 Email Sent | Time Gap | User 2 Cache Hit |
|--------------------|-------------------|-------------------|----------|------------------|
| 0000950142-25-003260 | 02:22:07 | 02:27:03 | ~5 min | Yes |
| 0002043251-25-000005 | 03:22:05 | 03:26:51 | ~5 min | Yes |
| 0001984161-25-000005 | 03:32:07 | 03:36:50 | ~5 min | Yes |
| 0001812000-25-000006 | 03:42:04 | 03:46:49 | ~5 min | Yes |
| 0001917820-25-000005 | 03:52:01 | 03:56:48 | ~5 min | Yes |
| 0002075382-25-000004 | 04:02:29 | 04:07:16 | ~5 min | Yes |
| 0001976667-25-000005 | 04:12:02 | N/A | - | N/A |

**Note**: All `emailServiceId` fields are `null` - the Resend email ID is not being captured back into the database.

### Example: Shen Wei Form 4 Filing (Accession: 0002075382-25-000004)

**Original Summary (User 1 - wilfredchen1@gmail.com)**:
- Summary ID: `1be1a955-f34d-4376-8244-73a67d183a18`
- Created: 2025-12-30T04:02:27.105Z
- `isCacheHit`: false
- `inputTokens`: 1917
- `outputTokens`: 889
- `totalCost`: $0.0010196
- Email sent at: 2025-12-30T04:02:29.279Z

**Shared Summary (User 2 - wilfred.chen.python@gmail.com)**:
- Summary ID: `69f444b4-e1f8-4d3a-b6ba-bac6879d0c07`
- Created: 2025-12-30T04:07:14.140Z (~5 min later)
- `isCacheHit`: true
- `inputTokens`: 0
- `outputTokens`: 0
- `totalCost`: $0.00
- Metadata contains:
  - `sharedFromSummaryId`: `1be1a955-f34d-4376-8244-73a67d183a18`
  - `sharedFromCreatedAt`: 2025-12-30T04:02:27.105Z
  - `originalCost`: 0.0010196
  - `originalInputTokens`: 1917
  - `originalOutputTokens`: 889
- Email sent at: 2025-12-30T04:07:16.390Z

### Summary Sharing Architecture

#### How It Works

1. **Fetch Phase** ([lib/cron/handlers/fetch-handler.ts](lib/cron/handlers/fetch-handler.ts)):
   - SEC filing content is cached in `FilingContentCache` table
   - Cache key is `accessionNumber` (unique per SEC filing)
   - 24-hour TTL for cached content

2. **Summarize Phase** ([lib/cron/handlers/summarize-cached-handler.ts](lib/cron/handlers/summarize-cached-handler.ts)):
   - Before generating AI summary, checks for existing summary via `findFirst()`:
   ```typescript
   const sharedSummary = await prisma.summary.findFirst({
     where: {
       filingUrl: filing.filingUrl,
       filingType: filing.formType,
       summaryText: { not: '' }
     }
   });
   ```
   - If found, copies the summary content instead of calling AI

3. **Summary Creation for Cache Hit** (line 250-285):
   - Creates new `Summary` record for the user
   - Copies `summaryText` and `summaryJSON` from source
   - Sets `isCacheHit: true`
   - Sets `totalCost: 0`
   - Records provenance in metadata:
     - `sharedFromSummaryId`
     - `sharedFromCreatedAt`
     - `originalCost`
     - `originalInputTokens`
     - `originalOutputTokens`

#### Key Metadata Fields

| Field | Purpose |
|-------|---------|
| `isCacheHit` | Boolean indicating if summary was shared (not freshly generated) |
| `cacheId` | UUID of `FilingContentCache` record (raw SEC content) |
| `sharedFromSummaryId` | UUID of the original summary this was copied from |
| `sharedFromCreatedAt` | Timestamp when original summary was created |
| `originalCost` | AI generation cost of the original summary |

### Email Delivery Architecture

Each user receives their own email, tracked via `SummaryEmailDelivery` table:

#### Deduplication Constraints

1. **Database Constraint**: `@@unique([userId, summaryId])` prevents duplicate emails
2. **Application Check**: Pre-flight query excludes already-delivered summaries
3. **Atomic Transaction**: Email sending + delivery record creation in single transaction

#### Email Flow for Shared Summaries

1. Summary created for user (with `isCacheHit: true`)
2. `sendFilingSummaryEmail()` called with summary data
3. Email sent via Resend API
4. `SummaryEmailDelivery` record created
5. `Summary.sentToUser` set to `true`
6. `Summary.totalEmailsSent` incremented

## Code References

- [lib/cron/handlers/summarize-cached-handler.ts:217-285](lib/cron/handlers/summarize-cached-handler.ts#L217-L285) - Shared summary detection and creation
- [lib/cron/handlers/fetch-handler.ts:94-139](lib/cron/handlers/fetch-handler.ts#L94-L139) - Content cache lookup
- [prisma/schema.prisma:68-120](prisma/schema.prisma#L68-L120) - Summary model definition
- [prisma/schema.prisma:575-593](prisma/schema.prisma#L575-L593) - SummaryEmailDelivery model
- [services/filing/sendEmailSummary.ts:414-480](services/filing/sendEmailSummary.ts#L414-L480) - Atomic email transaction

## Architecture Documentation

### Summary Caching Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                    Layer 1: Content Cache                       │
│  FilingContentCache table - keyed by accessionNumber            │
│  Stores raw SEC filing HTML, 24-hour TTL                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Layer 2: Summary Cache                       │
│  Summary table - keyed by filingUrl + filingType                │
│  findFirst() query matches any user's existing summary          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Layer 3: User-Specific Summaries                │
│  Each user gets their own Summary record                        │
│  isCacheHit=true for shared, false for original                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│               Layer 4: Email Delivery Tracking                  │
│  SummaryEmailDelivery table - unique per userId + summaryId     │
│  Prevents duplicate emails to same user for same summary        │
└─────────────────────────────────────────────────────────────────┘
```

### Cost Savings

For the Shen Wei Form 4 example:
- Original AI cost: $0.0010196
- Shared summary cost: $0.00
- **Cost savings**: 100% for second user

This pattern repeats across all shared summaries - the system generates AI summaries once per filing and shares them across all users tracking the same ticker.

## Historical Context (from thoughts/)

No relevant historical documents found specific to VRT summary sharing.

## Related Research

- [DUPLICATE_EMAIL_FIX_SUMMARY.md](../../DUPLICATE_EMAIL_FIX_SUMMARY.md) - Documents the email deduplication architecture

## Open Questions

1. **Resend Email ID Not Captured**: The `emailServiceId` field in `SummaryEmailDelivery` is `null` for all records. The Resend API returns an email ID after sending, but this is not being stored in the database. This makes it difficult to correlate Resend logs with database records.

2. **Time Gap Between Emails**: User 2 receives emails approximately 5 minutes after User 1. This delay occurs because:
   - Each user's filings are processed in separate job queue entries
   - The backfill script processes users sequentially
   - The ~5 minute gap is the processing time between users

3. **Summary Content Verification**: The `summaryText` is identical between original and shared summaries, which is the intended behavior. Users receive the same analytical content regardless of when they receive their email.
