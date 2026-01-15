# Summary Table Field Population Optimization

**Date**: 2026-01-16T08:53:39+11:00
**Git Commit**: 28bcf0d37674e097fdfa79a955d854a3b33cacd1
**Branch**: fix/8k-template-registry-gap
**Repository**: tldrsec-ai

## Overview

This plan addresses the gap between the Summary table schema (38 fields) and actual field population. The research document identified that critical cost/profit analysis fields are either never populated or inconsistently populated despite the data being available in the pipeline.

## Applying Elon's 5-Step Engineering Algorithm

### Step 1: Question Every Requirement

From the research document, 8 fields are identified as unpopulated:

| Field | Research Recommendation | Questioning |
|-------|------------------------|-------------|
| `processingTimeMs` | High Priority | **KEEP** - Value is calculated but not stored. Simple fix. |
| `qualityScore` | High Priority | **QUESTION** - What decisions would this enable? |
| `confidenceLevel` | Medium Priority | **DELETE** - Redundant with qualityScore. Pick one. |
| `secFilingId` | High Priority | **QUESTION** - SecFiling records exist but are they useful? |
| `inputCostPerToken` | Medium Priority | **DELETE** - Can derive from totalCost/inputTokens |
| `outputCostPerToken` | Medium Priority | **DELETE** - Can derive from totalCost/outputTokens |
| `cost` | Low Priority (deprecate) | **DELETE** - Redundant with totalCost |
| `tokensUsed` | Low Priority (deprecate) | **DELETE** - Redundant with inputTokens+outputTokens |

### Step 2: Delete Unnecessary Parts

**DELETED from scope:**
1. ❌ `inputCostPerToken` / `outputCostPerToken` - These can be derived from existing data when needed. No point storing calculated values.
2. ❌ `confidenceLevel` - Redundant with qualityScore. One quality metric is enough.
3. ❌ Schema deprecation of `cost`, `tokensUsed`, `model` - Out of scope. Existing data works fine.
4. ❌ `secFilingId` linking - After investigation, SecFiling records are created during discovery but the linkage would require significant pipeline changes for marginal benefit.

**RETAINED (minimum viable):**
1. ✅ `processingTimeMs` - Already calculated, just not stored. One-line fix.
2. ✅ `qualityScore` - Validation logic already calculates this, just not persisted.

### Step 3: Simplify and Optimize

The simplest approach:
1. **processingTimeMs**: Pass through `summaryResult.processingTime` which already exists from `generateAISummary()`
2. **qualityScore**: Extract overall score from existing validation in `summaryJSON.validation` and populate dedicated field

### Step 4: Accelerate Cycle Time

Two small, independent phases:
- Phase 1: Fix `processingTimeMs` (10 minutes)
- Phase 2: Fix `qualityScore` (30 minutes)

### Step 5: Automate

Both fixes are automatic - once implemented, all future summaries will have these fields populated.

## Current State Analysis

### What Exists Now

**Data Flow for processingTimeMs:**
```
generateAISummary() [line 146-310]
├── const startTime = Date.now()                    // Line 146
├── [AI processing happens]
├── const executionTime = Date.now() - startTime    // Line 278
└── return { processingTime: executionTime }        // Line 307 ✅ RETURNED

Filing Processor [line 1333-1424]
├── receives summaryResult.processingTime           // Available
└── processingTimeMs: summaryResult.processingTime || 0  // Line 1386 - SET BUT SHOWS AS 0%
```

**Root Cause**: The summarize-cached-handler.ts paths (lines 250, 403) do NOT set `processingTimeMs` despite calculating `summarizeDuration` locally.

**Data Flow for qualityScore:**
```
filing-processor.ts [line 1356-1367]
├── summaryJSON: {
│     validation: {
│       isValid: true,
│       confidenceScore: 0.85,    // ✅ CALCULATED
│       accuracyScore: 0.90,      // ✅ CALCULATED
│       completenessScore: 0.88,  // ✅ CALCULATED
│       relevanceScore: 0.92     // ✅ CALCULATED
│     }
│   }
└── qualityScore: NOT SET         // ❌ FIELD EXISTS BUT UNUSED
```

### Key Discoveries

1. **processingTimeMs in summarize-cached-handler.ts**: The handler calculates `summarizeDuration` (line 388) but stores it in `metadata.summarizeDuration` instead of the dedicated `processingTimeMs` field.

