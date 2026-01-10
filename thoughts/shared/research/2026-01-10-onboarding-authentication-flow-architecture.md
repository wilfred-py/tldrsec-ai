---
date: 2026-01-10T10:29:08+11:00
researcher: Claude
git_commit: dd210266cc6e86745e9d0f1c4527cf28f485e4ee
branch: onboarding
repository: wilfred-py/tldrsec-ai
topic: "Onboarding and Authentication Flow Architecture"
tags: [research, codebase, onboarding, authentication, clerk, passwordless]
status: complete
last_updated: 2026-01-10
last_updated_by: Claude
---

# Research: Onboarding and Authentication Flow Architecture

**Date**: 2026-01-10T10:29:08+11:00
**Researcher**: Claude
**Git Commit**: dd210266cc6e86745e9d0f1c4527cf28f485e4ee
**Branch**: onboarding
**Repository**: wilfred-py/tldrsec-ai

## Research Question

Document the current onboarding and authentication flow architecture, specifically:
1. The 3-step onboarding flow structure
2. Authentication requirements and redirects
3. How users access onboarding (with/without authentication)
4. Post-authentication redirects
5. Database models involved

## Summary

The codebase implements a **passwordless onboarding flow** where users can complete Steps 1 (sector selection) and 2 (company selection) without authentication. Step 3 collects email and triggers either:
- **Authenticated users**: Direct onboarding completion with database writes
- **Unauthenticated users**: Data saved to `PendingOnboarding` table, then redirected to Clerk sign-up

The onboarding page (`/onboarding`) is configured as a **public route** in middleware, allowing unauthenticated access. After Clerk authentication completes via webhook, pending onboarding data is merged into the user's account automatically.

## Detailed Findings

### 1. Onboarding Page Structure

**Location**: [app/(auth)/onboarding/page.tsx](app/(auth)/onboarding/page.tsx)

The onboarding flow consists of 3 steps:

| Step | Component | Content | Auth Required |
|------|-----------|---------|---------------|
| 1 | Inline in page | Sector selection (8 sectors) | No |
| 2 | Inline in page | Company/equity selection (up to 5) | No |
| 3 | `<EmailStep />` | Email collection | No |

**Key State Variables** (lines 148-169):
```typescript
const [currentStep, setCurrentStep] = useState(1);
const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
const [selectedEquities, setSelectedEquities] = useState<string[]>([]);
```

**Skip Setup Button**: Present on all 3 steps (lines 558-564, 661-667, 682-688)
- Redirects directly to `/dashboard` via `router.push("/dashboard")`

### 2. Authentication Context Integration

**Location**: [lib/context/auth-context.tsx](lib/context/auth-context.tsx)

The onboarding page uses `useAuthContext()` to check authentication state (line 146):
```typescript
const { isAuthenticated, isLoading, userName } = useAuthContext();
```

**Critical Design Decision** (lines 179-181): The comment explicitly states onboarding is PUBLIC:
```typescript
// Note: Onboarding is now PUBLIC - no authentication required
// Unauthenticated users will save to PendingOnboarding table
// Authenticated users will complete onboarding directly
```

### 3. Email Submission Flow (Step 3)

