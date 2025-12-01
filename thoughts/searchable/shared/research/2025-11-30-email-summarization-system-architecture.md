---
date: 2025-11-30T12:20:30+11:00
researcher: Claude
git_commit: df6aaa3fe8851742107b514a712d06c1fc61669f
branch: main
repository: tldrsec-ai
topic: "Email Summarization System Architecture for SEC Filings"
tags: [research, codebase, email, summarization, ai-prompts, templates, sec-filings]
status: complete
last_updated: 2025-11-30
last_updated_by: Claude
---

# Research: Email Summarization System Architecture for SEC Filings

**Date**: 2025-11-30T12:20:30+11:00
**Researcher**: Claude
**Git Commit**: df6aaa3fe8851742107b514a712d06c1fc61669f
**Branch**: main
**Repository**: tldrsec-ai

## Research Question

Document the current email summarization system architecture, including:
- How summaries are generated via AI
- How form-specific data is extracted and formatted
- How emails are generated and sent to users
- The data flow from SEC filing content to delivered email

This research aims to understand the existing system for improving design, accuracy, and engagement of summarization emails.

## Summary

The tldrsec-ai system implements a multi-stage pipeline for SEC filing summarization and email delivery:

1. **AI Summarization Layer** (`lib/ai/`) - Form-specific prompts guide Claude/xAI to extract structured JSON data from SEC filings, with schemas defining expected fields per form type (10-K, 10-Q, 8-K, Form 4, etc.)

2. **Database Storage Layer** - Summaries stored in `Summary` table with `summaryText` (narrative) and `summaryJSON` (structured data) fields, though the current pipeline primarily populates only `summaryText`

3. **Email Generation Layer** (`services/filings/email/`, `lib/email/`) - Dual-template system with React Email components and plain HTML templates, transforming summary data into formatted emails

4. **Email Delivery Layer** (`lib/email/resend-client.ts`) - Rate-limited delivery via Resend API with async queue support

The system supports 15+ SEC form types with dedicated prompts, parsers, and email templates for each major form type.

## Detailed Findings

### 1. AI Summarization Pipeline

#### 1.1 Prompt Template Architecture

**Location**: [lib/ai/prompts/](lib/ai/prompts/)

The system uses a class-based prompt architecture where each form type has a dedicated prompt class extending `PromptTemplate`:

| Form Type | Prompt Class | File |
|-----------|--------------|------|
| 10-K | `Form10KPrompt` | [lib/ai/prompts/form-10k.ts](lib/ai/prompts/form-10k.ts) |
| 10-Q | `Form10QPrompt` | [lib/ai/prompts/form-10q.ts](lib/ai/prompts/form-10q.ts) |
| Form 4 | `FormForm4Prompt` | [lib/ai/prompts/form-4.ts](lib/ai/prompts/form-4.ts) |
| 8-K | (empty file) | [lib/ai/prompts/form-8k.ts](lib/ai/prompts/form-8k.ts) |
| Generic | `GenericFilingPrompt` | [lib/ai/prompts/generic.ts](lib/ai/prompts/generic.ts) |

**Base PromptTemplate Class** ([lib/ai/prompts/prompt-template.ts](lib/ai/prompts/prompt-template.ts)):
- `systemPrompt`: AI role and guidance instructions
- `userPrompt`: Specific data extraction instructions
- `outputFormat`: JSON schema specification
- `getFullPrompt(content, maxInputTokens)`: Assembles complete prompt with token budget management

#### 1.2 Form-Specific JSON Schemas

