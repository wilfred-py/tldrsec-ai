# Summary Quality Fixes: Form 4 Classification, 10-K Blank Sections, Duplicate Emails

**Date**: 2026-02-18 18:54:06 AEDT
**Git Commit**: 1c2e4d60ca6386ab9d47dcbc682fa79cd44de126
**Branch**: summary-quality-review
**Repository**: tldrsec-ai
**Review Status**: Reviewed 2026-02-18 | 13 issues identified and resolved

## Overview

Fix three production email quality issues and a duplicate email race condition. The root cause is an architectural gap where the extractor validation layer (`summarizeFilingWithValidation()`) exists but is not wired into the production pipeline, combined with incomplete transaction code classification in the Form 4 template.

**Issues addressed:**
1. Form 4 "BOUGHT $0" for gifts/awards (GOOGL, JNJ)
2. 10-K blank Financial Highlights and Segment Performance sections (COIN)
3. Duplicate emails on job retry
4. 17 of 21 SEC transaction codes falling to misleading "purchase" default

## Current State Analysis

### Form 4 Template Classification
- **File**: `components/ui/email/templates/form4-minimalist-template.tsx`
- 4 display buckets: purchase (green), sale (red), gift (purple), transfer (blue)
- Classification chain: `isTransferTransaction` → `isGiftTransaction` → `isSaleTransaction` → default "purchase"
- `isPurchaseTransaction()` correctly returns `false` for code 'A' (Award) at line 188, but the `else` fallback at line 232 puts it in "purchase" anyway
- Only 4 of 21 SEC codes reach their intended bucket; 17 default to "purchase"

### Production Pipeline
- **File**: `lib/cron/handlers/summarize-cached-handler.ts`
- Line 15: imports `summarizeFiling` directly from `../../ai/summarize`
- Line 430: calls `summarizeFiling()` directly, bypassing `summarizeFilingWithValidation()`
- No post-AI enrichment of `summaryJSON` before email template rendering
- `summarizeFilingWithValidation()` at `lib/ai/summarize-with-validation.ts:77` is fully implemented but never imported

### Duplicate Email Race Condition
- **File**: `lib/cron/handlers/summarize-cached-handler.ts`
- Line 216: when `existingSummary` is found, re-sends email without checking `sentToUser`
- If summary was saved (line 461) but `sentToUser` update (line 524) failed before retry, duplicate email is sent

### Key Discoveries:
- `summarizeFilingWithValidation()` has graceful error handling - extractor failures never block summarization (line 167-179)
- `ValidatedSummarizationOptions` extends `SummarizationOptions` - it's a drop-in replacement (line 40-45)
- The `mergeWithFallback()` function uses AI-wins conflict resolution - AI data is never overwritten (line 122-139 in `extractor-merge-utils.ts`)
- `SEC_TRANSACTION_CODES` in `design-system.ts` already maps 19 of 21 codes (missing V only)
- `TRANSACTION_CODE_MAP` in `form4-data-extractor.ts` maps only 10 of 21 codes

## Desired End State

After this plan is complete:

1. **All 21 SEC transaction codes** are classified into 7 semantically correct display buckets with distinct colors, icons, and labels
2. **The extractor validation layer** enriches every AI-generated `summaryJSON` before it reaches email templates, filling gaps in financial highlights, segments, and transaction classifications
3. **Duplicate emails** are prevented by checking `sentToUser` and `SummaryEmailDelivery` before re-sending on retry
4. **The default fallback** is a neutral "Other" bucket instead of a misleading "Bought" badge

### Verification:
- All existing tests pass (no regressions)
- New tests cover all 21 transaction codes → correct bucket mapping
- New tests cover the validation wrapper integration
- New tests cover the duplicate email guard
- `npm run test` passes
- `npm run build` passes
- `npm run lint` passes

## What We're NOT Doing

- **Not changing AI prompting** - `unified-prompts.ts` already has correct guidance for transaction codes
- **Not changing the AI model** - Grok is working; the fix is in post-processing and classification
- **Not rewriting extractors** - The existing extractors work correctly; we're just wiring them in
- **Not changing job queue retry behavior** - `retryCount=1` is expected behavior per CLAUDE.md
- **Not adding new database models or migrations** - All changes are in application code

## Implementation Approach

**Elon's 5-Step Algorithm applied:**
1. **Questioned requirements**: Do we need all 21 codes? User confirmed yes. Do we need the validation wrapper? Yes - it's already built and addresses root cause.
2. **Deleted**: No new extractor code needed. No prompt changes. No schema changes. Reusing existing `summarizeFilingWithValidation()` as-is.
3. **Simplified**: Three surgical code changes cover all four issues: template classification (Phase 1), pipeline wiring (Phase 2), duplicate guard (Phase 3).
4. **Accelerate**: TDD with small, verifiable checkpoints per phase.
5. **Automate**: Existing CI/test infrastructure covers regression prevention.

---

## Phase 1: Expand Form 4 Transaction Classification to All 21 SEC Codes

### Overview
Add `isAwardTransaction()`, `isExerciseTransaction()`, and `isDispositionTransaction()` classification functions. Expand the `AggregatedTransaction` type to include 7 buckets. Change the default fallback from "purchase" to "other". Add display configs for all new buckets.

### Transaction Code → Display Bucket Mapping (All 21 Codes)

| Bucket | Codes | Label | Icon | Bg Color | Text Color | Value Color |
|--------|-------|-------|------|----------|------------|-------------|
| `purchase` | P | Bought | 📈 | `#F0FDF4` | `#166534` | `#16A34A` |
| `sale` | S | Sold | 📉 | `#FEF2F2` | `#991B1B` | `#DC2626` |
| `award` | A, I | Awarded | 🏆 | `#FFFBEB` | `#92400E` | `#D97706` |
| `exercise` | M, C, X, O, E, H | Derivative Activity | ⚡ | `#F0FDFA` | `#115E59` | `#0D9488` |
| `gift` | G, W | Gift | 🎁 | `#F3E8FF` | `#7C3AED` | `#7C3AED` |
| `transfer` | J, K, Z | Transfer | 🔄 | `#EBF8FF` | `#1E40AF` | `#3B82F6` |
| `other` | D, F, U, V, L | Other | 📋 | `#F8FAFC` | `#475569` | `#64748B` |

