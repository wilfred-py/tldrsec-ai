---
date: 2026-01-16T08:09:32+11:00
researcher: Claude Code
git_commit: 1ca547b15f4dfae8d28880e19aace86aca67e8d9
branch: fix/8k-template-registry-gap
repository: tldrsec-ai
topic: "Summary Table Field Population Analysis for Cost/Profit Optimization"
tags: [research, codebase, summary, cost-tracking, token-optimization, database-schema, 424b2, data-extraction]
status: complete
last_updated: 2026-01-16
last_updated_by: Claude Code
last_updated_note: "Added 424B2 data extractor improvement documentation from PR #315"
---

# Research: Summary Table Field Population Analysis for Cost/Profit Optimization

**Date**: 2026-01-16T08:09:32+11:00
**Researcher**: Claude Code
**Git Commit**: 1ca547b15f4dfae8d28880e19aace86aca67e8d9
**Branch**: fix/8k-template-registry-gap
**Repository**: tldrsec-ai

## Research Question
Analysis of the Summary table schema to understand which fields are populated vs unpopulated, their purpose for cost/profit analysis, and which metrics are meaningful for optimizing AI summarization quality at the lowest cost.

## Summary
The Summary table contains 38 fields, but only a subset are consistently populated. The analysis reveals:
- **Well-populated fields**: `inputTokens`, `outputTokens`, `totalCost`, `modelVersion`, `promptVersion`, `metadata` (99%+ coverage)
- **Never populated fields**: `cost`, `processingTimeMs`, `secFilingId`, `tokensUsed`, `qualityScore`, `confidenceLevel` (0% coverage)
- **Partially populated**: `url` (11%), `model` (2.8%), `processingStatus` (63%)

Total AI spend tracked: **$4.40 across 411 AI-generated summaries** at an average of **$0.011 per summary**.

## Detailed Findings

### Summary Table Schema (38 Fields)

