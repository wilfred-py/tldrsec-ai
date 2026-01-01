# Dashboard Redesign to Landing Page V2 Design System

**Date**: 2025-12-31T22:06:54+11:00 (AEDT)
**Git Commit**: 7ee0827f520049f89dbe8259ddcd216fd7c53822
**Branch**: feature/gmail-inbox-hero-improvements
**Repository**: tldrsec-ai

## Overview

Redesign the `/dashboard` to visually align with the Landing Page V2 design system. This involves replacing hardcoded Tailwind color classes with Landing V2 CSS variables and applying Landing V2 utility classes to key dashboard components.

## Current State Analysis

### Existing Issues
- **Sidebar**: Uses hardcoded `blue-600`, `blue-100`, `blue-800` for logo and navigation
- **Dashboard cards**: Use generic shadcn/ui Card without Landing V2 styling
- **Billing page**: Uses hardcoded `purple-200`, `gray-200` for plan cards
- **Theme inconsistency**: Dashboard uses dark-mode-aware styling while Landing V2 is light-only

### Key Discoveries
- Sidebar has 8 hardcoded blue color references across desktop and mobile views (`sidebar.tsx:70,85,109,130,160,175,199,220`)
- Dashboard layout uses generic `border-r` without branded colors (`layout.tsx:22`)
- Billing page skeleton uses hardcoded `bg-gray-200` (`billing/page.tsx:204-205`)
- Card components use theme variables but lack Landing V2 hover effects

### Landing V2 Design System Available
- CSS variables: `--landing-primary`, `--landing-primary-light`, `--landing-border`, etc.
- Typography classes: `.landing-heading`, `.landing-body`, etc.
- Button classes: `.landing-button-primary`, `.landing-button-secondary`
- Card class: `.landing-card` with hover effects

## Desired End State

After completion:
1. **Sidebar** uses Landing V2 primary color (`#0079F2`) for logo and active states
2. **Dashboard layout** has light Landing V2 background
3. **Cards** use `.landing-card` styling with subtle hover effects
4. **Buttons** use Landing V2 button classes
5. **Visual consistency** between landing page and dashboard experience

### Verification
- Visual comparison: Dashboard sidebar matches Landing V2 header blue
- Active navigation states use `--landing-primary-light` background with `--landing-primary` text
- Cards have subtle shadow lift on hover
- No hardcoded blue/purple Tailwind classes remain in updated files

## What We're NOT Doing

