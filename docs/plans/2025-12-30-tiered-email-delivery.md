# Tiered Email Delivery Implementation Plan

**Date**: 2025-12-30T16:24:00+11:00
**Git Commit**: 91e9cd0871c1ed0893779923d5bc78bc90d5c3ac
**Branch**: feature/landing-page-stripe-redesign
**Repository**: tldrsec-ai

## Overview

Implement tier-based email delivery timing where PREMIUM users receive real-time emails immediately when summaries are generated (all users simultaneously), while FREE and PRO users receive weekly digest emails on Sundays at 9 AM UTC.

## Current State Analysis

### Tier System
- **Stripe Plans**: FREE / PRO / PREMIUM
- **Operational Tiers**: HOBBY / PRO (internal processing)
- **Mapping**: `CronBudgetService.normalizeTier()` in [lib/cron/budget-service.ts:26-46](lib/cron/budget-service.ts#L26-L46)

### Current Email Delivery
- ALL tiers receive emails immediately after summary generation
- Emails sent synchronously in `summarize-cached-handler.ts` (lines 185, 298, 445)
- No tier-based email timing differentiation exists
- Users tracking same ticker receive emails ~5 minutes apart (job queue processing gap)

### Existing Infrastructure
- `DigestService` exists for daily digests ([lib/email/digest-service.ts](lib/email/digest-service.ts))
- `NotificationPreference` type includes `'WEEKLY'` but not implemented
- Job queue supports `scheduledFor` for delayed execution
- Async email queue exists with scheduling support

### Key Discoveries
- Email sending happens in 3 places in `summarize-cached-handler.ts`:
  - Line 185: Existing summary path
  - Line 298: Shared summary (cache hit) path
  - Line 445: New AI summary path
- `SummaryEmailDelivery` table tracks per-user email delivery
- Summary sharing works: same content shared across users, but emails sent at different times

## Desired End State

| Tier | Email Delivery | Timing |
|------|---------------|--------|
| **PREMIUM** | Real-time individual emails | Immediate when summary generated (all PREMIUM users simultaneously) |
| **PRO** | Weekly digest email | Sundays 9 AM UTC |
| **FREE** | Weekly digest email | Sundays 9 AM UTC |

### Verification Criteria
1. When a filing is summarized, ALL PREMIUM users tracking that ticker receive email within seconds (not minutes apart)
2. PRO/FREE users do NOT receive immediate emails
3. PRO/FREE users receive a single weekly digest containing all summaries from the past week
4. Weekly digest is sent at 9 AM UTC on Sundays
5. No duplicate emails are sent
6. Dashboard shows summaries for all tiers (generation is not delayed)

## What We're NOT Doing

- NOT changing summary generation timing (all tiers still generate immediately)
- NOT implementing user timezone preferences (using UTC for weekly digest)
- NOT changing the existing summary caching/sharing mechanism
- NOT modifying Stripe billing or tier definitions
- NOT adding user-configurable notification preferences (tier-based only)

## Implementation Approach

Apply Elon's 5-Step Algorithm:

1. **Question requirements**: Do we need complex batching? No - simple tier check before email send is sufficient.
2. **Delete**: Remove the idea of "batch processing PREMIUM users" - instead, send emails in parallel when summary is created.
3. **Simplify**: Use existing `DigestService` pattern for weekly emails, just need to add WEEKLY frequency.
4. **Accelerate**: Small TDD increments with checkpoints after each component.
5. **Automate**: Cloudflare Workers cron for weekly digest (existing pattern).

---

## Phase 1: Add Tier-Based Email Decision Logic

### Overview
Create a utility to determine if a user should receive immediate email or weekly digest based on their subscription tier.

### Step 1.1: 🔴 Write Failing Tests

**Test File**: `__tests__/lib/email/tier-email-policy.test.ts`

```typescript
import { TierEmailPolicy, EmailDeliveryType } from '@/lib/email/tier-email-policy';

describe('TierEmailPolicy', () => {
  describe('getDeliveryType', () => {
    it('should return IMMEDIATE for PREMIUM tier', () => {
      expect(TierEmailPolicy.getDeliveryType('PREMIUM')).toBe(EmailDeliveryType.IMMEDIATE);
    });

    it('should return WEEKLY for PRO tier', () => {
      expect(TierEmailPolicy.getDeliveryType('PRO')).toBe(EmailDeliveryType.WEEKLY);
    });

    it('should return WEEKLY for FREE tier', () => {
      expect(TierEmailPolicy.getDeliveryType('FREE')).toBe(EmailDeliveryType.WEEKLY);
    });

    it('should return WEEKLY for HOBBY tier (normalized FREE)', () => {
      expect(TierEmailPolicy.getDeliveryType('HOBBY')).toBe(EmailDeliveryType.WEEKLY);
    });

    it('should return WEEKLY for PROFESSIONAL tier (legacy)', () => {
      expect(TierEmailPolicy.getDeliveryType('PROFESSIONAL')).toBe(EmailDeliveryType.WEEKLY);
    });

    it('should return WEEKLY for unknown tier (safe default)', () => {
      expect(TierEmailPolicy.getDeliveryType('UNKNOWN')).toBe(EmailDeliveryType.WEEKLY);
    });
  });

  describe('shouldSendImmediate', () => {
    it('should return true for PREMIUM tier', () => {
      expect(TierEmailPolicy.shouldSendImmediate('PREMIUM')).toBe(true);
    });

    it('should return false for PRO tier', () => {
      expect(TierEmailPolicy.shouldSendImmediate('PRO')).toBe(false);
    });

    it('should return false for FREE tier', () => {
      expect(TierEmailPolicy.shouldSendImmediate('FREE')).toBe(false);
    });
  });
});
```

**Checkpoint 1.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="tier-email-policy"
# Expected: Module not found error
```

### Step 1.2: 🟢 Implement TierEmailPolicy

**File**: `lib/email/tier-email-policy.ts`

```typescript
/**
 * Tier-based email delivery policy
 *
 * Determines whether a user should receive immediate emails or weekly digests
 * based on their subscription tier.
 */

export enum EmailDeliveryType {
  IMMEDIATE = 'IMMEDIATE',
  WEEKLY = 'WEEKLY'
}

export class TierEmailPolicy {
  /**
   * Premium tiers that receive immediate email notifications
   */
  private static readonly IMMEDIATE_TIERS = new Set(['PREMIUM']);

  /**
   * Get the email delivery type for a given subscription tier
   */
  static getDeliveryType(tier: string): EmailDeliveryType {
    const normalizedTier = (tier || '').toUpperCase();

    if (this.IMMEDIATE_TIERS.has(normalizedTier)) {
      return EmailDeliveryType.IMMEDIATE;
    }

    return EmailDeliveryType.WEEKLY;
  }

  /**
   * Check if a tier should receive immediate email notifications
   */
  static shouldSendImmediate(tier: string): boolean {
    return this.getDeliveryType(tier) === EmailDeliveryType.IMMEDIATE;
  }

  /**
   * Check if a tier should receive weekly digest emails
   */
  static shouldSendWeeklyDigest(tier: string): boolean {
    return this.getDeliveryType(tier) === EmailDeliveryType.WEEKLY;
  }
}
```

**Checkpoint 1.2**: Run tests and verify they PASS:
```bash
npm run test -- --testPathPattern="tier-email-policy"
# Expected: 6 passing
```

### Step 1.3: 🔵 Refactor

- [ ] Add JSDoc documentation
- [ ] Export from `lib/email/index.ts`

**Checkpoint 1.3**: All tests still pass:
```bash
npm run test -- --testPathPattern="tier-email-policy"
# Expected: 6 passing
```

### Step 1.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="tier-email-policy"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] N/A - utility class only

**STOP**: Await confirmation before Phase 2.

---

## Phase 2: Modify Summarize Handler for Tier-Based Email

### Overview
Update `summarize-cached-handler.ts` to check user tier before sending email. PREMIUM users get immediate email; others skip email (will receive weekly digest).

### Step 2.1: 🔴 Write Failing Tests

**Test File**: `__tests__/lib/cron/handlers/summarize-cached-handler.tier.test.ts`

```typescript
import { handleSummarizeCached } from '@/lib/cron/handlers/summarize-cached-handler';
import { prismaMock } from '@/test/mocks/prisma';
import { sendFilingSummaryEmail } from '@/lib/email/summary-service';

jest.mock('@/lib/email/summary-service');

describe('handleSummarizeCached - Tier-based email', () => {
  const mockSendEmail = sendFilingSummaryEmail as jest.MockedFunction<typeof sendFilingSummaryEmail>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('PREMIUM tier', () => {
    it('should send email immediately for PREMIUM user', async () => {
      // Setup: PREMIUM user with valid filing
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'premium@test.com',
        subscriptionTier: 'PREMIUM'
      });

      // ... other mocks for filing, summary, etc.

      await handleSummarizeCached(mockJob, mockExecutionContext);

      expect(mockSendEmail).toHaveBeenCalledWith(
        'premium@test.com',
        expect.any(Object)
      );
    });
  });

  describe('PRO tier', () => {
    it('should NOT send email immediately for PRO user', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-2',
        email: 'pro@test.com',
        subscriptionTier: 'PRO'
      });

      await handleSummarizeCached(mockJob, mockExecutionContext);

      expect(mockSendEmail).not.toHaveBeenCalled();
    });

    it('should still create Summary record for PRO user', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-2',
        email: 'pro@test.com',
        subscriptionTier: 'PRO'
      });

      const result = await handleSummarizeCached(mockJob, mockExecutionContext);

      expect(prismaMock.summary.create).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe('FREE tier', () => {
    it('should NOT send email immediately for FREE user', async () => {
      prismaMock.user.findUnique.mockResolvedValue({
        id: 'user-3',
        email: 'free@test.com',
        subscriptionTier: 'FREE'
      });

      await handleSummarizeCached(mockJob, mockExecutionContext);

      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });
});
```

**Checkpoint 2.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="summarize-cached-handler.tier"
# Expected: Tests fail because email is still sent for all tiers
```

