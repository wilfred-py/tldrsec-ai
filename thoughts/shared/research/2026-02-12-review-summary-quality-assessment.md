---
date: 2026-02-12T04:52:41Z
researcher: Claude
git_commit: 64add43
branch: review-summary-quality
repository: review-summary-quality
topic: "Email Summary Quality Assessment: Formatting, Content, Timeliness, Deduplication, and Materiality"
tags: [research, codebase, email-templates, ai-prompts, content-validation, summary-quality, form-4, 8-k, 10-k, 10-q, timeliness]
status: complete
last_updated: 2026-02-12
last_updated_by: Claude
---

# Research: Email Summary Quality Assessment

**Date**: 2026-02-12T04:52:41Z
**Researcher**: Claude
**Git Commit**: 64add43
**Branch**: review-summary-quality
**Repository**: review-summary-quality

## Research Question

Comprehensive assessment of email summary quality issues across multiple filing types, covering: duplicate GOOGL 10-K emails, sparse/blank sections in 10-K/10-Q summaries, 8-K formatting inconsistencies (bullet points, bold, truncation), Form 4 missing transaction details and insider name display, timeliness gaps between filing date and email delivery, AI-generated language patterns ("snag"), materiality misclassification of large acquisitions, and potential for a quality review agent.

## Summary

The system uses a two-tier architecture: (1) structured AI prompts via `unified-prompts.ts` enforcing JSON output with form-specific schemas, and (2) minimalist email templates that render structured data with form-specific extractors as fallback. **Critical finding: there are NO quality gates that prevent poor summaries from being emailed to users.** Post-AI validation is informational only (warn-and-continue). There are no staleness checks for filing age, no item number descriptions in 8-K templates, no enforcement of bold formatting consistency, and the Form 4 title falls back to "TSLA:Insider" when `filerName` extraction fails. The duplicate GOOGL scenario is likely caused by either multiple users tracking the same ticker or a transaction rollback losing the email delivery record.

---

## Detailed Findings

### 1. AI Prompt System

#### Active Production System
**File**: `lib/ai/prompts/unified-prompts.ts` (1,276 lines)
**Entry point**: `generateFilingPrompt()` at line 1176, invoked from `lib/ai/summarize.ts:430-456`

The unified prompt system enforces JSON-only output with strict rules:

**System prompt** (lines 848-892):
- Must respond with raw JSON only (no markdown code blocks)
- Exact field names from schema (no synonyms)
- All text fields must be complete sentences with proper punctuation
- Numbers must include units ($, %, shares)
- FORBIDDEN: markdown headers, lists, bold formatting inside JSON strings
- Write as "plain prose sentences"

**Writing style** (lines 876-892):
- "Write like a financial journalist at Morning Brew or Bloomberg"
- Lead with the most important number or fact
- Active voice required
- Verb variety for sales: "sold", "divested", "offloaded", "shed", "liquidated"
- Verb variety for purchases: "acquired", "bought", "purchased", "scooped up", "added"
- No specific word blocklist exists (e.g., "snag" is not blocked)
- Acronym expansion rules for uncommon acronyms

**Legacy prompts** exist but are NOT active in production:
- `lib/ai/prompts/form-10k.ts` - Journalist-style 10-K prompt
- `lib/ai/prompts/form-10q.ts` - Journalist-style 10-Q prompt
- `lib/ai/prompts/form-8k.ts` - Breaking news style 8-K prompt
- `lib/ai/prompts/form-4.ts` - Matt Levine style Form 4 prompt

#### 10-K/10-Q Required Financial Metrics
**Lines 924-951**:

10-K requires: Revenue, Net Income, Gross Margin, EPS, Operating Income, Free Cash Flow
10-Q requires: Revenue (with YoY AND QoQ), Net Income, Gross Margin, EPS, Operating Margin, Cash Flow from Operations

Gross margin is explicitly called out: "Gross margin is a KEY METRIC for investors - if not explicitly stated, calculate it from revenue and cost of revenue/COGS" (line 935)

#### 8-K Materiality Handling
**Lines 253-299, 997-1028**:

The system uses:
- `sentiment` enum: positive/negative/neutral/mixed (lines 267-271)
- Item number categorization with high-impact items flagged (line 1023)
- `financialImpact` field with maxLength of 250 chars (lines 283-287)

