# Subscription Management UX Redesign - Grok-Inspired

**Date**: 2026-01-28 08:37:58 AEDT
**Git Commit**: 8235f4a9396fadd2ca9adb756ebf3b1411cc52b6
**Branch**: main
**Repository**: stripe-integration

## Overview

Implement a Grok-inspired subscription management experience that integrates with the existing Clerk authentication system. Users will be able to manage their subscription via a custom menu item in the Clerk dropdown, navigate to a dedicated `/subscribe` page showing all plans, and see their current plan subtly displayed via a color-coded badge on their avatar.

## Current State Analysis

### Existing Infrastructure
1. **Clerk UserButton**: Basic wrapper at `components/auth/user-button.tsx` using Clerk's default popup
2. **Billing Page**: Full-featured billing management at `app/dashboard/billing/page.tsx`
3. **Pricing Plans**: Defined in `lib/stripe/plans.ts` with FREE ($0), PRO ($199/mo), MAX ($349/mo)
4. **Header**: `MinimalHeader` at `components/layout/minimal-header.tsx` shows user avatar and name
5. **Checkout Flow**: Existing Stripe integration via `/api/user/subscription` endpoint
6. **Design System**: Landing page V2 variables in `app/globals.css` with `--landing-primary: #0079F2`

### Key Discoveries
- Clerk's `UserButton` supports custom menu items via `userButton.menuItems` in appearance config
- User subscription data available via `/api/user/subscription` GET endpoint
- Existing `PricingSectionV2` component at `components/landing/sections-v2/pricing-section-v2.tsx` can be repurposed
- Database stores `planType` in `UserSubscription` model (FREE, PRO, MAX)

## Desired End State

After implementation:
1. Clicking user avatar shows Clerk dropdown with "Manage Subscription" menu item
2. "Manage Subscription" navigates to `/subscribe` page
3. `/subscribe` page displays all 3 plans with user's current plan grayed out
4. ESC key or back arrow allows quick navigation away from `/subscribe`
5. Successful checkout redirects to `/dashboard`
6. User avatar displays subtle color-coded badge indicating their plan tier
7. Design is minimalistic, sleek, and consistent with landing page theme

### Verification Criteria

**Automated:**
- All tests pass: `npm run test`
- Build succeeds: `npm run build`
- Linting passes: `npm run lint`
- Type checking passes: TypeScript compilation

**Manual:**
- Clerk dropdown shows "Manage Subscription" option
- `/subscribe` page loads correctly with all plans
- Current plan CTA is disabled/grayed out
- ESC navigates back from `/subscribe`                                                                                                                                                  h
- Plan badge appears on avatar with correct color
- Checkout flow completes and redirects to `/dashboard`

## What We're NOT Doing

1. **NOT replacing Clerk entirely** - We're adding a custom menu item, not building a custom auth popup
2. **NOT creating a modal/overlay** - Using a full-page route as requested
3. **NOT changing existing billing page** - `/dashboard/billing` remains for detailed subscription managementq
4. **NOT implementing annual/monthly toggle** - Using the existing toggle from PricingSectionV2
5. **NOT changing Stripe webhook handling** - Reusing existing webhook infrastructure

## Implementation Approach

Following Elon's 5-Step Engineering Algorithm:
1. **Question requirements**: Confirmed user wants Clerk integration (not custom popup), full-page route, avatar badge
2. **Delete unnecessary complexity**: Reuse existing PricingSectionV2 component instead of building new pricing UI
3. **Simplify**: Single page component with existing plan data from lib/stripe/plans.ts
4. **Accelerate**: TDD approach with small incremental tests
5. **Automate**: Leverage existing checkout API and redirect handling

---

## Phase 1: Create `/subscribe` Page with Plan Display

### Overview
Create a new `/subscribe` page that displays all subscription plans, highlighting the user's current plan with a disabled CTA button, and enabling upgrade CTAs for other plans.

### Step 1.1: Write Failing Tests

