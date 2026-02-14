# Free Plan to 7-Day Trial Migration Implementation Plan

**Date**: 2026-02-10 20:07:08 AEDT
**Git Commit**: 834a417c5e0fc67bdcd354fc278af423f9970693
**Branch**: investigation/pipeline-job-processing-2026-02-09
**Repository**: tldrsec-ai

## Overview

This plan implements a complete migration from the permanent FREE plan to a 7-day trial system. After implementation, all new users will start with a 7-day trial that requires payment method verification (but no charge). Existing FREE users will be grandfathered as permanent free accounts. Trial expiration results in a soft block: users can still access the dashboard and view old summaries but won't receive new email notifications until they upgrade.

## Current State Analysis

### Existing FREE Plan Implementation
- **Database**: `User.subscriptionTier` defaults to `FREE` (prisma/schema.prisma:42)
- **Configuration**: FREE plan defined with 3 ticker limit, 10-K/10-Q only, weekly emails (lib/stripe/plans.ts:12-27)
- **No Trial Fields**: Database lacks `trialStartedAt`, `trialEndsAt`, `isTrialing` fields
- **No Trial Logic**: Stripe checkout has no trial configuration (lib/stripe/index.ts:153-188)
- **Banner**: Simple "You're on the Free Plan" message (components/dashboard/plan-status-banner.tsx:13-34)
- **Checkout Blocked**: FREE users can't checkout (app/api/user/subscription/route.ts:168-173)

### Key Discoveries from Research
1. **User Creation**: Clerk webhook creates users with `subscriptionTier: 'FREE'` (app/api/webhook/clerk/route.ts:78)
2. **Subscription API**: Returns default FREE response when no subscription exists (app/api/user/subscription/route.ts:65-79)
3. **Tier Limits**: Enforced via `THREE_TIER_LIMITS` constants (lib/subscription/three-tier-limits.ts:2-22)
4. **Filing Restrictions**: FREE limited to `['10-K', '10-Q']` filing types (lib/stripe/plans.ts:19)
5. **Cron System**: Comprehensive pattern available for trial expiration job (app/api/cron/)

## Desired End State

### After This Plan is Complete:
1. **New Users**: Start with 7-day trial, payment method required but not charged
2. **Existing Users**: Grandfathered with permanent FREE access (NULL trial dates)
3. **Trial Users**: Can track 3 companies with ALL filing types (not just 10-K/10-Q)
4. **Dashboard**: Trial countdown banner with urgency styling (green → orange → red)
5. **Expired Trials**: Soft block - view-only access, no new emails, upgrade CTA
6. **Stripe Integration**: Trial checkout with `trial_period_days: 7` and `payment_method_collection: 'always'`
7. **Abuse Prevention**: IP-based limiting (3 signups per IP per 30 days)
8. **Automatic Expiration**: Daily cron job marks expired trials and sends notifications

### Verification:
- New signup flows through trial creation successfully
- Payment method collection works via Stripe checkout
- Trial countdown displays correctly with color changes
- Expired trial users see soft block UI and can't receive emails
- Existing FREE users continue to work without interruption
- IP abuse prevention blocks excessive signups
- Cron job processes expirations daily

## What We're NOT Doing

To prevent scope creep, explicitly out of scope:
- ❌ Migrating existing FREE users to trial (they stay permanent FREE)
- ❌ Trial extensions or grace periods (hard 7-day limit)
- ❌ Multiple trial periods per user (one trial ever)
- ❌ Trial without payment method (card required for verification)
- ❌ Changing PRO/MAX tier pricing or features
- ❌ Adding new filing types or changing ticker limits
- ❌ Email template redesigns beyond trial-specific emails
- ❌ Admin dashboard for trial management (future enhancement)
- ❌ Analytics tracking for trial conversion rates (future enhancement)

## Implementation Approach

### Strategy
Follow a **phased, incremental approach** with Test-Driven Development (TDD):

1. **Phase 1**: Database schema changes and migrations (foundation)
2. **Phase 2**: Trial logic in user creation and access control (core functionality)
3. **Phase 3**: Stripe integration with trial checkout (payment flow)
4. **Phase 4**: Dashboard UI updates and trial countdown (user experience)
5. **Phase 5**: Trial expiration handling and cron jobs (automation)
6. **Phase 6**: Email templates and notifications (communication)
7. **Phase 7**: IP abuse prevention (security)
8. **Phase 8**: Integration testing and deployment (verification)

### Key Architectural Decisions

1. **Keep FREE Enum**: Don't remove from enums - differentiate via trial date presence
   - `FREE + NULL trialStartedAt` = Grandfathered user
   - `FREE + trialStartedAt` = Trial user

2. **Soft Block Pattern**: Trial-expired users retain dashboard access but no email delivery
   - Check `isTrialing` flag before sending emails
   - Display upgrade CTA prominently on dashboard
   - Allow viewing old summaries and preferences

3. **Stripe Trial Integration**: Use Stripe's native trial with payment method collection
   - `subscription_data.trial_period_days: 7`
   - `payment_method_collection: 'always'`
   - `trial_settings.end_behavior.missing_payment_method: 'cancel'`

4. **Grandfathering via NULL Dates**: Existing FREE users automatically grandfathered
   - Migration adds trial fields as nullable
   - Access control checks for NULL `trialStartedAt`
   - No data migration script needed

5. **All Filing Types for Trials**: Showcase full product value
   - Change `filingTypes: ['10-K', '10-Q']` to `['ALL']`
   - Update default preferences to enable all form types
   - Helps drive trial → paid conversion

6. **Daily Cron for Expiration**: Separate from main pipeline
   - Runs at midnight UTC via Cloudflare Worker
   - Marks `isTrialing: false` for expired trials
   - Sends expiration notification emails

7. **IP-Based Abuse Prevention**: Simple but effective
   - Track `signupIpAddress` on User model
   - Limit 3 signups per IP per 30 days
   - Fails open (allows on error) to avoid blocking legitimate users

## Phase 1: Database Schema Changes and Migrations

### Overview
Add trial tracking fields to User model and IP tracking for abuse prevention. Create database migration and update Prisma schema.

### Step 1.1: 🔴 Write Failing Schema Tests

**Test File**: `__tests__/db/user-trial-schema.test.ts`

Write these tests FIRST (they should all fail initially):

```typescript
import { getPrismaClient } from '@/lib/db/prisma';

describe('User Trial Schema', () => {
  let prisma: ReturnType<typeof getPrismaClient>;

  beforeAll(() => {
    prisma = getPrismaClient();
  });

  it('should have trialStartedAt field on User model', async () => {
    const user = await prisma.user.create({
      data: {
        id: 'test-trial-user-1',
        email: 'trial@test.com',
        authProvider: 'clerk',
        authProviderId: 'test-auth-id',
        subscriptionTier: 'FREE',
        trialStartedAt: new Date(),
      }
    });

    expect(user.trialStartedAt).toBeInstanceOf(Date);
  });

  it('should have trialEndsAt field on User model', async () => {
    const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const user = await prisma.user.create({
      data: {
        id: 'test-trial-user-2',
        email: 'trial2@test.com',
        authProvider: 'clerk',
        authProviderId: 'test-auth-id-2',
        subscriptionTier: 'FREE',
        trialStartedAt: new Date(),
        trialEndsAt: trialEnd,
      }
    });

    expect(user.trialEndsAt).toBeInstanceOf(Date);
  });

  it('should have isTrialing boolean field on User model', async () => {
    const user = await prisma.user.create({
      data: {
        id: 'test-trial-user-3',
        email: 'trial3@test.com',
        authProvider: 'clerk',
        authProviderId: 'test-auth-id-3',
        subscriptionTier: 'FREE',
        isTrialing: true,
      }
    });

    expect(user.isTrialing).toBe(true);
  });

  it('should have signupIpAddress field on User model', async () => {
    const user = await prisma.user.create({
      data: {
        id: 'test-trial-user-4',
        email: 'trial4@test.com',
        authProvider: 'clerk',
        authProviderId: 'test-auth-id-4',
        subscriptionTier: 'FREE',
        signupIpAddress: '192.168.1.1',
      }
    });

    expect(user.signupIpAddress).toBe('192.168.1.1');
  });

  it('should allow NULL trial dates for grandfathered users', async () => {
    const user = await prisma.user.create({
      data: {
        id: 'test-grandfathered-user',
        email: 'grandfathered@test.com',
        authProvider: 'clerk',
        authProviderId: 'test-auth-id-grandfathered',
        subscriptionTier: 'FREE',
        trialStartedAt: null,
        trialEndsAt: null,
        isTrialing: false,
      }
    });

    expect(user.trialStartedAt).toBeNull();
    expect(user.trialEndsAt).toBeNull();
    expect(user.isTrialing).toBe(false);
  });

  afterEach(async () => {
    await prisma.user.deleteMany({
      where: {
        email: {
          contains: 'trial'
        }
      }
    });
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL:
```bash
npm run test -- __tests__/db/user-trial-schema.test.ts
# Expected: 5 failing tests (fields don't exist in schema)
```

### Step 1.2: 🟢 Update Prisma Schema

#### 1.2.1 Add Trial Fields to User Model
**File**: `prisma/schema.prisma`
**Location**: After line 42 (after `subscriptionTier` field)

```prisma
model User {
  id                    String                 @id @default(uuid())
  email                 String                 @unique
  name                  String?
  authProvider          String
  authProviderId        String
  createdAt             DateTime               @default(now())
  preferences           Json?
  onboardingCompleted   Boolean                @default(false)
  tutorialCompletedAt   DateTime?
  tutorialProgress      Int                    @default(0)
  tutorialSteps         Json?
  subscriptionTier      SubscriptionTier       @default(FREE)

  // NEW: Trial tracking fields
  trialStartedAt        DateTime?
  trialEndsAt           DateTime?
  isTrialing            Boolean                @default(false)
  signupIpAddress       String?

  // ... rest of existing fields

  @@index([trialEndsAt, isTrialing])
  @@index([signupIpAddress, createdAt])
  @@schema("app")
}
```

**Checkpoint 1.2.1**: Verify schema compiles:
```bash
npm run db:generate
# Expected: Prisma client generates successfully
```

#### 1.2.2 Create Database Migration
**File**: `prisma/migrations/YYYYMMDDHHMMSS_add_trial_fields/migration.sql`

Run migration generation:
```bash
npx prisma migrate dev --name add_trial_fields
```

Expected migration content:
```sql
-- Add trial tracking fields to User table
ALTER TABLE app."User"
  ADD COLUMN IF NOT EXISTS "trialStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "isTrialing" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "signupIpAddress" TEXT;

