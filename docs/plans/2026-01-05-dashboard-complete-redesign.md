# Complete Dashboard Redesign: Minimalist Apple/Stripe/Cursor-Inspired Interface

**Date**: 2026-01-05T08:50:00+11:00 (AEDT)
**Git Commit**: ca47a425e00407698936e274e48ca10fab0515be
**Branch**: main
**Repository**: tldrsec-ai

## Overview

A complete dashboard redesign that transforms the current multi-component, sidebar-based interface into a clean, minimalist single-page experience inspired by Apple, Stripe, and Cursor. The core philosophy: **users should focus ONLY on managing tracked tickers, filing preferences, and their subscription** - nothing else.

### Design Principles Applied

| Source | Principle | Application |
|--------|-----------|-------------|
| **Apple** | Clarity - limited elements | Remove sidebar, monitoring, reduce to essentials |
| **Apple** | Deference - content first | Table is hero, UI recedes |
| **Stripe** | Consistency over customization | Use landing-* design tokens throughout |
| **Linear** | Keyboard-first, minimal noise | Escape to cancel, immediate filtering |
| **Cursor** | Configuration through simplicity | In-table preferences, no dialogs |

## Current State Analysis

### What Exists Now
- **Sidebar**: Only contains "Dashboard" link (navItems has 1 item) + admin section
- **Dashboard Layout**: Fixed 256px sidebar + main content area
- **Ticker Management**: Dialog-based with CompanySearch component
- **Monitoring Components**: SystemHealthBanner + ProcessingStatus (admin clutter)
- **Billing Access**: Hidden - must navigate to `/dashboard/billing` via URL
- **Filing Preferences**: Separate dialog for each ticker

### Problems
1. Sidebar is **wasteful** - only 1 navigation item, yet takes 256px
2. Dialog for adding ticker is **friction** - modal interrupts flow
3. Monitoring components are **noise** - admin-level details irrelevant to users
4. Billing access is **hidden** - critical subscription management not visible
5. Filing preferences in **separate dialog** - should be inline

## Desired End State

### Single-Page Dashboard Structure

```
+------------------------------------------------------------------+
|  [tldrSEC Logo]                      [User Avatar] [Manage Plan] |
+------------------------------------------------------------------+
|                                                                  |
|  Your Tracked Companies                              [+ Add]     |
|  ─────────────────────────────────────────────────────────────── |
|  | Ticker | Company              | 10-K | 10-Q | 8-K | Form 4 | |
|  |--------|----------------------|------|------|-----|--------|  |
|  | AAPL   | Apple Inc.           |  ✓   |  ✓   |  ✓  |   ○    |  |
|  | MSFT   | Microsoft Corp       |  ✓   |  ✓   |  ○  |   ○    |  |
|  | [Search: Type to search...]   |      |      |     |        |  | <- Inline add row
|  +---------------------------------------------------------------+
|                                                                  |
|  [Empty state: "Track your first company to receive filing       |
|   summaries. Type a ticker or company name above."]              |
|                                                                  |
+------------------------------------------------------------------+
```

### Key UX Changes

1. **No sidebar** - Full-width layout, all navigation in header
2. **Inline ticker addition** - New row appears in table, type to search immediately
3. **Inline filing toggles** - Toggle 10-K/10-Q/8-K/Form 4 directly in table row
4. **Visible subscription button** - "Manage Plan" always visible in header
5. **No monitoring** - Removed entirely from user view
6. **Minimal header** - Logo + user avatar + plan management only

### Verification Criteria

- [ ] No sidebar visible on any screen size
- [ ] Dashboard is single full-width page
- [ ] "Add" button shows inline table row (not dialog)
- [ ] Filing type toggles are in each table row
- [ ] "Manage Plan" button visible in header, links to billing page
- [ ] No SystemHealthBanner or ProcessingStatus
- [ ] Escape key cancels inline add
- [ ] Results appear on first character typed
- [ ] Mobile view stacks cards, not table

## What We're NOT Doing

1. **NOT changing API endpoints** - All backend routes remain
2. **NOT changing data models** - Same Prisma schema
3. **NOT modifying billing page internals** - Just linking to it
4. **NOT adding dark mode** - Light theme only (matches landing)
5. **NOT implementing keyboard shortcuts** - Focus on mouse UX first
6. **NOT changing mobile bottom nav** - Header adapts to mobile

## Implementation Approach

### Elon's 5-Step Algorithm Applied

1. **Question Requirements**:
   - Do we need a sidebar for 1 nav item? **No** - DELETE
   - Do we need dialogs for add/preferences? **No** - INLINE
   - Do we need monitoring? **No** - DELETE
   - Do we need separate preferences dialog? **No** - INLINE TOGGLES

2. **Delete**:
   - Sidebar component usage (keep file for admin)
   - Dialog wrappers for add ticker
   - Dialog for preferences
   - SystemHealthBanner component
   - ProcessingStatus component
   - CompanySearch component (replaced by InlineTickerRow)

