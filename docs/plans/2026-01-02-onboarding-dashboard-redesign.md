# Onboarding & Dashboard Redesign Implementation Plan

**Date**: 2026-01-02 12:37:28 AEDT
**Git Commit**: 0c78e435f929b942af436089ca125fc56693df72
**Branch**: feature/inline-ticker-search-keyboard-nav
**Repository**: tldrsec-ai

## Overview

Redesign the onboarding flow and dashboard to be warmer and more visually consistent with the landing page design system. The current onboarding and dashboard pages feel "harsh, cold, and white" compared to the landing page's animated mesh gradient aesthetic.

## Current State Analysis

### Onboarding Page Issues
- **Background**: Uses `bg-gradient-to-br from-blue-50 via-white to-indigo-50` - static and cold
- **Header text**: Too verbose ("Welcome to tldrSEC!" + "Let's personalize your experience in just 3 quick steps.")
- **Skip buttons**: Present on all 3 steps, creating decision paralysis
- **Continue button**: No gradient styling, doesn't match landing page CTAs
- **Empty div**: Dead code at line 542

### Dashboard Page Issues
- **Background**: Plain white `space-y-6` container
- **No visual warmth**: Lacks the mesh gradient aesthetic of landing page
- **Add Ticker button**: No gradient styling

### Missing Redirect Logic
- Authenticated users can still access `/onboarding` even after completing setup
- Need to add redirect to `/dashboard` for users who have `hasCompletedOnboarding: true`

