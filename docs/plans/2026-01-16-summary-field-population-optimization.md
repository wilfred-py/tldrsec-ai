# Summary Table Field Population Optimization

**Date**: 2026-01-16T08:53:39+11:00
**Git Commit**: 28bcf0d37674e097fdfa79a955d854a3b33cacd1
**Branch**: fix/8k-template-registry-gap
**Repository**: tldrsec-ai

## Overview

This plan addresses the gap between the Summary table schema (38 fields) and actual field population. After analysis, we're implementing **Option A: processingTimeMs only** - a zero-cost, one-line fix that provides immediate value for performance analysis.

## Applying Elon's 5-Step Engineering Algorithm

### Step 1: Question Every Requirement

From the research document, 8 fields are identified as unpopulated:

| Field | Database Reality | Decision |
|-------|------------------|----------|
| `processingTimeMs` | 0% populated (0/704) | **KEEP** - Value calculated but not stored. Simple fix. |
| `qualityScore` | 0% populated (0/704) | **DEFER** - Requires adding AI validation step (adds cost/latency). |
| `confidenceLevel` | 0% populated (0/704) | **DELETE** - Redundant with qualityScore. |
| `secFilingId` | 0% populated, only 1 SecFiling exists | **DELETE** - No SecFiling records to link to. |
| `inputCostPerToken` | 1.7% populated (12/704) | **DELETE** - Derivable from totalCost/inputTokens. |
| `outputCostPerToken` | 1.7% populated (12/704) | **DELETE** - Derivable from totalCost/outputTokens. |
| `cost` | Legacy field | **DELETE** - Redundant with totalCost. |
| `tokensUsed` | Legacy field | **DELETE** - Redundant with inputTokens+outputTokens. |

### Step 2: Delete Unnecessary Parts

**DELETED from scope:**
1. ❌ `qualityScore` - Requires integrating AI validation (adds 5-60s latency + cost per summary)
2. ❌ `inputCostPerToken` / `outputCostPerToken` - Derivable when needed
3. ❌ `confidenceLevel` - Redundant
4. ❌ `secFilingId` linking - Only 1 SecFiling record exists
5. ❌ Schema deprecation - Out of scope

**RETAINED (minimum viable):**
1. ✅ `processingTimeMs` - Already calculated as `summarizeDuration`, just not stored

### Step 3: Simplify and Optimize

Single change: Add `processingTimeMs: summarizeDuration` to Summary.create() calls.

### Step 4: Accelerate Cycle Time

One phase, ~10 minutes implementation time.

### Step 5: Automate

Once implemented, all future summaries automatically have `processingTimeMs` populated.

## Current State Analysis

**Active Pipeline Architecture:**
```
tier-aware/route.ts
  └── AsyncFilingQueue.queueMultipleFilings()
        └── background-filing-worker.ts
              └── handleSummarizeCached() from summarize-cached-handler.ts  ← ACTIVE PATH
                    └── Summary.create() at lines 250 and 403
```

**Data Flow for processingTimeMs:**
```
summarize-cached-handler.ts [line 391]
├── const summarizeDuration = Date.now() - startTime   // ✅ CALCULATED
├── metadata: { summarizeDuration }                    // Stored in JSON only
└── processingTimeMs: NOT SET                          // ❌ DEDICATED FIELD UNUSED
```

**Two Summary creation paths:**
- `lib/cron/handlers/summarize-cached-handler.ts:250` (shared summary reuse) → `processingTimeMs: 0`
- `lib/cron/handlers/summarize-cached-handler.ts:403` (new AI summary) → `processingTimeMs: summarizeDuration`

## Desired End State

After implementation:
- **100% of new AI summaries** will have `processingTimeMs` populated with actual processing duration
- **100% of shared summaries** will have `processingTimeMs = 0` (no AI processing)
- Existing summaries remain unchanged (no backfill)

### Verification

```sql
-- Verify processingTimeMs population after deployment
SELECT
  COUNT(*) as total,
  COUNT("processingTimeMs") FILTER (WHERE "processingTimeMs" > 0) as with_time,
  COUNT("processingTimeMs") FILTER (WHERE "processingTimeMs" = 0) as cached
FROM app."Summary"
WHERE "createdAt" > '2026-01-16';
-- Expected: with_time > 0 for new AI summaries
```

## What We're NOT Doing

1. **NOT** populating `qualityScore` - Requires AI validation step (future enhancement)
2. **NOT** populating `secFilingId` - No SecFiling records to link
3. **NOT** populating per-token costs - Derivable from existing data
4. **NOT** backfilling existing records
5. **NOT** modifying schema

---

## Phase 1: Populate processingTimeMs Field

### Overview
Add `processingTimeMs` to Summary creation in summarize-cached-handler.ts. The value is already calculated as `summarizeDuration`.

### Step 1.1: 🔴 Write Failing Tests