**Form 4 (Insider Trading)** - [lib/ai/prompts/form-4.ts:50-76](lib/ai/prompts/form-4.ts#L50-L76):
```json
{
  "company": "Company Name (REQUIRED)",
  "filingDate": "YYYY-MM-DD",
  "filerName": "Name of the insider",
  "relationship": "Position or relationship",
  "ownershipType": "Direct or Indirect",
  "transactions": [{
    "type": "Purchase/Sale/Option Exercise",
    "date": "YYYY-MM-DD",
    "shares": "Number of shares",
    "pricePerShare": "$XX.XX",
    "totalValue": "$XX,XXX"
  }],
  "totalValue": "Total value",
  "percentageChange": "Percentage change",
  "summary": "Concise summary (REQUIRED)",
  "signalStrength": "Assessment"
}
```

**Form 10-K (Annual Report)** - [lib/ai/prompts/form-10k.ts:41-81](lib/ai/prompts/form-10k.ts#L41-L81):
```json
{
  "company": "Company Name",
  "period": "Fiscal Year YYYY",
  "financials": [
    {"label": "Revenue", "value": "$X.XX billion", "growth": "+/-X.X%", "unit": "YoY"}
  ],
  "keyHighlights": ["Highlight 1", "Highlight 2"],
  "insights": ["Business insight 1"],
  "risks": ["Risk factor 1"],
  "riskFactors": [{"category": "Category", "description": "Description", "impact": "Impact"}],
  "segments": [{"name": "Segment 1", "revenue": "$X.XX billion", "growth": "+/-X.X%"}],
  "executiveSummary": "Single paragraph summary"
}
```

**Form 10-Q (Quarterly Report)** - [lib/ai/prompts/form-10q.ts:43-79](lib/ai/prompts/form-10q.ts#L43-L79):
- Similar to 10-K with additional `quarterlyTrends`, `guidanceChanges`, `outlook` fields
- `period` formatted as "Q# YYYY"

#### 1.3 Context Window Management

**Location**: [lib/ai/prompts/context-manager.ts](lib/ai/prompts/context-manager.ts)

Filing-specific chunking configurations:
| Filing Type | Max Chunk Size | Overlap | Strategy |
|-------------|---------------|---------|----------|
| 10-K | 12,000 tokens | 1,000 | Section-based |
| 10-Q | 8,000 tokens | 800 | Section-based |
| 8-K | 4,000 tokens | 400 | Adaptive |
| DEF 14A | 8,000 tokens | 800 | Section-based |
| Generic | 6,000 tokens | 600 | Fixed |

Three chunking strategies implemented:
1. **Fixed** (line 131-141): Simple size-based with overlap
2. **Section-based** (line 142-163): Splits on markdown headings
3. **Adaptive** (line 164-190): Splits on paragraph boundaries

#### 1.4 Schema Validation

**Location**: [lib/ai/parsers/schema-validators.ts](lib/ai/parsers/schema-validators.ts)

Zod schemas validate AI responses:
- `schema10K` (line 31-41): Annual report schema
- `schema10Q` (line 46-57): Quarterly report schema
- `schema8K` (line 62-72): Current report schema
- `schemaForm4` (line 77-99): Insider trading schema
- `schemaGeneric` (line 188-195): Fallback schema

Validation supports both strict mode (full schema) and non-strict mode (partial validation with minimum requirements).

### 2. Email Template System

#### 2.1 Dual Template Architecture

The system uses two template layers:

**Layer 1: React Email Components** ([components/ui/email/templates/](components/ui/email/templates/)):
- 15 form-specific templates (10k, 10q, 8k, form3, form4, form5, form144, def14a, 11k, 13d, 13g, s1, s3)
- Base template: [email-template.tsx](components/ui/email/templates/email-template.tsx)
- HTML wrapper: [email-template-html.tsx](components/ui/email/templates/email-template-html.tsx)

**Layer 2: Plain HTML Templates** ([lib/email/templates.ts](lib/email/templates.ts)):
- `baseTemplate()` - HTML wrapper with styling (line 86-262)
- `welcomeEmailTemplate()` - New user emails
- `digestEmailTemplate()` - Daily/weekly summaries
- `filingNotificationTemplate()` - Filing alerts

#### 2.2 Email Generator Implementation

**Location**: [services/filings/email/emailGenerator.ts](services/filings/email/emailGenerator.ts)

**HTML Generation** (line 21-99):
```typescript
export function generateHtmlEmail(
  summaries: FilingSummaryResult[],
  errors: {ticker: string, error: string}[] = []
): string {
  // 1. Creates DOCTYPE and HTML structure with inline CSS
  // 2. For each summary:
  //    - Normalizes filing type (replaces / with -)
  //    - Looks up form metadata from form-registry
  //    - Generates filing card with:
  //      - Company name, ticker, form type
  //      - Filing date
  //      - summaryText (narrative)
  //      - keyPoints array as bullet list
  //      - SEC website link
  // 3. Adds error section if any failures
  // 4. Adds footer with branding and unsubscribe
}
```

**Plain Text Generation** (line 104-143):
- Same data transformation as HTML
- Uses newlines and dashes for structure
- Each filing separated by 43 dashes

**Email Sending** (line 186-250):
```typescript
export async function sendSummaryEmail(
  email: string,
  summaries: FilingSummaryResult[],
  errors: {ticker: string, error: string}[] = [],
  debug: boolean = false
): Promise<any> {
  // 1. Generate HTML and text versions
  // 2. Send via emailClient.sendEmail()
  // 3. Record metrics to monitoring
  // 4. Mark summaries as sent in database
}
```

#### 2.3 Form Metadata Integration

**Location**: [lib/sec-edgar/form-registry.ts](lib/sec-edgar/form-registry.ts)

The `FORM_REGISTRY` (line 19-498) maps filing types to metadata:
```typescript
{
  '10-K': {
    id: '10-K',
    displayName: 'Annual Report (10-K)',
    description: 'Comprehensive report...',
    category: 'annual',
    importance: 'high',
    parsingStrategy: 'detailed',
    summaryPromptType: 'financial'
  }
  // 60+ other form types
}
```

`getFormMetadata()` (line 505-508) retrieves display names for email templates.

### 3. Data Flow Architecture

#### 3.1 Summary Generation to Database

**Flow**: AI Response → `SummaryGenerationResult` → Prisma `Summary` model

**Key Transformation** ([lib/cron/handlers/summarize-cached-handler.ts:255-284](lib/cron/handlers/summarize-cached-handler.ts#L255-L284)):
```typescript
const summary = await prisma.summary.create({
  data: {
    tickerId: userTicker.id,
    filingType: filing.formType,
    filingDate: new Date(filing.filingDate),
    filingUrl: filing.filingUrl,
    summaryText: summaryResult.summary,  // AI narrative text
    modelVersion: summaryResult.model,
    totalCost: summaryResult.cost || 0,
    inputTokens: summaryResult.inputTokens || 0,
    outputTokens: summaryResult.outputTokens || 0,
    metadata: { /* execution context */ }
    // NOTE: summaryJSON field NOT populated in current pipeline
  }
});
```

**Database Schema** ([prisma/schema.prisma:57-106](prisma/schema.prisma#L57-L106)):
```prisma
model Summary {
  id            String   @id @default(uuid())
  tickerId      String
  filingType    String
  filingDate    DateTime
  filingUrl     String
  summaryText   String   // Plain text narrative
  summaryJSON   Json?    // Structured data (currently NOT populated)
  sentToUser    Boolean  @default(false)
  // ... additional fields
}
```

#### 3.2 Database to Email Template

**Flow**: `Summary` record → `FilingTemplateData` → HTML/Text email

**Transformation** ([lib/email/summary-service.ts:140-150](lib/email/summary-service.ts#L140-L150)):
```typescript
tickerMap.get(ticker.symbol).filings.push({
  symbol: ticker.symbol,
  companyName: ticker.companyName,
  filingType: summary.filingType,
  filingDate: summary.filingDate,
  filingUrl: summary.filingUrl,
  summaryId: summary.id,
  summaryUrl: `${APP_URL}/summary/${summary.id}`,
  summaryText: summary.summaryText,
  summaryData: summary.summaryJSON  // From database JSON field
});
```

**Template Data Interface** ([lib/email/templates.ts:70-80](lib/email/templates.ts#L70-L80)):
```typescript
export interface FilingTemplateData {
  symbol: string;
  companyName: string;
  filingType: string;
  filingDate: Date;
  filingUrl: string;
  summaryUrl: string;
  summaryId: string;
  summaryText?: string;      // Narrative text
  summaryData?: Record<string, unknown>;  // Structured JSON
}
```

#### 3.3 Template Rendering with Form-Specific Data

**Location**: [lib/email/templates.ts:282-343](lib/email/templates.ts#L282-L343)

The template checks for `summaryData` first (structured JSON), then falls back to `summaryText`:
```typescript
if (filing.summaryData) {
  const json = filing.summaryData;

  if (filing.filingType === '10-K' || filing.filingType === '10-Q') {
    // Render period, financials[], insights[]
  }
  else if (filing.filingType === '8-K') {
    // Render eventType, summary
  }
  else if (filing.filingType === 'Form4') {
    // Render filerName, relationship, summary
  }
} else if (filing.summaryText) {
  // Fallback to plain text summary (truncated to 150 chars)
}
```

### 4. Email Delivery Infrastructure

#### 4.1 Resend Client

**Location**: [lib/email/resend-client.ts](lib/email/resend-client.ts)

Key features:
- **Rate Limiting**: Bottleneck library with 5 concurrent requests, 10/second
- **Retry Logic**: 3 attempts with exponential backoff
- **Validation**: Email format, domain, injection detection

#### 4.2 Async Email Queue

**Location**: [lib/email/async-email-queue.ts](lib/email/async-email-queue.ts)

Features:
- Rate limiting compliance (100 emails/hour free tier)
- Priority queue support
- Dead letter queue for failed emails
- GDPR-compliant logging

### 5. Current State Analysis

#### 5.1 What Works Well

1. **Form-Specific Prompts**: Detailed JSON schemas for each form type guide AI extraction
2. **Dual Template System**: React Email for rich layouts, plain HTML for simple emails
3. **Form Registry**: Centralized metadata for 60+ SEC form types
4. **Rate Limiting**: Proper API compliance via Bottleneck
5. **Error Handling**: Fallback summaries, monitoring integration

#### 5.2 Key Gaps Identified

1. **summaryJSON Not Populated**: The AI generates structured JSON per the prompts, but the current pipeline only stores `summaryText` (narrative) in the database. The `summaryJSON` field is defined but not populated.

2. **Template Fallback Pattern**: Email templates check for `summaryData` (from `summaryJSON`) but always fall back to `summaryText` because the structured data is never stored.

3. **Legacy Generator vs Modern Templates**:
   - [services/filings/email/emailGenerator.ts](services/filings/email/emailGenerator.ts) uses simple HTML generation
   - [components/ui/email/templates/](components/ui/email/templates/) has 15 sophisticated React templates
   - Connection between these systems is unclear

4. **Inconsistent Template Usage**: The `getEmailTemplate()` router in [lib/email/templates.ts](lib/email/templates.ts) doesn't use the React Email form-specific templates (form4-template.tsx, 10k-template.tsx, etc.)

## Code References

### AI Prompts
- [lib/ai/prompts/form-4.ts](lib/ai/prompts/form-4.ts) - Form 4 insider trading prompt
- [lib/ai/prompts/form-10k.ts](lib/ai/prompts/form-10k.ts) - 10-K annual report prompt
- [lib/ai/prompts/form-10q.ts](lib/ai/prompts/form-10q.ts) - 10-Q quarterly report prompt
- [lib/ai/prompts/prompt-template.ts](lib/ai/prompts/prompt-template.ts) - Base prompt class
- [lib/ai/prompts/context-manager.ts](lib/ai/prompts/context-manager.ts) - Chunking configuration

### Email Generation
- [services/filings/email/emailGenerator.ts](services/filings/email/emailGenerator.ts) - Main email generator
- [lib/email/templates.ts](lib/email/templates.ts) - Template routing and plain HTML
- [lib/email/summary-service.ts](lib/email/summary-service.ts) - Summary to email data transformation

### Email Templates (React)
- [components/ui/email/templates/form4-template.tsx](components/ui/email/templates/form4-template.tsx) - Form 4 template
- [components/ui/email/templates/10k-template.tsx](components/ui/email/templates/10k-template.tsx) - 10-K template
- [components/ui/email/templates/10q-template.tsx](components/ui/email/templates/10q-template.tsx) - 10-Q template
- [components/ui/email/templates/8k-template.tsx](components/ui/email/templates/8k-template.tsx) - 8-K template

### Database & Types
- [prisma/schema.prisma:57-106](prisma/schema.prisma#L57-L106) - Summary model definition
- [services/filing/types.ts:8-32](services/filing/types.ts#L8-L32) - FilingSummaryResult interface
- [lib/email/types.ts](lib/email/types.ts) - Email type definitions

### Validation
- [lib/ai/parsers/schema-validators.ts](lib/ai/parsers/schema-validators.ts) - AI response validation
- [lib/sec-edgar/form-registry.ts](lib/sec-edgar/form-registry.ts) - Form type metadata

### Pipeline Integration
- [lib/cron/handlers/summarize-cached-handler.ts](lib/cron/handlers/summarize-cached-handler.ts) - Main summarization handler
- [lib/email/resend-client.ts](lib/email/resend-client.ts) - Email delivery client

## Architecture Documentation

### Current Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SEC Filing Summarization Pipeline                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. DISCOVERY                                                               │
│     └── Cron job detects new SEC filings                                   │
│     └── Filing metadata extracted (ticker, form type, accession number)    │
│                                                                             │
│  2. CONTENT FETCH                                                           │
│     └── SEC content retrieved and parsed                                   │
│     └── Document chunked based on form type configuration                  │
│                                                                             │
│  3. AI SUMMARIZATION                                                        │
│     └── Form-specific prompt selected (lib/ai/prompts/form-*.ts)          │
│     └── Claude/xAI generates structured JSON response                      │
│     └── Response validated against Zod schema                              │
│                                                                             │
│  4. DATABASE STORAGE                                                        │
│     └── Summary.summaryText = AI narrative text                            │
│     └── Summary.summaryJSON = NOT POPULATED (gap identified)              │
│                                                                             │
│  5. EMAIL GENERATION                                                        │
│     └── Template selected by EmailType                                     │
│     └── FilingTemplateData constructed from Summary                        │
│     └── HTML/text versions rendered                                        │
│                                                                             │
│  6. EMAIL DELIVERY                                                          │
│     └── Queued via async-email-queue.ts                                   │
│     └── Sent via Resend API with rate limiting                            │
│     └── Summary.sentToUser = true                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Field Name Mappings

| Stage | Field Name | Description |
|-------|-----------|-------------|
| AI Response | `summary` | Narrative text |
| AI Response | `keyPoints`, `financials`, `transactions` | Structured data |
| Database | `summaryText` | Stores narrative text |
| Database | `summaryJSON` | Should store structured data (NOT USED) |
| Email Template | `summaryText` | From database |
| Email Template | `summaryData` | Would come from `summaryJSON` |

## Historical Context (from thoughts/)

### Related Research Documents

1. **[2025-11-29-email-system-comprehensive-research.md](thoughts/shared/research/2025-11-29-email-system-comprehensive-research.md)** - Comprehensive email system analysis identifying CAN-SPAM compliance issues, hardcoded template data, and missing post-send validation

2. **[2025-11-21-e2e-summarization-pipeline-deep-dive.md](thoughts/shared/research/2025-11-21-e2e-summarization-pipeline-deep-dive.md)** - Complete 6-step summarization pipeline documentation

3. **[2025-11-28-3phase-pipeline-testing-infrastructure.md](thoughts/shared/research/2025-11-28-3phase-pipeline-testing-infrastructure.md)** - Discovery → Fetch → Summarize pipeline testing

4. **[2025-11-27-vrt-form4-processing-failure-investigation.md](thoughts/shared/research/2025-11-27-vrt-form4-processing-failure-investigation.md)** - Form 4-specific processing investigation

### Known Issues from Prior Research

From [2025-11-29-email-system-comprehensive-research.md](thoughts/shared/research/2025-11-29-email-system-comprehensive-research.md):
- **CAN-SPAM Violation**: React Email templates lack unsubscribe links
- **Hardcoded Template Data**: SECFilingEmailTemplate.tsx contains Tesla CFO data as fallback
- **No Post-Send Validation**: No delivery verification exists

## Open Questions

1. **Why is `summaryJSON` not populated?** The AI generates structured data per the prompts, but only `summaryText` is stored. Is this intentional?

2. **How are React Email form templates used?** The 15 form-specific templates in `components/ui/email/templates/` don't appear to be called from the main pipeline.

3. **What is the relationship between `emailGenerator.ts` and React Email templates?** Two separate email generation systems exist with unclear integration.

4. **How should form-specific data appear in emails?** Current emails only show narrative text and bullet points. Should transactions, financials, holdings tables be rendered?

5. **What is the expected email format per form type?** The reference template in `email-template.tsx` shows a sophisticated Form 4 layout with transaction tables, but this isn't generated dynamically.