3. **Simplify**:
   - Single-page full-width layout
   - Table with inline editing
   - Header with 3 elements only

4. **Accelerate**:
   - Pre-fetch companies on mount
   - 100ms debounce (from 300ms)
   - Single character search trigger

5. **Automate**: N/A

---

## Phase 1: Remove Sidebar and Create Full-Width Layout

### Overview
Remove the sidebar completely and create a new minimal header with logo, user profile, and subscription management button.

### Step 1.1: Red - Write Failing Tests

**Test File**: `__tests__/components/dashboard/minimal-layout.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import DashboardLayout from '@/app/dashboard/layout';

// Mock Clerk
jest.mock('@clerk/nextjs', () => ({
  useUser: () => ({ user: { fullName: 'Test User' } }),
  UserButton: () => <div data-testid="user-button">User</div>,
}));

jest.mock('@/components/auth', () => ({
  ProtectedRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('Dashboard Layout - Minimal Design', () => {
  it('should NOT render a sidebar', () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );

    // Sidebar has fixed width of 256px (w-64)
    const sidebar = document.querySelector('[class*="md:w-64"]');
    expect(sidebar).toBeNull();
  });

  it('should NOT have left padding for sidebar on desktop', () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );

    // Main content should NOT have md:pl-64 class
    const main = document.querySelector('main');
    expect(main).not.toHaveClass('md:pl-64');
  });

  it('should render a minimal header with logo', () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );

    expect(screen.getByText('tldr')).toBeInTheDocument();
    expect(screen.getByText('SEC')).toBeInTheDocument();
  });

  it('should have Manage Plan button in header', () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );

    const managePlanButton = screen.getByRole('link', { name: /manage plan/i });
    expect(managePlanButton).toBeInTheDocument();
    expect(managePlanButton).toHaveAttribute('href', '/dashboard/billing');
  });

  it('should have user button in header', () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );

    expect(screen.getByTestId('user-button')).toBeInTheDocument();
  });

  it('should be full-width without sidebar offset', () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );

    const container = document.querySelector('.container');
    expect(container).toBeInTheDocument();
    // Should have max-w-5xl or similar, not offset by sidebar
  });
});
```

**Checkpoint 1.1**: Run tests - should FAIL:
```bash
npm run test -- --testPathPattern="minimal-layout"
# Expected: Failing (sidebar still exists)
```

### Step 1.2: Green - Create Minimal Header Component

#### 1.2.1 Create MinimalHeader component
**File**: `components/layout/minimal-header.tsx`

```typescript
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CreditCard } from "lucide-react";
import UserButton from "@/components/auth/user-button";

export function MinimalHeader() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-[var(--landing-border)] bg-[var(--landing-bg)]">
      <div className="container max-w-5xl mx-auto flex h-14 items-center justify-between px-4 md:px-6">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center font-semibold">
          <span className="text-[var(--landing-primary)] font-bold text-lg">tldr</span>
          <span className="font-bold text-lg">SEC</span>
        </Link>

        {/* Right side: Manage Plan + User */}
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            asChild
            className="hidden sm:flex"
          >
            <Link href="/dashboard/billing">
              <CreditCard className="h-4 w-4 mr-2" />
              Manage Plan
            </Link>
          </Button>

          {/* Mobile: icon only */}
          <Button
            variant="ghost"
            size="icon"
            asChild
            className="sm:hidden"
          >
            <Link href="/dashboard/billing" aria-label="Manage Plan">
              <CreditCard className="h-5 w-5" />
            </Link>
          </Button>

          <UserButton afterSignOutUrl="/sign-in" />
        </div>
      </div>
    </header>
  );
}
```

**Checkpoint 1.2.1**: Component created, build should pass:
```bash
npm run build
```

#### 1.2.2 Update Dashboard Layout to use MinimalHeader
**File**: `app/dashboard/layout.tsx`

```typescript
"use client";

import { MinimalHeader } from "@/components/layout/minimal-header";
import { ProtectedRoute } from "@/components/auth";
import { ErrorHandler } from "@/components/ui/error-handler";
import { Suspense } from "react";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <ProtectedRoute>
      <Suspense fallback={null}>
        <ErrorHandler />
      </Suspense>
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--landing-bg)' }}>
        <MinimalHeader />
        <main className="flex-1" style={{ backgroundColor: 'var(--landing-bg)' }}>
          <div className="container max-w-5xl mx-auto py-8 px-4 md:px-6">
            {children}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
```

**Checkpoint 1.2.2**: Layout updated, tests should pass:
```bash
npm run test -- --testPathPattern="minimal-layout"
# Expected: All passing
```

### Step 1.3: Refactor

