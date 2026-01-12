---
date: 2026-01-10T14:12:40+11:00
researcher: Claude
git_commit: b99f9f46422e2d140c08368483c129c95e58a246
branch: review-generated-summaries
repository: review-generated-summaries
topic: "SEC Filing Summary Quality - User Feedback Analysis"
tags: [research, codebase, form4, form144, 8k, templates, extractors, xai, grok, per-ticker-agent, supabase, pgvector]
status: complete
last_updated: 2026-01-12
last_updated_by: Claude
last_updated_note: "Updated to reflect Phase 1 implementation completed 2026-01-12: 8-K sentiment now displayed, Form 4 stake arrows added, Form 144 remaining holdings display, design system sentiment utilities."
---

# Research: SEC Filing Summary Quality - User Feedback Analysis

**Date**: 2026-01-10 14:12:40 AEDT
**Researcher**: Claude
**Git Commit**: b99f9f46422e2d140c08368483c129c95e58a246
**Branch**: review-generated-summaries
**Repository**: review-generated-summaries

## Research Question

Analysis of 8 user feedback items regarding SEC filing summary quality:
1. Form 4 showing zero shares with $15.2M value
2. 8-K/A emails should present sentiment/materiality analysis
3. 10b5-1 pre-scheduled trade prompting improvements
4. Post-transaction beneficial ownership position extraction
5. Form 3, Form 144, 8-K template formatting improvements
6. xAI/Grok web search integration for enriched summaries
7. Form 144 sentiment analysis display
8. Per-ticker expert agent architecture

## Summary

This research documents the current state of SEC filing summary generation to address 8 specific user feedback items. The codebase has comprehensive infrastructure for Form 4, Form 144, and 8-K filings with data extractors, AI prompts, and email templates. Key findings:

1. **Form 4 shares display**: Transaction shares ARE extracted (13+ regex patterns + AI schema) but display prioritizes value over shares. Zero shares with $15.2M suggests edge case in gift/transfer handling. ✅ **[UPDATED 2026-01-12]** Ownership stake changes now display with directional arrows (↑/↓/→) color-coded by direction.

2. **8-K/A sentiment**: ✅ **[RESOLVED 2026-01-12]** The `sentiment` field is now actively displayed in email templates. Variable renamed from `_sentiment` to `sentiment` at line 157, with inline badge display at lines 229-242. Uses WCAG AA-compliant colors from design system.

3. **10b5-1 handling**: Text-based detection exists using pattern matching ("10b5-1", "10b-5", "rule 10b"). No structured XML checkbox parsing. Signal strength downgraded to "Weak - 10b5-1 Plan" when detected.

4. **Beneficial ownership**: Form 144 has dedicated `remainingHoldings` field (REQUIRED in schema). ✅ **[UPDATED 2026-01-12]** Form 144 now displays remaining holdings with arrow notation (`→ X remaining`). Form 4 has enhanced stake change display showing `previousStake → newStake (percentChange)`.

5. **Template formatting**: All templates use "Summary" as main heading. Minimalist templates use signal-first design. Form 3 uses standard template only.

6. **xAI/Grok integration**: System has migrated to xAI Grok via OpenRouter. No web search integration exists. Models: grok-4.1-fast (primary), grok-4-fast (fallback).

7. **Form 144 sentiment**: Uses 2-level `signalStrength` (Notable Sale vs Routine) instead of 4-level sentiment like 8-K. Based on value thresholds and 10b5-1 detection.

8. **Per-ticker context**: No historical filing context exists. Each summary generated independently. Only current ticker/companyName passed to AI prompts.

## Detailed Findings

### 1. Form 4 Share Display Issue