**There is NO explicit "routine" vs "material" binary classification in the AI prompt.** The email template (`8k-minimalist-template.tsx:86-104`) applies this classification using:
- Material keywords: acquisition, merger, earnings, CEO, CFO, dividend, buyback
- Material item numbers: 1.01-8.01
- Default: "Routine Disclosure" for exhibit-only or non-material items

**Critical gap**: A $1B acquisition classified as "routine" would be a keyword-matching failure, not an AI judgment. The materiality logic at `8k-minimalist-template.tsx:52-77` (`isMaterialFiling()`) relies on pattern matching rather than dollar-amount-based thresholds.

#### Form 4 Schema
**Lines 301-351**:

Required fields: `filerName`, `filerRole`, `transactions[]` (each with `type`, `shares`, `price`), `totalValue`, `signalStrength`, `percentageChange`, `has10b51Plan`

Transaction codes mapped (lines 968-981): P=Purchase, S=Sale, A=Award, D=Disposition, G=Gift, M=Exercise, F=Tax, J/K=Other

**Key instruction** (line 993): "The summary MUST include: ticker, insider name, transaction type, SHARE COUNT, dollar amount, and signal assessment"

---

### 2. Email Template System

#### Template Registry
**File**: `services/filings/email/emailGenerator.ts:32-54`

O(1) lookup maps filing types to React components:
- Form 4 -> `Form4MinimalistTemplate`
- 8-K -> `Form8KMinimalistTemplate`
- 10-K -> `Form10KMinimalistTemplate`
- 10-Q -> `Form10QMinimalistTemplate`
- All others -> `GenericMinimalistTemplate`

#### Form 4 H1 Title Construction
**File**: `components/ui/email/templates/sections/EmailHeader.tsx:90`

```tsx
{ticker}: {filerName || companyName}
```

- **When `filerName` exists**: "TSLA: Vaibhav Taneja, Chief Financial Officer"
- **When `filerName` is missing**: Falls back to `companyName` which may produce "TSLA: Tesla Inc." or potentially just "TSLA:Insider" if both are sparse
- Badge above title shows "FORM 4 | INSIDER" when `filerName` present (line 80)

**Current issue**: If the AI fails to extract `filerName` from the Form 4 filing, or if the data extractor at `lib/email/form4-data-extractor.ts:129-147` fails its regex patterns, the title degrades to showing just the company name or a generic label.

#### 8-K Items Reported Section
**File**: `components/ui/email/templates/8k-minimalist-template.tsx:284-363`

- Displays item numbers as "Item 2.02, Item 5.02" (comma-separated)
- **No human-readable descriptions** are attached to item numbers
- The item-to-description mapping exists in the AI prompt (lines 997-1022 of unified-prompts.ts) but is NOT used in the email template
- Template shows raw item numbers without context (e.g., "Item 9.01" without "Financial Statements and Exhibits")

#### 8-K Key Highlights Bullet Points
**File**: `components/ui/email/templates/8k-minimalist-template.tsx:368-404`

- Rendered with bullet character: `<span style={{ marginRight: '8px', color: EmailColors.text.meta }}>` (line 395)
- Each highlight gets `formatText()` which bolds dollar amounts and percentages
- Up to 5 highlights shown (line 386)

#### Bold Formatting
**File**: `components/ui/email/design-system.ts:391-393`

- `**text**` or `__text__` -> `<strong style="font-weight:600;color:#000000;">text</strong>`
- Template-specific `formatText()` functions additionally bold dollar amounts and percentages via regex
- **No consistency enforcement** - bold depends entirely on what the AI includes in `**...**` markers and what the regex catches

#### Empty/Missing Section Handling
Templates use conditional rendering (`{data && (...)}`) for each section:
- Form 4: Hides transaction metrics when no data, shows "View the full Form 4 filing" fallback (lines 902-916)
- 8-K: Hides items/highlights when empty, shows summary-only fallback
- 10-K: Each section independently renders if data available; summary text always shown as final fallback
- **No warning or quality indicator** when sections are empty - they silently disappear

#### Form 4 Transaction Display
**File**: `components/ui/email/templates/form4-minimalist-template.tsx:665-798`

Transactions aggregated by type via `aggregateTransactionsByType()` (lines 215-291):
- Sale: Red card with shares count, dollar value, avg price
- Purchase: Green card
- Gift: Purple card with shares but **value may show $0** for bona fide gifts
- Transfer: Blue card

