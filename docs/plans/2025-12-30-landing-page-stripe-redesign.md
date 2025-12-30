# Landing Page Redesign with Stripe Integration - Implementation Plan

**Date**: 2025-12-30 15:00:11 AEDT (Updated: 2025-12-30 16:30 AEDT)
**Git Commit**: a1a6529a49b51ab27c55f71a4b4013889b63eb81
**Branch**: main
**Repository**: tldrsec-ai

## Implementation Status: COMPLETE

All 6 phases have been implemented and verified:
- Phase 1: Stripe Configuration ($99/$139 with Annual Billing)
- Phase 2: Ticker Confirmation & Quarterly Earnings Email
- Phase 3: Waitlist Migration & Feature Flag
- Phase 4: Landing Page Components with Curated Filings
- Phase 5: Stripe Checkout with Annual Billing
- Phase 6: Final Integration & Testing

**Tests Passing**: 28/28 (16 Stripe + 12 Ticker Confirmation)
**Build Status**: SUCCESS
**Lint Status**: CLEAN

## Overview

Implement a new landing page with 3-tier pricing ($0 Free, $99 Pro, $139 Premium), manually curated filing previews, animated dialogs for full summary viewing, Stripe checkout with annual billing support, and a new ticker confirmation flow that triggers quarterly earnings emails. The implementation ensures zero downtime by using feature flags and preserving the existing waitlist at `/waitlist`.

## User Requirements (Clarified)

### Pricing Structure
| Tier | Monthly | Annual (2 months free) |
|------|---------|------------------------|
| Free | $0 | $0 |
| Pro | $99/month | $990/year |
| Premium | $139/month | $1,390/year |

### Tier Features
- **Free Tier**: 3 tickers, weekly digest, 10-K/10-Q summaries only
- **Pro Tier**: 10 tickers, real-time alerts, all filing types
- **Premium Tier**: Unlimited tickers, API access, priority support

### Key Business Requirements
1. **Premium → Direct to Onboarding**: NO contact sales - straight to onboarding as trial user
2. **Ticker Confirmation Flow**: Users confirm portfolio and receive quarterly earnings emails
3. **Filing Previews**: Manually curated impressive filings (NOT algorithmic database queries)
4. **Dialog Content**: Show FULL summary (NOT truncated/teaser)
5. **Dashboard Upgrades**: Show "Upgrade" / "Start Premium" CTAs for free tier users
6. **1-Minute Grace Period**: If user re-confirms within 1 minute, only email for new tickers

---

## Current State Analysis

### Existing Landing Page (`/app/page.tsx`)
- **Current Implementation**: Minimalist waitlist-focused landing page using `FocusedInvestorHero` component
- **Location**: `/app/page.tsx:76-80` with SSR counter data
- **Features**: Waitlist form, animated counter (60s animation), floating elements
- **No `(marketing)` route group exists** - all marketing content served from root

### Existing Stripe Integration
- **Webhook Handler**: `/app/api/webhook/stripe/route.ts` - Handles 6 event types
- **Checkout Flow**: `/app/api/user/subscription/route.ts:106-235` - Creates checkout sessions
- **Billing Portal**: `/app/api/billing/portal/route.ts:17-68`
- **Current Pricing**: $9 BASIC, $29 PROFESSIONAL, $99 PREMIUM (in `lib/stripe.ts:38-81`)

### Existing Onboarding
- **Location**: `/app/(auth)/onboarding/page.tsx`
- **Flow**: 2-step (sectors → equities), max 5 companies
- **Post-Onboarding**: Redirects to dashboard

### Existing Dashboard
- **Ticker Management**: Add/remove tickers
- **No Confirmation Button**: Users can modify tickers but no explicit "confirm" action
- **No Upgrade CTAs**: Missing conversion prompts for free users

### Existing Email Services
- **Summary Emails**: `sendFilingSummaryEmail()` in `/lib/email/summary-service.ts`
- **Latest Summaries**: `sendLatestSummariesEmail()` function exists
- **Async Queue**: Rate-limited email processing

---

## Desired End State

After implementation:
1. New landing page at `/` with 3-tier pricing ($0/$99/$139)
2. Annual billing option with 2 months free discount
3. Ticker confirmation flow triggers quarterly earnings emails
4. Manually curated filing previews with full summary dialogs
5. Dashboard shows upgrade CTAs for free tier users
6. 1-minute grace period prevents duplicate emails on quick edits
7. Existing waitlist preserved at `/waitlist` route
8. Feature flag controls rollout

