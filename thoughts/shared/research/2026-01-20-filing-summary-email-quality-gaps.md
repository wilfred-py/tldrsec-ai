---
date: 2026-01-20T07:04:34+0000
researcher: Claude Code
git_commit: 7442f67d6add670285f82636cc346cd769e80624
branch: review-summary-quality
repository: tldrsec-ai/review-summary-quality
topic: "Filing Summary and Email Template Quality Gaps"
tags: [research, codebase, form-4, form-144, def-14a, 8-k, email-templates, ai-prompts, data-extraction]
status: complete
last_updated: 2026-01-20
last_updated_by: Claude Code
---

# Research: Filing Summary and Email Template Quality Gaps

**Date**: 2026-01-20T07:04:34+0000
**Researcher**: Claude Code
**Git Commit**: 7442f67d6add670285f82636cc346cd769e80624
**Branch**: review-summary-quality
**Repository**: tldrsec-ai/review-summary-quality

## Research Question

Document the current state of SEC filing summaries and email templates across all filing types to understand gaps in:
1. Missing insider names and relationships in filing summaries
2. Missing transaction details (shares, holdings changes)
3. Formatting issues that reduce readability
4. Language issues (repetitive verbs like "dump" and "snags")
5. Missing acronym explanations (TSR, PSU)
6. Duplicate email delivery
7. Transaction card display inconsistencies

## Summary

The SEC filing summarization and email system currently has extractors and templates for 16 form types, with comprehensive data extraction for most major forms. However, several quality gaps exist:

**Missing Data Extraction**:
- Form 4: Filer names/relationships ARE extracted by `form4-data-extractor.ts` but may not always populate from AI summaries
- Form 144: Filer names ARE extracted but display as "insider" when data is missing
- Holdings changes: Extracted but not consistently displayed in templates

**Language Issues**:
- AI prompts in `lib/ai/prompts/form-4.ts:20` explicitly instruct use of "dumped" for sales
- No guidance exists to vary language or avoid repetitive verbs
- No acronym expansion guidance in AI prompts

**Formatting Issues**:
- Templates use minimal formatting to reduce clutter
- No section breaks or bullet lists in summary text
- Long paragraphs reduce skimmability

**Duplicate Emails**:
- Deduplication mechanisms exist but may have gaps in certain scenarios

## Detailed Findings

### 1. Form 4 (Insider Trading Reports)

**Data Extractor**: `lib/email/form4-data-extractor.ts` (699 lines)

**Fields Extracted**:
- ✅ `filerName`: Lines 129-147 - Extracts from "Reporting Person:", "Filer:", "Insider:" patterns
- ✅ `relationship`: Lines 152-175 - Extracts role (CEO, CFO, Director, Officer, 10% Owner)
- ✅ `transactions[]`: Lines 180-452 - Extracts from markdown tables or text patterns
  - `type`, `shares`, `pricePerShare`, `totalValue`, `acquisitionDisposition`, `code`, `date`
- ✅ `percentageChange`: Lines 477-493 - Extracts stake change percentage
- ✅ `newStake`: Lines 461-474 - Post-transaction ownership
- ✅ `previousStake`: Not directly extracted (could be calculated)
- ✅ Transaction codes mapped: P, S, A, D, G, M, F, J, K, X, C, W (lines 33-44)

**Transaction Type Detection** (`lib/email/form4-data-extractor.ts`):
- Gift transactions: Lines 415-433
- Trust/Family transfers: Lines 349-412, 499-516
- Options vs shares: Detected via transaction code mapping
- Holdings changes: Lines 457-496

**Email Template**: `components/ui/email/templates/form4-minimalist-template.tsx` (914 lines)

**Display Logic**:
- Filer name: Line 527 - Falls back to "Insider" if missing
- Filer role: Line 528 - Displays in email header (lines 577-583)
- Transaction cards: Lines 552-797 - Aggregates by type (gift, sale, purchase, transfer)
  - Shows transaction type, shares, value, price per share
  - **ISSUE**: "BOUGHT" label used for purchases (line 359), no specific "GRANTED" label for options
