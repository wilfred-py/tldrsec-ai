# Summary Generation Quality Improvement Implementation Plan

**Date**: 2026-01-07 20:15:30 AEDT
**Git Commit**: 4f42898633faac7cc1cbb61d53886a93cef487d2
**Branch**: review-generated-summaries
**Repository**: review-generated-summaries

## Overview

This plan addresses systematic quality issues in SEC filing summary generation by achieving **schema alignment** between AI prompts and email templates, adding **comprehensive data extractors** for all filing types, and expanding coverage to **Reddit-mentioned filing types** (S-1, S-3, DEF 14A, Form 11-K). The goal is consistent, high-quality investor summaries regardless of AI output variability.

## Current State Analysis

### Architecture Layers

| Layer | Location | Purpose |
|-------|----------|---------|
| AI Prompts | `lib/ai/prompts/unified-prompts.ts` | Generate structured JSON from SEC content |
| Data Extractors | `lib/email/*-data-extractor.ts` | Parse summaryText when summaryData sparse |
| Email Templates | `components/ui/email/templates/` | Render HTML emails from structured data |

### Critical Issues Identified

1. **Schema Misalignment**: Prompt schemas don't match template expectations
   - Prompts generate `keyHighlights[]` (strings)
   - Templates expect `financialHighlights[]` (objects with label/value/change)

2. **Missing Extractors**: Only 3 of 9 form types have extractors
   - Have extractors: 8-K, Form 4, Form 144
   - Missing: 10-K, 10-Q, SC 13G, SC 13D, 424B2, DEF 14A

3. **Reddit Filing Types**: Missing dedicated support
   - Form S-1, Form S-3, DEF 14A, Form 11-K

4. **Legacy Code**: Unused class-based prompt system cluttering codebase

5. **Architectural Inefficiency**: Extractors run at render time, not generation time

## Desired End State

After this plan is complete:

1. **All 13 filing types** have aligned prompt schemas, data extractors, and templates
2. **Extractors run at AI generation time** (in `lib/ai/summarize.ts`), validating and enriching output before database storage
3. **Schema field names match exactly** between prompts and templates
4. **Legacy prompt classes removed** - single unified prompt system
5. **Zero fallback to plain summaryText** for supported filing types - all structured data available

### Verification Criteria

**Automated**:
```bash
npm run test:prompts           # All prompt schema tests pass
npm run test:extractors        # All extractor tests pass
npm run test:templates         # All template rendering tests pass
npm run test:e2e               # End-to-end email generation works
npm run lint                   # No linting errors
npm run build                  # Production build succeeds
```

**Manual**:
- Generate summaries for each of 13 filing types
- Verify email renders all structured fields (no empty sections)
- Compare email quality before/after for 5 sample filings per type

## What We're NOT Doing

- Changing the email template visual design
- Modifying the Resend email delivery infrastructure
- Altering the cron job scheduling or processing pipeline
- Changing authentication or user management
- Modifying the SEC filing fetch/parse layer
- Creating new database migrations (using existing `summaryJSON` field)

## Implementation Approach

Following Elon's 5-Step Engineering Algorithm:

1. **Question requirements**: Do we need all 13 filing types? → Yes, users track diverse companies
2. **Delete unnecessary parts**: Remove legacy class-based prompts entirely
3. **Simplify**: Single unified prompt system + extractors at generation time
4. **Accelerate**: TDD with small incremental phases
5. **Automate**: Extractors automatically validate AI output

---

## Phase 1: Schema Alignment Foundation

### Overview
Fix field name mismatches between prompts and templates. Establish test infrastructure.

### Step 1.1: 🔴 Write Failing Tests for Schema Alignment

**Test File**: `__tests__/ai/prompts/schema-alignment.test.ts`