- [ ] Remove Sidebar import from layout
- [ ] Keep sidebar.tsx file (may be needed for admin routes later)
- [ ] Ensure consistent max-width (5xl = 64rem = 1024px)
- [ ] Verify mobile responsiveness

**Checkpoint 1.3**: Lint and build pass:
```bash
npm run lint && npm run build
```

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [ ] Layout tests pass
- [ ] Build passes: `npm run build`
- [ ] Lint passes: `npm run lint`

#### Manual Verification:
- [ ] No sidebar visible on desktop
- [ ] No hamburger menu on mobile
- [ ] Header shows logo, Manage Plan, user avatar
- [ ] "Manage Plan" links to /dashboard/billing
- [ ] Content is centered and full-width
- [ ] Mobile shows icon-only for Manage Plan

**STOP**: Await manual confirmation before Phase 2.

---

## Phase 2: Remove Monitoring Components

### Overview
Delete SystemHealthBanner and ProcessingStatus from the dashboard to eliminate admin-level noise.

### Step 2.1: Red - Write Failing Tests

**Test File**: `__tests__/components/dashboard/no-monitoring.test.tsx`

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import { DashboardClient } from '@/components/dashboard/dashboard-client';

// Mocks
jest.mock('@/lib/hooks/use-async', () => ({
  useAsync: () => ({
    execute: jest.fn().mockResolvedValue({ data: [] }),
    isLoading: false,
    error: null
  })
}));

describe('DashboardClient - No Monitoring', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ companies: [] })
    });
  });

  it('should NOT render SystemHealthBanner', () => {
    render(<DashboardClient />);

    // SystemHealthBanner has role="status"
    const banner = screen.queryByRole('status');
    expect(banner).toBeNull();
  });

  it('should NOT render ProcessingStatus', () => {
    render(<DashboardClient />);

    // ProcessingStatus has "Filing Processing Status" text
    const status = screen.queryByText('Filing Processing Status');
    expect(status).toBeNull();
  });

  it('should NOT make API calls to /api/system/*', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');

    render(<DashboardClient />);

    await waitFor(() => {
      const systemCalls = fetchSpy.mock.calls.filter(
        call => call[0]?.toString().includes('/api/system/')
      );
      expect(systemCalls).toHaveLength(0);
    });
  });
});
```

**Checkpoint 2.1**: Tests FAIL (monitoring still rendered):
```bash
npm run test -- --testPathPattern="no-monitoring"
```

### Step 2.2: Green - Remove Monitoring

#### 2.2.1 Remove imports and JSX
**File**: `components/dashboard/dashboard-client.tsx`

Remove these lines:
```typescript
// DELETE these imports (around line 41-42):
// import { SystemHealthBanner } from "@/components/dashboard/system-health-banner";
// import { ProcessingStatus } from "@/components/dashboard/processing-status";

// DELETE these JSX elements (around line 315-317):
// {/* System Health & Status */}
// <SystemHealthBanner />
// <ProcessingStatus />
```

**Checkpoint 2.2.1**: Tests pass:
```bash
npm run test -- --testPathPattern="no-monitoring"
```

### Step 2.3: Final Phase Verification

#### Automated Verification:
- [ ] Tests pass
- [ ] Build passes
- [ ] Lint passes

#### Manual Verification:
- [ ] Dashboard loads without any system status banners
- [ ] No console errors

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: Inline Filing Preferences in Table

### Overview
Replace the preferences dialog with inline toggle switches directly in the table row, allowing users to toggle 10-K, 10-Q, 8-K, Form 4 preferences without leaving context.

### Step 3.1: Red - Write Failing Tests

**Test File**: `__tests__/components/dashboard/inline-preferences.test.tsx`

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardClient } from '@/components/dashboard/dashboard-client';

const mockCompanies = [
  {
    id: '1',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    lastFiling: '10-K',
    lastFilingDate: '2025-01-01',
    preferences: { tenK: true, tenQ: true, eightK: true, form4: false, other: false }
  }
];

beforeEach(() => {
  global.fetch = jest.fn().mockImplementation((url) => {
    if (url.includes('/api/user/tickers')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: mockCompanies })
      });
    }
    if (url.includes('/api/companies/list')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ companies: [] })
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
});

describe('Dashboard - Inline Preferences', () => {
  it('should show filing type toggles in table row', async () => {
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    // Should have toggle switches for filing types
    const toggles = screen.getAllByRole('switch');
    expect(toggles.length).toBeGreaterThanOrEqual(4); // 10-K, 10-Q, 8-K, Form 4
  });

  it('should NOT open preferences dialog when clicking settings', async () => {
    const user = userEvent.setup();

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    // Settings icon should not exist or clicking it should not open dialog
    const settingsButton = screen.queryByRole('button', { name: /preferences/i });
    if (settingsButton) {
      await user.click(settingsButton);
      // Dialog should not appear
      const dialog = screen.queryByRole('dialog');
      expect(dialog).toBeNull();
    }
  });

  it('should toggle 10-K preference inline', async () => {
    const user = userEvent.setup();

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    // Find the 10-K toggle (first one for AAPL row)
    const tenKToggle = screen.getAllByRole('switch')[0];
    expect(tenKToggle).toBeChecked();

    await user.click(tenKToggle);

    // Should make API call to update preferences
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/user/tickers'),
        expect.objectContaining({ method: 'PUT' })
      );
    });
  });

  it('should show column headers for filing types', async () => {
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    expect(screen.getByText('10-K')).toBeInTheDocument();
    expect(screen.getByText('10-Q')).toBeInTheDocument();
    expect(screen.getByText('8-K')).toBeInTheDocument();
    expect(screen.getByText('Form 4')).toBeInTheDocument();
  });
});
```