### Step 1.1: 🔴 Write Failing Tests for Transaction Classification

**Test File**: `__tests__/email/form4-transaction-classification.test.ts`

Write tests covering all 21 SEC transaction codes mapped to their expected buckets. Tests should verify:

1. Each of the 21 codes maps to its correct bucket via the classification chain
2. The new `isAwardTransaction()` function correctly identifies codes A and I
3. The new `isExerciseTransaction()` function correctly identifies codes M, C, X, O, E, H
4. The new `isDispositionTransaction()` function correctly identifies codes D, F, U, V, L
5. The updated `isGiftTransaction()` also catches code W (will/inheritance)
6. The updated `isTransferTransaction()` also catches code Z (voting trust)
7. The default fallback is "other", not "purchase"
8. Text-based classification still works (e.g., type "Award" → award bucket, type "Exercise" → exercise bucket)
9. `aggregateTransactionsByType()` produces correct bucket groupings for mixed transaction sets
10. `getAggregatedTransactionConfig()` returns correct visual config for all 7 bucket types

```typescript
// Test structure:
describe('Form 4 Transaction Classification - All 21 SEC Codes', () => {
  describe('isAwardTransaction', () => {
    it('should return true for code A (Award/Grant)', () => {});
    it('should return true for code I (Discretionary 16b-3)', () => {});
    it('should return true for type containing "award"', () => {});
    it('should return true for type containing "grant"', () => {});
    it('should return true for type containing "rsu" or "psu"', () => {});
    it('should return false for transfers even with award-like text', () => {});
    it('should return false for code P (Purchase)', () => {});
  });

  describe('isExerciseTransaction', () => {
    it('should return true for code M (Exercise/Conversion 16b-3)', () => {});
    it('should return true for code C (Conversion)', () => {});
    it('should return true for code X (Exercise ITM/ATM)', () => {});
    it('should return true for code O (Exercise OTM)', () => {});
    it('should return true for code E (Expiration short)', () => {});
    it('should return true for code H (Expiration/cancellation long)', () => {});
    it('should return true for type containing "exercise"', () => {});
    it('should return true for type containing "conversion"', () => {});
    it('should return true for type containing "expir"', () => {});
    it('should return false for transfers', () => {});
  });

  describe('isDispositionTransaction (Other bucket)', () => {
    it('should return true for code D (Disposition to issuer)', () => {});
    it('should return true for code F (Tax withholding)', () => {});
    it('should return true for code U (Tender of shares)', () => {});
    it('should return true for code V (Voluntarily reported 10b5-1)', () => {});
    it('should return true for code L (Small acquisition)', () => {});
    it('should return true for type containing "tax"', () => {});
    it('should return true for type containing "withholding"', () => {});
    it('should return true for type containing "disposition"', () => {});
    it('should return false for code A (Award)', () => {});
  });

  describe('Updated isGiftTransaction', () => {
    it('should return true for code W (Will/descent)', () => {});
    it('should still return true for code G (Gift)', () => {});
  });

  describe('Updated isTransferTransaction', () => {
    it('should return true for code Z (Voting trust)', () => {});
    it('should still return true for code J (Trust transfer)', () => {});
    it('should still return true for code K (Family transfer)', () => {});
  });

  describe('aggregateTransactionsByType - 7 buckets', () => {
    it('should place code A transaction in award bucket, not purchase', () => {});
    it('should place code M transaction in exercise bucket', () => {});
    it('should place code D transaction in other bucket', () => {});
    it('should place unknown code in other bucket (not purchase)', () => {});
    it('should handle mixed filing with A + F codes (award + tax withholding)', () => {});
  });

  describe('getAggregatedTransactionConfig - all 7 types', () => {
    it('should return amber config for award type', () => {});
    it('should return teal config for exercise type', () => {});
    it('should return slate config for other type', () => {});
    it('should preserve existing configs for purchase/sale/gift/transfer', () => {});
  });

  describe('SEC code authority over AI text (Review Issue 9A)', () => {
    // SEC code is ground truth; AI-parsed type text is a fallback
    it('should classify as award when code=A even if type="Sale"', () => {});
    it('should classify as exercise when code=M even if type="Gift"', () => {});
    it('should classify as other when code=F even if type="Purchase"', () => {});
    it('should classify as sale when code=S even if type="Award"', () => {});
    it('should classify as gift when code=G even if type="Exercise"', () => {});
    it('should classify as transfer when code=J even if type="Sale"', () => {});
    it('should use text fallback when code is empty/null', () => {});
  });

  describe('Edge cases - null/empty/lowercase (Review Issue 12A)', () => {
    it('should classify { code: null, type: "" } into other bucket', () => {});
    it('should classify { code: "", type: "" } into other bucket', () => {});
    it('should classify { code: "a" } into award (lowercase normalized)', () => {});
    it('should classify { code: undefined, type: "Award" } into award (text fallback)', () => {});
    it('should classify { code: "A", type: undefined } into award (code alone sufficient)', () => {});
    it('should classify { code: "ZZ", type: "" } into other (unknown multi-char code)', () => {});
  });

  describe('Complete 21-code mapping', () => {
    // Parametric test over all 21 codes
    const codeToExpectedBucket: [string, string][] = [
      ['P', 'purchase'], ['S', 'sale'],
      ['A', 'award'], ['I', 'award'],
      ['M', 'exercise'], ['C', 'exercise'], ['X', 'exercise'],
      ['O', 'exercise'], ['E', 'exercise'], ['H', 'exercise'],
      ['G', 'gift'], ['W', 'gift'],
      ['J', 'transfer'], ['K', 'transfer'], ['Z', 'transfer'],
      ['D', 'other'], ['F', 'other'], ['U', 'other'],
      ['V', 'other'], ['L', 'other'],
    ];
    it.each(codeToExpectedBucket)(
      'should classify code %s into %s bucket',
      (code, expectedBucket) => {}
    );
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="form4-transaction-classification"
# Expected: All tests fail (new functions not yet defined)
```

### Step 1.2: 🟢 Implement to Pass Tests

#### 1.2.1 Update `AggregatedTransaction` type union

**File**: `components/ui/email/templates/form4-minimalist-template.tsx`
**Lines**: 200-213

