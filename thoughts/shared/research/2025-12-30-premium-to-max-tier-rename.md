---
date: 2025-12-30T16:11:10+11:00
researcher: Claude
git_commit: 91e9cd0871c1ed0893779923d5bc78bc90d5c3ac
branch: feature/landing-page-stripe-redesign
repository: tldrsec-ai
topic: "Premium to Max Tier Rename - Impact Analysis"
tags: [research, codebase, stripe, pricing, subscription, tier-rename]
status: complete
last_updated: 2025-12-30
last_updated_by: Claude
---

# Research: Premium to Max Tier Rename - Impact Analysis

**Date**: 2025-12-30 16:11:10 AEDT
**Researcher**: Claude
**Git Commit**: 91e9cd0871c1ed0893779923d5bc78bc90d5c3ac
**Branch**: feature/landing-page-stripe-redesign
**Repository**: tldrsec-ai

## Research Question
What files and locations need to be changed to rename the "Premium" tier to "Max"?

## Summary

The "PREMIUM" tier exists across **40+ distinct locations** in **17+ unique files** spanning:
- Database schema (Prisma enum)
- Stripe configuration
- TypeScript type definitions
- UI components
- API routes
- Test files
- Documentation

The rename requires coordinated changes across all layers, with the database enum being the most critical as it affects stored data.

---

## Detailed Findings

### 1. Database Schema (CRITICAL - Requires Migration)

**File**: `prisma/schema.prisma:736-742`
```prisma
enum PlanType {
  BASIC
  PROFESSIONAL
  PREMIUM        // ← Change to MAX

  @@schema("app")
}
```

**Impact**:
- `UserSubscription.planType` field uses this enum (line 214)
- `UsagePeriod.planType` field uses this enum (line 403)
- Requires database migration to rename enum value
- **Existing subscribers with `PREMIUM` planType must be migrated**

---

### 2. Stripe Configuration

**File**: `lib/stripe.ts`

| Location | Current | Change To |
|----------|---------|-----------|
| Line 39 (comment) | `$139 Premium` | `$139 Max` |
| Line 75 (object key) | `PREMIUM: {` | `MAX: {` |
| Line 76 | `name: 'Premium'` | `name: 'Max'` |
| Line 77 | `STRIPE_PREMIUM_MONTHLY_PRICE_ID` | `STRIPE_MAX_MONTHLY_PRICE_ID` |
| Line 78 | `STRIPE_PREMIUM_ANNUAL_PRICE_ID` | `STRIPE_MAX_ANNUAL_PRICE_ID` |
| Line 125 | `PREMIUM_LEGACY: {` | `MAX_LEGACY: {` |
| Line 126 | `name: 'Premium (Legacy)'` | `name: 'Max (Legacy)'` |
| Line 127 | `STRIPE_PREMIUM_PRICE_ID` | `STRIPE_MAX_PRICE_ID` |

**Type Definitions** (line 143):
```typescript
export type PlanType = keyof typeof SUBSCRIPTION_PLANS;
// Changes from 'FREE' | 'PRO' | 'PREMIUM' to 'FREE' | 'PRO' | 'MAX'
```

---

### 3. Environment Variables

| Current Variable | New Variable |
|------------------|--------------|
| `STRIPE_PREMIUM_MONTHLY_PRICE_ID` | `STRIPE_MAX_MONTHLY_PRICE_ID` |
| `STRIPE_PREMIUM_ANNUAL_PRICE_ID` | `STRIPE_MAX_ANNUAL_PRICE_ID` |
| `STRIPE_PREMIUM_PRICE_ID` | `STRIPE_MAX_PRICE_ID` |

**Files to update**:
- `.env` / `.env.local`
- `.env.example`
- Vercel environment variables
- `docs/plans/2025-12-30-landing-page-stripe-redesign.md` (lines 274-286)

---

### 4. UI Components

#### `components/dashboard/upgrade-cta-section.tsx`

| Line | Current | Change To |
|------|---------|-----------|
| 8 | `'FREE' \| 'PRO' \| 'PREMIUM'` | `'FREE' \| 'PRO' \| 'MAX'` |
| 19 | `currentPlan === 'PREMIUM'` | `currentPlan === 'MAX'` |
| 73 | `// PRO tier - upsell to Premium` | `// PRO tier - upsell to Max` |
| 80 | `Go Premium` | `Go Max` |
| 93 | `Start Premium - $139/mo` | `Start Max - $139/mo` |

#### `components/dashboard/subscription-status.tsx`

