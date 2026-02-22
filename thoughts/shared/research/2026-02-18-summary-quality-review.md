---
date: 2026-02-18T00:00:00+11:00
researcher: wilf
git_commit: 1c2e4d6
branch: summary-quality-review
repository: tldrsec-ai
topic: "Email Summary Quality Review - Template & Prompt Pipeline Analysis"
tags: [research, codebase, email-templates, ai-prompts, form4, 10k, pipeline, summary-quality]
status: complete
last_updated: 2026-02-18
last_updated_by: wilf
last_updated_note: "Added complete SEC Form 4 transaction code reference with codebase coverage analysis"
---

# Research: Email Summary Quality Review - Template & Prompt Pipeline Analysis

**Date**: 2026-02-18
**Researcher**: wilf
**Git Commit**: 1c2e4d6
**Branch**: summary-quality-review
**Repository**: tldrsec-ai

## Research Question

Review what version of email templates and prompting the pipeline is using for SEC filing summaries. Check whether the email summarisation step uses the latest email enhancements and prompting. Investigate three specific quality issues:

1. **GOOGL Form 4** (filed 2026-02-13): Gift/transfer incorrectly shown as "BOUGHT $0 3,530 shares"; sent twice; transfer badge missing
2. **COIN 10-K** (filed 2026-02-12): Blank Financial Highlights and Segment Performance sections; sent twice
3. **JNJ Form 4** (filed 2026-02-12): PSU awards shown as "BOUGHT $0 0 shares" for multiple insiders

## Summary

The production email pipeline has a critical architectural gap: the extractor validation/enrichment layer (`summarizeFilingWithValidation()`) exists but is **not wired into the production pipeline**. The handler calls `summarizeFiling()` directly, bypassing all post-generation data extraction and enrichment. This means email template quality depends entirely on the AI model returning perfect structured JSON - and when the AI returns incomplete or misclassified data, there is no fallback.

Three specific issues stem from this gap:

| Issue | Root Cause | Component |
|-------|-----------|-----------|
| Form 4 "BOUGHT $0" for gifts/awards | `aggregateTransactionsByType()` defaults unclassified transactions to "purchase" | `form4-minimalist-template.tsx:231` |
| 10-K blank Financial Highlights | Template only renders if AI returns `financialHighlights` array in summaryJSON | `10k-minimalist-template.tsx` |
| Form 4 PSU "BOUGHT $0 0 shares" | Award transactions (code "A") excluded from purchase check but fall into default purchase bucket | `form4-minimalist-template.tsx:188,231` |

## Detailed Findings

### 1. Production Pipeline Data Flow

The email pipeline follows this path:

```
summarize-cached-handler.ts (Phase 3)
  └── summarizeFiling() [lib/ai/summarize.ts:430]
        └── generateUnifiedPrompt() [lib/ai/prompts/unified-prompts.ts]
        └── OpenRouter API call (xAI Grok, temperature 0.2)
        └── parseResponse() [lib/ai/parsers/response-parser.ts]
        └── Returns { summaryText, summaryJSON }
  └── Stores summaryJSON in DB (Summary.summaryJSON field)
  └── sendFilingSummaryEmail() [lib/email/summary-service.ts]
        └── getEmailTemplate(EmailType.FILING_NOTIFICATION, { summaryData: summaryJSON })
              └── MINIMALIST_TEMPLATE_REGISTRY lookup [lib/email/templates.ts]
              └── Renders form-specific React email template
              └── Returns { html, text }
        └── sendEmail() via Resend API
```

**Key observation**: `summarize-cached-handler.ts` line ~430 calls `summarizeFiling()` directly, NOT `summarizeFilingWithValidation()`. The validation wrapper at `lib/ai/summarize-with-validation.ts` would call extractors to enrich sparse summaryJSON, but it is never invoked.

### 2. AI Prompting System (Active in Production)

**File**: `lib/ai/prompts/unified-prompts.ts` (1276 lines)

The unified prompt system is the active production prompt system. Key characteristics:

- **System prompt**: Enforces strict JSON-only output, financial journalist writing style
- **Schema-first approach**: Each filing type has a JSON schema (`FORM_SCHEMAS`) defining required output structure
- **Form 4 schema** requires: `transactions[]` with `type`, `shares`, `price`, `value` fields
- **10-K schema** requires: `financialHighlights[]`, `segments[]`, `riskFactors[]`, `keyPoints[]`

**Form 4 extraction guidance** (from prompt):
```
Transaction type codes: A = Award/Grant (equity compensation - NOT a purchase,
don't confuse with P), P = Purchase, S = Sale, G = Gift,
J = Trust Transfer, K = Family Transfer, M = Exercise/Conversion
```

The prompt correctly instructs the AI that "A = Award/Grant" is NOT a purchase. However, the AI model (xAI Grok via OpenRouter) may not consistently follow this instruction, and the downstream template doesn't have adequate fallback classification.

### 3. Form 4 Template Transaction Classification

**File**: `components/ui/email/templates/form4-minimalist-template.tsx` (933 lines)

The template uses `aggregateTransactionsByType()` to group transactions into display categories (gift, sale, purchase, transfer). The classification logic:

```typescript
// Simplified flow of aggregateTransactionsByType()
for (const tx of transactions) {
  if (isTransferTransaction(tx))  → "transfer" bucket
  else if (isGiftTransaction(tx)) → "gift" bucket
  else if (isSaleTransaction(tx)) → "sale" bucket
  else if (isPurchaseTransaction(tx)) → "purchase" bucket
  else → "purchase" bucket  // DEFAULT FALLBACK
}
```

**`isPurchaseTransaction()`** at line ~188:
```typescript
if (code === 'A') return false;  // Correctly excludes Awards
```

However, when code is 'A' (Award), the transaction is excluded from purchase BUT still falls through all checks to the **default "purchase" bucket** in the else clause at line ~231. This means:

- Awards (code A) → not transfer, not gift, not sale, not purchase → **defaults to "purchase"** → shows as "Bought"
- Gifts (code G) → correctly classified as "gift" IF the AI returns `type: "gift"` or `code: "G"`

**GOOGL issue**: The AI likely returned the gift/transfer transaction without proper gift/transfer classification in the JSON, causing it to fall to the "purchase" default. The template's `isGiftTransaction()` checks for 'gift' in the type string or 'G' in the code field - if the AI returned `type: "A"` or `type: "Acquisition"` instead of `type: "Gift"`, the classification fails.

**JNJ issue**: PSU awards use transaction code "A" (Award). The `isPurchaseTransaction()` correctly returns false for code "A", but the aggregation function's default else clause still puts it in the "purchase" bucket, displaying as "Bought $0 0 shares".

### 4. Form 4 Data Extractor (Exists but Not Used in Pipeline)

**File**: `lib/email/form4-data-extractor.ts` (699 lines)

This extractor has comprehensive regex patterns for extracting transactions from summaryText:

- `TRANSACTION_CODE_MAP`: Maps SEC codes → types (S→Sale, P→Purchase, A→Award, G→Gift, J→Trust Transfer, K→Family Transfer)
- `extractTransactionsFromText()`: Patterns for sales, purchases, gifts, transfers
- Does NOT have specific patterns for PSU/RSU award transactions

The extractor IS called as a fallback within the Form 4 template itself (when `summaryData.transactions` is empty), but the production issue is that the AI IS returning transaction data - it's just misclassified. The extractor fallback only triggers when there are NO transactions in summaryJSON.

### 5. 10-K Template and Missing Sections

**File**: `components/ui/email/templates/10k-minimalist-template.tsx` (245 lines)

The template conditionally renders sections:

```typescript
{financialHighlights && financialHighlights.length > 0 && (
  <Section>...</Section>
)}

{segments && segments.length > 0 && (
  <Section>...</Section>
)}
```

If the AI doesn't return these arrays in `summaryJSON`, the sections are completely blank with no indication they're missing. There is no fallback extraction from `summaryText`.

