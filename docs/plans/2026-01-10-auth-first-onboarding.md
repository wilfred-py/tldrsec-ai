# Authentication-First Onboarding Flow Implementation Plan

**Date**: 2026-01-10T10:39:58+11:00
**Git Commit**: dd210266cc6e86745e9d0f1c4527cf28f485e4ee
**Branch**: onboarding
**Repository**: tldrsec-ai

## Overview

Transform the onboarding flow from a "passwordless-first" approach (where users complete onboarding before authentication) to an "authentication-first" approach (where users must authenticate before accessing onboarding). This involves:

1. Removing "Skip Setup" buttons from all 3 onboarding steps
2. Removing Step 3 (email collection) - Clerk handles email collection during sign-up
3. Updating landing page CTAs to redirect based on 3 states (unauthenticated → sign-up, authenticated but not onboarded → onboarding, onboarded → dashboard)
4. Adding middleware-level protection to enforce authentication before onboarding
5. Protecting dashboard from non-onboarded users
6. Simplifying the webhook since pending onboarding data is no longer needed

## Current State Analysis

### Current Flow (Passwordless)
```
Landing Page → /onboarding (PUBLIC) → Step 1 (sectors) → Step 2 (companies) → Step 3 (email)
    → Save to PendingOnboarding → Redirect to /sign-up → Clerk webhook merges data → /dashboard
```

### Desired Flow (Auth-First)
```
Landing Page → /sign-up (Clerk) → /onboarding (PROTECTED) → Step 1 (sectors) → Step 2 (companies)
    → Save preferences & complete → /dashboard
```

### Key Discoveries
| File | Lines | Finding |
|------|-------|---------|
| `app/(auth)/onboarding/page.tsx` | 557-564, 661-667, 682-688 | Skip Setup buttons on all 3 steps |
| `app/(auth)/onboarding/page.tsx` | 670-680 | Step 3 EmailStep component |
| `app/(auth)/onboarding/page.tsx` | 285-367 | handleEmailSubmit with passwordless flow logic |
| `middleware.ts` | 1204-1207 | `/onboarding` routes configured as public |
| `app/dashboard/page.tsx` | 10-14 | Dashboard only checks Clerk auth, not onboarding status |
| `app/layout.tsx` | 61 | `afterSignUpUrl="/onboarding"` (already correct!) |
| `app/api/webhook/clerk/route.ts` | 71-153 | PendingOnboarding merge logic |
| `components/landing/*/` | Various | CTAs only check `isOnboarded`, not `isSignedIn` |

## Desired End State

### User Flows

1. **Unauthenticated user clicks CTA**: → `/sign-up`
2. **Authenticated user who hasn't completed onboarding**: → `/onboarding` (2-step flow)
3. **Authenticated user who completed onboarding**: → `/dashboard`
4. **User tries to access `/dashboard` without completing onboarding**: → `/onboarding`
5. **User tries to access `/onboarding` without authentication**: → `/sign-up`
6. **User tries to access `/onboarding` after completing onboarding**: → `/dashboard`

### Verification Checklist
- [x] "Skip Setup" buttons removed from all 3 steps
- [x] Step 3 (EmailStep) removed entirely
- [x] Onboarding is now a 2-step flow (sectors → companies → complete)
- [x] Landing CTAs redirect correctly based on 3 states
- [x] Middleware redirects unauthenticated users from `/onboarding` to `/sign-up`
- [x] Middleware redirects non-onboarded users from `/dashboard` to `/onboarding`
- [x] Middleware redirects onboarded users from `/onboarding` to `/dashboard`
- [x] Clerk webhook simplified (no more pending data merge)
- [x] `completeOnboarding()` action sets `onboardingCompleted: true`

## What We're NOT Doing

- **NOT** changing the sign-up/sign-in pages themselves (Clerk handles these)
- **NOT** removing the `PendingOnboarding` table yet (can do in a future migration)
- **NOT** changing the email notification preferences flow (remains in dashboard settings)
- **NOT** modifying the Stripe subscription flow

## Implementation Approach

Applying Elon's 5-Step Algorithm:

1. **Question every requirement**: The passwordless flow adds significant complexity (pending tables, webhook merge logic, 3 auth states on CTA). The auth-first approach is simpler and more conventional.

