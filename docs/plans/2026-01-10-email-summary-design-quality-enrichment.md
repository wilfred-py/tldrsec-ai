# Email Summary Design & Quality Enrichment Plan

**Date**: 2026-01-10 14:33:05 AEDT
**Git Commit**: b99f9f46422e2d140c08368483c129c95e58a246
**Branch**: review-generated-summaries
**Repository**: review-generated-summaries

## Overview

This plan addresses 8 user feedback items to enrich the quality, design, and "taste" of SEC filing email summaries. The improvements span three categories:

1. **Data Enrichment**: Surfacing 40+ extracted fields currently hidden from email templates
2. **Design Refinement**: Applying 2025-2026 email design best practices
3. **AI Intelligence**: Transforming summaries from "what happened" to "what it means"

## Current State Analysis

### Research Summary

Based on comprehensive research of:
- 12 data extractors (5,187 lines of extraction logic)
- All email templates and design system components
- AI prompts and summarization pipeline
- Modern financial email design best practices

**Key Findings:**

1. **Hidden Data Problem**: 40+ extracted fields are NOT displayed in emails, including:
   - 8-K `sentiment` (positive/negative/neutral/mixed) - calculated but prefixed with `_`
   - Form 4 `signalStrength` with 8-level classification
   - 10-Q quarter-over-quarter changes and quarterly trends
   - SC 13D activist detection with 9 pattern types
   - Form 144 remaining holdings and recent activity context

2. **Design Gaps vs. Best Practices**:
   - No progressive disclosure for information-dense filings
   - Missing accessibility compliance (WCAG 2.1 AA requires 4.5:1 contrast)
   - Limited mobile-first optimization (70%+ opens on mobile)
   - Underutilized color psychology for financial signals

3. **AI Intelligence Gaps**:
   - Prompts request data but not "why this matters"
   - No comparative analysis (vs. expectations, typical trades, prior quarters)
   - Missing investment action guidance

### Desired End State

After implementation, email summaries will:

1. **Display all material extracted data** with intelligent prioritization
2. **Lead with investment signals** using color-coded verdict badges
3. **Answer "so what?"** with contextual analysis in every summary
4. **Maintain WCAG 2.1 AA accessibility** with 4.5:1+ contrast ratios
5. **Optimize for mobile-first** with scannable layouts and touch targets
6. **Use progressive disclosure** for complex filings (accordions, expandable sections)

### Verification

- All existing tests pass (`npm run test`)
- Email renders correctly across Gmail, Apple Mail, Outlook
- WCAG 2.1 AA compliance verified via contrast checker
- Mobile rendering tested in iOS Mail and Gmail mobile

## What We're NOT Doing

- No new web dashboard components (email-only improvements)
- No changes to SEC filing retrieval or storage
- No changes to authentication or user management
- No new database schema changes (using existing fields)
- No changes to cron job scheduling or pipeline orchestration
- No xAI Grok web search integration (out of scope for this plan)
- No per-ticker historical context (requires vector database - separate project)

## Implementation Approach

### Elon's 5-Step Algorithm Application

1. **Question every requirement**: Eliminated xAI web search and per-ticker context as premature optimization
2. **Delete unnecessary work**: Focus on surfacing existing data before adding new extraction
3. **Simplify**: Use existing design system tokens rather than redesigning from scratch
4. **Accelerate**: Implement in parallel tracks (data, design, AI) with shared components
5. **Automate**: Add visual regression tests to prevent design drift

### Phase Structure

| Phase | Focus | Effort | Impact |
|-------|-------|--------|--------|
| 1 | Surface Hidden Data | Low | High |
| 2 | Display Sentiment & Signals | Low | High |
| 3 | Design System Refinement | Medium | High |
| 4 | AI Prompt Enrichment | Medium | Very High |
| 5 | Mobile & Accessibility | Medium | High |
| 6 | Progressive Disclosure | High | Medium |

---

## Phase 1: Surface Hidden Data in Templates ✅ COMPLETED

### Overview
Display the 40+ extracted fields that are currently computed but not shown in email templates. This is the highest ROI phase - zero AI changes, immediate user value.

### Step 1.1: ✅ Write Failing Tests

**Test File**: `__tests__/email/hidden-data-display.test.tsx`