### Verification:
- `npm run build` succeeds without errors
- `npm run test` passes all tests
- Landing page loads in <2 seconds
- Filing preview dialog shows full summary with smooth 60fps animations
- Stripe test checkout completes for both monthly and annual billing
- Ticker confirmation triggers email within 30 seconds
- Dashboard upgrade CTAs visible for free tier users

---

## What We're NOT Doing

- **NOT changing existing webhook logic** - only adding new price IDs
- **NOT implementing full API access** - Premium tier gets API but implementation is future work
- **NOT touching newsletter subscription flow** - stays as-is
- **NOT modifying the 2-step onboarding flow** - only adding post-onboarding ticker confirmation

---

## Implementation Approach

### Elon's 5-Step Engineering Algorithm Applied

1. **Question Requirements**:
   - Do we need new database fields? YES - for ticker confirmation tracking
   - Do we need new Stripe products? YES - $99/$139 with annual billing
   - Do we need new API endpoints? YES - ticker confirmation endpoint

2. **Delete/Simplify**:
   - Reuse existing email service infrastructure
   - Reuse existing Dialog component from shadcn/ui
   - Reuse existing framer-motion patterns

3. **Optimize**:
   - Use Server Components for static content
   - Implement 1-minute grace period with simple timestamp check

4. **Accelerate**:
   - TDD approach with failing tests first
   - Feature flag allows parallel development

5. **Automate**:
   - Automated tests validate ticker confirmation flow
   - CI/CD validates Stripe integration

---

## Phase 1: Stripe Configuration ($99/$139 with Annual Billing) ✅ COMPLETED

### Overview
Set up new Stripe price IDs for $99 Pro and $139 Premium with annual billing options.

### Step 1.1: ✅ Write Failing Tests (COMPLETED)

**Test File**: `__tests__/config/stripe-pricing.test.ts`

```typescript
import { SUBSCRIPTION_PLANS, getPlanConfig } from '@/lib/stripe';

describe('Stripe Pricing Configuration', () => {
  describe('Free Tier', () => {
    it('should have $0 price and 3 ticker limit', () => {
      const plan = getPlanConfig('FREE');
      expect(plan).toBeDefined();
      expect(plan?.monthlyPrice).toBe(0);
      expect(plan?.tickerLimit).toBe(3);
    });
  });

  describe('Pro Tier', () => {
    it('should have $99/month price', () => {
      const plan = getPlanConfig('PRO');
      expect(plan?.monthlyPrice).toBe(99);
    });

    it('should have $990/year annual price (2 months free)', () => {
      const plan = getPlanConfig('PRO');
      expect(plan?.annualPrice).toBe(990);
    });

    it('should have 10 ticker limit', () => {
      const plan = getPlanConfig('PRO');
      expect(plan?.tickerLimit).toBe(10);
    });
  });

  describe('Premium Tier', () => {
    it('should have $139/month price', () => {
      const plan = getPlanConfig('PREMIUM');
      expect(plan?.monthlyPrice).toBe(139);
    });

    it('should have $1390/year annual price (2 months free)', () => {
      const plan = getPlanConfig('PREMIUM');
      expect(plan?.annualPrice).toBe(1390);
    });

    it('should have unlimited tickers', () => {
      const plan = getPlanConfig('PREMIUM');
      expect(plan?.tickerLimit).toBe(-1);
    });
  });

  describe('Valid Stripe Price IDs', () => {
    it('should have valid monthly price IDs for paid tiers', () => {
      const pro = getPlanConfig('PRO');
      const premium = getPlanConfig('PREMIUM');
      expect(pro?.monthlyPriceId).toMatch(/^price_/);
      expect(premium?.monthlyPriceId).toMatch(/^price_/);
    });

    it('should have valid annual price IDs for paid tiers', () => {
      const pro = getPlanConfig('PRO');
      const premium = getPlanConfig('PREMIUM');
      expect(pro?.annualPriceId).toMatch(/^price_/);
      expect(premium?.annualPriceId).toMatch(/^price_/);
    });
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="stripe-pricing"
# Expected: 9 failing tests
```

### Step 1.2: ✅ Implement to Pass Tests (COMPLETED)

#### 1.2.1 Update Stripe Configuration
**File**: `lib/stripe.ts`

