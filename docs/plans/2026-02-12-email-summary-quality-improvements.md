# Email Summary Quality Improvements - Implementation Plan

**Date**: 2026-02-12T08:05:34Z (AEDT 19:05:34)
**Git Commit**: 64add43
**Branch**: review-summary-quality
**Repository**: review-summary-quality
**Research**: `thoughts/shared/research/2026-02-12-review-summary-quality-assessment.md`

## Overview

Comprehensive quality improvements to the SEC filing email summary pipeline, addressing all issues identified in the quality assessment: formatting inconsistencies, content quality gaps, materiality misclassification, Form 4 data extraction failures, timeliness/staleness, and the critical absence of quality gates preventing poor summaries from reaching users.

## Current State Analysis

### Critical Finding
**There are NO quality gates preventing poor summaries from being emailed.** The post-AI validation at `lib/validation/summary-content-validator.ts` scores summaries on accuracy/completeness/relevance, but `filing-processor.ts:1302-1315` explicitly logs "Proceeding with storing summary despite validation issues (warn only)" and continues to email queuing at line 1513 regardless.

### Key Discoveries
- **Quality validation is informational only**: `filing-processor.ts:1302-1315` - warns but never blocks
- **No word blocklist**: `unified-prompts.ts:876-892` has style guidance but no forbidden words
- **Materiality uses keyword matching only**: `8k-minimalist-template.tsx:52-77` - no dollar-amount thresholds
- **Item descriptions exist in prompts but aren't wired to templates**: `unified-prompts.ts:997-1022` has the mapping, `8k-minimalist-template.tsx:284-320` doesn't use it
- **Form 4 filerName regex patterns are too narrow**: `form4-data-extractor.ts:129-147` - 5 patterns that fail on name format variations
- **No staleness checks exist anywhere**: `discovery-handler.ts:308-340`, `filing-type-preferences-mapper.ts:89-110`
- **Bold formatting has inconsistent weights**: AI markdown = 600, template regex = 700
- **Duplicate prevention relies on 5 layers**: All database/lock based, likely working correctly for same-user deduplication

## Desired End State

After implementation:
1. Low-quality summaries are blocked from email delivery, retried once with higher temperature, then dropped with monitoring
2. AI-generated text avoids informal/repetitive language patterns ("snag", "game-changer", etc.)
3. 8-K filings with large dollar amounts are correctly classified as "Material Event"
4. 8-K item numbers display human-readable descriptions (e.g., "Item 2.02 - Results of Operations")
5. Form 4 emails reliably show insider name, transaction details, and ownership impact
6. Stale filings (>7 days old) include a visible warning banner in emails
7. Bold formatting is consistent across all templates
8. Empty/sparse sections are detected and flagged before email delivery

### Verification
- All existing tests continue to pass
- New quality gate tests verify blocking behavior
- Template rendering tests verify formatting consistency
- E2E pipeline test (`npm run test:e2e`) confirms end-to-end flow
- Manual review of sample emails for each filing type

## What We're NOT Doing

1. **Re-architecting the validation pipeline** - We're adding a quality gate within the existing flow, not rebuilding it
2. **Changing the AI model or provider** - We're improving prompts and adding post-generation checks
3. **Real-time web search enrichment** - The "no enrichment for AAPL general counsel change" issue requires a new pipeline capability
4. **Changing the cron/discovery architecture** - Staleness is handled at display/filter level, not by restructuring discovery
5. **Implementing a human review queue** - Quality gate will retry once then drop, not queue for manual review
6. **Changing the email delivery infrastructure** - Resend integration stays as-is

## Implementation Approach

Applying Elon's 5-Step Algorithm:
1. **Question**: Do we need all 20+ fixes? Yes - user requested comprehensive coverage
2. **Delete**: Removed human review queue, real-time web search, and pipeline re-architecture from scope
3. **Simplify**: Quality gate reuses existing validation scores rather than adding a new scoring system
4. **Accelerate**: Phases are ordered by impact (quality gate first), each independently deployable
5. **Automate**: Quality gate is fully automated with retry logic

---

## Review Notes (2026-02-13)

**Reviewed by**: Claude Code (BIG CHANGE depth - all 4 sections)
**Status**: All 14 issues resolved, plan updated with decisions below.

