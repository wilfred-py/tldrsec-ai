# Fix Form 4 Transaction Classification Not Working in Production

**Date**: 2026-03-04 08:29:54 AEDT
**Git Commit**: e633c2eb724836e2d5d6bdb6c22e6e9f150e48b7
**Branch**: worktree-summary-enhancements
**Repository**: tldrsec-ai
**Reviewed**: 2026-03-05 — 4 issues found, all resolved

## Overview

PR #356 (merged Feb 25, commit `91e4fb7`) added 7-bucket Form 4 transaction classification (purchase, sale, award, exercise, gift, transfer, other). Users report enhancements aren't visible in delivered emails over the last 3 days.

**Root cause**: Two data flow gaps between the AI prompt schema and the email template:
1. The AI schema lacked a `code` field — classification functions check `tx.code` first, which was always undefined
2. The AI schema uses field name `price` but the template reads `pricePerShare` — all prices/values render as $0

The classification functions themselves work correctly (21-code coverage tests pass). They just never receive the data they need.

**Issues addressed:**
1. `tx.code` always undefined in production summaryJSON (AI schema had no `code` field)
2. `tx.pricePerShare` always undefined because AI outputs `price` (field name mismatch)
3. Text fallback fails: AI outputs `type: "Acquisition"` for code A, but `isAwardTransaction()` checks for "award"/"grant"/"rsu" — "acquisition" doesn't match

## Current State Analysis

### What's Already Done in This Worktree
- `lib/ai/prompts/unified-prompts.ts`: `code` field added to Form 4 transaction schema, marked as REQUIRED
- `type` field description updated: "Human-readable transaction type: Purchase, Sale, Award/Grant, Gift, Exercise, Disposition, Transfer"

### What's Still Broken

**Field name mismatch**: AI schema has `price`, template `TransactionData` interface has `pricePerShare`
- `unified-prompts.ts:337` → `price: { type: 'string', ... }`
- `form4-minimalist-template.tsx:18` → `pricePerShare?: string | number`
- `aggregateTransactionsByType()` reads `tx.pricePerShare` → undefined → `parseNumericValue(undefined)` → 0

**Data flow trace:**
```
AI Output (summaryJSON)           Template (TransactionData)
─────────────────────            ────────────────────────────
transactions[]:                   dataTransactions cast as TransactionData[]:
  code: "A"          ──────→      code: "A"         ✅ (new field, works)
  type: "Award/Grant" ─────→      type: "Award/Grant" ✅ (text fallback now works)
  shares: "2,500"    ──────→      shares: "2,500"    ✅
  price: "$0"        ──────→      pricePerShare: ???  ✗ (field name mismatch)
                                  totalValue: ???     ✗ (not in per-tx AI schema)
```

**Template transaction selection** (`form4-minimalist-template.tsx:632`):
```typescript
const transactions = dataTransactions.length > 0 ? dataTransactions : extractedTransactions;
```
AI transactions array is always non-empty (REQUIRED field), so extractor transactions (which DO have correct field names) are never used.

### Key Discoveries:
- Classification functions at `form4-minimalist-template.tsx:101-263` all check `tx.code` FIRST — once `code` is present, classification works correctly
- `mergeWithFallback()` at `extractor-merge-utils.ts:106` uses "AI wins on non-empty" — AI's non-empty `transactions` array prevents extractor enrichment
- Existing regression tests (`summary-quality-2026-02-18.test.ts:49-70`) construct data with `code` explicitly, hiding the production gap
- The Form 4 extraction guidance at `unified-prompts.ts:998-1029` already has comprehensive code mapping, ensuring AI will output correct `code` values

## What We're NOT Doing

- NOT fixing shared summary cache re-enrichment — once AI outputs `code` + `pricePerShare`, shared copies carry correct data
- NOT changing merge strategy — merge works correctly; issue was missing data, not wrong merge logic
- NOT modifying classification functions — they work correctly when `code` is present (but adding `price` fallback in `aggregateTransactionsByType` per review)
- NOT adding cache invalidation for old summaries — natural aging handles this
- NOT changing extractor logic — extractor is a fallback, primary path through AI data is being fixed

---

## Phase 1: Failing Tests for AI-Schema-to-Template Data Flow

### Overview
Write regression tests that use data shaped exactly like actual AI output. These expose the `price` → `pricePerShare` field name mismatch.

### Step 1.1: 🔴 Write Failing Tests

**Test File**: `__tests__/regression/form4-ai-schema-classification.test.ts`