-- Add index for efficient trial expiration queries
CREATE INDEX IF NOT EXISTS "User_trialEndsAt_isTrialing_idx"
  ON app."User"("trialEndsAt", "isTrialing")
  WHERE "isTrialing" = true;

-- Add index for IP abuse prevention queries
CREATE INDEX IF NOT EXISTS "User_signupIpAddress_createdAt_idx"
  ON app."User"("signupIpAddress", "createdAt");
```

**Checkpoint 1.2.2**: Run migration:
```bash
npm run db:migrate
# Expected: Migration applies successfully
```

**Checkpoint 1.2.3**: Verify tests now pass:
```bash
npm run test -- __tests__/db/user-trial-schema.test.ts
# Expected: 5 passing tests
```

### Step 1.3: 🔵 Refactor

- [ ] Verify index names follow convention: `{TableName}_{field1}_{field2}_idx`
- [ ] Ensure migration is idempotent with `IF NOT EXISTS`
- [ ] Add migration comments explaining purpose
- [ ] Verify nullable fields have `?` in schema

**Checkpoint 1.3**: All tests still pass:
```bash
npm run test -- __tests__/db/user-trial-schema.test.ts
# Expected: 5 passing tests
```

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [ ] Schema tests pass: `npm run test -- __tests__/db/user-trial-schema.test.ts`
- [ ] Prisma generates successfully: `npm run db:generate`
- [ ] Migration applies: `npm run db:migrate`
- [ ] Type checking passes: `npx tsc --noEmit`
- [ ] No regressions: `npm run test`

#### Manual Verification:
- [ ] Check database schema has new columns: Connect to DB and run `\d app."User"`
- [ ] Verify indexes created: Run `\di app."User_trial*"`
- [ ] Existing FREE users have NULL trial dates (not affected by migration)

**STOP**: After all automated verification passes and manual checks complete, pause here for confirmation before proceeding to Phase 2.

---

## Phase 2: Trial Logic in User Creation and Access Control

### Overview
Implement trial creation during user signup and access control logic to differentiate between trial users, grandfathered users, and paid users.

### Step 2.1: 🔴 Write Failing Tests for Trial Creation

**Test File**: `__tests__/lib/auth/trial-service.test.ts`

```typescript
import { TrialService } from '@/lib/auth/trial-service';
import { getPrismaClient } from '@/lib/db/prisma';

describe('TrialService', () => {
  let prisma: ReturnType<typeof getPrismaClient>;

  beforeAll(() => {
    prisma = getPrismaClient();
  });

  describe('checkTrialStatus', () => {
    it('should return active trial status for user with valid trial', async () => {
      const userId = 'test-trial-active';
      const now = new Date();
      const trialEnd = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 days from now

      await prisma.user.create({
        data: {
          id: userId,
          email: 'active-trial@test.com',
          authProvider: 'clerk',
          authProviderId: 'test-auth-active',
          subscriptionTier: 'FREE',
          trialStartedAt: now,
          trialEndsAt: trialEnd,
          isTrialing: true,
        }
      });

      const status = await TrialService.checkTrialStatus(userId);

      expect(status.isActive).toBe(true);
      expect(status.daysRemaining).toBe(5);
      expect(status.trialEndsAt).toEqual(trialEnd);
      expect(status.isGrandfathered).toBe(false);
    });

    it('should return grandfathered status for FREE user with NULL trial dates', async () => {
      const userId = 'test-grandfathered';

      await prisma.user.create({
        data: {
          id: userId,
          email: 'grandfathered@test.com',
          authProvider: 'clerk',
          authProviderId: 'test-auth-grandfathered',
          subscriptionTier: 'FREE',
          trialStartedAt: null,
          trialEndsAt: null,
          isTrialing: false,
        }
      });

      const status = await TrialService.checkTrialStatus(userId);

      expect(status.isActive).toBe(true);
      expect(status.daysRemaining).toBe(Infinity);
      expect(status.trialEndsAt).toBeNull();
      expect(status.isGrandfathered).toBe(true);
    });

    it('should return inactive status for expired trial', async () => {
      const userId = 'test-trial-expired';
      const trialEnd = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago

      await prisma.user.create({
        data: {
          id: userId,
          email: 'expired-trial@test.com',
          authProvider: 'clerk',
          authProviderId: 'test-auth-expired',
          subscriptionTier: 'FREE',
          trialStartedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
          trialEndsAt: trialEnd,
          isTrialing: true,
        }
      });

      const status = await TrialService.checkTrialStatus(userId);

      expect(status.isActive).toBe(false);
      expect(status.daysRemaining).toBeLessThan(0);
      expect(status.isGrandfathered).toBe(false);
    });

    it('should return active for PRO/MAX users', async () => {
      const userId = 'test-pro-user';

      await prisma.user.create({
        data: {
          id: userId,
          email: 'pro@test.com',
          authProvider: 'clerk',
          authProviderId: 'test-auth-pro',
          subscriptionTier: 'PRO',
        }
      });

      const status = await TrialService.checkTrialStatus(userId);

      expect(status.isActive).toBe(true);
      expect(status.daysRemaining).toBe(Infinity);
      expect(status.isGrandfathered).toBe(false);
    });
  });

  afterEach(async () => {
    await prisma.user.deleteMany({
      where: {
        email: {
          endsWith: '@test.com'
        }
      }
    });
  });
});
```

**Checkpoint 2.1**: Run tests and verify they FAIL:
```bash
npm run test -- __tests__/lib/auth/trial-service.test.ts
# Expected: 4 failing tests (TrialService doesn't exist yet)
```

### Step 2.2: 🟢 Implement Trial Service

#### 2.2.1 Create TrialService
**File**: `lib/auth/trial-service.ts`

```typescript
import { getPrismaClient } from '@/lib/db/prisma';

export interface TrialStatus {
  isActive: boolean;
  daysRemaining: number;
  trialEndsAt: Date | null;
  isGrandfathered: boolean;
}

export class TrialService {
  /**
   * Check trial status for a user
   * Returns status for trial users, grandfathered users, and paid users
   */
  static async checkTrialStatus(userId: string): Promise<TrialStatus> {
    const prisma = getPrismaClient();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        subscriptionTier: true,
        trialEndsAt: true,
        trialStartedAt: true,
        isTrialing: true,
      }
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Grandfathered free users (no trial dates) - always active
    if (user.subscriptionTier === 'FREE' && !user.trialStartedAt) {
      return {
        isActive: true,
        daysRemaining: Infinity,
        trialEndsAt: null,
        isGrandfathered: true
      };
    }

    // Trial users - check expiration
    if (user.isTrialing && user.trialEndsAt) {
      const now = new Date();
      const daysRemaining = Math.ceil((user.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const isActive = daysRemaining > 0;

      return {
        isActive,
        daysRemaining,
        trialEndsAt: user.trialEndsAt,
        isGrandfathered: false
      };
    }

    // Paid users (PRO/MAX) - always active
    return {
      isActive: true,
      daysRemaining: Infinity,
      trialEndsAt: null,
      isGrandfathered: false
    };
  }
}
```

**Checkpoint 2.2.1**: Tests pass:
```bash
npm run test -- __tests__/lib/auth/trial-service.test.ts
# Expected: 4 passing tests
```

#### 2.2.2 Update Clerk Webhook for Trial Creation
**File**: `app/api/webhook/clerk/route.ts`
**Location**: Lines 71-81 (user creation block)

**Change from**:
```typescript
const newUser = await prisma.user.create({
  data: {
    id: userData.id,
    email: primaryEmail,
    authProvider: 'clerk',
    authProviderId: userData.id,
    name: userData.first_name ? `${userData.first_name} ${userData.last_name || ''}`.trim() : undefined,
    subscriptionTier: 'FREE',
    onboardingCompleted: false,
  }
});
```

**Change to**:
```typescript
// Extract IP address for abuse prevention
const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0] ||
                  req.headers.get('x-real-ip') ||
                  'unknown';