- Holdings change: Lines 803-858 - Displays as "Ownership Impact" section
  - Shows previous → new with arrow and percentage

**Transaction Card Display Issues**:
- Options granted (code A) show as acquisitions, not specifically labeled as "GRANTED"
- Multi-transaction scenarios aggregate into categories but don't show "multi transaction" indicator
- Code 'M' (exercise) transactions may not clearly indicate option exercise vs share sale

### 2. Form 144 (Notice of Proposed Sale)

**Data Extractor**: `lib/email/form144-data-extractor.ts` (726 lines)

**Fields Extracted**:
- ✅ `filerName`: Lines 114-136 - Extracts from multiple patterns
- ✅ `filerRole`: Lines 141-167 - CEO, CFO, Director, 10% Owner
- ✅ `shares`: Lines 172-207 - Number of shares to be sold
- ✅ `estimatedValue`: Lines 212-246 - Dollar value of proposed sale
- ✅ `pricePerShare`: Lines 251-272
- ✅ `remainingHoldings`: Lines 384-427 - Shares after proposed sale
- ✅ `percentOfHoldings`: Lines 276-295
- ❌ **GAP**: Full insider name not always shown (defaults to "insider")

**Email Template**: `components/ui/email/templates/form144-minimalist-template.tsx` (484 lines)

**Display Logic**:
- Filer name: Line 170 - Falls back to "Insider" if missing (CONFIRMS ISSUE)
- Filer role: Line 171 - Displays in email header (line 217)
- Transaction value: Lines 305-342 - PRIMARY display (estimated value card)
- Shares count: Lines 350-387 - SECONDARY display
- **ISSUE**: When filerName extraction fails, shows "{TICKER}: insider" instead of full name

### 3. DEF 14A / DEFA14A (Proxy Statements)

**Data Extractors**: No dedicated extractors found in `lib/email/` directory

**Email Templates**: `components/ui/email/templates/form-def14a-email-template.tsx`

**Current State**:
- Uses generic template or basic proxy template
- **FORMATTING ISSUE**: Long prose paragraphs without section breaks
- No bullet lists for proposals
- No table formatting for compensation data

**Available Data** (from AI schema in `lib/ai/prompts/unified-prompts.ts:647-746`):
- Meeting date, type, record date
- Executive compensation (top 5)
- CEO pay ratio
- Board proposals (up to 6)
- Shareholder proposals (up to 4)
- Director nominees (up to 15)
- Say-on-pay details
- Auditor ratification

### 4. Form 8-K (Current Reports)

**Data Extractor**: `lib/email/8k-data-extractor.ts` (location inferred from registry)

**Email Template**: `components/ui/email/templates/form8k-minimalist-template.tsx`

**Available Fields** (from PROGRESS.md:19-20):
- `eventType`, `summary`, `sentiment`, `keyHighlights`, `financialImpact`
- `managementCommentary`, `forwardGuidance`
- `positiveHighlights`, `negativeHighlights`, `itemNumbers`

**Template Registry**: Added in fix from 2026-01-15 (PROGRESS.md:65-72)

### 5. Free Writing Prospectus (FWP)

**Data Extractor**: ❌ Does not exist (from FWP agent research)

**Email Template**: Uses `GenericMinimalistTemplate` (fallback)

**Impact**: No form-specific data extraction or formatting for FWP filings

### 6. AI Prompt Language Guidance

**Location**: `lib/ai/prompts/unified-prompts.ts` (1,199 lines)

