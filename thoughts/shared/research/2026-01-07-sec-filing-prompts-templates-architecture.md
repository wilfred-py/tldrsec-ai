---
date: 2026-01-07T18:14:08+11:00
researcher: Claude
git_commit: 4f42898633faac7cc1cbb61d53886a93cef487d2
branch: review-generated-summaries
repository: review-generated-summaries
topic: "SEC Filing AI Prompts and Email Templates Architecture"
tags: [research, codebase, ai-prompts, email-templates, sec-filings, summarization]
status: complete
last_updated: 2026-01-07
last_updated_by: Claude
---

# Research: SEC Filing AI Prompts and Email Templates Architecture

**Date**: 2026-01-07 18:14:08 AEDT
**Researcher**: Claude
**Git Commit**: 4f42898633faac7cc1cbb61d53886a93cef487d2
**Branch**: review-generated-summaries
**Repository**: review-generated-summaries

## Research Question

Document the current architecture of SEC filing AI summarization prompts and email templates, including:
1. What prompts exist for each SEC filing type
2. How email templates consume structured data from AI summaries
3. What data extractors exist to bridge sparse summaryData
4. Coverage gaps between filing types mentioned in Reddit post and current implementation

## Summary

The codebase implements a dual-layer summarization system:

1. **AI Prompt Layer** (`lib/ai/prompts/`): Generates structured JSON summaries from raw SEC filing content using the configured AI model (defined in `.env` - supports various providers including xAI, OpenRouter, Anthropic). The unified prompt system (`unified-prompts.ts`) defines JSON schemas for 9 filing types with strict field requirements.

2. **Email Template Layer** (`components/ui/email/templates/`): Renders AI-generated summaries into styled HTML emails. Templates expect specific structured data fields (e.g., `keyHighlights`, `financialImpact`, `segments`) from the `summaryData` object.

3. **Data Extractor Layer** (`lib/email/`): Bridges the gap when AI-generated `summaryData` is sparse by extracting structured data from `summaryText` using regex patterns. Currently only exists for Form 8-K, Form 4, and Form 144.

## Detailed Findings

### 1. AI Prompt System

#### Core Files

| File | Purpose |
|------|---------|
| [unified-prompts.ts](lib/ai/prompts/unified-prompts.ts) | Primary prompt engine with JSON schemas for 9 filing types |
| [form-10k.ts](lib/ai/prompts/form-10k.ts) | 10-K specific journalist-tone prompt class |
| [form-10q.ts](lib/ai/prompts/form-10q.ts) | 10-Q specific journalist-tone prompt class |
| [form-8k.ts](lib/ai/prompts/form-8k.ts) | 8-K specific breaking-news-style prompt class |
| [form-4.ts](lib/ai/prompts/form-4.ts) | Form 4 Matt-Levine-style prompt class |
| [generic.ts](lib/ai/prompts/generic.ts) | Fallback for unsupported filing types |
| [prompt-templates.ts](lib/ai/prompts/prompt-templates.ts) | Reusable base templates (ANNUAL_REPORT_TEMPLATE, etc.) |
| [context-manager.ts](lib/ai/prompts/context-manager.ts) | Token budget management per filing type |

#### Filing Types with Dedicated JSON Schemas (unified-prompts.ts)

| Filing Type | Required Fields | Optional Fields |
|-------------|----------------|-----------------|
| **10-K** | company, summary, fiscalYear, keyHighlights | risks (max 3), revenue, netIncome |
| **10-Q** | company, summary, fiscalQuarter, keyHighlights | revenue, quarterOverQuarterChange |
| **8-K** | company, summary, eventType, keyHighlights, sentiment | itemNumbers, financialImpact, managementCommentary, forwardGuidance |
| **4 (Form 4)** | company, summary, filerName, transactions | totalValue, signalStrength, percentageChange |
| **144** | company, summary, filerName, shares, estimatedValue, remainingHoldings, signalStrength | pricePerShare, broker, tradingPlan |
| **SC 13G** | company, summary, filerName, ownershipPercentage | sharesOwned, filingPurpose |
| **SC 13D** | company, summary, filerName, ownershipPercentage | sharesOwned, purpose |
| **424B2** | company, summary, offeringType | offeringAmount, maturityDate, interestRate |
| **Generic** | company, summary | keyPoints (max 5) |