**Checkpoint 3.1**: Tests FAIL:
```bash
npm run test -- --testPathPattern="inline-preferences"
```

### Step 3.2: Green - Implement Inline Preferences

#### 3.2.1 Update table columns with inline toggles
**File**: `components/dashboard/dashboard-client.tsx`

Update the columns definition to include filing preference toggles:

```typescript
// Add at top of file
import { Switch } from "@/components/ui/switch";

// Update columns definition (around line 229)
const columns = useMemo(() => [
  columnHelper.accessor('symbol', {
    header: () => <span className="font-medium">Ticker</span>,
    cell: info => <div className="font-semibold">{info.getValue()}</div>,
    size: 80,
  }),
  columnHelper.accessor('name', {
    header: () => <span className="font-medium">Company</span>,
    cell: info => (
      <div className="text-sm text-muted-foreground truncate max-w-[200px]">
        {info.getValue()}
      </div>
    ),
  }),
  // Filing type toggles
  columnHelper.accessor(row => row.preferences?.tenK, {
    id: 'tenK',
    header: () => <span className="text-xs font-medium text-center block">10-K</span>,
    cell: info => (
      <div className="flex justify-center">
        <Switch
          checked={info.getValue() ?? true}
          onCheckedChange={(checked) => handleInlinePreferenceChange(info.row.original, 'tenK', checked)}
          aria-label={`Toggle 10-K for ${info.row.original.symbol}`}
        />
      </div>
    ),
    size: 60,
  }),
  columnHelper.accessor(row => row.preferences?.tenQ, {
    id: 'tenQ',
    header: () => <span className="text-xs font-medium text-center block">10-Q</span>,
    cell: info => (
      <div className="flex justify-center">
        <Switch
          checked={info.getValue() ?? true}
          onCheckedChange={(checked) => handleInlinePreferenceChange(info.row.original, 'tenQ', checked)}
          aria-label={`Toggle 10-Q for ${info.row.original.symbol}`}
        />
      </div>
    ),
    size: 60,
  }),
  columnHelper.accessor(row => row.preferences?.eightK, {
    id: 'eightK',
    header: () => <span className="text-xs font-medium text-center block">8-K</span>,
    cell: info => (
      <div className="flex justify-center">
        <Switch
          checked={info.getValue() ?? true}
          onCheckedChange={(checked) => handleInlinePreferenceChange(info.row.original, 'eightK', checked)}
          aria-label={`Toggle 8-K for ${info.row.original.symbol}`}
        />
      </div>
    ),
    size: 60,
  }),
  columnHelper.accessor(row => row.preferences?.form4, {
    id: 'form4',
    header: () => <span className="text-xs font-medium text-center block">Form 4</span>,
    cell: info => (
      <div className="flex justify-center">
        <Switch
          checked={info.getValue() ?? false}
          onCheckedChange={(checked) => handleInlinePreferenceChange(info.row.original, 'form4', checked)}
          aria-label={`Toggle Form 4 for ${info.row.original.symbol}`}
        />
      </div>
    ),
    size: 60,
  }),
  columnHelper.accessor(row => row, {
    id: 'actions',
    header: () => null,
    cell: info => (
      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
          setCurrentCompany(info.getValue());
          setIsDeleteDialogOpen(true);
        }}
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
        aria-label={`Delete ${info.getValue().symbol}`}
      >
        <Trash2Icon className="h-4 w-4" />
      </Button>
    ),
    size: 40,
  }),
], [handleInlinePreferenceChange]);
```

#### 3.2.2 Add inline preference change handler
**File**: `components/dashboard/dashboard-client.tsx`