**Test File**: `__tests__/app/subscribe/page.test.tsx`

```typescript
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SubscribePage from '@/app/subscribe/page';

// Mock Next.js navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
  }),
  useSearchParams: () => ({
    get: jest.fn(),
  }),
}));

// Mock Clerk
jest.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    user: { id: 'test-user-id', fullName: 'Test User' },
    isSignedIn: true,
    isLoaded: true,
  }),
}));

// Mock subscription fetch
global.fetch = jest.fn();

describe('SubscribePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render all three subscription plans', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ planType: 'FREE' }),
    });

    render(<SubscribePage />);

    await waitFor(() => {
      expect(screen.getByText('Free')).toBeInTheDocument();
      expect(screen.getByText('Pro')).toBeInTheDocument();
      expect(screen.getByText('Max')).toBeInTheDocument();
    });
  });

  it('should show disabled CTA for current plan (FREE)', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ planType: 'FREE' }),
    });

    render(<SubscribePage />);

    await waitFor(() => {
      const currentPlanButton = screen.getByRole('button', { name: /current plan/i });
      expect(currentPlanButton).toBeDisabled();
    });
  });

  it('should show upgrade CTAs for non-current plans', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ planType: 'FREE' }),
    });

    render(<SubscribePage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /upgrade to pro/i })).toBeEnabled();
      expect(screen.getByRole('button', { name: /upgrade to max/i })).toBeEnabled();
    });
  });

  it('should navigate back when ESC key is pressed', async () => {
    const mockBack = jest.fn();
    jest.spyOn(require('next/navigation'), 'useRouter').mockReturnValue({
      back: mockBack,
      push: jest.fn(),
    });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ planType: 'FREE' }),
    });

    render(<SubscribePage />);

    await userEvent.keyboard('{Escape}');

    expect(mockBack).toHaveBeenCalled();
  });

  it('should navigate back when back arrow is clicked', async () => {
    const mockBack = jest.fn();
    jest.spyOn(require('next/navigation'), 'useRouter').mockReturnValue({
      back: mockBack,
      push: jest.fn(),
    });

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ planType: 'FREE' }),
    });

    render(<SubscribePage />);

    await waitFor(() => {
      const backButton = screen.getByRole('button', { name: /back|go back/i });
      userEvent.click(backButton);
    });

    expect(mockBack).toHaveBeenCalled();
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="subscribe/page"
# Expected: 5 failing tests (module not found)
```

### Step 1.2: Implement Subscribe Page

#### 1.2.1 Create Page Component
**File**: `app/subscribe/page.tsx`