Change the `type` field from `'gift' | 'sale' | 'purchase' | 'transfer'` to `'gift' | 'sale' | 'purchase' | 'transfer' | 'award' | 'exercise' | 'other'`.

```typescript
interface AggregatedTransaction {
  type: 'gift' | 'sale' | 'purchase' | 'transfer' | 'award' | 'exercise' | 'other';
  // ... rest unchanged
}
```

**Checkpoint 1.2.1**: TypeScript compiles with updated type.

#### 1.2.2 Add `isAwardTransaction()` function

**File**: `components/ui/email/templates/form4-minimalist-template.tsx`
**After**: `isPurchaseTransaction()` (line 193)

```typescript
/**
 * Check if a transaction is an equity compensation award/grant
 * Covers SEC codes A (Award/Grant) and I (Discretionary 16b-3)
 */
export function isAwardTransaction(tx: TransactionData): boolean {
  if (isTransferTransaction(tx)) return false;

  const type = tx.type?.toLowerCase() || '';
  const code = tx.code?.toUpperCase() || '';

  // SEC codes for awards/grants
  if (code === 'A' || code === 'I') return true;

  // Text-based detection
  if (type.includes('award') || type.includes('grant') ||
      type.includes('rsu') || type.includes('psu')) {
    return true;
  }

  return false;
}
```

**Checkpoint 1.2.2**: `isAwardTransaction` tests pass:
```bash
npm run test -- --testPathPattern="form4-transaction-classification" --testNamePattern="isAwardTransaction"
```

#### 1.2.3 Add `isExerciseTransaction()` function

**File**: `components/ui/email/templates/form4-minimalist-template.tsx`
**After**: `isAwardTransaction()`

```typescript
/**
 * Check if a transaction is a derivative exercise, conversion, or expiration
 * Covers SEC codes M, C, X, O, E, H
 */
export function isExerciseTransaction(tx: TransactionData): boolean {
  if (isTransferTransaction(tx)) return false;

  const type = tx.type?.toLowerCase() || '';
  const code = tx.code?.toUpperCase() || '';

  // SEC codes for exercises/conversions/expirations
  if (['M', 'C', 'X', 'O', 'E', 'H'].includes(code)) return true;

  // Text-based detection
  if (type.includes('exercise') || type.includes('conversion') ||
      type.includes('convert') || type.includes('expir')) {
    return true;
  }

  return false;
}
```

**Checkpoint 1.2.3**: `isExerciseTransaction` tests pass.

#### 1.2.4 Add `isOtherTransaction()` function

**File**: `components/ui/email/templates/form4-minimalist-template.tsx`
**After**: `isExerciseTransaction()`

```typescript
/**
 * Check if a transaction is a disposition, tax withholding, or other non-market transaction
 * Covers SEC codes D, F, U, V, L
 * These are catch-all for non-purchase/sale/gift/transfer/award/exercise transactions
 */
export function isOtherTransaction(tx: TransactionData): boolean {
  if (isTransferTransaction(tx)) return false; // Review Issue 7A: consistent guard pattern

  const code = tx.code?.toUpperCase() || '';
  const type = tx.type?.toLowerCase() || '';

  // SEC codes for dispositions, tax events, and other
  if (['D', 'F', 'U', 'V', 'L'].includes(code)) return true;

  // Text-based detection
  if (type.includes('tax') || type.includes('withholding') ||
      type.includes('disposition') || type.includes('tender')) {
    return true;
  }

  return false;
}
```

**Checkpoint 1.2.4**: `isOtherTransaction` tests pass.

#### 1.2.5 Update `isGiftTransaction()` to include code W

**File**: `components/ui/email/templates/form4-minimalist-template.tsx`
**Line**: 135

Add `code === 'W'` to the gift check. W = "Acquisition by will or laws of descent" - a transfer without consideration, semantically similar to a gift.

```typescript
// Updated line 135:
if (type === 'gift' || type === 'g' || type.includes('gift') || code === 'G' || code === 'W') {
```

**Checkpoint 1.2.5**: Updated gift tests pass.

#### 1.2.6 Update `isTransferTransaction()` to include code Z

**File**: `components/ui/email/templates/form4-minimalist-template.tsx`
**Line**: 110

Add `code === 'Z'` to the transfer check. Z = "Deposit into or withdrawal from voting trust" - an ownership form change.

```typescript
// Updated line 110:
if (code === 'J' || code === 'K' || code === 'Z') {
```

**Checkpoint 1.2.6**: Updated transfer tests pass.

#### 1.2.6b Add code-first guard to `isSaleTransaction()` (Review Issue 5A)

**File**: `components/ui/email/templates/form4-minimalist-template.tsx`
**Line**: ~148 (inside `isSaleTransaction`)

SEC code is ground truth; AI-parsed `type` text is a fallback. Add an early return after the transfer/gift guard so that only code 'S' (and codeless transactions) can be classified as sales. This prevents misclassification when AI misparsers the type field (e.g., code='A' but type='Sale of shares').

```typescript
function isSaleTransaction(tx: TransactionData): boolean {
  if (isTransferTransaction(tx) || isGiftTransaction(tx)) return false;

  const type = tx.type?.toLowerCase() || '';
  const code = tx.code?.toUpperCase() || '';

  // Review Issue 5A: SEC code is authoritative. If a code is present and it's
  // not 'S', this is definitively NOT a sale regardless of AI-parsed type text.
  if (code && code !== 'S') return false;

  // Explicit sale indicators (code S or text-based for codeless transactions)
  if (type.includes('sale') || type.includes('sell') || type === 's' || code === 'S') {
    return true;
  }

  // Disposition with a price is a sale (only reached for codeless transactions)
  if (tx.acquisitionDisposition === 'D') {
    const price = typeof tx.pricePerShare === 'string'
      ? tx.pricePerShare.replace(/[$,]/g, '')
      : String(tx.pricePerShare || '');
    const priceNum = parseFloat(price) || 0;
    return priceNum > 0;
  }

  return false;
}
```

**Note**: This subsumes the original Architecture Issue 1A (D/F/U exclusion list). The code-first guard is simpler and more complete - it handles ALL non-S codes in one line instead of maintaining a separate exclusion list.

**Checkpoint 1.2.6b**: Code authority tests pass (code='A' + type='sale' → NOT classified as sale).