**File**: `lib/email/10k-data-extractor.ts` (518 lines)

A robust extractor exists with:
- `extractFinancialHighlights()` - handles markdown bold, plain text, table format, prose patterns
- `extractSegments()` - extracts business segment data
- `extractRiskFactors()` - parses risk factor sections

This extractor exists but is **not called in the production pipeline**. It would be invoked by `summarizeFilingWithValidation()` which is not wired in.

**COIN issue**: The AI returned a summaryJSON for the COIN 10-K that lacked `financialHighlights` and `segments` arrays. Since no extractor runs post-AI-generation to fill gaps, these sections were blank. The summary text likely contained the information but wasn't extracted.

### 6. The Validation Gap

**File**: `lib/ai/summarize-with-validation.ts` (191 lines)

This module wraps `summarizeFiling()` with post-generation validation:

```typescript
export async function summarizeFilingWithValidation(...) {
  const result = await summarizeFiling(...);
  const extractor = getExtractor(filingType);
  if (extractor) {
    result.summaryJSON = mergeWithFallback(result.summaryJSON, extractor(result.summaryText));
  }
  return result;
}
```

**File**: `lib/email/extractor-registry.ts` (150 lines)

Maps 12 form types to extractor functions: 10-K, 10-Q, 8-K, Form 4, 144, S-1, S-3, DEF 14A, 11-K, SC 13G, SC 13D, 424B2.

**The gap**: `summarize-cached-handler.ts` imports and calls `summarizeFiling()` directly, not `summarizeFilingWithValidation()`. The enrichment layer that would:
1. Run form-specific extractors on summaryText
2. Merge extracted data with AI-generated summaryJSON
3. Fill missing fields (like financialHighlights for 10-K)
4. Correct transaction classifications (like Award vs Purchase for Form 4)

...is completely bypassed in production.

### 7. Duplicate Email Issue

Both GOOGL Form 4 and COIN 10-K were sent twice. This was not fully investigated but likely causes include:

- Job queue retry behavior (retryCount=1 is expected per CLAUDE.md Known Issues)
- The `summarize-cached-handler.ts` has shared summary logic that checks if a summary already exists before regenerating, but email sending may still fire on retry
- The handler marks `sentToUser: true` after sending, but race conditions between retries could cause duplicates

### 8. AI Model and Configuration

**File**: `lib/ai/summarize.ts`

- **Model**: xAI Grok via OpenRouter (NOT Claude/Anthropic)
- **Temperature**: 0.2 (relatively deterministic)
- **Response format**: Strict JSON as enforced by unified prompts system prompt
- **Token tracking**: Tracks input/output tokens and cost

The AI model quality directly impacts email quality since no post-processing enrichment occurs.

### 9. Complete SEC Form 4 Transaction Code Reference

The SEC defines 21 transaction codes for Form 4 filings, organized into five categories. These codes appear in Column 3 of Table I (non-derivative securities) and Table II (derivative securities). Both tables use the same 21 codes.