2. **Delete unnecessary parts**:
   - Delete Step 3 (EmailStep) entirely
   - Delete all 3 "Skip Setup" buttons
   - Delete `handleEmailSubmit` passwordless logic
   - Delete pending onboarding API endpoints (or deprecate)
   - Delete webhook pending data merge logic

3. **Simplify**:
   - Onboarding becomes 2 steps instead of 3
   - Single `handleCompleteOnboarding` function instead of branching logic
   - Middleware handles all redirect logic (single source of truth)

4. **Accelerate cycle time**: TDD approach with small phases, each independently testable

5. **Automate**: Middleware handles redirects automatically

---

## Phase 1: Remove Skip Setup Buttons and Step 3

### Overview
Remove the "Skip Setup" buttons from all 3 steps and remove Step 3 (EmailStep) entirely. The onboarding flow becomes a 2-step process that must be completed.

### Step 1.1: 🔴 Write Failing Tests

**Test File**: `__tests__/onboarding/onboarding-page.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import OnboardingPage from '@/app/(auth)/onboarding/page';

// Mock dependencies
jest.mock('@/lib/context/auth-context', () => ({
  useAuthContext: () => ({
    isAuthenticated: true,
    isLoading: false,
    userName: 'Test User'
  })
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() })
}));

describe('OnboardingPage', () => {
  describe('Skip Setup buttons', () => {
    it('should NOT render skip setup button on step 1', () => {
      render(<OnboardingPage />);
      expect(screen.queryByText(/skip setup/i)).not.toBeInTheDocument();
    });

    it('should NOT render skip setup button on step 2', async () => {
      render(<OnboardingPage />);
      // Select a sector and advance to step 2
      // ...
      expect(screen.queryByText(/skip setup/i)).not.toBeInTheDocument();
    });
  });

  describe('Step 3 removal', () => {
    it('should complete onboarding after step 2 (not step 3)', async () => {
      render(<OnboardingPage />);
      // Progress indicator should show "Step X of 2" not "Step X of 3"
      expect(screen.getByText(/of 2/)).toBeInTheDocument();
      expect(screen.queryByText(/of 3/)).not.toBeInTheDocument();
    });

    it('should NOT render EmailStep component', () => {
      render(<OnboardingPage />);
      // EmailStep should not be present
      expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    });
  });
});
```

**Checkpoint 1.1**: Tests fail because Skip buttons and Step 3 still exist.

### Step 1.2: 🟢 Implement Changes

#### 1.2.1 Remove Skip Setup Buttons

**File**: `app/(auth)/onboarding/page.tsx`

**Delete lines 557-564** (Step 1 skip button):
```tsx
// DELETE THIS BLOCK
{currentStep === 1 && (
  <div className="mt-4 text-center">
    <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground">
      Skip setup and go to dashboard
    </Button>
  </div>
)}
```

**Delete lines 661-667** (Step 2 skip button):
```tsx
// DELETE THIS BLOCK
{currentStep === 2 && (
  <div className="mt-4 text-center">
    <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground">
      Skip setup and go to dashboard
    </Button>
  </div>
)}
```

**Delete lines 682-688** (Step 3 skip button):
```tsx
// DELETE THIS BLOCK
{currentStep === 3 && (
  <div className="mt-4 text-center">
    <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground">
      Skip setup and go to dashboard
    </Button>
  </div>
)}
```

**Delete the handleSkip function** (lines 268-271):
```tsx
// DELETE THIS FUNCTION
const handleSkip = () => {
  router.push("/dashboard");
};
```

**Checkpoint 1.2.1**: Skip buttons removed, verify no "skip setup" text in rendered output.

#### 1.2.2 Remove Step 3 (EmailStep)

**File**: `app/(auth)/onboarding/page.tsx`

**Delete EmailStep import** (line 12):
```tsx
// DELETE THIS IMPORT
import { EmailStep } from "@/components/onboarding/email-step";
```

**Delete Step 3 rendering** (lines 670-680):
```tsx
// DELETE THIS BLOCK
{currentStep === 3 && (
  <div className="mx-auto max-w-md">
    <EmailStep
      onEmailSubmit={handleEmailSubmit}
      onBack={handleBack}
      selectedTickers={selectedEquities}
      isLoading={isSubmitting}
    />
  </div>
)}
```