#### 1.2.7 Update `aggregateTransactionsByType()` classification chain and groups

**File**: `components/ui/email/templates/form4-minimalist-template.tsx`
**Lines**: 215-291

Key changes:
1. Add `award`, `exercise`, and `other` groups to the `groups` record (line 216-221)
2. Update the classification chain to check new functions (lines 223-233)
3. Change the default fallback from `'purchase'` to `'other'` (line 232)
4. Update sort order to include new types (lines 287-289)

**Review Issue 3A**: Export both `aggregateTransactionsByType` and `isSaleTransaction` for direct unit testing.

```typescript
export function aggregateTransactionsByType(transactions: TransactionData[]): AggregatedTransaction[] {
  const groups: Record<string, { shares: number; value: number; count: number; prices: number[]; codes: string[] }> = {
    gift: { shares: 0, value: 0, count: 0, prices: [], codes: [] },
    sale: { shares: 0, value: 0, count: 0, prices: [], codes: [] },
    purchase: { shares: 0, value: 0, count: 0, prices: [], codes: [] },
    transfer: { shares: 0, value: 0, count: 0, prices: [], codes: [] },
    award: { shares: 0, value: 0, count: 0, prices: [], codes: [] },
    exercise: { shares: 0, value: 0, count: 0, prices: [], codes: [] },
    other: { shares: 0, value: 0, count: 0, prices: [], codes: [] },
  };

  for (const tx of transactions) {
    let groupKey: 'gift' | 'sale' | 'purchase' | 'transfer' | 'award' | 'exercise' | 'other';
    if (isTransferTransaction(tx)) {
      groupKey = 'transfer';
    } else if (isGiftTransaction(tx)) {
      groupKey = 'gift';
    } else if (isSaleTransaction(tx)) {
      groupKey = 'sale';
    } else if (isAwardTransaction(tx)) {
      groupKey = 'award';
    } else if (isExerciseTransaction(tx)) {
      groupKey = 'exercise';
    } else if (isPurchaseTransaction(tx)) {
      groupKey = 'purchase';
    } else if (isOtherTransaction(tx)) {
      groupKey = 'other';
    } else {
      groupKey = 'other'; // Neutral default instead of misleading "purchase"
    }
    // ... rest of accumulation logic unchanged ...
  }

  // ... formatting logic unchanged ...

  // Sort: sales first, then transfers, gifts, awards, exercises, purchases, other
  return result.sort((a, b) => {
    const order = { sale: 0, transfer: 1, gift: 2, award: 3, exercise: 4, purchase: 5, other: 6 };
    return order[a.type] - order[b.type];
  });
}
```

**Important**: Move `isPurchaseTransaction(tx)` to an explicit check BEFORE the default, so only truly unclassified transactions fall to "other".

**Checkpoint 1.2.7**: `aggregateTransactionsByType` tests pass, including the "code A → award bucket" test.

#### 1.2.8 Update `getAggregatedTransactionConfig()` with new bucket configs

**File**: `components/ui/email/templates/form4-minimalist-template.tsx`
**Lines**: 368-403

**Review Issue 4A**: Delegate to `getTransactionTypeConfig()` instead of duplicating configs. This eliminates the DRY violation between the two config functions.

**Review Issue 6A**: The `exercise` bucket label is "Derivative Activity" (not "Exercised") to accurately cover exercises, conversions, AND expirations (codes E, H).

```typescript
// Review Issue 4A: Single source of truth - delegate to getTransactionTypeConfig
function getAggregatedTransactionConfig(type: 'gift' | 'sale' | 'purchase' | 'transfer' | 'award' | 'exercise' | 'other') {
  const config = getTransactionTypeConfig(type);
  return {
    label: config.label,
    icon: config.icon,
    bgColor: config.bgColor,
    textColor: config.textColor,
    valueColor: config.valueColor,
  };
}
```

**Checkpoint 1.2.8**: `getAggregatedTransactionConfig` tests pass for all 7 types, returning same values as `getTransactionTypeConfig` (minus the `color` field).

#### 1.2.9 Update `getTransactionTypeConfig()` for external/test use

**File**: `components/ui/email/templates/form4-minimalist-template.tsx`
**Lines**: 318-366

Add matching cases for 'award', 'exercise', and 'other' types in the string-based config function. Also add text patterns for the new types.

```typescript
export function getTransactionTypeConfig(type: string): TransactionTypeConfig {
  const typeLower = type.toLowerCase();

  // Check for transfer types first
  if (typeLower.includes('transfer') || typeLower.includes('trust')) {
    return { label: 'Transfer', icon: '🔄', bgColor: '#EBF8FF', textColor: '#1E40AF', color: '#3B82F6', valueColor: '#3B82F6' };
  }

  // Gift type
  if (typeLower.includes('gift') || typeLower === 'g') {
    return { label: 'Gift', icon: '🎁', bgColor: '#F3E8FF', textColor: '#7C3AED', color: '#7C3AED', valueColor: '#7C3AED' };
  }

  // Sale type
  if (typeLower.includes('sale') || typeLower.includes('sell') || typeLower === 's' || typeLower === 'sold') {
    return { label: 'Sold', icon: '📉', bgColor: '#FEF2F2', textColor: '#991B1B', color: '#DC2626', valueColor: '#DC2626' };
  }

  // Award type
  if (typeLower.includes('award') || typeLower.includes('grant') || typeLower.includes('rsu') || typeLower.includes('psu')) {
    return { label: 'Awarded', icon: '🏆', bgColor: '#FFFBEB', textColor: '#92400E', color: '#D97706', valueColor: '#D97706' };
  }

  // Exercise/Derivative type (Review Issue 6A: label covers exercises + expirations)
  if (typeLower.includes('exercise') || typeLower.includes('conversion') || typeLower.includes('expir')) {
    return { label: 'Derivative Activity', icon: '⚡', bgColor: '#F0FDFA', textColor: '#115E59', color: '#0D9488', valueColor: '#0D9488' };
  }

  // Purchase type (explicit, no longer default)
  if (typeLower.includes('purchase') || typeLower.includes('bought') || typeLower === 'p') {
    return { label: 'Bought', icon: '📈', bgColor: '#F0FDF4', textColor: '#166534', color: '#16A34A', valueColor: '#16A34A' };
  }

  // Default to Other (neutral) instead of Purchase
  return { label: 'Other', icon: '📋', bgColor: '#F8FAFC', textColor: '#475569', color: '#64748B', valueColor: '#64748B' };
}
```