**Ownership impact** (lines 804-877): Shows Previous Stake -> Arrow -> New Stake only when stake data exists AND transactions displayed.

---

### 3. Content Validation System

#### Pre-AI Validation (BLOCKS processing)
**File**: `lib/validation/filing-content-validator.ts:109-235`

Checks: non-null content, NoSuchKey errors, minimum 500 chars, valid year range, malformed content. If validation fails, filing processing STOPS - no summary generated, no email sent.

#### Post-AI Validation (WARNS only, does NOT block)
**File**: `lib/validation/summary-content-validator.ts:88-237`

AI-powered validation scoring (0-100) for accuracy, completeness, relevance, confidence. Thresholds are generous:
- accuracyScore >= 50
- completenessScore >= 40
- relevanceScore >= 50

**Critical**: `filing-processor.ts:1302-1315` explicitly states:
```typescript
// Proceeding with storing summary despite validation issues (warn only)
```

**Email queuing occurs at line 1513 regardless of validation results.**

#### What Does NOT Exist
1. No empty/blank section detection before email sending
2. No truncated content detection for summaries
3. No minimum content length requirements for summaries
4. No formatting consistency validation
5. No post-generation quality review step
6. No quality gates preventing poor summaries from delivery
7. No quality review agent

---

### 4. Duplicate Filing Prevention

#### Five-Layer Deduplication
1. **Database unique constraints**: `RssFilingCheck.accessionNumber`, `Summary(tickerId, filingUrl)`, `SummaryEmailDelivery(userId, summaryId)`
2. **Advisory locks**: PostgreSQL `pg_advisory_lock` per user+tickers combination
3. **Distributed locks**: `EmailQueueLock` for queue processing
4. **Idempotency keys**: JobQueue keys format `ASYNC_FETCH_FILING:{userId}:{accessionNumber}`
5. **Atomic transactions**: Email delivery uses `$transaction` with `skipDuplicates: true`

#### Likely Cause of 2 GOOGL 10-K Emails (27 min apart)
Most likely scenarios:
1. **Different users** - Two users track GOOGL, each gets their own email (each has unique `Summary` + `SummaryEmailDelivery` records)
2. **Transaction rollback** - First email sent but `SummaryEmailDelivery` record rolled back, second cron run re-sent
3. **Advisory lock timeout** - Lock expired during first send, second process started

**NOT caused by**: Amendment confusion (amendments have different accession numbers), or missing unique constraints.

#### Amendment Handling
The system does NOT distinguish amendments from originals. Both get processed as separate filings since they have unique accession numbers. This is intentional - amendments may contain material changes.

---

### 5. Timeliness / Staleness Checks

#### Current State: NO staleness filtering exists

**Discovery handler** (`lib/cron/handlers/discovery-handler.ts:308-340`):
- `getUnprocessedFilings(50)` retrieves all unprocessed filings regardless of age
- Orders by `rssEntryDate: 'desc'` (discovery date), not `filingDate`
- No age-based filtering

**shouldProcessFiling()** (`lib/filing/filing-type-preferences-mapper.ts:89-110`):
- Only checks filing type against user preferences (10-K, 10-Q, 8-K, etc.)
- Does NOT check filing age or staleness

**Email templates**:
- Show filing date as absolute: "Oct 31, 2025" format
- No relative time indicator ("Filed 3 months ago")
- No staleness warning banner

#### AAPL 10-K Filed Oct 31, 2025 -> Email Jan 30, 2026
Possible causes:
1. Filing not discovered in RSS feed initially (CIK mapping issues, TickerMonitoring gaps)
2. Processing queue backlog (stuck behind 50+ unprocessed filings per cycle)
3. Job execution delays (retry exponential backoff, DLQ entries)
4. User ticker added after filing date (filing discovered on next RSS scan)

**The system is designed for 100% coverage (eventually process all filings) rather than timely delivery.**

---

### 6. Form 4 Specific Issues

#### Multi-Transaction Display
**File**: `components/ui/email/templates/form4-minimalist-template.tsx`

Transactions are aggregated by type (`aggregateTransactionsByType()` at `lib/email/form4-data-extractor.ts:215-291`). When both sale and gift transactions exist:
- Each type gets its own colored card
- Sale card shows shares and dollar value
- Gift card shows shares but **may show $0 value** since gifts have no consideration

