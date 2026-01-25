# Fix Checkout Flow and Simplify Upgrade CTA Implementation Plan

**Date**: 2026-01-22T09:35:20Z
**Git Commit**: c1530135d9c0ab92bee9e6de9172d55610420388
**Branch**: stripe-integration
**Repository**: stripe-integration

## Overview

Fix the "Checkout not available" error and replace the aggressive gradient upgrade CTA with a clean, always-visible in-table upgrade row.

## Current State Analysis

### Problem 1: Checkout Not Working
- **File**: `components/dashboard/dashboard-client.tsx:305-308`
- **Issue**: Client-side code checks `priceId` from `SUBSCRIPTION_PLANS`
- **Root Cause**: `SUBSCRIPTION_PLANS` in `lib/stripe.ts` reads `process.env.STRIPE_PRO_MONTHLY_PRICE_ID` at module init time. Since this is a server-side env var (no `NEXT_PUBLIC_` prefix), it's `undefined` on the client, defaulting to empty string `''`
- **Result**: `if (!priceId)` is true, showing "Checkout not available" toast

### Problem 2: Aggressive Upgrade CTA
- **File**: `components/dashboard/upgrade-cta-section.tsx`
- **Current**: Gradient banner + 2 pricing buttons + feature grid
- **Desired**: Single in-table row with upgrade button, always visible

### Key Discoveries:
- `lib/stripe.ts:62-63` - PRO plan reads `process.env.STRIPE_PRO_MONTHLY_PRICE_ID || ''`
- `dashboard-client.tsx:302-308` - Client checks priceId before calling API
- API at `app/api/user/subscription/route.ts:159-191` already has proper server-side priceId resolution
- Tickers table at `components/dashboard/tickers-table/tickers-table.tsx` renders data passed to it

## Desired End State

1. Clicking "Upgrade to Pro" redirects to Stripe checkout successfully
2. Tickers table shows an always-visible upgrade row at the bottom for FREE users
3. Upgrade row displays contextual message and single "Upgrade to Pro" button
4. No more gradient banner CTA
5. Clean, minimal design that doesn't feel aggressive

### Verification:
- Click "Upgrade to Pro" → redirects to Stripe checkout (not toast error)
- FREE user sees upgrade row in tickers table regardless of ticker count
- PRO/MAX users don't see upgrade row
- Upgrade row adapts message based on limit status

## What We're NOT Doing

- Changing Stripe price IDs or env var naming
- Modifying tier limit enforcement logic
- Adding `NEXT_PUBLIC_` prefix to Stripe vars (security risk)
- Changing the API checkout session creation logic
- Handling PRO→MAX upsells (out of scope for now)

## Implementation Approach

**Elon's 5-Step Applied**:
1. **Questioned**: Do we need client-side priceId validation? No - API handles it.
2. **Deleted**: Client-side priceId check, gradient banner, feature grid
3. **Simplified**: Single button, in-table row, API-driven checkout
4. **Accelerate**: Small TDD increments with checkpoints
5. **Automate**: Tests ensure behavior

---

## Phase 1: Fix Stripe Checkout Flow

### Overview
Remove the client-side priceId check that causes "Checkout not available" error. Let the API handle all priceId resolution since it has access to server-side env vars.

### Step 1.1: Write Failing Tests

**Test File**: `__tests__/components/dashboard/dashboard-client-checkout.test.tsx`

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DashboardClient } from '@/components/dashboard/dashboard-client';

// Mock dependencies
jest.mock('@/hooks/use-subscription', () => ({
  useSubscription: () => ({
    subscription: { planType: 'FREE' },
    createCheckout: jest.fn().mockResolvedValue('https://checkout.stripe.com/test'),
  }),
}));

jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
    info: jest.fn(),
  },
}));