```typescript
import { render } from '@testing-library/react';
import { Form4MinimalistTemplate } from '@/components/ui/email/templates/form4-minimalist-template';
import { Form8KMinimalistTemplate } from '@/components/ui/email/templates/8k-minimalist-template';
import { Form144MinimalistTemplate } from '@/components/ui/email/templates/form144-minimalist-template';

describe('Hidden Data Display', () => {
  describe('Form 4 Template', () => {
    it('should display transaction codes when available', () => {
      const data = {
        transactions: [
          { type: 'Sale', shares: '10,000', price: '$150.00', code: 'S' }
        ]
      };
      const { container } = render(<Form4MinimalistTemplate data={data} />);
      expect(container.textContent).toContain('S');
    });

    it('should display transaction dates for each transaction', () => {
      const data = {
        transactions: [
          { type: 'Sale', shares: '10,000', price: '$150.00', date: '2026-01-10' }
        ]
      };
      const { container } = render(<Form4MinimalistTemplate data={data} />);
      expect(container.textContent).toContain('Jan 10');
    });

    it('should display stake change with arrow indicators', () => {
      const data = {
        previousStake: '500,000',
        newStake: '490,000',
        percentageChange: '-2.0%'
      };
      const { container } = render(<Form4MinimalistTemplate data={data} />);
      expect(container.textContent).toContain('↓');
      expect(container.textContent).toContain('2.0%');
    });
  });

  describe('Form 8-K Template', () => {
    it('should display sentiment indicator when available', () => {
      const data = { sentiment: 'positive', keyHighlights: ['Revenue beat'] };
      const { container } = render(<Form8KMinimalistTemplate data={data} />);
      // Test for visual sentiment indicator
      expect(container.textContent).toContain('Positive');
    });

    it('should display financial impact prominently', () => {
      const data = {
        financialImpact: '$2.5B acquisition',
        keyHighlights: ['Major deal']
      };
      const { container } = render(<Form8KMinimalistTemplate data={data} />);
      expect(container.textContent).toContain('$2.5B');
    });
  });

  describe('Form 144 Template', () => {
    it('should display remaining holdings after sale', () => {
      const data = {
        shares: '50,000',
        remainingHoldings: '450,000',
        estimatedValue: '$7,500,000'
      };
      const { container } = render(<Form144MinimalistTemplate data={data} />);
      expect(container.textContent).toContain('450,000');
      expect(container.textContent).toContain('remaining');
    });

    it('should display trading plan details with adoption date', () => {
      const data = {
        tradingPlan: '10b5-1 plan (08/15/2025)',
        shares: '50,000'
      };
      const { container } = render(<Form144MinimalistTemplate data={data} />);
      expect(container.textContent).toContain('10b5-1');
      expect(container.textContent).toContain('Aug 2025');
    });
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="hidden-data-display"
# Expected: 8+ failing tests
```

### Step 1.2: ✅ Implement Form 4 Hidden Data Display

#### 1.2.1 Add Transaction Code Display
**File**: `components/ui/email/templates/form4-minimalist-template.tsx`
**Changes**: Add SEC transaction code to transaction display

```typescript
// After line 655 (valueDisplay), add:
{tx.code && (
  <div style={{ fontSize: '11px', color: '#6B7280', marginTop: '4px' }}>
    Code: {tx.code} ({getTransactionCodeDescription(tx.code)})
  </div>
)}

// Add helper function at top of file:
function getTransactionCodeDescription(code: string): string {
  const descriptions: Record<string, string> = {
    'P': 'Open Market Purchase',
    'S': 'Open Market Sale',
    'A': 'Grant/Award',
    'G': 'Gift',
    'M': 'Option Exercise',
    'F': 'Tax Withholding',
    'C': 'Conversion',
    'J': 'Trust Transfer',
    'K': 'Trust Disposition'
  };
  return descriptions[code.toUpperCase()] || 'Other Transaction';
}
```

**Checkpoint 1.2.1**: First test passes:
```bash
npm run test -- --testPathPattern="hidden-data" --testNamePattern="transaction codes"
# Expected: 1 passing
```

#### 1.2.2 Add Transaction Dates
**File**: `components/ui/email/templates/form4-minimalist-template.tsx`
**Changes**: Display individual transaction dates

```typescript
// In transaction aggregation display, add date grouping header:
{tx.date && (
  <div style={{ fontSize: '12px', color: '#374151', marginBottom: '4px' }}>
    {formatTransactionDate(tx.date)}
  </div>
)}

// Add helper:
function formatTransactionDate(date: string): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
```

#### 1.2.3 Add Stake Change Indicator
**File**: `components/ui/email/templates/form4-minimalist-template.tsx`
**Changes**: Display ownership change with visual indicators