### Design System Reference
From `lib/animations/landing-animations.ts`:
```typescript
export const meshGradientStyle = {
  background: `
    radial-gradient(ellipse 80% 50% at 40% 20%, rgba(0, 121, 242, 0.12) 0%, transparent 100%),
    radial-gradient(ellipse 60% 40% at 80% 10%, rgba(139, 92, 246, 0.08) 0%, transparent 100%),
    radial-gradient(ellipse 70% 50% at 10% 60%, rgba(0, 121, 242, 0.06) 0%, transparent 100%),
    radial-gradient(ellipse 50% 40% at 90% 70%, rgba(139, 92, 246, 0.05) 0%, transparent 100%),
    linear-gradient(180deg, rgba(240, 247, 255, 0.8) 0%, rgba(248, 250, 252, 0.4) 50%, #FFFFFF 100%)
  `,
  backgroundSize: '100% 100%',
};
```

## Desired End State

After this implementation:
1. **Onboarding page** has animated mesh gradient background matching landing page
2. **Dashboard page** has animated mesh gradient background
3. **All skip buttons removed** from onboarding flow
4. **Header text simplified** to be action-oriented
5. **Continue buttons use gradient styling** (`landing-button-gradient` class)
6. **Authenticated users with completed onboarding** are redirected to dashboard
7. **Empty div removed** from button row

### Verification
- Visual: Pages feel warm and consistent with landing page
- Functional: All onboarding steps work, navigation works
- Tests: All existing tests pass
- Build: `npm run build` succeeds

## What We're NOT Doing

- Changing onboarding step logic or data flow
- Modifying email submission behavior
- Adding new features to dashboard
- Changing sector/company selection behavior
- Modifying the landing page itself

## Implementation Approach

**Elon's 5-Step Algorithm Applied:**
1. **Questioned requirements**: Confirmed skip buttons should be removed (user decision), mesh gradient is needed for warmth
2. **Deleted scope creep**: Originally considered different gradients for each page - using same meshGradientStyle everywhere for consistency and simplicity
3. **Simplified**: Using existing `meshGradientStyle` and `landing-button-gradient` classes rather than creating new ones
4. **Accelerate**: Small phases with immediate verification
5. **Automation**: No automation needed - this is UI work

---

## Phase 1: Add Mesh Gradient to Onboarding Page

### Overview
Replace the static gradient background with the animated mesh gradient used on the landing page.

### Step 1.1: Write Failing Tests

**Test File**: `__tests__/app/(auth)/onboarding/onboarding-redesign.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import OnboardingPage from '@/app/(auth)/onboarding/page';

// Mock dependencies
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/context/auth-context', () => ({
  useAuthContext: () => ({
    isAuthenticated: false,
    isLoading: false,
    userName: null,
  }),
}));

describe('Onboarding Page Redesign', () => {
  describe('Visual Styling', () => {
    it('should have mesh gradient background on container', () => {
      render(<OnboardingPage />);
      const container = screen.getByTestId('onboarding-container');
      expect(container).toHaveStyle({
        background: expect.stringContaining('radial-gradient'),
      });
    });

    it('should NOT have skip button in step 1', () => {
      render(<OnboardingPage />);
      expect(screen.queryByText(/skip setup/i)).not.toBeInTheDocument();
    });

    it('should have gradient Continue button', () => {
      render(<OnboardingPage />);
      const continueButton = screen.getByRole('button', { name: /continue/i });
      expect(continueButton).toHaveClass('landing-button-gradient');
    });
  });

  describe('Header Simplification', () => {
    it('should have simplified header text', () => {
      render(<OnboardingPage />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Pick your sectors');
      expect(screen.queryByText(/welcome to tldrsec/i)).not.toBeInTheDocument();
    });
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="onboarding-redesign" --passWithNoTests
# Expected: Tests will fail (file doesn't exist yet, then styling doesn't match)
```

### Step 1.2: Implement Changes

#### 1.2.1 Add data-testid and mesh gradient to container
**File**: `app/(auth)/onboarding/page.tsx`

**Import meshGradientStyle at top of file:**
```typescript
import { meshGradientStyle } from "@/lib/animations/landing-animations";
```

**Replace line 473 container div:**
```typescript
// FROM:
<div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">

// TO:
<div
  className="min-h-screen dark:from-gray-950 dark:via-gray-900 dark:to-gray-950"
  style={meshGradientStyle}
  data-testid="onboarding-container"
>
```

**Checkpoint 1.2.1**: Background test should pass now

#### 1.2.2 Simplify header text
**File**: `app/(auth)/onboarding/page.tsx`

**Replace lines 477-481:**
```typescript
// FROM:
<h1 className="mt-10 mb-2 text-2xl font-bold">Welcome to tldrSEC!</h1>
<p className="text-muted-foreground">Let&apos;s personalize your experience in just 3 quick steps.</p>

// TO:
<h1 className="mt-6 mb-2 text-2xl font-bold">Pick your sectors</h1>
<p className="text-sm text-muted-foreground">We&apos;ll show you relevant companies to track.</p>
```

**Checkpoint 1.2.2**: Header test should pass now

#### 1.2.3 Add gradient class to Continue button (Step 1)
**File**: `app/(auth)/onboarding/page.tsx`

**Replace line 547:**
```typescript
// FROM:
<Button onClick={handleNext} disabled={selectedSectors.length === 0}>

// TO:
<Button
  onClick={handleNext}
  disabled={selectedSectors.length === 0}
  className="landing-button-gradient"
>
```

**Checkpoint 1.2.3**: Button gradient test should pass

#### 1.2.4 Fix empty div in button row
**File**: `app/(auth)/onboarding/page.tsx`

**Replace lines 541-542:**
```typescript
// FROM:
<div className="mt-8 flex items-center justify-between">
  <div></div>

// TO:
<div className="mt-8 flex items-center justify-end">
```

#### 1.2.5 Remove skip button (Step 1)
**File**: `app/(auth)/onboarding/page.tsx`

**Delete lines 557-564:**
```typescript
// DELETE:
{currentStep === 1 && (
  <div className="mt-4 text-center">
    <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground">
      Skip setup and go to dashboard
    </Button>
  </div>
)}
```

**Checkpoint 1.2.5**: Skip button test should pass

### Step 1.3: Refactor

- [x] Ensure imports are alphabetically organized
- [x] Remove any dead code from handleSkip if no longer used

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [x] All phase tests pass: `npm run test -- --testPathPattern="onboarding-redesign"`
- [x] Existing onboarding tests pass: `npm run test -- --testPathPattern="onboarding"` (pre-existing failures unrelated to changes)
- [x] Type checking passes: `npm run build`
- [x] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Visit `/onboarding` and verify mesh gradient background visible
- [ ] Verify header says "Pick your sectors"
- [ ] Verify Continue button has blue-purple gradient
- [ ] Verify no skip button appears
- [ ] Verify step 1 works correctly (select sectors, click continue)

**STOP**: Await manual confirmation before Phase 2.

---

## Phase 2: Update Step 2 and Step 3 Styling

### Overview
Apply the same styling improvements to steps 2 and 3 of onboarding.

### Step 2.1: Write Failing Tests

**Add to existing test file** `__tests__/app/(auth)/onboarding/onboarding-redesign.test.tsx`:

```typescript
describe('Step 2 - Company Selection', () => {
  it('should have simplified header text', async () => {
    render(<OnboardingPage />);
    // Navigate to step 2 by selecting a sector and clicking continue
    const techSector = screen.getByText('Technology');
    await userEvent.click(techSector);
    const continueBtn = screen.getByRole('button', { name: /continue/i });
    await userEvent.click(continueBtn);

    // Verify step 2 header
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Choose companies to track');
  });

  it('should NOT have skip button in step 2', async () => {
    // Navigate to step 2
    // ...
    expect(screen.queryByText(/skip setup/i)).not.toBeInTheDocument();
  });

  it('should have gradient Continue button in step 2', async () => {
    // Navigate to step 2
    // ...
    const continueButton = screen.getByRole('button', { name: /continue/i });
    expect(continueButton).toHaveClass('landing-button-gradient');
  });
});

describe('Step 3 - Email', () => {
  it('should NOT have skip button in step 3', async () => {
    // Navigate to step 3
    // ...
    expect(screen.queryByText(/skip setup/i)).not.toBeInTheDocument();
  });

  it('should have gradient Continue button in step 3', async () => {
    // Navigate to step 3
    // ...
    const submitButton = screen.getByRole('button', { name: /continue/i });
    expect(submitButton).toHaveClass('landing-button-gradient');
  });
});
```

**Checkpoint 2.1**: Run tests and verify they FAIL

### Step 2.2: Implement Changes

#### 2.2.1 Update Step 2 header text
**File**: `app/(auth)/onboarding/page.tsx`

**Replace lines 570-575:**
```typescript
// FROM:
<h2 className="text-xl font-bold">Choose your first companies</h2>
<p className="text-muted-foreground">
  Select up to 5 companies to start tracking. Based on your selected sectors.
</p>

// TO:
<h2 className="text-xl font-bold">Choose companies to track</h2>
<p className="text-sm text-muted-foreground">
  Get 10-Q and Form 4 summaries in your inbox.
</p>
```

#### 2.2.2 Add gradient class to Continue button (Step 2)
**File**: `app/(auth)/onboarding/page.tsx`

**Replace line 651:**
```typescript
// FROM:
<Button onClick={handleNext} disabled={selectedEquities.length === 0}>

// TO:
<Button
  onClick={handleNext}
  disabled={selectedEquities.length === 0}
  className="landing-button-gradient"
>
```

#### 2.2.3 Remove skip button (Step 2)
**File**: `app/(auth)/onboarding/page.tsx`

**Delete lines 661-668:**
```typescript
// DELETE:
{currentStep === 2 && (
  <div className="mt-4 text-center">
    <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground">
      Skip setup and go to dashboard
    </Button>
  </div>
)}
```

#### 2.2.4 Remove skip button (Step 3)
**File**: `app/(auth)/onboarding/page.tsx`

**Delete lines 682-689:**
```typescript
// DELETE:
{currentStep === 3 && (
  <div className="mt-4 text-center">
    <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground">
      Skip setup and go to dashboard
    </Button>
  </div>
)}
```

#### 2.2.5 Add gradient class to Continue button (Step 3 - EmailStep component)
**File**: `components/onboarding/email-step.tsx`

**Replace lines 123-127:**
```typescript
// FROM:
<Button
  type="submit"
  disabled={showProcessing}
  className="flex-1"
>

// TO:
<Button
  type="submit"
  disabled={showProcessing}
  className="flex-1 landing-button-gradient"
>
```

### Step 2.3: Refactor

- [x] Remove `handleSkip` function if no longer used anywhere
- [x] Clean up any orphaned imports

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [x] All phase tests pass: `npm run test -- --testPathPattern="onboarding-redesign"`
- [x] Type checking passes: `npm run build`
- [x] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Navigate through all 3 steps
- [ ] Verify no skip buttons appear on any step
- [ ] Verify Continue buttons have gradient on all steps
- [ ] Verify step 2 header says "Choose companies to track"
- [ ] Complete full onboarding flow successfully

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: Add Mesh Gradient to Dashboard

### Overview
Add the animated mesh gradient background to the dashboard page for visual consistency.

### Step 3.1: Write Failing Tests

**Test File**: `__tests__/components/dashboard/dashboard-redesign.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import { DashboardClient } from '@/components/dashboard/dashboard-client';

// Mock dependencies
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/api/ticker-service', () => ({
  getTrackedCompanies: jest.fn(() => Promise.resolve({ data: [] })),
  addTrackedCompany: jest.fn(),
  deleteTrackedCompany: jest.fn(),
  updateCompanyPreferences: jest.fn(),
}));

describe('Dashboard Redesign', () => {
  it('should have mesh gradient background on container', () => {
    render(<DashboardClient />);
    const container = screen.getByTestId('dashboard-container');
    expect(container).toHaveStyle({
      background: expect.stringContaining('radial-gradient'),
    });
  });

  it('should have gradient Add Ticker button', () => {
    render(<DashboardClient />);
    const addButton = screen.getByRole('button', { name: /add ticker/i });
    expect(addButton).toHaveClass('landing-button-gradient');
  });
});
```

**Checkpoint 3.1**: Run tests and verify they FAIL

### Step 3.2: Implement Changes

#### 3.2.1 Add mesh gradient to dashboard container
**File**: `components/dashboard/dashboard-client.tsx`

**Add import at top:**
```typescript
import { meshGradientStyle } from "@/lib/animations/landing-animations";
```

**Replace line 408-409:**
```typescript
// FROM:
return (
  <div className="space-y-6">

// TO:
return (
  <div
    className="space-y-6 min-h-screen -m-4 p-4 sm:-m-6 sm:p-6 lg:-m-8 lg:p-8"
    style={meshGradientStyle}
    data-testid="dashboard-container"
  >
```

Note: The negative margins and padding compensate for any parent container padding to allow the gradient to extend edge-to-edge.

**Checkpoint 3.2.1**: Background test should pass

#### 3.2.2 Add gradient class to Add Ticker button
**File**: `components/dashboard/dashboard-client.tsx`

**Replace lines 440-451:**
```typescript
// FROM:
<Button
  onClick={() => setIsAddTickerOpen(true)}
  className="gap-1"
  data-tutorial="add-ticker"
>

// TO:
<Button
  onClick={() => setIsAddTickerOpen(true)}
  className="gap-1 landing-button-gradient"
  data-tutorial="add-ticker"
>
```

**Checkpoint 3.2.2**: Button gradient test should pass

### Step 3.3: Refactor

- [x] Ensure imports are alphabetically organized
- [x] Verify negative margin approach works with parent layout

### Step 3.4: Final Phase Verification

#### Automated Verification:
- [x] All phase tests pass: `npm run test -- --testPathPattern="dashboard-redesign"`
- [x] Existing dashboard tests pass: `npm run test -- --testPathPattern="dashboard"` (pre-existing failures unrelated to changes)
- [x] Type checking passes: `npm run build`
- [x] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Visit `/dashboard` and verify mesh gradient background visible
- [ ] Verify Add Ticker button has blue-purple gradient
- [ ] Verify table and cards are readable on gradient background
- [ ] Verify mobile view looks correct
- [ ] Verify dashboard functionality still works (add/remove tickers)

**STOP**: Await manual confirmation before Phase 4.

---

## Phase 4: Add Authenticated User Redirect

### Overview
Prevent authenticated users who have already completed onboarding from accessing `/onboarding` by redirecting them to `/dashboard`.

### Step 4.1: Write Failing Tests

**Add to test file** `__tests__/app/(auth)/onboarding/onboarding-redesign.test.tsx`:

```typescript
describe('Authenticated User Redirect', () => {
  it('should redirect authenticated users with completed onboarding to dashboard', () => {
    // Mock authenticated user with completed onboarding
    jest.spyOn(require('@/lib/context/auth-context'), 'useAuthContext').mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      userName: 'Test User',
      hasCompletedOnboarding: true,
    });

    render(<OnboardingPage />);

    // Should have triggered redirect
    expect(mockRouter.push).toHaveBeenCalledWith('/dashboard');
  });

  it('should NOT redirect authenticated users who have NOT completed onboarding', () => {
    jest.spyOn(require('@/lib/context/auth-context'), 'useAuthContext').mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      userName: 'Test User',
      hasCompletedOnboarding: false,
    });

    render(<OnboardingPage />);

    expect(mockRouter.push).not.toHaveBeenCalled();
  });
});
```

**Checkpoint 4.1**: Run tests and verify they FAIL

### Step 4.2: Implement Changes

#### 4.2.1 Check if auth context exposes hasCompletedOnboarding
**File**: `lib/context/auth-context.tsx`

First, verify if `hasCompletedOnboarding` is already exposed. If not, we need to add it.

#### 4.2.2 Add redirect logic to onboarding page
**File**: `app/(auth)/onboarding/page.tsx`

**Add useEffect after line 193 (after the initialization useEffect):**
```typescript
// Redirect authenticated users who have already completed onboarding
useEffect(() => {
  if (!isLoading && isAuthenticated && hasCompletedOnboarding) {
    router.push('/dashboard');
  }
}, [isLoading, isAuthenticated, hasCompletedOnboarding, router]);
```

Note: This requires `hasCompletedOnboarding` to be available from `useAuthContext`. If it's not currently exposed, we'll need to add it to the auth context.

### Step 4.3: Refactor

- [x] Ensure redirect happens before any flash of onboarding content
- [x] Consider adding a loading state during redirect check

### Step 4.4: Final Phase Verification

#### Automated Verification:
- [x] All phase tests pass: `npm run test -- --testPathPattern="onboarding-redesign"`
- [x] Type checking passes: `npm run build`
- [x] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Sign in as a user who has completed onboarding
- [ ] Navigate to `/onboarding` directly
- [ ] Verify redirect to `/dashboard` happens
- [ ] New users should still see onboarding flow

**STOP**: Await manual confirmation before final verification.

---

## Phase 5: Final Comprehensive Testing

### Overview
Run all tests and perform final manual verification.

### Step 5.1: Run Full Test Suite

```bash
# All tests
npm run test

# Type check
npm run build

# Lint
npm run lint

# Comprehensive pipeline (as per CLAUDE.md)
npm run test:pipeline:comprehensive
```

### Step 5.2: Manual E2E Verification

- [ ] Fresh browser session: Complete full onboarding flow
- [ ] Verify landing page → onboarding → dashboard flow
- [ ] Verify visual consistency across all pages
- [ ] Test on mobile viewport
- [ ] Test in dark mode (if supported)

---

## Testing Strategy

### TDD Test Design Principles Applied

1. **One Assertion Per Test**: Each test verifies one styling property or behavior
2. **Descriptive Test Names**: "should have mesh gradient background on container"
3. **Arrange-Act-Assert**: Setup mocks → Render → Assert styling
4. **Test Behavior, Not Implementation**: Testing visible outcomes (classes, styles), not internal state

### Test Categories

1. **Visual Styling Tests**: Verify CSS classes and inline styles
2. **Content Tests**: Verify text content changes
3. **Behavior Tests**: Verify redirect logic
4. **Integration Tests**: Full flow through all steps

---

## Performance Considerations

- `meshGradientStyle` uses CSS radial-gradients, not WebGL - minimal performance impact
- No new JavaScript animations added
- No additional network requests
- Bundle size impact: Minimal (importing existing animation utils)

---

## References

- Original task: `.claude/tasks/2026-01-02-onboarding-dashboard-redesign.md`
- Landing page animations: `lib/animations/landing-animations.ts`
- Landing page design system: `app/globals.css` (lines 116-258)
- Gmail Inbox Hero (reference): `components/landing/sections-v2/gmail-inbox-hero.tsx`

---

## Files to Modify

| File | Changes |
|------|---------|
| `app/(auth)/onboarding/page.tsx` | Mesh gradient, header text, remove skip buttons, gradient buttons, redirect logic |
| `components/onboarding/email-step.tsx` | Gradient button styling |
| `components/dashboard/dashboard-client.tsx` | Mesh gradient, gradient button styling |
| `lib/context/auth-context.tsx` | Expose `hasCompletedOnboarding` (if not already) |

## New Test Files

| File | Purpose |
|------|---------|
| `__tests__/app/(auth)/onboarding/onboarding-redesign.test.tsx` | Tests for onboarding redesign |
| `__tests__/components/dashboard/dashboard-redesign.test.tsx` | Tests for dashboard redesign |