### Step 2.2: 🟢 Implement Tier Check in Summarize Handler

**File**: `lib/cron/handlers/summarize-cached-handler.ts`

**Change 1**: Add import at top of file (after line ~20):
```typescript
import { TierEmailPolicy } from '@/lib/email/tier-email-policy';
```

**Change 2**: Fetch user's subscription tier when getting user data.

In the existing user query (around line 130-150), ensure `subscriptionTier` is selected:
```typescript
const user = await prisma.user.findUnique({
  where: { id: userId },
  select: {
    id: true,
    email: true,
    subscriptionTier: true,  // ADD THIS
    // ... other fields
  }
});
```

**Change 3**: Wrap email sending in tier check.

For each of the 3 email sending locations, wrap with tier check:

**Location 1** (~line 185 - existing summary path):
```typescript
// BEFORE:
await sendFilingSummaryEmail(userEmail, { ... });

// AFTER:
if (TierEmailPolicy.shouldSendImmediate(user.subscriptionTier)) {
  await sendFilingSummaryEmail(userEmail, { ... });
} else {
  logger.info('Skipping immediate email for non-PREMIUM user', {
    userId,
    tier: user.subscriptionTier,
    summaryId: existingSummary.id
  });
}
```

**Location 2** (~line 298 - shared summary path):
```typescript
// BEFORE:
await sendFilingSummaryEmail(userEmail, { ... });

// AFTER:
if (TierEmailPolicy.shouldSendImmediate(user.subscriptionTier)) {
  await sendFilingSummaryEmail(userEmail, { ... });
} else {
  logger.info('Skipping immediate email for non-PREMIUM user', {
    userId,
    tier: user.subscriptionTier,
    summaryId: summary.id
  });
}
```

