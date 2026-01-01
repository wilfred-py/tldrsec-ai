# Passwordless Onboarding Flow Implementation Plan

**Date**: 2026-01-01 00:56:05 AEDT
**Git Commit**: f6eb7efab09668721f980591cee60e5f864474b8
**Branch**: feature/dashboard-landing-v2-redesign
**Repository**: tldrsec-ai

## Overview

Implement a passwordless onboarding flow that allows users to complete sector/ticker selection **before** authentication. Users will input their email as the final onboarding step, then be redirected to Clerk for sign-up and email verification. Upon verification, they'll receive their first summary emails (10-Q and material Form-4 filings) and be redirected to the dashboard.

## Current State Analysis

### Authentication-First Flow (Current)
```
Landing (/) → Sign-Up (Clerk) → Email Verify (Clerk) → Onboarding (2 steps) → Dashboard
```

- Onboarding page at `app/(auth)/onboarding/page.tsx` requires authentication (lines 178-190)
- Email is obtained from Clerk via `currentUser().emailAddresses[0]` - no email input field
- Middleware excludes `/onboarding` from public routes
- Welcome email sent after completion but no sample summaries included

### Key Files Involved
| File | Purpose |
|------|---------|
| `app/(auth)/onboarding/page.tsx` | 2-step wizard (sectors → equities) |
| `app/(auth)/onboarding/actions.ts` | Server actions for saving preferences |
| `lib/email/welcome-service.ts` | Welcome email after onboarding |
| `lib/email/summary-service.ts` | Summary delivery service |
| `middleware.ts` | Route protection |
| `prisma/schema.prisma` | User, Ticker models |
| `app/api/webhook/clerk/route.ts` | Clerk webhook handler |

## Desired End State

### Passwordless-First Flow (New)
```
Landing (/) → Onboarding (3 steps) → Clerk Sign-Up → Email Verify → Dashboard + Summaries
```

1. User visits landing page
2. Clicks "Get Started" → redirected to `/onboarding` (no auth required)
3. **Step 1**: Select sectors of interest
4. **Step 2**: Select up to 5 companies
5. **Step 3**: Enter email address for summaries
6. System stores pending data, redirects to Clerk sign-up with pre-filled email
7. Clerk handles account creation and email verification
8. On verification complete, system:
   - Merges pending onboarding data with new user
   - Sends 10-Q and material Form-4 summaries for selected tickers
   - Redirects to dashboard
9. If email already exists: redirect to sign-in, then offer to merge new tickers

### Verification Criteria

#### Automated Verification:
- [ ] `/onboarding` accessible without authentication: `curl -I localhost:3000/onboarding` returns 200
- [ ] PendingOnboarding model exists: `npx prisma db push` succeeds
- [ ] Email validation tests pass: `npm run test -- --testPathPattern="pending-onboarding"`
- [ ] Clerk webhook handles pending data merge: webhook tests pass
- [ ] Summary delivery tests pass: `npm run test -- --testPathPattern="onboarding-summary"`
- [ ] Build succeeds: `npm run build`
- [ ] All tests pass: `npm run test`

#### Manual Verification:
- [ ] New user can complete onboarding without signing in first
- [ ] Email input shows validation errors for invalid emails
- [ ] Existing email redirects to sign-in with appropriate message
- [ ] After sign-in, merge modal appears for pending tickers
- [ ] Summary emails arrive for tracked tickers after verification
- [ ] Dashboard loads with correct tickers after onboarding

## What We're NOT Doing

- **Custom email verification**: Clerk handles all verification
- **Email collection before sectors**: Email is Step 3, after selections
- **Automatic ticker merge**: User must approve adding new tickers
- **localStorage approach**: Using database for pending data (more robust)
- **10-K summaries**: Only 10-Q and material Form-4 for initial summaries
- **On-demand summary generation**: Only deliver cached summaries initially (performance)

## Form-4 Materiality Definition

Form-4 filings are filtered by materiality using the `signalStrength` field in `summaryJSON`. The existing `determineSignalStrength()` function in `lib/email/form4-data-extractor.ts` classifies transactions:

### Material (Include in Welcome Summaries)
| Signal Strength | Criteria |
|-----------------|----------|
| **Strong - Large Position Change** | >25% change in holdings |
| **Strong - Large Transaction** | >$10M transaction value |
| **Moderate** | >$1M transaction value |
| **Moderate - Executive Transaction** | CEO, CFO, or COO transaction |

### Non-Material (Exclude from Welcome Summaries)
| Signal Strength | Criteria |
|-----------------|----------|
| **Weak - 10b5-1 Plan** | Pre-scheduled trading plan (routine) |
| **Weak - Gift Transaction** | Gifted shares (no market signal) |

### Query Implementation
```typescript
// Find material Form-4 summaries
const materialForm4 = await prisma.summary.findFirst({
  where: {
    tickerId: ticker.id,
    filingType: { in: ['4', 'Form 4', 'FORM4'] },
    summaryJSON: {
      path: ['signalStrength'],
      string_starts_with: 'Strong'  // OR 'Moderate'
    }
  },
  orderBy: { filingDate: 'desc' }
});

// Alternative: Filter in application code
const form4Summaries = await prisma.summary.findMany({
  where: {
    tickerId: ticker.id,
    filingType: { in: ['4', 'Form 4', 'FORM4'] }
  },
  orderBy: { filingDate: 'desc' },
  take: 5
});

const materialForm4 = form4Summaries.find(s => {
  const json = s.summaryJSON as { signalStrength?: string };
  const strength = json?.signalStrength?.toLowerCase() || '';
  return strength.includes('strong') || strength.includes('moderate');
});
```

## Implementation Approach

### Elon's 5-Step Algorithm Application

1. **Question Requirements**:
   - Removed 10-K summaries (user confirmed 10-Q + Form-4 only)
   - Chose database over localStorage (user preference)
   - Added merge confirmation (user agency)

2. **Delete Unnecessary Parts**:
   - No custom email verification (Clerk handles it)
   - No session storage fallback (PendingOnboarding table is sufficient)
   - No immediate on-demand generation (cached summaries only for MVP)

3. **Simplify**:
   - Single PendingOnboarding table vs multiple temp tables
   - Reuse existing email templates
   - Reuse existing summary query patterns

4. **Accelerate**:
   - TDD approach with small increments
   - Each phase independently testable

5. **Automate**:
   - Cleanup cron for expired pending records (Phase 5)

---

## Phase 1: Database Schema - PendingOnboarding Model

### Overview
Create the `PendingOnboarding` model to store onboarding selections before Clerk authentication completes.

### Step 1.1: 🔴 Write Failing Tests

