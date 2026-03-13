/**
 * Tier-based job priority — single source of truth
 *
 * Maps subscription tiers to numeric priority values used by the job queue.
 * Higher priority = processed first.
 *
 * Priority levels:
 *   9 — MAX tier and active trial users
 *   7 — PRO tier
 *   5 — FREE tier (and any unknown tiers)
 */

/**
 * Get job priority based on subscription tier and trial status.
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
  // Active trial users get MAX priority
  // 5-min grace period for clock skew between services
  if (isTrialing && trialEndsAt && trialEndsAt > new Date(Date.now() - 5 * 60 * 1000)) {
    return 9;
  }
  // When trial expires, isTrialing may still be true but trialEndsAt < now - grace period,
  // so we fall through to tier-based priority. subscriptionTier remains FREE during/after
  // trial, so expired trials correctly get priority 5.

  switch (tier) {
    case 'MAX':
      return 9;
    case 'PRO':
      return 7;
    default:
      return 5; // FREE and any unknown tiers
  }
}
