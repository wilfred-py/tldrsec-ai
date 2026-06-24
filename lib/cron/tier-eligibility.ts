/**
 * Tier Scheduling — single source of truth for how a Subscription tier drives
 * the cron pipeline's job-priority assignment.
 *
 * One axis lives here: where a job sits in the queue once enqueued.
 *   getPriorityForTier / getFilingMaterialityBonus / getCompositePriority
 *
 * Trial eligibility is delegated to `lib/auth/tier-eligibility.ts`
 * (`isActiveTrial`), which is the cross-cutting authority on "is this user in an
 * unexpired trial" shared with auth and summarization. Do not re-implement trial
 * grace logic here.
 *
 * A separate cadence axis (how often a user is due for processing) once lived
 * here too, behind `calculateProcessingEligibility` / `getEligibleUsers` /
 * `getUserProcessingStatuses` / `getTierDistribution`. Production no longer
 * routes through any of it — the cron pipeline does eligibility per filing,
 * not per user, and the only callers were tests of routes that no longer
 * exist. The dead surface was removed; the priority axis is the whole
 * external interface.
 *
 * SEC filings are published 24/7, so priority is constant regardless of
 * market status. Budget tracking was removed — OpenRouter handles credit
 * limits. See: docs/plans/2026-01-02-remove-budget-system-add-credit-monitoring.md
 */

import { isActiveTrial } from '@/lib/auth/tier-eligibility';

/**
 * Get job priority based on subscription tier and trial status.
 *
 * Priority levels:
 *   9 — MAX tier and active trial users
 *   7 — PRO tier
 *   5 — FREE tier (and any unknown tiers)
 *
 * @param tier - User's subscriptionTier value (FREE, PRO, MAX)
 * @param isTrialing - Whether the user is currently in a trial
 * @param trialEndsAt - When the trial expires (null if no trial)
 * @returns Numeric priority (higher = processed first)
 */
export function getPriorityForTier(
  tier: string,
  isTrialing?: boolean,
  trialEndsAt?: Date | null
): number {
  if (isActiveTrial({ isTrialing, trialEndsAt })) {
    return 9;
  }

  switch (tier) {
    case 'MAX':
      return 9;
    case 'PRO':
      return 7;
    default:
      return 5; // FREE and any unknown tiers
  }
}

/**
 * Materiality bonus by SEC form type.
 *
 * Higher bonus = more time-sensitive filing type.
 * 8-K (material events, earnings) are most urgent.
 *
 * Added to tier priority for composite job priority.
 */
const MATERIALITY_BONUS: Record<string, number> = {
  '8-K': 3,        // Material events, earnings — most time-sensitive
  '10-K': 2,       // Annual report
  '10-Q': 2,       // Quarterly report
  '4': 1,          // Insider trading (Form 4)
  'SC 13G': 1,     // Large ownership stake
  'SC 13D': 1,     // Activist ownership
  '3': 0,          // Initial ownership
  '4/A': 0,        // Amendment
  'SC 13G/A': 0,   // Amendment
  '8-K/A': 0,      // Amendment
};

/**
 * Get materiality bonus for a filing type.
 *
 * @param formType - SEC form type (e.g., '8-K', '10-Q', '4')
 * @returns Numeric bonus (0-3, higher = more time-sensitive)
 */
export function getFilingMaterialityBonus(formType: string): number {
  return MATERIALITY_BONUS[formType] ?? 0;
}

/**
 * Get composite priority combining subscription tier and filing materiality.
 *
 * Clamped to [1, 10] to fit within JobQueueService.addJob() validation.
 * A MAX-tier user with an 8-K filing gets priority 10 (capped from 9+3=12).
 *
 * @param tier - User's subscriptionTier value
 * @param formType - SEC form type
 * @param isTrialing - Whether the user is currently in a trial
 * @param trialEndsAt - When the trial expires
 * @returns Numeric priority 1-10 (higher = processed first)
 */
export function getCompositePriority(
  tier: string,
  formType: string,
  isTrialing?: boolean,
  trialEndsAt?: Date | null
): number {
  const tierPriority = getPriorityForTier(tier, isTrialing, trialEndsAt);
  const materialityBonus = getFilingMaterialityBonus(formType);
  return Math.min(10, tierPriority + materialityBonus);
}