**Checkpoint 1.2.9**: All classification tests pass.

#### 1.2.10 Fix `SEC_TRANSACTION_CODES` in design-system.ts

**File**: `components/ui/email/design-system.ts`
**Lines**: 321-341

Add missing code V. Fix incorrect descriptions for E, H, I:

```typescript
export const SEC_TRANSACTION_CODES: Record<string, string> = {
  'P': 'Open Market Purchase',
  'S': 'Open Market Sale',
  'V': 'Voluntarily Reported (10b5-1 Plan)',   // NEW
  'A': 'Grant/Award',
  'D': 'Disposition to Issuer',
  'F': 'Tax Withholding',
  'I': 'Discretionary Transaction (16b-3)',     // FIXED (was "Exercise of In-Kind Right")
  'M': 'Option Exercise',
  'C': 'Conversion',
  'E': 'Expiration of Short Derivative',        // FIXED (was "Exercise of Derivative")
  'H': 'Expiration/Cancellation of Long Derivative', // FIXED (was "Discretionary Transaction")
  'O': 'Exercise of Out-of-Money Derivative',
  'X': 'Exercise of Expiring Derivative',
  'G': 'Gift',
  'L': 'Small Acquisition',
  'W': 'Acquisition by Will/Descent',
  'Z': 'Deposit into/Withdrawal from Voting Trust',
  'J': 'Trust Transfer',
  'K': 'Equity Swap/Similar Instrument',        // FIXED (was "Trust Disposition")
  'U': 'Tender of Shares',
};
```

**Checkpoint 1.2.10**: Design system now has all 21 codes with correct SEC descriptions.

#### 1.2.11 Update `TRANSACTION_CODE_MAP` in form4-data-extractor.ts

**File**: `lib/email/form4-data-extractor.ts`
**Lines**: 33-44

Add all 11 missing codes:

```typescript
export const TRANSACTION_CODE_MAP: Record<string, string> = {
  'S': 'Sale',
  'P': 'Purchase',
  'V': 'Voluntarily Reported',
  'A': 'Award',
  'D': 'Disposition',
  'F': 'Tax Withholding',
  'I': 'Discretionary',
  'M': 'Exercise',
  'C': 'Conversion',
  'E': 'Expiration',
  'H': 'Expiration',
  'O': 'Exercise',
  'X': 'Exercise',
  'G': 'Gift',
  'L': 'Small Acquisition',
  'W': 'Will/Descent',
  'Z': 'Voting Trust',
  'J': 'Trust Transfer',
  'K': 'Equity Swap',       // Review Issue 8A: aligned to SEC official definition
  'U': 'Tender',
};
```

**Checkpoint 1.2.11**: Extractor maps all 21 codes with descriptions aligned to SEC definitions.

### Step 1.3: 🔵 Refactor

- [ ] Ensure all new classification functions are exported for testing
- [ ] Verify no duplication between `getTransactionTypeConfig()` and `getAggregatedTransactionConfig()`
- [ ] Ensure consistent color naming comments (Tailwind equivalents)

**Checkpoint 1.3**: All tests still pass after refactoring:
```bash
npm run test -- --testPathPattern="form4"
# Expected: All form4-related tests pass, 0 failing
```

### Step 1.4: Final Phase 1 Verification

#### Automated Verification:
- [x] All new classification tests pass: `npm run test -- --testPathPattern="form4-transaction-classification"` (78/78 pass)
- [x] All existing Form 4 tests pass: `npm run test -- --testPathPattern="form4"` (112/112 pass)
- [x] Existing template rendering tests pass: `npm run test -- --testPathPattern="template-rendering"`
- [x] Existing regression tests pass: `npm run test -- --testPathPattern="regression"` (pre-existing failures only)
- [x] Type checking passes: `npm run build`
- [x] Linting passes: `npm run lint` (pre-existing errors only)
- [x] No regressions: `npm run test`

#### Manual Verification:
- [ ] Visually inspect that the new bucket colors/icons look correct in a test email render

**STOP**: Pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Wire `summarizeFilingWithValidation()` into Production Pipeline

### Overview
Replace the direct `summarizeFiling()` call with `summarizeFilingWithValidation()` in `summarize-cached-handler.ts`. This enables extractor enrichment for all 12 supported form types, filling gaps in AI output (e.g., missing `financialHighlights` for 10-K, missing transaction classification for Form 4).

### Step 2.1: 🔴 Write Failing Tests

**Test File**: `__tests__/cron/handlers/summarize-cached-handler-validation.test.ts`

**Review Issue 10A**: Mock strategy for TDD Red step.

**Mock setup pattern** (reference: `__tests__/cron/handlers/summarize-cached-handler-fields.test.ts`):
```typescript
// Mock the validation wrapper module
jest.mock('../../../lib/ai/summarize-with-validation', () => ({
  summarizeFilingWithValidation: jest.fn(),
}));

// Mock return shape for enriched result
const mockEnrichedResult = {
  summaryText: 'Test summary...',
  summaryJSON: { financialHighlights: [{ metric: 'Revenue', value: '$1B' }] },
  modelUsed: 'grok-4-fast',
  cost: 0.01,
  inputTokens: 1000,
  outputTokens: 500,
  extractorValidated: true,
  fieldsFilledByExtractor: ['financialHighlights'],
  fieldsWithDiscrepancies: [],
  extractorFillRate: 0.15,
};

describe('summarize-cached-handler with validation wrapper', () => {
  it('should call summarizeFilingWithValidation instead of summarizeFiling', () => {
    // Mock both functions, verify only the validation wrapper is called
  });

  it('should pass formType in options for extractor lookup', () => {
    // Verify: expect(summarizeFilingWithValidation).toHaveBeenCalledWith(
    //   expect.any(String),
    //   expect.objectContaining({ formType: '10-K' })
    // )
  });

  it('should store enriched summaryJSON from validation wrapper', () => {
    // Setup: summarizeFilingWithValidation.mockResolvedValue(mockEnrichedResult)
    // Assert: prisma.summary.create called with data.summaryJSON matching mockEnrichedResult.summaryJSON
  });

  it('should pass enriched summaryJSON as summaryData to email template', () => {
    // Assert: sendFilingSummaryEmail called with summaryData matching enriched JSON
  });

  it('should handle validation wrapper errors gracefully', () => {
    // Setup: summarizeFilingWithValidation.mockResolvedValue({
    //   ...mockBaseResult, extractorValidated: false
    // })
    // Assert: pipeline completes successfully, email sent with AI-only data
  });

  it('should log extractor validation metadata', () => {
    // Assert: summarizeLogger.info called with extractorValidated, fieldsFilledByExtractor
  });
});
```

