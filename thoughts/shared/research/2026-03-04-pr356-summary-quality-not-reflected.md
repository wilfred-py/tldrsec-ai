---
date: 2026-03-04 06:24:46 AEDT
researcher: Claude Code
git_commit: e633c2eb724836e2d5d6bdb6c22e6e9f150e48b7
branch: main
repository: tldrsec-ai
topic: "PR #356 summary quality enhancements not reflected in delivered emails"
tags: [research, codebase, form4, email-template, summarization, extractor, pipeline]
status: complete
last_updated: 2026-03-04
last_updated_by: Claude Code
---

# Research: PR #356 Summary Quality Enhancements Not Reflected in Delivered Emails

**Date**: 2026-03-04 06:24:46 AEDT
**Researcher**: Claude Code
**Git Commit**: e633c2eb724836e2d5d6bdb6c22e6e9f150e48b7
**Branch**: main
**Repository**: tldrsec-ai

## Research Question

PR #356 ("Improve summary quality: Form 4 classification, validation pipeline, and duplicate email dedup") was merged on Feb 25, 2026. The user reports that the enhancements are not visible in the summaries generated and delivered over the last 3 days (March 1-3).

## Summary

Two root causes were identified:

1. **Transaction `code` field never reaches the email template** — The 7-bucket classification functions (`isAwardTransaction`, `isGiftTransaction`, etc.) rely on `tx.code` as the primary classifier, but this field is never present in production `summaryJSON`. The AI prompt schema has no `code` field, and the extractor's transactions (which do have `code`) are discarded by the merge logic when the AI produces a non-empty array. Text fallback matching also fails because the AI uses "Acquisition" (per prompt guidance `A=Acquisition`) rather than "Award"/"Grant"/"RSU".

2. **Shared summary cache bypasses the validation pipeline** — When multiple users track the same ticker, only the first user's job runs `summarizeFilingWithValidation()`. All subsequent users get a verbatim copy of `summaryText` and `summaryJSON` with no enrichment. There is no cache invalidation mechanism.

## Detailed Findings

### 1. PR #356 Changes (Merged Feb 25, 2026)

PR #356 (commit `91e4fb7`) made four categories of changes:

- **Form 4 Transaction Classification**: 7-bucket system (purchase, sale, award, exercise, gift, transfer, other) replacing binary bought/sold. Classification functions in `components/ui/email/templates/form4-minimalist-template.tsx:195-260`
- **Validation Pipeline**: Wired `summarizeFilingWithValidation()` into production at `lib/cron/handlers/summarize-cached-handler.ts:454`
- **Duplicate Email Dedup**: OR guard at `summarize-cached-handler.ts:226-244` checking both `sentToUser` flag and `SummaryEmailDelivery` record
- **Template Display**: Show shares instead of "$0" for zero-value transactions, improved ownership impact section

### 2. Deployment Confirmed