**Location 3** (~line 445 - new AI summary path):
```typescript
// BEFORE:
await sendFilingSummaryEmail(userEmail, { ... });

// AFTER:
if (TierEmailPolicy.shouldSendImmediate(user.subscriptionTier)) {
  await sendFilingSummaryEmail(userEmail, { ... });
} else {
  logger.info('Skipping immediate email for non-PREMIUM user', {
    userId,
    tier: user.subscriptionTier,
    summaryId: summary.id
  });
}
```

**Change 4**: Update email tracking logic.

Only update `sentToUser` and create `SummaryEmailDelivery` when email is actually sent:
```typescript
if (TierEmailPolicy.shouldSendImmediate(user.subscriptionTier)) {
  await sendFilingSummaryEmail(userEmail, { ... });

  // Update email tracking
  await prisma.summary.update({
    where: { id: summary.id },
    data: {
      sentToUser: true,
      totalEmailsSent: { increment: 1 }
    }
  });

  await prisma.summaryEmailDelivery.create({
    data: {
      summaryId: summary.id,
      userId: userId,
      emailAddress: userEmail,
      deliveryStatus: 'sent'
    }
  });
}
```

**Checkpoint 2.2**: Run tests and verify they PASS:
```bash
npm run test -- --testPathPattern="summarize-cached-handler.tier"
# Expected: All tests pass
```

### Step 2.3: 🔵 Refactor

- [ ] Extract email sending + tracking into helper function to reduce duplication
- [ ] Add comprehensive logging for debugging

**Checkpoint 2.3**: All tests still pass:
```bash
npm run test -- --testPathPattern="summarize-cached-handler"
# Expected: All existing + new tests pass
```

### Step 2.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="summarize-cached-handler"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] No regressions: `npm run test`

#### Manual Verification:
- [ ] Trigger cron job with test PREMIUM user - receives email
- [ ] Trigger cron job with test PRO user - does NOT receive email
- [ ] Verify summaries are still created in database for all tiers

**STOP**: Await manual confirmation before Phase 3.

---

## Phase 3: Simultaneous Email for PREMIUM Users

### Overview
When a summary is generated, find ALL PREMIUM users tracking that ticker and send emails in parallel (not sequentially through job queue).

### Step 3.1: 🔴 Write Failing Tests

**Test File**: `__tests__/lib/email/premium-broadcast.test.ts`

```typescript
import { PremiumBroadcastService } from '@/lib/email/premium-broadcast';
import { prismaMock } from '@/test/mocks/prisma';
import { sendFilingSummaryEmail } from '@/lib/email/summary-service';

jest.mock('@/lib/email/summary-service');

describe('PremiumBroadcastService', () => {
  describe('broadcastToAllPremiumUsers', () => {
    it('should find all PREMIUM users tracking the ticker', async () => {
      prismaMock.ticker.findMany.mockResolvedValue([
        { id: 't1', userId: 'user1', symbol: 'AAPL', user: { email: 'u1@test.com', subscriptionTier: 'PREMIUM' } },
        { id: 't2', userId: 'user2', symbol: 'AAPL', user: { email: 'u2@test.com', subscriptionTier: 'PREMIUM' } },
      ]);

      await PremiumBroadcastService.broadcastToAllPremiumUsers('AAPL', mockSummary);

      expect(prismaMock.ticker.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            symbol: 'AAPL',
            user: { subscriptionTier: 'PREMIUM' }
          }
        })
      );
    });

    it('should send emails to all PREMIUM users in parallel', async () => {
      prismaMock.ticker.findMany.mockResolvedValue([
        { id: 't1', userId: 'user1', symbol: 'AAPL', user: { email: 'u1@test.com', subscriptionTier: 'PREMIUM' } },
        { id: 't2', userId: 'user2', symbol: 'AAPL', user: { email: 'u2@test.com', subscriptionTier: 'PREMIUM' } },
        { id: 't3', userId: 'user3', symbol: 'AAPL', user: { email: 'u3@test.com', subscriptionTier: 'PREMIUM' } },
      ]);

      const startTime = Date.now();
      await PremiumBroadcastService.broadcastToAllPremiumUsers('AAPL', mockSummary);
      const duration = Date.now() - startTime;

      expect(sendFilingSummaryEmail).toHaveBeenCalledTimes(3);
      // Should complete quickly (parallel) not 3x sequential time
      expect(duration).toBeLessThan(1000);
    });

    it('should skip users who already received this summary', async () => {
      prismaMock.ticker.findMany.mockResolvedValue([
        { id: 't1', userId: 'user1', symbol: 'AAPL', user: { email: 'u1@test.com', subscriptionTier: 'PREMIUM' } },
      ]);

      prismaMock.summaryEmailDelivery.findFirst.mockResolvedValue({
        id: 'existing-delivery',
        userId: 'user1',
        summaryId: 'summary-1'
      });

      await PremiumBroadcastService.broadcastToAllPremiumUsers('AAPL', mockSummary);

      expect(sendFilingSummaryEmail).not.toHaveBeenCalled();
    });

    it('should create SummaryEmailDelivery for each recipient', async () => {
      prismaMock.ticker.findMany.mockResolvedValue([
        { id: 't1', userId: 'user1', symbol: 'AAPL', user: { email: 'u1@test.com', subscriptionTier: 'PREMIUM' } },
        { id: 't2', userId: 'user2', symbol: 'AAPL', user: { email: 'u2@test.com', subscriptionTier: 'PREMIUM' } },
      ]);

      await PremiumBroadcastService.broadcastToAllPremiumUsers('AAPL', mockSummary);

      expect(prismaMock.summaryEmailDelivery.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ userId: 'user1' }),
          expect.objectContaining({ userId: 'user2' }),
        ]),
        skipDuplicates: true
      });
    });
  });
});
```