```typescript
import { FORM_SCHEMAS } from '@/lib/ai/prompts/unified-prompts';

describe('Schema Alignment', () => {
  describe('10-K Schema', () => {
    it('should have financialHighlights array with label/value/change objects', () => {
      const schema = FORM_SCHEMAS['10-K'];
      expect(schema.properties.financialHighlights).toBeDefined();
      expect(schema.properties.financialHighlights.type).toBe('array');
      expect(schema.properties.financialHighlights.items.properties.label).toBeDefined();
      expect(schema.properties.financialHighlights.items.properties.value).toBeDefined();
      expect(schema.properties.financialHighlights.items.properties.change).toBeDefined();
    });

    it('should have segments array with name/revenue/growth objects', () => {
      const schema = FORM_SCHEMAS['10-K'];
      expect(schema.properties.segments).toBeDefined();
      expect(schema.properties.segments.items.properties.name).toBeDefined();
      expect(schema.properties.segments.items.properties.revenue).toBeDefined();
      expect(schema.properties.segments.items.properties.growth).toBeDefined();
    });

    it('should have riskFactors array (not risks)', () => {
      const schema = FORM_SCHEMAS['10-K'];
      expect(schema.properties.riskFactors).toBeDefined();
      expect(schema.properties.risks).toBeUndefined();
    });
  });

  describe('10-Q Schema', () => {
    it('should have financialHighlights with qoqChange support', () => {
      const schema = FORM_SCHEMAS['10-Q'];
      expect(schema.properties.financialHighlights.items.properties.qoqChange).toBeDefined();
    });

    it('should have quarterlyTrends array', () => {
      const schema = FORM_SCHEMAS['10-Q'];
      expect(schema.properties.quarterlyTrends).toBeDefined();
    });

    it('should have guidanceUpdates array', () => {
      const schema = FORM_SCHEMAS['10-Q'];
      expect(schema.properties.guidanceUpdates).toBeDefined();
    });
  });

  describe('Form 4 Schema', () => {
    it('should use filerRole (not relationship) to match Form 144', () => {
      const schema = FORM_SCHEMAS['4'];
      expect(schema.properties.filerRole).toBeDefined();
    });
  });

  describe('All Schemas', () => {
    const formTypes = ['10-K', '10-Q', '8-K', '4', '144', 'SC 13G', 'SC 13D', '424B2'];

    formTypes.forEach(formType => {
      it(`${formType} should have company field (required)`, () => {
        const schema = FORM_SCHEMAS[formType];
        expect(schema.required).toContain('company');
      });

      it(`${formType} should have summary field (required)`, () => {
        const schema = FORM_SCHEMAS[formType];
        expect(schema.required).toContain('summary');
      });
    });
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="schema-alignment"
# Expected: Multiple failing tests (field names don't exist yet)
```

### Step 1.2: 🟢 Update Unified Prompts Schema

#### 1.2.1 Update 10-K Schema
**File**: `lib/ai/prompts/unified-prompts.ts`
**Changes**: Replace `keyHighlights` with `financialHighlights` object array, rename `risks` to `riskFactors`, add `segments` array

```typescript
// Lines ~96-128: Replace 10-K schema
'10-K': {
  type: 'object',
  required: ['company', 'summary', 'fiscalYear', 'financialHighlights'],
  properties: {
    ...BASE_SCHEMA_PROPERTIES,
    fiscalYear: {
      type: 'string',
      description: 'Fiscal year (e.g., "2024")'
    },
    financialHighlights: {
      type: 'array',
      maxItems: 6,
      description: 'Key financial metrics with YoY changes',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'Metric name (e.g., "Revenue", "Net Income")', maxLength: 50 },
          value: { type: 'string', description: 'Value with units (e.g., "$50.5B")', maxLength: 30 },
          change: { type: 'string', description: 'YoY change (e.g., "+15%", "-3%")', maxLength: 20 }
        },
        required: ['label', 'value']
      }
    },
    segments: {
      type: 'array',
      maxItems: 5,
      description: 'Business segment performance',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Segment name', maxLength: 50 },
          revenue: { type: 'string', description: 'Segment revenue', maxLength: 30 },
          growth: { type: 'string', description: 'Growth rate', maxLength: 20 }
        },
        required: ['name', 'revenue']
      }
    },
    riskFactors: {
      type: 'array',
      maxItems: 3,
      description: 'Top 3 material risks with quantified impact',
      items: { type: 'string', maxLength: 200 }
    },
    keyPoints: {
      type: 'array',
      maxItems: 5,
      description: 'Additional key takeaways (fallback if financialHighlights sparse)',
      items: { type: 'string', maxLength: 200 }
    }
  }
}
```

**Checkpoint 1.2.1**: 10-K schema tests pass:
```bash
npm run test -- --testPathPattern="schema-alignment" --testNamePattern="10-K"
# Expected: 3 passing
```

#### 1.2.2 Update 10-Q Schema
**File**: `lib/ai/prompts/unified-prompts.ts`
**Changes**: Add `financialHighlights` with `qoqChange`, `quarterlyTrends`, `guidanceUpdates`

**Checkpoint 1.2.2**: 10-Q schema tests pass:
```bash
npm run test -- --testPathPattern="schema-alignment" --testNamePattern="10-Q"
# Expected: 3 passing
```