```typescript
/**
 * Form 4 AI Schema → Template Classification Regression Tests
 *
 * These tests verify that data shaped like ACTUAL AI output (from unified-prompts.ts)
 * classifies correctly in the email template.
 *
 * Key difference from summary-quality-2026-02-18.test.ts: those tests provide `code`
 * explicitly with template-native field names. These tests use AI-schema field names
 * (e.g., `price` instead of `pricePerShare`) to catch data flow mismatches.
 */

import {
  aggregateTransactionsByType,
} from '../../components/ui/email/templates/form4-minimalist-template';

// Helper: create transaction shaped like AI output (unified-prompts.ts Form 4 schema)
function aiTx(overrides: {
  code: string;
  type: string;
  shares: string;
  price: string;          // AI field name (NOT pricePerShare)
  date?: string;
  acquisitionDisposition?: string;
}) {
  return overrides;
}

describe('Form 4: AI Schema → Template Classification', () => {
  describe('code field enables correct classification', () => {
    it('should classify code A + type "Award/Grant" as award (not other)', () => {
      const transactions = [
        aiTx({ code: 'A', type: 'Award/Grant', shares: '2,500', price: '$0', acquisitionDisposition: 'A' }),
      ];
      const result = aggregateTransactionsByType(transactions);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('award');
    });

    it('should classify code S + type "Sale" as sale', () => {
      const transactions = [
        aiTx({ code: 'S', type: 'Sale', shares: '10,000', price: '$150.50', acquisitionDisposition: 'D' }),
      ];
      const result = aggregateTransactionsByType(transactions);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('sale');
    });

    it('should classify code G + type "Gift" as gift', () => {
      const transactions = [
        aiTx({ code: 'G', type: 'Gift', shares: '5,000', price: '$0', acquisitionDisposition: 'D' }),
      ];
      const result = aggregateTransactionsByType(transactions);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('gift');
    });

    it('should classify code P + type "Purchase" as purchase', () => {
      const transactions = [
        aiTx({ code: 'P', type: 'Purchase', shares: '1,000', price: '$200', acquisitionDisposition: 'A' }),
      ];
      const result = aggregateTransactionsByType(transactions);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('purchase');
    });

    it('should classify code M + type "Exercise" as exercise', () => {
      const transactions = [
        aiTx({ code: 'M', type: 'Exercise', shares: '5,000', price: '$25', acquisitionDisposition: 'A' }),
      ];
      const result = aggregateTransactionsByType(transactions);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('exercise');
    });
  });

  describe('price field maps to dollar values (not $0)', () => {
    it('should compute correct totalValue from AI price field', () => {
      const transactions = [
        aiTx({ code: 'S', type: 'Sale', shares: '10,000', price: '$150', acquisitionDisposition: 'D' }),
      ];
      const result = aggregateTransactionsByType(transactions);
      expect(result[0].totalValue).toBe(1500000); // 10000 * 150
      expect(result[0].totalValue).not.toBe(0);
    });

    it('should show shares for $0 gift transactions (not misleading "$0")', () => {
      const transactions = [
        aiTx({ code: 'G', type: 'Gift', shares: '73,252', price: '$0', acquisitionDisposition: 'D' }),
      ];
      const result = aggregateTransactionsByType(transactions);
      expect(result[0].type).toBe('gift');
      expect(result[0].totalShares).toBe(73252);
      expect(result[0].totalValue).toBe(0);
    });
  });

  describe('backward compatibility: old summaryJSON with price field', () => {
    it('should handle transaction with price (no pricePerShare) from old DB records', () => {
      // Old summaryJSON stored price as "price", not "pricePerShare"
      const oldFormatTx = { code: 'S', type: 'Sale', shares: '5,000', price: '$100' };
      const result = aggregateTransactionsByType([oldFormatTx]);
      expect(result[0].type).toBe('sale');
      expect(result[0].totalValue).toBe(500000);
    });
  });

  describe('type-only fallback (no code field)', () => {
    it('should classify type "Award/Grant" as award when code is missing', () => {
      const tx = { type: 'Award/Grant', shares: '2,500', price: '$0' };
      const result = aggregateTransactionsByType([tx]);
      expect(result[0].type).toBe('award');
    });

    it('should classify type "Sale" as sale when code is missing', () => {
      const tx = { type: 'Sale', shares: '10,000', price: '$150' };
      const result = aggregateTransactionsByType([tx]);
      expect(result[0].type).toBe('sale');
    });
  });
});
```

**Checkpoint 1.1**: Run tests, verify they FAIL on `totalValue`:
```bash
npm run test -- --testPathPattern="form4-ai-schema-classification"
# Expected: classification tests PASS (code field works), but totalValue tests FAIL (price mismatch)
```

### Step 1.2: 🟢 Implement Fixes