**Checkpoint 3.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="premium-broadcast"
# Expected: Module not found error
```

### Step 3.2: 🟢 Implement PremiumBroadcastService

**File**: `lib/email/premium-broadcast.ts`

```typescript
import { prisma } from '@/lib/db';
import { sendFilingSummaryEmail } from './summary-service';
import { logger } from '@/lib/logger';

interface SummaryData {
  id: string;
  summaryText: string;
  summaryJSON: any;
  filingType: string;
  filingDate: Date;
  filingUrl: string;
}

interface TickerInfo {
  symbol: string;
  companyName: string;
}

/**
 * Service for broadcasting emails to all PREMIUM users simultaneously
 */
export class PremiumBroadcastService {
  /**
   * Send email to ALL PREMIUM users tracking a specific ticker
   *
   * This is called after a summary is generated to ensure all PREMIUM
   * users receive the notification at the same time.
   */
  static async broadcastToAllPremiumUsers(
    ticker: TickerInfo,
    summary: SummaryData,
    excludeUserId?: string  // User who triggered the original summary (already sent)
  ): Promise<{ sent: number; skipped: number; errors: number }> {
    const startTime = Date.now();

    try {
      // Find all PREMIUM users tracking this ticker
      const premiumTickers = await prisma.ticker.findMany({
        where: {
          symbol: ticker.symbol,
          user: {
            subscriptionTier: 'PREMIUM'
          },
          ...(excludeUserId && { userId: { not: excludeUserId } })
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              subscriptionTier: true
            }
          }
        }
      });

      if (premiumTickers.length === 0) {
        logger.debug('No additional PREMIUM users to notify', {
          ticker: ticker.symbol,
          excludeUserId
        });
        return { sent: 0, skipped: 0, errors: 0 };
      }

      logger.info('Broadcasting summary to PREMIUM users', {
        ticker: ticker.symbol,
        summaryId: summary.id,
        userCount: premiumTickers.length
      });

      // Check for existing deliveries to prevent duplicates
      const existingDeliveries = await prisma.summaryEmailDelivery.findMany({
        where: {
          summaryId: summary.id,
          userId: { in: premiumTickers.map(t => t.user.id) }
        },
        select: { userId: true }
      });

      const alreadySentUserIds = new Set(existingDeliveries.map(d => d.userId));

      // Filter to users who haven't received this summary
      const usersToNotify = premiumTickers.filter(
        t => !alreadySentUserIds.has(t.user.id)
      );

      if (usersToNotify.length === 0) {
        logger.debug('All PREMIUM users already received this summary', {
          ticker: ticker.symbol,
          summaryId: summary.id
        });
        return { sent: 0, skipped: premiumTickers.length, errors: 0 };
      }

