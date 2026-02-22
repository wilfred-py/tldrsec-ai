---
date: 2026-01-23T17:31:00+1100
researcher: Claude
git_commit: c1530135d9c0ab92bee9e6de9172d55610420388
branch: stripe-integration
repository: tldrsec-ai
topic: "Checkout 'User not found' error - 404 on upgrade to Pro"
tags: [research, codebase, stripe, checkout, user-creation, clerk]
status: complete
last_updated: 2026-01-23
last_updated_by: Claude
---

# Research: Checkout "User not found" Error

**Date**: 2026-01-23T17:31:00+1100
**Researcher**: Claude
**Git Commit**: c1530135d9c0ab92bee9e6de9172d55610420388
**Branch**: stripe-integration
**Repository**: tldrsec-ai

## Research Question

Understand why the following error occurs when attempting to upgrade to Pro:

```
Failed to load resource: the server responded with a status of 404 (Not Found)
Checkout error: Error: User not found
    at useSubscription.useCallback[createCheckout] (use-subscription.ts:91:15)
    at async DashboardClient.useCallback[handleUpgradeClick] (dashboard-client.tsx:304:29)
```

## Summary

The error originates from `app/api/user/subscription/route.ts:209-213`. When a user clicks the upgrade button, the checkout flow calls `POST /api/user/subscription` which queries the database for the user record. If the user doesn't exist in the local PostgreSQL database (even though they're authenticated via Clerk), the API returns a 404 "User not found" error.

This happens because Clerk authentication and the local database user records are separate systems that must be synchronized.

## Detailed Findings

### Error Location

**File**: `app/api/user/subscription/route.ts:200-214`

The POST handler that creates checkout sessions:

```typescript
// Get user info
const user = await prisma.user.findUnique({
  where: { id: userId },
  select: {
    email: true,
    name: true,
  },
});

if (!user) {
  return NextResponse.json(
    { error: 'User not found' },
    { status: 404 }
  );
}
```

The `userId` comes from Clerk auth (`const { userId } = await auth();`), but the database query uses `id: userId` to find the user in the local User table.

### Client-Side Flow

**File**: `hooks/use-subscription.ts:74-106`

The `createCheckout` function:
1. Makes POST request to `/api/user/subscription`
2. Expects `checkoutUrl` in response
3. If response not OK, extracts error message and throws

**File**: `components/dashboard/dashboard-client.tsx:298-314`

The `handleUpgradeClick` function:
1. Calls `createCheckout(planType, billingCycle)`
2. On success, redirects to `window.location.href = checkoutUrl`
3. On error, logs "Checkout error" and shows toast

### User Creation Flow

Users can be created via two paths:

#### Path 1: Clerk Webhook (Primary)

**File**: `app/api/webhook/clerk/route.ts:61-88`

When a user signs up via Clerk:
1. Clerk sends `user.created` webhook
2. Handler creates User record with Clerk ID as primary key
3. Sets `onboardingCompleted: false`

#### Path 2: Onboarding Completion (Fallback)

**File**: `app/(auth)/onboarding/actions.ts:284-416`

The `completeOnboardingBatched()` function:
1. Checks if user exists in database
2. If not, creates user with `onboardingCompleted: true`
3. Uses Prisma transaction for atomicity

### When "User not found" Occurs

The error occurs when:

1. User is authenticated via Clerk (valid session)
2. User has NOT been created in the local database
3. User attempts to upgrade from dashboard

This can happen if:

- **Webhook failure**: Clerk webhook didn't fire or failed to create the user record
- **Skipped onboarding**: User navigated directly to dashboard without completing onboarding
- **Database issue**: User record was deleted or never created
- **Race condition**: User reached dashboard before webhook processed

### Database Schema

**File**: `prisma/schema.prisma:19-53`

The User model uses Clerk's user ID as the primary key:

```prisma
model User {
  id                    String            @id @default(cuid())
  email                 String            @unique
  authProvider          String
  authProviderId        String
  onboardingCompleted   Boolean           @default(false)
  subscriptionTier      SubscriptionTier  @default(FREE)
  preferences           Json?
  // ...relationships
}
```

The `id` field is set to the Clerk user ID when created via webhook or onboarding.

## Code References

- `app/api/user/subscription/route.ts:200-214` - Where 404 error is returned
- `app/api/user/subscription/route.ts:131-139` - POST handler auth check
- `hooks/use-subscription.ts:74-106` - Client-side createCheckout function
- `hooks/use-subscription.ts:89-91` - Error extraction and throw
- `components/dashboard/dashboard-client.tsx:298-314` - handleUpgradeClick function
- `app/api/webhook/clerk/route.ts:61-88` - Clerk webhook user creation
- `app/(auth)/onboarding/actions.ts:284-416` - Onboarding user creation fallback

## Architecture Documentation

### Authentication vs Database User Records

The system uses a dual-identity approach:

1. **Clerk Identity**: Handles authentication, sessions, JWT tokens
2. **Database User**: Stores application data (tickers, subscriptions, preferences)

These must be synchronized for the application to function correctly.

### Expected Flow

```
1. User signs up → Clerk creates account
2. Clerk webhook → Database User created (onboardingCompleted=false)
3. User completes onboarding → onboardingCompleted=true
4. User uses dashboard → Database User exists, operations succeed
```

### Failure Scenario

```
1. User signs up → Clerk creates account
2. Webhook fails/delayed → Database User NOT created
3. User navigates to dashboard → Clerk auth succeeds
4. User clicks upgrade → API queries Database User → NOT FOUND → 404
```

## Historical Context (from thoughts/)

No existing research documents found for this specific issue.

## Related Research

- User creation and Clerk synchronization patterns documented in codebase-analyzer findings above

## Open Questions

1. Why did the user reach the dashboard without a database User record?
2. Did the Clerk webhook fire successfully for this user?
3. Did the user complete onboarding or skip it somehow?
4. Should the checkout API create the user record if it doesn't exist (like onboarding does)?
5. Should there be middleware protection preventing dashboard access without a database User record?