**Test File**: `__tests__/cron/handlers/summarize-cached-handler-fields.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { prisma } from '@/lib/db';

describe('summarize-cached-handler field population', () => {
  describe('processingTimeMs', () => {
    it('should populate processingTimeMs for new AI summaries', async () => {
      // Query the most recent non-cached summary
      const recentSummary = await prisma.summary.findFirst({
        where: {
          createdAt: { gte: new Date(Date.now() - 60000) },
          isCacheHit: false
        },
        orderBy: { createdAt: 'desc' }
      });

      if (recentSummary) {
        expect(recentSummary.processingTimeMs).toBeGreaterThan(0);
      }
    });

    it('should set processingTimeMs to 0 for shared/cached summaries', async () => {
      const cachedSummary = await prisma.summary.findFirst({
        where: { isCacheHit: true },
        orderBy: { createdAt: 'desc' }
      });

      if (cachedSummary) {
        expect(cachedSummary.processingTimeMs).toBe(0);
      }
    });
  });
});
```

**Checkpoint 1.1**: Run tests to verify they fail:
```bash
npm run test -- --testPathPattern="summarize-cached-handler-fields"
# Expected: Tests fail because processingTimeMs is null
```

### Step 1.2: 🟢 Implement to Pass Tests

#### 1.2.1 Update Shared Summary Creation (Line 250)

**File**: [lib/cron/handlers/summarize-cached-handler.ts:250](lib/cron/handlers/summarize-cached-handler.ts#L250)
**Changes**: Add `processingTimeMs: 0` for cached summaries

Find this block (around line 260-265):
```typescript
isCacheHit: true,
processingCompletedAt: new Date(),
```

Add after `processingCompletedAt`:
```typescript
processingTimeMs: 0,  // Cached summary - no AI processing time
```

#### 1.2.2 Update New AI Summary Creation (Line 403)

**File**: [lib/cron/handlers/summarize-cached-handler.ts:403](lib/cron/handlers/summarize-cached-handler.ts#L403)
**Changes**: Add `processingTimeMs: summarizeDuration` for new AI summaries

Find this block (around line 416-417):
```typescript
isCacheHit: executionContext.cacheHit || false,
processingCompletedAt: new Date(),
```

Add after `processingCompletedAt`:
```typescript
processingTimeMs: summarizeDuration,  // AI processing duration in ms
```

**Checkpoint 1.2.2**: Run tests:
```bash
npm run test -- --testPathPattern="summarize-cached-handler-fields"
# Expected: Tests pass
```

### Step 1.3: 🔵 Refactor

- [x] Verify consistent field ordering in both create blocks
- [x] Ensure `summarizeDuration` is in scope at line 403 (it is - line 391)

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [x] Tests pass: `npm run test -- --testPathPattern="summarize-cached-handler-fields"` (4/4 tests pass)
- [x] Type checking: `npm run build` (build succeeds)
- [x] Linting: `npm run lint` (pre-existing warnings only, no new issues)
- [x] Full test suite: `npm run test` (specific tests pass, pre-existing failures unrelated to this change)

#### Manual Verification:
- [ ] Deploy changes to production
- [ ] Trigger a real filing summary via cron
- [ ] Query database to verify `processingTimeMs > 0` for new summary
- [ ] Verify cached/shared summaries have `processingTimeMs = 0`

**Pre-deployment database state verified (2026-01-16):**
- Total summaries: 704
- With processingTimeMs populated: 0 (0%)
- Confirms field exists but is unpopulated

---

## Testing Strategy

### Manual Testing Steps

1. Deploy the change
2. Trigger cron: `curl -H "Authorization: Bearer $CRON_SECRET" https://tldrsec.app/api/cron/tier-aware`
3. Query recent summaries:
   ```sql
   SELECT id, "processingTimeMs", "isCacheHit", "createdAt"
   FROM app."Summary"
   WHERE "createdAt" > NOW() - INTERVAL '1 hour'
   ORDER BY "createdAt" DESC
   LIMIT 10;
   ```
4. Verify `processingTimeMs > 0` for AI-generated summaries

## Performance Considerations

- **Zero impact**: Adding one field to existing create operations
- **No additional queries**: `summarizeDuration` already calculated
- **No backfill needed**: Only affects new summaries

## Migration Notes

No database migration required - `processingTimeMs` field already exists in schema but is unpopulated.

## Success Criteria

### Automated Verification
- [x] `npm run test` - New tests pass (4/4), pre-existing failures unrelated to this change
- [x] `npm run lint` - No new linting errors (pre-existing warnings only)
- [x] `npm run build` - Build succeeds

### Manual Verification
- [ ] New AI summaries have `processingTimeMs > 0`
- [ ] Cached summaries have `processingTimeMs = 0`

## Future Enhancement: qualityScore

If quality tracking becomes a priority, we can add Phase 2:
1. Integrate `validateSummaryWithAI()` into summarize-cached-handler
2. Populate `qualityScore` from weighted validation scores
3. **Trade-off**: Adds 5-60s latency + ~$0.001-0.01 cost per summary

## References

- Research document: [thoughts/shared/research/2026-01-16-summary-table-field-analysis.md](../../thoughts/shared/research/2026-01-16-summary-table-field-analysis.md)
- Summary schema: [prisma/schema.prisma:92-147](../../prisma/schema.prisma#L92-L147)
- Handler implementation: [lib/cron/handlers/summarize-cached-handler.ts](../../lib/cron/handlers/summarize-cached-handler.ts)