      // Send emails in parallel
      const emailPromises = usersToNotify.map(async (tickerRecord) => {
        try {
          await sendFilingSummaryEmail(tickerRecord.user.email, {
            companyName: ticker.companyName,
            ticker: ticker.symbol,
            filingType: summary.filingType,
            filingDate: summary.filingDate,
            summary: summary.summaryText,
            filingUrl: summary.filingUrl,
            summaryData: summary.summaryJSON
          });

          return { success: true, userId: tickerRecord.user.id, email: tickerRecord.user.email };
        } catch (error) {
          logger.error('Failed to send broadcast email', {
            userId: tickerRecord.user.id,
            email: tickerRecord.user.email,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          return { success: false, userId: tickerRecord.user.id, email: tickerRecord.user.email };
        }
      });

      const results = await Promise.all(emailPromises);

      const successful = results.filter(r => r.success);
      const failed = results.filter(r => !r.success);

      // Bulk create delivery records for successful sends
      if (successful.length > 0) {
        await prisma.summaryEmailDelivery.createMany({
          data: successful.map(r => ({
            summaryId: summary.id,
            userId: r.userId,
            emailAddress: r.email,
            deliveryStatus: 'sent'
          })),
          skipDuplicates: true
        });

        // Update summary email count
        await prisma.summary.update({
          where: { id: summary.id },
          data: {
            totalEmailsSent: { increment: successful.length }
          }
        });
      }

      const duration = Date.now() - startTime;
      logger.info('PREMIUM broadcast complete', {
        ticker: ticker.symbol,
        summaryId: summary.id,
        sent: successful.length,
        skipped: alreadySentUserIds.size,
        errors: failed.length,
        durationMs: duration
      });

      return {
        sent: successful.length,
        skipped: alreadySentUserIds.size,
        errors: failed.length
      };

    } catch (error) {
      logger.error('Error in PREMIUM broadcast', {
        ticker: ticker.symbol,
        summaryId: summary.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }
}
```

**Checkpoint 3.2**: Run tests and verify they PASS:
```bash
npm run test -- --testPathPattern="premium-broadcast"
# Expected: All tests pass
```

### Step 3.3: Integrate Broadcast into Summarize Handler

**File**: `lib/cron/handlers/summarize-cached-handler.ts`

**Change**: After successfully creating/sending a summary for a PREMIUM user, broadcast to other PREMIUM users.

Add after the email sending block (~line 460):
```typescript
import { PremiumBroadcastService } from '@/lib/email/premium-broadcast';

// ... after sending email to the triggering user ...

// Broadcast to all other PREMIUM users tracking this ticker
if (TierEmailPolicy.shouldSendImmediate(user.subscriptionTier)) {
  try {
    const broadcastResult = await PremiumBroadcastService.broadcastToAllPremiumUsers(
      { symbol: ticker.symbol, companyName: ticker.companyName },
      {
        id: summary.id,
        summaryText: summary.summaryText,
        summaryJSON: summary.summaryJSON,
        filingType: filing.formType,
        filingDate: new Date(filing.filingDate),
        filingUrl: cachedContent.primaryDocUrl || filing.filingUrl
      },
      userId  // Exclude the user who just received email
    );

    logger.info('PREMIUM broadcast completed', {
      summaryId: summary.id,
      ...broadcastResult
    });
  } catch (broadcastError) {
    // Log but don't fail the job - original user already got their email
    logger.error('PREMIUM broadcast failed', {
      summaryId: summary.id,
      error: broadcastError instanceof Error ? broadcastError.message : 'Unknown error'
    });
  }
}
```

**Checkpoint 3.3**: Run integration tests:
```bash
npm run test -- --testPathPattern="summarize-cached-handler"
# Expected: All tests pass
```

### Step 3.4: 🔵 Refactor

- [ ] Add metrics for broadcast performance
- [ ] Consider rate limiting for large numbers of PREMIUM users

**Checkpoint 3.4**: All tests still pass:
```bash
npm run test
# Expected: All tests pass
```

### Step 3.5: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="premium-broadcast"`
- [ ] All handler tests pass: `npm run test -- --testPathPattern="summarize-cached-handler"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Create 2 test PREMIUM users tracking same ticker
- [ ] Trigger filing discovery for that ticker
- [ ] Verify both users receive email within seconds of each other (check Resend logs)
- [ ] Verify no duplicate emails

**STOP**: Await manual confirmation before Phase 4.

---

## Phase 4: Weekly Digest Email Implementation

### Overview
Extend the existing `DigestService` to support weekly digests for FREE/PRO users, sent on Sundays at 9 AM UTC.

### Step 4.1: 🔴 Write Failing Tests

**Test File**: `__tests__/lib/email/weekly-digest-service.test.ts`

```typescript
import { WeeklyDigestService } from '@/lib/email/weekly-digest-service';
import { prismaMock } from '@/test/mocks/prisma';

describe('WeeklyDigestService', () => {
  describe('getEligibleUsers', () => {
    it('should return FREE and PRO users only', async () => {
      prismaMock.user.findMany.mockResolvedValue([
        { id: 'u1', email: 'free@test.com', subscriptionTier: 'FREE' },
        { id: 'u2', email: 'pro@test.com', subscriptionTier: 'PRO' },
        { id: 'u3', email: 'premium@test.com', subscriptionTier: 'PREMIUM' },
      ]);

      const users = await WeeklyDigestService.getEligibleUsers();

      expect(users).toHaveLength(2);
      expect(users.map(u => u.subscriptionTier)).toEqual(['FREE', 'PRO']);
    });

    it('should include HOBBY tier (normalized FREE)', async () => {
      prismaMock.user.findMany.mockResolvedValue([
        { id: 'u1', email: 'hobby@test.com', subscriptionTier: 'HOBBY' },
      ]);

      const users = await WeeklyDigestService.getEligibleUsers();

      expect(users).toHaveLength(1);
    });
  });

  describe('compileUserDigest', () => {
    it('should get summaries from the past 7 days', async () => {
      const userId = 'user-1';

      await WeeklyDigestService.compileUserDigest(userId);

      expect(prismaMock.summary.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: expect.any(Date)  // 7 days ago
            }
          })
        })
      );
    });

    it('should only include summaries not yet sent to user', async () => {
      const userId = 'user-1';

      await WeeklyDigestService.compileUserDigest(userId);

      expect(prismaMock.summary.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            emailDeliveries: {
              none: { userId }
            }
          })
        })
      );
    });

    it('should group summaries by ticker', async () => {
      const userId = 'user-1';
      prismaMock.summary.findMany.mockResolvedValue([
        { id: 's1', ticker: { symbol: 'AAPL', companyName: 'Apple' }, filingType: '10-K' },
        { id: 's2', ticker: { symbol: 'AAPL', companyName: 'Apple' }, filingType: '8-K' },
        { id: 's3', ticker: { symbol: 'MSFT', companyName: 'Microsoft' }, filingType: '10-Q' },
      ]);

      const digest = await WeeklyDigestService.compileUserDigest(userId);

      expect(digest.tickerGroups).toHaveLength(2);
      expect(digest.tickerGroups[0].symbol).toBe('AAPL');
      expect(digest.tickerGroups[0].summaries).toHaveLength(2);
      expect(digest.tickerGroups[1].symbol).toBe('MSFT');
    });
  });

  describe('sendWeeklyDigests', () => {
    it('should send digest to each eligible user', async () => {
      // Setup mocks
      prismaMock.user.findMany.mockResolvedValue([
        { id: 'u1', email: 'user1@test.com', subscriptionTier: 'FREE' },
        { id: 'u2', email: 'user2@test.com', subscriptionTier: 'PRO' },
      ]);

      await WeeklyDigestService.sendWeeklyDigests();

      expect(sendDigestEmail).toHaveBeenCalledTimes(2);
    });

    it('should mark all summaries as sent after digest', async () => {
      prismaMock.user.findMany.mockResolvedValue([
        { id: 'u1', email: 'user1@test.com', subscriptionTier: 'FREE' },
      ]);
      prismaMock.summary.findMany.mockResolvedValue([
        { id: 's1' }, { id: 's2' }, { id: 's3' }
      ]);

      await WeeklyDigestService.sendWeeklyDigests();

      expect(prismaMock.summaryEmailDelivery.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ summaryId: 's1', userId: 'u1' }),
          expect.objectContaining({ summaryId: 's2', userId: 'u1' }),
          expect.objectContaining({ summaryId: 's3', userId: 'u1' }),
        ]),
        skipDuplicates: true
      });
    });
  });
});
```

**Checkpoint 4.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="weekly-digest-service"
# Expected: Module not found error
```