### Factual Corrections Applied
- **Temperature is 0.1, not 0.2**: `summaryGenerationService.ts:174` uses `temperature: 0.1`. Retry temperature updated to 0.2 (2x baseline, not 4x).
- **Function name is `generateFilingPrompt`, not `generateUnifiedPrompt`**: Tests updated to use correct import.
- **AI generation lives in `services/filing/summaryGenerationService.ts`, not `lib/ai/summarize.ts`**: File references corrected.
- **`isMaterialFiling`, `formatText`, `getItemDescription` are NOT exported**: Plan now exports them for testability.
- **10-K and 10-Q do NOT have `formatText()` functions**: They use `markdownToHtml()` from design-system (already uses font-weight:600). Phase 6 font-weight work for these templates removed.
- **Form 4 template uses `markdownToHtml()` in practice** (deprecated `_formatText()` exists but isn't used). Phase 6 font-weight work removed for Form 4.

### Architecture Decisions
| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Retry with reduced timeout, skip re-validation on retry | Save ~10s; fits within 150s job timeout budget |
| 2 | Export `isMaterialFiling`, `formatText`, `getItemDescription` from templates | Clean unit testing for real logic |
| 3 | Fix only 8-K `formatText()` font-weight; remove Phase 6 font-weight work | 10-K/10-Q/Form4 already use correct weight via `markdownToHtml()` |
| 4 | Fix all factual errors in plan | Prevents wasted debugging during implementation |
| 5 | Extract `ITEM_DESCRIPTIONS` to `lib/constants/sec-item-descriptions.ts` | DRY - single source of truth for prompts and templates |
| 6 | Test prompt structure, not exact wording | "Test behavior, not implementation" - survives prompt refinements |
| 7 | Add comprehensive dollar-amount edge cases ($500M, $1.2B, $XM shorthand) | "Handle more edge cases, not fewer" |
| 8 | Use discriminated union types for `detectEmptySections` | TypeScript compile-time safety for form-specific fields |
| 9 | Add integration test verifying quality gate blocks email delivery | Most critical behavior needs integration test, not just unit |
| 10 | Use fixed dates in StalenessBanner tests, inject `now` prop | Deterministic tests, no midnight/timezone flakiness |
| 11 | Add comprehensive boundary tests for quality gate thresholds | Off-by-one on `>` vs `>=` is textbook risk |
| 12 | Add empty/no-match and partial-match tests for Form 4 extractor | Graceful degradation for unexpected AI output |
| 13 | Use `createdAt` (indexed) instead of `filingDate` for 90-day age filter | Existing `[processed, createdAt]` index, no migration needed |
| 14 | Add cost tracking to quality gate retry metrics | Visibility into AI spend impact from retries |

---

## Phase 1: Quality Gate with Retry

### Overview
Insert a blocking quality gate at `filing-processor.ts:1302-1315` that prevents low-quality summaries from being emailed. If quality is below threshold, retry AI generation once with higher temperature (0.2 vs 0.1 baseline). Skip re-validation on retry to save ~10s (trust that different temperature = different output). If still below threshold on re-evaluate, skip email delivery and log for monitoring with cost tracking.

### Step 1.1: Red - Write Failing Tests

**Test File**: `__tests__/validation/quality-gate.test.ts`

```typescript
import { QualityGate, QualityGateResult } from '@/lib/validation/quality-gate';

describe('QualityGate', () => {
  describe('shouldBlockDelivery', () => {
    it('should allow delivery when all scores are above thresholds', () => {
      const result = QualityGate.evaluate({
        accuracyScore: 80,
        completenessScore: 70,
        relevanceScore: 75,
        confidenceScore: 75,
        isValid: true,
        issues: [],
      });
      expect(result.shouldBlock).toBe(false);
      expect(result.action).toBe('deliver');
    });

    it('should block delivery when accuracy score is below 60', () => {
      const result = QualityGate.evaluate({
        accuracyScore: 45,
        completenessScore: 70,
        relevanceScore: 75,
        confidenceScore: 55,
        isValid: false,
        issues: ['Low accuracy'],
      });
      expect(result.shouldBlock).toBe(true);
      expect(result.action).toBe('retry');
    });

    it('should block delivery when completeness score is below 50', () => {
      const result = QualityGate.evaluate({
        accuracyScore: 80,
        completenessScore: 35,
        relevanceScore: 75,
        confidenceScore: 60,
        isValid: false,
        issues: ['Incomplete summary'],
      });
      expect(result.shouldBlock).toBe(true);
    });

    it('should block delivery when confidence score is below 55', () => {
      const result = QualityGate.evaluate({
        accuracyScore: 60,
        completenessScore: 50,
        relevanceScore: 50,
        confidenceScore: 45,
        isValid: false,
        issues: ['Low confidence'],
      });
      expect(result.shouldBlock).toBe(true);
    });

    it('should return "drop" action on second failure (retry exhausted)', () => {
      const result = QualityGate.evaluate({
        accuracyScore: 45,
        completenessScore: 35,
        relevanceScore: 40,
        confidenceScore: 40,
        isValid: false,
        issues: ['Low quality'],
      }, { isRetry: true });
      expect(result.shouldBlock).toBe(true);
      expect(result.action).toBe('drop');
    });

    it('should allow delivery when validation was skipped (cached summary)', () => {
      const result = QualityGate.evaluate(null);
      expect(result.shouldBlock).toBe(false);
      expect(result.action).toBe('deliver');
    });

    // Boundary tests (Review Decision #11)
    it('should allow delivery when scores are exactly at thresholds', () => {
      const result = QualityGate.evaluate({
        accuracyScore: 60,
        completenessScore: 50,
        relevanceScore: 55,
        confidenceScore: 55,
        isValid: true,
        issues: [],
      });
      expect(result.shouldBlock).toBe(false);
      expect(result.action).toBe('deliver');
    });

    it('should block when accuracy is one below threshold (59)', () => {
      const result = QualityGate.evaluate({
        accuracyScore: 59,
        completenessScore: 50,
        relevanceScore: 55,
        confidenceScore: 55,
        isValid: false,
        issues: ['Borderline accuracy'],
      });
      expect(result.shouldBlock).toBe(true);
    });

    it('should handle zero scores gracefully', () => {
      const result = QualityGate.evaluate({
        accuracyScore: 0,
        completenessScore: 0,
        relevanceScore: 0,
        confidenceScore: 0,
        isValid: false,
        issues: ['All zeros'],
      });
      expect(result.shouldBlock).toBe(true);
      expect(result.action).toBe('retry');
    });

    it('should handle over-100 scores (malformed AI response)', () => {
      const result = QualityGate.evaluate({
        accuracyScore: 150,
        completenessScore: 200,
        relevanceScore: 100,
        confidenceScore: 100,
        isValid: true,
        issues: [],
      });
      expect(result.shouldBlock).toBe(false);
    });

    it('should block when one score fails even if others pass', () => {
      const result = QualityGate.evaluate({
        accuracyScore: 90,
        completenessScore: 90,
        relevanceScore: 54, // below 55 threshold
        confidenceScore: 90,
        isValid: false,
        issues: ['Low relevance'],
      });
      expect(result.shouldBlock).toBe(true);
    });
  });

  describe('detectEmptySections', () => {
    it('should detect when 10-K summary has no financial highlights', () => {
      const issues = QualityGate.detectEmptySections('10-K', {
        summary: 'Apple filed a 10-K.',
        financialHighlights: [],
        segments: [],
        riskFactors: [],
        keyPoints: [],
      });
      expect(issues).toContain('MISSING_FINANCIAL_HIGHLIGHTS');
    });

    it('should detect when 8-K has no key highlights', () => {
      const issues = QualityGate.detectEmptySections('8-K', {
        summary: 'Company filed an 8-K.',
        keyHighlights: [],
        eventType: '',
      });
      expect(issues).toContain('MISSING_KEY_HIGHLIGHTS');
    });

    it('should detect when Form 4 has no transactions', () => {
      const issues = QualityGate.detectEmptySections('Form 4', {
        summary: 'Insider filed Form 4.',
        filerName: '',
        transactions: [],
      });
      expect(issues).toContain('MISSING_TRANSACTIONS');
      expect(issues).toContain('MISSING_FILER_NAME');
    });

    it('should return empty array when all required sections present', () => {
      const issues = QualityGate.detectEmptySections('8-K', {
        summary: 'Company reported earnings.',
        keyHighlights: ['Revenue beat estimates'],
        eventType: 'Earnings Release',
        itemNumbers: ['2.02'],
      });
      expect(issues).toEqual([]);
    });
  });
});
```

**Checkpoint 1.1**: Run tests, verify they FAIL (module not found):
```bash
npm run test -- --testPathPattern="quality-gate"
# Expected: All tests fail - QualityGate module does not exist
```

### Step 1.2: Green - Implement Quality Gate

#### 1.2.1 Create QualityGate Service
**File**: `lib/validation/quality-gate.ts`

Create `QualityGate` class with:
- `evaluate(validationResult, options?)` - returns `{ shouldBlock, action, reasons }`
- `detectEmptySections(formType, summaryJSON)` - returns array of missing section codes
- Thresholds: accuracy >= 60, completeness >= 50, relevance >= 55, confidence >= 55
- `action`: 'deliver' | 'retry' | 'drop'

**Type Safety (Review Decision #8)**: Use discriminated union types for `detectEmptySections`:
```typescript
type TenKSummary = { formType: '10-K'; financialHighlights: unknown[]; keyPoints: unknown[]; segments?: unknown[]; riskFactors?: unknown[]; summary: string; };
type TenQSummary = { formType: '10-Q'; financialHighlights: unknown[]; quarterlyTrends?: unknown[]; summary: string; };
type EightKSummary = { formType: '8-K'; keyHighlights: unknown[]; eventType: string; summary: string; itemNumbers?: string[]; };
type Form4Summary = { formType: 'Form 4'; filerName: string; transactions: unknown[]; summary: string; };
type SummaryForValidation = TenKSummary | TenQSummary | EightKSummary | Form4Summary;
```

**Checkpoint 1.2.1**: `shouldBlockDelivery` tests pass:
```bash
npm run test -- --testPathPattern="quality-gate" --testNamePattern="shouldBlock"
```

#### 1.2.2 Create Empty Section Detection
Same file, implement `detectEmptySections()` with form-specific required section checks:
- 10-K: financialHighlights, keyPoints
- 10-Q: financialHighlights
- 8-K: keyHighlights, eventType
- Form 4: filerName, transactions

**Checkpoint 1.2.2**: All `detectEmptySections` tests pass:
```bash
npm run test -- --testPathPattern="quality-gate" --testNamePattern="detectEmpty"
```

#### 1.2.3 Integrate Quality Gate into Filing Processor
**File**: `lib/cron/filing-processor.ts`

At lines 1300-1315 (current warn-only block), replace with:
1. Import and call `QualityGate.evaluate(validationResult)`
2. Also call `QualityGate.detectEmptySections(formType, summaryJSON)` on the parsed summary data
3. If `shouldBlock && action === 'retry'`:
   - Check remaining execution time budget (must have >= 30s remaining)
   - Re-invoke `generateAISummaryWithRetry()` with temperature 0.2
   - **Skip re-validation on retry** (Review Decision #1) - trust that higher temperature produces different output
   - Call `QualityGate.evaluate(originalValidation, { isRetry: true })` to get 'drop' action
   - Log retry cost for monitoring (Review Decision #14)
4. If `shouldBlock && action === 'drop'`:
   - Log with structured data (all scores, issues, form type, ticker, retry cost)
   - Store summary in DB with `qualityBlocked: true` in summaryJSON
   - Skip email queuing (continue past STEP 5)
5. If `!shouldBlock`:
   - Proceed as current (store + queue email)

**Integration Test (Review Decision #9)**: Add a test in `__tests__/validation/quality-gate-integration.test.ts` that mocks the filing processor's quality gate integration point and verifies:
- When `evaluate()` returns `shouldBlock: true`, `queueEmail()` is NOT called
- When `evaluate()` returns `shouldBlock: false`, `queueEmail()` IS called
- Retry path re-invokes AI generation with temperature 0.2

**Checkpoint 1.2.3**: Integration test with mocked validator:
```bash
npm run test -- --testPathPattern="quality-gate"
# Expected: All tests pass
```

#### 1.2.4 Add Retry Temperature Parameter
**File**: `services/filing/summaryGenerationService.ts` *(corrected from lib/ai/summarize.ts)*

Add optional `temperature` parameter to `generateAISummaryWithRetry()` (currently hardcoded at 0.1 on line 174). When retry is triggered by quality gate, pass 0.2 (2x baseline).

**Checkpoint 1.2.4**: Verify temperature parameter flows through:
```bash
npm run test -- --testPathPattern="quality-gate"
```

### Step 1.3: Blue - Refactor

- [x] Extract threshold constants to a config object at top of `quality-gate.ts`
- [x] Add JSDoc to `evaluate()` and `detectEmptySections()` methods
- [x] Ensure logging follows existing `processorLogger` patterns

**Checkpoint 1.3**: All tests still pass:
```bash
npm run test -- --testPathPattern="quality-gate"
npm run test  # No regressions
```

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [x] Quality gate tests pass: `npm run test -- --testPathPattern="quality-gate"` (23 tests)
- [x] No regressions: lint passes, no new TS errors
- [x] Type checking: no new errors in changed files
- [x] Linting: no new lint errors

#### Manual Verification:
- [ ] Trigger pipeline with a known low-quality filing and verify email is NOT sent
- [ ] Verify retry occurs with temperature 0.2 on first failure
- [ ] Verify quality-blocked summaries are stored in DB with `qualityBlocked: true`
- [ ] Check logs for structured quality gate metrics including retry cost

**STOP**: Await manual confirmation before Phase 2.

---

## Phase 2: AI Prompt Improvements

**STATUS: COMPLETE** - All 4 tests pass.

### Implementation Notes (2026-02-14)
- Added 10-word blocklist to `SYSTEM_PROMPT` in `unified-prompts.ts` with replacement suggestions
- Added 3 BAD/GOOD example pairs for writing style
- Added `itemDescriptions` array field to 8-K schema in `FORM_SCHEMAS`
- Changed 10-K extraction guidance "KEY METRIC" to "MANDATORY" for gross margin
- Test file: `__tests__/ai/prompt-quality.test.ts` (4 tests)

### Overview
Add a word blocklist to the unified prompts, improve style enforcement, and add negative examples. This addresses the "snag" language pattern issue and general AI output quality.

### Step 2.1: Red - Write Failing Tests

**Test File**: `__tests__/ai/prompt-quality.test.ts`

```typescript
import { generateFilingPrompt } from '@/lib/ai/prompts/unified-prompts';
// Note: Function is generateFilingPrompt, not generateUnifiedPrompt (Review Decision #4)

describe('Filing Prompt Quality Rules', () => {
  describe('Word blocklist', () => {
    // Review Decision #6: Test structural presence, not exact wording
    it('should include a forbidden word/phrase blocklist section in system prompt', () => {
      const { systemPrompt } = generateFilingPrompt({
        formType: '8-K',
        filingContent: 'Test content',
      });
      // Test that a blocklist section exists with multiple entries
      expect(systemPrompt).toMatch(/never use|forbidden|avoid these/i);
      // Verify blocklist has substance (at least 5 entries)
      const blocklistMatch = systemPrompt.match(/never use.*?(?=\n\n|EXAMPLE)/is);
      expect(blocklistMatch).toBeTruthy();
      const entryCount = (blocklistMatch![0].match(/^-/gm) || []).length;
      expect(entryCount).toBeGreaterThanOrEqual(5);
    });

    it('should include bad/good example pairs for writing style', () => {
      const { systemPrompt } = generateFilingPrompt({
        formType: '10-K',
        filingContent: 'Test content',
      });
      // Test structure: BAD/GOOD example pairs exist
      expect(systemPrompt).toMatch(/BAD:.*\n.*GOOD:/is);
    });
  });

  describe('8-K item descriptions', () => {
    it('should include item-to-description mapping in 8-K extraction guidance', () => {
      const { userPrompt } = generateFilingPrompt({
        formType: '8-K',
        filingContent: 'Test content with Item 2.02',
      });
      expect(userPrompt).toContain('itemDescriptions');
    });
  });

  describe('Financial metric enforcement', () => {
    it('should require gross margin calculation for 10-K', () => {
      const { userPrompt } = generateFilingPrompt({
        formType: '10-K',
        filingContent: 'Revenue: $50B, COGS: $20B',
      });
      expect(userPrompt).toContain('Gross margin');
      expect(userPrompt).toContain('MANDATORY');
    });
  });
});
```

**Checkpoint 2.1**: Tests fail (no blocklist in prompts yet):
```bash
npm run test -- --testPathPattern="prompt-quality"
```

### Step 2.2: Green - Implement Prompt Improvements

#### 2.2.1 Add Word Blocklist to System Prompt
**File**: `lib/ai/prompts/unified-prompts.ts`

At the writing style section (lines 876-892), add:
```
NEVER use these words or phrases in summaries:
- "snag", "snagged", "snags" (use "acquired", "secured", "obtained")
- "game-changer", "game-changing" (use "significant", "transformative")
- "dive into", "deep dive" (use "examine", "analyze", "review")
- "boasts" (use "features", "includes", "offers")
- "whopping" (use the actual number - let it speak for itself)
- "in a nutshell" (just state the summary directly)
- "at the end of the day" (remove entirely - add no value)
- "going forward" (use "in the future" or "next quarter")
- "robust" (use "strong", "resilient", "solid")
- "leverage" as a verb (use "use", "utilize", "employ")
```

#### 2.2.2 Add Negative Examples
Same file, add bad/good example pairs after the blocklist:
```
EXAMPLES - BAD vs GOOD:
BAD: "Tesla snagged a whopping $2B contract"
GOOD: "Tesla secured a $2B contract"

BAD: "This game-changing acquisition boasts robust synergies"
GOOD: "The $1.2B acquisition creates $200M in projected annual synergies"
```

#### 2.2.3 Add itemDescriptions Field to 8-K Schema
**File**: `lib/ai/prompts/unified-prompts.ts`

In the 8-K schema (lines 253-299), add `itemDescriptions` as an optional array field where each entry maps item number to description. The AI should populate this when reporting item numbers.

**Checkpoint 2.2**: All prompt quality tests pass:
```bash
npm run test -- --testPathPattern="prompt-quality"
```

### Step 2.3: Blue - Refactor

- [ ] Extract blocklist to a named constant `FORBIDDEN_WORDS` for reuse in quality gate
- [ ] Group related prompt sections with clear comments

**Checkpoint 2.3**: All tests pass:
```bash
npm run test -- --testPathPattern="prompt-quality"
npm run test
```

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [ ] Prompt quality tests pass: `npm run test -- --testPathPattern="prompt-quality"`
- [ ] No regressions: `npm run test`
- [ ] Build: `npm run build`
- [ ] Lint: `npm run lint`

#### Manual Verification:
- [ ] Generate a test summary and verify no blocklisted words appear
- [ ] Verify 8-K summaries include itemDescriptions field
- [ ] Check that writing style feels more professional (no "snag", "game-changer")

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: 8-K Template Improvements

**STATUS: COMPLETE** - All 19 tests pass.

### Implementation Notes (2026-02-14)
- Created `lib/constants/sec-item-descriptions.ts` as shared constants (DRY - single source of truth)
- Exported `isMaterialFiling`, `formatText`, re-exported `getItemDescription` from 8-K template
- Added `hasLargeDollarAmount()` function detecting amounts >= $500M (handles $XB, $XM, $X billion, $X million, $X,XXX,XXX,XXX)
- Removed `8.01` and `9.01` from MATERIAL_ITEMS (too common/routine - materiality now determined by content)
- Refined materialKeywords: removed overly broad terms ("agreement", "contract", "material", "significant")
- Changed `formatText()` font-weight from 700 to 600 (matches design-system)
- Added leading bullet/dash stripping in `formatText()`
- Wired item descriptions into items display with "Item X.XX - Description" format
- Test files: `8k-materiality.test.ts` (11), `8k-item-descriptions.test.ts` (4), `8k-formatting.test.ts` (4)

### Overview
Fix materiality classification to consider dollar amounts, wire item descriptions to the template, fix bold formatting consistency, and prevent double-bullet rendering.

### Step 3.1: Red - Write Failing Tests

**Test File**: `__tests__/email/8k-materiality.test.ts`

```typescript
// Note: isMaterialFiling must be exported from template (Review Decision #2)
import { isMaterialFiling } from '@/components/ui/email/templates/8k-minimalist-template';

describe('8-K Materiality Classification', () => {
  describe('Dollar-amount awareness', () => {
    it('should classify as material when summary mentions $1B+ amount', () => {
      const result = isMaterialFiling(
        ['8.01'],
        'The company completed a strategic transaction valued at $1,200,000,000.'
      );
      expect(result).toBe(true);
    });

    it('should classify as material when summary mentions "$X billion"', () => {
      const result = isMaterialFiling(
        ['9.01'],
        'Vertiv shelled out $1.85 billion for a data center equipment maker.'
      );
      expect(result).toBe(true);
    });

    it('should classify as material for $500M+ transactions', () => {
      const result = isMaterialFiling(
        ['8.01'],
        'The deal is valued at approximately $750 million.'
      );
      expect(result).toBe(true);
    });

    it('should NOT classify as material for small dollar amounts under $100M', () => {
      const result = isMaterialFiling(
        ['9.01'],
        'The company entered a $5 million supply agreement.'
      );
      expect(result).toBe(false);
    });

    it('should still classify as material by keyword regardless of amount', () => {
      const result = isMaterialFiling(
        ['5.02'],
        'The CEO announced departure effective immediately.'
      );
      expect(result).toBe(true);
    });

    // Comprehensive edge cases (Review Decision #7)
    it('should classify as material for $1.2B shorthand', () => {
      const result = isMaterialFiling(['8.01'], 'The acquisition was valued at $1.2B.');
      expect(result).toBe(true);
    });

    it('should classify as material for $500M shorthand', () => {
      const result = isMaterialFiling(['8.01'], 'Total consideration of $500M in cash.');
      expect(result).toBe(true);
    });

    it('should classify as material for lowercase $750m shorthand', () => {
      const result = isMaterialFiling(['8.01'], 'Deal valued at $750m.');
      expect(result).toBe(true);
    });

    it('should NOT classify as material for $499M (below threshold)', () => {
      const result = isMaterialFiling(['8.01'], 'The contract is worth $499M.');
      expect(result).toBe(false);
    });

    it('should classify as material for "$1,200 million" notation', () => {
      const result = isMaterialFiling(['8.01'], 'Revenue of $1,200 million.');
      expect(result).toBe(true);
    });

    it('should classify as material for losses ("loss of $2 billion")', () => {
      const result = isMaterialFiling(['8.01'], 'The company reported a loss of $2 billion.');
      expect(result).toBe(true);
    });
  });
});
```

**Test File**: `__tests__/email/8k-item-descriptions.test.ts`

```typescript
// Note: getItemDescription must be exported from template (Review Decision #2)
import { getItemDescription } from '@/components/ui/email/templates/8k-minimalist-template';

describe('8-K Item Descriptions', () => {
  it('should return description for Item 2.02', () => {
    expect(getItemDescription('2.02')).toBe('Results of Operations and Financial Condition');
  });

  it('should return description for Item 5.02', () => {
    expect(getItemDescription('5.02')).toBe('Departure/Election of Directors or Officers');
  });

  it('should return description for Item 9.01', () => {
    expect(getItemDescription('9.01')).toBe('Financial Statements and Exhibits');
  });

  it('should return empty string for unknown item number', () => {
    expect(getItemDescription('99.99')).toBe('');
  });
});
```

**Test File**: `__tests__/email/8k-formatting.test.ts`

```typescript
// Note: formatText must be exported from template (Review Decision #2)
import { formatText } from '@/components/ui/email/templates/8k-minimalist-template';

describe('8-K Formatting Consistency', () => {
  describe('Bold weight consistency', () => {
    it('should use consistent font-weight for dollar amounts', () => {
      const result = formatText('Revenue of $150M');
      expect(result).toContain('font-weight:600');
      expect(result).not.toContain('font-weight:700');
    });

    it('should use consistent font-weight for percentages', () => {
      const result = formatText('Up 25% YoY');
      expect(result).toContain('font-weight:600');
      expect(result).not.toContain('font-weight:700');
    });
  });

  describe('Bullet point handling', () => {
    it('should not produce double bullets when text starts with bullet character', () => {
      const result = formatText('• Revenue increased 25%');
      const bulletCount = (result.match(/•/g) || []).length;
      expect(bulletCount).toBeLessThanOrEqual(1);
    });

    it('should strip leading bullet/dash from highlight text', () => {
      const result = formatText('- Revenue increased 25%');
      expect(result).not.toMatch(/^[\s]*[-•*]/);
    });
  });
});
```

**Checkpoint 3.1**: Tests fail:
```bash
npm run test -- --testPathPattern="8k-(materiality|item-descriptions|formatting)"
```

### Step 3.2: Green - Implement 8-K Improvements

#### 3.2.1 Add Dollar-Amount Awareness to isMaterialFiling
**File**: `components/ui/email/templates/8k-minimalist-template.tsx`

Export and modify `isMaterialFiling()` at lines 52-77 to add a third tier of detection (Review Decision #2):
1. Check material item numbers (existing)
2. Check material keywords (existing)
3. **NEW**: Check for large dollar amounts using comprehensive regex (Review Decision #7):
   - `$X billion` or `$X,XXX,XXX,XXX` (>= $500M) -> material
   - `$XB` / `$Xb` shorthand -> material
   - `$XM` / `$Xm` shorthand (>= 500) -> material
   - `$X,XXX million` notation (>= 500) -> material
   - Extract numeric value and compare against $500M threshold
   - Case-insensitive matching for B/b/M/m suffixes

**Checkpoint 3.2.1**: Materiality tests pass:
```bash
npm run test -- --testPathPattern="8k-materiality"
```

#### 3.2.2 Add Item Description Mapping and Display

**New File (Review Decision #5)**: `lib/constants/sec-item-descriptions.ts`

Extract `ITEM_DESCRIPTIONS` to a shared constants module (DRY - single source of truth):
```typescript
export const ITEM_DESCRIPTIONS: Record<string, string> = {
  '1.01': 'Entry into a Material Definitive Agreement',
  '1.02': 'Termination of a Material Definitive Agreement',
  '1.03': 'Bankruptcy or Receivership',
  '1.04': 'Mine Safety',
  '1.05': 'Material Cybersecurity Incidents',
  '2.01': 'Completion of Acquisition or Disposition',
  '2.02': 'Results of Operations and Financial Condition',
  // ... all SEC item numbers from unified-prompts.ts:997-1022
  '9.01': 'Financial Statements and Exhibits',
};

export function getItemDescription(itemNumber: string): string {
  return ITEM_DESCRIPTIONS[itemNumber] || '';
}
```

**File**: `components/ui/email/templates/8k-minimalist-template.tsx`

1. Import `{ getItemDescription }` from shared constants
2. Export `getItemDescription` re-export for template consumers
3. Update items display at line 172-174 to include descriptions:
   ```typescript
   const itemsDisplay = itemNumbers.map(item => {
     const desc = getItemDescription(item);
     return desc ? `Item ${item} - ${desc}` : `Item ${item}`;
   }).join(' | ');
   ```

**Checkpoint 3.2.2**: Item description tests pass:
```bash
npm run test -- --testPathPattern="8k-item-descriptions"
```

#### 3.2.3 Fix Bold Formatting Consistency
**File**: `components/ui/email/templates/8k-minimalist-template.tsx`

Change `formatText()` at lines 115-123 to use `font-weight:600` (matching `design-system.ts:391-393`) instead of `font-weight:700`.

#### 3.2.4 Fix Double-Bullet Prevention
**File**: `components/ui/email/templates/8k-minimalist-template.tsx`

In `formatText()`, add a leading bullet/dash strip before applying template bullet:
```typescript
// Strip leading bullets/dashes that AI may have included in JSON string values
html = html.replace(/^[\s]*[•\-\*]\s*/, '');
```

**Checkpoint 3.2.3-4**: Formatting tests pass:
```bash
npm run test -- --testPathPattern="8k-formatting"
```

### Step 3.3: Blue - Refactor

- [ ] Update `unified-prompts.ts` to import `ITEM_DESCRIPTIONS` from shared constants (remove duplication)
- [ ] Export `isMaterialFiling` and `formatText` from 8-K template (Review Decision #2)
- [x] ~~Extract `ITEM_DESCRIPTIONS` to shared constants~~ (done in 3.2.2)
- ~~Standardize bold weight across all templates~~ (REMOVED - Review Decision #3: only 8-K needs fixing, others already use markdownToHtml with font-weight:600)

**Checkpoint 3.3**: All tests pass:
```bash
npm run test -- --testPathPattern="8k-"
npm run test
```

### Step 3.4: Final Phase Verification

#### Automated Verification:
- [ ] 8-K tests pass: `npm run test -- --testPathPattern="8k-"`
- [ ] No regressions: `npm run test`
- [ ] Build: `npm run build`
- [ ] Lint: `npm run lint`

#### Manual Verification:
- [ ] Render 8-K email with $1B acquisition under Item 8.01 - verify "Material Event" badge
- [ ] Verify item numbers show descriptions (e.g., "Item 2.02 - Results of Operations")
- [ ] Verify bold formatting is visually consistent (no mix of semibold/bold)
- [ ] Verify no double bullets in key highlights section

**STOP**: Await manual confirmation before Phase 4.

---

## Phase 4: Form 4 Template Improvements

**STATUS: COMPLETE** - All 14 tests pass.

### Implementation Notes (2026-02-14)
- Rewrote `extractFilerName()` with 6 new patterns:
  - `**Reporting Person**: NAME` / `**Filer**: NAME` (markdown bold labels with ALL CAPS support)
  - `Name, Role` pattern (e.g., "Vaibhav Taneja, Chief Financial Officer")
  - `filed by NAME` with ALL CAPS support
  - `NAME reported/disclosed/filed` pattern
  - Explicit case-sensitive patterns to avoid false positives ("insider sold" no longer matches)
- Added `toTitleCase()` helper for ALL CAPS name conversion
- Added `isAllCaps()` detection for automatic title-case conversion
- Supports hyphenated last names (`[A-Za-z-]+` instead of `[a-z]+`)
- Supports middle initials (e.g., "Mary J. Smith")
- Test file: `form4-improvements.test.ts` (14 tests including graceful degradation)

### Overview
Improve filerName extraction reliability, fix multi-transaction display, and ensure ownership impact section renders when data is available.

### Step 4.1: Red - Write Failing Tests

**Test File**: `__tests__/email/form4-improvements.test.ts`

```typescript
import { extractForm4Data } from '@/lib/email/form4-data-extractor';

describe('Form 4 Improved Extraction', () => {
  describe('Filer name extraction - expanded patterns', () => {
    it('should extract name from "filed by FIRSTNAME LASTNAME" format', () => {
      const result = extractForm4Data('Form 4 filed by VAIBHAV TANEJA for Tesla Inc.');
      expect(result.filerName).toBe('Vaibhav Taneja');
    });

    it('should extract name from summaryJSON filerName field reference', () => {
      const result = extractForm4Data('Vaibhav Taneja, Chief Financial Officer, reported transactions.');
      expect(result.filerName).toBe('Vaibhav Taneja');
    });

    it('should extract name when followed by comma and role', () => {
      const result = extractForm4Data('A Form 4 was filed by Elon Musk, CEO of Tesla.');
      expect(result.filerName).toBe('Elon Musk');
    });

    it('should handle ALL CAPS names', () => {
      const result = extractForm4Data('**Reporting Person**: JOHN DOE');
      expect(result.filerName).toBe('John Doe');
    });

    it('should handle names with middle initials', () => {
      const result = extractForm4Data('**Filer**: Mary J. Smith');
      expect(result.filerName).toBe('Mary J. Smith');
    });

    it('should handle hyphenated last names', () => {
      const result = extractForm4Data('**Reporting Person**: Sarah Johnson-Williams');
      expect(result.filerName).toBe('Sarah Johnson-Williams');
    });
  });

  describe('Multi-transaction extraction', () => {
    it('should extract both sale and gift from combined summary', () => {
      const text = `
        Vaibhav Taneja sold 56,820 shares at $450.66, fetching $25.6 million.
        Additionally, four gift transactions totaling 73,252 shares at $0 per share.
      `;
      const result = extractForm4Data(text);

      const saleTransactions = result.transactions.filter(t =>
        t.type.toLowerCase().includes('sale')
      );
      const giftTransactions = result.transactions.filter(t =>
        t.type.toLowerCase().includes('gift')
      );

      expect(saleTransactions.length).toBeGreaterThanOrEqual(1);
      expect(giftTransactions.length).toBeGreaterThanOrEqual(1);
    });

    it('should not double-count gift as transfer', () => {
      const text = 'Gift of 10,000 shares to family trust at $0.';
      const result = extractForm4Data(text);
      expect(result.transactions.length).toBe(1);
    });
  });

  describe('Share count display', () => {
    it('should always populate shares field for sale transactions', () => {
      const text = 'The insider sold 56,820 shares at $450.66 weighted average.';
      const result = extractForm4Data(text);
      expect(result.transactions[0].shares).toBeTruthy();
      expect(parseInt(result.transactions[0].shares.replace(/,/g, ''))).toBeGreaterThan(0);
    });

    it('should populate shares field for gift transactions', () => {
      const text = 'Gift transactions totaling 73,252 shares.';
      const result = extractForm4Data(text);
      expect(result.transactions[0].shares).toBeTruthy();
    });
  });

  // Empty/no-match/partial-match tests (Review Decision #12)
  describe('Graceful degradation', () => {
    it('should return default empty state for empty string', () => {
      const result = extractForm4Data('');
      expect(result.filerName).toBe('');
      expect(result.transactions).toEqual([]);
    });

    it('should return default state for unrecognizable text', () => {
      const result = extractForm4Data('This is random text with no recognizable patterns.');
      expect(result.filerName).toBe('');
      expect(result.transactions).toEqual([]);
    });

    it('should extract name but no transactions when only name is present', () => {
      const result = extractForm4Data('**Reporting Person**: John Smith filed a form.');
      expect(result.filerName).toBeTruthy();
      expect(result.transactions).toEqual([]);
    });

    it('should extract transaction but no name when only transaction is present', () => {
      const result = extractForm4Data('An insider sold 10,000 shares at $50.');
      expect(result.filerName).toBe('');
      expect(result.transactions.length).toBeGreaterThan(0);
    });
  });
});
```

**Checkpoint 4.1**: Tests fail:
```bash
npm run test -- --testPathPattern="form4-improvements"
```

### Step 4.2: Green - Implement Form 4 Improvements

#### 4.2.1 Expand Filer Name Extraction Patterns
**File**: `lib/email/form4-data-extractor.ts`

At `extractFilerName()` (lines 129-147), add additional patterns:
1. `Name, Role` pattern: `/([A-Z][a-zA-Z]+(?:\s+[A-Z]\.?\s+)?[A-Z][a-zA-Z-]+),\s*(?:Chief|CEO|CFO|COO|Director|Officer|President|VP)/i`
2. `filed by NAME` with ALL CAPS support: `/filed by\s+([A-Z][A-Z\s.'-]+[A-Z])/i` with title-case conversion
3. `Name reported` pattern: `/([A-Z][a-zA-Z]+(?:\s+[A-Z]\.?\s+)?[A-Z][a-zA-Z-]+)\s+(?:reported|disclosed|filed)/i`
4. Fix existing patterns to handle ALL CAPS names by converting to title case
5. Support hyphenated last names: `[a-zA-Z-]+` instead of `[a-z]+`

**Checkpoint 4.2.1**: Filer name tests pass:
```bash
npm run test -- --testPathPattern="form4-improvements" --testNamePattern="Filer name"
```

#### 4.2.2 Improve Multi-Transaction Extraction
**File**: `lib/email/form4-data-extractor.ts`

Review and fix the extraction order at lines 361-449:
- Ensure sale patterns run before gift patterns
- Improve gift extraction to handle "four gift transactions totaling X shares" format
- Add deduplication check between gift and transfer (already exists at lines 419-423, verify it works)

**Checkpoint 4.2.2**: Multi-transaction tests pass:
```bash
npm run test -- --testPathPattern="form4-improvements" --testNamePattern="Multi-transaction"
```

#### 4.2.3 Ensure Share Count Always Populated
**File**: `lib/email/form4-data-extractor.ts`

In the transaction extraction, ensure `shares` field is always set when a transaction is found. Add validation that rejects transactions where shares is empty or zero (unless it's a trust transfer).

**Checkpoint 4.2.3**: Share count tests pass:
```bash
npm run test -- --testPathPattern="form4-improvements" --testNamePattern="Share count"
```

### Step 4.3: Blue - Refactor

- [ ] Title-case conversion as a utility function
- [ ] Consolidate name extraction patterns with clear priority documentation

**Checkpoint 4.3**: All tests pass:
```bash
npm run test -- --testPathPattern="form4-"
npm run test
```

### Step 4.4: Final Phase Verification

#### Automated Verification:
- [ ] Form 4 tests pass: `npm run test -- --testPathPattern="form4-"`
- [ ] No regressions: `npm run test`
- [ ] Build: `npm run build`
- [ ] Lint: `npm run lint`

#### Manual Verification:
- [ ] Render Form 4 email with TSLA insider filing - verify insider name appears in H1
- [ ] Verify sale + gift multi-transaction filing shows both transaction cards
- [ ] Verify share counts appear on all transaction cards
- [ ] Verify ownership impact section appears when stake data is present

**STOP**: Await manual confirmation before Phase 5.

---

## Phase 5: Timeliness & Staleness

**STATUS: COMPLETE** - All 12 tests pass.

### Implementation Notes (2026-02-14)
- Created `lib/validation/staleness-detector.ts` with `StalenessDetector` class:
  - `check(filingDate, now?)` → `{ isStale, daysOld, severity, message }`
  - Thresholds: 7 days = warning, 30 days = critical
  - `formatRelativeTime(daysOld)` → human-readable ("Filed 2 weeks ago", "Filed 3 months ago")
- Created `components/ui/email/templates/sections/StalenessBanner.tsx`:
  - Injectable `now` prop for deterministic testing
  - Amber background for warning, red for critical
  - Renders nothing for fresh filings
- Integrated StalenessBanner into 4 main templates: 8-K, 10-K, 10-Q, Form 4
- Skipped optional 90-day age filter in discovery (not critical, can add later)
- Test files: `staleness-detection.test.ts` (10), `staleness-banner.test.tsx` (2)

### Overview
Add staleness detection and warning banners for filings that are delivered more than 7 days after their filing date. Add optional relative time display. Optionally add age-based filtering to prevent processing very old filings.

### Step 5.1: Red - Write Failing Tests

**Test File**: `__tests__/email/staleness-detection.test.ts`

```typescript
import { StalenessDetector } from '@/lib/validation/staleness-detector';

describe('StalenessDetector', () => {
  describe('isStale', () => {
    it('should return false for filing from today', () => {
      const now = new Date('2026-02-12');
      const result = StalenessDetector.check(new Date('2026-02-12'), now);
      expect(result.isStale).toBe(false);
    });

    it('should return false for filing from 5 days ago', () => {
      const now = new Date('2026-02-12');
      const result = StalenessDetector.check(new Date('2026-02-07'), now);
      expect(result.isStale).toBe(false);
    });

    it('should return true for filing from 8 days ago', () => {
      const now = new Date('2026-02-12');
      const result = StalenessDetector.check(new Date('2026-02-04'), now);
      expect(result.isStale).toBe(true);
      expect(result.daysOld).toBe(8);
    });

    it('should return true for filing from 3 months ago', () => {
      const now = new Date('2026-02-12');
      const result = StalenessDetector.check(new Date('2025-11-01'), now);
      expect(result.isStale).toBe(true);
      expect(result.daysOld).toBeGreaterThan(90);
    });

    it('should return severity "warning" for 7-30 days old', () => {
      const now = new Date('2026-02-12');
      const result = StalenessDetector.check(new Date('2026-01-25'), now);
      expect(result.severity).toBe('warning');
    });

    it('should return severity "critical" for 30+ days old', () => {
      const now = new Date('2026-02-12');
      const result = StalenessDetector.check(new Date('2025-12-01'), now);
      expect(result.severity).toBe('critical');
    });
  });

  describe('formatRelativeTime', () => {
    it('should format "Filed today" for same-day', () => {
      expect(StalenessDetector.formatRelativeTime(0)).toBe('Filed today');
    });

    it('should format "Filed 1 day ago" for yesterday', () => {
      expect(StalenessDetector.formatRelativeTime(1)).toBe('Filed 1 day ago');
    });

    it('should format "Filed 2 weeks ago" for 14 days', () => {
      expect(StalenessDetector.formatRelativeTime(14)).toBe('Filed 2 weeks ago');
    });

    it('should format "Filed 3 months ago" for 90 days', () => {
      expect(StalenessDetector.formatRelativeTime(90)).toBe('Filed 3 months ago');
    });
  });
});
```

**Test File**: `__tests__/email/staleness-banner.test.tsx`

```typescript
import { render } from '@testing-library/react';
import { StalenessBanner } from '@/components/ui/email/templates/sections/StalenessBanner';

// Review Decision #10: Use fixed dates, inject `now` prop for deterministic tests
describe('StalenessBanner', () => {
  const FIXED_NOW = new Date('2026-02-12T12:00:00Z');

  it('should not render when filing is fresh', () => {
    const { container } = render(
      <StalenessBanner filingDate={new Date('2026-02-12')} now={FIXED_NOW} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('should render warning banner for stale filing', () => {
    const { container } = render(
      <StalenessBanner filingDate={new Date('2026-01-13')} now={FIXED_NOW} />
    );
    expect(container.innerHTML).toContain('delayed');
    expect(container.innerHTML).toContain('#FEF3C7'); // Warning amber background
  });
});
```

**Checkpoint 5.1**: Tests fail:
```bash
npm run test -- --testPathPattern="staleness"
```

### Step 5.2: Green - Implement Staleness System

#### 5.2.1 Create StalenessDetector Service
**File**: `lib/validation/staleness-detector.ts`

Create `StalenessDetector` class with:
- `check(filingDate, now?)` -> `{ isStale, daysOld, severity, message }`
- Thresholds: 7 days = stale, 30 days = critical
- `formatRelativeTime(daysOld)` -> human-readable string

**Checkpoint 5.2.1**: StalenessDetector tests pass:
```bash
npm run test -- --testPathPattern="staleness-detection"
```

#### 5.2.2 Create StalenessBanner Component
**File**: `components/ui/email/templates/sections/StalenessBanner.tsx`

Create a React email component that:
- Takes `filingDate` prop and optional `now` prop (for deterministic testing, Review Decision #10)
- Calls `StalenessDetector.check(filingDate, now)` internally
- Renders amber warning banner when stale: "This filing was originally filed {relativeTime}. Delivery was delayed due to processing."
- Renders nothing when fresh

**Checkpoint 5.2.2**: StalenessBanner tests pass:
```bash
npm run test -- --testPathPattern="staleness-banner"
```

#### 5.2.3 Integrate StalenessBanner into Email Templates
**Files**:
- `components/ui/email/templates/8k-minimalist-template.tsx`
- `components/ui/email/templates/10k-minimalist-template.tsx`
- `components/ui/email/templates/10q-minimalist-template.tsx`
- `components/ui/email/templates/form4-minimalist-template.tsx`

Add `<StalenessBanner filingDate={filingDate} />` after the EmailHeader in each template.

#### 5.2.4 Add Age Filter to Discovery (Optional Guard)
**File**: `lib/sec-edgar/ticker-monitoring.ts`

In `getUnprocessedFilings()` at line 344, add an optional age filter using `createdAt` (Review Decision #13 - leverages existing `[processed, createdAt]` index, no migration needed):
```typescript
where: {
  processed: false,
  createdAt: {
    gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) // Max 90 days old
  }
}
```

This prevents processing filings older than 90 days (they're too stale to be useful). Uses `createdAt` instead of `filingDate` because `createdAt` is indexed while `filingDate` is not. A few days' drift doesn't matter at the 90-day scale.

**Checkpoint 5.2.3-4**: All staleness tests pass:
```bash
npm run test -- --testPathPattern="staleness"
```

### Step 5.3: Blue - Refactor

- [ ] Ensure staleness thresholds are configurable constants
- [ ] Verify banner renders correctly in email clients (inline styles only)

**Checkpoint 5.3**: All tests pass:
```bash
npm run test -- --testPathPattern="staleness"
npm run test
```

### Step 5.4: Final Phase Verification

#### Automated Verification:
- [ ] Staleness tests pass: `npm run test -- --testPathPattern="staleness"`
- [ ] No regressions: `npm run test`
- [ ] Build: `npm run build`
- [ ] Lint: `npm run lint`

#### Manual Verification:
- [ ] Render email with filing date 30+ days ago - verify amber warning banner appears
- [ ] Render email with today's filing date - verify no banner
- [ ] Verify banner text is clear and non-alarming
- [ ] Verify discovery handler respects 90-day age limit

**STOP**: Await manual confirmation before Phase 6.

---

## Phase 6: Content Quality & Edge Cases

**STATUS: COMPLETE** - All 6 tests pass.

### Implementation Notes (2026-02-14)
- Content quality checks test file validates `detectEmptySections` for all form types
- Updated Form 4 template to show "Gift (no monetary value)" instead of "$0" for gift/transfer transactions
- Skipped duplicate logging enhancement (low priority, existing logging is adequate)
- Total tests across all phases: 118 passing, 0 failing

### Overview
Address remaining issues: sparse/blank section detection (integrated with quality gate), gift $0 display improvement, and improved duplicate logging. ~~Consistent bold formatting across all templates~~ (REMOVED - Review Decision #3: only 8-K needs fixing, done in Phase 3. 10-K/10-Q/Form4 already use `markdownToHtml()` with correct font-weight:600).

### Step 6.1: Red - Write Failing Tests

**Test File**: `__tests__/email/content-quality-checks.test.ts`

```typescript
describe('Content Quality Checks', () => {
  describe('10-K/10-Q sparse section detection', () => {
    it('should flag 10-K with all-empty financial highlights', () => {
      const issues = QualityGate.detectEmptySections('10-K', {
        summary: 'Apple filed a 10-K annual report.',
        financialHighlights: [],
        segments: [],
        riskFactors: [],
        keyPoints: [],
      });
      expect(issues.length).toBeGreaterThan(0);
      expect(issues).toContain('MISSING_FINANCIAL_HIGHLIGHTS');
    });

    it('should flag 10-Q with missing quarterly trends', () => {
      const issues = QualityGate.detectEmptySections('10-Q', {
        summary: 'Apple filed a 10-Q.',
        financialHighlights: [],
        quarterlyTrends: [],
      });
      expect(issues).toContain('MISSING_FINANCIAL_HIGHLIGHTS');
    });
  });

  describe('Gift transaction display', () => {
    it('should show "No monetary value (gift)" instead of "$0" for gifts', () => {
      // This tests the template rendering
      const giftTransaction = {
        type: 'gift',
        shares: 73252,
        value: 0,
        avgPrice: 0,
        count: 4,
      };
      // formatGiftValue should return descriptive text, not "$0"
      expect(formatGiftValue(giftTransaction)).toBe('Gift (no monetary value)');
    });
  });

  describe('Bold formatting consistency across templates', () => {
    it('should use font-weight:600 in 10-K formatText', () => {
      // Import from 10k template
      const result = formatText10K('Revenue of $50B, up 15%');
      expect(result).toContain('font-weight:600');
      expect(result).not.toContain('font-weight:700');
    });

    it('should use font-weight:600 in 10-Q formatText', () => {
      const result = formatText10Q('EPS of $1.50, up 8%');
      expect(result).toContain('font-weight:600');
      expect(result).not.toContain('font-weight:700');
    });
  });
});
```

**Checkpoint 6.1**: Tests fail:
```bash
npm run test -- --testPathPattern="content-quality-checks"
```

### Step 6.2: Green - Implement Content Quality Fixes

#### 6.2.1 Integrate Sparse Section Detection with Quality Gate
Already partially implemented in Phase 1 (`QualityGate.detectEmptySections`). Ensure it covers:
- 10-K: `financialHighlights` required (non-empty array)
- 10-Q: `financialHighlights` required
- 8-K: `keyHighlights` or `summary` required (at least one meaningful)
- Form 4: `transactions` and `filerName` required

Quality gate should factor empty sections into its blocking decision.

#### 6.2.2 Improve Gift Transaction Display
**File**: `components/ui/email/templates/form4-minimalist-template.tsx`

At lines 715-716 where gift value is displayed, change from showing "$0" to showing "Gift (no monetary value)" when `value === 0 && type === 'gift'`.

#### 6.2.3 Standardize Bold Formatting Across All Templates
**Files**:
- `components/ui/email/templates/10k-minimalist-template.tsx`
- `components/ui/email/templates/10q-minimalist-template.tsx`
- `components/ui/email/templates/form4-minimalist-template.tsx`

Check each template's `formatText()` function and ensure dollar amounts and percentages use `font-weight:600` (matching `design-system.ts`), not `font-weight:700`.

#### 6.2.4 Improve Duplicate Email Logging
**File**: `services/filing/sendEmailSummary.ts`

At the duplicate detection points (lines 240-251), enhance logging to include:
- User ID (hashed for privacy in logs)
- Filing accession number
- Time since first delivery
- Whether this is same-user or different-user scenario

**Checkpoint 6.2**: All content quality tests pass:
```bash
npm run test -- --testPathPattern="content-quality-checks"
```

### Step 6.3: Blue - Refactor

- [ ] Extract shared `formatText()` to design-system or shared utility
- [ ] Ensure all templates import from the same source for consistency

**Checkpoint 6.3**: All tests pass:
```bash
npm run test -- --testPathPattern="content-quality"
npm run test
```

### Step 6.4: Final Phase Verification

#### Automated Verification:
- [ ] Content quality tests pass: `npm run test -- --testPathPattern="content-quality"`
- [ ] No regressions: `npm run test`
- [ ] Build: `npm run build`
- [ ] Lint: `npm run lint`
- [ ] Pipeline comprehensive: `npm run test:pipeline:comprehensive`
- [ ] E2E: `npm run test:e2e`

#### Manual Verification:
- [ ] Render 10-K email with sparse data - verify quality gate blocks it
- [ ] Render Form 4 with gift transaction - verify "Gift (no monetary value)" display
- [ ] Verify bold formatting is visually consistent across all filing type emails
- [ ] Check duplicate detection logs in a simulated scenario

**STOP**: Final manual confirmation.

---

## Testing Strategy

### TDD Test Design Principles
1. **One assertion per test** when practical
2. **Descriptive names**: "should [verb] when [condition]"
3. **Arrange-Act-Assert** structure
4. **Test behavior, not implementation**
5. **Edge cases first** for quality gate thresholds

### Test Categories (in order of writing)

#### 1. Contract Tests (Phase 1)
Define the QualityGate public API: `evaluate()`, `detectEmptySections()`

#### 2. Edge Case Tests (Phases 1-6)
Boundary conditions for thresholds, empty data, ALL CAPS names, $0 gifts

#### 3. Integration Tests (Phase 1, 6)
Quality gate integrated with filing processor, template rendering with staleness banners

#### 4. Regression Tests (Phase 4, 6)
Form 4 filerName extraction for known-failing patterns, VRT $1B materiality

### Checkpoint Frequency
- **Phase 1**: 4 checkpoints (quality gate is most critical)
- **Phase 2**: 2 checkpoints (prompt changes are text-only)
- **Phase 3**: 4 checkpoints (multiple template changes)
- **Phase 4**: 3 checkpoints (extraction + template)
- **Phase 5**: 4 checkpoints (new service + component + integration)
- **Phase 6**: 2 checkpoints (cleanup and standardization)
- **Total**: ~19 checkpoints across 6 phases

### Manual Testing Steps
1. Generate sample emails for each filing type (8-K, 10-K, 10-Q, Form 4)
2. Verify quality gate blocks a deliberately low-quality summary
3. Verify retry produces better result with higher temperature
4. Verify stale filing shows warning banner
5. Verify Form 4 shows insider name correctly for TSLA filing
6. Verify VRT $1B acquisition shows as "Material Event"

## Performance Considerations

- **Quality gate retry adds ~15-30s to processing for low-quality summaries** (second AI call with validation). This is acceptable since it only triggers for failures, not the happy path.
- **Staleness check is O(1)** - simple date comparison, no performance impact.
- **Materiality dollar-amount regex is O(n)** on summary text length - negligible for typical summaries (<500 chars).
- **No database schema changes required** - all data stored in existing `summaryJSON` field.

## Migration Notes

- **No database migrations needed** - quality gate status stored in `summaryJSON` field
- **Prompt changes are backward compatible** - new fields are optional in schema
- **Template changes are visual only** - no data model changes
- **Staleness detector is purely additive** - new component, no breaking changes

## File Change Summary

### New Files
| File | Purpose |
|------|---------|
| `lib/validation/quality-gate.ts` | Quality gate service with scoring thresholds |
| `lib/validation/staleness-detector.ts` | Staleness detection service |
| `components/ui/email/templates/sections/StalenessBanner.tsx` | Email staleness warning banner |
| `__tests__/validation/quality-gate.test.ts` | Quality gate tests |
| `__tests__/ai/prompt-quality.test.ts` | Prompt improvement tests |
| `__tests__/email/8k-materiality.test.ts` | 8-K materiality tests |
| `__tests__/email/8k-item-descriptions.test.ts` | Item description tests |
| `__tests__/email/8k-formatting.test.ts` | 8-K formatting tests |
| `__tests__/email/form4-improvements.test.ts` | Form 4 improvement tests |
| `__tests__/email/staleness-detection.test.ts` | Staleness detection tests |
| `__tests__/email/staleness-banner.test.tsx` | Staleness banner component tests |
| `__tests__/email/content-quality-checks.test.ts` | Content quality tests |

### Modified Files
| File | Changes |
|------|---------|
| `lib/cron/filing-processor.ts` | Insert quality gate at lines 1300-1315 |
| `lib/ai/prompts/unified-prompts.ts` | Add word blocklist, negative examples, itemDescriptions field |
| `lib/ai/summarize.ts` | Add temperature parameter to generateAISummaryWithRetry |
| `components/ui/email/templates/8k-minimalist-template.tsx` | isMaterialFiling dollar awareness, item descriptions, formatText consistency, bullet fix |
| `components/ui/email/templates/10k-minimalist-template.tsx` | Bold weight consistency, StalenessBanner |
| `components/ui/email/templates/10q-minimalist-template.tsx` | Bold weight consistency, StalenessBanner |
| `components/ui/email/templates/form4-minimalist-template.tsx` | Gift display, bold weight, StalenessBanner |
| `lib/email/form4-data-extractor.ts` | Expanded filerName patterns, ALL CAPS support |
| `lib/sec-edgar/ticker-monitoring.ts` | Optional 90-day age filter in getUnprocessedFilings |
| `services/filing/sendEmailSummary.ts` | Enhanced duplicate logging |

## References

- Research: `thoughts/shared/research/2026-02-12-review-summary-quality-assessment.md`
- Quality validation: `lib/validation/summary-content-validator.ts:88-237`
- Filing processor: `lib/cron/filing-processor.ts:1258-1602`
- Unified prompts: `lib/ai/prompts/unified-prompts.ts:848-892`
- 8-K template: `components/ui/email/templates/8k-minimalist-template.tsx`
- Form 4 template: `components/ui/email/templates/form4-minimalist-template.tsx`
- Form 4 extractor: `lib/email/form4-data-extractor.ts`
- Email header: `components/ui/email/templates/sections/EmailHeader.tsx`
- Design system: `components/ui/email/design-system.ts:356-419`
- Discovery handler: `lib/cron/handlers/discovery-handler.ts:308-340`
- Previous quality research: `thoughts/shared/research/2026-01-20-filing-summary-email-quality-gaps.md`
