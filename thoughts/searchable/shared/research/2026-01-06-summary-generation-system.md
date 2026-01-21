---
date: 2026-01-06T20:05:37+11:00
researcher: Claude
git_commit: 1859633e8d53c839e87020e34ee975e4487dafde
branch: review-generated-summaries
repository: review-generated-summaries
topic: "Summary Generation System: AI Models, Prompts, Schema, and Email Templates"
tags: [research, codebase, ai, summarization, database, email, sec-filings]
status: complete
last_updated: 2026-01-06
last_updated_by: Claude
last_updated_note: "Added production issues analysis: sentiment inconsistencies and Form 4 transfer categorization"
---

# Research: Summary Generation System: AI Models, Prompts, Schema, and Email Templates

**Date**: 2026-01-06T20:05:37+11:00  
**Researcher**: Claude  
**Git Commit**: 1859633e8d53c839e87020e34ee975e4487dafde  
**Branch**: review-generated-summaries  
**Repository**: review-generated-summaries

## Research Question
How are summaries generated in the codebase? What are the temperature settings of the model configurations, prompts for each form type and base form types, the summary table schema, and email templates for each form type?

## Summary
The summary generation system is a comprehensive 3-phase pipeline that transforms SEC filings into AI-generated summaries and delivers them via email. The system has migrated from Claude to xAI Grok models for cost optimization (95% reduction), uses form-specific prompts for 15+ SEC filing types, stores summaries in a rich PostgreSQL schema, and delivers them through React-based email templates with dual versions (full and minimalist) for major form types.

## Detailed Findings

### AI Model Configuration and Temperature Settings

**Current Primary Configuration** (`lib/ai/openrouter-client.ts:18-35`):
- **Model**: `x-ai/grok-4.1-fast` (via `DEFAULT_AI_MODEL` environment variable)
- **Temperature**: 0.2 (configurable via `OPENROUTER_TEMPERATURE`)
- **Max Output Tokens**: 8000 (configurable via `OPENROUTER_MAX_OUTPUT_TOKENS`)  
- **Context Window**: 2,000,000 tokens for Grok models
- **Fallback Model**: `x-ai/grok-4-fast`

⚠️ **DEPRECATED**: Enhanced Claude Client Configuration (`lib/ai/enhanced-claude-client.ts:604-611`):
- **Status**: Legacy code that should be cleaned up
- Contains hardcoded Claude model pricing that is no longer part of active configuration
- Remnant from pre-OpenRouter integration

### Form-Specific Prompts System

**Prompt Architecture** (`lib/ai/prompts/`):
⚠️ **MIXED ARCHITECTURE**: The system implements a dual-prompt architecture with legacy JavaScript and modern TypeScript systems that should be evaluated for consolidation:

**Modern Unified System** (`unified-prompts.ts`):
- Bulletproof JSON architecture with structured output
- Form-specific prompt templates with system and user prompts
- Context window management and chunking strategies

**Form-Specific Prompt Files**:
- `form-10k.ts` - 10-K Annual Reports (journalist tone)
- `form-10q.ts` - 10-Q Quarterly Reports
- `form-8k.ts` - 8-K Current Reports  
- `form-4.ts` - Form 4 Insider Trading reports
- `generic.ts` - Fallback for unsupported forms

**Prompt Template Categories** (`prompt-templates.ts`):
- **ANNUAL_REPORT**: 10-K, 20-F, 40-F
- **QUARTERLY_REPORT**: 10-Q, 6-K
- **CURRENT_REPORT**: 8-K
- **PROXY_STATEMENT**: DEF 14A
- **GENERIC_FILING**: Fallback template

**Supported SEC Form Types** (20+ forms):
- Primary: 10-K, 10-Q, 8-K, Form 4, DEF 14A
- Extended: 20-F, 40-F, 6-K, S-1, S-4, 424B series, 144, SC 13G, SC 13D, Schedule 13G
- Specialized: 25-NSE, N-CSR, N-Q, N-PORT, PX14A6G, CORRESP, UPLOAD