**Delete handleEmailSubmit function** (lines 282-367):
```tsx
// DELETE THIS ENTIRE FUNCTION
const handleEmailSubmit = async (email: string) => {
  // ... all the passwordless flow logic
};
```

**Update handleNext** to complete onboarding on step 2 (lines 251-266):
```tsx
const handleNext = () => {
  if (currentStep === 1) {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentStep(2);
      setIsTransitioning(false);
    }, 300);
  } else if (currentStep === 2) {
    // Step 2 is now the final step - complete onboarding
    handleCompleteOnboarding();
  }
};
```

**Update progress calculation** (lines 194-206):
```tsx
// Calculate progress based on current step and selections (2-step flow)
const calculateProgress = () => {
  if (currentStep === 1) {
    // Step 1: 0% if no sectors selected, 50% if at least one sector is selected
    return selectedSectors.length > 0 ? 50 : 0;
  } else {
    // Step 2: 50% base + 50% if at least one company is selected = 100%
    return 50 + (selectedEquities.length > 0 ? 50 : 0);
  }
};
```

**Update step text** (line 486):
```tsx
<span className="font-medium">Step {currentStep} of 2</span>
```

**Update handleBack** to not allow going back from step 1 (optional validation):
```tsx
const handleBack = () => {
  if (currentStep > 1) {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentStep(currentStep - 1);
      setIsTransitioning(false);
    }, 300);
  }
};
```

**Checkpoint 1.2.2**: Step 3 removed, onboarding completes from Step 2.

#### 1.2.3 Update completeOnboarding Action

**File**: `app/(auth)/onboarding/actions.ts`

Add `onboardingCompleted: true` update after line 218 (after creating/finding user):

```typescript
// After finding or creating the user, ensure onboardingCompleted is set
if (dbUser && !dbUser.onboardingCompleted) {
  await prisma.user.update({
    where: { id: dbUser.id },
    data: { onboardingCompleted: true }
  });
  console.log(`Set onboardingCompleted=true for user ${dbUser.id}`);

  // Sync to Clerk publicMetadata
  try {
    const client = await clerkClient();
    await client.users.updateUserMetadata(userId, {
      publicMetadata: { onboardingCompleted: true }
    });
  } catch (metadataError) {
    console.error('Failed to sync onboardingCompleted to Clerk:', metadataError);
  }
}
```

**Checkpoint 1.2.3**: `onboardingCompleted` flag is set when onboarding completes.

### Step 1.3: 🔵 Refactor

- [ ] Remove unused imports (EmailStep, NotificationPreference if unused)
- [ ] Clean up any dead code from passwordless flow
- [ ] Ensure consistent code style

**Checkpoint 1.3**: All Phase 1 tests pass after refactoring.

### Step 1.4: Final Phase Verification

#### Automated Verification:
```bash
npm run lint
npm run build
npm run test -- --testPathPattern="onboarding"
```

#### Manual Verification:
- [ ] Navigate to `/onboarding` as authenticated user
- [ ] Verify no "Skip setup" buttons visible
- [ ] Verify only 2 steps shown ("Step X of 2")
- [ ] Complete Step 1 (select sector) and Step 2 (select companies)
- [ ] Verify redirect to `/dashboard` after Step 2
- [ ] Verify `onboardingCompleted` is `true` in database

**STOP**: Await manual confirmation before Phase 2.

---

## Phase 2: Update Landing Page CTAs

### Overview
Update all landing page CTA buttons to use 3-state redirect logic based on authentication AND onboarding status.

### Step 2.1: 🔴 Write Failing Tests

