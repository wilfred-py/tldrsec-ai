# Remove Budget System and Add OpenRouter Credit Monitoring

**Date**: 2026-01-02T14:31:46 AEDT
**Git Commit**: 0c78e435f929b942af436089ca125fc56693df72
**Branch**: feature/inline-ticker-search-keyboard-nav
**Repository**: tldrsec-ai

## ✅ IMPLEMENTATION COMPLETE - 2026-01-02

All 5 phases completed successfully:

| Phase | Status | Description |
|-------|--------|-------------|
| 1 | ✅ Complete | Database migration - budget fields removed from schema |
| 2 | ✅ Complete | Budget logic removed from cron system |
| 3 | ✅ Complete | OpenRouter credit check added to Slack reports |
| 4 | ✅ Complete | Insufficient credits error detection added |
| 5 | ✅ Complete | Cleanup and verification |

### Key Changes Made:
- Removed `budgetUsed`, `processingBudget`, `budgetResetAt`, `dailyProcessingBudget`, `dailyBudgetResetAt` from User model
- Created new `lib/ai/openrouter-credit-monitor.ts` with credit status checking and alerts
- Added `AI_INSUFFICIENT_CREDITS` error code to error handling system
- Updated OpenRouter client to detect 402 errors and send Slack alerts
- Removed budget reset logic from cron system
- Updated TierStatusWidget to remove budget display
- Build passes successfully

### Remaining Cleanup (Test Files):
Some test files still reference budget fields (mostly in mock data). Key files updated:
- `__tests__/app/api/cron/tier-aware/route.test.ts` - Cleaned up mock data and removed budget tests
- `__tests__/security/budget-manipulation.test.ts` - Replaced with deprecation notice
- `__tests__/lib/monitoring/pipeline-health-monitor.test.ts` - Updated cost management tests
- `__tests__/cron/comprehensive-cron-integration.test.ts` - Replaced budget tests with placeholder
- `__tests__/lib/db/concurrency.test.ts` - Updated budget test expectations

Files with remaining budget field references in mock data (low priority - tests still pass):
- `__tests__/transaction-deadlock-fix.test.ts`
- `__tests__/lib/monitoring/pipeline-error-detector.test.ts`
- `__tests__/debug-single-cron-test.test.ts`
- `__tests__/regression/tier-aware-backwards-compatibility.test.ts`
- `__tests__/monitoring/edge-case-boundaries.test.ts`
- `__tests__/debug-cron.test.ts`
- `__tests__/transaction-safety/*.test.ts` files

---

## Overview

Remove the broken internal budget tracking system and replace it with direct OpenRouter credit monitoring. The current `budgetUsed` field is storing values in micro-dollars (cost × 1,000,000) but all comparison logic uses dollars, creating a 1,000,000× scale mismatch that blocks users after their first summary.

**Problem**: User shows $988,316 budget used, but actual OpenRouter spend is only $35.69.

**Solution**: Delete the broken budget system entirely. OpenRouter already tracks credits accurately - we just need to monitor them and alert when low.

## Current State Analysis