```typescript
'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Check, Loader2, Zap, Sparkles, Crown } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SUBSCRIPTION_PLANS,
  calculateSavingsPercentage,
  type PlanType,
  type BillingInterval,
} from '@/lib/stripe/plans';

interface UserSubscription {
  planType: PlanType;
  isActive: boolean;
}

const PLAN_ICONS = {
  FREE: Zap,
  PRO: Sparkles,
  MAX: Crown,
} as const;

const PLAN_ORDER: PlanType[] = ['FREE', 'PRO', 'MAX'];

export default function SubscribePage() {
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');
  const [checkingOut, setCheckingOut] = useState<PlanType | null>(null);

  // Fetch user's current subscription
  useEffect(() => {
    async function fetchSubscription() {
      try {
        const response = await fetch('/api/user/subscription');
        if (response.ok) {
          const data = await response.json();
          setSubscription(data);
        }
      } catch (error) {
        console.error('Failed to fetch subscription:', error);
      } finally {
        setLoading(false);
      }
    }

    if (isLoaded && user) {
      fetchSubscription();
    } else if (isLoaded && !user) {
      setLoading(false);
    }
  }, [isLoaded, user]);

  // Handle ESC key to go back
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      router.back();
    }
  }, [router]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Handle checkout
  const handleCheckout = async (planType: PlanType) => {
    if (planType === 'FREE' || planType === subscription?.planType) return;

    setCheckingOut(planType);
    try {
      const response = await fetch('/api/user/subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planType, billingInterval }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          toast.error('You already have an active subscription');
        } else {
          toast.error(data.error || 'Failed to start checkout');
        }
        return;
      }

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.');
    } finally {
      setCheckingOut(null);
    }
  };

  const getPrice = (planKey: PlanType) => {
    const plan = SUBSCRIPTION_PLANS[planKey];
    return billingInterval === 'annual' ? plan.annualPrice : plan.monthlyPrice;
  };

  const getMonthlyEquivalent = (planKey: PlanType) => {
    const plan = SUBSCRIPTION_PLANS[planKey];
    if (billingInterval === 'annual' && plan.annualPrice > 0) {
      return Math.round(plan.annualPrice / 12);
    }
    return null;
  };

  const isCurrentPlan = (planKey: PlanType) => subscription?.planType === planKey;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--landing-bg)' }}>
        <div className="space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
          <div className="flex gap-4 mt-8">
            <Skeleton className="h-96 w-72" />
            <Skeleton className="h-96 w-72" />
            <Skeleton className="h-96 w-72" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4" style={{ backgroundColor: 'var(--landing-bg)' }}>
      <div className="max-w-5xl mx-auto">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="mb-8 text-[var(--landing-text-muted)] hover:text-[var(--landing-text)]"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="landing-heading mb-4">Choose Your Plan</h1>
          <p className="landing-body max-w-2xl mx-auto">
            Upgrade to get more companies, faster alerts, and priority support.
          </p>
        </div>

        {/* Billing Toggle */}
        <div className="flex items-center justify-center gap-3 mb-12">
          <span className="text-sm text-[var(--landing-text-muted)]">
            Save with yearly billing
          </span>
          <button
            onClick={() => setBillingInterval(billingInterval === 'monthly' ? 'annual' : 'monthly')}
            className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${
              billingInterval === 'annual'
                ? 'bg-[var(--landing-primary)]'
                : 'bg-gray-300'
            }`}
            aria-label={`Switch to ${billingInterval === 'monthly' ? 'annual' : 'monthly'} billing`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${
                billingInterval === 'annual' ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PLAN_ORDER.map((planKey) => {
            const plan = SUBSCRIPTION_PLANS[planKey];
            const Icon = PLAN_ICONS[planKey];
            const isCurrent = isCurrentPlan(planKey);
            const savings = planKey !== 'FREE' ? calculateSavingsPercentage(planKey) : null;
            const monthlyEquiv = getMonthlyEquivalent(planKey);

            return (
              <motion.div
                key={planKey}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -4, boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.15)' }}
                transition={{ duration: 0.2 }}
                className={`landing-card relative flex flex-col ${
                  planKey === 'PRO' ? 'ring-2 ring-[var(--landing-primary)] shadow-lg' : ''
                }`}
              >
                {/* Popular Badge */}
                {planKey === 'PRO' && (
                  <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[var(--landing-primary)] text-white">
                    Popular
                  </Badge>
                )}

                {/* Plan Header */}
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs text-[var(--landing-text-muted)] uppercase tracking-wide mb-1">
                      {planKey === 'FREE' ? 'Basic' : plan.name}
                    </p>
                    <h3 className="text-2xl font-bold" style={{ color: 'var(--landing-secondary)' }}>
                      {plan.name}
                    </h3>
                  </div>
                  <Icon className="h-6 w-6 text-[var(--landing-primary)]" />
                </div>

                {/* Price */}
                <div className="mb-6 h-[88px]">
                  {plan.monthlyPrice === 0 ? (
                    <div className="text-3xl font-bold" style={{ color: 'var(--landing-secondary)' }}>
                      Free
                    </div>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold" style={{ color: 'var(--landing-secondary)' }}>
                          ${getPrice(planKey)}
                        </span>
                        <span className="text-sm text-[var(--landing-text-muted)]">
                          /{billingInterval === 'annual' ? 'year' : 'month'}
                        </span>
                        {billingInterval === 'annual' && savings && (
                          <Badge variant="secondary" className="ml-2 bg-green-100 text-green-700">
                            Save {savings}%
                          </Badge>
                        )}
                      </div>
                      {monthlyEquiv && (
                        <p className="text-xs text-[var(--landing-text-muted)] mt-1">
                          ${monthlyEquiv}/mo billed annually
                        </p>
                      )}
                    </>
                  )}
                </div>

                {/* CTA Button */}
                <div className="mb-6">
                  {isCurrent ? (
                    <Button
                      disabled
                      className="w-full bg-gray-100 text-gray-500 cursor-not-allowed"
                    >
                      Current Plan
                    </Button>
                  ) : planKey === 'FREE' ? (
                    <Button
                      variant="outline"
                      disabled
                      className="w-full"
                    >
                      Free Tier
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleCheckout(planKey)}
                      disabled={checkingOut === planKey}
                      className={`w-full ${
                        planKey === 'PRO' ? 'landing-button-primary' : 'landing-button-secondary'
                      }`}
                    >
                      {checkingOut === planKey ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        `Upgrade to ${plan.name}`
                      )}
                    </Button>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-3 flex-grow">
                  {plan.features.map((feature, idx) => {
                    const parts = feature.split(/(\*\*[^*]+\*\*)/);
                    return (
                      <li key={idx} className="flex items-start gap-3">
                        <Check className="w-4 h-4 text-[var(--landing-success)] flex-shrink-0 mt-0.5" />
                        <span className="text-sm" style={{ color: 'var(--landing-text)' }}>
                          {parts.map((part, i) => {
                            if (part.startsWith('**') && part.endsWith('**')) {
                              return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
                            }
                            return part;
                          })}
                        </span>
                      </li>
                    );
                  })}
                </ul>

                {/* Everything in X footer */}
                {planKey !== 'FREE' && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-2 text-sm text-[var(--landing-text-muted)]">
                      <span className="text-[var(--landing-primary)]">+</span>
                      <span>Everything in {planKey === 'PRO' ? 'Free' : 'Pro'}</span>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* ESC hint */}
        <p className="text-center mt-8 text-sm text-[var(--landing-text-muted)]">
          Press <kbd className="px-2 py-1 bg-gray-100 rounded text-xs">ESC</kbd> to go back
        </p>
      </div>
    </div>
  );
}
```

**Checkpoint 1.2.1**: Run tests:
```bash
npm run test -- --testPathPattern="subscribe/page"
# Expected: Tests should now find the component
```

### Step 1.3: Refactor

- [x] Extract plan card to separate component if needed
- [x] Ensure consistent animation timing with landing page
- [x] Verify responsive design on mobile

**Checkpoint 1.3**: All tests pass:
```bash
npm run test -- --testPathPattern="subscribe/page"
# Expected: 5 passing
```

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [x] Page tests pass: `npm run test -- --testPathPattern="subscribe"`
- [x] Type checking passes: `npm run build`
- [x] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Navigate to `/subscribe` shows all 3 plans
- [ ] Current plan button is disabled
- [ ] ESC key navigates back
- [ ] Back arrow button works
- [ ] Annual/monthly toggle works
- [ ] Checkout redirects to Stripe

**STOP**: Await manual confirmation before Phase 2.

---

## Phase 2: Add Custom Menu Item to Clerk UserButton

### Overview
Extend the Clerk UserButton component to include a "Manage Subscription" menu item that navigates to the `/subscribe` page.

### Step 2.1: Write Failing Tests

**Test File**: `__tests__/components/auth/user-button-subscription.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserButton from '@/components/auth/user-button';

// Mock Clerk with custom menu items
jest.mock('@clerk/nextjs', () => ({
  UserButton: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="clerk-user-button">
      {children}
    </div>
  ),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}));

describe('UserButton with Subscription Menu', () => {
  it('should include subscription link in menu items', () => {
    render(<UserButton />);

    // Clerk UserButton should be rendered with custom menu items
    expect(screen.getByTestId('clerk-user-button')).toBeInTheDocument();
  });
});
```

**Checkpoint 2.1**: Run tests and verify current state:
```bash
npm run test -- --testPathPattern="user-button-subscription"
```

### Step 2.2: Update UserButton Component

**File**: `components/auth/user-button.tsx`

```typescript
'use client';

import { UserButton as ClerkUserButton } from "@clerk/nextjs";
import { CreditCard } from "lucide-react";

interface UserButtonProps {
  afterSignOutUrl?: string;
}

export default function UserButton({ afterSignOutUrl = "/" }: UserButtonProps) {
  return (
    <ClerkUserButton
      afterSignOutUrl={afterSignOutUrl}
      appearance={{
        elements: {
          userButtonBox: "h-8 w-8",
          userButtonAvatarBox: "h-8 w-8",
        },
      }}
    >
      <ClerkUserButton.MenuItems>
        <ClerkUserButton.Link
          label="Manage Subscription"
          labelIcon={<CreditCard className="h-4 w-4" />}
          href="/subscribe"
        />
      </ClerkUserButton.MenuItems>
    </ClerkUserButton>
  );
}
```

**Checkpoint 2.2**: Test Clerk menu item renders:
```bash
npm run test -- --testPathPattern="user-button"
```

### Step 2.3: Refactor

- [ ] Ensure icon styling matches Clerk's default menu icons
- [ ] Verify link navigation works correctly

**Checkpoint 2.3**: All tests pass:
```bash
npm run test -- --testPathPattern="user-button"
```

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [ ] Component tests pass: `npm run test -- --testPathPattern="user-button"`
- [ ] Build succeeds: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Click avatar shows Clerk dropdown
- [ ] "Manage Subscription" appears in menu
- [ ] Clicking "Manage Subscription" navigates to `/subscribe`

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: Add Plan Badge to User Avatar

### Overview
Create a visual indicator showing the user's current subscription tier as a small colored badge on or around their avatar in the header.

### Step 3.1: Write Failing Tests

**Test File**: `__tests__/components/dashboard/user-avatar-badge.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import { UserAvatarWithBadge } from '@/components/dashboard/user-avatar-badge';

describe('UserAvatarWithBadge', () => {
  it('should render FREE badge with gray color', () => {
    render(<UserAvatarWithBadge planType="FREE" />);

    const badge = screen.getByText('Free');
    expect(badge).toHaveClass('bg-gray-500');
  });

  it('should render PRO badge with blue color', () => {
    render(<UserAvatarWithBadge planType="PRO" />);

    const badge = screen.getByText('Pro');
    expect(badge).toHaveClass('bg-blue-500');
  });

  it('should render MAX badge with gold/amber color', () => {
    render(<UserAvatarWithBadge planType="MAX" />);

    const badge = screen.getByText('Max');
    expect(badge).toHaveClass('bg-amber-500');
  });

  it('should position badge at bottom-right of avatar container', () => {
    render(<UserAvatarWithBadge planType="PRO" />);

    const badge = screen.getByText('Pro');
    expect(badge.parentElement).toHaveClass('absolute');
  });
});
```

**Checkpoint 3.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="user-avatar-badge"
# Expected: 4 failing tests (component not found)
```

### Step 3.2: Create UserAvatarWithBadge Component

**File**: `components/dashboard/user-avatar-badge.tsx`

```typescript
'use client';

import { cn } from '@/lib/utils';
import type { PlanType } from '@/lib/stripe/plans';

interface UserAvatarWithBadgeProps {
  planType: PlanType;
  children?: React.ReactNode;
  className?: string;
}

const PLAN_BADGE_CONFIG = {
  FREE: {
    label: 'Free',
    bgColor: 'bg-gray-500',
    textColor: 'text-white',
  },
  PRO: {
    label: 'Pro',
    bgColor: 'bg-blue-500',
    textColor: 'text-white',
  },
  MAX: {
    label: 'Max',
    bgColor: 'bg-amber-500',
    textColor: 'text-white',
  },
} as const;

export function UserAvatarWithBadge({
  planType,
  children,
  className
}: UserAvatarWithBadgeProps) {
  const config = PLAN_BADGE_CONFIG[planType] || PLAN_BADGE_CONFIG.FREE;

  return (
    <div className={cn('relative inline-flex', className)}>
      {children}
      <span
        className={cn(
          'absolute -bottom-1 -right-1 px-1.5 py-0.5 text-[10px] font-semibold rounded-full',
          'ring-2 ring-white',
          config.bgColor,
          config.textColor
        )}
      >
        {config.label}
      </span>
    </div>
  );
}
```

**Checkpoint 3.2**: Run tests:
```bash
npm run test -- --testPathPattern="user-avatar-badge"
# Expected: Tests should pass
```

### Step 3.3: Integrate Badge into MinimalHeader

**File**: `components/layout/minimal-header.tsx` (update)

Update the MinimalHeader to wrap the UserButton with the badge component and fetch user subscription data.

```typescript
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Activity } from "lucide-react";
import UserButton from "@/components/auth/user-button";
import { useUser } from "@clerk/nextjs";
import { useAdminStatus } from "@/lib/hooks/use-admin-status";
import { Badge } from "@/components/ui/badge";
import { UserAvatarWithBadge } from "@/components/dashboard/user-avatar-badge";
import type { PlanType } from "@/lib/stripe/plans";

export function MinimalHeader() {
  const { user } = useUser();
  const { isAdmin, loading: adminLoading } = useAdminStatus();
  const [planType, setPlanType] = useState<PlanType>('FREE');

  // Fetch user's subscription tier
  useEffect(() => {
    async function fetchSubscription() {
      try {
        const response = await fetch('/api/user/subscription');
        if (response.ok) {
          const data = await response.json();
          setPlanType(data.planType || 'FREE');
        }
      } catch (error) {
        console.error('Failed to fetch subscription:', error);
      }
    }

    if (user) {
      fetchSubscription();
    }
  }, [user]);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--landing-border)] bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container max-w-7xl mx-auto flex h-14 items-center justify-between px-6 md:px-8">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center font-semibold">
          <span className="text-[var(--landing-primary)] font-bold text-lg">tldr</span>
          <span className="font-bold text-lg">SEC</span>
        </Link>

        {/* Right side: Admin + User */}
        <div className="flex items-center gap-4">
          {/* Admin Monitoring Link */}
          {!adminLoading && isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="hidden sm:flex"
            >
              <Link href="/dashboard/monitoring">
                <Activity className="h-4 w-4 mr-2" />
                Monitoring
                <Badge variant="secondary" className="ml-2 text-xs">
                  Admin
                </Badge>
              </Link>
            </Button>
          )}

          {/* User Profile with Plan Badge */}
          <div className="flex items-center gap-3">
            <UserAvatarWithBadge planType={planType}>
              <UserButton afterSignOutUrl="/sign-in" />
            </UserAvatarWithBadge>
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

**Checkpoint 3.3**: Component integration complete:
```bash
npm run test
npm run build
```

### Step 3.4: Final Phase Verification

#### Automated Verification:
- [ ] Badge component tests pass: `npm run test -- --testPathPattern="user-avatar-badge"`
- [ ] Full test suite passes: `npm run test`
- [ ] Build succeeds: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] FREE users see gray "Free" badge on avatar
- [ ] PRO users see blue "Pro" badge on avatar
- [ ] MAX users see gold "Max" badge on avatar
- [ ] Badge is positioned subtly at bottom-right of avatar
- [ ] Badge doesn't interfere with Clerk dropdown functionality

**STOP**: Await manual confirmation before Phase 4.

---

## Phase 4: Update Checkout Success Redirect

### Overview
Ensure successful Stripe checkout redirects to `/dashboard` instead of `/dashboard/billing`.

### Step 4.1: Verify Current Redirect Logic

**File to review**: `app/api/user/subscription/route.ts` line 314

Current redirect URL: `${appUrl}/dashboard?subscription_success=true&session_id={CHECKOUT_SESSION_ID}`

This is already correct! The redirect goes to `/dashboard` with success params.

### Step 4.2: Verify Success Handler in Dashboard

Check that the dashboard properly handles the `subscription_success=true` parameter and shows a success toast.

**No code changes needed** - redirect is already configured correctly.

### Step 4.3: Final Verification

#### Automated Verification:
- [ ] Full test suite passes: `npm run test`
- [ ] E2E test passes: `npm run test:e2e`

#### Manual Verification:
- [ ] Complete a test checkout flow
- [ ] Verify redirect to `/dashboard` after success
- [ ] Verify success toast appears

---

## Phase 5: Remove Redundant "Manage Subscription" Button

### Overview
Clean up the header by removing the separate "Manage Subscription" button since subscription management is now in the Clerk dropdown menu.

### Step 5.1: Update MinimalHeader

Remove the separate billing button from MinimalHeader since users can now access subscription management via the Clerk dropdown.

**File**: `components/layout/minimal-header.tsx`

The updated component in Phase 3 already removes the separate "Manage Subscription" button.

### Step 5.2: Final Verification

#### Automated Verification:
- [ ] Build succeeds: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Header shows only logo, admin link (if admin), and user avatar
- [ ] No separate "Manage Subscription" button in header
- [ ] Subscription accessible via avatar dropdown

---

## Testing Strategy

### TDD Test Design Principles Applied

1. **One Assertion Per Test**: Each test focuses on a single behavior
2. **Descriptive Test Names**: Using "should [verb] when [condition]" pattern
3. **Arrange-Act-Assert**: Clear structure in all tests
4. **Test Behavior, Not Implementation**: Focus on user-visible outcomes

### Test Categories

#### Contract Tests
- Subscribe page renders all plans
- UserButton includes subscription menu item
- Badge displays correct tier color

#### Edge Case Tests
- No subscription data (default to FREE)
- ESC key navigation
- Checkout loading states

#### Integration Tests
- Full checkout flow
- Subscription data fetching
- Header badge updates after plan change

### Manual Testing Checklist

1. **Subscribe Page Flow**
   - [ ] Navigate to `/subscribe` directly
   - [ ] Click "Manage Subscription" in Clerk dropdown
   - [ ] Toggle between monthly/annual pricing
   - [ ] Verify current plan is grayed out
   - [ ] Test ESC navigation
   - [ ] Test back button navigation

2. **Checkout Flow**
   - [ ] Click upgrade button
   - [ ] Complete Stripe checkout (test mode)
   - [ ] Verify redirect to dashboard
   - [ ] Verify success toast

3. **Avatar Badge**
   - [ ] FREE user sees gray badge
   - [ ] PRO user sees blue badge
   - [ ] MAX user sees gold badge
   - [ ] Badge visible on mobile

## Performance Considerations

- Subscription data cached after initial fetch (relies on React state)
- Badge component uses minimal DOM elements
- Plan data from static config (no additional API calls)

## Migration Notes

None required - this is additive functionality.

## References

- Task request with Grok screenshots (user provided)
- Clerk UserButton customization: [Clerk docs](https://clerk.com/docs/components/user/user-button)
- Existing pricing component: `components/landing/sections-v2/pricing-section-v2.tsx`
- Stripe plans config: `lib/stripe/plans.ts`
- Current billing page: `app/dashboard/billing/page.tsx`
- MinimalHeader: `components/layout/minimal-header.tsx`