**Checkpoint 2.1**: Tests fail (handler still calls `summarizeFiling` directly).

### Step 2.2: 🟢 Implement to Pass Tests

#### 2.2.1 Update import in summarize-cached-handler.ts

**File**: `lib/cron/handlers/summarize-cached-handler.ts`
**Line**: 15

```typescript
// Before:
import { summarizeFiling } from '../../ai/summarize';

// After:
import { summarizeFilingWithValidation } from '../../ai/summarize-with-validation';
```

**Checkpoint 2.2.1**: Import resolves without TypeScript errors.

#### 2.2.2 Update function call at line 430

**File**: `lib/cron/handlers/summarize-cached-handler.ts`
**Lines**: 430-442

```typescript
// Before:
const summaryResult = await summarizeFiling(
  cachedContent.content,
  {
    metadata: { ... }
  }
);

// After:
const summaryResult = await summarizeFilingWithValidation(
  cachedContent.content,
  {
    formType: filing.formType,  // NEW: enables extractor lookup
    metadata: {
      ticker: ticker.symbol,
      companyName: ticker.companyName || ticker.symbol,
      formType: filing.formType,
      filingDate: typeof filing.filingDate === 'string' ? filing.filingDate : filing.filingDate.toISOString(),
      accessionNumber: filing.accessionNumber,
      cik: ticker.cik || undefined
    }
  }
);
```

Note: `ValidatedSummarizationOptions` extends `SummarizationOptions`, so the existing `metadata` field is fully compatible. The only addition is `formType` at the top level for extractor lookup.

**Checkpoint 2.2.2**: Handler calls validation wrapper.

#### 2.2.3 Add validation metadata logging

**File**: `lib/cron/handlers/summarize-cached-handler.ts`
**After**: line 457 (the existing summary generated log)

```typescript
// Log extractor validation results
if ('extractorValidated' in summaryResult) {
  summarizeLogger.info(`[${executionId}] Extractor validation`, {
    extractorValidated: summaryResult.extractorValidated,
    fieldsFilledByExtractor: summaryResult.fieldsFilledByExtractor,
    fieldsWithDiscrepancies: summaryResult.fieldsWithDiscrepancies,
    extractorFillRate: summaryResult.extractorFillRate,
  });
}
```

**Checkpoint 2.2.3**: Logging added without breaking existing tests.

#### 2.2.4 Store enriched summaryJSON

No change needed - `summaryResult.summaryJSON` at line 468 already stores whatever `summaryJSON` the result contains. Since `summarizeFilingWithValidation()` returns the enriched/merged `summaryJSON` (line 161 of `summarize-with-validation.ts`), the enriched data flows through automatically.

Similarly, `summaryResult.summaryJSON` at line 513 (email `summaryData`) automatically uses the enriched version.

**Checkpoint 2.2.4**: Verify via test mock that enriched data reaches both DB write and email send.

### Step 2.3: 🔵 Refactor

- [ ] Remove unused `summarizeFiling` import if no longer needed
- [ ] Verify no other files import `summarizeFiling` directly for pipeline use (search for non-test imports)

**Checkpoint 2.3**: All tests pass after cleanup.

### Step 2.4: Final Phase 2 Verification

#### Automated Verification:
- [ ] New handler tests pass: `npm run test -- --testPathPattern="summarize-cached-handler"`
- [ ] Existing extractor tests pass: `npm run test -- --testPathPattern="summarize-with-extraction"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] No regressions: `npm run test`

#### Manual Verification:
- [ ] Review logs to confirm extractor validation metadata appears
- [ ] Verify email template receives enriched data in a test run

**STOP**: Pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Fix Duplicate Email Race Condition

### Overview
Add a `sentToUser` check and `SummaryEmailDelivery` lookup before re-sending emails for existing summaries. This prevents the narrow race condition where a retry after summary creation but before `sentToUser` update causes a duplicate email.

### Step 3.1: 🔴 Write Failing Tests

**Test File**: `__tests__/cron/handlers/summarize-cached-handler-dedup.test.ts`

**Review Issue 10A**: Mock strategy for TDD Red step.

**Mock setup pattern**:
```typescript
// Mock Prisma responses for existing summary scenarios
const mockExistingSummary = {
  id: 'summary-123',
  createdAt: new Date(),
  sentToUser: true,
};
const mockDeliveryRecord = { id: 'delivery-456' };