```typescript
// Add this handler (after handleUpdatePreferences, around line 213)
const handleInlinePreferenceChange = useCallback(async (
  company: Company,
  preferenceKey: keyof Company['preferences'],
  value: boolean
) => {
  // Optimistic update
  setCompanies(prev => prev.map(c =>
    c.id === company.id
      ? { ...c, preferences: { ...c.preferences, [preferenceKey]: value } }
      : c
  ));

  try {
    const updatedPreferences = {
      ...company.preferences,
      [preferenceKey]: value
    };

    await executeUpdatePreferences(() =>
      updateCompanyPreferences(company.symbol, updatedPreferences)
    );

    // Subtle success feedback - no toast for inline toggles
  } catch (error) {
    // Revert on error
    setCompanies(prev => prev.map(c =>
      c.id === company.id
        ? { ...c, preferences: { ...c.preferences, [preferenceKey]: !value } }
        : c
    ));
    toast.error(`Failed to update ${preferenceKey} preference`);
  }
}, [executeUpdatePreferences]);
```

#### 3.2.3 Remove preferences dialog
**File**: `components/dashboard/dashboard-client.tsx`

Remove:
- `isPreferencesOpen` state
- `setIsPreferencesOpen` calls
- `handlePreferenceChange` function
- The entire preferences Dialog component (lines 525-615)
- Settings icon button from table actions

**Checkpoint 3.2.3**: Tests pass:
```bash
npm run test -- --testPathPattern="inline-preferences"
```

### Step 3.3: Refactor

- [ ] Remove unused state: `isPreferencesOpen`
- [ ] Remove unused handler: `handlePreferenceChange`
- [ ] Remove SettingsIcon import if not used elsewhere
- [ ] Ensure table is horizontally scrollable on mobile

**Checkpoint 3.3**: Lint and build pass:
```bash
npm run lint && npm run build
```

### Step 3.4: Final Phase Verification

#### Automated Verification:
- [ ] Tests pass
- [ ] Build passes
- [ ] Lint passes

#### Manual Verification:
- [ ] Filing type toggles visible in table row
- [ ] No settings icon/button
- [ ] No preferences dialog opens
- [ ] Toggling updates immediately (optimistic)
- [ ] Toggle state persists after refresh
- [ ] Mobile view handles toggles appropriately

**STOP**: Await manual confirmation before Phase 4.

---

## Phase 4: Inline Ticker Addition as Table Row

### Overview
Replace the dialog-based ticker addition with an inline row that appears at the top of the table. User types directly, results appear immediately, selection adds the row.

### Step 4.1: Red - Write Failing Tests

**Test File**: `__tests__/components/dashboard/inline-add-row.test.tsx`

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardClient } from '@/components/dashboard/dashboard-client';

const mockCompanies = [
  { symbol: 'AAPL', name: 'Apple Inc.', cik: '0000320193' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', cik: '0000789019' },
];

const mockTracked = [
  {
    id: '1',
    symbol: 'TSLA',
    name: 'Tesla Inc.',
    preferences: { tenK: true, tenQ: true, eightK: true, form4: false, other: false }
  }
];

beforeEach(() => {
  global.fetch = jest.fn().mockImplementation((url) => {
    if (url === '/api/companies/list') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ companies: mockCompanies })
      });
    }
    if (url.includes('/api/user/tickers') && !url.includes('POST')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: mockTracked })
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
});

describe('Dashboard - Inline Add Row', () => {
  it('should NOT open dialog when Add button is clicked', async () => {
    const user = userEvent.setup();

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText('TSLA')).toBeInTheDocument();
    });

    const addButton = screen.getByRole('button', { name: /add/i });
    await user.click(addButton);

    // No dialog should appear
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('should show inline search row in table when Add is clicked', async () => {
    const user = userEvent.setup();

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText('TSLA')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /add/i }));

    // Inline search input should appear
    await waitFor(() => {
      const searchInput = screen.getByPlaceholderText(/search/i);
      expect(searchInput).toBeInTheDocument();
    });
  });

  it('should show results on first character typed', async () => {
    const user = userEvent.setup();

    render(<DashboardClient />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/companies/list');
    });

    await user.click(screen.getByRole('button', { name: /add/i }));

    const searchInput = await screen.findByPlaceholderText(/search/i);
    await user.type(searchInput, 'A');

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    });
  });

  it('should add ticker and close inline row when result selected', async () => {
    const user = userEvent.setup();

    (global.fetch as jest.Mock).mockImplementation((url, options) => {
      if (url === '/api/companies/list') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ companies: mockCompanies })
        });
      }
      if (url.includes('/api/user/tickers') && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: { id: '2', symbol: 'AAPL', name: 'Apple Inc.' } })
        });
      }
      if (url.includes('/api/user/tickers')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: mockTracked })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    render(<DashboardClient />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/companies/list');
    });

    await user.click(screen.getByRole('button', { name: /add/i }));

    const searchInput = await screen.findByPlaceholderText(/search/i);
    await user.type(searchInput, 'AAPL');

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    // Click the result
    const result = screen.getByText('Apple Inc.').closest('[role="option"]');
    await user.click(result!);

    // Inline row should close
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
    });
  });

  it('should close inline row when Escape is pressed', async () => {
    const user = userEvent.setup();

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText('TSLA')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /add/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
    });
  });

  it('should close inline row when Cancel is clicked', async () => {
    const user = userEvent.setup();

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText('TSLA')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /add/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
    });
  });
});
```

**Checkpoint 4.1**: Tests FAIL:
```bash
npm run test -- --testPathPattern="inline-add-row"
```

### Step 4.2: Green - Implement Inline Add Row

#### 4.2.1 Create InlineAddRow component
**File**: `components/dashboard/inline-add-row.tsx`

```typescript
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TableRow, TableCell } from "@/components/ui/table";
import { SearchIcon, X, Loader2 } from "lucide-react";
import { TickerSearchResult } from "@/lib/api/types";