Sources: [SEC Ownership Form Codes](https://www.sec.gov/edgar/searchedgar/ownershipformcodes.html), [Form 4 Transaction Codes Decoded](https://blog.form345.com/form-4-transaction-codes-decoded), [Novaworks Section 16 Transaction Codes](https://www.novaworkssoftware.com/blog/archives/75-Using-Section-16-Transaction-Codes.html)

#### Official SEC Transaction Codes (All 21)

**General Transaction Codes**

| Code | SEC Description | Investor Signal |
|------|----------------|-----------------|
| **P** | Open market or private purchase of securities | Bullish - insider buying with own money |
| **S** | Open market or private sale of securities | May be routine or concerning depending on context |
| **V** | Transaction voluntarily reported earlier than required (Rule 10b5-1 plan) | Pre-planned trade, weaker signal |

**Rule 16b-3 Transaction Codes (Issuer-Related)**

| Code | SEC Description | Investor Signal |
|------|----------------|-----------------|
| **A** | Grant, award, or other acquisition pursuant to Rule 16b-3(d) | Equity compensation (RSUs, PSUs, stock awards) - NOT a purchase |
| **D** | Disposition to the issuer of issuer equity securities pursuant to Rule 16b-3(e) | Return of shares to company |
| **F** | Payment of exercise price or tax liability by delivering or withholding securities | Tax withholding on vesting events |
| **I** | Discretionary transaction in accordance with Rule 16b-3(f) | Beneficial ownership change via plan |
| **M** | Exercise or conversion of derivative security exempted pursuant to Rule 16b-3 | Option/warrant exercise |

**Derivative Securities Codes**

| Code | SEC Description | Investor Signal |
|------|----------------|-----------------|
| **C** | Conversion of derivative security | Converting one security type to another |
| **E** | Expiration of short derivative position | Derivative lapsed without exercise |
| **H** | Expiration (or cancellation) of long derivative position with value received | Derivative expired/cancelled with payout |
| **O** | Exercise of out-of-the-money derivative security | Exercising worthless options (unusual) |
| **X** | Exercise of in-the-money or at-the-money derivative security | Exercising valuable options |

**Other Section 16(b) Exempt Transaction Codes**

| Code | SEC Description | Investor Signal |
|------|----------------|-----------------|
| **G** | Bona fide gift | Transfer without consideration, neutral |
| **L** | Small acquisition under Rule 16a-6 | Minor acquisition below reporting threshold |
| **W** | Acquisition or disposition by will or laws of descent and distribution | Inheritance/estate transfer |
| **Z** | Deposit into or withdrawal from voting trust | Voting rights change, not economic |

**Other Transaction Codes**

| Code | SEC Description | Investor Signal |
|------|----------------|-----------------|
| **J** | Other acquisition or disposition (describe transaction in footnotes) | Catch-all, often trust restructuring |
| **K** | Transaction in equity swap or instrument with similar characteristics | Derivative/swap transaction |
| **U** | Disposition pursuant to a tender of shares in a change of control transaction | Shares tendered in acquisition |

#### Codebase Coverage Cross-Reference

The 21 SEC codes are handled across four locations in the codebase, with varying completeness:

| Code | SEC Meaning | `TRANSACTION_CODE_MAP` | `SEC_TRANSACTION_CODES` | AI Prompt Guidance | Template Classification |
|------|------------|----------------------|------------------------|-------------------|------------------------|
| **P** | Purchase | "Purchase" | "Open Market Purchase" | Yes (bullish signal noted) | `isPurchaseTransaction` → purchase bucket |
| **S** | Sale | "Sale" | "Open Market Sale" | Yes | `isSaleTransaction` → sale bucket |
| **V** | 10b5-1 Plan | -- | -- | -- | Falls to default purchase bucket |
| **A** | Award/Grant | "Award" | "Grant/Award" | Yes (NOT a purchase noted) | Excluded from purchase, falls to default purchase bucket |
| **D** | Disposition to Issuer | "Disposition" | "Disposition to Issuer" | Yes | Falls to default purchase bucket |
| **F** | Tax Withholding | "Tax Withholding" | "Tax Withholding" | Yes | `isSaleTransaction` checks but no explicit F handling |
| **I** | Discretionary (16b-3) | -- | "Discretionary Transaction" | -- | Falls to default purchase bucket |
| **M** | Exercise/Conversion | "Exercise" | "Option Exercise" | Yes | Falls to default purchase bucket |
| **C** | Conversion | "Conversion" | "Conversion" | Yes | Falls to default purchase bucket |
| **E** | Expiration (short) | -- | "Exercise of Derivative" | -- | Falls to default purchase bucket |
| **H** | Expiration (long) | -- | "Discretionary Transaction" | -- | Falls to default purchase bucket |
| **O** | Exercise OTM | -- | "Exercise of Out-of-Money" | -- | Falls to default purchase bucket |
| **X** | Exercise ITM/ATM | -- | "Exercise of Expiring Derivative" | Yes | Falls to default purchase bucket |
| **G** | Gift | "Gift" | "Gift" | Yes | `isGiftTransaction` → gift bucket |
| **L** | Small Acquisition | -- | "Small Acquisition" | -- | Falls to default purchase bucket |
| **W** | Will/Descent | -- | "Acquisition Pursuant to Will" | Yes | Falls to default purchase bucket |
| **Z** | Voting Trust | -- | "Deposit into Trust" | -- | Falls to default purchase bucket |
| **J** | Other (catch-all) | "Trust Transfer" | "Trust Transfer" | Yes (as "discretionary") | `isTransferTransaction` → transfer bucket |
| **K** | Equity Swap | "Family Transfer" | "Trust Disposition" | Yes (as "derivative") | `isTransferTransaction` → transfer bucket |
| **U** | Tender/Change of Control | -- | "Tender of Shares" | -- | Falls to default purchase bucket |

**Key:** `--` = not present in that location

#### Coverage Summary

| Location | File | Codes Covered | Missing |
|----------|------|---------------|---------|
| `TRANSACTION_CODE_MAP` | `lib/email/form4-data-extractor.ts:33` | 10 of 21 | V, I, E, H, O, X, L, W, Z, U, (no V) |
| `SEC_TRANSACTION_CODES` | `components/ui/email/design-system.ts:321` | 19 of 21 | V, (no V or a second missing) |
| AI Prompt Guidance | `lib/ai/prompts/unified-prompts.ts:968` | 12 of 21 | V, I, E, H, O, L, Z, U |
| Template Classification | `form4-minimalist-template.tsx:225` | 4 buckets only | No award/exercise/disposition/expiration buckets |

#### Notable Codebase Interpretations vs SEC Definitions

The codebase maps some codes to domain-specific labels that differ from the SEC's official definitions:

| Code | SEC Official | Codebase Interpretation | Notes |
|------|-------------|------------------------|-------|
| **J** | "Other acquisition or disposition" (general catch-all) | "Trust Transfer" (data extractor), "Trust Transfer" (design system) | SEC mandates footnote explanation; codebase assumes trust transfer context |
| **K** | "Transaction in equity swap or similar instrument" | "Family Transfer" (data extractor), "Trust Disposition" (design system) | Labels diverge between data extractor and design system |
| **E** | "Expiration of short derivative position" | "Exercise of Derivative" (design system) | Expiration ≠ Exercise - semantic mismatch |
| **H** | "Expiration (or cancellation) of long derivative position" | "Discretionary Transaction" (design system) | Completely different meaning |
| **V** | "Transaction voluntarily reported earlier than required" (Rule 10b5-1) | Not mapped anywhere | Significant for 10b5-1 plan detection, which the signal strength logic already checks for in text |

#### Transaction Code → Template Display Bucket Mapping

Of the 21 codes, only 4 reach their intended display bucket. The remaining 17 fall to the default "purchase" bucket:

| Display Bucket | Codes That Reach It | Label | Color |
|---------------|-------------------|-------|-------|
| **transfer** | J, K (via code check) | "Transfer" | Blue (#3B82F6) |
| **gift** | G (via code check) | "Gift" | Purple (#7C3AED) |
| **sale** | S (via code check) | "Sold" | Red (#DC2626) |
| **purchase** | P (via code check) | "Bought" | Green (#16A34A) |
| **purchase** (default) | V, A, D, F, I, M, C, E, H, O, X, L, W, Z, U | "Bought" | Green (#16A34A) |

## Code References

| File | Lines | Description |
|------|-------|-------------|
| `lib/cron/handlers/summarize-cached-handler.ts` | ~430 | Calls `summarizeFiling()` directly (not validation wrapper) |
| `lib/ai/summarize.ts` | full | Core summarization - generates summaryJSON from AI |
| `lib/ai/prompts/unified-prompts.ts` | full | Active production prompt system with JSON schemas |
| `components/ui/email/templates/form4-minimalist-template.tsx` | ~188, ~231 | Transaction classification gap - Awards default to "purchase" |
| `components/ui/email/templates/10k-minimalist-template.tsx` | full | Conditional section rendering with no fallback |
| `lib/email/form4-data-extractor.ts` | full | Form 4 extractor (exists, used as template fallback only) |
| `lib/email/10k-data-extractor.ts` | full | 10-K extractor (exists, NOT called in pipeline) |
| `lib/ai/summarize-with-validation.ts` | full | Validation wrapper (exists, NOT used in production) |
| `lib/email/extractor-registry.ts` | full | Maps 12 form types to extractors |
| `lib/email/templates.ts` | full | Template routing via MINIMALIST_TEMPLATE_REGISTRY |
| `lib/email/summary-service.ts` | full | `sendFilingSummaryEmail()` passes summaryData to templates |
| `lib/ai/parsers/response-parser.ts` | full | AI response JSON parsing and field normalization |
| `components/ui/email/design-system.ts` | 321-350 | `SEC_TRANSACTION_CODES` - 19 of 21 codes mapped with display labels |
| `lib/ai/prompts/unified-prompts.ts` | 962-993 | `FORM_EXTRACTION_GUIDANCE['4']` - 12 codes with investment signal context |
| `lib/ai/prompts/form-4.ts` | 50-83 | Legacy Form 4 prompt (lists types not codes) |
| `lib/ai/fallback-summary.ts` | 188-199 | Fallback metadata extraction captures raw transaction code letter |

## Architecture Documentation

### Current Email Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Production Pipeline (What Actually Runs)                     │
│                                                              │
│  summarize-cached-handler.ts                                 │
│    │                                                         │
│    ├── summarizeFiling()           ← Direct call             │
│    │     └── unified-prompts.ts    ← Schema + system prompt  │
│    │     └── OpenRouter (Grok)     ← AI generation           │
│    │     └── response-parser.ts    ← JSON extraction         │
│    │     └── Returns summaryJSON   ← May be sparse/incorrect │
│    │                                                         │
│    ├── Store to DB                                           │
│    │                                                         │
│    └── sendFilingSummaryEmail()                               │
│          └── templates.ts          ← Route to template       │
│          └── form4-template.tsx    ← Render with summaryJSON │
│          └── 10k-template.tsx      ← Render with summaryJSON │
│                                                              │
│  ⚠️  No extractor enrichment step                            │
│  ⚠️  No validation of AI output completeness                 │
│  ⚠️  Template quality = AI output quality                    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Available But Unused Layer                                   │
│                                                              │
│  summarize-with-validation.ts                                │
│    │                                                         │
│    ├── summarizeFiling()           ← Same AI call            │
│    │                                                         │
│    └── Extractor Enrichment        ← NOT CALLED              │
│          └── extractor-registry.ts ← 12 form types mapped   │
│          └── form4-data-extractor  ← Regex-based extraction  │
│          └── 10k-data-extractor    ← Financial data parsing  │
│          └── mergeWithFallback()   ← Fill gaps in summaryJSON│
└─────────────────────────────────────────────────────────────┘
```

### Transaction Classification Flow (Form 4)

```
AI returns transaction with type/code
  │
  ├── isTransferTransaction(tx)?  ← checks 'transfer'/'trust' in type, J/K codes
  │     └── YES → "transfer" bucket ✅
  │
  ├── isGiftTransaction(tx)?      ← checks 'gift'/'g' in type, G code
  │     └── YES → "gift" bucket ✅
  │
  ├── isSaleTransaction(tx)?      ← checks 'sale'/'sold'/'s' in type, S/F codes
  │     └── YES → "sale" bucket ✅
  │
  ├── isPurchaseTransaction(tx)?  ← checks 'purchase'/'buy'/'p' in type, P code
  │     │                            BUT returns false for code 'A' (Award)
  │     └── YES → "purchase" bucket
  │     └── NO (code 'A') → falls through ↓
  │
  └── DEFAULT → "purchase" bucket ❌  ← Awards/PSUs/RSUs end up here
                                        Shows as "Bought $0 X shares"
```

### Missing Classification: Awards/Grants

The template has no `isAwardTransaction()` function or "award" bucket. Transaction codes that should be classified as awards:
- `A` = Award/Grant (equity compensation)
- `M` = Exercise/Conversion (options)

These currently default to the "purchase" display, showing misleading "Bought $0" badges.

## Issue-Specific Analysis

### GOOGL Form 4 (Filed 2026-02-13)

**What happened**: Director John L. Hennessy gifted 1,765 Class C Capital Stock shares at $0/share, transferring from direct ownership to revocable trust.

**Expected display**: Transfer transaction badge with neutral signal
**Actual display (9:11PM email)**: "BOUGHT(@) $0 3,530 shares" with blank ownership impact
**Actual display (9:42PM email)**: Sentiment badge + summary (better, but still not "Transfer")

**Root cause**: The AI likely returned the transaction with type "Acquisition" or code "A" rather than "Gift" or "Transfer". The template's classification logic:
1. `isTransferTransaction()` - would match if type contained "transfer" or "trust", or code was "J"/"K"
2. `isGiftTransaction()` - would match if type contained "gift" or code was "G"
3. Neither matched → fell to default "purchase" bucket

**Duplicate email**: Two emails sent 31 minutes apart (9:11PM and 9:42PM) - likely job retry creating duplicate send.

### COIN 10-K (Filed 2026-02-12)

**What happened**: Coinbase 10-K annual filing summary sent with blank Financial Highlights and Segment Performance sections.

**Expected display**: Populated financial highlights, segment data, risk factors
**Actual display (8:02AM email)**: Blank Financial Highlights, blank Segment Performance
**Actual display (12:05PM email)**: Only summary section

**Root cause**: The AI (Grok) did not return `financialHighlights` or `segments` arrays in its summaryJSON response. The 10-K template only renders these sections when the arrays exist and are non-empty. The `10k-data-extractor.ts` could extract this data from summaryText but is never called.

**Duplicate email**: Two emails sent 4 hours apart - second may be from manual retry or job reprocessing.

### JNJ Form 4 (Filed 2026-02-12)

**What happened**: Multiple JNJ insiders received PSU (Performance Share Unit) awards. These are equity compensation grants, not market purchases.

**Expected display**: "Award" or "Grant" transaction badge with $0 value and shares count
**Actual display**: "BOUGHT $0 0 shares" - misleading since no purchase occurred

**Root cause**: PSU awards use SEC transaction code "A" (Award). The template's `isPurchaseTransaction()` correctly returns false for code "A", but the aggregation function's default else clause puts it in the "purchase" bucket anyway. There is no "award" bucket or `isAwardTransaction()` function.

**Affected insiders**: Broadhurst Vanessa, Mulholland Kristen, Forminard Elizabeth, Duato Joaquin, Decker Robert J, Wolk Joseph J, Taubert Jennifer L, Swanson James D., Schmid Timothy, and others with the same filing date.

## Related Research

- `thoughts/shared/research/2026-01-07-sec-filing-prompts-templates-architecture.md` - Earlier architecture analysis of prompts and templates
- `thoughts/shared/research/2026-01-10-summary-quality-feedback-analysis.md` - Previous summary quality feedback
- `thoughts/shared/research/2026-01-20-filing-summary-email-quality-gaps.md` - Earlier quality gap analysis
- `thoughts/shared/research/2025-12-24-email-summary-discrepancies.md` - Historical email discrepancy analysis

## Open Questions

1. **Why is `summarizeFilingWithValidation()` not wired into the production pipeline?** Was this intentional (performance concern? reliability concern?) or an oversight?
2. **Duplicate emails**: Is the job queue retry mechanism causing duplicate email sends, or is there a separate trigger? Need to investigate the `sentToUser` flag race condition.
3. **AI model consistency**: How often does Grok return incomplete summaryJSON? Would switching to Claude improve structured output reliability?
4. **Historical impact**: How many past emails were affected by the transaction classification gap? A database query on summaryJSON for Form 4 filings with transaction code "A" could quantify this.
