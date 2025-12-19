# Duplicate Summaries Analysis

**Date:** 2025-12-18
**Status:** Partially Resolved - Immediate duplicates fixed, architectural issue identified

## Initial Problem

User reported duplicate summaries in the database:
- `69e3c3fe-33af-4cd6-8f12-c1c21ce2d4e2` and `b2851e37-4305-4540-875a-5d1b27c8e935`
- `9f122f29-fe6d-444d-b3a1-d4d9cb5f1d5d` and `22ec34f9-6a9d-4bc9-aa55-227c7c5e08c0`

## Analysis Findings

### Type 1: True Duplicates (Same tickerId + filingUrl)

Found 23 true duplicate records where the same filing was summarized multiple times for the same user's ticker:

| Ticker | Filing URL | Count | Duplicates |
|--------|-----------|-------|------------|
| TSLA | Form 4 (0001318605/000110465925110597) | 17 | 16 |
| NVDA | Form 4 (0001045810/000119765225000007) | 7 | 6 |
| NVDA | 144 (0001045810/000196530125000175) | 2 | 1 |

**Root Cause:**
- No unique constraint on `(tickerId, filingUrl)`
- Filing processor used `prisma.summary.create()` instead of `upsert`
- Multiple cron runs could process the same filing before it was marked as processed

**Fix Applied:**
1. Added `@@unique([tickerId, filingUrl])` to Summary model
2. Changed `create()` to `upsert()` in filing-processor.ts
3. Cleaned up 23 duplicate records (91 → 68 summaries)

### Type 2: Per-User Summaries (Different tickerId, same filingUrl)

The COIN examples the user mentioned turned out to be **different users** tracking the same ticker:

| Summary ID | Ticker ID | User Email |
|------------|-----------|------------|
| 22ec34f9-... | cccf3996-... | wilfred.chen.python@gmail.com |
| 9f122f29-... | f2a636e2-... | wilfredchen1@gmail.com |

These are **not duplicates** in the current architecture - they're separate summaries for separate user subscriptions.

## Architectural Issue Discovered

The current data model creates **one summary per user per filing**, not one canonical summary shared across users:

```
User A tracks COIN → Ticker(userId=A, symbol=COIN) → Summary(tickerId=A's ticker)
User B tracks COIN → Ticker(userId=B, symbol=COIN) → Summary(tickerId=B's ticker)
```

### Current Schema

```prisma
model Ticker {
  id          String    @id
  symbol      String
  userId      String    // Each ticker belongs to ONE user
  summaries   Summary[]
  @@unique([userId, symbol])
}

model Summary {
  id        String  @id
  tickerId  String  // Belongs to one user's ticker
  filingUrl String
  @@unique([tickerId, filingUrl])  // NEW: prevents duplicates per-user
}
```

### Implications

If 100 users track TSLA:
- **Current:** 100 Summary records created for the same filing (one per user)
- **Ideal:** 1 Summary record + 100 entries in a join table

### Cost Impact

Each Summary record requires an AI call to generate. The caching logic (in filing-processor.ts around line 985-1052) checks by `ticker.symbol + filingType + filingDate`, but:

1. Cache check happens per-user processing context
2. Not clear if AI result is truly shared across users

**Need to investigate:** Is the AI being called once and cached, or called N times for N users tracking the same stock?

## Files Modified

1. `prisma/schema.prisma` - Added unique constraint and index
2. `lib/cron/filing-processor.ts` - Changed create() to upsert()
3. `prisma/migrations/20251218_fix_summary_duplicates/migration.sql` - Database migration
4. `scripts/fix-duplicate-summaries.ts` - Cleanup script (kept for future use)

## Recommended Next Steps

1. **Investigate AI caching layer** - Confirm whether AI calls are being deduplicated across users
2. **Consider schema refactor** - Move to shared summaries with user delivery tracking:
   ```prisma
   model CanonicalSummary {
     id        String @id
     filingUrl String @unique  // One summary per filing
     summaryText String
   }

   model UserSummaryDelivery {
     userId    String
     summaryId String
     sentAt    DateTime
     @@unique([userId, summaryId])
   }
   ```
3. **Audit current costs** - Compare AI spend vs number of unique filings to quantify waste

## Questions to Answer

1. How does the cache check work across different users?
2. Is `checkIfFilingProcessed()` scoped to user or global?
3. What is `SummaryCacheAccess` used for?
4. Are we paying for N AI calls for N users tracking the same stock?