| Line | Current | Change To |
|------|---------|-----------|
| 30 | `'premium'` in type | `'max'` in type |
| 62-68 | `premium: { name: 'Premium', ... }` | `max: { name: 'Max', ... }` |

#### `components/billing/subscription-plans.tsx`

| Line | Current | Change To |
|------|---------|-----------|
| 48 | `PREMIUM: '$99'` | `MAX: '$99'` |

#### `components/landing/pricing-section.tsx`

| Line | Current | Change To |
|------|---------|-----------|
| 27 | `name: "Premium"` | `name: "Max"` |

#### `app/dashboard/billing/page.tsx`

| Line | Current | Change To |
|------|---------|-----------|
| 66 | `premium: { name: 'Premium', ... }` | `max: { name: 'Max', ... }` |
| 72 | `'Premium filing summaries'` | `'Max filing summaries'` |
| 85 | `'PREMIUM'` in type | `'MAX'` in type |

---

### 5. API Routes

#### `app/api/webhook/stripe/route.ts`

| Line | Current | Change To |
|------|---------|-----------|
| 117 | `PREMIUM: 1000` | `MAX: 1000` |
| 131 | `'PREMIUM'` in type cast | `'MAX'` in type cast |
| 137 | `'PREMIUM'` in type cast | `'MAX'` in type cast |

#### `app/api/user/subscription/route.ts`

| Line | Current | Change To |
|------|---------|-----------|
| 215 | `'PREMIUM'` in type cast | `'MAX'` in type cast |

---

### 6. Services

#### `services/filings/enhanced/subscriptionService.ts`

| Line | Current | Change To |
|------|---------|-----------|
| 33 | `'PREMIUM': 'minimal'` | `'MAX': 'minimal'` |
| 45 | `'minimal': 'PREMIUM'` | `'minimal': 'MAX'` |
| 93-107 | `premium: { name: 'Premium', ... }` | `max: { name: 'Max', ... }` |
| 97 | `'Premium filing summaries'` | `'Max filing summaries'` |
| 406 | `'PREMIUM': 'premium'` | `'MAX': 'max'` |

#### `lib/subscription/tickerSubscriptionInfo.ts`

| Line | Current | Change To |
|------|---------|-----------|
| 58 | `hasPremiumUsers: boolean` | `hasMaxUsers: boolean` |
| 62 | `premium: number` | `max: number` |
| 75 | `premium: 1.0` | `max: 1.0` |
| 84 | `premium: 5` | `max: 5` |
| 200 | `case 'PREMIUM':` | `case 'MAX':` |
| 201 | `tierCounts.premium++` | `tierCounts.max++` |
| 230 | `hasPremiumUsers: tierCounts.premium > 0` | `hasMaxUsers: tierCounts.max > 0` |
| 237 | `hasPremiumUsers` | `hasMaxUsers` |

#### `lib/cron/handlers/fetch-handler.ts`

| Line | Current | Change To |
|------|---------|-----------|
| 127 | `userTier === 'PREMIUM'` | `userTier === 'MAX'` |
| 302 | `userTier === 'PREMIUM'` | `userTier === 'MAX'` |

---

### 7. Validation Schemas

**File**: `lib/validation/subscription-validation.ts`

| Line | Current | Change To |
|------|---------|-----------|
| 10 | `z.enum(['BASIC', 'PROFESSIONAL', 'PREMIUM'])` | `z.enum(['BASIC', 'PROFESSIONAL', 'MAX'])` |
| 35 | `z.enum(['BASIC', 'PROFESSIONAL', 'PREMIUM'])` | `z.enum(['BASIC', 'PROFESSIONAL', 'MAX'])` |

---

### 8. Security (RBAC)

**File**: `lib/security/rbac.ts`

| Line | Current | Change To |
|------|---------|-----------|
| 19 | `PREMIUM_USER = 'premium_user'` | `MAX_USER = 'max_user'` |
| 120-146 | All `UserRole.PREMIUM_USER` references | `UserRole.MAX_USER` |

---

### 9. Test Files (9 files)