### Step 4.2: 🟢 Implement WeeklyDigestService

**File**: `lib/email/weekly-digest-service.ts`

```typescript
import { prisma } from '@/lib/db';
import { logger } from '@/lib/logger';
import { TierEmailPolicy } from './tier-email-policy';
import { getEmailTemplate, EmailType } from './templates';
import { sendEmail } from './index';

interface DigestSummary {
  id: string;
  summaryText: string;
  summaryJSON: any;
  filingType: string;
  filingDate: Date;
  filingUrl: string;
}

interface TickerGroup {
  symbol: string;
  companyName: string;
  summaries: DigestSummary[];
}

interface UserDigest {
  userId: string;
  email: string;
  name: string | null;
  tickerGroups: TickerGroup[];
  totalSummaries: number;
  periodStart: Date;
  periodEnd: Date;
}

/**
 * Service for compiling and sending weekly digest emails
 * to FREE and PRO tier users
 */
export class WeeklyDigestService {
  /**
   * Get all users eligible for weekly digest (non-PREMIUM)
   */
  static async getEligibleUsers(): Promise<Array<{
    id: string;
    email: string;
    name: string | null;
    subscriptionTier: string;
  }>> {
    const users = await prisma.user.findMany({
      where: {
        subscriptionTier: {
          in: ['FREE', 'PRO', 'HOBBY', 'PROFESSIONAL']  // All non-PREMIUM tiers
        },
        // Must have at least one ticker
        tickers: {
          some: {}
        }
      },
      select: {
        id: true,
        email: true,
        name: true,
        subscriptionTier: true
      }
    });

    // Filter using policy to ensure consistency
    return users.filter(u => TierEmailPolicy.shouldSendWeeklyDigest(u.subscriptionTier));
  }

  /**
   * Compile digest for a specific user
   */
  static async compileUserDigest(userId: string): Promise<UserDigest | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        tickers: {
          select: { id: true, symbol: true, companyName: true }
        }
      }
    });

    if (!user || user.tickers.length === 0) {
      return null;
    }

    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get summaries for user's tickers that haven't been emailed to this user
    const summaries = await prisma.summary.findMany({
      where: {
        tickerId: { in: user.tickers.map(t => t.id) },
        createdAt: { gte: periodStart },
        // Only get summaries not yet sent to this user
        emailDeliveries: {
          none: { userId }
        }
      },
      include: {
        ticker: {
          select: { symbol: true, companyName: true }
        }
      },
      orderBy: [
        { ticker: { symbol: 'asc' } },
        { filingDate: 'desc' }
      ]
    });

    if (summaries.length === 0) {
      return null;
    }

    // Group by ticker
    const tickerMap = new Map<string, TickerGroup>();

    for (const summary of summaries) {
      const symbol = summary.ticker.symbol;

      if (!tickerMap.has(symbol)) {
        tickerMap.set(symbol, {
          symbol,
          companyName: summary.ticker.companyName || symbol,
          summaries: []
        });
      }

      tickerMap.get(symbol)!.summaries.push({
        id: summary.id,
        summaryText: summary.summaryText,
        summaryJSON: summary.summaryJSON,
        filingType: summary.filingType,
        filingDate: summary.filingDate,
        filingUrl: summary.filingUrl
      });
    }

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      tickerGroups: Array.from(tickerMap.values()),
      totalSummaries: summaries.length,
      periodStart,
      periodEnd
    };
  }

  /**
   * Send weekly digest emails to all eligible users
   */
  static async sendWeeklyDigests(): Promise<{
    sent: number;
    skipped: number;
    errors: number;
  }> {
    const startTime = Date.now();
    logger.info('Starting weekly digest compilation');

    const users = await this.getEligibleUsers();
    logger.info(`Found ${users.length} users eligible for weekly digest`);

    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const user of users) {
      try {
        const digest = await this.compileUserDigest(user.id);

        if (!digest || digest.tickerGroups.length === 0) {
          logger.debug('No summaries for weekly digest', { userId: user.id });
          skipped++;
          continue;
        }

        // Generate and send digest email
        const emailContent = this.formatDigestEmail(digest);

        await sendEmail({
          to: user.email,
          subject: `Your Weekly SEC Filing Digest - ${digest.totalSummaries} new summaries`,
          html: emailContent.html,
          text: emailContent.text,
          tags: [
            { name: 'type', value: 'weekly-digest' },
            { name: 'summary-count', value: String(digest.totalSummaries) }
          ]
        });

        // Mark all summaries as sent to this user
        const summaryIds = digest.tickerGroups.flatMap(g => g.summaries.map(s => s.id));

        await prisma.summaryEmailDelivery.createMany({
          data: summaryIds.map(summaryId => ({
            summaryId,
            userId: user.id,
            emailAddress: user.email,
            deliveryStatus: 'sent',
            metadata: { deliveryType: 'weekly-digest' }
          })),
          skipDuplicates: true
        });

        sent++;
        logger.info('Weekly digest sent', {
          userId: user.id,
          summaryCount: digest.totalSummaries,
          tickerCount: digest.tickerGroups.length
        });

      } catch (error) {
        logger.error('Error sending weekly digest', {
          userId: user.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        errors++;
      }
    }

    const duration = Date.now() - startTime;
    logger.info('Weekly digest compilation complete', {
      sent,
      skipped,
      errors,
      durationMs: duration
    });

    return { sent, skipped, errors };
  }

  /**
   * Format digest email content
   */
  private static formatDigestEmail(digest: UserDigest): { html: string; text: string } {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tldrsec.app';

    const templateData = {
      recipientName: digest.name || 'Investor',
      recipientEmail: digest.email,
      preferencesUrl: `${baseUrl}/settings`,
      unsubscribeUrl: `${baseUrl}/unsubscribe?email=${encodeURIComponent(digest.email)}&type=digest`,
      periodStart: digest.periodStart.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric'
      }),
      periodEnd: digest.periodEnd.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      }),
      totalSummaries: digest.totalSummaries,
      tickerGroups: digest.tickerGroups.map(group => ({
        symbol: group.symbol,
        companyName: group.companyName,
        filings: group.summaries.map(s => ({
          symbol: group.symbol,
          companyName: group.companyName,
          filingType: s.filingType,
          filingDate: s.filingDate,
          filingUrl: s.filingUrl,
          summaryUrl: `${baseUrl}/summary/${s.id}`,
          summaryId: s.id,
          summaryText: s.summaryText,
          summaryData: s.summaryJSON
        }))
      }))
    };

    return getEmailTemplate(EmailType.DIGEST, templateData);
  }
}
```