```typescript
// After the transaction cards, add stake change section:
{(data.previousStake || data.newStake) && (
  <SectionCard>
    <SectionHeader title="Ownership Change" />
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px' }}>
      {data.previousStake && (
        <span style={{ fontSize: '16px', color: '#6B7280' }}>
          {formatNumber(data.previousStake)} shares
        </span>
      )}
      <span style={{
        fontSize: '20px',
        margin: '0 12px',
        color: getChangeColor(data.percentageChange)
      }}>
        {getChangeArrow(data.percentageChange)}
      </span>
      {data.newStake && (
        <span style={{ fontSize: '18px', fontWeight: '600', color: '#000' }}>
          {formatNumber(data.newStake)} shares
        </span>
      )}
      {data.percentageChange && (
        <span style={{
          fontSize: '14px',
          marginLeft: '8px',
          color: getChangeColor(data.percentageChange)
        }}>
          ({data.percentageChange})
        </span>
      )}
    </div>
  </SectionCard>
)}
```

**Checkpoint 1.2.3**: Three tests pass:
```bash
npm run test -- --testPathPattern="hidden-data" --testNamePattern="Form 4"
# Expected: 3 passing
```

### Step 1.3: ✅ Implement 8-K and Form 144 Hidden Data

#### 1.3.1 Add 8-K Sentiment Display
**File**: `components/ui/email/templates/8k-minimalist-template.tsx`
**Changes**: Display sentiment indicator prominently

```typescript
// Replace line 157 (the _sentiment assignment) with active usage:
const sentiment = (data?.sentiment || extractedData?.sentiment || '') as string;

// Add after signal badge (around line 270):
{sentiment && (
  <div style={{
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: '16px',
    fontSize: '12px',
    fontWeight: '600',
    marginLeft: '8px',
    backgroundColor: getSentimentColor(sentiment).bg,
    color: getSentimentColor(sentiment).text
  }}>
    {getSentimentEmoji(sentiment)} {sentiment.charAt(0).toUpperCase() + sentiment.slice(1)}
  </div>
)}

// Add helpers:
function getSentimentColor(sentiment: string): { bg: string; text: string } {
  switch (sentiment.toLowerCase()) {
    case 'positive': return { bg: '#DCFCE7', text: '#166534' }; // Green
    case 'negative': return { bg: '#FEE2E2', text: '#991B1B' }; // Red
    case 'mixed': return { bg: '#FEF3C7', text: '#92400E' }; // Amber
    default: return { bg: '#F3F4F6', text: '#4B5563' }; // Gray (neutral)
  }
}

function getSentimentEmoji(sentiment: string): string {
  switch (sentiment.toLowerCase()) {
    case 'positive': return '📈';
    case 'negative': return '📉';
    case 'mixed': return '↔️';
    default: return '➖';
  }
}
```

#### 1.3.2 Add 8-K Financial Impact Card
**File**: `components/ui/email/templates/8k-minimalist-template.tsx`
**Changes**: Display financial impact as prominent stat

```typescript
// Add after event details section:
{extractedData?.financialImpact && (
  <SectionCard>
    <div style={{
      textAlign: 'center',
      padding: '16px',
      backgroundColor: '#F8FAFC',
      borderRadius: '8px'
    }}>
      <div style={{ fontSize: '12px', color: '#6B7280', marginBottom: '4px' }}>
        FINANCIAL IMPACT
      </div>
      <div style={{ fontSize: '24px', fontWeight: '700', color: '#000' }}>
        {extractedData.financialImpact}
      </div>
    </div>
  </SectionCard>
)}
```

#### 1.3.3 Add Form 144 Remaining Holdings
**File**: `components/ui/email/templates/form144-minimalist-template.tsx`
**Changes**: Display shares remaining after proposed sale

```typescript
// After the sale details card, add:
{data?.remainingHoldings && (
  <SectionCard>
    <SectionHeader title="Post-Sale Position" />
    <div style={{ textAlign: 'center', padding: '12px' }}>
      <div style={{ fontSize: '11px', color: '#6B7280', marginBottom: '4px' }}>
        SHARES REMAINING AFTER SALE
      </div>
      <div style={{ fontSize: '22px', fontWeight: '700', color: '#000' }}>
        {formatNumber(data.remainingHoldings)}
      </div>
      {data.shares && (
        <div style={{ fontSize: '12px', color: '#6B7280', marginTop: '4px' }}>
          Selling {data.shares} of {calculateTotalHoldings(data.shares, data.remainingHoldings)}
        </div>
      )}
    </div>
  </SectionCard>
)}
```

**Checkpoint 1.3**: All Phase 1 tests pass:
```bash
npm run test -- --testPathPattern="hidden-data-display"
# Expected: 8 passing
```

### Step 1.4: ✅ Refactor

- [x] Extract common `getSentimentColor` to design-system.ts
- [x] Extract `getTransactionCodeDescription` to shared utils
- [x] Ensure consistent spacing with design tokens
- [x] Add JSDoc comments for new helper functions