#### File Locations
- Data extractor: [lib/email/form4-data-extractor.ts](lib/email/form4-data-extractor.ts)
- AI prompt schema: [lib/ai/prompts/unified-prompts.ts:301-346](lib/ai/prompts/unified-prompts.ts#L301-L346)
- Email template: [components/ui/email/templates/form4-minimalist-template.tsx](components/ui/email/templates/form4-minimalist-template.tsx)

#### How Shares Are Extracted

**AI Schema (`unified-prompts.ts:316-329`)**:
```typescript
transactions: {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      shares: { type: 'string', description: 'Number of shares with commas (from column 5)' },
      price: { type: 'string', description: 'Price per share with $ from column 4' },
      // ...
    }
  }
}
```

**Fallback Extraction (`form4-data-extractor.ts:290-446`)**:
- 13+ regex patterns for sales, purchases, gifts, trust transfers
- Example: `/(?:sold|sale of)\s+([\d,]+)\s*shares?\s*(?:at|@|for)\s*\$?([\d,.]+)/gi`

#### How Value is Calculated

**Template Aggregation (`form4-minimalist-template.tsx:161-231`)**:
```typescript
function aggregateTransactionsByType(transactions) {
  // Calculate value: prefer totalValue if meaningful, otherwise shares * price
  let value = 0;
  if (tx.totalValue) {
    const parsedTotalValue = parseNumericValue(tx.totalValue);
    if (parsedTotalValue > 0 || groupKey === 'gift' || groupKey === 'transfer') {
      value = parsedTotalValue;
    } else {
      value = shares * price; // Fallback calculation
    }
  }
}
```

#### Display Priority

**Primary Display (`form4-minimalist-template.tsx:653-654`)**:
- Shows `valueDisplay` in 22px bold: `"$2.0M"`

**Secondary Display (`form4-minimalist-template.tsx:657-663`)**:
- Shows shares below: `"6,000 shares @ $340.50"`

#### Zero Shares Issue Analysis

The specific filing URL shows $15.2M value but 0 shares. Possible causes in current architecture:
1. Gift/transfer transactions with `$0` price but recorded value
2. Stock options or derivative transactions without underlying share count
3. AI returned `totalValue` but sparse `shares` field
4. XML parsing extracted value but not shares from Form 4 table

---

### 2. 8-K/A Sentiment/Materiality Analysis

#### File Locations
- Data extractor: [lib/email/8k-data-extractor.ts](lib/email/8k-data-extractor.ts)
- AI prompt schema: [lib/ai/prompts/unified-prompts.ts:253-299](lib/ai/prompts/unified-prompts.ts#L253-L299)
- Email template: [components/ui/email/templates/8k-minimalist-template.tsx](components/ui/email/templates/8k-minimalist-template.tsx)

#### Current Sentiment Field Status

**AI Schema - REQUIRED (`unified-prompts.ts:264-268`)**:
```typescript
sentiment: {
  type: 'string',
  enum: ['positive', 'negative', 'neutral', 'mixed'],
  description: 'Overall market sentiment signal based on the news'
}
```

**Extractor - EXTRACTED (`8k-data-extractor.ts:239-265`)**:
```typescript
function determineSentiment(text: string): string {
  const positiveTerms = ['growth', 'increase', 'profit', 'beat', 'exceed', 'strong'];
  const negativeTerms = ['loss', 'decline', 'miss', 'below', 'weak', 'layoff'];
  // Returns: 'positive', 'negative', 'mixed', or 'neutral'
}
```

**Template - ✅ NOW DISPLAYED (`8k-minimalist-template.tsx:157, 229-242`) [UPDATED 2026-01-12]**:
```typescript
// Line 157 - Variable renamed from _sentiment to sentiment (active)
const sentiment = (data?.sentiment || extractedData?.sentiment || '') as string;

// Lines 229-242 - Inline sentiment badge display
{sentiment && (
  <span style={{
    backgroundColor: getSentimentColor(sentiment).bg,
    color: getSentimentColor(sentiment).text,
    // ... styling
  }}>
    {getSentimentEmoji(sentiment)} {sentiment}
  </span>
)}
```

#### What IS Displayed: Materiality

**2-Level Signal System (`8k-minimalist-template.tsx:80-105`)**:
- **MATERIAL EVENT**: Amber styling, "Worth Attention" verdict
- **ROUTINE DISCLOSURE**: Gray styling, "Administrative Filing" verdict

**Materiality Determination (`8k-minimalist-template.tsx:50-78`)**:
- 35+ material item numbers (1.01, 2.02, etc.)
- Keywords: 'acquisition', 'merger', 'earnings', 'ceo', 'dividend', etc.

#### 8-K/A Treatment

8-K/A filings are normalized to use identical 8-K processing:
```typescript
// filing-content-verifier.ts:337-338
} else if (normalizedForm === '8-K/A' || normalizedForm === '8-KA') {
  indicators = FORM_CONTENT_INDICATORS['8-K'];
}
```

---

### 3. 10b5-1 Pre-Scheduled Trade Handling

#### File Locations
- Form 4 detection: [lib/email/form4-data-extractor.ts:533-543](lib/email/form4-data-extractor.ts#L533-L543)
- Form 144 detection: [lib/email/form144-data-extractor.ts:292-309](lib/email/form144-data-extractor.ts#L292-L309)
- Form 4 template: [components/ui/email/templates/form4-minimalist-template.tsx:369-396](components/ui/email/templates/form4-minimalist-template.tsx#L369-L396)

#### Current Detection Method

**Form 4 Pattern Matching (`form4-data-extractor.ts:533-543`)**:
```typescript
const has10b51Mention = textLower.includes('10b5-1') ||
                        textLower.includes('10b-5') ||
                        textLower.includes('rule 10b');

const negated10b51 = textLower.includes('no 10b5-1') ||
                     textLower.includes('unchecked') ||
                     textLower.includes('not pursuant');

if (has10b51Mention && !negated10b51) {
  return 'Weak - 10b5-1 Plan';
}
```

**Form 144 Date Extraction (`form144-data-extractor.ts:292-309`)**:
```typescript
const datePattern = /10b5-1\s*(?:plan)?(?:\s+(?:adopted|established|entered))?(?:\s+(?:on|in))?\s*(\d{1,2}\/\d{1,2}\/\d{2,4}|\w+\s+\d{1,2},?\s*\d{4})/i;
// Returns: "10b5-1 plan (8/15/2025)" or generic "10b5-1 trading plan"
```

#### Display Impact

**Signal Downgrade**:
- Form 4: Returns `'Weak - 10b5-1 Plan'` signal
- Form 144: Returns `'Routine 10b5-1'` signal (unless value > $10M)

**Template Message (`form4-minimalist-template.tsx:394-396`)**:
```typescript
description: has10b51
  ? 'Pre-scheduled 10b5-1 trade — no discretionary decision by insider.'
  : 'Likely not material to your investment decision.'
```

#### What Does NOT Exist
- No XML checkbox parsing for 10b5-1 field
- No structured database boolean field
- No cross-reference with SEC filing metadata
- No link to SEC 10b5-1 rule documentation

---

### 4. Beneficial Ownership Position Extraction

#### File Locations
- Form 4 extraction: [lib/email/form4-data-extractor.ts:449-490](lib/email/form4-data-extractor.ts#L449-L490)
- Form 144 extraction: [lib/email/form144-data-extractor.ts:352-398](lib/email/form144-data-extractor.ts#L352-L398)
- Form 4 AI schema: [lib/ai/prompts/unified-prompts.ts:301-346](lib/ai/prompts/unified-prompts.ts#L301-L346)
- Form 144 AI schema: [lib/ai/prompts/unified-prompts.ts:348-414](lib/ai/prompts/unified-prompts.ts#L348-L414)

#### Form 144 - Comprehensive Support

**AI Schema - REQUIRED (`unified-prompts.ts:398-402`)**:
```typescript
remainingHoldings: {
  type: 'string',
  description: 'Amount of Securities Beneficially Owned Following Reported Transaction(s)',
  maxLength: 50
}
```

**Extraction Guidance (`unified-prompts.ts:953`)**:
```
REQUIRED: Extract 'Amount of Securities Beneficially Owned Following Reported Transaction(s)' as remainingHoldings
```

**Fallback Extraction - 13 Patterns (`form144-data-extractor.ts:356-383`)**:
- "Securities Beneficially Owned: X"
- "post-transaction ownership: X"
- "will still hold X shares"
- "X shares remaining"
- etc.

**Template Display (`form144-minimalist-template.tsx:396-440`)**:
- Dedicated "Shares Remaining After Sale" card
- Large display of share count
- Official SEC field name in subtitle

#### Form 4 - Minimal Support

**AI Schema**: NO dedicated `remainingHoldings` field exists.

**Fallback Extraction - 4 Patterns (`form4-data-extractor.ts:455-468`)**:
```typescript
const postPatterns = [
  /Post-Transaction Ownership[:\s]+([\d,]+)\s*shares?/i,
  /after.*?([\d,]+)\s*shares?/i,
  /now\s+(?:owns?|holds?)\s+([\d,]+)\s*shares?/i,
  /remaining\s+(?:stake|holdings?)[:\s]+([\d,]+)/i,
];
```

**Template Display (`form4-minimalist-template.tsx:711-715`)**:
- Inline stake change: `"previousStake → newStake"`
- No dedicated section

---

### 5. Template Formatting (Form 3, Form 144, 8-K)

#### File Locations
- Form 3: [components/ui/email/templates/form3-template.tsx](components/ui/email/templates/form3-template.tsx)
- Form 144 standard: [components/ui/email/templates/form144-template.tsx](components/ui/email/templates/form144-template.tsx)
- Form 144 minimalist: [components/ui/email/templates/form144-minimalist-template.tsx](components/ui/email/templates/form144-minimalist-template.tsx)
- 8-K standard: [components/ui/email/templates/8k-template.tsx](components/ui/email/templates/8k-template.tsx)
- 8-K minimalist: [components/ui/email/templates/8k-minimalist-template.tsx](components/ui/email/templates/8k-minimalist-template.tsx)

#### Current Heading Usage

| Template | Primary Heading |
|----------|-----------------|
| Form 3 Standard | "Summary" |
| Form 144 Standard | "Summary" |
| Form 144 Minimalist | No heading (signal-first) |
| 8-K Standard | "Summary" |
| 8-K Minimalist | "Key Highlights" or "Summary" |

#### Signal-First Design (Minimalist Templates)

Both Form 144 and 8-K minimalist templates use:
1. **Signal badge at top** - verdict visible without scrolling
2. **Large numerical values** (22-24px) in colored cards
3. **Conditional sections** - only shows data that exists
4. **Color-coded backgrounds** (amber for notable, gray for routine)

#### Skimmability Features

**Standard Templates**:
- Emoji section headers (📋, 📊, 👤, ℹ️)
- Two-column label/value layouts
- Data tables with clear headers
- Footnotes in smaller italic font

**Minimalist Templates**:
- Signal verdict dominates top
- Bulleted highlights with bold dollar amounts
- Grouped metadata below main values
- Minimal visual dividers

---

### 6. xAI/Grok Web Search Integration

#### File Locations
- OpenRouter client: [lib/ai/openrouter-client.ts](lib/ai/openrouter-client.ts)
- AI config: [lib/ai/config.ts](lib/ai/config.ts)
- Enhanced client: [lib/ai/enhanced-claude-client.ts](lib/ai/enhanced-claude-client.ts)

#### Current AI Architecture

**Provider**: OpenRouter (unified gateway to xAI)
- Base URL: `https://openrouter.ai/api/v1`
- Models: `x-ai/grok-4.1-fast` (primary), `x-ai/grok-4-fast` (fallback)
- Context window: 2M tokens

**Model Configuration (`config.ts:68-77`)**:
```typescript
export const modelConfig = {
  defaultModel: getEnv('DEFAULT_AI_MODEL', 'x-ai/grok-4.1-fast'),
  fallbackModel: getEnv('OPENROUTER_FALLBACK_MODEL', 'x-ai/grok-4-fast'),
  maxInputTokens: 1280000,
  maxOutputTokens: 8000,
};
```

#### Web Search: NOT IMPLEMENTED

No web search integration exists:
- No Tavily, Serper, or Google Search API clients
- No references to "search", "web", "x.com" in AI code
- No external data retrieval beyond SEC EDGAR API

**Environment Variables in `.env.example`** (not implemented):
```
PERPLEXITY_API_KEY=your_perplexity_api_key_here
OPENAI_API_KEY=your_openai_api_key_here
```

#### Client Abstraction: None

- Direct coupling to OpenRouter throughout codebase
- `openRouterClient` singleton exported and used directly
- No provider interface or adapter pattern
- Backward-compatible function `getClaudeModel()` → `getDefaultModel()`

---

### 7. Form 144 Sentiment Analysis

#### File Locations
- Data extractor: [lib/email/form144-data-extractor.ts:400-456](lib/email/form144-data-extractor.ts#L400-L456)
- AI schema: [lib/ai/prompts/unified-prompts.ts:403-407](lib/ai/prompts/unified-prompts.ts#L403-L407)
- Template: [components/ui/email/templates/form144-minimalist-template.tsx:52-86](components/ui/email/templates/form144-minimalist-template.tsx#L52-L86)

#### Current Approach: Signal Strength (NOT Sentiment)

**Form 144 uses 2-level `signalStrength`** instead of 4-level sentiment:

| Aspect | Form 144 | Form 8-K |
|--------|----------|----------|
| Field name | `signalStrength` | `sentiment` |
| Values | "Notable Sale", "Routine 10b5-1" | positive, negative, neutral, mixed |
| Decision basis | Value thresholds, 10b5-1 | Positive/negative keywords |

**Signal Determination (`form144-data-extractor.ts:437-455`)**:
```typescript
// Returns "Notable Sale" if:
// - Notable indicators found: "significant", "large", "substantial"
// - Value >= $10M

// Returns "Routine 10b5-1" if:
// - Routine indicators: "routine", "scheduled", "regular"
// - Has 10b5-1 mention AND value < $10M
```

**Rationale**: Form 144 = Notice of Proposed Sale (factual transaction intent). Signal focuses on "is this worth reviewing?" rather than "is this good/bad news?"

---

### 8. Per-Ticker Expert Agent Architecture

#### File Locations
- Ticker model: [prisma/schema.prisma:77-90](prisma/schema.prisma#L77-L90)
- CIK resolver: [lib/sec-edgar/cik-resolver.ts](lib/sec-edgar/cik-resolver.ts)
- Summarization: [lib/ai/summarize.ts](lib/ai/summarize.ts)
- Subscription info: [lib/subscription/tickerSubscriptionInfo.ts](lib/subscription/tickerSubscriptionInfo.ts)

#### Current Company Context

**What IS Passed to AI (`summarize.ts:429-433`)**:
```typescript
const { systemPrompt, userPrompt } = generateUnifiedPrompt({
  formType: filingType,
  company: context.companyName || 'Unknown Company',
  ticker: context.ticker || 'Unknown',
  filingDate: new Date().toISOString().split('T')[0],
  filingContent: content
});
```

**Only ticker symbol and company name** - no historical context.

#### Historical Filing Context: NOT IMPLEMENTED

**What Does NOT Exist**:
1. No retrieval of previous summaries for same ticker
2. No passing of historical filing data to AI prompts
3. No company-specific "memory" or context windows
4. No trend analysis comparing with previous financial periods
5. No cross-filing context between consecutive filings

**Each summary is generated independently**.

#### Cache Detection (NOT Context)

The system checks for existing summaries to **avoid regeneration** (cost optimization):
```typescript
// filing-processor.ts:971-1057
existingSummary = await tx.summary.findFirst({
  where: {
    ticker: { symbol: filingForProcessing.tickerData.symbol },
    filingType: filingForProcessing.formType,
    filingDate: filingForProcessing.filingDate,
  }
});

if (existingSummary) {
  // Use cached summary - NO CONTEXT PASSED TO NEW FILINGS
}
```

---

## Code References

### Form 4 Processing
- `lib/email/form4-data-extractor.ts:81-124` - Main extraction function
- `lib/email/form4-data-extractor.ts:180-446` - Markdown/prose parsing
- `lib/email/form4-data-extractor.ts:533-543` - 10b5-1 detection
- `lib/ai/prompts/unified-prompts.ts:301-346` - Form 4 JSON schema
- `components/ui/email/templates/form4-minimalist-template.tsx:161-231` - Transaction aggregation

### 8-K Processing
- `lib/email/8k-data-extractor.ts:22-55` - Main extraction function
- `lib/email/8k-data-extractor.ts:239-265` - Sentiment determination
- `lib/email/8k-data-extractor.ts:267-304` - Materiality determination
- `lib/ai/prompts/unified-prompts.ts:253-299` - 8-K JSON schema
- `components/ui/email/templates/8k-minimalist-template.tsx:80-105` - Signal configuration

### Form 144 Processing
- `lib/email/form144-data-extractor.ts:292-309` - Trading plan extraction
- `lib/email/form144-data-extractor.ts:352-398` - Remaining holdings extraction
- `lib/email/form144-data-extractor.ts:406-453` - Signal strength determination
- `lib/ai/prompts/unified-prompts.ts:348-414` - Form 144 JSON schema

### AI Integration
- `lib/ai/openrouter-client.ts:351-1019` - OpenRouter client
- `lib/ai/config.ts:68-77` - Model configuration
- `lib/ai/summarize.ts:422-454` - Context injection

### Templates
- `components/ui/email/templates/form3-template.tsx` - Form 3 standard
- `components/ui/email/templates/form144-minimalist-template.tsx` - Form 144 minimalist
- `components/ui/email/templates/8k-minimalist-template.tsx` - 8-K minimalist

---

## Architecture Documentation

### Data Extraction Pattern

All extractors follow a consistent pattern:
1. **AI-first**: Structured JSON from unified prompts
2. **Fallback extraction**: Regex parsing of `summaryText` when AI data sparse
3. **Merge logic**: AI data wins conflicts, extractors fill gaps
4. **Registry lookup**: `lib/email/extractor-registry.ts` maps form types to extractors

### Template Pattern

Two template variants per filing type:
1. **Standard**: Comprehensive data display, emoji headers, table layouts
2. **Minimalist**: Signal-first design, conditional sections, large metrics

### Signal Classification

2-level vs 4-level systems:
- **8-K**: 4-level sentiment (positive/negative/neutral/mixed) + 2-level materiality
- **Form 4**: 2-level signal strength (Strong/Weak with descriptors)
- **Form 144**: 2-level signal (Notable Sale/Routine 10b5-1)

### AI Provider Pattern

- Single provider: OpenRouter → xAI Grok
- No abstraction layer
- Circuit breaker for model fallback
- Rate limiting via Bottleneck

---

## Historical Context (from thoughts/)

No prior research documents found on these specific topics.

---

## Related Research

- [docs/plans/2026-01-07-summary-generation-quality-improvement.md](docs/plans/2026-01-07-summary-generation-quality-improvement.md) - Current quality improvement plan (Phases 1-5 complete)

---

## Open Questions

1. **Form 4 zero shares**: Need to investigate the specific filing XML structure for the URL mentioned (https://www.sec.gov/Archives/edgar/data/1045810/000152611126000002/xslF345X05/wk-form4_1767737078.xml) to understand why shares show 0 with $15.2M value.

2. **8-K sentiment display**: The `_sentiment` variable is extracted but not rendered. Was this intentional design or oversight?

3. **10b5-1 SEC rule link**: User requests linking to SEC 10b5-1 documentation. Where should this link appear (prompt guidance, template, or both)?

---

## Follow-up Research: Architecture Deep Dives

### Appendix A: xAI Grok Web Search Integration Architecture

#### Executive Summary

xAI Grok has **native web search capabilities** that are currently **FREE** via the Agent Tools API. The recommended approach is a hybrid multi-source strategy combining:
1. **Grok X Search** (free) - For X/Twitter discussions around filings
2. **Tavily API** ($0.01-0.02/query) - For financial news from Bloomberg, Reuters, WSJ

#### xAI Grok Web Search Capabilities

**Source**: [xAI Search Tools Documentation](https://docs.x.ai/docs/guides/tools/search-tools)

**Native Features**:
- **Web Search**: Built-in server-side web search tools
- **X Search**: Unique capability to search X/Twitter posts with temporal filtering
- **Domain Filtering**: Support for `allowed_domains` and `excluded_domains` (max 5 each)
- **Date Range Filtering**: ISO8601 `from_date` and `to_date` parameters
- **Citations**: Both inline markdown citations and comprehensive source URLs

**API Structure**:
```json
{
  "tools": [{
    "type": "web_search",
    "allowed_domains": ["sec.gov", "reuters.com"],
    "enable_image_understanding": true
  }]
}
```

#### Pricing Analysis

| Provider | Feature | Cost |
|----------|---------|------|
| xAI Agent Tools API | web_search, x_search | **FREE** (currently) |
| xAI Legacy Live Search | Per-source pricing | $0.025/source (deprecated Jan 12, 2026) |
| OpenRouter + xAI | Native xAI tools | Included with token costs |
| Tavily (finance topic) | News search | ~$0.01-0.02/query |
| Serper (Google Search) | SERP data | $0.001/query at scale |
| Perplexity API | Search + reasoning | $0.005/request |

#### Recommended Implementation

**Phase 1: Core Summary (Current)** - No changes needed

**Phase 2: News Enrichment (New)**
```typescript
// Using Tavily API for financial news
const tavilySearch = await tavily.search({
  query: `${companyName} ${ticker} SEC filing news`,
  topic: "finance",
  time_range: "week",
  include_domains: ["reuters.com", "bloomberg.com", "marketwatch.com"],
  max_results: 5,
  include_answer: true
});
```

**Phase 3: Social Discussion (Optional)**
```typescript
// Using xAI Grok X Search (FREE)
const xaiSearch = {
  tools: [{
    type: "x_search",
    from_date: filingDate,
    to_date: currentDate
  }],
  messages: [{
    role: "user",
    content: `Find discussions about ${ticker}'s recent ${formType} filing`
  }]
};
```

#### Cost Estimate (100 summaries/day)

| Component | Monthly Cost |
|-----------|--------------|
| Tavily Finance News (500/day) | ~$15-30/month |
| Grok X Search (200/day) | **FREE** |
| Base summarization | $72/month |
| **Total with enrichment** | **$87-102/month** |

> **Cost Calculation (xAI Grok 4.1-fast via OpenRouter):**
> - Input: $0.30/million tokens, Output: $0.50/million tokens
> - Average summary: 75K input tokens × $0.0000003 = $0.0225
> - Average output: 3K tokens × $0.0000005 = $0.0015
> - **Per-summary cost: ~$0.024** (100 summaries/day × 30 days = $72/month)

#### Key References
- [xAI Search Tools Documentation](https://docs.x.ai/docs/guides/tools/search-tools)
- [xAI Models and Pricing](https://docs.x.ai/docs/models)
- [OpenRouter xAI Provider](https://openrouter.ai/provider/xai)
- [Tavily Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search)

---

### Appendix B: Per-Ticker Expert Agent Architecture

#### Executive Summary

A per-ticker expert agent system would enable contextual summarization where each new filing is analyzed with awareness of the company's history, trends, and patterns. **Recommended approach**: pgvector (PostgreSQL extension) integrated with existing Supabase database.

**Key Metrics**:
- **Implementation Time**: 3-4 weeks for MVP
- **Cost Increase**: +27% per summary ($0.030 vs $0.024)
- **Expected Quality Improvement**: 20-30% better summaries through contextual awareness

#### Vector Database Comparison

| Database | Deployment | Cost (100K vectors) | Integration | Recommendation |
|----------|-----------|---------------------|-------------|----------------|
| **pgvector (Supabase)** | Integrated | ~$0.18/month | Low effort | **Recommended** |
| Pinecone | Managed SaaS | Free tier available | Medium | Enterprise scale |
| Qdrant | Self-hosted | ~$27/month | Medium | Cost-conscious |
| Weaviate | Self-hosted | ~$75/month | High | Multimodal search |

**Why pgvector?**
- Already using Supabase PostgreSQL - zero infrastructure overhead
- Store embeddings alongside existing `Summary` data
- ACID guarantees for consistency
- 30x faster HNSW index builds with recent optimizations
- Perfect for <10M vectors (current project scale)

#### Database Schema Extension

```prisma
model Summary {
  // Existing fields...

  // NEW: Vector embedding fields
  embedding             Unsupported("vector(1536)")?
  embeddingModel        String?  // "text-embedding-3-small"
  embeddingCreatedAt    DateTime?

  @@index([embedding(ops: VectorCosineOps)])  // HNSW index
}

model CompanyInsight {
  id              String   @id @default(uuid())
  tickerId        String
  insightType     String   // "risk_pattern", "metric_trend"
  title           String
  description     String
  confidence      Float    // 0.0-1.0
  observationCount Int

  @@unique([tickerId, insightType, title])
}
```

#### Context Retrieval Flow

```
1. New Filing Arrives (e.g., TSLA 10-Q Q3 2024)
   ↓
2. Generate embedding for new filing content
   ↓
3. Similarity search: top-5 relevant past summaries for TSLA
   ↓
4. Build enriched prompt (new filing + historical context)
   ↓
5. Generate context-aware summary via Grok API
   ↓
6. Store summary + embedding for future context
```

**Similarity Search Query**:
```sql
SELECT id, filingType, filingDate, summaryText,
       1 - (embedding <=> $queryEmbedding) as similarity
FROM "Summary"
WHERE tickerId = $tickerId
  AND filingDate < $currentFilingDate
ORDER BY embedding <=> $queryEmbedding
LIMIT 5;
```

#### Token Budget Allocation

| Component | Tokens | % of 200K limit |
|-----------|--------|-----------------|
| Filing Content | 80,000 | 40% |
| Historical Summaries (5 × 4K) | 20,000 | 10% |
| System Prompt | 3,000 | 1.5% |
| Safety Margin | 10,000 | 5% |
| **Total Input** | **113,000** | **56%** |

#### Cost Analysis

**Embedding Costs (text-embedding-3-small)**:
- Per summary: $0.00004 (~negligible)
- Monthly (100/day): $0.12

**Enhanced Summarization**:
- Without context: $0.024/summary
- With context (5 past summaries): $0.030/summary (+27%)
- With prompt caching: $0.019/summary (cached contexts)

**Monthly Totals (100 summaries/day)**:
| Component | Cost |
|-----------|------|
| Embeddings | $0.12 |
| Storage (100K vectors) | $0.18 |
| Base summarization | $72 |
| Historical context | +$18 |
| **Total** | **$90/month** |

> **Note on Cost Correction**: Previous estimates used outdated Claude API pricing (~$0.36/summary). Actual xAI Grok 4.1-fast pricing via OpenRouter is ~15x cheaper at $0.024/summary. Source: `lib/ai/config.ts` and `lib/ai/token-counter.ts`.

#### Implementation Approaches

**1. Simple (Quick Win) - 1 Week**
- Retrieve last 3 summaries for ticker (chronological)
- Append as text context to prompt
- No embeddings required
- Validate if context improves quality

**2. Medium (Recommended) - 4 Weeks**
- Add pgvector extension to Supabase
- Generate embeddings with OpenAI API
- Semantic similarity search for relevant context
- Backfill existing summaries

**3. Advanced (Future) - 12 Weeks**
- Knowledge graph of company entities
- Multi-agent RAG with specialized agents
- Cross-filing relationship extraction

#### Implementation Roadmap

**Phase 1: MVP (Week 1)**
```typescript
// Simple: Last-N summaries
async function getLastNSummaries(tickerId: string, n = 3) {
  return await prisma.summary.findMany({
    where: { tickerId },
    orderBy: { filingDate: 'desc' },
    take: n,
  });
}
```

**Phase 2: Production (Weeks 2-5)**
1. Add pgvector extension
2. Implement embedding pipeline
3. Create HNSW index
4. Modify summarization to use vector context

**Success Criteria**:
- <100ms added latency
- <$300/month additional costs
- 20-30% quality improvement

#### Key References
- [Supabase pgvector Documentation](https://supabase.com/docs/guides/database/extensions/pgvector)
- [pgvector vs Pinecone Cost Comparison](https://supabase.com/blog/pgvector-vs-pinecone)
- [OpenAI Embeddings Pricing](https://platform.openai.com/docs/pricing)
- [RAG Best Practices](https://www.promptingguide.ai/research/rag)
- [Financial Time Series RAG](https://arxiv.org/html/2502.05878v1)

---

### Appendix C: Neon Database Cleanup Documentation

#### Summary

The codebase migrated from Neon to Supabase in December 2025. All Neon references are now legacy code. This appendix documents the cleanup performed on 2026-01-10.

#### Files Deleted

| File | Purpose | Reason for Deletion |
|------|---------|---------------------|
| `test-neon-connection.js` | Standalone Neon connection test | No longer needed - Supabase is the only database |

#### Legacy Files Retained (Migration Safety)

These files contain Neon references but serve a **migration safety purpose** - they detect if DATABASE_URL accidentally points to Neon and produce clear error messages:

| File | Lines | Purpose | Action |
|------|-------|---------|--------|
| `lib/config/database-validation.ts` | 20, 46-48 | Validates DATABASE_URL is NOT Neon | Keep for safety |
| `lib/config/startup-validation.ts` | 148-150 | CRITICAL error if Neon URL detected | Keep for safety |
| `lib/db/supabase-config.ts` | 34, 98-102, 256-306 | Detects Neon vs Supabase and warns | Keep for safety |

**Example validation from `startup-validation.ts:148-150`**:
```typescript
'CRITICAL: DATABASE_URL points to Neon database. The codebase requires Supabase with app/pipeline schemas.'
```

#### Environment Variables Cleanup

**Legacy variables in `.env` (lines 54-56, 80-82)**:
```env
# neon (legacy - kept for reference)
NEON_DATABASE_URL_LEGACY=postgresql://...@...neon.tech/tldrsec-prod
NEON_API=napi_...

# MCP Server Environment Variables
NEON_API_KEY=napi_...
NEON_DATABASE_URL=postgresql://...@...neon.tech/tldrsec-prod
# NOTE: NEON_DATABASE_URL is kept for MCP server reference only - not used by application
```

**Recommendation**: Remove these legacy variables after confirming:
1. No MCP servers depend on `NEON_API_KEY` or `NEON_DATABASE_URL`
2. Neon database has been fully decommissioned

#### Documentation Files (Historical Reference)

The following files in `docs/plans/actioned/2025/12. December/` document the migration:
- `2025-12-09-neon-to-supabase-migration-implementation.md`
- `2025-12-09-neon-to-supabase-migration-options-analysis.md`
- `2025-12-19-unified-supabase-consolidation.md`

These should be retained as historical documentation.

#### Test Files with Neon References

The file `__tests__/db/data-migration.test.ts` contains `EXPECTED_NEON_COUNTS` constants used to validate that the Supabase database matches expected record counts from the Neon migration. This file validates migration completeness and should be retained until the Neon database is fully decommissioned.

#### Current Database Architecture

**Active Database**: Supabase (aws-1-ap-southeast-2)
- Transaction Mode: `postgres://...@aws-1-ap-southeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true`
- Session Mode: Port 5432 for migrations and advisory locks
- Schemas: `app`, `pipeline` (multi-schema architecture)

**Database Stack**:
- Prisma ORM with singleton client (`lib/db/prisma.ts`)
- Supabase client for auth/realtime (`lib/supabase/client.ts`, `lib/supabase/server-client.ts`)
- pgvector extension available for vector embeddings