#### Writing Style Guidance

All prompts enforce a "financial journalist" tone inspired by Matt Levine / Morning Brew:
- Lead with the punchline (most important number/fact first)
- Active voice ("CEO sold" not "shares were disposed")
- Specific numbers with units ($45B, +15% YoY)
- No corporate-speak or jargon
- Witty, concise, zero fluff

Example from `form-8k.ts:15-31`:
```
You're breaking news for investors. 8-K filings are material events that move stock prices.

Your style:
- Lead with what happened: "CEO fired" not "Leadership transition announced"
- Explain why it matters: Impact on revenue, strategy, or operations
- No euphemisms: "Lawsuit" not "litigation matter", "Fired" not "separated"
- Quantify impact: "$50M charge" not "material impact"
```

### 2. Email Template System

#### Template Registry ([template-registry.ts](lib/email/template-registry.ts))

The `TemplateRegistry` class provides O(1) lookup for email templates based on filing type. It maps multiple form type variations to appropriate templates:

| Template | Filing Types Mapped |
|----------|---------------------|
| Form4MinimalistTemplate | Form 3, Form 4, Form 5, 3, 4, 5 |
| Form10KMinimalistTemplate | 10-K, 10K, Form 10-K |
| Form10QMinimalistTemplate | 10-Q, 10Q, Form 10-Q |
| Form8KMinimalistTemplate | 8-K, 8K, Form 8-K |
| Form144MinimalistTemplate | 144, Form 144 |
| FormDEF14AEmailTemplate | DEF 14A, DEF14A |
| Schedule13DEmailTemplate | Schedule 13D, 13D |
| GenericMinimalistTemplate | Fallback for all other types |

#### Template Data Requirements

Templates extract data from `filing.summaryData` object. Key expected fields per template:

**10-K Template** ([10k-minimalist-template.tsx](components/ui/email/templates/10k-minimalist-template.tsx)):
- `financialHighlights[]` - Array of {label, value, change}
- `keyPoints[]` - Array of strings (fallback if no financials)
- `riskFactors[]` - Array of risk strings (max 3 displayed)
- `segments[]` - Array of {name, revenue, growth}

**8-K Template** ([8k-minimalist-template.tsx](components/ui/email/templates/8k-minimalist-template.tsx)):
- `eventType` - Event category (Earnings, M&A, etc.)
- `itemNumbers[]` - SEC item numbers (2.02, 5.02, etc.)
- `keyHighlights[]` - Top 3-5 material facts
- `financialImpact` - Dollar amounts and percentages
- `sentiment` - positive/negative/neutral/mixed

**Form 4 Template**:
- `filerName` - Insider name
- `transactions[]` - Array of {type, shares, price, date}
- `totalValue` - Sum of transaction values
- `signalStrength` - Signal assessment

### 3. Data Extractors

Data extractors parse `summaryText` to generate structured data when `summaryData` is sparse.

#### Available Extractors

| File | Purpose | Key Functions |
|------|---------|---------------|
| [8k-data-extractor.ts](lib/email/8k-data-extractor.ts) | Extract 8-K structured data | `extract8KData()` - extracts itemNumbers, eventType, keyHighlights, financialImpact, sentiment |
| [form4-data-extractor.ts](lib/email/form4-data-extractor.ts) | Extract Form 4 transaction data | `extractForm4Data()` - extracts transactions, filerName, totalValue |
| [form144-data-extractor.ts](lib/email/form144-data-extractor.ts) | Extract Form 144 sale notice data | `extractForm144Data()` - extracts shares, estimatedValue, remainingHoldings |

#### 8-K Data Extractor Details ([8k-data-extractor.ts:22-55](lib/email/8k-data-extractor.ts#L22-L55))