2. **qualityScore from validation**: The validation scores exist in `summaryJSON.validation` but the average is never extracted to the `qualityScore` field.

3. **Two main Summary creation paths**:
   - `lib/cron/handlers/summarize-cached-handler.ts:250` (shared summary reuse)
   - `lib/cron/handlers/summarize-cached-handler.ts:403` (new AI summary)

   Both need to populate `processingTimeMs` and `qualityScore`.

## Desired End State

After implementation:
- **100% of new AI summaries** will have `processingTimeMs` populated with actual processing duration
- **100% of new AI summaries** will have `qualityScore` populated (0.0-1.0 scale)
- Existing summaries remain unchanged (no backfill needed)

### Verification

```sql
-- Verify processingTimeMs population
SELECT COUNT(*) FILTER (WHERE "processingTimeMs" > 0) * 100.0 / COUNT(*) as pct
FROM "Summary" WHERE "createdAt" > '2026-01-16';
-- Expected: 95%+ (cache hits may have 0)

-- Verify qualityScore population
SELECT COUNT(*) FILTER (WHERE "qualityScore" IS NOT NULL) * 100.0 / COUNT(*) as pct
FROM "Summary" WHERE "createdAt" > '2026-01-16';
-- Expected: 90%+ for AI-generated summaries
```

## What We're NOT Doing

1. **NOT** populating `secFilingId` - Would require pipeline restructuring
2. **NOT** populating `inputCostPerToken`/`outputCostPerToken` - Derivable from existing data
3. **NOT** populating `confidenceLevel` - Using `qualityScore` instead
4. **NOT** deprecating legacy fields (`cost`, `tokensUsed`, `model`) - Working fine
5. **NOT** backfilling existing records - Focus on new records only
6. **NOT** modifying schema - Using existing fields

## Implementation Approach

Two independent phases with TDD approach. Each phase is small and self-contained.

---

## Phase 1: Populate processingTimeMs Field

### Overview
Add `processingTimeMs` to Summary creation in summarize-cached-handler.ts. The value is already calculated as `summarizeDuration`.

### Step 1.1: 🔴 Write Failing Tests

**Test File**: `__tests__/cron/handlers/summarize-cached-handler-fields.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '@/lib/db';

describe('summarize-cached-handler field population', () => {
  describe('processingTimeMs', () => {
    it('should populate processingTimeMs for new AI summaries', async () => {
      // Arrange: Create a test ticker and filing scenario
      // This test will verify the field is set after summarization

      // Query the most recent summary created by the handler
      const recentSummary = await prisma.summary.findFirst({
        where: {
          createdAt: { gte: new Date(Date.now() - 60000) },
          isCacheHit: false // New AI summary, not shared
        },
        orderBy: { createdAt: 'desc' }
      });

      // Assert: processingTimeMs should be populated
      if (recentSummary) {
        expect(recentSummary.processingTimeMs).toBeGreaterThan(0);
      }
    });

    it('should set processingTimeMs to 0 for shared/cached summaries', async () => {
      // Shared summaries have no processing time (reused content)
      const cachedSummary = await prisma.summary.findFirst({
        where: {
          isCacheHit: true
        },
        orderBy: { createdAt: 'desc' }
      });

      if (cachedSummary) {
        expect(cachedSummary.processingTimeMs).toBe(0);
      }
    });
  });
});
```

**Checkpoint 1.1**: Run tests to verify they fail (field not populated):
```bash
npm run test -- --testPathPattern="summarize-cached-handler-fields"
# Expected: Tests fail because processingTimeMs is null/undefined
```

### Step 1.2: 🟢 Implement to Pass Tests

#### 1.2.1 Update Shared Summary Creation (Line 250)

**File**: `lib/cron/handlers/summarize-cached-handler.ts`
**Location**: Line 250-286 (shared summary reuse)
**Changes**: Add `processingTimeMs: 0` for cached summaries

```typescript
// At line 263, add:
processingTimeMs: 0,  // Cached summary - no AI processing time
```

**Checkpoint 1.2.1**: Partial implementation complete

#### 1.2.2 Update New AI Summary Creation (Line 403)