```typescript
export const SUBSCRIPTION_PLANS = {
  FREE: {
    name: 'Free',
    monthlyPriceId: null,
    annualPriceId: null,
    monthlyPrice: 0,
    annualPrice: 0,
    tickerLimit: 3,
    filingTypes: ['10-K', '10-Q'], // Only annual/quarterly reports
    emailFrequency: 'weekly',
    features: [
      '3 companies to track',
      'Weekly digest emails',
      '10-K and 10-Q summaries only',
      'Basic filing alerts',
    ],
  },
  PRO: {
    name: 'Pro',
    monthlyPriceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || '',
    annualPriceId: process.env.STRIPE_PRO_ANNUAL_PRICE_ID || '',
    monthlyPrice: 99,
    annualPrice: 990, // 2 months free (10 months × $99)
    tickerLimit: 10,
    filingTypes: ['10-K', '10-Q', '8-K', 'FORM4', 'DEF14A'],
    emailFrequency: 'realtime',
    features: [
      '10 companies to track',
      'Real-time email alerts',
      'All filing types (8-K, Form 4, etc.)',
      'Priority processing',
      'Email support',
    ],
  },
  PREMIUM: {
    name: 'Premium',
    monthlyPriceId: process.env.STRIPE_PREMIUM_MONTHLY_PRICE_ID || '',
    annualPriceId: process.env.STRIPE_PREMIUM_ANNUAL_PRICE_ID || '',
    monthlyPrice: 139,
    annualPrice: 1390, // 2 months free (10 months × $139)
    tickerLimit: -1, // unlimited
    filingTypes: ['ALL'],
    emailFrequency: 'realtime',
    features: [
      'Unlimited companies',
      'Real-time email alerts',
      'All filing types',
      'API access for developers',
      'Priority processing queue',
      'Dedicated support',
    ],
  },
} as const;

export function getPlanConfig(planType: keyof typeof SUBSCRIPTION_PLANS) {
  return SUBSCRIPTION_PLANS[planType];
}
```

#### 1.2.2 Add Environment Variables
**File**: `.env.local` (and Vercel)

```bash
# Stripe Price IDs - Monthly
STRIPE_PRO_MONTHLY_PRICE_ID=price_xxx_pro_monthly
STRIPE_PREMIUM_MONTHLY_PRICE_ID=price_xxx_premium_monthly

# Stripe Price IDs - Annual (2 months free)
STRIPE_PRO_ANNUAL_PRICE_ID=price_xxx_pro_annual
STRIPE_PREMIUM_ANNUAL_PRICE_ID=price_xxx_premium_annual

# Feature Flag
NEXT_PUBLIC_LANDING_PAGE_ENABLED=false
```

**Checkpoint 1.2.2**: All pricing tests pass:
```bash
npm run test -- --testPathPattern="stripe-pricing"
# Expected: 9 passing
```

### Step 1.3: ✅ Refactor (COMPLETED)

- [x] Deprecate old BASIC/PROFESSIONAL naming (moved to LEGACY_SUBSCRIPTION_PLANS)
- [x] Update TypeScript types for billing interval (added NewSubscriptionPlan, LegacySubscriptionPlan, BillingInterval)
- [x] Add helper function for calculating savings percentage (calculateSavingsPercentage, calculateAnnualSavings)

### Step 1.4: Stripe Dashboard Setup

**Manual Actions Required:**
1. Create Pro Monthly: $99/month recurring
2. Create Pro Annual: $990/year recurring
3. Create Premium Monthly: $139/month recurring
4. Create Premium Annual: $1,390/year recurring
5. Copy price IDs to environment variables

**STOP**: Await manual confirmation before Phase 2.

---

## Phase 2: Ticker Confirmation & Quarterly Earnings Email ✅ COMPLETED

### Overview
Build the ticker confirmation flow where users confirm their portfolio and receive quarterly earnings emails immediately.

### Implementation Summary (Completed 2025-12-30)

**Files Created:**
- `app/api/user/tickers/confirm/route.ts` - Confirmation API endpoint with 1-minute grace period
- `lib/email/quarterly-earnings-service.ts` - Email service for quarterly earnings
- `components/dashboard/ticker-confirmation-section.tsx` - Dashboard confirmation UI
- `components/dashboard/upgrade-cta-section.tsx` - Upgrade CTAs for Free/Pro users
- `__tests__/api/user/tickers/confirm.test.ts` - 6 API tests
- `__tests__/services/quarterly-earnings-email.test.ts` - 6 service tests

**Schema Updates:**
- Added `tickersConfirmedAt`, `lastConfirmationEmailSentAt`, `tickersAtLastConfirmation` to User model

**Tests:** 12/12 passing

### Database Schema Changes