### Summary Generation Pipeline

**3-Phase Pipeline Architecture** (`lib/cron/filing-processor.ts`):
1. **Discovery Phase** (`lib/cron/handlers/discovery-handler.ts`): SEC filing discovery for tracked tickers
2. **Fetch Phase** (`lib/cron/handlers/fetch-handler.ts`): Content retrieval and parsing using form-specific parsers
3. **Summarization Phase** (`lib/cron/handlers/summarize-cached-handler.ts`): AI summarization with form-specific prompts

**Pipeline Orchestration**:
- **Entry Point**: Cloudflare Worker calls `/api/cron/tier-aware/route.ts` every 10 minutes
- **Main Orchestrator**: `lib/cron/filing-processor.ts`
- **Context Management**: `lib/cron/bounded-context-manager.ts` for processing boundaries
- **Email Delivery**: `services/filing/sendEmailSummary.ts` → `lib/email/async-email-queue.ts`

**Form-Specific Parsers** (`lib/parsers/filing-types/`):
- `10k.ts`, `10q.ts`, `8k.ts`, `form4.ts`, `form144.ts`
- Multi-format support: HTML, XBRL, PDF (`lib/parsers/xbrl-parser.ts`, `pdf-parser.ts`)

### Summary Table Schema

**Summary Model** (`prisma/schema.prisma:92+`):
```prisma
model Summary {
  id                  String    @id @default(uuid())
  tickerId            String    
  ticker              Ticker    @relation(fields: [tickerId], references: [id])
  
  // Filing Metadata
  filingType          String    
  filingDate          DateTime  
  filingUrl           String?   
  secFilingId         String?   
  secFiling           SecFiling? @relation(fields: [secFilingId], references: [id])
  
  // AI-Generated Content
  summaryText         String    @db.Text
  summaryJSON         Json?     
  
  // Processing Tracking
  processingStatus    String    @default("pending")
  processingError     String?   @db.Text
  sentToUser          Boolean   @default(false)
  
  // AI Metrics
  cost                Float?    
  tokensUsed          Int?      
  model               String?   
  
  // Caching Optimization
  isCacheHit          Boolean   @default(false)
  cacheUsageCount     Int?      @default(0)
  
  // Timestamps
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
}
```

**Related Models**:
- **SummaryCacheAccess** (`schema.prisma:585+`): Cache access pattern tracking
- **SummaryEmailDelivery** (`schema.prisma:599+`): Email delivery tracking with deduplication
- **FilingContentCache** (`schema.prisma:373+`): Content caching for filings
- **SecFiling** (`schema.prisma:149+`): SEC filing records with fetch attempts
- **Ticker** (`schema.prisma:77+`): Companies users track

### Email Templates for Form Types

**Form-Specific React Templates** (`components/ui/email/templates/`):
- **10-K Templates**: `10k-template.tsx`, `10k-minimalist-template.tsx`
- **10-Q Templates**: `10q-template.tsx`, `10q-minimalist-template.tsx`  
- **8-K Templates**: `8k-template.tsx`, `8k-minimalist-template.tsx`
- **Form 4 Templates**: `form4-template.tsx`, `form4-minimalist-template.tsx`
- **Form 144 Templates**: `form144-template.tsx`, `form144-minimalist-template.tsx`
- **Additional Forms**: form3, form5, 11k, 13d, 13g, def14a, s1, s3 templates
- **Fallback**: `generic-minimalist-template.tsx`

**Template Infrastructure**:
- **Base Components**: `email-template.tsx`, `email-template-html.tsx`
- **Design System**: `design-system.ts` with consistent styling constants
- **Modular Sections**: `EmailHeader.tsx`, `EmailFooter.tsx`, `SectionCard.tsx`, `CTAButton.tsx`, `BulletList.tsx`, `DataRow.tsx`

**Template Selection System** (`components/email/templates/template-registry.ts`):
- Centralized template registry with form type mapping
- Dual version support (full vs minimalist)
- Form-specific data extractors for structured content