**From** [prisma/schema.prisma:92-147](prisma/schema.prisma#L92-L147):

```prisma
model Summary {
  // Core Required Fields
  id                    String   @id @default(uuid())
  tickerId              String
  filingType            String
  filingDate            DateTime
  filingUrl             String
  summaryText           String
  createdAt             DateTime @default(now())

  // AI Generation Metadata
  summaryJSON           Json?
  cost                  Float?              // NEVER POPULATED
  model                 String?             // 2.8% populated
  tokensUsed            Int?                // NEVER POPULATED
  inputTokens           Int?                // 99.3% populated
  outputTokens          Int?                // 99.3% populated
  totalCost             Float?              // 99.3% populated
  modelVersion          String?             // 97.2% populated
  promptVersion         String?             // 97.2% populated
  inputCostPerToken     Float?              // 1.7% populated
  outputCostPerToken    Float?              // 1.7% populated

  // Processing Metadata
  processingCompletedAt DateTime?           // 100% populated
  processingError       String?             // NEVER POPULATED
  processingErrorCode   String?             // Not analyzed
  processingStatus      String?             // 62.6% populated
  processingTimeMs      Int?                // NEVER POPULATED
  attempts              Int?  @default(0)
  isPartialResult       Boolean? @default(false)

  // Cache & Sharing Analytics
  isCacheHit            Boolean  @default(false)
  cacheUsageCount       Int      @default(0)
  cacheVersion          String?
  lastCacheUsed         DateTime?
  totalEmailsSent       Int      @default(0)
  uniqueUsersServed     Int      @default(0)

  // Quality Metrics (NEVER POPULATED)
  qualityScore          Float?
  confidenceLevel       Float?
  extractionSuccess     Boolean  @default(true)
  parsingErrors         Int      @default(0)

  // Cache Invalidation
  forceRefreshFlag      Boolean  @default(false)
  invalidatedBy         String?
  invalidationCount     Int      @default(0)
  invalidationReason    String?
  lastInvalidatedAt     DateTime?

  // Relationships
  secFilingId           String?             // NEVER POPULATED
  url                   String?             // 10.9% populated
  sentToUser            Boolean  @default(false)
  metadata              Json?               // 88.9% populated
}
```

### Field Population Statistics (704 Total Summaries)

| Field | Populated | Percentage | Notes |
|-------|-----------|------------|-------|
| `totalCost` | 699 | 99.3% | **PRIMARY cost field** |
| `inputTokens` | 699 | 99.3% | **Reliable** |
| `outputTokens` | 699 | 99.3% | **Reliable** |
| `modelVersion` | 684 | 97.2% | **Reliable** |
| `promptVersion` | 684 | 97.2% | **Reliable** |
| `processingCompletedAt` | 704 | 100% | **Reliable** |
| `metadata` | 626 | 88.9% | JSON with context |
| `processingStatus` | 441 | 62.6% | Partially populated |
| `url` | 77 | 10.9% | Primary doc URL |
| `model` | 20 | 2.8% | Legacy field |
| `inputCostPerToken` | 12 | 1.7% | Rarely set |
| `outputCostPerToken` | 12 | 1.7% | Rarely set |
| `cost` | 0 | 0% | **NEVER USED** |
| `processingTimeMs` | 0 | 0% | **NEVER USED** |
| `secFilingId` | 0 | 0% | **NEVER USED** |
| `tokensUsed` | 0 | 0% | **NEVER USED** |
| `qualityScore` | 0 | 0% | **NEVER USED** |
| `confidenceLevel` | 0 | 0% | **NEVER USED** |
| `processingError` | 0 | 0% | **NEVER USED** |

### Cost/Token Analytics from Production Data

**Overall Statistics (411 AI-Generated Summaries)**:
- Total Cost: **$4.40 USD**
- Average Cost per Summary: **$0.0107**
- Total Input Tokens: **13,365,944**
- Total Output Tokens: **772,384**
- Average Input Tokens: **32,521**
- Average Output Tokens: **1,879**

**Cost Breakdown by Model**:

| Model | Count | Total Cost | Avg Cost | Avg Input Tokens | Avg Output Tokens |
|-------|-------|------------|----------|------------------|-------------------|
| `x-ai/grok-4.1-fast` | 372 | $4.27 | $0.0115 | 35,044 | 1,937 |
| `x-ai/grok-4-fast` | 19 | $0.064 | $0.0034 | 9,766 | 892 |
| `null` (legacy) | 20 | $0.061 | $0.0030 | 7,204 | 1,745 |

**Cost Breakdown by Filing Type** (Top 10):

| Filing Type | Count | Total Cost | Avg Cost | Avg Input Tokens |
|-------------|-------|------------|----------|------------------|
| 424B2 | 37 | $1.59 | $0.043 | 140,331 |
| 10-K | 6 | $0.89 | $0.148 | 491,130 |
| 10-Q | 6 | $0.53 | $0.088 | 289,786 |
| 4 | 183 | $0.40 | $0.002 | 3,714 |
| DEF | 2 | $0.26 | $0.128 | 423,884 |
| 144 | 88 | $0.20 | $0.002 | 4,295 |
| 8-K | 32 | $0.16 | $0.005 | 14,936 |

### Summary Creation Locations (12 Locations)

**Primary Pipeline Handler** [lib/cron/handlers/summarize-cached-handler.ts](lib/cron/handlers/summarize-cached-handler.ts):
- Lines 250, 403: Creates summaries with full metadata
- Sets: `inputTokens`, `outputTokens`, `totalCost`, `modelVersion`, `promptVersion`, `metadata`

**Filing Processor** [lib/cron/filing-processor.ts:1333](lib/cron/filing-processor.ts#L1333):
- Primary upsert location for pipeline-generated summaries
- Sets: `summaryJSON` (contains `cost`, `inputTokens`, `outputTokens`, `validation`)
- Sets: `tokensUsed`, `cost`, `inputTokens`, `outputTokens`, `totalCost`, `modelVersion`, `processingStatus`, `processingTimeMs`

**Note**: The `cost` field at schema line 104 is different from `totalCost` at line 125. The pipeline consistently populates `totalCost` but never populates `cost`.

### Token and Cost Tracking Implementation

**Token Estimation** [lib/ai/token-counter.ts:19-25](lib/ai/token-counter.ts#L19-L25):
```typescript
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  // Approximation: 1 token ≈ 4 characters for English text
  return Math.ceil(text.length / 4);
}
```

**Cost Calculation** [lib/ai/token-counter.ts:66-126](lib/ai/token-counter.ts#L66-L126):
- Retrieves model-specific pricing from environment variables
- Default pricing for `x-ai/grok-4.1-fast`: $0.30/M input, $0.50/M output
- Returns `{ inputCost, outputCost, totalCost }`

**OpenRouter Response Extraction** [lib/ai/openrouter-client.ts:637-647](lib/ai/openrouter-client.ts#L637-L647):
```typescript
const usage = {
  inputTokens: result.usage?.prompt_tokens || 0,
  outputTokens: result.usage?.completion_tokens || 0,
};
const cost = {
  inputCost: usage.inputTokens * modelInfo.costPerInputToken,
  outputCost: usage.outputTokens * modelInfo.costPerOutputToken,
  totalCost: inputCost + outputCost
};
```

### Fields Critical for Cost/Profit Analysis

**Tier 1 - Currently Working & Essential**:
1. `totalCost` (Float) - Total AI cost in USD per summary
2. `inputTokens` (Int) - Input token count for cost attribution
3. `outputTokens` (Int) - Output token count for cost attribution
4. `modelVersion` (String) - Model identifier for pricing analysis
5. `filingType` (String) - Filing type for cost-per-filing-type analysis
6. `isCacheHit` (Boolean) - Cache effectiveness tracking (saves AI costs)
7. `cacheUsageCount` (Int) - How many users benefited from cached summary
8. `uniqueUsersServed` (Int) - User reach per summary dollar spent

**Tier 2 - Schema Exists but Not Populated**:
1. `processingTimeMs` - Would enable latency optimization
2. `cost` - Redundant with `totalCost`, should be deprecated
3. `tokensUsed` - Redundant with `inputTokens + outputTokens`
4. `inputCostPerToken` / `outputCostPerToken` - Would enable detailed cost attribution
5. `qualityScore` / `confidenceLevel` - Would enable quality-cost tradeoff analysis
6. `secFilingId` - Would enable linking to SecFiling for richer context

**Tier 3 - Not in Schema but Valuable**:
1. `costPerWord` - Derived metric: totalCost / word_count(summaryText)
2. `costPerKeyPoint` - Derived metric: totalCost / summaryJSON.keyPoints.length
3. `tokenEfficiencyRatio` - Derived metric: outputTokens / inputTokens (lower = more efficient)

### Key Metrics for Cost Optimization

**Cost Efficiency Metrics**:
```sql
-- Cost per summary by model (lower is better)
SELECT modelVersion, AVG(totalCost) as avg_cost FROM Summary GROUP BY modelVersion;

-- Token efficiency ratio (lower output/input ratio = more efficient extraction)
SELECT filingType, AVG(outputTokens::float / NULLIF(inputTokens, 0)) as efficiency
FROM Summary WHERE inputTokens > 0 GROUP BY filingType;

-- Cache hit rate (higher = better ROI on summaries)
SELECT COUNT(*) FILTER (WHERE isCacheHit = true)::float / COUNT(*) as cache_hit_rate
FROM Summary;

-- Cost per user served (lower = better value)
SELECT AVG(totalCost / NULLIF(uniqueUsersServed, 0)) as cost_per_user
FROM Summary WHERE uniqueUsersServed > 0;
```

**Quality-Cost Tradeoff** (requires populating quality fields):
```sql
-- Value metric: quality per dollar spent
SELECT modelVersion, AVG(qualityScore / NULLIF(totalCost, 0)) as value_ratio
FROM Summary WHERE qualityScore IS NOT NULL GROUP BY modelVersion;
```

## Code References

### Summary Creation Locations
- [lib/cron/handlers/summarize-cached-handler.ts:250](lib/cron/handlers/summarize-cached-handler.ts#L250) - Cache-hit summary creation
- [lib/cron/handlers/summarize-cached-handler.ts:403](lib/cron/handlers/summarize-cached-handler.ts#L403) - AI-generated summary creation
- [lib/cron/filing-processor.ts:1333](lib/cron/filing-processor.ts#L1333) - Primary upsert location
- [services/filings/database/filingDatabase.ts:263](services/filings/database/filingDatabase.ts#L263) - Enhanced analytics upsert

### Cost Tracking Implementation
- [lib/ai/token-counter.ts:66-126](lib/ai/token-counter.ts#L66-L126) - Cost calculation function
- [lib/ai/openrouter-client.ts:637-647](lib/ai/openrouter-client.ts#L637-L647) - Token/cost extraction from API
- [lib/monitoring/cost-monitor.ts:102-195](lib/monitoring/cost-monitor.ts#L102-L195) - API call cost tracking
- [lib/ai/cost-tracker.ts:290-339](lib/ai/cost-tracker.ts#L290-L339) - Cost storage (planned feature)

### Pipeline Flow
- [app/api/cron/tier-aware/route.ts:45](app/api/cron/tier-aware/route.ts#L45) - Pipeline entry point
- [lib/cron/filing-processor.ts:548](lib/cron/filing-processor.ts#L548) - Single filing processing
- [services/filing/summaryGenerationService.ts:117](services/filing/summaryGenerationService.ts#L117) - AI summary generation

## Architecture Documentation

### Data Flow for Cost Metrics
```
1. OpenRouter API Response
   └── result.usage.prompt_tokens → inputTokens
   └── result.usage.completion_tokens → outputTokens
   └── modelInfo.costPerToken × tokens → cost calculations

2. Summary Creation (filing-processor.ts:1333)
   └── inputTokens → Summary.inputTokens
   └── outputTokens → Summary.outputTokens
   └── totalCost → Summary.totalCost
   └── model → Summary.modelVersion

3. Missing Populations (should flow but don't):
   └── processingTimeMs (calculated but not stored)
   └── secFilingId (available but not linked)
   └── qualityScore (validation exists but not stored)
```

### Model Pricing Configuration
```typescript
// lib/ai/config.ts:80-90
const PRICING = {
  'x-ai/grok-4.1-fast': { input: 0.30, output: 0.50 }, // per million tokens
  'x-ai/grok-4-fast': { input: 0.20, output: 1.50 },
  'x-ai/grok-3': { input: 0.15, output: 0.25 }
};
```

## Summary of Field Population Gaps

### Fields That Should Be Populated but Aren't

1. **`cost`** - Legacy field, use `totalCost` instead
2. **`tokensUsed`** - Use `inputTokens + outputTokens` instead
3. **`processingTimeMs`** - Value is calculated at [filing-processor.ts:1386](lib/cron/filing-processor.ts#L1386) but set to 0
4. **`secFilingId`** - SecFiling records exist but aren't linked
5. **`qualityScore`** - Validation scores calculated but not persisted
6. **`confidenceLevel`** - Same as qualityScore
7. **`processingError`** - Errors logged but not stored in Summary
8. **`inputCostPerToken`** / **`outputCostPerToken`** - Calculated but not stored

### Recommended Priority for Population

**High Priority (Direct Cost Impact)**:
1. `processingTimeMs` - Enables latency vs cost optimization
2. `qualityScore` - Enables quality-cost tradeoff analysis
3. `secFilingId` - Enables cross-referencing with SecFiling metadata

**Medium Priority (Improved Analytics)**:
4. `inputCostPerToken` / `outputCostPerToken` - Model pricing tracking
5. `confidenceLevel` - Quality validation tracking

**Low Priority (Cleanup)**:
6. Deprecate `cost` field (use `totalCost`)
7. Deprecate `tokensUsed` field (use `inputTokens + outputTokens`)
8. Deprecate `model` field (use `modelVersion`)

## Open Questions

1. **Why is `processingTimeMs` set to 0?** - The value is calculated in the pipeline but appears to be reset before storage.

2. **Should validation scores be persisted?** - The pipeline validates summaries at [filing-processor.ts:1362-1377](lib/cron/filing-processor.ts#L1362-L1377) but these scores go into `summaryJSON` rather than dedicated fields.

3. **Is `cost` vs `totalCost` intentional redundancy?** - Both fields exist in schema but only `totalCost` is populated.

4. **How to implement quality-cost optimization?** - Need to populate `qualityScore` and `confidenceLevel` fields from existing validation logic.

---

## Recent Improvement: 424B2 Data Extractor (PR #315)

**Commit**: [2d823d8](https://github.com/wilfred-py/tldrsec-ai/commit/2d823d82354409e24a7c8aed82153e64771ad4a2)
**Date**: 2026-01-09
**PR**: #315 - Complete Phase 5: Add SEC filing extractors for SC 13G, SC 13D, and 424B2

### Context: 424B2 Cost Impact

424B2 filings (Prospectus Supplements) are the **highest cost filing type** in production:
- **37 summaries** generated
- **$1.59 total cost** (36% of all AI spend)
- **$0.043 avg cost per summary** (4x the average)
- **140,331 avg input tokens** (4x the average)

### 424B2 Data Extractor Implementation

A dedicated data extractor was implemented at [lib/email/424b2-data-extractor.ts](lib/email/424b2-data-extractor.ts) (~424 lines) to validate and enrich AI output for prospectus supplements.

**Extracted Fields** (`Form424B2ExtractedData` interface):
```typescript
interface Form424B2ExtractedData {
  offeringType?: string;      // Debt/Equity/Structured Notes
  offeringAmount?: string;    // e.g., "$2B", "$500M"
  interestRate?: string;      // e.g., "5.25%"
  maturityDate?: string;      // e.g., "March 15, 2034"
  sharesOffered?: string;     // For equity offerings
  pricePerShare?: string;     // For equity offerings
  linkedTo?: string;          // For structured notes (e.g., "S&P 500 Index")
  settlementDate?: string;
  useOfProceeds?: string;
  underwriters: string[];     // e.g., ["Goldman Sachs", "Morgan Stanley"]
}
```

**Extraction Patterns Supported**:

1. **Offering Type Detection**:
   - Senior/Subordinated Notes/Bonds
   - Fixed/Floating Rate Notes
   - Equity - Common Stock
   - Structured Notes

2. **Offering Amount Parsing**:
   - Markdown format: `**Offering Amount**: $2,000,000,000`
   - Principal amount: `$2,000,000,000 aggregate principal amount`
   - Billion/Million shorthand: `$2 billion` → `$2B`
   - Gross proceeds: `gross proceeds of approximately $2.5 billion`

3. **Interest Rate Extraction**:
   - Rate patterns: `5.25% Senior Notes`, `coupon of 5.25%`, `bearing interest at 5.25%`
   - Per annum: `5.25% per annum`

4. **Maturity Date Parsing**:
   - Full date: `due March 15, 2034`
   - ISO format: `matures on 2034-03-15`
   - Month-Year only: `maturity date of March 2034`

5. **Underwriter Recognition**:
   - Known underwriters: Goldman Sachs, Morgan Stanley, JPMorgan, Bank of America, Citigroup, Barclays, etc.
   - Section extraction from markdown

### Cost Optimization Potential

With the 424B2 extractor in place, the system can:
1. **Validate AI output** - Ensure critical fields like `offeringAmount`, `interestRate` are extracted correctly
2. **Fill gaps** - When AI returns sparse data, extractor fills in from raw text
3. **Quality tracking** - Fill rate metrics track AI accuracy vs extractor contribution

**Observed fill rates** (from Phase 3 integration testing):
- 10-K: 25% fill rate (financialHighlights)
- 10-Q: 25% fill rate (guidanceUpdates)
- 8-K: 71% fill rate (eventType, itemNumbers, keyHighlights)

### Related Extractors in Phase 5

| Filing Type | Extractor | Lines | Test Coverage |
|-------------|-----------|-------|---------------|
| SC 13G | [lib/email/sc13g-data-extractor.ts](lib/email/sc13g-data-extractor.ts) | ~248 | 15 tests |
| SC 13D | [lib/email/sc13d-data-extractor.ts](lib/email/sc13d-data-extractor.ts) | ~355 | 17 tests |
| 424B2 | [lib/email/424b2-data-extractor.ts](lib/email/424b2-data-extractor.ts) | ~424 | 16 tests |

### Extractor Registry Integration

The extractor registry at [lib/email/extractor-registry.ts](lib/email/extractor-registry.ts) now supports **16 form types**:
- 10-K, 10-Q, 8-K, Form 4, Form 144
- S-1, S-3, DEF 14A, Form 11-K
- SC 13G, SC 13D, 424B2
- Plus aliases (e.g., "SC13G", "13G", "SC 13G" all map to SC 13G extractor)

### Impact on Summary Quality

The extractor framework provides:
1. **mergeWithFallback** - AI wins conflicts, extractor fills gaps
2. **logDataDiscrepancies** - Monitor AI quality vs ground truth
3. **calculateFillRate** - Track extractor contribution metrics

This enables future quality-cost optimization by measuring how much the AI extracts correctly vs how much the extractor must fill in.