**Test File**: `__tests__/landing/cta-buttons.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import { GmailInboxHero } from '@/components/landing/sections-v2/gmail-inbox-hero';

// Test all 3 states
describe('Landing Page CTAs', () => {
  describe('when user is not authenticated', () => {
    beforeEach(() => {
      jest.mock('@clerk/nextjs', () => ({
        useUser: () => ({ isSignedIn: false, isLoaded: true, user: null })
      }));
    });

    it('should link to /sign-up', () => {
      render(<GmailInboxHero />);
      const cta = screen.getByRole('link', { name: /get started|get summaries/i });
      expect(cta).toHaveAttribute('href', '/sign-up');
    });
  });

  describe('when user is authenticated but not onboarded', () => {
    beforeEach(() => {
      jest.mock('@clerk/nextjs', () => ({
        useUser: () => ({
          isSignedIn: true,
          isLoaded: true,
          user: { publicMetadata: { onboardingCompleted: false } }
        })
      }));
    });

    it('should link to /onboarding', () => {
      render(<GmailInboxHero />);
      const cta = screen.getByRole('link', { name: /complete setup/i });
      expect(cta).toHaveAttribute('href', '/onboarding');
    });
  });

  describe('when user is authenticated and onboarded', () => {
    beforeEach(() => {
      jest.mock('@clerk/nextjs', () => ({
        useUser: () => ({
          isSignedIn: true,
          isLoaded: true,
          user: { publicMetadata: { onboardingCompleted: true } }
        })
      }));
    });

    it('should link to /dashboard', () => {
      render(<GmailInboxHero />);
      const cta = screen.getByRole('link', { name: /dashboard/i });
      expect(cta).toHaveAttribute('href', '/dashboard');
    });
  });
});
```

**Checkpoint 2.1**: Tests fail because CTAs don't distinguish authenticated vs unauthenticated.

### Step 2.2: 🟢 Implement Changes

#### 2.2.1 Update Gmail Inbox Hero CTA

**File**: `components/landing/sections-v2/gmail-inbox-hero.tsx`

Update lines 1039-1058:
```tsx
{!isLoaded ? (
  <Skeleton className="h-11 w-48 rounded-lg" />
) : isOnboarded ? (
  // State 3: Authenticated AND onboarded → Dashboard
  <Link href="/dashboard">
    <Button className="landing-button-gradient">
      Go to Dashboard
      <ArrowRight className="w-5 h-5 ml-2" />
    </Button>
  </Link>
) : isSignedIn ? (
  // State 2: Authenticated but NOT onboarded → Onboarding
  <Link href="/onboarding">
    <Button className="landing-button-gradient">
      Complete Setup
      <ArrowRight className="w-5 h-5 ml-2" />
    </Button>
  </Link>
) : (
  // State 1: Unauthenticated → Sign Up
  <Link href="/sign-up">
    <Button className="landing-button-gradient">
      Get Summaries Like This
      <ArrowRight className="w-5 h-5 ml-2" />
    </Button>
  </Link>
)}
```

Also update the caption text (line 1062):
```tsx
<motion.p variants={staggerItem} className="landing-caption">
  {isOnboarded ? 'Welcome back!' : isSignedIn ? 'Just one more step!' : 'No credit card required. Cancel anytime.'}
</motion.p>
```

**Checkpoint 2.2.1**: Hero CTA redirects correctly for all 3 states.

#### 2.2.2 Update Pricing Section CTA

**File**: `components/landing/sections-v2/pricing-section-v2.tsx`

Update `handleCheckout` function (lines 109-139):
```tsx
const handleCheckout = async (planKey: string) => {
  if (!isSignedIn) {
    // Unauthenticated → Sign Up with plan params
    router.push(`/sign-up?plan=${planKey.toLowerCase()}${billingInterval === 'annual' ? '&interval=annual' : ''}`);
    return;
  }

  if (!isOnboarded) {
    // Authenticated but not onboarded → Onboarding with plan params
    router.push(`/onboarding?plan=${planKey.toLowerCase()}${billingInterval === 'annual' ? '&interval=annual' : ''}`);
    return;
  }

  // Authenticated and onboarded → Stripe checkout
  setLoadingPlan(planKey);
  // ... rest of Stripe logic unchanged
};
```

Update `getCtaText` function (lines 142-146):
```tsx
const getCtaText = (plan: typeof plans[0]) => {
  if (plan.disabled) return plan.cta;
  if (!isSignedIn) return 'Get Started';
  if (!isOnboarded) return 'Complete Setup';
  return plan.cta; // "Upgrade to Pro" or "Upgrade to Max"
};
```