**File**: `lib/cron/handlers/summarize-cached-handler.ts`
**Location**: Line 403-434 (new AI summary)
**Changes**: Add `processingTimeMs: summarizeDuration`

```typescript
// At line 416, add:
processingTimeMs: summarizeDuration,  // AI processing duration in ms
```

**Checkpoint 1.2.2**: Run tests:
```bash
npm run test -- --testPathPattern="summarize-cached-handler-fields"
# Expected: Tests pass
```

### Step 1.3: 🔵 Refactor

- [ ] Ensure consistent naming (`summarizeDuration` vs `processingTimeMs`)
- [ ] Add JSDoc comment explaining the field

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [ ] Tests pass: `npm run test -- --testPathPattern="summarize-cached-handler-fields"`
- [ ] Type checking: `npm run build`
- [ ] Linting: `npm run lint`
- [ ] Full test suite: `npm run test`

#### Manual Verification:
- [ ] Trigger a real filing summary via cron
- [ ] Query database to verify `processingTimeMs > 0` for new summary
- [ ] Verify cached/shared summaries have `processingTimeMs = 0`

**STOP**: Await manual confirmation before Phase 2.

---

## Phase 2: Populate qualityScore Field

### Overview
Extract overall quality score from validation results and populate the `qualityScore` field.

### Step 2.1: 🔴 Write Failing Tests

**Test File**: `__tests__/cron/handlers/summarize-cached-handler-quality.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '@/lib/db';

describe('summarize-cached-handler quality scoring', () => {
  describe('qualityScore', () => {
    it('should populate qualityScore between 0 and 1 for AI summaries', async () => {
      const recentSummary = await prisma.summary.findFirst({
        where: {
          createdAt: { gte: new Date(Date.now() - 60000) },
          isCacheHit: false
        },
        orderBy: { createdAt: 'desc' }
      });

      if (recentSummary) {
        expect(recentSummary.qualityScore).toBeGreaterThanOrEqual(0);
        expect(recentSummary.qualityScore).toBeLessThanOrEqual(1);
      }
    });

    it('should calculate qualityScore as average of validation scores', async () => {
      const recentSummary = await prisma.summary.findFirst({
        where: {
          createdAt: { gte: new Date(Date.now() - 60000) },
          summaryJSON: { not: null }
        },
        orderBy: { createdAt: 'desc' }
      });

      if (recentSummary && recentSummary.summaryJSON) {
        const json = recentSummary.summaryJSON as { validation?: {
          confidenceScore?: number;
          accuracyScore?: number;
          completenessScore?: number;
          relevanceScore?: number;
        }};

        if (json.validation) {
          const scores = [
            json.validation.confidenceScore,
            json.validation.accuracyScore,
            json.validation.completenessScore,
            json.validation.relevanceScore
          ].filter((s): s is number => typeof s === 'number');

          if (scores.length > 0) {
            const expectedAvg = scores.reduce((a, b) => a + b, 0) / scores.length;
            expect(recentSummary.qualityScore).toBeCloseTo(expectedAvg, 2);
          }
        }
      }
    });

    it('should set qualityScore to null when no validation data', async () => {
      // Summaries without validation should have null qualityScore
      const summaryWithoutValidation = await prisma.summary.findFirst({
        where: {
          summaryJSON: null
        }
      });

      if (summaryWithoutValidation) {
        expect(summaryWithoutValidation.qualityScore).toBeNull();
      }
    });
  });
});
```

**Checkpoint 2.1**: Run tests to verify they fail:
```bash
npm run test -- --testPathPattern="summarize-cached-handler-quality"
# Expected: Tests fail because qualityScore is null
```

### Step 2.2: 🟢 Implement to Pass Tests

#### 2.2.1 Create Quality Score Calculator Utility

**File**: `lib/utils/quality-score.ts` (NEW)

```typescript
/**
 * Calculate overall quality score from validation results
 * @param validation Validation object with individual scores
 * @returns Quality score between 0 and 1, or null if no scores available
 */
export function calculateQualityScore(validation: {
  confidenceScore?: number;
  accuracyScore?: number;
  completenessScore?: number;
  relevanceScore?: number;
} | null | undefined): number | null {
  if (!validation) return null;

  const scores = [
    validation.confidenceScore,
    validation.accuracyScore,
    validation.completenessScore,
    validation.relevanceScore
  ].filter((s): s is number => typeof s === 'number' && s >= 0 && s <= 1);

  if (scores.length === 0) return null;

  return scores.reduce((a, b) => a + b, 0) / scores.length;
}
```