**Email Generation Pipeline**:
- **Template Service**: `lib/email/templates.ts`
- **Content Generation**: `services/filings/email/emailGenerator.ts`
- **Async Queue**: `lib/email/async-email-queue.ts` with rate limiting
- **Security**: `lib/email/security-helpers.ts` for content validation

## Code References

### AI Configuration
- `lib/ai/openrouter-client.ts:18-35` - Primary xAI Grok model configuration
- ⚠️ `lib/ai/enhanced-claude-client.ts:604-611` - **DEPRECATED** Claude model pricing (needs cleanup)
- `lib/ai/config.ts` - Central AI configuration management

### Prompt System
- `lib/ai/prompts/filing-prompts.ts` - Main prompt orchestration
- `lib/ai/prompts/unified-prompts.ts` - Modern unified prompt system
- `lib/ai/prompts/form-10k.ts` - 10-K specific prompts with journalist tone

### Pipeline Orchestration
- `app/api/cron/tier-aware/route.ts` - Main cron entry point
- `lib/cron/filing-processor.ts` - Core pipeline orchestrator
- `lib/cron/handlers/summarize-cached-handler.ts` - Summarization phase handler

### Database Schema
- `prisma/schema.prisma:92+` - Summary model definition
- `lib/db/prisma.ts` - Prisma client configuration

### Email Templates
- `components/ui/email/templates/10k-template.tsx` - 10-K email template
- `components/email/templates/template-registry.ts` - Template selection system
- `lib/email/async-email-queue.ts` - Async email processing
- ⚠️ `lib/email/form4-data-extractor.ts` - Form 4 transaction processing (missing transfer detection)
- ⚠️ `components/ui/email/templates/form4-minimalist-template.tsx` - Form 4 email with color coding (missing transfer type)

## Architecture Documentation

### Processing Flow
1. **Cloudflare Worker** triggers `/api/cron/tier-aware` every 10 minutes
2. **Discovery Handler** finds new SEC filings for tracked tickers
3. **Fetch Handler** downloads and parses content using form-specific parsers
4. **Summarization Handler** generates AI summaries with form-specific prompts
5. **Email Generator** creates form-specific HTML emails
6. **Async Email Queue** delivers emails with rate limiting compliance

### Model Migration History
- **Legacy**: Direct Anthropic Claude API integration
- **Current**: OpenRouter with xAI Grok models for 95% cost reduction
- ⚠️ **DEPRECATED FALLBACK**: Claude support should be removed (no longer needed for high-importance filings)

### Template Architecture
- **Dual Versions**: Full detail and minimalist versions for major forms
- **Modular Components**: Reusable email sections for consistency
- **Form-Specific**: Tailored templates for each SEC filing type
- **Data Extraction**: Form-specific extractors for structured email content

## Historical Context (from thoughts/)
No relevant historical documentation found in thoughts/ directory for this specific research topic.

## Related Research
First comprehensive documentation of the summary generation system architecture.

## Implementation Cleanup Required

### Deprecated Code to Remove
1. **Claude Model Pricing Config** (`lib/ai/enhanced-claude-client.ts:604-611`)
   - Remove hardcoded Claude model pricing constants
   - No longer part of active configuration
   
2. **Claude Fallback Support**
   - Remove Claude fallback for high-importance filings
   - Consolidate to xAI Grok models only
   
3. **Prompt Architecture Consolidation** (`lib/ai/prompts/`)
   - Evaluate legacy JavaScript prompt system utility vs TypeScript system
   - Consider migrating all prompts to unified TypeScript architecture
   - Remove duplicate/unused prompt files

## Production Issues Identified (2026-01-06)

### Issue 1: Sentiment Component Inconsistencies
**Problem**: Recent summaries missing sentiment analysis inconsistently across form types
- **✅ 8-K filings** (TSLA 8-K): Include sentiment analysis with visual badges (`lib/email/templates.ts:341-390`)
- **❌ Form 144 filings** (COIN 144, NVDA 144): No sentiment by design - factual transaction data only
- **❌ Form 4 filings** (GOOGL Form 4): No sentiment by design - uses `signalStrength` instead