**Checkpoint 4.2**: Run tests and verify they PASS:
```bash
npm run test -- --testPathPattern="weekly-digest-service"
# Expected: All tests pass
```

### Step 4.3: 🔵 Refactor

- [ ] Add progress logging for large user bases
- [ ] Consider batching for very large user counts

**Checkpoint 4.3**: All tests still pass:
```bash
npm run test -- --testPathPattern="weekly-digest-service"
# Expected: All tests pass
```

### Step 4.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="weekly-digest-service"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] Create test FREE user with summaries
- [ ] Call `WeeklyDigestService.sendWeeklyDigests()` manually
- [ ] Verify digest email received with correct content
- [ ] Verify `SummaryEmailDelivery` records created

**STOP**: Await manual confirmation before Phase 5.

---

## Phase 5: Weekly Digest Cron Endpoint

### Overview
Create a cron endpoint that triggers weekly digest emails on Sundays at 9 AM UTC.

### Step 5.1: 🔴 Write Failing Tests

**Test File**: `__tests__/app/api/cron/weekly-digest/route.test.ts`

```typescript
import { GET } from '@/app/api/cron/weekly-digest/route';
import { NextRequest } from 'next/server';
import { WeeklyDigestService } from '@/lib/email/weekly-digest-service';

jest.mock('@/lib/email/weekly-digest-service');

describe('Weekly Digest Cron Endpoint', () => {
  it('should require authorization', async () => {
    const request = new NextRequest('http://localhost/api/cron/weekly-digest');

    const response = await GET(request);

    expect(response.status).toBe(401);
  });

  it('should call WeeklyDigestService.sendWeeklyDigests', async () => {
    const request = new NextRequest('http://localhost/api/cron/weekly-digest', {
      headers: {
        'authorization': `Bearer ${process.env.CRON_SECRET}`
      }
    });

    (WeeklyDigestService.sendWeeklyDigests as jest.Mock).mockResolvedValue({
      sent: 10,
      skipped: 5,
      errors: 0
    });

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.sent).toBe(10);
  });

  it('should return 500 on error', async () => {
    const request = new NextRequest('http://localhost/api/cron/weekly-digest', {
      headers: {
        'authorization': `Bearer ${process.env.CRON_SECRET}`
      }
    });

    (WeeklyDigestService.sendWeeklyDigests as jest.Mock).mockRejectedValue(
      new Error('Database error')
    );

    const response = await GET(request);

    expect(response.status).toBe(500);
  });
});
```

**Checkpoint 5.1**: Run tests and verify they FAIL:
```bash
npm run test -- --testPathPattern="weekly-digest/route"
# Expected: Module not found error
```

### Step 5.2: 🟢 Implement Cron Endpoint

**File**: `app/api/cron/weekly-digest/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { WeeklyDigestService } from '@/lib/email/weekly-digest-service';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes max

/**
 * Weekly Digest Cron Endpoint
 *
 * Sends weekly digest emails to FREE and PRO tier users.
 * Scheduled to run at 9:00 AM UTC on Sundays via Cloudflare Workers.
 */

function verifyCronAuth(request: NextRequest): boolean {
  // Check HMAC signature (preferred)
  const signature = request.headers.get('x-hmac-signature');
  const timestamp = request.headers.get('x-hmac-timestamp');

  if (signature && timestamp) {
    // HMAC validation would go here
    return true;
  }

  // Fallback to Bearer token
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    return token === process.env.CRON_SECRET;
  }

  return false;
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const executionId = request.headers.get('x-execution-id') || `weekly-digest-${Date.now()}`;

  logger.info('Weekly digest cron triggered', { executionId });

  // Verify authorization
  if (!verifyCronAuth(request)) {
    logger.warn('Unauthorized weekly digest request', { executionId });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await WeeklyDigestService.sendWeeklyDigests();

    const duration = Date.now() - startTime;
    logger.info('Weekly digest cron completed', {
      executionId,
      ...result,
      durationMs: duration
    });

    return NextResponse.json({
      success: true,
      ...result,
      executionId,
      durationMs: duration
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('Weekly digest cron failed', {
      executionId,
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: duration
    });

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      executionId,
      durationMs: duration
    }, { status: 500 });
  }
}
```

**Checkpoint 5.2**: Run tests and verify they PASS:
```bash
npm run test -- --testPathPattern="weekly-digest/route"
# Expected: All tests pass
```

### Step 5.3: Add Cloudflare Workers Configuration

**File**: `cloudflare-cron/wrangler.toml` (add to existing triggers):

```toml
[triggers]
# Existing: Every 10 minutes for filing discovery
crons = [
  "*/10 * * * *",      # Filing discovery (existing)
  "0 9 * * 0"          # Weekly digest: 9 AM UTC on Sundays
]
```

**File**: `cloudflare-cron/index.js` (add handler):