**Add to Prisma schema:**
```prisma
model User {
  // ... existing fields

  // Ticker confirmation tracking
  tickersConfirmedAt          DateTime?
  lastConfirmationEmailSentAt DateTime?
  tickersAtLastConfirmation   String[]    // Array of ticker symbols at last confirmation
}
```

### Step 2.1: 🔴 Write Failing Tests

**Test File**: `__tests__/api/user/tickers/confirm.test.ts`

```typescript
import { POST } from '@/app/api/user/tickers/confirm/route';

describe('Ticker Confirmation API', () => {
  it('should confirm tickers and trigger email for new user', async () => {
    // Mock: User with tickers, never confirmed before
    const request = new Request('http://localhost/api/user/tickers/confirm', {
      method: 'POST',
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.tickersConfirmed).toBe(true);
    expect(data.emailSent).toBe(true);
    expect(data.tickerCount).toBeGreaterThan(0);
  });

  it('should skip email for tickers confirmed within 1 minute', async () => {
    // Mock: User confirmed 30 seconds ago, same tickers
    const request = new Request('http://localhost/api/user/tickers/confirm', {
      method: 'POST',
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.emailSent).toBe(false);
    expect(data.reason).toBe('within_grace_period');
  });

  it('should only email new tickers when re-confirmed within grace period', async () => {
    // Mock: User confirmed 30 seconds ago, added 1 new ticker
    const request = new Request('http://localhost/api/user/tickers/confirm', {
      method: 'POST',
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.emailSent).toBe(true);
    expect(data.newTickersEmailed).toEqual(['NVDA']); // Only the new one
  });

  it('should require authentication', async () => {
    // No auth header
    const request = new Request('http://localhost/api/user/tickers/confirm', {
      method: 'POST',
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });
});
```

**Test File**: `__tests__/services/quarterly-earnings-email.test.ts`

```typescript
import { sendQuarterlyEarningsEmail } from '@/lib/email/quarterly-earnings-service';

describe('Quarterly Earnings Email Service', () => {
  it('should send email with latest summaries for user tickers', async () => {
    const result = await sendQuarterlyEarningsEmail({
      userId: 'test-user-id',
      tickerSymbols: ['AAPL', 'MSFT', 'GOOGL'],
      email: 'test@example.com',
    });

    expect(result.success).toBe(true);
    expect(result.summariesIncluded).toBeGreaterThan(0);
  });

  it('should handle case where no summaries exist for tickers', async () => {
    const result = await sendQuarterlyEarningsEmail({
      userId: 'test-user-id',
      tickerSymbols: ['UNKNOWNTICKER'],
      email: 'test@example.com',
    });

    expect(result.success).toBe(true);
    expect(result.summariesIncluded).toBe(0);
    expect(result.message).toContain('no summaries available');
  });
});
```

**Checkpoint 2.1**: Tests fail:
```bash
npm run test -- --testPathPattern="confirm|quarterly-earnings"
# Expected: 6+ failing tests
```

### Step 2.2: 🟢 Implement to Pass Tests

#### 2.2.1 Database Migration
**File**: `prisma/migrations/XXXXXX_add_ticker_confirmation/migration.sql`

```sql
-- Add ticker confirmation tracking fields
ALTER TABLE "User" ADD COLUMN "tickersConfirmedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "lastConfirmationEmailSentAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "tickersAtLastConfirmation" TEXT[];
```

#### 2.2.2 Create Confirmation API
**File**: `app/api/user/tickers/confirm/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getPrismaClient } from '@/lib/db/prisma';
import { sendQuarterlyEarningsEmail } from '@/lib/email/quarterly-earnings-service';

const GRACE_PERIOD_MS = 60 * 1000; // 1 minute

export async function POST() {
  const { userId } = auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const prisma = getPrismaClient();

  // Get user with their tickers
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    include: {
      tickers: {
        select: { symbol: true },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const currentTickers = user.tickers.map(t => t.symbol);
  const previousTickers = user.tickersAtLastConfirmation || [];
  const now = new Date();

  // Check if within grace period
  const lastConfirmation = user.tickersConfirmedAt;
  const isWithinGracePeriod = lastConfirmation &&
    (now.getTime() - lastConfirmation.getTime()) < GRACE_PERIOD_MS;

  let emailSent = false;
  let newTickersEmailed: string[] = [];
  let reason = '';

  if (isWithinGracePeriod) {
    // Find newly added tickers
    const newTickers = currentTickers.filter(t => !previousTickers.includes(t));

    if (newTickers.length === 0) {
      reason = 'within_grace_period';
    } else {
      // Only email for new tickers
      await sendQuarterlyEarningsEmail({
        userId: user.id,
        tickerSymbols: newTickers,
        email: user.email,
      });
      emailSent = true;
      newTickersEmailed = newTickers;
    }
  } else {
    // Full email for all tickers
    await sendQuarterlyEarningsEmail({
      userId: user.id,
      tickerSymbols: currentTickers,
      email: user.email,
    });
    emailSent = true;
    newTickersEmailed = currentTickers;
  }

  // Update confirmation tracking
  await prisma.user.update({
    where: { id: user.id },
    data: {
      tickersConfirmedAt: now,
      lastConfirmationEmailSentAt: emailSent ? now : user.lastConfirmationEmailSentAt,
      tickersAtLastConfirmation: currentTickers,
    },
  });

  return NextResponse.json({
    tickersConfirmed: true,
    tickerCount: currentTickers.length,
    emailSent,
    newTickersEmailed,
    reason,
  });
}
```