**Form 4 Extraction Rules** (lines 952-983):
```
- TABLE STRUCTURE:
  * Table I - Non-Derivative Securities: Direct stock ownership (common shares)
  * Table II - Derivative Securities: Options, warrants, convertible securities
- CRITICAL: Column 5 has the number of shares - ALWAYS extract this value. Never leave blank.
- COMPLETE TRANSACTION CODE MAPPING (Column 3):
  * P = Open market Purchase (BULLISH - insider buying with own money)
  * S = Open market Sale (may be routine or concerning depending on context)
  * A = Award/Grant (equity compensation - NOT a purchase, don't confuse with P)
  [... full mapping ...]
- The summary MUST include: ticker, insider name, transaction type, SHARE COUNT, dollar amount, and signal assessment
```

**Language Issues Found**:
- `lib/ai/prompts/form-4.ts:20`: "Active voice: 'Bezos dumped $3B' not 'shares were disposed of'"
- `lib/ai/prompts/form-4.ts:73`: Example summary uses "dumped"
- ❌ **NO GUIDANCE** on varying verbs (avoid repetitive "dump", "snags")
- ❌ **NO GUIDANCE** on explaining acronyms (TSR, PSU, etc.)

**10-K/10-Q Language**:
- No specific guidance on avoiding jargon
- No acronym expansion requirements

**Form 144 Language** (lines 1020-1043):
- Signal assessment uses "Notable Sale" vs "Routine 10b5-1"
- No verb variety guidance

### 7. Email Deduplication Mechanisms

**Primary Mechanism**: `services/filing/sendEmailSummary.ts`

**Line 95-99**:
```typescript
/**
 * Send an email summary of the latest filings with 100% duplicate elimination
 * @param email Recipient email address
 * @param tickers List of tickers to include in the summary
 * @param debug Debug mode flag
 * @param userId Optional user ID for user-specific deduplication
```

**Additional Deduplication**:
- Ticker-level: `lib/cron/ticker-deduplication.ts`
- Filing-level: Filing ID + User ID combinations likely used

**Observed Issues** (from user reports):
- CMG SCHEDULE 13D sent twice (7:03AM and 7:23AM on 2026-01-16)
- TSLA Form 4 sent twice (7:28AM and 7:49AM)
- BRK-B 8-K/A sent twice (8:18AM and 8:23AM)

**Potential Gaps**:
- Time-based deduplication may have race conditions
- Amended filings (Form 4/A, 8-K/A) may bypass deduplication checks
- Multiple concurrent job processing could create duplicates

## Code References

### Data Extractors
- `lib/email/form4-data-extractor.ts` - Form 4 extraction (699 lines)
- `lib/email/form144-data-extractor.ts` - Form 144 extraction (726 lines)
- `lib/email/extractor-registry.ts` - Registry of all extractors
- `lib/email/sc13g-data-extractor.ts` - Schedule 13G extraction
- `lib/email/sc13d-data-extractor.ts` - Schedule 13D extraction
- `lib/email/424b2-data-extractor.ts` - 424B2 prospectus extraction

### Email Templates
- `components/ui/email/templates/form4-minimalist-template.tsx` - Form 4 template (914 lines)
- `components/ui/email/templates/form144-minimalist-template.tsx` - Form 144 template (484 lines)
- `components/ui/email/templates/form-def14a-email-template.tsx` - DEF 14A template
- `components/ui/email/templates/form8k-minimalist-template.tsx` - 8-K template
- `components/ui/email/templates/generic-minimalist-template.tsx` - Fallback template
- `components/ui/email/templates/template-registry.ts:22-61` - Template registry

### AI Prompts
- `lib/ai/prompts/unified-prompts.ts` - Unified prompt system (1,199 lines)
  - Lines 952-983: Form 4 extraction rules
  - Lines 1020-1043: Form 144 extraction rules
  - Lines 908-928: 10-K extraction rules
  - Lines 930-950: 10-Q extraction rules
  - Lines 985-1018: 8-K extraction rules
  - Lines 1101-1130: DEF 14A extraction rules
- `lib/ai/prompts/form-4.ts:20` - Form 4 language guidance (uses "dumped")
- `lib/ai/prompts/form-4.ts:73` - Form 4 example summary