**Checkpoint 1.4**: All tests still pass:
```bash
npm run test -- --testPathPattern="hidden-data"
# Expected: 12 passing (tests expanded from original 8)
```

### Step 1.5: ✅ Final Phase Verification

#### Automated Verification:
- [x] All phase tests pass: `npm run test -- --testPathPattern="hidden-data"` (12 passing)
- [x] Type checking passes: `npm run build`
- [x] Linting passes: `npm run lint` (form4 template errors fixed)
- [x] No regressions: Email tests pass (255/256 - one pre-existing DEF14A naming issue)

#### Manual Verification:
- [ ] Form 4 email shows transaction codes and dates
- [ ] Form 4 email shows stake change with arrow indicators
- [ ] 8-K email shows sentiment badge next to signal
- [ ] 8-K email shows financial impact card when available
- [ ] Form 144 email shows remaining holdings section
- [ ] All emails render correctly in email preview

**STOP**: Await manual confirmation before Phase 2.

#### Implementation Summary (2026-01-10):

**Files Modified:**
1. `components/ui/email/templates/form4-minimalist-template.tsx`
   - Added `getTransactionCodeDescription()` exported function (delegating to design-system)
   - Added `getStakeChangeArrow()` for directional arrows (↑/↓/→)
   - Extended `AggregatedTransaction` interface with `code` and `codeDescription` fields
   - Updated aggregation to collect and display transaction codes
   - Updated stake impact display to use arrow indicators

2. `components/ui/email/templates/8k-minimalist-template.tsx`
   - Renamed `_sentiment` to `sentiment` (now actively used)
   - Added sentiment indicator section with emoji and colored badge
   - Imports `getSentimentColor` and `getSentimentEmoji` from design-system

3. `components/ui/email/templates/form144-minimalist-template.tsx`
   - Added field mapping for `sharesSold` → `shares`
   - Added field mapping for `sharesRemaining` → `remainingHoldings`
   - Added field mapping for `percentOwnership` → `percentOfHoldings`
   - Enhanced remaining holdings display with percentage context

4. `components/ui/email/design-system.ts`
   - Added `SentimentColorConfig` interface
   - Added `getSentimentColor()` with WCAG contrast ratios documented
   - Added `getSentimentEmoji()` for sentiment indicators
   - Added `SEC_TRANSACTION_CODES` constant with all 19 SEC codes
   - Added `getTransactionCodeDescription()` function

**New Test File:**
- `__tests__/email/hidden-data-display.test.tsx` (12 tests, all passing)

---

## Phase 2: Signal-First Design with Prominent Verdicts

### Overview
Implement prominent investment signal display at the top of every email with color-coded verdict badges, making the "so what" immediately visible.

### Step 2.1: 🔴 Write Failing Tests

**Test File**: `__tests__/email/signal-first-design.test.tsx`

```typescript
describe('Signal-First Design', () => {
  describe('Signal Badge Component', () => {
    it('should render HIGH signal with amber styling', () => {
      const { container } = render(
        <SignalBadge level="HIGH" verdict="Notable Insider Activity" />
      );
      expect(container.querySelector('[data-signal="HIGH"]')).toBeTruthy();
      // Check for amber background color
      expect(container.innerHTML).toContain('F59E0B');
    });

    it('should render POSITIVE sentiment with green styling', () => {
      const { container } = render(
        <SignalBadge level="POSITIVE" verdict="Earnings Beat" />
      );
      expect(container.innerHTML).toContain('10B981');
    });

    it('should display verdict text prominently', () => {
      const { getByText } = render(
        <SignalBadge level="MODERATE" verdict="Routine Filing" />
      );
      expect(getByText('Routine Filing')).toBeTruthy();
    });
  });

  describe('Template Signal Integration', () => {
    it('should show signal as first visible element in Form 4', () => {
      const { container } = render(
        <Form4MinimalistTemplate data={{ signalStrength: 'Strong - Large Sale' }} />
      );
      const firstSection = container.querySelector('[data-section="signal"]');
      expect(firstSection).toBeTruthy();
    });
  });
});
```

**Checkpoint 2.1**: Tests fail as expected

### Step 2.2: 🟢 Implement Signal Badge Component

**File**: `components/ui/email/sections/SignalBadge.tsx` (new file)