**Root Cause**: Form type-specific architecture, not a bug but design inconsistency
**Impact**: User confusion about when to expect sentiment analysis

### Issue 2: GOOGL Form 4 Transfer Misclassification
**Problem**: Trust transfers incorrectly categorized as "purchases" with wrong color coding
**Example**: John Kent Walker CLO transfer from direct holdings to trust shows as notable buy

**Root Cause Analysis**:
- **Missing Transfer Detection** (`lib/email/form4-data-extractor.ts:276-297`):
  - Current patterns: "sold", "purchased", "gift"
  - Missing: "transfer", "direct to trust", ownership type changes
- **Incomplete Transaction Types** (`form4-minimalist-template.tsx`):
  - Current: 🟢 Purchase, 🔴 Sale, 🟣 Gift
  - Missing: 🔵 Trust Transfer
- **AI Prompt Gap** (`lib/ai/prompts/form-4.ts:58-67`):
  - Current: "Sale|Purchase|Option Exercise"
  - Missing: Transfer types and ownership context

### Issue 3: Email Subject Line Pattern Mismatch
**Observed**: "SEC Filing Summaries - 1/5/2026" (batch format)
**Expected**: "New {filingType} Filing: {companyName} ({ticker})" (`lib/email/summary-service.ts:254`)
**Implication**: Suggests batch email delivery vs individual filing notifications

### Issue 4: Form 4 Transaction Type Color Coding Gap
**Current Color System** (`form4-minimalist-template.tsx`):
- 🟢 Purchase: Green (`#10B981`)
- 🔴 Sale: Red (`#EF4444`) 
- 🟣 Gift: Purple (`#7C3AED`)

**Missing Transaction Type**:
- 🔵 **Trust Transfer**: Should be distinct color (e.g., Blue `#3B82F6`)
- **Transfer Pattern**: Direct ↔ Trust ownership changes
- **A/D Code Issue**: Transfers may use 'A' (acquisition) code but are not purchases

## Recommended Fixes

### Fix 1: Add Trust Transfer Detection
**File**: `lib/email/form4-data-extractor.ts`
```typescript
// Add transfer patterns around line 290
const transferPatterns = [
  /transfer(?:red)?\s+(?:from|to)\s+(?:direct|indirect|trust)/gi,
  /(?:direct|indirect)\s+(?:to|from)\s+(?:direct|indirect|trust)/gi,
  /moved?\s+(?:from|to)\s+(?:direct|indirect|trust)/gi,
];
```

### Fix 2: Add Transfer Transaction Type
**File**: `components/ui/email/templates/form4-minimalist-template.tsx`
```typescript
function getTransactionTypeConfig(type: string) {
  if (type.toLowerCase().includes('transfer')) {
    return { color: '#3B82F6', icon: '🔄', label: 'Transfer' };
  }
  // existing logic...
}
```

### Fix 3: Update Form 4 AI Prompt
**File**: `lib/ai/prompts/form-4.ts`
```json
{
  "type": "Sale|Purchase|Transfer|Option Exercise",
  "transferType": "Direct to Trust|Trust to Direct|Internal|None",
  "ownershipChange": "Direct|Indirect|Mixed"
}
```

### Fix 4: Form Type Sentiment Standardization
**Options**:
1. **Add sentiment to all forms** (consistent but may dilute meaning)
2. **Document form-specific analysis types** (maintain current design)
3. **Rename to "Analysis"** with form-specific subtypes (sentiment, signal strength, etc.)

## Open Questions
- Performance metrics comparison between Claude and Grok models
- Email template engagement analytics by form type  
- Cache hit rate optimization strategies for summary generation
- Effectiveness of dual prompt architecture (JS vs TS) - which system is actually used?
- Should trust transfers be treated as neutral transactions or separate category entirely?