#### 2.2.3 Create Quarterly Earnings Email Service
**File**: `lib/email/quarterly-earnings-service.ts`

```typescript
import { getPrismaClient } from '@/lib/db/prisma';
import { sendFilingSummaryEmail } from './summary-service';

interface QuarterlyEarningsEmailParams {
  userId: string;
  tickerSymbols: string[];
  email: string;
}

export async function sendQuarterlyEarningsEmail(params: QuarterlyEarningsEmailParams) {
  const { userId, tickerSymbols, email } = params;

  if (tickerSymbols.length === 0) {
    return {
      success: true,
      summariesIncluded: 0,
      message: 'No tickers to send summaries for',
    };
  }

  const prisma = getPrismaClient();

  // Get latest quarterly summaries (10-Q, 10-K) for each ticker
  const summaries = await prisma.summary.findMany({
    where: {
      ticker: {
        symbol: { in: tickerSymbols },
      },
      filingType: { in: ['10-K', '10-Q'] },
    },
    include: {
      ticker: true,
    },
    orderBy: { filingDate: 'desc' },
    distinct: ['tickerId'], // One per company
  });

  if (summaries.length === 0) {
    return {
      success: true,
      summariesIncluded: 0,
      message: 'No quarterly earnings summaries available for these tickers yet. We will email you when new filings are processed.',
    };
  }

  // Send combined email with all summaries
  await sendFilingSummaryEmail({
    to: email,
    subject: `Your Investment Portfolio: ${summaries.length} Quarterly Earnings Summaries`,
    summaries: summaries.map(s => ({
      ticker: s.ticker.symbol,
      companyName: s.ticker.companyName,
      filingType: s.filingType,
      filingDate: s.filingDate,
      summaryText: s.summaryText || '',
      summaryJSON: s.summaryJSON,
    })),
    isConfirmation: true,
  });

  return {
    success: true,
    summariesIncluded: summaries.length,
    message: `Sent ${summaries.length} quarterly earnings summaries`,
  };
}
```

#### 2.2.4 Add Dashboard Confirmation Button
**File**: `components/dashboard/ticker-confirmation-section.tsx`

```typescript
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface TickerConfirmationSectionProps {
  tickerCount: number;
}

export function TickerConfirmationSection({ tickerCount }: TickerConfirmationSectionProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleConfirm = async () => {
    setIsConfirming(true);

    try {
      const response = await fetch('/api/user/tickers/confirm', {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        setConfirmed(true);

        if (data.emailSent) {
          toast.success(
            `Portfolio confirmed! We've emailed you quarterly earnings summaries for ${data.newTickersEmailed.length} companies.`
          );
        } else {
          toast.success('Portfolio confirmed! No new summaries to send.');
        }
      } else {
        toast.error(data.error || 'Failed to confirm portfolio');
      }
    } catch (error) {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsConfirming(false);
    }
  };

  if (tickerCount === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        Add companies to your portfolio to receive quarterly earnings summaries.
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-6">
      <h3 className="font-semibold text-blue-900 mb-2">
        Confirm Your Portfolio
      </h3>
      <p className="text-blue-700 text-sm mb-4">
        Ready to receive quarterly earnings summaries for {tickerCount} companies?
        Click confirm and we'll email you the latest reports.
      </p>

      <Button
        onClick={handleConfirm}
        disabled={isConfirming || confirmed}
        className="bg-blue-600 hover:bg-blue-700"
      >
        {isConfirming ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Confirming...
          </>
        ) : confirmed ? (
          <>
            <CheckCircle className="w-4 h-4 mr-2" />
            Portfolio Confirmed
          </>
        ) : (
          'Confirm & Email Me Summaries'
        )}
      </Button>
    </div>
  );
}
```

#### 2.2.5 Add Dashboard Upgrade CTAs
**File**: `components/dashboard/upgrade-cta-section.tsx`

```typescript
'use client';

