# Email Summarization System Improvements Implementation Plan

**Date**: 2025-12-01 08:33:35 AEDT
**Git Commit**: df6aaa3fe8851742107b514a712d06c1fc61669f
**Branch**: feature/email-summarization-improvements
**Repository**: tldrsec-ai

## Overview

This plan implements three critical improvements to the email summarization system identified in the research document [thoughts/shared/research/2025-12-01-email-summarization-improvement-strategy.md](../../thoughts/shared/research/2025-12-01-email-summarization-improvement-strategy.md):

1. **Fix Data Loss**: Populate `summaryJSON` field with AI-generated structured data that is currently discarded
2. **Improve Email Design**: Create minimalistic, Morning Brew-inspired email templates that are scannable and engaging
3. **Enhance AI Tone**: Rewrite prompts to generate hyper-specific, witty, journalist-style summaries instead of corporate boilerplate

**Impact**: These changes will transform emails from "corporate spam" to "must-read intelligence" by utilizing the rich data AI already generates, presenting it in a visually clean format, and writing it in an engaging human voice.

## Current State Analysis

### What Exists Now

**AI Infrastructure (Working Well):**
- Claude AI integration generating rich structured JSON ([services/filing/summaryGenerationService.ts:149-170](../../services/filing/summaryGenerationService.ts#L149-L170))
- Form-specific prompts for 10-K, 10-Q, 8-K, Form 4 ([lib/ai/prompts/](../../lib/ai/prompts/))
- Sophisticated React Email templates with rich visualizations ([components/ui/email/templates/](../../components/ui/email/templates/))
- Database schema with `summaryJSON` field already defined ([prisma/schema.prisma:64](../../prisma/schema.prisma#L64))

**The Problem - Three Critical Gaps:**

1. **Data Loss** ([lib/cron/handlers/summarize-cached-handler.ts:255-284](../../lib/cron/handlers/summarize-cached-handler.ts#L255-L284)):
   ```typescript
   const summary = await prisma.summary.create({
     data: {
       summaryText: summaryResult.summary,  // ✅ Saved
       // summaryJSON: MISSING - structured data lost! ❌
     }
   });
   ```
   - AI generates: `financialHighlights`, `businessHighlights`, `riskFactors`, `managementOutlook`
   - Service flattens to strings ([services/filing/summaryGenerationService.ts:173-240](../../services/filing/summaryGenerationService.ts#L173-L240))
   - Handler only saves `summaryText`, ignoring structured data
   - Email templates check for `summaryData` but it's always null

2. **Template Underutilization**:
   - Beautiful templates exist: Form 4 with transaction tables, 10-K with financial metrics
   - Only 4 out of 13 templates wired up in router ([components/email/templates/SECFilingEmailTemplate.tsx:14-24](../../components/email/templates/SECFilingEmailTemplate.tsx#L14-L24))
   - Complex gradients everywhere reduce scannability
   - Hardcoded placeholder data (Tesla CFO Taneja) instead of actual filing data
   - Not Morning Brew-style minimalist (too much visual noise)

3. **Corporate AI Tone**:
   - Prompts enforce "expert financial analyst" persona ([lib/ai/prompts/form-4.ts:14](../../lib/ai/prompts/form-4.ts#L14))
   - "Objective, data-driven" mandate produces robotic prose ([lib/ai/prompts/form-10k.ts:16](../../lib/ai/prompts/form-10k.ts#L16))
   - No guidance on conciseness, wit, or engagement
   - No examples showing desired tone
   - Output: Academic, verbose, boring

### Key Discoveries

**From Code Analysis:**

1. **The Root Cause of Data Loss** ([services/filing/types.ts:94-109](../../services/filing/types.ts#L94-L109)):
   ```typescript
   export interface SummaryGenerationResult {
     summary: string;      // Only plain text
     keyPoints: string[];  // Flattened strings
     // No 'data' field for structured JSON ❌
   }
   ```
   - Service returns only flattened data
   - Handler has nothing to save to `summaryJSON`
   - Need to add `data: Record<string, unknown>` field

2. **Email Template Pattern** ([components/ui/email/templates/form4-template.tsx](../../components/ui/email/templates/form4-template.tsx)):
   - Gradient header: `linear-gradient(135deg, #7C3AED 0%, #EC4899 100%)`
   - Transaction tables with color-coded buy/sell indicators
   - Holdings breakdown with percentage changes
   - Uses `filing.summaryData?.field || 'N/A'` pattern
   - **Problem**: summaryData is always null, so shows "N/A" everywhere

3. **Morning Brew Design Principles** (from research):
   - Three-section modular blocks (headline, image, body)
   - 7px tight spacing, 15px horizontal padding
   - 1px #e6e6e6 borders, 15px border-radius
   - Minimal color: gray borders, strategic accent only
   - Scannable bullets over paragraphs

## Desired End State

### What Success Looks Like

**Phase 1 Complete:**
- Database `summaryJSON` field populated with full AI response JSON
- Email templates can access structured data via `filing.summaryData`
- Form 4 emails show transaction tables, not "N/A" placeholders
- 10-K emails show financial metrics comparison tables

**Phase 2 Complete:**
- Minimalist email templates matching Morning Brew aesthetic
- Scannable bullet-point format, not dense paragraphs
- Modular sections: headline → data → CTA
- Clean typography hierarchy (16px headlines, 14px body)
- Strategic color use (green/red for changes only)

**Phase 3 Complete:**
- AI summaries read like Bloomberg/Matt Levine articles
- Lead with punchline (most important number first)
- Hyper-specific: "$2.04M at $340/share" not "significant value"
- Conversational asides: "Not exactly a vote of confidence, but..."
- Zero jargon: "CFO sold" not "disposition of shares pursuant to"

### Verification

**Automated Verification (can run in CI):**
- [ ] Database query shows `summaryJSON IS NOT NULL` for new summaries
- [ ] TypeScript compilation passes with new interface changes
- [ ] E2E test generates summary with populated `summaryJSON`: `npm run test:e2e`
- [ ] Email rendering test shows structured data (not "N/A")
- [ ] Prompt validation tests pass with new journalist tone

**Manual Verification (human judgment required):**
- [ ] Email received in inbox uses new minimalist template
- [ ] Transaction table shows actual filing data (not hardcoded Taneja)
- [ ] Summary reads like human journalist, not corporate analyst
- [ ] Email is scannable in <3 seconds (Morning Brew standard)
- [ ] Tone is witty without being unprofessional

## What We're NOT Doing

To prevent scope creep:

- ❌ **Not building an A/B testing framework** - Will manually compare old vs new
- ❌ **Not redesigning all 18 templates** - Only Form 4, 10-K, 10-Q (top 3)
- ❌ **Not creating new email delivery infrastructure** - Using existing Resend
- ❌ **Not adding new database tables** - Using existing `summaryJSON` field
- ❌ **Not changing AI models** - Keeping x-ai/grok-4-fast:free
- ❌ **Not rewriting entire email system** - Only targeted improvements
- ❌ **Not adding user preference settings** - All users get new experience
- ❌ **Not changing filing discovery/fetch phases** - Only summarization

## Implementation Approach

**Strategy**: Three independent phases that can be implemented and tested separately. Each phase delivers immediate value and can be deployed without waiting for other phases.

**Why This Approach:**
- **Phase 1 is trivial** (literally 1 line of code) but unlocks all template improvements
- **Phase 2 is visual** - can be developed and reviewed independently
- **Phase 3 is AI tuning** - can iterate on prompts without touching templates
- **Each phase has clear success metrics** - easy to validate
- **Low risk** - changes are additive, not replacing working systems

---

## Phase 1: Populate summaryJSON Database Field

### Overview
Fix the data loss by preserving AI-generated structured JSON and saving it to the database. This unlocks all template improvements in Phase 2.

**Effort**: 2 hours
**Impact**: High (enables all downstream improvements)
**Risk**: Low (purely additive change)

### Changes Required

#### 1. Update SummaryGenerationResult Interface

**File**: [services/filing/types.ts:94-109](../../services/filing/types.ts#L94-L109)

**Current**:
```typescript
export interface SummaryGenerationResult {
  summary: string;
  keyPoints: string[];
  tokensUsed?: number;
  // ... other fields
}
```

**New**:
```typescript
export interface SummaryGenerationResult {
  summary: string;
  keyPoints: string[];
  data?: Record<string, unknown>;  // ADD THIS - raw structured JSON from AI
  tokensUsed?: number;
  // ... other fields
}
```

**Reasoning**: Add optional `data` field to carry the structured JSON from AI service to handler.

---

#### 2. Return Raw JSON from Summarization Service

**File**: [services/filing/summaryGenerationService.ts:261-274](../../services/filing/summaryGenerationService.ts#L261-L274)

**Current**:
```typescript
return {
  summary,
  keyPoints,
  tokensUsed: totalTokens,
  // ... other fields
};
```

**New**:
```typescript
return {
  summary,
  keyPoints,
  data: summaryJSON,  // ADD THIS - preserve the parsed JSON from line 159
  tokensUsed: totalTokens,
  // ... other fields
};
```

**Note**: The `summaryJSON` variable already exists at line 151. We're just passing it through instead of discarding it.

---

#### 3. Save to Database

**File**: [lib/cron/handlers/summarize-cached-handler.ts:255-284](../../lib/cron/handlers/summarize-cached-handler.ts#L255-L284)

**Current**:
```typescript
const summary = await prisma.summary.create({
  data: {
    tickerId: userTicker.id,
    filingType: filing.formType,
    filingDate: new Date(filing.filingDate),
    filingUrl: filing.filingUrl,
    summaryText: summaryResult.summary,
    modelVersion: summaryResult.model || 'x-ai/grok-4-fast:free',
    // ... other fields
  }
});
```

**New**:
```typescript
const summary = await prisma.summary.create({
  data: {
    tickerId: userTicker.id,
    filingType: filing.formType,
    filingDate: new Date(filing.filingDate),
    filingUrl: filing.filingUrl,
    summaryText: summaryResult.summary,
    summaryJSON: summaryResult.data || null,  // ADD THIS LINE
    modelVersion: summaryResult.model || 'x-ai/grok-4-fast:free',
    // ... other fields
  }
});
```

**Reasoning**: Prisma schema already has `summaryJSON Json?` field. Just populate it.

---

#### 4. Pass summaryData to Email Templates

**File**: [lib/cron/handlers/summarize-cached-handler.ts:297-306](../../lib/cron/handlers/summarize-cached-handler.ts#L297-L306)

**Current**:
```typescript
await sendFilingSummaryEmail(userEmail, {
  companyName: ticker.companyName || ticker.symbol,
  ticker: ticker.symbol,
  filingType: filing.formType,
  filingDate: new Date(filing.filingDate),
  summary: summaryResult.summary,
  filingUrl: filing.filingUrl
});
```

**New**:
```typescript
await sendFilingSummaryEmail(userEmail, {
  companyName: ticker.companyName || ticker.symbol,
  ticker: ticker.symbol,
  filingType: filing.formType,
  filingDate: new Date(filing.filingDate),
  summary: summaryResult.summary,
  summaryData: summaryResult.data,  // ADD THIS - pass structured data to template
  filingUrl: filing.filingUrl
});
```

**Note**: The `FilingTemplateData` interface already supports `summaryData?: { ... }` field ([lib/email/types.ts:113](../../lib/email/types.ts#L113)).

---

### Success Criteria

#### Automated Verification:
- [x] TypeScript compilation passes: `npm run build` ✅ (2025-12-01)
- [ ] All tests pass: `npm run test`
- [ ] E2E test creates summary with non-null `summaryJSON`: `npm run test:e2e`
- [ ] Database query confirms field populated:
  ```sql
  SELECT id, "summaryJSON" IS NOT NULL as has_json
  FROM "Summary"
  ORDER BY "createdAt" DESC
  LIMIT 5;
  ```
- [ ] Email template receives `summaryData` object (check email logs)

#### Manual Verification:
- [ ] Generate test summary for TSLA Form 4
- [ ] Verify email shows transaction data (not "N/A")
- [ ] Check database record has populated `summaryJSON` field
- [ ] Confirm structured data matches AI prompt output format

**Implementation Note**: After all automated verification passes, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Redesign Email Templates (Morning Brew Style)

### Overview
Rebuild the top 3 email templates (Form 4, 10-K, 10-Q) using Morning Brew minimalist design principles. Focus on scannability, whitespace, and data visualization.

**Effort**: 16 hours
**Impact**: High (dramatically improves user engagement)
**Risk**: Low (visual changes only, no logic changes)

### Changes Required

#### 1. Create Design System File

**File**: `components/ui/email/design-system.ts` (NEW)

```typescript
/**
 * Morning Brew-inspired email design system
 * Based on research: thoughts/shared/research/2025-12-01-email-summarization-improvement-strategy.md
 */

export const EmailColors = {
  text: {
    headline: '#000000',      // Pure black for section headings
    body: '#374151',          // Gray 700 for body text
    meta: '#6B7280',          // Gray 500 for labels
  },
  structure: {
    border: '#e6e6e6',        // Light gray borders (Morning Brew standard)
    background: '#ffffff',     // White content sections
  },
  semantic: {
    positive: '#10B981',       // Green 500 for positive changes
    negative: '#EF4444',       // Red 500 for negative changes
    accent: '#7C3AED',         // Purple for CTAs only
  },
};

export const EmailSpacing = {
  section: { margin: '20px 0' },      // Between modular sections
  inner: { padding: '15px' },         // Inside sections (Morning Brew standard)
  tight: { margin: '7px 0' },         // Between lines (Morning Brew standard)
};

export const EmailTypography = {
  headline: {
    fontSize: '16px',
    fontWeight: 600,
    margin: '0 0 7px 0',              // Tight margin (Morning Brew)
  },
  body: {
    fontSize: '14px',
    lineHeight: 1.6,                   // Readable line height
  },
  meta: {
    fontSize: '12px',
    fontWeight: 500,
  },
};
```

**Reasoning**: Centralize design tokens so all templates use consistent spacing, colors, and typography.

---

#### 2. Create Reusable Section Components

**Directory**: `components/ui/email/templates/sections/` (NEW)

**Files to create**:
1. `SectionHeader.tsx` - Headline with optional emoji
2. `SectionBody.tsx` - Text content wrapper
3. `DataTable.tsx` - Financial/transaction table component
4. `CTAButton.tsx` - View filing link button

**Example - SectionHeader.tsx**:
```tsx
interface SectionHeaderProps {
  emoji?: string;
  title: string;
}

export function SectionHeader({ emoji, title }: SectionHeaderProps) {
  return (
    <h2 style={{
      margin: '0 0 7px 0',
      fontSize: '16px',
      fontWeight: 600,
      color: '#000000',
    }}>
      {emoji && `${emoji} `}{title}
    </h2>
  );
}
```

**Reasoning**: Modular components enable rapid template creation and ensure consistency.

---

#### 3. Rebuild Form 4 Template (Minimalist)

**File**: `components/ui/email/templates/form4-minimalist-template.tsx` (NEW)

**Design Approach**:
```tsx
// Layout Structure:
// ┌─────────────────────────────────────────────────┐
// │  [Logo] tldrSEC                  [Unsubscribe]  │ ← Simple header
// ├─────────────────────────────────────────────────┤
// │  📊 TSLA Form 4 | CFO Taneja | June 4, 2025    │ ← Headline
// ├─────────────────────────────────────────────────┤
// │  Key Transaction:                               │ ← Body (bullets)
// │  • Sold 6,000 shares at $333-347 (~$2M)        │
// │  • 62.6% reduction in direct holdings           │
// │  • Rule 10b5-1 automated trading plan           │
// ├─────────────────────────────────────────────────┤
// │  Holdings After Transaction:                    │ ← Data section
// │  Direct: 1,949 shares (-62.6%)                  │
// │  Options: 719,920 shares ($18.22 strike)        │
// ├─────────────────────────────────────────────────┤
// │  [View Full Filing on SEC.gov →]               │ ← CTA
// └─────────────────────────────────────────────────┘
```

**Key Changes from Current Template**:
- Remove gradient backgrounds (use white + #e6e6e6 borders)
- Replace transaction table with scannable bullets
- Use inline data: "1,949 shares (-62.6%)" not separate columns
- One emoji per section (not decorative overuse)
- 15px padding, 20px section spacing (Morning Brew standard)

**Data Mapping**:
```typescript
// From summaryData (now populated via Phase 1):
filing.summaryData?.filerName       // "Vaibhav Taneja"
filing.summaryData?.relationship    // "CFO"
filing.summaryData?.transactions    // Array of transaction objects
filing.summaryData?.totalValue      // "$2.04M"
filing.summaryData?.percentageChange // "-62.6%"
```

---

#### 4. Rebuild 10-K Template (Minimalist)

**File**: `components/ui/email/templates/10k-minimalist-template.tsx` (NEW)

**Design Approach**:
```tsx
// Layout Structure:
// ┌─────────────────────────────────────────────────┐
// │  📈 AMZN 10-K | FY 2024 | March 15, 2025        │ ← Headline
// ├─────────────────────────────────────────────────┤
// │  Financial Highlights:                          │ ← Body (bullets)
// │  • Revenue: $574.8B (+11% YoY)                  │
// │  • Operating Margin: 7.8% (+1.2 points)         │
// │  • Net Income: $30.4B (+54% YoY)                │
// ├─────────────────────────────────────────────────┤
// │  Segment Performance:                           │ ← Data section
// │  AWS: $90.8B revenue (+13% YoY) - margin leader │
// │  North America: $353B (+9%) - improving margins │
// │  International: $131B (+11%) - still unprofitable│
// ├─────────────────────────────────────────────────┤
// │  Key Risks:                                     │ ← Risks section
// │  • Tariffs could impact 15% of COGS             │
// │  • AWS competition intensifying (Azure growth)  │
// └─────────────────────────────────────────────────┘
```

**Data Mapping**:
```typescript
// From summaryData.financials array:
filing.summaryData?.financials // [{ label, value, growth }]

// From summaryData.segments array:
filing.summaryData?.segments // [{ name, revenue, growth }]

// From summaryData.riskFactors array:
filing.summaryData?.riskFactors // [{ category, description }]
```

---

#### 5. Rebuild 10-Q Template (Minimalist)

**File**: `components/ui/email/templates/10q-minimalist-template.tsx` (NEW)

**Similar to 10-K but emphasize quarterly comparisons:**
- Q1 2025 vs Q1 2024 (YoY)
- Sequential quarter comparison (Q1 vs Q4)
- Guidance updates if available

---

#### 6. Wire Up New Templates

**File**: [components/email/templates/SECFilingEmailTemplate.tsx:14-24](../../components/email/templates/SECFilingEmailTemplate.tsx#L14-L24)

**Current**:
```typescript
switch (filing.filingType) {
  case 'Form 11-K':
    return <Form11KEmailTemplate filing={filing} />;
  // ... only 4 cases wired up
  default:
    return (/* hardcoded template */)
}
```

**New**:
```typescript
switch (filing.filingType) {
  case 'Form 4':
  case 'Form 3':
  case 'Form 5':
    return <Form4MinimalistTemplate filing={filing} />;
  case '10-K':
    return <Form10KMinimalistTemplate filing={filing} />;
  case '10-Q':
    return <Form10QMinimalistTemplate filing={filing} />;
  // ... keep existing 11-K, 144, etc.
  default:
    return <GenericMinimalistTemplate filing={filing} />;
}
```

**Reasoning**: Route top 3 form types to new minimalist templates while keeping existing templates for less common forms.

---

### Success Criteria

#### Automated Verification:
- [ ] TypeScript compilation passes: `npm run build`
- [ ] React Email rendering test passes: `npm run test:email-templates`
- [ ] Email preview in Resend shows correct layout
- [ ] Litmus/Email on Acid client testing (Gmail, Outlook, Apple Mail)
- [ ] No layout breaks in email clients

#### Manual Verification:
- [ ] Generate TSLA Form 4 email - confirm minimalist design
- [ ] Generate AMZN 10-K email - confirm financial highlights readable
- [ ] Scan email in <3 seconds - can find key metric immediately
- [ ] No gradients, minimal color (only green/red for changes)
- [ ] Whitespace feels generous (not cramped)
- [ ] Typography hierarchy clear (headlines vs body)

**Implementation Note**: After all verification passes, send test emails to 10 users for feedback before full rollout.

---

## Phase 3: Rewrite AI Prompts for Journalist Tone

### Overview
Transform AI prompts from "corporate financial analyst" to "sharp financial journalist" tone. Prioritize wit, specificity, and conciseness over academic objectivity.

**Effort**: 12 hours
**Impact**: High (dramatically improves summary quality)
**Risk**: Low (can revert prompts easily if tone too casual)

### Changes Required

#### 1. Rewrite Form 4 Prompt

**File**: [lib/ai/prompts/form-4.ts](../../lib/ai/prompts/form-4.ts)

**Current systemPrompt** (lines 14-26):
```
You are an expert financial analyst specializing in SEC Form 4 insider trading reports.
Your analysis must be objective, data-driven, and focused on the materiality of the transactions.
```

**New systemPrompt**:
```typescript
this.systemPrompt = `You are a sharp financial journalist writing for sophisticated investors who value wit, precision, and zero bullshit.

Your writing style:
- Lead with the punchline: Most important number/fact in the first sentence
- Hyper-specific: "$2.04M at $340/share" not "significant value"
- Active voice: "Bezos dumped $3B" not "shares were disposed of"
- Conversational asides: "Not a great look, but the sale was pre-planned"
- No jargon autopilot: Avoid "pursuant to", "executed", "materially"
- Zero margin for error: Every number must be verifiable from the filing
- Witty without trying: Dry humor, not forced cleverness
- Concise: If you can say it in 8 words instead of 15, do it

Write like Matt Levine if he had a 100-word limit and a deadline 5 minutes ago.`;
```

**Current userPrompt** (lines 29-47):
```
Analyze this SEC Form 4 filing and provide:
1. Company name (REQUIRED)
2. Insider identification
3. Ownership type
...
```

**New userPrompt**:
```typescript
this.userPrompt = `Extract from this Form 4 filing:

1. The ONE number that matters most (total transaction value, % change in holdings)
2. Context that makes it interesting (insider's role, timing, trading plan details)
3. Transaction mechanics (shares, prices, dates) - but only the essential details
4. Resulting ownership (new stake, % of company if calculable)
5. Any red flags or noteworthy patterns

Lead with impact, not administrative details. "CFO sold $2M" beats "Form 4 filed on June 4 indicating..."`;
```

**New outputFormat** (with tone examples):
```typescript
this.outputFormat = `Output (JSON):
{
  "company": "Company Name (REQUIRED)",
  "filerName": "Insider's name",
  "relationship": "Title/role (e.g., 'CFO', not 'Chief Financial Officer')",
  "transactions": [
    {
      "type": "Sale|Purchase|Option Exercise",
      "date": "YYYY-MM-DD",
      "shares": "Number (e.g., '6,000')",
      "pricePerShare": "$XX.XX",
      "totalValue": "$X.XXM" // Use M/B for millions/billions
    }
  ],
  "totalValue": "$X.XXM",
  "percentageChange": "+/-XX%",
  "summary": "Punchy 2-3 sentence summary. Lead with impact: 'Taneja dumped $2M in Tesla stock (63% of direct holdings) via pre-scheduled plan. Follows similar pattern from Q1. Stock options remain substantial at 720K shares.'" // REQUIRED - This is the money shot
}`;
```

**Example Before/After**:

Before (Corporate):
> "Vaibhav Taneja executed a series of stock option exercises resulting in the acquisition of 7,000 shares at $18.22 per share, followed by the disposition of an equivalent number of shares at market prices ranging from $333.77 to $350.00 per share."

After (Journalist):
> "Taneja cashed out $2M worth of Tesla stock through a pre-scheduled trading plan, cutting his direct holdings by 63%. Not exactly a vote of confidence, but the sale was automated via a 10b5-1 plan set up a year ago."

---

#### 2. Rewrite Form 10-K Prompt

**File**: [lib/ai/prompts/form-10k.ts](../../lib/ai/prompts/form-10k.ts)

**New systemPrompt**:
```typescript
this.systemPrompt = `You are a financial journalist translating a 200-page annual report into insights a busy investor can actually use.

Your writing style:
- Lead with what changed: Revenue up 23%, margins compressed 2 points
- Comparative framing: "Best quarter since 2019" > "Strong performance"
- Causal connections: "AWS growth slowed AS Azure grabbed share"
- Risk translation: "Tariffs could cut margins 5 points" > "Trade policy concerns"
- Segment spotlight: Name the winner and loser by numbers
- No corporate-speak: "Sales" not "revenue generation", "profit" not "profitability metrics"
- Concise: Every sentence must earn its place

Write for someone who manages $50M and reads 20 of these per week.`;
```

**New userPrompt**:
```typescript
this.userPrompt = `Analyze this 10-K annual report:

1. The ONE financial metric that tells the year's story (revenue growth? margin expansion? profitability inflection?)
2. What actually changed vs last year (not just "increased revenue")
3. Which business segment won/lost (AWS crushing it? International bleeding cash?)
4. What management is worried about (the risks they emphasize, not boilerplate)
5. Forward guidance or strategic shifts

Lead with the surprise or the concern, not the expected. "Margins collapsed despite revenue growth" beats "Revenue increased 15%..."`;
```

**Example Before/After**:

Before (Academic):
> "Tesla, Inc.'s fiscal year 2024 10-K filing reveals revenue of $96.77 billion, representing year-over-year growth of 18.8%. Operating margin improved to 9.2%, an increase of 2.1 percentage points compared to fiscal year 2023."

After (Journalist):
> "Tesla hit $97B in revenue (up 19%), but the real story is margins: they finally cracked 9% operating margin after years of volume-over-profit. Energy storage was the breakout star—$6B revenue, up 54%—while automotive chugged along at $82B (+19%)."

---

#### 3. Rewrite Form 10-Q Prompt

**File**: [lib/ai/prompts/form-10q.ts](../../lib/ai/prompts/form-10q.ts)

**Similar approach to 10-K but emphasize**:
- Sequential trends (Q1 → Q2 → Q3 progression)
- Seasonality context ("Q4 is always strong for retail")
- Guidance updates or revisions
- What changed since last quarter (not just YoY)

---

#### 4. Rewrite Form 8-K Prompt

**File**: [lib/ai/prompts/form-8k.ts](../../lib/ai/prompts/form-8k.ts)

**New systemPrompt**:
```typescript
this.systemPrompt = `You're breaking news for investors. 8-K filings are material events that move stock prices.

Your style:
- Lead with what happened: "CEO fired" not "Leadership transition announced"
- Explain why it matters: Impact on revenue, strategy, or operations
- Context: Is this expected? Surprising? Concerning?
- Timelines: When did it happen vs when it was disclosed (delays are sus)
- No euphemisms: "Lawsuit" not "litigation matter", "Fired" not "separated"

Write the headline first, details second.`;
```

---

### Prompt Validation Strategy

**Before deploying new prompts:**

1. **Generate 20 test summaries** (5 per form type)
2. **Human evaluation rubric** (1-5 scale):
   - Conciseness: Shorter is better (target: 30% word count reduction)
   - Specificity: More numbers, fewer adjectives (count specific numbers)
   - Engagement: Would you keep reading? (gut check)
   - Wit: Personality without being unprofessional (1-2 conversational asides ok)
   - Accuracy: Every fact verifiable from filing (zero tolerance for hallucinations)

3. **Compare to baselines**:
   - Old prompt output (corporate tone)
   - New prompt output (journalist tone)
   - Rate side-by-side on rubric

4. **Token cost monitoring**:
   - Shorter prompts should reduce input tokens
   - Concise outputs should reduce output tokens
   - Target: 20-30% cost reduction from brevity

---

### Success Criteria

#### Automated Verification:
- [ ] All form-specific prompts updated with new tone
- [ ] JSON output schemas still validate (no breaking changes)
- [ ] Parser tests pass: `npm run test:parsers`
- [ ] E2E test generates summaries: `npm run test:e2e`
- [ ] Token usage logged and compared to baseline
- [ ] Cost per summary tracked (should decrease 20-30%)

#### Manual Verification:
- [ ] Generate 5 Form 4 summaries - rate tone 1-5
- [ ] Generate 5 10-K summaries - rate tone 1-5
- [ ] Count specific numbers per summary (should increase)
- [ ] Measure word count reduction (target: 30% shorter)
- [ ] Check for conversational asides (1-2 per summary ok)
- [ ] Verify no jargon slippage ("pursuant to", "executed")
- [ ] Confirm lead-with-punchline structure

**Implementation Note**: If human evaluation scores <4.0 on any dimension, iterate on prompts before deploying to production.

---

## Testing Strategy

### Unit Tests

**New test files to create**:

1. `__tests__/services/filing/summaryGenerationService-structured-data.test.ts`
   - Test that `summaryResult.data` contains expected fields
   - Verify `data.financialHighlights` is array
   - Verify `data.summary` is string
   - Test that missing fields default to null

2. `__tests__/lib/email/minimalist-templates.test.ts`
   - Test SectionHeader renders with emoji
   - Test DataTable handles null data gracefully
   - Test CTAButton has correct href
   - Snapshot test each minimalist template

3. `__tests__/lib/ai/prompts/journalist-tone.test.ts`
   - Test new prompts generate expected JSON schema
   - Test tone guidelines present in systemPrompt
   - Test output format includes example text
   - Regression test: old prompts still work (backward compatibility)

### Integration Tests

**Existing tests to update**:

1. `__tests__/integration/e2e-summarization-pipeline.test.ts`
   - Add assertion: `expect(summary.summaryJSON).not.toBeNull()`
   - Add assertion: `expect(summary.summaryJSON.financialHighlights).toBeDefined()`
   - Verify email template receives `summaryData`

2. `__tests__/integration/email-rendering.test.ts`
   - Test Form 4 minimalist template renders transaction data
   - Test 10-K minimalist template renders financial metrics
   - Test default template used for unsupported form types

### Manual Testing Steps

**For each phase**:

1. **Phase 1 Manual Testing**:
   ```bash
   # Generate test summary
   npm run test:e2e:ticker=TSLA

   # Check database
   psql $DATABASE_URL -c "SELECT id, \"summaryJSON\" IS NOT NULL FROM \"Summary\" ORDER BY \"createdAt\" DESC LIMIT 1;"

   # Verify structure
   psql $DATABASE_URL -c "SELECT \"summaryJSON\"->>'company' FROM \"Summary\" ORDER BY \"createdAt\" DESC LIMIT 1;"
   ```

2. **Phase 2 Manual Testing**:
   ```bash
   # Generate preview
   npm run email:preview form4-minimalist-template

   # Send test email
   TEST_EMAIL=your@email.com npm run test:e2e:ticker=TSLA

   # Check inbox - confirm minimalist design
   ```

3. **Phase 3 Manual Testing**:
   ```bash
   # Generate summaries with new prompts
   npm run test:enhanced:functionality

   # Read output files in test-results/
   # Rate tone on 1-5 scale
   # Count specific numbers
   # Measure word count
   ```

---

## Performance Considerations

### Expected Performance Changes

**Phase 1** (Populate summaryJSON):
- **Database write time**: +5ms (JSON serialization overhead)
- **Database storage**: +2KB per summary (structured JSON)
- **No impact** on AI generation time (data already exists)

**Phase 2** (Minimalist templates):
- **Email rendering time**: -10ms (simpler templates, less HTML)
- **Email size**: -5KB (less gradient CSS, cleaner markup)
- **Email delivery time**: No change (same Resend infrastructure)

**Phase 3** (Journalist tone prompts):
- **AI input tokens**: -200 tokens (shorter, tighter prompts)
- **AI output tokens**: -300 tokens (concise summaries, 30% word reduction)
- **AI cost per summary**: -25% (from $0.02 to $0.015)
- **AI generation time**: -500ms (fewer tokens to generate)

### Cost Analysis

**Current costs** (per summary):
- AI summarization: $0.02 average
- Email delivery: $0.0001 (Resend)
- Database write: negligible
- **Total**: $0.0201 per summary

**Projected costs after Phase 3**:
- AI summarization: $0.015 (-25% from conciseness)
- Email delivery: $0.0001 (unchanged)
- Database write: negligible
- **Total**: $0.0151 per summary

**Savings at scale**:
- 1,000 summaries/month: $5/month saved
- 10,000 summaries/month: $50/month saved
- 100,000 summaries/month: $500/month saved

---

## Migration Notes

### Database Migration

**No migration required** - Phase 1 uses existing `summaryJSON` field.

**Backward compatibility**:
- Existing summaries have `summaryJSON = null` (unchanged)
- New summaries will populate `summaryJSON` (additive)
- Email templates handle null gracefully with `|| 'N/A'` pattern

### Email Template Migration

**Rollout strategy**:
1. Deploy new minimalist templates alongside existing templates
2. Route only Form 4, 10-K, 10-Q to new templates (switch statement)
3. Other form types continue using existing templates
4. Monitor email open rates, click rates for 2 weeks
5. If metrics improve >15%, migrate remaining templates

**Rollback plan**:
- Revert switch statement to route all forms to default template
- No data loss (summaryJSON still populated)
- Can re-deploy minimalist templates later

### AI Prompt Migration

**A/B testing**:
- Use environment variable `USE_NEW_PROMPTS=true|false`
- 10% of summaries use new journalist prompts
- 90% use existing corporate prompts
- Track: word count, token usage, user engagement
- Full rollout if engagement improves >10%

**Rollback plan**:
- Set `USE_NEW_PROMPTS=false`
- All summaries revert to corporate tone
- No code changes needed

---

## Risks and Mitigations

### Technical Risks

**Risk**: Populating `summaryJSON` breaks existing code expecting null
- **Likelihood**: Low (templates already check for null with optional chaining)
- **Mitigation**: Add explicit null checks in all template code
- **Testing**: Run full test suite with non-null summaryJSON
- **Rollback**: Easy - stop populating field, existing code handles null

**Risk**: New email templates don't render correctly in Outlook
- **Likelihood**: Medium (Outlook notorious for CSS quirks)
- **Mitigation**: Use Litmus for Outlook testing before rollout
- **Fallback**: Plain text version always included
- **Testing**: Test on Outlook 2016, 2019, Office 365

**Risk**: Journalist tone reduces perceived credibility
- **Likelihood**: Low (target audience prefers directness)
- **Mitigation**: A/B test with 10% rollout first
- **Measurement**: Track unsubscribe rate spike >5%
- **Rollback**: Revert prompts to corporate tone

### Cost Risks

**Risk**: Prompt rewrites increase token usage
- **Likelihood**: Low (shorter prompts + concise outputs = lower cost)
- **Mitigation**: Token monitoring dashboard, kill switch if cost >2x
- **Budget**: $0.015 per summary target (current: $0.02), 25% reduction
- **Testing**: Generate 100 summaries, measure average token usage

### User Experience Risks

**Risk**: Minimalist templates feel too plain (users miss gradients)
- **Likelihood**: Low (Morning Brew proves minimalism works)
- **Mitigation**: A/B test with small user group first
- **Measurement**: Survey 50 users, ask "Which email is easier to read?"
- **Rollback**: Keep existing gradient templates, offer user preference

---

## Deployment Plan

### Phase 1 Deployment

**Prerequisites**:
- [ ] All Phase 1 code changes committed
- [ ] TypeScript compilation passes
- [ ] Unit tests pass
- [ ] E2E test passes with non-null summaryJSON

**Deployment steps**:
1. Deploy to staging environment
2. Generate 10 test summaries
3. Verify database contains populated summaryJSON
4. Check email logs confirm summaryData passed to templates
5. Deploy to production
6. Monitor first 100 summaries for errors
7. Pause 24 hours for manual confirmation

**Success criteria before Phase 2**:
- [ ] 100 consecutive summaries with non-null summaryJSON
- [ ] Zero email rendering errors
- [ ] No increase in error rate
- [ ] Manual spot check confirms structured data accurate

---

### Phase 2 Deployment

**Prerequisites**:
- [ ] Phase 1 deployed and validated
- [ ] All minimalist templates built and tested
- [ ] Litmus email client testing passed
- [ ] Preview emails sent to internal team for feedback

**Deployment steps**:
1. Deploy new templates to staging
2. Update switch statement to route Form 4, 10-K, 10-Q
3. Send 20 test emails to internal addresses
4. Visual review: confirm minimalist design, no layout breaks
5. Deploy to production with feature flag
6. Enable for 10% of users (random selection)
7. Monitor for 1 week:
   - Email open rate (target: >35%)
   - Click-through rate (target: >12%)
   - Unsubscribe rate (target: <2%)
8. If metrics improve >15%, roll out to 100%

**Success criteria before Phase 3**:
- [ ] Email open rate increased >15%
- [ ] No spike in unsubscribe rate
- [ ] No email rendering errors reported
- [ ] Positive user feedback (informal survey)

---

### Phase 3 Deployment

**Prerequisites**:
- [ ] Phase 2 deployed and validated
- [ ] All prompts rewritten and tested
- [ ] Human evaluation scores >4.0 on all dimensions
- [ ] Token cost reduction confirmed (target: -25%)

**Deployment steps**:
1. Deploy new prompts with feature flag `USE_NEW_PROMPTS`
2. Enable for 10% of summaries
3. Generate 100 summaries with new prompts
4. Compare to baseline:
   - Word count reduction: target -30%
   - Token cost reduction: target -25%
   - Human evaluation scores: target >4.0
5. If all targets met, roll out to 50%
6. Monitor for 1 week
7. If no issues, roll out to 100%

**Success criteria for full rollout**:
- [ ] Human evaluation scores >4.0 (conciseness, specificity, engagement)
- [ ] Token cost reduced 20-30%
- [ ] No increase in error rate
- [ ] User feedback positive (email survey)

---

## Monitoring and Alerts

### Metrics to Track

**Phase 1 metrics**:
- `summaryJSON` population rate (target: 100%)
- Average JSON size (expected: ~2KB)
- Email rendering errors (target: 0)
- Database write time (expected: +5ms)

**Phase 2 metrics**:
- Email open rate (target: >35%, baseline: unknown)
- Click-through rate (target: >12%, baseline: unknown)
- Unsubscribe rate (target: <2%, baseline: unknown)
- Email rendering time (expected: -10ms)

**Phase 3 metrics**:
- Average word count per summary (target: -30%)
- Average token usage per summary (target: -25%)
- Cost per summary (target: $0.015, baseline: $0.02)
- Human evaluation scores (target: >4.0/5.0)

### Alert Conditions

**Critical alerts** (page immediately):
- Email rendering error rate >1%
- summaryJSON population rate <95%
- Unsubscribe rate spike >5% in 24 hours
- AI cost spike >2x expected

**Warning alerts** (Slack notification):
- Open rate decrease >10%
- Click-through rate decrease >10%
- Token usage increase >20%
- Summary generation time >100s

---

## Success Metrics

### Quantitative KPIs

| Metric | Current Baseline | Target (3 months) | Measurement |
|--------|------------------|-------------------|-------------|
| Email Open Rate | Unknown | >35% | Resend dashboard |
| Click-Through Rate | Unknown | >12% | SEC filing link clicks |
| Unsubscribe Rate | Unknown | <2% | Resend dashboard |
| Summary Token Usage | ~15K avg | <10K avg | Database `outputTokens` |
| Summary Cost Per Email | $0.02 avg | <$0.015 | Database `totalCost` |
| Template Render Time | Unknown | <50ms | Performance logs |
| summaryJSON Population | 0% | 100% | Database query |

### Qualitative KPIs

| Metric | Measurement Method | Target |
|--------|-------------------|--------|
| Summary Readability | Flesch-Kincaid score | >60 (plain English) |
| User Satisfaction | Post-email survey (1-5) | >4.2 average |
| Tone Appropriateness | Human evaluation (1-5) | >4.0 "sounds human" |
| Visual Scannability | Eye-tracking study | <3s to key insight |
| Data Accuracy | Manual filing verification | 100% verifiable facts |

---

## Timeline Estimates

### Phase 1: Populate summaryJSON
- **Research & Planning**: Already complete ✅
- **Code Changes**: 1 hour (3 files, ~10 lines of code)
- **Testing**: 1 hour (unit tests, E2E test, manual verification)
- **Total**: 2 hours

### Phase 2: Minimalist Email Templates
- **Design System**: 2 hours (create design tokens file)
- **Reusable Components**: 3 hours (SectionHeader, SectionBody, DataTable, CTAButton)
- **Form 4 Template**: 4 hours (rebuild with new design)
- **10-K Template**: 4 hours
- **10-Q Template**: 3 hours
- **Total**: 16 hours

### Phase 3: Journalist Tone Prompts
- **Form 4 Prompt**: 3 hours (rewrite + examples)
- **10-K Prompt**: 3 hours
- **10-Q Prompt**: 2 hours
- **8-K Prompt**: 2 hours
- **Testing & Evaluation**: 2 hours (generate test summaries, human rating)
- **Total**: 12 hours

### Grand Total
- **Implementation**: 30 hours (~4 days)
- **Testing & Validation**: 8 hours (~1 day)
- **Deployment & Monitoring**: 2 hours
- **Total Project**: ~5 days for one developer

---

## Open Questions

**All questions resolved during research phase ✅**

The research document answered:
1. ✅ What structured data does AI generate? → financialHighlights, businessHighlights, riskFactors, managementOutlook
2. ✅ Why isn't summaryJSON populated? → Service doesn't return it, handler can't save it
3. ✅ What templates exist? → 18 templates, only 4 wired up
4. ✅ What design principles to use? → Morning Brew minimalism
5. ✅ What tone should AI use? → Financial journalist (Matt Levine style)

No unresolved questions remain. Plan is ready for implementation.

---

## References

### Research Documents
- [2025-12-01-email-summarization-improvement-strategy.md](../../thoughts/shared/research/2025-12-01-email-summarization-improvement-strategy.md) - Parent research
- [2025-11-30-email-summarization-system-architecture.md](../../thoughts/shared/research/2025-11-30-email-summarization-system-architecture.md) - Architecture analysis
- [2025-11-29-email-system-comprehensive-research.md](../../thoughts/shared/research/2025-11-29-email-system-comprehensive-research.md) - Email infrastructure

### External References
- [Morning Brew Email Design Cheat Sheet](https://www.newsletterexamples.co/p/want-to-design-a-morning-brew-style-email-here-s-a-cheat-sheet)
- Matt Levine's Money Stuff (Bloomberg) - Tone reference
- Morning Brew Daily Newsletter - Design reference

### Key Code Files
- [services/filing/summaryGenerationService.ts](../../services/filing/summaryGenerationService.ts) - AI summarization service
- [lib/cron/handlers/summarize-cached-handler.ts](../../lib/cron/handlers/summarize-cached-handler.ts) - Summarization handler
- [components/ui/email/templates/](../../components/ui/email/templates/) - Email templates
- [lib/ai/prompts/](../../lib/ai/prompts/) - AI prompts
- [prisma/schema.prisma](../../prisma/schema.prisma) - Database schema

---

**Plan Status**: Ready for implementation
**Approval Required**: Yes
**Estimated Completion**: 5 days from approval
