---
date: 2026-01-01T00:34:44+11:00
researcher: Claude (via Claude Code)
git_commit: f6eb7efab09668721f980591cee60e5f864474b8
branch: main
repository: tldrsec-ai
topic: "Passwordless Onboarding Flow with Email Verification Architecture"
tags: [research, codebase, onboarding, authentication, email-verification, clerk, resend]
status: complete
last_updated: 2026-01-01
last_updated_by: Claude
---

# Research: Passwordless Onboarding Flow with Email Verification Architecture

**Date**: 2026-01-01T00:34:44+11:00
**Researcher**: Claude (via Claude Code)
**Git Commit**: f6eb7efab09668721f980591cee60e5f864474b8
**Branch**: main
**Repository**: tldrsec-ai

## Research Question

Allow users not to have to sign up before completing onboarding. The final onboarding step should be for them to input their desired email address that will receive summaries. Send verification email for users to click and verify receipt and linkage between their email address and summaries linked to their account. Tell them a 10-Q and latest material (non-routine) Form-4 summaries have been sent for all their tracked tickers. Finally, redirect user to /dashboard.

## Summary

The current implementation **requires Clerk authentication before onboarding**. Users must sign up via Clerk's authentication system (sign-in/sign-up pages) before accessing the onboarding flow. The onboarding page at [app/(auth)/onboarding/page.tsx](app/(auth)/onboarding/page.tsx) explicitly checks for authentication and redirects unauthenticated users to `/sign-in`.

Key findings:
1. **Authentication Gate**: Onboarding page requires `isAuthenticated` from `useAuthContext()` hook (lines 145-146, 180-184)
2. **Clerk Integration**: All user context is obtained from Clerk via `currentUser()` and `auth()` server functions
3. **Email Source**: User email is retrieved from Clerk's `user.emailAddresses[0].emailAddress` - no email input field exists in onboarding
4. **No Email Verification Flow**: No custom email verification logic exists - Clerk handles email verification during sign-up
5. **Welcome Email**: Sent after onboarding completion but does not include sample summaries for tracked tickers
6. **Middleware Protection**: Middleware protects onboarding route, requiring valid Clerk session

## Detailed Findings

### 1. Current Onboarding Flow Architecture