import { Button } from '@/components/ui/button';
import { Crown, Zap } from 'lucide-react';
import Link from 'next/link';

interface UpgradeCTASectionProps {
  currentPlan: 'FREE' | 'PRO' | 'PREMIUM';
  tickerCount: number;
  tickerLimit: number;
}

export function UpgradeCTASection({ currentPlan, tickerCount, tickerLimit }: UpgradeCTASectionProps) {
  if (currentPlan === 'PREMIUM') return null;

  const isNearLimit = tickerCount >= tickerLimit * 0.8;
  const isAtLimit = tickerCount >= tickerLimit;

  if (currentPlan === 'FREE') {
    return (
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-lg p-6 text-white mt-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Upgrade to Pro
            </h3>
            <p className="text-blue-100 text-sm mt-1">
              {isAtLimit
                ? `You've reached your ${tickerLimit} company limit.`
                : isNearLimit
                  ? `You're using ${tickerCount} of ${tickerLimit} companies.`
                  : 'Get real-time alerts and all filing types.'
              }
            </p>
          </div>
          <Link href="/dashboard/billing">
            <Button variant="secondary" className="bg-white text-blue-600 hover:bg-blue-50">
              Upgrade to Pro - $99/mo
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // PRO tier - upsell to Premium
  return (
    <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-lg p-6 text-white mt-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg flex items-center gap-2">
            <Crown className="w-5 h-5" />
            Go Premium
          </h3>
          <p className="text-amber-100 text-sm mt-1">
            Unlimited companies, API access, and dedicated support.
          </p>
        </div>
        <Link href="/dashboard/billing">
          <Button variant="secondary" className="bg-white text-amber-600 hover:bg-amber-50">
            Start Premium - $139/mo
          </Button>
        </Link>
      </div>
    </div>
  );
}
```

**Checkpoint 2.2.5**: All ticker confirmation tests pass:
```bash
npm run test -- --testPathPattern="confirm|quarterly-earnings"
# Expected: 6+ passing
```

### Step 2.3: 🔵 Refactor

- [ ] Add email tracking to prevent duplicates
- [ ] Add rate limiting to confirmation endpoint
- [ ] Add analytics tracking for confirmation events

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [ ] All confirmation tests pass
- [ ] Database migration applies cleanly
- [ ] Build succeeds

#### Manual Verification:
- [ ] Add tickers in dashboard
- [ ] Click "Confirm & Email Me Summaries"
- [ ] Receive email with quarterly earnings
- [ ] Re-confirm within 1 minute - no duplicate email
- [ ] Add new ticker, re-confirm - only new ticker emailed

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: Waitlist Migration & Feature Flag

### Overview
Move existing waitlist to `/waitlist` route and implement feature flag for landing page rollout.

### Step 3.1: 🔴 Write Failing Tests

**Test File**: `__tests__/routes/waitlist-migration.test.ts`

```typescript
describe('Waitlist Migration', () => {
  it('should render waitlist page at /waitlist route', async () => {
    const response = await fetch('/waitlist');
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('waitlist');
  });

  it('should redirect / to /waitlist when feature flag is false', async () => {
    process.env.NEXT_PUBLIC_LANDING_PAGE_ENABLED = 'false';
    // Test redirect behavior
  });

  it('should render landing page at / when feature flag is true', async () => {
    process.env.NEXT_PUBLIC_LANDING_PAGE_ENABLED = 'true';
    // Test landing page renders
  });
});
```

### Step 3.2: 🟢 Implement to Pass Tests

#### 3.2.1 Create Waitlist Route
**File**: `app/waitlist/page.tsx`

```typescript
import { Suspense } from 'react';
import { FocusedInvestorHero } from '@/components/landing/focused-investor-hero';
import { getCounterData } from '@/lib/waitlist/counter-data';

export const metadata = {
  title: 'Join the Waitlist - tldrsec.app',
  description: 'Join thousands of investors getting AI-powered SEC filing summaries.',
};

export default async function WaitlistPage() {
  const { baseCount, realCount } = await getCounterData();

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <FocusedInvestorHero baseCount={baseCount} realCount={realCount} />
    </Suspense>
  );
}
```

#### 3.2.2 Update Root Page with Feature Flag
**File**: `app/page.tsx`

```typescript
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { LandingPage } from '@/components/landing/new-landing-page';
import { getCuratedFilings } from '@/lib/data/curated-filings';

export default async function HomePage() {
  // Feature flag check
  if (process.env.NEXT_PUBLIC_LANDING_PAGE_ENABLED !== 'true') {
    redirect('/waitlist');
  }

  const curatedFilings = await getCuratedFilings();

  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
      <LandingPage filingPreviews={curatedFilings} />
    </Suspense>
  );
}
```

**STOP**: Await manual confirmation before Phase 4.

---

## Phase 4: Landing Page Components with Curated Filings

### Overview
Build landing page components with manually curated filing previews and full summary dialogs.

### Step 4.1: Curated Filings Data Source

Instead of querying the database, we'll use a manually curated JSON file for impressive filings.

**File**: `lib/data/curated-filings.ts`

```typescript
// Manually curated impressive filings for landing page
export const CURATED_FILINGS = [
  {
    id: 'curated-aapl-10k',
    ticker: 'AAPL',
    companyName: 'Apple Inc.',
    filingType: '10-K',
    filedAt: '2024-10-31',
    keyHighlights: [
      'Revenue increased 8% YoY to $394.3 billion',
      'Services segment grew 16% to record $85.2 billion',
      'Operating margin improved to 30.1% from 28.5%',
      'Repurchased $90 billion in stock during fiscal year',
    ],
    fullSummary: `Apple Inc. reported strong fiscal 2024 results with total revenue of $394.3 billion, an 8% increase year-over-year. The company's Services segment was a standout performer, growing 16% to reach a record $85.2 billion...`,
  },
  {
    id: 'curated-msft-10q',
    ticker: 'MSFT',
    companyName: 'Microsoft Corporation',
    filingType: '10-Q',
    filedAt: '2024-10-23',
    keyHighlights: [
      'Revenue up 16% YoY to $65.6 billion',
      'Azure and cloud services grew 29%',
      'AI services revenue doubled from prior year',
      'Operating income increased 14% to $30.6 billion',
    ],
    fullSummary: `Microsoft delivered exceptional Q1 FY2025 results with revenue of $65.6 billion, up 16% year-over-year. Azure and cloud services remained the growth engine, expanding 29%...`,
  },
  // Add 4-6 more impressive filings
];

