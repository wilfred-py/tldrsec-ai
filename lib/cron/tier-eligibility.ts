/**
 * Tier Scheduling — single source of truth for how a Subscription tier drives
 * the cron pipeline.
 *
 * Two axes of tier-driven scheduling live here, behind one interface:
 *
 *   1. Priority axis  — where a job sits in the queue once enqueued.
 *      getPriorityForTier / getFilingMaterialityBonus / getCompositePriority
 *
 *   2. Cadence axis    — whether a user is due for processing and how often.
 *      normalizeTier / calculateProcessingEligibility / getUserProcessingStatuses /
 *      getEligibleUsers / getTierDistribution
 *
 * The two axes classify the same tier strings differently on purpose: the
 * priority axis distinguishes MAX (9) from PRO (7), while the cadence axis
 * buckets both paid tiers into the same processing frequency (PRO). Keeping
 * both classifications in one module means a maintainer changing tier behaviour
 * touches one place instead of bouncing between `tier-priority.ts` and this
 * file — and can see at a glance that the two axes intentionally disagree.
 *
 * Trial eligibility is delegated to `lib/auth/tier-eligibility.ts`
 * (`isActiveTrial`), which is the cross-cutting authority on "is this user in an
 * unexpired trial" shared with auth and summarization. Do not re-implement trial
 * grace logic here.
 *
 * SEC filings are published 24/7, so cadence uses one frequency per tier
 * regardless of market status. Budget tracking was removed — OpenRouter handles
 * credit limits. See: docs/plans/2026-01-02-remove-budget-system-add-credit-monitoring.md
 */

import { isActiveTrial } from '@/lib/auth/tier-eligibility';

// ── Priority axis: queue ordering ────────────────────────────────────

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

// ── Cadence axis: eligibility and processing frequency ───────────────

// Tier processing frequencies (in milliseconds) - 24/7 continuous processing
const TIER_FREQUENCIES = {
  PRO: parseInt(process.env.PRO_MARKET_FREQUENCY || '5') * 60 * 1000,     // 5 minutes
  HOBBY: parseInt(process.env.HOBBY_MARKET_FREQUENCY || '120') * 60 * 1000  // 120 minutes
} as const;

// Tier priorities for processing order (cadence-axis sort key, distinct from the
// queue priority numbers above)
const TIER_PRIORITIES = {
  PRO: parseInt(process.env.PRO_PRIORITY || '2'),
  HOBBY: parseInt(process.env.HOBBY_PRIORITY || '1')
} as const;

export type NormalizedTier = 'PRO' | 'HOBBY';

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

interface UserForEligibility {
  id: string;
  subscriptionTier: string;
  lastProcessedAt: Date | null;
}

/**
 * Normalize subscription tier to PRO or HOBBY for cadence purposes.
 * Maps new unified tiers: FREE→HOBBY, PRO→PRO, MAX→PRO
 * Also handles legacy tiers for backwards compatibility.
 *
 * Note: this buckets MAX into PRO on purpose — paid tiers share the same
 * processing frequency. The priority axis above keeps MAX and PRO distinct.
 */
function normalizeTier(tier: string): NormalizedTier {
  const upperTier = tier?.toUpperCase() || '';
  // New unified tiers
  if (upperTier === 'PRO' || upperTier === 'MAX') {
    return 'PRO';
  }
  // Legacy tiers (for backwards compatibility)
  if (upperTier === 'PROFESSIONAL' || upperTier === 'ENTERPRISE' || upperTier === 'INSTITUTION') {
    return 'PRO';
  }
  // FREE, HOBBY, and anything else defaults to HOBBY
  return 'HOBBY';
}

/**
 * Calculate processing eligibility for a user based on their tier
 */
export function calculateProcessingEligibility(
  tier: string,
  lastProcessedAt: Date | null
): ProcessingEligibility {
  const normalizedTier = normalizeTier(tier);
  const frequencyMs = TIER_FREQUENCIES[normalizedTier];
  const now = Date.now();

  // If never processed, eligible immediately
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

/**
 * Get processing statuses for multiple users with tier-based prioritization
 */
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

  // Sort by priority (higher first), then by time since last process (longer wait = higher priority)
  return statuses.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    // Users who haven't been processed should go first
    if (a.timeSinceLastProcess === null) return -1;
    if (b.timeSinceLastProcess === null) return 1;
    return b.timeSinceLastProcess - a.timeSinceLastProcess;
  });
}

/**
 * Filter users who are eligible for processing
 */
export function getEligibleUsers(
  userStatuses: UserProcessingStatus[],
  options: { maxUsersPerCycle?: number } = {}
): UserProcessingStatus[] {
  const { maxUsersPerCycle = 500 } = options;

  // Simply filter by eligibility - no budget checks needed
  const eligibleUsers = userStatuses.filter(user => user.isEligible);
  return eligibleUsers.slice(0, maxUsersPerCycle);
}

/**
 * Get tier distribution for monitoring
 */
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
