# Complete Dashboard Redesign: Minimalist Apple/Stripe/Cursor Inspired Interface

**Date**: 2026-01-05T08:45:00+11:00 (AEDT)
**Git Commit**: ca47a425e00407698936e274e48ca10fab0515be
**Branch**: main
**Repository**: tldrsec-ai

## Overview

A complete dashboard redesign embracing the minimalist design philosophy of Apple, Stripe, and Cursor. The goal is to eliminate noise, reduce friction, and focus the user's attention on exactly two things:

1. **Managing tracked tickers** and their filing preferences
2. **Managing their subscription**

Everything else is removed or hidden.

## Current State Analysis

### Problems with Current Dashboard

1. **Unnecessary Sidebar**
   - Only contains ONE navigation item ("Dashboard")
   - Takes 256px of horizontal space on desktop
   - Creates visual clutter with admin sections most users never see
   - Has no purpose - there's nowhere to navigate to

2. **Dialog-based Ticker Addition**
   - Opens modal dialog - disrupts user flow
   - Requires 2 characters before search results appear
   - 300ms debounce feels sluggish

3. **Monitoring Component Clutter**
   - `SystemHealthBanner` - admin-level info users don't need
   - `ProcessingStatus` - technical metrics that add noise

4. **Hidden Subscription Management**
   - No link to billing page in sidebar
   - Users must know URL `/dashboard/billing` to access it
   - Critical functionality is invisible

5. **Excessive Page Structure**
   - Multiple dashboard sub-pages (summaries, usage, email-logs, settings)
   - None are linked from sidebar anyway
   - Creates maintenance burden without user benefit

### Design Inspiration Analysis (from research document)

**Apple**:
- Generous whitespace, content breathes
- Single focus per view
- Subtle shadows and rounded corners
- Information hierarchy through typography

**Stripe**:
- Clean data tables with minimal chrome
- Inline actions, no modal dialogs
- Clear CTAs with purposeful color
- Progressive disclosure

**Cursor**:
- Dark mode first, high contrast
- Keyboard-first interactions
- Minimal UI elements
- Information density when needed

## Desired End State

### Single-Page Dashboard Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Header Bar                                                       │
│  ┌────────┐                              ┌──────────────────────┐│
│  │ tldrSEC│                              │ Manage Subscription  ││
│  └────────┘                              └──────────────────────┘│
│                                          ┌──────┐ ┌─────────────┐│
│                                          │Avatar│ │ User Name   ││
│                                          └──────┘ │ Pro Plan    ││
│                                                   └─────────────┘│
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Tracked Tickers                                    [+ Add Ticker]│
│  ─────────────────────────────────────────────────────────────── │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ [Inline Search Row - appears when Add Ticker clicked]      │  │
│  │ 🔍 Search by ticker or company...              [Cancel]    │  │
│  │ ┌─────────────────────────────────────────────────────┐    │  │
│  │ │ AAPL  Apple Inc.                              [+]   │    │  │
│  │ │ AMZN  Amazon.com Inc.                         [+]   │    │  │
│  │ └─────────────────────────────────────────────────────┘    │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌────────┬─────────────────────────┬──────────────┬──────────┐  │
│  │ Ticker │ Company                 │ Filing Types │ Actions  │  │
│  ├────────┼─────────────────────────┼──────────────┼──────────┤  │
│  │ AAPL   │ Apple Inc.              │ 10-K 10-Q 8-K│ ⚙️  🗑️   │  │
│  │ MSFT   │ Microsoft Corporation   │ 10-K 10-Q    │ ⚙️  🗑️   │  │
│  │ NVDA   │ NVIDIA Corporation      │ All          │ ⚙️  🗑️   │  │
│  └────────┴─────────────────────────┴──────────────┴──────────┘  │
│                                                                   │
│  ─────────────────────────────────────────────────────────────── │
│                           Footer (minimal)                        │
└──────────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **No Sidebar** - Full-width content, no wasted horizontal space
2. **Inline Everything** - Add ticker appears as first table row, not dialog
3. **Instant Feedback** - Search results on first keystroke
4. **Clear CTA** - "Manage Subscription" button always visible in header
5. **Minimal Chrome** - No monitoring banners, no processing status
6. **Single Focus** - One page for tracked tickers, that's it

### Verification Criteria