#### 1.2.1 Rename `price` → `pricePerShare` in AI Schema
**File**: `lib/ai/prompts/unified-prompts.ts` (line ~337)
**Change**: In Form 4 transaction schema properties, rename `price` key to `pricePerShare`. Update `required` array too.

Before:
```typescript
price: { type: 'string', description: 'REQUIRED: Price per share with $ from column 4...' },
...
required: ['code', 'type', 'shares', 'price']
```

After:
```typescript
pricePerShare: { type: 'string', description: 'REQUIRED: Price per share with $ from column 4...' },
...
required: ['code', 'type', 'shares', 'pricePerShare']
```

#### 1.2.2 Add Backward-Compat Mapping in Template
**File**: `components/ui/email/templates/form4-minimalist-template.tsx` (line ~623)
**Change**: When reading transactions from summaryJSON, map old `price` field to `pricePerShare`:

Before:
```typescript
const dataTransactions = (data?.transactions || []) as TransactionData[];
```

After:
```typescript
const rawTransactions = (data?.transactions || []) as Array<TransactionData & { price?: string | number }>;
const dataTransactions = rawTransactions.map(t => ({
  ...t,
  pricePerShare: t.pricePerShare ?? t.price,
})) as TransactionData[];
```

#### 1.2.3 Add `price` Fallback in `aggregateTransactionsByType`
**File**: `components/ui/email/templates/form4-minimalist-template.tsx` (line ~317)
**Change**: Make the aggregation function defensively handle both `pricePerShare` and `price` field names.
**Rationale**: Tests call `aggregateTransactionsByType` directly (not through the template). Without this, totalValue tests would never pass. Also protects any future callers.

Before:
```typescript
const price = parseNumericValue(tx.pricePerShare);
```

After:
```typescript
const price = parseNumericValue(tx.pricePerShare ?? (tx as Record<string, unknown>).price);
```

**Checkpoint 1.2.3**: All new tests pass:
```bash
npm run test -- --testPathPattern="form4-ai-schema-classification"
# Expected: All passing (classification + totalValue + backward-compat + type-only fallback)
```

### Step 1.3: 🔵 Refactor
- No refactoring needed — changes are minimal and clean

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [x] New regression tests pass: `npm run test -- --testPathPattern="form4-ai-schema-classification"` (10/10 pass)
- [x] Existing regression tests pass: `npm run test -- --testPathPattern="summary-quality-2026-02-18"` (42/42 pass)
- [x] Full test suite passes: `npm run test` (189/189 form4+summary tests pass)
- [x] Lint passes: `npm run lint` (no errors in changed files; 3 pre-existing warnings in unrelated files)
- [x] Build succeeds: `npm run build`

#### Manual Verification:
- [x] Run `npm run test:e2e` with a Form 4 filing to verify `code` appears in AI output (5/5 passed: TSLA 4, VRT 8-K, COIN 144, KO 4, NVDA 4)
- [ ] Check delivered email shows correct transaction type labels

**STOP**: Await manual confirmation before proceeding.

---

## Testing Strategy

### TDD Test Design Principles
The key insight from research: existing tests pass because they provide `code` explicitly using template-native field names. Nobody tested with actual AI-shaped data. New tests must use AI output format (`price` not `pricePerShare`).

### Checkpoint Frequency
- Checkpoint 1.1: Tests fail as expected (field mismatch confirmed)
- Checkpoint 1.2.2: Tests pass after both fixes applied
- Checkpoint 1.4: Full regression suite green

### Manual Testing Steps:
1. Run E2E pipeline test: `npm run test:e2e`
2. Check email: Form 4 should show "Awarded" (not "Other") for RSU/PSU grants
3. Check email: Sale transactions should show dollar amounts (not "$0")

## Performance Considerations

None. Changes are:
- Schema text change (prompt only, no runtime impact)
- One `.map()` on a 1-5 element array per email render

## Review Notes (2026-03-05)

### Decisions
| # | Issue | Decision | Rationale |
|---|-------|----------|-----------|
| 1 | Normalization placement | Add `price` fallback in `aggregateTransactionsByType` (Step 1.2.3) | Tests call function directly; template mapping alone is insufficient. "Handle more edge cases, not fewer." |
| 2 | Unused test imports | Remove `isPurchaseTransaction`, `isAwardTransaction`, `isSaleTransaction`, `isGiftTransaction` | Lint compliance — only `aggregateTransactionsByType` is used in tests. |
| 3 | Type-only fallback tests | Add 2 tests with no `code` field | Insurance against future AI schema regressions where `code` is omitted. |
| 4 | Performance | No issues | `.map()` on 1-5 elements + 1 `??` fallback per tx — nanoseconds. |