**Checkpoint 2.2.2**: Pricing CTAs redirect correctly for all 3 states.

#### 2.2.3 Update Landing Navbar CTA

**File**: `components/landing/landing-navbar.tsx`

Update `ctaButton` definition (lines 57-71):
```tsx
const ctaButton = isOnboarded ? (
  <Link href="/dashboard">
    <Button className="landing-button-gradient">
      Go to Dashboard
      <ArrowRight className="w-4 h-4 ml-2" />
    </Button>
  </Link>
) : isSignedIn ? (
  <Link href="/onboarding">
    <Button className="landing-button-gradient">
      Complete Setup
      <ArrowRight className="w-4 h-4 ml-2" />
    </Button>
  </Link>
) : (
  <Link href="/sign-up">
    <Button className="landing-button-gradient">
      Get Started
      <ArrowRight className="w-4 h-4 ml-2" />
    </Button>
  </Link>
);
```

**Checkpoint 2.2.3**: Navbar CTA redirects correctly for all 3 states.

### Step 2.3: 🔵 Refactor

- [ ] Extract CTA logic into shared hook if duplication is excessive
- [ ] Ensure consistent button text across all CTAs

**Checkpoint 2.3**: All Phase 2 tests pass.

### Step 2.4: Final Phase Verification

#### Automated Verification:
```bash
npm run lint
npm run build
npm run test -- --testPathPattern="landing"
```

#### Manual Verification:
- [ ] Visit landing page as unauthenticated user → CTAs show "Get Started/Get Summaries" linking to `/sign-up`
- [ ] Sign up, don't complete onboarding → CTAs show "Complete Setup" linking to `/onboarding`
- [ ] Complete onboarding → CTAs show "Go to Dashboard" linking to `/dashboard`

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: Implement Middleware Redirects

### Overview
Add middleware-level redirect logic to:
1. Redirect unauthenticated users from `/onboarding` to `/sign-up`
2. Redirect non-onboarded users from `/dashboard` to `/onboarding`
3. Redirect onboarded users from `/onboarding` to `/dashboard`

### Step 3.1: 🔴 Write Failing Tests

**Test File**: `__tests__/middleware/onboarding-redirects.test.ts`

```typescript
import { middleware } from '@/middleware';
import { NextRequest } from 'next/server';

describe('Onboarding Middleware Redirects', () => {
  describe('/onboarding route', () => {
    it('should redirect unauthenticated users to /sign-up', async () => {
      const request = new NextRequest('http://localhost:3000/onboarding');
      // Mock no Clerk session
      const response = await middleware(request);
      expect(response.headers.get('location')).toContain('/sign-up');
    });

    it('should allow authenticated non-onboarded users', async () => {
      const request = new NextRequest('http://localhost:3000/onboarding');
      // Mock Clerk session with onboardingCompleted=false
      const response = await middleware(request);
      expect(response.status).not.toBe(307);
    });

    it('should redirect onboarded users to /dashboard', async () => {
      const request = new NextRequest('http://localhost:3000/onboarding');
      // Mock Clerk session with onboardingCompleted=true
      const response = await middleware(request);
      expect(response.headers.get('location')).toContain('/dashboard');
    });
  });

  describe('/dashboard route', () => {
    it('should redirect non-onboarded users to /onboarding', async () => {
      const request = new NextRequest('http://localhost:3000/dashboard');
      // Mock Clerk session with onboardingCompleted=false
      const response = await middleware(request);
      expect(response.headers.get('location')).toContain('/onboarding');
    });
  });
});
```

**Checkpoint 3.1**: Tests fail because middleware doesn't have redirect logic.

### Step 3.2: 🟢 Implement Changes

#### 3.2.1 Remove `/onboarding` from Public Routes

**File**: `middleware.ts`

Remove lines 1204-1207 from `publicRoutes` array:
```typescript
// REMOVE THESE LINES:
// Passwordless onboarding (public - no auth required)
'/onboarding',
'/api/onboarding/check-email',
'/api/onboarding/save-pending'
```

**Checkpoint 3.2.1**: `/onboarding` now requires Clerk authentication.

#### 3.2.2 Add Onboarding Redirect Logic in Clerk Middleware Callback

**File**: `middleware.ts`