- [ ] No sidebar visible on any screen size
- [ ] "Manage Subscription" button in header, links to `/dashboard/billing`
- [ ] Clicking "Add Ticker" inserts a new row at top of table (not dialog)
- [ ] Search results appear on single character input
- [ ] No `SystemHealthBanner` or `ProcessingStatus` visible
- [ ] User avatar and name visible in header
- [ ] Mobile view works without hamburger menu (full-width layout)
- [ ] Escape key or Cancel button closes inline search row
- [ ] Successfully added ticker appears in table immediately

## What We're NOT Doing

1. **NOT keeping sub-pages** - Summaries, usage, email-logs pages will be inaccessible (can revisit later)
2. **NOT changing API endpoints** - Backend stays exactly the same
3. **NOT modifying billing page** - It remains at `/dashboard/billing`, just needs a link
4. **NOT removing admin monitoring route** - `/dashboard/monitoring` stays for admins (accessed via URL)
5. **NOT adding dark mode** - Keep current light theme
6. **NOT changing mobile breakpoints** - Same responsive behavior, just simpler layout

## Implementation Approach

### Elon's 5-Step Algorithm Applied

1. **Question Requirements**:
   - Do we need a sidebar? **No** - only one nav item, no value
   - Do we need sub-pages? **No** - users don't navigate to them anyway
   - Do we need monitoring components? **No** - admin clutter for end users
   - Do we need dialogs for adding tickers? **No** - inline is faster
   - Do we need 2-char minimum for search? **No** - instant is better

2. **Delete**:
   - Sidebar component from dashboard layout
   - SystemHealthBanner usage
   - ProcessingStatus usage
   - Dialog wrapper for add ticker
   - 2-character minimum search requirement

3. **Simplify**:
   - Single header bar with logo, subscription button, user info
   - One table for tickers
   - Inline search row (not dialog)
   - Direct navigation to billing via button

4. **Accelerate**:
   - Pre-fetch company data on page load
   - Reduce debounce to 100ms
   - Single character triggers search

5. **Automate**: N/A for this UX change

---

## Phase 1: Remove Sidebar and Create Header-Based Layout

### Overview
Remove the sidebar entirely and create a clean header bar with logo, subscription button, and user profile.

### Step 1.1: Red - Write Failing Tests

**Test File**: `__tests__/components/dashboard/dashboard-layout-no-sidebar.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';

// Mock Clerk
jest.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    user: { fullName: 'Test User', imageUrl: null }
  }),
  UserButton: () => <div data-testid="user-button">UserButton</div>
}));

// Mock admin status
jest.mock('@/lib/hooks/use-admin-status', () => ({
  useAdminStatus: () => ({ isAdmin: false, loading: false })
}));

describe('Dashboard Layout - No Sidebar', () => {
  it('should NOT render a sidebar element', async () => {
    const { container } = render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );

    // Sidebar has class md:w-64 or role navigation
    const sidebar = container.querySelector('aside');
    expect(sidebar).toBeNull();
  });

  it('should NOT have left padding for sidebar on desktop', async () => {
    const { container } = render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );

    // Should NOT have md:pl-64 class
    const main = container.querySelector('main');
    expect(main?.className).not.toContain('pl-64');
  });

  it('should render header with logo and subscription button', async () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );

    // Logo
    expect(screen.getByText('tldr')).toBeInTheDocument();
    expect(screen.getByText('SEC')).toBeInTheDocument();

    // Subscription button
    expect(screen.getByRole('link', { name: /manage subscription/i })).toBeInTheDocument();
  });

  it('should have subscription button linking to /dashboard/billing', async () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );

    const subscriptionLink = screen.getByRole('link', { name: /manage subscription/i });
    expect(subscriptionLink).toHaveAttribute('href', '/dashboard/billing');
  });

  it('should render user profile in header', async () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );

    expect(screen.getByTestId('user-button')).toBeInTheDocument();
    expect(screen.getByText('Test User')).toBeInTheDocument();
  });

  it('should NOT render mobile hamburger menu', async () => {
    render(
      <DashboardLayout>
        <div>Content</div>
      </DashboardLayout>
    );

    // No hamburger menu button
    const menuButton = screen.queryByRole('button', { name: /toggle menu/i });
    expect(menuButton).toBeNull();
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="dashboard-layout-no-sidebar"
# Expected: All tests fail (sidebar still exists)
```

### Step 1.2: Green - Implement New Layout