interface InlineAddRowProps {
  companies: TickerSearchResult[];
  onSelect: (symbol: string, name: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
  columnCount: number;
}

export function InlineAddRow({
  companies,
  onSelect,
  onCancel,
  isLoading = false,
  columnCount
}: InlineAddRowProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<TickerSearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLTableRowElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
      if (e.key === 'ArrowDown' && results.length > 0) {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
      }
      if (e.key === 'ArrowUp' && results.length > 0) {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      }
      if (e.key === 'Enter' && selectedIndex >= 0 && results[selectedIndex]) {
        e.preventDefault();
        const result = results[selectedIndex];
        onSelect(result.symbol, result.name);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, onSelect, results, selectedIndex]);

  // Filter companies with 100ms debounce
  const filterCompanies = useCallback((query: string) => {
    if (query.length < 1) {
      setResults([]);
      setShowResults(false);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const filtered = companies
      .filter(company =>
        company.symbol.toLowerCase().includes(lowerQuery) ||
        company.name.toLowerCase().includes(lowerQuery)
      )
      .slice(0, 8); // Limit to 8 results for inline display

    setResults(filtered);
    setShowResults(true);
    setSelectedIndex(-1);
  }, [companies]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);

    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    debounceTimeout.current = setTimeout(() => {
      filterCompanies(value);
    }, 100);
  };