#### 1.2.3 Update Form 4 Schema
**File**: `lib/ai/prompts/unified-prompts.ts`
**Changes**: Rename `relationship` to `filerRole` for consistency with Form 144

**Checkpoint 1.2.3**: Form 4 schema tests pass:
```bash
npm run test -- --testPathPattern="schema-alignment" --testNamePattern="Form 4"
# Expected: 1 passing
```

### Step 1.3: 🔵 Refactor

- [x] Ensure all schemas use consistent field naming convention
- [x] Add JSDoc comments to schema definitions
- [x] Extract common sub-schemas (e.g., `FINANCIAL_HIGHLIGHT_ITEM`) to reduce duplication

**Checkpoint 1.3**: All schema tests pass:
```bash
npm run test -- --testPathPattern="schema-alignment"
# Expected: All passing
```

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [x] Schema alignment tests pass: `npm run test -- --testPathPattern="schema-alignment"` (28 tests passing)
- [x] Existing prompt tests pass: `npm run test -- --testPathPattern="prompts"` (89 tests passing)
- [x] Type checking passes: `npm run build`
- [x] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Generate a 10-K summary and inspect JSON structure
- [ ] Generate a 10-Q summary and inspect JSON structure
- [ ] Verify no regressions in existing 8-K/Form 4/Form 144 summaries

**STOP**: Await manual confirmation before Phase 2.

---

## Phase 2: 10-K/10-Q Data Extractors

### Overview
Create data extractors for 10-K and 10-Q filings. These extractors run at AI generation time to validate and enrich AI output.

### Step 2.1: 🔴 Write Failing Tests for 10-K Extractor

**Test File**: `__tests__/email/extractors/10k-data-extractor.test.ts`

```typescript
import { extract10KData, Form10KExtractedData } from '@/lib/email/10k-data-extractor';

describe('extract10KData', () => {
  const sampleSummaryText = `
    **Revenue**: $50.5B (+15% YoY)
    **Net Income**: $12.3B (+8% YoY)
    **Operating Margin**: 24.3% (-2 points)

    ## Key Highlights
    - Cloud services grew 28% to $25B, now 50% of total revenue
    - International expansion drove 20% of growth
    - R&D investment increased to $8B

    ## Business Segments
    - Cloud Services: $25B (+28%)
    - Enterprise Software: $15B (+5%)
    - Consumer Products: $10.5B (-3%)

    ## Risk Factors
    - Supply chain disruptions could impact margins by 3-5%
    - Currency headwinds expected to reduce international revenue
    - Regulatory scrutiny in EU markets
  `;

  it('should extract financialHighlights with label, value, and change', () => {
    const result = extract10KData(sampleSummaryText);
    expect(result.financialHighlights).toHaveLength(3);
    expect(result.financialHighlights[0]).toEqual({
      label: 'Revenue',
      value: '$50.5B',
      change: '+15%'
    });
  });

  it('should extract segments with name, revenue, and growth', () => {
    const result = extract10KData(sampleSummaryText);
    expect(result.segments).toHaveLength(3);
    expect(result.segments[0]).toEqual({
      name: 'Cloud Services',
      revenue: '$25B',
      growth: '+28%'
    });
  });

  it('should extract riskFactors as string array', () => {
    const result = extract10KData(sampleSummaryText);
    expect(result.riskFactors.length).toBeGreaterThanOrEqual(2);
    expect(result.riskFactors[0]).toContain('Supply chain');
  });

  it('should extract keyPoints from Key Highlights section', () => {
    const result = extract10KData(sampleSummaryText);
    expect(result.keyPoints.length).toBeGreaterThanOrEqual(2);
    expect(result.keyPoints[0]).toContain('Cloud services');
  });

  it('should handle empty input gracefully', () => {
    const result = extract10KData('');
    expect(result.financialHighlights).toEqual([]);
    expect(result.segments).toEqual([]);
    expect(result.riskFactors).toEqual([]);
  });

  it('should handle malformed input without crashing', () => {
    const result = extract10KData('Random text without any structure');
    expect(result).toBeDefined();
    expect(result.financialHighlights).toEqual([]);
  });
});
```