describe('DashboardClient Checkout Flow', () => {
  it('should call createCheckout without client-side priceId validation', async () => {
    const mockCreateCheckout = jest.fn().mockResolvedValue('https://checkout.stripe.com/test');

    jest.doMock('@/hooks/use-subscription', () => ({
      useSubscription: () => ({
        subscription: { planType: 'FREE' },
        createCheckout: mockCreateCheckout,
      }),
    }));

    // The test verifies that clicking upgrade calls createCheckout
    // regardless of what SUBSCRIPTION_PLANS returns for priceId
    // Since env vars aren't available on client, priceId would be ''
    // But we should still call API and let it handle priceId resolution
  });

  it('should NOT show "Checkout not available" toast when clicking upgrade', async () => {
    const { toast } = require('sonner');

    // Render and click upgrade
    // Assert toast.error was NOT called with "Checkout not available"
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="dashboard-client-checkout"
# Expected: Tests fail (module structure may need adjustment)
```

### Step 1.2: Implement to Pass Tests

#### 1.2.1 Modify handleUpgradeClick in dashboard-client.tsx
**File**: `components/dashboard/dashboard-client.tsx`
**Changes**: Remove the client-side priceId check and always call API

**Current code** (lines 297-319):
```typescript
const handleUpgradeClick = useCallback(
  async (planType: "PRO" | "MAX", billingCycle: "monthly" | "annual") => {
    setIsCheckoutLoading(true);
    try {
      const plan = SUBSCRIPTION_PLANS[planType];
      const priceId =
        billingCycle === "annual" ? plan.annualPriceId : plan.monthlyPriceId;
      if (!priceId) {
        toast.error("Checkout not available. Please try again later.");
        return;
      }
      const checkoutUrl = await createCheckout(planType, priceId);
      window.location.href = checkoutUrl;
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error("Failed to start checkout. Please try again.");
    } finally {
      setIsCheckoutLoading(false);
    }
  },
  [createCheckout]
);
```

**New code**:
```typescript
const handleUpgradeClick = useCallback(
  async (planType: "PRO" | "MAX", billingCycle: "monthly" | "annual") => {
    setIsCheckoutLoading(true);
    try {
      // Don't check priceId on client - env vars aren't available
      // Let the API resolve priceId from server-side env vars
      const checkoutUrl = await createCheckout(planType, billingCycle);
      window.location.href = checkoutUrl;
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error("Failed to start checkout. Please try again.");
    } finally {
      setIsCheckoutLoading(false);
    }
  },
  [createCheckout]
);
```

**Checkpoint 1.2.1**: Verify change compiles:
```bash
npm run build
# Expected: Build succeeds
```

#### 1.2.2 Update useSubscription hook to accept billingCycle instead of priceId
**File**: `hooks/use-subscription.ts`
**Changes**: Modify createCheckout to send billingInterval instead of priceId

**Current signature** (line 74):
```typescript
const createCheckout = useCallback(async (planType: string, priceId: string): Promise<string> => {
```

**New signature**:
```typescript
const createCheckout = useCallback(async (planType: string, billingInterval: 'monthly' | 'annual'): Promise<string> => {
```

**Updated body**:
```typescript
const createCheckout = useCallback(async (planType: string, billingInterval: 'monthly' | 'annual'): Promise<string> => {
  try {
    setError(null);

    const response = await fetch('/api/user/subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planType, billingInterval }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create checkout');
    }

    const data = await response.json();

    if (!data.checkoutUrl) {
      throw new Error('No checkout URL received');
    }

    return data.checkoutUrl;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Checkout failed';
    setError(message);
    throw err;
  }
}, []);
```

**Checkpoint 1.2.2**: Build and basic test:
```bash
npm run build && npm run test -- --testPathPattern="use-subscription"
# Expected: Build succeeds
```

### Step 1.3: Refactor

- [ ] Remove unused `SUBSCRIPTION_PLANS` import from dashboard-client.tsx if no longer needed
- [ ] Update any TypeScript types if needed
- [ ] Ensure error messages are user-friendly

**Checkpoint 1.3**: All tests pass:
```bash
npm run test
# Expected: No regressions
```

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [ ] Build succeeds: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] No regressions: `npm run test`

#### Manual Verification:
- [ ] Start dev server: `npm run dev`
- [ ] Click "$199/mo" button on upgrade CTA
- [ ] Verify redirect to Stripe checkout (not toast error)
- [ ] Click "$1,990/yr" button
- [ ] Verify redirect to Stripe checkout

**STOP**: Await manual confirmation before Phase 2.

---

## Phase 2: Create In-Table Upgrade Row Component

### Overview
Create a new component that displays as a row in the tickers table, showing contextual upgrade messaging and a single "Upgrade to Pro" button.

### Step 2.1: Write Failing Tests

**Test File**: `__tests__/components/dashboard/tickers-table/upgrade-row.test.tsx`

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { UpgradeRow } from '@/components/dashboard/tickers-table/upgrade-row';

describe('UpgradeRow', () => {
  const mockOnUpgradeClick = jest.fn();

  beforeEach(() => {
    mockOnUpgradeClick.mockClear();
  });

  it('should render upgrade message for FREE users', () => {
    render(
      <table>
        <tbody>
          <UpgradeRow
            tickerCount={2}
            tickerLimit={3}
            onUpgradeClick={mockOnUpgradeClick}
            isLoading={false}
          />
        </tbody>
      </table>
    );

    expect(screen.getByText(/Upgrade to Pro/i)).toBeInTheDocument();
  });

  it('should show at-limit message when tickerCount equals tickerLimit', () => {
    render(
      <table>
        <tbody>
          <UpgradeRow
            tickerCount={3}
            tickerLimit={3}
            onUpgradeClick={mockOnUpgradeClick}
            isLoading={false}
          />
        </tbody>
      </table>
    );

    expect(screen.getByText(/reached your 3 company limit/i)).toBeInTheDocument();
  });

  it('should show general upgrade message when under limit', () => {
    render(
      <table>
        <tbody>
          <UpgradeRow
            tickerCount={1}
            tickerLimit={3}
            onUpgradeClick={mockOnUpgradeClick}
            isLoading={false}
          />
        </tbody>
      </table>
    );

    expect(screen.getByText(/track up to 25 companies/i)).toBeInTheDocument();
  });

  it('should call onUpgradeClick when button is clicked', () => {
    render(
      <table>
        <tbody>
          <UpgradeRow
            tickerCount={2}
            tickerLimit={3}
            onUpgradeClick={mockOnUpgradeClick}
            isLoading={false}
          />
        </tbody>
      </table>
    );

    fireEvent.click(screen.getByRole('button', { name: /Upgrade to Pro/i }));
    expect(mockOnUpgradeClick).toHaveBeenCalledWith('PRO', 'monthly');
  });

  it('should show loading state when isLoading is true', () => {
    render(
      <table>
        <tbody>
          <UpgradeRow
            tickerCount={2}
            tickerLimit={3}
            onUpgradeClick={mockOnUpgradeClick}
            isLoading={true}
          />
        </tbody>
      </table>
    );

    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

**Checkpoint 2.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="upgrade-row"
# Expected: Module not found error
```

### Step 2.2: Implement to Pass Tests

#### 2.2.1 Create UpgradeRow Component
**File**: `components/dashboard/tickers-table/upgrade-row.tsx`

```typescript
'use client';

import { Button } from '@/components/ui/button';
import { TableRow, TableCell } from '@/components/ui/table';
import { Zap, Loader2 } from 'lucide-react';

interface UpgradeRowProps {
  tickerCount: number;
  tickerLimit: number;
  onUpgradeClick: (planType: 'PRO' | 'MAX', billingCycle: 'monthly' | 'annual') => void;
  isLoading: boolean;
  columnCount?: number;
}

export function UpgradeRow({
  tickerCount,
  tickerLimit,
  onUpgradeClick,
  isLoading,
  columnCount = 5,
}: UpgradeRowProps) {
  const isAtLimit = tickerLimit > 0 && tickerCount >= tickerLimit;

  const message = isAtLimit
    ? `You've reached your ${tickerLimit} company limit. Upgrade to track up to 25 companies.`
    : `Track up to 25 companies with Pro. Get real-time alerts and all filing types.`;

  return (
    <TableRow className="bg-blue-50/50 dark:bg-blue-950/20 border-t-2 border-blue-200 dark:border-blue-800">
      <TableCell colSpan={columnCount} className="py-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Zap className="h-4 w-4 text-blue-500" />
            <span>{message}</span>
          </div>
          <Button
            size="sm"
            onClick={() => onUpgradeClick('PRO', 'monthly')}
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white whitespace-nowrap"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Upgrade to Pro
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
```

**Checkpoint 2.2.1**: First test passes:
```bash
npm run test -- --testPathPattern="upgrade-row" --testNamePattern="should render"
# Expected: 1 passing
```

**Checkpoint 2.2.2**: All upgrade-row tests pass:
```bash
npm run test -- --testPathPattern="upgrade-row"
# Expected: 5 passing
```

#### 2.2.2 Export from tickers-table index
**File**: `components/dashboard/tickers-table/index.ts`
**Changes**: Add export for UpgradeRow

```typescript
export { UpgradeRow } from './upgrade-row';
```

**Checkpoint 2.2.3**: Export works:
```bash
npm run build
# Expected: Build succeeds
```

### Step 2.3: Refactor

- [ ] Ensure styling matches existing table design
- [ ] Add dark mode support
- [ ] Consider mobile responsiveness

**Checkpoint 2.3**: All tests pass:
```bash
npm run test -- --testPathPattern="upgrade-row"
# Expected: All passing
```

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [ ] Component tests pass: `npm run test -- --testPathPattern="upgrade-row"`
- [ ] Build succeeds: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Component renders correctly in isolation (Storybook or dev)
- [ ] Styling looks clean and matches design system

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: Integrate UpgradeRow into TickersTable

### Overview
Add the UpgradeRow component to the bottom of the TickersTable for FREE users.

### Step 3.1: Write Failing Tests

**Test File**: `__tests__/components/dashboard/tickers-table/tickers-table.test.tsx`

Add new tests to existing file or create new:

```typescript
describe('TickersTable with UpgradeRow', () => {
  it('should render UpgradeRow for FREE users', () => {
    render(
      <TickersTable
        data={mockCompanies}
        showInlineAdd={false}
        allCompanies={[]}
        onAddTicker={jest.fn()}
        onCancelAdd={jest.fn()}
        onPreferenceChange={jest.fn()}
        onDeleteClick={jest.fn()}
        showUpgradeRow={true}
        tickerCount={2}
        tickerLimit={3}
        onUpgradeClick={jest.fn()}
        isCheckoutLoading={false}
      />
    );

    expect(screen.getByText(/Upgrade to Pro/i)).toBeInTheDocument();
  });

  it('should NOT render UpgradeRow when showUpgradeRow is false', () => {
    render(
      <TickersTable
        data={mockCompanies}
        showInlineAdd={false}
        allCompanies={[]}
        onAddTicker={jest.fn()}
        onCancelAdd={jest.fn()}
        onPreferenceChange={jest.fn()}
        onDeleteClick={jest.fn()}
        showUpgradeRow={false}
        tickerCount={2}
        tickerLimit={3}
        onUpgradeClick={jest.fn()}
        isCheckoutLoading={false}
      />
    );

    expect(screen.queryByText(/Upgrade to Pro/i)).not.toBeInTheDocument();
  });
});
```

**Checkpoint 3.1**: Tests fail (props don't exist yet):
```bash
npm run test -- --testPathPattern="tickers-table.test"
# Expected: Failing due to missing props
```

### Step 3.2: Implement to Pass Tests

#### 3.2.1 Add props to TickersTable
**File**: `components/dashboard/tickers-table/tickers-table.tsx`

**Add new props to interface**:
```typescript
interface TickersTableProps {
  data: Company[];
  showInlineAdd: boolean;
  allCompanies: TickerSearchResult[];
  onAddTicker: (symbol: string, name: string) => void;
  onCancelAdd: () => void;
  onPreferenceChange: (
    company: Company,
    key: keyof FilingPreferences,
    value: boolean
  ) => void;
  onDeleteClick: (company: Company) => void;
  // New props for upgrade row
  showUpgradeRow?: boolean;
  tickerCount?: number;
  tickerLimit?: number;
  onUpgradeClick?: (planType: 'PRO' | 'MAX', billingCycle: 'monthly' | 'annual') => void;
  isCheckoutLoading?: boolean;
}
```

**Add UpgradeRow to table body** (after data rows, before pagination):
```typescript
import { UpgradeRow } from './upgrade-row';

// Inside TableBody, after the data rows:
{showUpgradeRow && onUpgradeClick && (
  <UpgradeRow
    tickerCount={tickerCount || 0}
    tickerLimit={tickerLimit || 3}
    onUpgradeClick={onUpgradeClick}
    isLoading={isCheckoutLoading || false}
    columnCount={columns.length}
  />
)}
```

**Checkpoint 3.2.1**: Tests pass:
```bash
npm run test -- --testPathPattern="tickers-table"
# Expected: All passing
```

#### 3.2.2 Update DashboardClient to pass props
**File**: `components/dashboard/dashboard-client.tsx`

**Update TickersTable usage**:
```typescript
<TickersTable
  data={companies}
  showInlineAdd={showInlineAdd}
  allCompanies={allCompanies}
  onAddTicker={handleAddTicker}
  onCancelAdd={() => setShowInlineAdd(false)}
  onPreferenceChange={handlePreferenceChange}
  onDeleteClick={handleDeleteClick}
  // New props for upgrade row
  showUpgradeRow={subscription?.planType === 'FREE'}
  tickerCount={companies.length}
  tickerLimit={SUBSCRIPTION_PLANS.FREE.tickerLimit}
  onUpgradeClick={handleUpgradeClick}
  isCheckoutLoading={isCheckoutLoading}
/>
```

**Checkpoint 3.2.2**: Build succeeds:
```bash
npm run build
# Expected: Build succeeds
```

### Step 3.3: Refactor

- [ ] Remove the separate UpgradeCTASection component usage (lines 457-468)
- [ ] Clean up unused imports
- [ ] Verify mobile view also shows upgrade row

**Checkpoint 3.3**: All tests pass:
```bash
npm run test
# Expected: No regressions
```

### Step 3.4: Final Phase Verification

#### Automated Verification:
- [ ] All tests pass: `npm run test`
- [ ] Build succeeds: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Start dev server: `npm run dev`
- [ ] Login as FREE user
- [ ] Verify upgrade row appears at bottom of tickers table
- [ ] Verify message changes based on ticker count
- [ ] Click "Upgrade to Pro" → redirects to Stripe checkout
- [ ] Verify gradient CTA no longer appears

**STOP**: Await manual confirmation before Phase 4.

---

## Phase 4: Remove Old UpgradeCTASection (Cleanup)

### Overview
Remove the old gradient banner component since it's replaced by the in-table row.

### Step 4.1: Write Tests for Absence

**Test File**: Add to existing dashboard-client tests

```typescript
it('should NOT render UpgradeCTASection component', () => {
  render(<DashboardClient />);

  // The gradient banner had these elements
  expect(screen.queryByText(/Save 17%/i)).not.toBeInTheDocument();
  expect(screen.queryByText(/25 companies/i)).not.toBeInTheDocument(); // feature grid
});
```

**Checkpoint 4.1**: Test fails (old component still rendered):
```bash
npm run test -- --testPathPattern="dashboard-client" --testNamePattern="NOT render UpgradeCTASection"
# Expected: Failing
```

### Step 4.2: Implement

#### 4.2.1 Remove UpgradeCTASection from dashboard-client.tsx
**File**: `components/dashboard/dashboard-client.tsx`

**Remove import**:
```typescript
// Remove this line:
import { UpgradeCTASection } from "@/components/dashboard/upgrade-cta-section";
```

**Remove usage** (lines 457-468):
```typescript
// Remove this entire block:
{/* Upgrade CTA for non-MAX users */}
{subscription && subscription.planType !== "MAX" && (
  <UpgradeCTASection
    currentPlan={subscription.planType as "FREE" | "PRO" | "MAX"}
    tickerCount={companies.length}
    tickerLimit={
      SUBSCRIPTION_PLANS[subscription.planType as PlanType]?.tickerLimit || 3
    }
    onUpgradeClick={handleUpgradeClick}
    isCheckoutLoading={isCheckoutLoading}
  />
)}
```

**Checkpoint 4.2.1**: Test passes:
```bash
npm run test -- --testPathPattern="dashboard-client" --testNamePattern="NOT render UpgradeCTASection"
# Expected: Passing
```

#### 4.2.2 Optionally delete upgrade-cta-section.tsx
**File**: `components/dashboard/upgrade-cta-section.tsx`

Decide whether to:
- Delete the file entirely (if no other usage)
- Keep it for potential future use

**Checkpoint 4.2.2**: Build succeeds:
```bash
npm run build
# Expected: Build succeeds (no broken imports)
```

### Step 4.3: Refactor

- [ ] Remove any unused imports from dashboard-client.tsx
- [ ] Clean up any TypeScript types no longer needed

**Checkpoint 4.3**: All tests pass:
```bash
npm run test
# Expected: No regressions
```

### Step 4.4: Final Phase Verification

#### Automated Verification:
- [ ] All tests pass: `npm run test`
- [ ] Build succeeds: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Start dev server and verify no gradient banner
- [ ] Verify in-table upgrade row works correctly
- [ ] Test complete checkout flow end-to-end

**STOP**: Final manual verification complete.

---

## Testing Strategy

### TDD Test Design Principles Applied

1. **One Assertion Per Test**: Each test checks one behavior
2. **Descriptive Names**: "should [verb] when [condition]"
3. **Arrange-Act-Assert**: Clear structure
4. **Test Behavior**: Focus on user-visible outcomes
5. **Edge Cases**: At-limit vs under-limit scenarios

### Test Categories:

#### Contract Tests (Written First)
- UpgradeRow renders with required props
- TickersTable accepts upgrade row props

#### Edge Case Tests
- At-limit message shows correct text
- Under-limit message shows different text
- Loading state disables button

#### Integration Tests
- Dashboard renders upgrade row for FREE users
- Dashboard hides upgrade row for PRO/MAX users
- Checkout flow completes successfully

### Manual Testing Steps:
1. Login as FREE user with 0 tickers
2. Verify upgrade row visible with "Track up to 25" message
3. Add 3 tickers
4. Verify message changes to "reached your 3 company limit"
5. Click "Upgrade to Pro"
6. Verify Stripe checkout loads
7. Cancel checkout and return
8. Verify dashboard still works

## Performance Considerations

- UpgradeRow is a lightweight component (no API calls)
- No additional re-renders from subscription check (already done)
- Single button vs dual buttons reduces decision fatigue

## Migration Notes

N/A - This is a UI-only change with no database impact.

## References

- Research document: `docs/plans/2026/1. January/2026-01-22-track-tickers-tier-limits-research.md`
- Current upgrade CTA: `components/dashboard/upgrade-cta-section.tsx`
- Tickers table: `components/dashboard/tickers-table/tickers-table.tsx`
- Dashboard client: `components/dashboard/dashboard-client.tsx`
- Stripe config: `lib/stripe.ts:43-94`
- Subscription hook: `hooks/use-subscription.ts:74-106`