Update the `clerkMiddleware` callback (lines 1162-1170):

```typescript
return clerkMiddleware(
  async (auth, request: NextRequest) => {
    const { userId, sessionClaims } = await auth();
    const pathname = request.nextUrl.pathname;

    // Handle onboarding redirects
    if (pathname === '/onboarding') {
      if (!userId) {
        // Unauthenticated → Sign Up
        return NextResponse.redirect(new URL('/sign-up', request.url));
      }

      // Check onboarding status from Clerk publicMetadata
      const isOnboarded = sessionClaims?.publicMetadata?.onboardingCompleted === true;

      if (isOnboarded) {
        // Already onboarded → Dashboard
        return NextResponse.redirect(new URL('/dashboard', request.url));
      }
      // Allow through to onboarding page
    }

    // Protect dashboard from non-onboarded users
    if (pathname.startsWith('/dashboard') && userId) {
      const isOnboarded = sessionClaims?.publicMetadata?.onboardingCompleted === true;

      if (!isOnboarded) {
        // Not onboarded → Onboarding
        return NextResponse.redirect(new URL('/onboarding', request.url));
      }
    }

    // Apply security middleware for non-cron endpoints
    const securityResponse = await securityMiddleware(request);
    if (securityResponse) {
      return securityResponse;
    }

    return;
  },
  {
    publicRoutes: [
      // ... existing public routes WITHOUT /onboarding
    ]
  }
)(request);
```

**Important Note**: The `sessionClaims?.publicMetadata` approach reads from Clerk's JWT claims, which are populated during sign-in. If this doesn't work reliably, we may need to fall back to a database query or Clerk API call.

**Checkpoint 3.2.2**: Middleware redirects work for all 3 scenarios.

#### 3.2.3 Alternative: Database-Based Onboarding Check

If Clerk's `sessionClaims.publicMetadata` is not reliable, implement a database fallback:

**File**: `middleware.ts`

```typescript
import { getPrismaClient } from '@/lib/db/prisma';

// Helper function to check onboarding status
async function checkOnboardingStatus(userId: string): Promise<boolean> {
  try {
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { onboardingCompleted: true }
    });
    return user?.onboardingCompleted ?? false;
  } catch (error) {
    console.error('Failed to check onboarding status in middleware:', error);
    // Fail open - allow access on error
    return true;
  }
}
```

**Note**: Database queries in middleware can impact performance. Consider caching or using Clerk's metadata as primary source.

**Checkpoint 3.2.3**: Fallback database check works if needed.

### Step 3.3: 🔵 Refactor

- [ ] Extract redirect logic into separate helper function
- [ ] Add appropriate caching if using database queries
- [ ] Ensure error handling doesn't block users

**Checkpoint 3.3**: All Phase 3 tests pass.

### Step 3.4: Final Phase Verification

#### Automated Verification:
```bash
npm run lint
npm run build
npm run test -- --testPathPattern="middleware"
```

#### Manual Verification:
- [ ] Sign out, navigate to `/onboarding` → Redirected to `/sign-up`
- [ ] Sign in (new user), navigate to `/dashboard` → Redirected to `/onboarding`
- [ ] Complete onboarding, navigate to `/onboarding` → Redirected to `/dashboard`
- [ ] Onboarded user can access `/dashboard` normally

**STOP**: Await manual confirmation before Phase 4.

---

## Phase 4: Simplify Clerk Webhook

### Overview
Remove the pending onboarding merge logic from the Clerk webhook since users now authenticate before onboarding.

### Step 4.1: 🔴 Write Failing Tests

**Test File**: `__tests__/api/webhook/clerk.test.ts`

```typescript
describe('Clerk Webhook - user.created', () => {
  it('should create user with onboardingCompleted=false', async () => {
    const event = createMockClerkUserCreatedEvent();
    const response = await POST(createMockRequest(event));

    expect(response.status).toBe(200);

    const user = await prisma.user.findUnique({
      where: { email: event.data.email_addresses[0].email_address }
    });
    expect(user.onboardingCompleted).toBe(false);
  });

  it('should NOT check for pending onboarding data', async () => {
    // Create pending onboarding data
    await prisma.pendingOnboarding.create({
      data: { email: 'test@example.com', sectors: ['tech'], tickers: [] }
    });

    const event = createMockClerkUserCreatedEvent({ email: 'test@example.com' });
    await POST(createMockRequest(event));

    const user = await prisma.user.findUnique({
      where: { email: 'test@example.com' }
    });

    // onboardingCompleted should still be false (pending data ignored)
    expect(user.onboardingCompleted).toBe(false);
  });
});
```

