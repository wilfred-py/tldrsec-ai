/**
 * Tier-based processing eligibility - simplified from market-hours.ts
 * SEC filings are published 24/7, so we always use the same frequency per tier.
 *
 * This module provides tier-based eligibility calculation without market hours
 * complexity, since the cron system always processes at market-hours frequency
 * regardless of actual market status.
 *
 * Note: Budget tracking has been removed. OpenRouter handles credit limits.
 * See: docs/plans/2026-01-02-remove-budget-system-add-credit-monitoring.md
 */

// Tier processing frequencies (in milliseconds) - 24/7 continuous processing
const TIER_FREQUENCIES = {
  PRO: parseInt(process.env.PRO_MARKET_FREQUENCY || '5') * 60 * 1000,     // 5 minutes
  HOBBY: parseInt(process.env.HOBBY_MARKET_FREQUENCY || '120') * 60 * 1000  // 120 minutes
} as const;

// Tier priorities for processing order
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
 * Normalize subscription tier to PRO or HOBBY
 */
function normalizeTier(tier: string): NormalizedTier {
  const upperTier = tier?.toUpperCase() || '';
  if (upperTier === 'PRO' || upperTier === 'PROFESSIONAL' || upperTier === 'ENTERPRISE' || upperTier === 'INSTITUTION') {
    return 'PRO';
  }
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