**Location**: [app/(auth)/onboarding/page.tsx:285-367](app/(auth)/onboarding/page.tsx#L285-L367)

The `handleEmailSubmit` function branches based on authentication state:

#### Authenticated User Path (lines 286-288):
```typescript
if (isAuthenticated) {
  await handleCompleteOnboarding();
}
```
- Calls `saveUserPreferences()` server action
- Loops through tickers calling `addTickerSubscription()`
- Calls `completeOnboarding()` which sends welcome email
- Redirects to `/dashboard`

#### Unauthenticated User Path (lines 289-366):
1. Check email via `POST /api/onboarding/check-email`
2. Handle existing user scenario:
   - Save pending data via `POST /api/onboarding/save-pending`
   - Redirect to `/sign-in?email=...&returnTo=/dashboard?merge=pending`
3. Handle new user scenario:
   - Save pending data via `POST /api/onboarding/save-pending`
   - Redirect to Clerk sign-up with pre-filled email

### 4. API Endpoints for Passwordless Flow

#### Check Email Endpoint
**Location**: [app/api/onboarding/check-email/route.ts](app/api/onboarding/check-email/route.ts)

Returns one of four statuses:
- `NEW_USER` - Can proceed with onboarding
- `EXISTING_USER` - Has completed onboarding, redirect to sign-in
- `INCOMPLETE_USER` - Has account but incomplete onboarding
- `PENDING_ONBOARDING` - Has pending data from previous attempt

#### Save Pending Endpoint
**Location**: [app/api/onboarding/save-pending/route.ts](app/api/onboarding/save-pending/route.ts)

Stores onboarding data to `PendingOnboarding` table:
```typescript
await prisma.pendingOnboarding.upsert({
  where: { email },
  create: {
    email,
    sectors,
    tickers,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
  },
  update: { sectors, tickers, expiresAt: ... }
});
```

Returns redirect URL:
- New users: `/sign-up?email_address=...&redirect_url=/dashboard?welcome=true`
- Existing users: `/sign-in?email=...&returnTo=/dashboard?merge=pending`

### 5. Middleware Configuration

**Location**: [middleware.ts:1204-1208](middleware.ts#L1204-L1208)

Onboarding routes are configured as public (no Clerk auth required):
```typescript
publicRoutes: [
  // ... other routes

  // Passwordless onboarding (public - no auth required)
  '/onboarding',
  '/api/onboarding/check-email',
  '/api/onboarding/save-pending'
]
```

### 6. Clerk Webhook - Pending Data Merge

**Location**: [app/api/webhook/clerk/route.ts:61-160](app/api/webhook/clerk/route.ts#L61-L160)

When Clerk fires `user.created` webhook:

1. **Check for pending data** (lines 71-80):
```typescript
pendingOnboarding = await prisma.pendingOnboarding.findUnique({
  where: { email: normalizedEmail }
});
```

2. **Create user with appropriate status** (lines 83-93):
```typescript
const newUser = await prisma.user.create({
  data: {
    // ...
    onboardingCompleted: !!pendingOnboarding, // true if came through passwordless flow
  }
});
```

3. **Merge tickers** (lines 97-130):
- Parses tickers from pending data (handles both array and legacy JSON string formats)
- Creates ticker records for each selected company

4. **Sync to Clerk publicMetadata** (lines 133-142):
```typescript
await client.users.updateUserMetadata(userData.id, {
  publicMetadata: { onboardingCompleted: true }
});
```

5. **Delete pending record** (lines 145-152)

### 7. Database Models

**Location**: [prisma/schema.prisma](prisma/schema.prisma)

#### User Model (lines 19-53):
```prisma
model User {
  id                    String    @id @default(uuid())
  email                 String    @unique
  onboardingCompleted   Boolean   @default(false)
  // ... other fields
}
```

#### PendingOnboarding Model (lines 64-75):
```prisma
model PendingOnboarding {
  id        String   @id @default(uuid())
  email     String   @unique
  sectors   String[]
  tickers   Json     // Array of {symbol, companyName}
  createdAt DateTime @default(now())
  expiresAt DateTime // Auto-cleanup after 24 hours
}
```

### 8. ClerkProvider Configuration

**Location**: [app/layout.tsx:60-64](app/layout.tsx#L60-L64)

Global redirect URLs configured:
```typescript
<ClerkProviderWrapper
  afterSignUpUrl="/onboarding"
  afterSignInUrl="/dashboard"
  signUpUrl="/sign-up"
  signInUrl="/sign-in"
>
```

**Note**: `afterSignUpUrl="/onboarding"` means users who sign up directly (not through passwordless flow) are sent to onboarding.

### 9. Landing Page CTA Logic

**Locations**:
- [components/landing/sections-v2/gmail-inbox-hero.tsx:767](components/landing/sections-v2/gmail-inbox-hero.tsx#L767)
- [components/landing/sections-v2/pricing-section-v2.tsx:87](components/landing/sections-v2/pricing-section-v2.tsx#L87)
- [components/landing/landing-navbar.tsx:27](components/landing/landing-navbar.tsx#L27)

Landing pages check Clerk's publicMetadata to determine CTA:
```typescript
const { isSignedIn, isLoaded, user } = useUser();
const isOnboarded = Boolean(user?.publicMetadata?.onboardingCompleted);

// CTA renders either:
// - "Get Started" → /onboarding (if not onboarded)
// - "Go to Dashboard" → /dashboard (if onboarded)
```

### 10. Dashboard Protection

**Location**: [app/dashboard/page.tsx:5-12](app/dashboard/page.tsx#L5-L12)

Server-side authentication check:
```typescript
export default async function DashboardPage() {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  return <DashboardClient />;
}
```

**Note**: The dashboard does NOT check onboarding completion status. Non-onboarded authenticated users can access the dashboard (empty state shown).

## Code References

| File | Lines | Description |
|------|-------|-------------|
| `app/(auth)/onboarding/page.tsx` | 145-696 | Main onboarding page component |
| `app/(auth)/onboarding/actions.ts` | 30-246 | Server actions for preferences and completion |
| `components/onboarding/email-step.tsx` | 1-148 | Step 3 email input component |
| `app/api/onboarding/check-email/route.ts` | 1-107 | Email status check endpoint |
| `app/api/onboarding/save-pending/route.ts` | 1-96 | Save pending onboarding endpoint |
| `app/api/webhook/clerk/route.ts` | 60-160 | Clerk webhook handler for data merge |
| `middleware.ts` | 1204-1208 | Public routes configuration |
| `lib/context/auth-context.tsx` | 1-93 | Authentication context provider |
| `prisma/schema.prisma` | 19-75 | User and PendingOnboarding models |

## Architecture Documentation

### Current Flow Diagram

```
Landing Page (/)
    ↓
    ├─ User clicks "Get Started"
    ↓
/onboarding (PUBLIC - no auth required)
    ↓
Step 1: Select Sectors
    ↓
Step 2: Select Companies (up to 5)
    ↓
Step 3: Enter Email
    ↓
    ├─ IF authenticated:
    │   → saveUserPreferences()
    │   → addTickerSubscription() for each ticker
    │   → completeOnboarding()
    │   → redirect to /dashboard
    │
    └─ IF not authenticated:
        → POST /api/onboarding/check-email
        → POST /api/onboarding/save-pending
            ↓
            ├─ New user: redirect to /sign-up?email_address=...
            │   → Clerk handles sign-up
            │   → Webhook: user.created
            │   → Merge pending data to user
            │   → redirect to /dashboard?welcome=true
            │
            └─ Existing user: redirect to /sign-in?email=...
                → Clerk handles sign-in
                → redirect to /dashboard?merge=pending
```

### Key Design Patterns

1. **Passwordless First**: Users can explore and configure preferences before committing to account creation
2. **Temporary Storage**: `PendingOnboarding` table holds data for 24 hours before expiration
3. **Webhook-Driven Merge**: Data merge happens server-side via Clerk webhook, not client-side
4. **Dual State Sync**: `onboardingCompleted` stored in both database and Clerk publicMetadata
5. **Public Route Pattern**: Onboarding accessible without authentication via middleware config

### Unimplemented Features

Based on query parameters generated but not consumed:
- `?welcome=true` on dashboard - no handler implemented
- `?merge=pending` on dashboard - no merge modal implemented

The Clerk webhook handles merge automatically, making `?merge=pending` parameter redundant.

## Historical Context (from thoughts/)

- [2026-01-01-passwordless-onboarding-architecture.md](thoughts/shared/research/2026-01-01-passwordless-onboarding-architecture.md) - Initial architecture design for passwordless flow

## Related Research

- [2025-12-31-dashboard-redesign-to-landing-v2.md](thoughts/shared/research/2025-12-31-dashboard-redesign-to-landing-v2.md) - Landing page redesign with onboarding CTAs

## Open Questions

1. **Step 3 Removal**: The user's request mentions removing Step 3. This would require understanding where email collection should happen instead (during Clerk sign-up presumably).

2. **Authentication Requirement**: The user wants authentication required BEFORE onboarding. This would change the flow from passwordless to auth-first.

3. **Redirect Logic**: Currently unauthenticated users reaching onboarding are allowed to proceed. The change would need middleware or page-level redirects to `/sign-up`.

4. **Post Sign-Up Flow**: With auth-first, `afterSignUpUrl="/onboarding"` becomes the primary entry point to onboarding for new users.