### The Bug (Root Cause)
- [summarize-cached-handler.ts:501-512](lib/cron/handlers/summarize-cached-handler.ts#L501-L512): Stores cost in micro-dollars
  ```typescript
  const costInMicroDollars = Math.round((summaryResult.cost || 0) * 1000000);
  await prisma.user.update({
    where: { id: userId },
    data: { budgetUsed: { increment: costInMicroDollars } }
  });
  ```
- [tier-eligibility.ts:99-106](lib/cron/tier-eligibility.ts#L99-L106): Compares against dollar limits
  ```typescript
  const dailyLimit = CronBudgetService.getDailyCostLimit(eligibility.tier); // Returns $2 or $10
  const budgetPercentUsed = dailyLimit > 0 ? (user.budgetUsed / dailyLimit) * 100 : 0;
  // Result: 988316 / 2.00 * 100 = 49,415,800% - user blocked!
  ```

### What Slack Reports Currently Show
Both DAILY and 10-MINUTE reports include:
- Filing pipeline status (Discovery → Fetch → Summarize → Email)
- AI costs from `Summary.totalCost` (database-tracked, not actual OpenRouter usage)
- **Missing**: Actual OpenRouter credit balance/usage
- **Missing**: User budget warnings
- **Missing**: Credit-specific error alerts

### Key Discoveries
- `processingBudget` field: **Never used anywhere** - dead code
- `budgetUsed` field: Broken (stores micro-dollars, compared as dollars)
- `budgetResetAt` field: Used by budget reset logic that will be removed
- OpenRouter API provides accurate usage: $35.69 (not the $988K in database)
- 397 filings are unprocessed because users are incorrectly blocked

## Desired End State

After implementation:
1. **No internal budget tracking** - OpenRouter is the source of truth
2. **Daily Slack reports include OpenRouter credit status** with warning if < $10
3. **Immediate Slack alert when "insufficient credits" error occurs**
4. **All 397 pending filings resume processing** within 24 hours
5. **Database schema simplified** - 4 fewer fields on User model

### Verification
```bash
# 1. Database migration applied
npm run db:migrate

# 2. No budget-related blocking in cron
curl -X POST https://tldrsec.app/api/cron/tier-aware \
  -H "Authorization: Bearer $CRON_SECRET" | jq '.usersProcessed'

# 3. OpenRouter credit check in Slack reports
# Check Slack #pipeline-monitor channel for credit balance

# 4. Pending filings processing
npm run test:pipeline:analyze | grep "Unprocessed filings"
# Should show 0 (or only new ones from today)
```

## What We're NOT Doing

1. **NOT adding per-user spending limits** - OpenRouter handles this globally
2. **NOT tracking costs per-user** - Summary.totalCost already does this for analytics
3. **NOT building a billing system** - Out of scope
4. **NOT changing tier frequencies** - Only removing budget blocking
5. **NOT modifying the Summary cost tracking** - That's working correctly

## Implementation Approach

Applying Elon's 5-Step Algorithm:
1. **Question**: Why track budget internally when OpenRouter does it accurately?
2. **Delete**: Remove all budget-related fields and logic
3. **Simplify**: Single source of truth (OpenRouter API)
4. **Accelerate**: Small, focused phases with immediate testing
5. **Automate**: Add credit check to existing daily report automation

---

## Phase 1: Database Migration - Remove Budget Fields

### Overview
Remove the four budget-related fields from the User model and create a migration.

### Step 1.1: Write Failing Tests

**Test File**: `__tests__/migrations/remove-budget-fields.test.ts`

```typescript
import { PrismaClient } from '@prisma/client';

describe('Budget Fields Removal Migration', () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = new PrismaClient();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should not have processingBudget field on User model', async () => {
    const user = await prisma.user.findFirst();
    expect(user).not.toHaveProperty('processingBudget');
  });

  it('should not have budgetUsed field on User model', async () => {
    const user = await prisma.user.findFirst();
    expect(user).not.toHaveProperty('budgetUsed');
  });

  it('should not have budgetResetAt field on User model', async () => {
    const user = await prisma.user.findFirst();
    expect(user).not.toHaveProperty('budgetResetAt');
  });

  it('should not have dailyProcessingBudget field on User model', async () => {
    const user = await prisma.user.findFirst();
    expect(user).not.toHaveProperty('dailyProcessingBudget');
  });

  it('should not have dailyBudgetResetAt field on User model', async () => {
    const user = await prisma.user.findFirst();
    expect(user).not.toHaveProperty('dailyBudgetResetAt');
  });
});
```

**Checkpoint 1.1**: Tests fail because fields still exist
```bash
npm run test -- --testPathPattern="remove-budget-fields"
# Expected: 5 failing tests
```

### Step 1.2: Implement Migration

#### 1.2.1 Update Prisma Schema
**File**: `prisma/schema.prisma`
**Changes**: Remove lines 34-38 from User model

```diff
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
  lastProcessedAt       DateTime?
  lastCronProcessed     DateTime?
-  processingBudget      Int                    @default(0)
-  budgetUsed            Int                    @default(0)
-  budgetResetAt         DateTime?
-  dailyProcessingBudget Int                    @default(0)
-  dailyBudgetResetAt    DateTime?
  tierProcessingCount   Int                    @default(0)
  lastTierUpgrade       DateTime?
  // ... rest of model
```

#### 1.2.2 Generate Migration
```bash
npx prisma migrate dev --name remove_budget_fields
```

**Checkpoint 1.2.2**: Migration file created
```bash
ls -la prisma/migrations/ | tail -1
# Expected: New migration folder with remove_budget_fields
```

#### 1.2.3 Apply Migration
```bash
npm run db:migrate
```

**Checkpoint 1.2.3**: All tests pass
```bash
npm run test -- --testPathPattern="remove-budget-fields"
# Expected: 5 passing tests
```

### Step 1.3: Refactor - Regenerate Prisma Client

```bash
npm run db:generate
npm run build
```

**Checkpoint 1.3**: Build succeeds without budget field references
```bash
npm run build 2>&1 | grep -i "budget"
# Expected: No errors related to budget fields
```

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [ ] Migration applied: `npm run db:migrate`
- [ ] Schema generated: `npm run db:generate`
- [ ] Build succeeds: `npm run build`
- [ ] Tests pass: `npm run test -- --testPathPattern="remove-budget-fields"`

#### Manual Verification:
- [ ] Prisma Studio shows User model without budget fields
- [ ] Database table `app."User"` has columns removed

**STOP**: Await manual confirmation before Phase 2.

---

## Phase 2: Remove Budget Logic from Cron System

### Overview
Remove all budget checking, updating, and blocking logic from the cron processing pipeline.

### Step 2.1: Write Failing Tests

**Test File**: `__tests__/cron/no-budget-blocking.test.ts`

```typescript
import { getUserProcessingStatuses, getEligibleUsers } from '@/lib/cron/tier-eligibility';

describe('Tier Eligibility - No Budget Blocking', () => {
  it('should not have budgetPercentUsed in ProcessingEligibility', () => {
    const mockUser = {
      id: 'test-user',
      subscriptionTier: 'HOBBY',
      lastProcessedAt: null,
      // Note: no budgetUsed field
    };

    const statuses = getUserProcessingStatuses([mockUser]);
    expect(statuses[0]).not.toHaveProperty('budgetPercentUsed');
    expect(statuses[0]).not.toHaveProperty('isWithinBudget');
  });

  it('should not filter users based on budget in getEligibleUsers', () => {
    const mockStatuses = [
      {
        userId: 'user-1',
        isEligible: true,
        tier: 'HOBBY' as const,
        frequencyMs: 7200000,
        timeSinceLastProcess: 8000000,
        nextEligibleTime: null,
        priority: 1,
      },
    ];

    // With old system, respectBudgetLimits would filter this out
    const eligible = getEligibleUsers(mockStatuses, { respectBudgetLimits: true });
    expect(eligible).toHaveLength(1);
  });

  it('should not require budgetUsed in UserForEligibility interface', () => {
    // This test verifies the interface change at compile time
    const user: Parameters<typeof getUserProcessingStatuses>[0][0] = {
      id: 'test',
      subscriptionTier: 'PRO',
      lastProcessedAt: new Date(),
    };
    expect(user).toBeDefined();
  });
});
```

**Checkpoint 2.1**: Tests fail due to budget properties still existing
```bash
npm run test -- --testPathPattern="no-budget-blocking"
# Expected: TypeScript compilation errors and test failures
```

### Step 2.2: Implement Changes

#### 2.2.1 Update tier-eligibility.ts
**File**: `lib/cron/tier-eligibility.ts`

Remove budget-related imports, interfaces, and logic:

```typescript
/**
 * Tier-based processing eligibility - simplified
 * SEC filings are published 24/7, so we always use the same frequency per tier.
 */

// Remove: import { CronBudgetService } from './budget-service';

const TIER_FREQUENCIES = {
  PRO: parseInt(process.env.PRO_MARKET_FREQUENCY || '5') * 60 * 1000,
  HOBBY: parseInt(process.env.HOBBY_MARKET_FREQUENCY || '120') * 60 * 1000
} as const;

const TIER_PRIORITIES = {
  PRO: parseInt(process.env.PRO_PRIORITY || '2'),
  HOBBY: parseInt(process.env.HOBBY_PRIORITY || '1')
} as const;

export type NormalizedTier = 'PRO' | 'HOBBY';

// Simplified interface - no budget fields
export interface ProcessingEligibility {
  isEligible: boolean;
  tier: NormalizedTier;
  frequencyMs: number;
  timeSinceLastProcess: number | null;
  nextEligibleTime: Date | null;
}

export interface UserProcessingStatus extends ProcessingEligibility {
  userId: string;
  priority: number;
}

// Simplified interface - no budgetUsed
interface UserForEligibility {
  id: string;
  subscriptionTier: string;
  lastProcessedAt: Date | null;
}

export function calculateProcessingEligibility(
  tier: string,
  lastProcessedAt: Date | null
): ProcessingEligibility {
  // Simplified tier normalization inline
  const normalizedTier: NormalizedTier =
    tier === 'PRO' || tier === 'PROFESSIONAL' ? 'PRO' : 'HOBBY';
  const frequencyMs = TIER_FREQUENCIES[normalizedTier];
  const now = Date.now();

  if (!lastProcessedAt) {
    return {
      isEligible: true,
      tier: normalizedTier,
      frequencyMs,
      timeSinceLastProcess: null,
      nextEligibleTime: null,
    };
  }

  const lastProcessedTime = lastProcessedAt.getTime();
  const timeSinceLastProcess = now - lastProcessedTime;
  const isEligible = timeSinceLastProcess >= frequencyMs;

  return {
    isEligible,
    tier: normalizedTier,
    frequencyMs,
    timeSinceLastProcess,
    nextEligibleTime: isEligible ? null : new Date(lastProcessedTime + frequencyMs),
  };
}

export function getUserProcessingStatuses(
  users: UserForEligibility[]
): UserProcessingStatus[] {
  const statuses = users.map(user => {
    const eligibility = calculateProcessingEligibility(
      user.subscriptionTier,
      user.lastProcessedAt
    );

    return {
      userId: user.id,
      ...eligibility,
      priority: TIER_PRIORITIES[eligibility.tier]
    };
  });

  return statuses.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    if (a.timeSinceLastProcess === null) return -1;
    if (b.timeSinceLastProcess === null) return 1;
    return b.timeSinceLastProcess - a.timeSinceLastProcess;
  });
}

export function getEligibleUsers(
  userStatuses: UserProcessingStatus[],
  options: { maxUsersPerCycle?: number } = {}
): UserProcessingStatus[] {
  const { maxUsersPerCycle = 500 } = options;

  // Simply filter by eligibility - no budget checks
  const eligibleUsers = userStatuses.filter(user => user.isEligible);
  return eligibleUsers.slice(0, maxUsersPerCycle);
}

export function getTierDistribution(
  userStatuses: UserProcessingStatus[]
): Record<NormalizedTier, { total: number; eligible: number }> {
  const distribution: Record<NormalizedTier, { total: number; eligible: number }> = {
    PRO: { total: 0, eligible: 0 },
    HOBBY: { total: 0, eligible: 0 }
  };

  for (const user of userStatuses) {
    distribution[user.tier].total++;
    if (user.isEligible) distribution[user.tier].eligible++;
  }

  return distribution;
}
```

**Checkpoint 2.2.1**: First test passes
```bash
npm run test -- --testPathPattern="no-budget-blocking" --testNamePattern="budgetPercentUsed"
# Expected: 1 passing
```

#### 2.2.2 Update summarize-cached-handler.ts
**File**: `lib/cron/handlers/summarize-cached-handler.ts`

Remove lines 500-519 (budget update logic):

```diff
    // ... email sending code above ...

-    // Update user's budget usage
-    // Note: budgetUsed is stored as Int (in micro-dollars, multiply cost by 1,000,000)
-    try {
-      const costInMicroDollars = Math.round((summaryResult.cost || 0) * 1000000);
-      await prisma.user.update({
-        where: { id: userId },
-        data: {
-          budgetUsed: {
-            increment: costInMicroDollars
-          },
-          lastProcessedAt: new Date()
-        }
-      });
-    } catch (budgetError) {
-      summarizeLogger.error(`[${executionId}] Failed to update user budget`, {
-        userId,
-        cost: summaryResult.cost,
-        error: budgetError instanceof Error ? budgetError.message : 'Unknown error'
-      });
-    }
+    // Update lastProcessedAt timestamp only
+    try {
+      await prisma.user.update({
+        where: { id: userId },
+        data: { lastProcessedAt: new Date() }
+      });
+    } catch (updateError) {
+      summarizeLogger.error(`[${executionId}] Failed to update lastProcessedAt`, {
+        userId,
+        error: updateError instanceof Error ? updateError.message : 'Unknown error'
+      });
+    }

    const totalDuration = Date.now() - startTime;
    // ... rest of handler
```

**Checkpoint 2.2.2**: Build passes
```bash
npm run build
# Expected: No budget-related TypeScript errors
```

#### 2.2.3 Delete budget-service.ts (if no other dependencies)
**File**: `lib/cron/budget-service.ts`

First check for dependencies:
```bash
grep -r "CronBudgetService\|budget-service" lib/ app/ --include="*.ts" | grep -v ".test.ts"
```

If only used by tier-eligibility.ts (now removed), delete the file.

**Checkpoint 2.2.3**: No dangling imports
```bash
npm run build
# Expected: Clean build
```

#### 2.2.4 Update budget-operations.ts
**File**: `lib/db/budget-operations.ts`

Either delete or simplify to remove User.budgetUsed references.

**Checkpoint 2.2.4**: All tests pass
```bash
npm run test -- --testPathPattern="no-budget-blocking"
# Expected: 3 passing tests
```

### Step 2.3: Refactor

- [ ] Remove unused imports across cron files
- [ ] Update any JSDoc comments mentioning budget
- [ ] Remove `respectBudgetLimits` option from getEligibleUsers callers

**Checkpoint 2.3**: Lint passes
```bash
npm run lint
# Expected: No errors
```

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [ ] Build succeeds: `npm run build`
- [ ] Lint passes: `npm run lint`
- [ ] Unit tests pass: `npm run test`
- [ ] Cron tests pass: `npm run test:cron-comprehensive`
- [ ] No budget references: `grep -r "budgetUsed\|processingBudget" lib/ app/ --include="*.ts" | wc -l` returns 0

#### Manual Verification:
- [ ] Trigger cron manually and verify users are processed
- [ ] Check logs for any budget-related errors

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: Add OpenRouter Credit Check to Slack Reports

### Overview
Add actual OpenRouter credit balance to daily and interval Slack reports. Alert if credits are below threshold.

### Step 3.1: Write Failing Tests

**Test File**: `__tests__/slack/openrouter-credit-check.test.ts`

```typescript
import { getOpenRouterCreditStatus } from '@/lib/slack/openrouter-credit-checker';

// Mock fetch for OpenRouter API
global.fetch = jest.fn();

describe('OpenRouter Credit Checker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return credit status from OpenRouter API', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          usage: 35.69,
          limit: null,
          is_free_tier: false,
        }
      })
    });

    const status = await getOpenRouterCreditStatus();

    expect(status).toEqual({
      totalUsage: 35.69,
      limit: null,
      isFreeeTier: false,
      isLow: false,
      warningThreshold: 10,
    });
  });

  it('should flag isLow when remaining credits below threshold', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          usage: 95,
          limit: 100,
          is_free_tier: false,
        }
      })
    });

    const status = await getOpenRouterCreditStatus();

    expect(status.isLow).toBe(true);
  });

  it('should handle API errors gracefully', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized'
    });

    const status = await getOpenRouterCreditStatus();

    expect(status.error).toBe('OpenRouter API error: 401 Unauthorized');
  });
});
```

**Checkpoint 3.1**: Tests fail - module doesn't exist
```bash
npm run test -- --testPathPattern="openrouter-credit-check"
# Expected: Cannot find module error
```

### Step 3.2: Implement Credit Checker

#### 3.2.1 Create OpenRouter Credit Checker
**File**: `lib/slack/openrouter-credit-checker.ts`

```typescript
/**
 * OpenRouter Credit Status Checker
 *
 * Calls OpenRouter /api/v1/auth/key endpoint to get actual credit usage.
 * Used by Slack reports to show real spending and alert when low.
 */

interface OpenRouterCreditStatus {
  totalUsage: number;
  limit: number | null;
  isFreeTier: boolean;
  isLow: boolean;
  warningThreshold: number;
  remaining?: number;
  error?: string;
}

interface OpenRouterKeyResponse {
  data: {
    usage: number;
    usage_daily?: number;
    usage_weekly?: number;
    usage_monthly?: number;
    limit?: number | null;
    is_free_tier: boolean;
  };
}

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/auth/key';
const WARNING_THRESHOLD = parseFloat(process.env.OPENROUTER_CREDIT_WARNING_THRESHOLD || '50');

export async function getOpenRouterCreditStatus(): Promise<OpenRouterCreditStatus> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return {
      totalUsage: 0,
      limit: null,
      isFreeTier: false,
      isLow: false,
      warningThreshold: WARNING_THRESHOLD,
      error: 'OPENROUTER_API_KEY not configured',
    };
  }

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      return {
        totalUsage: 0,
        limit: null,
        isFreeTier: false,
        isLow: false,
        warningThreshold: WARNING_THRESHOLD,
        error: `OpenRouter API error: ${response.status} ${response.statusText}`,
      };
    }

    const data: OpenRouterKeyResponse = await response.json();

    const totalUsage = data.data.usage || 0;
    const limit = data.data.limit ?? null;
    const isFreeTier = data.data.is_free_tier || false;

    // Calculate remaining if limit is set
    const remaining = limit !== null ? limit - totalUsage : undefined;

    // isLow: if limit set and remaining < threshold, OR if no limit but we want to warn anyway
    const isLow = remaining !== undefined && remaining < WARNING_THRESHOLD;

    return {
      totalUsage,
      limit,
      isFreeTier,
      isLow,
      warningThreshold: WARNING_THRESHOLD,
      remaining,
    };
  } catch (error) {
    return {
      totalUsage: 0,
      limit: null,
      isFreeTier: false,
      isLow: false,
      warningThreshold: WARNING_THRESHOLD,
      error: `Failed to fetch OpenRouter status: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
```

**Checkpoint 3.2.1**: First two tests pass
```bash
npm run test -- --testPathPattern="openrouter-credit-check" --testNamePattern="should return\|should flag"
# Expected: 2 passing
```

#### 3.2.2 Integrate into Daily Report Handler
**File**: `lib/slack/daily-report-handler.ts`

Add credit status to report generation:

```typescript
import { getOpenRouterCreditStatus } from './openrouter-credit-checker';

// In generateDailyReport function, after getAiCostBreakdown:
const openRouterStatus = await getOpenRouterCreditStatus();

// Pass to message formatter
return {
  // ... existing fields
  openRouterStatus,
};
```

**Checkpoint 3.2.2**: Build succeeds
```bash
npm run build
# Expected: No errors
```

#### 3.2.3 Update Message Formatter
**File**: `lib/slack/message-formatter.ts`

Add OpenRouter credit section to report:

```typescript
// After AI COSTS section, add:
function formatOpenRouterCreditSection(status: OpenRouterCreditStatus): string {
  const lines: string[] = [];

  lines.push(':bank: *OPENROUTER CREDIT STATUS*');
  lines.push('```');
  lines.push(`Total Usage:     $${status.totalUsage.toFixed(2)}`);

  if (status.limit !== null) {
    lines.push(`Credit Limit:    $${status.limit.toFixed(2)}`);
    lines.push(`Remaining:       $${status.remaining?.toFixed(2) || 'N/A'}`);
  } else {
    lines.push(`Credit Limit:    No limit set`);
  }

  if (status.isLow) {
    lines.push(`⚠️ WARNING: Credits below $${status.warningThreshold} threshold!`);
  }

  if (status.error) {
    lines.push(`Error: ${status.error}`);
  }

  lines.push('```');

  return lines.join('\n');
}
```

**Checkpoint 3.2.3**: All tests pass
```bash
npm run test -- --testPathPattern="openrouter-credit-check"
# Expected: 3 passing tests
```

### Step 3.3: Refactor

- [ ] Add JSDoc comments to new functions
- [ ] Ensure consistent error handling
- [ ] Add logging for credit check failures

**Checkpoint 3.3**: Lint passes
```bash
npm run lint
# Expected: No errors
```

### Step 3.4: Final Phase Verification

#### Automated Verification:
- [ ] Build succeeds: `npm run build`
- [ ] Credit checker tests pass: `npm run test -- --testPathPattern="openrouter-credit-check"`
- [ ] All tests pass: `npm run test`

#### Manual Verification:
- [ ] Trigger daily report manually and check Slack for credit section
- [ ] Verify credit values match OpenRouter dashboard

**STOP**: Await manual confirmation before Phase 4.

---

## Phase 4: Add Insufficient Credits Error Detection

### Overview
Detect "insufficient credits" errors from OpenRouter and send immediate Slack alert.

### Step 4.1: Write Failing Tests

**Test File**: `__tests__/ai/openrouter-credit-error-detection.test.ts`

```typescript
import { normalizeError, isInsufficientCreditsError } from '@/lib/ai/openrouter-client';
import { ApiError } from '@/lib/error-handling/types';

describe('OpenRouter Insufficient Credits Detection', () => {
  it('should detect insufficient credits error from 402 status', () => {
    const error = new Error('OpenRouter API error: 402 Payment Required - insufficient credits');
    const result = isInsufficientCreditsError(error);
    expect(result).toBe(true);
  });

  it('should detect insufficient credits from error message', () => {
    const error = new Error('Your account has insufficient credits');
    const result = isInsufficientCreditsError(error);
    expect(result).toBe(true);
  });

  it('should create specific error type for insufficient credits', () => {
    const error = new Error('402 insufficient credits');
    const normalized = normalizeError(error, 'test-request-id');

    expect(normalized).toBeInstanceOf(ApiError);
    expect(normalized.code).toBe('AI_INSUFFICIENT_CREDITS');
    expect(normalized.isRetriable).toBe(false);
  });

  it('should not flag other errors as insufficient credits', () => {
    const error = new Error('429 rate limit exceeded');
    const result = isInsufficientCreditsError(error);
    expect(result).toBe(false);
  });
});
```

**Checkpoint 4.1**: Tests fail - functions don't exist
```bash
npm run test -- --testPathPattern="credit-error-detection"
# Expected: Cannot find isInsufficientCreditsError
```

### Step 4.2: Implement Credit Error Detection

#### 4.2.1 Update error-handling constants
**File**: `lib/error-handling/constants.ts`

Add new error code:

```typescript
export const ErrorCodes = {
  // ... existing codes
  AI_INSUFFICIENT_CREDITS: 'AI_INSUFFICIENT_CREDITS',
} as const;
```

#### 4.2.2 Update OpenRouter Client
**File**: `lib/ai/openrouter-client.ts`

Add credit error detection:

```typescript
/**
 * Check if error indicates insufficient credits
 */
export function isInsufficientCreditsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return (
    message.includes('insufficient credits') ||
    message.includes('insufficient balance') ||
    message.includes('402') ||
    message.includes('payment required') ||
    message.includes('quota exhausted') ||
    message.includes('credit limit')
  );
}

// Update normalizeError method to detect credit errors:
private normalizeError(error: unknown, requestId?: string): ApiError {
  // ... existing code ...

  // Add before the 401 check:
  if (isInsufficientCreditsError(error)) {
    return createAiInsufficientCreditsError(
      `OpenRouter API insufficient credits: ${message}`,
      { originalError: message },
      requestId
    );
  }

  // ... rest of method
}
```

#### 4.2.3 Add Slack Alert for Credit Error
**File**: `lib/ai/openrouter-client.ts`

In the catch block of sendMessage:

```typescript
} catch (error) {
  // ... existing logging ...

  // Alert immediately for insufficient credits
  if (isInsufficientCreditsError(error)) {
    await postInsufficientCreditsAlert(error);
  }

  throw this.normalizeError(error, requestId);
}
```

#### 4.2.4 Create Alert Function
**File**: `lib/slack/credit-alert.ts`

```typescript
import { postMessage } from './webhook-service';