**Test File**: `__tests__/db/pending-onboarding.test.ts`

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('PendingOnboarding Model', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('create', () => {
    it('should create a pending onboarding record with valid data', async () => {
      const data = {
        email: 'test@example.com',
        sectors: ['technology', 'healthcare'],
        tickers: JSON.stringify([
          { symbol: 'AAPL', companyName: 'Apple Inc.' },
          { symbol: 'JNJ', companyName: 'Johnson & Johnson' }
        ]),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      };

      const record = await prisma.pendingOnboarding.create({ data });

      expect(record.id).toBeDefined();
      expect(record.email).toBe('test@example.com');
      expect(record.sectors).toEqual(['technology', 'healthcare']);
      expect(JSON.parse(record.tickers as string)).toHaveLength(2);
      expect(record.expiresAt).toBeInstanceOf(Date);

      // Cleanup
      await prisma.pendingOnboarding.delete({ where: { id: record.id } });
    });

    it('should enforce email uniqueness', async () => {
      const data = {
        email: 'unique@example.com',
        sectors: ['technology'],
        tickers: '[]',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      };

      await prisma.pendingOnboarding.create({ data });

      await expect(
        prisma.pendingOnboarding.create({ data })
      ).rejects.toThrow();

      // Cleanup
      await prisma.pendingOnboarding.delete({ where: { email: 'unique@example.com' } });
    });
  });

  describe('findByEmail', () => {
    it('should find pending record by email', async () => {
      const email = 'findme@example.com';
      await prisma.pendingOnboarding.create({
        data: {
          email,
          sectors: ['financial'],
          tickers: '[]',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
      });

      const found = await prisma.pendingOnboarding.findUnique({ where: { email } });

      expect(found).not.toBeNull();
      expect(found?.email).toBe(email);

      // Cleanup
      await prisma.pendingOnboarding.delete({ where: { email } });
    });

    it('should return null for non-existent email', async () => {
      const found = await prisma.pendingOnboarding.findUnique({
        where: { email: 'nonexistent@example.com' }
      });

      expect(found).toBeNull();
    });
  });

  describe('upsert', () => {
    it('should update existing record with same email', async () => {
      const email = 'upsert@example.com';

      // Create initial
      await prisma.pendingOnboarding.create({
        data: {
          email,
          sectors: ['technology'],
          tickers: '[]',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
      });

      // Upsert with new data
      const updated = await prisma.pendingOnboarding.upsert({
        where: { email },
        create: {
          email,
          sectors: ['healthcare'],
          tickers: '[]',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        },
        update: {
          sectors: ['healthcare', 'financial'],
          tickers: JSON.stringify([{ symbol: 'MSFT', companyName: 'Microsoft' }])
        }
      });

      expect(updated.sectors).toEqual(['healthcare', 'financial']);
      expect(JSON.parse(updated.tickers as string)).toHaveLength(1);

      // Cleanup
      await prisma.pendingOnboarding.delete({ where: { email } });
    });
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL (model doesn't exist):
```bash
npm run test -- --testPathPattern="pending-onboarding"
# Expected: Tests fail with "Table does not exist" error
```

### Step 1.2: 🟢 Implement Schema

#### 1.2.1 Add PendingOnboarding Model
**File**: `prisma/schema.prisma`
**Changes**: Add new model after User model (around line 58)

```prisma
model PendingOnboarding {
  id        String   @id @default(uuid())
  email     String   @unique
  sectors   String[]
  tickers   Json     // Array of {symbol, companyName}
  createdAt DateTime @default(now())
  expiresAt DateTime // Auto-cleanup after 24 hours

  @@index([email])
  @@index([expiresAt])
  @@schema("app")
}
```

**Checkpoint 1.2.1**: Generate Prisma client:
```bash
npm run db:generate
# Expected: Prisma client generated successfully
```

#### 1.2.2 Run Migration
```bash
npm run db:migrate -- --name add_pending_onboarding
# Expected: Migration applied successfully
```

**Checkpoint 1.2.2**: Verify tests pass:
```bash
npm run test -- --testPathPattern="pending-onboarding"
# Expected: All tests pass
```

### Step 1.3: 🔵 Refactor

- [ ] Add JSDoc comments to model in schema
- [ ] Verify indexes are optimal for expected queries

**Checkpoint 1.3**: Tests still pass:
```bash
npm run test -- --testPathPattern="pending-onboarding"
# Expected: All tests pass
```

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [ ] Database migration successful: `npm run db:migrate`
- [ ] Prisma client generated: `npm run db:generate`
- [ ] Model tests pass: `npm run test -- --testPathPattern="pending-onboarding"`
- [ ] Type checking passes: `npm run build`

#### Manual Verification:
- [ ] Open Prisma Studio: `npm run db:studio`
- [ ] Verify PendingOnboarding table exists
- [ ] Create a test record manually, verify it saves

**STOP**: Await manual confirmation before Phase 2.

---

## Phase 2: Onboarding UI - Add Step 3 (Email Input)

### Overview
Add a third step to the onboarding wizard for email input, with validation and existing user detection.

### Step 2.1: 🔴 Write Failing Tests

**Test File**: `__tests__/components/onboarding-email-step.test.tsx`

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EmailStep } from '@/components/onboarding/email-step';

// Mock the email check API
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));

describe('EmailStep', () => {
  const mockOnEmailSubmit = jest.fn();
  const mockOnBack = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render email input field', () => {
    render(
      <EmailStep
        onEmailSubmit={mockOnEmailSubmit}
        onBack={mockOnBack}
        selectedTickers={['AAPL', 'TSLA']}
      />
    );

    expect(screen.getByPlaceholderText(/email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });

  it('should show validation error for empty email', async () => {
    render(
      <EmailStep
        onEmailSubmit={mockOnEmailSubmit}
        onBack={mockOnBack}
        selectedTickers={['AAPL']}
      />
    );

    const submitButton = screen.getByRole('button', { name: /continue/i });
    await userEvent.click(submitButton);

    expect(screen.getByText(/email is required/i)).toBeInTheDocument();
    expect(mockOnEmailSubmit).not.toHaveBeenCalled();
  });

  it('should show validation error for invalid email format', async () => {
    render(
      <EmailStep
        onEmailSubmit={mockOnEmailSubmit}
        onBack={mockOnBack}
        selectedTickers={['AAPL']}
      />
    );

    const emailInput = screen.getByPlaceholderText(/email/i);
    await userEvent.type(emailInput, 'notanemail');

    const submitButton = screen.getByRole('button', { name: /continue/i });
    await userEvent.click(submitButton);

    expect(screen.getByText(/valid email/i)).toBeInTheDocument();
    expect(mockOnEmailSubmit).not.toHaveBeenCalled();
  });

  it('should call onEmailSubmit with valid email', async () => {
    render(
      <EmailStep
        onEmailSubmit={mockOnEmailSubmit}
        onBack={mockOnBack}
        selectedTickers={['AAPL']}
      />
    );

    const emailInput = screen.getByPlaceholderText(/email/i);
    await userEvent.type(emailInput, 'valid@example.com');

    const submitButton = screen.getByRole('button', { name: /continue/i });
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(mockOnEmailSubmit).toHaveBeenCalledWith('valid@example.com');
    });
  });

  it('should display selected tickers summary', () => {
    render(
      <EmailStep
        onEmailSubmit={mockOnEmailSubmit}
        onBack={mockOnBack}
        selectedTickers={['AAPL', 'TSLA', 'MSFT']}
      />
    );

    expect(screen.getByText(/AAPL/)).toBeInTheDocument();
    expect(screen.getByText(/TSLA/)).toBeInTheDocument();
    expect(screen.getByText(/MSFT/)).toBeInTheDocument();
  });

  it('should call onBack when back button clicked', async () => {
    render(
      <EmailStep
        onEmailSubmit={mockOnEmailSubmit}
        onBack={mockOnBack}
        selectedTickers={['AAPL']}
      />
    );

    const backButton = screen.getByRole('button', { name: /back/i });
    await userEvent.click(backButton);

    expect(mockOnBack).toHaveBeenCalled();
  });
});
```

**Checkpoint 2.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="onboarding-email-step"
# Expected: Module not found error (component doesn't exist)
```

### Step 2.2: 🟢 Implement Email Step Component

#### 2.2.1 Create EmailStep Component
**File**: `components/onboarding/email-step.tsx`

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Mail, Loader2 } from 'lucide-react';