- Commit `91e4fb7` is on `main` with two subsequent PRs merged (#355, #357)
- Production pipeline is HEALTHY: 2,336 completions in last 24 hours
- The code is deployed and running

### 3. Root Cause 1: Transaction `code` Field Gap

#### The Classification Functions Expect `code`

The classification functions (e.g., `isAwardTransaction()` at `form4-minimalist-template.tsx:207-222`) check `tx.code` first:

```typescript
export function isAwardTransaction(tx: TransactionData): boolean {
  const code = (tx.code || '').toUpperCase().trim();
  const type = (tx.type || '').toLowerCase().trim();
  if (['J', 'K', 'Z'].includes(code)) return false;  // transfer codes
  if (code === 'A' || code === 'I') return true;       // ← primary check
  if (type.includes('award') || type.includes('grant') ||
      type.includes('rsu') || type.includes('psu') ||
      type.includes('restricted stock')) return true;   // ← text fallback
  return false;
}
```

#### The AI Prompt Doesn't Produce `code`

The Form 4 AI schema (`lib/ai/prompts/unified-prompts.ts:313-363`) defines transactions as:

```
transactions (array, REQUIRED):
  type: "A=Acquisition, D=Disposition, P=Purchase, S=Sale, G=Gift, M=Exercise"
  shares: share count
  price: price per share
  date: YYYY-MM-DD
  acquisitionDisposition: "A" or "D"
```

There is NO `code` field. The `type` field receives a human-readable label following the guidance `A=Acquisition`.

#### The Merge Discards Extractor Transactions

The Form 4 extractor (`lib/email/form4-data-extractor.ts:259-313`) CAN extract `code` fields from markdown tables. However, `mergeWithFallback()` (`lib/ai/extractor-merge-utils.ts:106`) uses "AI wins on conflicts" — since the AI always produces a non-empty `transactions` array (it's required), the extractor's transactions with `code` fields are silently discarded.

#### Text Fallback Also Fails

When the AI outputs `type: "Acquisition"` for SEC code A (awards/RSUs):
- `isAwardTransaction()` text check: `"acquisition".includes('award')` → false
- `isPurchaseTransaction()` text check: `"acquisition".includes('purchase')` → false
- Falls through to `isOtherTransaction()` → classified as "other"

#### Tests Pass Because They Provide `code` Explicitly

The regression tests (`__tests__/regression/summary-quality-2026-02-18.test.ts`) construct test data with `code` set:
```typescript
tx({ code: 'A', type: 'PSU Award', shares: 2500, ... })
```
This exercises the `code === 'A'` path that never fires in production.

### 4. Root Cause 2: Shared Summary Cache

#### The Shared Cache Path

At `summarize-cached-handler.ts:299-319`, when no user-specific summary exists, the handler queries for ANY existing summary matching `filingUrl + filingType`:

```typescript
const sharedSummary = await prisma.summary.findFirst({
  where: { filingUrl: filing.filingUrl, filingType: filing.formType, summaryText: { not: '' } },
  orderBy: { createdAt: 'desc' }
});
```

When found, `summaryText` and `summaryJSON` are copied verbatim (lines 331-367). `summarizeFilingWithValidation()` is NOT called.

#### No Invalidation Mechanism

The `Summary` schema has fields for cache invalidation (`forceRefreshFlag`, `invalidatedBy`, `invalidationReason`, `invalidationCount` at `prisma/schema.prisma:140-144`), but NONE are checked in `summarize-cached-handler.ts`.

#### Impact

For new filings (March 1-3), the first user's job runs `summarizeFilingWithValidation()` and produces enriched data. But the enrichment doesn't help because the `code` field still isn't present (Root Cause 1). The second user gets a verbatim copy of the same data.

### 5. What IS Working

- **Code is deployed** — production pipeline is healthy
- **Template display changes apply at render time** — React component is re-rendered fresh per email, no HTML caching
- **Dedup guard is correct** — OR logic prevents duplicates without being overly aggressive
- **Template changes for $0 display** — conditionals like `aggTx.totalValue === 0 && aggTx.type === 'gift'` DO work, but only if the transaction is correctly classified as 'gift' in the first place

### 6. Production Pipeline Flow

```
Cloudflare Worker → /api/cron/tier-aware → Queue ASYNC_DISCOVER_FILINGS
Cloudflare Worker → /api/cron/process-filing-queue → BackgroundFilingWorker
  Phase 1: Discovery → creates ASYNC_FETCH_FILING jobs
  Phase 2: Fetch → SEC EDGAR content → creates ASYNC_SUMMARIZE_CACHED jobs
  Phase 3: Summarize →
    Branch A: User prefs filter → skip
    Branch B: Existing summary + delivered → skip
    Branch C: Shared summary found → copy verbatim, NO AI call
    Branch D: No shared summary → summarizeFilingWithValidation() → AI + extractor
```

Only Branch D calls `summarizeFilingWithValidation()`, and even there, the `code` field issue prevents proper classification.

## Code References

| What | File | Lines |
|------|------|-------|
| AI Form 4 schema (no `code` field) | `lib/ai/prompts/unified-prompts.ts` | 313-363 |
| Transaction type guidance | `lib/ai/prompts/unified-prompts.ts` | 333-340 |
| Extractor extracts `code` from tables | `lib/email/form4-data-extractor.ts` | 259-313 |
| Merge discards extractor transactions | `lib/ai/extractor-merge-utils.ts` | ~106 |
| `isAwardTransaction()` classification | `components/ui/email/templates/form4-minimalist-template.tsx` | 207-222 |
| `isPurchaseTransaction()` classification | `components/ui/email/templates/form4-minimalist-template.tsx` | 195-205 |
| `aggregateTransactionsByType()` | `components/ui/email/templates/form4-minimalist-template.tsx` | ~270 |
| Shared cache query | `lib/cron/handlers/summarize-cached-handler.ts` | 299-319 |
| Shared cache copy | `lib/cron/handlers/summarize-cached-handler.ts` | 331-367 |
| `summarizeFilingWithValidation` call | `lib/cron/handlers/summarize-cached-handler.ts` | 454 |
| Merge logic (AI wins) | `lib/ai/extractor-merge-utils.ts` | 106 |
| Tests provide `code` explicitly | `__tests__/regression/summary-quality-2026-02-18.test.ts` | 49-70 |
| Cache invalidation fields (unused) | `prisma/schema.prisma` | 140-144 |
| PR #356 merge commit | git | `91e4fb7` |

## Architecture Documentation

### Data Flow Gap

```
AI Prompt Schema              Extractor Output           Template Classification
─────────────────            ──────────────────          ────────────────────────
transactions[]:               Form4Transaction[]:         tx.code (PRIMARY check)
  type: "Acquisition"           type: "Award"               ↓ (always undefined)
  shares: "6,000"               code: "A"          →     tx.type (FALLBACK check)
  price: "$0"                   shares: "6,000"             ↓ ("acquisition" ≠ "award")
  (NO code field)                                         Result: "other" ✗

                    mergeWithFallback():
                    AI transactions non-empty
                    → extractor transactions DISCARDED
```

### Fix Approaches

1. **Add `code` to AI prompt schema** — Most robust. Tell the AI to output raw SEC letter code.
2. **Post-process AI transactions** — After AI call, enrich each transaction with `code` based on `type` text and `acquisitionDisposition`.
3. **Expand text fallback** — Add "acquisition" to `isAwardTransaction()`. Fragile but quick.
4. **Fix merge for arrays** — Merge extractor fields INTO AI transaction objects rather than replacing the whole array.

## Historical Context (from thoughts/)

- `thoughts/shared/research/2026-02-18-summary-quality-review.md` — Original quality review that led to PR #356
- `thoughts/shared/research/2025-12-30-vrt-summary-sharing-analysis.md` — Confirmed shared summary cache behavior for overlapping users
- `thoughts/shared/research/2026-01-20-filing-summary-email-quality-gaps.md` — Earlier email quality gap analysis
- `thoughts/shared/research/2026-02-12-review-summary-quality-assessment.md` — Quality assessment before PR #356

## Related Research

- `thoughts/shared/research/2026-02-26-pipeline-throughput-cloudflare-dead-code.md` — PR #357 pipeline improvements
- `thoughts/shared/research/2026-01-07-sec-filing-prompts-templates-architecture.md` — Prompt/template architecture

## Open Questions

1. What does the AI actually output for `transactions[].type` in production? Need to inspect a recent `summaryJSON` from the database to confirm whether the AI uses "Acquisition", "A", or other values.
2. How many filings in the last 3 days hit Branch C (shared cache) vs. Branch D (fresh AI)? Production logs would show "Reusing shared summary" messages.
3. Should the fix prioritize adding `code` to the AI schema, or enriching transactions post-AI-call? The former is cleaner but requires prompt changes that affect all future summaries.