#### 1.2.1 Create new DashboardHeader component
**File**: `components/dashboard/dashboard-header-bar.tsx`

```typescript
"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CreditCard } from "lucide-react";
import UserButton from "@/components/auth/user-button";
import { useUser } from "@clerk/nextjs";

export function DashboardHeaderBar() {
  const { user } = useUser();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--landing-border)] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container max-w-7xl mx-auto flex h-14 items-center justify-between px-6 md:px-8">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center font-semibold">
          <span className="text-[var(--landing-primary)] font-bold text-lg">tldr</span>
          <span className="font-bold text-lg">SEC</span>
        </Link>

        {/* Right side: Subscription + User */}
        <div className="flex items-center gap-4">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/billing">
              <CreditCard className="h-4 w-4 mr-2" />
              Manage Subscription
            </Link>
          </Button>

          <div className="flex items-center gap-3">
            <UserButton afterSignOutUrl="/sign-in" />
            <div className="hidden sm:flex flex-col text-sm">
              <span className="font-medium">{user?.fullName || "User"}</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
```

**Checkpoint 1.2.1**: Component exists:
```bash
npm run build
```

#### 1.2.2 Update Dashboard Layout - Remove Sidebar
**File**: `app/dashboard/layout.tsx`

```typescript
"use client";

import { DashboardHeaderBar } from "@/components/dashboard/dashboard-header-bar";
import { ProtectedRoute } from "@/components/auth";
import { ErrorHandler } from "@/components/ui/error-handler";
import { Suspense } from "react";

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({
  children,
}: DashboardLayoutProps) {
  return (
    <ProtectedRoute>
      <Suspense fallback={null}>
        <ErrorHandler />
      </Suspense>
      <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--landing-bg)' }}>
        <DashboardHeaderBar />
        <main className="flex-1" style={{ backgroundColor: 'var(--landing-bg)' }}>
          <div className="container max-w-7xl mx-auto py-8 md:py-10 px-6 md:px-8 space-y-8">
            {children}
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}
```

**Checkpoint 1.2.2**: Layout no longer has sidebar:
```bash
npm run test -- --testPathPattern="dashboard-layout-no-sidebar"
# Expected: Most tests passing
```

### Step 1.3: Refactor

- [ ] Remove unused Sidebar import
- [ ] Delete or archive `components/layout/sidebar.tsx` (keep for reference)
- [ ] Verify no other components import Sidebar

**Checkpoint 1.3**: All tests pass, no unused imports:
```bash
npm run lint && npm run build
```

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [ ] Layout tests pass: `npm run test -- --testPathPattern="dashboard-layout"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Dashboard loads without sidebar
- [ ] Header shows logo, subscription button, user avatar
- [ ] "Manage Subscription" button links to `/dashboard/billing`
- [ ] Full-width content on all screen sizes
- [ ] No hamburger menu on mobile

**STOP**: Await manual confirmation before Phase 2.

---

## Phase 2: Remove Monitoring Components from Dashboard

### Overview
Remove SystemHealthBanner and ProcessingStatus from dashboard-client.tsx to eliminate admin-level noise.

### Step 2.1: Red - Write Failing Tests

**Test File**: `__tests__/components/dashboard/dashboard-no-monitoring.test.tsx`

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import { DashboardClient } from '@/components/dashboard/dashboard-client';

// Mocks...

describe('DashboardClient - No Monitoring', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: [], companies: [] })
    });
  });

  it('should NOT render SystemHealthBanner', async () => {
    render(<DashboardClient />);

    await waitFor(() => {
      // SystemHealthBanner has role="status"
      const healthBanner = screen.queryByRole('status');
      expect(healthBanner).toBeNull();
    });
  });

  it('should NOT render ProcessingStatus', async () => {
    render(<DashboardClient />);

    await waitFor(() => {
      // ProcessingStatus has "Filing Processing Status" text
      const processingStatus = screen.queryByText('Filing Processing Status');
      expect(processingStatus).toBeNull();
    });
  });

  it('should NOT call system health API endpoints', async () => {
    render(<DashboardClient />);

    await waitFor(() => {
      const fetchCalls = (global.fetch as jest.Mock).mock.calls;
      const systemCalls = fetchCalls.filter(
        (call: unknown[]) => call[0]?.toString().includes('/api/system/')
      );
      expect(systemCalls).toHaveLength(0);
    });
  });
});
```