interface EmailStepProps {
  onEmailSubmit: (email: string) => Promise<void> | void;
  onBack: () => void;
  selectedTickers: string[];
  isLoading?: boolean;
}

export function EmailStep({
  onEmailSubmit,
  onBack,
  selectedTickers,
  isLoading = false
}: EmailStepProps) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validateEmail = (email: string): string | null => {
    if (!email || email.trim() === '') {
      return 'Email is required';
    }

    // RFC 5322 simplified regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return 'Please enter a valid email address';
    }

    if (email.length > 254) {
      return 'Email address is too long';
    }

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validationError = validateEmail(email);
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setIsSubmitting(true);
      await onEmailSubmit(email.toLowerCase().trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Mail className="h-6 w-6 text-primary" />
        </div>
        <CardTitle className="text-2xl">Where should we send your summaries?</CardTitle>
        <CardDescription className="text-base">
          Enter your email to receive SEC filing summaries for your selected companies.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Selected Tickers Summary */}
        <div className="rounded-lg bg-muted/50 p-4">
          <p className="text-sm font-medium mb-2">You&apos;ll receive summaries for:</p>
          <div className="flex flex-wrap gap-2">
            {selectedTickers.map((ticker) => (
              <Badge key={ticker} variant="secondary">
                {ticker}
              </Badge>
            ))}
          </div>
        </div>

        {/* Email Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Input
              type="email"
              placeholder="Enter your email address"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError('');
              }}
              className={error ? 'border-destructive' : ''}
              disabled={isSubmitting || isLoading}
              autoFocus
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>

          <div className="flex gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={onBack}
              disabled={isSubmitting || isLoading}
              className="flex-1"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || isLoading}
              className="flex-1"
            >
              {isSubmitting || isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Continue'
              )}
            </Button>
          </div>
        </form>

        <p className="text-xs text-muted-foreground text-center">
          We&apos;ll create your account and send a verification email.
          Your first summaries will arrive after verification.
        </p>
      </CardContent>
    </Card>
  );
}
```

**Checkpoint 2.2.1**: Verify component compiles:
```bash
npm run build
# Expected: Build succeeds
```

#### 2.2.2 Update Tests to Pass
Run tests again:
```bash
npm run test -- --testPathPattern="onboarding-email-step"
# Expected: All tests pass
```

### Step 2.3: 🔴 Write Tests for Updated Onboarding Page

**Test File**: `__tests__/app/onboarding-page.test.tsx`

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// These tests verify the 3-step flow integration
describe('OnboardingPage - 3-Step Flow', () => {
  it('should show Step 3 (Email) after Step 2 (Equities)', async () => {
    // Test implementation
  });

  it('should calculate progress correctly across 3 steps', async () => {
    // Step 1: 0-33%, Step 2: 34-66%, Step 3: 67-100%
  });

  it('should be accessible without authentication', async () => {
    // Verify no redirect happens
  });
});
```

### Step 2.4: 🟢 Update Onboarding Page

#### 2.4.1 Update Onboarding Page to 3 Steps
**File**: `app/(auth)/onboarding/page.tsx`

**Key Changes**:
1. Remove authentication check (lines 178-190)
2. Add Step 3 rendering
3. Update progress calculation to 3 steps
4. Add email submission handler

**Checkpoint 2.4.1**: Build and test:
```bash
npm run build && npm run test -- --testPathPattern="onboarding"
# Expected: All tests pass
```

### Step 2.5: 🔵 Refactor

- [ ] Extract step components to separate files if too large
- [ ] Ensure consistent styling with existing steps
- [ ] Add proper TypeScript types

**Checkpoint 2.5**: Tests still pass:
```bash
npm run test -- --testPathPattern="onboarding"
```

### Step 2.6: Final Phase Verification

#### Automated Verification:
- [x] Component tests pass: `npm run test -- --testPathPattern="onboarding-email-step"` (9/9 passed)
- [x] Build succeeds: `npm run build`
- [x] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Navigate to `/onboarding` - page loads (will redirect without next phase)
- [ ] Email step UI matches design
- [ ] Validation errors display correctly
- [ ] Back button works

### Phase 2 Implementation Notes (2026-01-01)

**Files Modified:**
- `app/(auth)/onboarding/page.tsx` - Updated to 3-step flow, added EmailStep rendering
- `components/onboarding/email-step.tsx` - Created new EmailStep component
- `__tests__/components/onboarding-email-step.test.tsx` - Created 9 tests for EmailStep

**Key Changes:**
1. Progress calculation updated from 2 steps to 3 steps (0-33-66-100%)
2. Step indicator changed from "Step X of 2" to "Step X of 3"
3. Step 2 button changed from "Get Started" to "Continue"
4. Added Step 3 rendering with EmailStep component
5. handleBack() now properly navigates back from any step
6. handleEmailSubmit() currently delegates to handleCompleteOnboarding() (will be updated in Phase 4)

**Test Fixes Applied:**
- Invalid email test: Changed from `notanemail` to `user@domain` to bypass browser's native email validation in JSDOM
- Disabled inputs test: Changed button assertion from `/continue/i` to `/processing/i` since button text changes when loading

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: Make Onboarding Public & Add Email Check API

### Overview
Remove authentication requirement from onboarding route and create API endpoint to check if email already exists.

### Step 3.1: 🔴 Write Failing Tests

**Test File**: `__tests__/api/check-email.test.ts`

```typescript
import { POST } from '@/app/api/onboarding/check-email/route';
import { NextRequest } from 'next/server';

// Mock Prisma
jest.mock('@/lib/db/prisma', () => ({
  getPrismaClient: () => ({
    user: {
      findUnique: jest.fn(),
    },
    pendingOnboarding: {
      findUnique: jest.fn(),
    },
  }),
}));

describe('POST /api/onboarding/check-email', () => {
  it('should return NEW_USER for non-existent email', async () => {
    const request = new NextRequest('http://localhost/api/onboarding/check-email', {
      method: 'POST',
      body: JSON.stringify({ email: 'new@example.com' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('NEW_USER');
    expect(data.canProceed).toBe(true);
  });

  it('should return EXISTING_USER for email with completed onboarding', async () => {
    // Mock user with onboardingCompleted: true
    const request = new NextRequest('http://localhost/api/onboarding/check-email', {
      method: 'POST',
      body: JSON.stringify({ email: 'existing@example.com' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('EXISTING_USER');
    expect(data.canProceed).toBe(false);
    expect(data.message).toContain('already have an account');
  });

  it('should return INCOMPLETE_USER for email with incomplete onboarding', async () => {
    // Mock user with onboardingCompleted: false
    const request = new NextRequest('http://localhost/api/onboarding/check-email', {
      method: 'POST',
      body: JSON.stringify({ email: 'incomplete@example.com' }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe('INCOMPLETE_USER');
    expect(data.canProceed).toBe(false);
  });

  it('should return 400 for missing email', async () => {
    const request = new NextRequest('http://localhost/api/onboarding/check-email', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });

  it('should return 400 for invalid email format', async () => {
    const request = new NextRequest('http://localhost/api/onboarding/check-email', {
      method: 'POST',
      body: JSON.stringify({ email: 'notanemail' }),
    });

    const response = await POST(request);

    expect(response.status).toBe(400);
  });
});
```

**Checkpoint 3.1**: Tests fail (endpoint doesn't exist):
```bash
npm run test -- --testPathPattern="check-email"
# Expected: Module not found
```

### Step 3.2: 🟢 Implement Check Email API

#### 3.2.1 Create API Route
**File**: `app/api/onboarding/check-email/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db/prisma';
import { emailSchema } from '@/lib/validation/schemas';

export type EmailCheckStatus =
  | 'NEW_USER'
  | 'EXISTING_USER'
  | 'INCOMPLETE_USER'
  | 'PENDING_ONBOARDING';

export interface EmailCheckResponse {
  status: EmailCheckStatus;
  canProceed: boolean;
  message?: string;
  existingTickerCount?: number;
}

export async function POST(request: NextRequest): Promise<NextResponse<EmailCheckResponse | { error: string }>> {
  try {
    const body = await request.json();
    const { email } = body;

    // Validate email
    const validation = emailSchema.safeParse(email);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    const normalizedEmail = validation.data;
    const prisma = getPrismaClient();

    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        onboardingCompleted: true,
        _count: { select: { tickers: true } }
      }
    });

    if (existingUser) {
      if (existingUser.onboardingCompleted) {
        return NextResponse.json({
          status: 'EXISTING_USER',
          canProceed: false,
          message: 'You already have an account. Please sign in to access your dashboard.',
          existingTickerCount: existingUser._count.tickers
        });
      } else {
        return NextResponse.json({
          status: 'INCOMPLETE_USER',
          canProceed: false,
          message: 'You have a pending account. Please sign in to continue.',
          existingTickerCount: existingUser._count.tickers
        });
      }
    }

    // Check for pending onboarding (from a previous attempt)
    const pendingOnboarding = await prisma.pendingOnboarding.findUnique({
      where: { email: normalizedEmail }
    });

    if (pendingOnboarding) {
      return NextResponse.json({
        status: 'PENDING_ONBOARDING',
        canProceed: true,
        message: 'Resuming your previous onboarding...'
      });
    }

    // New user
    return NextResponse.json({
      status: 'NEW_USER',
      canProceed: true
    });

  } catch (error) {
    console.error('Error checking email:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

**Checkpoint 3.2.1**: Tests pass:
```bash
npm run test -- --testPathPattern="check-email"
# Expected: All tests pass
```

#### 3.2.2 Update Middleware Public Routes
**File**: `middleware.ts`
**Changes**: Add `/onboarding` and `/api/onboarding/*` to publicRoutes array

Find the `publicRoutes` array (around line 1173-1203) and add:
```typescript
publicRoutes: [
  // ... existing routes ...
  '/onboarding',
  '/api/onboarding/check-email',
  '/api/onboarding/save-pending',
]
```

**Checkpoint 3.2.2**: Verify onboarding accessible without auth:
```bash
curl -I http://localhost:3000/onboarding
# Expected: 200 OK (not redirect)
```

### Step 3.3: 🔵 Refactor

- [ ] Add rate limiting to check-email endpoint
- [ ] Add request logging

**Checkpoint 3.3**: Tests still pass:
```bash
npm run test -- --testPathPattern="check-email"
```

### Step 3.4: Final Phase Verification

#### Automated Verification:
- [ ] API tests pass: `npm run test -- --testPathPattern="check-email"`
- [ ] Build succeeds: `npm run build`
- [ ] Middleware updated: grep for `/onboarding` in publicRoutes

#### Manual Verification:
- [ ] Visit `/onboarding` without being logged in - page loads
- [ ] Call API with test emails, verify responses

**STOP**: Await manual confirmation before Phase 4.

---

## Phase 4: Save Pending Onboarding & Clerk Redirect

### Overview
Create API to save pending onboarding data and redirect to Clerk sign-up with pre-filled email.

### Step 4.1: 🔴 Write Failing Tests

**Test File**: `__tests__/api/save-pending.test.ts`

```typescript
import { POST } from '@/app/api/onboarding/save-pending/route';
import { NextRequest } from 'next/server';

describe('POST /api/onboarding/save-pending', () => {
  it('should save pending onboarding data for new user', async () => {
    const request = new NextRequest('http://localhost/api/onboarding/save-pending', {
      method: 'POST',
      body: JSON.stringify({
        email: 'new@example.com',
        sectors: ['technology', 'healthcare'],
        tickers: [
          { symbol: 'AAPL', companyName: 'Apple Inc.' },
          { symbol: 'JNJ', companyName: 'Johnson & Johnson' }
        ]
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.redirectUrl).toContain('/sign-up');
    expect(data.redirectUrl).toContain('email=');
  });

  it('should upsert if pending record already exists', async () => {
    // First request
    await POST(new NextRequest('http://localhost/api/onboarding/save-pending', {
      method: 'POST',
      body: JSON.stringify({
        email: 'existing@example.com',
        sectors: ['technology'],
        tickers: [{ symbol: 'AAPL', companyName: 'Apple Inc.' }]
      }),
    }));

    // Second request with updated data
    const response = await POST(new NextRequest('http://localhost/api/onboarding/save-pending', {
      method: 'POST',
      body: JSON.stringify({
        email: 'existing@example.com',
        sectors: ['healthcare'],
        tickers: [{ symbol: 'JNJ', companyName: 'Johnson & Johnson' }]
      }),
    }));

    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it('should return sign-in URL for existing users', async () => {
    // Mock existing user
    const request = new NextRequest('http://localhost/api/onboarding/save-pending', {
      method: 'POST',
      body: JSON.stringify({
        email: 'completeduser@example.com',
        sectors: ['technology'],
        tickers: [{ symbol: 'AAPL', companyName: 'Apple Inc.' }]
      }),
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.existingUser).toBe(true);
    expect(data.redirectUrl).toContain('/sign-in');
  });

  it('should set expiration 24 hours in future', async () => {
    const request = new NextRequest('http://localhost/api/onboarding/save-pending', {
      method: 'POST',
      body: JSON.stringify({
        email: 'expiry@example.com',
        sectors: ['technology'],
        tickers: []
      }),
    });

    await POST(request);

    // Verify expiration (implementation detail - may need to query DB)
  });

  it('should return 400 for invalid data', async () => {
    const request = new NextRequest('http://localhost/api/onboarding/save-pending', {
      method: 'POST',
      body: JSON.stringify({
        email: 'notanemail',
        sectors: [],
        tickers: []
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });
});
```

**Checkpoint 4.1**: Tests fail (endpoint doesn't exist):
```bash
npm run test -- --testPathPattern="save-pending"
```

### Step 4.2: 🟢 Implement Save Pending API

#### 4.2.1 Create API Route
**File**: `app/api/onboarding/save-pending/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getPrismaClient } from '@/lib/db/prisma';
import { z } from 'zod';

const SavePendingSchema = z.object({
  email: z.string().email().transform(e => e.toLowerCase().trim()),
  sectors: z.array(z.string()),
  tickers: z.array(z.object({
    symbol: z.string(),
    companyName: z.string()
  }))
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validation = SavePendingSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Invalid data', details: validation.error.flatten() },
        { status: 400 }
      );
    }

    const { email, sectors, tickers } = validation.data;
    const prisma = getPrismaClient();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { onboardingCompleted: true }
    });

    if (existingUser) {
      // Save pending data anyway (for merge later)
      await prisma.pendingOnboarding.upsert({
        where: { email },
        create: {
          email,
          sectors,
          tickers: JSON.stringify(tickers),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        },
        update: {
          sectors,
          tickers: JSON.stringify(tickers),
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
      });

      return NextResponse.json({
        success: true,
        existingUser: true,
        redirectUrl: `/sign-in?email=${encodeURIComponent(email)}&returnTo=/dashboard?merge=pending`
      });
    }

    // Save pending onboarding for new user
    await prisma.pendingOnboarding.upsert({
      where: { email },
      create: {
        email,
        sectors,
        tickers: JSON.stringify(tickers),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      },
      update: {
        sectors,
        tickers: JSON.stringify(tickers),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });

    // Redirect to Clerk sign-up with pre-filled email
    const signUpUrl = new URL('/sign-up', process.env.NEXT_PUBLIC_APP_URL);
    signUpUrl.searchParams.set('email_address', email);
    signUpUrl.searchParams.set('redirect_url', '/dashboard?welcome=true');

    return NextResponse.json({
      success: true,
      existingUser: false,
      redirectUrl: signUpUrl.toString()
    });

  } catch (error) {
    console.error('Error saving pending onboarding:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

**Checkpoint 4.2.1**: Tests pass:
```bash
npm run test -- --testPathPattern="save-pending"
```

#### 4.2.2 Update Onboarding Page to Use API
**File**: `app/(auth)/onboarding/page.tsx`

Add email submission handler that:
1. Calls `/api/onboarding/check-email`
2. If NEW_USER or PENDING_ONBOARDING, calls `/api/onboarding/save-pending`
3. Redirects to returned URL

**Checkpoint 4.2.2**: Integration test:
```bash
npm run test -- --testPathPattern="onboarding"
```

### Step 4.3: 🔵 Refactor

- [ ] Add error handling UI
- [ ] Add loading states
- [ ] Handle network errors gracefully

### Step 4.4: Final Phase Verification

#### Automated Verification:
- [ ] API tests pass: `npm run test -- --testPathPattern="save-pending"`
- [ ] Integration tests pass: `npm run test -- --testPathPattern="onboarding"`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Complete onboarding as new user → redirected to Clerk sign-up
- [ ] Email is pre-filled in Clerk form
- [ ] Complete onboarding with existing email → redirected to sign-in

**STOP**: Await manual confirmation before Phase 5.

---

## Phase 5: Clerk Webhook Integration & Pending Data Merge

### Overview
Update Clerk webhook handler to check for pending onboarding data and merge it with new user account.

### Step 5.1: 🔴 Write Failing Tests

**Test File**: `__tests__/api/webhook-clerk-pending.test.ts`

```typescript
import { POST } from '@/app/api/webhook/clerk/route';
import { NextRequest } from 'next/server';

describe('Clerk Webhook - Pending Onboarding Merge', () => {
  it('should merge pending tickers when user.created fires', async () => {
    // Setup: Create pending onboarding record first
    // Then simulate user.created webhook
    // Verify: User has tickers from pending record
  });

  it('should delete pending record after successful merge', async () => {
    // Verify PendingOnboarding record is deleted
  });

  it('should create user normally if no pending record exists', async () => {
    // Existing behavior should still work
  });

  it('should handle merge errors gracefully', async () => {
    // If ticker creation fails, user should still be created
  });
});
```

### Step 5.2: 🟢 Update Clerk Webhook Handler

#### 5.2.1 Add Pending Data Merge Logic
**File**: `app/api/webhook/clerk/route.ts`

Update the `user.created` case to:
1. Check `PendingOnboarding` table for matching email
2. If found, create tickers from pending data
3. Delete pending record
4. Mark onboarding as completed

```typescript
case 'user.created':
  const userData = evt.data;
  const primaryEmail = userData.email_addresses?.[0]?.email_address;

  if (primaryEmail && userData.id) {
    // Check for pending onboarding
    const pending = await prisma.pendingOnboarding.findUnique({
      where: { email: primaryEmail.toLowerCase() }
    });

    // Create user
    const newUser = await prisma.user.create({
      data: {
        id: userData.id,
        email: primaryEmail,
        authProvider: 'clerk',
        authProviderId: userData.id,
        name: userData.first_name ? `${userData.first_name} ${userData.last_name || ''}`.trim() : undefined,
        subscriptionTier: 'FREE',
        budgetUsed: 0,
        processingBudget: 0.20,
        onboardingCompleted: !!pending, // Mark complete if came through passwordless flow
      }
    });

    // Merge pending tickers
    if (pending) {
      const tickers = JSON.parse(pending.tickers as string);

      for (const ticker of tickers) {
        try {
          await prisma.ticker.create({
            data: {
              symbol: ticker.symbol,
              companyName: ticker.companyName,
              userId: newUser.id
            }
          });
        } catch (tickerError) {
          console.error(`Failed to create ticker ${ticker.symbol}:`, tickerError);
        }
      }

      // Delete pending record
      await prisma.pendingOnboarding.delete({
        where: { email: primaryEmail.toLowerCase() }
      });

      // Queue welcome summaries (Phase 6)
      // await queueWelcomeSummaries(newUser.id, tickers);
    }
  }
  break;
```

**Checkpoint 5.2.1**: Webhook tests pass:
```bash
npm run test -- --testPathPattern="webhook-clerk"
```

### Step 5.3: 🔵 Refactor

- [ ] Extract ticker creation to helper function
- [ ] Add comprehensive logging

### Step 5.4: Final Phase Verification

#### Automated Verification:
- [ ] Webhook tests pass: `npm run test -- --testPathPattern="webhook-clerk"`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Complete full flow: onboarding → Clerk sign-up → verify email
- [ ] Check dashboard shows tickers selected during onboarding
- [ ] Verify PendingOnboarding record was deleted

**STOP**: Await manual confirmation before Phase 6.

---

## Phase 6: Welcome Summary Delivery

### Overview
After Clerk email verification, send 10-Q and material Form-4 summaries for user's tracked tickers.

### Step 6.1: 🔴 Write Failing Tests

**Test File**: `__tests__/email/welcome-summaries.test.ts`

```typescript
import { sendWelcomeSummaries, isMaterialForm4 } from '@/lib/email/welcome-summaries';

describe('sendWelcomeSummaries', () => {
  describe('isMaterialForm4', () => {
    it('should return true for Strong signal strength', () => {
      const summary = {
        summaryJSON: { signalStrength: 'Strong - Large Position Change' }
      };
      expect(isMaterialForm4(summary)).toBe(true);
    });

    it('should return true for Moderate signal strength', () => {
      const summary = {
        summaryJSON: { signalStrength: 'Moderate - Executive Transaction' }
      };
      expect(isMaterialForm4(summary)).toBe(true);
    });

    it('should return false for Weak signal strength', () => {
      const summary = {
        summaryJSON: { signalStrength: 'Weak - 10b5-1 Plan' }
      };
      expect(isMaterialForm4(summary)).toBe(false);
    });

    it('should return false for missing signalStrength', () => {
      const summary = { summaryJSON: {} };
      expect(isMaterialForm4(summary)).toBe(false);
    });

    it('should return false for null summaryJSON', () => {
      const summary = { summaryJSON: null };
      expect(isMaterialForm4(summary)).toBe(false);
    });
  });

  describe('sendWelcomeSummaries', () => {
    it('should query cached 10-Q summaries for each ticker', async () => {
      // Mock user with 3 tickers
      // Verify queries for 10-Q summaries
    });

    it('should only include material Form-4 summaries (Strong/Moderate)', async () => {
      // Create mock Form-4 summaries with different signal strengths
      // Verify only Strong and Moderate are included
    });

    it('should exclude Weak Form-4 summaries (10b5-1 plans, gifts)', async () => {
      // Create mock Form-4 with Weak signal strength
      // Verify it's excluded from email
    });

    it('should send email with all found summaries', async () => {
      // Verify email contains summary data
    });

    it('should handle tickers with no cached summaries gracefully', async () => {
      // Should not fail, just skip those tickers
    });

    it('should not send email if no summaries found', async () => {
      // If all tickers have no summaries, don't send empty email
    });
  });
});
```

### Step 6.2: 🟢 Implement Welcome Summaries Service

#### 6.2.1 Create Welcome Summaries Service
**File**: `lib/email/welcome-summaries.ts`

```typescript
import { getPrismaClient } from '@/lib/db/prisma';
import { sendEmail } from '@/lib/email/resend-client';
import { getEmailTemplate, EmailType } from '@/lib/email/templates';
import { Prisma } from '@prisma/client';

interface TickerSummary {
  symbol: string;
  companyName: string;
  tenQ?: {
    id: string;
    filingDate: Date;
    summaryText: string;
  };
  form4?: {
    id: string;
    filingDate: Date;
    summaryText: string;
    signalStrength: string;
  };
}

interface Form4SummaryJSON {
  signalStrength?: string;
  totalValue?: string;
  percentageChange?: string;
  [key: string]: unknown;
}

/**
 * Determines if a Form-4 summary is material based on signal strength.
 *
 * Material signals (include):
 * - Strong - Large Position Change (>25% change)
 * - Strong - Large Transaction (>$10M)
 * - Moderate (>$1M)
 * - Moderate - Executive Transaction (CEO/CFO/COO)
 *
 * Non-material signals (exclude):
 * - Weak - 10b5-1 Plan (pre-scheduled, routine)
 * - Weak - Gift Transaction (no market signal)
 */
export function isMaterialForm4(summary: { summaryJSON: Prisma.JsonValue | null }): boolean {
  if (!summary.summaryJSON || typeof summary.summaryJSON !== 'object') {
    return false;
  }

  const json = summary.summaryJSON as Form4SummaryJSON;
  const signalStrength = json?.signalStrength?.toLowerCase() || '';

  // Material: Strong or Moderate
  if (signalStrength.includes('strong') || signalStrength.includes('moderate')) {
    return true;
  }

  // Non-material: Weak (10b5-1 plans, gifts)
  return false;
}

export async function sendWelcomeSummaries(userId: string): Promise<{ success: boolean; error?: string }> {
  const prisma = getPrismaClient();

  try {
    // Get user and tickers
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        tickers: true
      }
    });

    if (!user || !user.tickers.length) {
      return { success: false, error: 'User not found or no tickers' };
    }

    const tickerSummaries: TickerSummary[] = [];

    // For each ticker, get most recent 10-Q and material Form-4
    for (const ticker of user.tickers) {
      // Get most recent 10-Q
      const tenQ = await prisma.summary.findFirst({
        where: {
          tickerId: ticker.id,
          filingType: '10-Q'
        },
        orderBy: { filingDate: 'desc' },
        select: {
          id: true,
          filingDate: true,
          summaryText: true
        }
      });

      // Get recent Form-4 summaries and filter for materiality
      const form4Candidates = await prisma.summary.findMany({
        where: {
          tickerId: ticker.id,
          filingType: { in: ['4', 'Form 4', 'FORM4'] }
        },
        orderBy: { filingDate: 'desc' },
        take: 10, // Check last 10 Form-4s to find a material one
        select: {
          id: true,
          filingDate: true,
          summaryText: true,
          summaryJSON: true
        }
      });

      // Find the most recent MATERIAL Form-4
      const materialForm4 = form4Candidates.find(isMaterialForm4);

      if (tenQ || materialForm4) {
        const json = materialForm4?.summaryJSON as Form4SummaryJSON | undefined;

        tickerSummaries.push({
          symbol: ticker.symbol,
          companyName: ticker.companyName,
          tenQ: tenQ ? {
            id: tenQ.id,
            filingDate: tenQ.filingDate,
            summaryText: tenQ.summaryText || ''
          } : undefined,
          form4: materialForm4 ? {
            id: materialForm4.id,
            filingDate: materialForm4.filingDate,
            summaryText: materialForm4.summaryText || '',
            signalStrength: json?.signalStrength || 'Moderate'
          } : undefined
        });
      }
    }

    // If no summaries found for any ticker, skip email
    if (tickerSummaries.length === 0) {
      console.log(`No cached summaries found for user ${userId}`);
      return { success: true }; // Not an error, just nothing to send
    }

    // Count summary types for logging
    const tenQCount = tickerSummaries.filter(t => t.tenQ).length;
    const form4Count = tickerSummaries.filter(t => t.form4).length;
    console.log(`Sending welcome summaries: ${tenQCount} 10-Qs, ${form4Count} material Form-4s`);

    // Generate and send email
    const { html, text } = getEmailTemplate(EmailType.WELCOME_SUMMARIES, {
      recipientName: user.name || 'there',
      recipientEmail: user.email,
      tickerSummaries,
      dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`
    });

    const result = await sendEmail({
      to: user.email,
      subject: `Your First SEC Filing Summaries - ${tickerSummaries.length} Companies`,
      html,
      text,
      tags: ['type:welcome-summaries', 'onboarding:first-summaries'],
      metadata: {
        userId: user.id,
        type: 'welcome-summaries',
        tickerCount: tickerSummaries.length,
        tenQCount,
        form4Count
      }
    });

    return result;

  } catch (error) {
    console.error('Error sending welcome summaries:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send welcome summaries'
    };
  }
}
```

**Checkpoint 6.2.1**: Tests pass:
```bash
npm run test -- --testPathPattern="welcome-summaries"
```

#### 6.2.2 Add Email Template
**File**: `lib/email/templates.ts`

Add `WELCOME_SUMMARIES` to EmailType enum and create template function.

### Step 6.3: 🟢 Trigger Summary Delivery

#### 6.3.1 Add Dashboard Welcome Check
**File**: `app/dashboard/page.tsx` (or appropriate location)

When dashboard loads with `?welcome=true`:
1. Check if user just completed onboarding
2. Call `sendWelcomeSummaries(userId)`
3. Show toast notification

**Checkpoint 6.3.1**: End-to-end test:
```bash
npm run test:e2e -- --grep="welcome summaries"
```

### Step 6.4: 🔵 Refactor

- [ ] Add retry logic for failed summary emails
- [ ] Add logging for monitoring

### Step 6.5: Final Phase Verification

#### Automated Verification:
- [ ] Summary service tests pass: `npm run test -- --testPathPattern="welcome-summaries"`
- [ ] Build succeeds: `npm run build`
- [ ] E2E tests pass

#### Manual Verification:
- [ ] Complete full onboarding flow
- [ ] Check email inbox for welcome summaries
- [ ] Verify summaries contain correct tickers

**STOP**: Await manual confirmation before Phase 7.

---

## Phase 7: Existing User Merge Modal

### Overview
Create a modal component that offers to merge pending tickers when an existing user signs in with pending onboarding data.

### Step 7.1: 🔴 Write Failing Tests

**Test File**: `__tests__/components/merge-tickers-modal.test.tsx`

```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { MergeTickersModal } from '@/components/dashboard/merge-tickers-modal';

describe('MergeTickersModal', () => {
  const mockPendingTickers = [
    { symbol: 'NVDA', companyName: 'NVIDIA Corporation' },
    { symbol: 'AMD', companyName: 'Advanced Micro Devices' }
  ];

  it('should display pending tickers', () => {
    render(
      <MergeTickersModal
        pendingTickers={mockPendingTickers}
        onMerge={jest.fn()}
        onDismiss={jest.fn()}
      />
    );

    expect(screen.getByText('NVDA')).toBeInTheDocument();
    expect(screen.getByText('AMD')).toBeInTheDocument();
  });

  it('should call onMerge with selected tickers', async () => {
    const onMerge = jest.fn();
    // Test merge functionality
  });

  it('should call onDismiss when cancel clicked', async () => {
    const onDismiss = jest.fn();
    // Test dismiss functionality
  });

  it('should handle ticker limit when merging', async () => {
    // If user has 4 tickers and tries to add 3, show warning
  });
});
```

### Step 7.2: 🟢 Implement Merge Modal

#### 7.2.1 Create Merge Modal Component
**File**: `components/dashboard/merge-tickers-modal.tsx`

```typescript
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';

interface PendingTicker {
  symbol: string;
  companyName: string;
}

interface MergeTickersModalProps {
  pendingTickers: PendingTicker[];
  existingTickerCount: number;
  maxTickers?: number;
  onMerge: (tickers: PendingTicker[]) => Promise<void>;
  onDismiss: () => void;
}

export function MergeTickersModal({
  pendingTickers,
  existingTickerCount,
  maxTickers = 5,
  onMerge,
  onDismiss
}: MergeTickersModalProps) {
  const [selectedTickers, setSelectedTickers] = useState<Set<string>>(
    new Set(pendingTickers.map(t => t.symbol))
  );
  const [isLoading, setIsLoading] = useState(false);

  const availableSlots = maxTickers - existingTickerCount;
  const selectedCount = selectedTickers.size;
  const exceedsLimit = selectedCount > availableSlots;

  const handleToggle = (symbol: string) => {
    setSelectedTickers(prev => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  };

  const handleMerge = async () => {
    if (exceedsLimit) return;

    setIsLoading(true);
    try {
      const tickersToMerge = pendingTickers.filter(t => selectedTickers.has(t.symbol));
      await onMerge(tickersToMerge);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onDismiss}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Companies from Onboarding</DialogTitle>
          <DialogDescription>
            You selected these companies during signup. Would you like to add them to your tracked list?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          {pendingTickers.map((ticker) => (
            <div
              key={ticker.symbol}
              className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted/50"
            >
              <Checkbox
                id={ticker.symbol}
                checked={selectedTickers.has(ticker.symbol)}
                onCheckedChange={() => handleToggle(ticker.symbol)}
              />
              <label
                htmlFor={ticker.symbol}
                className="flex-1 cursor-pointer"
              >
                <span className="font-medium">{ticker.symbol}</span>
                <span className="text-muted-foreground ml-2">{ticker.companyName}</span>
              </label>
            </div>
          ))}
        </div>

        {exceedsLimit && (
          <p className="text-sm text-destructive">
            You can only track {maxTickers} companies. Please deselect {selectedCount - availableSlots} to continue.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onDismiss}>
            Skip
          </Button>
          <Button
            onClick={handleMerge}
            disabled={isLoading || exceedsLimit || selectedCount === 0}
          >
            {isLoading ? 'Adding...' : `Add ${selectedCount} Companies`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**Checkpoint 7.2.1**: Component tests pass:
```bash
npm run test -- --testPathPattern="merge-tickers-modal"
```

#### 7.2.2 Add API Endpoint for Merging
**File**: `app/api/onboarding/merge-pending/route.ts`

#### 7.2.3 Integrate with Dashboard
**File**: `app/dashboard/page.tsx`

Check for `?merge=pending` query param and show modal if pending data exists.

### Step 7.3: 🔵 Refactor

- [ ] Add animations to modal
- [ ] Improve error handling

### Step 7.4: Final Phase Verification

#### Automated Verification:
- [ ] Modal tests pass: `npm run test -- --testPathPattern="merge-tickers-modal"`
- [ ] API tests pass
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Sign in as existing user with pending data
- [ ] Modal appears with pending tickers
- [ ] Can select/deselect tickers
- [ ] Merge button adds selected tickers
- [ ] Skip button dismisses modal

**STOP**: Await manual confirmation before Phase 8.

---

## Phase 8: Cleanup Cron Job

### Overview
Create a cron job to delete expired PendingOnboarding records (older than 24 hours).

### Step 8.1: 🔴 Write Failing Tests

**Test File**: `__tests__/cron/cleanup-pending.test.ts`

```typescript
describe('cleanupExpiredPendingOnboarding', () => {
  it('should delete records where expiresAt < now', async () => {
    // Create expired record
    // Run cleanup
    // Verify deleted
  });

  it('should not delete non-expired records', async () => {
    // Create valid record
    // Run cleanup
    // Verify still exists
  });

  it('should return count of deleted records', async () => {
    // Create 3 expired records
    // Run cleanup
    // Verify returns 3
  });
});
```

### Step 8.2: 🟢 Implement Cleanup Handler

#### 8.2.1 Create Cleanup Function
**File**: `lib/cron/handlers/cleanup-pending-onboarding.ts`

```typescript
import { getPrismaClient } from '@/lib/db/prisma';

export async function cleanupExpiredPendingOnboarding(): Promise<{ deleted: number }> {
  const prisma = getPrismaClient();

  const result = await prisma.pendingOnboarding.deleteMany({
    where: {
      expiresAt: {
        lt: new Date()
      }
    }
  });

  console.log(`Cleaned up ${result.count} expired pending onboarding records`);

  return { deleted: result.count };
}
```

#### 8.2.2 Add to Cron Handler
**File**: `lib/cron/handlers/` (integrate with existing cron system)

### Step 8.3: Final Phase Verification

#### Automated Verification:
- [ ] Cleanup tests pass: `npm run test -- --testPathPattern="cleanup-pending"`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Manually trigger cleanup cron
- [ ] Verify expired records deleted
- [ ] Verify valid records remain

---

## Testing Strategy

### TDD Test Design Principles

1. **One Assertion Per Test** (when practical)
2. **Descriptive Test Names**: "should [verb] when [condition]"
3. **Arrange-Act-Assert**: Clear structure
4. **Test Behavior, Not Implementation**
5. **Edge Cases First**

### Test Categories

#### Contract Tests (Write First)
- API endpoint input/output contracts
- Component prop contracts

#### Edge Case Tests (Write Second)
- Invalid email formats
- Empty selections
- Ticker limit exceeded
- Expired pending records

#### Integration Tests (Write Third)
- Full onboarding flow
- Webhook → user creation → ticker merge
- Dashboard → merge modal → API

### Checkpoint Frequency
- Minimum 3 checkpoints per phase (Red, Green, Refactor)
- 1 checkpoint per test group (every 2-3 tests)
- Maximum 15 minutes between checkpoints

### Manual Testing Steps
1. Complete onboarding as new user → verify Clerk redirect
2. Verify email in inbox → click verification link
3. Check dashboard shows tickers
4. Check inbox for welcome summaries
5. Sign out, go through onboarding with same email → verify sign-in redirect
6. Sign in → verify merge modal appears
7. Add tickers via modal → verify dashboard updates

---

## Performance Considerations

- **Cached Summaries Only**: MVP doesn't generate summaries on-demand (performance)
- **Batch Email Queries**: Use single queries with `distinct` for summary lookup
- **Index on expiresAt**: Ensures cleanup cron is efficient
- **24-hour Expiration**: Limits PendingOnboarding table size

---

## Migration Notes

### Database Migration
- New `PendingOnboarding` model requires migration
- Non-breaking change (new table only)
- Indexes added for query performance

### Middleware Changes
- `/onboarding` added to public routes
- Non-breaking for existing users

### Webhook Changes
- Backward compatible (additional logic only)
- Existing user creation still works

---

## References

- Research document: `thoughts/shared/research/2026-01-01-passwordless-onboarding-architecture.md`
- Current onboarding: `app/(auth)/onboarding/page.tsx`
- Clerk webhook: `app/api/webhook/clerk/route.ts`
- Email templates: `lib/email/templates.ts`
- Summary service: `lib/email/summary-service.ts`
- Form-4 materiality: `lib/email/form4-data-extractor.ts:417` - `determineSignalStrength()` function
- Form-4 prompt: `lib/ai/prompts/form-4.ts` - Defines `signalStrength` output format