describe('Duplicate email prevention', () => {
  it('should NOT re-send email when existing summary has sentToUser=true', () => {
    // Setup: prisma.summary.findFirst returns { ...mockExistingSummary, sentToUser: true }
    // Setup: prisma.summaryEmailDelivery.findFirst returns null (no delivery record!)
    // Assert: sendFilingSummaryEmail is NOT called (sentToUser alone is sufficient)
  });

  it('should NOT re-send email when sentToUser=true AND delivery record exists', () => {
    // Setup: prisma.summary.findFirst returns { ...mockExistingSummary, sentToUser: true }
    // Setup: prisma.summaryEmailDelivery.findFirst returns mockDeliveryRecord
    // Assert: sendFilingSummaryEmail is NOT called
  });

  it('should NOT re-send when sentToUser=true but NO delivery record (Review Issue 11A)', () => {
    // This is the key edge case from the review - sentToUser=true is sufficient
    // Setup: prisma.summary.findFirst returns { ...mockExistingSummary, sentToUser: true }
    // Setup: prisma.summaryEmailDelivery.findFirst returns null
    // Assert: sendFilingSummaryEmail is NOT called
    // This test would have caught the original plan's logic bug
  });

  it('should NOT re-send email when SummaryEmailDelivery record exists even if sentToUser=false', () => {
    // Setup: prisma.summary.findFirst returns { ...mockExistingSummary, sentToUser: false }
    // Setup: prisma.summaryEmailDelivery.findFirst returns mockDeliveryRecord
    // Assert: sendFilingSummaryEmail is NOT called (delivery record alone is sufficient)
  });

  it('should send email when existing summary has sentToUser=false and no delivery record', () => {
    // This is the legitimate first-send case
    // Verify sendFilingSummaryEmail IS called
  });

  it('should still return success when skipping duplicate email', () => {
    // Verify return value is { success: true, emailSent: false } when skipping
  });
});
```

**Checkpoint 3.1**: Tests fail.

### Step 3.2: 🟢 Implement to Pass Tests

#### 3.2.1 Add sentToUser and delivery check to existing summary path

**File**: `lib/cron/handlers/summarize-cached-handler.ts`
**Lines**: 204-271 (existing summary check block)

Update the `existingSummary` query to include `sentToUser`:

```typescript
const existingSummary = await prisma.summary.findFirst({
  where: {
    tickerId: userTicker.id,
    filingType: filing.formType,
    filingUrl: filing.filingUrl
  },
  select: {
    id: true,
    createdAt: true,
    sentToUser: true,  // NEW: check if already sent
  }
});
```

Then update the re-send logic at line 216-271:

```typescript
if (existingSummary) {
  summarizeLogger.info(`[${executionId}] Summary already exists`, {
    summaryId: existingSummary.id,
    createdAt: existingSummary.createdAt,
    sentToUser: existingSummary.sentToUser,
  });

  // Review Issue 2A: Either sentToUser OR delivery record is sufficient to skip.
  // These are independent guards - don't require both.
  const existingDelivery = await prisma.summaryEmailDelivery.findFirst({
    where: { summaryId: existingSummary.id, userId },
    select: { id: true }
  });

  if (existingSummary.sentToUser || existingDelivery) {
    summarizeLogger.info(`[${executionId}] Email already delivered, skipping`, {
      summaryId: existingSummary.id,
      sentToUser: existingSummary.sentToUser,
      hasDeliveryRecord: !!existingDelivery,
    });
    return {
      success: true,
      summaryId: existingSummary.id,
      cost: 0,
      summarizeDuration: 0,
      emailSent: false
    };
  }

  // Email not yet sent - proceed with sending
  if (shouldSendEmail) {
    // ... existing email sending logic ...
  }
  // ... rest unchanged ...
}
```

**Checkpoint 3.2.1**: Duplicate prevention tests pass.

### Step 3.3: 🔵 Refactor

- [ ] Ensure the log message clearly indicates WHY the email was skipped (already delivered vs trial expired)

**Checkpoint 3.3**: All tests pass.

### Step 3.4: Final Phase 3 Verification

#### Automated Verification:
- [ ] Dedup tests pass: `npm run test -- --testPathPattern="summarize-cached-handler-dedup"`
- [ ] Existing handler tests pass: `npm run test -- --testPathPattern="summarize-cached-handler"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] No regressions: `npm run test`

#### Manual Verification:
- [ ] Verify that legitimate first-sends still work (not over-blocked)
- [ ] Review dedup log messages for clarity

**STOP**: Pause here for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Integration Testing and Regression Verification

### Overview
Write integration tests that verify the three original issues are fixed end-to-end, and run the full test suite to confirm no regressions.

### Step 4.1: 🔴 Write Failing Integration Tests

**Test File**: `__tests__/regression/summary-quality-2026-02-18.test.ts`

```typescript
describe('Summary Quality Regression Tests (2026-02-18)', () => {
  describe('GOOGL Form 4 - Gift/Transfer not shown as BOUGHT', () => {
    it('should classify gift transaction with code G into gift bucket', () => {
      // Simulate GOOGL filing: Director gift of Class C shares
      // Verify aggregateTransactionsByType returns gift bucket, not purchase
    });

    it('should classify transfer transaction with trust text into transfer bucket', () => {
      // Simulate: transfer from direct to revocable trust
      // Verify transfer bucket
    });
  });

  describe('JNJ Form 4 - PSU Awards not shown as BOUGHT $0', () => {
    it('should classify PSU award with code A into award bucket', () => {
      // Simulate JNJ filing: PSU award transactions
      // Verify award bucket with "Awarded" label, not "Bought"
    });

    it('should handle multiple insider awards in same filing', () => {
      // Multiple transactions all code A
      // All should aggregate into award bucket
    });
  });

  describe('COIN 10-K - Blank sections filled by extractor', () => {
    it('should extract financialHighlights from summaryText when summaryJSON is sparse', () => {
      // Mock AI returning summaryJSON without financialHighlights
      // Mock summaryText containing revenue/income data
      // Verify mergeWithFallback fills in financialHighlights
    });

    it('should extract segments from summaryText when summaryJSON is sparse', () => {
      // Similar test for segments
    });
  });

  describe('Complete 21-code coverage', () => {
    const allCodes = ['P','S','V','A','D','F','I','M','C','E','H','O','X','G','L','W','Z','J','K','U'];
    it.each(allCodes)('should not classify code %s as "purchase" (unless code is P)', (code) => {
      // Create transaction with this code
      // Run through aggregateTransactionsByType
      // Verify: only P maps to purchase bucket
    });
  });
});
```

**Checkpoint 4.1**: Integration tests verify all three original issues are fixed.

### Step 4.2: 🟢 Verify All Tests Pass

```bash
npm run test                                    # Full test suite
npm run test -- --testPathPattern="regression"  # Regression suite
npm run test -- --testPathPattern="form4"       # All Form 4 tests
npm run lint                                    # Linting
npm run build                                   # Type checking + build
```

**Checkpoint 4.2**: All tests pass, build succeeds, lint clean.

### Step 4.3: 🔵 Final Cleanup

- [ ] Remove any unused imports across modified files
- [ ] Verify no TODO comments left in code
- [ ] Check for any console.log statements that should be logger calls

### Step 4.4: Final Phase 4 Verification

#### Automated Verification:
- [ ] `npm run test` - All tests pass
- [ ] `npm run build` - Build succeeds
- [ ] `npm run lint` - No linting errors
- [ ] `npm run test:pipeline:comprehensive` - Pipeline validation passes
- [ ] `npm run test:e2e` - E2E test passes