### Deduplication
- `services/filing/sendEmailSummary.ts:95-99` - Email deduplication comments
- `lib/cron/ticker-deduplication.ts` - Ticker-level deduplication

## Architecture Documentation

### Extraction Pipeline
1. **SEC Filing Retrieved** → Content fetched from EDGAR
2. **AI Summarization** → Claude API with form-specific prompts
3. **Text Extraction** → Data extractor parses AI summary text
4. **Template Selection** → Registry maps form type to email template
5. **Email Rendering** → React components render HTML email
6. **Deduplication Check** → Prevent duplicate sends
7. **Email Delivery** → Resend API sends to users

### Data Flow Gaps

**Missing Insider Names (Form 144, Form 4)**:
- **Root Cause**: AI summary may not include filer name
- **Extraction Fallback**: Extractor defaults to "Insider" (form144-data-extractor.ts:170, form4-minimalist-template.tsx:527)
- **Template Display**: Shows "{TICKER}: insider" instead of full name

**Missing Transaction Details**:
- **Shares**: Extractors capture but AI summary may omit
- **Holdings Change**: Extracted (form4-data-extractor.ts:457-496) but display depends on data availability
- **Multi-transaction Indicator**: Not currently shown in aggregated display

**Language Repetition**:
- **"Dump" Usage**: Hardcoded in prompt examples (form-4.ts:20, 73)
- **"Snags" Usage**: No evidence in prompts, likely AI model behavior
- **No Variation Guidance**: Prompts don't instruct verb variety

**Acronym Expansion**:
- **TSR (Total Shareholder Return)**: No expansion guidance
- **PSU (Performance Stock Units)**: No expansion guidance
- **General Rule**: unified-prompts.ts has no acronym expansion requirements

**Formatting for Readability**:
- Templates prioritize clean, minimal design
- Prose summaries lack section breaks
- No bullet lists in summary text (only in extracted data cards)

## Current Implementation Status Summary

| Form Type | Extractor | Email Template | Insider Name | Transaction Card | Holdings Change | Acronym Expansion |
|-----------|-----------|----------------|--------------|------------------|-----------------|-------------------|
| Form 4 | ✅ Full | ✅ Full | ⚠️ Extracted but may default to "Insider" | ✅ Yes | ✅ Yes | ❌ No |
| Form 144 | ✅ Full | ✅ Full | ⚠️ Extracted but defaults to "Insider" | ✅ Value + Shares | ⚠️ Partial (remaining holdings) | ❌ No |
| DEF 14A | ❌ No | ⚠️ Generic | N/A | N/A | N/A | ❌ No |
| DEFA14A | ❌ No | ⚠️ Generic | N/A | N/A | N/A | ❌ No |
| 8-K | ✅ Yes | ✅ Full | N/A | N/A | N/A | ❌ No |
| FWP | ❌ No | ❌ Generic | N/A | N/A | N/A | ❌ No |
| Schedule 13D/13G | ✅ Yes | ✅ Yes | ✅ Yes | N/A | N/A | ❌ No |
| 10-K | ✅ Yes | ✅ Full | N/A | N/A | N/A | ❌ No |
| 10-Q | ✅ Yes | ✅ Full | N/A | N/A | N/A | ❌ No |

Legend:
- ✅ = Implemented and working
- ⚠️ = Partial implementation or fallback behavior
- ❌ = Not implemented

## Specific Issues from User Reports

### 1. META Form 144 (2026-01-13): Shows "META: insider" instead of "Jennifer Newstead"
- **File**: form144-minimalist-template.tsx:170
- **Behavior**: `filerName` defaults to "Insider" when extraction fails
- **Extractor**: form144-data-extractor.ts:114-136 has patterns to extract name
- **Issue**: AI summary may not contain filer name in expected format