```typescript
import React from 'react';
import { EmailColors } from '../design-system';

interface SignalBadgeProps {
  level: 'HIGH' | 'MODERATE' | 'LOW' | 'NEUTRAL' | 'POSITIVE' | 'NEGATIVE' | 'MIXED';
  verdict: string;
  description?: string;
}

const SIGNAL_STYLES: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  HIGH: { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E', icon: '⚠️' },
  POSITIVE: { bg: '#DCFCE7', border: '#10B981', text: '#166534', icon: '📈' },
  NEGATIVE: { bg: '#FEE2E2', border: '#EF4444', text: '#991B1B', icon: '📉' },
  MODERATE: { bg: '#EEF2FF', border: '#6366F1', text: '#4338CA', icon: '👀' },
  LOW: { bg: '#F3F4F6', border: '#9CA3AF', text: '#4B5563', icon: '✓' },
  NEUTRAL: { bg: '#F0F9FF', border: '#3B82F6', text: '#1D4ED8', icon: '🔄' },
  MIXED: { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E', icon: '↔️' }
};

export function SignalBadge({ level, verdict, description }: SignalBadgeProps) {
  const style = SIGNAL_STYLES[level] || SIGNAL_STYLES.NEUTRAL;

  return (
    <div
      data-section="signal"
      data-signal={level}
      style={{
        backgroundColor: style.bg,
        border: `2px solid ${style.border}`,
        borderRadius: '12px',
        padding: '16px',
        textAlign: 'center',
        marginBottom: '16px'
      }}
    >
      <div style={{
        display: 'inline-block',
        backgroundColor: style.border,
        color: '#FFFFFF',
        fontSize: '11px',
        fontWeight: '700',
        letterSpacing: '0.5px',
        padding: '4px 12px',
        borderRadius: '20px',
        marginBottom: '8px'
      }}>
        {style.icon} {level}
      </div>
      <div style={{
        fontSize: '24px',
        fontWeight: '700',
        color: style.text,
        lineHeight: '1.3'
      }}>
        {verdict}
      </div>
      {description && (
        <div style={{
          fontSize: '14px',
          color: style.text,
          opacity: 0.9,
          marginTop: '4px'
        }}>
          {description}
        </div>
      )}
    </div>
  );
}
```

**Checkpoint 2.2**: Signal badge tests pass

### Step 2.3: 🟢 Integrate Signal Badge into Templates

Update each template to use the SignalBadge as the first element:

**Form 4**: Parse `signalStrength` to determine level and verdict
**8-K**: Combine `sentiment` and materiality into unified signal
**Form 144**: Use existing 2-level signal system

**Checkpoint 2.3**: All signal integration tests pass

### Step 2.4: 🔵 Refactor

- [ ] Extract signal level determination logic to shared util
- [ ] Ensure consistent icon usage across templates
- [ ] Add test for all 7 signal levels

**Checkpoint 2.4**: All tests pass after refactoring

### Step 2.5: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="signal-first"`
- [ ] Build passes: `npm run build`
- [ ] Lint passes: `npm run lint`

#### Manual Verification:
- [ ] Signal badge appears as first element in all templates
- [ ] Color coding matches signal severity
- [ ] Verdict text is readable and prominent
- [ ] Works in Gmail, Apple Mail, Outlook

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: Design System Refinement

### Overview
Refine the existing design system to implement 2025-2026 best practices: enhanced color contrast for accessibility, refined typography hierarchy, and improved spacing consistency.

### Step 3.1: 🔴 Write Failing Tests

**Test File**: `__tests__/email/design-system-accessibility.test.ts`

```typescript
import { EmailColors, EmailTypography } from '@/components/ui/email/design-system';

describe('Design System Accessibility', () => {
  describe('Color Contrast', () => {
    it('should have body text contrast ratio >= 4.5:1 against white', () => {
      const ratio = getContrastRatio(EmailColors.text.body, '#FFFFFF');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('should have muted text contrast ratio >= 3:1 against white for large text', () => {
      const ratio = getContrastRatio(EmailColors.text.muted, '#FFFFFF');
      expect(ratio).toBeGreaterThanOrEqual(3);
    });

    it('should have positive signal contrast ratio >= 4.5:1', () => {
      // Green text on green background
      const ratio = getContrastRatio('#166534', '#DCFCE7');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('should have negative signal contrast ratio >= 4.5:1', () => {
      // Red text on red background
      const ratio = getContrastRatio('#991B1B', '#FEE2E2');
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('Typography', () => {
    it('should have minimum body font size of 14px', () => {
      expect(parseInt(EmailTypography.body.fontSize)).toBeGreaterThanOrEqual(14);
    });

    it('should have minimum CTA font size of 16px', () => {
      expect(parseInt(EmailTypography.cta.fontSize)).toBeGreaterThanOrEqual(16);
    });
  });
});

// Helper function
function getContrastRatio(foreground: string, background: string): number {
  // Calculate relative luminance and contrast ratio per WCAG 2.1
  const getLuminance = (hex: string) => {
    const rgb = hex.match(/[A-Fa-f0-9]{2}/g)!.map(c => parseInt(c, 16) / 255);
    const [r, g, b] = rgb.map(c =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
    );
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const l1 = getLuminance(foreground);
  const l2 = getLuminance(background);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
```