// Calculate trial dates (7 days from now)
const now = new Date();
const trialEndsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

const newUser = await prisma.user.create({
  data: {
    id: userData.id,
    email: primaryEmail,
    authProvider: 'clerk',
    authProviderId: userData.id,
    name: userData.first_name ? `${userData.first_name} ${userData.last_name || ''}`.trim() : undefined,
    subscriptionTier: 'FREE',
    trialStartedAt: now,        // NEW: Trial start
    trialEndsAt: trialEndsAt,  // NEW: Trial end (7 days)
    isTrialing: true,           // NEW: Mark as trialing
    signupIpAddress: ipAddress, // NEW: Track IP for abuse prevention
    onboardingCompleted: false,
  }
});
```

**Write test for webhook change**:
**File**: `__tests__/api/webhook/clerk-trial-creation.test.ts`

```typescript
import { POST } from '@/app/api/webhook/clerk/route';
import { getPrismaClient } from '@/lib/db/prisma';

describe('Clerk Webhook Trial Creation', () => {
  it('should create new user with trial dates', async () => {
    const mockRequest = new Request('http://localhost/api/webhook/clerk', {
      method: 'POST',
      headers: {
        'svix-id': 'test-id',
        'svix-timestamp': Date.now().toString(),
        'svix-signature': 'test-signature',
        'x-forwarded-for': '192.168.1.100',
      },
      body: JSON.stringify({
        type: 'user.created',
        data: {
          id: 'user_test123',
          email_addresses: [{ email_address: 'newuser@test.com', id: 'email_123' }],
          primary_email_address_id: 'email_123',
          first_name: 'Test',
          last_name: 'User',
        }
      })
    });

    // Mock Clerk verification
    jest.mock('@clerk/nextjs', () => ({
      WebhookEvent: jest.fn(),
    }));

    const response = await POST(mockRequest);

    expect(response.status).toBe(200);

    // Verify user created with trial fields
    const prisma = getPrismaClient();
    const user = await prisma.user.findUnique({
      where: { id: 'user_test123' }
    });

    expect(user).toBeDefined();
    expect(user?.isTrialing).toBe(true);
    expect(user?.trialStartedAt).toBeInstanceOf(Date);
    expect(user?.trialEndsAt).toBeInstanceOf(Date);
    expect(user?.signupIpAddress).toBe('192.168.1.100');

    // Verify trial is 7 days
    const daysDiff = Math.ceil((user!.trialEndsAt!.getTime() - user!.trialStartedAt!.getTime()) / (1000 * 60 * 60 * 24));
    expect(daysDiff).toBe(7);
  });
});
```

**Checkpoint 2.2.2**: Webhook test passes:
```bash
npm run test -- __tests__/api/webhook/clerk-trial-creation.test.ts
# Expected: 1 passing test
```

### Step 2.3: 🔵 Refactor

- [ ] Extract trial date calculation to helper function
- [ ] Add JSDoc comments to TrialService methods
- [ ] Ensure IP extraction handles all header formats
- [ ] Add logging for trial creation events

**Checkpoint 2.3**: Tests still pass:
```bash
npm run test -- __tests__/lib/auth/trial-service.test.ts
npm run test -- __tests__/api/webhook/clerk-trial-creation.test.ts
# Expected: All passing
```

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [ ] Trial service tests pass: `npm run test -- __tests__/lib/auth/trial-service.test.ts`
- [ ] Webhook tests pass: `npm run test -- __tests__/api/webhook/clerk-trial-creation.test.ts`
- [ ] Type checking: `npx tsc --noEmit`
- [ ] No regressions: `npm run test`

#### Manual Verification:
- [ ] Create test user via Clerk and verify trial dates in database
- [ ] Verify IP address captured correctly
- [ ] Check trial is exactly 7 days from creation

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: Stripe Integration with Trial Checkout

### Overview
Configure Stripe checkout to support trial periods with payment method collection. Update checkout session creation and remove FREE tier checkout blocks.

### Step 3.1: 🔴 Write Failing Tests for Trial Checkout

**Test File**: `__tests__/integration/stripe-trial-checkout.test.ts`

```typescript
import { createCheckoutSession } from '@/lib/stripe';

describe('Stripe Trial Checkout', () => {
  it('should create checkout session with 7-day trial configuration', async () => {
    const session = await createCheckoutSession({
      priceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID!,
      customerId: 'cus_test123',
      successUrl: 'http://localhost:3000/dashboard?success=true',
      cancelUrl: 'http://localhost:3000/dashboard/billing?canceled=true',
      metadata: { userId: 'user_test', planType: 'PRO' },
      enableTrial: true, // NEW parameter
    });

    expect(session.mode).toBe('subscription');
    expect(session.subscription_data?.trial_period_days).toBe(7);
    expect(session.payment_method_collection).toBe('always');
    expect(session.subscription_data?.trial_settings?.end_behavior?.missing_payment_method).toBe('cancel');
  });

  it('should create non-trial checkout when enableTrial is false', async () => {
    const session = await createCheckoutSession({
      priceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID!,
      customerId: 'cus_test456',
      successUrl: 'http://localhost:3000/dashboard?success=true',
      cancelUrl: 'http://localhost:3000/dashboard/billing?canceled=true',
      metadata: { userId: 'user_test2', planType: 'PRO' },
      enableTrial: false,
    });

    expect(session.subscription_data?.trial_period_days).toBeUndefined();
  });
});
```

**Checkpoint 3.1**: Tests fail:
```bash
npm run test -- __tests__/integration/stripe-trial-checkout.test.ts
# Expected: 2 failing tests (enableTrial parameter doesn't exist)
```

### Step 3.2: 🟢 Implement Stripe Trial Configuration

#### 3.2.1 Update Stripe Checkout Session Creation
**File**: `lib/stripe/index.ts`
**Location**: Lines 153-188 (`createCheckoutSession` function)

**Change from**:
```typescript
export async function createCheckoutSession({
  priceId,
  customerId,
  successUrl,
  cancelUrl,
  metadata = {},
}: {
  priceId: string;
  customerId?: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}): Promise<Stripe.Checkout.Session>
```

**Change to**:
```typescript
export async function createCheckoutSession({
  priceId,
  customerId,
  successUrl,
  cancelUrl,
  metadata = {},
  enableTrial = false, // NEW parameter
}: {
  priceId: string;
  customerId?: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
  enableTrial?: boolean; // NEW parameter type
}): Promise<Stripe.Checkout.Session> {
  if (!stripe) throw new Error('Stripe not configured');

  const sessionConfig: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
    allow_promotion_codes: true,
    billing_address_collection: 'required',
    customer_update: customerId ? { address: 'auto' } : undefined,
  };

  // NEW: Add trial configuration if enabled
  if (enableTrial) {
    sessionConfig.payment_method_collection = 'always';
    sessionConfig.subscription_data = {
      trial_period_days: 7,
      trial_settings: {
        end_behavior: {
          missing_payment_method: 'cancel'
        }
      }
    };
  }

  const session = await stripe.checkout.sessions.create(sessionConfig);
  return session;
}
```

**Checkpoint 3.2.1**: Tests pass:
```bash
npm run test -- __tests__/integration/stripe-trial-checkout.test.ts
# Expected: 2 passing tests
```

#### 3.2.2 Remove FREE Checkout Block
**File**: `app/api/user/subscription/route.ts`
**Location**: Lines 168-173

**Delete this code**:
```typescript
if (planType === 'FREE') {
  return NextResponse.json(
    { error: 'Free tier does not require checkout' },
    { status: 400 }
  );
}
```

**Reason**: Trial users with `subscriptionTier === 'FREE'` need to be able to checkout to add payment method during trial.

#### 3.2.3 Update Checkout Endpoint to Use Trial
**File**: `app/api/user/subscription/route.ts`
**Location**: Lines 305-322 (checkout session creation)

**Change from**:
```typescript
const session = await createCheckoutSession({
  priceId,
  customerId: stripeCustomerId,
  successUrl: `${appUrl}/dashboard?subscription_success=true&session_id={CHECKOUT_SESSION_ID}`,
  cancelUrl,
  metadata: { userId, planType, billingInterval },
});
```

**Change to**:
```typescript
// Check if user is on trial
const isOnTrial = user.subscriptionTier === 'FREE' && user.isTrialing;