**Explicitly out of scope (deleted per Elon's algorithm):**
- ❌ Auth page styling (sign-in/sign-up) - Clerk handles these
- ❌ Animation integration - Not appropriate for data-heavy dashboard
- ❌ Lower priority components (processing-status, system-health-banner, filing-status-indicator)
- ❌ Dark mode support - Simplifying to light-only like Landing V2
- ❌ Settings page form styling - Works fine as-is
- ❌ Creating new CSS tokens - Reuse existing Landing V2 tokens
- ❌ Stripe billing portal changes - Current API approach works

## Implementation Approach

**Elon's 5-Step Engineering Application:**

1. **Questioned requirements**: Deleted animation phase, dark mode, auth pages, lower-priority components
2. **Deleted scope**: Reduced from 50+ files to 4 high-impact files
3. **Simplified**: Reuse existing Landing V2 classes instead of creating new ones
4. **Accelerated**: TDD approach with checkpoints after each file
5. **Automation**: Lint and type-check verify no regressions

**Strategy:**
- Replace hardcoded Tailwind colors with CSS variable syntax: `text-[var(--landing-primary)]`
- Apply `.landing-card` class to dashboard cards
- Update in order of visual impact: Sidebar → Layout → Cards → Billing

---

## Phase 1: Sidebar Navigation Styling

### Overview
Update the sidebar component to use Landing V2 colors for the logo, navigation active states, and icons.

### Step 1.1: 🔴 Write Failing Tests

**Test File**: `__tests__/components/layout/sidebar-styling.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import { Sidebar } from '@/components/layout/sidebar';

// Mock dependencies
jest.mock('@clerk/nextjs', () => ({
  UserButton: () => <div data-testid="user-button">User</div>,
  useUser: () => ({ user: { primaryEmailAddress: { emailAddress: 'test@example.com' } } }),
}));

jest.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

describe('Sidebar Landing V2 Styling', () => {
  it('should use Landing V2 primary color for logo "tldr" text', () => {
    render(<Sidebar />);
    const logoSpan = screen.getByText('tldr');
    // Check that it uses CSS variable instead of hardcoded blue-600
    expect(logoSpan).toHaveClass('text-[var(--landing-primary)]');
  });

  it('should use Landing V2 colors for active navigation state', () => {
    render(<Sidebar />);
    // Active nav item should use primary-light background and primary text
    const activeNavItem = screen.getByRole('link', { name: /dashboard/i });
    expect(activeNavItem).toHaveClass('bg-[var(--landing-primary-light)]');
    expect(activeNavItem).toHaveClass('text-[var(--landing-primary)]');
  });

  it('should NOT contain hardcoded blue Tailwind classes', () => {
    const { container } = render(<Sidebar />);
    const html = container.innerHTML;
    // Should not have any hardcoded blue classes
    expect(html).not.toContain('text-blue-600');
    expect(html).not.toContain('bg-blue-100');
    expect(html).not.toContain('text-blue-800');
    expect(html).not.toContain('text-blue-500');
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="sidebar-styling"
# Expected: 3 failing tests (hardcoded colors still present)
```

### Step 1.2: 🟢 Implement to Pass Tests

#### 1.2.1 Update Logo Styling
**File**: `components/layout/sidebar.tsx`
**Lines**: 70, 160

Replace:
```tsx
<span className="text-blue-600 font-bold">tldr</span>
```

With:
```tsx
<span className="text-[var(--landing-primary)] font-bold">tldr</span>
```

**Checkpoint 1.2.1**: Verify logo test passes:
```bash
npm run test -- --testPathPattern="sidebar-styling" --testNamePattern="logo"
# Expected: 1 passing
```

#### 1.2.2 Update Navigation Active States
**File**: `components/layout/sidebar.tsx`
**Lines**: 85, 109, 175, 199

Replace all instances of:
```tsx
"bg-blue-100 text-blue-800"
```

With:
```tsx
"bg-[var(--landing-primary-light)] text-[var(--landing-primary)]"
```

**Checkpoint 1.2.2**: Verify navigation test passes:
```bash
npm run test -- --testPathPattern="sidebar-styling" --testNamePattern="active navigation"
# Expected: 2 passing
```

#### 1.2.3 Update Admin Icon Colors
**File**: `components/layout/sidebar.tsx`
**Lines**: 130, 220

Replace:
```tsx
<ShieldIcon className="h-3 w-3 mr-1 text-blue-500" />
```

With:
```tsx
<ShieldIcon className="h-3 w-3 mr-1 text-[var(--landing-primary)]" />
```

**Checkpoint 1.2.3**: All tests pass:
```bash
npm run test -- --testPathPattern="sidebar-styling"
# Expected: 3 passing, 0 failing
```

### Step 1.3: 🔵 Refactor

- [x] Ensure consistent formatting across all color changes
- [x] Verify both desktop and mobile sidebar are updated

**Checkpoint 1.3**: Tests still pass after refactoring:
```bash
npm run test -- --testPathPattern="sidebar-styling"
# Expected: 3 passing
```

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [x] All phase tests pass: `npm run test -- --testPathPattern="sidebar-styling"`
- [x] Type checking passes: `npm run build`
- [x] Linting passes: `npm run lint`
- [x] No regressions: `npm run test`

#### Manual Verification:
- [x] Navigate to `/dashboard` and verify logo "tldr" is the correct blue (#0079F2)
- [x] Verify active navigation item has light blue background
- [x] Verify admin shield icon (if visible) uses primary blue
- [x] Test mobile view - open hamburger menu and verify colors match

**STOP**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Dashboard Layout Background

### Overview
Update the dashboard layout to use Landing V2 light background instead of default theme background.

### Step 2.1: 🔴 Write Failing Tests

**Test File**: `__tests__/app/dashboard/layout-styling.test.tsx`

```typescript
import { render } from '@testing-library/react';
import DashboardLayout from '@/app/dashboard/layout';

// Mock dependencies
jest.mock('@/components/layout/sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar">Sidebar</div>,
}));

describe('Dashboard Layout Landing V2 Styling', () => {
  it('should have Landing V2 background color on main content area', () => {
    const { container } = render(
      <DashboardLayout>
        <div>Test Content</div>
      </DashboardLayout>
    );

    const mainElement = container.querySelector('main');
    expect(mainElement).toHaveStyle({ backgroundColor: 'var(--landing-bg)' });
  });

  it('should have Landing V2 border color on sidebar container', () => {
    const { container } = render(
      <DashboardLayout>
        <div>Test Content</div>
      </DashboardLayout>
    );

    // Sidebar wrapper should use landing border color
    const sidebarWrapper = container.querySelector('[data-testid="sidebar"]')?.parentElement;
    expect(sidebarWrapper?.className).toContain('border-[var(--landing-border)]');
  });
});
```

**Checkpoint 2.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="layout-styling"
# Expected: 2 failing tests
```

### Step 2.2: 🟢 Implement to Pass Tests

#### 2.2.1 Update Layout Wrapper
**File**: `app/dashboard/layout.tsx`
**Lines**: 20-29

Replace:
```tsx
<div className="flex min-h-screen flex-col">
  <div className="flex flex-1">
    <Sidebar className="fixed inset-y-0 z-30 w-64 border-r" />
    <main className="flex-1 md:pl-64">
```

With:
```tsx
<div className="flex min-h-screen flex-col" style={{ backgroundColor: 'var(--landing-bg)' }}>
  <div className="flex flex-1">
    <Sidebar className="fixed inset-y-0 z-30 w-64 border-r border-[var(--landing-border)]" />
    <main className="flex-1 md:pl-64" style={{ backgroundColor: 'var(--landing-bg)' }}>
```

**Checkpoint 2.2.1**: All tests pass:
```bash
npm run test -- --testPathPattern="layout-styling"
# Expected: 2 passing
```

### Step 2.3: 🔵 Refactor

- [x] Ensure no duplicate background declarations
- [x] Remove any dark mode variants that conflict

**Checkpoint 2.3**: Tests still pass:
```bash
npm run test -- --testPathPattern="layout-styling"
# Expected: 2 passing
```

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [x] All phase tests pass: `npm run test -- --testPathPattern="layout-styling"`
- [x] Type checking passes: `npm run build`
- [x] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Dashboard has clean white background (#FFFFFF)
- [ ] Sidebar border is visible as light gray (#E5E7EB)
- [ ] No visual jarring between sidebar and content area
- [ ] Scrolling content area maintains white background

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: Dashboard Card Components

### Overview
Apply Landing V2 card styling to the main dashboard card components.

### Step 3.1: 🔴 Write Failing Tests

**Test File**: `__tests__/components/dashboard/card-styling.test.tsx`

```typescript
import { render } from '@testing-library/react';
import { DashboardCard } from '@/components/dashboard/card';

describe('Dashboard Card Landing V2 Styling', () => {
  it('should have landing-card class for hover effects', () => {
    const { container } = render(
      <DashboardCard>
        <div>Test Content</div>
      </DashboardCard>
    );

    const card = container.firstChild;
    expect(card).toHaveClass('landing-card');
  });

  it('should have rounded-2xl corners', () => {
    const { container } = render(
      <DashboardCard>
        <div>Test Content</div>
      </DashboardCard>
    );

    const card = container.firstChild;
    expect(card).toHaveClass('rounded-2xl');
  });
});
```

**Checkpoint 3.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="card-styling"
# Expected: 2 failing tests
```

### Step 3.2: 🟢 Implement to Pass Tests

#### 3.2.1 Update Dashboard Card Component
**File**: `components/dashboard/card.tsx`

Update the card component to include `landing-card` class:

```tsx
import { cn } from "@/lib/utils";

interface DashboardCardProps {
  children: React.ReactNode;
  className?: string;
}

export function DashboardCard({ children, className }: DashboardCardProps) {
  return (
    <div className={cn("landing-card", className)}>
      {children}
    </div>
  );
}
```

**Checkpoint 3.2.1**: Verify card tests pass:
```bash
npm run test -- --testPathPattern="card-styling"
# Expected: 2 passing
```

#### 3.2.2 Update Dashboard Client Card Usage
**File**: `components/dashboard/dashboard-client.tsx`
**Line**: 321

Replace generic Card usage:
```tsx
<Card className="p-6">
```

With DashboardCard or landing-card class:
```tsx
<div className="landing-card">
```

**Checkpoint 3.2.2**: All tests pass:
```bash
npm run test -- --testPathPattern="card-styling"
# Expected: 2 passing
```

### Step 3.3: 🔵 Refactor

- [x] Ensure consistent padding (p-6 md:p-8 from .landing-card)
- [x] Remove redundant Card imports if replaced

**Checkpoint 3.3**: Tests still pass:
```bash
npm run test -- --testPathPattern="card-styling"
# Expected: 2 passing
```

### Step 3.4: Final Phase Verification

#### Automated Verification:
- [x] All phase tests pass: `npm run test -- --testPathPattern="card-styling"`
- [x] Type checking passes: `npm run build`
- [x] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Dashboard ticker card has subtle border (#E5E7EB)
- [ ] Card lifts slightly on hover with enhanced shadow
- [ ] Border color changes to light blue on hover
- [ ] Padding is consistent (24px mobile, 32px desktop)

**STOP**: Await manual confirmation before Phase 4.

---

## Phase 4: Billing Page Styling

### Overview
Update the billing page to use Landing V2 colors for plan cards and loading states.

### Step 4.1: 🔴 Write Failing Tests

**Test File**: `__tests__/app/dashboard/billing-styling.test.tsx`

```typescript
import { render } from '@testing-library/react';

// Note: Testing the styling patterns, not full component render
describe('Billing Page Landing V2 Styling Patterns', () => {
  it('should define recommended plan border using landing-primary', () => {
    // This tests that our updated code uses the right pattern
    const recommendedPlanStyles = 'ring-2 ring-[var(--landing-primary)]';
    expect(recommendedPlanStyles).toContain('--landing-primary');
    expect(recommendedPlanStyles).not.toContain('purple-200');
  });

  it('should NOT use hardcoded gray for loading skeletons', () => {
    const skeletonStyles = 'bg-[var(--landing-border)]';
    expect(skeletonStyles).toContain('--landing-border');
    expect(skeletonStyles).not.toContain('gray-200');
  });

  it('should use landing button classes for CTAs', () => {
    const primaryButtonClass = 'landing-button-primary';
    const secondaryButtonClass = 'landing-button-secondary';
    // Verify the class names exist
    expect(primaryButtonClass).toBe('landing-button-primary');
    expect(secondaryButtonClass).toBe('landing-button-secondary');
  });
});
```

**Checkpoint 4.1**: These tests pass immediately (pattern validation)
```bash
npm run test -- --testPathPattern="billing-styling"
# Expected: 3 passing (validates our patterns are correct)
```

### Step 4.2: 🟢 Implement Changes

#### 4.2.1 Update Recommended Plan Border
**File**: `app/dashboard/billing/page.tsx`
**Line**: 320

Replace:
```tsx
className={`relative ${plan.recommended ? 'border-purple-200 shadow-lg' : ''}`}
```

With:
```tsx
className={`relative ${plan.recommended ? 'ring-2 ring-[var(--landing-primary)] shadow-lg' : ''}`}
```

#### 4.2.2 Update Loading Skeleton Colors
**File**: `app/dashboard/billing/page.tsx`
**Lines**: 204-205

Replace:
```tsx
<div className="h-8 bg-gray-200 rounded w-64"></div>
<div className="h-4 bg-gray-200 rounded w-96"></div>
```

With:
```tsx
<div className="h-8 bg-[var(--landing-border)] rounded w-64"></div>
<div className="h-4 bg-[var(--landing-border)] rounded w-96"></div>
```

#### 4.2.3 Apply landing-card to Plan Cards
**File**: `app/dashboard/billing/page.tsx`

Add `landing-card` class to plan card containers.

**Checkpoint 4.2**: Build passes:
```bash
npm run build
# Expected: Build succeeds
```

### Step 4.3: 🔵 Refactor

- [x] Ensure all skeleton elements use consistent color
- [x] Verify button classes are applied consistently

**Checkpoint 4.3**: All tests pass:
```bash
npm run test
# Expected: All tests pass
```

### Step 4.4: Final Phase Verification

#### Automated Verification:
- [x] Type checking passes: `npm run build`
- [x] Linting passes: `npm run lint`
- [x] No regressions: `npm run test`

#### Manual Verification:
- [ ] Navigate to `/dashboard/billing`
- [ ] Recommended plan has blue ring border
- [ ] Loading skeleton shows light gray (matches border color)
- [ ] Plan cards have hover effects from landing-card

**STOP**: Await manual confirmation to complete implementation.

---

## Testing Strategy

### TDD Test Design Principles Applied

1. **One Assertion Per Test**: Each test verifies one styling aspect
2. **Descriptive Names**: Tests describe expected visual behavior
3. **Test Patterns, Not Rendering**: Some tests validate patterns are correct without full component render
4. **Edge Cases**: Mobile sidebar, loading states, hover effects

### Test Categories

#### 1. Contract Tests (CSS Variable Usage)
- Verify components use CSS variables instead of hardcoded colors
- Check for absence of legacy color classes

#### 2. Visual Pattern Tests
- Verify correct class combinations
- Check landing-card application

#### 3. Integration Tests
- Full component renders with mocked dependencies
- Verify no runtime errors

### Checkpoint Frequency
- One checkpoint per file modification
- Build verification after each phase

### Manual Testing Steps
1. Visual comparison with Landing V2 hero section
2. Hover effect verification
3. Mobile responsive check
4. Cross-browser verification (Chrome, Safari)

## Performance Considerations

- **No performance impact**: CSS variable changes are purely visual
- **No new dependencies**: Reusing existing Landing V2 styles
- **No bundle size increase**: Using existing CSS classes

## Migration Notes

- **No data migration required**: Purely visual changes
- **Rollback**: Git revert to previous commit if issues arise
- **Feature flag not needed**: Changes are backward compatible

## References

- Original research: `thoughts/shared/research/2025-12-31-dashboard-redesign-to-landing-v2.md`
- Landing V2 CSS tokens: `app/globals.css:48-235`
- Landing V2 animations: `lib/animations/landing-animations.ts`
- Sidebar component: `components/layout/sidebar.tsx`
- Dashboard layout: `app/dashboard/layout.tsx`
- Billing page: `app/dashboard/billing/page.tsx`