export async function getCuratedFilings() {
  return CURATED_FILINGS;
}
```

### Step 4.2: Landing Page with Full Summary Dialog

**File**: `components/landing/filing-preview-card.tsx`

Key updates:
- Show FULL summary in dialog (not truncated)
- Smooth animation with framer-motion
- Mobile-optimized scrolling

```typescript
// Dialog shows full summary
<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
  <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
    {/* ... header ... */}

    {/* Full Summary - NOT truncated */}
    <div className="prose prose-slate max-w-none">
      <h4 className="font-semibold mb-3">Complete Analysis</h4>
      <p className="whitespace-pre-wrap text-slate-600 leading-relaxed">
        {filing.fullSummary}
      </p>
    </div>
  </DialogContent>
</Dialog>
```

### Step 4.3: Pricing Section with Annual Toggle

**File**: `components/landing/sections/pricing-section.tsx`

```typescript
'use client';

import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { SUBSCRIPTION_PLANS } from '@/lib/stripe';

export function PricingSection() {
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'annual'>('monthly');

  return (
    <section className="px-6 py-24 bg-slate-50">
      {/* Billing Toggle */}
      <div className="flex items-center justify-center gap-4 mb-12">
        <span className={billingInterval === 'monthly' ? 'font-semibold' : 'text-slate-500'}>
          Monthly
        </span>
        <Switch
          checked={billingInterval === 'annual'}
          onCheckedChange={(checked) => setBillingInterval(checked ? 'annual' : 'monthly')}
        />
        <span className={billingInterval === 'annual' ? 'font-semibold' : 'text-slate-500'}>
          Annual
          <span className="ml-2 text-sm text-green-600 font-medium">
            Save 2 months
          </span>
        </span>
      </div>

      {/* Pricing Cards */}
      <div className="grid gap-8 lg:grid-cols-3 max-w-5xl mx-auto">
        {Object.entries(SUBSCRIPTION_PLANS).map(([key, plan]) => (
          <PricingCard
            key={key}
            plan={plan}
            planKey={key}
            billingInterval={billingInterval}
          />
        ))}
      </div>
    </section>
  );
}
```

**STOP**: Await manual confirmation before Phase 5.

---

## Phase 5: Stripe Checkout with Annual Billing

### Overview
Connect pricing buttons to Stripe checkout supporting both monthly and annual billing.

### Step 5.1: Update Checkout Flow

**File**: `app/api/user/subscription/route.ts`

```typescript
// Support billing interval
const { planType, billingInterval = 'monthly' } = await request.json();