### Critical Finding
The original plan's totalValue tests would **never have passed** with only the template-level backward-compat mapping. Tests call `aggregateTransactionsByType` directly, bypassing the template's `price` → `pricePerShare` remapping. Step 1.2.3 resolves this by adding a defensive fallback inside the function itself. The template mapping (Step 1.2.2) is retained as belt-and-suspenders for type correctness.

---

## Phase 2: Fix String Transactions + Form 144 Ownership Impact

**Date**: 2026-03-05
**Context**: E2E testing (Phase 1 manual verification) revealed two additional issues.

### Root Cause Analysis

**Issue 1: AI returns transactions as strings**
The grok-4.1-fast model outputs `transactions: ["Sold 80 shares at $412 (S, D)", ...]` instead of structured `{code, type, shares, pricePerShare}` objects. When JavaScript spreads a string, it produces `{"0":"S","1":"o",...}` — all fields are undefined, everything classifies as "Other".

**Issue 2: Form 144 lacks ownership impact display**
COIN's Form 144 email shows "Shares to Sell" and "remaining" but no before/after ownership comparison like Form 4 has. The data fields (`shares`, `remainingHoldings`, `percentOfHoldings`) are already extracted.

### Step 2.1: Parse String Transactions in Normalizer

**File**: `lib/ai/parsers/response-parser.ts` (line 82-100)

In the `case '4'` normalizer, add a guard: if `tx` is a string, parse it into a structured object using the `(CODE, A/D)` pattern at end of string. Otherwise proceed as normal.

AI string patterns:
```
"Sold 80 Common Stock shares at $412.460 (S, D)"
"Exercised into 40,000 Common Stock shares at $14.99 (M, A)"
"Exercised 40,000 Non-Qualified Stock Option (right to buy) at $0.000 (M, D)"
```

Parser logic:
1. Extract `(CODE, A/D)` from parenthetical at end → `code`, `acquisitionDisposition`
2. Map code to human-readable type (`S`→Sale, `M`→Exercise, `A`→Award, `P`→Purchase, `G`→Gift, etc.)
3. Extract shares: `([\d,]+)\s*(?:Common Stock\s+)?shares?` or `([\d,]+)\s*Non-Qualified`
4. Extract price: `\$([\d,.]+)` near "at"
5. Return structured `{code, type, shares, pricePerShare, acquisitionDisposition}`
6. If parsing fails, drop the string (let extractor fallback handle it)

### Step 2.2: Template Structural Validation

**File**: `components/ui/email/templates/form4-minimalist-template.tsx` (line ~636)

After mapping `rawTransactions`, filter out items without meaningful fields. If all filtered out, fall through to `extractedTransactions`:

```typescript
const validTransactions = dataTransactions.filter(t => t.type || t.code || t.shares);
const transactions = validTransactions.length > 0 ? validTransactions : extractedTransactions;
```

### Step 2.3: Form 144 Ownership Impact Section

**File**: `components/ui/email/templates/form144-minimalist-template.tsx` (after line 395)

Add "Ownership Impact" section between KEY METRICS and THE STORY:
- Before: `parseNumericValue(shares) + parseNumericValue(remainingHoldings)` (total before sale)
- After: `remainingHoldings`
- Change: calculated percentage reduction
- Only render when both `shares` AND `remainingHoldings` present
- Follow Form 4 pattern (lines 908-1002), simplified for sale-only direction

### Step 2.4: Add Regression Tests

**File**: `__tests__/regression/form4-ai-schema-classification.test.ts`

Add tests for:
- String transactions parsed correctly by normalizer
- Template structural validation filters invalid items
- Form 144 ownership calculations

### Step 2.5: Verification

- [x] New + existing regression tests pass (17/17 new, 42/42 existing)
- [x] Lint clean on changed files
- [x] Build succeeds
- [ ] `TEST_TICKERS=TSLA npm run test:e2e` — Form 4 shows correct types (not "Other")
- [ ] `TEST_TICKERS=COIN npm run test:e2e` — Form 144 shows ownership impact
- [ ] Check delivered emails visually

## References

- Research: `thoughts/shared/research/2026-03-04-pr356-summary-quality-not-reflected.md`
- PR #356: commit `91e4fb7`
- AI schema: `lib/ai/prompts/unified-prompts.ts:313-363`
- Template: `components/ui/email/templates/form4-minimalist-template.tsx`
- Merge utils: `lib/email/extractor-merge-utils.ts`
- Existing regression tests: `__tests__/regression/summary-quality-2026-02-18.test.ts`