export async function postInsufficientCreditsAlert(error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);

  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '🚨 OPENROUTER CREDITS EXHAUSTED',
        emoji: true,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          '*Pipeline processing has stopped due to insufficient OpenRouter credits.*',
          '',
          `Error: \`${message}\``,
          '',
          '*Action Required:*',
          '1. Top up credits at https://openrouter.ai/account',
          '2. Processing will resume automatically on next cron cycle',
        ].join('\n'),
      },
    },
  ];

  await postMessage({
    text: '🚨 OpenRouter credits exhausted - pipeline stopped',
    blocks,
  });
}
```

**Checkpoint 4.2**: All tests pass
```bash
npm run test -- --testPathPattern="credit-error-detection"
# Expected: 4 passing tests
```

### Step 4.3: Refactor

- [ ] Ensure alert only fires once per incident (debounce)
- [ ] Add structured logging for credit errors

**Checkpoint 4.3**: Lint and build pass
```bash
npm run lint && npm run build
# Expected: No errors
```

### Step 4.4: Final Phase Verification

#### Automated Verification:
- [ ] Build succeeds: `npm run build`
- [ ] Credit detection tests pass: `npm run test -- --testPathPattern="credit-error-detection"`
- [ ] All tests pass: `npm run test`

#### Manual Verification:
- [ ] (Optional) Temporarily use invalid API key to trigger error and verify Slack alert

**STOP**: Await manual confirmation before final verification.

---

## Phase 5: Cleanup and Final Verification

### Overview
Remove any remaining budget-related code and run comprehensive tests.

### Step 5.1: Code Cleanup

1. Search for any remaining budget references:
   ```bash
   grep -r "budget" lib/ app/ components/ --include="*.ts" --include="*.tsx" | grep -v test
   ```

2. Update any tests that mock budget fields
3. Remove budget-related environment variables from documentation

### Step 5.2: Final Verification

#### Automated Verification:
- [ ] Full build: `npm run build`
- [ ] All unit tests: `npm run test`
- [ ] Pipeline comprehensive: `npm run test:pipeline:comprehensive`
- [ ] E2E test: `npm run test:e2e`
- [ ] Cron comprehensive: `npm run test:cron-comprehensive`

#### Manual Verification:
- [ ] Check Slack #pipeline-monitor for credit status in reports
- [ ] Verify no users are blocked from processing
- [ ] Confirm 397 unprocessed filings start processing within 24h

---

## Testing Strategy

### TDD Test Design Principles

1. **One Assertion Per Test**: Each test verifies one behavior
2. **Descriptive Names**: "should [verb] when [condition]"
3. **Arrange-Act-Assert**: Clear structure
4. **Test Behavior, Not Implementation**: Focus on inputs/outputs

### Test Categories

#### 1. Migration Tests (Phase 1)
- Verify schema changes applied correctly
- Check field removal from database

#### 2. Logic Removal Tests (Phase 2)
- Verify no budget blocking
- Check eligibility calculation without budget

#### 3. Integration Tests (Phases 3-4)
- OpenRouter API integration
- Slack alert delivery

#### 4. Regression Tests (Phase 5)
- Existing pipeline continues working
- No performance degradation

---

## Performance Considerations

- **Reduced database queries**: No longer querying/updating budgetUsed on every summary
- **Simpler eligibility check**: Removed budget calculation from hot path
- **Single API call per report**: OpenRouter credit check is cached per report generation

---

## Migration Notes

### Database Migration
The migration will:
1. Remove 5 columns from `app."User"` table
2. No data preservation needed (data is incorrect anyway)
3. Rollback possible by adding columns back with defaults

### Environment Variables
No new required variables. Optional:
- `OPENROUTER_CREDIT_WARNING_THRESHOLD` - Default: 50 (dollars)

---

## References

- Research: [thoughts/shared/research/2026-01-02-openrouter-budget-discrepancy.md](../../thoughts/shared/research/2026-01-02-openrouter-budget-discrepancy.md)
- Budget update bug: [lib/cron/handlers/summarize-cached-handler.ts:501-512](../../lib/cron/handlers/summarize-cached-handler.ts#L501-L512)
- Budget check bug: [lib/cron/tier-eligibility.ts:99-106](../../lib/cron/tier-eligibility.ts#L99-L106)
- Slack report handler: [lib/slack/daily-report-handler.ts](../../lib/slack/daily-report-handler.ts)
- OpenRouter client: [lib/ai/openrouter-client.ts](../../lib/ai/openrouter-client.ts)