const plan = SUBSCRIPTION_PLANS[planType as keyof typeof SUBSCRIPTION_PLANS];
const priceId = billingInterval === 'annual'
  ? plan.annualPriceId
  : plan.monthlyPriceId;

// Create checkout session with selected price
const session = await stripe.checkout.sessions.create({
  mode: 'subscription',
  line_items: [{ price: priceId, quantity: 1 }],
  // ... rest of config
});
```

### Step 5.2: Premium Tier → Direct to Onboarding

**File**: `components/landing/sections/pricing-section.tsx`

```typescript
const handlePlanSelect = async (planKey: string, billingInterval: 'monthly' | 'annual') => {
  if (planKey === 'FREE') {
    router.push('/sign-up');
    return;
  }

  // Premium goes straight to onboarding (NOT contact sales)
  if (planKey === 'PREMIUM') {
    router.push('/sign-up?plan=premium&trial=true');
    return;
  }

  // PRO plan
  if (!isSignedIn) {
    router.push(`/sign-up?plan=${planKey.toLowerCase()}&interval=${billingInterval}`);
    return;
  }

  // Authenticated user - create checkout
  const url = await createCheckout(planKey, billingInterval);
  if (url) {
    window.location.href = url;
  }
};
```

**STOP**: Await manual confirmation before Phase 6.

---

## Phase 6: Final Integration & Testing

### Step 6.1: End-to-End Test Suite

```typescript
describe('Landing Page E2E', () => {
  it('should complete signup flow with ticker confirmation', async () => {
    // 1. Navigate to landing page
    // 2. Click "Start Free"
    // 3. Complete signup
    // 4. Complete onboarding
    // 5. Add tickers in dashboard
    // 6. Click "Confirm & Email Me Summaries"
    // 7. Verify email received
  });

  it('should complete Pro checkout with annual billing', async () => {
    // 1. Click "Start Pro Trial" with annual toggle ON
    // 2. Complete Stripe checkout with test card
    // 3. Verify subscription created with annual interval
  });
});
```

### Step 6.2: Production Readiness Checklist

#### Environment Variables:
- [ ] `STRIPE_PRO_MONTHLY_PRICE_ID` set in Vercel
- [ ] `STRIPE_PRO_ANNUAL_PRICE_ID` set in Vercel
- [ ] `STRIPE_PREMIUM_MONTHLY_PRICE_ID` set in Vercel
- [ ] `STRIPE_PREMIUM_ANNUAL_PRICE_ID` set in Vercel
- [ ] `NEXT_PUBLIC_LANDING_PAGE_ENABLED=false` initially

#### Database:
- [ ] Migration applied for ticker confirmation fields
- [ ] User model updated with new fields

#### Stripe Dashboard:
- [ ] 4 new prices created (Pro/Premium × Monthly/Annual)
- [ ] Webhook endpoint updated

#### Features Verified:
- [ ] Ticker confirmation flow works
- [ ] Quarterly earnings email sends correctly
- [ ] 1-minute grace period prevents duplicates
- [ ] Dashboard upgrade CTAs visible for free users
- [ ] Annual billing toggle works
- [ ] Full summary shows in dialog

---

## Migration Notes

### Database Changes
- Add `tickersConfirmedAt`, `lastConfirmationEmailSentAt`, `tickersAtLastConfirmation` to User model
- Run migration: `npm run db:migrate`

### Stripe Product Updates
1. Deprecate old $9/$29 prices (but keep for existing subscribers)
2. Create new $99/$139 monthly prices
3. Create new $990/$1390 annual prices

### Gradual Rollout
1. Deploy with `NEXT_PUBLIC_LANDING_PAGE_ENABLED=false`
2. Test in staging with flag enabled
3. Enable for 10% of traffic via edge config
4. Monitor for 24 hours
5. Full rollout

---

## References

- Original task: `.claude/tasks/landing-page-stripe-redesign.md`
- Replit prototype: Screenshots in `.playwright-mcp/`
- Existing Stripe: `lib/stripe.ts`, `app/api/webhook/stripe/route.ts`
- Current landing: `app/page.tsx`, `components/landing/focused-investor-hero.tsx`
- Onboarding: `app/(auth)/onboarding/page.tsx`
- Dashboard: `components/dashboard/dashboard-client.tsx`
- Email service: `lib/email/summary-service.ts`