**Checkpoint 2.1**: Tests fail:
```bash
npm run test -- --testPathPattern="dashboard-no-monitoring"
```

### Step 2.2: Green - Remove Monitoring

#### 2.2.1 Remove imports and JSX from dashboard-client.tsx
**File**: `components/dashboard/dashboard-client.tsx`

Remove these lines:
- Line 41: `import { SystemHealthBanner } from "@/components/dashboard/system-health-banner";`
- Line 42: `import { ProcessingStatus } from "@/components/dashboard/processing-status";`
- Lines 315-317: JSX usage of these components

**Checkpoint 2.2.1**: Tests pass:
```bash
npm run test -- --testPathPattern="dashboard-no-monitoring"
```

### Step 2.3: Final Phase Verification

#### Automated Verification:
- [ ] Tests pass
- [ ] Build passes: `npm run build`

#### Manual Verification:
- [ ] Dashboard loads cleanly without health/processing banners
- [ ] No console errors about missing components

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: Pre-fetch Companies and Create InlineTickerSearch

### Overview
Pre-fetch company data when dashboard loads, create InlineTickerSearch component that appears as a table row.

### Step 3.1: Red - Write Failing Tests

**Test File**: `__tests__/components/dashboard/inline-ticker-search.test.tsx`

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InlineTickerSearch } from '@/components/dashboard/inline-ticker-search';

const mockCompanies = [
  { symbol: 'AAPL', name: 'Apple Inc.', cik: '0000320193' },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', cik: '0001018724' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', cik: '0000789019' },
];

describe('InlineTickerSearch', () => {
  const mockOnSelect = jest.fn();
  const mockOnCancel = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render as a table row structure', () => {
    const { container } = render(
      <table>
        <tbody>
          <InlineTickerSearch
            companies={mockCompanies}
            onSelect={mockOnSelect}
            onCancel={mockOnCancel}
          />
        </tbody>
      </table>
    );

    // Should render as tr element
    const row = container.querySelector('tr');
    expect(row).toBeInTheDocument();
  });

  it('should auto-focus the search input', () => {
    render(
      <table><tbody>
        <InlineTickerSearch
          companies={mockCompanies}
          onSelect={mockOnSelect}
          onCancel={mockOnCancel}
        />
      </tbody></table>
    );

    const input = screen.getByPlaceholderText(/search/i);
    expect(document.activeElement).toBe(input);
  });

  it('should show results on SINGLE character typed', async () => {
    const user = userEvent.setup();

    render(
      <table><tbody>
        <InlineTickerSearch
          companies={mockCompanies}
          onSelect={mockOnSelect}
          onCancel={mockOnCancel}
        />
      </tbody></table>
    );

    const input = screen.getByPlaceholderText(/search/i);
    await user.type(input, 'A');

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
      expect(screen.getByText('AMZN')).toBeInTheDocument();
    });
  });

  it('should call onSelect when result clicked', async () => {
    const user = userEvent.setup();

    render(
      <table><tbody>
        <InlineTickerSearch
          companies={mockCompanies}
          onSelect={mockOnSelect}
          onCancel={mockOnCancel}
        />
      </tbody></table>
    );

    const input = screen.getByPlaceholderText(/search/i);
    await user.type(input, 'AAPL');

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Apple Inc.'));

    expect(mockOnSelect).toHaveBeenCalledWith('AAPL', 'Apple Inc.');
  });

  it('should call onCancel on Escape key', async () => {
    const user = userEvent.setup();

    render(
      <table><tbody>
        <InlineTickerSearch
          companies={mockCompanies}
          onSelect={mockOnSelect}
          onCancel={mockOnCancel}
        />
      </tbody></table>
    );

    await user.keyboard('{Escape}');

    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('should call onCancel when Cancel button clicked', async () => {
    const user = userEvent.setup();

    render(
      <table><tbody>
        <InlineTickerSearch
          companies={mockCompanies}
          onSelect={mockOnSelect}
          onCancel={mockOnCancel}
        />
      </tbody></table>
    );

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    expect(mockOnCancel).toHaveBeenCalled();
  });

  it('should show no results message for non-matching query', async () => {
    const user = userEvent.setup();

    render(
      <table><tbody>
        <InlineTickerSearch
          companies={mockCompanies}
          onSelect={mockOnSelect}
          onCancel={mockOnCancel}
        />
      </tbody></table>
    );

    const input = screen.getByPlaceholderText(/search/i);
    await user.type(input, 'ZZZZ');

    await waitFor(() => {
      expect(screen.getByText(/no results/i)).toBeInTheDocument();
    });
  });
});
```

**Checkpoint 3.1**: Tests fail (component doesn't exist):
```bash
npm run test -- --testPathPattern="inline-ticker-search"
```

### Step 3.2: Green - Implement InlineTickerSearch

#### 3.2.1 Create InlineTickerSearch component
**File**: `components/dashboard/inline-ticker-search.tsx`

```typescript
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchIcon, PlusIcon, X } from "lucide-react";
import { TickerSearchResult } from "@/lib/api/types";
import { TableCell, TableRow } from "@/components/ui/table";