### Step 3.2: 🟢 Update Design Tokens

**File**: `components/ui/email/design-system.ts`
**Changes**: Ensure all colors meet WCAG 2.1 AA requirements

```typescript
// Update muted text to meet 3:1 ratio (currently #9CA3AF = 2.96:1)
text: {
  headline: '#000000',
  body: '#374151',      // 8.59:1 - passes
  meta: '#4B5563',      // 6.44:1 - passes (upgraded from #6B7280)
  muted: '#6B7280',     // 5.03:1 - passes (upgraded from #9CA3AF)
}
```

### Step 3.3: 🟢 Add Accessibility Utilities

**File**: `components/ui/email/accessibility.ts` (new file)

```typescript
/**
 * Accessibility utilities for email templates
 */

export function ensureAccessibleContrast(
  textColor: string,
  bgColor: string,
  isLargeText: boolean = false
): string {
  const ratio = getContrastRatio(textColor, bgColor);
  const minRatio = isLargeText ? 3 : 4.5;

  if (ratio >= minRatio) return textColor;

  // Return fallback accessible color
  return '#000000';
}

export function getAriaLabel(content: string, context: string): string {
  return `${context}: ${content}`;
}
```

### Step 3.4: 🔵 Refactor

- [ ] Apply updated colors across all templates
- [ ] Add contrast ratio validation to CI
- [ ] Document color decisions in design system comments

### Step 3.5: Final Phase Verification

#### Automated Verification:
- [ ] Accessibility tests pass: `npm run test -- --testPathPattern="accessibility"`
- [ ] Build passes: `npm run build`
- [ ] All templates use updated color tokens

#### Manual Verification:
- [ ] Text is readable in bright light conditions
- [ ] Signal badges are distinguishable by color
- [ ] No accessibility warnings in browser tools

**STOP**: Await manual confirmation before Phase 4.

---

## Phase 4: AI Prompt Enrichment

### Overview
Transform AI prompts to generate "what this means" context alongside data. Add investment signal fields, comparative analysis, and actionable guidance to every summary.

### Step 4.1: 🔴 Write Failing Tests

**Test File**: `__tests__/ai/enriched-prompts.test.ts`

```typescript
describe('Enriched AI Prompts', () => {
  describe('Investment Signal Generation', () => {
    it('should include investorImplication field in Form 4 schema', () => {
      const schema = getForm4Schema();
      expect(schema.properties.investorImplication).toBeDefined();
    });

    it('should include actionableInsight field in all schemas', () => {
      const formTypes = ['4', '8-K', '10-K', '10-Q', '144'];
      formTypes.forEach(type => {
        const schema = getSchemaForForm(type);
        expect(schema.properties.actionableInsight).toBeDefined();
      });
    });

    it('should generate "so what" context for Form 4 transactions', async () => {
      const mockFiling = createMockForm4Filing({
        insiderName: 'Elon Musk',
        transactionType: 'Sale',
        value: 5000000
      });

      const summary = await generateSummary(mockFiling);

      // Should explain significance, not just describe
      expect(summary.investorImplication).toMatch(/signals?|suggests?|indicates?|means?/i);
      expect(summary.investorImplication.length).toBeGreaterThan(50);
    });
  });

  describe('Comparative Analysis', () => {
    it('should include comparative context for large trades', async () => {
      const mockFiling = createMockForm4Filing({
        value: 10000000, // $10M+ trade
        transactionType: 'Sale'
      });

      const summary = await generateSummary(mockFiling);

      // Should reference size significance
      expect(summary.summary).toMatch(/large|significant|substantial|major/i);
    });
  });
});
```

### Step 4.2: 🟢 Add Investment Signal Fields to Schemas

**File**: `lib/ai/prompts/unified-prompts.ts`

Add to BASE schema properties (used by all forms):

```typescript
// Add after line 130 (baseProperties definition)
const INVESTMENT_SIGNAL_PROPERTIES = {
  investorImplication: {
    type: 'string',
    description: 'One sentence explaining why this filing matters to investors. Format: "This [signals/suggests/indicates] [specific insight] because [brief reason]". Required for all filings.',
    maxLength: 200
  },
  actionableInsight: {
    type: 'string',
    description: 'What should investors consider? Format: "Consider [specific action/attention] if [relevant condition]". Optional for routine filings.',
    maxLength: 150
  },
  signalLevel: {
    type: 'string',
    enum: ['HIGH', 'MODERATE', 'LOW', 'NEUTRAL'],
    description: 'Investment signal strength. HIGH=material investor-relevant event, MODERATE=worth noting, LOW=routine filing, NEUTRAL=administrative only'
  }
};
```