**Checkpoint 4.1**: Tests fail because webhook still merges pending data.

### Step 4.2: 🟢 Implement Changes

#### 4.2.1 Simplify Clerk Webhook

**File**: `app/api/webhook/clerk/route.ts`

Simplify the `user.created` handler (lines 61-160):

```typescript
case 'user.created':
  // Handle user creation event - sync Clerk user to database
  try {
    const userData = evt.data;
    const primaryEmail = userData.email_addresses?.[0]?.email_address;

    if (primaryEmail && userData.id) {
      // Create user with onboardingCompleted=false (auth-first flow)
      const newUser = await prisma.user.create({
        data: {
          id: userData.id,
          email: primaryEmail,
          authProvider: 'clerk',
          authProviderId: userData.id,
          name: userData.first_name
            ? `${userData.first_name} ${userData.last_name || ''}`.trim()
            : undefined,
          subscriptionTier: 'FREE',
          onboardingCompleted: false, // Always false - user must complete onboarding
        }
      });
      console.log('User created in database:', newUser.id);
    } else {
      console.error('Missing required user data in webhook:', {
        id: userData.id,
        email: primaryEmail
      });
    }
  } catch (error) {
    console.error('Failed to create user in database from webhook:', error);
  }
  break;
```

**Removed**:
- PendingOnboarding lookup (lines 71-80)
- Conditional `onboardingCompleted: !!pendingOnboarding` logic
- Ticker merge logic (lines 96-130)
- Clerk metadata sync (lines 132-142)
- Pending data cleanup (lines 144-152)

**Checkpoint 4.2.1**: Webhook creates users with `onboardingCompleted=false`.

#### 4.2.2 Deprecate Pending Onboarding API Routes (Optional)

We can either:
1. **Delete** `app/api/onboarding/save-pending/` and `app/api/onboarding/check-email/`
2. **Deprecate** by returning 410 Gone response

For now, let's deprecate to avoid breaking anything:

**File**: `app/api/onboarding/save-pending/route.ts`

```typescript
import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'This endpoint is deprecated. Please sign up first, then complete onboarding.',
      redirectUrl: '/sign-up'
    },
    { status: 410 }
  );
}
```

**File**: `app/api/onboarding/check-email/route.ts`

```typescript
import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    {
      error: 'This endpoint is deprecated. Please sign up first, then complete onboarding.',
      redirectUrl: '/sign-up'
    },
    { status: 410 }
  );
}
```

**Checkpoint 4.2.2**: Deprecated endpoints return 410 Gone.

### Step 4.3: 🔵 Refactor

- [ ] Remove unused imports from webhook file
- [ ] Clean up any remaining references to pending onboarding

**Checkpoint 4.3**: All Phase 4 tests pass.

### Step 4.4: Final Phase Verification

#### Automated Verification:
```bash
npm run lint
npm run build
npm run test -- --testPathPattern="webhook"
```

#### Manual Verification:
- [ ] Sign up new user via Clerk
- [ ] Verify user created in database with `onboardingCompleted=false`
- [ ] Verify no pending data lookup/merge occurred
- [ ] Complete onboarding
- [ ] Verify `onboardingCompleted=true` after onboarding

**STOP**: Await manual confirmation before Phase 5.

---

## Phase 5: End-to-End Testing

### Overview
Comprehensive testing of the entire auth-first onboarding flow.

### Step 5.1: 🔴 Write E2E Tests

**Test File**: `__tests__/e2e/auth-first-onboarding.test.ts`