const session = await createCheckoutSession({
  priceId,
  customerId: stripeCustomerId,
  successUrl: `${appUrl}/dashboard?subscription_success=true&session_id={CHECKOUT_SESSION_ID}`,
  cancelUrl,
  metadata: { userId, planType, billingInterval },
  enableTrial: isOnTrial, // NEW: Enable trial for trial users
});
```

**Write test for checkout endpoint**:
**File**: `__tests__/api/user/subscription-trial-checkout.test.ts`

```typescript
describe('POST /api/user/subscription Trial Checkout', () => {
  it('should allow FREE trial users to create checkout session', async () => {
    const mockRequest = new Request('http://localhost/api/user/subscription', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        planType: 'PRO',
        billingInterval: 'monthly',
      })
    });

    // Mock authenticated trial user
    jest.mock('@clerk/nextjs', () => ({
      auth: () => ({ userId: 'trial_user_123' })
    }));

    const response = await POST(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.url).toBeDefined(); // Stripe checkout URL
    expect(data.sessionId).toBeDefined();
  });
});
```

**Checkpoint 3.2.2**: API test passes:
```bash
npm run test -- __tests__/api/user/subscription-trial-checkout.test.ts
# Expected: 1 passing test
```

### Step 3.3: 🔵 Refactor

- [ ] Extract trial eligibility check to helper function
- [ ] Add logging for trial checkout creation
- [ ] Update checkout error messages
- [ ] Add JSDoc for `enableTrial` parameter

**Checkpoint 3.3**: Tests still pass:
```bash
npm run test -- __tests__/integration/stripe-trial-checkout.test.ts
npm run test -- __tests__/api/user/subscription-trial-checkout.test.ts
# Expected: All passing
```

### Step 3.4: Final Phase Verification

#### Automated Verification:
- [ ] Stripe tests pass: `npm run test -- __tests__/integration/stripe-trial-checkout.test.ts`
- [ ] API tests pass: `npm run test -- __tests__/api/user/subscription-trial-checkout.test.ts`
- [ ] Type checking: `npx tsc --noEmit`
- [ ] Build succeeds: `npm run build`
- [ ] No regressions: `npm run test`

#### Manual Verification:
- [ ] Create Stripe test checkout session with trial enabled
- [ ] Verify payment method collection works
- [ ] Check trial period shows as 7 days in Stripe Dashboard
- [ ] Test checkout cancellation flow

**STOP**: Await manual confirmation before Phase 4.

---

## Phase 4: Dashboard UI Updates and Trial Countdown

### Overview
Update dashboard banner to show trial countdown with urgency styling. Add expired trial soft block UI.

### Step 4.1: 🔴 Write Failing Tests for Trial Banner

**Test File**: `__tests__/components/dashboard/plan-status-banner-trial.test.tsx`

```typescript
import { render, screen } from '@/__tests__/test-utils';
import { PlanStatusBanner } from '@/components/dashboard/plan-status-banner';
import '@testing-library/jest-dom';