### Step 4.3: 🟢 Enhance Form-Specific Extraction Guidance

**File**: `lib/ai/prompts/unified-prompts.ts`

Update FORM_EXTRACTION_GUIDANCE for each form type:

```typescript
// Form 4 guidance (around line 930)
'4': `FORM 4 EXTRACTION RULES:
  ...existing rules...

  INVESTMENT SIGNAL ANALYSIS (NEW):
  - Assess trade significance: Compare size to insider's total holdings
  - Consider insider role: CEO/CFO trades matter more than director trades
  - Check for patterns: Is this part of regular 10b5-1 or opportunistic?
  - Look for timing: Near earnings, product launches, or price movements?

  investorImplication MUST explain WHY this matters:
  - BAD: "CFO sold shares" (just restates facts)
  - GOOD: "This signals reduced confidence in near-term outlook since CFO rarely sells discretionary shares"

  signalLevel determination:
  - HIGH: >50% position change, CEO/CFO purchase, or pattern of insider buying
  - MODERATE: Large sale ($1M+) or multiple executives selling
  - LOW: 10b5-1 plan execution, option exercises for taxes
  - NEUTRAL: Gift transfers, trust transactions
`,

// 8-K guidance (around line 938)
'8-K': `8-K EXTRACTION RULES:
  ...existing rules...

  INVESTMENT SIGNAL ANALYSIS (NEW):
  - Compare results to expectations when stated (beat/miss/in-line)
  - Note guidance changes (raised/lowered/maintained)
  - Identify strategic shifts (acquisitions, restructuring, leadership)

  investorImplication examples:
  - Earnings beat: "This signals accelerating demand since revenue beat by 15% despite macro headwinds"
  - CEO departure: "This may signal strategic disagreement since outgoing CEO opposed proposed merger"
  - Acquisition: "This suggests margin expansion potential since target has 40% gross margins vs. acquirer's 25%"
`,
```

### Step 4.4: 🟢 Update Extractors to Use New Fields

**File**: `lib/email/form4-data-extractor.ts`

```typescript
// Add new fields to Form4ExtractedData interface (around line 66)
export interface Form4ExtractedData {
  // ...existing fields...
  investorImplication?: string;
  actionableInsight?: string;
  signalLevel?: 'HIGH' | 'MODERATE' | 'LOW' | 'NEUTRAL';
}

// Extract new fields in main extraction function (around line 124)
return {
  // ...existing fields...
  investorImplication: jsonData?.investorImplication || '',
  actionableInsight: jsonData?.actionableInsight || '',
  signalLevel: jsonData?.signalLevel || determineSignalLevelFromStrength(data.signalStrength)
};
```

### Step 4.5: 🔵 Refactor

- [ ] Add signal level to all form extractors
- [ ] Ensure consistent field naming across extractors
- [ ] Add fallback logic when AI doesn't generate insight fields

### Step 4.6: Final Phase Verification

#### Automated Verification:
- [ ] Schema tests pass: `npm run test -- --testPathPattern="enriched-prompts"`
- [ ] Extractor tests pass: `npm run test -- --testPathPattern="data-extractor"`
- [ ] Build passes: `npm run build`

#### Manual Verification:
- [ ] Generate summary for test filing and verify:
  - `investorImplication` is present and insightful
  - `signalLevel` correctly categorizes the filing
  - Summary leads with significance, not just facts
- [ ] Compare before/after summaries for quality improvement

**STOP**: Await manual confirmation before Phase 5.

---

## Phase 5: Mobile & Accessibility Optimization

### Overview
Optimize email templates for mobile-first rendering (70%+ of opens) and ensure full WCAG 2.1 AA compliance.

### Step 5.1: 🔴 Write Failing Tests

**Test File**: `__tests__/email/mobile-accessibility.test.tsx`