**If the extractor fails to parse transactions**, the template shows nothing and falls back to summary text only (lines 902-916).

#### Insider Name Display
**Title construction**: `{ticker}: {filerName || companyName}`

The `filerName` is extracted by:
1. AI prompt: `filerName` field in Form 4 schema (unified-prompts.ts:305-308)
2. Data extractor fallback: regex patterns at `lib/email/form4-data-extractor.ts:129-147`
   - Patterns: "Reporting Person", "Filer:", "Insider:", name-after-ticker

If both fail, title shows company name instead of insider name.

#### Ownership Impact
Only displayed when:
- `hasTransactionData` is true (transactions were parsed)
- Stake data exists (previous/new ownership percentages)

If either condition fails, ownership impact section is silently omitted.

---

### 7. Formatting Issues

#### Bullet Points in Key Highlights
8-K key highlights are rendered with `<span>` bullet characters at `8k-minimalist-template.tsx:395`. The AI is instructed NOT to use markdown lists inside JSON (unified-prompts.ts:873), but the template itself adds bullets when rendering the `keyHighlights` array.

If the AI also includes bullet characters in the JSON string values (violating the prompt instructions), users see double bullets.

#### Bold Formatting Inconsistency
Two sources of bold:
1. AI includes `**text**` in summary text (converted by `markdownToHtml()`)
2. Template `formatText()` auto-bolds dollar amounts and percentages via regex

There is no validation that bold is applied consistently or intentionally. The AI may bold some numbers but not others, and the regex catches additional patterns.

#### Content Truncation
**No length-based truncation in the current pipeline.** Response-parser.ts:417 explicitly states: "No longer truncating summaries to fixed length." However, the AI's `maxLength` constraints on schema fields (e.g., `financialImpact: maxLength 250`) may cause the AI to produce shorter content.

---

### 8. AI Language Patterns ("snag", etc.)

**No word blocklist exists** in the prompt system. The unified prompt (lines 876-892) provides:
- Style guidance: "Write like Morning Brew or Bloomberg"
- Verb variety lists for transactions
- Acronym rules

But there is **no negative list** of words to avoid (like "snag", "game-changer", "dive into", etc.). The AI may produce repetitive patterns based on its training data.

The legacy prompts (`form-8k.ts:83-91`) include good/bad examples showing preferred style, but these are NOT active in production.

---

### 9. Post-Generation Quality Review

**No quality review agent or step exists.** The pipeline flow is:

1. AI generates summary -> 2. Parse JSON -> 3. Validate (warn only) -> 4. Store in DB -> 5. Queue email -> 6. Send email

There is no step between 4 and 5 (or 5 and 6) that reviews the summary for:
- Meaningful content
- Consistent formatting
- Clean design
- Section completeness
- Appropriate materiality assessment

The validation at step 3 (`summary-content-validator.ts`) uses a second AI call to score accuracy/completeness/relevance, but its results are informational only and never block delivery.

---

## Code References

### AI Prompts
- `lib/ai/prompts/unified-prompts.ts:848-892` - System prompt with style rules
- `lib/ai/prompts/unified-prompts.ts:253-299` - 8-K schema (sentiment, itemNumbers, financialImpact)
- `lib/ai/prompts/unified-prompts.ts:301-351` - Form 4 schema (filerName, transactions, signalStrength)
- `lib/ai/prompts/unified-prompts.ts:158-192` - 10-K schema (financialHighlights, segments, riskFactors)
- `lib/ai/prompts/unified-prompts.ts:194-251` - 10-Q schema
- `lib/ai/prompts/unified-prompts.ts:876-892` - Writing style and verb variety
- `lib/ai/prompts/unified-prompts.ts:997-1023` - 8-K item number mapping (high-impact items)
- `lib/ai/summarize.ts:430-456` - `getPromptForFilingType()` invocation

### Email Templates
- `components/ui/email/templates/form4-minimalist-template.tsx:505-930` - Form 4 template
- `components/ui/email/templates/8k-minimalist-template.tsx:135-466` - 8-K template
- `components/ui/email/templates/10k-minimalist-template.tsx:24-242` - 10-K template
- `components/ui/email/templates/10q-minimalist-template.tsx` - 10-Q template
- `components/ui/email/templates/sections/EmailHeader.tsx:83-98` - H1 title construction
- `components/ui/email/design-system.ts:356-419` - Markdown to HTML converter
- `services/filings/email/emailGenerator.ts:32-54` - Template registry