The extractor performs:
1. **Item Number Extraction**: Regex patterns for "Item X.XX" patterns
2. **Event Type Classification**: Keyword matching for earnings, M&A, executive changes, etc.
3. **Key Highlights Extraction**: Bullet points or sentences with dollar amounts/percentages
4. **Financial Impact Extraction**: Dollar amounts with context
5. **Sentiment Determination**: Positive/negative/neutral based on keyword counts
6. **Materiality Assessment**: Based on item numbers and keywords

### 4. Coverage Analysis vs Reddit Post Filing Types

| Filing Type | Reddit Description | AI Prompt | Email Template | Data Extractor |
|-------------|-------------------|-----------|----------------|----------------|
| **8-K** | Newsworthy events (M&A, bankruptcy, management changes) | Yes (rich) | Yes (minimalist) | Yes |
| **10-K** | Comprehensive annual report with audited financials | Yes (rich) | Yes (minimalist) | No |
| **10-Q** | Quarterly unaudited financial statements | Yes (rich) | Yes (minimalist) | No |
| **Form 4** | Insider ownership changes (directors, officers, 10% owners) | Yes (rich) | Yes (minimalist) | Yes |
| **Form 144** | Notice of proposed sale of restricted stock | Yes (rich) | Yes (minimalist) | Yes |
| **Schedule 13D** | Beneficial ownership >5% (activist intent) | Yes (basic) | Yes | No |
| **Schedule 13G** | Beneficial ownership >5% (passive) | Yes (basic) | No dedicated | No |
| **Form S-1** | IPO registration statement | No dedicated | Yes (full) | No |
| **Form S-3** | Secondary offering registration | No dedicated | Yes (full) | No |
| **DEF 14A** | Proxy statement | Yes (template) | Yes | No |

### 5. Template Rendering Flow

The data flow from AI to email:

```
SEC Filing Content
       │
       ▼
┌─────────────────────────┐
│ AI Prompt System        │
│ (unified-prompts.ts)    │
│ - JSON schema enforced  │
│ - Journalist tone       │
│ - Model via .env config │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Summary Object          │
│ - summaryText (string)  │
│ - summaryData (JSON)    │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Template Registry       │
│ (template-registry.ts)  │
│ - O(1) lookup by type   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Data Extractor (opt.)   │
│ - Only for 8-K, 4, 144  │
│ - Enriches sparse data  │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│ Email Template          │
│ - Renders summaryData   │
│ - Falls back to text    │
└─────────────────────────┘
```

### 6. Key Implementation Details

#### 8-K Template Signal System ([8k-minimalist-template.tsx:17-105](components/ui/email/templates/8k-minimalist-template.tsx#L17-L105))

The 8-K template implements a 2-level materiality signal:

1. **MATERIAL EVENT** (amber styling): Significant corporate news
   - Based on MATERIAL_ITEMS set (1.01-8.01 items)
   - Or keywords: acquisition, merger, earnings, CEO, etc.

2. **ROUTINE DISCLOSURE** (gray styling): Administrative filings
   - Default when no material items/keywords detected

#### 10-K Template Structure ([10k-minimalist-template.tsx:24-242](components/ui/email/templates/10k-minimalist-template.tsx#L24-L242))

Layout sections:
1. Header (ticker, company, fiscal year)
2. Financial Highlights (if `financialHighlights[]` present)
3. Key Takeaways (if `keyPoints[]` present)
4. Segment Performance (if `segments[]` present)
5. Key Risks (if `riskFactors[]` present)
6. Summary Text (always shown as fallback)

The template falls back to `summaryText` if structured data is unavailable.

#### Form 4 Extraction Guidance ([unified-prompts.ts:487-493](lib/ai/prompts/unified-prompts.ts#L487-L493))

Form-specific extraction rules guide the AI:
```
FORM 4 EXTRACTION RULES:
- Look for "Table I - Non-Derivative Securities" and "Table II - Derivative Securities"
- Column 4 has the transaction price - if blank or $0, note this is likely a gift or grant
- Transaction code in column 3: P=Purchase, S=Sale, A=Award, G=Gift, M=Exercise
- Calculate total value = shares × price for each transaction
```

