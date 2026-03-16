# Fix Form 4 Email Summary Systemic Issues

**Date**: 2026-03-13
**Branch**: worktree-summary-enhancements
**Repository**: tldrsec-ai

## Context

After PR #361 (merged March 10, deployed 07:52 UTC), users still receive emails with:
1. **Duplicate emails** for the same filing (2 emails 5-8 min apart)
2. **Wrong transaction badges** ("BOUGHT $0 / 0 shares" for awards/exercises)
3. **Missing transaction cards** entirely (derivative-only filings)
4. **Blank ownership impact** section
5. **Conflicting info** (summary text says "sold" but badge says "bought")
6. **Stale data** from pre-deployment summaries served via shared cache

Root cause analysis identified 6 bugs across 4 files.

---

## Phase 1: Fix Duplicate Emails (CRITICAL)

**File**: `lib/cron/handlers/summarize-cached-handler.ts`

### Bug 1A: Existing summary re-send path doesn't track delivery (lines 246-270)

When a Summary exists but email wasn't sent yet, the handler sends the email at line 255 but does NOT update `sentToUser = true` or create a `SummaryEmailDelivery` record. Next cron cycle, the dedup check (line 231) passes again and sends another email.

**Fix**: After `sendFilingSummaryEmail` succeeds (after line 261), add tracking updates matching the pattern at lines 398-420 (shared summary path):
- `prisma.summary.update({ sentToUser: true, totalEmailsSent: { increment: 1 } })`
- `prisma.summaryEmailDelivery.create({ summaryId, userId, emailAddress, deliveryStatus: 'sent' })`
- Wrap in try/catch so tracking failures don't block success return

### Bug 1B: Shared summary concurrent creation race condition (line 330)

Two concurrent jobs for the same user+filing can both find a shared summary and both try `prisma.summary.create`. Second create fails with P2002 unique constraint violation (`@@unique([tickerId, filingUrl])`). Error is uncaught.

**Fix**: Wrap `prisma.summary.create` (line 330) in try/catch:
- Catch P2002 errors via `(error as any).code === 'P2002'`
- On P2002: re-read the existing summary, check if email already sent, skip if so
- Re-throw non-P2002 errors

---

## Phase 2: Fix Transaction Classification + Missing summaryData (HIGH)

### Bug 2: `isPurchaseTransaction` catch-all (form4-minimalist-template.tsx:196-198)

```typescript
// BUG: catches ALL codeless acquisitions, not just purchases
if (tx.acquisitionDisposition === 'A') {
  return true;
}
```

Comment says "with a price" but code doesn't check price. Codeless stock option awards (`A/D='A'`, `price=$0`) get classified as "purchase" instead of falling through.

**Fix**: Add price check matching the pattern already used by `isSaleTransaction` (lines 167-173):
```typescript
if (tx.acquisitionDisposition === 'A') {
  const price = typeof tx.pricePerShare === 'string'
    ? tx.pricePerShare.replace(/[$,]/g, '')
    : String(tx.pricePerShare || '');
  const priceNum = parseFloat(price) || 0;
  return priceNum > 0;
}
```

Result: $0 codeless acquisitions fall to next checks. Non-zero codeless acquisitions classified as "purchase". All coded transactions unaffected (code-based classification fires first).

**Also**: Add 'stock option', 'option award', 'option grant' keywords to `isAwardTransaction` text fallback (line ~216-220) so derivative grants with type text mentioning "option" classify as "award":
```typescript
if (type.includes('award') || type.includes('grant') ||
    type.includes('rsu') || type.includes('psu') ||
    type.includes('restricted stock') ||
    type.includes('stock option') || type.includes('option award') || type.includes('option grant')) {
  return true;
}
```

### Bug 3: Existing summary re-send missing summaryData (summarize-cached-handler.ts:250-262)

The query at line 250 selects only `summaryText` (not `summaryJSON`), and the email call at line 255 doesn't pass `summaryData`. Template falls back to text extraction only.

**Fix**:
1. Add `summaryJSON: true` to the `findUnique` select (line 252)
2. Add `summaryData: existingSummaryFull?.summaryJSON as Record<string, unknown> | undefined` to the `sendFilingSummaryEmail` call

---

## Phase 3: Derivative Transaction Handling + Ownership Impact (MEDIUM)

### Bug 4: Derivative-only filings show no transaction cards

VRT stock option grants (Table II only, no Table I entries) produce empty transaction arrays.