### Data Extractors
- `lib/email/form4-data-extractor.ts:81-124` - Form 4 data extraction pipeline
- `lib/email/form4-data-extractor.ts:33-44` - Transaction code mapping
- `lib/email/form4-data-extractor.ts:521-621` - Signal strength determination
- `lib/email/8k-data-extractor.ts:22-54` - 8-K data extraction
- `lib/email/8k-data-extractor.ts:61-86` - Item number extraction

### Content Validation
- `lib/validation/filing-content-validator.ts:109-235` - Pre-AI content validation (blocks)
- `lib/validation/summary-content-validator.ts:88-237` - Post-AI quality validation (warns only)
- `lib/cron/filing-processor.ts:1258-1332` - Validation invocation (STEP 3.5)
- `lib/cron/filing-processor.ts:1302-1315` - "Proceeding despite validation issues" logic
- `lib/cron/filing-processor.ts:1513-1602` - Email queuing (no quality gate)

### Duplicate Prevention
- `prisma/schema.prisma:215` - `RssFilingCheck.accessionNumber` unique constraint
- `prisma/schema.prisma:144` - `Summary(tickerId, filingUrl)` unique constraint
- `prisma/schema.prisma:611` - `SummaryEmailDelivery(userId, summaryId)` unique constraint
- `services/filing/sendEmailSummary.ts:432-498` - Atomic email send with skipDuplicates
- `services/filing/sendEmailSummary.ts:111-124` - Advisory lock for email sending

### Timeliness
- `lib/cron/handlers/discovery-handler.ts:308-340` - No age filtering in discovery
- `lib/filing/filing-type-preferences-mapper.ts:89-110` - shouldProcessFiling (no age check)
- `components/ui/email/templates/sections/EmailHeader.tsx:25-27` - Date display (absolute only)

### 8-K Materiality
- `components/ui/email/templates/8k-minimalist-template.tsx:52-77` - `isMaterialFiling()` keyword matching
- `components/ui/email/templates/8k-minimalist-template.tsx:86-104` - Material vs Routine badge

---

## Architecture Documentation

### Pipeline Flow (Filing -> Email)
```
SEC RSS Feed -> Discovery Handler -> RssFilingCheck (unique accessionNumber)
    -> JobQueue (ASYNC_FETCH_FILING with idempotency key)
    -> Filing Processor:
        STEP 1: Fetch content
        STEP 1.5: Content validation (BLOCKS if invalid)
        STEP 2: Cache check (reuse shared summaries)
        STEP 3: AI generation via unified-prompts.ts
        STEP 3.5: Summary validation (WARNS only)
        STEP 4: Database storage (summaryText + summaryJSON)
        STEP 5: Email queuing (NO quality gate)
    -> Email Generation:
        Template selection via registry
        Data from summaryJSON + extractor fallback from summaryText
        markdownToHtml() conversion
        Resend delivery
```

### Data Dual-Storage
- `summaryText`: Plain text/markdown summary for fallback extraction
- `summaryJSON`: Structured JSON with form-specific fields for template rendering
- Templates prefer `summaryJSON`, fall back to extractors parsing `summaryText`

### Validation Philosophy
- **Availability over quality**: Users receive summaries even when quality is questionable
- **Pre-AI validation blocks**: Invalid SEC content prevented from reaching AI (cost savings)
- **Post-AI validation warns**: Quality scores stored for monitoring but don't prevent delivery

---

## Historical Context (from thoughts/)

Relevant prior research documents:
- `thoughts/shared/research/2026-01-20-filing-summary-email-quality-gaps.md` - Previous quality gap analysis
- `thoughts/shared/research/2026-01-10-summary-quality-feedback-analysis.md` - Earlier summary quality feedback
- `thoughts/shared/research/2025-12-24-email-summary-discrepancies.md` - Email/summary discrepancy investigation
- `thoughts/shared/research/2026-01-07-sec-filing-prompts-templates-architecture.md` - Prompt/template architecture
- `thoughts/shared/research/2025-12-18-duplicate-summaries-analysis.md` - Duplicate summary analysis
- `thoughts/shared/research/2025-12-04-email-template-design-validation.md` - Email template design validation
- `thoughts/shared/research/2026-01-06-summary-generation-system.md` - Summary generation system overview