  return (
    <>
      <TableRow ref={containerRef} className="bg-muted/30 hover:bg-muted/30">
        <TableCell colSpan={columnCount} className="py-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                ref={inputRef}
                type="search"
                placeholder="Search by ticker or company name..."
                className="pl-8 h-9 bg-background"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                disabled={isLoading}
              />

              {/* Dropdown results */}
              {showResults && results.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-50 max-h-64 overflow-auto">
                  {results.map((result, index) => (
                    <div
                      key={result.symbol}
                      role="option"
                      aria-selected={index === selectedIndex}
                      className={`px-3 py-2 cursor-pointer flex justify-between items-center ${
                        index === selectedIndex
                          ? 'bg-accent'
                          : 'hover:bg-accent/50'
                      }`}
                      onClick={() => onSelect(result.symbol, result.name)}
                    >
                      <div>
                        <span className="font-semibold">{result.symbol}</span>
                        <span className="text-muted-foreground ml-2 text-sm">{result.name}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {showResults && searchQuery.length >= 1 && results.length === 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg z-50 p-3 text-center text-muted-foreground text-sm">
                  No results found
                </div>
              )}
            </div>

            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="text-muted-foreground"
            >
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
          </div>
        </TableCell>
      </TableRow>
    </>
  );
}
```

#### 4.2.2 Integrate InlineAddRow into DashboardClient
**File**: `components/dashboard/dashboard-client.tsx`

Key changes:
1. Add `showInlineAdd` state
2. Pre-fetch companies on mount
3. Replace Dialog with inline row in table
4. Update Add button to toggle inline row

```typescript
// Add state
const [showInlineAdd, setShowInlineAdd] = useState(false);
const [allCompanies, setAllCompanies] = useState<TickerSearchResult[]>([]);
const [companiesLoaded, setCompaniesLoaded] = useState(false);

// Add useEffect to prefetch companies
useEffect(() => {
  const prefetchCompanies = async () => {
    try {
      const response = await fetch('/api/companies/list');
      if (response.ok) {
        const data = await response.json();
        if (data.companies && Array.isArray(data.companies)) {
          setAllCompanies(data.companies);
          setCompaniesLoaded(true);
        }
      }
    } catch (error) {
      console.error('Error prefetching companies:', error);
    }
  };
  prefetchCompanies();
}, []);

// Update handleAddTicker to close inline row
const handleAddTicker = async (symbol: string, name: string) => {
  setShowInlineAdd(false); // Close inline row instead of dialog
  // ... rest of handler unchanged
};

// Update Add button in render
<Button
  onClick={() => setShowInlineAdd(true)}
  className="gap-1"
  data-tutorial="add-ticker"
  disabled={showInlineAdd}
>
  <PlusIcon className="h-4 w-4 mr-2" />
  <span className="hidden sm:inline">Add Ticker</span>
  <span className="inline sm:hidden">Add</span>
</Button>

// In table body, add InlineAddRow as first row when active
<TableBody>
  {showInlineAdd && (
    <InlineAddRow
      companies={allCompanies}
      onSelect={handleAddTicker}
      onCancel={() => setShowInlineAdd(false)}
      isLoading={!companiesLoaded}
      columnCount={columns.length}
    />
  )}
  {/* ... existing rows */}
</TableBody>
```

#### 4.2.3 Remove Dialog wrapper and CompanySearch
**File**: `components/dashboard/dashboard-client.tsx`

Remove:
- `isAddTickerOpen` state
- Dialog imports related to add ticker
- Both Dialog wrappers (toolbar and empty state)
- CompanySearch import

**Checkpoint 4.2.3**: Tests pass:
```bash
npm run test -- --testPathPattern="inline-add-row"
```

### Step 4.3: Refactor

- [ ] Remove CompanySearch import
- [ ] Remove unused Dialog imports if no longer needed
- [ ] Rename state: `isAddTickerOpen` → `showInlineAdd`
- [ ] Clean up any commented code

**Checkpoint 4.3**: Lint and build pass:
```bash
npm run lint && npm run build
```

### Step 4.4: Final Phase Verification

#### Automated Verification:
- [ ] Tests pass
- [ ] Build passes
- [ ] Lint passes

#### Manual Verification:
- [ ] Click "Add" shows inline row in table (not dialog)
- [ ] Typing 1 character shows results
- [ ] Arrow keys navigate results
- [ ] Enter selects highlighted result
- [ ] Click selects result
- [ ] Escape closes inline row
- [ ] Cancel button closes inline row
- [ ] Empty state shows inline search when clicked
- [ ] Mobile responsive

**STOP**: Await manual confirmation before Phase 5.

---

## Phase 5: Mobile Card View with Inline Editing

### Overview
Update the mobile card view to include inline filing toggles and the inline add pattern.

### Step 5.1: Red - Write Failing Tests

**Test File**: `__tests__/components/dashboard/mobile-cards.test.tsx`

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardClient } from '@/components/dashboard/dashboard-client';

// Set mobile viewport
beforeAll(() => {
  Object.defineProperty(window, 'innerWidth', { value: 375 });
});

const mockTracked = [
  {
    id: '1',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    preferences: { tenK: true, tenQ: true, eightK: false, form4: false, other: false }
  }
];

beforeEach(() => {
  global.fetch = jest.fn().mockImplementation((url) => {
    if (url === '/api/companies/list') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ companies: [] }) });
    }
    if (url.includes('/api/user/tickers')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: mockTracked }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  });
});

describe('Dashboard - Mobile Card View', () => {
  it('should show filing toggles in mobile card', async () => {
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    // Should have toggles visible in card
    const toggles = screen.getAllByRole('switch');
    expect(toggles.length).toBeGreaterThanOrEqual(4);
  });

  it('should show inline add in mobile view', async () => {
    const user = userEvent.setup();

    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /add/i }));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });
  });
});
```

### Step 5.2: Green - Update Mobile Cards

**File**: `components/dashboard/dashboard-client.tsx`

Update the mobile card view to include inline toggles:

```typescript
{/* Mobile Card View */}
<div className="sm:hidden space-y-3">
  {showInlineAdd && (
    <div className="p-3 bg-muted/30 rounded-lg border border-dashed">
      {/* Mobile inline search */}
      <div className="relative">
        <SearchIcon className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search ticker or company..."
          className="pl-8 h-9"
          // ... handlers
        />
      </div>
      {/* Results dropdown */}
    </div>
  )}

  {companies.map(company => (
    <div key={company.id} className="landing-card p-4">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-semibold">{company.symbol}</h3>
          <p className="text-sm text-muted-foreground">{company.name}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setCurrentCompany(company);
            setIsDeleteDialogOpen(true);
          }}
          className="h-8 w-8 text-muted-foreground"
        >
          <Trash2Icon className="h-4 w-4" />
        </Button>
      </div>

      {/* Inline filing toggles for mobile */}
      <div className="grid grid-cols-4 gap-2 pt-2 border-t">
        <div className="flex flex-col items-center">
          <span className="text-xs text-muted-foreground mb-1">10-K</span>
          <Switch
            checked={company.preferences?.tenK ?? true}
            onCheckedChange={(checked) => handleInlinePreferenceChange(company, 'tenK', checked)}
          />
        </div>
        <div className="flex flex-col items-center">
          <span className="text-xs text-muted-foreground mb-1">10-Q</span>
          <Switch
            checked={company.preferences?.tenQ ?? true}
            onCheckedChange={(checked) => handleInlinePreferenceChange(company, 'tenQ', checked)}
          />
        </div>
        <div className="flex flex-col items-center">
          <span className="text-xs text-muted-foreground mb-1">8-K</span>
          <Switch
            checked={company.preferences?.eightK ?? true}
            onCheckedChange={(checked) => handleInlinePreferenceChange(company, 'eightK', checked)}
          />
        </div>
        <div className="flex flex-col items-center">
          <span className="text-xs text-muted-foreground mb-1">Form 4</span>
          <Switch
            checked={company.preferences?.form4 ?? false}
            onCheckedChange={(checked) => handleInlinePreferenceChange(company, 'form4', checked)}
          />
        </div>
      </div>
    </div>
  ))}
</div>
```

### Step 5.3: Final Phase Verification

#### Automated Verification:
- [ ] All tests pass: `npm run test`
- [ ] Build passes: `npm run build`
- [ ] Lint passes: `npm run lint`

#### Manual Verification:
- [ ] Mobile cards show filing toggles
- [ ] Toggles work correctly on mobile
- [ ] Inline add works on mobile
- [ ] Delete still works
- [ ] Cards are well-spaced and readable

**STOP**: Await manual confirmation before Phase 6.

---

## Phase 6: Final Cleanup and Polish

### Overview
Delete old components, ensure design consistency, and polish the final UI.

### Step 6.1: Delete Old Components

Files to delete:
- [ ] `components/dashboard/company-search.tsx` (replaced by InlineAddRow)
- [ ] `components/dashboard/system-health-banner.tsx` (removed)
- [ ] `components/dashboard/processing-status.tsx` (removed)

Verify before deleting:
```bash
grep -r "company-search" --include="*.tsx" --include="*.ts" components/ app/
grep -r "system-health-banner" --include="*.tsx" --include="*.ts" components/ app/
grep -r "processing-status" --include="*.tsx" --include="*.ts" components/ app/
```

### Step 6.2: Ensure Design Consistency

Verify all elements use landing-* design tokens:
- [ ] `var(--landing-bg)` for backgrounds
- [ ] `var(--landing-border)` for borders
- [ ] `var(--landing-primary)` for accents
- [ ] `var(--landing-text)` for body text
- [ ] `var(--landing-text-muted)` for secondary text

### Step 6.3: Final Verification

#### Automated Verification:
- [ ] Full test suite passes: `npm run test`
- [ ] Build passes: `npm run build`
- [ ] Lint passes: `npm run lint`
- [ ] E2E tests pass: `npm run test:e2e`

#### Manual Verification:
- [ ] Complete user journey: Sign in → Dashboard → Add ticker → Edit preferences → Delete ticker
- [ ] Manage Plan button works on desktop and mobile
- [ ] No console errors
- [ ] Performance feels snappy
- [ ] Empty state looks clean
- [ ] Mobile experience is smooth

---

## Testing Strategy

### Test Categories

1. **Layout Tests**: Verify no sidebar, minimal header present
2. **Monitoring Tests**: Verify no system status components
3. **Preference Tests**: Verify inline toggles work
4. **Add Row Tests**: Verify inline search in table
5. **Mobile Tests**: Verify card view with toggles
6. **Integration Tests**: Full user flow

### Manual Testing Checklist

Desktop:
- [ ] No sidebar
- [ ] Header with logo, Manage Plan, user
- [ ] Table with inline toggles
- [ ] Add button shows inline row
- [ ] Search works on 1 char
- [ ] Escape closes inline row
- [ ] Toggles update immediately

Mobile:
- [ ] No hamburger menu
- [ ] Header adapts (icon-only for Manage Plan)
- [ ] Cards with inline toggles
- [ ] Inline add works
- [ ] Touch-friendly toggle size

---

## Performance Considerations

1. **Company prefetch**: ~10k companies loaded on dashboard mount
2. **Optimistic updates**: UI updates before API confirms
3. **100ms debounce**: Fast enough to feel instant
4. **Limited results**: 8 results inline vs 50 in dialog
5. **No monitoring API calls**: 2 fewer requests per dashboard load

---

## Migration Notes

None required - this is a UI redesign that doesn't change data models or APIs.

---

## Files Summary

### New Files
- `components/layout/minimal-header.tsx`
- `components/dashboard/inline-add-row.tsx`

### Modified Files
- `app/dashboard/layout.tsx` - Remove sidebar, add MinimalHeader
- `components/dashboard/dashboard-client.tsx` - Major refactor

### Deleted Files
- `components/dashboard/company-search.tsx`
- `components/dashboard/system-health-banner.tsx`
- `components/dashboard/processing-status.tsx`

### Kept (not used in dashboard but may be needed)
- `components/layout/sidebar.tsx` - For admin routes

---

## References

- Research: [thoughts/shared/research/2026-01-05-dashboard-redesign-inspiration.md](thoughts/shared/research/2026-01-05-dashboard-redesign-inspiration.md)
- Apple HIG: https://developer.apple.com/design/human-interface-guidelines/
- Stripe Apps: https://docs.stripe.com/stripe-apps/patterns
- Linear Design: https://linear.app/now/how-we-redesigned-the-linear-ui