### 2. GOOGL Form 4 (2026-01-08): Missing shares below transaction value
- **File**: form4-minimalist-template.tsx:677-743
- **Behavior**: Aggregated transaction cards show value as PRIMARY, shares as SECONDARY (line 713-723)
- **Current Display**: "$X.XM" with "XXX,XXX shares @ $X.XX" below
- **Issue**: May not be prominent enough if value is missing

### 3. GOOGL Form 4 (2026-01-08): Missing holdings change
- **File**: form4-minimalist-template.tsx:803-858
- **Behavior**: "Ownership Impact" section shows holdings change
- **Current**: `previousStake → newStake (percentChange)`
- **Issue**: Display depends on data availability from extractor

### 4. COIN Form 4 (2026-01-07): "Bought 10M 0 shares" - Options exercise
- **File**: form4-minimalist-template.tsx:705
- **Behavior**: Shows "{label} (count)" for aggregated transactions
- **Issue**: "BOUGHT" label used for all acquisitions, including grants
- **Code M**: Exercise of options (line 966) not specifically labeled

### 5. Formatting Issues: Large paragraphs hard to skim
- **Files**: All templates use minimal formatting
- **Summary Text**: formatText() (line 478-496) only bolds numbers/percentages
- **No**: Section breaks, bullet lists in prose, or paragraph separation

### 6. Language: "Dump" and "Snags" repetition
- **"Dump"**: Explicitly instructed in form-4.ts:20
- **"Snags"**: Not found in prompts (likely AI model vocabulary)
- **No Variation**: Prompts don't guide verb diversity

### 7. Acronyms: TSR, PSU not explained (GOOGL Form 4, 2026-01-16)
- **Location**: unified-prompts.ts has no acronym expansion guidance
- **Form 4 Rules**: Lines 952-983 don't mention acronyms
- **General Schema**: No field for acronym glossary

### 8. Duplicate Emails: Same summary sent twice
- **Examples**: CMG (7:03AM, 7:23AM), TSLA (7:28AM, 7:49AM), BRK-B (8:18AM, 8:23AM)
- **Dedup System**: sendEmailSummary.ts:95-99 claims "100% duplicate elimination"
- **Potential Issue**: Race conditions, amended filings (/A suffix), or time-based gaps

### 9. COIN Form 4 (2026-01-16): Missing transaction card
- **Template**: form4-minimalist-template.tsx:665-797
- **Display Logic**: Only shows if `hasTransactionData` is true (line 664)
- **Issue**: Transaction data may not be extracted or available from AI summary

## Related Research

No prior research documents found in thoughts/shared/research/ directory.

## Open Questions

1. **AI Summary Quality**: Why are filer names sometimes missing from AI-generated summaries?
2. **Duplicate Root Cause**: What specific conditions cause duplicate emails (amended filings, race conditions, timing)?
3. **Transaction Card Logic**: Should option grants have a dedicated card style vs "BOUGHT"?
4. **Formatting Strategy**: Should templates add section breaks and bullet lists to improve skimmability?
5. **Language Diversity**: Should AI prompts explicitly instruct verb variation?
6. **Acronym Strategy**: Should prompts require first-use expansion of uncommon acronyms?
7. **Holdings Change**: Why isn't this data consistently available for all Form 4 filings?

## Next Steps for Investigation

1. Review AI summary outputs for Form 4 and Form 144 to understand why filer names are missing
2. Analyze deduplication logic in sendEmailSummary.ts to identify race condition vulnerabilities
3. Test AI prompt modifications to add:
   - Verb variety guidance (avoid repetitive "dump", "snags")
   - Acronym expansion requirements (TSR → Total Shareholder Return)
   - Filer name extraction emphasis
4. Consider template updates to:
   - Add section breaks in summary text
   - Create dedicated "GRANTED" transaction card for options (code A, M)
   - Show "multi transaction" indicator when aggregating
   - Improve paragraph spacing for skimmability
5. Investigate amended filing (/A suffix) handling in deduplication logic