interface InlineTickerSearchProps {
  companies: TickerSearchResult[];
  onSelect: (symbol: string, name: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function InlineTickerSearch({
  companies,
  onSelect,
  onCancel,
  isLoading = false
}: InlineTickerSearchProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<TickerSearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
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
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  // Filter companies - 1 character minimum, 100ms debounce
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
      .slice(0, 8); // Limit to 8 results for clean display

    setResults(filtered);
    setShowResults(true);
  }, [companies]);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);

    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    debounceTimeout.current = setTimeout(() => {
      filterCompanies(value);
    }, 100); // Fast 100ms debounce
  };

  const handleSelect = (symbol: string, name: string) => {
    onSelect(symbol, name);
  };

  return (
    <>
      {/* Search Row */}
      <TableRow ref={containerRef} className="bg-muted/30 border-dashed">
        <TableCell colSpan={4} className="p-0">
          <div className="p-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={inputRef}
                  type="search"
                  placeholder="Search by ticker or company name..."
                  className="pl-9 bg-background"
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onCancel}
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            </div>

            {/* Results dropdown */}
            {showResults && searchQuery.length >= 1 && (
              <div className="mt-3 bg-background border rounded-md shadow-sm overflow-hidden">
                {results.length > 0 ? (
                  <div className="divide-y">
                    {results.map((result) => (
                      <div
                        key={result.symbol}
                        role="option"
                        className="p-3 hover:bg-accent flex justify-between items-center cursor-pointer transition-colors"
                        onClick={() => handleSelect(result.symbol, result.name)}
                      >
                        <div>
                          <span className="font-medium">{result.symbol}</span>
                          <span className="text-muted-foreground ml-2">{result.name}</span>
                        </div>
                        <Button size="sm" variant="ghost" className="shrink-0">
                          <PlusIcon className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-center text-muted-foreground">
                    No results found for &quot;{searchQuery}&quot;
                  </div>
                )}
              </div>
            )}
          </div>
        </TableCell>
      </TableRow>
    </>
  );
}
```

**Checkpoint 3.2.1**: Component tests pass:
```bash
npm run test -- --testPathPattern="inline-ticker-search"
```

### Step 3.3: Final Phase Verification

#### Automated Verification:
- [ ] InlineTickerSearch tests pass
- [ ] Build passes: `npm run build`
- [ ] Lint passes: `npm run lint`

#### Manual Verification:
- [ ] Component renders as table row
- [ ] Search input auto-focuses
- [ ] Results appear on first character

**STOP**: Await manual confirmation before Phase 4.

---

## Phase 4: Integrate Inline Search into Dashboard Client

### Overview
Replace dialog-based ticker addition with inline table row, pre-fetch companies on mount.

### Step 4.1: Red - Write Failing Tests

**Test File**: `__tests__/components/dashboard/dashboard-inline-integration.test.tsx`

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DashboardClient } from '@/components/dashboard/dashboard-client';

const mockCompanies = [
  { symbol: 'AAPL', name: 'Apple Inc.', cik: '0000320193' },
  { symbol: 'MSFT', name: 'Microsoft Corporation', cik: '0000789019' },
];

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockImplementation((url) => {
    if (url === '/api/companies/list') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ companies: mockCompanies })
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
  });
});

describe('Dashboard - Inline Ticker Integration', () => {
  it('should NOT open dialog when Add Ticker clicked', async () => {
    const user = userEvent.setup();
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText(/add ticker/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/add ticker/i));

    // No dialog role element
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('should show inline search row when Add Ticker clicked', async () => {
    const user = userEvent.setup();
    render(<DashboardClient />);

    await waitFor(() => {
      expect(screen.getByText(/add ticker/i)).toBeInTheDocument();
    });

    await user.click(screen.getByText(/add ticker/i));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search by ticker/i)).toBeInTheDocument();
    });
  });

  it('should pre-fetch companies on dashboard mount', async () => {
    render(<DashboardClient />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/companies/list');
    });
  });

  it('should show results immediately on first character', async () => {
    const user = userEvent.setup();
    render(<DashboardClient />);

    // Wait for companies to load
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/companies/list');
    });

    await user.click(screen.getByText(/add ticker/i));

    const input = await screen.findByPlaceholderText(/search by ticker/i);
    await user.type(input, 'A');

    await waitFor(() => {
      expect(screen.getByText('AAPL')).toBeInTheDocument();
    });
  });

  it('should hide inline search when Cancel clicked', async () => {
    const user = userEvent.setup();
    render(<DashboardClient />);

    await user.click(screen.getByText(/add ticker/i));

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search by ticker/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /cancel/i }));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/search by ticker/i)).toBeNull();
    });
  });

  it('should add ticker and close search when result selected', async () => {
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
          json: () => Promise.resolve({ success: true, data: { id: '1', symbol: 'AAPL' } })
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ data: [] }) });
    });

    render(<DashboardClient />);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/companies/list');
    });

    await user.click(screen.getByText(/add ticker/i));

    const input = await screen.findByPlaceholderText(/search by ticker/i);
    await user.type(input, 'AAPL');

    await waitFor(() => {
      expect(screen.getByText('Apple Inc.')).toBeInTheDocument();
    });

    await user.click(screen.getByText('Apple Inc.'));

    // Search should close
    await waitFor(() => {
      expect(screen.queryByPlaceholderText(/search by ticker/i)).toBeNull();
    });
  });
});
```

**Checkpoint 4.1**: Tests fail:
```bash
npm run test -- --testPathPattern="dashboard-inline-integration"
```

### Step 4.2: Green - Integrate InlineTickerSearch

#### 4.2.1 Update dashboard-client.tsx

**Key changes:**
1. Add state for pre-fetched companies
2. Add useEffect to pre-fetch companies on mount
3. Replace Dialog-based add ticker with inline row in table
4. Remove old CompanySearch and Dialog imports

**File**: `components/dashboard/dashboard-client.tsx`

The full implementation involves:

```typescript
// Add new imports
import { InlineTickerSearch } from "@/components/dashboard/inline-ticker-search";
import { TickerSearchResult } from "@/lib/api/types";

// Add state (around line 50)
const [allCompanies, setAllCompanies] = useState<TickerSearchResult[]>([]);
const [companiesLoaded, setCompaniesLoaded] = useState(false);
const [showInlineSearch, setShowInlineSearch] = useState(false);

// Add useEffect for prefetching (after existing useEffect)
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

// Update handleAddTicker to close inline search
const handleAddTicker = async (symbol: string, name: string) => {
  setShowInlineSearch(false); // Close inline search
  // ... rest of existing implementation
};

// In render, replace Dialog with button + inline row:
// 1. Replace Dialog trigger with simple Button
<Button
  onClick={() => setShowInlineSearch(true)}
  className="gap-1"
  data-tutorial="add-ticker"
  disabled={showInlineSearch}
>
  <PlusIcon className="h-4 w-4 mr-2" />
  <span className="hidden sm:inline">Add Ticker</span>
  <span className="inline sm:hidden">Add</span>
</Button>

// 2. In table body, add InlineTickerSearch as first row when active:
<TableBody>
  {showInlineSearch && (
    <InlineTickerSearch
      companies={allCompanies}
      onSelect={handleAddTicker}
      onCancel={() => setShowInlineSearch(false)}
      isLoading={!companiesLoaded}
    />
  )}
  {/* existing rows */}
</TableBody>
```

**Checkpoint 4.2.1**: Integration tests pass:
```bash
npm run test -- --testPathPattern="dashboard-inline-integration"
```

### Step 4.3: Refactor

- [ ] Remove unused Dialog imports for add ticker
- [ ] Remove CompanySearch import if no longer used
- [ ] Update empty state to use inline search instead of dialog
- [ ] Ensure mobile card view also shows inline search appropriately

### Step 4.4: Final Phase Verification

#### Automated Verification:
- [ ] All dashboard tests pass: `npm run test -- --testPathPattern="dashboard"`
- [ ] Build passes: `npm run build`
- [ ] Lint passes: `npm run lint`
- [ ] E2E tests: `npm run test:e2e`

#### Manual Verification:
- [ ] Click "Add Ticker" - inline search row appears in table
- [ ] Type single letter - results appear immediately
- [ ] Click result - ticker added, inline search closes
- [ ] Press Escape - inline search closes
- [ ] Empty state works with inline search
- [ ] Mobile view works correctly
- [ ] Toast notification on successful add

**STOP**: Await manual confirmation before Phase 5.

---

## Phase 5: Final Cleanup and Polish

### Overview
Remove old components, delete unused files, verify all functionality.

### Step 5.1: Delete Old Components

```bash
# Check if CompanySearch is used elsewhere
grep -r "CompanySearch" --include="*.tsx" components/ app/

# If not used, delete:
rm components/dashboard/company-search.tsx

# Keep but mark as deprecated (for admin use):
# components/dashboard/system-health-banner.tsx
# components/dashboard/processing-status.tsx
```

### Step 5.2: Update Sidebar (Archive)

Rename sidebar.tsx to indicate it's archived:
```bash
mv components/layout/sidebar.tsx components/layout/sidebar.archived.tsx
```

Or delete if confident it won't be needed.

### Step 5.3: Final Full Test Suite

```bash
npm run lint
npm run test
npm run build
npm run test:e2e
npm run test:pipeline:comprehensive
```

### Step 5.4: Final Manual Verification Checklist

- [ ] Dashboard loads with clean header (no sidebar)
- [ ] "Manage Subscription" button visible and links to billing
- [ ] User avatar and name in header
- [ ] "Add Ticker" shows inline search row in table
- [ ] Search results appear on first character (1 char, not 2)
- [ ] Selecting result adds ticker immediately
- [ ] Escape/Cancel closes inline search
- [ ] No monitoring banners visible
- [ ] Mobile responsive without hamburger menu
- [ ] Billing page accessible via header button
- [ ] All existing ticker management works (edit, delete)
- [ ] Toast notifications work
- [ ] No console errors

---

## Testing Strategy

### Test Coverage Summary

| Component | Test File | Key Tests |
|-----------|-----------|-----------|
| Layout (no sidebar) | `dashboard-layout-no-sidebar.test.tsx` | 6 tests |
| No monitoring | `dashboard-no-monitoring.test.tsx` | 3 tests |
| InlineTickerSearch | `inline-ticker-search.test.tsx` | 7 tests |
| Integration | `dashboard-inline-integration.test.tsx` | 6 tests |

### Manual Testing Checklist

**Desktop (1440px+)**:
- [ ] Full-width layout, no sidebar
- [ ] Header with logo, subscription button, user
- [ ] Table view for tickers
- [ ] Inline search as first row

**Tablet (768px-1439px)**:
- [ ] Same as desktop, responsive text sizes

**Mobile (<768px)**:
- [ ] No hamburger menu
- [ ] Stack elements vertically
- [ ] Card view for tickers
- [ ] Inline search adapts to cards

---

## Performance Considerations

1. **Company prefetch**: ~10k companies loaded once on mount (~500KB)
2. **Client-side filtering**: No API calls during search
3. **100ms debounce**: Faster than 300ms, still prevents excessive re-renders
4. **8 results max**: Keeps DOM light during search

---

## Migration Notes

### Breaking Changes
- Sidebar is removed - direct URL access to sub-pages still works
- Dialog for adding tickers is gone - inline row instead
- Monitoring components removed from dashboard

### Rollback Plan
If issues arise:
1. Restore `sidebar.tsx` from git
2. Restore Dashboard layout to use Sidebar
3. Restore Dialog-based ticker addition

---

## References

- Research document: [thoughts/shared/research/2026-01-05-dashboard-redesign-inspiration.md](thoughts/shared/research/2026-01-05-dashboard-redesign-inspiration.md)
- Current dashboard: [components/dashboard/dashboard-client.tsx](components/dashboard/dashboard-client.tsx)
- Current layout: [app/dashboard/layout.tsx](app/dashboard/layout.tsx)
- Current sidebar: [components/layout/sidebar.tsx](components/layout/sidebar.tsx)
- Billing page: [app/dashboard/billing/page.tsx](app/dashboard/billing/page.tsx)
- Design tokens: [app/globals.css](app/globals.css)
