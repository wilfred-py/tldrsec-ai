# Fix Form 4 Summary Quality: Ownership, Vesting, Security Types

**Date**: 2026-03-16
**Branch**: worktree-summary-enhancements
**Repository**: tldrsec-ai

## Context

After the E2E test with real Form 4 filings (TSLA, VRT, COIN, KO, NVDA), the user identified several summary quality issues in the emails received:

1. **Missing commas** in ownership impact numbers (e.g., "524795" instead of "524,795")
2. **Wrong ownership for TSLA**: Parser grabbed Table II derivative count (65,382) instead of Table I direct holdings (18,106.5)
3. **NVDA RSUs misclassified**: RSUs in Table I labeled "derivative securities" because code=A + $0 price triggers the derivative heuristic, but RSUs in Table I are non-derivative
4. **Missing vesting schedules**: VRT options vest 25% annually from March 2026 - this context from footnotes is absent
5. **No security type clarity**: Awards don't distinguish RSU vs stock option vs share grant - this matters because options have different risk/reward profiles
6. **TSLA exercise count doubled**: AI reported 13,076 instead of 6,538 - this is an AI prompt guidance issue

Transaction badges and cards are working correctly (no "BOUGHT $0" bugs).

---

## Phase 1: Schema & Prompt Enhancements (`lib/ai/prompts/unified-prompts.ts`)

**1A. Add `securityType` and `tableSource` to transaction item schema** (line ~333, within transaction `properties`)

```typescript
securityType: { type: 'string', description: 'Security type exactly as listed in filing table header (e.g., "Common Stock", "Stock Option (Right to Buy)", "Restricted Stock Unit"). Copy verbatim from table.' },
tableSource: { type: 'string', description: 'Which table: "Table I" for non-derivative securities, "Table II" for derivative securities.' },
```

NOT added to `required` - optional fields with fallback behavior in parser.

**1B. Add `vestingDetails` to Form 4 top-level schema** (after `has10b51Plan`, line ~363)

```typescript
vestingDetails: {
  type: 'string',
  description: 'Vesting schedule from footnotes if present (e.g., "25% vests annually starting March 15, 2026"). Include plan name and key dates. Empty if no vesting info.',
  maxLength: 300
},
```

**1C. Update extraction rules** (Form 4 guidance text, lines 1004-1044)

Add after "TABLE STRUCTURE" section:
- Instructions to extract `securityType` verbatim from table headers
- Instructions to record `tableSource` as "Table I" or "Table II"

Add after "FOOTNOTES ARE CRITICAL":
- Vesting schedule extraction: look for "vesting schedule", "vest", "annual installments", dates
- Populate `vestingDetails` field with schedule summary

Add new "MIXED TABLE FILINGS" section:
- When BOTH tables present, the summary should report Table I direct holdings for ownership
- Table II sharesOwnedFollowing = derivative count, NOT direct shares
- Summary should distinguish: "holds X shares (direct) and Y stock options (derivative)"

Update summary requirement:
- MUST include security type (RSU vs option vs common stock) when it's an award/grant
- When vesting details present, mention first vest date in summary
- For exercises, use the EXACT share count from the filing row - do NOT double entries from Table I + Table II

---

## Phase 2: Parser Fixes (`lib/ai/parsers/response-parser.ts`)

**2A. Fix newStake derivation to prefer Table I** (lines 209-240)

Current: takes last transaction's `sharesOwnedFollowing` regardless of table.
New: when `tableSource` is available, prefer Table I transactions for newStake. Fall back to last transaction when no tableSource.

**2B. Fix derivative detection using `tableSource`** (lines 218-232)

Current: code A + $0 always = derivative.
New priority chain:
1. If any tx has `tableSource`, use it: all "Table II" = derivative, otherwise shares
2. If `securityType` contains "Common Stock" or "Restricted Stock Unit" = NOT derivative
3. Legacy fallback: code-based heuristic (M,C,X,O,E,H = derivative; A+$0 without info = derivative)

**2C. Add comma formatting** to derived `newStake` and `previousStake` values.

Use `parseFloat` + `toLocaleString('en-US')` to preserve fractional shares (e.g., 18,106.5).

**2D. Fix stake normalization** (lines 278-292)

Current regex: `/([\d,]+)\s*shares?/i` just standardizes "shares" suffix.
New: also ensures commas are present by parsing and re-formatting the number. Apply to both "shares" and "derivative securities" suffixes. Preserve fractional parts.

---

## Phase 3: Template Enhancements (`components/ui/email/templates/form4-minimalist-template.tsx`)

**3A. Add comma formatting safety net** for `newStake` and `previousStake` display.

Add `ensureCommasInStake()` helper that catches numbers without commas (4+ digits before a space) and formats them. Applied as defense-in-depth after extracting from summaryData.

**3B. Add vesting details section** after "THE STORY" section.

Rendered only when `data?.vestingDetails` exists. Light blue card with calendar icon, showing the vesting schedule text.

**3C. Show security type in aggregated transaction badges.**

Extend `AggregatedTransaction` interface with `securityTypes: string[]`. Collect unique security types during aggregation. Display below share count in transaction cards as a subtle label (e.g., "Restricted Stock Unit", "Stock Option").

---

## Phase 4: Tests

**4A. Update `__tests__/email/form4-derivative-handling.test.ts`**
- Test: tableSource "Table I" + code A + $0 = "shares" not "derivative securities"
- Test: mixed Table I + Table II filing uses Table I for newStake
- Test: comma formatting in derived values (524795 -> "524,795 shares")
- Test: fractional shares preserved (18106.5 -> "18,106.5 shares")

**4B. Update `__tests__/regression/form4-ai-schema-classification.test.ts`**
- Test: new schema fields exist (securityType, tableSource, vestingDetails)

**4C. Template comma formatting tests**
- "524795 shares" -> "524,795 shares"
- "1,234 shares" unchanged
- "18106.5 derivative securities" -> "18,106.5 derivative securities"

---

## Files Modified

| File | Changes |
|------|---------|
| `lib/ai/prompts/unified-prompts.ts` | Schema: securityType, tableSource, vestingDetails. Rules: vesting extraction, Table I preference, security type in summary |
| `lib/ai/parsers/response-parser.ts` | Table I preference for newStake, tableSource-based derivative detection, comma formatting |
| `components/ui/email/templates/form4-minimalist-template.tsx` | Comma safety net, vesting details section, security type in badges |
| `__tests__/email/form4-derivative-handling.test.ts` | New tests for tableSource, Table I preference, comma formatting |
| `__tests__/regression/form4-ai-schema-classification.test.ts` | Schema field existence tests |

---

## Verification

1. [ ] `npm run test -- --config jest.config.mjs --testPathPattern="form4-derivative"` - Derivative handling tests
2. [ ] `npm run test -- --config jest.config.mjs --testPathPattern="form4-ai-schema"` - Schema tests
3. [ ] `npm run test -- --config jest.config.mjs --testPathPattern="form4-transaction-classification"` - Existing classification tests still pass
4. [ ] `npm run test -- --config jest.config.mjs --testPathPattern="summarize-cached-handler"` - Handler tests still pass
5. [ ] `npm run lint` - No lint errors
6. [ ] `npm run test:e2e` - E2E test sends emails; check VRT/NVDA for security type + vesting details, TSLA for correct ownership