**Entry Points:**
- [app/(auth)/onboarding/page.tsx:144-190](app/(auth)/onboarding/page.tsx#L144-L190) - Main onboarding component
- [app/(auth)/onboarding/actions.ts](app/(auth)/onboarding/actions.ts) - Server actions for saving preferences

**Current 2-Step Flow:**
1. **Step 1: Sector Selection** (lines 403-457)
   - User selects industry sectors of interest
   - Options: Technology, Healthcare, Financial Services, Automotive, Consumer Goods, Energy, Real Estate, Industrial

2. **Step 2: Equity Selection** (lines 470-562)
   - User selects up to 5 companies from chosen sectors
   - Hardcoded equity lists per sector (lines 85-142)
   - Search functionality for filtering companies

**Authentication Requirement:**
```typescript
// Line 145-146, 180-184
const { isAuthenticated, isLoading, userName } = useAuthContext();

useEffect(() => {
  if (!isLoading && !isAuthenticated) {
    router.replace("/sign-in");
  }
}, [isAuthenticated, isLoading, router]);
```

### 2. User Creation and Email Handling

**Current Email Flow:**
- [app/(auth)/onboarding/actions.ts:30-86](app/(auth)/onboarding/actions.ts#L30-L86) - `saveUserPreferences()`
  - Gets email from Clerk: `user.emailAddresses[0].emailAddress`
  - Creates/updates user in database with Clerk-provided email

- [app/(auth)/onboarding/actions.ts:88-157](app/(auth)/onboarding/actions.ts#L88-L157) - `addTickerSubscription()`
  - Adds tickers to user's tracked list
  - Uses Clerk email for database lookup

- [app/(auth)/onboarding/actions.ts:162-245](app/(auth)/onboarding/actions.ts#L162-L245) - `completeOnboarding()`
  - Marks `onboardingCompleted: true` in database
  - Sends welcome email via `sendWelcomeEmail()`

### 3. Database Schema for User and Email

**User Model** ([prisma/schema.prisma:19-58](prisma/schema.prisma#L19-L58)):
```prisma
model User {
  id                    String    @id @default(uuid())
  email                 String    @unique
  name                  String?
  authProvider          String      // Currently: 'clerk'
  authProviderId        String      // Clerk user ID
  onboardingCompleted   Boolean   @default(false)
  // ... other fields
  tickers               Ticker[]
}
```

**Key Observation**: The `email` field is **unique** and serves as both the identifier and the summary delivery address. There is no separate `summaryEmail` field.

### 4. Email Infrastructure

**Welcome Email Service** ([lib/email/welcome-service.ts](lib/email/welcome-service.ts)):
- Sends welcome email after onboarding completion
- Gets email from Clerk authentication
- Includes list of tracked tickers in email
- Does NOT send sample 10-Q or Form-4 summaries

**Email Types Supported:**
- Welcome email (post-onboarding)
- Filing summary emails (10-K, 10-Q, 8-K, Form-4, Form-3, Form-5, Form-144, etc.)
- Digest emails

**Resend Integration** ([lib/email/resend.ts](lib/email/resend.ts), [lib/email/resend-client.ts](lib/email/resend-client.ts)):
- Fully integrated with Resend for transactional emails
- Templates exist for all major filing types
- Rate-limited async email queue available

### 5. No Existing Email Verification System

**Current Verification Flow:**
- Clerk handles email verification during sign-up process
- [app/(auth)/verify-email/[[...verify-email]]/page.tsx](app/(auth)/verify-email/[[...verify-email]]/page.tsx) - Clerk's verification page
- No custom email verification logic in the codebase

**No Custom Verification Tables:**
- No `EmailVerification` or `VerificationToken` model in Prisma schema
- No verification API routes for custom token validation
- No verification email templates beyond Clerk's built-in

### 6. SEC Filing Summary Pipeline

**10-Q Summaries:**
- Prompt template: [lib/ai/prompts/form-10q.ts](lib/ai/prompts/form-10q.ts)
- Email template: [components/ui/email/templates/10q-template.tsx](components/ui/email/templates/10q-template.tsx)

**Form-4 Summaries:**
- Prompt template: [lib/ai/prompts/form-4.ts](lib/ai/prompts/form-4.ts)
- Email template: [components/ui/email/templates/form4-template.tsx](components/ui/email/templates/form4-template.tsx)
- Emphasizes "material (non-routine)" insider transactions

**Summary Generation Pipeline:**
1. Discovery: [lib/cron/handlers/discovery-handler.ts](lib/cron/handlers/discovery-handler.ts)
2. Fetch: [lib/cron/handlers/fetch-handler.ts](lib/cron/handlers/fetch-handler.ts)
3. Summarize: [lib/cron/handlers/summarize-cached-handler.ts](lib/cron/handlers/summarize-cached-handler.ts)
4. Email: [lib/email/summary-service.ts](lib/email/summary-service.ts)

### 7. Middleware and Route Protection

**Middleware Configuration** ([middleware.ts:1173-1206](middleware.ts#L1173-L1206)):
```typescript
publicRoutes: [
  '/api/health',
  '/api/webhooks/vercel-deployment',
  '/api/cron/*',  // Protected by CRON_SECRET
  '/',
  '/newsletter',
  '/pricing',
  '/about',
  '/privacy',
  '/terms'
]
```

**Key Observation**: `/onboarding` is NOT in the public routes list, meaning it's protected by Clerk middleware.

## Architecture Documentation

### Current Authentication Flow

```
User Journey (Current):
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌───────────────┐
│   Landing   │ -> │   Sign-Up   │ -> │   Verify    │ -> │   Onboarding  │
│   Page (/)  │    │   (Clerk)   │    │   Email     │    │  (2 steps)    │
└─────────────┘    └─────────────┘    │   (Clerk)   │    └───────────────┘
                                      └─────────────┘           │
                                                                v
                                                        ┌───────────────┐
                                                        │   Dashboard   │
                                                        │   (/dashboard)│
                                                        └───────────────┘
```

### Data Flow

```
Clerk Auth -> currentUser() -> emailAddresses[0] -> prisma.user.create() -> sendWelcomeEmail()
```

### Key Files Involved

| Component | File Path | Purpose |
|-----------|-----------|---------|
| Onboarding Page | `app/(auth)/onboarding/page.tsx` | 2-step wizard for sector/equity selection |
| Server Actions | `app/(auth)/onboarding/actions.ts` | Save preferences, add tickers, complete onboarding |
| Auth Context | `lib/context/auth-context.tsx` | Client-side auth state management |
| Welcome Email | `lib/email/welcome-service.ts` | Send welcome email post-onboarding |
| Middleware | `middleware.ts` | Route protection and authentication |
| User Schema | `prisma/schema.prisma` | Database models for User, Ticker, Summary |

## Code References

- `app/(auth)/onboarding/page.tsx:145-190` - Authentication check and redirect logic
- `app/(auth)/onboarding/page.tsx:273-328` - `handleCompleteOnboarding()` function
- `app/(auth)/onboarding/actions.ts:162-245` - `completeOnboarding()` server action
- `lib/email/welcome-service.ts:19-124` - `sendWelcomeEmail()` implementation
- `lib/context/auth-context.tsx:39-90` - `AuthProvider` component
- `middleware.ts:1173-1206` - Public routes configuration
- `prisma/schema.prisma:19-58` - User model definition

## Historical Context (from thoughts/)

No directly relevant historical documents found regarding passwordless onboarding or email verification flows.

## Resolved Questions

### 1. Clerk Removal from Onboarding

**Decision**: Completely remove Clerk from onboarding. Only include Clerk auth **after** user completes onboarding.

**New Flow**:
```
User Journey (Proposed):
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Landing   │ -> │ Onboarding  │ -> │   Enter     │ -> │   Clerk     │
│   Page (/)  │    │ (3 steps)   │    │   Email     │    │   Sign-Up   │
└─────────────┘    │ 1. Sectors  │    │   Address   │    └─────────────┘
                   │ 2. Equities │    └─────────────┘           │
                   │ 3. Email    │                              v
                   └─────────────┘                      ┌─────────────┐
                                                        │   Verify    │
                                                        │   Email     │
                                                        │   (Clerk)   │
                                                        └─────────────┘
                                                               │
                                                               v
                                                        ┌─────────────┐
                                                        │  Dashboard  │
                                                        │ + Summaries │
                                                        └─────────────┘
```

**Key Changes Required**:
- Add Step 3 to onboarding: Email input field
- Remove authentication check from onboarding page (lines 180-184)
- Add `/onboarding` to middleware public routes
- Store pending user data (sectors, tickers, email) before Clerk flow
- After Clerk sign-up completes, associate stored data with new Clerk user

---

### 2. Email Uniqueness Handling

**Options and Analysis**:

#### Option A: Block with Friendly Message
**Approach**: When user enters email that already exists, show message: "An account with this email already exists. Please sign in instead."

| Pros | Cons |
|------|------|
| Simple to implement | May frustrate users who forgot they signed up |
| Clear user expectation | Leaks account existence (minor privacy concern) |
| Prevents orphaned/duplicate data | Doesn't handle partial onboarding abandonment |

#### Option B: Resume Existing Onboarding
**Approach**: If email exists but `onboardingCompleted: false`, allow user to resume or restart onboarding.

| Pros | Cons |
|------|------|
| Handles abandoned onboarding | More complex state management |
| User-friendly for returns | Need to handle stale ticker selections |
| No data loss | Potential security: anyone with email can modify pending tickers |

#### Option C: Merge with Existing Completed Account
**Approach**: If email exists with `onboardingCompleted: true`, redirect to sign-in with pre-filled email.

| Pros | Cons |
|------|------|
| Seamless for existing users | Requires sign-in interruption |
| Preserves existing data | May lose newly selected tickers from onboarding |
| Clear account recovery path | Extra step for returning users |

#### Option D: Create Temporary/Pending User
**Approach**: Create a separate `PendingOnboarding` record until Clerk sign-up completes. On Clerk completion, merge into User table.

| Pros | Cons |
|------|------|
| No conflicts with existing users | Requires new database table |
| Clean separation of concerns | More complex data migration |
| Handles abandonment gracefully | Orphaned pending records need cleanup |
| Works for both new and existing emails | Additional cron job for cleanup |

**Recommendation**: Option A for existing completed accounts (redirect to sign-in), Option D for handling the onboarding-first flow (use pending table).

---

### 3. Dashboard Access After Onboarding

**Decision**: After users complete onboarding:
1. User enters email in Step 3
2. Redirect user through Clerk sign-up flow (with email pre-filled)
3. Clerk handles email verification
4. Once email is confirmed via Clerk, redirect to `/dashboard`
5. On dashboard load, trigger summary delivery

**Implementation Notes**:
- Store onboarding selections in session/localStorage before Clerk redirect
- Use Clerk's `signUp.create({ emailAddress })` with pre-filled email
- On successful Clerk auth, retrieve stored selections and persist to database
- Trigger summary generation/delivery after user creation

---

### 4. Sample Summaries on Verification

**Decision**: Search user's tickers in database for existing summaries. If cached summaries exist, deliver them. If not, generate summaries on-demand for the most recent 10-Q and Form-4 filings for each ticker.

**Implementation Flow**:
```
After Clerk Email Verification:
┌─────────────────────────────────────────────────────────────────┐
│ For each ticker in user.tickers:                                │
│   1. Query Summary table for existing 10-Q summaries            │
│   2. Query Summary table for existing Form-4 summaries          │
│                                                                 │
│   If cached summaries exist:                                    │
│     → Deliver cached summaries via email                        │
│                                                                 │
│   If no cached summaries:                                       │
│     → Fetch most recent 10-Q filing from SEC EDGAR              │
│     → Fetch most recent material Form-4 filing from SEC EDGAR   │
│     → Generate AI summaries on-demand                           │
│     → Store summaries in database                               │
│     → Deliver newly generated summaries via email               │
│                                                                 │
│ Display message: "10-Q and Form-4 summaries have been sent      │
│ for all your tracked tickers"                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Database Query Strategy**:
```sql
-- For each ticker, find most recent 10-Q summary
SELECT * FROM "Summary"
WHERE "tickerId" = :tickerId
  AND "filingType" = '10-Q'
ORDER BY "filingDate" DESC
LIMIT 1;

-- For each ticker, find most recent material Form-4 summary
SELECT * FROM "Summary"
WHERE "tickerId" = :tickerId
  AND "filingType" = '4'
  AND ("metadata"->>'isMaterial')::boolean = true
ORDER BY "filingDate" DESC
LIMIT 1;
```

**On-Demand Generation**:
- Use existing `summarizeFiling()` from [lib/ai/summarize.ts:581](lib/ai/summarize.ts#L581)
- Use existing SEC EDGAR client from [lib/sec-edgar/client.ts](lib/sec-edgar/client.ts)
- Queue generation jobs via [lib/email/async-email-queue.ts](lib/email/async-email-queue.ts) to avoid blocking

---

### 5. Existing User Merge - Detailed Analysis

**Scenario**: A user completes passwordless onboarding with email `user@example.com`, but that email already exists in the database from a previous Clerk sign-up.

**Current Database State for Existing Users**:
```
User table:
┌─────────────────────────────────────────────────────────────────┐
│ id        │ email            │ authProvider │ authProviderId    │
│ uuid-123  │ user@example.com │ clerk        │ clerk_user_abc    │
└─────────────────────────────────────────────────────────────────┘

Ticker table:
┌─────────────────────────────────────────────────────────────────┐
│ id        │ symbol │ userId    │ companyName                   │
│ ticker-1  │ AAPL   │ uuid-123  │ Apple Inc.                    │
│ ticker-2  │ TSLA   │ uuid-123  │ Tesla Inc.                    │
└─────────────────────────────────────────────────────────────────┘
```

**Scenario Branches**:

#### Branch A: User enters email during onboarding, email already exists with completed account
**Flow**:
1. User selects sectors → selects tickers → enters email
2. System checks: `SELECT * FROM "User" WHERE email = 'user@example.com'`
3. Result: User exists with `onboardingCompleted: true`
4. **Action**: Show message "You already have an account. Please sign in to access your dashboard."
5. Redirect to Clerk sign-in with pre-filled email
6. After sign-in, user sees their existing dashboard with original tickers

**What happens to newly selected tickers?**:
- Option A1: Discard them (simplest)
- Option A2: Store in session, offer to add after sign-in
- Option A3: Merge immediately after sign-in

#### Branch B: User enters email during onboarding, email exists with incomplete account
**Flow**:
1. User selects sectors → selects tickers → enters email
2. System checks: `SELECT * FROM "User" WHERE email = 'user@example.com'`
3. Result: User exists with `onboardingCompleted: false`
4. **Action**: Show message "You have a pending account. Would you like to continue where you left off or start fresh?"
5. "Continue" → Proceed to Clerk sign-up with existing tickers preserved
6. "Start Fresh" → Delete existing tickers, save new selections

#### Branch C: User enters email during onboarding, Clerk user exists but not in our database
**Flow**:
1. User selects sectors → selects tickers → enters email
2. System checks: No match in our User table
3. Redirect to Clerk sign-up with email pre-filled
4. Clerk detects existing account: "This email is already registered. Please sign in."
5. User signs in via Clerk
6. Clerk webhook or post-auth handler creates/updates User record
7. **Challenge**: How to associate pending tickers with the now-authenticated user?

**Solution for Branch C**:
- Store pending onboarding data in `PendingOnboarding` table with email as key
- After Clerk auth, query `PendingOnboarding` by email
- If found, merge tickers into User record, delete pending data

#### Branch D: User enters email during onboarding, completely new user
**Flow**:
1. User selects sectors → selects tickers → enters email
2. System checks: No match in User table
3. Store pending data: `INSERT INTO "PendingOnboarding" (email, sectors, tickers, createdAt)`
4. Redirect to Clerk sign-up with email pre-filled
5. User completes Clerk sign-up and email verification
6. Clerk webhook fires `user.created`
7. Webhook handler:
   - Check `PendingOnboarding` for matching email
   - If found: Create User with pending tickers, delete pending record
   - If not found: Create User with empty tickers (edge case: user cleared localStorage)
8. Redirect to dashboard, trigger summary delivery

**Required New Database Model**:
```prisma
model PendingOnboarding {
  id        String   @id @default(uuid())
  email     String   @unique
  sectors   String[]
  tickers   Json     // Array of {symbol, companyName}
  createdAt DateTime @default(now())
  expiresAt DateTime // Auto-cleanup after 24-48 hours

  @@index([email])
  @@index([expiresAt])
  @@schema("app")
}
```

**Cleanup Cron Job**:
- Run every 6 hours
- Delete `PendingOnboarding` records where `expiresAt < NOW()`
- Prevents accumulation of abandoned onboarding attempts

---

## Implementation Checklist

### Phase 1: Database & Schema Changes
- [ ] Create `PendingOnboarding` model in Prisma schema
- [ ] Run database migration
- [ ] Create cleanup cron job for expired pending records

### Phase 2: Onboarding UI Changes
- [ ] Add Step 3: Email input with validation
- [ ] Remove authentication requirement from onboarding page
- [ ] Add `/onboarding` to middleware public routes
- [ ] Implement email existence check API
- [ ] Store pending data before Clerk redirect

### Phase 3: Clerk Integration
- [ ] Pre-fill Clerk sign-up with email from Step 3
- [ ] Update Clerk webhook to check `PendingOnboarding` table
- [ ] Merge pending data on `user.created` event

### Phase 4: Summary Delivery
- [ ] Create summary lookup service for cached summaries
- [ ] Implement on-demand summary generation for missing filings
- [ ] Create "summaries sent" notification component
- [ ] Add summary delivery trigger on dashboard first load

### Phase 5: Testing
- [ ] Test new user flow end-to-end
- [ ] Test existing user conflict scenarios
- [ ] Test abandoned onboarding cleanup
- [ ] Test summary cache hit vs on-demand generation
- [ ] Load test on-demand generation for multiple tickers