## Code References

### AI Prompts
- `lib/ai/prompts/unified-prompts.ts:95-419` - All form type JSON schemas
- `lib/ai/prompts/unified-prompts.ts:428-462` - System prompt enforcing JSON output
- `lib/ai/prompts/unified-prompts.ts:486-518` - Form-specific extraction guidance
- `lib/ai/prompts/form-8k.ts:10-92` - 8-K breaking news style prompt
- `lib/ai/prompts/form-10k.ts:10-93` - 10-K financial journalist prompt
- `lib/ai/prompts/form-4.ts:10-84` - Form 4 Matt Levine style prompt

### Email Templates
- `lib/email/template-registry.ts:62-108` - Template type mappings
- `components/ui/email/templates/8k-minimalist-template.tsx:17-105` - Material event detection
- `components/ui/email/templates/10k-minimalist-template.tsx:42-55` - Expected summaryData fields
- `components/ui/email/templates/form4-minimalist-template.tsx` - Insider trading template

### Data Extractors
- `lib/email/8k-data-extractor.ts:22-55` - 8-K extraction function
- `lib/email/8k-data-extractor.ts:61-87` - Item number regex patterns
- `lib/email/8k-data-extractor.ts:93-166` - Event type classification
- `lib/email/form4-data-extractor.ts` - Form 4 transaction extraction
- `lib/email/form144-data-extractor.ts` - Form 144 sale extraction

## Architecture Documentation

### Design Principles

1. **Schema-First Prompts**: JSON schema is presented BEFORE content to AI, ensuring structure compliance
2. **Explicit Field Names**: No synonyms allowed (use "company" not "companyName" or "issuerName")
3. **Length Constraints**: All text fields have maxLength to ensure predictable output
4. **No Markdown in JSON**: System prompt explicitly forbids markdown code blocks or formatting
5. **Fallback Hierarchy**: Templates fall back gracefully: summaryData → extractor → summaryText

### Token Management

Context manager (`context-manager.ts`) defines token budgets per filing type:
- **10-K**: 12,000 input / 4,000 output tokens (dense financial data)
- **10-Q**: 8,000 input / 3,000 output tokens
- **8-K**: 4,000 input / 2,000 output tokens (event-focused)
- **Form 4**: 2,000 input / 1,000 output tokens (simple transaction data)

## Historical Context (from thoughts/)

- `thoughts/shared/research/2026-01-06-summary-generation-system.md` - Recent documentation of summary generation accuracy improvements
- `thoughts/shared/research/2025-12-24-email-summary-discrepancies.md` - Investigation into email vs database summary mismatches

## Related Research

- [2026-01-06-summary-generation-system.md](2026-01-06-summary-generation-system.md) - Summary generation accuracy documentation
- [2025-12-04-email-template-design-validation.md](2025-12-04-email-template-design-validation.md) - Email template validation

## Open Questions

1. **10-K/10-Q Data Extractors**: No data extractors exist for 10-K or 10-Q. If AI-generated summaryData is sparse, templates fall back to raw summaryText without structured financial highlights, segments, or risk factors.

2. **Schema Field Alignment**: The unified prompt schema fields don't always match template expected fields:
   - Prompt schema uses `keyHighlights` but 10-K template expects `financialHighlights` and `keyPoints`
   - This mismatch could cause sparse template rendering

3. **Reddit Filing Types Not Covered**:
   - **Form S-1/S-3**: Have templates but no dedicated AI prompt schemas
   - **Form 11-K**: Has template but no prompt schema (employee stock plan reports)
   - **DEF 14A**: Uses generic template approach, no dedicated prompt schema

4. **Extractor Coverage**: Only 3 of 9 prompt-supported filing types have data extractors (8-K, Form 4, Form 144). The other 6 types depend entirely on AI-generated summaryData quality.