```typescript
describe('Auth-First Onboarding E2E', () => {
  describe('New User Flow', () => {
    it('should complete full flow: sign-up → onboarding → dashboard', async () => {
      // 1. Visit landing page, click CTA
      // 2. Verify redirect to /sign-up
      // 3. Complete Clerk sign-up
      // 4. Verify redirect to /onboarding
      // 5. Complete Step 1 (sectors)
      // 6. Complete Step 2 (companies)
      // 7. Verify redirect to /dashboard
      // 8. Verify onboardingCompleted=true
    });
  });

  describe('Returning User Flow', () => {
    it('should redirect onboarded user from /onboarding to /dashboard', async () => {
      // Setup: Create onboarded user
      // 1. Visit /onboarding
      // 2. Verify redirect to /dashboard
    });

    it('should allow non-onboarded user to access /onboarding', async () => {
      // Setup: Create non-onboarded user
      // 1. Visit /onboarding
      // 2. Verify page loads (no redirect)
    });
  });

  describe('Protection', () => {
    it('should redirect unauthenticated user from /onboarding to /sign-up', async () => {
      // 1. Sign out
      // 2. Visit /onboarding
      // 3. Verify redirect to /sign-up
    });

    it('should redirect non-onboarded user from /dashboard to /onboarding', async () => {
      // Setup: Create non-onboarded user
      // 1. Visit /dashboard
      // 2. Verify redirect to /onboarding
    });
  });
});
```

### Step 5.2: 🟢 Run All Tests

```bash
npm run test:e2e
npm run test:onboarding
npm run test
```

### Step 5.3: Final Verification

#### Automated Verification:
```bash
npm run lint
npm run build
npm run test:pipeline:comprehensive
```

#### Manual Verification Checklist:
- [ ] **New user flow**: Landing → Sign Up → Onboarding (2 steps) → Dashboard
- [ ] **Unauthenticated protection**: `/onboarding` → `/sign-up`
- [ ] **Non-onboarded protection**: `/dashboard` → `/onboarding`
- [ ] **Onboarded redirect**: `/onboarding` → `/dashboard`
- [ ] **CTA states**: All 3 states work correctly on landing page
- [ ] **Database state**: `onboardingCompleted` flag set correctly
- [ ] **Clerk metadata**: `publicMetadata.onboardingCompleted` synced

---

## Testing Strategy

### TDD Test Design Principles

1. **One Assertion Per Test**: Each test verifies one specific behavior
2. **Descriptive Test Names**: "should redirect unauthenticated user to sign-up"
3. **Arrange-Act-Assert**: Clear structure
4. **Test Behavior, Not Implementation**: Focus on redirects and rendered output

### Test Categories (in order of writing):

1. **Unit Tests**: Component rendering, CTA button logic
2. **Integration Tests**: Middleware redirect logic, webhook behavior
3. **E2E Tests**: Full user flows

### Checkpoint Frequency:
- Minimum 3 checkpoints per phase (Red, Green, Refactor)
- Additional checkpoints after each major component change

---

## Performance Considerations

1. **Middleware Database Queries**: If using database to check onboarding status, consider:
   - Caching with short TTL
   - Using Clerk's `publicMetadata` as primary source
   - Lazy loading only when needed

2. **Clerk Metadata Sync**: Ensure `publicMetadata.onboardingCompleted` is updated:
   - In `completeOnboarding()` action
   - Keep in sync with database flag

---

## Migration Notes

1. **Existing Users**: Users who previously skipped onboarding may have `onboardingCompleted=false`. They will be redirected to onboarding on next dashboard visit.

2. **Pending Onboarding Data**: Existing records in `PendingOnboarding` table will be ignored. Consider:
   - Running cleanup script to delete stale records
   - Dropping table in future migration

3. **Rollback Plan**: To rollback:
   - Re-add `/onboarding` to `publicRoutes`
   - Re-add Skip buttons
   - Re-add Step 3 (EmailStep)
   - Restore webhook pending data merge logic

---

## References

- Research document: `thoughts/shared/research/2026-01-10-onboarding-authentication-flow-architecture.md`
- Onboarding page: `app/(auth)/onboarding/page.tsx`
- Middleware: `middleware.ts:1146-1210`
- Clerk webhook: `app/api/webhook/clerk/route.ts:61-160`
- Landing CTAs: `components/landing/sections-v2/gmail-inbox-hero.tsx:1039-1058`
- ClerkProvider config: `app/layout.tsx:60-64`