---

## Categorized Issues from User Report

### A. Formatting Issues
| Issue | Root Cause | Location |
|-------|-----------|----------|
| VRT 8-K dot before "vertiv shelled out..." | AI included leading period in summary text | AI output in `summaryText` field |
| KO 8-K bullet points at start of key highlights | Template adds bullets when rendering `keyHighlights` array + AI may include them too | `8k-minimalist-template.tsx:395` |
| KO 8-K truncated second key highlight | AI `maxLength: 200` per highlight (unified-prompts.ts:140) may cause truncation | `unified-prompts.ts:140` |
| KO 8-K inconsistent bold formatting | Two sources: AI `**text**` + template regex auto-bold on numbers | `design-system.ts:391-393` + template `formatText()` |
| KO 8-K "points to attached release" - not meaningful | AI generated uninformative highlight; no quality gate blocks this | Prompt quality gap |

### B. Content Quality Issues
| Issue | Root Cause | Location |
|-------|-----------|----------|
| GOOGL/AAPL 10-K sparse/blank sections | AI may produce incomplete JSON; no quality gate blocks sparse summaries | `filing-processor.ts:1302-1315` (warn only) |
| AAPL 10-Q similar issues | Same root cause as 10-K | Same |
| TSLA/CMG 10-K similar issues | Same root cause | Same |
| META 8-K "financial impact" too general | AI `financialImpact` field maxLength 250 chars; no specificity enforcement | `unified-prompts.ts:283-287` |
| META 8-K items reported without descriptions | Template shows raw "Item 2.02" without human-readable labels | `8k-minimalist-template.tsx:292-320` |
| AAPL 8-K general counsel change - no enrichment | No web search integration in summarization pipeline | Pipeline design gap |

### C. Form 4 Issues
| Issue | Root Cause | Location |
|-------|-----------|----------|
| TSLA Form 4 H1 shows "TSLA:Insider" not person name | `filerName` extraction failed; falls back to generic | `EmailHeader.tsx:90` |
| Sale doesn't show number of shares | AI or extractor failed to populate `shares` field | `form4-data-extractor.ts:215-291` |
| Gift doesn't show $value (only shares) | Gifts genuinely have $0 consideration; template shows $0 | `form4-minimalist-template.tsx:715-716` |
| Multi-transaction (sale + gift) not shown | Aggregation may fail if extractor can't parse both transaction types | `form4-data-extractor.ts:215-291` |
| Ownership impact not shown | Requires both `hasTransactionData` AND stake data | `form4-minimalist-template.tsx:804-877` |

### D. Materiality & Classification Issues
| Issue | Root Cause | Location |
|-------|-----------|----------|
| VRT 8-K $1B acquisition classified as "routine" | `isMaterialFiling()` uses keyword matching, may miss dollar-amount signals | `8k-minimalist-template.tsx:52-77` |
| "snag" appearing multiple times | No word blocklist in prompts | `unified-prompts.ts:876-892` |

### E. Timeliness Issues
| Issue | Root Cause | Location |
|-------|-----------|----------|
| AAPL 10-K filed Oct 31 -> email Jan 30 (3 months) | No staleness check; backlog processing treats all ages equally | `discovery-handler.ts:308-340` |
| Multiple summaries with filing date > 1 day from email | No freshness filtering or user notification | No implementation exists |
| Duplicate GOOGL 10-K emails 27 min apart | Likely different users, or transaction rollback losing delivery record | `sendEmailSummary.ts:432-498` |

---

## Open Questions

1. **GOOGL duplicate emails**: Were they sent to the same user or different users? Need to query `SummaryEmailDelivery` table for GOOGL 10-K records around Feb 5.
2. **"snag" frequency**: How many summaries contain "snag"? Need database query on `summaryText` field.
3. **Sparse 10-K/10-Q summaries**: Is the issue in AI generation (model producing incomplete JSON) or in parsing (losing data during JSON extraction)?
4. **Form 4 filerName failures**: How often does the filerName extraction fail? Need to audit `summaryJSON` for Form 4s with missing `filerName`.
5. **Historical quality scores**: What are the average validation scores from `summary-content-validator.ts` across filing types?
6. **Prior quality improvements**: The PROGRESS.md references past email template and content validation updates - were these the filing-content-validator (pre-AI) or summary-content-validator (post-AI)?