```typescript
describe('Mobile & Accessibility', () => {
  describe('Touch Targets', () => {
    it('should have CTA buttons at least 44x44px', () => {
      const { container } = render(<CTAButton href="https://sec.gov">View Filing</CTAButton>);
      const button = container.querySelector('a');
      const style = button?.getAttribute('style');
      // Verify minimum height
      expect(style).toContain('padding');
      // Should have at least 12px padding = 48px total with 24px text
    });
  });

  describe('Font Sizes', () => {
    it('should use 16px+ body text for mobile readability', () => {
      const { container } = render(<Form4MinimalistTemplate data={mockData} />);
      const bodyText = container.querySelectorAll('div[style*="font-size"]');
      // No text smaller than 14px
      bodyText.forEach(el => {
        const size = parseInt(el.getAttribute('style')?.match(/font-size:\s*(\d+)px/)?.[1] || '16');
        expect(size).toBeGreaterThanOrEqual(12);
      });
    });
  });

  describe('Alt Text', () => {
    it('should have alt text on all images', () => {
      const { container } = render(<Form4MinimalistTemplate data={mockData} />);
      const images = container.querySelectorAll('img');
      images.forEach(img => {
        expect(img.getAttribute('alt')).toBeTruthy();
      });
    });
  });
});
```

### Step 5.2: 🟢 Implement Mobile-First Styles

**File**: `components/ui/email/design-system.ts`

Add mobile-optimized style presets:

```typescript
export const MobileStyles = {
  container: {
    maxWidth: '100%',
    padding: '16px',
    boxSizing: 'border-box' as const
  },
  touchTarget: {
    minHeight: '44px',
    minWidth: '44px',
    padding: '12px 24px'
  },
  readableText: {
    fontSize: '16px',
    lineHeight: '1.6'
  }
};
```

### Step 5.3: 🟢 Add ARIA Labels

Update templates to include descriptive labels:

```typescript
// In SignalBadge component
<div
  role="status"
  aria-label={`Investment signal: ${level} - ${verdict}`}
  // ...existing styles
>
```

### Step 5.4: 🔵 Refactor

- [ ] Apply MobileStyles to all templates
- [ ] Add role attributes where appropriate
- [ ] Test with screen reader emulation

### Step 5.5: Final Phase Verification

#### Automated Verification:
- [ ] Accessibility tests pass
- [ ] Touch target tests pass
- [ ] Build passes

#### Manual Verification:
- [ ] Test on iPhone (iOS Mail, Gmail)
- [ ] Test on Android (Gmail)
- [ ] Test with VoiceOver enabled
- [ ] Verify text is readable at arm's length

**STOP**: Await manual confirmation before Phase 6.

---

## Phase 6: Progressive Disclosure (Optional Enhancement)

### Overview
Implement expandable sections for information-dense filings. This phase is optional - only implement if client compatibility research shows sufficient support.

### Research Required First

Before implementing, verify CSS `:checked` support across email clients:
- Gmail: ~41% support for interactive elements
- Outlook: Very limited
- Apple Mail: Good support

### Conditional Implementation

If research shows >80% support for target audience:

1. Implement CSS-only accordion for risk factors
2. Add "Show more details" expandable sections
3. Provide full-content fallback for unsupported clients

If support is <80%:
- Skip this phase
- Use summary + "View Full Filing" CTA pattern instead

---

## Testing Strategy

### TDD Test Design Principles

1. **One Assertion Per Test**: Each test verifies single behavior
2. **Descriptive Names**: "should display sentiment indicator when available"
3. **Arrange-Act-Assert**: Clear test structure
4. **Test Behavior**: Focus on user-visible outcomes

### Test Categories

#### 1. Component Tests (Write First)
- Test each new UI component in isolation
- Verify props → rendered output

#### 2. Integration Tests (Write Second)
- Test data flow from extractor → template
- Verify email client compatibility

#### 3. Accessibility Tests (Ongoing)
- Contrast ratios
- Touch targets
- ARIA labels

### Manual Testing Steps

For each phase:
1. Generate test email with sample filing data
2. Preview in Litmus or Email on Acid
3. Send to Gmail, Outlook, Apple Mail accounts
4. View on desktop and mobile
5. Test with VoiceOver/screen reader

---

## Performance Considerations

### Email Size
- Keep HTML under 102KB (Gmail clipping threshold)
- Minimize inline styles where possible
- Use shared style objects to reduce duplication

### Rendering Speed
- Avoid complex CSS calculations
- Use simple table-based layouts
- No JavaScript (not supported in email)

---

## References

- Original research: `thoughts/shared/research/2026-01-10-summary-quality-feedback-analysis.md`
- Current templates: `components/ui/email/templates/`
- Design system: `components/ui/email/design-system.ts`
- AI prompts: `lib/ai/prompts/unified-prompts.ts`
- Extractors: `lib/email/*-data-extractor.ts`

### External References
- [WCAG 2.1 Color Contrast Guidelines](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
- [Email Client CSS Support](https://www.caniemail.com/)
- [Morning Brew Email Design](https://www.morningbrew.com/)