| File | Lines to Update |
|------|-----------------|
| `__tests__/config/stripe-pricing.test.ts` | 30-125 (all `PREMIUM` → `MAX`) |
| `__tests__/lib/subscription/tickerSubscriptionInfo.test.ts` | 51, 82, 122, 137, 162, 200, 315, 330, 347, 362 |
| `__tests__/services/filings/enhanced/subscriptionService.test.ts` | 440 |
| `__tests__/regression/tier-aware-backwards-compatibility.test.ts` | 206 |
| `__tests__/lib/security/security-comprehensive.test.ts` | 62, 78-95, 161, 260, 269 |
| `__tests__/lib/performance/performance-comprehensive.test.ts` | 303-304, 472 |
| `lib/ai/__tests__/openrouter-client-final.test.ts` | 483 |
| `lib/ai/__tests__/openrouter-client.test.ts` | 818 |
| `lib/ai/claude-client.test.ts` | 50-52 |

---

### 10. Documentation

| File | Updates Needed |
|------|----------------|
| `docs/plans/2025-12-30-landing-page-stripe-redesign.md` | Replace all "Premium" with "Max" |
| `thoughts/shared/research/2025-12-30-landing-page-stripe-redesign.md` | Replace all "Premium" with "Max" |
| `CLAUDE.md` | Any Premium tier references |

---

### 11. Backup Files (Optional)

| File | Lines |
|------|-------|
| `backup/stripe-implementation/subscription-status.tsx` | 30, 63 |
| `backup/stripe-implementation/subscriptionService.ts` | 97 |

---

## Complete File Reference List

### Core Configuration (4 files)
1. `prisma/schema.prisma:739` - Database enum
2. `lib/stripe.ts:75-92, 125-139` - Stripe config
3. `lib/validation/subscription-validation.ts:10, 35` - Zod schemas
4. `lib/security/rbac.ts:19, 122-146` - RBAC roles

### API Routes (2 files)
5. `app/api/webhook/stripe/route.ts:117, 131, 137`
6. `app/api/user/subscription/route.ts:215`

### Services (3 files)
7. `services/filings/enhanced/subscriptionService.ts:33, 45, 93-107, 406`
8. `lib/cron/handlers/fetch-handler.ts:127, 302`
9. `lib/subscription/tickerSubscriptionInfo.ts:58, 62, 75, 84, 200-201, 230, 237`

### UI Components (5 files)
10. `components/dashboard/upgrade-cta-section.tsx:8, 19, 73, 80, 93`
11. `components/dashboard/subscription-status.tsx:30, 62-68`
12. `components/billing/subscription-plans.tsx:48`
13. `components/landing/pricing-section.tsx:27`
14. `app/dashboard/billing/page.tsx:66-85`

### Test Files (9 files)
15. `__tests__/config/stripe-pricing.test.ts`
16. `__tests__/lib/subscription/tickerSubscriptionInfo.test.ts`
17. `__tests__/services/filings/enhanced/subscriptionService.test.ts`
18. `__tests__/regression/tier-aware-backwards-compatibility.test.ts`
19. `__tests__/lib/security/security-comprehensive.test.ts`
20. `__tests__/lib/performance/performance-comprehensive.test.ts`
21. `lib/ai/__tests__/openrouter-client-final.test.ts`
22. `lib/ai/__tests__/openrouter-client.test.ts`
23. `lib/ai/claude-client.test.ts`

### Documentation (2 files)
24. `docs/plans/2025-12-30-landing-page-stripe-redesign.md`
25. `thoughts/shared/research/2025-12-30-landing-page-stripe-redesign.md`

---

## Migration Strategy

### Phase 1: Database Migration
1. Create Prisma migration to rename `PREMIUM` → `MAX` in enum
2. Update all existing `UserSubscription` records
3. Update all existing `UsagePeriod` records

### Phase 2: Code Changes
1. Update `lib/stripe.ts` first (central config)
2. Update all TypeScript types and interfaces
3. Update UI components
4. Update API routes
5. Update services

### Phase 3: Environment Variables
1. Add new `STRIPE_MAX_*` variables
2. Keep old `STRIPE_PREMIUM_*` for backward compatibility
3. Remove old variables after verification

### Phase 4: Tests
1. Update all test files
2. Run full test suite

### Phase 5: Documentation
1. Update all markdown files
2. Update CLAUDE.md if needed

---

## Open Questions

1. **Stripe Products**: Should the Stripe product names also change from "Premium Monthly" to "Max Monthly"?
2. **Legacy Users**: How to handle existing subscribers who see "Premium" in their Stripe dashboard?
3. **Email Templates**: Are there any email templates that mention "Premium" tier?
4. **Analytics**: Any analytics events tracking "premium" tier?

---

## Related Research

- [2025-12-30-landing-page-stripe-redesign.md](thoughts/shared/research/2025-12-30-landing-page-stripe-redesign.md) - Original implementation plan