**Checkpoint 2.2.1**: Utility created

#### 2.2.2 Update New AI Summary Creation (Line 403)

**File**: `lib/cron/handlers/summarize-cached-handler.ts`

Add import at top:
```typescript
import { calculateQualityScore } from '@/lib/utils/quality-score';
```

At line 416 (in the Summary.create data object), add:
```typescript
qualityScore: calculateQualityScore(summaryResult.data?.validation),
```

**Checkpoint 2.2.2**: Run tests:
```bash
npm run test -- --testPathPattern="summarize-cached-handler-quality"
# Expected: Tests pass
```

### Step 2.3: 🔵 Refactor

- [ ] Add unit tests for `calculateQualityScore` utility
- [ ] Add JSDoc comments
- [ ] Consider edge cases (all scores 0, mixed valid/invalid)

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [ ] Tests pass: `npm run test -- --testPathPattern="summarize-cached-handler-quality"`
- [ ] Type checking: `npm run build`
- [ ] Linting: `npm run lint`
- [ ] Full test suite: `npm run test`

#### Manual Verification:
- [ ] Trigger a real filing summary via cron
- [ ] Query database to verify `qualityScore` is populated (0.0-1.0)
- [ ] Verify qualityScore matches average of validation scores in summaryJSON

**STOP**: Implementation complete. Run full verification suite.

---

## Testing Strategy

### TDD Test Design Principles

1. **One Assertion Per Test**: Each test verifies one specific behavior
2. **Descriptive Names**: "should [verb] when [condition]" pattern
3. **Arrange-Act-Assert**: Clear structure
4. **Test Behavior**: Focus on outputs, not internals
5. **Edge Cases**: Handle null/undefined validation data

### Test Categories

#### Unit Tests (calculateQualityScore utility)
```typescript
describe('calculateQualityScore', () => {
  it('should return null for null input', () => {});
  it('should return null for empty validation', () => {});
  it('should return average of available scores', () => {});
  it('should ignore invalid scores', () => {});
  it('should handle single score', () => {});
});
```

#### Integration Tests (Handler behavior)
```typescript
describe('summarize-cached-handler', () => {
  it('should populate processingTimeMs for new AI summaries', () => {});
  it('should populate qualityScore when validation exists', () => {});
});
```

### Manual Testing Steps

1. Trigger cron: `curl -H "Authorization: Bearer $CRON_SECRET" https://tldrsec.app/api/cron/tier-aware`
2. Query recent summaries:
   ```sql
   SELECT id, "processingTimeMs", "qualityScore", "isCacheHit", "createdAt"
   FROM "Summary"
   WHERE "createdAt" > NOW() - INTERVAL '1 hour'
   ORDER BY "createdAt" DESC
   LIMIT 10;
   ```
3. Verify non-null values for AI-generated summaries

## Performance Considerations

- **Zero impact**: Adding two fields to existing create/update operations
- **No additional queries**: Values already available in scope
- **No backfill needed**: Only affects new summaries

## Migration Notes

No database migration required - fields already exist in schema but are unpopulated.

## Success Criteria Summary

### Automated Verification
- [ ] `npm run test` - All tests pass
- [ ] `npm run lint` - No linting errors
- [ ] `npm run build` - Build succeeds
- [ ] `npm run test:e2e` - E2E tests pass

### Manual Verification
- [ ] New AI summaries have `processingTimeMs > 0`
- [ ] Cached summaries have `processingTimeMs = 0`
- [ ] New AI summaries have `qualityScore` between 0-1
- [ ] Quality score matches validation average

## References

- Research document: [thoughts/shared/research/2026-01-16-summary-table-field-analysis.md](../../thoughts/shared/research/2026-01-16-summary-table-field-analysis.md)
- Summary schema: [prisma/schema.prisma:92-147](../../prisma/schema.prisma#L92-L147)
- Handler implementation: [lib/cron/handlers/summarize-cached-handler.ts](../../lib/cron/handlers/summarize-cached-handler.ts)
- Validation service: [lib/validation/summary-content-validator.ts](../../lib/validation/summary-content-validator.ts)