describe('PlanStatusBanner Trial Mode', () => {
  it('should show trial countdown for trial users', () => {
    const trialEndsAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days

    render(
      <PlanStatusBanner
        planType="FREE"
        trialEndsAt={trialEndsAt}
        isTrialing={true}
      />
    );

    expect(screen.getByText(/5 days left in your free trial/i)).toBeInTheDocument();
    expect(screen.getByText(/Add Payment Method/i)).toBeInTheDocument();
  });

  it('should show green styling when 6-7 days remain', () => {
    const trialEndsAt = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);

    const { container } = render(
      <PlanStatusBanner
        planType="FREE"
        trialEndsAt={trialEndsAt}
        isTrialing={true}
      />
    );

    const banner = container.firstChild;
    expect(banner).toHaveClass('bg-emerald-100');
  });

  it('should show orange styling when 3-5 days remain', () => {
    const trialEndsAt = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);

    const { container } = render(
      <PlanStatusBanner
        planType="FREE"
        trialEndsAt={trialEndsAt}
        isTrialing={true}
      />
    );

    const banner = container.firstChild;
    expect(banner).toHaveClass('bg-orange-100');
  });

  it('should show red styling when ≤2 days remain', () => {
    const trialEndsAt = new Date(Date.now() + 1 * 24 * 60 * 60 * 1000);

    const { container } = render(
      <PlanStatusBanner
        planType="FREE"
        trialEndsAt={trialEndsAt}
        isTrialing={true}
      />
    );

    const banner = container.firstChild;
    expect(banner).toHaveClass('bg-red-100');
  });

  it('should not show banner for expired trials', () => {
    const trialEndsAt = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000); // Expired

    const { container } = render(
      <PlanStatusBanner
        planType="FREE"
        trialEndsAt={trialEndsAt}
        isTrialing={true}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should not show banner for grandfathered FREE users', () => {
    const { container } = render(
      <PlanStatusBanner
        planType="FREE"
        trialEndsAt={null}
        isTrialing={false}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('should not show banner for paid users', () => {
    const { container } = render(
      <PlanStatusBanner
        planType="PRO"
        trialEndsAt={null}
        isTrialing={false}
      />
    );

    expect(container.firstChild).toBeNull();
  });
});
```

**Checkpoint 4.1**: Tests fail:
```bash
npm run test -- __tests__/components/dashboard/plan-status-banner-trial.test.tsx
# Expected: 7 failing tests (component doesn't support trial props yet)
```

### Step 4.2: 🟢 Implement Trial Banner

#### 4.2.1 Update PlanStatusBanner Component
**File**: `components/dashboard/plan-status-banner.tsx`
**Replace entire file**:

```typescript
'use client';

import { Button } from '@/components/ui/button';
import { CreditCard } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface PlanStatusBannerProps {
  planType: 'FREE' | 'PRO' | 'MAX';
  trialEndsAt?: Date | null;
  isTrialing?: boolean;
}

export function PlanStatusBanner({ planType, trialEndsAt, isTrialing }: PlanStatusBannerProps) {
  // Only show for trial users
  if (planType !== 'FREE' || !isTrialing || !trialEndsAt) return null;

  const now = new Date();
  const daysRemaining = Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  // Don't show if trial expired
  if (daysRemaining <= 0) return null;

  // Determine urgency level and styling
  const getUrgencyConfig = () => {
    if (daysRemaining <= 2) {
      return {
        bgColor: 'bg-red-100 dark:bg-red-950/30',
        borderColor: 'border-red-200 dark:border-red-900',
        textColor: 'text-red-900 dark:text-red-100',
        buttonColor: 'bg-red-600 hover:bg-red-700',
      };
    } else if (daysRemaining <= 5) {
      return {
        bgColor: 'bg-orange-100 dark:bg-orange-950/30',
        borderColor: 'border-orange-200 dark:border-orange-900',
        textColor: 'text-orange-900 dark:text-orange-100',
        buttonColor: 'bg-orange-600 hover:bg-orange-700',
      };
    } else {
      return {
        bgColor: 'bg-emerald-100 dark:bg-emerald-950/30',
        borderColor: 'border-emerald-200 dark:border-emerald-900',
        textColor: 'text-emerald-900 dark:text-emerald-100',
        buttonColor: 'bg-emerald-600 hover:bg-emerald-700',
      };
    }
  };

  const config = getUrgencyConfig();

  return (
    <div className={cn('w-full border-b', config.bgColor, config.borderColor)}>
      <div className="container max-w-7xl mx-auto px-6 md:px-8 py-3">
        <div className="flex items-center justify-center gap-4">
          <span className={cn('text-sm font-medium', config.textColor)}>
            You&apos;ve got {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} left in your free trial
          </span>
          <Button
            size="sm"
            asChild
            className={cn('text-white font-medium shadow-sm', config.buttonColor)}
          >
            <Link href="/dashboard/billing" className="flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Add Payment Method
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
```

**Checkpoint 4.2.1**: Tests pass:
```bash
npm run test -- __tests__/components/dashboard/plan-status-banner-trial.test.tsx
# Expected: 7 passing tests
```

#### 4.2.2 Update Dashboard Layout to Pass Trial Props
**File**: `app/dashboard/layout.tsx`
**Location**: Lines 10-36

**Change from**:
```typescript
export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { subscription } = useSubscription();

  return (
    <ProtectedRoute>
      {/* ... */}
      {subscription && (
        <PlanStatusBanner planType={subscription.planType as "FREE" | "PRO" | "MAX"} />
      )}
      {/* ... */}
    </ProtectedRoute>
  );
}
```

**Change to**:
```typescript
export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const { subscription } = useSubscription();
  const [trialStatus, setTrialStatus] = useState<{
    trialEndsAt: Date | null;
    isTrialing: boolean;
  } | null>(null);

  useEffect(() => {
    async function fetchTrialStatus() {
      if (!subscription) return;

      try {
        const response = await fetch('/api/user/trial-status');
        if (response.ok) {
          const data = await response.json();
          setTrialStatus({
            trialEndsAt: data.trialEndsAt ? new Date(data.trialEndsAt) : null,
            isTrialing: data.isTrialing
          });
        }
      } catch (error) {
        console.error('Failed to fetch trial status:', error);
      }
    }

    fetchTrialStatus();
  }, [subscription]);

  return (
    <ProtectedRoute>
      {/* ... */}
      {subscription && trialStatus && (
        <PlanStatusBanner
          planType={subscription.planType as "FREE" | "PRO" | "MAX"}
          trialEndsAt={trialStatus.trialEndsAt}
          isTrialing={trialStatus.isTrialing}
        />
      )}
      {/* ... */}
    </ProtectedRoute>
  );
}
```

#### 4.2.3 Create Trial Status API Endpoint
**File**: `app/api/user/trial-status/route.ts` (new file)

```typescript
import { auth } from '@clerk/nextjs';
import { NextResponse } from 'next/server';
import { TrialService } from '@/lib/auth/trial-service';

export async function GET() {
  try {
    const { userId } = auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const trialStatus = await TrialService.checkTrialStatus(userId);

    return NextResponse.json({
      isTrialing: trialStatus.isGrandfathered ? false : trialStatus.isActive,
      trialEndsAt: trialStatus.trialEndsAt?.toISOString() || null,
      daysRemaining: trialStatus.daysRemaining,
      isGrandfathered: trialStatus.isGrandfathered,
    });
  } catch (error) {
    console.error('Error fetching trial status:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

**Checkpoint 4.2.2**: Test API endpoint:
```bash
# Create test for API endpoint
npm run test -- __tests__/api/user/trial-status.test.ts
```

#### 4.2.4 Create Expired Trial Soft Block UI
**File**: `components/dashboard/expired-trial-banner.tsx` (new file)

```typescript
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, CreditCard } from 'lucide-react';
import Link from 'next/link';

export function ExpiredTrialBanner() {
  return (
    <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
      <CardContent className="pt-6">
        <div className="flex flex-col items-center justify-center gap-4 text-center">
          <AlertCircle className="h-12 w-12 text-orange-600" />
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Your Trial Has Ended
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 max-w-md">
              You won&apos;t receive new filing summaries delivered to your inbox unless you upgrade to a Pro or Max plan.
              You can still view your past summaries below.
            </p>
          </div>
          <Button asChild size="lg" className="bg-orange-600 hover:bg-orange-700">
            <Link href="/dashboard/billing" className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Upgrade Now
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

#### 4.2.5 Add Expired Trial Banner to Dashboard
**File**: `app/dashboard/page.tsx`
**Add near top of page**:

```typescript
import { ExpiredTrialBanner } from '@/components/dashboard/expired-trial-banner';
import { TrialService } from '@/lib/auth/trial-service';

export default async function DashboardPage() {
  const { userId } = auth();

  if (!userId) {
    redirect('/sign-in');
  }

  // Check trial status
  const trialStatus = await TrialService.checkTrialStatus(userId);

  return (
    <div className="space-y-8">
      {/* Show expired trial banner if trial expired */}
      {!trialStatus.isActive && !trialStatus.isGrandfathered && (
        <ExpiredTrialBanner />
      )}

      {/* Rest of dashboard content */}
      {/* ... */}
    </div>
  );
}
```

### Step 4.3: 🔵 Refactor

- [ ] Extract urgency color config to constants
- [ ] Add prop validation and TypeScript interfaces
- [ ] Ensure accessibility (ARIA labels)
- [ ] Add dark mode support verification

**Checkpoint 4.3**: Tests still pass:
```bash
npm run test -- __tests__/components/dashboard/plan-status-banner-trial.test.tsx
# Expected: All passing
```

### Step 4.4: Final Phase Verification

#### Automated Verification:
- [ ] Banner tests pass: `npm run test -- __tests__/components/dashboard/plan-status-banner-trial.test.tsx`
- [ ] API tests pass: `npm run test -- __tests__/api/user/trial-status.test.ts`
- [ ] Type checking: `npx tsc --noEmit`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Create trial user and verify green banner shows (6-7 days)
- [ ] Modify trial end date to 4 days and verify orange banner
- [ ] Modify trial end date to 1 day and verify red banner
- [ ] Expire trial and verify soft block UI shows
- [ ] Verify grandfathered user sees no banner
- [ ] Verify paid user sees no banner

**STOP**: Await manual confirmation before Phase 5.

---

## Phase 5: Trial Expiration Handling and Cron Jobs

### Overview
Create trial expiration cron job to mark expired trials and send notifications. Implement email blocking for expired trials.

### Step 5.1: 🔴 Write Failing Tests for Expiration Logic

**Test File**: `__tests__/lib/cron/trial-expiration-handler.test.ts`

```typescript
import { handleTrialExpiration } from '@/lib/cron/handlers/trial-expiration-handler';
import { getPrismaClient } from '@/lib/db/prisma';

describe('Trial Expiration Handler', () => {
  let prisma: ReturnType<typeof getPrismaClient>;

  beforeAll(() => {
    prisma = getPrismaClient();
  });

  it('should mark expired trial user as not trialing', async () => {
    const userId = 'test-expired-user';
    const trialEnd = new Date(Date.now() - 24 * 60 * 60 * 1000); // Yesterday

    await prisma.user.create({
      data: {
        id: userId,
        email: 'expired@test.com',
        authProvider: 'clerk',
        authProviderId: 'test-auth-expired-handler',
        subscriptionTier: 'FREE',
        trialStartedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        trialEndsAt: trialEnd,
        isTrialing: true,
      }
    });

    await handleTrialExpiration({
      userId,
      userEmail: 'expired@test.com',
      trialExpiresAt: trialEnd.toISOString(),
      executionId: 'test-exec-1',
    });

    const updatedUser = await prisma.user.findUnique({
      where: { id: userId }
    });

    expect(updatedUser?.isTrialing).toBe(false);
  });

  it('should send expiration notification email', async () => {
    // Mock email service
    const mockSendEmail = jest.fn();
    jest.mock('@/lib/email/trial-expiration-email', () => ({
      sendTrialExpirationEmail: mockSendEmail
    }));

    const userId = 'test-user-notify';
    const trialEnd = new Date(Date.now() - 24 * 60 * 60 * 1000);

    await prisma.user.create({
      data: {
        id: userId,
        email: 'notify@test.com',
        authProvider: 'clerk',
        authProviderId: 'test-auth-notify',
        subscriptionTier: 'FREE',
        trialStartedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
        trialEndsAt: trialEnd,
        isTrialing: true,
      }
    });

    await handleTrialExpiration({
      userId,
      userEmail: 'notify@test.com',
      trialExpiresAt: trialEnd.toISOString(),
      executionId: 'test-exec-2',
    });

    expect(mockSendEmail).toHaveBeenCalledWith({
      email: 'notify@test.com',
      userId,
      trialExpiredAt: trialEnd
    });
  });
});
```

**Checkpoint 5.1**: Tests fail:
```bash
npm run test -- __tests__/lib/cron/trial-expiration-handler.test.ts
# Expected: 2 failing tests (handler doesn't exist)
```

### Step 5.2: 🟢 Implement Trial Expiration System

#### 5.2.1 Create Trial Expiration Handler
**File**: `lib/cron/handlers/trial-expiration-handler.ts` (new file)

```typescript
import { logger } from '@/lib/logging';
import { getPrismaClient } from '@/lib/db/prisma';

const handlerLogger = logger.child('trial-expiration-handler');

export interface TrialExpirationPayload {
  userId: string;
  userEmail: string;
  trialExpiresAt: string;
  executionId: string;
}

/**
 * Handle expired trial processing
 * - Mark user as not trialing
 * - Send expiration notification email
 */
export async function handleTrialExpiration(payload: TrialExpirationPayload): Promise<void> {
  handlerLogger.info('Processing trial expiration', {
    userId: payload.userId,
    email: payload.userEmail,
    executionId: payload.executionId
  });

  const prisma = getPrismaClient();

  try {
    // 1. Mark user as not trialing
    await prisma.user.update({
      where: { id: payload.userId },
      data: {
        isTrialing: false,
      }
    });

    handlerLogger.info('User marked as trial expired', {
      userId: payload.userId,
    });

    // 2. Send expiration notification email
    const { sendTrialExpirationEmail } = await import('@/lib/email/trial-expiration-email');
    await sendTrialExpirationEmail({
      email: payload.userEmail,
      userId: payload.userId,
      trialExpiredAt: new Date(payload.trialExpiresAt)
    });

    handlerLogger.info('Trial expiration email sent', {
      userId: payload.userId,
      email: payload.userEmail
    });

  } catch (error) {
    handlerLogger.error('Failed to process trial expiration', {
      userId: payload.userId,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    throw error;
  }
}
```

**Checkpoint 5.2.1**: Tests pass:
```bash
npm run test -- __tests__/lib/cron/trial-expiration-handler.test.ts
# Expected: 2 passing tests
```

#### 5.2.2 Add Trial Expiration Job Type
**File**: `lib/job-queue/index.ts`
**Location**: Lines 23-42 (JobType union)

Add to JobType:
```typescript
export type JobType =
  | 'ASYNC_DISCOVER_FILINGS'
  | 'ASYNC_FETCH_FILINGS'
  | 'ASYNC_SUMMARIZE_FILINGS'
  | 'CHECK_TRIAL_EXPIRATION'  // NEW
  | ...
```

Also add to validation arrays in methods (lines 145-151, 280-290, 350-363).

#### 5.2.3 Register Handler in Background Worker
**File**: `lib/cron/background-filing-worker.ts`

Add to job processing switch:
```typescript
async processJob(job: any): Promise<any> {
  switch (job.jobType) {
    case 'ASYNC_DISCOVER_FILINGS':
      // ... existing handler
      break;

    case 'CHECK_TRIAL_EXPIRATION':
      const { handleTrialExpiration } = await import('./handlers/trial-expiration-handler');
      await handleTrialExpiration(job.payload);
      break;

    // ... other handlers
  }
}
```

#### 5.2.4 Create Trial Expiration Cron Endpoint
**File**: `app/api/cron/check-trial-expiration/route.ts` (new file)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logging';
import { generateSecureExecutionId } from '@/lib/security/secure-random';
import { CronAuthService } from '@/lib/cron/auth-service';
import { JobQueueService } from '@/lib/job-queue';
import { getPrismaClient } from '@/lib/db/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const trialLogger = logger.child('check-trial-expiration');

/**
 * GET /api/cron/check-trial-expiration
 * Daily cron job to check for expired trials and queue notification jobs
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const executionId = request.headers.get('x-execution-id') || generateSecureExecutionId('trial');

  trialLogger.info(`[${executionId}] Trial expiration check triggered`);

  try {
    // Validate authentication
    const authResult = await CronAuthService.validateCronRequest(request);
    if (!authResult.isValid) {
      trialLogger.warn(`[${executionId}] Authentication failed`, {
        error: authResult.error,
        clientIP: authResult.clientIP
      });

      return NextResponse.json({
        success: false,
        error: authResult.error || 'Authentication failed',
        executionId,
        duration: Date.now() - startTime
      }, {
        status: authResult.error?.includes('Rate limit') ? 429 :
               authResult.error?.includes('IP not allowed') ? 403 : 401
      });
    }

    // Query for expired trials
    const prisma = getPrismaClient();
    const now = new Date();

    const expiredTrials = await prisma.user.findMany({
      where: {
        isTrialing: true,
        trialEndsAt: {
          lte: now
        }
      },
      select: {
        id: true,
        email: true,
        trialEndsAt: true
      }
    });

    // Queue jobs for each expired trial
    const jobsQueued = [];
    for (const user of expiredTrials) {
      const job = await JobQueueService.addJob({
        jobType: 'CHECK_TRIAL_EXPIRATION',
        payload: {
          userId: user.id,
          userEmail: user.email,
          trialExpiresAt: user.trialEndsAt!.toISOString(),
          executionId
        },
        priority: 8,
        maxAttempts: 3,
        idempotencyKey: `trial-expiration-${user.id}-${now.toISOString().split('T')[0]}`
      });

      jobsQueued.push(job.id);
    }

    const duration = Date.now() - startTime;

    trialLogger.info(`[${executionId}] Trial expiration check completed`, {
      expiredTrialsFound: expiredTrials.length,
      jobsQueued: jobsQueued.length,
      duration
    });

    return NextResponse.json({
      success: true,
      executionId,
      duration,
      expiredTrials: expiredTrials.length,
      jobsQueued: jobsQueued.length,
      message: `Queued ${jobsQueued.length} trial expiration jobs`
    }, {
      headers: {
        'X-Execution-ID': executionId,
        'X-Jobs-Queued': String(jobsQueued.length)
      }
    });

  } catch (error) {
    const duration = Date.now() - startTime;

    trialLogger.error(`[${executionId}] Trial expiration check failed`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      duration
    });

    return NextResponse.json({
      success: false,
      error: 'Internal system error',
      executionId,
      duration
    }, { status: 500 });
  }
}
```

#### 5.2.5 Add Cloudflare Worker Schedule
**File**: `cloudflare-cron/wrangler.toml`
**Location**: Line 14

Update crons array:
```toml
crons = ["*/3 * * * *", "*/5 * * * *", "*/15 * * * *", "0 22 * * *", "0 0 * * *"]
#         ^Summarize    ^Pipeline     ^Auto-recover    ^Daily report  ^NEW: Trial check
```

**File**: `cloudflare-cron/index.js`
Add routing:

```javascript
async scheduled(event, env, ctx) {
  const cronExpression = event.cron;

  if (cronExpression === '0 0 * * *') {
    // Daily trial expiration check at midnight UTC
    return await this.handleTrialExpiration(event, env, ctx);
  }

  // ... existing routing
}

async handleTrialExpiration(event, env, ctx) {
  recordHandlerExecution('trialExpiration', null);

  try {
    const executionId = `trial-check-${Date.now()}`;
    const cleanSecret = sanitizeCronSecret(env.CRON_SECRET);

    const timestamp = Date.now();
    const payload = `${timestamp}:GET:/api/cron/check-trial-expiration`;
    const signature = createHmac('sha256', cleanSecret)
      .update(payload)
      .digest('hex');

    const response = await fetch(`${env.PUBLIC_URL}/api/cron/check-trial-expiration`, {
      method: 'GET',
      headers: {
        'x-hmac-signature': signature,
        'x-hmac-timestamp': timestamp.toString(),
        'x-execution-id': executionId,
        'x-cron-source': 'cloudflare-worker'
      }
    });

    if (!response.ok) {
      throw new Error(`Trial check failed: ${response.status}`);
    }

    const result = await response.json();
    recordHandlerExecution('trialExpiration', true);

    console.log('[TRIAL] Check completed', {
      executionId,
      expiredTrials: result.expiredTrials,
      jobsQueued: result.jobsQueued
    });
  } catch (error) {
    recordHandlerExecution('trialExpiration', false);
    await alertOnHandlerFailure('trialExpiration', error, env);
    throw error;
  }
}
```

### Step 5.3: 🔵 Refactor

- [ ] Extract job queueing logic to helper function
- [ ] Add comprehensive logging
- [ ] Ensure idempotency keys prevent duplicate processing
- [ ] Add error handling for email failures

**Checkpoint 5.3**: Tests still pass:
```bash
npm run test -- __tests__/lib/cron/trial-expiration-handler.test.ts
# Expected: All passing
```

### Step 5.4: Final Phase Verification

#### Automated Verification:
- [ ] Handler tests pass: `npm run test -- __tests__/lib/cron/trial-expiration-handler.test.ts`
- [ ] Cron endpoint test: Manual HMAC test (see testing section)
- [ ] Type checking: `npx tsc --noEmit`
- [ ] Build succeeds: `npm run build`

#### Manual Verification:
- [ ] Test cron endpoint with HMAC auth
- [ ] Verify jobs queued for expired trials
- [ ] Check job processing marks users correctly
- [ ] Verify emails sent (check test email)
- [ ] Deploy Cloudflare Worker and verify schedule

**STOP**: Await manual confirmation before Phase 6.

---

## Phase 6: Email Templates and Notifications

### Overview
Create email templates for trial-related notifications: welcome (trial start), reminder (3 days before), and expiration emails.

### Step 6.1: 🔴 Write Failing Tests for Email Templates

**Test File**: `__tests__/lib/email/trial-emails.test.ts`

```typescript
import { sendTrialWelcomeEmail, sendTrialReminderEmail, sendTrialExpirationEmail } from '@/lib/email/trial-emails';

describe('Trial Email Templates', () => {
  it('should send trial welcome email', async () => {
    await expect(
      sendTrialWelcomeEmail({
        email: 'newuser@test.com',
        userId: 'user_123',
        trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      })
    ).resolves.not.toThrow();
  });

  it('should send trial reminder email', async () => {
    await expect(
      sendTrialReminderEmail({
        email: 'trialing@test.com',
        userId: 'user_456',
        daysRemaining: 3
      })
    ).resolves.not.toThrow();
  });

  it('should send trial expiration email', async () => {
    await expect(
      sendTrialExpirationEmail({
        email: 'expired@test.com',
        userId: 'user_789',
        trialExpiredAt: new Date()
      })
    ).resolves.not.toThrow();
  });
});
```

**Checkpoint 6.1**: Tests fail:
```bash
npm run test -- __tests__/lib/email/trial-emails.test.ts
# Expected: 3 failing tests (functions don't exist)
```

### Step 6.2: 🟢 Implement Email Templates

#### 6.2.1 Create Trial Email Service
**File**: `lib/email/trial-emails.ts` (new file)

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

interface TrialWelcomeEmailParams {
  email: string;
  userId: string;
  trialEndsAt: Date;
}

interface TrialReminderEmailParams {
  email: string;
  userId: string;
  daysRemaining: number;
}

interface TrialExpirationEmailParams {
  email: string;
  userId: string;
  trialExpiredAt: Date;
}

export async function sendTrialWelcomeEmail(params: TrialWelcomeEmailParams): Promise<void> {
  await resend.emails.send({
    from: 'TL;DR SEC <noreply@tldrsec.app>',
    to: params.email,
    subject: 'Welcome to Your 7-Day Trial',
    html: `
      <h1>Welcome to TL;DR SEC!</h1>
      <p>Your 7-day trial has started. You now have access to:</p>
      <ul>
        <li>Track up to 3 companies</li>
        <li>AI-powered summaries of ALL SEC filing types</li>
        <li>Email notifications for new filings</li>
      </ul>
      <p>Your trial ends on ${params.trialEndsAt.toLocaleDateString()}.</p>
      <p><a href="https://tldrsec.app/dashboard/billing">Add a payment method</a> to continue after your trial.</p>
    `,
  });
}

export async function sendTrialReminderEmail(params: TrialReminderEmailParams): Promise<void> {
  await resend.emails.send({
    from: 'TL;DR SEC <noreply@tldrsec.app>',
    to: params.email,
    subject: `${params.daysRemaining} Days Left in Your Trial`,
    html: `
      <h1>Your Trial is Ending Soon</h1>
      <p>You have ${params.daysRemaining} days left in your trial.</p>
      <p>To continue receiving SEC filing summaries after your trial ends, please add a payment method.</p>
      <p><a href="https://tldrsec.app/dashboard/billing">Add Payment Method</a></p>
    `,
  });
}

export async function sendTrialExpirationEmail(params: TrialExpirationEmailParams): Promise<void> {
  await resend.emails.send({
    from: 'TL;DR SEC <noreply@tldrsec.app>',
    to: params.email,
    subject: 'Your Trial Has Ended',
    html: `
      <h1>Your Trial Has Ended</h1>
      <p>Thank you for trying TL;DR SEC. Your 7-day trial ended on ${params.trialExpiredAt.toLocaleDateString()}.</p>
      <p>You won't receive new filing summaries unless you upgrade to a paid plan.</p>
      <p><a href="https://tldrsec.app/dashboard/billing">Upgrade Now</a></p>
    `,
  });
}
```

**Checkpoint 6.2.1**: Tests pass:
```bash
npm run test -- __tests__/lib/email/trial-emails.test.ts
# Expected: 3 passing tests
```

### Step 6.3: 🔵 Refactor

- [ ] Create React email templates instead of plain HTML
- [ ] Add unsubscribe links
- [ ] Include branding and styling
- [ ] Add call-to-action buttons

**Checkpoint 6.3**: Tests still pass

### Step 6.4: Final Phase Verification

#### Automated Verification:
- [ ] Email tests pass: `npm run test -- __tests__/lib/email/trial-emails.test.ts`
- [ ] Type checking: `npx tsc --noEmit`

#### Manual Verification:
- [ ] Send test emails and verify formatting
- [ ] Check emails render correctly in email clients
- [ ] Verify links work correctly

**STOP**: Await manual confirmation before Phase 7.

---

## Phase 7: IP Abuse Prevention

### Overview
Implement IP-based trial abuse prevention to limit 3 signups per IP address per 30 days.

### Step 7.1: 🔴 Write Failing Tests for IP Abuse Prevention

**Test File**: `__tests__/lib/security/trial-abuse-prevention.test.ts`

```typescript
import { checkIPTrialAbuse } from '@/lib/security/trial-abuse-prevention';
import { getPrismaClient } from '@/lib/db/prisma';

describe('IP Trial Abuse Prevention', () => {
  let prisma: ReturnType<typeof getPrismaClient>;

  beforeAll(() => {
    prisma = getPrismaClient();
  });

  it('should allow signup when IP has less than 3 signups', async () => {
    const result = await checkIPTrialAbuse('192.168.1.1');
    expect(result.allowed).toBe(true);
  });

  it('should block signup when IP has 3 signups in 30 days', async () => {
    const ipAddress = '192.168.1.100';

    // Create 3 users with same IP in last 30 days
    for (let i = 0; i < 3; i++) {
      await prisma.user.create({
        data: {
          id: `abuse-test-${i}`,
          email: `abuse${i}@test.com`,
          authProvider: 'clerk',
          authProviderId: `auth-${i}`,
          subscriptionTier: 'FREE',
          signupIpAddress: ipAddress,
          createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5 days ago
        }
      });
    }

    const result = await checkIPTrialAbuse(ipAddress);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Maximum trial signups reached for this IP address');
  });

  it('should allow signup for IP with old signups (>30 days)', async () => {
    const ipAddress = '192.168.1.200';

    // Create 3 users with same IP but >30 days ago
    for (let i = 0; i < 3; i++) {
      await prisma.user.create({
        data: {
          id: `old-signup-${i}`,
          email: `old${i}@test.com`,
          authProvider: 'clerk',
          authProviderId: `old-auth-${i}`,
          subscriptionTier: 'FREE',
          signupIpAddress: ipAddress,
          createdAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000) // 35 days ago
        }
      });
    }

    const result = await checkIPTrialAbuse(ipAddress);
    expect(result.allowed).toBe(true);
  });

  afterEach(async () => {
    await prisma.user.deleteMany({
      where: {
        email: {
          contains: '@test.com'
        }
      }
    });
  });
});
```

**Checkpoint 7.1**: Tests fail:
```bash
npm run test -- __tests__/lib/security/trial-abuse-prevention.test.ts
# Expected: 3 failing tests (function doesn't exist)
```

### Step 7.2: 🟢 Implement IP Abuse Prevention

#### 7.2.1 Create Abuse Prevention Service
**File**: `lib/security/trial-abuse-prevention.ts` (new file)

```typescript
import { getPrismaClient } from '@/lib/db/prisma';
import { logger } from '@/lib/logging';

const abuseLogger = logger.child('trial-abuse-prevention');

export interface IPAbuseCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if an IP address has exceeded trial signup limits
 * Limit: 3 signups per IP per 30 days
 */
export async function checkIPTrialAbuse(ipAddress: string): Promise<IPAbuseCheckResult> {
  try {
    const prisma = getPrismaClient();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Count users created from this IP in last 30 days
    const userCount = await prisma.user.count({
      where: {
        signupIpAddress: ipAddress,
        createdAt: {
          gte: thirtyDaysAgo
        }
      }
    });

    // Allow max 3 signups per IP in 30 days
    if (userCount >= 3) {
      abuseLogger.warn('IP trial abuse detected', {
        ipAddress,
        userCount,
        limit: 3
      });

      return {
        allowed: false,
        reason: 'Maximum trial signups reached for this IP address'
      };
    }

    return { allowed: true };

  } catch (error) {
    // Fail open - allow signup on error to avoid blocking legitimate users
    abuseLogger.error('Error checking IP abuse', {
      ipAddress,
      error: error instanceof Error ? error.message : 'Unknown error'
    });

    return { allowed: true };
  }
}
```

**Checkpoint 7.2.1**: Tests pass:
```bash
npm run test -- __tests__/lib/security/trial-abuse-prevention.test.ts
# Expected: 3 passing tests
```

#### 7.2.2 Integrate IP Check into Clerk Webhook
**File**: `app/api/webhook/clerk/route.ts`
**Location**: After IP extraction, before user creation

**Add before user creation**:
```typescript
// Extract IP address
const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0] ||
                  req.headers.get('x-real-ip') ||
                  'unknown';

// NEW: Check IP abuse before creating user
if (ipAddress !== 'unknown') {
  const { checkIPTrialAbuse } = await import('@/lib/security/trial-abuse-prevention');
  const abuseCheck = await checkIPTrialAbuse(ipAddress);

  if (!abuseCheck.allowed) {
    logger.warn('[ClerkWebhook] IP blocked', {
      ipAddress,
      reason: abuseCheck.reason,
      event: 'user.created'
    });

    // Return 200 to acknowledge webhook, but don't create user
    return NextResponse.json({ received: true, blocked: true });
  }
}

// Continue with user creation...
```

**Write test for webhook IP blocking**:
**File**: `__tests__/api/webhook/clerk-ip-blocking.test.ts`

```typescript
describe('Clerk Webhook IP Abuse Prevention', () => {
  it('should block signup when IP has exceeded limit', async () => {
    // Create 3 existing users with same IP
    const ipAddress = '192.168.1.50';
    const prisma = getPrismaClient();

    for (let i = 0; i < 3; i++) {
      await prisma.user.create({
        data: {
          id: `existing-${i}`,
          email: `existing${i}@test.com`,
          authProvider: 'clerk',
          authProviderId: `existing-auth-${i}`,
          subscriptionTier: 'FREE',
          signupIpAddress: ipAddress,
        }
      });
    }

    // Attempt 4th signup from same IP
    const mockRequest = new Request('http://localhost/api/webhook/clerk', {
      method: 'POST',
      headers: {
        'x-forwarded-for': ipAddress,
      },
      body: JSON.stringify({
        type: 'user.created',
        data: {
          id: 'user_blocked',
          email_addresses: [{ email_address: 'blocked@test.com', id: 'email_blocked' }],
          primary_email_address_id: 'email_blocked',
        }
      })
    });

    const response = await POST(mockRequest);
    const data = await response.json();

    expect(response.status).toBe(200); // Webhook acknowledged
    expect(data.blocked).toBe(true); // But user not created

    // Verify user was NOT created
    const blockedUser = await prisma.user.findUnique({
      where: { id: 'user_blocked' }
    });
    expect(blockedUser).toBeNull();
  });
});
```

**Checkpoint 7.2.2**: Webhook blocking test passes:
```bash
npm run test -- __tests__/api/webhook/clerk-ip-blocking.test.ts
# Expected: 1 passing test
```

### Step 7.3: 🔵 Refactor

- [ ] Add configurable limit via environment variable
- [ ] Add logging for blocked IPs
- [ ] Create admin endpoint to view blocked IPs
- [ ] Add metrics for abuse prevention effectiveness

**Checkpoint 7.3**: Tests still pass

### Step 7.4: Final Phase Verification

#### Automated Verification:
- [ ] Abuse prevention tests pass: `npm run test -- __tests__/lib/security/trial-abuse-prevention.test.ts`
- [ ] Webhook blocking test passes: `npm run test -- __tests__/api/webhook/clerk-ip-blocking.test.ts`
- [ ] Type checking: `npx tsc --noEmit`

#### Manual Verification:
- [ ] Test blocking with multiple signups from same IP
- [ ] Verify legitimate users not blocked
- [ ] Check logs for abuse detection

**STOP**: Await manual confirmation before Phase 8.

---

## Phase 8: Integration Testing and Deployment

### Overview
Run comprehensive integration tests, update configuration files, and deploy to production.

### Step 8.1: 🔴 Write End-to-End Integration Tests

**Test File**: `__tests__/e2e/trial-user-journey.test.ts`

```typescript
import { describe, it, expect } from '@jest/globals';

describe('Trial User Journey E2E', () => {
  it('should complete full trial user flow', async () => {
    // 1. User signs up via Clerk
    // 2. Clerk webhook creates trial user
    // 3. User logs in and sees trial banner
    // 4. User adds companies
    // 5. User receives summaries
    // 6. Trial expires
    // 7. User sees soft block UI
    // 8. Email delivery blocked
    // 9. User upgrades via Stripe
    // 10. Access restored

    // This test requires running services
    // Mark as integration test
  }, 60000); // 60 second timeout

  it('should handle trial checkout flow', async () => {
    // 1. Trial user clicks "Add Payment Method"
    // 2. Redirected to Stripe checkout
    // 3. Payment method collected
    // 4. Webhook processes checkout
    // 5. Trial converted to paid
    // 6. Banner removed, emails enabled
  }, 60000);
});
```

### Step 8.2: 🟢 Configuration and Deployment

#### 8.2.1 Update Environment Variables

**File**: `.env.example`
Add:
```bash
# Trial Configuration
TRIAL_DURATION_DAYS=7
MAX_TRIALS_PER_IP=3
TRIAL_IP_WINDOW_DAYS=30

# Cloudflare Worker
CRON_SECRET=your_80_character_secret_here
```

#### 8.2.2 Update Pricing Configuration
**File**: `lib/stripe/plans.ts`
**Location**: Lines 12-27 (FREE plan configuration)

**Change from**:
```typescript
FREE: {
  filingTypes: ['10-K', '10-Q'] as const,
}
```

**Change to**:
```typescript
FREE: {
  filingTypes: ['ALL'] as const, // Trial users get all filing types
}
```

#### 8.2.3 Update Default Preferences
**File**: `lib/user/preference-types.ts`
**Location**: Lines 218-284 (DEFAULT_NOTIFICATION_PREFERENCES)

Enable all filing types for new users:
```typescript
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  annualReports: {
    form10K: true,
    form10KA: true,    // Enable
    form20F: true,     // Enable
    form40F: true,     // Enable
    formNCSR: true,    // Enable
    formNCSRS: true,   // Enable
    formNT10K: true    // Enable
  },
  quarterlyReports: {
    form10Q: true,
    form10QA: true,    // Enable
    form6K: true,      // Enable
    formNT10Q: true    // Enable
  },
  currentEvents: {
    form8K: true,
    form8KA: true      // Enable
  },
  insiderTrading: {
    form3: true,       // Enable
    form4: true,       // Enable
    form5: true,       // Enable
    form144: true      // Enable
  },
  ownershipReports: {
    form13F: true,     // Enable
    form13G: true,     // Enable
    form13D: true      // Enable
  },
  proxyStatements: {
    formDEF14A: true,  // Enable
    formDEF14C: true,  // Enable
    formDEFM14A: true, // Enable
    formDEFM14C: true  // Enable
  },
  registrationStatements: {
    formS1: true,      // Enable
    formS3: true,      // Enable
    formS4: true,      // Enable
    formS8: true       // Enable
  },
};
```

#### 8.2.4 Deploy Checklist

- [ ] Run database migration in production: `npm run db:migrate`
- [ ] Deploy Next.js app to Vercel: `vercel --prod`
- [ ] Deploy Cloudflare Worker: `npm run cloudflare:deploy`
- [ ] Sync CRON_SECRET: `npm run cloudflare:sync-secret`
- [ ] Verify trial expiration cron schedule active
- [ ] Test production trial signup flow
- [ ] Monitor error rates and logs

### Step 8.3: 🔵 Final Verification

**Checkpoint 8.3**: Complete testing checklist

### Step 8.4: Final Phase Verification

#### Automated Verification:
- [ ] All tests pass: `npm run test`
- [ ] E2E test passes: `npm run test:e2e`
- [ ] Pipeline tests pass: `npm run test:pipeline:comprehensive`
- [ ] Build succeeds: `npm run build`
- [ ] No TypeScript errors: `npx tsc --noEmit`
- [ ] No linting errors: `npm run lint`

#### Manual Verification:
- [ ] Create new test user and verify trial created
- [ ] Verify trial countdown banner shows correct days
- [ ] Test payment method addition via Stripe
- [ ] Expire trial manually and verify soft block
- [ ] Test email blocking for expired trial
- [ ] Verify grandfathered users unaffected
- [ ] Check Cloudflare Worker logs for trial cron
- [ ] Verify IP abuse prevention blocks 4th signup
- [ ] Monitor production for 24 hours

**STOP**: Final approval before production deployment.

---

## Testing Strategy

### TDD Test Design Principles

1. **One Assertion Per Test**: Makes failures easier to diagnose
2. **Descriptive Test Names**: "should [verb] when [condition]"
3. **Arrange-Act-Assert**: Clear structure
4. **Test Behavior, Not Implementation**: Focus on inputs/outputs
5. **Edge Cases First**: Write edge case tests before happy path

### Test Categories (in order of writing):

1. **Contract Tests**: Define the public API/interface
2. **Edge Case Tests**: Boundary conditions
3. **Integration Tests**: Components working together
4. **Regression Tests**: Prevent bug recurrence

### Checkpoint Frequency

- Minimum 3 checkpoints per phase (Red, Green, Refactor)
- Ideal: 1 checkpoint per test group (every 2-3 related tests)
- Maximum gap: 15 minutes of implementation work

---

## References

### Original Research
- `thoughts/shared/research/2026-02-07-free-plan-to-trial-migration-analysis.md`

### Key Codebase Files
- Database: `prisma/schema.prisma:19-53` (User model)
- Subscription Config: `lib/stripe/plans.ts:12-27` (FREE plan)
- User Creation: `app/api/webhook/clerk/route.ts:71-81`
- Checkout: `lib/stripe/index.ts:153-188`
- Banner: `components/dashboard/plan-status-banner.tsx:13-34`
- Cron Pattern: `app/api/cron/cleanup-locks/route.ts`

### Related Documentation
- Stripe Trial Setup: https://stripe.com/docs/billing/subscriptions/trials
- Cloudflare Workers Cron: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Clerk Webhooks: https://clerk.com/docs/integrations/webhooks

---

## Success Criteria

### Automated Verification:
- [ ] All unit tests pass: `npm run test`
- [ ] Integration tests pass: `npm run test:pipeline:comprehensive`
- [ ] E2E test passes: `npm run test:e2e`
- [ ] Build succeeds: `npm run build`
- [ ] Type checking passes: `npx tsc --noEmit`
- [ ] Linting passes: `npm run lint`
- [ ] Database migrations apply: `npm run db:migrate`

### Manual Verification:
- [ ] New user signup creates trial (7 days)
- [ ] Trial banner shows with correct countdown
- [ ] Banner colors change: green (6-7 days), orange (3-5), red (≤2)
- [ ] Expired trial shows soft block UI
- [ ] Email delivery blocked for expired trials
- [ ] Stripe checkout collects payment method
- [ ] Trial converts to paid after checkout
- [ ] Grandfathered users work without changes
- [ ] IP abuse prevention blocks 4th signup
- [ ] Cron job processes expirations daily
- [ ] All filing types work for trial users

### Performance Criteria:
- [ ] Trial status check < 100ms
- [ ] Banner renders without flash
- [ ] Checkout redirect < 2s
- [ ] Email sends within 5 minutes

### Business Criteria:
- [ ] No disruption to existing FREE users
- [ ] Trial-to-paid conversion tracking works
- [ ] Support can identify trial vs grandfathered users
- [ ] Clear upgrade path from trial

---

**Implementation Complete**: This plan provides a complete, test-driven implementation strategy for migrating from permanent FREE plan to 7-day trial system with grandfathered existing users.