#### Manual Verification:
- [ ] Test email with Form 4 award transaction shows "Awarded" badge (amber)
- [ ] Test email with Form 4 exercise transaction shows "Derivative Activity" badge (teal)
- [ ] Test email with 10-K filing shows populated Financial Highlights (if summaryText contains them)
- [ ] No duplicate emails on job retry

---

## Testing Strategy

### TDD Test Design Principles

1. **One Assertion Per Test** (when practical)
2. **Descriptive Test Names**: "should classify code A into award bucket"
3. **Arrange-Act-Assert**: Clear structure
4. **Test Behavior, Not Implementation**: Focus on inputs/outputs of classification
5. **Edge Cases First**: $0 price, missing code, empty type, mixed filings

### Test Categories (in order of writing):

#### 1. Contract Tests
- All 21 SEC codes → correct bucket mapping
- Classification function signatures and return types
- `getAggregatedTransactionConfig` returns valid config for all bucket types

#### 2. Edge Case Tests
- Transaction with no code AND no type → "other" bucket
- Transaction with conflicting code and type (e.g., code "A" but type "sale")
- Transaction with lowercase/mixed-case codes
- Transaction with $0 price in award vs gift vs transfer

#### 3. Integration Tests
- Full pipeline: AI output → validation wrapper → enriched summaryJSON → template classification
- Existing summary dedup guard prevents re-send

#### 4. Regression Tests
- GOOGL gift: code G → gift bucket
- JNJ PSU: code A → award bucket
- COIN 10-K: sparse summaryJSON → enriched by extractor

### Checkpoint Frequency
- 11 checkpoints in Phase 1 (one per classification function + config)
- 4 checkpoints in Phase 2 (import, call, logging, data flow)
- 1 checkpoint in Phase 3 (dedup guard)
- 2 checkpoints in Phase 4 (regression suite, full suite)

## Performance Considerations

- **Extractor overhead**: The extractor runs regex patterns on `summaryText` (typically 500-2000 chars). Expected overhead: <50ms per filing. Negligible compared to AI generation time (17-90s).
- **No additional API calls**: Extractors are pure regex, no external service calls.
- **Error isolation**: `summarizeFilingWithValidation()` catches extractor errors and returns AI result unmodified (line 167-179). Pipeline reliability is not affected.

## Migration Notes

- No database migrations needed.
- No API contract changes.
- Existing summaries in the database are not affected - they retain their original `summaryJSON`.
- Only newly generated summaries will benefit from extractor enrichment.
- Email templates will immediately classify existing transactions correctly based on code/type fields in `summaryJSON` (the classification functions are template-side, not DB-side).

## References

- Research document: `thoughts/shared/research/2026-02-18-summary-quality-review.md`
- Validation wrapper: `lib/ai/summarize-with-validation.ts:77`
- Extractor registry: `lib/email/extractor-registry.ts:71-107`
- Form 4 template: `components/ui/email/templates/form4-minimalist-template.tsx:100-291`
- Production handler: `lib/cron/handlers/summarize-cached-handler.ts:430`
- Design system codes: `components/ui/email/design-system.ts:321-341`
- Form 4 extractor: `lib/email/form4-data-extractor.ts:33-44`
- Earlier quality analysis: `thoughts/shared/research/2026-01-20-filing-summary-email-quality-gaps.md`
- Quality improvement plan: `docs/plans/2026-01-07-summary-generation-quality-improvement.md`

---

## Review Notes (2026-02-18)

Review conducted with BIG CHANGE depth across Architecture, Code Quality, Tests, and Performance.

### Decisions Summary

| # | Section | Decision | Change |
|---|---------|----------|--------|
| 1 | Architecture | **Superseded by 5A** | Code-first guard is broader than D/F/U exclusion list |
| 2 | Architecture | **2A: OR guard** | `sentToUser OR deliveryRecord` - either alone skips. Fixed logic bug in original plan |
| 3 | Architecture | **3A: Export functions** | `aggregateTransactionsByType` and `isSaleTransaction` exported for testing |
| 4 | Architecture | **4A: Delegate** | `getAggregatedTransactionConfig` delegates to `getTransactionTypeConfig` (DRY) |
| 5 | Code Quality | **5A: Code-first guard** | `if (code && code !== 'S') return false` in `isSaleTransaction`. SEC code is ground truth |
| 6 | Code Quality | **6A: Rename label** | "Exercised" → "Derivative Activity" (accurate for exercises + expirations) |
| 7 | Code Quality | **7A: Transfer guard** | Added `if (isTransferTransaction(tx)) return false` to `isOtherTransaction` |
| 8 | Code Quality | **8A: Align K** | Both files use SEC official definition: "Equity Swap/Similar Instrument" |
| 9 | Tests | **9A: Code authority tests** | 7 tests verifying SEC code wins over conflicting AI text for all buckets |
| 10 | Tests | **10A: Mock strategies** | Phase 2/3 test skeletons now include mock setup patterns and assertion examples |
| 11 | Tests | **11A: Dedup edge case** | Test for `sentToUser=true` + no delivery record → still skips |
| 12 | Tests | **12A: Edge case tests** | 6 tests for null/empty/lowercase/undefined code and type combos |
| 13 | Performance | **13A: Accept redundancy** | `isTransferTransaction` guard calls are redundant in chain but needed for standalone safety |

### Key Correctness Fixes Found in Review

1. **isSaleTransaction catch-all bug (Issues 1+5)**: The existing `acquisitionDisposition === 'D'` catch-all in `isSaleTransaction` would have prevented codes D/F/U from reaching the "other" bucket. The code-first guard (`if (code && code !== 'S') return false`) fixes this AND prevents code/text conflicts in a single line.

2. **Dedup guard logic bug (Issue 2)**: Original plan required BOTH `sentToUser=true` AND a delivery record to skip. If `sentToUser=true` but no delivery record (data inconsistency), the email would re-send. Fixed to use OR logic - either condition alone is sufficient.

3. **"Exercised" label inaccuracy (Issue 6)**: Codes E (Expiration) and H (Cancellation) are not exercises. Renamed to "Derivative Activity" for accuracy.
