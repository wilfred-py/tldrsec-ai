# SEC Summary Quality Improvement - Phase 2 Implementation Plan

**Date**: 2026-01-12 20:32:16 AEDT
**Git Commit**: 49cb342782e6dda75d73cc339659383033f92db1
**Branch**: review-generated-summaries
**Repository**: review-generated-summaries

## Overview

This plan addresses the remaining user feedback items from the SEC Filing Summary Quality analysis (Phase 1 completed 2026-01-12). We focus on three key improvements:

1. **Fix Form 4 shares display issue** - Ensure share counts are always displayed correctly, not just monetary values
2. **Improve 10b5-1 detection prompts** - Enhanced AI prompt guidance (simplified approach, no XML parsing)
3. **Add historical context to summaries** - Retrieve last N summaries for ticker context (simplified approach)
4. **Review form-specific prompts via Grokipedia** - Research each SEC form type using xAI Grok and update extraction guidance

## Current State Analysis

### Research Findings

**Form 4 Shares Issue** (from codebase analysis):
- Root cause identified at [form4-minimalist-template.tsx:235-251](components/ui/email/templates/form4-minimalist-template.tsx#L235-L251)
- Empty string `''` for shares parses as `0` via `parseNumericValue()`
- AI prompt doesn't enforce shares field as REQUIRED
- Markdown table extraction fails if column header doesn't contain "amount" or "shares"

**10b5-1 Detection** (current text-based approach at [form4-data-extractor.ts:533-543](lib/email/form4-data-extractor.ts#L533-L543)):
- Uses pattern matching: `includes('10b5-1')`, `includes('10b-5')`, `includes('rule 10b')`
- Handles negation: `includes('no 10b5-1')`, `includes('unchecked')`
- No direct XML parsing exists - relies entirely on AI summary extraction

**Historical Context** (no implementation exists):
- Database has relationships: `Ticker` → `summaries[]`
- Current prompt only passes `ticker`, `companyName`, `filingContent`
- No retrieval of previous summaries before AI call

### Key Discoveries

1. **Form 4 Schema** at [unified-prompts.ts:316-329](lib/ai/prompts/unified-prompts.ts#L316-L329) - shares field exists but isn't marked as required
2. **Aggregation Logic** at [form4-minimalist-template.tsx:238-251](components/ui/email/templates/form4-minimalist-template.tsx#L238-L251) - prioritizes totalValue over shares calculation
3. **Historical Data Available** - Prisma allows simple `findMany` with `orderBy: { filingDate: 'desc' }`

## Desired End State

After implementation:
1. Form 4 summaries always display accurate share counts alongside monetary values
2. 10b5-1 trading plan status is reliably extracted and displayed
3. New summaries include context from the 3 most recent summaries for the same ticker

### Verification

1. Zero instances of "$X value, 0 shares" in Form 4 displays
2. 10b5-1 mention accuracy >= 90% against SEC filing footnotes
3. Summary quality score improvement for repeat filings (measured via A/B comparison)

## What We're NOT Doing

- **NO XML checkbox parsing** - Complexity doesn't justify accuracy gain for 10b5-1
- **NO vector embeddings/pgvector** - Start with chronological last-N approach
- **NO web search integration** - Deferred to future phase (nice-to-have)
- **NO cross-filing analysis** - Just same-ticker context, not cross-company patterns

## Implementation Approach

**Elon's 5-Step Algorithm Applied:**
1. **Questioned requirements**: XML parsing for 10b5-1 deleted (text detection + prompt improvement sufficient)
2. **Deleted complexity**: Vector embeddings deleted in favor of simple last-N query
3. **Simplified**: Four focused fixes instead of broad refactoring
4. **Will accelerate**: TDD with small incremental checkpoints
5. **Automate**: Tests will serve as regression guard

---

## Phase 1: Fix Form 4 Shares Display

### Overview
Ensure share counts are always correctly extracted and displayed alongside monetary values.

### Step 1.1: 🔴 Write Failing Tests

**Test File**: `__tests__/email/form4-shares-display.test.ts`

```typescript
import { extractForm4Data, Form4ExtractedData } from '@/lib/email/form4-data-extractor';
import { aggregateTransactionsByType, parseNumericValue } from '@/components/ui/email/templates/form4-minimalist-template';

describe('Form 4 Shares Display', () => {
  describe('extractForm4Data', () => {
    it('should extract shares from standard markdown table', async () => {
      const summaryText = `
| Date | Code | Amount | Price | A/D |
|------|------|--------|-------|-----|
| 2026-01-10 | S | 10,000 | $150.00 | D |
`;
      const result = extractForm4Data(summaryText);
      expect(result.transactions[0].shares).toBe('10,000');
      expect(result.transactions[0].pricePerShare).toBe('$150.00');
    });

    it('should extract shares when table header uses "Shares" instead of "Amount"', async () => {
      const summaryText = `
| Date | Code | Shares | Price | A/D |
|------|------|--------|-------|-----|
| 2026-01-10 | S | 5,000 | $200.00 | D |
`;
      const result = extractForm4Data(summaryText);
      expect(result.transactions[0].shares).toBe('5,000');
    });

    it('should extract shares when table header uses "Quantity"', async () => {
      const summaryText = `
| Date | Code | Quantity | Price | A/D |
|------|------|----------|-------|-----|
| 2026-01-10 | P | 1,000 | $50.00 | A |
`;
      const result = extractForm4Data(summaryText);
      expect(result.transactions[0].shares).toBe('1,000');
    });

    it('should extract shares from prose when table extraction fails', async () => {
      const summaryText = `The insider sold 25,000 shares at $100.00 per share.`;
      const result = extractForm4Data(summaryText);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].shares).toBe('25,000');
    });

    it('should extract gift transaction shares correctly', async () => {
      const summaryText = `Gift of 73,252 shares to family trusts. Total value: $15.2M.`;
      const result = extractForm4Data(summaryText);
      expect(result.transactions[0].shares).toBe('73,252');
      expect(result.transactions[0].type).toContain('Gift');
    });
  });

  describe('parseNumericValue edge cases', () => {
    it('should return NaN marker for empty string instead of 0', () => {
      // This is a behavior change - empty should not be 0
      const result = parseNumericValue('');
      expect(result).toBeNaN(); // or expect(result).toBe(null)
    });

    it('should parse "73,252" correctly', () => {
      expect(parseNumericValue('73,252')).toBe(73252);
    });

    it('should parse "$15.2M" correctly', () => {
      expect(parseNumericValue('$15.2M')).toBe(15200000);
    });
  });

  describe('aggregateTransactionsByType', () => {
    it('should not display 0 shares when shares field is empty', () => {
      const transactions = [{
        type: 'Sale',
        shares: '',
        pricePerShare: '$150.00',
        totalValue: '$1.5M',
        acquisitionDisposition: 'D',
      }];
      const result = aggregateTransactionsByType(transactions);
      // Should either have shares from totalValue/price calc OR display N/A
      expect(result.sale.shares).not.toBe(0);
    });

    it('should calculate shares from totalValue/price when shares is missing', () => {
      const transactions = [{
        type: 'Sale',
        shares: '',
        pricePerShare: '$150.00',
        totalValue: '$1,500,000',
        acquisitionDisposition: 'D',
      }];
      const result = aggregateTransactionsByType(transactions);
      expect(result.sale.shares).toBe(10000); // $1.5M / $150 = 10,000
    });
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="form4-shares-display"
# Expected: 8 failing tests
```

### Step 1.2: 🟢 Implement to Pass Tests

#### 1.2.1 Expand Table Header Detection
**File**: `lib/email/form4-data-extractor.ts`
**Line**: ~217

```typescript
// Before:
const amountIdx = headers.findIndex(h => h.includes('amount') || h.includes('shares'));

// After:
const amountIdx = headers.findIndex(h =>
  h.includes('amount') ||
  h.includes('shares') ||
  h.includes('quantity') ||
  h.includes('units') ||
  h.includes('number')
);
```

**Checkpoint 1.2.1**: First table test passes:
```bash
npm run test -- --testPathPattern="form4-shares-display" --testNamePattern="Quantity"
# Expected: 1 passing
```

#### 1.2.2 Add Fallback Share Calculation
**File**: `components/ui/email/templates/form4-minimalist-template.tsx`
**Lines**: 235-260

```typescript
// In aggregateTransactionsByType function
const shares = tx.shares ? Math.round(parseNumericValue(tx.shares)) : 0;
const price = parseNumericValue(tx.pricePerShare);

let value = 0;
let calculatedShares = shares;

if (tx.totalValue) {
  const parsedTotalValue = parseNumericValue(tx.totalValue);
  if (parsedTotalValue > 0) {
    value = parsedTotalValue;
    // NEW: Calculate shares from value/price if shares is missing
    if (shares === 0 && price > 0) {
      calculatedShares = Math.round(parsedTotalValue / price);
    }
  }
} else if (shares > 0 && price > 0) {
  value = shares * price;
}

// Use calculated shares if original was 0
const finalShares = calculatedShares > 0 ? calculatedShares : shares;

groups[groupKey].shares += finalShares;
groups[groupKey].value += value;
```

**Checkpoint 1.2.2**: Share calculation tests pass:
```bash
npm run test -- --testPathPattern="form4-shares-display" --testNamePattern="calculate shares"
# Expected: 2 passing
```

#### 1.2.3 Update AI Prompt Schema
**File**: `lib/ai/prompts/unified-prompts.ts`
**Lines**: 316-329

```typescript
transactions: {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        description: 'Transaction type: A=Acquisition, D=Disposition, P=Purchase, S=Sale, G=Gift, M=Exercise'
      },
      shares: {
        type: 'string',
        description: 'REQUIRED: Number of shares with commas (from column 5). Never leave blank - extract from table or calculate from value/price.'
      },
      price: {
        type: 'string',
        description: 'Price per share with $ from column 4 - if $0, check if this is a gift/grant. Never leave blank.'
      },
      // ...
    },
    required: ['type', 'shares', 'price']
  }
}
```

**Checkpoint 1.2.3**: All Phase 1 tests pass:
```bash
npm run test -- --testPathPattern="form4-shares-display"
# Expected: 8 passing
```

### Step 1.3: 🔵 Refactor

- [ ] Extract share calculation logic to utility function
- [ ] Add JSDoc comments for new behavior
- [ ] Ensure consistent number formatting

**Checkpoint 1.3**: All tests still pass:
```bash
npm run test -- --testPathPattern="form4-shares-display"
npm run lint
```

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="form4-shares-display"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] No regressions: `npm run test`

#### Manual Verification:
- [ ] Generate test email for a Form 4 gift transaction
- [ ] Verify shares display correctly alongside value
- [ ] Test with real SEC filing URL that previously showed 0 shares

**STOP**: Await manual confirmation before Phase 2.

---

## Phase 2: Improve 10b5-1 Detection Prompts

### Overview
Enhance AI prompt guidance to more reliably extract 10b5-1 trading plan status from filings.

### Step 2.1: 🔴 Write Failing Tests

**Test File**: `__tests__/ai/prompts/10b51-extraction.test.ts`

```typescript
import { generateUnifiedPrompt } from '@/lib/ai/prompts/unified-prompts';
import { determineSignalStrength } from '@/lib/email/form4-data-extractor';

describe('10b5-1 Detection', () => {
  describe('AI Prompt Guidance', () => {
    it('should include explicit 10b5-1 extraction instructions in Form 4 prompt', () => {
      const { systemPrompt, userPrompt } = generateUnifiedPrompt({
        formType: '4',
        company: 'Test Corp',
        ticker: 'TEST',
        filingDate: '2026-01-12',
        filingContent: 'test content'
      });

      expect(systemPrompt).toContain('10b5-1');
      expect(systemPrompt).toContain('footnote');
      expect(systemPrompt).toContain('trading plan');
    });

    it('should include has10b51Plan boolean field in schema', () => {
      const { systemPrompt } = generateUnifiedPrompt({
        formType: '4',
        company: 'Test Corp',
        ticker: 'TEST',
        filingDate: '2026-01-12',
        filingContent: 'test content'
      });

      expect(systemPrompt).toContain('has10b51Plan');
    });
  });

  describe('determineSignalStrength', () => {
    it('should detect 10b5-1 from explicit mention', () => {
      const result = determineSignalStrength('Sale pursuant to a Rule 10b5-1 trading plan');
      expect(result).toBe('Weak - 10b5-1 Plan');
    });

    it('should detect 10b5-1 from footnote reference', () => {
      const result = determineSignalStrength('The transaction was effected pursuant to a pre-arranged trading plan adopted on March 1, 2025');
      expect(result).toBe('Weak - 10b5-1 Plan');
    });

    it('should NOT detect 10b5-1 when negated', () => {
      const result = determineSignalStrength('This transaction was not pursuant to a 10b5-1 trading plan');
      expect(result).not.toBe('Weak - 10b5-1 Plan');
    });

    it('should detect 10b5-1 from structured JSON field', () => {
      const summaryJSON = { has10b51Plan: true };
      const result = determineSignalStrength('Some text', summaryJSON);
      expect(result).toBe('Weak - 10b5-1 Plan');
    });
  });
});
```

**Checkpoint 2.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="10b51-extraction"
# Expected: 5 failing tests
```

### Step 2.2: 🟢 Implement to Pass Tests

#### 2.2.1 Add has10b51Plan to Schema
**File**: `lib/ai/prompts/unified-prompts.ts`
**Location**: Form 4 schema section

```typescript
// Add to Form 4 properties:
has10b51Plan: {
  type: 'boolean',
  description: 'TRUE if any footnote mentions Rule 10b5-1, 10b-5, trading plan, or pre-arranged sale. FALSE if explicitly states NOT pursuant to 10b5-1 or if no mention found.'
},
tradingPlanDetails: {
  type: 'string',
  description: 'If 10b5-1 plan exists, extract the adoption date and any other relevant details from footnotes.'
}
```

**Checkpoint 2.2.1**: Schema test passes:
```bash
npm run test -- --testPathPattern="10b51-extraction" --testNamePattern="has10b51Plan"
```

#### 2.2.2 Add Extraction Instructions to System Prompt
**File**: `lib/ai/prompts/unified-prompts.ts`

Add to Form 4 extraction guidance:
```typescript
// Add to FORM 4 EXTRACTION GUIDANCE section:
`
## 10b5-1 Trading Plan Detection (CRITICAL)
1. Check ALL footnotes for mentions of:
   - "Rule 10b5-1"
   - "10b5-1 trading plan"
   - "pre-arranged trading plan"
   - "adopted on [date]"
2. If ANY footnote mentions these terms, set has10b51Plan: true
3. If text explicitly states "NOT pursuant to 10b5-1", set has10b51Plan: false
4. Extract the plan adoption date if mentioned
`
```

**Checkpoint 2.2.2**: Prompt guidance test passes:
```bash
npm run test -- --testPathPattern="10b51-extraction" --testNamePattern="instructions"
```

#### 2.2.3 Update Signal Strength to Use JSON Field
**File**: `lib/email/form4-data-extractor.ts`
**Function**: `determineSignalStrength`

```typescript
export function determineSignalStrength(text: string, summaryJSON?: Record<string, unknown>): string {
  const textLower = text.toLowerCase();

  // Check structured JSON field first (most reliable)
  if (summaryJSON?.has10b51Plan === true) {
    return 'Weak - 10b5-1 Plan';
  }

  // Existing text-based detection
  const has10b51Mention = textLower.includes('10b5-1') ||
                          textLower.includes('10b-5') ||
                          textLower.includes('rule 10b') ||
                          textLower.includes('trading plan') ||
                          textLower.includes('pre-arranged');

  const negated10b51 = textLower.includes('no 10b5-1') ||
                       textLower.includes('no rule 10b') ||
                       textLower.includes('not pursuant') ||
                       textLower.includes('unchecked');

  if (has10b51Mention && !negated10b51) {
    return 'Weak - 10b5-1 Plan';
  }

  // ... rest of signal determination
}
```

**Checkpoint 2.2.3**: All Phase 2 tests pass:
```bash
npm run test -- --testPathPattern="10b51-extraction"
# Expected: 5 passing
```

### Step 2.3: 🔵 Refactor

- [ ] Extract 10b5-1 patterns to constants
- [ ] Add unit test for each pattern individually
- [ ] Document the detection hierarchy (JSON > text > default)

**Checkpoint 2.3**: All tests pass:
```bash
npm run test -- --testPathPattern="10b51-extraction"
npm run lint
```

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass
- [ ] Build succeeds: `npm run build`
- [ ] Existing Form 4 tests pass: `npm run test -- --testPathPattern="form4"`

#### Manual Verification:
- [ ] Generate summary for a filing WITH 10b5-1 footnote
- [ ] Generate summary for a filing WITHOUT 10b5-1
- [ ] Verify signal strength displays correctly in email

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: Add Historical Context to Summaries

### Overview
Retrieve the 3 most recent summaries for the same ticker and include them as context in AI prompts.

### Step 3.1: 🔴 Write Failing Tests

**Test File**: `__tests__/ai/historical-context.test.ts`

```typescript
import { getHistoricalSummaries, buildContextEnrichedPrompt } from '@/lib/ai/historical-context';

describe('Historical Context for Summaries', () => {
  describe('getHistoricalSummaries', () => {
    it('should retrieve last 3 summaries for ticker', async () => {
      // Uses test database with seed data
      const summaries = await getHistoricalSummaries('GOOG', '2026-01-12');
      expect(summaries.length).toBeLessThanOrEqual(3);
      expect(summaries.every(s => s.ticker.symbol === 'GOOG')).toBe(true);
    });

    it('should exclude the current filing date', async () => {
      const summaries = await getHistoricalSummaries('GOOG', '2026-01-12');
      expect(summaries.every(s => s.filingDate < new Date('2026-01-12'))).toBe(true);
    });

    it('should order by filing date descending', async () => {
      const summaries = await getHistoricalSummaries('GOOG', '2026-01-12');
      if (summaries.length > 1) {
        expect(summaries[0].filingDate >= summaries[1].filingDate).toBe(true);
      }
    });

    it('should return empty array for new ticker', async () => {
      const summaries = await getHistoricalSummaries('NEWCO', '2026-01-12');
      expect(summaries).toHaveLength(0);
    });
  });

  describe('buildContextEnrichedPrompt', () => {
    it('should include historical context section when summaries exist', () => {
      const historicalSummaries = [
        { filingType: '4', filingDate: new Date('2026-01-05'), summaryText: 'CEO sold 10K shares...' },
        { filingType: '4', filingDate: new Date('2025-12-15'), summaryText: 'CFO exercised options...' },
      ];

      const enrichedPrompt = buildContextEnrichedPrompt('Current filing content', historicalSummaries);

      expect(enrichedPrompt).toContain('## Historical Context');
      expect(enrichedPrompt).toContain('CEO sold 10K shares');
      expect(enrichedPrompt).toContain('CFO exercised options');
    });

    it('should not include historical section when no prior summaries', () => {
      const enrichedPrompt = buildContextEnrichedPrompt('Current filing content', []);
      expect(enrichedPrompt).not.toContain('## Historical Context');
    });

    it('should truncate long historical summaries', () => {
      const longSummary = 'A'.repeat(5000);
      const historicalSummaries = [
        { filingType: '4', filingDate: new Date('2026-01-05'), summaryText: longSummary },
      ];

      const enrichedPrompt = buildContextEnrichedPrompt('Current content', historicalSummaries);
      expect(enrichedPrompt.length).toBeLessThan(longSummary.length + 1000);
    });
  });
});
```

**Checkpoint 3.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="historical-context"
# Expected: 7 failing tests (module not found)
```

### Step 3.2: 🟢 Implement to Pass Tests

#### 3.2.1 Create Historical Context Service
**File**: `lib/ai/historical-context.ts` (NEW)

```typescript
import { getPrismaClient } from '@/lib/db/prisma';

interface HistoricalSummary {
  id: string;
  filingType: string;
  filingDate: Date;
  summaryText: string;
  ticker: {
    symbol: string;
  };
}

const MAX_HISTORICAL_SUMMARIES = 3;
const MAX_SUMMARY_LENGTH = 1500; // Tokens roughly

export async function getHistoricalSummaries(
  tickerSymbol: string,
  currentFilingDate: string
): Promise<HistoricalSummary[]> {
  const prisma = getPrismaClient();

  const summaries = await prisma.summary.findMany({
    where: {
      ticker: {
        symbol: tickerSymbol,
      },
      filingDate: {
        lt: new Date(currentFilingDate),
      },
    },
    select: {
      id: true,
      filingType: true,
      filingDate: true,
      summaryText: true,
      ticker: {
        select: {
          symbol: true,
        },
      },
    },
    orderBy: {
      filingDate: 'desc',
    },
    take: MAX_HISTORICAL_SUMMARIES,
  });

  return summaries;
}

export function buildContextEnrichedPrompt(
  currentContent: string,
  historicalSummaries: HistoricalSummary[]
): string {
  if (historicalSummaries.length === 0) {
    return currentContent;
  }

  const contextSection = historicalSummaries.map((s, i) => {
    const truncatedText = s.summaryText.length > MAX_SUMMARY_LENGTH
      ? s.summaryText.substring(0, MAX_SUMMARY_LENGTH) + '...'
      : s.summaryText;

    return `### Previous ${s.filingType} (${s.filingDate.toISOString().split('T')[0]})
${truncatedText}`;
  }).join('\n\n');

  return `## Historical Context
The following are the most recent filings for this company:

${contextSection}

---

## Current Filing
${currentContent}`;
}
```

**Checkpoint 3.2.1**: Service tests pass:
```bash
npm run test -- --testPathPattern="historical-context" --testNamePattern="getHistoricalSummaries"
```

#### 3.2.2 Integrate into Summarization Pipeline
**File**: `lib/ai/summarize.ts`
**Function**: Around line 713-754 where prompt is generated

```typescript
import { getHistoricalSummaries, buildContextEnrichedPrompt } from './historical-context';

// In the summarization function, before generating prompt:
async function generateSummaryWithContext(
  content: string,
  context: SummarizationContext
): Promise<SummaryResult> {
  // Fetch historical context
  let enrichedContent = content;

  if (context.ticker) {
    const historicalSummaries = await getHistoricalSummaries(
      context.ticker,
      context.filingDate || new Date().toISOString()
    );

    if (historicalSummaries.length > 0) {
      enrichedContent = buildContextEnrichedPrompt(content, historicalSummaries);
    }
  }

  // Generate prompt with enriched content
  const { systemPrompt, userPrompt } = generateUnifiedPrompt({
    formType: context.filingType,
    company: context.companyName || 'Unknown Company',
    ticker: context.ticker || 'Unknown',
    filingDate: context.filingDate || new Date().toISOString().split('T')[0],
    filingContent: enrichedContent
  });

  // ... rest of summarization
}
```

**Checkpoint 3.2.2**: Integration test passes:
```bash
npm run test -- --testPathPattern="historical-context"
# Expected: 7 passing
```

### Step 3.3: 🔵 Refactor

- [ ] Add caching for repeated ticker lookups
- [ ] Add metrics for historical context usage
- [ ] Document token budget implications

**Checkpoint 3.3**: All tests pass:
```bash
npm run test -- --testPathPattern="historical-context"
npm run build
```

### Step 3.4: Final Phase Verification

#### Automated Verification:
- [ ] All historical context tests pass
- [ ] Build succeeds
- [ ] E2E test passes: `npm run test:e2e`
- [ ] No regressions: `npm run test`

#### Manual Verification:
- [ ] Generate summary for ticker with prior filings
- [ ] Verify AI mentions historical patterns if relevant
- [ ] Check token usage doesn't exceed limits

**STOP**: Await manual confirmation before Phase 4.

---

## Phase 4: Review Form-Specific Prompts via Grokipedia

### Overview
Research each SEC form type using xAI Grok (via Grokipedia) to identify key fields, investor-relevant data points, and extraction patterns that our current prompts may be missing.

### Supported Form Types
Current `FORM_EXTRACTION_GUIDANCE` covers:
- **10-K** - Annual report
- **10-Q** - Quarterly report
- **Form 4** - Insider transactions
- **8-K** - Current report (material events)
- **Form 144** - Notice of proposed sale
- **S-1** - IPO registration
- **S-3** - Secondary offering
- **DEF 14A** - Proxy statement
- **11-K** - Employee benefit plan

### Step 4.1: Research Phase (Grokipedia)

For each form type, use xAI Grok to research:
1. **Official SEC requirements** - What fields are mandated
2. **Investor-relevant data points** - What shareholders actually care about
3. **Common extraction pitfalls** - Where AI summaries typically miss information
4. **Industry best practices** - How financial analysts interpret these filings

**Research Prompts Template**:
```
Using Grokipedia, research SEC Form [TYPE]:
1. What are the required fields per SEC regulations?
2. What data points are most investor-relevant?
3. What are common mistakes when summarizing this form type?
4. What context helps interpret this filing correctly?
```

**Checkpoint 4.1**: Create research document at `thoughts/shared/research/2026-01-XX-grokipedia-form-research.md`

### Step 4.2: Gap Analysis

Compare Grokipedia findings against current `FORM_EXTRACTION_GUIDANCE`:

| Form | Current Coverage | Grokipedia Findings | Gap |
|------|-----------------|---------------------|-----|
| 10-K | 14 rules | TBD | TBD |
| 10-Q | 12 rules | TBD | TBD |
| 4 | 6 rules | TBD | TBD |
| 8-K | 6 rules | TBD | TBD |
| 144 | 10 rules | TBD | TBD |
| S-1 | 13 rules | TBD | TBD |
| S-3 | 8 rules | TBD | TBD |
| DEF 14A | 9 rules | TBD | TBD |
| 11-K | 10 rules | TBD | TBD |

**Checkpoint 4.2**: Gap analysis complete with prioritized improvements

### Step 4.3: Update Extraction Guidance

**File**: `lib/ai/prompts/unified-prompts.ts`
**Section**: `FORM_EXTRACTION_GUIDANCE`

For each form type with identified gaps:
1. Add missing extraction rules
2. Clarify ambiguous instructions
3. Add examples for complex fields
4. Update schema if new fields needed

**Priority Order**:
1. Form 4 (most frequent, user feedback received)
2. 8-K (second most frequent)
3. 10-K/10-Q (quarterly cycles)
4. Others (as needed)

**Checkpoint 4.3**: Updated prompts committed

### Step 4.4: Validation Testing

For each updated form type:
1. Select 3 recent filings from database
2. Regenerate summaries with updated prompts
3. Compare quality against original summaries
4. Document improvements or regressions

**Test Script**: `scripts/validate-prompt-improvements.ts`

```typescript
// For each form type:
// 1. Fetch recent filings
// 2. Generate summary with OLD prompt
// 3. Generate summary with NEW prompt
// 4. Output side-by-side comparison
```

**Checkpoint 4.4**: Validation complete, no regressions

### Step 4.5: Final Phase Verification

#### Automated Verification:
- [ ] All existing tests pass: `npm run test`
- [ ] Build succeeds: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Review updated extraction guidance for each form
- [ ] Spot-check 2-3 summaries per form type
- [ ] Document any remaining gaps for future work

**STOP**: Phase 4 complete.

---

## Testing Strategy

### TDD Test Design Principles

1. **One Assertion Per Test** (when practical)
2. **Descriptive Test Names**: "should [verb] when [condition]"
3. **Arrange-Act-Assert** structure
4. **Edge Cases First** before happy path

### Test Categories

| Category | Phase 1 | Phase 2 | Phase 3 | Phase 4 |
|----------|---------|---------|---------|---------|
| Unit Tests | 8 | 5 | 7 | 0 |
| Integration | 0 | 0 | 1 | 0 |
| Comparison | 0 | 0 | 0 | 27 (3 per form × 9 forms) |
| E2E | Manual | Manual | 1 | Manual |

### Manual Testing Steps

1. **Form 4 Shares**:
   - Find filing with known $X value, Y shares
   - Generate summary via test script
   - Verify display shows both correctly

2. **10b5-1 Detection**:
   - Use GOOG filings (many have 10b5-1 plans)
   - Verify signal shows "Weak - 10b5-1 Plan" for plan filings
   - Verify no false positives for non-plan filings

3. **Historical Context**:
   - Generate summary for ticker with 5+ prior summaries
   - Check if AI references patterns from history

4. **Grokipedia Prompt Review**:
   - Run validation script for each form type
   - Review side-by-side comparisons
   - Document quality improvements

## Performance Considerations

- Historical context adds ~1-2 database queries per summary
- Context truncation limits token increase to ~5K tokens
- Expected latency impact: <100ms

## Migration Notes

No database schema changes required. All changes are code-only.

## References

- Research document: [thoughts/shared/research/2026-01-10-summary-quality-feedback-analysis.md](thoughts/shared/research/2026-01-10-summary-quality-feedback-analysis.md)
- Phase 1 implementation: [docs/plans/2026-01-10-email-summary-design-quality-enrichment.md](docs/plans/2026-01-10-email-summary-design-quality-enrichment.md)
- Form 4 extractor: [lib/email/form4-data-extractor.ts](lib/email/form4-data-extractor.ts)
- AI prompts: [lib/ai/prompts/unified-prompts.ts](lib/ai/prompts/unified-prompts.ts)