**Checkpoint 2.1**: Tests FAIL (module doesn't exist):
```bash
npm run test -- --testPathPattern="10k-data-extractor"
# Expected: Cannot find module error
```

### Step 2.2: 🟢 Implement 10-K Data Extractor

#### 2.2.1 Create Type Definitions
**File**: `lib/email/10k-data-extractor.ts`

```typescript
export interface FinancialHighlight {
  label: string;
  value: string;
  change?: string;
}

export interface BusinessSegment {
  name: string;
  revenue: string;
  growth?: string;
}

export interface Form10KExtractedData {
  financialHighlights: FinancialHighlight[];
  segments: BusinessSegment[];
  riskFactors: string[];
  keyPoints: string[];
  fiscalYear?: string;
}

export function extract10KData(summaryText: string): Form10KExtractedData {
  // Implementation to follow
}
```

**Checkpoint 2.2.1**: Tests fail with better error (function exists but returns wrong data):
```bash
npm run test -- --testPathPattern="10k-data-extractor"
# Expected: Assertion errors (not module errors)
```

#### 2.2.2 Implement Financial Highlights Extraction

Pattern to match: `**Revenue**: $50.5B (+15% YoY)` or `Revenue: $50.5B (+15%)`

```typescript
function extractFinancialHighlights(text: string): FinancialHighlight[] {
  const highlights: FinancialHighlight[] = [];

  // Pattern: **Label**: $Value (±X% YoY) or Label: $Value (±X%)
  const patterns = [
    /\*\*([^*]+)\*\*:\s*(\$[\d,.]+[KMB]?)\s*\(([+-]?[\d.]+%[^)]*)\)/gi,
    /^([A-Za-z\s]+):\s*(\$[\d,.]+[KMB]?)\s*\(([+-]?[\d.]+%[^)]*)\)/gim,
    /\|?\s*([A-Za-z\s]+)\s*\|\s*(\$[\d,.]+[KMB]?)\s*\|\s*([+-]?[\d.]+%)/gi
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const label = match[1].trim();
      const value = match[2].trim();
      const change = match[3].replace(/\s*YoY\s*/i, '').trim();

      // Deduplicate by label
      if (!highlights.find(h => h.label.toLowerCase() === label.toLowerCase())) {
        highlights.push({ label, value, change });
      }
    }
  }

  return highlights.slice(0, 6);
}
```

**Checkpoint 2.2.2**: Financial highlights test passes:
```bash
npm run test -- --testPathPattern="10k-data-extractor" --testNamePattern="financialHighlights"
# Expected: 1 passing
```

#### 2.2.3 Implement Segments Extraction

Pattern to match: `- Cloud Services: $25B (+28%)` or table format

**Checkpoint 2.2.3**: Segments test passes

#### 2.2.4 Implement Risk Factors Extraction

Pattern to match: Bullet points under "Risk" section headers

**Checkpoint 2.2.4**: Risk factors test passes

#### 2.2.5 Implement Key Points Extraction

Pattern to match: Bullet points under "Highlights" or "Key" section headers

**Checkpoint 2.2.5**: Key points test passes

### Step 2.3: 🔴 Write Failing Tests for 10-Q Extractor

**Test File**: `__tests__/email/extractors/10q-data-extractor.test.ts`

Similar structure to 10-K but with:
- `qoqChange` in financial highlights
- `quarterlyTrends` array
- `guidanceUpdates` array

**Checkpoint 2.3**: Tests FAIL (module doesn't exist)

### Step 2.4: 🟢 Implement 10-Q Data Extractor

**File**: `lib/email/10q-data-extractor.ts`

Follow same pattern as 10-K extractor with quarterly-specific logic.

**Checkpoint 2.4**: All 10-Q tests pass

### Step 2.5: 🔵 Refactor

- [x] Extract common patterns to `lib/email/extractor-utils.ts`
- [x] Share regex patterns between extractors
- [x] Add comprehensive JSDoc documentation

**Checkpoint 2.5**: All extractor tests still pass

### Step 2.6: Final Phase Verification

#### Automated Verification:
- [x] 10-K extractor tests pass: `npm run test -- --testPathPattern="10k-data-extractor"` (26 tests passing)
- [x] 10-Q extractor tests pass: `npm run test -- --testPathPattern="10q-data-extractor"` (27 tests passing)
- [x] Type checking passes: `npm run build`
- [x] No regressions: `npm run test -- --testPathPattern="prompts"` (89 tests passing)

#### Manual Verification: ✅ Completed 2026-01-08
- [x] Test 10-K extractor with 3 real TSLA/NVDA/AAPL 10-K summaries
  - COIN: Revenue $6.3B (+115%), Net Income $2.6B
  - VRT: Revenue $8.0B (+17%), Net Income $496M
  - NVDA: Revenue $130.5B (+114%), Net Income $72.9B, Gross Margin 75.0%, FY 2025
- [x] Test 10-Q extractor with 3 real quarterly report summaries
  - TSLA: Revenue $28.1B (+12% YoY), Gross Margin 18%, Cash Flow $10.9B
- [x] Verify extracted data matches AI-generated structure
  - Added **prose format** extraction to handle narrative summaryText
  - summaryJSON contains structured objects; extractors parse text as fallback

**Key Finding**: Real summaries use prose format (not markdown). Added prose extraction to both extractors.

**Phase 2 Complete**: Ready for Phase 3.

---

## Phase 3: Extractor Integration at Generation Time

### Overview
Integrate extractors into the AI summary generation pipeline. Extractors validate AI output and fill gaps before database storage.

### Step 3.1: 🔴 Write Failing Tests for Integration

**Test File**: `__tests__/ai/summarize-with-extraction.test.ts`

```typescript
import { summarizeFilingWithValidation } from '@/lib/ai/summarize';

describe('summarizeFilingWithValidation', () => {
  it('should call appropriate extractor based on filing type', async () => {
    const mockExtractor = jest.fn().mockReturnValue({ financialHighlights: [] });

    // Test that 10-K calls 10-K extractor
    await summarizeFilingWithValidation(content, { formType: '10-K' });
    expect(mockExtractor).toHaveBeenCalled();
  });

  it('should merge AI output with extractor output', async () => {
    const result = await summarizeFilingWithValidation(content, { formType: '10-K' });

    // AI might return partial data, extractor should fill gaps
    expect(result.summaryJSON.financialHighlights).toBeDefined();
  });

  it('should prefer AI-generated data over extracted data', async () => {
    // When AI provides a field, don't overwrite with extractor
  });

  it('should log discrepancies between AI and extractor', async () => {
    // For monitoring AI quality over time
  });
});
```

**Checkpoint 3.1**: Tests FAIL (function doesn't exist)

### Step 3.2: 🟢 Implement Validated Summary Generation

#### 3.2.1 Create Extractor Registry
**File**: `lib/email/extractor-registry.ts`

```typescript
import { extract8KData } from './8k-data-extractor';
import { extractForm4Data } from './form4-data-extractor';
import { extractForm144Data } from './form144-data-extractor';
import { extract10KData } from './10k-data-extractor';
import { extract10QData } from './10q-data-extractor';

export const EXTRACTOR_REGISTRY: Record<string, (text: string) => unknown> = {
  '10-K': extract10KData,
  '10-Q': extract10QData,
  '8-K': extract8KData,
  '4': extractForm4Data,
  'Form 4': extractForm4Data,
  '144': extractForm144Data,
  'Form 144': extractForm144Data,
};

export function getExtractor(formType: string) {
  return EXTRACTOR_REGISTRY[formType] || null;
}
```

**Checkpoint 3.2.1**: Registry exports correctly

#### 3.2.2 Update summarize.ts
**File**: `lib/ai/summarize.ts`
**Changes**: Add validation step after AI response

```typescript
export async function summarizeFilingWithValidation(
  content: string,
  options: SummarizeOptions
): Promise<SummaryResult> {
  // Step 1: Generate AI summary (existing logic)
  const aiResult = await summarizeFiling(content, options);

  // Step 2: Get appropriate extractor
  const extractor = getExtractor(options.formType);
  if (!extractor || !aiResult.summaryText) {
    return aiResult;
  }

  // Step 3: Extract structured data from summaryText
  const extractedData = extractor(aiResult.summaryText);

  // Step 4: Merge AI data with extracted data (AI wins conflicts)
  const mergedData = mergeWithFallback(aiResult.summaryJSON, extractedData);

  // Step 5: Log discrepancies for monitoring
  logDataDiscrepancies(options.formType, aiResult.summaryJSON, extractedData);

  return {
    ...aiResult,
    summaryJSON: mergedData
  };
}
```

**Checkpoint 3.2.2**: Integration tests pass

### Step 3.3: 🔵 Refactor

- [x] Add comprehensive logging for AI vs extractor comparison
- [x] Create metrics for extractor fill-rate (how often extractors fill gaps)
- [x] Ensure backward compatibility with existing code paths

### Step 3.4: Final Phase Verification

#### Automated Verification:
- [x] Integration tests pass: `npm run test -- --testPathPattern="summarize-with-extraction"` (27 tests passing)
- [ ] E2E pipeline works: `npm run test:e2e`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Generate summaries for 5 different 10-K filings
- [ ] Verify emails render all structured sections
- [ ] Check logs for any extractor discrepancies

**Phase 3 Implementation Complete** (2026-01-08):
- Created `lib/email/extractor-registry.ts` with 5 extractors + aliases
- Created `lib/email/extractor-merge-utils.ts` with merge and logging utilities
- Created `lib/ai/summarize-with-validation.ts` with optional validation wrapper
- 27 new tests covering registry, merge logic, and extractor integration
- Total tests: 173 passing (prompts + extractors + integration)

**STOP**: Await manual confirmation before Phase 4.

---

## Phase 4: Reddit Filing Types Coverage

### Overview
Add dedicated prompt schemas, templates, and extractors for S-1, S-3, DEF 14A, and Form 11-K.

### Step 4.1: 🔴 Write Failing Tests for New Filing Types

**Test File**: `__tests__/ai/prompts/reddit-filing-schemas.test.ts`

```typescript
describe('Reddit Filing Type Schemas', () => {
  describe('Form S-1 (IPO)', () => {
    it('should have dedicated schema with IPO-specific fields', () => {
      const schema = FORM_SCHEMAS['S-1'];
      expect(schema).toBeDefined();
      expect(schema.properties.offeringSize).toBeDefined();
      expect(schema.properties.useOfProceeds).toBeDefined();
      expect(schema.properties.riskFactors).toBeDefined();
      expect(schema.properties.businessDescription).toBeDefined();
    });
  });

  describe('Form S-3 (Secondary Offering)', () => {
    it('should have dedicated schema with offering-specific fields', () => {
      const schema = FORM_SCHEMAS['S-3'];
      expect(schema).toBeDefined();
      expect(schema.properties.offeringType).toBeDefined();
      expect(schema.properties.sharesOffered).toBeDefined();
      expect(schema.properties.dilutionImpact).toBeDefined();
    });
  });

  describe('DEF 14A (Proxy)', () => {
    it('should have dedicated schema with governance fields', () => {
      const schema = FORM_SCHEMAS['DEF 14A'];
      expect(schema).toBeDefined();
      expect(schema.properties.executiveCompensation).toBeDefined();
      expect(schema.properties.boardProposals).toBeDefined();
      expect(schema.properties.shareholderProposals).toBeDefined();
    });
  });

  describe('Form 11-K (Employee Stock Plan)', () => {
    it('should have dedicated schema with plan-specific fields', () => {
      const schema = FORM_SCHEMAS['11-K'];
      expect(schema).toBeDefined();
      expect(schema.properties.planAssets).toBeDefined();
      expect(schema.properties.participantCount).toBeDefined();
    });
  });
});
```

**Checkpoint 4.1**: Tests FAIL (schemas don't exist)

### Step 4.2: 🟢 Implement Form S-1 Schema

**File**: `lib/ai/prompts/unified-prompts.ts`
**Add**: S-1 schema with IPO-specific fields

```typescript
'S-1': {
  type: 'object',
  required: ['company', 'summary', 'offeringSize'],
  properties: {
    ...BASE_SCHEMA_PROPERTIES,
    offeringSize: {
      type: 'string',
      description: 'Total offering size with $ (e.g., "$500M")',
      maxLength: 30
    },
    priceRange: {
      type: 'string',
      description: 'Expected price range (e.g., "$18-$21 per share")',
      maxLength: 50
    },
    useOfProceeds: {
      type: 'array',
      maxItems: 4,
      description: 'How IPO proceeds will be used',
      items: { type: 'string', maxLength: 150 }
    },
    businessDescription: {
      type: 'string',
      description: 'One-line business description',
      maxLength: 200
    },
    financialHighlights: {
      type: 'array',
      maxItems: 4,
      description: 'Key pre-IPO financial metrics',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', maxLength: 50 },
          value: { type: 'string', maxLength: 30 }
        }
      }
    },
    riskFactors: {
      type: 'array',
      maxItems: 3,
      description: 'Top IPO risks',
      items: { type: 'string', maxLength: 200 }
    },
    underwriters: {
      type: 'array',
      maxItems: 3,
      description: 'Lead underwriters',
      items: { type: 'string', maxLength: 50 }
    }
  }
}
```

**Checkpoint 4.2**: S-1 schema tests pass

### Step 4.3: 🟢 Implement Form S-3 Schema

Similar structure for secondary offerings with dilution focus.

**Checkpoint 4.3**: S-3 schema tests pass

### Step 4.4: 🟢 Implement DEF 14A Schema

Focus on executive compensation, board proposals, and shareholder votes.

**Checkpoint 4.4**: DEF 14A schema tests pass

### Step 4.5: 🟢 Implement Form 11-K Schema

Employee stock plan specific fields.

**Checkpoint 4.5**: Form 11-K schema tests pass

### Step 4.6: Create Extractors for New Filing Types

**Files**:
- `lib/email/s1-data-extractor.ts`
- `lib/email/s3-data-extractor.ts`
- `lib/email/def14a-data-extractor.ts`
- `lib/email/form11k-data-extractor.ts`

Follow same TDD pattern as Phase 2.

### Step 4.7: Update Template Registry

**File**: `lib/email/template-registry.ts`
**Changes**: Add mappings for new filing types

### Step 4.8: 🔵 Refactor

- [x] Ensure consistent schema patterns across all filing types
- [x] Update extractor registry with new extractors
- [ ] Add new filing types to E2E test coverage

### Step 4.9: Final Phase Verification

#### Automated Verification:
- [x] All new schema tests pass: 43 tests for S-1, S-3, DEF 14A, 11-K schemas
- [x] All new extractor tests pass: 58 extractor tests (14 S-1, 12 S-3, 18 DEF 14A, 14 11-K)
- [x] Full test suite passes: 136 prompt tests, 101 total Phase 4 tests
- [x] Type checking passes: `npx tsc --noEmit` successful

#### Manual Verification:
- [ ] Generate S-1 summary for a real IPO filing
- [ ] Generate DEF 14A summary for a proxy statement
- [ ] Verify emails render correctly for all new types

**Phase 4 Implementation Complete** (2026-01-08):
- Created 4 new schemas in `lib/ai/prompts/unified-prompts.ts`:
  - **S-1**: offeringSize, priceRange, sharesOffered, useOfProceeds, businessDescription, financialHighlights, riskFactors, underwriters
  - **S-3**: offeringType, offeringAmount, sharesOffered, dilutionImpact, sellingShareholders, shelfRegistration, useOfProceeds, pricePerShare
  - **DEF 14A**: meetingDate, meetingType, recordDate, executiveCompensation, ceoPayRatio, boardProposals, shareholderProposals, directorNominees, sayOnPay
  - **11-K**: planName, planAssets, participantCount, contributionsReceived, benefitsDistributed, investmentOptions, planFiscalYear, companyStockHoldings

- Created 4 new extractors:
  - `lib/email/s1-data-extractor.ts` - IPO data extraction with markdown and prose support
  - `lib/email/s3-data-extractor.ts` - Secondary offering extraction with shelf registration
  - `lib/email/def14a-data-extractor.ts` - Proxy statement extraction with table parsing
  - `lib/email/form11k-data-extractor.ts` - Employee stock plan extraction

- Updated `lib/email/extractor-registry.ts` with new extractors and aliases

- Test files created:
  - `__tests__/ai/prompts/reddit-filing-schemas.test.ts` (43 tests)
  - `__tests__/email/extractors/s1-data-extractor.test.ts` (14 tests)
  - `__tests__/email/extractors/s3-data-extractor.test.ts` (12 tests)
  - `__tests__/email/extractors/def14a-data-extractor.test.ts` (18 tests)
  - `__tests__/email/extractors/form11k-data-extractor.test.ts` (14 tests)

**STOP**: Await manual confirmation before Phase 5.

---

## Phase 5: Missing Extractors for Existing Types

### Overview
Add extractors for SC 13G, SC 13D, and 424B2 which have prompts but no extractors.

### Step 5.1: 🔴 Write Failing Tests

**Test Files**:
- `__tests__/email/extractors/sc13g-data-extractor.test.ts`
- `__tests__/email/extractors/sc13d-data-extractor.test.ts`
- `__tests__/email/extractors/424b2-data-extractor.test.ts`

### Step 5.2: 🟢 Implement SC 13G Extractor

Focus on ownership percentage, filer name, shares owned.

### Step 5.3: 🟢 Implement SC 13D Extractor

Focus on activist intent, purpose statement, ownership changes.

### Step 5.4: 🟢 Implement 424B2 Extractor

Focus on offering terms, interest rates, maturity dates.

### Step 5.5: 🔵 Refactor and Update Registry

### Step 5.6: Final Phase Verification

**STOP**: Await manual confirmation before Phase 6.

---

## Phase 6: Legacy Cleanup

### Overview
Remove unused class-based prompt system to reduce codebase complexity.

### Step 6.1: 🔴 Write Tests to Ensure No Legacy Usage

**Test File**: `__tests__/ai/prompts/no-legacy-usage.test.ts`

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';

describe('Legacy Prompt System', () => {
  it('should not be imported anywhere except prompts directory', async () => {
    const files = await glob('**/*.{ts,tsx}', {
      ignore: ['node_modules/**', 'lib/ai/prompts/**', '__tests__/**']
    });

    const legacyImports = [
      'Form10KPrompt',
      'Form10QPrompt',
      'Form8KPrompt',
      'FormForm4Prompt',
      'GenericFilingPrompt',
      'PromptTemplate'
    ];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const legacy of legacyImports) {
        expect(content).not.toContain(legacy);
      }
    }
  });
});
```

### Step 6.2: 🟢 Remove Legacy Files

**Files to delete**:
- `lib/ai/prompts/form-10k.ts`
- `lib/ai/prompts/form-10q.ts`
- `lib/ai/prompts/form-8k.ts`
- `lib/ai/prompts/form-4.ts`
- `lib/ai/prompts/generic.ts`
- `lib/ai/prompts/prompt-template.ts`
- `lib/ai/prompts/filing-prompts.ts` (if not used elsewhere)

### Step 6.3: Update Index Exports

**File**: `lib/ai/prompts/index.ts`
**Changes**: Remove exports for deleted files

### Step 6.4: 🔵 Final Cleanup

- [ ] Remove any orphaned type definitions
- [ ] Update any documentation referencing legacy system
- [ ] Ensure no dead code remains

### Step 6.5: Final Phase Verification

#### Automated Verification:
- [ ] No legacy usage tests pass
- [ ] Full test suite passes: `npm run test`
- [ ] Build succeeds: `npm run build`
- [ ] No unused exports detected by linter

#### Manual Verification:
- [ ] Verify codebase compiles without legacy files
- [ ] Run full E2E test: `npm run test:e2e`

**STOP**: Await manual confirmation before Phase 7.

---

## Phase 7: Consolidate Template Registries

### Overview
Remove duplicate template registries, establish single source of truth.

### Step 7.1: 🔴 Write Tests for Single Registry

**Test File**: `__tests__/email/template-registry-single.test.ts`

```typescript
describe('Template Registry Consolidation', () => {
  it('should have only one template registry export', () => {
    // Only lib/email/template-registry.ts should export TemplateRegistry
  });

  it('emailGenerator should use central registry', () => {
    // services/filings/email/emailGenerator.ts should import from template-registry
  });

  it('templates.ts should not have duplicate registry', () => {
    // lib/email/templates.ts should not define MINIMALIST_TEMPLATE_REGISTRY
  });
});
```

### Step 7.2: 🟢 Refactor Email Generator

**File**: `services/filings/email/emailGenerator.ts`
**Changes**: Remove local `MINIMALIST_TEMPLATE_REGISTRY`, import from `lib/email/template-registry`

### Step 7.3: 🟢 Clean Up templates.ts

**File**: `lib/email/templates.ts`
**Changes**: Remove duplicate registry definition

### Step 7.4: Final Phase Verification

---

## Testing Strategy

### TDD Test Design Principles

1. **Schema tests first**: Define expected structure before implementing
2. **Extractor tests with real samples**: Use actual SEC filing text patterns
3. **Integration tests**: Verify end-to-end flow from AI to email
4. **Regression tests**: Ensure existing functionality unchanged

### Test Categories

#### 1. Schema Tests (Phase 1)
- Field existence and types
- Required vs optional fields
- Array constraints (maxItems)

#### 2. Extractor Tests (Phases 2, 4, 5)
- Pattern matching accuracy
- Edge case handling (empty, malformed input)
- Field extraction completeness

#### 3. Integration Tests (Phase 3)
- AI + extractor merge logic
- Discrepancy logging
- Database storage format

#### 4. E2E Tests (All Phases)
- `npm run test:e2e` after each phase

### Manual Testing Steps

1. Generate summary for each filing type using real SEC content
2. Verify email renders all expected sections
3. Compare email quality before/after changes
4. Test with edge cases (sparse AI output, unusual formatting)

---

## Performance Considerations

- **Extractor efficiency**: Regex patterns compiled once, reused
- **Caching**: Consider caching extracted data to avoid re-extraction
- **Logging overhead**: Discrepancy logging should be async/non-blocking
- **Token usage**: Updated prompts should stay within model context limits

---

## Migration Notes

- **Database compatibility**: No schema changes needed (using existing `summaryJSON` field)
- **Backward compatibility**: Existing summaries continue to work
- **Gradual rollout**: Can enable validation per filing type via feature flag

---

## References

- Original research: `thoughts/shared/research/2026-01-07-sec-filing-prompts-templates-architecture.md`
- Existing extractors: `lib/email/8k-data-extractor.ts`, `lib/email/form4-data-extractor.ts`
- Unified prompts: `lib/ai/prompts/unified-prompts.ts`
- Template registry: `lib/email/template-registry.ts`