**Fix A** - `lib/ai/prompts/unified-prompts.ts`: Add explicit Table II derivative guidance to Form 4 extraction rules (after the existing "POST-TRANSACTION OWNERSHIP" section, ~line 1035):
- Stock option grants: `code='A'`, `type='Award/Grant'`, `shares=[number]`, `pricePerShare='$0'`
- Option exercises: `code='M'`, `type='Exercise'`
- If filing has ONLY Table II entries, MUST still populate transactions array
- `sharesOwnedFollowing` for Table II = Column 11 (derivative securities remaining)

**Fix B** - Update `sharesOwnedFollowing` schema description (line 340) to clarify it can come from Table I Column 5 OR Table II Column 11.

### Bug 5: Blank ownership impact

`newStake` derivation in `response-parser.ts:210-223` fails when `sharesOwnedFollowing` is missing. For derivative-only filings, the derived value represents derivative security count, not equity shares.

**Fix**: In the newStake derivation, detect if ALL transactions are derivative-type (codes M, C, X, O, E, H, or A with $0 price). If so, suffix with "derivative securities" instead of "shares". Non-derivative filings unchanged.

---

## Phase 4: Handle Stale Pre-Deployment Summaries (LOW)

**File**: `lib/cron/handlers/summarize-cached-handler.ts`

When shared summary path (line 299-319) finds a pre-March-10 summary lacking `code` fields, re-normalize the `summaryJSON` through the response parser before reuse.

**Fix**: After finding `sharedSummary`, check if any transaction lacks `code`. If so, run `parseResponse()` on the JSON to fill in missing fields via code inference, field aliasing, and ownership derivation. Use the normalized JSON for the new Summary record and email. Use static import at top of file.

---

## Phase 5: Regression Tests

| Test | File | Validates |
|------|------|-----------|
| Re-send path creates delivery record | `__tests__/cron/handlers/` (extend existing) | Bug 1A |
| Re-send path passes summaryData | Same | Bug 3 |
| Shared summary P2002 race handled | New test file | Bug 1B |
| Codeless $0 acquisition != purchase | `__tests__/email/form4-transaction-classification.test.ts` | Bug 2 |
| Codeless priced acquisition = purchase | Same | Bug 2 |
| Option keyword classifies as award | Same | Bug 2 |
| Derivative-only filing produces transactions | New: `form4-derivative-handling.test.ts` | Bug 4 |
| Derivative newStake says "derivative securities" | Same | Bug 5 |

---

## Files Modified

| File | Changes |
|------|---------|
| `lib/cron/handlers/summarize-cached-handler.ts` | Bug 1A (delivery tracking), Bug 1B (P2002 handling), Bug 3 (summaryData), Bug 6 (stale re-normalization) |
| `components/ui/email/templates/form4-minimalist-template.tsx` | Bug 2 (isPurchaseTransaction fix + isAwardTransaction keywords) |
| `lib/ai/parsers/response-parser.ts` | Bug 5 (derivative newStake) |
| `lib/ai/prompts/unified-prompts.ts` | Bug 4 (Table II guidance + schema description) |

---

## Verification

1. [x] `npm run lint` - No new lint errors (pre-existing lint issues unrelated to this change)
2. [x] `npm run test -- --testPathPattern="form4-transaction-classification"` - 88 tests pass
3. [x] `npm run test -- --testPathPattern="form4-ai-schema-classification"` - 40 tests pass (updated 2 tests for derivative behavior)
4. [x] `npm run test -- --testPathPattern="form4-derivative"` - 8 new tests pass
5. [x] `npm run test -- --testPathPattern="summarize-cached-handler"` - 26 tests pass (3 test suites)
6. [x] `npm run test` - 3727 tests pass, 196 suites pass; all 194 failing suites are pre-existing failures unrelated to this change
7. [x] `npm run test:e2e` - 5/5 tickers pass (TSLA, VRT, COIN, KO, NVDA), all emails sent
8. [ ] Manual: Check TEST_EMAIL for correct transaction badges, no duplicates

---

## Decisions Made

1. **Add option keywords to isAwardTransaction** - Yes, add 'stock option', 'option award', 'option grant' to text fallback so derivative grants classify as "award" not "other".
2. **Show derivative securities in Ownership Impact** - Yes, display "100,000 derivative securities" rather than hiding the section for derivative-only filings.
3. **Use static import for response parser in Phase 4** - Use static import at top of file since the module is lightweight and avoids dynamic import complexity.