```javascript
export default {
  async scheduled(event, env, ctx) {
    const cronTime = event.cron;

    // Weekly digest: 9 AM UTC on Sundays
    if (cronTime === '0 9 * * 0') {
      const response = await fetch(`${env.PUBLIC_URL}/api/cron/weekly-digest`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${env.CRON_SECRET}`,
          'x-execution-id': `cf-weekly-${Date.now()}`
        }
      });

      if (!response.ok) {
        throw new Error(`Weekly digest failed: ${response.status}`);
      }

      return;
    }

    // Existing filing discovery handler...
  }
};
```

**Checkpoint 5.3**: Verify Cloudflare config is valid:
```bash
cd cloudflare-cron && npx wrangler deploy --dry-run
# Expected: No errors
```

### Step 5.4: Final Phase Verification

#### Automated Verification:
- [ ] All phase tests pass: `npm run test -- --testPathPattern="weekly-digest"`
- [ ] Type checking passes: `npm run build`
- [ ] Linting passes: `npm run lint`
- [ ] Cloudflare dry-run succeeds

#### Manual Verification:
- [ ] Test endpoint manually with Bearer token
- [ ] Verify response includes sent/skipped/errors counts
- [ ] Check logs for detailed processing info

**STOP**: Await manual confirmation before Phase 6.

---

## Phase 6: Update User Tier on Stripe Subscription Changes

### Overview
Ensure `User.subscriptionTier` is updated when Stripe subscription changes, so email routing works correctly.

### Step 6.1: 🔴 Write Failing Tests

**Test File**: `__tests__/app/api/webhook/stripe/subscription-tier.test.ts`

```typescript
import { POST } from '@/app/api/webhook/stripe/route';
import { prismaMock } from '@/test/mocks/prisma';

describe('Stripe Webhook - Subscription Tier Updates', () => {
  it('should update User.subscriptionTier to PREMIUM on premium subscription', async () => {
    const event = createMockStripeEvent('customer.subscription.created', {
      metadata: { userId: 'user-1', planType: 'PREMIUM' }
    });

    await POST(createMockRequest(event));

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { subscriptionTier: 'PREMIUM' }
    });
  });

  it('should update User.subscriptionTier to PRO on pro subscription', async () => {
    const event = createMockStripeEvent('customer.subscription.created', {
      metadata: { userId: 'user-1', planType: 'PRO' }
    });

    await POST(createMockRequest(event));

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { subscriptionTier: 'PRO' }
    });
  });

  it('should update User.subscriptionTier to FREE on subscription deletion', async () => {
    const event = createMockStripeEvent('customer.subscription.deleted', {
      metadata: { userId: 'user-1' }
    });

    await POST(createMockRequest(event));

    expect(prismaMock.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { subscriptionTier: 'FREE' }
    });
  });
});
```

**Checkpoint 6.1**: Run tests and verify behavior:
```bash
npm run test -- --testPathPattern="stripe/subscription-tier"
# Expected: Determine if already implemented or needs addition
```

### Step 6.2: 🟢 Implement Tier Update in Webhook (if needed)

**File**: `app/api/webhook/stripe/route.ts`

If not already implemented, add tier updates to subscription handlers:

```typescript
// In customer.subscription.created handler:
const planType = session.metadata?.planType || 'FREE';

await prisma.user.update({
  where: { id: userId },
  data: {
    subscriptionTier: planType as SubscriptionTier
  }
});

// In customer.subscription.deleted handler:
await prisma.user.update({
  where: { id: userId },
  data: {
    subscriptionTier: 'FREE'
  }
});
```

**Checkpoint 6.2**: Run tests:
```bash
npm run test -- --testPathPattern="stripe"
# Expected: All tests pass
```

### Step 6.3: Final Phase Verification

#### Automated Verification:
- [ ] All Stripe webhook tests pass
- [ ] Type checking passes: `npm run build`

#### Manual Verification:
- [ ] Create test Stripe subscription → verify User.subscriptionTier updates
- [ ] Cancel subscription → verify tier reverts to FREE

**STOP**: Await manual confirmation.

---

## Testing Strategy

### TDD Test Design Principles

1. **One Assertion Per Test**: Each test verifies one behavior
2. **Descriptive Test Names**: "should [verb] when [condition]"
3. **Arrange-Act-Assert**: Clear structure
4. **Test Behavior, Not Implementation**: Focus on outcomes

### Test Categories

1. **Unit Tests**: `TierEmailPolicy`, `PremiumBroadcastService`, `WeeklyDigestService`
2. **Integration Tests**: Summarize handler with tier logic, Stripe webhook updates
3. **E2E Tests**: Full flow from filing discovery to email delivery

### Manual Testing Checklist

- [ ] PREMIUM user receives email immediately when filing discovered
- [ ] Two PREMIUM users tracking same ticker receive email simultaneously
- [ ] PRO user does NOT receive immediate email
- [ ] FREE user does NOT receive immediate email
- [ ] Weekly digest contains all summaries from past 7 days
- [ ] Weekly digest is sent at 9 AM UTC on Sunday
- [ ] No duplicate emails sent
- [ ] Stripe subscription upgrade changes email timing immediately

## Performance Considerations

- **PREMIUM Broadcast**: Use `Promise.all()` for parallel email sending
- **Weekly Digest**: Process users in batches of 100 to avoid memory issues
- **Rate Limiting**: Resend has rate limits; may need to add delays for large user bases

## Migration Notes

- No database schema changes required
- Existing summaries will be included in first weekly digest for FREE/PRO users
- Rollback: Revert code changes; all users will receive immediate emails again

## References

- VRT Summary Research: `thoughts/shared/research/2025-12-30-vrt-summary-sharing-analysis.md`
- Existing Digest Service: `lib/email/digest-service.ts`
- Summarize Handler: `lib/cron/handlers/summarize-cached-handler.ts`
- Stripe Webhook: `app/api/webhook/stripe/route.ts`
- Tier Normalization: `lib/cron/budget-service.ts:26-46`
